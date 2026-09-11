import { profileFor, thresholdsFor } from "./profiles";
import type { MountingProfile } from "./profiles";
import { REAL_WORLD_TEST_MESSAGE } from "./contract";
import type {
  ContactState,
  Coverage,
  GuidedMounting,
  MountingComputed,
  MountingTransition,
  Verdict,
} from "./contract";
import { mountingHash } from "./contract";
import { add, bodiesCollide, halfExtent, bodyOf, lateralOffsetMm, scale, sub } from "./geometry";
import type { Pose, Vec3 } from "./geometry";

export const SAMPLE_STEPS = 600;
/** Décalage entre entrefer de surface et distance de centres, sur l'axe d'approche. */
export function centreOffsetMm(m: GuidedMounting, profile: MountingProfile): number {
  return (
    halfExtent(bodyOf(m.couple.sensorId, m.couple.magnetId, "sensor"), [0, 0, 0], profile.axis) +
    halfExtent(
      bodyOf(m.couple.sensorId, m.couple.magnetId, "magnet"),
      m.relative.rotationDeg,
      profile.axis,
    )
  );
}
/** Composante latérale conservée pendant la course : l'aller-retour ne bouge que l'axe. */
export function lateralComponent(m: GuidedMounting, profile: MountingProfile): Vec3 {
  const along = scale(profile.axis, dotAxis(m.relative.positionMm, profile.axis));
  return sub(m.relative.positionMm, along);
}
const dotAxis = (v: Vec3, axis: Vec3) => v[0] * axis[0] + v[1] * axis[1] + v[2] * axis[2];

export const gapAt = (m: GuidedMounting, t: number) => {
  const phase = Math.min(1, Math.max(0, t)),
    u = phase <= 0.5 ? phase * 2 : (1 - phase) * 2;
  return m.travel.startGapMm + (m.travel.endGapMm - m.travel.startGapMm) * u;
};
/** Pose relative de l'aimant à l'instant t. Déterministe : même t, même pose. */
export function relativePoseAt(m: GuidedMounting, profile: MountingProfile, t: number): Pose {
  const gap = gapAt(m, t);
  return {
    positionMm: add(lateralComponent(m, profile), scale(profile.axis, gap + centreOffsetMm(m, profile))),
    rotationDeg: [...m.relative.rotationDeg] as Vec3,
  };
}
export interface MountingSample {
  t: number;
  gapMm: number;
  covered: boolean;
  contact: ContactState;
  relative: Pose;
  outward: boolean;
}
export interface MountingSimulation {
  samples: MountingSample[];
  transitions: MountingTransition[];
  coverage: Coverage;
  coveredFraction: number;
  reasons: string[];
  pullInMm: number | null;
  dropOutMm: number | null;
}
/**
 * Epsilon purement numérique : il sert à comparer deux nombres flottants qui
 * devraient être mathématiquement égaux au gabarit exact. Ce n'est PAS une
 * tolérance physique qualifiée : aucun écart de montage n'est déclaré
 * acceptable tant que les datums ne sont pas caractérisés.
 */
