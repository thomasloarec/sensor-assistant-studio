import { Component, lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Download,
  Expand,
  Info,
  Magnet,
  Pause,
  Play,
  RotateCcw,
  Save,
} from "lucide-react";
import {
  DEFAULT_WORKSHOP,
  DISTANCE_SOURCE,
  EDUCATION_NOTE,
  REFERENCE_NOTE,
  MK03_DISTANCES,
  MODEL_VERSION,
  parseWorkshopConfig,
  simulateCycle,
  summarizeWorkshop,
} from "@/lib/standex/magnetic-workshop";
import type { WorkshopConfig, Contact } from "@/lib/standex/magnetic-workshop";
import "./workshop.css";
import FlatScene from "./flat-scene";
import SensorCatalog from "./sensor-catalog";
import ContactIndicator from "./contact-indicator";
import { SensorPlan } from "./sensor-plan";
import { sensorById, sizeLabel, sensorSource } from "@/lib/standex/sensor-catalog";

const Scene = lazy(() => import("./scene"));
const contactLabel: Record<Contact, string> = {
  open: "Contact ouvert",
  closed: "Contact fermé",
  unknown: "État indéterminé",
};
const motionLabels = { approach: "Approche et retrait", slide: "Passage latéral", pivot: "Pivot" };
class SceneBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
function Range({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="mw-field">
      <span>
        <span>{label}</span>
        <output>
          {Number(value.toFixed(1))}
          {unit}
        </output>
      </span>
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type })),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export interface WorkshopProps {
  initialConfig?: WorkshopConfig | null;
  onClose: () => void;
  onSave: (config: WorkshopConfig) => Promise<void>;
  storageLabel?: string;
}
export default function MagneticWorkshop({
  initialConfig,
  onClose,
  onSave,
  storageLabel = "la session et le dossier",
}: WorkshopProps) {
  const [config, setConfig] = useState<WorkshopConfig>(
    () => parseWorkshopConfig(initialConfig) ?? { ...DEFAULT_WORKSHOP },
  );
  const [step, setStep] = useState(0),
    [progress, setProgress] = useState(0),
    [playing, setPlaying] = useState(false);
  const [view, setView] = useState<"3d" | "top">("3d"),
    [zones, setZones] = useState(true),
    [field, setField] = useState(false),
    [xray, setXray] = useState(true),
    [dimensions, setDimensions] = useState(true),
    [focus, setFocus] = useState<"assembly" | "sensor">("assembly"),
    [catalogOpen, setCatalogOpen] = useState(false);
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  const sensor = sensorById(config.sensorId);
  const [saved, setSaved] = useState<string | null>(
      initialConfig ? JSON.stringify(parseWorkshopConfig(initialConfig)) : null,
    ),
    [saving, setSaving] = useState(false),
    [error, setError] = useState<string | null>(null);
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const result = useMemo(() => simulateCycle(config), [config]);
  const sample =
    result.samples[
      Math.min(result.samples.length - 1, Math.round(progress * (result.samples.length - 1)))
    ]!;
  const reference = config.mode === "reference",
    unit = " mm";
  const summary = useMemo(() => summarizeWorkshop(config), [config]);
  const fingerprint = JSON.stringify(config),
    dirty = saved !== fingerprint;
  const [pull, drop] = MK03_DISTANCES[config.sensitivity][config.geometry];
  const unknown = result.unknown;
  const mismatches = result.samples.filter(
    (s) =>
      s.contact !== "unknown" &&
      (s.contact === "closed") !==
        (s.t * 100 >= config.targetStart && s.t * 100 <= config.targetEnd),
  );
  const targetMet = !unknown && mismatches.length <= 3;

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => setProgress((v) => Math.min(1, v + 1 / 240)), 50);
    return () => clearInterval(timer);
  }, [playing]);
  useEffect(() => {
    if (progress >= 1) setPlaying(false);
  }, [progress]);

  function update(patch: Partial<WorkshopConfig>) {
    const next = { ...config, ...patch };
    if (next.end >= next.start) {
      if (patch.start !== undefined) next.end = Math.max(1, next.start - 1);
      else next.start = Math.min(60, next.end + 1);
    }
    if (!parseWorkshopConfig(next)) return;
    setPlaying(false);
    setProgress(0);
    setConfig(next);
    setError(null);
    setImportNotice(null);
  }
  function chooseMode(mode: WorkshopConfig["mode"]) {
    update(
      mode === "reference"
        ? {
            mode,
            sensorId: "MK03",
            motion: "approach",
            sensorAngle: 0,
            magnetAngle: 0,
            magnetization: "axial",
            polarity: 1,
          }
        : { mode, motion: "slide" },
    );
    setField(false);
    setStep(0);
  }
  async function save() {
    setSaving(true);
    setError(null);
    const snapshot = { ...config };
    try {
      await onSave(snapshot);
      setSaved(JSON.stringify(snapshot));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Le montage n'a pas pu être enregistré.");
    } finally {
      setSaving(false);
    }
  }
  async function importFile(file: File | undefined) {
    if (!file) return;
    try {
      if (file.size > 20000) throw new Error("Le fichier de montage est trop volumineux.");
      const parsed = parseWorkshopConfig(JSON.parse(await file.text()));
      if (!parsed) throw new Error("Ce fichier ne contient pas un montage valide (V1 ou V2).");
      setPlaying(false);
      setProgress(0);
      setConfig(parsed);
      setSaved(null);
      setError(null);
      setImportNotice("Montage importé. Enregistrez-le pour le joindre au dossier.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fichier illisible.");
    }
    if (fileRef.current) fileRef.current.value = "";
  }
  const statusMessage =
    result.reason ??
    (unknown
      ? "Une partie du parcours ne peut pas être déterminée avec ces paramètres."
      : result.closures === 0
        ? "Aucun nouvel enclenchement sur ce cycle. Essayez une autre position ou rapprochez l'aimant."
        : result.closures > 1
          ? "Plusieurs enclenchements sur un aller-retour. Vérifiez s'ils correspondent au comportement recherché."
          : "Un enclenchement et un retour à vérifier dans votre montage réel.");

  return (
    <main className="mw" aria-label="Atelier magnétique">
      <header className="mw-header">
        <button className="mw-back" onClick={onClose} disabled={saving}>
          <ArrowLeft size={18} />
          <span>Retour au dossier</span>
        </button>
        <div className="mw-brand">
          STANDEX <span>DETECT</span>
          <small>ATELIER MAGNÉTIQUE</small>
        </div>
        <span className="mw-prototype">Prototype interne · V0.2</span>
      </header>
      <div className="mw-intro">
        <div>
          <p className="mw-eyebrow">COMPRENDRE AVANT D'INTÉGRER</p>
          <h1>Votre montage, en mouvement.</h1>
          <p>Placez le capteur et l'aimant. Observez quand le contact change d'état.</p>
        </div>
        <div className="mw-intro-actions">
          <button
            className="mw-button mw-secondary"
            onClick={() =>
              download(
                "montage-magnetique.json",
                JSON.stringify(config, null, 2),
                "application/json",
              )
            }
          >
            <Download size={16} />
            Exporter
          </button>
          <button
            className="mw-button"
            onClick={() => void save()}
            disabled={saving || (!dirty && saved !== null)}
          >
            {saving ? (
              <span>Enregistrement…</span>
            ) : !dirty && saved ? (
              <>
                <Check size={16} />
                Enregistré
              </>
            ) : (
              <>
                <Save size={16} />
                Joindre au dossier
              </>
            )}
          </button>
        </div>
      </div>
      {(error || importNotice) && (
        <div className={error ? "mw-alert" : "mw-notice"} role={error ? "alert" : "status"}>
          {error ?? importNotice}
        </div>
      )}
      <div className="mw-layout">
        <aside className="mw-controls">
          <div className="mw-start">
            <label htmlFor="mw-mode">Votre point de départ</label>
            <select
              id="mw-mode"
              value={config.mode}
              onChange={(e) => chooseMode(e.target.value as WorkshopConfig["mode"])}
            >
              <option value="reference">Exemple Standex documenté</option>
              <option value="education">Explorer un montage pédagogique</option>
            </select>
            <p>
              {reference
                ? "MK03 + M02 · distances typiques publiées"
                : "Forme réelle · réponse du contact non calibrée"}
            </p>
          </div>
          <nav className="mw-steps" aria-label="Étapes du montage">
            {["Capteur", "Aimant", "Mouvement"].map((s, i) => (
              <button
                key={s}
                className={step === i ? "active" : ""}
                aria-current={step === i ? "step" : undefined}
                onClick={() => setStep(i)}
              >
                <span>{i + 1}</span>
                {s}
              </button>
            ))}
          </nav>
          <div className="mw-step-body">
            {step === 0 && (
              <>
                <h2>Installez le capteur</h2>
                <p className="mw-help">Le plan quadrillé représente le repère de votre machine.</p>
                <div className="mw-selected-sensor">
                  <svg viewBox="-38 -17 76 34" aria-hidden="true">
                    <SensorPlan model={sensor} xray={false} />
                  </svg>
                  <strong>{reference ? `MK03-1A66${config.sensitivity}-500W` : sensor.name}</strong>
                  <span>{sizeLabel(sensor)}</span>
                  <button
                    className="mw-button mw-secondary mw-wide"
                    onClick={() => setCatalogOpen(true)}
                  >
                    Choisir dans le catalogue
                  </button>
                  {sensorSource(sensor) && (
                    <a href={sensorSource(sensor)!} target="_blank" rel="noreferrer">
                      Voir la fiche et le plan Standex ↗
                    </a>
                  )}
                </div>
                {sensor.note && <p className="mw-help">{sensor.note}</p>}
                {reference && (
                  <label className="mw-select-label">
                    Classe de sensibilité
                    <select
                      value={config.sensitivity}
                      onChange={(e) =>
                        update({ sensitivity: e.target.value as WorkshopConfig["sensitivity"] })
                      }
                    >
                      {(["B", "C", "D", "E"] as const).map((x) => (
                        <option key={x} value={x}>
                          Classe {x}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <Range
                  label="Orientation sur la machine"
                  value={config.mountAngle}
                  min={-180}
                  max={180}
                  step={15}
                  unit="°"
                  onChange={(mountAngle) => update({ mountAngle })}
                />
                <details>
                  <summary>Position et environnement</summary>
                  <Range
                    label="Position X du montage"
                    value={config.mountX}
                    min={-25}
                    max={25}
                    unit=" mm"
                    onChange={(mountX) => update({ mountX })}
                  />
                  <Range
                    label="Position Z du montage"
                    value={config.mountZ}
                    min={-25}
                    max={25}
                    unit=" mm"
                    onChange={(mountZ) => update({ mountZ })}
                  />
                  <p className="mw-help">
                    Placement géométrique en millimètres. Cette rotation déplace ensemble le capteur
                    et la trajectoire.
                  </p>
                  <label className="mw-check">
                    <input
                      type="checkbox"
                      checked={config.ferromagnetic}
                      onChange={(e) => update({ ferromagnetic: e.target.checked })}
                    />
                    Acier ou autre matière ferromagnétique proche
                  </label>
                  <label className="mw-select-label">
                    Température
                    <select
                      value={config.temperature}
                      onChange={(e) =>
                        update({ temperature: e.target.value as WorkshopConfig["temperature"] })
                      }
                    >
                      <option value="ambient">Ambiante · exemple de référence</option>
                      <option value="other">Autre température</option>
                    </select>
                  </label>
                </details>
                {!reference && (
                  <Range
                    label="Orientation propre du reed"
                    value={config.sensorAngle}
                    min={-180}
                    max={180}
                    step={15}
                    unit="°"
                    onChange={(sensorAngle) => update({ sensorAngle })}
                  />
                )}
              </>
            )}
            {step === 1 && (
              <>
                <h2>Placez l'aimant</h2>
                <div className="mw-product">
                  <span className="mw-product-icon">
                    <Magnet size={25} />
                  </span>
                  <div>
                    <strong>{reference ? "M02 Standex" : "Aimant générique"}</strong>
                    <span>
                      {reference
                        ? "Actionneur de la table de référence"
                        : "Modèle idéal de dipôle dans l'air"}
                    </span>
                  </div>
                </div>
                {reference ? (
                  <>
                    <label className="mw-select-label">
                      Approche documentée
                      <select
                        value={config.geometry}
                        onChange={(e) =>
                          update({ geometry: e.target.value as WorkshopConfig["geometry"] })
                        }
                      >
                        <option value="D1">D1 · face au centre, axes parallèles</option>
                        <option value="D3">D3 · par l'extrémité, axes parallèles</option>
                      </select>
                    </label>
                    <p className="mw-help">
                      L'orientation relative reste celle de la figure Standex. L'enveloppe du M02
                      mesure 32,4 × 16,7 × 10 mm. Les couleurs N/S illustrent les pôles ; leur
                      emplacement interne n'est pas caractérisé ici.
                    </p>
                    <a href={DISTANCE_SOURCE} target="_blank" rel="noreferrer">
                      Voir le montage de référence ↗
                    </a>
                    <div className="mw-source-values">
                      <span>
                        Enclenchement typique<strong>{pull} mm</strong>
                      </span>
                      <span>
                        Relâchement typique<strong>{drop} mm</strong>
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <Range
                      label="Orientation de l'aimant"
                      value={config.magnetAngle}
                      min={-180}
                      max={180}
                      step={15}
                      unit="°"
                      onChange={(magnetAngle) => update({ magnetAngle })}
                    />
                    <label className="mw-select-label">
                      Direction d'aimantation
                      <select
                        value={config.magnetization}
                        onChange={(e) =>
                          update({
                            magnetization: e.target.value as WorkshopConfig["magnetization"],
                          })
                        }
                      >
                        <option value="axial">Axiale · pôles aux extrémités</option>
                        <option value="diametral">Diamétrale · pôles sur les côtés</option>
                      </select>
                    </label>
                    <button
                      className="mw-button mw-secondary mw-wide"
                      onClick={() => update({ polarity: config.polarity === 1 ? -1 : 1 })}
                    >
                      Inverser les pôles N / S
                    </button>
                    <p className="mw-help">
                      Sur ce reed normalement ouvert idéal, inverser les deux pôles ne change pas
                      l'état calculé. Cette règle ne décrit pas les capteurs polarisés ou bistables.
                    </p>
                  </>
                )}
              </>
            )}
            {step === 2 && (
              <>
                <h2>Définissez le mouvement</h2>
                <label className="mw-select-label">
                  Trajectoire
                  <select
                    value={reference ? "approach" : config.motion}
                    disabled={reference}
                    onChange={(e) => update({ motion: e.target.value as WorkshopConfig["motion"] })}
                  >
                    {Object.entries(motionLabels).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
                {reference || config.motion === "approach" ? (
                  <>
                    <Range
                      label="Distance au départ"
                      value={config.start}
                      min={2}
                      max={60}
                      step={0.5}
                      unit={unit}
                      onChange={(start) => update({ start })}
                    />
                    <Range
                      label="Distance au plus proche"
                      value={config.end}
                      min={1}
                      max={59}
                      step={0.5}
                      unit={unit}
                      onChange={(end) => update({ end })}
                    />
                  </>
                ) : (
                  <>
                    <Range
                      label={config.motion === "slide" ? "Décalage du passage" : "Rayon du pivot"}
                      value={config.offset}
                      min={6}
                      max={30}
                      step={0.5}
                      unit=" mm"
                      onChange={(offset) => update({ offset })}
                    />
                    {config.motion === "slide" ? (
                      <Range
                        label="Demi-course latérale"
                        value={config.travel}
                        min={10}
                        max={50}
                        unit=" mm"
                        onChange={(travel) => update({ travel })}
                      />
                    ) : (
                      <Range
                        label="Angle du pivot"
                        value={config.span}
                        min={30}
                        max={300}
                        step={10}
                        unit="°"
                        onChange={(span) => update({ span })}
                      />
                    )}
                  </>
                )}
                <details>
                  <summary>Comportement recherché</summary>
                  <p className="mw-help">
                    Je souhaite que le contact soit fermé sur cette portion du cycle aller-retour.
                  </p>
                  <Range
                    label="Début de la fenêtre souhaitée"
                    value={config.targetStart}
                    min={0}
                    max={config.targetEnd - 1}
                    unit=" %"
                    onChange={(targetStart) => update({ targetStart })}
                  />
                  <Range
                    label="Fin de la fenêtre souhaitée"
                    value={config.targetEnd}
                    min={config.targetStart + 1}
                    max={100}
                    unit=" %"
                    onChange={(targetEnd) => update({ targetEnd })}
                  />
                  <label className="mw-select-label">
                    État initial du contact
                    <select
                      value={config.initialContact}
                      onChange={(e) => update({ initialContact: e.target.value as Contact })}
                    >
                      <option value="unknown">Inconnu</option>
                      <option value="open">Ouvert</option>
                      <option value="closed">Fermé</option>
                    </select>
                  </label>
                </details>
                <p className="mw-help">
                  La lecture est ralentie pour comprendre le montage. Elle ne valide ni la cadence,
                  ni les rebonds du contact.
                </p>
              </>
            )}
          </div>
          <div className="mw-step-footer">
            <span>Étape {step + 1} sur 3</span>
            {step < 2 ? (
              <button onClick={() => setStep(step + 1)}>
                Continuer
                <ArrowRight size={16} />
              </button>
            ) : (
              <button
                onClick={() => {
                  setProgress(0);
                  setPlaying(true);
                }}
              >
                Voir le cycle
                <Play size={15} />
              </button>
            )}
          </div>
          <details className="mw-file-tools">
            <summary>Reprendre un montage</summary>
            <button className="mw-text-button" onClick={() => fileRef.current?.click()}>
              Importer un fichier de montage
            </button>
            <input
              hidden
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              onChange={(e) => void importFile(e.target.files?.[0])}
            />
          </details>
        </aside>
        <section className="mw-visual-column" aria-label="Simulation du montage">
          <div className="mw-scene-card">
            <div className="mw-scene-toolbar">
              <span className={reference ? "mw-kind" : "mw-kind education"}>
                {reference ? "Référence Standex · valeurs typiques" : "Exploration pédagogique"}
              </span>
              <div className="mw-view-switch">
                <button aria-pressed={view === "3d"} onClick={() => setView("3d")}>
                  3D
                </button>
                <button aria-pressed={view === "top"} onClick={() => setView("top")}>
                  Vue plane
                </button>
              </div>
            </div>
            <div
              className="mw-canvas"
              role="img"
              aria-label={`Montage ${reference ? config.geometry : motionLabels[config.motion]}. ${contactLabel[sample.contact]}.`}
            >
              {view === "top" ? (
                <FlatScene
                  config={config}
                  sample={sample}
                  samples={result.samples}
                  xray={xray}
                  dimensions={dimensions}
                  zones={zones}
                  focus={focus}
                />
              ) : (
                <SceneBoundary
                  fallback={
                    <div className="mw-fallback">
                      <p>La 3D n'est pas disponible. Le cycle reste consultable en vue plane.</p>
                      <FlatScene
                        config={config}
                        sample={sample}
                        samples={result.samples}
                        xray={xray}
                        dimensions={dimensions}
                        zones={zones}
                        focus={focus}
                      />
                    </div>
                  }
                >
                  <Suspense
                    fallback={<div className="mw-loading">Préparation de votre montage…</div>}
                  >
                    <Scene
                      config={config}
                      sample={sample}
                      samples={result.samples}
                      view={view}
                      zones={zones}
                      field={field}
                      xray={xray}
                      dimensions={dimensions}
                      focus={focus}
                      reduced={reduced}
                    />
                  </Suspense>
                </SceneBoundary>
              )}
              <div className={`mw-live-state ${sample.contact}`}>
                <span />
                {contactLabel[sample.contact]}
                <small>
                  {progress <= 0.5 ? "Aller" : "Retour"} · {Math.round(progress * 100)} % du cycle
                </small>
              </div>
              <p className="mw-orbit-help">
                <Expand size={13} />
                {view === "3d"
                  ? "Glisser pour tourner · molette pour zoomer"
                  : "Vue plane · même montage et même calcul"}
              </p>
            </div>
            <div className="mw-layers">
              <label>
                <input type="checkbox" checked={xray} onChange={(e) => setXray(e.target.checked)} />
                Voir les contacts
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={dimensions}
                  onChange={(e) => setDimensions(e.target.checked)}
                />
                Dimensions
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={zones}
                  onChange={(e) => setZones(e.target.checked)}
                />
                Colorer le parcours
              </label>
              {!reference && (
                <label>
                  <input
                    type="checkbox"
                    checked={field}
                    disabled={view === "top"}
                    onChange={(e) => setField(e.target.checked)}
                  />
                  Champ idéal
                </label>
              )}
              <button
                className="mw-focus-button"
                onClick={() => setFocus(focus === "assembly" ? "sensor" : "assembly")}
              >
                {focus === "assembly" ? "Zoom sur le capteur" : "Voir tout le montage"}
              </button>
              <span>
                Quadrillage : 5 mm · Vert : fermé · Gris : ouvert · Ocre : indéterminé · Contacts
                internes symboliques
              </span>
            </div>
          </div>
          <ContactIndicator contact={sample.contact} />
          <div className="mw-playback">
            <div className="mw-play-controls">
              <button
                className="mw-play"
                aria-label={playing ? "Mettre en pause" : "Lire le cycle"}
                onClick={() => {
                  if (progress >= 1) setProgress(0);
                  setPlaying(!playing);
                }}
              >
                {playing ? <Pause size={19} /> : <Play size={19} />}
              </button>
              <button
                className="mw-reset"
                aria-label="Revenir au départ"
                onClick={() => {
                  setPlaying(false);
                  setProgress(0);
                }}
              >
                <RotateCcw size={17} />
              </button>
              <div>
                <strong>Un cycle complet</strong>
                <span>Aller → retour · lecture pédagogique</span>
              </div>
              <output>
                {reference ? `${sample.distance.toFixed(1)} mm` : `${Math.round(progress * 100)} %`}
              </output>
            </div>
            <div className="mw-timeline" aria-hidden="true">
              {result.samples
                .filter((_, i) => i % 3 === 0)
                .map((s, i) => (
                  <span key={i} className={s.contact} />
                ))}
              <i style={{ left: `${progress * 100}%` }} />
            </div>
            <input
              className="mw-scrubber"
              aria-label="Position dans le cycle"
              type="range"
              min="0"
              max="100"
              step="0.1"
              value={progress * 100}
              onChange={(e) => {
                setPlaying(false);
                setProgress(Number(e.target.value) / 100);
              }}
            />
            <div
              className="mw-target-track"
              aria-label={`Contact souhaité fermé entre ${config.targetStart} et ${config.targetEnd} pour cent du cycle`}
            >
              <span
                style={{
                  left: `${config.targetStart}%`,
                  width: `${config.targetEnd - config.targetStart}%`,
                }}
              />
            </div>
            <div className="mw-timeline-caption">
              <span>Départ</span>
              <span>Point de retour</span>
              <span>Arrivée</span>
            </div>
            <div className="mw-legend">
              <span>
                <i className="closed" />
                Fermé
              </span>
              <span>
                <i className="open" />
                Ouvert
              </span>
              <span>
                <i className="unknown" />
                Indéterminé
              </span>
              <span>
                <i className="target" />
                Fenêtre souhaitée
              </span>
            </div>
          </div>
          <div className="mw-result">
            <div className="mw-result-icon">
              <Info size={22} />
            </div>
            <div>
              <h2>
                {result.reason
                  ? "Montage à caractériser"
                  : targetMet
                    ? "La fenêtre souhaitée est retrouvée dans ce modèle"
                    : "Ce que montre votre cycle"}
              </h2>
              <p>{statusMessage}</p>
              <div className="mw-event-chips">
                {result.transitions
                  .filter((s) => s.contact !== "unknown")
                  .slice(0, 6)
                  .map((s, i) => (
                    <span key={i}>
                      {s.contact === "closed" ? "Fermeture" : "Ouverture"} ·{" "}
                      {reference
                        ? `${s.contact === "closed" ? pull : drop} mm typ.`
                        : `${Math.round(s.t * 100)} %`}
                      {reference && ` · ${s.t <= 0.5 ? "aller" : "retour"}`}
                    </span>
                  ))}
              </div>
            </div>
          </div>
        </section>
      </div>
      <footer className="mw-footer">
        <p>
          <strong>{reference ? "Présélection documentée." : "Illustration pédagogique."}</strong>{" "}
          {reference ? REFERENCE_NOTE : EDUCATION_NOTE}
        </p>
        <p>
          {saved && !dirty
            ? `Montage enregistré dans ${storageLabel}.`
            : `Brouillon · utilisez « Joindre au dossier » pour enregistrer dans ${storageLabel}.`}{" "}
          <a href={DISTANCE_SOURCE} target="_blank" rel="noreferrer">
            Source Standex ↗
          </a>
        </p>
      </footer>
      {catalogOpen && (
        <SensorCatalog
          selected={config.sensorId}
          onClose={() => setCatalogOpen(false)}
          onSelect={(sensorId) => {
            if (sensorId === "MK03") {
              update({
                sensorId,
                mode: "reference",
                motion: "approach",
                sensorAngle: 0,
                magnetAngle: 0,
                magnetization: "axial",
                polarity: 1,
              });
            } else {
              update({ sensorId, mode: "education" });
            }
            setCatalogOpen(false);
            setField(false);
          }}
        />
      )}
      <details className="mw-summary">
        <summary>Résumé du montage et hypothèses</summary>
        <pre>{summary}</pre>
        <p>
          Version du calcul : {MODEL_VERSION}. La scène et ses résultats sont recalculés à chaque
          modification.
        </p>
        <button
          className="mw-text-button"
          onClick={() => download("dossier-montage-magnetique.md", summary, "text/markdown")}
        >
          Télécharger le résumé
        </button>
      </details>
    </main>
  );
}
