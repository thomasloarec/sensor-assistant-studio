/** Câblage : trajet 3D en millimètres, longueur polyligne réelle, marges explicites.
 * Aucune génération de référence par collage d'une longueur.
 * Toute géométrie incomplète ou invalide donne une longueur INCONNUE, jamais un nombre.
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
  /** États de mouvement déclarés dans le besoin, à couvrir par un trajet. */
  declaredMotionStates: { id: string; label: string }[];
  /** L'utilisateur confirme que les trajets couvrent tous les états déclarés. */
  motionCoverageConfirmed: boolean;
  serviceReserveMm: number;
  terminationMm: number;
  /** Tolérance fournisseur sur la longueur livrée (± mm). */
  toleranceMm: number;
  /** Volume/longueur de câble excédentaire réellement logeable dans la machine. */
  surplusHousingMm: number;
  minBendRadiusMm: number | null;
  /** Choix explicite : longueur catalogue ou sur mesure, dans les deux cas à confirmer. */
  lengthChoice: "undecided" | "standard_to_confirm" | "custom_to_confirm";
}

export const EMPTY_CABLING: CablingConfig = {
  sensorEndpoint: null,
  connectionEndpoint: null,
  waypoints: [],
  statePaths: [],
  declaredMotionStates: [],
  motionCoverageConfirmed: false,
  serviceReserveMm: 0,
  terminationMm: 0,
  toleranceMm: 0,
  surplusHousingMm: 0,
  minBendRadiusMm: null,
  lengthChoice: "undecided",
};

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const validPoint = (p: unknown): p is Point =>
  Array.isArray(p) && p.length === 3 && p.every(finite);

/** Contrôle strict des saisies : négatif, NaN, Infinity et points incomplets sont refusés. */
export function validateCabling(config: CablingConfig): string[] {
  const errors: string[] = [];
  const checkPoint = (label: string, p: Point | null, required: boolean) => {
    if (p === null) {
      if (required) errors.push(`${label} : coordonnées non renseignées.`);
      return;
    }
    if (!validPoint(p)) errors.push(`${label} : chaque coordonnée doit être un nombre valide.`);
  };
  checkPoint("Point capteur", config.sensorEndpoint, false);
  checkPoint("Point de connexion", config.connectionEndpoint, false);
  config.waypoints.forEach((w, i) => checkPoint(`Point intermédiaire ${i + 1}`, w, true));

  const margins: [string, number][] = [
    ["Réserve de service", config.serviceReserveMm],
    ["Terminaison", config.terminationMm],
    ["Tolérance", config.toleranceMm],
    ["Surplus logeable", config.surplusHousingMm],
  ];
  for (const [label, value] of margins)
    if (!finite(value) || value < 0) errors.push(`${label} : valeur positive ou nulle attendue.`);

  if (config.minBendRadiusMm !== null && (!finite(config.minBendRadiusMm) || config.minBendRadiusMm <= 0))
    errors.push("Rayon de courbure minimal : valeur strictement positive attendue.");

  const seen = new Set<string>();
  for (const path of config.statePaths) {
    if (!path.stateId.trim()) errors.push("Un état de mouvement sans identifiant a été ignoré.");
    else if (seen.has(path.stateId))
      errors.push(`État « ${path.label || path.stateId} » : identifiant en double.`);
    seen.add(path.stateId);
    if (path.points.length < 2)
      errors.push(`État « ${path.label || path.stateId} » : au moins deux points sont nécessaires.`);
    if (!path.points.every(validPoint))
      errors.push(`État « ${path.label || path.stateId} » : coordonnées invalides.`);
  }
  return errors;
}

/** États déclarés qui n'ont encore aucun trajet dessiné. */
export function uncoveredMotionStates(config: CablingConfig): { id: string; label: string }[] {
  const covered = new Set(config.statePaths.map((p) => p.stateId));
  return config.declaredMotionStates.filter((s) => !covered.has(s.id));
}

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
  errors: string[];
  /** Longueur du plus long trajet parcouru, marges exclues. `null` = inconnue. */
  longestPathMm: number | null;
  longestPathState: string | null;
  perState: { stateId: string; label: string; lengthMm: number }[];
  serviceReserveMm: number;
  terminationMm: number;
  toleranceMm: number;
  surplusHousingMm: number;
  /** Longueur minimale demandée = plus long trajet + réserve + terminaison. `null` = inconnue. */
  requiredMm: number | null;
  approved: false;
  warnings: string[];
}

