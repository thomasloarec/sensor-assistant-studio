/** La variante R&D doit MODIFIER réellement le dossier, sans muter l'original. */
import { describe, expect, test } from "bun:test";
import { createDossier } from "../src/lib/leadmagnet/dossier";
import { applyVariant } from "../src/lib/leadmagnet/variant";

const base = () => createDossier("Test variante");

describe("applyVariant", () => {
  test("applique les valeurs chiffrées du câble et conserve l'original", () => {
    const original = base();
    const before = original.cabling.serviceReserveMm;
    const out = applyVariant(original, { cable: { serviceReserveMm: 42, toleranceMm: 3 } });
    expect(out.dossier.cabling.serviceReserveMm).toBe(42);
    expect(out.dossier.cabling.toleranceMm).toBe(3);
    expect(original.cabling.serviceReserveMm).toBe(before);
    expect(out.applied.length).toBeGreaterThan(0);
  });

  test("refuse les valeurs non finies ou négatives sans toucher au dossier", () => {
    const original = base();
    const out = applyVariant(original, {
      cable: { serviceReserveMm: Number.NaN, terminationMm: -5 },
    });
    expect(out.dossier.cabling.serviceReserveMm).toBe(original.cabling.serviceReserveMm);
    expect(out.dossier.cabling.terminationMm).toBe(original.cabling.terminationMm);
    expect(out.notApplied.length).toBeGreaterThanOrEqual(2);
  });

  test("un commentaire libre ne modifie jamais la géométrie", () => {
    const original = base();
    const out = applyVariant(original, {
      cable: { text: "raccourcir le câble" },
      description: "proposition",
    });
    expect(out.dossier.cabling).toEqual(original.cabling);
    expect(out.applied).toEqual([]);
  });

  test("un connecteur proposé reste à vérifier par la R&D", () => {
    const out = applyVariant(base(), {
      connector: { manufacturer: "JST", mpn: "PHR-3", positions: 3 },
    });
    expect(JSON.stringify(out.dossier.termination)).toContain("PHR-3");
    expect(JSON.stringify(out.dossier.termination)).toContain("to_verify_by_rnd");
  });
});
