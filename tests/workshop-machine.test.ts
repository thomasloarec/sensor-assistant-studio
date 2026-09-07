import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { Euler, Vector3 } from "three";
import {
  DEFAULT_WORKSHOP,
  educationSignal,
  momentFor,
  parseWorkshopConfig,
  parseWorkshopNote,
  serializeWorkshop,
  simulateCycle,
} from "../src/lib/standex/magnetic-workshop";
import type { WorkshopConfig, Vec3 } from "../src/lib/standex/magnetic-workshop";
import {
  COFFEE_ASSEMBLY,
  componentPose,
  movePoint,
  rotate,
} from "../src/lib/standex/machine-assembly";
import { loadMachineAsset, validateGlb } from "../src/lib/standex/machine-assets";
import { SENSOR_CATALOG } from "../src/lib/standex/sensor-catalog";

const demo = (patch: Partial<WorkshopConfig> = {}): WorkshopConfig => ({
  ...DEFAULT_WORKSHOP,
  mode: "education",
  magnetModel: "generic",
  ...patch,
});
const machine = (): WorkshopConfig =>
  demo({ sensorId: "MK24-A-J", machine: structuredClone(COFFEE_ASSEMBLY) });
describe("Three-dimensional pole orientation", () => {
  for (const geometry of ["D1", "D3"] as const) {
    test(`${geometry}: parallel, perpendicular null and displaced lobe`, () => {
      const parallel = simulateCycle(demo({ geometry, end: 1 }));
      const perpendicular = simulateCycle(demo({ geometry, end: 1, magnetAngle: 90 }));
      const lobe = simulateCycle(
        demo({ geometry, end: 1, magnetAngle: 90, lateralShift: 15, demoReach: 40 }),
      );
      expect(parallel.samples.some((s) => s.contact === "closed")).toBe(true);
      expect(perpendicular.samples.every((s) => s.contact === "open")).toBe(true);
      expect(lobe.samples.some((s) => s.contact === "closed")).toBe(true);
      expect(lobe.samples.every((s) => s.contact !== "unknown")).toBe(true);
    });
  }
  test("N/S inversion preserves a full Form A cycle including hysteresis", () => {
    const c = demo({ motion: "slide", magnetAngle: 35 });
    expect(simulateCycle(c)).toEqual(simulateCycle({ ...c, polarity: -1 }));
  });
  test("body rotation and pole direction stay aligned with the rendered Euler rotation", () => {
    for (const magnetization of ["axial", "diametral", "thickness"] as const) {
      const c = demo({ magnetAngle: 35, magnetTilt: 60, magnetization });
      const v =
        magnetization === "axial"
          ? [1, 0, 0]
          : magnetization === "diametral"
            ? [0, 0, 1]
            : [0, 1, 0];
      const expected = new Vector3(...v).applyEuler(
        new Euler(0, (-35 * Math.PI) / 180, (60 * Math.PI) / 180),
      );
      momentFor(c, 35).forEach((n, i) => expect(n).toBeCloseTo(expected.toArray()[i]!, 12));
    }
  });
  test("thickness magnetization couples when the magnet has a height offset", () => {
    const c = demo({ magnetization: "thickness" });
    expect(educationSignal(c, [0, 10, 0], 0)).toBeCloseTo(0, 10);
    expect(educationSignal(c, [15, 10, 0], 0)).toBeGreaterThan(0.1);
  });
  test("every catalogue item has finite educational states even near the source", () => {
    for (const sensor of SENSOR_CATALOG) {
      const c = demo({
        sensorId: sensor.id,
        ferromagnetic: true,
        temperature: "other",
        motion: "pivot",
        offset: 6,
      });
      const result = simulateCycle(c, 60);
      expect(result.unknown).toBe(false);
      expect(result.samples.every((s) => Number.isFinite(s.signal))).toBe(true);
      expect(Number.isFinite(educationSignal(c, [0, 0, 0], 0))).toBe(true);
    }
  });
});
describe("Machine motion and retained configurations", () => {
  test("coffee drawer opens the contact and recloses on return", () => {
    const c = machine(),
      r = simulateCycle(c);
    expect(r.samples[0]!.contact).toBe("closed");
    expect(r.samples[300]!.contact).toBe("open");
    expect(r.samples[600]!.contact).toBe("closed");
    expect(r.releases).toBe(1);
    expect(r.closures).toBe(1);
    expect(componentPose(c.machine!, "sensor", 1).position).toEqual(COFFEE_ASSEMBLY.sensorPosition);
    expect(componentPose(c.machine!, "magnet", 1).position).toEqual([85, 75, 192]);
  });
  test("moving both components together preserves their coupling", () => {
    const c = machine();
    c.machine!.sensorMount = "moving";
    const r = simulateCycle(c);
    expect(r.samples.every((s) => s.contact === "closed")).toBe(true);
    expect(r.samples[0]!.signal).toBeCloseTo(r.samples[300]!.signal!, 10);
  });
  test("machine rotations match the renderer and rotate the magnet axis about the pivot", () => {
    const v: Vec3 = [9, -4, 13],
      angles: Vec3 = [35, 80, -20];
    const expected = new Vector3(...v).applyEuler(
      new Euler(...(angles.map((a) => (a * Math.PI) / 180) as Vec3)),
    );
    rotate(v, angles).forEach((n, i) => expect(n).toBeCloseTo(expected.toArray()[i]!, 12));
    const m = {
      ...COFFEE_ASSEMBLY,
      motion: "rotation" as const,
      pivot: [10, 0, 0] as Vec3,
      rotationAxis: "y" as const,
      openingAngle: 90,
    };
    const point = movePoint(m, [20, 0, 0], 1);
    expect(point[0]).toBeCloseTo(10);
    expect(point[2]).toBeCloseTo(-10);
    expect(componentPose(m, "magnet", 1).transform([1, 0, 0])[2]).toBeCloseTo(-1);
  });
  test("V3 saves all machine settings and discards imported authority fields", () => {
    const c = machine();
    c.machine!.magnetRotation = [35, 80, -20];
    expect(parseWorkshopNote(serializeWorkshop(c))).toEqual(c);
    const dirty = { ...c, machine: { ...c.machine, certified: true } };
    expect(parseWorkshopConfig(dirty)?.machine).not.toHaveProperty("certified");
    expect(parseWorkshopConfig({ ...c, mode: "reference" })).toBeNull();
    expect(parseWorkshopConfig({ ...c, machine: { ...c.machine, unitScale: NaN } })).toBeNull();
    expect(
      parseWorkshopConfig({ ...c, machine: { ...c.machine, sensorPosition: [NaN, 0, 0] } }),
    ).toBeNull();
    expect(
      parseWorkshopConfig({
        ...c,
        machine: { ...c.machine, assetKey: "https://example.com/model" },
      }),
    ).toBeNull();
  });
  test("a genuine V2 snapshot migrates to V3 defaults", () => {
    const { demoReach, lateralShift, magnetTilt, magnetModel, machine: unused, ...old } = demo();
    void [demoReach, lateralShift, magnetTilt, magnetModel, unused];
    expect(parseWorkshopConfig({ ...old, version: 2 })).toEqual(demo());
  });
});
describe("The delivered coffee GLB", () => {
  test("loads at millimetre scale with independently movable drawer geometry", async () => {
    const bytes = await readFile(
      new URL("../public/models/machine-cafe-bac-mobile.glb", import.meta.url),
    );
    const data = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
    expect(() => validateGlb(data)).not.toThrow();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      expect(input).toBe("/models/machine-cafe-bac-mobile.glb");
      return new Response(data);
    }) as typeof fetch;
    try {
      const asset = await loadMachineAsset(COFFEE_ASSEMBLY.assetKey, 1000);
      expect(asset.nodes.find((n) => n.path === COFFEE_ASSEMBLY.movingNode)?.name).toBe(
        "Bac_mobile",
      );
      expect(asset.parts.some((p) => p.path.startsWith("0/0/"))).toBe(true);
      expect(asset.parts.some((p) => p.path.startsWith("0/1/"))).toBe(true);
      expect(asset.size[0]).toBeCloseTo(232, 2);
      expect(asset.size[1]).toBeCloseTo(330, 2);
      expect(asset.size[2]).toBeCloseTo(261, 2);
      asset.dispose();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
  test("rejects non-GLB data", () => expect(() => validateGlb(new ArrayBuffer(30))).toThrow());
});
