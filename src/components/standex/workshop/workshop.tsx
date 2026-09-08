import { t, msg } from "@/lib/i18n/core";
import { LanguagePicker, useLocale } from "@/lib/i18n/react";
import SensorCard from "./sensor-card";
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
  INTERACTION_SOURCE,
  DISTANCE_SOURCE,
  EDUCATION_NOTE,
  REFERENCE_NOTE,
  MK03_DISTANCES,
  MODEL_VERSION,
  parseWorkshopConfig,
  simulateCycle,
  summarizeWorkshop,
} from "@/lib/standex/magnetic-workshop";
import type { WorkshopConfig, Contact, Vec3 } from "@/lib/standex/magnetic-workshop";
import "./workshop.css";
import { COFFEE_ASSEMBLY } from "@/lib/standex/machine-assembly";
import type { MachineAssembly } from "@/lib/standex/machine-assembly";
import type { MachineAsset } from "@/lib/standex/machine-assets";
import type { MachineTool } from "./machine-scene";
import MachineControls from "./machine-controls";
import FlatScene from "./flat-scene";
import SensorCatalog from "./sensor-catalog";
import ContactIndicator from "./contact-indicator";
import { SensorPlan } from "./sensor-plan";
import { sensorById, sizeLabel, sensorSource } from "@/lib/standex/sensor-catalog";

