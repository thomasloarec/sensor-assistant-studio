/**
 * COMPATIBILITÉ DE FORME capteur / aimant — règle d'APPLICATION, source unique.
 *
 * Règle validée par le propriétaire le 18 septembre 2026 :
 *
 *  - un capteur à corps TUBULAIRE (cylindre, fileté, à emmancher, ampoule) ne
 *    travaille, dans cette application, qu'avec un aimant TUBULAIRE (cylindre) ;
 *  - un capteur NON tubulaire (collerette, bloc, reed CMS, circuit) ne travaille
 *    qu'avec un aimant BLOC (parallélépipède).
 *
 * Ce n'est PAS une affirmation de physique universelle : c'est la règle de
 * compatibilité de l'application, appliquée partout de la même façon, pour ne
 * jamais proposer ni simuler un couple que Standex n'assemble pas ici.
 *
 * La classification lit la forme EXTÉRIEURE RÉELLE, jamais le nom :
 *  - aimant nu : la forme déclarée au catalogue (`cylinder` / `block`) ;
 *  - aimant en boîtier : la forme du boîtier capteur réellement réutilisé
 *    (« M02 » porte le boîtier à collerette du MK02 : c'est un BLOC, malgré son
 *    nom voisin de « MK02 ») ;
 *  - forme inconnue : `unknown`. Une forme inconnue n'est JAMAIS présumée
 *    compatible.
 *
 * Conséquences assumées : `MK03` (cylindre) + `M02` (bloc) n'est pas une
 * combinaison simulable, et les lignes historiques de ce type restent lisibles
 * dans l'annuaire — marquées exclues — sans jamais alimenter un moteur ni
 * prétendre être actives. Aucune valeur n'est convertie d'une forme à l'autre.
 */
import { BARE_MAGNETS, packagedMagnet } from "./magnet-catalog";
import { SENSOR_CATALOG, type SensorShape } from "./sensor-catalog";

/** Classe de forme partagée par un capteur et son aimant. */
export type ShapeClass = "tubular" | "block";

/** Formes de CORPS tubulaires réelles du catalogue, cylindriques ou filetées. */
export const TUBULAR_SENSOR_SHAPES: readonly SensorShape[] = [
  "cylinder",
  "threaded",
  "pressfit",
  "glass",
];

export function shapeClassOfSensorShape(shape: SensorShape): ShapeClass {
  return TUBULAR_SENSOR_SHAPES.includes(shape) ? "tubular" : "block";
}

/** Classe de forme d'un capteur du catalogue, ou `null` s'il est inconnu. */
export function sensorShapeClass(sensorId: string): ShapeClass | null {
  const shape = SENSOR_CATALOG.find((s) => s.id === sensorId)?.shape;
  return shape ? shapeClassOfSensorShape(shape) : null;
}

/** Classe de forme d'un aimant : boîtier réellement réutilisé, sinon forme nue. */
export function magnetShapeClass(magnetId: string): ShapeClass | null {
  const packaged = packagedMagnet(magnetId);
  if (packaged) return sensorShapeClass(packaged.housing);
  const bare = BARE_MAGNETS.find((m) => m.id === magnetId);
  if (!bare) return null;
  return bare.shape === "cylinder" ? "tubular" : "block";
}

export type ShapeVerdict = "compatible" | "incompatible" | "unknown";

/**
 * Verdict de compatibilité. `unknown` quand une des deux formes n'est pas
 * classable : on ne l'exploite jamais comme une autorisation.
 */
export function shapeCompatibility(sensorId: string, magnetId: string): ShapeVerdict {
  const sensor = sensorShapeClass(sensorId);
  const magnet = magnetShapeClass(magnetId);
  if (sensor === null || magnet === null) return "unknown";
  return sensor === magnet ? "compatible" : "incompatible";
}

/** Vrai UNIQUEMENT quand les deux formes sont connues et de la même classe. */
export const isShapeCompatible = (sensorId: string, magnetId: string): boolean =>
  shapeCompatibility(sensorId, magnetId) === "compatible";

/** Vrai quand les deux formes sont connues et se contredisent. */
export const isShapeIncompatible = (sensorId: string, magnetId: string): boolean =>
  shapeCompatibility(sensorId, magnetId) === "incompatible";

/**
 * Compatibilité d'une classe de forme d'aimant, utile pour les jeux de données
 * qui portent leur propre forme (guide d'activation : `cylinder` / `block`).
 */
export function shapeClassCompatible(
  sensorId: string,
  magnetShape: "cylinder" | "block" | null | undefined,
): ShapeVerdict {
  const sensor = sensorShapeClass(sensorId);
  if (sensor === null || !magnetShape) return "unknown";
  return sensor === (magnetShape === "cylinder" ? "tubular" : "block")
    ? "compatible"
    : "incompatible";
}
