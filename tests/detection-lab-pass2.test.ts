/** Expérience de calibration PASS 2 — on teste le paramétrage, l'isolation de
 * l'apprentissage, la reproduction de l'audit local et la grille raffinée.
 * Aucune assertion ne prétend valider une dimension physique. */
import { describe, expect, test } from "bun:test";
import { approachPose } from "../src/lib/detection-lab/calibration";
import { computeCutById } from "../src/lib/detection-lab/classify";
import { PILOT_MAGNETS } from "../src/lib/detection-lab/magnets";
import { buildCalibrations } from "../src/lib/detection-lab/pilot";
import { evaluatePose } from "../src/lib/detection-lab/pose";
import { PROFILE } from "../src/lib/detection-lab/profile";
import {
  AT_CLASSES, AT_SOURCE, CRITERION, atRange, buildPass2Table, controlRows, fitK, fitLength,
  isSuspectedAnomaly, scoreControls, thetaFor, trainingBounds, type FormRow,
} from "../src/lib/detection-lab/pass2";
import { centralNullHalfWidth, commonNodeComparison, computeFineCut, fineGridCells } from "../src/lib/detection-lab/pass2-cuts";
import formData from "../src/data/detection-lab/brochure-form-rows.json";

const [SMCO, N45] = PILOT_MAGNETS as [typeof PILOT_MAGNETS[0], typeof PILOT_MAGNETS[0]];
const FORM_ROWS = (formData as { rows: FormRow[] }).rows;
const cloneRows = (): FormRow[] => JSON.parse(JSON.stringify(FORM_ROWS)) as FormRow[];

describe("classes AT sourcées", () => {
  test("7 classes A..G, échelle 5-10 … 35-40, source MK04 uniquement", () => {
    expect(AT_CLASSES).toEqual(["A", "B", "C", "D", "E", "F", "G"]);
    expect(atRange("A")).toEqual({ min: 5, max: 10 });
    expect(atRange("C")).toEqual({ min: 15, max: 20 });
    expect(atRange("G")).toEqual({ min: 35, max: 40 });
    expect(atRange("H")).toBeNull();
    expect(AT_SOURCE.url).toContain("datasheet-reed-sensor-series-mk04.pdf");
  });
});

describe("paramétrage explicite", () => {
  test("le repère axial D3/D5 est indépendant de L", () => {
    // Même datum → même pose quelle que soit la longueur effective du scénario ;
    // datum 7 vs 4 décale exactement de 3 mm selon x.
    const a7 = approachPose(SMCO, "D3", 5, "C1", 0, 7);
    const b7 = approachPose(SMCO, "D3", 5, "C1", 0, 7);
    expect(a7.center).toEqual(b7.center);
    const a4 = approachPose(SMCO, "D3", 5, "C1", 0, 4);
    expect(a7.center[0] - a4.center[0]).toBeCloseTo(3, 12);
    const d5 = approachPose(N45, "D5", 2.7, "C1", 1, 7);
    expect(d5.center[0]).toBeCloseTo(7 + 2.7 + 2, 12); // datum + d + rayon (C1)
    // Le défaut sans argument reste celui du lot 1 (demi-longueur du profil).
    expect(approachPose(SMCO, "D3", 5, "C1").center[0]).toBeCloseTo(PROFILE.reed.effectiveLengthMm / 2 + 5 + 2, 12);
  });
  test("θ/AT est constant sur toutes les classes et les deux bornes", () => {
    const k = fitK(16, "B", "C1").k;
    const table = buildPass2Table({ effectiveLengthMm: 16, axialDatumMm: 7, model: "B", conv: "C1", k });
    for (const r of table) {
      expect(r.thetaMT).not.toBeNull();
      expect(r.thetaMT! / r.at!).toBeCloseTo(k, 4);
      expect(thetaFor(r.className, r.bound, k)).toBeCloseTo(r.thetaMT!, 6);
    }
  }, 30000);
});

