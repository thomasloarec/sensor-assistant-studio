/** Filtres de suggestion dérivés des RÉPONSES STRUCTURÉES du dossier.
 *
 * Règles tenues ici :
 * - un filtre ne naît que d'un choix structuré (montage mécanique explicite,
 *   diamètre de trou, encombrement chiffré). Jamais d'un texte libre, jamais
 *   d'un nom d'application : « machine à café » n'implique aucune fixation.
 * - un filtre est une AIDE à l'exploration, pas une exigence : le lever ne
 *   modifie pas le dossier, et le catalogue entier redevient visible.
 * - un capteur bloqué par un filtre reste consultable, avec la raison exacte.
 */
import {
  CUSTOM_SENSOR_ID,
  overallEnvelope,
  type SensorModel,
  type SensorShape,

} from "@/lib/standex/sensor-catalog";
import type { EnvelopeMm, MountingChoice } from "./dossier";
import { detectMountingIntent, MOUNTING_INTENT_LABEL } from "./mounting-intent";

export type SuggestionFilterId = "fixation" | "forme" | "encombrement";

/** D'où vient le critère affiché : des réponses du dossier, ou d'une
 * exploration volontaire qui ne touche PAS aux réponses. */
export type SuggestionFilterSource = "answers" | "exploration";

export interface SuggestionFilter {
  id: SuggestionFilterId;
  /** Puce visible : court, sans jargon. */
  label: string;
  /** Question structurée dont ce filtre est issu. */
  requirementKey: "mounting" | "envelope";
  /** Motif technique, réservé au dépliant « détails ». */
  technical: string;
  source: SuggestionFilterSource;
  /** Critère porté par le filtre lui-même (exploration). Absent = le critère
   * est lu dans les réponses du dossier. */
  criteria?: {
    mountingKind?: string;
    /** Portion insérée maximale, en mm. */
    holeMm?: number;
    shape?: SensorShape;
    /** Formes acceptées quand la fixation a été NOMMÉE en texte libre (« vissé
     * ou collé ») : au moins une des fixations nommées doit convenir. */
    shapes?: readonly SensorShape[];
  };
}

/** Choix d'exploration : chaque critère REMPLACE explicitement le critère de
 * même nature issu des réponses. On n'intersecte jamais « vissé ET CMS ». */
export interface ExplorationChoice {
  mountingKind?: string;
  shape?: SensorShape;
}

/** Formes proposées à l'exploration, avec un libellé compréhensible. */
export const EXPLORABLE_SHAPES: readonly { shape: SensorShape; label: string }[] = [
  { shape: "cylinder", label: "Corps tubulaire" },
  { shape: "threaded", label: "Corps fileté" },
  { shape: "flange", label: "Corps à collerette" },
  { shape: "block", label: "Boîtier parallélépipédique" },
  { shape: "pressfit", label: "Corps à emmancher" },
  { shape: "smd", label: "Composant à reporter (CMS)" },
  { shape: "glass", label: "Ampoule en verre (traversant)" },
];

/** Fixations proposées à l'exploration, dans le même ordre que les réponses. */
export const EXPLORABLE_MOUNTINGS: readonly { kind: string; label: string }[] = [
  { kind: "screw", label: "Fixation vissée" },
  { kind: "press_fit", label: "Emmanchement dans un trou" },
  { kind: "pcb_through_hole", label: "Fixation traversante" },
  { kind: "pcb_smd", label: "Fixation par report CMS" },
];


/** Familles de boîtiers réellement compatibles d'un montage déclaré.
 * Même partition que l'évaluation des candidats : aucune forme n'est devinée. */
const SHAPES_BY_MOUNTING: Record<string, readonly SensorModel["shape"][]> = {
  pcb_smd: ["smd"],
  pcb_through_hole: ["glass"],
  screw: ["flange", "block", "threaded"],
  press_fit: ["pressfit"],
};

