import { assessConfiguration, configurationIssues, contextErrors, distributePoints, fitStemToPoints,
  horizontalPointBounds, mountingDatum, MAX_REACH_MM, resizeTank, setPointCount, type LevelConfiguration, type LevelContext, type Family } from "./configuration";

export type Remedy = "one_point" | "vertical" | "fit_stem" | "distribute" | "more_space" | "shorten" | "centre_point" | "liquid" | "custom" | "reset_zone";
export const REMEDY_LABELS: Record<Remedy, string> = {
  one_point: "Utiliser un seul point", vertical: "Passer en vertical",
  fit_stem: "Adapter la tige aux points", distribute: "Répartir les points",
  more_space: "Agrandir et répartir", shorten: "Raccourcir la tige",
  centre_point: "Recentrer le point",
  reset_zone: "Repositionner le point et sa course",
  liquid: "Revoir le liquide et les températures", custom: "Prévoir une forme spécifique",
};
export function configurationGuidance(context: LevelContext, c: LevelConfiguration, family?: Family) {
  if (c.custom) return null;
  const issues = configurationIssues(c, family);
  if (contextErrors(context).length) return { message: contextErrors(context)[0]!, actions: ["liquid"] as Remedy[] };
  if (c.orientation === "horizontal" && (c.mode === "continuous" || c.count > 1))
    return { message: issues[0]!, actions: ["one_point", "vertical", "custom"] as Remedy[] };
  if (c.orientation === "horizontal" && issues.length)
    return { message: issues[0]!, actions: ["centre_point", "vertical", "custom"] as Remedy[] };
  if (c.reachMm > (c.mounting === "bottom" ? c.tankHeightMm : mountingDatum(c)) && c.orientation === "vertical")
    return { message: issues[0]!, actions: ["shorten", "custom"] as Remedy[] };
  if (c.reachMm > MAX_REACH_MM && c.orientation === "vertical")
    return { message: issues[0]!, actions: ["shorten", "custom"] as Remedy[] };
  if (issues.length) {
    const disordered = c.pointsMm.some((p, i) => p < 0 || p > c.tankHeightMm || (i > 0 && p <= c.pointsMm[i - 1]!));
    const unreachable = c.orientation === "vertical" && c.pointsMm.some(p => c.mounting !== "bottom" ? p < mountingDatum(c) - c.reachMm : p > c.reachMm);
    const fitted = fitStemToPoints(c);
    const repair = configurationIssues(fitted, assessConfiguration(context, fitted).selected?.family).length === 0
      ? "fit_stem" : c.count === 1 ? "reset_zone" : "more_space";
    return { message: issues[0]!, actions: [disordered ? "distribute" : unreachable || c.count === 1 ? repair : "more_space", "custom"] as Remedy[] };
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
    case "centre_point": return { ...c, pointsMm: [Math.max(horizontalPointBounds(c).min, Math.min(horizontalPointBounds(c).max, Math.round(c.tankHeightMm / 2)))] };
    case "vertical": return c.mode === "continuous" ? { ...c, orientation: "vertical", reachMm: c.tankHeightMm } : fitStemToPoints({ ...c, orientation: "vertical" });
    case "fit_stem": return fitStemToPoints(c);
    case "reset_zone": {
      const travel = Math.min(10, c.tankHeightMm - 32);
      const min = (c.mounting === "bottom" ? 15 : 23) + (c.closedWhen === "high" ? travel : 0);
      const max = c.tankHeightMm - (c.mounting === "bottom" ? 15 : 7) - (c.closedWhen === "low" ? travel : 0);
      return fitStemToPoints({ ...c, reachMm: c.tankHeightMm, mountingHeightMm: c.tankHeightMm,
        floatTravelMm: travel, pointsMm: [Math.max(min, Math.min(max, Math.round(c.tankHeightMm / 2)))] });
    }
    case "distribute": return distributePoints(c);
    case "shorten": return { ...c, reachMm: Math.min(c.mounting === "bottom" ? c.tankHeightMm : mountingDatum(c), MAX_REACH_MM) };
    case "more_space": return fitStemToPoints(distributePoints(resizeTank(c, Math.min(MAX_REACH_MM, Math.max(c.tankHeightMm * 1.5, c.count * 48)))));
    case "custom": return { ...c, custom: true };
    default: return c;
  }
}
