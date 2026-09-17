import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_WORKSHOP, pairDemonstration, parseWorkshopConfig, type WorkshopConfig } from "../src/lib/standex/magnetic-workshop";
import { workshopGuideRange, onDocumentedPosition, GUIDE_SIMULATION_NOTE } from "../src/lib/standex/workshop-guide";
import { guideIllustrativeMarks } from "../src/lib/standex/activation-guide";
import { mountingFromWorkshop, scenePoseSampler } from "../src/lib/standex/mounting/bridge";
import { simulateMounting } from "../src/lib/standex/mounting/simulate";
import { ResultView } from "../src/components/leadmagnet/result-view";
import { createDossier } from "../src/lib/leadmagnet/dossier";
import { buildDossierExport, parseDossierExport } from "../src/lib/leadmagnet/dossier-io";
import type { TestedPair } from "../src/lib/leadmagnet/tested-pairs";
const magnet = "HF3225-14.95X10X5";
const noop = () => {};
const render = (p: TestedPair) => renderToStaticMarkup(<ResultView pair={p} tested={[p]} proposals={[]} detectionGoal={null} onSeePairs={noop} onConfirmWithStandex={noop} onRequestTrial={noop} onReplaceMagnet={noop} onTestPair={noop} />);
const entry = (c: WorkshopConfig): TestedPair => ({ sensorId: c.sensorId, magnetId: c.magnetModel, approach: c.geometry, sensitivity: null, verdict: "unpublished", pullInMm: null, dropOutMm: null, travelStartMm: c.start, travelEndMm: c.end, mainMessage: GUIDE_SIMULATION_NOTE, limits: [], illustrative: true, guideReference: workshopGuideRange(c)?.sensorReference ?? null, documentedPosition: onDocumentedPosition(c), at: "2026-09-17T10:00:00Z" });
describe("guide source across workshop, result and reopening", () => {
  for (const [sensorId, far] of [["MK15", 20.1], ["MK16", 19.8]] as const) {
    test(`${sensorId}: exact ferrite range and no redundant return-to-position action`, () => {
      const c = pairDemonstration(DEFAULT_WORKSHOP, sensorId, magnet);
      const r = workshopGuideRange(c)!;
      expect([r.upMm, r.toMm, r.page]).toEqual([15.4, far, 35]);
      const html = render(entry(c));
      expect(html).toContain("Votre couple dispose de données documentées.");
      expect(html).not.toContain("Les distances de ce couple ne sont pas publiées.");
      expect(html).not.toContain("distance non caractérisée");
      expect(html).not.toContain("Revenir à une position documentée");
      expect(html).toContain(r.sensorReference);
      expect(entry(c).pullInMm).toBeNull();
    });
  }
  test("D3 survives dossier round trip and uses its own range beyond 20 mm", () => {
    const c: WorkshopConfig = { ...pairDemonstration(DEFAULT_WORKSHOP, "MK16", magnet), geometry: "D3", guideReference: "MK16-B-X" };
    const marks = guideIllustrativeMarks(workshopGuideRange(c));
    expect(marks).toEqual({ nearMm: 15.8, farMm: 22.7 });
    expect(parseWorkshopConfig(c)?.guideReference).toBe("MK16-B-X");
    const dossier = { ...createDossier(), workshop: c, testedPairs: [entry(c)] };
    const restored = parseDossierExport(JSON.parse(JSON.stringify(buildDossierExport(dossier))));
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(workshopGuideRange(restored.dossier.workshop!)?.toMm).toBe(22.7);
    expect(restored.dossier.testedPairs?.[0]?.guideReference).toBe("MK16-B-X");
    const sim = simulateMounting(mountingFromWorkshop(c), 600, undefined, scenePoseSampler(c), marks);
    expect(sim.illustrative).toBe(true);
    expect(sim.pullInMm).toBeNull();
    expect(sim.samples.some(s => s.contact === "closed")).toBe(true);
    const returningBeyond20 = sim.samples.filter(s => s.outward && s.separationMm > 20 && s.separationMm < 22.7);
    expect(returningBeyond20.length).toBeGreaterThan(0);
    expect(returningBeyond20.every(s => s.contact === "closed")).toBe(true);
  });
  test("shifted pose offers replacement, material changes never reuse ferrite distances", () => {
    const c = pairDemonstration(DEFAULT_WORKSHOP, "MK15", magnet);
    expect(render(entry({ ...c, lateralShift: 10 }))).toContain("Revenir à une position documentée");
    expect(workshopGuideRange({ ...c, magnetModel: "NDFEB-10X5X1.9" })?.toMm).toBe(13.9);
    expect(workshopGuideRange({ ...c, geometry: "F1" })).toBeNull();
    expect(workshopGuideRange({ ...c, sensorId: "MK27", magnetModel: "M27" })).toBeNull();
  });
});
