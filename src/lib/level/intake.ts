import { INITIAL_CONFIGURATION, MAX_TANK_HEIGHT_MM, compactReach, finiteInput, fitStemToPoints, horizontalPointBounds, setPointCount, constrainPointLayout, configurationIssues, setReach,
  type LevelConfiguration, type LevelContext } from "./configuration";

/** Only explicit intake answers seed the design; prose is never silently classified. */
export function intakeKey(context: LevelContext) {
  return JSON.stringify([context.mountingAccess, context.tankHeight, context.detectionGoal, context.responsePriority, context.detectionCount, context.detectionHeights]);
}
export function requestedIntakePoints(context: LevelContext) {
  const height=finiteInput(context.tankHeight) ?? 100;
  if(context.detectionGoal !== "multiple") return [finiteInput(context.detectionHeight)];
  const requestedCount=context.detectionCount ?? 2;
  const count=Number.isFinite(requestedCount) ? Math.max(2,Math.min(12,Math.round(requestedCount))) : 2;
  const values=Array.from({length:count},(_,i)=>finiteInput(context.detectionHeights?.[i] ?? ""));
  // Interpolate only unanswered positions between explicit neighbours.
  // Never move a user's answer in order to repair invalid ordering.
  return values.map((value,index)=>{
    if(value!==null) return value;
    let before=index-1, after=index+1;
    while(before>=0 && values[before]===null) before--;
    while(after<count && values[after]===null) after++;
    const low=before>=0 ? values[before]! : 0, high=after<count ? values[after]! : height;
    return Math.round((low+(high-low)*(index-before)/(after-before))*10000)/10000;
  });
}
export function intakeErrors(context: LevelContext) {
  const errors: string[] = [];
  const height = finiteInput(context.tankHeight);
  if (context.tankHeight.trim() && (height === null || height < 60 || height > MAX_TANK_HEIGHT_MM))
    errors.push("Indiquez une hauteur de cuve entre 6 et 1 000 cm pour cet aperçu, ou laissez-la à définir.");
  if(context.detectionGoal === "multiple") {
    const count=context.detectionCount ?? 2, entries=context.detectionHeights ?? [];
    if(!Number.isInteger(count) || count<2 || count>12) errors.push("Choisissez entre 2 et 12 niveaux pour cet aperçu.");
    const points=requestedIntakePoints(context);
    if(entries.slice(0,count).some(v=>v?.trim() && finiteInput(v)===null) || points.some((p,i)=>p===null || p<0 || p>(height??100) || (i>0 && p<=points[i-1]!)))
      errors.push("Indiquez les niveaux du bas vers le haut, sans doublon, entre 0 % et 100 % de la hauteur de cuve.");
  }
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
  if (context.detectionGoal === "multiple") {
    const points=requestedIntakePoints(context) as number[];
    c=setPointCount(c,points.length);
    return constrainPointLayout(fitStemToPoints({...c,pointsMm:points}));
  }
  // Legacy single-target answers no longer constrain the initial proposal.
  let point = (mounting === "bottom" ? goal === "low" ? 15 : compactReach(c) - 7
    : goal === "high" ? height - 7 : Math.max(25, Math.round(height * .2)));
  if (mounting === "support" && c.orientation === "vertical") {
    const min = goal === "low" ? 15 : compactReach(c) - 7;
    const max = goal === "high" ? height - 7 : height - compactReach(c) + 15;
    point = Math.max(min, Math.min(max, point));
  }
  if (c.orientation === "horizontal") {
    const bounds = horizontalPointBounds(c);
    point = Math.max(bounds.min, Math.min(bounds.max, Math.round(height * (goal === "high" ? .7 : .2))));
  }
  c = { ...c, pointsMm: [point] };
  const fitted = constrainPointLayout(fitStemToPoints(c));
  // A shallow tank may only accommodate the fixed long-travel compact.
  return configurationIssues(fitted).length ? setReach(c, compactReach(c)) : fitted;
}
// Context/export keep millimetres; only the tank-height input is displayed in cm.
export function tankHeightInCm(mm: string) {
  const n = finiteInput(mm); return n === null ? "" : String(Math.round(n * 100) / 1000);
}
export function tankHeightFromCm(cm: string) {
  if (!cm.trim()) return "";
  const n = finiteInput(cm); return n === null ? cm : String(Math.round(n * 10000) / 1000);
}
