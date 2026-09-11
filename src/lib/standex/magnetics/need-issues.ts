import type { Need } from "./margin";
export interface NeedIssue {
  field: keyof Need;
  message: string;
}
/* i18n-canonical: rendered through t; separate missing values from invalid values. */
export function needIssues(n: Need): NeedIssue[] {
  const issues: NeedIssue[] = [];
  for (const field of ["gapClosedMm", "gapOpenMm"] as const) {
    if (n[field] !== null && (!Number.isFinite(n[field]) || n[field]! <= 0))
      issues.push({ field, message: "Saisissez une distance strictement supérieure à zéro." });
  }
  if (n.gapClosedMm !== null && n.gapOpenMm !== null && n.gapOpenMm <= n.gapClosedMm)
    issues.push({
      field: "gapOpenMm",
      message: "La distance en position ouverte doit dépasser celle en position fermée.",
    });
  if (n.gapToleranceMm !== null && (!Number.isFinite(n.gapToleranceMm) || n.gapToleranceMm < 0))
    issues.push({ field: "gapToleranceMm", message: "La tolérance doit être positive ou nulle." });
  else if (
    n.gapToleranceMm !== null &&
    [n.gapClosedMm, n.gapOpenMm].some((v) => v !== null && v > 0 && n.gapToleranceMm! >= v)
  )
    issues.push({
      field: "gapToleranceMm",
      message: "La tolérance doit rester inférieure à chacune des deux distances.",
    });
  if (
    n.temperatureMinC !== null &&
    n.temperatureMaxC !== null &&
    n.temperatureMinC > n.temperatureMaxC
  )
    issues.push({
      field: "temperatureMinC",
      message: "La température minimale ne peut pas dépasser la température maximale.",
    });
  return issues;
}
