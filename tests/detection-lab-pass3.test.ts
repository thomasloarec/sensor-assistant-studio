/** Expérience de calibration PASS 3 — on teste la reproduction de l'audit local,
 * l'exclusion des ancres, l'invariance de la physique sous changement de repère
 * documentaire, le diagnostic B′ et l'absence de fuite vers le moteur.
 * Aucune assertion ne prétend valider une dimension physique. */
import { describe, expect, test } from "bun:test";
import { approachPose, distanceFor } from "../src/lib/detection-lab/calibration";
import { PILOT_MAGNETS } from "../src/lib/detection-lab/magnets";
import { buildPass2Table, fitK, fitLength, type FormRow } from "../src/lib/detection-lab/pass2";
import {
  D4_ANCHOR, DATUM_ANCHOR, PASS3_CRITERION, PASS3_VARIANTS, bPrime, boundPasses,
  buildPass3Table, distanceForBPrime, fitAxialDatum, fitD4Correction, pass3ControlRows,
  runPass3Variant, scorePass3Groups, signedErrorsSvg, type Pass3Result,
} from "../src/lib/detection-lab/pass3";
import { evaluatePose } from "../src/lib/detection-lab/pose";
import { PROFILE } from "../src/lib/detection-lab/profile";
import formData from "../src/data/detection-lab/brochure-form-rows.json";

const [SMCO, N45] = PILOT_MAGNETS as [typeof PILOT_MAGNETS[0], typeof PILOT_MAGNETS[0]];
const FORM_ROWS = (formData as { rows: FormRow[] }).rows;
const cloneRows = (): FormRow[] => JSON.parse(JSON.stringify(FORM_ROWS)) as FormRow[];

// Les six variantes sont coûteuses : calcul unique partagé (paresseux).
let cache: Pass3Result[] | null = null;
function results(): Pass3Result[] {
  if (!cache) {
    const L = fitLength("B", "C1").effectiveLengthMm;
    cache = PASS3_VARIANTS.map((v) => runPass3Variant(v, "B", "C1", L));
  }
  return cache;
}
const byId = (id: string): Pass3Result => results().find((r) => r.variant.id === id)!;

