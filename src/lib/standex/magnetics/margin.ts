import conflicts from "@/data/studio-v2/source-conflicts.json";
import { publishedReference, PHYSICS_REGISTRY } from "./registries";
import type { PublishedRegistry, PublishedRow, PhysicsRegistry } from "./registries";
import { solveSwitching } from "./solve";
import type { SolveInput } from "./solve";
import type { Provenance } from "./types";
export const MARGIN_LIMITS = { heldPct: 30, tightPct: 10 } as const;
export type Verdict = "held" | "tight" | "failed" | "unavailable";
export interface Need {
  gapClosedMm: number | null;
  gapOpenMm: number | null;
  gapToleranceMm: number | null;
  temperatureMinC: number | null;
  temperatureMaxC: number | null;
  agingAllowancePct: number | null;
}
export const EMPTY_NEED: Need = {
  gapClosedMm: null,
  gapOpenMm: null,
  gapToleranceMm: null,
  temperatureMinC: null,
  temperatureMaxC: null,
  agingAllowancePct: null,
};
export interface MarginResult {
  basis: "published_typical" | "physical";
  verdict: Verdict;
  reason: string;
  pullMm: number | null;
  dropMm: number | null;
  closingMm: number | null;
  openingMm: number | null;
  closingPct: number | null;
  openingPct: number | null;
  unknown: string[];
  provenance: Provenance[];
  invalidants: { code: string; value: number | null }[];
}
export function emptyMargin(basis: MarginResult["basis"], reason: string): MarginResult {
  return {
    basis,
    verdict: "unavailable",
    reason,
    pullMm: null,
    dropMm: null,
    closingMm: null,
    openingMm: null,
    closingPct: null,
    openingPct: null,
    unknown: [],
    provenance: [],
    invalidants: [],
  };
}
export function validNeed(n: Need): boolean {
  return (
    Object.values(n).every((x) => x === null || Number.isFinite(x)) &&
    [n.gapClosedMm, n.gapOpenMm].every((x) => x === null || x > 0) &&
    (n.gapToleranceMm === null || n.gapToleranceMm >= 0) &&
    (n.agingAllowancePct === null || (n.agingAllowancePct >= 0 && n.agingAllowancePct < 100)) &&
    (n.temperatureMinC === null ||
      n.temperatureMaxC === null ||
      n.temperatureMinC <= n.temperatureMaxC) &&
    (n.gapClosedMm === null || n.gapOpenMm === null || n.gapOpenMm > n.gapClosedMm) &&
    (n.gapToleranceMm === null ||
      [n.gapClosedMm, n.gapOpenMm].every((x) => x === null || n.gapToleranceMm! < x))
  );
}
export function verdictFor(
  closingPct: number,
  openingPct: number,
  unknown: readonly string[],
): Verdict {
  if (![closingPct, openingPct].every(Number.isFinite)) return "unavailable";
  const minimum = Math.min(closingPct, openingPct);
  return minimum < MARGIN_LIMITS.tightPct
    ? "failed"
    : minimum < MARGIN_LIMITS.heldPct || unknown.length
      ? "tight"
      : "held";
}
/** Null tolerance stays in unknown; displayed margins are conditional nominal comparisons. */
export function marginsFromDistances(
  basis: MarginResult["basis"],
  pull: number,
  drop: number,
  need: Need,
  unknown: string[],
  provenance: Provenance[],
): MarginResult {
  if (
    !validNeed(need) ||
    !Number.isFinite(pull) ||
    !Number.isFinite(drop) ||
    pull <= 0 ||
    drop <= pull
  )
    return emptyMargin(basis, "INVALID_INPUT");
  if (need.gapClosedMm === null || need.gapOpenMm === null)
    return {
      ...emptyMargin(basis, "GAPS_REQUIRED"),
      pullMm: pull,
      dropMm: drop,
      provenance,
      unknown,
    };
  const missing = [
    ...new Set([...unknown, ...(need.gapToleranceMm === null ? ["assembly_tolerance"] : [])]),
  ];
  const tolerance = need.gapToleranceMm ?? 0,
    closing = pull - (need.gapClosedMm + tolerance),
    opening = need.gapOpenMm - tolerance - drop;
  const closingPct = (closing / (need.gapClosedMm + tolerance)) * 100,
    openingPct = (opening / drop) * 100;
  return {
    basis,
    verdict: verdictFor(closingPct, openingPct, missing),
    reason: "OK",
    pullMm: pull,
    dropMm: drop,
    closingMm: closing,
    openingMm: opening,
    closingPct,
    openingPct,
    unknown: missing,
    provenance,
    invalidants: [
      { code: "CLOSING_LIMIT", value: pull - tolerance },
      { code: "OPENING_LIMIT", value: drop + tolerance },
      { code: "TEMPERATURE_UNVALIDATED", value: null },
      { code: "FERROUS_CHANGE", value: null },
      { code: "MAGNET_CHANGE", value: null },
      { code: "CLASS_CHANGE", value: null },
    ],
  };
}
/** This is a comparison to published typical distances. It NEVER reports worst-case product performance. */
export function evaluateReference(
  key: Pick<PublishedRow, "sensorFamily" | "sensitivityClass" | "magnetId" | "approachId">,
  need: Need,
  domain: { referencePose: boolean; ferrous: boolean },
  registry?: PublishedRegistry,
): MarginResult {
  if (!validNeed(need)) return emptyMargin("published_typical", "INVALID_INPUT");
  const row = publishedReference(
    key.sensorFamily,
    key.sensitivityClass,
    key.magnetId,
    key.approachId,
    registry,
  );
  if (!row)
    return emptyMargin(
      "published_typical",
      conflicts.some(
        (c) =>
          c.sensor === key.sensorFamily &&
          c.class === key.sensitivityClass &&
          c.approach === key.approachId,
      )
        ? "SOURCE_CONFLICT"
        : "NO_PUBLISHED_REFERENCE",
    );
  if (!domain.referencePose || domain.ferrous)
    return emptyMargin(
      "published_typical",
      domain.ferrous ? "FERROUS_BODY_DECLARED" : "APPROACH_AMBIGUOUS",
    );
  return marginsFromDistances(
    "published_typical",
    row.pullInMm,
    row.dropOutMm,
    need,
    [
      "typical_not_guaranteed",
      "sensitivity_spread",
      "magnet_spread",
      "magnet_temperature_drift",
      "reed_threshold_temperature_drift",
      "magnet_aging",
      "reference_temperature_unknown",
      "material_permeability",
      "assembly_misalignment",
      "contact_bounce",
      "switching_rate",
      "mechanical_shock",
    ],
    [row.provenance],
  );
}
/** Endpoint sweep includes both signs of thermal coefficient; aging weakens closure only. */
export function evaluateMargin(
  input: SolveInput,
  need: Need,
  registry: PhysicsRegistry = PHYSICS_REGISTRY,
): MarginResult {
  if (!validNeed(need)) return emptyMargin("physical", "INVALID_INPUT");
  if (need.gapClosedMm === null || need.gapOpenMm === null)
    return emptyMargin("physical", "GAPS_REQUIRED");
  const nominal = solveSwitching(input, registry);
  if (!nominal.switching) return emptyMargin("physical", nominal.reasonCode);
  const magnet = registry.magnets.find((m) => m.id === input.magnetId)!,
    dataset = registry.datasets.find((d) => d.familyId === input.sensorFamily)!;
  const unknown = [...nominal.notModelled];
  if (magnet.brTolerancePct === null) unknown.push("magnet_spread");
  if (dataset.thresholdTolerancePct === null) unknown.push("sensitivity_spread");
  if (need.temperatureMinC === null || need.temperatureMaxC === null)
    unknown.push("temperature_range");
  if (need.agingAllowancePct === null) unknown.push("magnet_aging");
  const br = (magnet.brTolerancePct ?? 0) / 100,
    spread = (dataset.thresholdTolerancePct ?? 0) / 100,
    aging = (need.agingAllowancePct ?? 0) / 100;
  if (![br, spread].every((x) => Number.isFinite(x) && x >= 0 && x < 1))
    return emptyMargin("physical", "INVALID_INPUT");
  let pull = Infinity,
    drop = -Infinity;
  for (const temperatureC of [
    need.temperatureMinC ?? input.temperatureC,
    need.temperatureMaxC ?? input.temperatureC,
  ]) {
    const closed = solveSwitching(
      { ...input, temperatureC, fieldFactor: (1 - br) * (1 - aging), thresholdFactor: 1 + spread },
      registry,
    );
    const open = solveSwitching(
      { ...input, temperatureC, fieldFactor: 1 + br, thresholdFactor: 1 - spread },
      registry,
    );
    if (!closed.switching || !open.switching)
      return emptyMargin("physical", !closed.switching ? closed.reasonCode : open.reasonCode);
    pull = Math.min(pull, closed.switching.pullInMm);
    drop = Math.max(drop, open.switching.dropOutMm);
  }
  return marginsFromDistances("physical", pull, drop, need, unknown, nominal.provenance);
}
