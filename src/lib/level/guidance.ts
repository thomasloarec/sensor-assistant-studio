import { assessConfiguration, configurationIssues, contextErrors, distributePoints, fitStemToPoints,
  HORIZONTAL_CLEARANCE_MM, MAX_REACH_MM, resizeTank, setPointCount, type LevelConfiguration, type LevelContext } from "./configuration";

export type Remedy = "one_point" | "vertical" | "fit_stem" | "distribute" | "more_space" | "shorten" | "centre_point" | "liquid" | "custom";
export const REMEDY_LABELS: Record<Remedy, string> = {
  one_point: "Utiliser un seul point", vertical: "Passer en vertical",
  fit_stem: "Adapter la tige aux points", distribute: "Répartir les points",
  more_space: "Agrandir et répartir", shorten: "Raccourcir la tige",
  centre_point: "Recentrer le point",
  liquid: "Revoir le liquide et les températures", custom: "Prévoir une forme spécifique",
};
export function configurationGuidance(context: LevelContext, c: LevelConfiguration) {
  if (c.custom) return null;
  const issues = configurationIssues(c);
  if (contextErrors(context).length) return { message: contextErrors(context)[0]!, actions: ["liquid"] as Remedy[] };
  if (c.orientation === "horizontal" && (c.mode === "continuous" || c.count > 1))
    return { message: issues[0]!, actions: ["one_point", "vertical", "custom"] as Remedy[] };
  if (c.orientation === "horizontal" && issues.length)
    return { message: issues[0]!, actions: ["centre_point", "vertical", "custom"] as Remedy[] };
  if (c.reachMm > c.tankHeightMm && c.orientation === "vertical")
    return { message: issues[0]!, actions: ["shorten", "custom"] as Remedy[] };
  if (c.reachMm > MAX_REACH_MM && c.orientation === "vertical")
    return { message: issues[0]!, actions: ["shorten", "custom"] as Remedy[] };
  if (issues.length) {
    const disordered = c.pointsMm.some((p, i) => p < 0 || p > c.tankHeightMm || (i > 0 && p <= c.pointsMm[i - 1]!));
    const unreachable = c.orientation === "vertical" && c.pointsMm.some(p => c.mounting === "top" ? p < c.tankHeightMm - c.reachMm : p > c.reachMm);
    return { message: issues[0]!, actions: [disordered ? "distribute" : unreachable ? "fit_stem" : "more_space", "custom"] as Remedy[] };
  }
  if (!assessConfiguration(context, c).selected) return {
    message: "Aucune construction présentée ne couvre ces conditions. Vérifier le liquide et les températures, ou préparer une demande spécifique.",
    actions: ["liquid", "custom"] as Remedy[],
  };
  return null;
}
/** Actions change the configuration only after an explicit click. */
export function applyRemedy(c: LevelConfiguration, action: Remedy): LevelConfiguration {
  switch (action) {
    case "one_point": {
      const next = setPointCount({ ...c, mode: "points" }, 1);
      return next.orientation === "horizontal" ? applyRemedy(next, "centre_point") : next;
    }
    case "centre_point": return { ...c, pointsMm: [Math.max(HORIZONTAL_CLEARANCE_MM.below, Math.min(c.tankHeightMm - HORIZONTAL_CLEARANCE_MM.above, Math.round(c.tankHeightMm / 2)))] };
    case "vertical": return c.mode === "continuous" ? { ...c, orientation: "vertical", reachMm: c.tankHeightMm } : fitStemToPoints({ ...c, orientation: "vertical" });
    case "fit_stem": return fitStemToPoints(c);
    case "distribute": return distributePoints(c);
    case "shorten": return { ...c, reachMm: Math.min(c.tankHeightMm, MAX_REACH_MM) };
    case "more_space": return fitStemToPoints(distributePoints(resizeTank(c, Math.min(MAX_REACH_MM, Math.max(c.tankHeightMm * 1.5, c.count * 48)))));
    case "custom": return { ...c, custom: true };
    default: return c;
  }
}
