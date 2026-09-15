/** Montage EXPLICITEMENT décrit par le client, lu dans sa réponse en texte libre.
 *
 * Pourquoi ce module existe : la réponse « screw or adhesive mounting » est une
 * CONTRAINTE DURE. Avant, elle ne servait à rien tant que le client n'avait pas
 * choisi une case de montage, si bien que des reeds destinés UNIQUEMENT au report
 * sur circuit imprimé (MK15, MK16, MK17…) restaient proposés pour une porte
 * vitrée à visser ou à coller.
 *
 * Règles tenues ici :
 * - « vis OU collage » veut dire AU MOINS UN des deux, jamais les deux à la fois ;
 * - un montage explicitement non-carte exclut DUREMENT les boîtiers qui n'ont que
 *   le report sur carte comme fixation documentée ;
 * - un montage explicitement sur carte reste possible et n'exclut alors rien ;
 * - rien n'est inventé : aucun adhésif, aucun indice de protection, aucune
 *   fixation « universelle » n'est attribué à un boîtier. Le collage n'est jamais
 *   présenté comme qualifié : il ouvre la candidature, la R&D confirme.
 * - une phrase qui ne dit rien de la fixation ne produit AUCUNE contrainte.
 */
import type { SensorModel, SensorShape } from "@/lib/standex/sensor-catalog";

export type MountingIntentKind = "screw" | "adhesive" | "press_fit" | "clamp" | "pcb";

/** Formes de boîtier dont la fixation décrite est documentée. Le collage porte sur
 * un boîtier ayant une surface d'appui : il n'ouvre pas les reeds nus CMS. */
const SHAPES_BY_INTENT: Readonly<Record<MountingIntentKind, readonly SensorShape[]>> = {
  screw: ["flange", "block", "threaded"],
  adhesive: ["flange", "block", "threaded", "cylinder", "pressfit"],
  press_fit: ["pressfit", "cylinder", "threaded"],
  clamp: ["cylinder", "threaded", "block", "flange"],
  pcb: ["smd", "glass"],
};

/** Motifs français ET anglais. Une même intention accepte plusieurs formulations.
 *
 * Aucun motif accentué ne se termine par `\b` : en JavaScript, « é » n'est pas un
 * caractère de mot, donc `/vissé\b/` ne reconnaît PAS « vissé » suivi d'un espace.
 * C'est exactement le piège qui laissait passer la réponse française. */
const PATTERNS: Readonly<Record<MountingIntentKind, readonly RegExp[]>> = {
  screw: [/\bviss/i, /\bvis\b/i, /\bécrou/i, /\bscrew/i, /\bbolt(s|ed)?\b/i, /\bnut(s)?\b/i],
  adhesive: [
    /\bcoll(e|er|é|age)/i,
    /\badhés/i,
    /\bruban\b/i,
    /\badhesive/i,
    /\bglue(d|ing)?\b/i,
    /\bdouble[- ]sided tape\b/i,
    /\btape[dr]?\b/i,
    /\bbond(ed|ing)\b/i,
  ],
  press_fit: [/\bemmanch/i, /\bencastr/i, /\bdans un trou\b/i, /\bpress[- ]?fit(ted)?\b/i, /\binto a hole\b/i],
  clamp: [/\bcollier/i, /\bbrid(e|é)/i, /\bclip/i, /\bclamp(ed|ing)?\b/i, /\bstrap(ped)?\b/i],
  pcb: [
    /\bcircuit imprim/i,
    /\bsur carte\b/i,
    /\bcms\b/i,
    /\bpcb\b/i,
    /\bsmd\b/i,
    /\bsmt\b/i,
    /\bboard[- ]mount(ed|ing)?\b/i,
    /\breflow\b/i,
    /\bsolder(ed|ing)? (on|to) (a |the )?(board|pcb)\b/i,
  ],
};

/** Marques de NÉGATION, françaises et anglaises. « No PCB mounting » nomme le
 * report sur carte pour l'EXCLURE : le lire comme une fixation possible était le
 * défaut qui laissait passer un MK15 sur une porte vitrée. */
