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

describe("guide — alias de famille documentés seulement", () => {
  it("résout MK06 vers la famille imprimée MK06-4 et laisse MK06-4 inchangée", () => {
    expect(guideFamilyFor("MK06-4")).toBe("MK06-4");
    expect(guideFamilyFor("MK06")).toBe("MK06-4");
    expect(hasGuideData("MK06")).toBe(true);
    expect(guideRange("MK06", "MK06-4-B", "HF3225-14.95X10X5", "D1")).not.toBeNull();
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
