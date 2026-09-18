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
