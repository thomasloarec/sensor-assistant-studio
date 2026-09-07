import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import {
  DEFAULT_WORKSHOP,
  approachOffset,
  bodiesOverlap,
  educationSignal,
  parseWorkshopConfig,
  parseWorkshopNote,
  poseAt,
  simulateCycle,
  serializeWorkshop,
} from "../src/lib/standex/magnetic-workshop";
import { SENSOR_CATALOG, sensorById } from "../src/lib/standex/sensor-catalog";

describe("Documented body sizes and source plans", () => {
  test("MK24 and MK02 retain their different physical sizes", () => {
    expect(sensorById("MK24-A-J").body).toEqual([5, 1.6, 2.2]);
    expect(sensorById("MK24-A-J").terminalSpan).toBe(5.5);
    expect(sensorById("MK02").body).toEqual([32.4, 10, 16.8]);
  });
  test("every selectable commercial model has its local source plan", () => {
    expect(new Set(SENSOR_CATALOG.map((s) => s.id)).size).toBe(SENSOR_CATALOG.length);
    for (const model of SENSOR_CATALOG) {
      expect(model.body.every((n) => Number.isFinite(n) && n > 0)).toBe(true);
      if (model.id !== "GENERIC")
        expect(
          existsSync(new URL(`../public/datasheets/${model.sourceFile}`, import.meta.url)),
        ).toBe(true);
    }
  });
  test("reference gaps are between actual body envelopes", () => {
    const d1 = { ...DEFAULT_WORKSHOP },
      d3 = { ...DEFAULT_WORKSHOP, geometry: "D3" as const };
    expect(approachOffset(d1)).toBeCloseTo((5.8 + 16.7) / 2, 10);
    expect(approachOffset(d3)).toBeCloseTo((25.5 + 32.4) / 2, 10);
    expect(poseAt(d1, 0.5).position[2] - approachOffset(d1)).toBe(5);
    expect(poseAt(d3, 0.5).position[0] - approachOffset(d3)).toBeCloseTo(5, 10);
  });
  test("envelope collision respects orientation without blocking the fictitious signal", () => {
    const c = {
      ...DEFAULT_WORKSHOP,
      mode: "education" as const,
      sensorId: "MK27",
      magnetModel: "generic" as const,
    };
    expect(bodiesOverlap(c, [0, 0, 10], 0)).toBe(true);
    expect(Number.isFinite(educationSignal(c, [0, 0, 10], 0))).toBe(true);
    expect(bodiesOverlap(c, [0, 0, 20], 0)).toBe(false);
    expect(bodiesOverlap({ ...c, sensorAngle: 90 }, [0, 0, 20], 0)).toBe(true);
    for (const model of SENSOR_CATALOG) {
      const a = {
        ...c,
        sensorId: model.id,
        motion: "approach" as const,
        sensorAngle: 45,
        magnetAngle: 30,
      };
      const p = poseAt(a, 0.5);
      expect(bodiesOverlap(a, p.position, p.angle)).toBe(false);
    }
  });
  test("a metal target MK02 cannot reuse external-magnet switching distances", () => {
    for (const mode of ["reference"] as const) {
      const result = simulateCycle({ ...DEFAULT_WORKSHOP, sensorId: "MK02", mode });
      expect(result.samples.every((s) => s.contact === "unknown")).toBe(true);
      expect(result.reason).toContain("métal ferreux");
    }
  });
  test("other selected housings cannot inherit the MK03 calibration", () => {
    const result = simulateCycle({ ...DEFAULT_WORKSHOP, sensorId: "MK24-A-J" });
    expect(result.samples.every((s) => s.contact === "unknown")).toBe(true);
  });
});
describe("Existing saved assemblies remain readable", () => {
  test("V1 reference and education snapshots migrate to explicit V3 sensor identities", () => {
    const old = { ...DEFAULT_WORKSHOP, version: 1, sensorId: undefined };
    expect(parseWorkshopConfig(old)).toEqual(DEFAULT_WORKSHOP);
    expect(
      parseWorkshopNote(
        "Saved\n\n[STANDEX_MAGNETIC_WORKSHOP_V1]\n" + JSON.stringify({ ...old, mode: "education" }),
      )?.sensorId,
    ).toBe("GENERIC");
  });
  test("V3 catalogue selection survives save and reload", () => {
    const c = { ...DEFAULT_WORKSHOP, sensorId: "MK24-A-J", mode: "education" as const };
    expect(parseWorkshopNote(serializeWorkshop(c))).toEqual(c);
    expect(parseWorkshopConfig({ ...c, sensorId: "invented" })).toBeNull();
  });
});
