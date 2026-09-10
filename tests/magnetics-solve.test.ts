import { test, expect } from "bun:test";
import { fieldAtPoint } from "../src/lib/standex/magnetics/field";
import { crossing } from "../src/lib/standex/magnetics/calibration";
import { solveSwitching } from "../src/lib/standex/magnetics/solve";
import { evaluateMargin } from "../src/lib/standex/magnetics/margin";
import type {
  PhysicsRegistry,
  SourceMagnet,
  PhysicsDataset,
} from "../src/lib/standex/magnetics/registries";
const provenance = {
  registryId: "SYNTHETIC",
  sourceRef: "SYNTHETIC TEST ONLY",
  sourceType: "measured",
  enteredOn: "2026-09-10",
  fields: ["geometry", "br", "pose", "distance"],
};
function fixture(): PhysicsRegistry {
  const magnet: SourceMagnet = {
    id: "TEST",
    body: {
      shape: "block",
      dimensionsMm: [10, 6, 8],
      magnetizationAxis: 0,
      polarity: 1,
      innerDiameterMm: 0,
    },
    brMt: 1000,
    brTolerancePct: 0,
    tempCoeffPctPerK: -0.1,
    maxTemperatureC: 100,
    confidence: "high",
    sourceType: "measured",
    provenance,
  };
  const curve = (a: string, d: number) => {
    const r = fieldAtPoint(
      {
        ...magnet.body,
        brMt: 1,
        pose: { positionMm: [d + (a === "D1" ? 5 : 8), 0, 0], rotationDeg: [0, 0, 0] },
      },
      [0.2, 0, 0],
    );
    return r.ok ? Math.abs(r.field.bAlongBladeMt) : null;
  };
  const dataset: PhysicsDataset = {
    familyId: "TEST",
    calibrationMagnetId: "TEST",
    classes: ["B", "C", "D", "E"],
    approaches: [
      { id: "D1", originMm: [5, 0, 0], direction: [1, 0, 0], rotationDeg: [0, 0, 0], provenance },
      { id: "D3", originMm: [8, 0, 0], direction: [1, 0, 0], rotationDeg: [0, 0, 0], provenance },
    ],
    deltaBoundsMm: [-1, 1],
    knownDeltaMm: 0.2,
    distanceBoundsMm: [0.5, 200],
    temperatureRangeC: [-30, 80],
    thresholdTolerancePct: 0,
    provenance,
    observations: ["B", "C", "D", "E"].flatMap((sensitivityClass, i) =>
      ["D1", "D3"].map((approachId) => ({
        id: sensitivityClass + approachId,
        sensitivityClass,
        approachId,
        pullInMm: crossing((d) => curve(approachId, d), 0.001 * (i + 1), [0.5, 200])!,
        dropOutMm: crossing((d) => curve(approachId, d), 0.0006 * (i + 1), [0.5, 200])!,
        provenance,
      })),
    ),
  };
  return { version: "test-only", magnets: [magnet], datasets: [dataset] };
}
const input = {
  sensorFamily: "TEST",
  sensitivityClass: "B",
  magnetId: "TEST",
  approachId: "D1",
  temperatureC: 20,
  ferrousBodies: { declared: false, nearestDistanceMm: null },
};
const need = {
  gapClosedMm: 7.5,
  gapOpenMm: 50,
  gapToleranceMm: 0,
  temperatureMinC: 20,
  temperatureMaxC: 20,
  agingAllowancePct: 0,
};
test("T2 non-vacuous solver activates only for a source-defined synthetic registry", () => {
  const registry = fixture(),
    result = solveSwitching(input, registry);
  expect(result.status).toBe("calibrated");
  expect(result.switching!.pullInMm).toBeCloseTo(
    registry.datasets[0]!.observations[0]!.pullInMm,
    6,
  );
  expect(result.provenance.length).toBeGreaterThan(0);
  registry.datasets[0]!.observations = [];
  expect(solveSwitching(input, registry).switching).toBeNull();
});
test("T4.1/T4.2/T4.6 thermal endpoint sweep, Br spread, aging and zero contribution identity", () => {
  const registry = fixture(),
    nominal = solveSwitching(input, registry).switching!,
    zero = evaluateMargin(input, need, registry);
  expect(zero.pullMm!).toBeCloseTo(nominal.pullInMm, 8);
  expect(zero.dropMm!).toBeCloseTo(nominal.dropOutMm, 8);
  const hot = evaluateMargin(
    input,
    { ...need, temperatureMaxC: 80, temperatureMinC: -20 },
    registry,
  );
  expect(hot.pullMm!).toBeLessThan(zero.pullMm!);
  expect(hot.dropMm!).toBeGreaterThan(zero.dropMm!);
  registry.magnets[0]!.brTolerancePct = 5;
  const spread = evaluateMargin(input, { ...need, agingAllowancePct: 10 }, registry);
  expect(spread.pullMm!).toBeLessThan(zero.pullMm!);
  expect(spread.dropMm!).toBeGreaterThan(zero.dropMm!);
  const aged = evaluateMargin(input, { ...need, agingAllowancePct: 20 }, registry);
  expect(aged.dropMm).toBe(spread.dropMm);
});
test("T3 refusal matrix leaves switching null and cache follows full registry content", () => {
  for (const change of [
    (r: PhysicsRegistry) => {
      r.magnets = [];
    },
    (r: PhysicsRegistry) => {
      r.magnets[0]!.sourceType = "inferred";
    },
    (r: PhysicsRegistry) => {
      r.datasets[0]!.approaches[0].provenance = { ...provenance, sourceRef: "" };
    },
  ]) {
    const r = fixture();
    change(r);
    expect(solveSwitching(input, r).switching).toBeNull();
  }
  const registry = fixture();
  for (const patch of [
    { temperatureC: 101 },
    { sensitivityClass: "A" },
    { approachId: "X" },
    { ferrousBodies: { declared: true, nearestDistanceMm: 500 } },
  ])
    expect(solveSwitching({ ...input, ...patch }, registry).switching).toBeNull();
  const before = solveSwitching(input, registry);
  registry.datasets[0]!.observations[0]!.pullInMm *= 0.2;
  const after = solveSwitching(input, registry);
  expect(before.status).toBe("calibrated");
  expect(after.status).not.toBe("calibrated");
});
