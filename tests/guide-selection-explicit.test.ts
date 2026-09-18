import { describe, expect, test } from "bun:test";
import { pairCardFor } from "../src/lib/leadmagnet/pair-cards";
import { sensorById } from "../src/lib/standex/sensor-catalog";
import {
  defaultGuideSelection,
  guideSelectionFor,
} from "../src/lib/standex/activation-guide";
import {
  DEFAULT_WORKSHOP,
  pairDemonstration,
  parseWorkshopConfig,
  type WorkshopConfig,
} from "../src/lib/standex/magnetic-workshop";
import { workshopGuideRange } from "../src/lib/standex/workshop-guide";
import { guideIllustrativeMarks } from "../src/lib/standex/activation-guide";
import { mountingFromWorkshop, scenePoseSampler } from "../src/lib/standex/mounting/bridge";
import { ILLUSTRATIVE_FAR_MM, illustrativeMarks, simulateMounting } from "../src/lib/standex/mounting/simulate";
import { createDossier } from "../src/lib/leadmagnet/dossier";
import { buildDossierExport, parseDossierExport } from "../src/lib/leadmagnet/dossier-io";

const FERRITE = "HF3225-14.95X10X5";

describe("guide variant and approach stay explicit from card to dossier", () => {
  for (const [sensorId, up, to] of [
    ["MK15", 15.4, 20.1],
    ["MK16", 15.4, 19.8],
  ] as const) {
    test(`${sensorId} card carries the documented range of the row it will open`, () => {
      const card = pairCardFor(sensorById(sensorId));
      expect(card.magnetId).toBe(FERRITE);
      expect(card.hasGuideRange).toBe(true);
      expect([card.guideReference, card.guideApproach]).toEqual([`${sensorId}-B-X`, "D1"]);
      expect([card.guideUpMm, card.guideToMm]).toEqual([up, to]);
      // Le couple ouvert par « Tester ce couple » lit EXACTEMENT la même ligne.
      const config = pairDemonstration(DEFAULT_WORKSHOP, sensorId, FERRITE);
      expect(config.guideReference).toBe(card.guideReference);
      const row = workshopGuideRange(config)!;
      expect([row.sensorReference, row.approachId, row.upMm, row.toMm]).toEqual([
        card.guideReference!,
        "D1",
        up,
        to,
      ]);
    });
  }

  test("no implicit fall back to the first printed row", () => {
    const config = pairDemonstration(DEFAULT_WORKSHOP, "MK15", FERRITE);
    // Sans variante enregistrée, aucune plage n'est inventée.
    expect(workshopGuideRange({ ...config, guideReference: null })).toBeNull();
    // Une variante qui ne publie pas cette approche ne glisse pas vers une autre.
    expect(workshopGuideRange({ ...config, geometry: "F1" })).toBeNull();
  });

  test("a non-default variant and another approach survive export and reopening", () => {
    const base = pairDemonstration(DEFAULT_WORKSHOP, "MK15", FERRITE);
    const chosen = guideSelectionFor("MK15", FERRITE, "D3", "MK15-C-X")!;
    expect([chosen.reference, chosen.range.upMm, chosen.range.toMm]).toEqual([
      "MK15-C-X",
      12.9,
      15.7,
    ]);
    const config: WorkshopConfig = { ...base, geometry: "D3", guideReference: "MK15-C-X" };
    expect(workshopGuideRange(config)?.toMm).toBe(15.7);
    expect(parseWorkshopConfig(config)?.guideReference).toBe("MK15-C-X");
    const dossier = { ...createDossier(), workshop: config };
    const restored = parseDossierExport(JSON.parse(JSON.stringify(buildDossierExport(dossier))));
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    const reopened = restored.dossier.workshop!;
    expect([reopened.guideReference, reopened.geometry]).toEqual(["MK15-C-X", "D3"]);
    expect(workshopGuideRange(reopened)?.toMm).toBe(15.7);
  });

  test("default selection prefers D1 and never picks an unpublished couple", () => {
    expect(defaultGuideSelection("MK16", FERRITE)?.approachId).toBe("D1");
    expect(defaultGuideSelection("MK27", "M27")).toBeNull();
    const card = pairCardFor(sensorById("MK27"));
    expect([card.guideReference, card.guideUpMm, card.hasGuideRange]).toEqual([null, null, false]);
  });
});

