import { Button } from "@/components/ui/button";
import { clearanceRegions } from '@/lib/standex/zone-clearance';
import { sectionVolume } from '@/lib/standex/zone-section';
import { ClientPedagogicalControls } from './client-pedagogical-controls';
import { discoveryPatch, clientDiscoveryConfig } from '@/lib/standex/discovery-preset';
import { illustrativeContact } from '@/lib/standex/pedagogical-contact';
import { CLIENT_LIMITS, clientCoupleAdapter, clientPedagogicalResult, type ClientPedagogicalResult } from '@/lib/standex/client-pedagogical';
import { catalogueBodyObbs, catalogueFrame, cataloguePlacement, catalogueModel, catalogueVerdictNotes, CATALOGUE_LABELS, nearestPreparedT, pivotSampleAt, type PivotPlan, type VolumeField } from '@/lib/standex/catalogue-pedagogical';
import { catalogueThresholds, CATALOGUE_RESPONSE, CATALOGUE_CUT_PLANE_Z } from '@/lib/standex/catalogue-response';
import type { MachineFocus } from "@/lib/standex/machine-view";
import { observedCycleVerdict } from "@/lib/leadmagnet/tested-pairs";
import {
  workshopGuideRange,
  onDocumentedPosition,
  GUIDE_SIMULATION_NOTE,
  illustrativeNoteFor,
  illustrationSourceFor,
} from "@/lib/standex/workshop-guide";
import {
  cycleSeconds,
  eventResolution,
  playbackStep,
  switchEvents,
} from "@/lib/standex/machine-playback";
import { ACTIVATION_GUIDE, formatGuideBound } from "@/lib/standex/activation-guide";
import { isPcbSensor } from "@/lib/leadmagnet/product-presentation";
import {
  defaultMagnetFor,
  documentedAlias,
  isOutsidePolicy,
  magnetOptionsFor,
} from "@/lib/standex/default-pairs";
import { pairedMagnetModel } from "@/lib/standex/paired-magnets";
import { contextual, t, msg, number } from "@/lib/i18n/core";
import { GuideMaterials } from "./guide-materials";
import {
  guideIllustrativeMarks,
  guideRangesFor,
  guideReferenceForClass, guideSelectionFor,
} from "@/lib/standex/activation-guide";

import { standardShapeForSensor } from "@/lib/standex/magnet-recommendation";
import { useLocale } from "@/lib/i18n/react";
import { AppHeader } from "@/components/standex/app-header";
import SensorCard from "./sensor-card";
import {
  COVERAGE_LABEL,
  EVIDENCE_LABEL,
  GuidedSuggestion,
  GuidedVerdict,
  LIMIT_LABEL,
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
  useDetectionDataRevision,
  useDetectionDataStatus,
} from "@/lib/standex/detection-data/store";
import {
  publishedClasses,
  publishedClassKind,
  nominalSensitivityRowsFor,
} from "@/lib/standex/magnetics/registries";
import { Component, lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowRight,
  Check,
  Download,
  Expand,
  Info,
  Pause,
  Play,
  RotateCcw,
  Save,
} from "lucide-react";
import {
  DEFAULT_WORKSHOP,
  withDefaultGuideSelection,
  INTERACTION_SOURCE,
  DISTANCE_SOURCE,
  EDUCATION_NOTE,
  REFERENCE_NOTE,
  documentedMagnetAngleDeg,
  MODEL_VERSION,
  parseWorkshopConfig,
  simulateCycle,
  WORKSHOP_IMPORT_LIMIT,
  workshopExportJson,
  summarizeWorkshop,
  magnetSize,
  distanceBasis,
  isFictitiousSensor,
  applySensorSelection,
  workshopPair,
} from "@/lib/standex/magnetic-workshop";
import type { WorkshopConfig, Contact, Vec3 } from "@/lib/standex/magnetic-workshop";
import "./workshop.css";
import { COFFEE_ASSEMBLY } from "@/lib/standex/machine-assembly";
import type { MachineAssembly, Marker as MarkerT } from "@/lib/standex/machine-assembly";
import type { MachineAsset } from "@/lib/standex/machine-assets";
import type { MachineTool } from "./machine-scene";
import type { TestedPair } from "@/lib/leadmagnet/tested-pairs";
import MachineControls from "./machine-controls";
import MachineGuide, {
  INITIAL_GUIDE,
  DemoButtons,
  attachFromHit,
  attachPatch,
  dimsFor,
  guideOverlay,
  handlePick,
  handleHoleRay,
} from "./machine-guide";
import type { GuideState } from "./machine-guide";
import { activeClip, movingSelection, toggleMoving } from "@/lib/standex/machine-assembly";
import {
  applyAttachments,
  freePosePatch,
  reconcileAttachments,
  throughAllowed,
} from "@/lib/standex/machine-mounting";
import {
  cycleU,
  markerReading,
  motionProblem,
  rescaleMachine,
  syncAttachSupports,
} from "@/lib/standex/machine-assembly";
import { DEMO_ASSEMBLIES } from "@/lib/standex/machine-demos";
import FlatScene from "./flat-scene";
import SensorCatalog from "./sensor-catalog";
import ContactIndicator from "./contact-indicator";
import ContactCircuit from "./contact-circuit";
import { SensorPlan } from "./sensor-plan";
import { sensorById, sizeLabel, sensorSource } from "@/lib/standex/sensor-catalog";
import { partEnvelopes, reedObstaclesAt, pedagogicalTimelineKey } from "@/lib/standex/pedagogical-envelopes";
import { animationGeneration } from "@/lib/standex/machine-clip-registry";
import { overlappedPaths, REED_CAPSULE_OBB } from "@/lib/detection-lab/obstacles";
/** Imported-mounting timeline table: 1/512 of the cycle, includes 25 %. */
const PED_TABLE_STEPS = 512;
import { pedagogicalRemedy } from "@/lib/standex/pedagogical-poses";
import { diagnosePlacement } from "@/lib/detection-lab/placement-diagnosis";
import { pilotBodies, pedagogicalFrame, pedagogicalAvailability, suggestPedagogicalConfig, parsePedagogicalEnvelope, type PedagogicalDraft } from "@/lib/standex/pedagogical-poses";
import { PedagogicalLayer, PedagogicalCut } from "./pedagogical-layer";
import { PedagogicalControls, PedagogicalBanner, PivotNotes, usePedagogicalVolume, usePedagogicalCut, preparePivot, volumeKey, PLACEMENT_LABEL } from "./pedagogical-controls";
import { DEFAULT_EXPERIMENT, EXPERIMENT, experimentAvailable, evaluatePlacement, placementTimeline, classThresholds, type ExperimentSettings } from "@/lib/detection-lab/workshop-experiment";

