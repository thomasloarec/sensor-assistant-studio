import { describe, expect, test } from "bun:test";
import { INITIAL_CONTEXT, INITIAL_CONFIGURATION, architectureFamily, assessConfiguration, configurationIssues,
  floatCentres, horizontalFloatPosition, illustrativeReading, proposedContactForm, setDetectionGoal,
  setMounting, setTravelPreference, verticalMechanics, createLevelBrief } from "../src/lib/level/configuration";
import { seedConfiguration, intakeErrors, intakeKey } from "../src/lib/level/intake";
import { configurationGuidance, applyRemedy } from "../src/lib/level/guidance";

describe("level intent, mounting and a shared float/signal model", () => {
  test("high and low intent derive B/A on an upright compact; low lowers the support, not the sensor orientation", () => {
    const high = seedConfiguration({ ...INITIAL_CONTEXT, mountingAccess: "free", tankHeight: "180", detectionGoal: "high" });
    const low = seedConfiguration({ ...INITIAL_CONTEXT, mountingAccess: "free", tankHeight: "180", detectionGoal: "low", detectionHeight: "30" });
    expect(high.mounting).toBe("support"); expect(low.mounting).toBe("support");
    expect(architectureFamily(low)).toBe("LS01");
    expect(low.mountingHeightMm).toBe(47.5); expect(high.mountingHeightMm).toBe(180);
    expect(proposedContactForm(high, "LS01")).toBe("B"); expect(proposedContactForm(low, "LS01")).toBe("A");
    expect(illustrativeReading(high, 0).active).toBe(false); expect(illustrativeReading(low, 0).active).toBe(true);
  });
  test("long travel is an explicit requirement rather than a tank-size heuristic", () => {
    const short = seedConfiguration({ ...INITIAL_CONTEXT, mountingAccess: "free", tankHeight: "180", detectionGoal: "high", responsePriority: "limit" });
    const long = setTravelPreference(short, "long");
    expect(architectureFamily(short)).toBe("LS01"); expect(architectureFamily(long)).toBe("LS02");
    const a = verticalMechanics(short).floats[0]!, b = verticalMechanics(long).floats[0]!;
    expect(a.upperMm - a.lowerMm).toBe(10.5); expect(b.upperMm - b.lowerMm).toBe(34);
    expect(short.pointsMm).toEqual(long.pointsMm);
    expect(configurationIssues(setDetectionGoal(long, "low"))).toEqual([]);
  });
  test("top-only opening plus low detection uses a long LS04 stem and fixed local stops", () => {
    const c = seedConfiguration({ ...INITIAL_CONTEXT, mountingAccess: "top", tankHeight: "180", detectionGoal: "low", detectionHeight: "30" });
    expect(architectureFamily(c)).toBe("LS04"); expect(c.mounting).toBe("top");
    expect(c.reachMm).toBe(173); expect(configurationIssues(c)).toEqual([]);
    const range = verticalMechanics(c).floats[0]!;
    expect(range.lowerMm).toBe(26); expect(range.upperMm).toBe(36.5);
    expect(floatCentres(c, 180)).toEqual([36.5]); expect(floatCentres(c, 0)).toEqual([26]);
    expect(proposedContactForm(c, "LS04")).toBeNull();
    const wider = { ...c, floatTravelMm: 20 };
    expect(verticalMechanics(wider).floats[0]!.upperMm).toBe(46);
  });
  test("filling and draining never activate high detection before the float reaches its upper stop", () => {
    for (const access of ["free", "top", "bottom"] as const) for (const priority of ["limit", "movement"] as const)
      for (const goal of ["high", "low"] as const) {
        const c = seedConfiguration({ ...INITIAL_CONTEXT, mountingAccess: access, tankHeight: "180", detectionGoal: goal, responsePriority: priority });
        expect(configurationIssues(c)).toEqual([]);
        const range = verticalMechanics(c).floats[0]!;
        for (const delta of [-.1, 0, .1]) {
          const p = c.pointsMm[0]!, reading = illustrativeReading(c, p + delta);
          expect(reading.switchingHeightMm).toBe(p);
          expect(reading.active).toBe(goal === "high" ? delta >= 0 : delta <= 0);
          expect(reading.floatCentreMm).toBe(floatCentres(c, p + delta)[0]!);
          if (reading.active) expect(reading.floatCentreMm).toBe(goal === "high" ? range.upperMm : range.lowerMm);
        }
        for (let level = 0; level <= 180; level += .5) {
          const up = illustrativeReading(c, level), down = illustrativeReading(c, 180 - level);
          for (const reading of [up, down]) if (reading.active)
            expect(reading.floatCentreMm).toBe(goal === "high" ? range.upperMm : range.lowerMm);
        }
      }
  });
  test("bottom insertion is explicit and has no unverified product form", () => {
    const c = seedConfiguration({ ...INITIAL_CONTEXT, mountingAccess: "bottom", detectionGoal: "low" });
    expect(c.mounting).toBe("bottom"); expect(verticalMechanics(c).datumMm).toBe(0);
    expect(proposedContactForm(c, "LS01")).toBeNull();
    expect(assessConfiguration(INITIAL_CONTEXT, c).selected?.reasons.join(" ")).toContain("Pose par le fond");
    expect(setMounting(INITIAL_CONFIGURATION, "bottom").mounting).toBe("bottom");
    const brief = createLevelBrief(INITIAL_CONTEXT, c, { lengthMm: "", connector: "" }, {});
    expect(brief.proposed_contact_form).toBeNull(); expect(brief.requested_configuration.mounting).toBe("bottom");
  });
  test("horizontal high and low readings switch at the start of the requested pivot", () => {
    for (const goal of ["high", "low"] as const) {
      const c = seedConfiguration({ ...INITIAL_CONTEXT, mountingAccess: "side", detectionGoal: goal });
      expect(configurationIssues(c)).toEqual([]);
      for (const delta of [-30, -1, -.01, 0, .01, 1, 30]) {
        const level = c.pointsMm[0]! + delta, pos = horizontalFloatPosition(c, level);
        const reading = illustrativeReading(c, level);
        expect(reading.active).toBe(goal === "high" ? delta >= 0 : delta <= 0);
        expect(reading.pointStates[0]!.active).toBe(reading.active);
        if (delta === 0) expect(pos).toBeCloseTo(goal === "high" ? 0 : 1);
        if ((goal === "high" && delta === .01) || (goal === "low" && delta === -.01)) {
          expect(reading.active).toBe(true);
          expect(pos).toBeGreaterThan(0); expect(pos).toBeLessThan(1);
        }
      }
    }
  });
  test("impossible requested positions are retained and the offered repair actually changes the invalid geometry", () => {
    for (const access of ["top", "free", "bottom"] as const) for (const goal of ["high", "low"] as const)
      for (const detectionHeight of ["0", "60"]) {
        const c = seedConfiguration({ ...INITIAL_CONTEXT, mountingAccess: access, tankHeight: "60", detectionGoal: goal, detectionHeight });
        expect(c.pointsMm).toEqual([Number(detectionHeight)]);
        const family = assessConfiguration(INITIAL_CONTEXT, c).selected?.family;
        expect(configurationIssues(c, family).length).toBeGreaterThan(0);
        const guide = configurationGuidance(INITIAL_CONTEXT, c, family)!;
        const fixed = applyRemedy(c, guide.actions[0]!);
        expect(configurationIssues(fixed)).toEqual([]);
      }
  });
  test("intake rejects invalid dimensions and only geometry answers invalidate the seed", () => {
    expect(intakeErrors({ ...INITIAL_CONTEXT, tankHeight: "40" })).toHaveLength(1);
    expect(intakeErrors({ ...INITIAL_CONTEXT, tankHeight: "180", detectionGoal: "low", detectionHeight: "190" })).toHaveLength(1);
    expect(intakeErrors(INITIAL_CONTEXT)).toEqual([]);
    expect(intakeKey({ ...INITIAL_CONTEXT, temperatureMax: "120", purpose: "Free prose" })).toBe(intakeKey(INITIAL_CONTEXT));
    expect(intakeKey({ ...INITIAL_CONTEXT, mountingAccess: "top" })).not.toBe(intakeKey(INITIAL_CONTEXT));
  });
});