export const NUMERIC_EPSILON = 1e-9;
/** Raisons globales : elles ne dépendent pas de l'instant du cycle. */
export function globalReasons(m: GuidedMounting, profile: MountingProfile | null): string[] {
  const reasons: string[] = [];
  if (!profile) reasons.push("NO_PROFILE");
  else if (profile.evidence !== "published_typical") reasons.push("SOURCE_NOT_QUALIFIED");
  else if (!profile.classes.includes(m.couple.sensitivityClass)) reasons.push("CLASS_NOT_PUBLISHED");
  if (m.attachment.frame === "custom_model") reasons.push("CUSTOM_MODEL_NOT_CHARACTERISED");
  if (m.environment.ferrousNearby) reasons.push("FERROUS_DECLARED");
  if (m.environment.temperature !== "ambient") reasons.push("TEMPERATURE_NOT_AMBIENT");
  if (m.mode !== "reference") reasons.push("EDUCATION_MODE");
  if (m.motion.kind !== "approach") reasons.push("MOTION_NOT_ON_APPROACH_AXIS");
  if (m.couple.magnetization !== "axial") reasons.push("MAGNETIZATION_NOT_TEMPLATE");
  if (m.couple.polarity !== 1) reasons.push("POLARITY_NOT_TEMPLATE");
  const normalise = (a: number) => (((a % 360) + 540) % 360) - 180;
  // La rotation GLOBALE du couple (`anchor`) n'est PAS une raison : elle tourne le
  // capteur, l'aimant et la trajectoire ensemble, donc la géométrie relative du
  // gabarit est inchangée. Seule l'orientation PROPRE du capteur par rapport à
  // l'axe réel du mouvement sort du gabarit publié.
  if (Math.abs(normalise(m.motion.sensorYawDeg)) > NUMERIC_EPSILON)
    reasons.push("SENSOR_ANGLE_OFF_TEMPLATE");
  if (m.relative.rotationDeg.some((a) => Math.abs(normalise(a)) > NUMERIC_EPSILON))
    reasons.push("ORIENTATION_OFF_TEMPLATE");
  if (profile && lateralOffsetMm(m.relative, profile.axis) > NUMERIC_EPSILON)
    reasons.push("LATERAL_OFFSET");
  return reasons;
}
/** Vraie hystérésis : l'enclenchement et le relâchement ne partagent pas de seuil.
 * L'état initial reste inconnu tant qu'aucun seuil documenté n'a été franchi. */
export function simulateMounting(
  m: GuidedMounting,
  steps = SAMPLE_STEPS,
  profiles?: MountingProfile[],
): MountingSimulation {
  const profile = profileFor(
    m.couple.sensorId,
    m.couple.magnetId,
    m.couple.approachId,
    profiles,
  );
  const reasons = globalReasons(m, profile);
  const pair = profile ? thresholdsFor(profile, m.couple.sensitivityClass) : null;
  const blocked = reasons.length > 0 || !pair || !profile;
  const samples: MountingSample[] = [],
    transitions: MountingTransition[] = [];
  let contact: ContactState = "unknown",
    covered = 0;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps,
      gap = gapAt(m, t);
    const relative = profile
      ? relativePoseAt(m, profile, t)
      : { positionMm: [0, 0, 0] as Vec3, rotationDeg: [...m.relative.rotationDeg] as Vec3 };
    const collides =
      profile !== null && bodiesCollide(m.couple.sensorId, m.couple.magnetId, relative);
    const sampleCovered = !blocked && !collides && gap > 0;
    if (sampleCovered) covered++;
    let next: ContactState = "unknown";
    if (sampleCovered && pair) {
      // Hors couverture, l'état repart d'inconnu : jamais de vert par héritage.
      const previous: ContactState = samples[i - 1]?.covered ? contact : "unknown";
      next = gap <= pair[0] ? "closed" : gap >= pair[1] ? "open" : previous;
    }
    if (i > 0 && next !== contact && next !== "unknown")
      transitions.push({ t, contact: next, gapMm: gap });
    contact = next;
    samples.push({ t, gapMm: gap, covered: sampleCovered, contact, relative, outward: t > 0.5 });
  }
  const coveredFraction = covered / (steps + 1);
  return {
    samples,
    transitions,
    // `covered` exige la totalité du cycle : aucun pourcentage d'inconnu toléré.
    coverage: covered === steps + 1 ? "covered" : covered > 0 ? "partial" : "outside",
    coveredFraction,
    reasons: [
      ...reasons,
      ...(reasons.length === 0 && samples.some((s) => !s.covered) ? ["COLLISION_OR_CONTACT"] : []),
    ],
    pullInMm: pair?.[0] ?? null,
    dropOutMm: pair?.[1] ?? null,
  };
}
/** Segments [début, fin] du cycle où aucune détection n'est affirmée. */
export function uncoveredSegments(sim: MountingSimulation): [number, number][] {
  const out: [number, number][] = [];
  let start: number | null = null;
  for (const s of sim.samples) {
    if (!s.covered && start === null) start = s.t;
    if (s.covered && start !== null) {
      out.push([start, s.t]);
      start = null;
    }
  }
  if (start !== null) out.push([start, 1]);
  return out;
}
/**
 * Échantillons couvrant [de, à] en pourcentage du cycle, bornes comprises et
 * échantillons encadrants inclus : entre deux échantillons, l'état n'est pas
 * connu, donc il n'est jamais réputé satisfait.
 */