/* i18n-canonical : libellés traduits au rendu par t(). */
const UNIT_LABEL: Record<number, string> = {
  1000: "Mètres · standard GLB",
  1: "Millimètres",
  10: "Centimètres",
};
const Scene = lazy(() => import("./scene"));
const MachineScene = lazy(() => import("./machine-scene"));
/* i18n-canonical : libellés stockés en français, traduits au rendu par t(). */
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
  /** Staff experiment uses pilots; client integration requires a separate explicit boundary. */
  clientPedagogical?: boolean;
  onExplorationChange?: (exploring:boolean)=>void;
  onClientPedagogicalResult?: (result:ClientPedagogicalResult)=>void;
  pedagogical?: boolean;
  initialPedagogicalDraft?: PedagogicalDraft | null;
  onPedagogicalDraftChange?: (draft:PedagogicalDraft)=>void;
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
  initialCableOpen?: boolean;
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
  pedagogical: staffPedagogical = false,
  clientPedagogical = false, onClientPedagogicalResult, onExplorationChange,
  initialPedagogicalDraft, onPedagogicalDraftChange,
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
  cableRouting: providedCableRouting,
  initialCableOpen = false,
  onDraftChange,
  onResult,
  onRequestTrial,
  onSaveState,
}: WorkshopProps) {
  useLocale();
  const pedagogical = staffPedagogical || clientPedagogical;
  const [exploring, setExploring] = useState(false);
  const originalConfig = useRef<WorkshopConfig | null>(null);
  const originalProgress = useRef(0);
  const originalUi = useRef<{tool:MachineTool;guide:GuideState;history:{key:string;past:MachineAssembly[];future:MachineAssembly[]}} | null>(null);
  useEffect(()=>{onExplorationChange?.(exploring);return()=>onExplorationChange?.(false);},[exploring,onExplorationChange]);
  const [primaryMenuOpen, setPrimaryMenuOpen] = useState(true);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 1023px)");
    const sync = () => setPrimaryMenuOpen(!media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  const [cableOpen, setCableOpen] = useState(initialCableOpen);
  const [advancedOpen, setAdvancedOpen] = useState(initialCableOpen);
  const [productOpen, setProductOpen] = useState(initialCableOpen);
  const [positioningOpen, setPositioningOpen] = useState(initialCableOpen);
  const [productCard, setProductCard] = useState(false);
  const [config, setConfig] = useState<WorkshopConfig>(
    // La variante documentée par défaut est résolue à l'ouverture : sans cela un
    // couple pourtant publié restait affiché comme non caractérisé.
    () => { const c=withDefaultGuideSelection(parseWorkshopConfig(initialPedagogicalDraft?.config??initialConfig) ?? { ...DEFAULT_WORKSHOP, ...(staffPedagogical ? { sensorId: "GENERIC", mode: "education" as const, magnetModel: "generic", start: 24, end: 12, magnetAngle: 90 } : {}) }); return clientPedagogical?clientDiscoveryConfig(c):c; },
  );
  // Disconnect all routing consumers, including scene callbacks, for PCB and
  // isolated exploration; hiding the entry button alone is not sufficient.
  const cableRouting = !exploring && !isPcbSensor(config.sensorId) ? providedCableRouting : undefined;
  useEffect(() => {
    if (!exploring) onDraftChange?.(config);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, exploring]);
  const gapPreview = useRef(false);
  const [progress, setProgress] = useState(initialPedagogicalDraft?.progress??0),
    [playing, setPlaying] = useState(false);
  const [experiment, setExperiment] = useState<ExperimentSettings>({...initialPedagogicalDraft?.settings??DEFAULT_EXPERIMENT});
  const [suggestion, setSuggestion] = useState<WorkshopConfig | null>(null);
  const [placementUndo, setPlacementUndo] = useState<WorkshopConfig | null>(null);
  const clientAdapter = useMemo(()=>clientCoupleAdapter(config),[config]);
  const effectiveExperiment = clientPedagogical && !exploring ? clientAdapter.settings : experiment;
  function endExploration() {
    const original=originalConfig.current;if(!original)return;
    importSeqRef.current++;setPendingUnits(null);freshImportRef.current=null;
    if(originalUi.current){setTool(originalUi.current.tool);setGuideState(originalUi.current.guide);historyRef.current=originalUi.current.history;}
    setPlaying(false);setConfig(original);setProgress(originalProgress.current);
    setExploring(false);setSuggestion(null);setPlacementUndo(null);originalConfig.current=null;
  }
  const catalogue=clientPedagogical&&!exploring;
  const catalogueProfile=useMemo(()=>catalogue?catalogueModel(config):null,[catalogue,config]);
  const pedagogicalPose = useMemo(() => catalogue?catalogueFrame(config, progress):pedagogicalFrame(config, progress), [config, progress,catalogue]);
  useEffect(()=>{if(staffPedagogical)onPedagogicalDraftChange?.({config,settings:experiment,progress});},[pedagogical,config,experiment,progress,onPedagogicalDraftChange]);
  const [machineAsset, setMachineAsset] = useState<MachineAsset | null>(null),
    [machineAssetId, setMachineAssetId] = useState<string | null>(null),
    [assetError, setAssetError] = useState<string | null>(null);
  // Pilot bodies drive attachment/alignment in this mode only; derived, never exported.
  const pilot = pedagogical && (!clientPedagogical || exploring) ? pilotBodies(effectiveExperiment.magnetId) : null;
  const bodyConfig = useMemo(() => (pilot ? { ...config, pilotBodies: pilot } : config), [config, pilot?.magnet.heightMm, pilot?.magnet.lengthMm]);
  // Envelopes only from the file loaded for THIS assetKey/unitScale; anything else is unavailable.
  const envelopes = useMemo(() => pedagogical && config.machine && machineAsset && machineAssetId === config.machine.assetKey + "|" + config.machine.unitScale ? partEnvelopes(machineAsset) : null, [pedagogical, machineAsset, machineAssetId, config.machine?.assetKey, config.machine?.unitScale]);
  const availability=pedagogicalAvailability(config, !!envelopes);
  const frameObstacles = useMemo(() => config.machine && envelopes && availability === "ready" ? reedObstaclesAt(config.machine, envelopes, progress, pedagogicalPose) : null, [config.machine, envelopes, availability, progress, pedagogicalPose]);
  const reedOverlap = useMemo(() => frameObstacles ? overlappedPaths(frameObstacles, REED_CAPSULE_OBB) : [], [frameObstacles]);
  const activeExperiment=availability==='ready'?effectiveExperiment:{...effectiveExperiment,integration:'unknown' as const};
  const eligible=availability==='ready'&&(catalogue||experimentAvailable(effectiveExperiment));
  // Imported mounting: same evaluatePlacement, same thresholds, FULL pilot body against loaded part boxes.
  const placement = useMemo(() => {const e=catalogue?cataloguePlacement(config,pedagogicalPose.pose,frameObstacles??[]):evaluatePlacement(activeExperiment,pedagogicalPose.pose,frameObstacles??false);return availability==="ready"?e:{...e,state:'unavailable' as const,cause:availability};}, [effectiveExperiment, pedagogicalPose,frameObstacles,availability,catalogue,config]);
  // Bounded explanation: recomputed from the SAME pose/instant/settings/freedoms/envelopes, never while playing.
  const diagnosis = useMemo(() => pedagogical && !playing && !catalogue ? diagnosePlacement(activeExperiment, pedagogicalPose.pose, frameObstacles ?? false, placement) : null, [pedagogical, playing, effectiveExperiment, availability, pedagogicalPose, frameObstacles, placement,catalogue]);
  const remedy = useMemo(() => pedagogical && !playing && !catalogue && placement.state !== "favorable" && placement.state !== "unavailable" ? pedagogicalRemedy(config, progress, activeExperiment) : null, [pedagogical, playing, placement.state, config, progress, effectiveExperiment, availability,catalogue]);
  // Le volume 3D ne dépend plus de l'instant : il reste calculé et affiché pendant la lecture.
  // Les orientations sont préparées adaptativement AVANT la lecture, jamais interpolées ;
  // pendant la lecture, les zones montrent l'orientation préparée la plus proche — la pose, le verdict
  // et la chronologie restent calculés à l'instant exact. Aucune ancienne orientation n'est montrée
  // comme actuelle : sans volume préparé, aucune zone ne s'affiche.
  const [prepProgress,setPrepProgress]=useState({done:0,total:0});
  const [preparing, setPreparing] = useState(false), [prepFailed, setPrepFailed] = useState(false), [pivotPlan, setPivotPlan] = useState<PivotPlan | null>(null);
  const [prepSeconds,setPrepSeconds]=useState(0);
  useEffect(()=>{if(!preparing)return;setPrepSeconds(0);const began=performance.now();const id=window.setInterval(()=>setPrepSeconds(Math.floor((performance.now()-began)/1000)),1000);return()=>window.clearInterval(id);},[preparing]);
  const prepCancel = useRef<(() => void) | null>(null);
  // Catalogue : le volume exclut les obstacles (clé indépendante de l'instant) ; l'exclusion
  // mécanique COURANTE est appliquée au rendu avec le même test de corps que le verdict.
  const clipGeneration=config.machine?animationGeneration(config.machine.assetKey,config.machine.unitScale):0;
  const pivotPlanKey = catalogue ? JSON.stringify([config, catalogueProfile?.version, machineAssetId, clipGeneration]) : null;
  const [plannedKey, setPlannedKey] = useState<string | null>(null);
  useEffect(() => () => { prepCancel.current?.(); prepCancel.current = null; setPreparing(false); }, [pivotPlanKey, pedagogical, machineAssetId]);
  // Pause/scrub => exact pose; the prepared orientation is used only while playing.
  const activePlan=pivotPlanKey && plannedKey===pivotPlanKey ? pivotPlan : null;
  const pivotT=playing&&activePlan ? nearestPreparedT(activePlan,progress) : null;
  const orientationTransition=!!(playing&&activePlan&&pivotSampleAt(activePlan,progress)===null);
  const pivotHidden = !!pivotPlanKey && playing && pivotT === null;
  const volumeFrame = pivotT !== null ? catalogueFrame(config, pivotT) : pedagogicalPose;
  const sampledRaw = usePedagogicalVolume(pedagogical && eligible && !pivotHidden, activeExperiment, volumeFrame, catalogue ? null : config.machine ? frameObstacles : null, catalogue ? config : undefined);
  const sampled=sampledRaw;
  const clearance=useMemo(()=>{const bodyFrame=(pedagogicalPose.pose as {frame?:[Vec3,Vec3,Vec3]}).frame;
    return catalogueProfile&&bodyFrame?clearanceRegions(bodyFrame,catalogueProfile.magnetBody,frameObstacles??[]):[];
  },[catalogueProfile,pedagogicalPose,frameObstacles]);
  const [timelineResult, setPedTimeline] = useState<(ReturnType<typeof placementTimeline>&{key:string}) | null>(null);
  const timelineKey=pedagogicalTimelineKey(effectiveExperiment,config,machineAssetId,envelopes,clipGeneration)+'|'+(catalogue?catalogueProfile?.version:'frozen');
  const pedTimeline=eligible&&timelineResult?.key===timelineKey?timelineResult:null;
  useEffect(() => {
    setPedTimeline(null);
    if (!pedagogical||!eligible) return;
    if (config.machine && !envelopes) return;
    if (typeof Worker === "undefined") return;
    let current = true;
    const key = timelineKey;
    // Imported mounting: poses and boxes prepared HERE by the shared adapter
    // (clip registry stays in this tab); only numbers reach the worker.
    const table = config.machine && envelopes ? Array.from({ length: PED_TABLE_STEPS + 1 }, (_, i) => {
      const t = i / PED_TABLE_STEPS, f = catalogue?catalogueFrame(config,t):pedagogicalFrame(config, t);
      return { t, pose: f.pose, obstacles: reedObstaclesAt(config.machine!, envelopes, t, f) };
    }) : undefined;
    const worker = new Worker(new URL("./pedagogical.worker.ts", import.meta.url), {type:"module"});
    worker.onmessage = (event) => {if(current && event.data.key === key && event.data.result){setPedTimeline({...event.data.result,key});worker.terminate();}};
    worker.postMessage(table ? {settings:effectiveExperiment,table,key,catalogue:catalogue?config:undefined} : {settings:effectiveExperiment,config,key,catalogue:catalogue?config:undefined});
    return () => {current=false;worker.terminate();};
  }, [pedagogical, timelineKey, eligible]);
  // experimentalLayer est défini après les états d'affichage (zones, circuit) plus bas.
  const [view, setView] = useState<"3d" | "top">("3d"),
    [zones, setZones] = useState(true),
    [field, setField] = useState(false),
    [xray, setXray] = useState(false),
    // Les cotes de corps se superposaient aux noms : elles restent disponibles
    // dans « Affichage », mais décochées par défaut.
    [dimensions, setDimensions] = useState(false),
    [showNames, setShowNames] = useState(true),
    [showMagnetName, setShowMagnetName] = useState(true),
    [showDistance, setShowDistance] = useState(true),
    [focus, setFocus] = useState<MachineFocus>("assembly"),
    [catalogOpen, setCatalogOpen] = useState(false);
  // Seuils mémorisés par classe : un objet frais à chaque frame ne doit pas reconstruire les surfaces.
  const layerClassName = catalogueProfile ? catalogueProfile.className : effectiveExperiment.className;
  const layerThresholds = useMemo(() => catalogue?catalogueThresholds(layerClassName):classThresholds(layerClassName), [layerClassName,catalogue]);
  const experimentalLayer = pedagogical ? <PedagogicalLayer frame={pedagogicalPose} settings={effectiveExperiment} volume={sampled.volume} zones={zones} zonesOnly={catalogue} thresholds={layerThresholds} clearance={clearance}/> : undefined;
  // Coupe instantanée : le worker ne calcule QUE le plan choisi (jamais le volume entier), en pause.
  const cutSampled = usePedagogicalCut(pedagogical && eligible && !playing && view === "top", activeExperiment, pedagogicalPose, config.machine ? frameObstacles : null, catalogue ? config : undefined);
  const cutVolume=useMemo(()=>catalogue&&playing&&sampled.volume&&layerThresholds&&view==='top'
    ? sectionVolume(sampled.volume,CATALOGUE_CUT_PLANE_Z,layerThresholds,clearance) : cutSampled.volume,
    [catalogue,playing,sampled.volume,layerThresholds,pedagogicalPose,clearance,cutSampled.volume,view]);
  // Circuit de principe : même instant et même moteur que le bandeau ; jamais le calcul binaire historique.
  const circuitContact = illustrativeContact(placement,layerClassName);
  /** Vitesse de lecture. Par défaut un aller-retour dure 6 s : la lecture
   * ralentie reste disponible dans les réglages avancés, elle ne disparaît pas. */
  const [playbackSpeed, setPlaybackSpeed] = useState<"normal" | "slow">("normal");
  const [reduced, setReduced] = useState(false);
  const [resetEpoch, setResetEpoch] = useState(0),
    [sceneError, setSceneError] = useState(false);
  const [tool, setTool] = useState<MachineTool>("navigate"),
    [transformMode, setTransformMode] = useState<"translate" | "rotate">("translate");
  const [showMachine, setShowMachine] = useState(true),
    [showSpace, setShowSpace] = useState(true);
  const machine = config.machine;
  const [guideState, setGuideState] = useState<GuideState>(INITIAL_GUIDE);
  /** Montages issus d'un réglage fait « à l'instant affiché » (alignement) : leur
   *  annulation/rétablissement conserve le temps courant. */
  const timedChanges = useRef(new WeakSet<MachineAssembly>());
  /** Historique des opérations de montage, propre au fichier courant. */
  const historyRef = useRef<{ key: string; past: MachineAssembly[]; future: MachineAssembly[] }>({
    key: "",
    past: [],
    future: [],
  });
  const [, setHistoryTick] = useState(0);
  const importSeqRef = useRef(0);
  const preloadedRef = useRef<{ key: string; scale: number; asset: MachineAsset } | null>(null);
  /** Set ONLY by a new, not-yet-positioned import: reopening, reloading or resuming
   *  a draft (clip or not) never moves explicit component positions. */
  const freshImportRef = useRef<string | null>(null);
  /** Relance explicite du chargement (même fichier réimporté alors qu'il manquait). */
  const [assetEpoch, setAssetEpoch] = useState(0);
  /** Fichier refusé pour son échelle : en attente d'un nouvel essai avec d'autres
   *  unités choisies par l'utilisateur. L'ancien montage reste intact. */
  const [pendingUnits, setPendingUnits] = useState<{
    assetKey: string;
    fileName: string;
    tried: number;
    choice: number;
  } | null>(null);
  /** Lecture « montage guidé » recalculée à chaque changement d'entrée : un verdict
   * n'est jamais conservé ni importé, il est toujours recalculé ici. */
  const guided = useGuidedMounting(config, machineAsset);
  /** Ligne du guide d'activation et approche choisies EXPLICITEMENT pour la
   *  démonstration illustrative de portée. Aucun profil n'est créé, aucune
   *  qualification n'en dépend. */
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
      loaded: MachineAsset | null = null,
      unregister: (() => void) | null = null;
    // Annulation réelle : un fichier remplacé pendant sa lecture est abandonné
    // et ses ressources libérées dès qu'il arrive.
    const abort = new AbortController();
    setMachineAsset(null);
    setMachineAssetId(null);
    setAssetError(null);
    if (!machine) return;
    const pre = preloadedRef.current;
    preloadedRef.current = null;
    const fresh = freshImportRef.current === machine.assetKey + "|" + machine.unitScale;
    freshImportRef.current = null;
    void (
      pre && pre.key === machine.assetKey && pre.scale === machine.unitScale
        ? Promise.resolve(pre.asset)
        : import("@/lib/standex/machine-assets").then((m) =>
            m.loadMachineAsset(machine.assetKey, machine.unitScale, storageMode, abort.signal),
          )
    )
      .then(async (asset) => {
        if (cancelled) {
          asset.dispose();
          return;
        }
        loaded = asset;
        // Les clips du fichier ne sont évaluables qu'une fois le fichier chargé :
        // avant, le contact reste indéterminé.
        const { registerAnimation } = await import("@/lib/standex/machine-clip-registry");
        if (cancelled) return;
        unregister = registerAnimation(machine.assetKey, machine.unitScale, asset.animation);
        setMachineAsset(asset);
        setMachineAssetId(machine.assetKey + "|" + machine.unitScale);
        // Nouveau fichier : AUCUNE pièce mobile n'est devinée et aucun mouvement
        // n'est supposé. Seules les poses initiales sont rapprochées de l'objet.
        if (fresh && machine.motionStatus === "unset" && movingSelection(machine).length === 0) {
          setConfig((c) =>
            c.machine?.assetKey === machine.assetKey &&
            !c.machine.sensorAttach &&
            !c.machine.magnetAttach
              ? {
                  ...c,
                  machine: {
                    ...c.machine,
                    ...({
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
      abort.abort();
      unregister?.();
      loaded?.dispose();
    };
    // Positions and cycle changes reuse the loaded geometry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machine?.assetKey, machine?.unitScale, storageMode, assetEpoch]);
  /** Toute opération sur le montage passe ici : historique annulable, et une
   * pose modifiée librement libère honnêtement son attache. */
  function machineChange(patch: Partial<MachineAssembly>, opts: { keepTime?: boolean } = {}) {
    if (!machine) return;
    const { freed, ...clean } = freePosePatch(patch);
    // Changement d'unités : repères, attaches et course liés au modèle sont
    // rééchelonnés ; la taille physique des produits ne change pas.
    const base =
      patch.unitScale !== undefined && patch.unitScale !== machine.unitScale
        ? rescaleMachine(machine, patch.unitScale)
        : machine;
    delete (clean as Partial<MachineAssembly>).unitScale;
    let next = { ...base, ...clean } as MachineAssembly;
    for (const k of ["sensorAttach", "magnetAttach"] as const)
      if (k in next && next[k] === undefined) delete next[k];
    // Le support d'une attache suit la sélection mobile réelle.
    next = applyAttachments(
      syncAttachSupports(next),
      dimsFor(bodyConfig, "sensor"),
      dimsFor(bodyConfig, "magnet"),
    );
    if (!parseWorkshopConfig({ ...config, machine: next })) return;
    const h = historyRef.current;
    if (h.key !== machine.assetKey) {
      h.key = machine.assetKey;
      h.past = [];
      h.future = [];
    }
    h.past = [...h.past.slice(-49), machine];
    h.future = [];
    setHistoryTick((v) => v + 1);
    // Un alignement « à l'instant affiché » garde le temps courant, y compris
    // quand on l'annule ou le rétablit (comparaison au même instant).
    if (opts.keepTime) timedChanges.current.add(next);
    if (freed.length)
      setGuideState((g) => ({ ...g, freed: [...new Set([...g.freed, ...freed])] }));
    else if ("sensorAttach" in patch || "magnetAttach" in patch)
      setGuideState((g) => ({
        ...g,
        freed: g.freed.filter((w) => !(w + "Attach" in patch)),
      }));
    update({ machine: next }, { keepTime: !!opts.keepTime });
  }
  /** Repères de mesure : annulables, mais l'instant de lecture est conservé
   *  (un repère peut se poser pendant l'animation). */
  function setMarkers(markers: MarkerT[]) {
    if (!machine) return;
    const next: MachineAssembly = { ...machine, markers };
    if (!markers.length) delete next.markers;
    if (!parseWorkshopConfig({ ...config, machine: next })) return;
    const h = historyRef.current;
    if (h.key !== machine.assetKey) {
      h.key = machine.assetKey;
      h.past = [];
      h.future = [];
    }
    h.past = [...h.past.slice(-49), machine];
    h.future = [];
    setHistoryTick((v) => v + 1);
    setConfig((c) => ({ ...c, machine: next }));
  }
  function travelHistory(direction: "undo" | "redo") {
    const h = historyRef.current;
    if (!machine || h.key !== machine.assetKey) return;
    const from = direction === "undo" ? h.past : h.future,
      to = direction === "undo" ? h.future : h.past;
    const target = from.pop();
    if (!target) return;
    to.push(machine);
    setHistoryTick((v) => v + 1);
    // Défaire/refaire un réglage horodaté reste au même instant ; les autres
    // réglages gardent leur règle habituelle (retour au début du cycle).
    const keepTime = timedChanges.current.has(direction === "undo" ? machine : target);
    update({ machine: target }, { keepTime });
  }
  // Changer de capteur ou d'aimant garde les attaches : la pose est recalculée
  // pour que la face d'appui (ou la profondeur) reste celle choisie.
  const dimsKey = JSON.stringify([dimsFor(bodyConfig, "sensor"), dimsFor(bodyConfig, "magnet")]);
  const sensorShape = sensorById(config.sensorId).shape;
  useEffect(() => {
    if (!machine || (!machine.sensorAttach && !machine.magnetAttach)) return;
    // Une attache traversante devenue incompatible (produit non cylindrique)
    // est libérée et signalée, jamais conservée en fausse contrainte.
    const { machine: kept, freed } = reconcileAttachments(machine, sensorShape);
    const next = applyAttachments(
      syncAttachSupports(kept),
      dimsFor(bodyConfig, "sensor"),
      dimsFor(bodyConfig, "magnet"),
    );
    if (freed.length)
      setGuideState((g) => ({
        ...g,
        freed: [...new Set([...g.freed, ...freed])],
        incompatible: [...new Set([...(g.incompatible ?? []), ...freed])],
      }));
    if (JSON.stringify(next) !== JSON.stringify(machine)) setConfig((c) => ({ ...c, machine: next }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dimsKey, sensorShape, machine?.sensorAttach, machine?.magnetAttach]);
  // Le mode affiché suit l'attache enregistrée (relecture, annuler, démo).
  useEffect(() => {
    const s = machine?.sensorAttach?.kind,
      g = machine?.magnetAttach?.kind;
    setGuideState((st) =>
      (s && s !== st.kind.sensor) || (g && g !== st.kind.magnet)
        ? { ...st, kind: { sensor: s ?? st.kind.sensor, magnet: g ?? st.kind.magnet } }
        : st,
    );
  }, [machine?.sensorAttach?.kind, machine?.magnetAttach?.kind]);
  function openDemo(key: string) {
    if (key === "builtin:coffee-v1") return exampleMachine();
    const demo = DEMO_ASSEMBLIES[key];
    if (!demo) return;
    // Le capteur et l'aimant courants sont conservés : l'exemple ne les impose pas.
    update({ machine: structuredClone(demo) });
    setGuideState({ ...INITIAL_GUIDE });
    historyRef.current = { key: demo.assetKey, past: [], future: [] };
    setView("3d");
    setFocus("assembly");
    setResetEpoch((v) => v + 1);
    setSceneError(false);
  }
  function chooseTool(next: MachineTool) {
    if (next === "cable" && (exploring || isPcbSensor(config.sensorId))) return;
    setPlaying(false);
    // Le tracé de câble et les repères se relèvent DANS la pose courante : on
    // ne remet pas le cycle à zéro.
    // Pedagogical mode: returning to navigation (e.g. moving between guide steps)
    // keeps the displayed instant; entering a mounting tool still resets it.
    const keepTime = pedagogical && next === "navigate";
    if (!keepTime && next !== "cable" && next !== "measure" && tool !== "measure") setProgress(0);
    setTool(next);
  }
  function exampleMachine() {
    if (clientPedagogical) { openDemo('builtin:arm-v1'); return; }
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
  /** Import en TRANSACTION : le fichier est entièrement chargé et sa géométrie
   *  validée AVANT de remplacer le montage, l'historique ou l'asset. En cas
   *  d'échec, le montage précédent, le capteur et l'aimant restent intacts.
   *  Seul le dernier import demandé est appliqué. */
  async function importMachine(file: File | undefined) {
    if (!file) return;
    setError(null);
    setPendingUnits(null);
    const seq = ++importSeqRef.current;
    try {
      const { storeMachineFileWithMode } = await import("@/lib/standex/machine-assets");
      const assetKey = await storeMachineFileWithMode(file, storageMode);
      if (seq !== importSeqRef.current) return;
      const same = machine?.assetKey === assetKey;
      await installMachine(assetKey, file.name, same ? machine!.unitScale : COFFEE_ASSEMBLY.unitScale, seq);
    } catch (e) {
      if (seq !== importSeqRef.current) return;
      setError(e instanceof Error ? e.message : t("Import impossible."));
    }
  }
  /** Nouvel essai explicite d'un fichier refusé pour son échelle, avec les
   *  unités choisies : rien n'est deviné et les limites ne changent pas. */
  async function retryUnits() {
    if (!pendingUnits) return;
    const p = pendingUnits;
    setError(null);
    const seq = ++importSeqRef.current;
    try {
      await installMachine(p.assetKey, p.fileName, p.choice, seq);
      if (seq === importSeqRef.current) setPendingUnits(null);
    } catch (e) {
      if (seq !== importSeqRef.current) return;
      setError(e instanceof Error ? e.message : t("Import impossible."));
    }
  }
  async function installMachine(assetKey: string, fileName: string, scale: number, seq: number) {
    const { loadMachineAsset } = await import("@/lib/standex/machine-assets");
    const same = machine?.assetKey === assetKey && machine.unitScale === scale;
    if (same && machineAsset) {
      // Même fichier déjà chargé : rien ne change, aucune ressource en double.
      return;
    }
    let asset: MachineAsset;
    try {
      asset = await loadMachineAsset(assetKey, scale, storageMode);
    } catch (e) {
      if (seq === importSeqRef.current && (e as { code?: string }).code === "scale")
        setPendingUnits({
          assetKey,
          fileName,
          tried: scale,
          choice: scale === 1 ? 1000 : 1,
        });
      throw e;
    }
    if (seq !== importSeqRef.current) {
      asset.dispose();
      return;
    }
    preloadedRef.current?.asset.dispose();
    preloadedRef.current = { key: assetKey, scale, asset };
    if (same) {
      // Même fichier, absent de la mémoire : on installe l'asset relu sans
      // toucher aux réglages, attaches, clip ni repères, et on relance le chargement.
      setAssetEpoch((v) => v + 1);
      setSceneError(false);
      return;
    }
    const keepSame = machine?.assetKey === assetKey;
    if (!keepSame) freshImportRef.current = assetKey + "|" + scale;
    setGuideState({ ...INITIAL_GUIDE });
    if (!keepSame) historyRef.current = { key: assetKey, past: [], future: [] };
    update({
      // Capteur, aimant et mode restent ceux choisis par l'utilisateur.
      // Nouveau fichier : aucune pièce mobile, aucun mouvement supposé. Le
      // mouvement de l'exemple café n'est jamais repris pour un client.
      machine: keepSame
        ? rescaleMachine(machine!, scale)
        : {
            ...structuredClone(COFFEE_ASSEMBLY),
            assetKey,
            fileName: fileName.slice(0, 180),
            unitScale: scale,
            movingNode: "",
            movingNodes: [],
            travel: [0, 0, 0],
            magnetMount: "fixed",
            motionStatus: "unset",
          },
    });
    setView("3d");
    setFocus("assembly");
    setSceneError(false);
    setResetEpoch((v) => v + 1);
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
  /** Repères d'animation ILLUSTRATIVE : bornes de la plage du guide choisie
   *  explicitement (référence + approche), sinon 15 / 18 mm. Ces bornes ne
   *  touchent ni la couverture, ni la preuve, ni le verdict. */
  /* Révision des données de détection effectives : une ligne enregistrée par
     l'administration Standex doit recalculer la scène montée, pas attendre un
     rechargement. */
  const dataRevision = useDetectionDataRevision();
  /* État RÉEL des données lues par cette scène : si la relecture du serveur a
     échoué, la scène le dit au lieu de laisser croire à des données à jour. */
  const dataStatus = useDetectionDataStatus();
  const guideDemoRange = useMemo(() => {
    return workshopGuideRange(config);
  }, [config.sensorId, config.magnetModel, config.guideReference, config.geometry, dataRevision]);
  /** Source identifiable de la commutation illustrative : ligne nominale
   *  publiée de la classe choisie, sinon plage du guide choisie, sinon aucune. */
  const illustration = useMemo(
    () =>
      illustrationSourceFor(
        config,
        guideIllustrativeMarks(guideDemoRange),
        guideDemoRange?.sensorReference ?? null,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config.sensorId, config.magnetModel, config.geometry, config.sensitivity, guideDemoRange, dataRevision],
  );
  const illustrativeBounds = illustration.bounds;
  const guidedSim = useMemo(
    () =>
      simulateMounting(
        guided,
        SAMPLE_STEPS,
        undefined,
        scenePoseSampler(config),
        illustrativeBounds,
      ),
    [guided, config, illustrativeBounds, dataRevision, machineAsset],
  );

  /** Aucun contact n'est montré tant que le mouvement est absent, en brouillon,
   *  invalide, ou que le fichier n'est pas chargé : seul l'aperçu mécanique reste. */
  const machineBlocked = !!machine && (!!motionProblem(machine) || !machineAsset);
  const result = useMemo(() => {
    const raw = simulateCycle(config);
    const last = guidedSim.samples.length - 1;
    const samples = raw.samples.map((s) => {
      const g = guidedSim.samples[Math.min(last, Math.round(s.t * last))]!;
      const shown = machineBlocked
        ? "unknown"
        : g.covered || guidedSim.illustrative
          ? g.contact
          : "unknown";
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
      unknown: raw.unknown || machineBlocked || guidedSim.coverage !== "covered",
      // i18n-canonical : raison traduite au rendu par t().
      reason:
        raw.reason ??
        (machine && !machineAsset ? "Fichier 3D non chargé : aucun contact n'est affiché." : null),
    };
  }, [config, guidedSim, machineBlocked, machine, machineAsset]);
  const sample =
    result.samples[
      Math.min(result.samples.length - 1, Math.round(progress * (result.samples.length - 1)))
    ]!;
  const timelineContacts = [
    result.samples[0]?.contact ?? "unknown",
    result.samples[Math.round((result.samples.length - 1) / 2)]?.contact ?? "unknown",
    result.samples[result.samples.length - 1]?.contact ?? "unknown",
  ] as const;
  const reference = config.mode === "reference",
    unit = " mm";
  /** Origine réelle des distances affichées : données publiées pour CE couple,
   * absence de données, ou démonstration explicitement fictive. */
  const basis = distanceBasis(config),
    fictitious = isFictitiousSensor(config.sensorId);
  const basisLabel =
    pedagogical ? t("Atelier pédagogique") : basis === "standex"
      ? t("Données Standex · distances publiées pour ce couple")
      : basis === "unavailable"
        ? t(
            guideDemoRange
              ? "Plage du guide disponible"
              : "Distances non renseignées pour ce couple",
          )
        : t("Démonstration · distances fictives");
  /** Classes réellement publiées pour le couple : aucune interpolation. */
  const sensitivityChoices = publishedClasses(config.sensorId, config.magnetModel);
  /** Nature de la colonne publiée : classe de sensibilité ou modèle de contact. */
  const classKind = publishedClassKind(config.sensorId, config.magnetModel);
  const activationChoices = nominalSensitivityRowsFor(
    config.sensorId,
    config.magnetModel,
    config.geometry,
  );
  // Le choix déjà enregistré reste lisible même hors politique ; il n'est pas
  // reproposé ailleurs et rien n'est réécrit à la relecture d'un dossier.
  const magnetChoices = magnetOptionsFor(config.sensorId, undefined, config.magnetModel);
  const magnetOutsidePolicy = isOutsidePolicy(config.sensorId, config.magnetModel);
  const magnetAlias = documentedAlias(config.magnetModel);

  const summary = useMemo(() => summarizeWorkshop(config), [config, dataRevision]);
  const fingerprint = JSON.stringify(config),
    dirty = saved !== fingerprint;
  const referencePair = workshopPair(config);
  const pull = referencePair?.[0] ?? "—",
    drop = referencePair?.[1] ?? "—";
  const unknown = result.unknown;
  // Clip : seule compte la disponibilité effective du clip pris en charge dans
  // le fichier chargé ; aucune sélection manuelle n'est redemandée.
  const machineReady =
    !machine ||
    (machine.motionSource === "clip"
      ? !!machineAsset && !!activeClip(machine)
      : movingSelection(machine).length > 0 &&
      movingSelection(machine).every((p) => !!machineAsset?.nodes.some((n) => n.path === p)));
  const events = useMemo(() => switchEvents(machine ?? null, result.samples), [machine, result, machineAsset]);
  const resolution = eventResolution(machine ?? null, result.samples.length);
  const overlay =
    machine && machineAsset
      ? guideOverlay(
          guideState,
          machine,
          {
            onPickPart: (path) => machineChange({
              ...toggleMoving(machine, path),
              motionStatus: machine.motionStatus === "confirmed" ? "draft" : (machine.motionStatus ?? "draft"),
            }),
            onPickPoint: (hit) => {
              const r = handlePick(guideState, machine, hit, bodyConfig);
              setGuideState(r.state);
              if (r.patch) machineChange(r.patch);
              if (r.done) setTool("navigate");
            },
            onPlace: (which, hit) => {
              const kind = guideState.kind[which];
              // i18n-canonical : message traduit au rendu par t().
              if (kind === "through" && (which === "magnet" || !throughAllowed(sensorShape))) {
                setGuideState((g) => ({
                  ...g,
                  notice:
                    "Montage traversant refusé : il est réservé aux capteurs à corps cylindrique, fileté ou à insérer.",
                }));
                return;
              }
              const prev = which === "sensor" ? machine.sensorAttach : machine.magnetAttach;
              machineChange(attachPatch(which, attachFromHit(hit, kind, prev), bodyConfig));
            },
            onHoleRay: (ray) => {
              setPlaying(false);
              const r = handleHoleRay(guideState, machine, ray, cycleU(machine, sample.t), bodyConfig);
              setGuideState(r.state);
              if (r.patch) machineChange(r.patch);
              if (r.done) setTool("navigate");
            },
          },
          Math.max(...machineAsset.size),
          cycleU(machine, sample.t),
        )
      : undefined;

  useEffect(() => {
    if (!playing) return;
    // Temps écoulé réel rapporté à la durée réelle : clip CHARGÉ (pas la durée
    // enregistrée dans le JSON) ou aller-retour manuel de 6 s ; ralenti × 2.
    const seconds = cycleSeconds(machine);
    if (!seconds) {
      setPlaying(false);
      return;
    }
    let raf = 0,
      last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      setProgress((v) => playbackStep(v, dt, seconds, playbackSpeed === "slow"));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, playbackSpeed, machine?.motionSource, machine?.clip?.index, machineAsset]);
  useEffect(() => {
    if (progress >= 1) setPlaying(false);
  }, [progress]);

  function update(patch: Partial<WorkshopConfig>, opts: { keepTime?: boolean } = {}) {
    const merged = { ...config, ...patch };
    const next = clientPedagogical&&!exploring?clientDiscoveryConfig(merged):merged;
    if(clientPedagogical&&!exploring&&(patch.magnetModel!==undefined||patch.sensitivity!==undefined||patch.geometry!==undefined))
      next.guideReference=guideReferenceForClass(next.sensorId,next.magnetModel,next.geometry,next.sensitivity,next.guideReference);
    if (next.end >= next.start) {
      if (patch.start !== undefined) next.end = Math.max(1, next.start - 1);
      else next.start = Math.min(60, next.end + 1);
    }
    if (!parseWorkshopConfig(next)) return;
    setPlaying(false);
    if (!opts.keepTime && !clientPedagogical) setProgress(0);
    // Gap and offset preview the actual nearest pose, not an invisible future endpoint.
    // Imported mounting and unrelated controls must keep their current instant.
    if(clientPedagogical&&!next.machine&&next.motion==='approach'&&(patch.end!==undefined||patch.lateralShift!==undefined)&&patch.geometry===undefined&&patch.motion===undefined){
      setProgress(.5); gapPreview.current=true;
    }
    setSuggestion(null);setPlacementUndo(null);
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
    const next=applySensorSelection(config,sensorId);
    update(catalogue&&!config.machine?{...next,...discoveryPatch(next,{motion:'approach'})}:next);
  }

  async function save() {
    if(exploring)return;
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
      if (file.size > WORKSHOP_IMPORT_LIMIT) throw new Error(t("Le fichier de montage est trop volumineux."));
      const envelope = JSON.parse(await file.text());
      const resumed=pedagogical&&(!clientPedagogical||exploring)?parsePedagogicalEnvelope(envelope):null;
      if(pedagogical&&(!clientPedagogical||exploring)&&!resumed)throw new Error(t("Fichier pédagogique invalide : version, profil ou paramètres incompatibles."));
      const parsed = resumed?.config ?? parseWorkshopConfig(envelope);
      if (!parsed)
        throw new Error(t("Ce fichier ne contient pas un montage valide (V1, V2 ou V3)."));
      setPlaying(false);
      setProgress(resumed?.progress??0);
      if(resumed)setExperiment(resumed.settings);
      setConfig(clientPedagogical?clientDiscoveryConfig(parsed):parsed);
      setSaved(null);
      setError(null);
      setImportNotice(t(storageMode==="memory"?"Montage importé en mémoire de cet onglet ; GLB à réimporter si absent.":"Montage importé. Il est enregistré automatiquement dans votre projet."));
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
    if (pedagogical) return;
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
    if (staffPedagogical || exploring) return;
    if (!dirty || saving) return;
    const id = setTimeout(() => void save(), 800);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint, dirty, saving, exploring]);
  useEffect(() => {
    if(!exploring)onSaveState?.(saving ? "saving" : dirty ? "draft" : "saved");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saving, dirty, exploring]);

  /* ---------------------------------------------------------------- */
  /* Bandeau de verdict                                               */
  /* ---------------------------------------------------------------- */
  const computed = guided.computed;
  /** Quatre situations distinctes, jamais confondues : détection prévue,
   *  absence de détection sur ce cycle, pose hors gabarit, couple sans table
   *  publiée. Le nom du couple n'emprunte jamais les seuils d'un autre. */
  const verdictKind = observedCycleVerdict(guidedSim, basis !== "unavailable");
  /* Le guide d'activation publie des PLAGES pour ce couple : elles existent et
     sont lisibles, mais ce ne sont pas des seuils qualifiés. Les deux situations
     doivent être distinguées dans le texte, sans jamais promouvoir une plage en
     seuil. */
  const guideRangesAvailable = useMemo(
    () => guideRangesFor(config.sensorId, config.magnetModel).length > 0,
    [config.sensorId, config.magnetModel],
  );
  const verdictSentence =
    verdictKind === "expected"
      ? msg("Détection prévue — ferme à {0} mm, ouvre à {1} mm", [pull, drop])
      : verdictKind === "none"
        ? t("Pas de détection sur ce cycle — rapprochez l'aimant ou changez de couple")
        : verdictKind === "undocumented"
          ? t("Position non documentée — Standex peut la mesurer pour vous")
          : guideDemoRange
            ? msg("Plage documentée : {0} à {1} mm — {2}, {3}", [
                formatGuideBound(guideDemoRange.upMm, guideDemoRange.upNote),
                formatGuideBound(guideDemoRange.toMm, guideDemoRange.toNote),
                guideDemoRange.sensorReference,
                guideDemoRange.approachId,
              ])
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
    sensitivity: basis === "unavailable" ? null : (config.sensitivity ?? null),
    verdict: verdictKind,
    pullInMm: referencePair ? referencePair[0] : null,
    dropOutMm: referencePair ? referencePair[1] : null,
    travelStartMm: config.start,
    travelEndMm: config.end,
    mainMessage: guideDemoRange
      ? GUIDE_SIMULATION_NOTE
      : computed && computed.coverage !== "covered"
        ? computed.mainMessage
        : null,
    guideReference: guideDemoRange?.sensorReference ?? null,
    documentedPosition: onDocumentedPosition(config),
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
        {dataStatus.stale && dataStatus.state === "error" ? (
          <p className="t-caption" data-testid="data-stale-notice">
            {t(
              "Données de détection non relues depuis le serveur : cette scène peut afficher des valeurs plus anciennes.",
            )}
          </p>
        ) : null}
        {/* Hors couverture, le message du moteur est repris MOT POUR MOT. */}
        {guideDemoRange && basis === "unavailable" ? (
          <p className="t-caption" data-testid="verdict-main-message">
            {t(
              onDocumentedPosition(config)
                ? "Position du guide sélectionnée."
                : "Montage différent de la position du guide : la plage reste une référence, à confirmer dans votre configuration.",
            )}{" "}
            <a href={ACTIVATION_GUIDE.source.url} target="_blank" rel="noopener noreferrer">
              {msg("Guide Standex, page {0}", [String(guideDemoRange.page)])}
            </a>
          </p>
        ) : computed && computed.coverage !== "covered" ? (
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
            {t(
              guideDemoRange && illustrativeBounds
                ? GUIDE_SIMULATION_NOTE
                : illustrativeNoteFor(config),
            )}
          </p>
        ) : null}
      </div>
    </div>
  );

  /* ---------------------------------------------------------------- */
  /* Colonne de gauche : trois réglages                               */
  /* ---------------------------------------------------------------- */
  /* i18n-canonical : libellés stockés en français, traduits au rendu par t(). */
  const WORKSHOP_D1_LABEL = contextual("Face à face", "workshop.position.d1");
  const APPROACH_CHOICES = [
    {
      id: "D1" as const,
      label: WORKSHOP_D1_LABEL,
      path: "M4 7h6M10 17H4M14 7h6M20 17h-6",
    },
    {
      id: "D3" as const,
      label: t("Dans l’alignement"),
      path: "M4 12h7M13 12h7M11 5v14",
    },
  ];

  const approachPicker = (
    <div className="mw-approach">
      <p className="t-label">{t("Position de l'aimant")}</p>
      <div className="mw-approach-row">
        {APPROACH_CHOICES.map((a) => {
          return (
            <button
              key={a.id}
              type="button"
              className="mw-approach-button"
              aria-pressed={config.geometry === a.id}
              title={a.id === "D1" ? a.label : t(a.label)}
              onClick={() =>
                update(catalogue?discoveryPatch(config,{
                  geometry:a.id,magnetAngle:documentedMagnetAngleDeg(a.id,config.sensorId),
                }):{
                  geometry: a.id,
                  magnetAngle: documentedMagnetAngleDeg(a.id, config.sensorId),
                  // La variante du guide suit l'approche choisie : on garde la
                  // même ligne quand elle publie cette approche, sinon la
                  // variante publiée pour cette approche, sinon aucune.
                  guideReference:
                    guideSelectionFor(
                      config.sensorId,
                      config.magnetModel,
                      a.id,
                      config.guideReference,
                    )?.reference ?? null,
                })
              }
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d={a.path} />
              </svg>
              <span>{a.id === "D1" ? a.label : t(a.label)}</span>
            </button>
          );
        })}
      </div>
      {config.geometry === "F1" ? (
        <p className="notice-info t-caption" data-testid="legacy-approach-notice">
          {t(
            "Position enregistrée : F1. Elle reste inchangée tant que vous ne choisissez pas l’un des deux positionnements ci-dessus.",
          )}
        </p>
      ) : null}
    </div>
  );

  const travelControls = (
    <div className="mw-travel">
      <Range
        label={t("Écart au départ")}
        value={config.start}
        min={2}
        max={60}
        step={0.5}
        unit={unit}
        onChange={(start) => update({ start })}
      />
      <Range
        label={t("Écart au plus près")}
        value={config.end}
        min={1}
        max={59}
        step={0.5}
        unit={unit}
        onChange={(end) => update({ end })}
      />
    </div>
  );

  const selectedActivationIndex = activationChoices.findIndex(
    (row) => row.sensitivityClass === config.sensitivity,
  );
  const selectedActivation =
    selectedActivationIndex >= 0 ? activationChoices[selectedActivationIndex] : null;
  const suggestedActivation = activationChoices[0] ?? null;
  const applySuggestedActivation = () => {
    if (suggestedActivation) update({ sensitivity: suggestedActivation.sensitivityClass });
  };
  // i18n-canonical: owned action template, translated reactively by msg().
  const suggestedActivationLabel = suggestedActivation
    ? msg("Choisir environ {0} mm (classe {1})", [
        number(suggestedActivation.pullInMm),
        suggestedActivation.sensitivityClass,
      ])
    : "";
  const activationDistanceControl =
    activationChoices.length > 0 ? (
      <fieldset className="mw-activation-distance" aria-labelledby="mw-activation-heading">
        <legend className="mw-visually-hidden">{t("Distance d’activation")}</legend>
        <p id="mw-activation-heading" className="t-label mw-activation-heading">
          {t("Distance d’activation")}
        </p>
        <div className="mw-activation-scale" aria-hidden="true">
          <span>{t("Plus près")}</span>
          <span>↔</span>
          <span>{t("Plus loin")}</span>
        </div>
        {activationChoices.length === 1 ? (
          selectedActivation ? (
            <p className="mw-activation-value t-metric">
              {msg("Environ {0} mm (classe {1})", [
                number(selectedActivation.pullInMm),
                selectedActivation.sensitivityClass,
              ])}
            </p>
          ) : (
            <button
              type="button"
              className="mw-button mw-secondary mw-wide"
              onClick={applySuggestedActivation}
            >
              {suggestedActivationLabel}
            </button>
          )
        ) : (
          <>
            {selectedActivation ? (
              <>
                <input
                  className="mw-activation-range"
                  type="range"
                  min={0}
                  max={activationChoices.length - 1}
                  step={1}
                  value={selectedActivationIndex}
                  aria-label={t("Choisir la distance d’activation")}
                  aria-valuetext={msg("Environ {0} mm (classe {1})", [
                    number(selectedActivation.pullInMm),
                    selectedActivation.sensitivityClass,
                  ])}
                  onChange={(event) => {
                    const row = activationChoices[Number(event.target.value)];
                    if (row) update({ sensitivity: row.sensitivityClass });
                  }}
                />
                <div className="mw-activation-ticks" aria-hidden="true">
                  {activationChoices.map((row) => (
                    <span key={row.id}>{number(row.pullInMm)}</span>
                  ))}
                </div>
              </>
            ) : (
              <button
                type="button"
                className="mw-button mw-secondary mw-wide"
                onClick={applySuggestedActivation}
              >
                {suggestedActivationLabel}
              </button>
            )}
            <p className="mw-activation-value t-metric">
              {selectedActivation
                ? msg("Environ {0} mm (classe {1})", [
                    number(selectedActivation.pullInMm),
                    selectedActivation.sensitivityClass,
                  ])
                : t("Choisissez une distance d’activation.")}
            </p>
          </>
        )}
        <p className="mw-help">
          {t(
            "Ces distances sont indicatives. La distance d’activation réelle sera déterminée avec les équipes Standex.",
          )}
        </p>
        {machine && illustration.kind !== "nominal" && (
          <p className="notice-warning" data-testid="activation-inert">
            {t(
              "Aucune ligne publiée exploitable pour cette classe et cette approche : ce choix ne modifie pas la commutation illustrative du modèle importé.",
            )}
          </p>
        )}
      </fieldset>
    ) : null;

  const stopPreparation = () => { prepCancel.current?.(); prepCancel.current=null; setPreparing(false); };
  const playButton = (
    <button
      ref={playRef}
      className="mw-button mw-wide mw-run"
      disabled={!machineReady || reduced}
      aria-pressed={playing}
      onClick={() => {
        if(preparing){stopPreparation();return;}
        if (progress >= 1 || (!playing && gapPreview.current && !machine)) setProgress(0);
        gapPreview.current=false;
        // Pivot : plan d'orientations adaptatif (frontière centrale ≤ 0,5 mm) préparé avant lecture.
        if (!playing && pivotPlanKey && plannedKey !== pivotPlanKey) {
          prepCancel.current?.();
          setPreparing(true); setPrepFailed(false);setPrepProgress({done:0,total:0});
          const key = pivotPlanKey;
          prepCancel.current = preparePivot(config, (u) => { const f = catalogueFrame(config, u); return { key: volumeKey(activeExperiment, f, null, config), settings: activeExperiment, frame: f, obstacles: null, catalogue: config }; }, (plan) => {
            prepCancel.current = null; setPreparing(false);
            if (!plan) { setPrepFailed(true); return; }
            setPivotPlan(plan); setPlannedKey(key); setPlaying(true);
          },Infinity,undefined,(done,total)=>setPrepProgress({done,total}));
          return;
        }
        setPlaying(!playing);
      }}
    >
      {playing ? <Pause size={17} /> : <Play size={17} />}
      {t(preparing ? "Annuler la préparation" : playing ? "Pause" : prepFailed ? "Réessayer la préparation" : "Lancer le mouvement")}
      {preparing&&<span className="t-metric">{prepProgress.total?Math.floor(100*prepProgress.done/prepProgress.total)+" %":"…"}</span>}
    </button>
  );

  /* Matériau, référence et approche du guide : regroupés avec l'aimant dans
     les réglages avancés. Le choix sélectionne une vraie référence du guide
     d'activation sans facteur de matériau inventé. */
  const guideMaterialsBlock = (
    <GuideMaterials
      sensorFamily={config.sensorId}
      shape={standardShapeForSensor(config.sensorId)}
      magnetModel={config.magnetModel}
      guideReference={config.guideReference ?? null}
      guideApproach={config.geometry}
      onSelect={(magnetModel) =>
        update({
          magnetModel,
          // Changer d'aimant change de lignes publiées : la variante est
          // ré-résolue pour l'approche courante, jamais héritée de l'autre aimant.
          guideReference:
            guideSelectionFor(config.sensorId, magnetModel, config.geometry, config.guideReference)
              ?.reference ?? null,
        })
      }

      onSelectDemo={(ref, approachId) => {
        if (approachId === "D1" || approachId === "D3") {
          update({
            guideReference: ref,
            geometry: approachId,
            magnetAngle: documentedMagnetAngleDeg(approachId, config.sensorId),
          });
        }
      }}
    />
  );

  /* Réglages avancés : trois catégories fermées, sans modifier leurs données. */
  const advancedSettings = (
    <details
      className="mw-advanced-settings"
      data-testid="workshop-advanced"
      open={advancedOpen}
      onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}
    >
      <summary>{t("Réglages avancés ⌄")}</summary>
      <div className="mw-advanced-body">
        <details
          className="mw-advanced-category"
          data-testid="advanced-product"
          open={productOpen}
          onToggle={(event) => setProductOpen(event.currentTarget.open)}
        >
          <summary>{t("Choix du produit")}</summary>
          <div className="mw-advanced-category-body">
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
        {reference && classKind === "switch_model" && sensitivityChoices.length > 0 && (
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
        {!isPcbSensor(config.sensorId) ? (
          <label className="mw-select-label">
            {t("Longueur de câble retenue (mm)")}
            <input
              type="number"
              min={1}
              step={10}
              inputMode="numeric"
              className="t-metric"
              placeholder={t("Non choisie")}
              value={config.cableLengthMm ?? ""}
              onChange={(event) => {
                const value = event.target.value.trim();
                if (value === "") return update({ cableLengthMm: null });
                const length = Number(value);
                if (Number.isFinite(length) && length > 0 && length <= 100000)
                  update({ cableLengthMm: length });
              }}
            />
          </label>
        ) : null}
          </div>
        </details>
        <details className="mw-advanced-category" data-testid="advanced-magnet">
          <summary>{t("Choix de l’aimant")}</summary>
          <div className="mw-advanced-category-body">
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
                {isOutsidePolicy(config.sensorId, id) ? t(" (choix conservé)") : ""}
              </option>
            ))}
          </select>
        </label>
        {magnetAlias ? (
          <p className="mw-help t-caption">
            {msg("Correspondance documentaire : {0}", [magnetAlias])}
          </p>
        ) : null}
        {magnetOutsidePolicy && (
          <p className="mw-help" data-testid="magnet-outside-policy">
            {t(
              "Cet aimant vient d'un choix déjà enregistré : il reste affiché tel quel et n'est plus proposé pour ce capteur.",
            )}
          </p>
        )}
          {guideMaterialsBlock}
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
                    : guideDemoRange
                      ? "Plage du guide disponible"
                      : "Distances non renseignées pour ce couple",
                )}
              </option>
              <option value="education">{t("Démonstration · distances fictives")}</option>
            </select>
            <p>{reference ? basisLabel : t("Forme cotée · champ et seuils fictifs")}</p>
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
          </div>
        </details>
        <details
          className="mw-advanced-category"
          data-testid="advanced-positioning"
          open={positioningOpen}
          onToggle={(event) => setPositioningOpen(event.currentTarget.open)}
        >
          <summary>{t("Positionnement du capteur et de l’aimant")}</summary>
          <div className="mw-advanced-category-body">
            {travelControls}
        {!isPcbSensor(config.sensorId) ? (
          <details
            className="mw-cable-settings"
            open={cableOpen}
            onToggle={(event) => setCableOpen(event.currentTarget.open)}
          >
            <summary>{t("Trajet du câble")}</summary>
            {cableRouting ? (
              <button
                className="mw-button mw-secondary mw-wide"
                aria-pressed={tool === "cable"}
                data-testid="cable-tool-toggle"
                disabled={!machine}
                onClick={() => chooseTool(tool === "cable" ? "navigate" : "cable")}
              >
                {t(tool === "cable" ? "Arrêter le pointage" : "Pointer le câble dans la 3D")}
              </button>
            ) : null}
            {!machine ? (
              <p className="mw-help">
                {t(
                  "Le pointage du trajet du câble nécessite l’import de votre modèle 3D. La longueur souhaitée se règle dans « Choix du produit ».",
                )}
              </p>
            ) : null}
          </details>
        ) : null}
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
          <p className="mw-help">
            {t(
              "Les couleurs repèrent l'aimant. Polarité non caractérisée : aucun changement de polarité ni effet calculé.",
            )}
          </p>
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
            measure={machine ? (markerReading(machine, cycleU(machine, sample.t))?.distance ?? null) : null}
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
              {
                // L'export doit rester relisible par « Importer » (limite de taille).
                let text: string;
                try {
                  text = pedagogical ? JSON.stringify({kind:"pedagogical-workshop",version:1,config,settings:experiment,profile:EXPERIMENT,progress,limits:{qualified:false,requiresGlbReimport:true,remoteClips:false}}) : workshopExportJson(config);
                } catch {
                  setError(t("Montage trop volumineux pour être réimporté : réduisez le nombre de pièces mobiles sélectionnées."));
                  return;
                }
                download("montage-magnetique.json", text, "application/json");
              }
            }
          >
            {t("Télécharger le fichier de montage")}
          </button>
        </details>
        <details className="mw-workshop-example">
          <summary>{t("Exemple : machine à café")}</summary>
          <button className="mw-button mw-secondary" onClick={exampleMachine}>
            {t("Ouvrir la machine à café")}
          </button>
          <a href="/models/machine-cafe-bac-mobile.glb" download>
            {t("Télécharger le fichier 3D")}
          </a>
        </details>
          </div>
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
        <label>
          <input
            type="checkbox"
            checked={showMagnetName}
            onChange={(e) => setShowMagnetName(e.target.checked)}
          />
          {t("Nom de l’aimant")}
        </label>
        {!machine && (
          <>
            <label>
              <input type="checkbox" checked={showDistance} onChange={(e) => setShowDistance(e.target.checked)} />
              {t("Distance capteur–aimant")}
            </label>
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

  /* Display toggles affect visibility only. The illustrative circuit is always present. */
  const pedagogicalDisplayMenu = (
    <details className="mw-display-menu" data-testid="display-menu">
      <summary>{t("Affichage ⌄")}</summary>
      <div className="mw-display-body">
        <label>
          <input type="checkbox" checked={showNames} onChange={(e) => setShowNames(e.target.checked)} />
          {t("Nom capteur")}
        </label>
        <label>
          <input type="checkbox" checked={showMagnetName} onChange={(e) => setShowMagnetName(e.target.checked)} />
          {t("Nom de l’aimant")}
        </label>
        {!machine && <label>
          <input type="checkbox" checked={showDistance} onChange={(e) => setShowDistance(e.target.checked)} />
          {t("Distance capteur–aimant")}
        </label>}
        <label>
          <input type="checkbox" checked={dimensions} onChange={(e) => setDimensions(e.target.checked)} />
          {t("Dimensions")}
        </label>
        <label>
          <input type="checkbox" checked={zones} onChange={(e) => setZones(e.target.checked)} />
          {t("Zones de détection")}
        </label>
        <label>
          <input type="checkbox" checked={xray} onChange={(e) => setXray(e.target.checked)} />
          {t("Voir les contacts")}
        </label>
        <button
          className="mw-text-button"
          onClick={() => {
            setFocus("assembly");
            setResetEpoch((v) => v + 1);
          }}
        >
          {t("Recadrer")}
        </button>
      </div>
    </details>
  );

  return (
    <main className={`mw mw-stage immersive ${pedagogical?"mw-pedagogical":""} ${clientPedagogical ? "mw-client-pedagogical" : ""} ${embedded ? "mw-embedded" : "mw-autonomous"} ${machine ? "mw-imported" : ""}`} aria-label={t("Atelier 3D")}>
      {productCard && !pedagogical && (
        <SensorCard
          key={sensor.id}
          sensorId={sensor.id}
          contact={sample.contact}
          onClose={() => setProductCard(false)}
        />
      )}
      {!embedded && (
        <AppHeader
          logoVariant="mark"
          tone="reversed"
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
      {(!machine || catalogue) && (
        <div className="mw-playback-bar" data-testid="workshop-playback-bar">
          {playButton}
        </div>
      )}
      <div className="mw-stage-grid">
        <aside className="mw-controls">
          {clientPedagogical && !exploring && <ClientPedagogicalControls config={config} update={patch=>update(patch,{keepTime:true})} onCatalog={()=>setCatalogOpen(true)} onCable={()=>chooseTool('cable')} approachControls={approachPicker}/>}
          {clientPedagogical && exploring && <div className="notice-info" data-testid="client-exploration"><p className="t-body">{t(CLIENT_LIMITS.exploration)}</p><Button variant="secondary" onClick={endExploration}>{t('Revenir au couple de mon dossier')}</Button></div>}
          {pedagogical && (!clientPedagogical || exploring) && <PedagogicalControls diagnosis={diagnosis} timelineNote={<p className="t-caption" data-testid="pedagogical-timeline-limits">{t("Capacité d’activation estimée ; réouverture non caractérisée : Ton/Toff non documentés")} · {t("Résolution des traversées non certifiée ; un passage rapide peut être manqué.")}{pedTimeline && <> · <span className="t-metric">{pedTimeline.events.length}</span> {t("transitions de placement")}{pedTimeline.events.some(e=>!e.resolved)&&<> · {t("Événement non résolu")}</>}</>}</p>} settings={activeExperiment} setSettings={setExperiment} config={config} update={patch=>update(patch,{keepTime:true})} mounting={config.machine&&envelopes?{parts:envelopes.length,reedOverlap}:null} frame={pedagogicalPose} busy={sampled.busy} volume={sampled.volume} failed={sampled.failed} canUndo={placementUndo!==null} onUndo={()=>{if(placementUndo){setConfig(placementUndo);setPlacementUndo(null);setSuggestion(null);}}} onSuggest={()=>{const candidate=suggestPedagogicalConfig(config,progress,experiment);if(!candidate){setError(t("Aucune suggestion disponible dans les libertés déclarées."));return;}setSuggestion(candidate);}} />}
          {suggestion && <div className="notice-info"><p>{t("Placement proposé : appliquer explicitement, puis recalculer")}</p><Button onClick={()=>{setPlacementUndo(config);setConfig(suggestion);setSuggestion(null);setPlaying(false);}}>{t("Appliquer le placement proposé")}</Button><Button variant="secondary" onClick={()=>setSuggestion(null)}>{t("Annuler")}</Button></div>}
          {!pedagogical && <>{!machine && approachPicker}
          {!machine && activationDistanceControl}</>}
          {machine ? (
            <MachineGuide
              pedagogical={pedagogical}
              state={guideState}
              setState={setGuideState}
              config={bodyConfig}
              asset={machineAsset}
              tool={tool}
              setTool={chooseTool}
              onChange={machineChange}
              onChangeAtTime={(patch) => machineChange(patch, { keepTime: true })}
              history={{
                canUndo:
                  historyRef.current.key === machine.assetKey && historyRef.current.past.length > 0,
                canRedo:
                  historyRef.current.key === machine.assetKey && historyRef.current.future.length > 0,
                undo: () => travelHistory("undo"),
                redo: () => travelHistory("redo"),
              }}
              sample={pedagogical ? {...sample,contact:"unknown"} : sample}
              progress={progress}
              setProgress={(v) => {
                stopPreparation();
                setPlaying(false);
                setProgress(v);
              }}
              playing={playing}
              // Catalogue playback stays in the persistent bar, including during setup.
              playControl={catalogue ? false : undefined}
              setPlaying={(value) => { if(!value)stopPreparation(); setPlaying(value); }}
              reason={result.reason}
              onDemo={openDemo}
              onMarkers={setMarkers}
              reduced={reduced}
              events={events}
              resolution={resolution}
              illustration={illustration}
              anyKnown={result.samples.some((x) => x.contact !== "unknown")}
            />
          ) : null}
          {!pedagogical && <>{machine && activationDistanceControl}</>}
          {!pedagogical && <>{advancedSettings}</>}
          {pedagogical && (!clientPedagogical || exploring) && <details className="mw-file-tools"><summary>{t("Exporter le montage")}</summary><Button variant="secondary" onClick={()=>download("atelier-pedagogique.json",JSON.stringify({kind:"pedagogical-workshop",version:1,config,settings:experiment,profile:EXPERIMENT,progress,limits:{qualified:false,requiresGlbReimport:true,remoteClips:false}}),"application/json")}>{t("Télécharger le fichier de montage")}</Button><label className="mw-file-label">{t("Importer un fichier de montage")}<input type="file" accept=".json" onChange={e=>void importFile(e.target.files?.[0])}/></label></details>}
      {!embedded && !pedagogical ? (
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
      {!pedagogical && <footer className="mw-footer">
        <p>
          {/* Une seule phrase : la provenance des distances et la limite qui va
              avec. L'état d'enregistrement, lui, vit dans la barre du panneau. */}
          {/* Sans distance publiée pour ce couple, on ne prétend PAS en afficher :
              le pied de page dit alors que la commutation est illustrative. */}
          {/* Avec une ligne nominale publiée pour la classe choisie mais une
              simulation toujours illustrative, le pied de page nomme cette
              source sans la présenter comme caractéristique du montage. */}
          {reference && !illustrative ? (
            t(
              "Distances typiques publiées par Standex pour ce couple, dans cette position. À confirmer par un essai dans votre application.",
            )
          ) : reference && illustration.kind === "nominal" ? (
            t(
              "La commutation illustrative utilise les distances nominales publiées pour la classe choisie. Ces valeurs ne caractérisent pas votre montage et doivent être validées par des essais.",
            )
          ) : reference && guideRangesAvailable ? (
            t(
              "Le guide d'activation publie des plages de mesure pour ce couple, mais aucun seuil de fermeture ni de réouverture : la commutation montrée est illustrative et doit être validée par des essais.",
            )
          ) : reference ? (
            t(
              "Aucune distance publiée pour ce couple : la commutation montrée est illustrative et doit être validée par des essais.",
            )
          ) : (
            <>
              <strong>{t("Illustration pédagogique.")}</strong> {t(EDUCATION_NOTE)}
            </>
          )}{" "}
          <a
            href={
              guideDemoRange
                ? ACTIVATION_GUIDE.source.url
                : reference
                  ? DISTANCE_SOURCE
                  : INTERACTION_SOURCE
            }
            target="_blank"
            rel="noreferrer"
          >
            {t("Source Standex ↗")}
          </a>
        </p>
      </footer>}

      {!pedagogical && <details className="mw-summary">
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
      </details>}
        </aside>
        <section className="mw-main" aria-label={t("Simulation du montage")}>
          <details className="mw-primary-menu" open={primaryMenuOpen} onToggle={(e) => setPrimaryMenuOpen(e.currentTarget.open)}>
            <summary>{t("Modèle et résultat")}</summary>
          <div className="mw-primary-actions">
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
            {pendingUnits && (
              <div className="mw-units-retry notice-warning" role="group" data-testid="units-retry"
                aria-label={t("Unités du nouveau fichier")}>
                <p className="t-body">
                  {msg("{0} : refusé avec les unités « {1} ». Choisissez les unités du fichier puis réessayez. Le montage actuel reste inchangé.", [
                    pendingUnits.fileName,
                    UNIT_LABEL[pendingUnits.tried] ? t(UNIT_LABEL[pendingUnits.tried]!) : String(pendingUnits.tried),
                  ])}
                </p>
                <label className="mw-select-label">
                  {t("Unités du fichier")}
                  <select
                    data-testid="units-retry-select"
                    value={pendingUnits.choice}
                    onChange={(e) => setPendingUnits({ ...pendingUnits, choice: Number(e.target.value) })}
                  >
                    {[1000, 1, 10].map((v) => (
                      <option key={v} value={v}>{t(UNIT_LABEL[v]!)}</option>
                    ))}
                  </select>
                </label>
                <div className="mw-guide-row">
                  <button className="mw-button" data-testid="units-retry-go" onClick={() => void retryUnits()}>
                    {t("Réessayer avec ces unités")}
                  </button>
                  <button className="mw-button mw-secondary" onClick={() => { setPendingUnits(null); setError(null); }}>
                    {t("Annuler l'import")}
                  </button>
                </div>
              </div>
            )}
            <details className="mw-demo-shortcut" data-testid="demo-shortcut">
              <summary>{t("Essayer un modèle de démonstration")}</summary>
              <DemoButtons onDemo={openDemo} onCoffee={exampleMachine} />
            </details>

            <button
              className="mw-button"
              onClick={() => {
                if(clientPedagogical){const product=exploring?originalConfig.current:config;if(!product)return;onClientPedagogicalResult?.(clientPedagogicalResult(product,exploring?originalProgress.current:progress));if(exploring)endExploration();return;}
                if(staffPedagogical){onClose();return;}if(onResult)onResult(testedPair());else onClose();
              }}
            >
              {clientPedagogical ? t("Valider ce choix et voir le résultat") : pedagogical ? t("Fermer") : t("Valider ce choix et voir le résultat")}
            </button>
          </div>
          </details>
          {machine && (
            <div className="mw-camera-actions" role="group" aria-label={t("Cadrage de la scène")}>
              <select className="mw-camera-select" aria-label={t("Cadrage de la scène")} value={focus}
                onChange={(e) => { setFocus(e.target.value as MachineFocus); setResetEpoch((v) => v + 1); }}>
                <option value="assembly">{t("Vue d’ensemble")}</option>
                <option value="moving">{t("Cadrer la pièce mobile")}</option>
                <option value="sensor">{t("Cadrer le capteur")}</option>
                <option value="magnet">{t("Cadrer l’aimant")}</option>
              </select>
              {/* i18n-canonical : libellés français traduits au rendu par t(). */}
              {([
                ["assembly", "Vue d’ensemble"],
                ["moving", "Cadrer la pièce mobile"],
                ["sensor", "Cadrer le capteur"],
                ["magnet", "Cadrer l’aimant"],
              ] as const).map(([next, label]) => (
                <Button key={next} className="mw-button mw-secondary" data-testid={"camera-" + next}
                  aria-pressed={focus === next} onClick={() => { setFocus(next); setResetEpoch((v) => v + 1); }}>
                  {t(label)}
                </Button>
              ))}
            </div>
          )}
          {catalogue ? <div className="mw-verdict-banner notice-info" role="status" data-testid="client-pedagogical-verdict"><strong className="t-title-s">{t(PLACEMENT_LABEL[placement.state])}</strong><span className="t-caption">{t(CATALOGUE_LABELS.notice)}</span><span className="t-body">{t(catalogueProfile?CATALOGUE_LABELS[catalogueProfile.status]:CATALOGUE_LABELS.analogy)}</span>{catalogueProfile&&catalogueVerdictNotes(config,catalogueProfile).map(n=><span key={n} className="t-caption" data-testid="catalogue-verdict-note">{t(n)}</span>)}<span className="t-caption">{t(placement.state==='favorable'?'Zones d’activation estimées':placement.cause==='overlap'?'Collision du corps de l’aimant avec l’enveloppe ou le montage':'Position ou orientation à vérifier avec Standex')}</span>{pivotT!==null&&playing&&<span className="t-caption">{t(orientationTransition?'La forme varie rapidement près de cette orientation. Mettre en pause pour affiner les zones.':'Pendant la lecture, les zones montrent l’orientation préparée la plus proche')}</span>}{clientPedagogical && <PivotNotes failed={prepFailed} hidden={pivotHidden} />}</div> : pedagogical ? <PedagogicalBanner evidence={placement} diagnosis={diagnosis} remedy={remedy} onPropose={r=>{if(r.kind==="verified")setSuggestion(r.config);}}/> : verdictBanner}
          {catalogue&&preparing&&<div className="notice-info t-body" role="status" data-testid="zones-preparation">{t('Préparation des zones : le mouvement démarrera automatiquement.')} <span className="t-metric">{prepSeconds} s{prepProgress.total>0?' · '+prepProgress.done+'/'+prepProgress.total:''}</span></div>}
          {clientPedagogical&&exploring&&<p className="notice-info t-body" data-testid="client-exploration-context">{t('Exemple générique — ce résultat ne concerne pas le couple de votre dossier')}</p>}
          <div
            className="mw-canvas"
            role={pedagogical?"group":"img"}
            aria-label={msg("Montage {0}. {1}.", [
              machine
                ? machine.fileName
                : reference
                  ? t(config.geometry)
                  : t(motionLabels[config.motion]),
              t(pedagogical?PLACEMENT_LABEL[placement.state]:contactLabel[sample.contact]),
            ])}
          >
            {pedagogical && zones && (preparing || (view === "top" && !playing ? cutSampled.busy : sampled.busy)) && <div className="mw-zone-loading" role="status" aria-label={t("Calcul des volumes en cours…")} data-testid="zone-loading"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" aria-hidden="true"><path d="M12 3a9 9 0 1 1-9 9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg></div>}
            <div className="mw-scene-tools">
              {/* La source des distances est portée par le bandeau de verdict.
                  Elle n'est répétée sur la scène que pour une référence
                  fictive, où l'avertissement doit rester sous les yeux. */}
              {!pedagogical && <>{basis === "fictitious" ? (
                <span className="mw-kind education">{basisLabel}</span>
              ) : null}</>}
              <div className="mw-view-switch">
                <button aria-pressed={view === "3d"} onClick={request3d}>
                  3D
                </button>
                <button aria-pressed={view === "top"} onClick={() => setView("top")}>
                  {t(pedagogical ? "Vue en coupe" : "Vue plane")}
                </button>
              </div>
              {clientPedagogical ? pedagogicalDisplayMenu : !pedagogical ? displayMenu : null}
            </div>
            {/* Circuit de principe réintégré pour le parcours client (demande du 28/10) : même instant,
                même moteur que le bandeau ; le banc staff conserve son rendu sans circuit. */}
            {clientPedagogical ? <div className="mw-circuit-ped" data-testid="pedagogical-circuit"><span className="t-caption">{t(layerClassName==='A'?"Circuit de principe · état indicatif":"Contact illustratif · exemplaire très sensible")}</span><ContactCircuit contact={circuitContact??'open'} unavailable={circuitContact===null} /></div> : !pedagogical ? <ContactCircuit contact={sample.contact} /> : null}
            {/* Outil de pointage du câble : seulement quand le pointage est
                réellement actif. Les trajets existants restent intacts. */}
            {!exploring && cableRouting && tool === "cable" ? (
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
            {pedagogical && view === "top" ? (playing && !catalogue ? <p className="notice-info t-body" data-testid="cut-paused-note">{t('Mettez en pause pour voir la coupe à cet instant')}</p> : <PedagogicalCut volume={cutVolume} planeZ={catalogue?CATALOGUE_CUT_PLANE_Z:undefined} frame={pedagogicalPose} body={catalogueProfile?.body} bodyParts={catalogue&&config.sensorId==='CUSTOM'?catalogueBodyObbs(config):undefined} reedCentre={catalogueProfile?.centre} reedMm={catalogueProfile?CATALOGUE_RESPONSE.effectiveLengthMm*catalogueProfile.lengthMm/14:undefined} zones={zones} thresholds={catalogue?layerThresholds:null}/>) : machine ? (
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
                  key={"machine:" + machine.assetKey}
                  onError={failed3d}
                  fallback={<div className="mw-loading">{t("La scène 3D a été interrompue.")}</div>}
                >
                  <Suspense
                    fallback={<div className="mw-loading">{t("Préparation de la machine…")}</div>}
                  >
                    <MachineScene
                      pedagogicalLayer={experimentalLayer}
                      hideElectrical={pedagogical}
                      showIllustrativeContacts={catalogue&&circuitContact!==null}
                      asset={machineAsset}
                      config={config}
                      sample={pedagogical ? {...sample,contact:circuitContact??"unknown"} : sample}
                      view={view}
                      focus={machine ? focus : focus === "sensor" ? "sensor" : "assembly"}
                      resetEpoch={resetEpoch}
                      tool={tool}
                      transformMode={transformMode}
                      showMachine={showMachine}
                      showSpace={showSpace}
                      xray={!pedagogical||catalogue ? xray : false}
                      showNames={showNames}
                      showMagnetName={showMagnetName}
                      reduced={reduced}
                      onChange={machineChange}
                      onMarkers={setMarkers}
                      onPlaced={() => setTool("navigate")}
                      onContextLost={failed3d}
                      ghost={ghost}
                      guide={overlay}
                      routing={
                        !exploring && cableRouting
                          ? {
                              slot: cableRouting.slot,
                              points: cableRouting.points,
                              targetLabel: cableRouting.targetLabel,
                              onPick: (point) => {if(!exploring)cableRouting.onPick(point, sample.t);},
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
                sample={pedagogical ? {...sample,contact:"unknown"} : sample}
                samples={pedagogical ? result.samples.map(s=>({...s,contact:"unknown" as const})) : result.samples}
                xray={pedagogical ? false : xray}
                dimensions={dimensions}
                showNames={showNames}
                showMagnetName={showMagnetName}
                zones={pedagogical ? false : zones}
                focus={focus === "sensor" ? "sensor" : "assembly"}
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
                      sample={pedagogical ? {...sample,contact:"unknown"} : sample}
                      samples={pedagogical ? result.samples.map(s=>({...s,contact:"unknown" as const})) : result.samples}
                      xray={pedagogical ? false : xray}
                      dimensions={dimensions}
                      showNames={showNames}
                      showMagnetName={showMagnetName}
                      zones={pedagogical ? false : zones}
                      focus={focus === "sensor" ? "sensor" : "assembly"}
                    />
                  </div>
                }
              >
                <Suspense
                  fallback={<div className="mw-loading">{t("Préparation de votre montage…")}</div>}
                >
                  <Scene
                    pedagogicalLayer={experimentalLayer}
                    hideElectrical={pedagogical}
                    showIllustrativeContacts={catalogue&&circuitContact!==null}
                    config={config}
                    resetEpoch={resetEpoch}
                    onContextLost={failed3d}
                    sample={pedagogical ? {...sample,contact:circuitContact??"unknown"} : sample}
                    samples={pedagogical ? result.samples.map(s=>({...s,contact:"unknown" as const})) : result.samples}
                    view={view}
                    zones={pedagogical ? false : zones}
                    field={pedagogical ? false : field}
                    xray={!pedagogical||catalogue ? xray : false}
                    dimensions={dimensions}
                    showNames={showNames}
                    showMagnetName={showMagnetName}
                    showDistance={showDistance}
                    focus={focus === "sensor" ? "sensor" : "assembly"}
                    reduced={reduced}
                    ghost={ghost}
                  />
                </Suspense>
              </SceneBoundary>
            )}
            {!pedagogical && <p className="mw-orbit-help">
              <Expand size={13} />
              {t(
                view === "3d"
                  ? "Glisser pour tourner · molette pour zoomer"
                  : "Vue plane · même montage et même calcul",
              )}
            </p>}
          </div>
          {/* Chronologie du cycle : mêmes échantillons que la scène et le verdict. */}
          <div className="mw-cycle" aria-label={t("Chronologie du cycle")}>
            {pedagogical && <p className="t-caption">{t("Chronologie des états de placement, pas du contact électrique.")}</p>}
            {!pedagogical && <>
            <div className="mw-cycle-head">
              {timelineContacts.map((contact, index) => (
                <span
                  key={index}
                  className={contact === "unknown" ? "mw-cycle-state-unknown" : undefined}
                >
                  {t(contactLabel[contact])}
                </span>
              ))}
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
            </>}
            {pedagogical && <div className="mw-ped-timeline">{pedTimeline?.points.slice(0,-1).map((p,i)=><span key={p.t} style={{width:`${((pedTimeline.points[i+1]?.t??p.t)-p.t)*100}%`}} data-state={p.state} title={`${t(PLACEMENT_LABEL[p.state])} · ${p.t.toFixed(6)}–${pedTimeline.points[i+1]?.t.toFixed(6)}`}/>)}</div>}
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
                stopPreparation();
                setPlaying(false);
                setProgress(Number(e.target.value) / 100);
              }}
            />
            {clientPedagogical && !exploring ? <div className="mw-legend" data-testid="client-product-legend"><span>{config.sensorId} + {config.magnetModel}</span><span className="mw-ped-high">{t("Zone favorable estimée")}</span><span className="mw-ped-low">{t("Dépend de la sensibilité")}</span><span className="mw-ped-gray">{t("Positions où l’aimant rencontrerait ce corps")}</span>{layerThresholds?.low!=null&&<span>{t('Zone jaune : activation possible selon l’exemplaire. La lampe illustre la borne la plus sensible de la classe, pas une activation garantie.')}</span>}<span>{t('Le repère indique le centre magnétique estimé ; c’est sa position dans les lobes qui commande la lampe.')}</span>{sampled.failed&&<span>{t("Calcul des zones interrompu")}</span>}{sampled.volume?.truncated&&<span>{msg("Lobes tronqués aux limites du domaine affiché ±{0} mm ; aucune fermeture physique déduite.",[sampled.volume.extent])}</span>}<span>{t(CATALOGUE_LABELS.notice)}</span></div> : pedagogical ? <div className="mw-legend" data-testid="pedagogical-legend"><span className="mw-ped-high">{t("Zone favorable estimée")}</span><span className="mw-ped-low">{t("Dépend de la sensibilité")}</span><span className="mw-ped-body">{t("Capteur générique, reed 66 monté")}</span><span className="mw-ped-gray">{t("Positions où l’aimant rencontrerait ce corps")}</span>{machine&&<span className="mw-ped-hatch">{t("Chevauchement possible avec une pièce du montage — à vérifier")}</span>}<span>{t("Estimation indicative")}</span></div> : <div className="mw-legend">
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
            </div>}
          </div>
        </section>
      </div>
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

    </main>
  );
}
