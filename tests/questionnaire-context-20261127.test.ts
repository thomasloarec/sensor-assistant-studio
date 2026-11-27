import { describe, expect, test } from "bun:test";
import fixture from "./fixtures/questionnaire-104-20261127.json";
import { assessApplicationFit, VALIDATION_POINT } from "@/lib/leadmagnet/application-fit";
import {
  explicitGapsMm,
  signalVoltageV,
  CONTACT_REVIEW,
  QUALIFICATION_REVIEW,
  INCOMPLETE_REVIEW,
  REMOTE_MAGNET_REVIEW,
  pairGapWarning,
} from "@/lib/leadmagnet/requirement-context";
import { evaluateCandidates } from "@/lib/leadmagnet/candidates";
import { suggestionFilters, blockedBy } from "@/lib/leadmagnet/suggestion-filters";
import { rankSuggestions, suggestedOrder } from "@/lib/leadmagnet/suggestion-ranking";
import { pairCards } from "@/lib/leadmagnet/pair-cards";
import { thermalWarning } from "@/lib/leadmagnet/thermal-fit";
import { sensorById } from "@/lib/standex/sensor-catalog";
import type { Requirement, MountingChoice } from "@/lib/leadmagnet/dossier";

const keys = [
  "detection_goal",
  "target_object",
  "states_motion",
  "mounting",
  "electrical",
  "environment",
];
const scenarios = fixture.tests.filter((r) => r.id.startsWith("S"));
const blocking = new Set([
  1, 4, 5, 7, 9, 18, 21, 22, 24, 25, 27, 31, 33, 35, 42, 43, 44, 45, 46, 47, 49, 66, 67, 84, 86, 87,
  90, 91, 94,
]);
function replay(row: (typeof scenarios)[number]) {
  const requirements: Requirement[] = row.answers.map((value, i) => ({
    key: keys[i]!,
    value,
    state: "confirmed",
    source: "client",
  }));
  let mounting: MountingChoice = { kind: "undecided" };
  const button = "mount" in row ? String(row.mount) : "";
  if (button.includes("Corps fileté")) mounting = { kind: "screw", style: "threaded_body" };
  else if (button.includes("Collerette")) mounting = { kind: "screw", style: "screw_fixed" };
  else if (button.includes("Emboîtement")) mounting = { kind: "press_fit", holeDiameterMm: 0 };
  else if (button.includes("traversant")) mounting = { kind: "pcb_through_hole" };
  else if (button.includes("CMS")) mounting = { kind: "pcb_smd" };
  else if (button.includes("Autre")) mounting = { kind: "other", description: "" };
  const dims = "dims" in row ? (row.dims as string[]) : [];
  const numeric = (s?: string) =>
    s && Number.isFinite(Number(s.replace(",", "."))) ? Number(s.replace(",", ".")) : null;
  const envelope = {
    lengthMm: numeric(dims[0]),
    widthMm: numeric(dims[1]),
    heightMm: numeric(dims[2]),
  };
  const fit = assessApplicationFit(requirements, "", {
    mountingChosen: mounting.kind !== "undecided",
    envelopeSet: Object.values(envelope).some((n) => n !== null),
    invalidDimensions: Object.values(envelope).some((n) => n !== null && n <= 0),
  });
  const input = { mounting, envelope, mountingText: row.answers[3]!, requirements };
  const filters = suggestionFilters(input);
  const candidates = evaluateCandidates(input).filter(
    (c) =>
      !blockedBy(
        sensorById(c.id),
        filters,
        filters.map((f) => f.id),
        input,
      ).length && c.status !== "excluded",
  );
  const pairs = pairCards(suggestedOrder(rankSuggestions(candidates, { fit, requirements })), {
    keepOrder: true,
    groupFamilies: true,
  });
  return { fit, pairs, requirements, filters };
}

