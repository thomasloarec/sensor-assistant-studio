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
  mountingAccess: "unknown" | "free" | "top" | "side" | "bottom";
  tankHeight: string;
  detectionGoal: "unknown" | "high" | "low" | "multiple" | "continuous";
  detectionHeight: string;
  responsePriority: "unknown" | "limit" | "movement";
}
export interface LevelConfiguration {
  mode: "points" | "continuous";
  count: number;
  orientation: "vertical" | "horizontal";
  mounting: "top" | "support" | "bottom";
  mountingHeightMm: number;
  travelPreference: "short" | "long";
  floatTravelMm: number;
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
  mountingAccess: "unknown", tankHeight: "", detectionGoal: "unknown", detectionHeight: "", responsePriority: "unknown",
};
export const INITIAL_CONFIGURATION: LevelConfiguration = {
  mode: "points", count: 1, orientation: "vertical", mounting: "support", reachMm: 32.5,
  mountingHeightMm: 100, travelPreference: "short", floatTravelMm: 10.5,
  tankHeightMm: 100, pointsMm: [93], pointsPerFloat: 2, closedWhen: "high",
  connection: "standard", custom: false, customDescription: "",
};
/** Series drawings, p.1: LS04 80–250 mm and LS05 80–2000 mm.
 * These are the preview's reach limits, not maximum tank dimensions in service. */
