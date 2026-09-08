/** Câblage : trajet 3D en millimètres, longueur polyligne réelle, marges explicites.
 * Aucune génération de référence par collage d'une longueur.
 */
export type Point = [number, number, number];

export interface CablePath {
  stateId: string;
  label: string;
  /** Trajet complet : capteur → waypoints → point de connexion. */
  points: Point[];
}

export interface CablingConfig {
  sensorEndpoint: Point | null;
  connectionEndpoint: Point | null;
  waypoints: Point[];
  /** Trajets supplémentaires pour les états de mouvement (porte ouverte, tiroir sorti…). */
  statePaths: CablePath[];
  serviceReserveMm: number;
  terminationMm: number;
  toleranceMm: number;
  minBendRadiusMm: number | null;
}

export const EMPTY_CABLING: CablingConfig = {
  sensorEndpoint: null,
  connectionEndpoint: null,
  waypoints: [],
  statePaths: [],
  serviceReserveMm: 0,
  terminationMm: 0,
  toleranceMm: 0,
  minBendRadiusMm: null,
};

export function polylineLength(points: Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    total += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  }
  return total;
}

export function directDistance(points: Point[]): number {
  if (points.length < 2) return 0;
  return polylineLength([points[0]!, points[points.length - 1]!]);
}

export interface CableLengthEstimate {
  complete: boolean;
  /** Longueur du plus long trajet parcouru, marges exclues. */
  longestPathMm: number;
  longestPathState: string | null;
  perState: { stateId: string; label: string; lengthMm: number }[];
  serviceReserveMm: number;
  terminationMm: number;
  toleranceMm: number;
  /** Longueur minimale demandée = plus long trajet + réserve + terminaison + tolérance. */
  requiredMm: number;
  approved: false;
  warnings: string[];
}

export function estimateCableLength(config: CablingConfig): CableLengthEstimate {
  const warnings: string[] = [];
  const basePoints: Point[] = [];
  if (config.sensorEndpoint) basePoints.push(config.sensorEndpoint);
  basePoints.push(...config.waypoints);
  if (config.connectionEndpoint) basePoints.push(config.connectionEndpoint);
  const complete =
    Boolean(config.sensorEndpoint) && Boolean(config.connectionEndpoint) && basePoints.length >= 2;
  if (!complete)
    warnings.push(
      "Géométrie incomplète : la longueur affichée est indicative et n'est pas une longueur approuvée.",
    );

  const perState = [
    { stateId: "base", label: "Trajet de référence", lengthMm: polylineLength(basePoints) },
    ...config.statePaths.map((p) => ({
      stateId: p.stateId,
      label: p.label,
      lengthMm: polylineLength(p.points),
    })),
  ];
  const longest = perState.reduce((a, b) => (b.lengthMm > a.lengthMm ? b : a));
  const margins = config.serviceReserveMm + config.terminationMm + config.toleranceMm;
  if (margins === 0)
    warnings.push("Aucune réserve de service, terminaison ni tolérance n'a été ajoutée.");
  if (config.minBendRadiusMm === null)
    warnings.push("Rayon de courbure minimal non renseigné : risques de pincement non contrôlés.");
  return {
    complete,
    longestPathMm: longest.lengthMm,
    longestPathState: longest.stateId,
    perState,
    serviceReserveMm: config.serviceReserveMm,
    terminationMm: config.terminationMm,
    toleranceMm: config.toleranceMm,
    requiredMm: longest.lengthMm + margins,
    approved: false,
    warnings,
  };
}

/** Longueurs standard sourcées POUR une référence exacte. Aucune entrée inventée. */
export interface StandardCableOption {
  /** Référence exacte du fabricant, suffixe de longueur compris. */
  mpn: string;
  nominalMm: number;
  toleranceMm: number;
  source: string;
}

/** Registre vide tant qu'aucune longueur standard n'a été sourcée dans le repo. */
export const STANDARD_CABLE_LENGTHS: readonly StandardCableOption[] = [];

export type StandardLengthVerdict =
  | { kind: "no_sourced_option"; message: string }
  | {
      kind: "standard_possible";
      option: StandardCableOption;
      surplusMm: number;
      message: string;
    }
  | { kind: "custom_to_review"; requiredMm: number; message: string };

export function compareStandardLengths(
  mpn: string,
  requiredMm: number,
  routableSurplusMm: number,
  catalog: readonly StandardCableOption[] = STANDARD_CABLE_LENGTHS,
): StandardLengthVerdict {
  // Comparaison sur référence exacte : MK03-1A66-200W et MK03-1A66-500W sont distincts.
  const options = catalog.filter((o) => o.mpn === mpn);
  if (!options.length)
    return {
      kind: "no_sourced_option",
      message: `Aucune longueur standard sourcée pour ${mpn}. Longueur à faire vérifier par la R&D.`,
    };
  const usable = options
    .filter((o) => o.nominalMm - o.toleranceMm >= requiredMm)
    .filter((o) => o.nominalMm - requiredMm <= routableSurplusMm)
    .sort((a, b) => a.nominalMm - b.nominalMm);
  const option = usable[0];
  if (!option)
    return {
      kind: "custom_to_review",
      requiredMm,
      message:
        "Aucune longueur standard sourcée ne couvre le besoin avec un surplus logeable : longueur sur mesure à examiner par la R&D.",
    };
  return {
    kind: "standard_possible",
    option,
    surplusMm: option.nominalMm - requiredMm,
    message: `${option.mpn} couvre le besoin (tolérance ±${option.toleranceMm} mm, source : ${option.source}).`,
  };
}