const MOUNTING_LABEL: Record<string, string> = {
  pcb_smd: "Fixation par report CMS",
  pcb_through_hole: "Fixation traversante",
  screw: "Fixation vissée",
  press_fit: "Emmanchement dans un trou",
};

/** Le sur mesure n'est jamais filtré : sa géométrie serait justement définie. */
const alwaysVisible = (model: SensorModel) => model.id === CUSTOM_SENSOR_ID;

/** Portion réellement insérée dans un trou : la collerette est une butée. */
const insertionAcross = (model: SensorModel) => Math.max(model.body[1], model.body[2]);

export function suggestionFilters(input: {
  mounting: MountingChoice;
  envelope: EnvelopeMm;
  /** Réponse de montage en TEXTE LIBRE. Seule une fixation NOMMÉE y est lue
   * (« vissé ou collé ») : c'est une contrainte donnée par le client, pas une
   * déduction depuis un nom d'application. */
  mountingText?: string | null;
}): SuggestionFilter[] {
  const filters: SuggestionFilter[] = [];
  const kind = input.mounting.kind;
  const shapes = SHAPES_BY_MOUNTING[kind];
  if (shapes)
    filters.push({
      id: "fixation",
      label: MOUNTING_LABEL[kind]!,
      requirementKey: "mounting",
      technical: `Formes de boîtier retenues : ${shapes.join(", ")}.`,
      source: "answers",
    });
  else {
    /* Aucune case de montage exploitable (« autre », « à décider ») : la
       fixation nommée dans la réponse écrite prend le relais. Elle vaut AU
       MOINS UNE des fixations citées, jamais toutes à la fois. */
    const intent = detectMountingIntent(input.mountingText ?? null);
    if (intent.explicit)
      filters.push({
        id: "fixation",
        label: intent.kinds.map((k) => MOUNTING_INTENT_LABEL[k]).join(" ou "),
        requirementKey: "mounting",
        technical: `Fixation nommée dans votre réponse. Formes de boîtier retenues : ${intent.allowedShapes.join(", ")}. Aucune fixation n'est ajoutée à un boîtier qui ne la documente pas.`,
        source: "answers",
        criteria: { shapes: intent.allowedShapes },
      });
  }
  if (input.mounting.kind === "press_fit" && input.mounting.holeDiameterMm > 0) {
    const hole = input.mounting.holeDiameterMm;
    filters.push({
      id: "forme",
      label: `Corps tubulaire qui entre dans un trou de ${hole} mm`,
      requirementKey: "mounting",
      technical:
        `Portion insérée ≤ ${hole} mm. La collerette peut être plus large : ` +
        "c'est sa fonction de butée, ce n'est pas un motif d'exclusion.",
      source: "answers",
    });
  }
  const dims = [input.envelope.lengthMm, input.envelope.widthMm, input.envelope.heightMm].filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0,
  );
  if (dims.length)
    filters.push({
      id: "encombrement",
      label: `Tient dans la place annoncée (${dims.map((d) => `${d} mm`).join(" × ")})`,
      requirementKey: "envelope",
      technical:
        "Encombrement hors tout comparé aux dimensions renseignées, terminaisons documentées comprises. " +
        "Une dimension non renseignée reste libre : elle ne limite aucun côté du capteur, et inconnu ne vaut pas zéro. " +
        "La comparaison retient l'orientation la plus favorable ; l'orientation réelle reste à décider.",
      source: "answers",
    });
  return filters;
}

/** Filtres d'EXPLORATION : critères choisis à la main au-dessus de la liste.
 * Ils ne modifient jamais les réponses ni le montage du dossier. */
