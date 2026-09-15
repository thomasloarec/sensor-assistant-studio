import { describe, expect, it } from "bun:test";
import {
  ACTIVATION_GUIDE,
  guideEconomicalMagnet,
  guideFamilyFor,
  guideIllustrativeMarks,
  guideMagnetMaterial,
  guideMagnetsFor,
  guideMaterialsFor,
  guideRange,
  hasGuideData,
} from "@/lib/standex/activation-guide";
import { standardShapeForSensor } from "@/lib/standex/magnet-recommendation";
import { defaultMagnetFor, isOutsidePolicy, magnetOptionsFor } from "@/lib/standex/default-pairs";
import { BARE_MAGNETS } from "@/lib/standex/magnet-catalog";
import { pairCardFor } from "@/lib/leadmagnet/pair-cards";
import { sensorById } from "@/lib/standex/sensor-catalog";
import { illustrativeMarks, ILLUSTRATIVE_PULL_IN_MM, ILLUSTRATIVE_DROP_OUT_MM } from "@/lib/standex/mounting/simulate";

describe("guide — proposition filtrée par la forme du capteur", () => {
  it("ne propose que des blocs à un capteur non tubulaire (MK15) et des cylindres à MK03", () => {
    expect(standardShapeForSensor("MK15")).toBe("block");
    const blocks = guideMagnetsFor("MK15", undefined, "block");
    expect(blocks.length).toBeGreaterThan(0);
    for (const m of blocks) expect(m.shape).toBe("block");
    for (const bucket of guideMaterialsFor("MK15", undefined, "block"))
      for (const m of bucket.magnets) expect(m.shape).toBe("block");

    const cylinders = guideMagnetsFor("MK03", undefined, "cylinder");
    expect(cylinders.length).toBeGreaterThan(0);
    for (const m of cylinders) expect(m.shape).toBe("cylinder");
  });

  it("laisse le registre brut entier : sans filtre, les deux formes restent lisibles", () => {
    const all = guideMagnetsFor("MK15");
    expect(all.some((m) => m.shape === "cylinder")).toBe(true);
    expect(all.length).toBeGreaterThan(guideMagnetsFor("MK15", undefined, "block").length);
  });

  it("le défaut économique respecte la forme demandée", () => {
    const eco = guideEconomicalMagnet("MK15", undefined, "block");
    expect(eco?.shape).toBe("block");
    expect(eco?.material).toBe("Ferrite");
  });
});

describe("guide — variantes de taille préservées, aucun alias", () => {
  it("chaque taille MK06 garde ses propres lignes et n'est jamais confondue", () => {
    for (const family of ["MK06-4", "MK06-5", "MK06-6", "MK06-7", "MK06-8"]) {
      expect(guideFamilyFor(family)).toBe(family);
      expect(hasGuideData(family)).toBe(true);
    }
    const four = guideRange("MK06-4", "MK06-4-B", "HF3225-14.95X10X5", "D1");
    const five = guideRange("MK06-5", "MK06-5-B", "HF3225-14.95X10X5", "D1");
    expect(four).not.toBeNull();
    expect(five).not.toBeNull();
    expect(four!.sensorFamily).toBe("MK06-4");
    expect(five!.sensorFamily).toBe("MK06-5");
    // Une famille sans taille n'est PAS rapprochée d'une variante imprimée.
    expect(guideFamilyFor("MK06")).toBe("MK06");
    expect(hasGuideData("MK06")).toBe(false);
    expect(guideRange("MK06", "MK06-4-B", "HF3225-14.95X10X5", "D1")).toBeNull();
  });

  it("n'invente aucun autre rapprochement", () => {
    expect(guideFamilyFor("MK27")).toBe("MK27");
    expect(hasGuideData("MK27")).toBe(false);
    expect(guideMagnetsFor("MK27")).toHaveLength(0);
  });
});

describe("guide — repères d'animation illustrative", () => {
  it("MK15-B-X D1 : ferrite et NdFeB donnent des repères différents", () => {
    const ferrite = guideIllustrativeMarks(
      guideRange("MK15", "MK15-B-X", "HF3225-14.95X10X5", "D1"),
    );
    const ndfeb = guideIllustrativeMarks(guideRange("MK15", "MK15-B-X", "NDFEB-10X5X1.9", "D1"));
    expect(ferrite).toEqual({ nearMm: 15.4, farMm: 20.1 });
    expect(ndfeb).toEqual({ nearMm: 10.2, farMm: 13.9 });
    // À 14 mm, la ferrite est déjà dans sa plage alors que le NdFeB en est sorti.
    expect(14 <= ferrite!.nearMm).toBe(true);
    expect(14 >= ndfeb!.farMm).toBe(true);
  });

  it("retombe sur 15 / 18 mm sans plage exploitable, sans jamais inventer un seuil", () => {
    expect(illustrativeMarks(null)).toEqual([ILLUSTRATIVE_PULL_IN_MM, ILLUSTRATIVE_DROP_OUT_MM]);
    expect(guideIllustrativeMarks(null)).toBeNull();
    expect(illustrativeMarks({ nearMm: 15.4, farMm: 20.1 })).toEqual([15.4, 20.1]);
  });

  it("les repères ne sont jamais présentés comme des seuils publiés", () => {
    const row = guideRange("MK15", "MK15-B-X", "HF3225-14.95X10X5", "D1")!;
    // La transcription garde l'ordre imprimé : les colonnes restent « up » / « to ».
    expect(row.upMm).toBe(15.4);
    expect(row.toMm).toBe(20.1);
    expect(ACTIVATION_GUIDE.source.url).toContain("standexdetect.com");
  });
});