describe("chosen guide bounds drive the illustrative animation, uncapped", () => {
  const sim = (c: WorkshopConfig) => {
    const marks = guideIllustrativeMarks(workshopGuideRange(c));
    return {
      marks,
      out: simulateMounting(mountingFromWorkshop(c), 900, undefined, scenePoseSampler(c), marks),
    };
  };

  test("MK15-B-X D1 stays closed up to 20.1 mm: no generic 20 mm truncation", () => {
    const c = pairDemonstration(DEFAULT_WORKSHOP, "MK15", FERRITE);
    const { marks, out } = sim(c);
    expect(marks).toEqual({ nearMm: 15.4, farMm: 20.1 });
    expect(out.illustrative).toBe(true);
    // Une plage publiée n'est jamais un seuil de commutation.
    expect([out.pullInMm, out.dropOutMm]).toEqual([null, null]);
    const between = out.samples.filter(
      (s) => s.outward && s.separationMm > ILLUSTRATIVE_FAR_MM && s.separationMm < 20.1,
    );
    expect(between.length).toBeGreaterThan(0);
    expect(between.every((s) => s.contact === "closed")).toBe(true);
  });

  test("MK16-B-X D3 reads its own 22.7 mm bound", () => {
    const c: WorkshopConfig = {
      ...pairDemonstration(DEFAULT_WORKSHOP, "MK16", FERRITE),
      geometry: "D3",
      guideReference: "MK16-B-X",
    };
    const { marks, out } = sim(c);
    expect(marks).toEqual({ nearMm: 15.8, farMm: 22.7 });
    const between = out.samples.filter(
      (s) => s.outward && s.separationMm > 20 && s.separationMm < 22.7,
    );
    expect(between.length).toBeGreaterThan(0);
    expect(between.every((s) => s.contact === "closed")).toBe(true);
  });

  test("a shorter published bound is not stretched to the generic 20 mm", () => {
    const c: WorkshopConfig = {
      ...pairDemonstration(DEFAULT_WORKSHOP, "MK15", "NDFEB-10X5X1.9"),
    };
    const { marks, out } = sim(c);
    expect(marks?.farMm).toBe(13.9);
    expect(
      out.samples.filter((s) => s.separationMm > 13.9).every((s) => s.contact !== "closed"),
    ).toBe(true);
  });

  test("without any published range the generic 15 / 18 / 20 mm reading applies", () => {
    const c: WorkshopConfig = { ...pairDemonstration(DEFAULT_WORKSHOP, "MK15", FERRITE), guideReference: null };
    expect(workshopGuideRange(c)).toBeNull();
    const { marks, out } = sim(c);
    expect(marks).toBeNull();
    expect(illustrativeMarks(marks)).toEqual([15, 18]);
    expect(out.samples.filter((s) => s.separationMm > 20).every((s) => s.contact !== "closed")).toBe(true);
  });

  test("D4 and D5 stay consultation only: the workshop geometry is D1, D3 or F1", () => {
    const c = pairDemonstration(DEFAULT_WORKSHOP, "MK15", FERRITE);
    expect(["D1", "D3", "F1"]).toContain(c.geometry);
    // Une approche non dessinée ne peut pas être stockée comme géométrie.
    expect(parseWorkshopConfig({ ...c, geometry: "D5" })?.geometry).not.toBe("D5");
    // Et changer D1 -> D3 change la ligne lue ET la géométrie effective.
    const d3: WorkshopConfig = { ...c, geometry: "D3", guideReference: "MK15-B-X" };
    expect(workshopGuideRange(d3)?.approachId).toBe("D3");
    expect(mountingFromWorkshop(d3).couple.approachId).toBe("D3");
    expect(mountingFromWorkshop(c).couple.approachId).toBe("D1");
  });
});
