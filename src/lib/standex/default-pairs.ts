import { BARE_MAGNETS, PACKAGED_MAGNETS, PACKAGED_MAGNET_IDS, packagedMagnet } from "./magnet-catalog";
import { PUBLISHED_REGISTRY } from "./magnetics/registries";
import type { PublishedRegistry } from "./magnetics/registries";
import type { SensorModel } from "./sensor-catalog";

/**
 * Couple capteur → aimant par défaut, source unique de vérité.
 *
 * Ce tableau est utilisé à CHAQUE sélection réelle d'un capteur : catalogue
 * principal, atelier, recommandations, modèle importé. Il ne remplace jamais un
 * aimant explicitement choisi dans un dossier enregistré ; il s'applique quand
 * le capteur change.
 *
 * Les couples proviennent de la demande utilisateur du 14 septembre 2026 et des
 * boîtiers de `public/datasheets/Packaged-Magnets.pdf` V03 (18 juin 2026).
 * Ils décrivent l'aimant à REPRÉSENTER, pas une distance de commutation : la
 * disponibilité des distances publiées est une question séparée, traitée par le
 * registre publié.
 */
export const DEFAULT_PAIRS: Readonly<Record<string, string>> = {
  MK02: "M02",
  MK03: "M03",
  MK04: "M04",
  MK05: "M05",
  MK13: "M13",
  "MK11-B-M6": "M13B",
  "MK11-P-M8": "M11P",
  "MK11-M5": "M11S",
  "MK11-M8": "M11S",
  MK21: "M21P/1",
  MK21PR: "M21P/1",
  MK27: "M27",
  // Variante N42 explicitée : c'est la nuance nommée par les tableaux
  // « Activation Distances » des fiches MK36/MK37/MK38 V00 (17 janvier 2025).
  MK36: "M36-N42",
  MK37: "M37-N42",
  MK38: "M38-N42",
};
/** Variantes explicitement proposées en plus du défaut, par capteur. */
export const PAIR_ALTERNATIVES: Readonly<Record<string, readonly string[]>> = {
  MK21: ["M21P/2", "M21"],
  MK21PR: ["M21P/2", "M21"],
  MK36: ["M36"],
  MK37: ["M37"],
  MK38: ["M38"],
};

/** Ordre de préférence entre aimants réellement documentés au registre. */
const DOCUMENTED_PREFERENCE = ["M02", "4003004003"];

/** Aimants pour lesquels CE capteur a des distances publiées au registre. */
export function documentedMagnetsFor(
  sensorId: string,
  registry: PublishedRegistry = PUBLISHED_REGISTRY,
): string[] {
  const ids = [...new Set(registry.rows.filter((r) => r.sensorFamily === sensorId).map((r) => r.magnetId))];
  return ids.sort((a, b) => {
    const ia = DOCUMENTED_PREFERENCE.indexOf(a),
      ib = DOCUMENTED_PREFERENCE.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });
}
/**
 * Aimant par défaut d'un capteur. Priorité au couple demandé ; sinon un aimant
 * RÉELLEMENT documenté pour ce capteur ; en dernier recours le boîtier M02, sans
 * jamais prétendre que ses distances s'appliquent.
 */
export function defaultMagnetFor(
  sensorId: string,
  registry: PublishedRegistry = PUBLISHED_REGISTRY,
): string {
  return DEFAULT_PAIRS[sensorId] ?? documentedMagnetsFor(sensorId, registry)[0] ?? "M02";
}
/** Compatibilité : même décision, à partir du modèle de capteur. */
export const preferredMagnet = (sensor: SensorModel): string => defaultMagnetFor(sensor.id);
/**
 * Aimants proposés pour un capteur, dans l'ordre de lecture : défaut, variantes
 * demandées, aimants documentés, puis le reste du catalogue. Aucun aimant n'est
 * masqué : l'utilisateur garde tout le catalogue.
 */
export function magnetOptionsFor(
  sensorId: string,
  registry: PublishedRegistry = PUBLISHED_REGISTRY,
): string[] {
  const ordered = [
    defaultMagnetFor(sensorId, registry),
    ...(PAIR_ALTERNATIVES[sensorId] ?? []),
    ...documentedMagnetsFor(sensorId, registry),
    ...PACKAGED_MAGNET_IDS,
    ...BARE_MAGNETS.map((m) => m.id),
  ];
  return [...new Set(ordered)];
}
/**
 * Correspondance documentaire à signaler discrètement quand la référence
 * demandée diffère du nom porté par la fiche. Ce n'est PAS une confirmation
 * constructeur de la référence demandée.
 */
export function documentedAlias(magnetId: string): string | null {
  return packagedMagnet(magnetId)?.documentedAs ?? null;
}
/** Le boîtier capteur réellement réutilisé pour dessiner cet aimant. */
export function housingFor(magnetId: string, sensorId?: string): string | null {
  const packaged = packagedMagnet(magnetId);
  if (!packaged) return null;
  return (sensorId && packaged.housingBySensor?.[sensorId]) || packaged.housing;
}
export const PACKAGED_MAGNET_COUNT = PACKAGED_MAGNETS.length;