const NEGATIONS: readonly RegExp[] = [
  /\bno\b/i,
  /\bnot\b/i,
  /\bnone\b/i,
  /\bwithout\b/i,
  /\bcannot\b/i,
  /\bcan't\b/i,
  /\bexclud/i,
  /\bavoid/i,
  /\bimpossible\b/i,
  /\bsans\b/i,
  /\bpas de\b/i,
  /\bpas d'/i,
  /\bni\b/i,
  /\baucun/i,
  /\bexclu/i,
  /\binterdit/i,
  /\bimpossible de\b/i,
];

/** Une négation ne porte que sur SA proposition : on découpe donc le texte en
 * propositions (ponctuation, « mais », « but ») avant de lire les fixations. */
const clausesOf = (text: string): string[] =>
  text
    .split(/[.;:!?\n,]+|\bmais\b|\bbut\b|\btoutefois\b|\bhowever\b/i)
    .map((c) => c.trim())
    .filter(Boolean);

const ALL_SHAPES: readonly SensorShape[] = [
  ...new Set(Object.values(SHAPES_BY_INTENT).flat()),
];

export interface MountingIntent {
  /** Fixations réellement nommées comme POSSIBLES, dans l'ordre de lecture. */
  kinds: MountingIntentKind[];
  /** Fixations nommées puis explicitement REFUSÉES (« sans PCB », « no PCB »). */
  excluded: MountingIntentKind[];
  /** Vrai dès qu'une fixation est nommée, possible ou refusée : la contrainte
   * devient dure dans les deux cas. */
  explicit: boolean;
  /** Formes de boîtier acceptées par AU MOINS UNE des fixations nommées. */
  allowedShapes: SensorShape[];
}

const EMPTY: MountingIntent = { kinds: [], excluded: [], explicit: false, allowedShapes: [] };

/** Lit la ou les fixations nommées dans un texte libre, français ou anglais, en
 * distinguant ce qui est proposé de ce qui est refusé. */
export function detectMountingIntent(text: string | null | undefined): MountingIntent {
  if (!text || !text.trim()) return EMPTY;
  const kinds = new Set<MountingIntentKind>();
  const excluded = new Set<MountingIntentKind>();
  for (const clause of clausesOf(text)) {
    const negated = NEGATIONS.some((re) => re.test(clause));
    for (const kind of Object.keys(PATTERNS) as MountingIntentKind[]) {
      if (!PATTERNS[kind].some((re) => re.test(clause))) continue;
      if (negated) excluded.add(kind);
      else kinds.add(kind);
    }
  }
  // Un refus explicite gagne contre une mention positive ailleurs : personne ne
  // veut se voir proposer ce qu'il vient d'écarter.
  for (const kind of excluded) kinds.delete(kind);
  if (kinds.size === 0 && excluded.size === 0) return EMPTY;

  const allowedShapes =
    kinds.size > 0
      ? [...new Set([...kinds].flatMap((k) => SHAPES_BY_INTENT[k]))]
      : // Refus seul : on retire les formes que SEULES les fixations refusées
        // permettaient, et on n'invente aucune fixation à la place.
        ALL_SHAPES.filter((shape) =>
          (Object.keys(SHAPES_BY_INTENT) as MountingIntentKind[]).some(
            (k) => !excluded.has(k) && SHAPES_BY_INTENT[k].includes(shape),
          ),
        );
  return { kinds: [...kinds], excluded: [...excluded], explicit: true, allowedShapes };
}

/** Le boîtier a-t-il une fixation documentée compatible d'au moins une des
 * fixations nommées ? Une conception sur mesure n'est jamais écartée ici : sa
 * fixation serait définie avec les ingénieurs Standex. */
export function satisfiesMountingIntent(sensor: SensorModel, intent: MountingIntent): boolean {
  if (!intent.explicit) return true;
  if (sensor.shape === "custom_pcb") return true;
  return intent.allowedShapes.includes(sensor.shape);
}

/** Libellé lisible de la contrainte, pour l'expliquer sur la carte du capteur. */
export const MOUNTING_INTENT_LABEL: Readonly<Record<MountingIntentKind, string>> = {
  screw: "fixation vissée",
  adhesive: "fixation collée",
  press_fit: "emmanchement dans un trou",
  clamp: "maintien par collier ou clip",
  pcb: "report sur circuit imprimé",
};
