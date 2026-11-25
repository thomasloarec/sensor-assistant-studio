import { INITIAL_CONFIGURATION, MAX_TANK_HEIGHT_MM, compactReach, finiteInput, fitStemToPoints, horizontalPointBounds, setPointCount,
  type LevelConfiguration, type LevelContext } from "./configuration";

/** Only explicit intake answers seed the design; prose is never silently classified. */
export function intakeKey(context: LevelContext) {
  return JSON.stringify([context.mountingAccess, context.tankHeight, context.detectionGoal, context.detectionHeight, context.responsePriority]);
}
export function intakeErrors(context: LevelContext) {
  const errors: string[] = [];
  const height = finiteInput(context.tankHeight), point = finiteInput(context.detectionHeight);
  if (context.tankHeight.trim() && (height === null || height < 60 || height > MAX_TANK_HEIGHT_MM))
    errors.push("Indiquez une hauteur de cuve entre 6 et 1 000 cm pour cet aperçu, ou laissez-la à définir.");
  if (["high", "low"].includes(context.detectionGoal) && context.detectionHeight.trim()
    && (point === null || point < 0 || point > (height ?? 100)))
    errors.push("Le niveau demandé doit être compris entre le fond et le haut de la cuve. Précisez aussi la hauteur de cuve si nécessaire.");
  return errors;
}
export function seedConfiguration(context: LevelContext): LevelConfiguration {
  const height = finiteInput(context.tankHeight) ?? 100;
  const goal = context.detectionGoal === "low" ? "low" : "high";
  const long = context.responsePriority === "movement";
  const mounting = context.mountingAccess === "top" ? "top" : context.mountingAccess === "bottom" ? "bottom" : "support";
  let c: LevelConfiguration = { ...INITIAL_CONFIGURATION, pointsMm: [...INITIAL_CONFIGURATION.pointsMm],
    tankHeightMm: height, mountingHeightMm: height, mounting, closedWhen: goal,
    orientation: context.mountingAccess === "side" ? "horizontal" : "vertical",
    travelPreference: long ? "long" : "short", floatTravelMm: long ? 34 : 10.5, reachMm: long ? 56 : 32.5 };
  if (context.detectionGoal === "continuous") return fitStemToPoints({ ...c, mode: "continuous" });
  if (context.detectionGoal === "multiple") return setPointCount(c, 2);
  const requested = finiteInput(context.detectionHeight);
  let point = requested ?? (mounting === "bottom" ? goal === "low" ? 15 : compactReach(c) - 7
    : goal === "high" ? height - 7 : Math.max(25, Math.round(height * .2)));
  if (requested === null && mounting === "support" && c.orientation === "vertical") {
    const min = goal === "low" ? 15 : compactReach(c) - 7;
    const max = goal === "high" ? height - 7 : height - compactReach(c) + 15;
    point = Math.max(min, Math.min(max, point));
  }
  if (requested === null && c.orientation === "horizontal") {
    const bounds = horizontalPointBounds(c);
    point = Math.max(bounds.min, Math.min(bounds.max, Math.round(height * (goal === "high" ? .7 : .2))));
  }
  c = { ...c, pointsMm: [point] };
  return fitStemToPoints(c);
}
// Context/export keep millimetres; only the tank-height input is displayed in cm.
export function tankHeightInCm(mm: string) {
  const n = finiteInput(mm); return n === null ? "" : String(Math.round(n * 100) / 1000);
}
export function tankHeightFromCm(cm: string) {
  if (!cm.trim()) return "";
  const n = finiteInput(cm); return n === null ? cm : String(Math.round(n * 10000) / 1000);
}