describe("reproduction de l'audit local", () => {
  test("paramètres ajustés : k, repère axial et retrait D4 retrouvent les valeurs de l'audit", () => {
    const l16 = byId("L16-axial");
    expect(l16.k).toBeCloseTo(0.1336655628592061, 8);
    expect(l16.datum.datumMm).toBeCloseTo(3.345867, 3);
    expect(l16.datum.publishedMm).toBe(7.5);
    expect(Math.abs(l16.datum.residualMm)).toBeLessThan(1e-3);
    const lfit = byId("Lfit-axial");
    expect(lfit.effectiveLengthMm).toBeCloseTo(15.633996, 4);
    expect(lfit.k).toBeCloseTo(0.1356055, 5);
    expect(lfit.datum.datumMm).toBeCloseTo(3.334095, 3);
    expect(byId("L16-d4corr").d4!.deltaMm).toBeCloseTo(1.466666, 3);
    expect(byId("Lfit-d4corr").d4!.deltaMm).toBeCloseTo(1.491309, 3);
  }, 300000);

  test("scores : axial 40/46 échec, B′ 37/46 échec, correction 43/45 critère atteint", () => {
    const axial = byId("L16-axial").scores;
    expect(axial.ce.passed).toBe(19);
    expect(axial.ce.total).toBe(22);
    expect(axial.bd.passed).toBe(21);
    expect(axial.bd.total).toBe(24);
    expect(axial.grouped.passed).toBe(40);
    expect(axial.grouped.total).toBe(46);
    expect(axial.grouped.medianAbsMm!).toBeCloseTo(0.678, 2);
    expect(axial.grouped.pass).toBe(false);
    const bp = byId("L16-bprime").scores.grouped;
    expect(bp.passed).toBe(37);
    expect(bp.total).toBe(46);
    expect(bp.pass).toBe(false);
    const corr = byId("L16-d4corr").scores;
    expect(corr.ce.passed).toBe(20);
    expect(corr.ce.total).toBe(21);
    expect(corr.bd.passed).toBe(23);
    expect(corr.bd.total).toBe(24);
    expect(corr.grouped.passed).toBe(43);
    expect(corr.grouped.total).toBe(45);
    expect(corr.grouped.unavailable).toBe(0);
    expect(corr.grouped.medianAbsMm!).toBeCloseTo(0.423, 2);
    expect(corr.grouped.maxAbsMm!).toBeCloseTo(3.228, 2);
    expect(corr.grouped.pass).toBe(true);
    const corrFit = byId("Lfit-d4corr").scores.grouped;
    expect(corrFit.passed).toBe(43);
    expect(corrFit.total).toBe(45);
    expect(corrFit.medianAbsMm!).toBeCloseTo(0.419, 2);
    expect(corrFit.maxAbsMm!).toBeCloseTo(3.272, 2);
    expect(corrFit.pass).toBe(true);
  }, 300000);

  test("biais signés par approche (moyen et médian) sous 1 mm pour la variante corrigée", () => {
    const biases = byId("L16-d4corr").scores.grouped.biases;
    const d3 = biases.find((b) => b.approach === "D3")!;
    const d4 = biases.find((b) => b.approach === "D4")!;
    const d5 = biases.find((b) => b.approach === "D5")!;
    expect(d3.meanMm!).toBeCloseTo(-0.858, 2);
    expect(d4.meanMm!).toBeCloseTo(-0.295, 2);
    expect(d5.meanMm!).toBeCloseTo(-0.420, 2);
    for (const b of biases) {
      expect(Math.abs(b.meanMm!)).toBeLessThanOrEqual(PASS3_CRITERION.maxAbsBiasMm);
      expect(Math.abs(b.medianMm!)).toBeLessThanOrEqual(PASS3_CRITERION.maxAbsBiasMm);
    }
  }, 300000);

  test("deux échecs conservés, aucune exclusion supplémentaire ; A/F 20/30 avec 1 indisponible", () => {
    for (const id of ["L16-d4corr", "Lfit-d4corr"]) {
      const failures = byId(id).scores.grouped.failures;
      expect(failures).toHaveLength(2);
      const b = failures.find((x) => x.className === "B")!;
      const c = failures.find((x) => x.className === "C")!;
      expect([b.magnetId, b.approach, b.bound]).toEqual(["N45-4X19", "D3", "up"]);
      expect(b.publishedMm).toBe(17.3);
      expect([c.magnetId, c.approach, c.bound]).toEqual(["N45-4X19", "D3", "to"]);
      expect(c.publishedMm).toBe(17.7); // anomalie suspectée du lot 2, jamais corrigée
    }
    const af = byId("L16-d4corr").af;
    expect(af.passed).toBe(20);
    expect(af.total).toBe(30);
    expect(af.unavailable).toBe(1);
    expect(af.pass).toBe(false);
  }, 300000);
});

describe("ancres et isolation de l'ajustement", () => {
  test("ancres exclues : 46 contrôles (axial/B′) puis 45 (correction D4)", () => {
    expect(pass3ControlRows(byId("L16-axial").table)).toHaveLength(46);
    expect(pass3ControlRows(byId("L16-bprime").table)).toHaveLength(46);
    expect(pass3ControlRows(byId("L16-d4corr").table)).toHaveLength(45);
    // Les ancres portent un statut explicite et ne sont jamais des contrôles.
    for (const r of results()) {
      const anchors = r.table.filter((x) => x.status === "anchor_datum" || x.status === "anchor_d4");
      expect(anchors.filter((x) => x.status === "anchor_datum")).toHaveLength(1);
      expect(anchors.filter((x) => x.status === "anchor_d4")).toHaveLength(r.variant.mode === "d4corr" ? 1 : 0);
      expect(pass3ControlRows(r.table).every((x) => x.status === "control")).toBe(true);
    }
    // L'ancre D4 corrigée égale exactement le publié (retrait ajusté sur elle).
    const anchor = byId("L16-d4corr").table.find((x) => x.status === "anchor_d4")!;
    expect(anchor.estimatedMm!).toBeCloseTo(anchor.publishedMm!, 3);
  }, 300000);

  test("aucune donnée hors ancre ne modifie le repère ni le retrait D4", () => {
    const mutated = cloneRows();
    for (const r of mutated) {
      if (r.reedLabel !== "66-er") continue;
      for (const a of ["D3", "D4", "D5"] as const)
        for (const b of ["upMm", "toMm"] as const) {
          const isDatumAnchor = r.class === DATUM_ANCHOR.className && r.magnetLabel === "MAGNET SmCo5 5 x 4mm" && a === "D3" && b === "upMm";
          const isD4Anchor = r.class === D4_ANCHOR.className && r.magnetLabel === "MAGNET SmCo5 5 x 4mm" && a === "D4" && b === "upMm";
          if (!isDatumAnchor && !isD4Anchor && r.distances[a]![b] != null) r.distances[a]![b] = r.distances[a]![b]! * 3 + 1;
        }
    }
    const k = fitK(16, "B", "C1").k;
    expect(fitAxialDatum(16, k, "B", "C1", mutated).datumMm).toBe(fitAxialDatum(16, k, "B", "C1").datumMm);
    expect(fitD4Correction(16, k, "B", "C1", mutated).deltaMm).toBe(fitD4Correction(16, k, "B", "C1").deltaMm);
    // Mutation de l'ancre D3 : le repère recalé change (preuve que l'ancre est bien lue).
    const anchorMutated = cloneRows();
    const row = anchorMutated.find((r) => r.reedLabel === "66-er" && r.class === "C" && r.magnetLabel === "MAGNET SmCo5 5 x 4mm")!;
    row.distances.D3!.upMm = 9.5;
    expect(fitAxialDatum(16, k, "B", "C1", anchorMutated).datumMm).not.toBeCloseTo(fitAxialDatum(16, k, "B", "C1").datumMm, 3);
  }, 120000);
});