export function windowOf(
  samples: MountingSample[],
  fromPct: number,
  toPct: number,
): MountingSample[] {
  const inside = samples.filter((s) => s.t * 100 >= fromPct && s.t * 100 <= toPct);
  const before = [...samples].reverse().find((s) => s.t * 100 < fromPct);
  const after = samples.find((s) => s.t * 100 > toPct);
  const first = inside[0];
  const last = inside[inside.length - 1];
  const out = [...inside];
  if (before && (!first || first.t * 100 > fromPct)) out.unshift(before);
  if (after && (!last || last.t * 100 < toPct)) out.push(after);
  return out;
}
export const LIMIT_CODES = [
  "typical_not_guaranteed",
  "datum_not_characterised",
  "schematic_template_only",
  "sensitivity_spread",
  "magnet_spread",
  "temperature_drift",
  "magnet_aging",
  "material_permeability",
  "assembly_misalignment",
  "contact_bounce",
  "switching_rate",
] as const;

export function computeMounting(m: GuidedMounting, profiles?: MountingProfile[]): MountingComputed {
  const profile = profileFor(m.couple.sensorId, m.couple.magnetId, m.couple.approachId, profiles);
  const sim = simulateMounting(m, SAMPLE_STEPS, profiles);
  const need = m.need;
  // Bornes exactes : les échantillons qui encadrent la fenêtre en font partie,
  // et une fenêtre sans aucun échantillon ne peut jamais valoir « satisfaite ».
  const windowSamples = need ? windowOf(sim.samples, need.closedFromPct, need.closedToPct) : [];
  let verdict: Verdict = "undetermined";
  if (sim.coverage === "covered" && sim.pullInMm !== null) {
    if (need)
      verdict =
        windowSamples.length === 0
          ? "undetermined"
          : windowSamples.every((s) => s.contact === "closed")
            ? "expected"
            : windowSamples.some((s) => s.contact === "unknown")
              ? "undetermined"
              : "not_expected";
    else
      verdict = sim.transitions.some((x) => x.contact === "closed")
        ? "expected"
        : sim.samples.every((s) => s.contact !== "unknown")
          ? "not_expected"
          : "undetermined";
  }
  const evidence =
    sim.coverage === "covered" && profile
      ? "published_typical"
      : profile
        ? "schematic"
        : "uncharacterised";
  return {
    inputsHash: mountingHash(m),
    coverage: sim.coverage,
    coveredFraction: sim.coveredFraction,
    evidence,
    verdict,
    mainMessage:
      verdict === "undetermined"
        ? REAL_WORLD_TEST_MESSAGE
        : verdict === "expected"
          ? "Détection prévue dans le modèle de référence, à confirmer par essais"
          : "Détection non prévue avec ces distances typiques",
    reasons: sim.reasons,
    limits: [...LIMIT_CODES],
    pullInMm: sim.pullInMm,
    dropOutMm: sim.dropOutMm,
    transitions: sim.transitions,
    uncoveredSegments: uncoveredSegments(sim),
  };
}
/** Recalcul systématique : un verdict importé n'est jamais cru. */
export function withComputed(m: GuidedMounting, profiles?: MountingProfile[]): GuidedMounting {
  return { ...m, computed: computeMounting(m, profiles) };
}
