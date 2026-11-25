/** Isolated level UX prototype. No magnetic engine, qualified SKU or production dossier. */
export type Family = "LS01" | "LS02" | "LS03" | "LS04" | "LS05";
export type Fluid = "water" | "oil" | "other" | "unknown";
export interface LevelContext {
  fluid: Fluid;
  fluidName: string;
  temperatureMin: string;
  temperatureMax: string;
  purpose: string;
  tank: "vented" | "pressurised" | "unknown";
  bodyExposure: "permanent" | "intermittent" | "unknown";
  cableExposure: "dry" | "wet" | "unknown";
  constraints: string;
}
export interface LevelConfiguration {
  mode: "points" | "continuous";
  count: number;
  orientation: "vertical" | "horizontal";
  mounting: "top" | "bottom";
  reachMm: number;
  tankHeightMm: number;
  pointsMm: number[];
  pointsPerFloat: 1 | 2;
  closedWhen: "low" | "high";
  connection: "standard" | "DK" | "DL" | "GZ";
  custom: boolean;
  customDescription: string;
}
export const INITIAL_CONTEXT: LevelContext = {
  fluid: "unknown", fluidName: "", temperatureMin: "", temperatureMax: "", purpose: "",
  tank: "unknown", bodyExposure: "unknown", cableExposure: "unknown", constraints: "",
};
export const INITIAL_CONFIGURATION: LevelConfiguration = {
  mode: "points", count: 1, orientation: "vertical", mounting: "top", reachMm: 32.5,
  tankHeightMm: 100, pointsMm: [70], pointsPerFloat: 2, closedWhen: "low",
  connection: "standard", custom: false, customDescription: "",
};
export const FAMILY_LABELS: Record<Family, string> = {
  LS01: "Vertical compact", LS02: "Vertical à course plus longue", LS03: "Montage latéral",
  LS04: "Tige plastique configurable", LS05: "Tige inox configurable",
};
// Documentary screening only: series PDFs v02, 05 Mar 2019, p2.
// LS03 80 °C refers to the provided PA/PP standard plans, not a merged 80/100 envelope.
// LS05 160/200 conflict stays unresolved; never qualify all stainless constructions at 200.
export const THERMAL_EVIDENCE = {
  LS01: { min: -20, max: 80, source: "L01 · fiche LS01, p. 2" },
  LS02: { min: -20, max: 80, source: "L03 · fiche LS02 plastique, p. 2" },
  LS03: { min: -30, max: 80, source: "L12/L13 · plans LS03 PA/PP" },
  LS04: { min: -20, max: 70, source: "L05 · fiche LS04, p. 2" },
  LS05: { min: -40, max: 160, source: "L06 · fiche LS05, p. 2 ; écart C02 conservé" },
} as const;
export function finiteInput(value: string): number | null {
  if (!value.trim()) return null;
  const n = Number(value.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
export function contextErrors(context: LevelContext): string[] {
  const errors: string[] = [];
  const lo = finiteInput(context.temperatureMin), hi = finiteInput(context.temperatureMax);
  if ((context.temperatureMin.trim() && lo === null) || (context.temperatureMax.trim() && hi === null))
    errors.push("Saisissez une température valide ou laissez le champ à définir.");
  if (lo !== null && hi !== null && lo > hi) errors.push("La température minimale doit être inférieure à la maximale.");
  if ((lo !== null && lo < -273.15) || (hi !== null && hi < -273.15)) errors.push("Cette température est inférieure au zéro absolu.");
  return errors;
}
export function architectureFamily(c: LevelConfiguration): Family {
  if (c.orientation === "horizontal") return "LS03";
  if (c.mode === "continuous") return "LS05";
  if (c.count === 1 && c.reachMm <= 32.5) return "LS01";
  if (c.count === 1 && c.reachMm <= 56) return "LS02";
  return c.reachMm <= 250 ? "LS04" : "LS05";
}
export interface CandidateAssessment {
  family: Family;
  status: "study" | "excluded";
  reasons: string[];
  material: "PP" | "PA" | "SS" | "to_define";
  source: string;
}
export function assessFamily(family: Family, context: LevelContext, c: LevelConfiguration): CandidateAssessment {
  const reasons: string[] = [];
  let excluded = false;
  const evidence = THERMAL_EVIDENCE[family];
  const lo = finiteInput(context.temperatureMin), hi = finiteInput(context.temperatureMax);
  if ((family === "LS03") !== (c.orientation === "horizontal")) {
    excluded = true; reasons.push("Cette famille ne correspond pas à l’orientation choisie.");
  }
  if (c.mode === "continuous" && family !== "LS05") {
    excluded = true; reasons.push("Le continu est étudié sur le LS05 inox.");
  }
  if (c.mode === "points" && c.count > 1 && ["LS01", "LS02", "LS03"].includes(family)) {
    excluded = true; reasons.push("Cette famille standard ne couvre pas plusieurs points sur un seul capteur.");
  }
  if ((family === "LS01" && c.reachMm > 32.5) || (family === "LS02" && c.reachMm > 56)) {
    excluded = true; reasons.push("La longueur souhaitée dépasse le corps standard représenté.");
  }
  if ((family === "LS01" && c.reachMm < 32.5) || (family === "LS02" && c.reachMm < 56))
    reasons.push(`Longueur standard représentée : ${family === "LS01" ? 32.5 : 56} mm sous fixation. Écart avec la demande à étudier.`);
  if (family === "LS04" && c.reachMm > 250) {
    excluded = true; reasons.push("La longueur souhaitée dépasse la plage illustrée du LS04 ; extensions à étudier.");
  }
  if (family === "LS04" && Math.ceil(c.count / c.pointsPerFloat) > 6) {
    excluded = true; reasons.push("Le LS04 est limité à six flotteurs ; essayer deux points par flotteur ou une autre famille.");
  }
  if (hi !== null && hi > evidence.max) {
    if (family === "LS05" && hi <= 200) reasons.push("Entre 160 et 200 °C : construction inox et tenue de chaque partie à confirmer.");
    else { excluded = true; reasons.push(`La température maximale dépasse ${family === "LS05" ? 200 : evidence.max} °C pour le périmètre documentaire utilisé.`); }
  }
  if (lo !== null && lo < evidence.min) {
    // Exact constructions can differ from the series; do not exclude the whole family.
    reasons.push("Température minimale hors de la plage de série utilisée : une construction précise doit être étudiée.");
  }
  if (contextErrors(context).length) {
    excluded = true; reasons.push("Corriger les températures avant de proposer une famille.");
  }
  if (lo === null || hi === null) reasons.push("Compléter les températures pour affiner les pistes.");
  if (context.fluid === "other" || context.fluid === "unknown") reasons.push("Matériaux à étudier avec le liquide exact.");
  if (context.bodyExposure === "permanent") reasons.push("Immersion permanente du corps : tenue et durée à confirmer.");
  if (context.cableExposure === "wet") reasons.push("Câble immergé : demande spécifique, y compris avec une finition DK, DL ou GZ.");
  if (context.tank === "pressurised") reasons.push("Tenue en pression à confirmer sur la construction.");
  if (c.mounting === "bottom" && c.orientation === "vertical") reasons.push("Pose par le fond et logique de contact à confirmer.");
  return { family, status: excluded ? "excluded" : "study", reasons,
    material: family === "LS05" ? "SS" : context.fluid === "water" ? "PP" : context.fluid === "oil" ? "PA" : "to_define",
    source: evidence.source };
}
export function assessConfiguration(context: LevelContext, c: LevelConfiguration) {
  const preferred = architectureFamily(c);
  const order = [preferred, ...(["LS01", "LS02", "LS03", "LS04", "LS05"] as Family[]).filter(f => f !== preferred)];
  const candidates = order.map(f => assessFamily(f, context, c));
  return { candidates, selected: c.custom ? null : candidates.find(f => f.status === "study") ?? null,
    specific: c.custom || context.cableExposure === "wet" || !candidates.some(f => f.status === "study") };
}
export function setPointCount(c: LevelConfiguration, count: number): LevelConfiguration {
  const n = Math.max(1, Math.min(12, Math.round(count)));
  if (n === c.count) return c;
  const points = Array.from({ length: n }, (_, i) => Math.round(c.tankHeightMm * (i + 1) / (n + 1)));
  // Changing the number redistributes the requested points and extends a vertical
  // stem when necessary. Manual length edits remain explicit and are never repaired.
  const furthest = c.mounting === "top" ? c.tankHeightMm - points[0]! : points.at(-1)!;
  const reachMm = c.orientation === "vertical" && n > 1
    ? Math.max(c.reachMm, Math.min(c.tankHeightMm, furthest + FLOAT_HEIGHT_MM)) : c.reachMm;
  return { ...c, count: n, pointsMm: points, reachMm };
}
/** Fixed envelope; animation may translate the float but must never resize it. */
export const FLOAT_HEIGHT_MM = 19;
export const FLOAT_CLEARANCE_MM = 2;
export function verticalMechanics(c: LevelConfiguration, family: Family = architectureFamily(c)) {
  const reachMm = family === "LS01" ? 32.5 : family === "LS02" ? 56 : c.reachMm;
  const datumMm = c.mounting === "top" ? c.tankHeightMm : 0;
  const endMm = c.mounting === "top" ? datumMm - reachMm : reachMm;
  const margin = FLOAT_HEIGHT_MM / 2 + 1.5;
  const stemLow = Math.min(datumMm, endMm) + margin;
  const stemHigh = Math.max(datumMm, endMm) - margin;
  const compact = family === "LS01" || family === "LS02";
  const count = compact || c.mode === "continuous" ? 1 : requestedFloats(c);
  const groups = Array.from({ length: count }, (_, i) => {
    const first = c.pointsMm[i * c.pointsPerFloat] ?? c.tankHeightMm / 2;
    const last = c.pointsMm[Math.min(c.pointsMm.length - 1, (i + 1) * c.pointsPerFloat - 1)] ?? first;
    return { first, last };
  });
  const halfGap = (FLOAT_HEIGHT_MM + FLOAT_CLEARANCE_MM) / 2;
  const floats = groups.map((group, i) => {
    const previous = groups[i - 1], next = groups[i + 1];
    const fullTravel = count === 1;
    const lowerMm = Math.max(stemLow, fullTravel ? stemLow : group.first - 8,
      previous ? (previous.last + group.first) / 2 + halfGap : stemLow);
    const upperMm = Math.min(stemHigh, fullTravel ? stemHigh : group.last + 8,
      next ? (group.last + next.first) / 2 - halfGap : stemHigh);
    return { lowerMm, upperMm, heightMm: FLOAT_HEIGHT_MM };
  });
  return { reachMm, datumMm, endMm, floats,
    valid: reachMm <= c.tankHeightMm && floats.every(f => f.lowerMm <= f.upperMm) };
}
export function configurationIssues(c: LevelConfiguration): string[] {
  const problems: string[] = [];
  if (c.orientation === "vertical" && c.reachMm > c.tankHeightMm)
    problems.push("La tige dépasse la hauteur utile de la cuve. Vérifier les dimensions du montage.");
  if (c.orientation === "horizontal" && (c.mode === "continuous" || c.count > 1))
    problems.push("Un LS03 seul ne couvre pas cette demande. Essayer une tige verticale ou décrire un montage spécifique.");
  if (c.mode === "points") {
    if (c.pointsMm.some((p, i) => p < 0 || p > c.tankHeightMm || (i > 0 && p <= c.pointsMm[i - 1]!)))
      problems.push("Les points doivent être ordonnés du fond vers le haut, à l’intérieur de la cuve.");
    if (c.orientation === "vertical" && c.pointsMm.some(p => c.mounting === "top" ? p < c.tankHeightMm - c.reachMm : p > c.reachMm))
      problems.push("Un point souhaité dépasse la longueur de tige sous la fixation. Allonger la tige ou déplacer le point.");
  }
  if (c.orientation === "vertical" && problems.length === 0 && !verticalMechanics(c).valid)
    problems.push("L’espace ne permet pas de séparer les flotteurs et leurs courses. Espacer les points ou revoir la répartition des flotteurs.");
  return problems;
}
/** Animated output illustrates requested behaviour, not a physical switching prediction. */
export function illustrativeReading(c: LevelConfiguration, levelMm: number) {
  const level = Math.max(0, Math.min(c.tankHeightMm, levelMm));
  const zone = c.pointsMm.filter(p => level >= p).length;
  const active = c.closedWhen === "low" ? level < (c.pointsMm[0] ?? 0) : level >= (c.pointsMm[0] ?? 0);
  return { level, zone, active, steppedMm: Math.floor(level / 5) * 5,
    usable: configurationIssues(c).length === 0 && !c.custom };
}
export function requestedFloats(c: LevelConfiguration): number {
  return c.mode === "continuous" ? 1 : Math.ceil(c.count / c.pointsPerFloat);
}
export function floatCentres(c: LevelConfiguration, levelMm: number, family?: Family): number[] {
  const mechanics = verticalMechanics(c, family);
  if (!mechanics.valid) return [];
  return mechanics.floats.map(f => Math.max(f.lowerMm, Math.min(f.upperMm, levelMm - 4)));
}
export function createLevelBrief(context: LevelContext, configuration: LevelConfiguration, cable: { lengthMm: string; connector: string }, contact: Record<string, string>) {
  const assessment = assessConfiguration(context, configuration);
  return { schema: "sensor-studio.level-preview.v1", status: "draft_not_submitted", qualification: "not_qualified",
    context, requested_configuration: configuration, study_family: assessment.selected?.family ?? null,
    specific_request: assessment.specific || configurationIssues(configuration).length > 0, remaining_questions: [...(assessment.selected?.reasons ?? []), ...configurationIssues(configuration)],
    cable, contact, simulation: { kind: "requested_behaviour_only", switching_heights_verified: false, resistance_values_known: false } };
}
