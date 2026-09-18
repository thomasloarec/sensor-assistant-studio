/** Couples capteur + aimant proposés après les six questions.
 *
 * L'unité de base du produit est le COUPLE, jamais un capteur seul : l'aimant
 * par défaut vient de `default-pairs.ts` (source unique) et la distance affichée
 * vient EXCLUSIVEMENT du registre publié pour ce couple exact.
 *
 * Règles tenues ici :
 * - aucune distance n'est déduite, empruntée à une autre famille ou arrondie :
 *   sans ligne publiée pour le couple, `maxPullInMm` vaut `null` et l'écran dit
 *   que les distances restent à mesurer avec Standex ;
 * - le schéma pédagogique sur mesure n'est jamais proposé comme couple ;
 * - l'ordre est décidé ici, pas dans le rendu : d'abord les couples documentés,
 *   puis les autres, chaque groupe gardant l'ordre reçu du moteur de suggestion.
 */
import { publishedRowsForCouple } from "@/lib/standex/magnetics/registries";
import { CUSTOM_SENSOR_ID, isKnownSensorId, sensorById, sizeLabel } from "@/lib/standex/sensor-catalog";
import type { SensorModel, SensorShape } from "@/lib/standex/sensor-catalog";
import { defaultMagnetFor } from "@/lib/standex/default-pairs";
import { fixingGroup } from "@/lib/standex/catalog-filters";
import { guideMagnetMaterial, guideRangesFor } from "@/lib/standex/activation-guide";
import { BARE_MAGNETS } from "@/lib/standex/magnet-catalog";

export interface PairCard {
  sensorId: string;
  sensorName: string;
  magnetId: string;
  /** « MK04 + M04 » : références portées telles quelles, jamais traduites. */
  couple: string;
  /** Mode de fixation, à traduire au rendu. */
  fixingLabel: string;
  /** Famille de format, à traduire au rendu. */
  familyLabel: string;
  /** Encombrement documenté, déjà formaté en millimètres. */
  size: string;
  /** Distance de fermeture maximale PUBLIÉE pour ce couple, toutes classes de
   * sensibilité et approches confondues. `null` = aucune ligne publiée. */
  maxPullInMm: number | null;
  /** Plage RÉELLEMENT publiée pour la variante et l'approche par défaut de ce
   *  couple. Ce sont les colonnes « up » et « to » du guide, jamais des seuils
   *  de fermeture ou de réouverture. `null` = rien de publié. */
  guideReference: string | null;
  guideApproach: string | null;
  guideUpMm: number | null;
  guideToMm: number | null;
  hasGuideRange?: boolean;
  /** Matériau lisible de l'aimant proposé (« Ferrite », « AlNiCo »), quand le
   * guide le publie. Le code de référence reste affiché à part. */
  materialLabel: string | null;

}

const FIXING_LABEL: Readonly<Record<string, string>> = {
  screw: "Boîtier à visser",
  threaded: "Corps fileté monté par écrous",
  pressfit: "Corps à emmancher dans un trou",
  pcb: "Montage sur carte",
  unknown: "Boîtier documenté",
};

const FAMILY_LABEL: Readonly<Record<SensorShape, string>> = {
  cylinder: "Format cylindrique",
  flange: "Format à collerette",
  threaded: "Format fileté",
  block: "Format parallélépipédique",
  pressfit: "Format à emmancher",
  smd: "Montage sur carte",
  glass: "Ampoule en verre",
  custom_pcb: "Sur mesure",
};

/** Distance de fermeture maximale réellement publiée pour ce couple. */
export function maxPublishedPullIn(sensorId: string, magnetId: string): number | null {
  const values = publishedRowsForCouple(sensorId, magnetId)
    .map((r) => r.pullInMm)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  return values.length ? Math.max(...values) : null;
}

/** Matériau publié d'une référence d'aimant, ou `null` s'il n'est pas documenté. */
export function materialLabelFor(magnetId: string): string | null {
  const fromGuide = guideMagnetMaterial(magnetId);
  if (fromGuide) return fromGuide;
  const material = BARE_MAGNETS.find((m) => m.id === magnetId)?.material;
  return material && material !== "unknown" ? material : null;
}

export function pairCardFor(sensor: SensorModel): PairCard {
  const magnetId = defaultMagnetFor(sensor.id);
  return {
    sensorId: sensor.id,
    sensorName: sensor.name,
    magnetId,
    couple: `${sensor.id === CUSTOM_SENSOR_ID ? sensor.name : sensor.id} + ${magnetId}`,
    fixingLabel: FIXING_LABEL[fixingGroup(sensor)] ?? FIXING_LABEL["unknown"]!,
    familyLabel: FAMILY_LABEL[sensor.shape],
    size: sizeLabel(sensor),
    maxPullInMm: maxPublishedPullIn(sensor.id, magnetId),
    hasGuideRange: guideRangesFor(sensor.id, magnetId).some(r => r.upMm !== null || r.toMm !== null),
    // Matériau LU sur la référence : le guide d'abord, sinon la fiche catalogue.
    // « unknown » n'est jamais affiché comme un matériau.
    materialLabel: materialLabelFor(magnetId),
  };
}

/**
 * Couples proposés, dans l'ordre de lecture. `preferredSensorId` (capteur déjà
 * choisi dans un dossier repris) passe en première carte sans rien inventer.
 */
export function pairCards(
  sensorIds: readonly string[],
  options: { limit?: number; preferredSensorId?: string | null } = {},
): PairCard[] {
  const limit = options.limit ?? 3;
  const cards = [...new Set(sensorIds)]
    .filter((id) => id !== CUSTOM_SENSOR_ID && id !== "GENERIC" && isKnownSensorId(id))
    .map((id) => pairCardFor(sensorById(id)));
  const documented = cards.filter((c) => c.maxPullInMm !== null);
  const rest = cards.filter((c) => c.maxPullInMm === null);
  const ordered = [...documented, ...rest];
  const preferred = options.preferredSensorId
    ? ordered.find((c) => c.sensorId === options.preferredSensorId)
    : undefined;
  const final = preferred
    ? [preferred, ...ordered.filter((c) => c !== preferred)]
    : ordered;
  return final.slice(0, limit);
}