describe("96 unchanged live-audit inputs: relevant proposal, clarification or engineering route", () => {
  for (const row of scenarios)
    test(`${row.id} ${row.name}`, () => {
      const n = Number(row.id.slice(1)),
        before = JSON.stringify(row),
        r = replay(row);
      expect(JSON.stringify(row)).toBe(before);
      expect(r.fit.blocking).toBe(blocking.has(n));
      if (r.fit.blocking) {
        expect(r.fit.issues.every((i) => i.changes.length && i.steps.length)).toBe(true);
        expect(r.fit.issues.every((i) => !i.whatFailsArgs.includes("10 A"))).toBe(true);
        if ([42, 43].includes(n))
          expect(r.fit.issues.some((i) => i.id === "outside_sensor_scope")).toBe(true);
        if ([31, 45].includes(n))
          expect(r.fit.issues.some((i) => i.id === "continuous_quantity_review")).toBe(true);
        if (n === 49)
          expect(r.fit.issues.some((i) => i.id === "requirement_clarification")).toBe(true);
        return;
      }
      // A standard candidate or explicit custom-engineering route must survive.
      if ([53, 64].includes(n)) expect(r.pairs.length).toBe(0);
      else expect(r.pairs.length).toBeGreaterThan(0);
      if ([6, 10].includes(n)) expect(r.fit.validationPoints).toContain(REMOTE_MAGNET_REVIEW);
      if ([8, 11, 82].includes(n))
        expect(r.fit.validationPoints).toContain(VALIDATION_POINT.internalBias);
      if ([19, 23].includes(n))
        expect(
          r.pairs.every(
            (p) => pairGapWarning(r.fit.gapsMm ?? [], p.guideToMm ?? p.maxPullInMm) !== null,
          ),
        ).toBe(true);
      if ([28, 85].includes(n)) {
        expect(signalVoltageV(r.requirements)).toBe(24);
        expect(r.pairs[0]?.sensorId).not.toBe("MK26");
      }
      if ([29, 30, 95].includes(n)) {
        expect(r.fit.validationPoints).toContain(CONTACT_REVIEW);
        expect(r.fit.validationPoints).not.toContain(VALIDATION_POINT.dualOutput);
      }
      if ([38, 39, 40, 41].includes(n))
        expect(r.fit.validationPoints).toContain(QUALIFICATION_REVIEW);
      if (n === 56) expect(r.fit.validationPoints).toContain(VALIDATION_POINT.dualOutput);
      if (n === 57) {
        expect(r.fit.sensorSiteC).toEqual({ min: -40, max: 125 });
        expect(thermalWarning("MK04", r.fit.sensorSiteC)?.status).toBe("exceeded");
      }
      if (n === 55 || n === 61)
        expect(
          r.pairs.every(
            (p) =>
              sensorById(p.sensorId).category === "THT" || sensorById(p.sensorId).shape === "glass",
          ),
        ).toBe(true);
      if (n >= 71 && n <= 75) expect(r.fit.validationPoints).toContain(INCOMPLETE_REVIEW);
      if ([77, 78, 79, 80, 81, 96].includes(n))
        expect(
          r.pairs.every((p) =>
            ["flange", "block", "threaded"].includes(sensorById(p.sensorId).shape),
          ),
        ).toBe(true);
      if (n === 20) expect(r.fit.gapsMm).toEqual([5.08]);
    });
});

test("semantic gap variants and rate notation do not manufacture distances", () => {
  expect(explicitGapsMm("A permanent magnet behind a 2 mm ABS guard")).toEqual([]);
  for (const s of [
    "Sensor gap 5 mm, cable 2 m.",
    "Course de 300 mm ; entrefer aimant-capteur de 5 mm.",
    "Le couple est déporté à 150 mm du produit ; entrefer 5 mm.",
  ])
    expect(explicitGapsMm(s)).toEqual([5]);
  expect(explicitGapsMm("Sensor moves at 0.5 m.s-1, gap 5 mm.")).toEqual([5]);
  expect(explicitGapsMm("The actual magnet-to-sensor gap is 0.5 m.")).toEqual([500]);
});
