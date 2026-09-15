/** POLITIQUE de recommandation d'aimant — séparée de la PREUVE documentaire.
 *
 * Deux notions distinctes, jamais mélangées ici :
 *
 * - la **preuve** : les lignes réellement publiées (registre `PUBLISHED_REGISTRY`,
 *   fiches produit). Elles ne sont ni créées ni déplacées par ce fichier ;
 * - la **politique** : quel aimant PROPOSER quand aucun couple dédié n'existe.
 *   Une politique n'est jamais une preuve de compatibilité, et le nom d'une
 *   référence (« M02 » à côté de « MK02 ») ne prouve rien à lui seul.
 *
 * Avant, l'aimant de repli était M02 pour TOUT capteur sans couple dédié : un
 * actionneur en boîtier MK02 se retrouvait proposé avec des reeds CMS, des
 * ampoules nues ou des corps filetés. M02 est désormais réservé à MK02 (couple
 * dédié) ; le repli passe par les aimants STANDARD du guide d'activation
 * officiel, choisis sur la forme du capteur et sur un matériau explicite.
 *
 * Source unique du repli : `ACTIVATION_BROCHURE`
 * (brochure-reed-sensor-activation-guide.pdf, 40 pages). Chaque référence citée
 * ci-dessous existe déjà dans `BARE_MAGNETS` avec sa page de source ; aucune
 * dimension, aucun prix et aucune distance ne sont inventés ici.
 */
import {
  ACTIVATION_BROCHURE,
  BARE_MAGNETS,
  type CatalogMagnet,
} from "./magnet-catalog";
import { sensorById, type SensorShape } from "./sensor-catalog";

/** Matériau magnétique proposable comme standard de repli. SmCo est volontairement
 * absent des DÉFAUTS (coûteux, petites portées) sans être retiré du catalogue. */
export type StandardMagnetMaterial = "Ferrite" | "AlNiCo" | "NdFeB" | "SmCo";

/** Forme de l'aimant standard, déduite de la forme du CAPTEUR :
 * corps tubulaire (cylindre, fileté, à emmancher, ampoule) → aimant cylindre ;
 * toute autre forme → aimant bloc carré ou rectangulaire. */
export type StandardMagnetShape = "cylinder" | "block";

const TUBULAR_SHAPES: readonly SensorShape[] = ["cylinder", "threaded", "pressfit", "glass"];

export function standardShapeForSensorShape(shape: SensorShape): StandardMagnetShape {
  return TUBULAR_SHAPES.includes(shape) ? "cylinder" : "block";
}

export function standardShapeForSensor(sensorId: string): StandardMagnetShape {
  return standardShapeForSensorShape(sensorById(sensorId).shape);
}

export interface StandardMagnetOption {
  /** Référence RÉELLE du catalogue, avec ses cotes documentées. */
  magnetId: string;
  material: StandardMagnetMaterial;
  shape: StandardMagnetShape;
  /**
   * Préférence économique INDICATIVE du guide (ferrite pour les blocs, cylindre
   * AlNiCo pour les corps tubulaires). Aucun prix n'est connu ici et rien n'est
   * présenté comme « moins cher » de façon certifiée.
   */
  economicalHint: boolean;
  /** Page du guide d'activation où la référence est listée. */
  sourcePage: number;
}

/** Références standard, par forme puis par matériau. Ordre = ordre de proposition. */
const STANDARD_BY_SHAPE: Readonly<
  Record<StandardMagnetShape, readonly { magnetId: string; material: StandardMagnetMaterial }[]>
> = {
  // Blocs : la ferrite est le standard économique indicatif du guide.
  block: [
    { magnetId: "HF3225-14.95X10X5", material: "Ferrite" },
    { magnetId: "ALNICO-3.2X3.2X19", material: "AlNiCo" },
    { magnetId: "NDFEB-10X5X1.9", material: "NdFeB" },
  ],
  // Cylindres : l'AlNiCo500 Ø 4 × 19 mm est l'option cylindre économique
  // indicative du guide ; le NdFeB porte plus loin, le SmCo reste un choix
  // volontaire (coûteux, petite portée) et n'est jamais un défaut.
  cylinder: [
    { magnetId: "ALNICO500-4X19", material: "AlNiCo" },
    { magnetId: "N45-4X19", material: "NdFeB" },
    { magnetId: "SMCO5-5X4", material: "SmCo" },
  ],
};

const ECONOMICAL: Readonly<Record<StandardMagnetShape, StandardMagnetMaterial>> = {
  block: "Ferrite",
  cylinder: "AlNiCo",
};

const catalogMagnet = (id: string): CatalogMagnet | null =>
  BARE_MAGNETS.find((m) => m.id === id) ?? null;

/** Aimants standard proposables pour ce capteur, dans l'ordre de lecture.
 * Une référence absente du catalogue est simplement omise : rien n'est fabriqué. */
export function standardMagnetOptions(sensorId: string): StandardMagnetOption[] {
  const shape = standardShapeForSensor(sensorId);
  return STANDARD_BY_SHAPE[shape]
    .map(({ magnetId, material }) => {
      const magnet = catalogMagnet(magnetId);
      if (!magnet) return null;
      return {
        magnetId,
        material,
        shape,
        economicalHint: ECONOMICAL[shape] === material,
        sourcePage: magnet.sourcePage,
      } satisfies StandardMagnetOption;
    })
    .filter((o): o is StandardMagnetOption => o !== null);
}

/** Matériau proposé par DÉFAUT pour ce capteur : jamais SmCo. */
export function defaultStandardMaterial(sensorId: string): StandardMagnetMaterial {
  return ECONOMICAL[standardShapeForSensor(sensorId)];
}

/** Référence standard réelle pour un capteur et un matériau choisi. `null` quand
 * ce matériau n'a pas de référence documentée dans cette forme. */
export function standardMagnetFor(
  sensorId: string,
  material: StandardMagnetMaterial = defaultStandardMaterial(sensorId),
): string | null {
  const options = standardMagnetOptions(sensorId);
  return options.find((o) => o.material === material)?.magnetId ?? null;
}

/** Aimant de repli quand aucun couple dédié ni aucune ligne publiée n'existe.
 * C'est une PROPOSITION de standard, jamais une compatibilité prouvée. */
export function guideFallbackMagnet(sensorId: string): string | null {
  return standardMagnetFor(sensorId) ?? standardMagnetOptions(sensorId)[0]?.magnetId ?? null;
}

/** Source affichable de la politique de repli. */
export const STANDARD_MAGNET_SOURCE = ACTIVATION_BROCHURE;

export function standardMagnetSourceUrl(sensorId: string, material?: StandardMagnetMaterial): string {
  const id = material ? standardMagnetFor(sensorId, material) : guideFallbackMagnet(sensorId);
  const page = id ? catalogMagnet(id)?.sourcePage : null;
  return page ? `${ACTIVATION_BROCHURE}#page=${page}` : ACTIVATION_BROCHURE;
}