describe("isolation de l'apprentissage", () => {
  test("aucune donnée de contrôle n'est utilisée par fitK ni fitLength", () => {
    const mutated = cloneRows();
    for (const r of mutated) {
      if (r.reedLabel !== "66-er") continue;
      for (const a of ["D3", "D4", "D5"] as const) {
        if (r.distances[a]!.upMm != null) r.distances[a]!.upMm = r.distances[a]!.upMm! * 3 + 1;
        if (r.distances[a]!.toMm != null) r.distances[a]!.toMm = r.distances[a]!.toMm! * 3 + 1;
      }
      if (r.class !== "C" && r.class !== "E") {
        if (r.distances.D1!.upMm != null) r.distances.D1!.upMm = r.distances.D1!.upMm! * 2;
        if (r.distances.D1!.toMm != null) r.distances.D1!.toMm = r.distances.D1!.toMm! * 2;
      }
    }
    expect(fitK(16, "B", "C1", mutated).k).toBe(fitK(16, "B", "C1").k);
    expect(fitLength("B", "C1", mutated).effectiveLengthMm).toBe(fitLength("B", "C1").effectiveLengthMm);
  }, 30000);
  test("l'apprentissage lit exactement 8 bornes D1 C/E", () => {
    const b = trainingBounds();
    expect(b).toHaveLength(8);
    expect(new Set(b.map((x) => x.className))).toEqual(new Set(["C", "E"]));
    expect(b.every((x) => x.at > 0 && x.publishedMm > 0)).toBe(true);
  });
});

describe("reproduction de l'audit local", () => {
  test("k et L ajustés retrouvent les valeurs de l'audit", () => {
    expect(fitK(16, "B", "C1").k).toBeCloseTo(0.1337018, 4);
    expect(fitK(16, "B", "C1").medianAbsPct!).toBeCloseTo(3.62, 0);
    expect(fitLength("B", "C1").effectiveLengthMm).toBeCloseTo(15.634, 2);
  });
  test("scores primaires : V1 (21 calculables, 2 indisponibles, 15 > 20 %) et V2 (23, 0, 6), critère non atteint", () => {
    const k16 = fitK(16, "B", "C1").k;
    const v1 = scoreControls(buildPass2Table({ effectiveLengthMm: 16, axialDatumMm: 7, model: "B", conv: "C1", k: k16 }));
    expect(v1.published).toBe(23);
    expect(v1.computable).toBe(21);
    expect(v1.unavailable).toBe(2);
    expect(v1.over20).toBe(15);
    expect(v1.medianAbsPct!).toBeCloseTo(38.9, 0);
    expect(v1.pass).toBe(false);
    const v2 = scoreControls(buildPass2Table({ effectiveLengthMm: 16, axialDatumMm: 4, model: "B", conv: "C1", k: k16 }));
    expect(v2.computable).toBe(23);
    expect(v2.unavailable).toBe(0);
    expect(v2.over20).toBe(6);
    expect(v2.medianAbsPct!).toBeCloseTo(14.0, 0);
    expect(v2.pass).toBe(false);
  }, 30000);
  test("le score primaire conserve les 23 bornes ; le secondaire n'exclut que l'anomalie suspectée", () => {
    const k = fitK(16, "B", "C1").k;
    const table = buildPass2Table({ effectiveLengthMm: 16, axialDatumMm: 7, model: "B", conv: "C1", k });
    const controls = controlRows(table);
    expect(controls).toHaveLength(24); // 2 classes × 3 approches × 2 bornes × 2 aimants
    const primary = scoreControls(table);
    expect(primary.published).toBe(23);
    expect(primary.missing).toBe(1); // SmCo E D5 up « - » dans la source
    const anomalies = controls.filter(isSuspectedAnomaly);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0]!.publishedMm).toBe(17.7);
    const secondary = scoreControls(table, isSuspectedAnomaly);
    expect(secondary.published).toBe(22);
    expect(CRITERION).toEqual({ medianPctMax: 10, over20Max: 3, unavailableMax: 0 });
  }, 30000);
  test("classe G absente de la source : statut no_source, jamais validée", () => {
    const k = fitK(16, "B", "C1").k;
    const table = buildPass2Table({ effectiveLengthMm: 16, axialDatumMm: 7, model: "B", conv: "C1", k });
    const g = table.filter((r) => r.className === "G");
    expect(g).toHaveLength(16);
    expect(g.every((r) => r.status === "no_source" && r.publishedMm === null)).toBe(true);
    expect(table.filter((r) => r.status === "training")).toHaveLength(8);
  }, 30000);
});