export function explorationFilters(explore: ExplorationChoice): SuggestionFilter[] {
  const filters: SuggestionFilter[] = [];
  if (explore.mountingKind) {
    const shapes = SHAPES_BY_MOUNTING[explore.mountingKind];
    filters.push({
      id: "fixation",
      label: MOUNTING_LABEL[explore.mountingKind] ?? explore.mountingKind,
      requirementKey: "mounting",
      technical: shapes
        ? `Exploration : formes de boîtier retenues : ${shapes.join(", ")}.`
        : "Exploration : aucune forme de boîtier exclue.",
      source: "exploration",
      criteria: { mountingKind: explore.mountingKind },
    });
  }
  if (explore.shape) {
    const label =
      EXPLORABLE_SHAPES.find((s) => s.shape === explore.shape)?.label ?? explore.shape;
    filters.push({
      id: "forme",
      label,
      requirementKey: "mounting",
      technical: `Exploration : boîtiers de forme « ${explore.shape} » uniquement.`,
      source: "exploration",
      criteria: { shape: explore.shape },
    });
  }
  return filters;
}

/** Fusion EXPLICITE : un critère d'exploration REMPLACE le critère de même
 * nature issu des réponses. Jamais d'intersection impossible « vissé ET CMS ». */
export function mergeFilters(
  answers: readonly SuggestionFilter[],
  exploration: readonly SuggestionFilter[],
): SuggestionFilter[] {
  const replaced = new Set(exploration.map((f) => f.id));
  return [...exploration, ...answers.filter((f) => !replaced.has(f.id))];
}


/** Le capteur passe-t-il ce filtre ? Aucune tolérance inventée : seule une
 * marge numérique documentée absorbe les arrondis de saisie. */
const EPSILON_MM = 0.001;

export function passesFilter(
  model: SensorModel,
  filter: SuggestionFilter,
  input: { mounting: MountingChoice; envelope: EnvelopeMm },
): boolean {
  if (alwaysVisible(model)) return true;
  switch (filter.id) {
    case "fixation": {
      /* Fixation nommée en texte libre : les formes acceptées sont portées par
         le filtre. Une conception sur mesure passe déjà par `alwaysVisible`. */
      if (filter.criteria?.shapes) return filter.criteria.shapes.includes(model.shape);
      /* Un filtre d'exploration porte son propre critère : il REMPLACE la
         fixation déclarée, il ne s'y ajoute pas. */
      const kind = filter.criteria?.mountingKind ?? input.mounting.kind;
      const shapes = SHAPES_BY_MOUNTING[kind];
      return !shapes || shapes.includes(model.shape);
    }
    case "forme": {
      if (filter.criteria?.shape) return model.shape === filter.criteria.shape;
      if (input.mounting.kind !== "press_fit") return true;
      return insertionAcross(model) <= input.mounting.holeDiameterMm + EPSILON_MM;
    }

    case "encombrement": {
      const available = [
        input.envelope.lengthMm,
        input.envelope.widthMm,
        input.envelope.heightMm,
      ].filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0);
      if (!available.length) return true;
      /* Une dimension non renseignée est LIBRE, pas nulle : un capteur ne peut
       * donc pas être écarté en comparant ses plus grands côtés à une place
       * partiellement connue (« hauteur max 5 mm » ne dit rien de la longueur).
       * L'orientation reste explicitement à décider, exactement comme dans
       * evaluateCandidates : on retient donc la meilleure orientation possible,
       * c'est-à-dire les côtés les PLUS PETITS du capteur placés en face des
       * seules limites connues. Avec les trois cotes renseignées, cela revient
       * à la comparaison complète triée. */
      const needed = [...overallEnvelope(model)].sort((a, b) => a - b);
      const room = [...available].sort((a, b) => a - b);
      return room.every((limit, i) => {
        const side = needed[i];
        return side === undefined || side <= limit + EPSILON_MM;
      });
    }
  }
}

/** Identifiants des filtres ACTIFS qui écartent ce capteur. Vide = visible. */
export function blockedBy(
  model: SensorModel,
  filters: readonly SuggestionFilter[],
  active: readonly SuggestionFilterId[],
  input: { mounting: MountingChoice; envelope: EnvelopeMm },
): SuggestionFilterId[] {
  return filters
    .filter((f) => active.includes(f.id) && !passesFilter(model, f, input))
    .map((f) => f.id);
}
