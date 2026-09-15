import {
  BARE_MAGNETS,
  PACKAGED_MAGNETS,
  PACKAGED_MAGNET_IDS,
  REFERENCE_CYLINDER,
  packagedMagnet,
} from "./magnet-catalog";
import { PUBLISHED_REGISTRY } from "./magnetics/registries";
import type { PublishedRegistry } from "./magnetics/registries";
import {
  guideFallbackMagnet,
  standardMagnetOptions,
  standardShapeForSensor,
} from "./magnet-recommendation";
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

/**
 * Ordre de préférence entre aimants réellement documentés au registre.
 *
 * M02 n'y figure plus : c'était une préférence de POLITIQUE qui remontait
 * l'actionneur du MK02 en tête des suggestions de tous les autres capteurs.
 * Le cylindre de référence du guide d'activation reste préféré parce qu'il est
 * la référence de mesure des tables publiées, pas parce qu'il porte un nom
 * proche. Les lignes publiées elles-mêmes ne sont pas touchées : M02 reste lu
 * comme preuve documentaire partout où le registre le publie réellement.
 */
const DOCUMENTED_PREFERENCE = ["4003004003"];

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
/** Vrai si cet aimant est un couple explicitement demandé pour CE capteur. */
function dedicatedFor(sensorId: string, magnetId: string): boolean {
  return DEFAULT_PAIRS[sensorId] === magnetId || (PAIR_ALTERNATIVES[sensorId] ?? []).includes(magnetId);
}
/**
 * Filtre de POLITIQUE appliqué aux aimants documentés, sans jamais toucher au
 * registre : `documentedMagnetsFor` continue de dire la vérité documentaire.
 *
 * Deux exclusions, et seulement celles-là :
 *
 * - l'actionneur en BOÎTIER d'un autre capteur (M02 est le boîtier du MK02) :
 *   une ligne publiée avec cet actionneur reste une preuve de mesure, ce n'est
 *   pas une raison de proposer le boîtier d'un autre produit comme aimant de
 *   travail ;
 * - une FORME incompatible avec le capteur : le cylindre de référence
 *   4003004003 sert de mètre-étalon aux tables publiées, il n'est pas l'aimant
 *   à proposer devant un reed CMS, dont la politique demande un bloc.
 *
 * Un couple explicitement demandé pour ce capteur échappe aux deux filtres.
 */
export function policyMagnetsFor(
  sensorId: string,
  registry: PublishedRegistry = PUBLISHED_REGISTRY,
): string[] {
  const wanted = standardShapeForSensor(sensorId);
  return documentedMagnetsFor(sensorId, registry).filter((id) => {
    if (dedicatedFor(sensorId, id)) return true;
    const housed = packagedMagnet(id);
    if (housed) return housingFor(id, sensorId) === sensorId;
    return (BARE_MAGNETS.find((m) => m.id === id)?.shape ?? wanted) === wanted;
  });
}
/**
 * Aimant par défaut d'un capteur. Priorité au couple dédié demandé (MK02/M02,
 * MK04/M04…) ; sinon un aimant documenté RETENU par la politique ci-dessus ;
 * sinon un aimant STANDARD du guide d'activation choisi sur la forme du capteur
 * (`magnet-recommendation.ts`). M02 n'est plus le repli universel : il reste
 * réservé au couple dédié MK02.
 */
export function defaultMagnetFor(
  sensorId: string,
  registry: PublishedRegistry = PUBLISHED_REGISTRY,
): string {
  return (
    DEFAULT_PAIRS[sensorId] ??
    policyMagnetsFor(sensorId, registry)[0] ??
    guideFallbackMagnet(sensorId) ??
    REFERENCE_CYLINDER
  );
}
/** Compatibilité : même décision, à partir du modèle de capteur. */
export const preferredMagnet = (sensor: SensorModel): string => defaultMagnetFor(sensor.id);
/**
 * Aimants RECOMMANDÉS pour un capteur : couple dédié, variantes explicitement
 * demandées, aimants documentés retenus par la politique, puis les aimants
 * standard du guide d'activation adaptés à sa forme. Aucun actionneur en
 * boîtier d'un autre capteur (M02 en tête) n'entre ici, et aucune forme
 * étrangère au capteur ne passe devant.
 */
export function recommendedMagnetsFor(
  sensorId: string,
  registry: PublishedRegistry = PUBLISHED_REGISTRY,
): string[] {
  return [
    ...new Set([
      defaultMagnetFor(sensorId, registry),
      ...(PAIR_ALTERNATIVES[sensorId] ?? []),
      ...policyMagnetsFor(sensorId, registry),
      ...standardMagnetOptions(sensorId).map((o) => o.magnetId),
    ]),
  ];
}
/**
 * Aimants proposés pour un capteur, dans l'ordre de lecture : recommandations
 * d'abord, puis le reste du catalogue. Aucun aimant n'est masqué : l'utilisateur
 * garde tout le catalogue, mais l'ordre porte la politique de recommandation.
 */
export function magnetOptionsFor(
  sensorId: string,
  registry: PublishedRegistry = PUBLISHED_REGISTRY,
): string[] {
  const ordered = [
    ...recommendedMagnetsFor(sensorId, registry),
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