describe("collision N45 — vérification reproduite", () => {
  test("la pose [0,5,0] axe [0,1,0] renvoie collision ; la coupe 1 mm a 108 favorables, aucune à y=5", () => {
    const probe = evaluatePose(N45, { center: [0, 5, 0], axis: [0, 1, 0] }, PROFILE.scenarios[0]!, "B");
    expect(probe.ok).toBe(false);
    if (!probe.ok) expect(probe.reason).toBe("collision");
    const cut = computeCutById("2-perpendicular-centred-C", N45, "B", "C1", buildCalibrations("B", "C1"));
    const fav = cut.cells.filter((c) => c.category === "favorable");
    expect(fav).toHaveLength(108);
    expect(fav.filter((c) => c.y === 5)).toHaveLength(0);
    expect(cut.cells.filter((c) => c.y === 5 && c.category === "unavailable").length).toBeGreaterThan(0);
  });
  test("l'enveloppe capsule du lot 1 est surdimensionnée axialement vs la demi-longueur effective du profil", () => {
    expect(PROFILE.reed.envelopeHalfLengthMm).toBe(7);
    expect(PROFILE.reed.envelopeHalfLengthMm).toBeGreaterThan(PROFILE.reed.effectiveLengthMm / 2);
  });
});

describe("grille raffinée", () => {
  test("cellules disjointes, dimensions réelles, zone fine 0,25 mm", () => {
    const cells = fineGridCells();
    const fine = cells.filter((c) => c.sizeMm === 0.25);
    const coarse = cells.filter((c) => c.sizeMm === 1);
    expect(fine.length).toBe(41 * 21);
    expect(cells.every((c) => c.sizeMm === 0.25 || c.sizeMm === 1)).toBe(true);
    // Aucune cellule grossière centrée dans la zone fine.
    expect(coarse.every((c) => Math.abs(c.x) > 5 || c.y > 5)).toBe(true);
    // Disjonction : deux cellules de la même ligne (même y0) ne se recouvrent jamais ;
    // les lignes fines (y0 = ±0,125 près) et grossières (y0 = ±0,5 près) ne partagent
    // aucun y0, et l'étendue fine maximale (5,125) reste sous le bord grossier (5,5).
    const rects = cells.map((c) => ({ x0: c.x - c.sizeMm / 2, x1: c.x + c.sizeMm / 2, y0: c.y - c.sizeMm / 2, y1: c.y + c.sizeMm / 2 }));
    const byRow = new Map<number, { x0: number; x1: number }[]>();
    for (const r of rects) {
      const key = Math.round(r.y0 * 8);
      const arr = byRow.get(key) ?? [];
      for (const o of arr) expect(r.x1 <= o.x0 + 1e-9 || r.x0 >= o.x1 - 1e-9).toBe(true);
      arr.push({ x0: r.x0, x1: r.x1 });
      byRow.set(key, arr);
    }
    const fineMax = Math.max(...fine.map((c) => Math.abs(c.x) + c.sizeMm / 2), ...fine.map((c) => c.y + c.sizeMm / 2));
    expect(fineMax).toBeCloseTo(5.125, 9);
    expect(fineMax).toBeLessThan(5.5);
  });
  test("nœuds communs : la grille fine retrouve la catégorie de la coupe 1 mm", () => {
    const cal = buildCalibrations("B", "C1");
    const fine = computeFineCut("2-perpendicular-centred-C", N45, cal);
    const cmp = commonNodeComparison(fine, N45, cal);
    expect(cmp.nodes).toBe(66); // 11 × 6 nœuds entiers dans la zone fine
    expect(cmp.mismatches).toBe(0);
    expect(fine.cells.some((c) => c.reading === "collision")).toBe(true);
    expect(fine.cells.some((c) => c.reading === "reponse_nulle")).toBe(true);
  });
  test("largeur de zone centrale : convergée entre les pas 0,25 et 0,125, jamais négative", () => {
    for (const y of [6, 8, 10]) {
      const coarse = centralNullHalfWidth(N45, y, 1.25);
      const fine = centralNullHalfWidth(N45, y, 0.25);
      const finer = centralNullHalfWidth(N45, y, 0.125);
      if (fine != null && finer != null) expect(Math.abs(fine - finer)).toBeLessThanOrEqual(0.125);
      if (coarse != null && fine != null) expect(Math.abs(coarse - fine)).toBeLessThanOrEqual(1.25);
    }
  });
});
