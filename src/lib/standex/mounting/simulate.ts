import {
  documentedRelativeRotation,
  locatedProfile,
  profileFor,
  simulatedContactForm,
  thresholdsFor,
} from "./profiles";
import type { LocatedProfile, MountingProfile } from "./profiles";
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
import {
  add,
  approachAxisFor,
  bodiesCollide,
  halfExtent,
  bodyOf,
  lateralOffsetMm,
  scale,
  separationMm,
  sub,
} from "./geometry";
import type { Pose, Vec3 } from "./geometry";

export const SAMPLE_STEPS = 600;
/** Décalage entre entrefer de surface et distance de centres, sur l'axe d'approche. */
export function centreOffsetMm(m: GuidedMounting, profile: LocatedProfile): number {
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
export function lateralComponent(m: GuidedMounting, profile: LocatedProfile): Vec3 {
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
export function relativePoseAt(m: GuidedMounting, profile: LocatedProfile, t: number): Pose {
  const gap = gapAt(m, t);
  return {
    positionMm: add(lateralComponent(m, profile), scale(profile.axis, gap + centreOffsetMm(m, profile))),
    rotationDeg: [...m.relative.rotationDeg] as Vec3,
  };
}
/**
 * Pose de la scène à l'instant `t`, même sans profil publié.
 *
 * Sans profil, la pose relative valait `[0, 0, 0]` : l'aimant était réputé au
 * centre du capteur, ce qui n'est ni la scène affichée ni une distance
 * mesurable. On reconstruit donc la pose réellement dessinée à partir de l'axe
 * d'approche du gabarit, en conservant le décalage latéral déclaré. Aucune
 * donnée magnétique n'est fabriquée : c'est de la géométrie.
 */
export function scenePoseAt(m: GuidedMounting, profile: MountingProfile | null, t: number): Pose {
  const located = locatedProfile(profile);
  if (located) return relativePoseAt(m, located, t);
  const axis = approachAxisFor(m.couple.approachId, m.couple.sensorId);
  const fallback: LocatedProfile = { ...(profile ?? {}), axis } as LocatedProfile;
  return relativePoseAt(m, fallback, t);
}
export interface MountingSample {
  t: number;
  gapMm: number;
  /** Séparation géométrique réelle des deux enveloppes dans la scène, décalage
   * latéral et montage importé compris. Jamais un seuil de commutation. */
  separationMm: number;
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
  /** Commutation illustrative de proximité : voir `ILLUSTRATIVE_*`. */
  illustrative: boolean;
}

/* ------------------------------------------------------------------ */
/* Commutation ILLUSTRATIVE de proximité                               */
/* ------------------------------------------------------------------ */
/**
 * Quand aucune distance documentée n'est exploitable, la scène doit tout de
 * même montrer un contact qui commute à proximité — sinon l'atelier reste
 * indéterminé partout et n'apprend rien. Ces deux valeurs sont des repères
 * de LECTURE, pas des seuils : elles ne viennent d'aucune publication, ne sont
 * jamais recopiées dans `pullInMm`/`dropOutMm`, ne changent ni la couverture,
 * ni la preuve, ni le verdict, et l'interface comme les exports doivent porter
 * la mention « Simulation illustrative ».
 */
export const ILLUSTRATIVE_PULL_IN_MM = 15;
export const ILLUSTRATIVE_DROP_OUT_MM = 18;

/**
 * Repères d'animation illustrative, quand l'utilisateur a choisi une référence
 * et une approche du guide d'activation : les deux bornes de la PLAGE publiée
 * servent de repères de lecture pour que la démonstration de portée évolue avec
 * le matériau. Ce ne sont JAMAIS des seuils ON/OFF : `pullInMm`/`dropOutMm`
 * restent nuls, la couverture, la preuve et le verdict ne bougent pas, et la
 * mention permanente « animation indicative » accompagne l'affichage.
 * Sans plage exploitable, on retombe sur 15 / 18 mm.
 */
export interface IllustrativeBounds {
  nearMm: number;
  farMm: number;
}
/** Vrai quand des bornes de plage RÉELLEMENT publiées sont fournies : dans ce
 *  cas, aucun plafond générique ne vient les tronquer. */
export function hasIllustrativeBounds(bounds?: IllustrativeBounds | null): boolean {
  return (
    !!bounds &&
    Number.isFinite(bounds.nearMm) &&
    Number.isFinite(bounds.farMm) &&
    bounds.nearMm > 0 &&
    bounds.farMm > 0
  );
}
export function illustrativeMarks(bounds?: IllustrativeBounds | null): [number, number] {
  if (hasIllustrativeBounds(bounds)) return [bounds!.nearMm, bounds!.farMm];
  return [ILLUSTRATIVE_PULL_IN_MM, ILLUSTRATIVE_DROP_OUT_MM];
}


/**
 * Raisons qui interdisent toute commutation, même illustrative.
 *
 * La liste est volontairement courte, et c'est le cœur de la distinction entre
 * ILLUSTRER et QUALIFIER. Un environnement ferreux, une température autre que
 * l'ambiante, un mode démonstration, un décalage latéral ou une pose hors
 * gabarit ne sont PAS des raisons de laisser la scène inerte : la demande est de
 * montrer une réaction de proximité lisible, jamais de la faire passer pour une
 * mesure. Ces situations restent donc animées, mais avec le drapeau
 * `illustrative` et la mention permanente qui l'accompagne, et sans qu'aucun
 * seuil publié, aucune couverture ni aucun verdict ne bouge.
 *
 * Le seul refus absolu : un contact dont la forme n'est jamais simulée (1B/1C).
 * Les distances y sont lisibles au registre, elles ne sont pas animées. La
 * collision reste traitée échantillon par échantillon : deux corps qui
 * s'interpénètrent n'affichent pas d'état.
 */
const ILLUSTRATIVE_BLOCKERS = new Set([
  "CONTACT_FORM_NOT_SIMULATED",
  "POLARITY_NOT_TEMPLATE",
  "MAGNETIZATION_NOT_TEMPLATE",
]);
/** Au-delà de cette séparation réelle, l'état illustratif est TOUJOURS ouvert. */
export const ILLUSTRATIVE_FAR_MM = 20;

/** Vrai si l'on peut montrer une commutation illustrative pour ce montage. */
export function illustrativeAllowed(reasons: readonly string[]): boolean {
  return !reasons.some((r) => ILLUSTRATIVE_BLOCKERS.has(r));
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
  const located = locatedProfile(profile);
  if (!profile) reasons.push("NO_PROFILE");
  else if (profile.localisation !== "axis_documented") reasons.push("APPROACH_NOT_LOCATED");
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
  // L'orientation attendue vient du PROFIL, pas d'un zéro codé en dur :
  // l'approche frontale F1 documente explicitement des faces en vis-à-vis
  // (180° autour de Y). Comparer à 0 rejetait la vraie pose documentée.
  const expected = documentedRelativeRotation(m.couple.approachId, m.couple.sensorId);
  if (m.relative.rotationDeg.some((a, i) => Math.abs(normalise(a - expected[i]!)) > NUMERIC_EPSILON))
    reasons.push("ORIENTATION_OFF_TEMPLATE");
  // Contacts 1B / 1C : distances publiées lisibles, jamais simulées.
  if (profile && !simulatedContactForm(profile, m.couple.sensitivityClass))
    reasons.push("CONTACT_FORM_NOT_SIMULATED");
  if (located && lateralOffsetMm(m.relative, located.axis) > NUMERIC_EPSILON)
    reasons.push("LATERAL_OFFSET");
  return reasons;
}
/**
 * Pose réellement DESSINÉE à l'instant `t`, quand la scène en connaît une.
 *
 * `scenePoseAt` ne sait reconstruire qu'un aller-retour sur l'axe d'approche :
 * il ignore la course d'un modèle importé (translation, pivot, nœud mobile) et
 * les mouvements `slide`/`pivot` de l'espace vide. Un aimant qui part à 100 mm
 * de côté y resterait donc « proche » parce que la course annonce 5 mm sur
 * l'axe. La scène, elle, sait où sont les deux pièces : quand elle fournit cet
 * échantillonneur, c'est LUI qui décide de la proximité et de la collision.
 *
 * Il ne touche jamais la qualification : les seuils publiés restent lus sur
 * l'entrefer nominal de la course, et un montage importé ou un mouvement hors
 * axe reste hors gabarit, donc non qualifié, exactement comme avant.
 */
export type ScenePoseSampler = (t: number) => Pose | null;

/** Vraie hystérésis : l'enclenchement et le relâchement ne partagent pas de seuil.
 * L'état initial reste inconnu tant qu'aucun seuil documenté n'a été franchi. */
export function simulateMounting(
  m: GuidedMounting,
  steps = SAMPLE_STEPS,
  profiles?: MountingProfile[],
  scenePose?: ScenePoseSampler,
  illustrativeBounds?: IllustrativeBounds | null,
): MountingSimulation {
  const profile = profileFor(
    m.couple.sensorId,
    m.couple.magnetId,
    m.couple.approachId,
    profiles,
  );
  const located = locatedProfile(profile);
  const reasons = globalReasons(m, profile);
  const pair = profile ? thresholdsFor(profile, m.couple.sensitivityClass) : null;
  const blocked = reasons.length > 0 || !pair || !located;
  const samples: MountingSample[] = [],
    transitions: MountingTransition[] = [];
  const collided: boolean[] = [];
  let contact: ContactState = "unknown",
    covered = 0;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps,
      gap = gapAt(m, t);
    // La pose vient de la scène RÉELLE quand elle en fournit une (montage
    // importé, glissement, pivot) ; sinon de la reconstruction sur l'axe.
    const relative = scenePose?.(t) ?? scenePoseAt(m, profile, t);

    const separation = separationMm(m.couple.sensorId, m.couple.magnetId, relative);
    const collides = bodiesCollide(m.couple.sensorId, m.couple.magnetId, relative);
    collided.push(collides);
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
    samples.push({
      t,
      gapMm: gap,
      separationMm: separation,
      covered: sampleCovered,
      contact,
      relative,
      outward: t > 0.5,
    });
  }
  const coveredFraction = covered / (steps + 1);
  const coverage: Coverage = covered === steps + 1 ? "covered" : covered > 0 ? "partial" : "outside";
  const allReasons = [
    ...reasons,
    ...(reasons.length === 0 && samples.some((s) => !s.covered) ? ["COLLISION_OR_CONTACT"] : []),
  ];

  // Aucune distance documentée exploitable : on montre une commutation de
  // PROXIMITÉ, pour que l'atelier reste lisible. `covered` reste faux, donc la
  // couverture, la preuve et le verdict ne bougent pas d'un iota : seul l'état
  // de contact affiché change, et il est marqué `illustrative`.
  //
  // La proximité est lue sur la SÉPARATION RÉELLE des deux enveloppes, pas sur
  // l'entrefer nominal de la course : un aimant écarté de 100 mm sur le côté est
  // loin, même si la course annonce 5 mm sur l'axe.
  const illustrative = coverage !== "covered" && illustrativeAllowed(allReasons);
  const [nearMark, farMark] = illustrativeMarks(illustrativeBounds);
  if (illustrative) {
    transitions.length = 0;
    let shown: ContactState = "unknown";
    const alwaysOpen = Math.max(farMark, ILLUSTRATIVE_FAR_MM);
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i]!;
      const d = s.separationMm;
      let next: ContactState = "unknown";
      if (!collided[i] && d > 0)
        next =
          d >= alwaysOpen
            ? "open"
            : d <= nearMark
              ? "closed"
              : d >= farMark
                ? "open"
                : shown;
      if (i > 0 && next !== shown && next !== "unknown")
        transitions.push({ t: s.t, contact: next, gapMm: s.gapMm });
      shown = next;
      samples[i] = { ...s, contact: next };
    }
  }



  return {
    samples,
    transitions,
    // `covered` exige la totalité du cycle : aucun pourcentage d'inconnu toléré.
    coverage,
    coveredFraction,
    reasons: allReasons,
    // Jamais de seuil inventé : hors domaine, les seuils publiés restent nuls.
    pullInMm: !blocked ? pair?.[0] ?? null : null,
    dropOutMm: !blocked ? pair?.[1] ?? null : null,
    illustrative,
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

export function computeMounting(
  m: GuidedMounting,
  profiles?: MountingProfile[],
  illustrativeBounds?: IllustrativeBounds | null,
): MountingComputed {
  const profile = profileFor(m.couple.sensorId, m.couple.magnetId, m.couple.approachId, profiles);
  const sim = simulateMounting(m, SAMPLE_STEPS, profiles, undefined, illustrativeBounds);
  const marks = illustrativeMarks(illustrativeBounds);
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
    // Le mode ILLUSTRATIF doit voyager avec le résultat : sans cette recopie, la
    // mention permanente n'apparaissait nulle part et l'essai enregistré ne
    // portait pas la marque. Les deux repères de lecture sont nommés comme tels,
    // jamais comme des seuils : `pullInMm` / `dropOutMm` restent nuls.
    ...(sim.illustrative
      ? {
          illustrative: true,
          illustrativePullInMm: marks[0],
          illustrativeDropOutMm: marks[1],
        }
      : {}),
  };
}

/** Recalcul systématique : un verdict importé n'est jamais cru. */
export function withComputed(m: GuidedMounting, profiles?: MountingProfile[]): GuidedMounting {
  return { ...m, computed: computeMounting(m, profiles) };
}
