import { describe, expect, it } from "bun:test";
import {
  ACTIVATION_GUIDE,
  formatGuideBound,
  guideApproachesFor,
  guideEconomicalMagnet,
  guideMagnetsFor,
  guideMaterialsFor,
  guideRange,
  guideRangesFor,
  hasGuideData,
  readActivationGuide,
} from "@/lib/standex/activation-guide";
import { BARE_MAGNETS } from "@/lib/standex/magnet-catalog";

/**
 * Le guide d'activation est une source PLAGES : ces tests vérifient la fidélité
 * de la transcription et refusent toute assimilation à des seuils.
 */
describe("guide d'activation — transcription", () => {
  it("publie sa source exacte", () => {
    expect(ACTIVATION_GUIDE.source.url).toBe(
      "https://standexdetect.com/wp-content/uploads/sites/2/2025/10/brochure-reed-sensor-activation-guide.pdf",
    );
    expect(ACTIVATION_GUIDE.source.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(ACTIVATION_GUIDE.rows.length).toBe(3004);
  });

  it("ne contient aucune ligne en double contradictoire", () => {
    const seen = new Map<string, string>();
    for (const r of ACTIVATION_GUIDE.rows) {
      const key = [r.sensorReference, r.magnetId, r.approachId].join("|");
      const value = String(r.upMm) + "/" + String(r.toMm);
      if (seen.has(key)) expect(seen.get(key)).toBe(value);
      seen.set(key, value);
    }
    expect(seen.size).toBe(ACTIVATION_GUIDE.rows.length);
  });

  it("garde des bornes finies, positives ou explicitement non publiées", () => {
    for (const r of ACTIVATION_GUIDE.rows) {
      if (r.upMm !== null) expect(Number.isFinite(r.upMm)).toBe(true);
      if (r.upMm !== null) expect(r.upMm).toBeGreaterThanOrEqual(0);
      if (r.toMm !== null) expect(r.toMm).toBeGreaterThanOrEqual(0);
      if (r.upMm === null) expect(r.upNote).toBeDefined();
      if (r.toMm === null) expect(r.toNote).toBeDefined();
    }
  });

  it("conserve les colonnes « up » et « to » dans l'ordre imprimé, même décroissant", () => {
    // Page 12 : la colonne « to » est inférieure à « up ». Ce sont deux colonnes
    // distinctes, pas un intervalle trié : la ligne est conservée telle quelle.
    expect(guideRange("MK04", "MK04-1A66A-X", "SMCO5-5X4", "D3")).toMatchObject({
      upMm: 10.3,
      toMm: 8.2,
      page: 12,
    });
    const decreasing = ACTIVATION_GUIDE.rows.filter(
      (r) => r.upMm !== null && r.toMm !== null && r.toMm < r.upMm,
    );
    expect(decreasing.length).toBeGreaterThan(0);
  });

  it("transcrit les 751 couples référence + aimant de l'extraction, sans doublon", () => {
    const pairs = new Set(
      ACTIVATION_GUIDE.rows.map((r) => r.sensorReference + "|" + r.magnetId),
    );
    expect(pairs.size).toBe(751);
    expect(ACTIVATION_GUIDE.rows.length).toBe(3004);
    expect(
      ACTIVATION_GUIDE.rows.every((r) => /^MK[0-9]/.test(r.sensorReference)),
    ).toBe(true);
  });

  it("reprend les valeurs exactes de la brochure pour MK15-B", () => {
    // Vérification demandée : ferrite 15,4–20,1 contre NdFeB 10,2–13,9 en D1.
    expect(guideRange("MK15", "MK15-B-X", "HF3225-14.95X10X5", "D1")).toMatchObject({
      upMm: 15.4,
      toMm: 20.1,
      page: 35,
    });
    expect(guideRange("MK15", "MK15-B-X", "NDFEB-10X5X1.9", "D1")).toMatchObject({
      upMm: 10.2,
      toMm: 13.9,
    });
    expect(guideRange("MK06-4", "MK06-4-B", "HF3225-14.95X10X5", "D1")).toMatchObject({
      upMm: 14.7,
      toMm: 18.3,
    });
  });

  it("ne renvoie rien pour une combinaison absente au lieu d'extrapoler", () => {
    expect(guideRange("MK15", "MK15-B-X", "HF3225-14.95X10X5", "D2")).toBeNull();
    expect(guideRange("MK15", "MK15-ZZ", "HF3225-14.95X10X5", "D1")).toBeNull();
    expect(guideRangesFor("MK27", "HF3225-14.95X10X5")).toHaveLength(0);
    expect(hasGuideData("MK27")).toBe(false);
    expect(hasGuideData("MK15")).toBe(true);
  });
});

describe("guide d'activation — matériaux exploitables dans l'atelier", () => {
  it("couvre ferrite, NdFeB, AlNiCo et SmCo pour MK15 et MK03", () => {
    for (const family of ["MK15", "MK03"]) {
      const materials = guideMaterialsFor(family).map((m) => m.material);
      expect(materials).toContain("Ferrite");
      expect(materials).toContain("NdFeB");
      expect(materials).toContain("SmCo");
      if (family === "MK03") expect(materials).toContain("AlNiCo");
    }
  });

  it("chaque aimant du guide est une vraie référence du catalogue, avec ses cotes", () => {
    for (const magnet of guideMagnetsFor("MK03")) {
      const catalog = BARE_MAGNETS.find((m) => m.id === magnet.id);
      expect(catalog).toBeDefined();
      expect(catalog!.shape).toBe(magnet.shape);
      expect(catalog!.material).toBe(magnet.material);
      expect(catalog!.moment).toBe(magnet.momentE6Vscm);
      expect(magnet.body).toEqual(catalog!.body);
      expect(magnet.body!.every((v) => Number.isFinite(v) && v > 0)).toBe(true);
    }
  });

  it("blocs et cylindres respectent la forme publiée", () => {
    expect(guideMagnetsFor("MK15").find((m) => m.id === "HF3225-14.95X10X5")!.shape).toBe("block");
    expect(guideMagnetsFor("MK03").find((m) => m.id === "ALNICO500-5.5X22")!.shape).toBe("cylinder");
  });

  it("le défaut économique est un bloc ferrite, jamais du SmCo", () => {
    const eco = guideEconomicalMagnet("MK15");
    expect(eco!.id).toBe("HF3225-14.95X10X5");
    expect(eco!.material).toBe("Ferrite");
    for (const family of ["MK03", "MK04", "MK15", "MK16", "MK17", "MK06-4"])
      expect(guideEconomicalMagnet(family)!.material).not.toBe("SmCo");
  });

  it("les approches proviennent des colonnes réellement imprimées", () => {
    expect(guideApproachesFor("MK15", "HF3225-14.95X10X5")).toEqual(["D1", "D3", "D4", "D5"]);
  });
});

describe("guide d'activation — lecture défensive", () => {
  const magnets = [
    { id: "X", label: "X", material: "Ferrite", shape: "block", momentE6Vscm: 1 },
  ];
  const base = { version: "v", source: {}, magnets };
  const row = { page: 1, sensorFamily: "MK15", sensorReference: "MK15-B-X", magnetId: "X", approachId: "D1" };

  it("écarte une borne négative, un aimant inconnu, une approche invalide et un doublon", () => {
    const guide = readActivationGuide({
      ...base,
      rows: [
        { ...row, magnetId: "ZZ", upMm: 1, toMm: 2 },
        { ...row, approachId: "D9", upMm: 1, toMm: 2 },
        { ...row, upMm: -1, toMm: 2 },
        { ...row, upMm: 1, toMm: -2 },
        { ...row, upMm: 5, toMm: 4 },
        { ...row, upMm: 3, toMm: 9 },
      ],
    });
    // La ligne « up 5 / to 4 » est CONSERVÉE : deux colonnes, pas un intervalle.
    expect(guide.rows).toHaveLength(1);
    expect(guide.rows[0]).toMatchObject({ upMm: 5, toMm: 4 });
  });

  it("transforme une valeur non finie en borne non publiée sans inventer zéro", () => {
    const guide = readActivationGuide({
      ...base,
      rows: [{ ...row, upMm: Number.NaN, toMm: null, upNote: "not_published", toNote: "not_published" }],
    });
    expect(guide.rows[0]!.upMm).toBeNull();
    expect(guide.rows[0]!.upNote).toBe("not_published");
    expect(formatGuideBound(null, "not_published")).toBe("—");
    expect(formatGuideBound(null, "below_zero")).toBe("<0");
    expect(formatGuideBound(15.4, undefined)).toBe("15,4");
  });

  it("renvoie un guide vide sur une entrée corrompue", () => {
    expect(readActivationGuide(null).rows).toHaveLength(0);
    expect(readActivationGuide({ version: 2 }).rows).toHaveLength(0);
  });
});
