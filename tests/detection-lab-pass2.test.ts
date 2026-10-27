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
import {
  centralNullHalfWidth, centralNullWidthTable, classifyFineCell, commonNodeComparison,
  computeFineCut, fineGridCells, nominalState,
} from "../src/lib/detection-lab/pass2-cuts";
import { fineCutToSvg } from "../src/lib/detection-lab/pass2-report";
import { paletteFromCss } from "../src/lib/detection-lab/report";
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
  test("le score primaire conserve les 23 bornes ; le secondaire n'exclue que l'anomalie suspectée", () => {
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
  test("la capsule testée est une approximation conservative : étendue réelle ±8,1 mm (16,2 mm), verre publié 14 mm", () => {
    // Physique du lot 1 inchangée : segment ±7 mm épaissi du rayon 1,1 mm.
    expect(PROFILE.reed.envelopeHalfLengthMm).toBe(7);
    expect(PROFILE.reed.envelopeRadiusMm).toBe(1.1);
    // Étendue réelle testée : 7 + 1,1 = 8,1 mm → longueur 16,2 mm, surdimensionnée
    // de +2,2 mm par rapport au verre publié (14 mm max), PAS à la longueur effective.
    expect(PROFILE.reed.envelopeHalfLengthMm + PROFILE.reed.envelopeRadiusMm).toBeCloseTo(8.1, 12);
    expect(2 * (PROFILE.reed.envelopeHalfLengthMm + PROFILE.reed.envelopeRadiusMm) - 14).toBeCloseTo(2.2, 12);
  });
});

describe("grille raffinée", () => {
  test("maillage continu : couverture exacte de l'aire, aucun chevauchement, bande fine sur toute la hauteur", () => {
    const cells = fineGridCells();
    // Nœuds : x grossiers |x| > 5 (38) + fins |x| ≤ 5 (41) = 79 ; y fins 0..24 (97).
    expect(cells.length).toBe(79 * 97);
    // Couverture d'aire exacte du domaine 48 × 24 mm (bornes exactes en binaire).
    const area = cells.reduce((s, c) => s + (c.x1 - c.x0) * (c.y1 - c.y0), 0);
    expect(area).toBeCloseTo(48 * 24, 9);
    // Aucun chevauchement : intervalles triés par bande y puis x, contigus.
    const rows = new Map<string, { x0: number; x1: number }[]>();
    for (const c of cells) {
      const key = `${c.y0}|${c.y1}`;
      const arr = rows.get(key) ?? [];
      arr.push({ x0: c.x0, x1: c.x1 });
      rows.set(key, arr);
    }
    let prevY1 = 0;
    const yBands = [...rows.keys()].map((k) => k.split("|").map(Number) as [number, number]).sort((a, b) => a[0] - b[0]);
    expect(yBands[0]![0]).toBe(0);
    for (const [y0, y1] of yBands) {
      expect(y0).toBeCloseTo(prevY1, 12); // contiguïté verticale, aucun trou
      prevY1 = y1;
      const ints = rows.get(`${y0}|${y1}`)!.sort((a, b) => a.x0 - b.x0);
      expect(ints[0]!.x0).toBe(-24);
      for (let i = 1; i < ints.length; i++) expect(ints[i]!.x0).toBeCloseTo(ints[i - 1]!.x1, 12);
      expect(ints[ints.length - 1]!.x1).toBe(24);
    }
    expect(prevY1).toBe(24);
    // Bande fine sur TOUTE la hauteur : nœuds fins à chaque y de 0 à 24.
    const fine = cells.filter((c) => Math.abs(c.x) <= 5 && c.x1 - c.x0 <= 0.25 + 1e-9);
    expect(new Set(fine.map((c) => c.y)).size).toBe(97);
    // Raccord sans trou : la cellule fine à x = 5 s'étend jusqu'à 5,5 (milieu 5–6).
    const edge = cells.find((c) => c.x === 5 && c.y === 12)!;
    expect(edge.x1).toBeCloseTo(5.5, 12);
    expect(edge.x0).toBeCloseTo(4.875, 12);
  });
  test("nœuds communs sur toute la hauteur : la grille fine retrouve la coupe 1 mm de même identifiant", () => {
    const cal = buildCalibrations("B", "C1");
    for (const id of ["2-perpendicular-centred-C", "3-perpendicular-offset-C"] as const) {
      const fine = computeFineCut(id, N45, cal);
      const cmp = commonNodeComparison(fine, N45, cal);
      expect(cmp.nodes).toBe(11 * 25); // |x| ≤ 5 entiers × y entiers 0..24
      expect(cmp.mismatches).toBe(0);
      expect(fine.cells.some((c) => c.reading === "collision")).toBe(true);
      expect(fine.cells.some((c) => c.reading === "reponse_nulle")).toBe(true);
    }
  }, 120000);
  test("état nominal distingué du diagnostic toutes hypothèses", () => {
    // SmCo à [0,4,0] : pose nominale valide (réponse nulle au centre), mais le
    // scénario y−1 mm entre en collision → collision_hypothese, PAS collision nominale.
    const cell = classifyFineCell(SMCO, { x: 0, y: 4, x0: -0.125, x1: 0.125, y0: 3.875, y1: 4.125 }, [0, 1, 0], null);
    expect(cell.nominal).toBe("nulle");
    expect(cell.reading).toBe("reponse_nulle");
    const cellHyp = classifyFineCell(SMCO, { x: 2, y: 4, x0: 1.875, x1: 2.125, y0: 3.875, y1: 4.125 }, [0, 1, 0], { up: 0.001, to: 0.0005 });
    expect(cellHyp.nominal).not.toBe("collision");
    if (cellHyp.category === "unavailable" && cellHyp.reading !== "reponse_nulle")
      expect(cellHyp.reading).toBe("collision_hypothese");
    // N45 à [0,5,0] : collision NOMINALE du corps dessiné.
    expect(nominalState(N45, 0, 5, [0, 1, 0])).toBe("collision");
    const cellN = classifyFineCell(N45, { x: 0, y: 5, x0: -0.125, x1: 0.125, y0: 4.875, y1: 5.125 }, [0, 1, 0], null);
    expect(cellN.reading).toBe("collision");
  });
  test("le SVG dessine la capsule testée (16,2 mm), le verre publié (14 mm) et réserve le texte reed", () => {
    const cal = buildCalibrations("B", "C1");
    const cut = computeFineCut("2-perpendicular-centred-C", SMCO, cal);
    const svg = fineCutToSvg(cut, SMCO, paletteFromCss("/* test */ :root{}"));
    // Capsule testée : largeur 16,2 mm × 12 px/mm = 194,4 ; verre publié : 14 × 12 = 168.
    expect(svg).toContain('width="194.4"');
    expect(svg).toContain('width="168"');
    expect(svg).toContain("approximation conservative");
    expect(svg).not.toContain("encombrement publié");
  }, 120000);
});

