import { describe, expect, test } from "bun:test";
import { SENSOR_CATALOG, CUSTOM_SENSOR_ID } from "../src/lib/standex/sensor-catalog";
import { SENSOR_SPECIFICATIONS as specs } from "../src/lib/standex/sensor-specifications";
import messages from "../src/lib/i18n/messages.json";

describe("Product specifications and manufacturer qualifications", () => {
  test("all commercial catalogue entries have specifications and translated explanations", () => {
    const localized = messages as Record<string, string[]>;
    // GENERIC et CUSTOM ne sont pas des produits : ils n'ont ni fiche ni
    // caractéristique validée, et ne doivent surtout pas en recevoir une.
    for (const model of SENSOR_CATALOG.filter(
      (s) => s.id !== "GENERIC" && s.id !== CUSTOM_SENSOR_ID,
    )) {
      const s = specs[model.id]!;
      expect(s, model.id).toBeDefined();
      expect(s.electrical.length).toBeGreaterThan(0);
      expect(s.temperatures.every((v) => v.min < v.max)).toBe(true);
      for (const text of [s.strength, s.integration, s.electricalNote, s.cableNote].filter(Boolean))
        expect(localized[text!]?.length, text).toBe(7);
    }
    expect(specs.GENERIC).toBeUndefined();
    expect(specs[CUSTOM_SENSOR_ID]).toBeUndefined();
  });
  test("MK24 magnetic sensitivity A has reduced ratings distinct from Form A", () => {
    const mk24 = specs["MK24-A-J"]!;
    expect(
      mk24.electrical.map(({ power, voltage, switching, carry }) => [
        power,
        voltage,
        switching,
        carry,
      ]),
    ).toEqual([
      [3, 30, 0.3, 0.5],
      [1, 30, 0.1, 0.3],
    ]);
    expect(mk24.electricalNote).toContain("deux notions distinctes");
    expect(mk24.cableLengths).toEqual([]);
  });
  test("MK38 retains packaged 300 V limit instead of raw reed's 1000 V", () => {
    expect(specs.MK38!.electrical.find((v) => v.model === "1A85C")?.voltage).toBe(300);
    expect(specs.MK38!.cableLengths).toEqual([300]);
  });
  test("high temperature MK21 and PVC MK21PR remain distinct", () => {
    expect(specs.MK21!.temperatures.map((t) => [t.min, t.max])).toEqual([
      [-40, 150],
      [-30, 150],
    ]);
    expect(specs.MK21PR!.temperatures.map((t) => [t.min, t.max])).toEqual([
      [-30, 80],
      [-5, 80],
    ]);
    expect(specs.MK21!.cableLengths).toEqual([500, 1000, 1500, 2000, 3000, 5000]);
  });
});
