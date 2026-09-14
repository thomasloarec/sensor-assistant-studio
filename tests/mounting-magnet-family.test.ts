import { describe, expect, test } from "bun:test";
import { profileFor, thresholdsFor } from "../src/lib/standex/mounting/profiles";
import { mountingFromWorkshop } from "../src/lib/standex/mounting/bridge";
import { simulateMounting } from "../src/lib/standex/mounting/simulate";
import { suggestPose } from "../src/lib/standex/mounting/suggest";
import { DEFAULT_WORKSHOP } from "../src/lib/standex/magnetic-workshop";
import { pairedMagnetModel } from "../src/lib/standex/paired-magnets";

const ALIASES = ["M21P/1", "M21P/2"] as const;

const cfg = (magnet: string, sensitivity: string, geometry: "D1" | "D3" = "D1") => ({
  ...DEFAULT_WORKSHOP,
  sensorId: "MK21",
  magnetModel: magnet,
  geometry,
  sensitivity,
  mode: "reference" as const,
  magnetAngle: 0,
});

describe("identité de famille d'aimant M21/P(1,2) dans les profils de montage", () => {
  const reference = profileFor("MK21", "M21", "D1");

  test("le profil de référence existe pour la famille publiée", () => {
    expect(reference).not.toBeNull();
    expect(reference!.classes.length).toBeGreaterThan(0);
  });

  test("les variantes P/1 et P/2 résolvent un profil pour chaque approche publiée", () => {
    for (const alias of ALIASES) {
      for (const approach of ["D1", "D3"]) {
        const base = profileFor("MK21", "M21", approach);
        const via = profileFor("MK21", alias, approach);
        if (base === null) {
          expect(via).toBeNull();
          continue;
        }
        expect(via).not.toBeNull();
        expect(via!.id).toBe(base.id);
        expect(via!.classes).toEqual(base.classes);
        for (const cls of base.classes) {
          expect(thresholdsFor(via!, cls)).toEqual(thresholdsFor(base, cls));
        }
      }
    }
  });

  test("MK21PR n'emprunte rien : aucun profil publié", () => {
    for (const magnet of ["M21", ...ALIASES]) {
      expect(profileFor("MK21PR", magnet, "D1")).toBeNull();
    }
  });

  test("simulation guidée couverte en D1 pour les deux variantes", () => {
    const cls = profileFor("MK21", "M21", "D1")!.classes[0]!;
    const pair = thresholdsFor(profileFor("MK21", "M21", "D1")!, cls)!;
    for (const alias of ALIASES) {
      const m = mountingFromWorkshop(cfg(alias, cls));
      m.travel.startMm = pair[1] + 8;
      m.travel.endMm = Math.max(0.5, pair[0] - 3);
      const sim = simulateMounting(m);
      expect(sim.samples.some((s) => s.state === "closed")).toBe(true);
      expect(sim.samples.some((s) => s.state === "open")).toBe(true);
      expect(sim.samples.every((s) => s.state === "unknown")).toBe(false);
      // le couple réel n'est pas réécrit vers la famille
      expect(m.couple.magnetId).toBe(alias);
      expect(suggestPose(m).reasons).not.toContain("PROFILE_MISSING");
    }
  });

  test("les vraies variantes de boîtier restent distinctes", () => {
    const p1 = pairedMagnetModel("M21P/1", "MK21");
    const p2 = pairedMagnetModel("M21P/2", "MK21");
    expect(JSON.stringify(p1)).not.toBe(JSON.stringify(p2));
  });
});
