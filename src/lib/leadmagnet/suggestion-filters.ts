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
} from "@/lib/standex/sensor-catalog";
import type { EnvelopeMm, MountingChoice } from "./dossier";

export type SuggestionFilterId = "fixation" | "forme" | "encombrement";

export interface SuggestionFilter {
  id: SuggestionFilterId;
  /** Puce visible : court, sans jargon. */
  label: string;
  /** Question structurée dont ce filtre est issu. */
  requirementKey: "mounting" | "envelope";
  /** Motif technique, réservé au dépliant « détails ». */
  technical: string;
}

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
    });
  if (input.mounting.kind === "press_fit" && input.mounting.holeDiameterMm > 0) {
    const hole = input.mounting.holeDiameterMm;
    filters.push({
      id: "forme",
      label: `Corps tubulaire qui entre dans un trou de ${hole} mm`,
      requirementKey: "mounting",
      technical:
        `Portion insérée ≤ ${hole} mm. La collerette peut être plus large : ` +
        "c'est sa fonction de butée, ce n'est pas un motif d'exclusion.",
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
    });
  return filters;
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
      const shapes = SHAPES_BY_MOUNTING[input.mounting.kind];
      return !shapes || shapes.includes(model.shape);
    }
    case "forme": {
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