const Scene = lazy(() => import("./scene"));
const MachineScene = lazy(() => import("./machine-scene"));
const contactLabel: Record<Contact, string> = {
  open: "Contact ouvert",
  closed: "Contact fermé",
  unknown: "État indéterminé",
};
const motionLabels = { approach: "Approche et retrait", slide: "Passage latéral", pivot: "Pivot" };
class SceneBoundary extends Component<
  { children: ReactNode; fallback: ReactNode; onError: () => void },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch() {
    this.props.onError();
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
        <span>{t(label)}</span>
        <output>
          {t(Number(value.toFixed(1)))}
          {t(unit)}
        </output>
      </span>
      <input
        aria-label={t(label)}
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
  if (type.includes("markdown")) text = t(text);
  const url = URL.createObjectURL(new Blob([text], { type })),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
/** Tracé de câble : entièrement optionnel. Sans cette prop, l'atelier est inchangé. */
export interface WorkshopCableRouting {
  slot: "sensor" | "waypoint" | "connection";
  setSlot: (slot: "sensor" | "waypoint" | "connection") => void;
  /** Trajet courant en millimètres, tel qu'il est enregistré dans le dossier. */
  points: [number, number, number][];
  targetLabel: string;
  /** `cycleT` documente la pose de la scène au moment du relevé. */
  onPick: (point: [number, number, number], cycleT: number) => void;
  onUndo: () => void;
  onReset: () => void;
  /** Longueur mesurée calculée par le dossier, ou message d'inconnu. */
  lengthLabel: string;
}

export interface WorkshopProps {
  initialConfig?: WorkshopConfig | null;
  onClose: () => void;
  onSave: (config: WorkshopConfig) => Promise<void>;
  storageLabel?: string;
  /** "memory" : le GLB ne quitte jamais la mémoire de l'onglet (aucune écriture appareil). */
  storageMode?: "memory" | "local-device";
  cableRouting?: WorkshopCableRouting;
  /** Remontée du brouillon en cours (mémoire de l'onglet uniquement).
   * Sauvegarder reste une action explicite : ceci sert seulement à ne pas
   * perdre une modification quand l'atelier est fermé ou masqué. */
  onDraftChange?: (config: WorkshopConfig) => void;
}
export default function MagneticWorkshop({
  initialConfig,
  onClose,
  onSave,
  storageLabel = "la session et le dossier",
  storageMode = "local-device",
  cableRouting,
  onDraftChange,
}: WorkshopProps) {

  useLocale();
  const [productCard, setProductCard] = useState(false);
  const [config, setConfig] = useState<WorkshopConfig>(
    () => parseWorkshopConfig(initialConfig) ?? { ...DEFAULT_WORKSHOP },
  );
  useEffect(() => {
    onDraftChange?.(config);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);
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
  const [resetEpoch, setResetEpoch] = useState(0),
    [sceneError, setSceneError] = useState(false);
  const [machineAsset, setMachineAsset] = useState<MachineAsset | null>(null),
    [assetError, setAssetError] = useState<string | null>(null);
  const [tool, setTool] = useState<MachineTool>("navigate"),
    [transformMode, setTransformMode] = useState<"translate" | "rotate">("translate");
  const [showMachine, setShowMachine] = useState(true),
    [showSpace, setShowSpace] = useState(true),
    [measure, setMeasure] = useState<number | null>(null);
  const machine = config.machine;
  useEffect(() => {
    let cancelled = false,
      loaded: MachineAsset | null = null;
    setMachineAsset(null);
    setAssetError(null);
    if (!machine) return;
    void import("@/lib/standex/machine-assets")
      .then((m) => m.loadMachineAsset(machine.assetKey, machine.unitScale, storageMode))
      .then((asset) => {
        if (cancelled) {
          asset.dispose();
          return;
        }
        loaded = asset;
        setMachineAsset(asset);
        if (!machine.movingNode) {
          const tray = asset.nodes.find((n) => n.name === "Bac_mobile"),
            first =
              tray ??
              asset.nodes.find((n) => /mobile|drawer|door|lid|couvercle|porte/i.test(n.name));
          setConfig((c) =>
            c.machine?.assetKey === machine.assetKey
              ? {
                  ...c,
                  machine: {
                    ...c.machine,
                    movingNode: first?.path ?? "",
                    ...(tray
                      ? {}
                      : {
                          sensorPosition: [
                            asset.center[0] + asset.size[0] / 2 + 8,
                            asset.center[1],
                            asset.center[2],
                          ] as Vec3,
                          magnetPosition: [
                            asset.center[0] + asset.size[0] / 2 - 8,
                            asset.center[1],
                            asset.center[2],
                          ] as Vec3,
                        }),
                  },
                }
              : c,
          );
        }
      })
      .catch((e) => {
        if (!cancelled) setAssetError(e instanceof Error ? e.message : "Fichier 3D illisible.");
      });
    return () => {
      cancelled = true;
      loaded?.dispose();
    };
    // Positions and cycle changes reuse the loaded geometry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machine?.assetKey, machine?.unitScale, storageMode]);
  function machineChange(patch: Partial<MachineAssembly>) {
    if (machine) update({ machine: { ...machine, ...patch } });
  }
  function chooseTool(next: MachineTool) {
    setPlaying(false);
    // Le tracé de câble se relève DANS la pose courante : on ne remet pas le cycle à zéro.
    if (next !== "cable") setProgress(0);
    setTool(next);

  }
  function exampleMachine() {
    update({
      machine: structuredClone(COFFEE_ASSEMBLY),
      demoReach: 25,
      mode: "education",
      sensorId: "MK24-A-J",
      magnetModel: "generic",
      initialContact: "open",
      magnetization: "axial",
      polarity: 1,
    });
    setView("3d");
    setFocus("assembly");
    setResetEpoch((v) => v + 1);
    setSceneError(false);
  }
  async function importMachine(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const { storeMachineFileWithMode } = await import("@/lib/standex/machine-assets");
      const assetKey = await storeMachineFileWithMode(file, storageMode);
      const same = machine?.assetKey === assetKey;
      update({
        mode: "education",
        magnetModel: "generic",
        machine: same
          ? { ...machine! }
          : {
              ...structuredClone(COFFEE_ASSEMBLY),
              assetKey,
              fileName: file.name.slice(0, 180),
              movingNode: "",
            },
      });
      setView("3d");
      setFocus("assembly");
      setSceneError(false);
      setResetEpoch((v) => v + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import impossible.");
    }
  }
  function failed3d() {
    setSceneError(true);
    if (!machine) setView("top");
  }
  function request3d() {
    setSceneError(false);
    setView("3d");
    setResetEpoch((v) => v + 1);
  }
  function orientMagnet(patch: Partial<WorkshopConfig>) {
    update({ ...patch, mode: "education" });
  }

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
  const machineReady = !machine || !!machineAsset?.nodes.some((n) => n.path === machine.movingNode);
  const mismatches = result.samples.filter(
    (s) =>
      s.contact !== "unknown" &&
      (s.contact === "closed") !==
        (s.t * 100 >= config.targetStart && s.t * 100 <= config.targetEnd),
  );
  const targetMet = !machine && !unknown && mismatches.length <= 3;

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
            machine: null,
            magnetModel: "M02",
            magnetTilt: 0,
            lateralShift: 0,
            motion: "approach",
            sensorAngle: 0,
            magnetAngle: 0,
            magnetization: "axial",
            polarity: 1,
          }
        : { mode, motion: config.motion },
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
      if (!parsed) throw new Error("Ce fichier ne contient pas un montage valide (V1, V2 ou V3).");
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
    <main className="mw" aria-label={t("Atelier magnétique")}>
      {productCard && (
        <SensorCard
          key={sensor.id}
          sensorId={sensor.id}
          contact={sample.contact}
          onClose={() => setProductCard(false)}
        />
      )}
      <header className="mw-header">
        <button className="mw-back" onClick={onClose} disabled={saving}>
          <ArrowLeft size={18} />
          <span>{t("Retour au dossier")}</span>
        </button>
        <div className="mw-brand">
          STANDEX <span>DETECT</span>
          <small>{t("ATELIER MAGNÉTIQUE")}</small>
        </div>
        <LanguagePicker />
        <span className="mw-prototype">{t("Prototype interne · V0.4")}</span>
      </header>
      <div className="mw-intro">
        <div>
          <p className="mw-eyebrow">{t("COMPRENDRE AVANT D'INTÉGRER")}</p>
          <h1>{t("Votre montage, en mouvement.")}</h1>
          <p>{t("Placez le capteur et l'aimant. Observez quand le contact change d'état.")}</p>
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
            {t("Exporter")}
          </button>
          <button
            className="mw-button"
            onClick={() => void save()}
            disabled={saving || (!dirty && saved !== null)}
          >
            {saving ? (
              <span>{t("Enregistrement…")}</span>
            ) : !dirty && saved ? (
              <>
                <Check size={16} />
                {t("Enregistré")}
              </>
            ) : (
              <>
                <Save size={16} />
                {t("Joindre au dossier")}
              </>
            )}
          </button>
        </div>
      </div>
      {(error || importNotice) && (
        <div className={error ? "mw-alert" : "mw-notice"} role={error ? "alert" : "status"}>
          {t(error ?? importNotice)}
        </div>
      )}
      <div className="mw-context-card">
        <div>
          <strong>{t("Essayer dans un objet réel en 3D")}</strong>
          <p>
            {t("Une machine à café fictive, un bac mobile et des composants à placer à l'échelle.")}
          </p>
        </div>
        <button className="mw-button mw-secondary" onClick={exampleMachine}>
          {t("Ouvrir la machine à café")}
        </button>
        <a href="/models/machine-cafe-bac-mobile.glb" download>
          {t("Télécharger le fichier 3D")}
        </a>
      </div>
      <div className={machine ? "mw-layout mw-machine-layout" : "mw-layout"}>
        <aside className="mw-controls">
          {machine ? (
            <MachineControls
              config={config}
              asset={machineAsset}
              tool={tool}
              setTool={chooseTool}
              onChange={machineChange}
              onExample={exampleMachine}
              onImport={(file) => void importMachine(file)}
              onExit={() => update({ machine: null })}
              onCatalog={() => setCatalogOpen(true)}
              onProductCard={() => setProductCard(true)}
              measure={measure}
            />
          ) : (
            <>
              <div className="mw-start">
                <label htmlFor="mw-mode">{t("Votre point de départ")}</label>
                <select
                  id="mw-mode"
                  value={config.mode}
                  onChange={(e) => chooseMode(e.target.value as WorkshopConfig["mode"])}
                >
                  <option value="reference">{t("Exemple Standex documenté")}</option>
                  <option value="education">{t("Démonstration · distances fictives")}</option>
                </select>
                <p>
                  {t(
                    reference
                      ? "MK03 + M02 · distances typiques publiées"
                      : "Forme cotée · champ et seuils fictifs",
                  )}
                </p>
              </div>
              <nav className="mw-steps" aria-label={t("Étapes du montage")}>
                {["Capteur", "Aimant", "Mouvement"].map((s, i) => (
                  <button
                    key={s}
                    className={step === i ? "active" : ""}
                    aria-current={step === i ? "step" : undefined}
                    onClick={() => setStep(i)}
                  >
                    <span>{t(i + 1)}</span>
                    {t(s)}
                  </button>
                ))}
              </nav>
              <div className="mw-step-body">
                {step === 0 && (
                  <>
                    <h2>{t("Installez le capteur")}</h2>
                    <p className="mw-help">
                      {t("Le plan quadrillé représente le repère de votre machine.")}
                    </p>
                    <div className="mw-selected-sensor">
                      <svg viewBox="-38 -17 76 34" aria-hidden="true">
                        <SensorPlan model={sensor} xray={false} />
                      </svg>
                      <strong>
                        {t(reference ? `MK03-1A66${config.sensitivity}-500W` : sensor.name)}
                      </strong>
                      <span>{t(sizeLabel(sensor))}</span>
                      <button
                        className="mw-product-card-button"
                        onClick={() => setProductCard(true)}
                      >
                        <Info size={16} />
                        {t("Découvrir ce capteur")}
                      </button>
                      <button
                        className="mw-button mw-secondary mw-wide"
                        onClick={() => setCatalogOpen(true)}
                      >
                        {t("Choisir dans le catalogue")}
                      </button>
                      {sensorSource(sensor) && (
                        <a href={sensorSource(sensor)!} target="_blank" rel="noreferrer">
                          {t("Voir la fiche et le plan Standex ↗")}
                        </a>
                      )}
                    </div>
                    {sensor.note && <p className="mw-help">{t(sensor.note)}</p>}
                    {reference && (
                      <label className="mw-select-label">
                        {t("Classe de sensibilité")}
                        <select
                          value={config.sensitivity}
                          onChange={(e) =>
                            update({ sensitivity: e.target.value as WorkshopConfig["sensitivity"] })
                          }
                        >
                          {(["B", "C", "D", "E"] as const).map((x) => (
                            <option key={x} value={x}>
                              {msg("Classe {0}", [x])}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <Range
                      label={t("Orientation sur la machine")}
                      value={config.mountAngle}
                      min={-180}
                      max={180}
                      step={15}
                      unit="°"
                      onChange={(mountAngle) => update({ mountAngle })}
                    />
                    <details>
                      <summary>{t("Position et environnement")}</summary>
                      <Range
                        label={t("Position X du montage")}
                        value={config.mountX}
                        min={-25}
                        max={25}
                        unit=" mm"
                        onChange={(mountX) => update({ mountX })}
                      />
                      <Range
                        label={t("Position Z du montage")}
                        value={config.mountZ}
                        min={-25}
                        max={25}
                        unit=" mm"
                        onChange={(mountZ) => update({ mountZ })}
                      />
                      <p className="mw-help">
                        {t(
                          "Placement géométrique en millimètres. Cette rotation déplace ensemble le capteur et la trajectoire.",
                        )}
                      </p>
                      <label className="mw-check">
                        <input
                          type="checkbox"
                          checked={config.ferromagnetic}
                          onChange={(e) => update({ ferromagnetic: e.target.checked })}
                        />
                        {t("Acier ou autre matière ferromagnétique proche")}
                      </label>
                      <label className="mw-select-label">
                        {t("Température")}
                        <select
                          value={config.temperature}
                          onChange={(e) =>
                            update({ temperature: e.target.value as WorkshopConfig["temperature"] })
                          }
                        >
                          <option value="ambient">{t("Ambiante · exemple de référence")}</option>
                          <option value="other">{t("Autre température")}</option>
                        </select>
                      </label>
                    </details>
                    {!reference && (
                      <Range
                        label={t("Orientation propre du reed")}
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
                    <h2>{t("Placez l'aimant")}</h2>
                    <div className="mw-product">
                      <span className="mw-product-icon">
                        <Magnet size={25} />
                      </span>
                      <div>
                        <strong>
                          {t(
                            config.magnetModel === "M02"
                              ? "M02 · enveloppe Standex"
                              : "Aimant fictif",
                          )}
                        </strong>
                        <span>
                          {t(
                            reference
                              ? "Actionneur de la table de référence"
                              : "Modèle idéal de dipôle dans l'air",
                          )}
                        </span>
                      </div>
                    </div>
                    <label className="mw-select-label">
                      {t("Approche du capteur")}
                      <select
                        value={config.geometry}
                        onChange={(e) => update({ geometry: e.target.value as "D1" | "D3" })}
                      >
                        <option value="D1">{t("D1 · face au centre")}</option>
                        <option value="D3">{t("D3 · par l'extrémité")}</option>
                      </select>
                    </label>
                    <p className="mw-help">
                      {t(
                        reference
                          ? "Table Standex, axes parallèles. Modifier l'orientation passe en démonstration fictive."
                          : "La position du boîtier et l'axe Nord–Sud sont réglables séparément. Les distances restent fictives.",
                      )}
                    </p>
                    <div className="mw-orientation-presets">
                      <button
                        onClick={() =>
                          orientMagnet({
                            magnetAngle: config.sensorAngle,
                            magnetTilt: 0,
                            magnetization: "axial",
                            lateralShift: 0,
                          })
                        }
                      >
                        {t("N–S parallèle au reed")}
                      </button>
                      <button
                        onClick={() =>
                          orientMagnet({
                            magnetAngle: ((config.sensorAngle + 270) % 360) - 180,
                            magnetTilt: 0,
                            magnetization: "axial",
                            lateralShift: 0,
                          })
                        }
                      >
                        {t("Tourner l'aimant de 90°")}
                      </button>
                      <button
                        onClick={() =>
                          orientMagnet({
                            magnetAngle: ((config.sensorAngle + 270) % 360) - 180,
                            lateralShift: 15,
                            demoReach: 40,
                            magnetTilt: 0,
                            magnetization: "axial",
                          })
                        }
                      >
                        {t("Explorer un lobe décalé")}
                      </button>
                    </div>
                    <Range
                      label={t("Rotation du boîtier aimant")}
                      value={config.magnetAngle}
                      min={-180}
                      max={180}
                      step={15}
                      unit="°"
                      onChange={(magnetAngle) => orientMagnet({ magnetAngle })}
                    />
                    <Range
                      label={t("Inclinaison hors du plan")}
                      value={config.magnetTilt}
                      min={-180}
                      max={180}
                      step={15}
                      unit="°"
                      onChange={(magnetTilt) => orientMagnet({ magnetTilt })}
                    />
                    <label className="mw-select-label">
                      {t("Axe Nord–Sud dans l'aimant")}
                      <select
                        value={config.magnetization}
                        onChange={(e) =>
                          orientMagnet({
                            magnetization: e.target.value as WorkshopConfig["magnetization"],
                          })
                        }
                      >
                        <option value="axial">{t("Longueur · aux extrémités")}</option>
                        <option value="diametral">{t("Largeur · sur les côtés")}</option>
                        <option value="thickness">{t("Épaisseur · dessus / dessous")}</option>
                      </select>
                    </label>
                    <button
                      className="mw-button mw-secondary mw-wide"
                      onClick={() => orientMagnet({ polarity: config.polarity === 1 ? -1 : 1 })}
                    >
                      {t("Inverser les pôles N / S")}
                    </button>
                    {!reference && (
                      <Range
                        label={t("Décalage par rapport au centre")}
                        value={config.lateralShift}
                        min={-50}
                        max={50}
                        unit=" mm"
                        onChange={(lateralShift) => update({ lateralShift })}
                      />
                    )}
                    <p className="mw-help">
                      {t(
                        "Une rotation de 90° change le couplage et les lobes. Inverser N/S seul ne change pas l'activation d'un reed Form A non polarisé. Un axe mal placé peut laisser le contact ouvert.",
                      )}
                    </p>
                    <a href={INTERACTION_SOURCE} target="_blank" rel="noreferrer">
                      {t("Comprendre avec les schémas Standex ↗")}
                    </a>
                    {reference && (
                      <div className="mw-source-values">
                        <span>
                          {t("Enclenchement typique")}
                          <strong>{t(pull)} mm</strong>
                        </span>
                        <span>
                          {t("Relâchement typique")}
                          <strong>{t(drop)} mm</strong>
                        </span>
                      </div>
                    )}
                  </>
                )}
                {step === 2 && (
                  <>
                    <h2>{t("Définissez le mouvement")}</h2>
                    <label className="mw-select-label">
                      {t("Trajectoire")}
                      <select
                        value={reference ? "approach" : config.motion}
                        disabled={reference}
                        onChange={(e) =>
                          update({ motion: e.target.value as WorkshopConfig["motion"] })
                        }
                      >
                        {Object.entries(motionLabels).map(([v, l]) => (
                          <option key={v} value={v}>
                            {t(l)}
                          </option>
                        ))}
                      </select>
                    </label>
                    {reference || config.motion === "approach" ? (
                      <>
                        <Range
                          label={t("Distance au départ")}
                          value={config.start}
                          min={2}
                          max={60}
                          step={0.5}
                          unit={unit}
                          onChange={(start) => update({ start })}
                        />
                        <Range
                          label={t("Distance au plus proche")}
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
                          label={t(
                            config.motion === "slide" ? "Décalage du passage" : "Rayon du pivot",
                          )}
                          value={config.offset}
                          min={6}
                          max={30}
                          step={0.5}
                          unit=" mm"
                          onChange={(offset) => update({ offset })}
                        />
                        {config.motion === "slide" ? (
                          <Range
                            label={t("Demi-course latérale")}
                            value={config.travel}
                            min={10}
                            max={50}
                            unit=" mm"
                            onChange={(travel) => update({ travel })}
                          />
                        ) : (
                          <Range
                            label={t("Angle du pivot")}
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
                      <summary>{t("Comportement recherché")}</summary>
                      <p className="mw-help">
                        {t(
                          "Je souhaite que le contact soit fermé sur cette portion du cycle aller-retour.",
                        )}
                      </p>
                      <Range
                        label={t("Début de la fenêtre souhaitée")}
                        value={config.targetStart}
                        min={0}
                        max={config.targetEnd - 1}
                        unit=" %"
                        onChange={(targetStart) => update({ targetStart })}
                      />
                      <Range
                        label={t("Fin de la fenêtre souhaitée")}
                        value={config.targetEnd}
                        min={config.targetStart + 1}
                        max={100}
                        unit=" %"
                        onChange={(targetEnd) => update({ targetEnd })}
                      />
                      <label className="mw-select-label">
                        {t("État initial du contact")}
                        <select
                          value={config.initialContact}
                          onChange={(e) => update({ initialContact: e.target.value as Contact })}
                        >
                          <option value="unknown">{t("Inconnu")}</option>
                          <option value="open">{t("Ouvert")}</option>
                          <option value="closed">{t("Fermé")}</option>
                        </select>
                      </label>
                    </details>
                    <p className="mw-help">
                      {t(
                        "La lecture est ralentie pour comprendre le montage. Elle ne valide ni la cadence, ni les rebonds du contact.",
                      )}
                    </p>
                  </>
                )}
              </div>
              <div className="mw-step-footer">
                <span>
                  {t("Étape")} {t(step + 1)} {t("sur 3")}
                </span>
                {step < 2 ? (
                  <button onClick={() => setStep(step + 1)}>
                    {t("Continuer")}
                    <ArrowRight size={16} />
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setProgress(0);
                      setPlaying(true);
                    }}
                  >
                    {t("Voir le cycle")}
                    <Play size={15} />
                  </button>
                )}
              </div>
              <details className="mw-file-tools">
                <summary>{t("Reprendre un montage")}</summary>
                <button className="mw-text-button" onClick={() => fileRef.current?.click()}>
                  {t("Importer un fichier de montage")}
                </button>
                <input
                  hidden
                  ref={fileRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={(e) => void importFile(e.target.files?.[0])}
                />
              </details>
            </>
          )}
        </aside>
        <section className="mw-visual-column" aria-label={t("Simulation du montage")}>
          <div className="mw-scene-card">
            <div className="mw-scene-toolbar">
              <span className={reference ? "mw-kind" : "mw-kind education"}>
                {t(
                  reference
                    ? "Référence Standex · valeurs typiques"
                    : "Démonstration · distances fictives",
                )}
              </span>
              <div className="mw-view-switch">
                <button aria-pressed={view === "3d"} onClick={request3d}>
                  3D
                </button>
                <button aria-pressed={view === "top"} onClick={() => setView("top")}>
                  {t("Vue plane")}
                </button>
              </div>
            </div>
            {cableRouting ? (
              <div className="mw-cable-panel" data-testid="cable-routing-panel">
                <div className="mw-cable-row">
                  <strong>{t("Tracé du câble")}</strong>
                  <span>{t(cableRouting.targetLabel)}</span>
                  <button
                    className="mw-text-button"
                    aria-pressed={tool === "cable"}
                    data-testid="cable-tool-toggle"
                    onClick={() => chooseTool(tool === "cable" ? "navigate" : "cable")}
                  >
                    {t(tool === "cable" ? "Arrêter le pointage" : "Pointer dans la 3D")}
                  </button>
                </div>
                {tool === "cable" ? (
                  <div className="mw-cable-row">
                    {(
                      [
                        ["sensor", "Sortie capteur"],
                        ["waypoint", "Point de passage"],
                        ["connection", "Point de connexion"],
                      ] as const
                    ).map(([slot, label]) => (
                      <button
                        key={slot}
                        className="mw-text-button"
                        aria-pressed={cableRouting.slot === slot}
                        data-testid={`cable-slot-${slot}`}
                        onClick={() => cableRouting.setSlot(slot)}
                      >
                        {t(label)}
                      </button>
                    ))}
                    <button className="mw-text-button" onClick={cableRouting.onUndo}>
                      {t("Annuler le dernier point")}
                    </button>
                    <button className="mw-text-button" onClick={cableRouting.onReset}>
                      {t("Effacer le trajet")}
                    </button>
                  </div>
                ) : null}
                <p className="mw-cable-note" data-testid="cable-length">
                  {t(cableRouting.lengthLabel)}
                </p>
                <p className="mw-cable-note">
                  {t(
                    "Le tracé mesure la polyligne que vous placez : il ne garantit ni rayon de courbure, " +
                      "ni absence de frottement, et ne vaut aucune validation. La navigation reste séparée du pointage.",
                  )}
                </p>
              </div>
            ) : null}

            <div
              className="mw-canvas"
              role="img"
              aria-label={t(
                `Montage ${machine ? machine.fileName : reference ? config.geometry : motionLabels[config.motion]}. ${contactLabel[sample.contact]}.`,
              )}
            >
              {machine ? (
                assetError ? (
                  <div className="mw-loading" role="alert">
                    {t(assetError)}
                  </div>
                ) : !machineAsset ? (
                  <div className="mw-loading">{t("Chargement du fichier 3D…")}</div>
                ) : sceneError ? (
                  <div className="mw-loading">
                    {t("La 3D a été interrompue. Utilisez le bouton 3D pour la relancer.")}
                  </div>
                ) : (
                  <SceneBoundary
                    key={"machine:" + resetEpoch}
                    onError={failed3d}
                    fallback={
                      <div className="mw-loading">{t("La scène 3D a été interrompue.")}</div>
                    }
                  >
                    <Suspense
                      fallback={<div className="mw-loading">{t("Préparation de la machine…")}</div>}
                    >
                      <MachineScene
                        asset={machineAsset}
                        config={config}
                        sample={sample}
                        view={view}
                        focus={focus}
                        resetEpoch={resetEpoch}
                        tool={tool}
                        transformMode={transformMode}
                        showMachine={showMachine}
                        showSpace={showSpace}
                        xray={xray}
                        reduced={reduced}
                        onChange={machineChange}
                        onMeasure={setMeasure}
                        onPlaced={() => setTool("navigate")}
                        onContextLost={failed3d}
                        routing={
                          cableRouting
                            ? {
                                slot: cableRouting.slot,
                                points: cableRouting.points,
                                targetLabel: cableRouting.targetLabel,
                                onPick: (point) => cableRouting.onPick(point, sample.t),
                              }
                            : undefined
                        }

                      />
                    </Suspense>
                  </SceneBoundary>
                )
              ) : view === "top" ? (
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
                  key={resetEpoch}
                  onError={failed3d}
                  fallback={
                    <div className="mw-fallback">
                      <p>
                        {t("La 3D n'est pas disponible. Le cycle reste consultable en vue plane.")}
                      </p>
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
                    fallback={
                      <div className="mw-loading">{t("Préparation de votre montage…")}</div>
                    }
                  >
                    <Scene
                      config={config}
                      resetEpoch={resetEpoch}
                      onContextLost={failed3d}
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
                {t(contactLabel[sample.contact])}
                <small>
                  {t(progress <= 0.5 ? "Aller" : "Retour")} · {t(Math.round(progress * 100))}
                  {t("% du cycle")}
                </small>
              </div>
              <p className="mw-orbit-help">
                <Expand size={13} />
                {t(
                  view === "3d"
                    ? "Glisser pour tourner · molette pour zoomer"
                    : "Vue plane · même montage et même calcul",
                )}
              </p>
            </div>
            {sceneError && !machine && (
              <p className="mw-demo-note">
                {t(
                  "Repli en vue plane après interruption de la 3D. Le bouton 3D permet de réessayer.",
                )}
              </p>
            )}
            {machine && (
              <div className="mw-layers">
                <label>
                  <input
                    type="checkbox"
                    checked={showMachine}
                    onChange={(e) => setShowMachine(e.target.checked)}
                  />
                  {t("Boîtier opaque")}
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={showSpace}
                    onChange={(e) => setShowSpace(e.target.checked)}
                  />
                  {t("Gabarit disponible")}
                </label>
                <label>
                  {t("Manipulation")}
                  <select
                    aria-label={t("Manipulation 3D")}
                    value={transformMode}
                    onChange={(e) => setTransformMode(e.target.value as "translate" | "rotate")}
                  >
                    <option value="translate">{t("Déplacer")}</option>
                    <option value="rotate">{t("Tourner")}</option>
                  </select>
                </label>
              </div>
            )}
            <div className="mw-layers">
              <label>
                <input type="checkbox" checked={xray} onChange={(e) => setXray(e.target.checked)} />
                {t("Voir les contacts")}
              </label>
              {!machine && (
                <>
                  <label>
                    <input
                      type="checkbox"
                      checked={dimensions}
                      onChange={(e) => setDimensions(e.target.checked)}
                    />
                    {t("Dimensions")}
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={zones}
                      onChange={(e) => setZones(e.target.checked)}
                    />
                    {t("Colorer le parcours")}
                  </label>
                </>
              )}
              {!reference && !machine && (
                <label>
                  <input
                    type="checkbox"
                    checked={field}
                    disabled={view === "top"}
                    onChange={(e) => setField(e.target.checked)}
                  />
                  {t("Champ idéal")}
                </label>
              )}
              <button
                className="mw-focus-button"
                onClick={() => setFocus(focus === "assembly" ? "sensor" : "assembly")}
              >
                {t(focus === "assembly" ? "Zoom sur le capteur" : "Voir tout le montage")}
              </button>
              <span>
                {t("Quadrillage :")}
                {t(machine ? "10" : "5")}
                {t("mm · Vert : fermé · Gris : ouvert · Contacts internes symboliques")}
              </span>
            </div>
          </div>
          {!reference && (
            <details className="mw-demo-settings" open={!machine}>
              <summary>{t("Distances fictives · réglages de démonstration")}</summary>
              <p>
                {t("Les matériaux et la température n'interviennent pas dans ce calcul.")}
                {t(" ")}
                {t(
                  sensor.id === "MK02"
                    ? "Le MK02 est représenté avec un contact Form A fictif : son mécanisme ferreux réel n'est pas simulé."
                    : "",
                )}
              </p>
              <Range
                label={t("Échelle du champ fictif")}
                value={config.demoReach}
                min={5}
                max={100}
                unit=" mm"
                onChange={(demoReach) => update({ demoReach })}
              />
              {machine && (
                <>
                  <label className="mw-select-label">
                    {t("Axe Nord–Sud de l'aimant")}
                    <select
                      value={config.magnetization}
                      onChange={(e) =>
                        update({ magnetization: e.target.value as WorkshopConfig["magnetization"] })
                      }
                    >
                      <option value="axial">{t("Longueur X")}</option>
                      <option value="diametral">{t("Largeur Z")}</option>
                      <option value="thickness">{t("Épaisseur Y")}</option>
                    </select>
                  </label>
                  <button
                    className="mw-text-button"
                    onClick={() => update({ polarity: config.polarity === 1 ? -1 : 1 })}
                  >
                    {t("Inverser N / S")}
                  </button>
                </>
              )}
            </details>
          )}
          <ContactIndicator contact={sample.contact} />
          <div className="mw-playback">
            <div className="mw-play-controls">
              <button
                className="mw-play"
                disabled={!machineReady}
                aria-label={t(playing ? "Mettre en pause" : "Lire le cycle")}
                onClick={() => {
                  if (progress >= 1) setProgress(0);
                  setPlaying(!playing);
                }}
              >
                {playing ? <Pause size={19} /> : <Play size={19} />}
              </button>
              <button
                className="mw-reset"
                aria-label={t("Revenir au départ")}
                onClick={() => {
                  setPlaying(false);
                  setProgress(0);
                }}
              >
                <RotateCcw size={17} />
              </button>
              <div>
                <strong>{t(machine ? "Ouvrir et refermer la pièce" : "Un cycle complet")}</strong>
                <span>{t("Aller → retour · lecture pédagogique")}</span>
              </div>
              <output>
                {t(
                  machine
                    ? `${Math.round((progress <= 0.5 ? progress * 2 : (1 - progress) * 2) * 100)} % ouvert`
                    : reference
                      ? `${sample.distance.toFixed(1)} mm`
                      : `${Math.round(progress * 100)} %`,
                )}
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
              disabled={!machineReady}
              aria-label={t("Position dans le cycle")}
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
            {!machine && (
              <div
                className="mw-target-track"
                aria-label={t(
                  `Contact souhaité fermé entre ${config.targetStart} et ${config.targetEnd} pour cent du cycle`,
                )}
              >
                <span
                  style={{
                    left: `${config.targetStart}%`,
                    width: `${config.targetEnd - config.targetStart}%`,
                  }}
                />
              </div>
            )}
            <div className="mw-timeline-caption">
              <span>{t(machine ? "Pièce fermée" : "Départ")}</span>
              <span>{t(machine ? "Pièce ouverte" : "Point de retour")}</span>
              <span>{t(machine ? "Pièce refermée" : "Arrivée")}</span>
            </div>
            <div className="mw-legend">
              <span>
                <i className="closed" />
                {t("Fermé")}
              </span>
              <span>
                <i className="open" />
                {t("Ouvert")}
              </span>
              {reference && (
                <span>
                  <i className="unknown" />
                  {t("Indéterminé")}
                </span>
              )}
              {!machine && (
                <span>
                  <i className="target" />
                  {t("Fenêtre souhaitée")}
                </span>
              )}
            </div>
          </div>
          <div className="mw-result">
            <div className="mw-result-icon">
              <Info size={22} />
            </div>
            <div>
              <h2>
                {t(
                  result.reason
                    ? "Montage à caractériser"
                    : targetMet
                      ? "La fenêtre souhaitée est retrouvée dans ce modèle"
                      : "Ce que montre votre cycle",
                )}
              </h2>
              <p>{t(statusMessage)}</p>
              {unknown && (
                <button
                  className="mw-button mw-secondary"
                  onClick={() => update({ mode: "education", initialContact: "open" })}
                >
                  {t("Animer avec des distances fictives")}
                </button>
              )}
              <div className="mw-event-chips">
                {result.transitions
                  .filter((s) => s.contact !== "unknown")
                  .slice(0, 6)
                  .map((s, i) => (
                    <span key={i}>
                      {t(s.contact === "closed" ? "Fermeture" : "Ouverture")} ·{t(" ")}
                      {t(
                        reference
                          ? `${s.contact === "closed" ? pull : drop} mm typ.`
                          : `${Math.round(s.t * 100)} %`,
                      )}
                      {t(reference && ` · ${s.t <= 0.5 ? "aller" : "retour"}`)}
                    </span>
                  ))}
              </div>
            </div>
          </div>
        </section>
      </div>
      <footer className="mw-footer">
        <p>
          <strong>{t(reference ? "Présélection documentée." : "Illustration pédagogique.")}</strong>
          {t(" ")}
          {t(reference ? REFERENCE_NOTE : EDUCATION_NOTE)}
        </p>
        <p>
          {t(
            saved && !dirty
              ? `Montage enregistré dans ${storageLabel}.`
              : `Brouillon · utilisez « Joindre au dossier » pour enregistrer dans ${storageLabel}.`,
          )}
          {t(" ")}
          <a
            href={reference ? DISTANCE_SOURCE : INTERACTION_SOURCE}
            target="_blank"
            rel="noreferrer"
          >
            {t("Source Standex ↗")}
          </a>
        </p>
      </footer>
      {catalogOpen && (
        <SensorCatalog
          selected={config.sensorId}
          onClose={() => setCatalogOpen(false)}
          onSelect={(sensorId) => {
            if (sensorId === "MK03" && !machine && reference) {
              update({
                sensorId,
                mode: "reference",
                magnetModel: "M02",
                magnetTilt: 0,
                lateralShift: 0,
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
        <summary>{t("Résumé du montage et hypothèses")}</summary>
        <pre>{t(summary)}</pre>
        <p>
          {t("Version du calcul :")}
          {t(MODEL_VERSION)}
          {t(". La scène et ses résultats sont recalculés à chaque modification.")}
        </p>
        <button
          className="mw-text-button"
          onClick={() => download("dossier-montage-magnetique.md", summary, "text/markdown")}
        >
          {t("Télécharger le résumé")}
        </button>
      </details>
    </main>
  );
}