describe("carte de couple — matériau lisible", () => {
  it("affiche le matériau publié en clair, pas seulement le code", () => {
    const card = pairCardFor(sensorById("MK15"));
    expect(card.materialLabel).toBe("Ferrite");
    expect(guideMagnetMaterial(card.magnetId)).toBe("Ferrite");
  });
});

describe("guide — lignes d'ordre imprimé atypique conservées", () => {
  it("garde MK04-1A66A-X + SmCo telles qu'imprimées (D3 10,3 / 8,2) et les signale", () => {
    const row = guideRange("MK04", "MK04-1A66A-X", "SMCO5-5X4", "D3");
    expect(row).not.toBeNull();
    expect(row!.upMm).toBe(10.3);
    expect(row!.toMm).toBe(8.2);
    expect(row!.orderAtypical).toBe(true);
  });

  it("ne les exploite JAMAIS comme repères de démonstration", () => {
    const row = guideRange("MK04", "MK04-1A66A-X", "SMCO5-5X4", "D3");
    expect(guideIllustrativeMarks(row)).toBeNull();
  });

  it("conserve les 73 lignes atypiques dans le registre consultable", () => {
    const atypical = ACTIVATION_GUIDE.rows.filter((r) => r.orderAtypical);
    expect(atypical.length).toBe(73);
    // Aucune n'est triée ni recalculée.
    for (const r of atypical) expect(r.upMm! > r.toMm!).toBe(true);
  });
});

describe("sélecteur avancé — mêmes règles M02 et forme", () => {
  it("ne propose M02 qu'au MK02", () => {
    expect(magnetOptionsFor("MK02")).toContain("M02");
    for (const s of ["MK15", "MK16", "MK17", "MK03", "MK04", "MK06-4"])
      expect(magnetOptionsFor(s)).not.toContain("M02");
  });

  it("ne propose que la forme du capteur, boîtiers d'autres capteurs exclus", () => {
    const mk15 = magnetOptionsFor("MK15");
    expect(mk15).not.toContain("M03");
    expect(mk15.some((id) => id.startsWith("SMCO5-"))).toBe(false);
    for (const id of mk15) {
      const bare = BARE_MAGNETS.find((m) => m.id === id);
      if (bare) expect(bare.shape).toBe("block");
    }
    expect(magnetOptionsFor("MK03")).toContain("M03");
  });

  it("garde lisible un choix historique sans le reproposer", () => {
    expect(magnetOptionsFor("MK04", undefined, "M02")).toContain("M02");
    expect(magnetOptionsFor("MK04")).not.toContain("M02");
    expect(isOutsidePolicy("MK04", "M02")).toBe(true);
    expect(isOutsidePolicy("MK02", "M02")).toBe(false);
  });
});

describe("défaut économique — matériau toujours explicable", () => {
  it("donne le standard économique du guide, jamais 4003004003, aux capteurs sans couple dédié", () => {
    for (const s of ["MK14", "MK18", "MK20_1"]) {
      expect(defaultMagnetFor(s)).toBe("ALNICO500-4X19");
      expect(guideMagnetMaterial(defaultMagnetFor(s))).toBe("AlNiCo");
    }
    expect(defaultMagnetFor("MK15")).toBe("HF3225-14.95X10X5");
    expect(guideMagnetMaterial(defaultMagnetFor("MK15"))).toBe("Ferrite");
  });

  it("préserve les couples dédiés", () => {
    expect(defaultMagnetFor("MK02")).toBe("M02");
    expect(defaultMagnetFor("MK04")).toBe("M04");
    expect(defaultMagnetFor("MK03")).toBe("M03");
  });

  it("garde 4003004003 consultable en option cylindrique, sans en faire un AlNiCo500", () => {
    const opts = magnetOptionsFor("MK14");
    expect(opts).toContain("4003004003");
    expect(opts.indexOf("ALNICO500-4X19")).toBeLessThan(opts.indexOf("4003004003"));
    expect(guideMagnetMaterial("4003004003")).not.toBe("AlNiCo");
  });
});
