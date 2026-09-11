import type { Vec3, Pose } from "./geometry";
import { finiteVec, fingerprint } from "./geometry";

export const MOUNTING_CONTRACT_VERSION = 1 as const;
/** Message principal imposé dès que le comportement n'est pas couvert par une source. */
export const REAL_WORLD_TEST_MESSAGE =
  "Le comportement du capteur nécessite des tests en environnement réel";

export type Coverage = "covered" | "partial" | "outside";
export type Verdict = "expected" | "not_expected" | "undetermined";
export type ContactState = "open" | "closed" | "unknown";

export type Magnetization = "axial" | "diametral" | "thickness";
export type MotionKind = "approach" | "slide" | "pivot";
export interface MountingCouple {
  sensorId: string;
  magnetId: string;
  sensitivityClass: string;
  approachId: string;
  /** Aimantation et polarité déclarées : hors gabarit, la source ne couvre rien. */
  magnetization: Magnetization;
  polarity: 1 | -1;
}
export interface MountingMotion {
  kind: MotionKind;
  /** État de contact au départ, inconnu par défaut : jamais supposé ouvert. */
  initialContact: ContactState;
  /** Orientation PROPRE du capteur par rapport à l'axe réel du mouvement.
   * À distinguer de `anchor.rotationDeg`, qui est la rotation GLOBALE du couple :
   * tourner l'ensemble capteur + aimant + trajectoire ne change rien au gabarit,
   * tourner le capteur seul en sort. Absent des contrats antérieurs : lu comme 0. */
  sensorYawDeg: number;
}
export interface MountingAttachment {
  /** `custom_model` : montage importé par l'utilisateur, datums non caractérisés. */
  frame: "template" | "custom_model";
  /** Nœud parent dans le modèle importé, conservé tel quel. */
  parentNode: string | null;
  movingPart: boolean;
}
export interface MountingTravel {
  /** Entrefers de surface en mm, jamais des distances de centres. */
  startGapMm: number;
  endGapMm: number;
}
export interface MountingEnvironment {
  ferrousNearby: boolean;
  temperature: "ambient" | "other";
}
export interface MountingNeed {
  closedFromPct: number;
  closedToPct: number;
}
export interface MountingCable {
  points: Vec3[];
  lengthMm: number | null;
}
export interface MountingTransition {
  t: number;
  contact: ContactState;
  gapMm: number;
}
export interface MountingComputed {
  inputsHash: string;
  coverage: Coverage;
  coveredFraction: number;
  evidence: "published_typical" | "schematic" | "uncharacterised";
  verdict: Verdict;
  /** Phrase principale affichée ; exacte et imposée hors domaine. */
  mainMessage: string;
  reasons: string[];
  limits: string[];
  pullInMm: number | null;
  dropOutMm: number | null;
  transitions: MountingTransition[];
  uncoveredSegments: [number, number][];
}
export interface GuidedMounting {
  version: typeof MOUNTING_CONTRACT_VERSION;
  /** `education` = démonstration pédagogique : jamais un résultat de sélection. */
  mode: "reference" | "education";
  motion: MountingMotion;
  profileId: string | null;
  profileRevision: string | null;
  profileSource: string | null;
  couple: MountingCouple;
  /** Ancrage du capteur dans le repère du montage (monde ou modèle importé). */
  anchor: Pose;
  attachment: MountingAttachment;
  /** Pose de l'aimant dans le repère capteur : orientation et décalage latéral. */
  relative: Pose;
  travel: MountingTravel;
  environment: MountingEnvironment;
  need: MountingNeed | null;
  cable: MountingCable | null;
  computed: MountingComputed | null;
}
/** Entrées dont dépend `computed`. Tout changement ici périme le résultat. */
export function mountingInputs(m: GuidedMounting) {
  return {
    profileId: m.profileId,
    profileRevision: m.profileRevision,
    mode: m.mode,
    motion: m.motion,
    couple: m.couple,
    anchor: m.anchor,
    attachment: m.attachment,
    relative: m.relative,
    travel: m.travel,
    environment: m.environment,
    need: m.need,
  };
}
export const mountingHash = (m: GuidedMounting) => fingerprint(mountingInputs(m));
export const computedIsStale = (m: GuidedMounting) =>
  !m.computed || m.computed.inputsHash !== mountingHash(m);

