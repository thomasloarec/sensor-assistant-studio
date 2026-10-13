import { describe, expect, test } from "bun:test";
import { sensorById } from "@/lib/standex/sensor-catalog";
import { SENSOR_SPECIFICATIONS } from "@/lib/standex/sensor-specifications";
import { cableConstruction, housingMaterial } from "@/lib/leadmagnet/product-presentation";
import { bodyKind, oneFlatProfile } from "@/lib/standex/section-profile";
import { pairCardFor } from "@/lib/leadmagnet/pair-cards";
import { readFileSync } from "node:fs";

const extent = (pts: [number, number][], i: 0 | 1) => {
  const v = pts.map((p) => p[i]);
  return Math.max(...v) - Math.min(...v);
};

describe("Lot 2 — MK20/1 et MK20/2 : un boîtier à méplat, deux fils", () => {
  const cases = [
    ["MK20_1", 10, 3, 2.7],
    ["MK20_2", 7.5, 2.7, 2.5],
  ] as const;
  for (const [id, l, d, f] of cases) {
    test(`${id} cotes officielles et section à un méplat`, () => {
      const m = sensorById(id);
      expect(m.body).toEqual([l, d, f]);
      expect(bodyKind(m)).toBe("one_flat");
      const pts = oneFlatProfile(m.body[1], m.body[2]);
      expect(extent(pts, 1)).toBeCloseTo(d, 2); // diamètre
      expect(extent(pts, 0)).toBeCloseTo(f, 2); // cote sur méplat
      const xs = pts.map((p) => p[0]);
      expect(Math.max(...xs) + Math.min(...xs)).toBeCloseTo(0, 6); // centré
    });
    test(`${id} sort en deux fils isolés, sans gaine rigide`, () => {
      const m = sensorById(id);
      expect(cableConstruction(m)).toBe("wires");
      expect(SENSOR_SPECIFICATIONS[id]!.material).toBe("PBT 30 % fibres de verre");
      expect(SENSOR_SPECIFICATIONS[id]!.cableMaterial).toContain("Deux fils");
    });
  }
  test("MK21 inchangé (pas de méplat, pas de fils séparés)", () => {
    const m = sensorById("MK21");
    expect(m.section).toBeUndefined();
    expect(m.leads).toBeUndefined();
  });
  test("Body partagé : une seule enveloppe, aucun manchon pour les fils", () => {
    const src = readFileSync("src/components/standex/workshop/scene.tsx", "utf8");
    expect(src).toContain('bodyKind(model) === "one_flat"');
    expect(src).toMatch(/const jacket = kind !== "wires"/);
    expect(src).toMatch(/\[-1, 1\]\.map\(\(sign\) => \(\s*<group key=\{sign\}>/);
    const thumb = readFileSync("src/components/standex/workshop/candidate-thumbnail-scene.tsx", "utf8");
    expect(thumb).toContain('import { Body, Contacts, ContextGuard } from "./scene"');
    const plan = readFileSync("src/components/standex/workshop/sensor-plan.tsx", "utf8");
    expect(plan).toContain('data-profile="one_flat"');
  });
});

describe("Lot 2 — matériaux des quatre MK11", () => {
  const expected = {
    "MK11-M5": ["Acier inoxydable", "M5", "inoxydable"],
    "MK11-M8": ["Acier inoxydable", "M8", "inoxydable"],
    "MK11-P-M8": ["Plastique Crastin", "M8", "plastique"],
    "MK11-B-M6": ["Laiton", "M6", "laiton"],
  } as const;
  for (const [id, [mat, thread, word]] of Object.entries(expected)) {
    test(`${id} boîtier ${mat}, filetage ${thread}`, () => {
      const card = pairCardFor(sensorById(id));
      expect(card.sensorMaterialLabel).toBe(mat);
      expect(card.threadLabel).toBe(thread);
      expect(housingMaterial(sensorById(id))).toContain(word);
      expect(card.sensorMaterialLabel).not.toBe(card.materialLabel); // pas l'aimant
    });
  }
  test("quatre matériaux distincts au moins trois, MK26 PBT et MK27 aluminium", () => {
    const mats = new Set(Object.keys(expected).map((id) => pairCardFor(sensorById(id)).sensorMaterialLabel));
    expect(mats.size).toBe(3);
    expect(pairCardFor(sensorById("MK26")).sensorMaterialLabel).not.toMatch(/inox/i);
    expect(SENSOR_SPECIFICATIONS["MK27"]!.material).toBe("Aluminium");
    expect(pairCardFor(sensorById("MK04")).threadLabel).toBeNull();
  });
  test("traductions 8 langues des nouveaux libellés", () => {
    const d = JSON.parse(readFileSync("src/lib/i18n/messages.json", "utf8"));
    for (const k of ["Boîtier du capteur", "Filetage", "Plastique Crastin", "Deux fils isolés séparés 2 × 0,06 mm²", "Boîtier unique à un méplat, deux fils isolés"])
      expect(d[k]?.length, k).toBe(7);
  });
});
