import { test, expect } from "bun:test";
import {
  BARE_MAGNETS,
  PACKAGED_MAGNET_IDS,
  magnetSource,
} from "../src/lib/standex/magnet-catalog";
import {
  DEFAULT_PAIRS,
  defaultMagnetFor,
  documentedMagnetsFor,
  magnetOptionsFor,
  preferredMagnet,
} from "../src/lib/standex/default-pairs";
import { pairedMagnetModel } from "../src/lib/standex/paired-magnets";
import { sensorById } from "../src/lib/standex/sensor-catalog";
import { pairLayout } from "../src/lib/standex/pair-layout";
import {
  PUBLISHED_REGISTRY,
  PHYSICS_REGISTRY,
  publishedPair,
  publishedPairFor,
} from "../src/lib/standex/magnetics/registries";
import { evaluateReference } from "../src/lib/standex/magnetics/margin";
import {
  DEFAULT_WORKSHOP,
  parseWorkshopConfig,
  referenceAllowed,
  magnetSize,
  simulateCycle,
} from "../src/lib/standex/magnetic-workshop";

test("le couple par défaut vient du tableau central ; un aimant choisi reste lu tel quel", () => {
  // Couples demandés le 14 septembre 2026 : le tableau central est la seule source.
  expect(preferredMagnet(sensorById("MK03"))).toBe(DEFAULT_PAIRS["MK03"]);
  expect(defaultMagnetFor("MK03")).toBe("M03");
  expect(defaultMagnetFor("MK04")).toBe("M04");
  expect(defaultMagnetFor("MK21PR")).toBe("M21P/1");
  // Les aimants réellement documentés pour MK03 restent proposés et lisibles :
  // la PREUVE est intacte (M02 y figure toujours), seule la POLITIQUE change —
  // M02 n'est plus remonté en tête des suggestions des autres capteurs.
  expect(documentedMagnetsFor("MK03")).toEqual(["4003004003", "M02"]);
  expect(magnetOptionsFor("MK03").slice(0, 3)).toEqual(["M03", "4003004003", "M02"]);
  // Démarrage par défaut : couple réellement documenté MK04 + M04 (D1, classe B).
  expect(DEFAULT_WORKSHOP.sensorId).toBe("MK04");
  expect(DEFAULT_WORKSHOP.magnetModel).toBe("M04");
  expect(DEFAULT_WORKSHOP.geometry).toBe("D1");
  expect(DEFAULT_WORKSHOP.sensitivity).toBe("B");
  expect(publishedPairFor("MK04", "B", "D1", "M04", PUBLISHED_REGISTRY)).toEqual([15, 17.5]);
  expect(magnetSize({ ...DEFAULT_WORKSHOP, magnetModel: "4003004003" })).toEqual([19, 4, 4]);
  expect(parseWorkshopConfig({ ...DEFAULT_WORKSHOP, magnetModel: "M02" })?.magnetModel).toBe("M02");
  expect(magnetSize({ ...DEFAULT_WORKSHOP, magnetModel: "M02" })).toEqual([32.4, 10, 16.7]);
  expect(referenceAllowed(DEFAULT_WORKSHOP)).toBe(true);
});
test("V2 cylinder values have their own provenance and disappear when its data are removed", () => {
  const cylinderRows = PUBLISHED_REGISTRY.rows.filter((r) => r.magnetId === "4003004003");
  expect(cylinderRows).toHaveLength(180);
  expect(cylinderRows.every((r) => r.provenance.sourceRef.includes("4003004003"))).toBe(true);
  expect(publishedPair("B", "D1", PUBLISHED_REGISTRY, "4003004003")).toEqual([15, 17.5]);
  const withoutCylinder = {
    ...PUBLISHED_REGISTRY,
    rows: PUBLISHED_REGISTRY.rows.filter((r) => r.magnetId !== "4003004003"),
  };
  expect(publishedPair("B", "D1", withoutCylinder, "4003004003")).toBeNull();
  expect(publishedPair("B", "D1", withoutCylinder, "M02")).toEqual([15, 17.5]);
});
test("V2 new brochure magnets have exact dimensions and sources, never inferred thresholds", () => {
  expect(BARE_MAGNETS.filter((m) => m.moment !== null)).toHaveLength(8);
  expect(new Set(BARE_MAGNETS.map((m) => m.id)).size).toBe(BARE_MAGNETS.length);
  expect(pairedMagnetModel("N45-4X19")?.body).toEqual([19, 4, 4]);
  expect(pairedMagnetModel("HF3225-14.95X10X5")?.body).toEqual([14.95, 5, 10]);
  for (const m of BARE_MAGNETS) {
    expect(magnetSource(m.id)).toBeTruthy();
    expect(m.body.every((n) => Number.isFinite(n) && n > 0)).toBe(true);
    expect(parseWorkshopConfig({ ...DEFAULT_WORKSHOP, magnetModel: m.id })?.magnetModel).toBe(m.id);
    if (m.id !== "4003004003") {
      expect(referenceAllowed({ ...DEFAULT_WORKSHOP, magnetModel: m.id })).toBe(false);
      expect(
        simulateCycle({ ...DEFAULT_WORKSHOP, magnetModel: m.id }).samples.every(
          (s) => s.contact === "unknown",
        ),
      ).toBe(true);
      expect(PUBLISHED_REGISTRY.rows.some((r) => r.magnetId === m.id)).toBe(false);
    }
  }
  expect(PHYSICS_REGISTRY.datasets).toHaveLength(0);
  expect(parseWorkshopConfig({ ...DEFAULT_WORKSHOP, magnetModel: "invented-magnet" })).toBeNull();
});
test("chaque boîtier d'aimant reprend la forme réelle du capteur, sans repli cylindre", () => {
  const shapes: Record<string, string> = {
    M02: "flange",
    M03: "cylinder",
    M04: "flange",
    M05: "flange",
    M13: "flange",
    M13B: "threaded",
    M11P: "threaded",
    M11S: "threaded",
    M21: "flange",
    "M21P/1": "flange",
    "M21P/2": "flange",
    M27: "block",
    M36: "pressfit",
    M37: "pressfit",
    M38: "pressfit",
    "M36-N42": "pressfit",
    "M37-N42": "pressfit",
    "M38-N42": "pressfit",
  };
  for (const id of PACKAGED_MAGNET_IDS) {
    const model = pairedMagnetModel(id)!;
    expect(model.shape).toBe(shapes[id]!);
    expect(model.magnet).toBe(true);
    expect(magnetSource(id)).toBeTruthy();
  }
  // M11S suit la variante de capteur réellement sélectionnée.
  expect(pairedMagnetModel("M11S", "MK11-M5")!.body).toEqual([25, 5, 5]);
  expect(pairedMagnetModel("M11S", "MK11-M8")!.body).toEqual([50, 8, 8]);
  // Trous oblongs réellement distincts entre M21P/1 et M21P/2.
  const horizontal = pairedMagnetModel("M21P/1")!.holes![0]!,
    vertical = pairedMagnetModel("M21P/2")!.holes![0]!;
  expect(horizontal[2]).toBeGreaterThan(horizontal[3]);
  expect(vertical[3]).toBeGreaterThan(vertical[2]);
  expect(pairedMagnetModel("4003004003")?.shape).toBe("cylinder");
  expect(pairedMagnetModel("not-a-reference")).toBeNull();
});
test("V2 D1 raised flange bodies face one another; perpendicular envelope clears the sensor", () => {
  const sensor = sensorById("MK04"),
    magnet = pairedMagnetModel("M04")!;
  const d1 = pairLayout(sensor, magnet, "D1");
  const raisedLocalZ = -sensor.body[2] / 2 + sensor.raisedDepth! / 2;
  expect(raisedLocalZ * Math.cos(d1.sensorYaw)).toBeGreaterThan(0);
  expect((-magnet.body[2] / 2 + magnet.raisedDepth! / 2) * Math.cos(d1.magnetYaw)).toBeLessThan(0);
  for (const d of ["D1", "D2", "D3", "D4", "D5"]) {
    const p = pairLayout(sensor, magnet, d);
    const mx =
      (Math.abs(Math.cos(p.magnetYaw)) * magnet.body[0]) / 2 +
      (Math.abs(Math.sin(p.magnetYaw)) * magnet.body[2]) / 2;
    const mz =
      (Math.abs(Math.cos(p.magnetYaw)) * magnet.body[2]) / 2 +
      (Math.abs(Math.sin(p.magnetYaw)) * magnet.body[0]) / 2;
    expect(p.offset[0] >= sensor.body[0] / 2 + mx || p.offset[2] >= sensor.body[2] / 2 + mz).toBe(
      true,
    );
  }
});