describe("largeur de zone centrale — profondeurs physiquement valides", () => {
  test("statuts explicites, x=0 vérifié, plusieurs largeurs numériques par aimant, convergence 1 / 0,25 / 0,125", () => {
    for (const m of [SMCO, N45]) {
      const rows = centralNullWidthTable(m, [12, 16, 20, 24]);
      expect(rows).toHaveLength(12);
      // x = 0 vérifié : réponse nominale nulle au centre, jamais une collision à ces profondeurs.
      const atZero = evaluatePose(m, { center: [0, 12, 0], axis: [0, 1, 0] }, PROFILE.scenarios[0]!, "B");
      expect(atZero.ok).toBe(true);
      if (atZero.ok) expect(atZero.response).toBe(0);
      let numeric = 0;
      for (const y of [12, 16, 20, 24]) {
        const s1 = rows.find((r) => r.y === y && r.stepMm === 1)!.scan;
        const s25 = rows.find((r) => r.y === y && r.stepMm === 0.25)!.scan;
        const s125 = rows.find((r) => r.y === y && r.stepMm === 0.125)!.scan;
        // Aucun statut collision ni sortie non trouvée à ces profondeurs.
        expect(s1.status).toBe("ok");
        expect(s25.status).toBe("ok");
        expect(s125.status).toBe("ok");
        if (s1.status === "ok" && s25.status === "ok" && s125.status === "ok") {
          numeric++;
          // Intervalle [dernier nul ; premier positif] cohérent avec le pas.
          expect(s25.firstPositiveMm - s25.lastNullMm).toBeLessThanOrEqual(0.25 + 1e-9);
          // Convergence : jamais null/null — trois largeurs numériques comparées.
          expect(Math.abs(s25.firstPositiveMm - s125.firstPositiveMm)).toBeLessThanOrEqual(0.125 + 1e-9);
          expect(Math.abs(s1.firstPositiveMm - s25.firstPositiveMm)).toBeLessThanOrEqual(1 + 1e-9);
        }
      }
      expect(numeric).toBeGreaterThanOrEqual(3); // plusieurs largeurs numériques par aimant
    }
  }, 60000);
  test("statuts collision et sortie non trouvée distincts", () => {
    const coll = centralNullHalfWidth(N45, 5, 0.25);
    expect(coll.status).toBe("collision");
    const nf = centralNullHalfWidth(SMCO, 24, 0.25, 0.5);
    expect(nf.status).toBe("not_found");
  });
});