describe("invariance de la physique sous repère documentaire", () => {
  test("changer le repère axial ne déplace ni la pose ni la réponse dans le monde", () => {
    // Même pose monde → même évaluation, quel que soit le repère documentaire.
    const pose = { center: [6, 0, 0] as [number, number, number], axis: [1, 0, 0] as [number, number, number] };
    const e1 = evaluatePose(SMCO, pose, PROFILE.scenarios[0]!, "B");
    const e2 = evaluatePose(SMCO, pose, PROFILE.scenarios[0]!, "B");
    expect(e1).toEqual(e2);
    // D1 et D4 n'utilisent pas le repère axial : estimations brutes identiques.
    const k = fitK(16, "B", "C1").k;
    const theta = k * 20;
    for (const a of ["D1", "D4"] as const) {
      const d3 = distanceFor(SMCO, a, theta, "C1", "B", undefined, undefined, 3.345867);
      const d7 = distanceFor(SMCO, a, theta, "C1", "B", undefined, undefined, 7);
      expect(d3.ok && d7.ok).toBe(true);
      if (d3.ok && d7.ok) expect(d3.value).toBeCloseTo(d7.value, 6);
    }
    // D3 : la distance reportée se décale d'EXACTEMENT le décalage de repère (pose monde identique).
    const a3 = distanceFor(SMCO, "D3", theta, "C1", "B", undefined, undefined, 3.345867);
    const a7 = distanceFor(SMCO, "D3", theta, "C1", "B", undefined, undefined, 7);
    expect(a3.ok && a7.ok).toBe(true);
    if (a3.ok && a7.ok) expect(a7.value - a3.value).toBeCloseTo(7 - 3.345867, 3);
    // La pose monde construite à partir des deux repères est la même.
    if (a3.ok && a7.ok) {
      const p3 = approachPose(SMCO, "D3", a3.value, "C1", 0, 3.345867);
      const p7 = approachPose(SMCO, "D3", a7.value, "C1", 0, 7);
      expect(p3.center[0]).toBeCloseTo(p7.center[0], 3);
    }
  }, 120000);
});

describe("diagnostic B′", () => {
  test("B′ ≥ B point par point sur des poses échantillonnées", () => {
    let checked = 0;
    for (const m of [SMCO, N45])
      for (let y = 3; y <= 20; y += 2)
        for (const axis of [[1, 0, 0], [0, 1, 0]] as const) {
          const e = evaluatePose(m, { center: [0, y, 0], axis: [...axis] }, PROFILE.scenarios[0]!, "B");
          if (!e.ok) continue;
          checked++;
          expect(bPrime(e.m1, e.m2)).toBeGreaterThanOrEqual(e.response - 1e-12);
        }
    expect(checked).toBeGreaterThan(20);
  });

  test("D1 centré : B′ et B donnent la même distance (M1 = M2 par symétrie)", () => {
    const k = fitK(16, "B", "C1").k;
    const theta = k * 20;
    const b = distanceFor(SMCO, "D1", theta, "C1", "B", undefined, scenarioForLength(16), 3.345867);
    const bp = distanceForBPrime(SMCO, "D1", theta, "C1", 16, 3.345867);
    expect(b.ok && bp.ok).toBe(true);
    if (b.ok && bp.ok) expect(bp.value).toBeCloseTo(b.value, 3);
  }, 60000);

  test("B′ allonge D4 à seuils égaux : les écarts D4 de la variante bprime sont ≥ ceux de axial", () => {
    const axial = byId("L16-axial").table;
    const bp = byId("L16-bprime").table;
    for (const rowA of axial.filter((r) => r.approach === "D4" && r.estimatedRawMm != null)) {
      const rowB = bp.find((r) => r.className === rowA.className && r.magnetId === rowA.magnetId && r.bound === rowA.bound && r.approach === "D4")!;
      expect(rowB.estimatedRawMm!).toBeGreaterThanOrEqual(rowA.estimatedRawMm! - 1e-3);
    }
  }, 300000);
});

