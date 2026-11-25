import { describe, expect, test } from "bun:test";
import { INITIAL_CONTEXT, INITIAL_CONFIGURATION, assessConfiguration, architectureFamily, contextErrors,
  configurationIssues, createLevelBrief, illustrativeReading, requestedFloats, setPointCount } from "../src/lib/level/configuration";

describe("level journey prototype guards", () => {
  const water = { ...INITIAL_CONTEXT, fluid: "water" as const, temperatureMin: "10", temperatureMax: "25" };
  test("temperature edits immediately remove the unsupported LS01 without qualification", () => {
    expect(assessConfiguration(water, INITIAL_CONFIGURATION).selected?.family).toBe("LS01");
    const hot = assessConfiguration({ ...water, temperatureMax: "90" }, INITIAL_CONFIGURATION);
    expect(hot.candidates.find(c => c.family === "LS01")?.status).toBe("excluded");
    expect(hot.selected?.family).toBe("LS05");
    expect(hot.selected?.status).toBe("study");
  });
  test("LS05 160/200 conflict is preserved and no 200 °C rating invented", () => {
    const result = assessConfiguration({ ...water, temperatureMax: "180" }, INITIAL_CONFIGURATION);
    expect(result.selected?.reasons.join(" ")).toContain("confirmer");
    expect(assessConfiguration({ ...water, temperatureMax: "220" }, INITIAL_CONFIGURATION).selected).toBeNull();
  });
  test("missing and invalid temperatures do not become a positive compatibility", () => {
    expect(assessConfiguration(INITIAL_CONTEXT, INITIAL_CONFIGURATION).selected?.reasons.length).toBeGreaterThan(0);
    expect(contextErrors({ ...water, temperatureMin: "90" }).length).toBe(1);
    expect(assessConfiguration({ ...water, temperatureMin: "90" }, INITIAL_CONFIGURATION).selected).toBeNull();
  });
  test("wet cable remains a specific request including a DK configuration", () => {
    const result = assessConfiguration({ ...water, cableExposure: "wet" }, { ...INITIAL_CONFIGURATION, orientation: "horizontal", connection: "DK" });
    expect(result.specific).toBe(true);
    expect(result.selected?.reasons.join(" ")).toContain("Câble immergé");
  });
  test("number of floats is independent of number of switching points", () => {
    const four = setPointCount({ ...INITIAL_CONFIGURATION, reachMm: 90 }, 4);
    expect(requestedFloats(four)).toBe(2);
    expect(illustrativeReading(four, 0).zone).toBe(0);
    expect(illustrativeReading(four, 100).zone).toBe(4);
    expect(requestedFloats({ ...four, pointsPerFloat: 1 })).toBe(4);
  });
  test("orientation and length select architectures without silently changing the requested mode", () => {
    expect(architectureFamily({ ...INITIAL_CONFIGURATION, reachMm: 50 })).toBe("LS02");
    expect(architectureFamily({ ...INITIAL_CONFIGURATION, reachMm: 130 })).toBe("LS04");
    expect(architectureFamily({ ...INITIAL_CONFIGURATION, reachMm: 300 })).toBe("LS05");
    const c = { ...INITIAL_CONFIGURATION, mode: "continuous" as const, orientation: "horizontal" as const };
    expect(assessConfiguration(water, c).selected).toBeNull();
    expect(configurationIssues(c).length).toBeGreaterThan(0);
    expect(c.mode).toBe("continuous");
  });
  test("out-of-order or out-of-reach points invalidate the illustrative signal", () => {
    const c = { ...INITIAL_CONFIGURATION, count: 2, pointsMm: [90, 20] };
    expect(illustrativeReading(c, 80).usable).toBe(false);
    expect(configurationIssues(c).length).toBe(2);
  });
  test("custom brief keeps constraints and never claims submission", () => {
    const c = { ...INITIAL_CONFIGURATION, custom: true, customDescription: "Corps coudé pour cuve étroite" };
    const brief = createLevelBrief(water, c, { lengthMm: "500", connector: "à définir" }, {});
    expect(brief.status).toBe("draft_not_submitted");
    expect(brief.study_family).toBeNull();
    expect(brief.specific_request).toBe(true);
    expect(brief.requested_configuration.customDescription).toContain("coudé");
    expect(brief.context.fluid).toBe("water");
  });
  test("permanent body immersion does not silently mean a wet cable", () => {
    const result = assessConfiguration({ ...water, bodyExposure: "permanent", cableExposure: "dry" }, INITIAL_CONFIGURATION);
    expect(result.selected?.reasons.join(" ")).toContain("Immersion permanente");
    expect(result.specific).toBe(false);
    expect(result.selected?.status).toBe("study");
  });
  test("a stem crossing the tank floor has no illustrative signal and remains in the brief", () => {
    const c = { ...INITIAL_CONFIGURATION, reachMm: 150, tankHeightMm: 100 };
    expect(illustrativeReading(c, 50).usable).toBe(false);
    const brief = createLevelBrief(water, c, { lengthMm: "", connector: "" }, {});
    expect(brief.specific_request).toBe(true);
    expect(brief.requested_configuration.reachMm).toBe(150);
  });
  test("a nearby standard length never silently becomes the requested dimension", () => {
    const c = { ...INITIAL_CONFIGURATION, reachMm: 50 };
    const result = assessConfiguration(water, c);
    expect(result.selected?.family).toBe("LS02");
    expect(result.selected?.reasons.join(" ")).toContain("56 mm");
    expect(c.reachMm).toBe(50);
  });
});
