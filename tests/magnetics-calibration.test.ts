import { test, expect } from "bun:test";
import { calibrateFamily, crossing } from "../src/lib/standex/magnetics/calibration";
import type { CalibrationInput } from "../src/lib/standex/magnetics/calibration";
const source = {
  registryId: "SYNTHETIC",
  sourceType: "test",
  sourceRef: "SYNTHETIC FIXTURE ONLY",
  enteredOn: "2026-09-10",
  fields: ["distance"],
};
function fixture(): CalibrationInput {
  const field = (a: string, d: number, delta: number) =>
    a === "D1" ? 1 / (d + 4 + delta) ** 3 : 2 / (d + 5 - delta) ** 3;
  return {
    familyId: "SYNTHETIC",
    classes: ["B", "C", "D", "E"],
    approaches: ["D1", "D3"],
    deltaBoundsMm: [-2, 2],
    knownDeltaMm: null,
    distanceBoundsMm: [0.1, 200],
    fieldAtDistance: field,
    geometrySource: source,
    registryFingerprint: "fixture-v1",
    observations: ["B", "C", "D", "E"].flatMap((cls, i) =>
      ["D1", "D3"].map((a) => ({
        id: cls + a,
        sensitivityClass: cls,
        approachId: a,
        pullInMm: crossing((d) => field(a, d, 0.6), 0.00015 * (i + 1), [0.1, 200])!,
        dropOutMm: crossing((d) => field(a, d, 0.6), 0.0001 * (i + 1), [0.1, 200])!,
        provenance: source,
      })),
    ),
  };
}
test("T2 synthetic inversion recovers known centre and held-out distances", () => {
  const result = calibrateFamily(fixture());
  expect(result.accepted).toBe(true);
  expect(result.deltaMm!).toBeCloseTo(0.6, 6);
  expect(result.residuals).toHaveLength(16);
  for (const r of result.residuals) {
    expect(r.trainingIds).not.toContain(r.observationId);
    expect(r.errorPct!).toBeLessThan(0.0001);
  }
});
test("T2 clean holdout does not fit centre on the target class", () => {
  const input = fixture(),
    original = calibrateFamily(input);
  input.observations[0]!.pullInMm *= 0.65;
  const mutated = calibrateFamily(input);
  expect(mutated.accepted).toBe(false);
  if (mutated.residuals.length)
    expect(
      mutated.residuals.find((r) => r.observationId === "BD1" && r.event === "pullInMm")!.deltaMm,
    ).toBeCloseTo(original.residuals[0]!.deltaMm, 8);
});
test("T2 mutation empty registry and bad geometry cannot calibrate", () => {
  expect(calibrateFamily({ ...fixture(), observations: [] }).accepted).toBe(false);
  expect(calibrateFamily({ ...fixture(), fieldAtDistance: () => 1 }).reason).toBe(
    "NON_IDENTIFIABLE",
  );
  expect(calibrateFamily({ ...fixture(), knownDeltaMm: NaN }).accepted).toBe(false);
  expect(calibrateFamily({ ...fixture(), deltaBoundsMm: [0, Infinity] }).accepted).toBe(false);
});
test("T3 missing provenance and nonunique crossings refuse", () => {
  const input = fixture();
  input.observations[0]!.provenance = { ...source, sourceRef: "" };
  expect(calibrateFamily(input).accepted).toBe(false);
  expect(crossing((d) => 2 + Math.sin(d), 2, [0.1, 20])).toBeNull();
  expect(crossing(() => NaN, 1, [0.1, 20])).toBeNull();
});