export function estimateCableLength(config: CablingConfig): CableLengthEstimate {
  const errors = validateCabling(config);
  const warnings: string[] = [];
  const basePoints: Point[] = [];
  if (config.sensorEndpoint) basePoints.push(config.sensorEndpoint);
  basePoints.push(...config.waypoints);
  if (config.connectionEndpoint) basePoints.push(config.connectionEndpoint);

  const geometryComplete =
    Boolean(config.sensorEndpoint) && Boolean(config.connectionEndpoint) && basePoints.length >= 2;
  const complete = geometryComplete && errors.length === 0;
  if (!geometryComplete)
    warnings.push(
      "Trajet incomplet : la longueur reste inconnue tant que le point capteur et le point de connexion ne sont pas placés.",
    );
  if (errors.length) warnings.push("Des valeurs saisies sont invalides : la longueur reste inconnue.");

  const perState = complete
    ? [
        { stateId: "base", label: "Trajet de référence", lengthMm: polylineLength(basePoints) },
        ...config.statePaths.map((p) => ({
          stateId: p.stateId,
          label: p.label,
          lengthMm: polylineLength(p.points),
        })),
      ]
    : [];
  const longest = perState.length ? perState.reduce((a, b) => (b.lengthMm > a.lengthMm ? b : a)) : null;

  const uncovered = uncoveredMotionStates(config);
  if (uncovered.length)
    warnings.push(
      `États de mouvement sans trajet : ${uncovered.map((s) => s.label).join(", ")}. La longueur ne couvre pas encore tous les mouvements.`,
    );
  if (!config.motionCoverageConfirmed)
    warnings.push("Couverture des mouvements non confirmée par vous.");
  if (config.serviceReserveMm + config.terminationMm === 0)
    warnings.push("Aucune réserve de service ni terminaison n'a été ajoutée.");
  if (config.toleranceMm === 0)
    warnings.push("Tolérance fournisseur non renseignée : elle est distincte du surplus logeable.");
  if (config.minBendRadiusMm === null)
    warnings.push("Rayon de courbure minimal non renseigné : risques de pincement non contrôlés.");
  // Rappel systématique : cette estimation n'est jamais une longueur approuvée.
  warnings.push(
    "Estimation d'aide à la conception : ce n'est pas une longueur approuvée, la R&D Standex vérifie.",
  );

  return {
    complete,
    errors,
    longestPathMm: longest ? longest.lengthMm : null,
    longestPathState: longest ? longest.stateId : null,
    perState,
    serviceReserveMm: config.serviceReserveMm,
    terminationMm: config.terminationMm,
    toleranceMm: config.toleranceMm,
    surplusHousingMm: config.surplusHousingMm,
    // La tolérance fournisseur n'est PAS ajoutée au besoin : elle sert à comparer
    // le nominal MIN (longueur suffisante) et le nominal MAX (surplus à loger).
    requiredMm: longest ? longest.lengthMm + config.serviceReserveMm + config.terminationMm : null,
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

/** Aucune référence commandable exacte n'est documentée dans ce projet. */
export const STANDARD_CABLE_LENGTHS: readonly StandardCableOption[] = [];

/** Donnée de GAMME, indicative : ce n'est pas une référence commandable. */
export interface RangeCableLengthNote {
  range: string;
  lengths: string;
  source: string;
}

export const RANGE_CABLE_LENGTH_NOTES: readonly RangeCableLengthNote[] = [
  {
    range: "MK36",
    lengths: "300 mm UL1569 et 2 m VdS (températures différentes selon la version)",
    source: "docs/atelier-magnetique-v04.md",
  },
  {
    range: "MK37",
    lengths: "300 mm UL1569 et 2 m VdS (températures différentes selon la version)",
    source: "docs/atelier-magnetique-v04.md",
  },
  {
    range: "MK38",
    lengths: "300 mm UL1569 en standard, autres longueurs sur demande",
    source: "docs/atelier-magnetique-v04.md",
  },
];

export function rangeCableLengthNote(rangeOrMpn: string): RangeCableLengthNote | null {
  const key = rangeOrMpn.trim().toUpperCase();
  return RANGE_CABLE_LENGTH_NOTES.find((n) => key.startsWith(n.range)) ?? null;
}

export type StandardLengthVerdict =
  | { kind: "unknown_requirement"; message: string }
  | { kind: "no_sourced_option"; message: string; rangeNote: RangeCableLengthNote | null }
  | {
      kind: "standard_possible";
      option: StandardCableOption;
      /** Surplus au pire cas : nominal MAX − besoin. */
      surplusMm: number;
      message: string;
    }
  | { kind: "custom_to_review"; requiredMm: number; message: string };

export function compareStandardLengths(
  mpn: string,
  requiredMm: number | null,
  /** Capacité de logement du surplus, distincte de la tolérance fournisseur. */
  surplusHousingMm: number,
  catalog: readonly StandardCableOption[] = STANDARD_CABLE_LENGTHS,
): StandardLengthVerdict {
  if (requiredMm === null || !Number.isFinite(requiredMm) || requiredMm <= 0)
    return {
      kind: "unknown_requirement",
      message:
        "Longueur nécessaire inconnue : complétez le trajet avant toute comparaison avec une longueur catalogue.",
    };
  // Comparaison sur référence exacte : MK03-1A66-200W et MK03-1A66-500W sont distincts.
  const options = catalog.filter((o) => o.mpn === mpn);
  if (!options.length)
    return {
      kind: "no_sourced_option",
      message: `Aucune longueur commandable sourcée pour ${mpn || "cette référence"}. Longueur à faire vérifier par la R&D.`,
      rangeNote: rangeCableLengthNote(mpn),
    };
  const usable = options
    // Longueur suffisante : on compare au nominal MINIMAL garanti.
    .filter((o) => o.nominalMm - o.toleranceMm >= requiredMm)
    // Surplus à loger : on compare au nominal MAXIMAL possible.
    .filter((o) => o.nominalMm + o.toleranceMm - requiredMm <= surplusHousingMm)
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
    surplusMm: option.nominalMm + option.toleranceMm - requiredMm,
    message: `${option.mpn} couvre le besoin (tolérance ±${option.toleranceMm} mm, source : ${option.source}).`,
  };
}