const pose = (v: unknown): Pose | null => {
  if (!v || typeof v !== "object") return null;
  const x = v as Pose;
  return finiteVec(x.positionMm) && finiteVec(x.rotationDeg)
    ? { positionMm: [...x.positionMm] as Vec3, rotationDeg: [...x.rotationDeg] as Vec3 }
    : null;
};
/** Lecture stricte. Un `computed` importé n'est JAMAIS conservé : il est recalculé. */
export function parseGuidedMounting(raw: unknown): GuidedMounting | null {
  if (!raw || typeof raw !== "object") return null;
  const x = raw as GuidedMounting;
  if (x.version !== MOUNTING_CONTRACT_VERSION) return null;
  const anchor = pose(x.anchor),
    relative = pose(x.relative);
  if (!anchor || !relative) return null;
  const c = x.couple;
  if (
    !c ||
    typeof c.sensorId !== "string" ||
    typeof c.magnetId !== "string" ||
    typeof c.sensitivityClass !== "string" ||
    typeof c.approachId !== "string" ||
    !["axial", "diametral", "thickness"].includes(c.magnetization) ||
    (c.polarity !== 1 && c.polarity !== -1) ||
    [c.sensorId, c.magnetId, c.sensitivityClass, c.approachId].some((s) => !s || s.length > 64)
  )
    return null;
  const mo = x.motion;
  if (
    !mo ||
    !["approach", "slide", "pivot"].includes(mo.kind) ||
    !["open", "closed", "unknown"].includes(mo.initialContact) ||
    (mo.sensorYawDeg !== undefined && !Number.isFinite(mo.sensorYawDeg)) ||
    !["reference", "education"].includes(x.mode)
  )
    return null;
  const a = x.attachment;
  if (
    !a ||
    !["template", "custom_model"].includes(a.frame) ||
    typeof a.movingPart !== "boolean" ||
    !(a.parentNode === null || (typeof a.parentNode === "string" && a.parentNode.length <= 400))
  )
    return null;
  const tr = x.travel;
  if (
    !tr ||
    ![tr.startGapMm, tr.endGapMm].every((v) => typeof v === "number" && Number.isFinite(v)) ||
    tr.startGapMm <= tr.endGapMm ||
    tr.startGapMm > 400 ||
    tr.endGapMm < -50
  )
    return null;
  const env = x.environment;
  if (
    !env ||
    typeof env.ferrousNearby !== "boolean" ||
    !["ambient", "other"].includes(env.temperature)
  )
    return null;
  let need: MountingNeed | null = null;
  if (x.need !== null && x.need !== undefined) {
    const n = x.need;
    if (
      ![n.closedFromPct, n.closedToPct].every(
        (v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100,
      ) ||
      n.closedFromPct >= n.closedToPct
    )
      return null;
    need = { closedFromPct: n.closedFromPct, closedToPct: n.closedToPct };
  }
  let cable: MountingCable | null = null;
  if (x.cable !== null && x.cable !== undefined) {
    const points = x.cable.points;
    if (!Array.isArray(points) || points.length > 200 || !points.every(finiteVec)) return null;
    const length = x.cable.lengthMm;
    if (!(length === null || (typeof length === "number" && Number.isFinite(length) && length >= 0)))
      return null;
    cable = { points: points.map((p) => [...p] as Vec3), lengthMm: length ?? null };
  }
  return {
    version: MOUNTING_CONTRACT_VERSION,
    mode: x.mode,
    motion: {
      kind: mo.kind,
      initialContact: mo.initialContact,
      sensorYawDeg: mo.sensorYawDeg ?? 0,
    },
    profileId: typeof x.profileId === "string" && x.profileId.length <= 120 ? x.profileId : null,
    profileRevision:
      typeof x.profileRevision === "string" && x.profileRevision.length <= 120
        ? x.profileRevision
        : null,
    profileSource:
      typeof x.profileSource === "string" && x.profileSource.length <= 400 ? x.profileSource : null,
    couple: {
      sensorId: c.sensorId,
      magnetId: c.magnetId,
      sensitivityClass: c.sensitivityClass,
      approachId: c.approachId,
      magnetization: c.magnetization,
      polarity: c.polarity,
    },
    anchor,
    attachment: { frame: a.frame, parentNode: a.parentNode, movingPart: a.movingPart },
    relative,
    travel: { startGapMm: tr.startGapMm, endGapMm: tr.endGapMm },
    environment: { ferrousNearby: env.ferrousNearby, temperature: env.temperature },
    need,
    cable,
    computed: null,
  };
}