export const MAX_REACH_MM = 2000;
// Preview viewport limit, independent of the catalogue's maximum stem length.
export const MAX_TANK_HEIGHT_MM = 10000;
export const MAX_PLASTIC_REACH_MM = 250;
// Clearances of the illustrated LS03 envelope and its downward pivot, not mounting specifications.
export const HORIZONTAL_CLEARANCE_MM = { below: 45, above: 12 };
export function pointIntent(c: LevelConfiguration, index: number): "low" | "high" {
  return c.count === 1 ? c.closedWhen : index === 0 ? "low" : "high";
}
// Illustrated vertical sweep, not a verified reed switching angle. The requested
// threshold marks the start of the motion: rising from down / falling from level.
const HORIZONTAL_SWEEP_MM = 28.8;
function horizontalThresholdOffset(c: LevelConfiguration, index: number) {
  return pointIntent(c, index) === "high" ? HORIZONTAL_SWEEP_MM : 0;
}
export function horizontalMountHeight(c: LevelConfiguration, index = 0) { return c.pointsMm[index]! + horizontalThresholdOffset(c, index); }
export function horizontalPointBounds(c: LevelConfiguration, index = 0) {
  const offset = horizontalThresholdOffset(c, index);
  return { min: Math.round((HORIZONTAL_CLEARANCE_MM.below - offset)*10000)/10000,
    max: Math.round((c.tankHeightMm - HORIZONTAL_CLEARANCE_MM.above - offset)*10000)/10000 };
}
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
  if (c.count === 1 && c.reachMm <= compactReach(c)) return c.travelPreference === "long" ? "LS02" : "LS01";
  return c.reachMm <= MAX_PLASTIC_REACH_MM ? "LS04" : "LS05";
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
  if (c.mode === "points" && c.count > 1 && ["LS01", "LS02"].includes(family)) {
    excluded = true; reasons.push("Cette famille standard ne couvre pas plusieurs points sur un seul capteur.");
  }
  if (family === "LS01" && c.travelPreference === "long") {
    excluded = true; reasons.push("La course courte ne correspond pas au mouvement plus ample demandé.");
  }
  if (family === "LS02" && c.travelPreference === "short") {
    excluded = true; reasons.push("La course plus longue n’est pas le comportement demandé.");
  }
  if ((family === "LS01" && c.reachMm > 32.5) || (family === "LS02" && c.reachMm > 56)) {
    excluded = true; reasons.push("La longueur souhaitée dépasse le corps standard représenté.");
  }
  if ((family === "LS01" && c.reachMm < 32.5) || (family === "LS02" && c.reachMm < 56))
    reasons.push(`Longueur standard représentée : ${family === "LS01" ? "3,25" : "5,6"} cm sous fixation. Écart avec la demande à étudier.`);
  if (family === "LS04" && c.reachMm > 250) {
    excluded = true; reasons.push("La longueur souhaitée dépasse la plage illustrée du LS04 ; extensions à étudier.");
  }
  if (family === "LS05" && c.reachMm > MAX_REACH_MM) {
    excluded = true; reasons.push("La tige dépasse 200 cm. Réduire sa longueur ou demander une forme spécifique.");
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
export function compactReach(c: LevelConfiguration) { return c.travelPreference === "long" ? 56 : 32.5; }
export function mountingDatum(c: LevelConfiguration) {
  return c.mounting === "bottom" ? 0 : c.mounting === "support" ? c.mountingHeightMm : c.tankHeightMm;
}
export function isCompact(family: Family) { return family === "LS01" || family === "LS02"; }
/** Desired product behaviour, not the form of the internal bare reed. */
export function proposedContactForm(c: LevelConfiguration, family: Family): "A" | "B" | null {
  return !c.custom && c.orientation === "vertical" && c.mounting !== "bottom" && c.mode === "points" && c.count === 1 && isCompact(family)
    ? c.closedWhen === "high" ? "B" : "A" : null;
}
export function setPointCount(c: LevelConfiguration, count: number): LevelConfiguration {
  const n = Math.max(1, Math.min(12, Math.round(count)));
  if (n === c.count) return c;
  const points = Array.from({ length: n }, (_, i) => Math.round(c.tankHeightMm * (i + 1) / (n + 1)));
  // Changing the number redistributes the requested points and extends a vertical
  // stem when necessary. Manual length edits remain explicit and are never repaired.
  const furthest = c.mounting !== "bottom" ? c.tankHeightMm - points[0]! : points.at(-1)!;
  const reachMm = c.orientation === "vertical" && n > 1
    ? Math.max(c.reachMm, Math.min(c.tankHeightMm, furthest + FLOAT_HEIGHT_MM)) : c.reachMm;
  const next = { ...c, count: n, pointsMm: points, reachMm, mountingHeightMm: c.tankHeightMm };
  return n === 1 ? fitStemToPoints(next) : next;
}
/** Explicit resize operation: preserve relative levels and reach, never stale mm. */
export function resizeTank(c: LevelConfiguration, height: number): LevelConfiguration {
  const tankHeightMm = Math.max(60, Math.min(MAX_TANK_HEIGHT_MM, Math.round(height)));
  const ratio = tankHeightMm / c.tankHeightMm;
  const mountingHeightMm = Math.min(tankHeightMm, Math.round(c.mountingHeightMm * ratio * 2) / 2);
  const available = c.mounting === "support" ? mountingHeightMm : tankHeightMm;
  // Continuous mode is top/full-depth by default. Keep a manually shortened
  // stem's proportion, but round datum and length in the same unit and clamp.
  // Never use a tank-sized fallback which exceeds a lowered support datum.
  const oldAvailable = c.mounting === "support" ? c.mountingHeightMm : c.tankHeightMm;
  const followsDepth = c.reachMm >= Math.min(MAX_REACH_MM, oldAvailable) - .001;
  if (c.mode === "continuous") return { ...c, tankHeightMm, mountingHeightMm,
    pointsMm: c.pointsMm.map(p => Math.round(p * ratio)),
    reachMm: Math.min(MAX_REACH_MM, available, followsDepth ? available : Math.round(c.reachMm * ratio * 2) / 2) };
  let pointsMm = c.pointsMm.map(p => Math.round(p * ratio));
  const compact = isCompact(architectureFamily(c));
  const reachMm = compact ? compactReach(c) : Math.min(MAX_REACH_MM, available, Math.max(32.5, Math.round(c.reachMm * ratio * 2) / 2));
  const floatTravelMm = compact ? c.floatTravelMm : Math.max(2, Math.min(tankHeightMm - 32, Math.round(c.floatTravelMm * ratio * 2) / 2));
  if (c.mode === "points" && c.count === 1 && c.orientation === "vertical") {
    if (compact) {
      const min = c.closedWhen === "high" ? compactReach(c) - 7 : 15;
      const max = c.closedWhen === "high" ? tankHeightMm - 7 : tankHeightMm - compactReach(c) + 15;
      pointsMm = [c.mounting === "top" ? max : c.mounting === "bottom" ? min : Math.max(min, Math.min(max, pointsMm[0]!))];
    } else {
      const min = (c.mounting === "bottom" ? 15 : 23) + (c.closedWhen === "high" ? floatTravelMm : 0);
      const max = tankHeightMm - (c.mounting === "bottom" ? 15 : 7) - (c.closedWhen === "low" ? floatTravelMm : 0);
      pointsMm = [Math.max(min, Math.min(max, pointsMm[0]!))];
    }
  }
  const next = { ...c, tankHeightMm, pointsMm, reachMm, floatTravelMm, mountingHeightMm };
  if (c.mode === "points" && c.count === 1) return fitStemToPoints(next);
  // A fixed retaining cap cannot scale with the tank. Use the remaining depth
  // when a resize would otherwise leave a just-too-short illustrative stem.
  return next.orientation === "vertical" && !verticalMechanics(next).valid && reachMm < available
    ? { ...next, reachMm: Math.min(MAX_REACH_MM, available) } : next;
}
export function distributePoints(c: LevelConfiguration): LevelConfiguration {
  return setPointCount({ ...c, count: 0 }, c.count);
}
export function fitStemToPoints(c: LevelConfiguration): LevelConfiguration {
  if (c.orientation === "horizontal") return c;
  if (c.mode === "continuous") return { ...c, reachMm: Math.min(MAX_REACH_MM, c.tankHeightMm), mountingHeightMm: c.tankHeightMm };
  const single = c.count === 1, standard = compactReach(c), point = c.pointsMm[0]!;
  const compact = single && c.reachMm <= standard;
  if (compact) {
    const datum = c.mounting === "bottom" ? 0 : point + (c.closedWhen === "high" ? 7 : standard - 15);
    const atBottom = c.mounting === "bottom" && Math.abs(point - (c.closedWhen === "low" ? 15 : standard - 7)) < .01;
    if (atBottom || (c.mounting === "support" && datum >= standard && datum <= c.tankHeightMm)
      || (c.mounting === "top" && Math.abs(datum - c.tankHeightMm) < .01))
      return { ...c, reachMm: standard, mountingHeightMm: datum };
  }
  // Long stems keep the mounting at the opening and localise the float travel near the point.
  const datum = c.mounting === "support" && compact ? c.tankHeightMm : mountingDatum(c);
  const available = c.mounting === "bottom" ? c.tankHeightMm : datum;
  const required = single
    ? c.mounting === "bottom" ? point + 15 + (c.closedWhen === "low" ? c.floatTravelMm : 0)
      : datum - point + 23 + (c.closedWhen === "high" ? c.floatTravelMm : 0)
    : (c.mounting === "bottom" ? Math.max(...c.pointsMm) : datum - Math.min(...c.pointsMm)) + FLOAT_HEIGHT_MM;
  return { ...c, mountingHeightMm: datum, reachMm: Math.min(available, MAX_REACH_MM,
    Math.max(single ? 80 : 32.5, required, compact ? 0 : c.reachMm)) };
}
export function setDetectionGoal(c: LevelConfiguration, goal: "high" | "low") {
  let p = c.mounting === "bottom" ? goal === "low" ? 15 : compactReach(c) - 7
    : goal === "high" ? c.tankHeightMm - 7 : Math.max(25, Math.round(c.tankHeightMm * .2));
  if (c.orientation === "horizontal") {
    const bounds = horizontalPointBounds({ ...c, closedWhen: goal });
    p = Math.max(bounds.min, Math.min(bounds.max, Math.round(c.tankHeightMm * (goal === "high" ? .7 : .2))));
  } else if (c.mounting === "support" && goal === "low") p = Math.min(p, c.tankHeightMm - compactReach(c) + 15);
  return fitStemToPoints({ ...c, closedWhen: goal, pointsMm: [p], reachMm: c.mounting === "support" ? compactReach(c) : c.reachMm });
}
export function setMounting(c: LevelConfiguration, mounting: LevelConfiguration["mounting"]) {
  return fitStemToPoints({ ...c, mounting, mountingHeightMm: c.tankHeightMm,
    reachMm: c.mode === "points" && c.count === 1 ? compactReach(c) : c.reachMm });
}
export function setTravelPreference(c: LevelConfiguration, preference: "short" | "long") {
  const compact = isCompact(architectureFamily(c));
  return fitStemToPoints({ ...c, travelPreference: preference, floatTravelMm: preference === "long" ? 34 : 10.5,
    reachMm: compact ? preference === "long" ? 56 : 32.5 : c.reachMm });
}
// Interactive limits preserve the point count and rigid float clearances.
function pointGap(c: LevelConfiguration, index: number) {
  return index % c.pointsPerFloat === 0 ? FLOAT_HEIGHT_MM + FLOAT_CLEARANCE_MM + 1 : 1;
}
export function reachBounds(c: LevelConfiguration) {
  const max = Math.min(MAX_REACH_MM, c.mounting === "bottom" ? c.tankHeightMm : mountingDatum(c));
  const packed = c.pointsMm.slice(1).reduce((sum, _, i) => sum + pointGap(c, i + 1), 0);
  return { min: Math.min(max, c.mode === "points" && c.count > 1 ? 30 + packed : c.mode === "points" ? compactReach(c) : 25), max };
}
/** Explicit length edit may return to a fixed-size compact. Reposition its point
 * with the selected mounting instead of retaining a long-stem threshold. */
export function setReach(c: LevelConfiguration, requested: number): LevelConfiguration {
  const bounds = reachBounds(c);
  const reachMm = Math.max(bounds.min, Math.min(bounds.max, requested));
  let next = { ...c, reachMm };
  if (c.orientation === "vertical" && c.mode === "points" && c.count === 1 && reachMm <= compactReach(c)) {
    const standard = compactReach(c);
    const min = c.closedWhen === "high" ? standard - 7 : 15;
    const max = c.closedWhen === "high" ? c.tankHeightMm - 7 : c.tankHeightMm - standard + 15;
    next = { ...next, pointsMm: [c.mounting === "bottom" ? min : c.mounting === "top" ? max : Math.max(min, Math.min(max, c.pointsMm[0]!))] };
  }
  return constrainPointLayout(next);
}
function pointZone(c: LevelConfiguration) {
  // Include the plastic end-cap allowance even when the liquid requires inox.
  return c.mounting === "bottom" ? { min: 11, max: c.reachMm - 19 }
    : { min: mountingDatum(c) - c.reachMm + 19, max: mountingDatum(c) - 11 };
}
export function constrainPointLayout(c: LevelConfiguration): LevelConfiguration {
  if (c.mode !== "points") return c;
  if (c.orientation === "horizontal") {
    const gap = HORIZONTAL_CLEARANCE_MM.below + HORIZONTAL_CLEARANCE_MM.above;
    if (c.tankHeightMm < gap * c.count) return c;
    const mounts = c.pointsMm.map((_,i) => Math.max(HORIZONTAL_CLEARANCE_MM.below,
      Math.min(c.tankHeightMm - HORIZONTAL_CLEARANCE_MM.above, horizontalMountHeight(c,i))));
    for(let i=mounts.length-2;i>=0;i--) mounts[i]=Math.min(mounts[i]!,mounts[i+1]!-gap);
    mounts[0]=Math.max(HORIZONTAL_CLEARANCE_MM.below,mounts[0]!);
    for(let i=1;i<mounts.length;i++) mounts[i]=Math.max(mounts[i]!,mounts[i-1]!+gap);
    return {...c,pointsMm:mounts.map((height,i)=>Math.round((height-horizontalThresholdOffset(c,i))*10000)/10000)};
  }
  if (c.count === 1 && isCompact(architectureFamily(c))) return fitStemToPoints(c);
  const limits = reachBounds(c);
  const min = c.count === 1 ? Math.min(limits.max, Math.max(limits.min, 30 + c.floatTravelMm)) : limits.min;
  const next = { ...c, reachMm: Math.max(min, Math.min(limits.max, c.reachMm)) };
  const zone = pointZone(next);
  if (next.count === 1) {
    const bounds = singlePointZone(next);
    return bounds.min <= bounds.max ? { ...next, pointsMm: [Math.max(bounds.min, Math.min(bounds.max, next.pointsMm[0]!))] } : next;
  }
  const gaps = next.pointsMm.map((_, i) => i ? pointGap(next, i) : 0);
  if (zone.max - zone.min < gaps.reduce((a, b) => a + b, 0)) return next;
  const pointsMm = next.pointsMm.map(p => Math.max(zone.min, Math.min(zone.max, p)));
  for (let i = pointsMm.length - 2; i >= 0; i--) pointsMm[i] = Math.min(pointsMm[i]!, pointsMm[i + 1]! - gaps[i + 1]!);
  pointsMm[0] = Math.max(zone.min, pointsMm[0]!);
  for (let i = 1; i < pointsMm.length; i++) pointsMm[i] = Math.max(pointsMm[i]!, pointsMm[i - 1]! + gaps[i]!);
  return { ...next, pointsMm };
}
/** Minimum tank height for the current illustrated assembly, not a product rating. */
export function minimumTankHeight(c: LevelConfiguration) {
  if(c.mode !== "points") return 60;
  if(c.orientation === "horizontal") return Math.max(60,c.count*(HORIZONTAL_CLEARANCE_MM.below+HORIZONTAL_CLEARANCE_MM.above));
  const packed=c.pointsMm.slice(1).reduce((sum,_,i)=>sum+pointGap(c,i+1),0);
  return Math.max(60,30+packed);
}
function singlePointZone(c: LevelConfiguration) {
  const zone = pointZone(c);
  return { min: zone.min + FLOAT_IMMERSION_OFFSET_MM + (c.closedWhen === "high" ? c.floatTravelMm : 0),
    max: zone.max + FLOAT_IMMERSION_OFFSET_MM - (c.closedWhen === "low" ? c.floatTravelMm : 0) };
}
export function pointBounds(c: LevelConfiguration, index: number) {
  if (c.orientation === "horizontal") {
    const clearance = HORIZONTAL_CLEARANCE_MM.below + HORIZONTAL_CLEARANCE_MM.above;
    const offset = horizontalThresholdOffset(c, index), bounds = horizontalPointBounds(c, index);
    return { min: index ? Math.max(bounds.min, horizontalMountHeight(c, index - 1) + clearance - offset) : bounds.min,
      max: index < c.count - 1 ? Math.min(bounds.max, horizontalMountHeight(c, index + 1) - clearance - offset) : bounds.max };
  }
  if (c.count === 1 && isCompact(architectureFamily(c))) {
    const min = c.closedWhen === "high" ? compactReach(c) - 7 : 15;
    const max = c.closedWhen === "high" ? c.tankHeightMm - 7 : c.tankHeightMm - compactReach(c) + 15;
    return c.mounting === "bottom" ? { min, max: min } : c.mounting === "top" ? { min: max, max } : { min, max };
  }
  if (c.orientation === "vertical" && c.count === 1 && !isCompact(architectureFamily(c))) return singlePointZone(c);
  if (c.orientation === "vertical" && c.count > 1) {
    const zone = pointZone(c);
    return { min: index ? Math.max(zone.min, c.pointsMm[index - 1]! + pointGap(c, index)) : zone.min,
      max: index < c.pointsMm.length - 1 ? Math.min(zone.max, c.pointsMm[index + 1]! - pointGap(c, index + 1)) : zone.max };
  }
  return { min: index ? c.pointsMm[index - 1]! + 1 : 0,
    max: index < c.pointsMm.length - 1 ? c.pointsMm[index + 1]! - 1 : c.tankHeightMm };
}
/** Fixed envelope; animation may translate the float but must never resize it. */
export const FLOAT_HEIGHT_MM = 19;
export const FLOAT_CLEARANCE_MM = 2;
/** Shared immersion offset for the illustration only; density is not modelled. */
export const FLOAT_IMMERSION_OFFSET_MM = 4;
export function verticalMechanics(c: LevelConfiguration, family: Family = architectureFamily(c)) {
  const reachMm = family === "LS01" ? 32.5 : family === "LS02" ? 56 : c.reachMm;
  const datumMm = mountingDatum(c);
  const upright = c.mounting !== "bottom";
  const endMm = upright ? datumMm - reachMm : reachMm;
  const margin = FLOAT_HEIGHT_MM / 2 + 1.5;
  const cap = family === "LS04" ? 8 : 0;
  const stemLow = Math.min(datumMm, endMm) + margin + (upright ? cap : 0);
  const stemHigh = Math.max(datumMm, endMm) - margin - (!upright ? cap : 0);
  const compact = family === "LS01" || family === "LS02";
  const count = compact || c.mode === "continuous" ? 1 : requestedFloats(c);
  const groups = Array.from({ length: count }, (_, i) => {
    const first = c.pointsMm[i * c.pointsPerFloat] ?? c.tankHeightMm / 2;
    const last = c.pointsMm[Math.min(c.pointsMm.length - 1, (i + 1) * c.pointsPerFloat - 1)] ?? first;
    return { first, last };
  });
  const halfGap = (FLOAT_HEIGHT_MM + FLOAT_CLEARANCE_MM) / 2;
  const separators = groups.slice(0, -1).map((group, i) => {
    const desired = (group.last + groups[i + 1]!.first) / 2;
    const lo = stemLow + i * halfGap * 2 + halfGap;
    const hi = stemHigh - (count - 2 - i) * halfGap * 2 - halfGap;
    return Math.max(lo, Math.min(hi, desired));
  });
  const floats = groups.map((group, i) => {
    const fullTravel = compact || c.mode === "continuous";
    if (!fullTravel && c.count === 1) {
      const at = group.first - FLOAT_IMMERSION_OFFSET_MM;
      return { lowerMm: c.closedWhen === "low" ? at : at - c.floatTravelMm,
        upperMm: c.closedWhen === "high" ? at : at + c.floatTravelMm, heightMm: FLOAT_HEIGHT_MM };
    }
    const lowerMm = Math.max(stemLow, fullTravel ? stemLow : group.first - 8,
      i > 0 ? separators[i - 1]! + halfGap : stemLow);
    const upperMm = Math.min(stemHigh, fullTravel ? stemHigh : group.last + 8,
      i < count - 1 ? separators[i]! - halfGap : stemHigh);
    return { lowerMm, upperMm, heightMm: FLOAT_HEIGHT_MM };
  });
  return { reachMm, datumMm, endMm, floats,
    valid: datumMm >= 0 && datumMm <= c.tankHeightMm && endMm >= 0 && endMm <= c.tankHeightMm
      && floats.every(f => f.lowerMm >= stemLow - .001 && f.upperMm <= stemHigh + .001 && f.lowerMm <= f.upperMm) };
}
export function configurationIssues(c: LevelConfiguration, family: Family = architectureFamily(c)): string[] {
  const problems: string[] = [];
  if (c.orientation === "vertical" && c.reachMm > (c.mounting === "bottom" ? c.tankHeightMm : mountingDatum(c)) + .001)
    problems.push("La tige dépasse le fond de la cuve. Raccourcir la tige ou augmenter la hauteur de la cuve.");
  if (c.orientation === "vertical" && c.reachMm > MAX_REACH_MM)
    problems.push("La tige dépasse 200 cm. Réduire sa longueur ou demander une forme spécifique.");
  if (c.orientation === "vertical" && c.mode === "continuous" && c.tankHeightMm > MAX_REACH_MM)
    problems.push("Le suivi de toute cette hauteur dépasse les 200 cm de tige présentés. Préparer une étude spécifique, ou choisir une détection par points.");
  if (c.orientation === "horizontal" && c.mode === "continuous")
    problems.push("La mesure continue demande ici un capteur vertical. Passer en vertical ou choisir un seul point en horizontal.");
  else if (c.orientation === "horizontal" && c.pointsMm.some((p, i) => p < horizontalPointBounds(c, i).min || p > horizontalPointBounds(c, i).max))
    problems.push("Le flotteur horizontal manque de place près du fond ou du haut de la cuve. Recentrer le point pour dégager son mouvement dans l’aperçu.");
  if (c.orientation === "horizontal" && c.mode === "points" && c.pointsMm.some((_, i) => i > 0
    && horizontalMountHeight(c, i) - horizontalMountHeight(c, i - 1) < HORIZONTAL_CLEARANCE_MM.below + HORIZONTAL_CLEARANCE_MM.above - .000001))
    problems.push("Les capteurs horizontaux sont trop proches. Espacer les points pour laisser chaque flotteur pivoter, ou choisir une tige verticale.");
  if (c.mode === "points") {
    if (c.pointsMm.some((p, i) => p < 0 || p > c.tankHeightMm || (i > 0 && p <= c.pointsMm[i - 1]!)))
      problems.push("Les points doivent être ordonnés du fond vers le haut, à l’intérieur de la cuve.");
    if (c.orientation === "vertical" && c.pointsMm.some(p => c.mounting !== "bottom" ? p < mountingDatum(c) - c.reachMm || p > mountingDatum(c) : p > c.reachMm))
      problems.push("Un point souhaité dépasse la longueur de tige sous la fixation. Allonger la tige ou déplacer le point.");
  }
  if (c.orientation === "vertical" && problems.length === 0 && !verticalMechanics(c, family).valid)
    problems.push(c.count === 1 && c.mode === "points"
      ? "Le point et la course ne tiennent pas sur ce montage. Adapter la tige, déplacer le point ou réduire la course."
      : "L’espace ne permet pas de séparer les flotteurs et leurs courses. Espacer les points ou revoir la répartition des flotteurs.");
  if (c.orientation === "vertical" && c.count === 1 && c.mode === "points" && isCompact(family) && problems.length === 0) {
    const range = verticalMechanics(c, family).floats[0]!;
    const threshold = (c.closedWhen === "high" ? range.upperMm : range.lowerMm) + FLOAT_IMMERSION_OFFSET_MM;
    if (Math.abs(threshold - c.pointsMm[0]!) > .01)
      problems.push("Le point demandé ne correspond pas à la position du capteur compact. Replacer le capteur ou prévoir une tige plus longue.");
  }
  return problems;
}
/** Animated output illustrates requested behaviour, not a physical switching prediction. */
export function illustrativeReading(c: LevelConfiguration, levelMm: number, family: Family = architectureFamily(c)) {
  const level = Math.max(0, Math.min(c.tankHeightMm, levelMm));
  const zone = c.pointsMm.filter(p => level >= p).length;
  const range = c.orientation === "vertical" ? verticalMechanics(c, family).floats[0] : null;
  const centre = range ? Math.max(range.lowerMm, Math.min(range.upperMm, level - FLOAT_IMMERSION_OFFSET_MM)) : null;
  const switchingHeightMm = range ? (c.closedWhen === "high" ? range.upperMm : range.lowerMm) + FLOAT_IMMERSION_OFFSET_MM : c.pointsMm[0]!;
  const active = range && centre !== null
    ? c.closedWhen === "high" ? centre >= range.upperMm - .0001 && level >= switchingHeightMm
      : centre <= range.lowerMm + .0001 && level <= switchingHeightMm
    : c.closedWhen === "high" ? level >= switchingHeightMm : level <= switchingHeightMm;
  const pointStates = c.pointsMm.map((p, i) => ({ index: i, heightMm: p, intent: pointIntent(c, i),
    active: c.count === 1 ? active : pointIntent(c, i) === "low" ? level <= p : level >= p }));
  return { level, zone, active, pointStates, switchingHeightMm, floatCentreMm: centre, steppedMm: Math.floor(level / 5) * 5,
    usable: configurationIssues(c, family).length === 0 && !c.custom };
}
export function requestedFloats(c: LevelConfiguration): number {
  return c.mode === "continuous" ? 1 : c.orientation === "horizontal" ? c.count : Math.ceil(c.count / c.pointsPerFloat);
}
export function floatCentres(c: LevelConfiguration, levelMm: number, family?: Family): number[] {
  const mechanics = verticalMechanics(c, family);
  if (!mechanics.valid) return [];
  return mechanics.floats.map(f => Math.max(f.lowerMm, Math.min(f.upperMm, levelMm - FLOAT_IMMERSION_OFFSET_MM)));
}
/** Presentation limit only: show the highest float reaching its stop while
 * keeping an upright sensor's cable entry above liquid. Never a process limit. */
export function demonstrationMax(c: LevelConfiguration, family: Family = architectureFamily(c)) {
  if (c.orientation === "horizontal" || c.mounting === "bottom") return c.tankHeightMm;
  const mechanics = verticalMechanics(c, family);
  if (!mechanics.valid) return c.tankHeightMm;
  return Math.max(0, Math.min(c.tankHeightMm, mechanics.datumMm - 1,
    Math.max(...mechanics.floats.map(f => f.upperMm)) + FLOAT_IMMERSION_OFFSET_MM));
}
export function horizontalFloatPosition(c: LevelConfiguration, level: number, index = 0) {
  const pivotHeight = horizontalMountHeight(c, index);
  return Math.max(0, Math.min(1, (level - (pivotHeight - HORIZONTAL_SWEEP_MM)) / HORIZONTAL_SWEEP_MM));
}
export function createLevelBrief(context: LevelContext, configuration: LevelConfiguration, cable: { lengthMm: string; connector: string }, contact: Record<string, string>) {
  const assessment = assessConfiguration(context, configuration);
  return { schema: "sensor-studio.level-preview.v3", status: "draft_not_submitted", qualification: "not_qualified",
    context, requested_configuration: configuration, study_family: assessment.selected?.family ?? null,
    proposed_contact_form: assessment.selected ? proposedContactForm(configuration, assessment.selected.family) : null,
    sensor_count: configuration.orientation === "horizontal" ? configuration.count : 1,
    requested_points: configuration.mode === "points" ? configuration.pointsMm.map((heightMm, i) => ({ heightMm, intent: pointIntent(configuration, i) })) : [],
    units: { tankHeight: "mm", detectionHeight: "mm" },
    specific_request: assessment.specific || configurationIssues(configuration, assessment.selected?.family).length > 0,
    remaining_questions: [...(assessment.selected?.reasons ?? []), ...configurationIssues(configuration, assessment.selected?.family)],
    cable, contact, simulation: { kind: "requested_behaviour_only", switching_heights_verified: false, resistance_values_known: false } };
}
