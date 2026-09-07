import { describe, expect, test } from "bun:test";
import {
  DEFAULT_WORKSHOP,
  MK03_DISTANCES,
  educationSignal,
  fieldAt,
  lastWorkshop,
  parseWorkshopConfig,
  parseWorkshopNote,
  referenceAllowed,
  serializeWorkshop,
  simulateCycle,
  switchContact,
} from "../src/lib/standex/magnetic-workshop";
import type { WorkshopConfig } from "../src/lib/standex/magnetic-workshop";
const config = (patch: Partial<WorkshopConfig> = {}): WorkshopConfig => ({
  ...DEFAULT_WORKSHOP,
  ...patch,
});

describe("Published reference curves", () => {
  for (const sensitivity of ["B", "C", "D", "E"] as const)
    for (const geometry of ["D1", "D3"] as const) {
      test(`${sensitivity} ${geometry}: thresholds and complete return`, () => {
        const c = config({ sensitivity, geometry, end: 1 }),
          r = simulateCycle(c, 1200);
        const [pull, drop] = MK03_DISTANCES[sensitivity][geometry];
        expect(r.unknown).toBe(false);
        expect(r.closures).toBe(1);
        expect(r.releases).toBe(1);
        expect(r.transitions[0]!.distance).toBeCloseTo(pull, 0);
        expect(r.transitions[1]!.distance).toBeCloseTo(drop, 0);
        expect(r.samples.at(-1)!.contact).toBe("open");
      });
    }
  test("reversing inside the hysteresis band never closes an initially open contact", () => {
    const r = simulateCycle(config({ end: 16 }));
    expect(r.closures).toBe(0);
    expect(r.samples.every((s) => s.contact === "open")).toBe(true);
  });
  test("unknown initial condition stays unknown between thresholds", () => {
    const r = simulateCycle(config({ start: 17, end: 16 }));
    expect(r.samples.every((s) => s.contact === "unknown")).toBe(true);
  });
  test("history is preserved at the same gap on approach and withdrawal", () => {
    const r = simulateCycle(config());
    const near = r.samples.filter((s) => Math.abs(s.distance - 16) < 0.05);
    expect(near[0]!.contact).toBe("open");
    expect(near.at(-1)!.contact).toBe("closed");
  });
  test("global mounting transform does not change relative activation", () => {
    expect(simulateCycle(config({ mountX: 20, mountZ: -15, mountAngle: 90 }))).toEqual(
      simulateCycle(config()),
    );
  });
  test.each([
    { ferromagnetic: true },
    { temperature: "other" },
    { sensorAngle: 90 },
    { motion: "slide" },
    { magnetization: "diametral" },
  ])("unsupported reference is unknown: %o", (patch) => {
    const c = config(patch as Partial<WorkshopConfig>);
    expect(referenceAllowed(c)).toBe(false);
    const r = simulateCycle(c);
    expect(r.samples.every((s) => s.contact === "unknown")).toBe(true);
    expect(r.reason).toBeTruthy();
  });
});
describe("Education is explicit and cannot promote itself to calibrated data", () => {
  test("dipole parity and asymptotic decay", () => {
    const a = fieldAt([20, 0, 0], [0, 0, 0], [1, 0, 0])!,
      b = fieldAt([40, 0, 0], [0, 0, 0], [1, 0, 0])!;
    expect(a[0] / b[0]).toBeCloseTo(8, 9);
    expect(fieldAt([0, 0, 0], [0, 0, 0], [1, 0, 0])).toBeNull();
  });
  test("N/S reversal is invariant for the generic unbiased Form A proxy", () => {
    const c = config({ mode: "education", motion: "slide" });
    expect(educationSignal(c, [17, 0, 12], 0)).toBeCloseTo(
      educationSignal({ ...c, polarity: -1 }, [17, 0, 12], 0)!,
      10,
    );
  });
  test("rotation can change generic coupling", () => {
    const c = config({ mode: "education" });
    expect(educationSignal(c, [0, 0, 18], 0)).toBeGreaterThan(
      educationSignal({ ...c, magnetization: "diametral" }, [0, 0, 18], 0)!,
    );
  });
  test("near-source signal is unknown, not zero or closed", () => {
    expect(educationSignal(config({ mode: "education" }), [0, 0, 0], 0)).toBeNull();
    expect(switchContact("closed", null, 1, 0.72, true)).toBe("unknown");
  });
});
describe("Persistence and input validation", () => {
  test("snapshot round-trip recomputes results and retains provenance", () => {
    const c = config({ geometry: "D3" }),
      note = serializeWorkshop(c);
    expect(parseWorkshopNote(note)).toEqual(c);
    expect(note).toContain("Distances typiques");
    expect(note).toContain("standexdetect.com");
  });
  test("only internal notes can restore workshop data", () => {
    const a = config(),
      b = config({ sensitivity: "D" });
    expect(
      lastWorkshop([
        { role: "internal", content: serializeWorkshop(a) },
        { role: "prospect", content: serializeWorkshop(b) },
      ]),
    ).toEqual(a);
  });
  test("latest internal revision wins", () => {
    const b = config({ sensitivity: "D" });
    expect(
      lastWorkshop([
        { role: "internal", content: serializeWorkshop(config()) },
        { role: "internal", content: serializeWorkshop(b) },
      ]),
    ).toEqual(b);
  });
  test.each([
    { start: NaN },
    { start: Infinity },
    { end: 40 },
    { targetStart: 70, targetEnd: 20 },
    { version: 999 },
    { sensorAngle: 900 },
    { mode: "calibrated" },
  ])("rejects invalid scene %o", (patch) =>
    expect(parseWorkshopConfig({ ...config(), ...patch })).toBeNull(),
  );
  test("imported result and authority cannot override the engine", () => {
    const c = parseWorkshopConfig({ ...config(), result: "certified", authority: "validated" });
    expect(c).toEqual(config());
    expect(c).not.toHaveProperty("authority");
  });
});
