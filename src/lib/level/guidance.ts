import { assessConfiguration, configurationIssues, contextErrors, distributePoints, fitStemToPoints,
  horizontalPointBounds, mountingDatum, MAX_REACH_MM, MAX_TANK_HEIGHT_MM, resizeTank, setPointCount, type LevelConfiguration, type LevelContext, type Family } from "./configuration";

export type Remedy = "one_point" | "vertical" | "horizontal_array" | "fit_stem" | "distribute" | "more_space" | "shorten" | "centre_point" | "liquid" | "custom" | "reset_zone";
export const REMEDY_LABELS: Record<Remedy, string> = {
  one_point: "Utiliser un seul point", vertical: "Passer en vertical",
  fit_stem: "Adapter la tige aux points", distribute: "Répartir les points",
  more_space: "Agrandir et répartir", shorten: "Raccourcir la tige",
  centre_point: "Recentrer le point",
  reset_zone: "Repositionner le point et sa course",
  horizontal_array: "Un capteur horizontal par point",
  liquid: "Revoir le liquide et les températures", custom: "Prévoir une forme spécifique",
};
export function horizontalAlternative(context: LevelContext, c: LevelConfiguration) {
  if (c.custom || c.mode !== "points" || c.count < 2 || c.orientation !== "vertical"
    || ["top", "bottom"].includes(context.mountingAccess)) return null;
  const alternative = { ...c, orientation: "horizontal" as const };
  return configurationIssues(alternative).length === 0 && assessConfiguration(context, alternative).selected ? alternative : null;
}
export function configurationGuidance(context: LevelContext, c: LevelConfiguration, family?: Family) {
  if (c.custom) return null;
  const issues = configurationIssues(c, family);
  if (contextErrors(context).length) return { message: contextErrors(context)[0]!, actions: ["liquid"] as Remedy[] };
  if (c.orientation === "horizontal" && c.mode === "continuous")
    return { message: issues[0]!, actions: ["one_point", "vertical", "custom"] as Remedy[] };
  if (c.orientation === "horizontal" && issues.length) {
    const recentered = applyRemedy(c, "centre_point");
    return { message: issues[0]!, actions: [configurationIssues(recentered).length === 0 ? c.count === 1 ? "centre_point" : "distribute" : "vertical", "custom"] as Remedy[] };
  }
  if (issues.length && horizontalAlternative(context, c)) {
    const fitted = fitStemToPoints(c);
    const canFit = configurationIssues(fitted, assessConfiguration(context, fitted).selected?.family).length === 0;
    return { message: "Ces niveaux peuvent être détectés séparément par des capteurs horizontaux. Prévoir un accès latéral à chaque hauteur.",
      actions: (canFit ? ["horizontal_array", "fit_stem", "custom"] : ["horizontal_array", "custom"]) as Remedy[] };
  }
  if (c.mode === "continuous" && c.tankHeightMm > MAX_REACH_MM)
    return { message: "Le suivi de toute cette hauteur dépasse les 200 cm de tige présentés. Préparer une étude spécifique, ou choisir une détection par points.", actions: ["custom"] as Remedy[] };
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
    const action: Remedy = disordered ? "distribute" : unreachable || c.count === 1 ? repair : "more_space";
    const corrected = applyRemedy(c, action);
    // Do not offer a resize loop when the 2 m catalogue limit prevents recovery.
    const useful = JSON.stringify(corrected) !== JSON.stringify(c) && configurationIssues(corrected, assessConfiguration(context, corrected).selected?.family).length === 0;
    return { message: issues[0]!, actions: useful ? [action, "custom"] as Remedy[] : ["custom"] as Remedy[] };
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
    case "centre_point": return { ...c, pointsMm: Array.from({length:c.count}, (_, i) => Math.max(horizontalPointBounds(c, i).min,
      Math.min(horizontalPointBounds(c, i).max, Math.round(c.tankHeightMm * (i + 1) / (c.count + 1))))) };
    case "vertical": return fitStemToPoints({ ...c, orientation: "vertical" });
    case "horizontal_array": return { ...c, orientation: "horizontal" };
    case "fit_stem": return fitStemToPoints(c);
    case "reset_zone": {
      const travel = Math.min(10, c.tankHeightMm - 32);
      const min = (c.mounting === "bottom" ? 15 : 23) + (c.closedWhen === "high" ? travel : 0);
      const max = c.tankHeightMm - (c.mounting === "bottom" ? 15 : 7) - (c.closedWhen === "low" ? travel : 0);
      return fitStemToPoints({ ...c, reachMm: c.tankHeightMm, mountingHeightMm: c.tankHeightMm,
        floatTravelMm: travel, pointsMm: [Math.max(min, Math.min(max, Math.round(c.tankHeightMm / 2)))] });
    }
    case "distribute": return c.orientation === "horizontal" ? applyRemedy(c, "centre_point") : distributePoints(c);
    case "shorten": return { ...c, reachMm: Math.min(c.mounting === "bottom" ? c.tankHeightMm : mountingDatum(c), MAX_REACH_MM) };
    case "more_space": return fitStemToPoints(distributePoints(resizeTank(c, Math.min(MAX_TANK_HEIGHT_MM, Math.max(c.tankHeightMm * 1.5, c.count * 48)))));
    case "custom": return { ...c, custom: true };
    default: return c;
  }
}
