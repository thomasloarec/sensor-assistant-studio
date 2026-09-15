import { defaultMagnetFor, documentedAlias, magnetOptionsFor } from "@/lib/standex/default-pairs";
import { pairedMagnetModel } from "@/lib/standex/paired-magnets";
import { magnetSource } from "@/lib/standex/magnet-catalog";
import { t, msg } from "@/lib/i18n/core";
import { GuideMaterials } from "./guide-materials";
import { useLocale } from "@/lib/i18n/react";
import { AppHeader } from "@/components/standex/app-header";
import SensorCard from "./sensor-card";
import {
  COVERAGE_LABEL,
  EVIDENCE_LABEL,
  GuidedSuggestion,
  GuidedVerdict,
  LIMIT_LABEL,
  SensitivityComparison,
  useGuidedMounting,
} from "./guided-mounting";
import StudioV2 from "./studio-v2";
import {
  applySuggestion,
  composeRotations,
  magnetWorldPosition,
  scenePoseSampler,
  simulateMounting,
  SAMPLE_STEPS,
  suggestPose,
  workshopPatchFromMounting,
} from "@/lib/standex/mounting";

import type { GuidedMounting } from "@/lib/standex/mounting";
import type { StudioStudy } from "@/lib/standex/studio-dossier";
import type { DesignFreeze } from "@/lib/standex/design-freeze";
import {
  publishedClasses,
  publishedApproaches,
  publishedClassKind,
  publishedRowsForCouple,
  publishedRowsSourceUrl,
} from "@/lib/standex/magnetics/registries";
import { Component, lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
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
  referenceNoteFor,
  documentedMagnetAngleDeg,
  publishedFamilyNoteFor,
  MODEL_VERSION,
  parseWorkshopConfig,
  simulateCycle,
  summarizeWorkshop,
  magnetSize,
  distanceBasis,
  isFictitiousSensor,
  applySensorSelection,
  approachChoicesFor,
  workshopPair,
} from "@/lib/standex/magnetic-workshop";
import type { WorkshopConfig, Contact, Vec3 } from "@/lib/standex/magnetic-workshop";
import "./workshop.css";
import { COFFEE_ASSEMBLY } from "@/lib/standex/machine-assembly";
import type { MachineAssembly } from "@/lib/standex/machine-assembly";
import type { MachineAsset } from "@/lib/standex/machine-assets";
import type { MachineTool } from "./machine-scene";
import type { TestedPair } from "@/lib/leadmagnet/tested-pairs";
import MachineControls from "./machine-controls";
import FlatScene from "./flat-scene";
import SensorCatalog from "./sensor-catalog";
import ContactIndicator from "./contact-indicator";
import { SensorPlan } from "./sensor-plan";
import { sensorById, sizeLabel, sensorSource } from "@/lib/standex/sensor-catalog";

