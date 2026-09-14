import { describe, expect, test } from "bun:test";
import { execSync } from "node:child_process";
import { PACKAGED_MAGNETS, packagedMagnet } from "../src/lib/standex/magnet-catalog";

/** Table transcrite de Packaged-Magnets.pdf V03 + datasheet-reed-sensor-series-
 * magnet-in-housing.pdf : matériaux séparés aimant/boîtier, jamais fusionnés,
 * jamais convertis en distance. */
describe("matériaux des aimants en boîtier : aimant et boîtier restent distincts", () => {
  test("chaque référence porte son matériau magnétique et son matériau de boîtier exacts", () => {
    const expected: Record<string, { magnet: string; housing: string }> = {
      M02: { magnet: "AlNiCo", housing: "PBT glass fiber reinforced" },
      M03: { magnet: "AlNiCo", housing: "PBT glass fiber reinforced" },
      M04: { magnet: "AlNiCo", housing: "PBT glass fiber reinforced" },
      M05: { magnet: "AlNiCo", housing: "PBT glass fiber reinforced" },
      M13: { magnet: "AlNiCo", housing: "PBT glass fiber reinforced" },
      M11S: { magnet: "AlNiCo", housing: "High Grade Steel (1.4305)" },
      M11P: { magnet: "AlNiCo", housing: "Plastic" },
      M13B: { magnet: "AlNiCo", housing: "Brass" },
      "M21P/1": { magnet: "AlNiCo", housing: "Crastin SK655FR1" },
      "M21P/2": { magnet: "AlNiCo", housing: "Crastin SK655FR1" },
      M27: { magnet: "AlNiCo", housing: "Aluminum" },
      M36: { magnet: "NdFeB", housing: "PBT" },
      M37: { magnet: "NdFeB", housing: "PBT" },
      M38: { magnet: "NdFeB", housing: "PBT" },
    };
    for (const [id, { magnet, housing }] of Object.entries(expected)) {
      const p = packagedMagnet(id)!;
      expect(p, id).toBeTruthy();
      expect(p.magnetMaterial, id).toBe(magnet as "AlNiCo" | "NdFeB");
      expect(p.housingMaterial, id).toBe(housing);
      // Les deux champs restent bien deux notions séparées.
      expect(p.magnetMaterial).not.toBe(p.housingMaterial);
    }
  });

  test("le moment typique est publié brut, dans l'unité constructeur, jamais converti", () => {
    expect(packagedMagnet("M02")!.momentTypE6Vscm).toBe(22.2);
    expect(packagedMagnet("M27")!.momentTypE6Vscm).toBe(95.4);
    expect(packagedMagnet("M36")!.momentTypE6Vscm).toBe(49);
    expect(packagedMagnet("M37")!.momentTypE6Vscm).toBe(75);
    expect(packagedMagnet("M38")!.momentTypE6Vscm).toBe(101.5);
    expect(packagedMagnet("M11S")!.momentTypE6Vscm).toEqual([18.0, 22.2]);
    expect(packagedMagnet("M13B")!.momentTypE6Vscm).toEqual([18.0, 22.2]);
  });

  test("les filetages sont des chaînes exactes, jamais des nombres séparés diamètre/pas", () => {
    const m03Thread = packagedMagnet("M03")!.envelope?.threadSpec;
    expect(m03Thread).toBe("M5x0.5");
    expect(typeof m03Thread).toBe("string");
    // Jamais 5 ou 0.5 numériques isolés à la place de la chaîne complète.
    // @ts-expect-error un filetage n'est jamais un nombre.
    const asNumber: number = m03Thread;
    expect(asNumber).not.toBe(5);
    expect(asNumber).not.toBe(0.5);

    const m11s = packagedMagnet("M11S")!.envelope!;
    expect(m11s.threadSpec).toEqual(["M5x0.5", "M8x0.5"]);

    const m11p = packagedMagnet("M11P")!.envelope!;
    expect(m11p.threadSpec).toBe("M8x0.125");
    expect(m11p.threadSpecToVerify).toBe(true);

    const m13b = packagedMagnet("M13B")!.envelope!;
    expect(m13b.threadSpec).toEqual(["M6", "M8", "M10", "M12"]);
  });

  test("M13B reste un alias documentaire de M11B, sans changer d'identifiant", () => {
    const p = packagedMagnet("M13B")!;
    expect(p.documentedAs).toBe("M11B");
    expect(p.id).toBe("M13B"); // aucun renommage : les dossiers existants restent valides.
    expect(PACKAGED_MAGNETS.some((m) => m.id === "M11B")).toBe(false);
  });

  test("les variantes -N42 héritent des matériaux de famille sans invention de moment", () => {
    for (const [variant, family] of [
      ["M36-N42", "M36"],
      ["M37-N42", "M37"],
      ["M38-N42", "M38"],
    ] as const) {
      const v = packagedMagnet(variant)!;
      const f = packagedMagnet(family)!;
      expect(v.grade).toBe("N42");
      expect(v.datasheet).toBeTruthy();
      expect(v.magnetMaterial).toBe(f.magnetMaterial);
      expect(v.housingMaterial).toBe(f.housingMaterial);
      // Le moment typique de la fiche générique n'est pas réputé valable pour
      // N42 : il n'est ni recopié ni inventé.
      expect(v.momentTypE6Vscm).toBeNull();
      expect(v.momentTypE6Vscm).not.toBe(f.momentTypE6Vscm);
    }
  });

  test("le diamètre de collerette M36/M37/M38 reste une cote d'enveloppe, jamais un corps 3D", () => {
    for (const id of ["M36", "M37", "M38"] as const) {
      const env = packagedMagnet(id)!.envelope!;
      expect(env.flangeDiameterMm).toBe(10.7);
      expect(env.diameterMm).toBeUndefined();
    }
  });

  test("aucun module de distance publiée ne consomme les champs matériau/moment", () => {
    const hits = execSync(
      "rg -l \"magnetMaterial|momentTypE6Vscm\" src/lib/standex/mounting src/lib/standex/magnetics src/lib/standex/pair-layout.ts src/lib/standex/magnetic-workshop.ts 2>/dev/null || true",
      { encoding: "utf8" },
    ).trim();
    expect(hits).toBe("");
  });
});
