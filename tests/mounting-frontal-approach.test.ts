import { describe, expect, test } from "bun:test";
import {
  DEFAULT_WORKSHOP,
  documentedMagnetAngleDeg,
  referenceAllowed,
} from "../src/lib/standex/magnetic-workshop";
import type { WorkshopConfig } from "../src/lib/standex/magnetic-workshop";
import { mountingFromWorkshop, relativePoseInMachine } from "../src/lib/standex/mounting/bridge";
import { surfaceGapMm } from "../src/lib/standex/mounting/geometry";
import { simulateMounting } from "../src/lib/standex/mounting/simulate";
import { suggestPose } from "../src/lib/standex/mounting/suggest";
import { documentedRelativeRotation, profileFor, thresholdsFor } from "../src/lib/standex/mounting/profiles";
import { COFFEE_ASSEMBLY } from "../src/lib/standex/machine-assembly";

const config = (patch: Partial<WorkshopConfig> = {}): WorkshopConfig => ({
  ...DEFAULT_WORKSHOP,
  ...patch,
});
/** Couple frontal réel : la pose documentée met les deux faces en vis-à-vis. */
const frontal = (patch: Partial<WorkshopConfig> = {}): WorkshopConfig =>
  config({
    sensorId: "MK36",
    magnetModel: "M36-N42",
    sensitivity: "1A",
    geometry: "F1",
    magnetAngle: 180,
    start: 45,
    end: 5,
    ...patch,
  });

describe("approche frontale F1 : les faces se font réellement face", () => {
  test("l'orientation documentée est 180° autour de Y, 0 pour les approches latérales", () => {
    expect(documentedRelativeRotation("F1")).toEqual([0, 180, 0]);
    expect(documentedMagnetAngleDeg("F1")).toBe(180);
    for (const approach of ["D1", "D3"] as const) {
      expect(documentedRelativeRotation(approach)).toEqual([0, 0, 0]);
      expect(documentedMagnetAngleDeg(approach)).toBe(0);
    }
  });

  test("MK36 + M36-N42 1A : couvert, avec ouvert → fermé → ouvert sur l'aller-retour", () => {
    const sim = simulateMounting(mountingFromWorkshop(frontal({ mode: "reference" })));
    expect(sim.reasons).toEqual([]);
    expect(sim.coverage).toBe("covered");
    expect([sim.pullInMm, sim.dropOutMm]).toEqual([17, 25]);
    const states = sim.samples.map((s) => s.contact);
    expect(states[0]).toBe("open");
    expect(states.includes("closed")).toBe(true);
    expect(states[states.length - 1]).toBe("open");
    const sequence = states.filter((s, i) => s !== states[i - 1]);
    expect(sequence).toEqual(["open", "closed", "open"]);
  });

  test("aimant à 0° : la pose sort du gabarit, rien n'est qualifié", () => {
    const sim = simulateMounting(mountingFromWorkshop(frontal({ magnetAngle: 0 })));
    expect(sim.reasons).toContain("ORIENTATION_OFF_TEMPLATE");
    expect(sim.coverage).toBe("outside");
    // La scène reste lisible (mode illustratif), mais aucun échantillon n'est
    // couvert et aucun seuil publié n'est produit.
    expect(sim.samples.every((s) => !s.covered)).toBe(true);
    expect(sim.illustrative).toBe(true);
    expect(referenceAllowed(frontal({ magnetAngle: 0 }))).toBe(false);
    expect(referenceAllowed(frontal())).toBe(true);
  });

  test("la suggestion oriente la face de l'aimant vers le capteur, à l'entrefer publié", () => {
    const cases: Array<[string, string, string, number]> = [
      ["MK36", "M36-N42", "1A", 17],
      ["MK37", "M37-N42", "1A", 19],
      ["MK38", "M38-N42", "1A66B", 21],
      ["MK38", "M38-N42", "1A85C", 20],
    ];
    for (const [sensorId, magnetModel, sensitivity, gap] of cases) {
      const result = suggestPose(
        mountingFromWorkshop(frontal({ sensorId, magnetModel, sensitivity })),
      );
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.suggestion.approachId).toBe("F1");
      expect(result.suggestion.gapMm).toBe(gap);
      expect(result.suggestion.rotationDeg).toEqual([0, 180, 0]);
      // Normale de la face active de l'aimant : vers le capteur, donc -X.
      expect(result.suggestion.magnetNormal[0]).toBeCloseTo(-1, 9);
      expect(result.suggestion.magnetNormal[1]).toBeCloseTo(0, 9);
      expect(result.suggestion.magnetNormal[2]).toBeCloseTo(0, 9);
      expect(result.suggestion.axis).toEqual([1, 0, 0]);
    }
  });

  test("un décalage latéral reste refusé pour la qualification", () => {
    const sim = simulateMounting(mountingFromWorkshop(frontal({ lateralShift: 1 })));
    expect(sim.reasons).toContain("LATERAL_OFFSET");
    expect(sim.samples.every((s) => !s.covered)).toBe(true);
    expect(sim.illustrative).toBe(true);
  });

  test("les contacts 1B et 1C ne sont jamais simulés, mais restent documentés", () => {
    const cases: Array<[string, string, string]> = [
      ["MK37", "M37-N42", "1B"],
      ["MK38", "M38-N42", "1B90C"],
      ["MK38", "M38-N42", "1C90C"],
    ];
    for (const [sensorId, magnetModel, sensitivity] of cases) {
      const m = mountingFromWorkshop(frontal({ sensorId, magnetModel, sensitivity }));
      const sim = simulateMounting(m);
      expect(sim.reasons).toContain("CONTACT_FORM_NOT_SIMULATED");
      expect(sim.pullInMm).toBeNull();
      expect(sim.dropOutMm).toBeNull();
      expect(sim.samples.every((s) => s.contact === "unknown")).toBe(true);
      expect(sim.transitions).toHaveLength(0);
      const suggestion = suggestPose(m);
      expect(suggestion.ok).toBe(false);
      if (!suggestion.ok) expect(suggestion.reason).toBe("CONTACT_FORM_NOT_SIMULATED");
      // Le seuil géométrique est refusé, la ligne publiée elle-même subsiste.
      const profile = profileFor(sensorId, magnetModel, "F1");
      expect(profile).toBeTruthy();
      expect(thresholdsFor(profile!, sensitivity)).toBeNull();
      expect(profile!.classes).toContain(sensitivity);
    }
  });

  test("un montage importé lit ses entrefers sur l'axe frontal du profil", () => {
    const machine = { ...COFFEE_ASSEMBLY };
    const m = mountingFromWorkshop(frontal({ machine }));
    expect(m.profileId).toBe("MK36/M36-N42/F1");
    expect(Number.isFinite(m.travel.startGapMm)).toBe(true);
    // Les entrefers sont lus sur l'axe X du profil frontal, pas sur Z.
    expect(m.travel.startGapMm).toBeGreaterThanOrEqual(m.travel.endGapMm);
    const axisReading = surfaceGapMm(
      "MK36",
      "M36-N42",
      relativePoseInMachine(machine, 0),
      [1, 0, 0],
    );
    expect(m.travel.startGapMm === axisReading || m.travel.endGapMm === axisReading).toBe(true);
    // Le décalage latéral d'un couple frontal se lit sur Z, comme en D3.
    const lateral = mountingFromWorkshop(frontal({ lateralShift: 3 }));
    expect(lateral.relative.positionMm).toEqual([0, 0, 3]);
  });
});