/** Pas de lecture : 80 pas × 50 ms = 4 s (normal), 240 pas = 12 s (lent). */
const CYCLE_STEPS_NORMAL = 80;
const CYCLE_STEPS_SLOW = 240;
const CYCLE_SECONDS_NORMAL = (CYCLE_STEPS_NORMAL * 50) / 1000;
const Scene = lazy(() => import("./scene"));
const MachineScene = lazy(() => import("./machine-scene"));
/* i18n-canonical : libellés stockés en français, traduits au rendu par t(). */
const contactLabel: Record<Contact, string> = {
  open: "Contact ouvert",
  closed: "Contact fermé",
  unknown: "État indéterminé",
};
const motionLabels = { approach: "Approche et retrait", slide: "Passage latéral", pivot: "Pivot" };
/** Libellés des approches publiées. F1 est frontale : distance ENTRE LES FACES. */
const APPROACH_LABELS: Record<WorkshopConfig["geometry"], string> = {
  D1: "D1 · face au centre",
  D3: "D3 · par l'extrémité",
  F1: "F1 · faces en vis-à-vis, dans l'axe",
};

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
  embedded?: boolean;
  initialStudy?: StudioStudy | null | undefined;
  onStudyChange?: ((study: StudioStudy, freeze: DesignFreeze | null) => void) | undefined;
  dossierId?: string | undefined;
  revision?: number | undefined;
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
  /** « Voir le résultat » : ferme l'atelier et ouvre l'écran Résultat.
   * Le verdict remonté est celui du moteur guidé, jamais recalculé ailleurs. */
  onResult?: (result: TestedPair) => void;
  /** Demande d'essai réel : cochée dans le dossier par l'espace projet. */
  onRequestTrial?: (result: TestedPair) => void;
  /** État d'enregistrement, remonté pour être affiché par la barre du panneau. */
  onSaveState?: (state: "saved" | "saving" | "draft") => void;
}
export default function MagneticWorkshop({
  embedded = false,
  initialStudy,
  onStudyChange,
  dossierId,
  revision,
  initialConfig,
  onClose,
  onSave,
  storageLabel = t("la session et le projet"),
  storageMode = "local-device",
  cableRouting,
  onDraftChange,
  onResult,
  onRequestTrial,
  onSaveState,
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
  const [progress, setProgress] = useState(0),
    [playing, setPlaying] = useState(false);
  const [view, setView] = useState<"3d" | "top">("3d"),
    [zones, setZones] = useState(true),
    [field, setField] = useState(false),
    [xray, setXray] = useState(true),
    // Les cotes de corps se superposaient aux noms : elles restent disponibles
    // dans « Affichage », mais décochées par défaut.
    [dimensions, setDimensions] = useState(false),
    [showNames, setShowNames] = useState(true),
    [focus, setFocus] = useState<"assembly" | "sensor">("assembly"),
    [catalogOpen, setCatalogOpen] = useState(false);
  /** Vitesse de lecture. Par défaut un aller-retour dure 4 s : la lecture
   * ralentie reste disponible dans les réglages avancés, elle ne disparaît pas. */
  const [playbackSpeed, setPlaybackSpeed] = useState<"normal" | "slow">("normal");
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
  /** Lecture « montage guidé » recalculée à chaque changement d'entrée : un verdict
   * n'est jamais conservé ni importé, il est toujours recalculé ici. */
  const guided = useGuidedMounting(config);
  /** Prévisualisation de pose : état séparé, jamais écrit dans la configuration.
   * Une proposition devenue obsolète (autres entrées modifiées) est abandonnée. */
  const [preview, setPreview] = useState<GuidedMounting | null>(null);
  const ghost = useMemo(() => {
    if (!preview) return null;
    const size = magnetSize(config);
    const axis = preview.relative.positionMm.map((v) =>
      Math.abs(v) > 0 ? Math.sign(v) : 0,
    ) as Vec3;
    return machine
      ? {
          positionMm: magnetWorldPosition(preview, preview.relative),
          rotationDeg: composeRotations(preview.anchor.rotationDeg, preview.relative.rotationDeg),
          axis,
          sizeMm: size,
          gapMm: Math.hypot(...preview.relative.positionMm),
          originMm: preview.anchor.positionMm,
        }
      : {
          positionMm: preview.relative.positionMm,
          rotationDeg: preview.relative.rotationDeg,
          axis,
          sizeMm: size,
          gapMm: Math.hypot(...preview.relative.positionMm),
          originMm: [0, 0, 0] as Vec3,
        };
  }, [preview, config, machine]);
  useEffect(() => {
    // La proposition ne survit pas à un changement d'entrée ni de contexte.
    setPreview(null);
  }, [config.sensorId, config.magnetModel, config.sensitivity, config.geometry, config.mode]);
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
        if (!cancelled) setAssetError(e instanceof Error ? e.message : t("Fichier 3D illisible."));
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
      // Un vrai capteur garde son couple documenté : il ne bascule jamais
      // d'office dans le modèle fictif.
      mode: "reference",
      sensorId: "MK24-A-J",
      magnetModel: defaultMagnetFor("MK24-A-J"),
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
        mode: "reference",
        magnetModel: defaultMagnetFor(config.sensorId),
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
      setError(e instanceof Error ? e.message : t("Import impossible."));
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
  /** Résultat affiché : l'état de contact vient TOUJOURS du même moteur que le
   * verdict, quel que soit le mode. Deux régimes, jamais mélangés :
   *
   * - QUALIFIÉ (`covered`) : l'état vient des distances publiées du couple. Hors
   *   couverture, la scène affiche « inconnu » : jamais de vert par une autre
   *   source.
   * - ILLUSTRATIF (`sim.illustrative`) : aucune distance exploitable, le moteur
   *   fait commuter à proximité pour que la scène raconte quelque chose. Ces
   *   échantillons ont `covered === false` PAR DESIGN — les filtrer revenait à
   *   laisser la scène, la lampe et la chronologie éternellement indéterminées.
   *   L'état est donc rendu tel quel, et rien d'autre ne bouge : la couverture,
   *   la preuve, le verdict et le message permanent « Simulation illustrative »
   *   restent ceux du moteur.
   * La proximité illustrative est lue sur la pose RÉELLEMENT DESSINÉE, fournie
   * par `scenePoseSampler` : modèle importé animé par sa propre course, ou
   * glissement/pivot de l'espace vide. Sans lui, l'état commutait sur un axe
   * reconstruit qui ignore le mouvement, donc un aimant emporté à 100 mm de côté
   * pouvait s'afficher fermé.
   *
   * Les positions issues de `simulateCycle` sont conservées pour l'animation du
   * modèle importé. */
  const guidedSim = useMemo(
    () => simulateMounting(guided, SAMPLE_STEPS, undefined, scenePoseSampler(config)),
    [guided, config],
  );

  const result = useMemo(() => {
    const raw = simulateCycle(config);
    const last = guidedSim.samples.length - 1;
    const samples = raw.samples.map((s) => {
      const g = guidedSim.samples[Math.min(last, Math.round(s.t * last))]!;
      const shown = g.covered || guidedSim.illustrative ? g.contact : "unknown";
      return { ...s, contact: shown as Contact };
    });
    // Les transitions et les comptages doivent découler des MÊMES échantillons
    // que la scène et le verdict : sinon la chronologie affiche des
    // ouvertures/fermetures issues du modèle pédagogique alors que le contact
    // réel est indéterminé.
    const transitions: typeof raw.transitions = [];
    let closures = 0,
      releases = 0;
    for (let i = 1; i < samples.length; i++) {
      const prev = samples[i - 1]!,
        cur = samples[i]!;
      if (cur.contact === prev.contact) continue;
      transitions.push({ t: cur.t, contact: cur.contact, distance: cur.distance });
      if (prev.contact === "open" && cur.contact === "closed") closures++;
      if (prev.contact === "closed" && cur.contact === "open") releases++;
    }
    return {
      ...raw,
      samples,
      transitions,
      closures,
      releases,
      unknown: raw.unknown || guidedSim.coverage !== "covered",
    };
  }, [config, guidedSim]);
  const sample =
    result.samples[
      Math.min(result.samples.length - 1, Math.round(progress * (result.samples.length - 1)))
    ]!;
  const reference = config.mode === "reference",
    unit = " mm";
  /** Origine réelle des distances affichées : données publiées pour CE couple,
   * absence de données, ou démonstration explicitement fictive. */
  const basis = distanceBasis(config),
    fictitious = isFictitiousSensor(config.sensorId);
  const basisLabel =
    basis === "standex"
      ? t("Données Standex · distances publiées pour ce couple")
      : basis === "unavailable"
        ? t("Distances non renseignées pour ce couple")
        : t("Démonstration · distances fictives");
  /** Classes réellement publiées pour le couple : aucune interpolation. */
  const sensitivityChoices = publishedClasses(config.sensorId, config.magnetModel);
  /** Nature de la colonne publiée : classe de sensibilité ou modèle de contact. */
  const classKind = publishedClassKind(config.sensorId, config.magnetModel);
  /** Lignes publiées du couple, y compris les modèles de contact non simulés. */
  const publishedRows = publishedRowsForCouple(config.sensorId, config.magnetModel);
  const approachOptions = approachChoicesFor(config.sensorId, config.magnetModel);
  const magnetChoices = magnetOptionsFor(config.sensorId);
  const magnetAlias = documentedAlias(config.magnetModel);

  const summary = useMemo(() => summarizeWorkshop(config), [config]);
  const fingerprint = JSON.stringify(config),
    dirty = saved !== fingerprint;
  const referencePair = workshopPair(config);
  const pull = referencePair?.[0] ?? "—",
    drop = referencePair?.[1] ?? "—";
  const unknown = result.unknown;
  const machineReady = !machine || !!machineAsset?.nodes.some((n) => n.path === machine.movingNode);

  useEffect(() => {
    if (!playing) return;
    // 50 ms par pas : 80 pas = 4 s pour un aller-retour, 240 pas en lecture lente.
    const steps = playbackSpeed === "normal" ? CYCLE_STEPS_NORMAL : CYCLE_STEPS_SLOW;
    const timer = setInterval(() => setProgress((v) => Math.min(1, v + 1 / steps)), 50);
    return () => clearInterval(timer);
  }, [playing, playbackSpeed]);
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
            // Le point de départ documentaire garde le capteur choisi : il ne
            // rebascule jamais sur MK03.
            magnetModel: defaultMagnetFor(config.sensorId),
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
  }
  /** Sélection réelle d'un capteur : une seule logique centrale, partagée avec
   * l'espace de conception. */
  function selectSensor(sensorId: string) {
    update(applySensorSelection(config, sensorId));
  }

  async function save() {
    setSaving(true);
    setError(null);
    const snapshot = { ...config };
    try {
      await onSave(snapshot);
      setSaved(JSON.stringify(snapshot));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Le montage n'a pas pu être enregistré."));
    } finally {
      setSaving(false);
    }
  }
  async function importFile(file: File | undefined) {
    if (!file) return;
    try {
      if (file.size > 20000) throw new Error(t("Le fichier de montage est trop volumineux."));
      const parsed = parseWorkshopConfig(JSON.parse(await file.text()));
      if (!parsed)
        throw new Error(t("Ce fichier ne contient pas un montage valide (V1, V2 ou V3)."));
      setPlaying(false);
      setProgress(0);
      setConfig(parsed);
      setSaved(null);
      setError(null);
      setImportNotice(t("Montage importé. Il est enregistré automatiquement dans votre projet."));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Fichier illisible."));
    }
    if (fileRef.current) fileRef.current.value = "";
  }
  // Hors couverture, le résumé reprend mot pour mot le message du moteur :
  // aucune reformulation locale ne doit s'y substituer.
  const statusMessage =
    guidedSim.coverage !== "covered" && guided.computed
      ? t(guided.computed.mainMessage)
      : (result.reason ??
        (unknown
          ? t("Une partie du parcours ne peut pas être déterminée avec ces paramètres.")
          : result.closures === 0
            ? t(
                "Aucun nouvel enclenchement sur ce cycle. Essayez une autre position ou rapprochez l'aimant.",
              )
            : result.closures > 1
              ? t(
                  "Plusieurs enclenchements sur un aller-retour. Vérifiez s'ils correspondent au comportement recherché.",
                )
              : t("Un enclenchement et un retour à vérifier dans votre montage réel.")));

  /* ---------------------------------------------------------------- */
  /* Ouverture : le couple est déjà choisi, l'aimant est déjà posé.    */
  /* ---------------------------------------------------------------- */
  const openedRef = useRef(false);
  /** Bouton de lecture : c'est le premier geste attendu, il reçoit le focus à
   *  l'ouverture — ce qui remonte aussi la fenêtre en haut de l'atelier. */
  const playRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (openedRef.current) return;
    openedRef.current = true;
    // L'atelier s'ouvre en haut : bandeau de verdict et scène d'abord, jamais
    // la chronologie ni le pied de page.
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
    requestAnimationFrame(() => {
      for (const node of document.querySelectorAll<HTMLElement>("[data-workshop-scroll]"))
        node.scrollTop = 0;
      playRef.current?.focus({ preventScroll: true });
    });
    // Cadrage sur le COUPLE entier : capteur ET aimant dans l'image. Un cadrage
    // sur le seul capteur laissait l'aimant hors champ à l'ouverture.
    setFocus("assembly");
    // La démonstration à distances fictives n'est jamais un point de départ
    // pour un vrai capteur : elle reste réservée aux références fictives.
    if (!isFictitiousSensor(config.sensorId) && config.mode !== "reference") {
      setConfig((c) => ({ ...c, mode: "reference" }));
      return;
    }
    // Un montage déjà enregistré n'est pas réécrit : on ne pose l'aimant que
    // sur un montage neuf dont la pose n'est pas déjà sur le gabarit publié.
    if (saved !== null) return;
    if (guided.computed?.coverage === "covered") return;
    const proposal = suggestPose(guided);
    if (!proposal.ok) return;
    const applied = applySuggestion(guided, proposal.suggestion);
    if (applied.ok) setConfig((c) => ({ ...c, ...workshopPatchFromMounting(applied.mounting, c) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Enregistrement automatique du montage dans le dossier (debounce 800 ms).
     Il emprunte EXACTEMENT le chemin de « Joindre au dossier » : aucune autre
     écriture, aucun envoi. */
  useEffect(() => {
    if (!dirty || saving) return;
    const id = setTimeout(() => void save(), 800);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint, dirty, saving]);
  useEffect(() => {
    onSaveState?.(saving ? "saving" : dirty ? "draft" : "saved");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saving, dirty]);

  /* ---------------------------------------------------------------- */
  /* Bandeau de verdict                                               */
  /* ---------------------------------------------------------------- */
  const computed = guided.computed;
  /** Quatre situations distinctes, jamais confondues : détection prévue,
   *  absence de détection sur ce cycle, pose hors gabarit, couple sans table
   *  publiée. Le nom du couple n'emprunte jamais les seuils d'un autre. */
  const verdictKind: "expected" | "none" | "undocumented" | "unpublished" =
    basis === "unavailable"
      ? "unpublished"
      : computed && computed.coverage === "covered" && computed.evidence !== "uncharacterised"
        ? computed.verdict === "expected"
          ? "expected"
          : "none"
        : "undocumented";
  const verdictSentence =
    verdictKind === "expected"
      ? msg("Détection prévue — ferme à {0} mm, ouvre à {1} mm", [pull, drop])
      : verdictKind === "none"
        ? t("Pas de détection sur ce cycle — rapprochez l'aimant ou changez de couple")
        : verdictKind === "undocumented"
          ? t("Position non documentée — Standex peut la mesurer pour vous")
          : t("Distances non publiées pour ce couple — Standex peut les mesurer");
  const askTrial = verdictKind === "undocumented" || verdictKind === "unpublished";
  /** Commutation ILLUSTRATIVE : le contact bascule à proximité pour que la scène
   *  reste lisible, mais aucune distance n'est caractérisée. La mention est
   *  PERMANENTE tant que ce mode est actif, et elle suit l'essai enregistré. */
  // La source d'affichage est la simulation de la SCÈNE (pose réellement
  // dessinée) ; le résultat enregistré porte la même marque.
  const illustrative = guidedSim.illustrative === true || computed?.illustrative === true;
  

  /** Essai à conserver dans le dossier : verdict, distances PUBLIÉES (ou `null`)
   *  et course déclarée. Rien n'est recalculé ni arrondi ici. */
  const testedPair = (): TestedPair => ({
    sensorId: config.sensorId,
    magnetId: config.magnetModel,
    approach: config.geometry,
    sensitivity: config.sensitivity ?? null,
    verdict: verdictKind,
    pullInMm: referencePair ? referencePair[0] : null,
    dropOutMm: referencePair ? referencePair[1] : null,
    travelStartMm: config.start,
    travelEndMm: config.end,
    mainMessage: computed && computed.coverage !== "covered" ? computed.mainMessage : null,
    limits: computed ? computed.limits : [],
    // Jamais un résultat validé : le mode illustratif est écrit dans l'essai,
    // donc dans le résumé, la reprise et les exports.
    ...(illustrative ? { illustrative: true as const } : {}),
    at: new Date().toISOString(),
  });

  const verdictBanner = (
    <div
      className={"mw-verdict-bar mw-verdict-bar-" + verdictKind}
      role="status"
      data-testid="verdict-bar"
    >
      <span className="mw-verdict-dot" aria-hidden="true" />
      <div className="mw-verdict-bar-text">
        <p className="t-title-s">{verdictSentence}</p>
        {computed ? (
          <p className="t-caption">
            {t(COVERAGE_LABEL[computed.coverage])} · {t(EVIDENCE_LABEL[computed.evidence])}
          </p>
        ) : null}
        {/* Hors couverture, le message du moteur est repris MOT POUR MOT. */}
        {computed && computed.coverage !== "covered" ? (
          <p className="t-caption" data-testid="verdict-main-message">
            {t(computed.mainMessage)}
          </p>
        ) : (
          <p className="t-caption">{t(statusMessage)}</p>
        )}
        {/* Mention PERMANENTE du mode illustratif : elle ne se replie pas et ne
            disparaît pas pendant la lecture. */}
        {illustrative ? (
          <p className="notice-warning t-body-s" data-testid="illustrative-note">
            {t("Simulation illustrative — distance non caractérisée, à valider par essais")}
          </p>
        ) : null}
      </div>
      {askTrial && onRequestTrial ? (
        <button
          className="mw-button mw-secondary"
          onClick={() => onRequestTrial(testedPair())}
          data-testid="ask-trial"
        >
          {t("Demander un essai")}
        </button>
      ) : null}
      {computed ? (
        <details className="mw-verdict-limits">
          <summary>{t("Valeurs typiques Standex · Ce que ce résultat ne dit pas ⌄")}</summary>
          <ul className="mw-verdict-reasons">
            {computed.limits.map((l) => (
              <li key={l}>{t(LIMIT_LABEL[l] ?? l)}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );

  /* ---------------------------------------------------------------- */
  /* Colonne de gauche : trois réglages                               */
  /* ---------------------------------------------------------------- */
  /* i18n-canonical : libellés stockés en français, traduits au rendu par t(). */
  const APPROACH_CHOICES = [
    { id: "D1" as const, label: "Parallèle", path: "M4 6h16M4 18h16" },
    { id: "D3" as const, label: "Perpendiculaire", path: "M12 3v8M4 16h16" },
    { id: "F1" as const, label: "Face à face", path: "M4 12h6M14 12h6M10 7v10M14 7v10" },
  ];
  /** Approches réellement publiées pour CE couple. En démonstration fictive les
   *  deux approches latérales restent disponibles pour l'illustration. */
  const availableApproaches: readonly WorkshopConfig["geometry"][] =
    approachOptions.length && reference ? approachOptions : (["D1", "D3"] as const);

  const approachPicker = (
    <div className="mw-approach">
      <p className="t-label">{t("Position de l'aimant")}</p>
      <div className="mw-approach-row">
        {APPROACH_CHOICES.map((a) => {
          const available = availableApproaches.includes(a.id);
          return (
            <button
              key={a.id}
              type="button"
              className="mw-approach-button"
              aria-pressed={config.geometry === a.id}
              disabled={!available}
              title={available ? t(APPROACH_LABELS[a.id]) : t("Non documentée pour ce couple")}
              onClick={() =>
                update({ geometry: a.id, magnetAngle: documentedMagnetAngleDeg(a.id) })
              }
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d={a.path} />
              </svg>
              <span>{t(a.label)}</span>
            </button>
          );
        })}
      </div>
      <p className="t-caption">
        {t(
          "Positions documentées par Standex. Toute autre position sera signalée comme à mesurer.",
        )}
      </p>
    </div>
  );

  const travelControls = (
    <div className="mw-travel">
      <Range
        label={t("Position ouverte")}
        value={config.start}
        min={2}
        max={60}
        step={0.5}
        unit={unit}
        onChange={(start) => update({ start })}
      />
      <Range
        label={t("Position fermée")}
        value={config.end}
        min={1}
        max={59}
        step={0.5}
        unit={unit}
        onChange={(end) => update({ end })}
      />
    </div>
  );

  const playButton = (
    <button
      ref={playRef}
      className="mw-button mw-wide mw-run"
      disabled={!machineReady}
      aria-pressed={playing}
      onClick={() => {
        if (progress >= 1) setProgress(0);
        setPlaying(!playing);
      }}
    >
      {playing ? <Pause size={17} /> : <Play size={17} />}
      {t(playing ? "Pause" : "Lancer le mouvement")}
    </button>
  );

  /* Réglages avancés : RIEN n'est supprimé, tout est replié ici. */
  const advancedSettings = (
    <details className="mw-advanced-settings" data-testid="workshop-advanced">
      <summary>{t("Réglages avancés ⌄")}</summary>
      <div className="mw-advanced-body">
        {/* Point de départ documentaire : le mode fictif n'est proposé que pour
            les références explicitement fictives (GENERIC / CUSTOM). */}
        {fictitious && !machine && (
          <div className="mw-start">
            <label htmlFor="mw-mode">{t("Votre point de départ")}</label>
            <select
              id="mw-mode"
              value={config.mode}
              onChange={(e) => chooseMode(e.target.value as WorkshopConfig["mode"])}
            >
              <option value="reference">
                {t(
                  basis === "standex"
                    ? "Données Standex"
                    : "Distances non renseignées pour ce couple",
                )}
              </option>
              <option value="education">{t("Démonstration · distances fictives")}</option>
            </select>
            <p>{reference ? basisLabel : t("Forme cotée · champ et seuils fictifs")}</p>
          </div>
        )}
        <div className="mw-selected-sensor surface-interactive">
          <svg viewBox="-38 -17 76 34" aria-hidden="true">
            <SensorPlan model={sensor} xray={false} />
          </svg>
          <strong className="t-title-s">{t(sensor.name)}</strong>
          <span className="t-metric">{t(sizeLabel(sensor))}</span>
          <button className="mw-product-card-button" onClick={() => setProductCard(true)}>
            <Info size={16} />
            {t("Découvrir ce capteur")}
          </button>
          <button className="mw-button mw-secondary mw-wide" onClick={() => setCatalogOpen(true)}>
            {t("Voir les capteurs")}
          </button>
          {sensorSource(sensor) && (
            <a href={sensorSource(sensor)!} target="_blank" rel="noreferrer">
              {t("Voir la fiche et le plan Standex ↗")}
            </a>
          )}
        </div>
        {sensor.note && <p className="mw-help">{t(sensor.note)}</p>}
        <div className="mw-product">
          <span className="mw-product-icon">
            <Magnet size={25} />
          </span>
          <div>
            <strong>
              {pairedMagnetModel(config.magnetModel, config.sensorId)?.name ?? t("Aimant fictif")}
            </strong>
            <span>{reference ? basisLabel : t("Modèle idéal de dipôle dans l'air")}</span>
            {magnetAlias && (
              <span className="t-caption">
                {msg("Correspondance documentaire : {0}", [magnetAlias])}
              </span>
            )}
          </div>
        </div>
        <label className="mw-select-label">
          {t("Aimant")}
          <select
            value={config.magnetModel}
            onChange={(e) => update({ magnetModel: e.target.value })}
          >
            {fictitious && <option value="generic">{t("Aimant fictif")}</option>}
            {magnetChoices.map((id) => (
              <option key={id} value={id}>
                {pairedMagnetModel(id, config.sensorId)?.name ?? t(id)}
              </option>
            ))}
          </select>
        </label>
        {/* Le matériau choisi ici sélectionne une VRAIE référence du guide
            d'activation : la géométrie 3D, les cotes et les plages affichées
            changent ensemble, sans facteur de matériau inventé. */}
        <GuideMaterials
          sensorFamily={config.sensorId}
          magnetModel={config.magnetModel}
          onSelect={(magnetModel) => update({ magnetModel })}
        />
        {reference && sensitivityChoices.length > 0 && (
          <label className="mw-select-label">
            {t(classKind === "switch_model" ? "Configuration du contact" : "Classe de sensibilité")}
            <select
              value={config.sensitivity}
              onChange={(e) =>
                update({ sensitivity: e.target.value as WorkshopConfig["sensitivity"] })
              }
            >
              {sensitivityChoices.map((x) => (
                <option key={x} value={x}>
                  {classKind === "switch_model" ? x : msg("Classe {0}", [x])}
                </option>
              ))}
            </select>
          </label>
        )}
        {reference && publishedRows.length > 0 && (
          <details className="panel-block" data-testid="published-rows">
            <summary className="t-label">{t("Distances publiées (B–E, D1–D5)")}</summary>
            <table className="mw-published-table">
              <thead>
                <tr>
                  <th scope="col">
                    {t(
                      classKind === "switch_model"
                        ? "Configuration du contact"
                        : "Classe de sensibilité",
                    )}
                  </th>
                  <th scope="col">{t("Approche")}</th>
                  <th scope="col">
                    {t(
                      publishedRows[0]!.thresholdKind === "min_activation_max_release"
                        ? "Min Activation"
                        : "Enclenchement",
                    )}
                  </th>
                  <th scope="col">
                    {t(
                      publishedRows[0]!.thresholdKind === "min_activation_max_release"
                        ? "Max Release"
                        : "Relâchement",
                    )}
                  </th>
                </tr>
              </thead>
              <tbody>
                {publishedRows.map((r) => (
                  <tr key={r.id} aria-current={r.sensitivityClass === config.sensitivity}>
                    <td>
                      {r.sensitivityClass}
                      {r.contactForm !== "1A" && <span className="mw-kind">{t("non simulé")}</span>}
                    </td>
                    <td>{r.approachId}</td>
                    <td className="t-metric">{r.pullInMm.toString() + unit}</td>
                    <td className="t-metric">{r.dropOutMm.toString() + unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mw-help">{t(referenceNoteFor(config))}</p>
            {publishedFamilyNoteFor(config) && (
              <p className="mw-help" data-testid="published-family-note">
                {t(publishedFamilyNoteFor(config)!)}
              </p>
            )}
            {(publishedRowsSourceUrl(publishedRows) ?? magnetSource(config.magnetModel)) && (
              <a
                href={(publishedRowsSourceUrl(publishedRows) ?? magnetSource(config.magnetModel))!}
                target="_blank"
                rel="noreferrer"
              >
                {t("Voir la source des distances ↗")}
              </a>
            )}
          </details>
        )}
        <SensitivityComparison config={config} />
        <GuidedSuggestion
          config={config}
          update={update}
          preview={preview}
          onPreview={setPreview}
        />
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
        <details>
          <summary>{t("Orientation de l'aimant")}</summary>
          <label className="mw-select-label">
            {t("Approche du capteur")}
            <select
              value={config.geometry}
              onChange={(e) => {
                const geometry = e.target.value as WorkshopConfig["geometry"];
                update({ geometry, magnetAngle: documentedMagnetAngleDeg(geometry) });
              }}
            >
              {availableApproaches.map((a) => (
                <option key={a} value={a}>
                  {t(APPROACH_LABELS[a])}
                </option>
              ))}
            </select>
          </label>
          <p className="mw-help">
            {t(
              reference
                ? config.geometry === "F1"
                  ? "Table Standex, faces en vis-à-vis (aimant à 180°). Modifier l'orientation passe en démonstration fictive."
                  : "Table Standex, axes parallèles. Modifier l'orientation passe en démonstration fictive."
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
                orientMagnet({ magnetization: e.target.value as WorkshopConfig["magnetization"] })
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
            <>
              <Range
                label={t("Orientation propre du reed")}
                value={config.sensorAngle}
                min={-180}
                max={180}
                step={15}
                unit="°"
                onChange={(sensorAngle) => update({ sensorAngle })}
              />
              <Range
                label={t("Décalage par rapport au centre")}
                value={config.lateralShift}
                min={-50}
                max={50}
                unit=" mm"
                onChange={(lateralShift) => update({ lateralShift })}
              />
            </>
          )}
          <p className="mw-help">
            {t(
              "Une rotation de 90° change le couplage et les lobes. Inverser N/S seul ne change pas l'activation d'un reed Form A non polarisé. Un axe mal placé peut laisser le contact ouvert.",
            )}
          </p>
          <a href={INTERACTION_SOURCE} target="_blank" rel="noreferrer">
            {t("Comprendre avec les schémas Standex ↗")}
          </a>
        </details>
        <details>
          <summary>{t("Trajectoire")}</summary>
          {machine ? (
            <p className="mw-help">
              {t(
                "Le mouvement vient de votre fichier : il se règle avec les attaches, le nœud mobile et la course.",
              )}
            </p>
          ) : (
            <>
              <label className="mw-select-label">
                {t("Trajectoire")}
                <select
                  value={reference ? "approach" : config.motion}
                  disabled={reference}
                  onChange={(e) => update({ motion: e.target.value as WorkshopConfig["motion"] })}
                >
                  {Object.entries(motionLabels).map(([v, l]) => (
                    <option key={v} value={v}>
                      {t(l)}
                    </option>
                  ))}
                </select>
              </label>
              {!reference && config.motion !== "approach" && (
                <>
                  <Range
                    label={t(config.motion === "slide" ? "Décalage du passage" : "Rayon du pivot")}
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
            </>
          )}
        </details>
        <details>
          <summary>{t("Comportement recherché")}</summary>
          <p className="mw-help">
            {t("Je souhaite que le contact soit fermé sur cette portion du cycle aller-retour.")}
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
        <label className="mw-select-label">
          {t("Vitesse de lecture")}
          <select
            value={playbackSpeed}
            onChange={(e) => setPlaybackSpeed(e.target.value as "normal" | "slow")}
          >
            <option value="normal">{t("Normale")}</option>
            <option value="slow">{t("Lente")}</option>
          </select>
        </label>
        {/* Longueur retenue : réellement modifiable et enregistrée avec le
            montage. Le configurateur de câble complet vit dans « Avec Standex ». */}
        <label className="mw-select-label">
          {t("Longueur de câble retenue")}
          <input
            type="number"
            min={1}
            step={10}
            inputMode="numeric"
            className="t-metric"
            placeholder={t("Non choisie")}
            value={config.cableLengthMm ?? ""}
            onChange={(e) => {
              const v = e.target.value.trim();
              if (v === "") return update({ cableLengthMm: null });
              const n = Number(v);
              if (Number.isFinite(n) && n > 0 && n <= 100000) update({ cableLengthMm: n });
            }}
          />
        </label>
        {cableRouting && (
          <button
            className="mw-button mw-secondary mw-wide"
            aria-pressed={tool === "cable"}
            data-testid="cable-tool-toggle"
            onClick={() => chooseTool(tool === "cable" ? "navigate" : "cable")}
          >
            {t(tool === "cable" ? "Arrêter le pointage" : "Pointer le câble dans la 3D")}
          </button>
        )}
        <GuidedVerdict
          mounting={guided}
          onFixCoverage={() =>
            // Retour au gabarit publié : l'axe du capteur revient explicitement
            // à 0. La course, le besoin et les contraintes ne sont pas touchés.
            update({ sensorAngle: 0, magnetAngle: 0, magnetTilt: 0, lateralShift: 0 })
          }
        />
        {machine && (
          <MachineControls
            config={config}
            asset={machineAsset}
            tool={tool}
            setTool={chooseTool}
            onChange={machineChange}
            onExample={exampleMachine}
            onExit={() => update({ machine: null })}
            onCatalog={() => setCatalogOpen(true)}
            onProductCard={() => setProductCard(true)}
            measure={measure}
          />
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
        {fictitious && (
          <div className="mw-demo-settings">
            <p>
              {t("Les matériaux et la température n'interviennent pas dans ce calcul.")}{" "}
              {sensor.id === "MK02"
                ? t(
                    "Le MK02 est représenté avec un contact Form A fictif : son mécanisme ferreux réel n'est pas simulé.",
                  )
                : null}
            </p>
            <Range
              label={t("Échelle du champ fictif")}
              value={config.demoReach}
              min={5}
              max={100}
              unit=" mm"
              onChange={(demoReach) => update({ demoReach })}
            />
            {!machine && (
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
          </div>
        )}
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
        <details className="mw-export-menu">
          <summary>{t("Exporter le montage")}</summary>
          <button
            className="mw-text-button"
            onClick={() =>
              download(
                "montage-magnetique.json",
                JSON.stringify(config, null, 2),
                "application/json",
              )
            }
          >
            {t("Télécharger le fichier de montage")}
          </button>
        </details>
      </div>
    </details>
  );

  /* Menu « Affichage » : les calques, la légende et le schéma de contact. */
  const displayMenu = (
    <details className="mw-display-menu" data-testid="display-menu">
      <summary>{t("Affichage ⌄")}</summary>
      <div className="mw-display-body">
        <label>
          <input type="checkbox" checked={xray} onChange={(e) => setXray(e.target.checked)} />
          {t("Voir les contacts")}
        </label>
        <label>
          <input
            type="checkbox"
            checked={showNames}
            onChange={(e) => setShowNames(e.target.checked)}
          />
          {t("Nom capteur")}
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
              <input type="checkbox" checked={zones} onChange={(e) => setZones(e.target.checked)} />
              {t("Colorer le parcours")}
            </label>
          </>
        )}
        <button
          className="mw-text-button"
          onClick={() => {
            setFocus("assembly");
            setResetEpoch((v) => v + 1);
          }}
        >
          {t("Recadrer")}
        </button>
        <details>
          <summary>{t("Voir le schéma du contact")}</summary>
          <ContactIndicator contact={sample.contact} />
        </details>
        <span className="t-caption">
          {t("Quadrillage :")}
          {t(machine ? "10" : "5")}
          {t("mm · Vert : fermé · Gris : ouvert · Vue simplifiée du contact")}
        </span>
      </div>
    </details>
  );

  return (
    <main className="mw mw-stage immersive" aria-label={t("Atelier 3D")}>
      {productCard && (
        <SensorCard
          key={sensor.id}
          sensorId={sensor.id}
          contact={sample.contact}
          onClose={() => setProductCard(false)}
        />
      )}
      {!embedded && (
        <AppHeader
          context={t("Atelier 3D")}
          back={{ label: t("Retour au projet"), onClick: onClose, disabled: saving }}
        >
          <span className="mw-prototype">{t("Prototype interne · V0.4")}</span>
        </AppHeader>
      )}
      {(error || importNotice) && (
        <div className={error ? "mw-alert" : "mw-notice"} role={error ? "alert" : "status"}>
          {t(error ?? importNotice)}
        </div>
      )}
      <div className="mw-stage-grid">
        <aside className="mw-controls">
          {approachPicker}
          {travelControls}
          {playButton}
          <div className="mw-controls-links">
            <label className="mw-file-label">
              {machine ? machine.fileName : t("Importer mon modèle 3D")}
              <input
                type="file"
                accept=".glb,model/gltf-binary"
                onChange={(e) => {
                  void importMachine(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
            <details>
              <summary>{t("Exemple : machine à café")}</summary>
              <button className="mw-button mw-secondary" onClick={exampleMachine}>
                {t("Ouvrir la machine à café")}
              </button>
              <a href="/models/machine-cafe-bac-mobile.glb" download>
                {t("Télécharger le fichier 3D")}
              </a>
            </details>
            {advancedSettings}
          </div>
        </aside>
        <section className="mw-main" aria-label={t("Simulation du montage")}>
          {verdictBanner}
          <div
            className="mw-canvas"
            role="img"
            aria-label={msg("Montage {0}. {1}.", [
              machine
                ? machine.fileName
                : reference
                  ? t(config.geometry)
                  : t(motionLabels[config.motion]),
              t(contactLabel[sample.contact]),
            ])}
          >
            <div className="mw-scene-tools">
              {/* La source des distances est portée par le bandeau de verdict.
                  Elle n'est répétée sur la scène que pour une référence
                  fictive, où l'avertissement doit rester sous les yeux. */}
              {basis === "fictitious" ? (
                <span className="mw-kind education">{basisLabel}</span>
              ) : null}
              <div className="mw-view-switch">
                <button aria-pressed={view === "3d"} onClick={request3d}>
                  3D
                </button>
                <button aria-pressed={view === "top"} onClick={() => setView("top")}>
                  {t("Vue plane")}
                </button>
              </div>
              {displayMenu}
            </div>
            {/* Outil de pointage du câble : seulement quand le pointage est
                réellement actif. Les trajets existants restent intacts. */}
            {cableRouting && tool === "cable" ? (
              <div className="mw-cable-panel" data-testid="cable-routing-panel">
                <div className="mw-cable-row">
                  <strong>{t("Tracé du câble")}</strong>
                  <span>{t(cableRouting.targetLabel)}</span>
                  <button
                    className="mw-text-button"
                    aria-pressed={tool === "cable"}
                    onClick={() => chooseTool("navigate")}
                  >
                    {t("Arrêter le pointage")}
                  </button>
                </div>
                <div className="mw-cable-row">
                  {(
                    [
                      ["sensor", t("Sortie capteur")],
                      ["waypoint", t("Point de passage")],
                      ["connection", t("Point de connexion")],
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
                <p className="mw-cable-note" data-testid="cable-length">
                  {t(cableRouting.lengthLabel)}
                </p>
              </div>
            ) : null}
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
                  fallback={<div className="mw-loading">{t("La scène 3D a été interrompue.")}</div>}
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
                      showNames={showNames}
                      reduced={reduced}
                      onChange={machineChange}
                      onMeasure={setMeasure}
                      onPlaced={() => setTool("navigate")}
                      onContextLost={failed3d}
                      ghost={ghost}
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
                showNames={showNames}
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
                      showNames={showNames}
                      zones={zones}
                      focus={focus}
                    />
                  </div>
                }
              >
                <Suspense
                  fallback={<div className="mw-loading">{t("Préparation de votre montage…")}</div>}
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
                    showNames={showNames}
                    focus={focus}
                    reduced={reduced}
                    ghost={ghost}
                  />
                </Suspense>
              </SceneBoundary>
            )}
            <div className={`mw-live-state ${sample.contact}`}>
              <span />
              {t(contactLabel[sample.contact])}
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
          {/* Chronologie du cycle : mêmes échantillons que la scène et le verdict. */}
          <div className="mw-cycle" aria-label={t("Chronologie du cycle")}>
            <div className="mw-cycle-head">
              <span>{t("Position ouverte")}</span>
              <strong className="t-caption">
                {msg("Un aller-retour · {0} s", [
                  playbackSpeed === "normal"
                    ? CYCLE_SECONDS_NORMAL
                    : (CYCLE_STEPS_SLOW * 50) / 1000,
                ])}
              </strong>
              <span>{t("Position fermée")}</span>
            </div>
            <div className="mw-timeline" aria-hidden="true">
              {result.samples
                .filter((_, i) => i % 3 === 0)
                .map((s, i) => (
                  <span key={i} className={s.contact} />
                ))}
              <i style={{ left: `${progress * 100}%` }} />
            </div>
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
            <div className="mw-legend">
              <span>
                <i className="closed" />
                {t("Fermé")}
              </span>
              <span>
                <i className="open" />
                {t("Ouvert")}
              </span>
              <span>
                <i className="unknown" />
                {t("Indéterminé")}
              </span>
              {!machine && (
                <span>
                  <i className="target" />
                  {t("Fenêtre souhaitée")}
                </span>
              )}
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
            </div>
          </div>
          <div className="mw-exit">
            <button
              className="mw-button"
              onClick={() => (onResult ? onResult(testedPair()) : onClose())}
            >
              {t("Voir le résultat →")}
              <ArrowRight size={16} />
            </button>
          </div>
        </section>
      </div>
      {!embedded ? (
        <details className="mw-advanced">
          <summary>{t("Données et outils avancés")}</summary>
          <StudioV2
            config={config}
            onApply={update}
            initialStudy={initialStudy}
            onStudyChange={onStudyChange}
            dossierId={dossierId}
            revision={revision}
          />
        </details>
      ) : null}
      <footer className="mw-footer">
        <p>
          {/* Une seule phrase : la provenance des distances et la limite qui va
              avec. L'état d'enregistrement, lui, vit dans la barre du panneau. */}
          {reference ? (
            t(
              "Distances typiques publiées par Standex pour ce couple, dans cette position. À confirmer par un essai dans votre application.",
            )
          ) : (
            <>
              <strong>{t("Illustration pédagogique.")}</strong> {t(EDUCATION_NOTE)}
            </>
          )}{" "}
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
            selectSensor(sensorId);
            setCatalogOpen(false);
            setField(false);
          }}
        />
      )}
      <details className="mw-summary">
        <summary>{t("Résumé du montage et hypothèses")}</summary>
        <pre>{t(summary)}</pre>
        {!embedded ? (
          <p>
            {msg(
              "Version du calcul : {0}. La scène et ses résultats sont recalculés à chaque modification.",
              [MODEL_VERSION],
            )}
          </p>
        ) : null}
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