describe("conservation et non-régression", () => {
  test("112 lignes par tableau, G no_source, anomalie conservée, 8 bornes d'apprentissage", () => {
    for (const r of results()) {
      expect(r.table).toHaveLength(112);
      const g = r.table.filter((x) => x.className === "G");
      expect(g).toHaveLength(16);
      expect(g.every((x) => x.status === "no_source" && x.publishedMm === null)).toBe(true);
      expect(r.table.filter((x) => x.status === "training")).toHaveLength(8);
      const anomaly = r.table.find((x) => x.className === "C" && x.magnetId === "N45-4X19" && x.approach === "D3" && x.bound === "to")!;
      expect(anomaly.publishedMm).toBe(17.7); // jamais corrigée dans la source
    }
  }, 300000);

  test("aucune valeur corrigée déversée dans le moteur : profil 1.1 et lot 2 intacts", () => {
    expect(PROFILE.reed.effectiveLengthMm).toBe(8);
    expect(PROFILE.version).toBe("1.1.0");
    // Le lot 2 avec repère explicite +7 mm reproduit ses propres estimations :
    // la correction D4 de la passe 3 n'existe que dans les tableaux pass 3.
    const k = fitK(16, "B", "C1").k;
    const p2 = buildPass2Table({ effectiveLengthMm: 16, axialDatumMm: 7, model: "B", conv: "C1", k });
    const p2row = p2.find((x) => x.className === "C" && x.magnetId === "SMCO5-5X4" && x.approach === "D4" && x.bound === "up")!;
    const p3raw = byId("L16-d4corr").table.find((x) => x.className === "C" && x.magnetId === "SMCO5-5X4" && x.approach === "D4" && x.bound === "up")!;
    // Brute pass 3 (repère 3,345867, sans effet sur D4) = brute pass 2 (repère 7) ;
    // seule la colonne CORRIGÉE de la passe 3 retire δ.
    expect(p3raw.estimatedRawMm!).toBeCloseTo(p2row.estimatedMm!, 3);
    expect(p3raw.estimatedMm!).toBeCloseTo(p3raw.estimatedRawMm! - byId("L16-d4corr").d4!.deltaMm, 3);
    expect(p2row.estimatedMm!).not.toBeCloseTo(p3raw.estimatedMm!, 3);
  }, 120000);

  test("critère par borne : max(1 mm, 15 % du publié)", () => {
    expect(boundPasses(6, 1)).toBe(true); // 1 mm > 15 % de 6
    expect(boundPasses(6, 1.01)).toBe(false);
    expect(boundPasses(20, 3)).toBe(true); // 15 % de 20 = 3
    expect(boundPasses(20, 3.01)).toBe(false);
    expect(boundPasses(17.7, -3.228)).toBe(false); // l'échec conservé C-N45-D3-to
    expect(PASS3_CRITERION).toEqual({ toleranceMm: 1, tolerancePct: 15, minPassRatio: 0.9, maxAbsBiasMm: 1 });
  });

  test("le SVG des écarts signés distingue les aimants et marque les hors tolérance", () => {
    const svg = signedErrorsSvg("titre", pass3ControlRows(byId("L16-d4corr").table), {
      fav: "a", var: "b", far: "c", orient: "d", undet: "e", na: "f", ink: "g",
    });
    expect(svg).toContain("SmCo5 5×4");
    expect(svg).toContain("NdFeB N45 4×19");
    expect(svg).toContain("max(1 mm, 15 %");
    expect(svg).toContain("HORS tolérance"); // les deux échecs conservés sont marqués
    expect(svg).toContain('font-size="14"');
  }, 300000);
});
