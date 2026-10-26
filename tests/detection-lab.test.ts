/** Laboratoire de détection reed — noyau pur. Aucune assertion ne fige un accord
 * physique : on teste invariances, seuil partagé, falsification et domaine. */
import { describe, expect, test } from "bun:test";
import { cylinderField, cylinderAxialMt, dipoleFieldMt, cel } from "../src/lib/detection-lab/field";
import { evaluatePose, toReedFrame } from "../src/lib/detection-lab/pose";
import { PILOT_MAGNETS, magnetFrom } from "../src/lib/detection-lab/magnets";
import { PROFILE } from "../src/lib/detection-lab/profile";
import { distanceFor, lobeMax, sharedThreshold } from "../src/lib/detection-lab/calibration";
import { buildCalibrations, buildPilotTable, summarize, formRow } from "../src/lib/detection-lab/pilot";
import { classifyPose, computeCutById, suggest, thresholdsFor, CUT_IDS } from "../src/lib/detection-lab/classify";
import { cutToSvg, cutToCsv, tableToCsv } from "../src/lib/detection-lab/report";
import formData from "../src/data/detection-lab/brochure-form-rows.json";
import { readFileSync } from "node:fs";

const [SMCO, N45] = PILOT_MAGNETS as [typeof PILOT_MAGNETS[0], typeof PILOT_MAGNETS[0]];
const NOM = PROFILE.scenarios[0]!;
const calA = buildCalibrations("A", "C1");

describe("données et conversion du moment", () => {
  test("transcription intégrée telle quelle : 96 lignes, empreinte PDF", () => {
    const d = formData as { rows: unknown[]; source: { sha256: string } };
    expect(d.rows).toHaveLength(96);
    expect(d.source.sha256).toBe("711bc6f75bec192fc6765dd6e299f2cdd322bb49ec62880c486b16a57b926f8f");
    expect(readFileSync("src/data/detection-lab/brochure-form-rows.json", "utf8")).toBe(readFileSync("/mnt/user-uploads/brochure-form-rows.json", "utf8"));
  });
  test("m = q·1e-8/μ0 : SmCo ≈ 0.0572958, N45 ≈ 0.2450986 A·m²", () => {
    expect(SMCO.momentAm2).toBeCloseTo(0.0572958, 6);
    expect(N45.momentAm2).toBeCloseTo(0.2450986, 6);
    expect(SMCO.jT).toBeCloseTo((4e-7 * Math.PI * SMCO.momentAm2) / SMCO.volumeM3, 10);
  });
});

describe("champ fini", () => {
  const body = { radiusMm: 2.5, lengthMm: 4, jT: 1, center: [0, 0, 0] as [number, number, number], axis: [0, 0, 1] as [number, number, number] };
  test("axe : identique à la formule fermée", () => {
    for (const z of [2.5, 4, 10]) expect(cylinderField(body, [0, 0, z])[2]).toBeCloseTo(cylinderAxialMt(2.5, 4, 1, z), 8);
  });
  test("limite lointaine : tend vers le dipôle de même moment", () => {
    const m = (1 * Math.PI * 2.5e-3 ** 2 * 4e-3) / (4e-7 * Math.PI);
    const f = cylinderField(body, [80, 0, 120]), d = dipoleFieldMt(m, [0, 0, 1], [80, 0, 120]);
    expect(Math.hypot(f[0] - d[0], f[2] - d[2]) / Math.hypot(d[0], d[2])).toBeLessThan(1e-3);
  });
  test("champ proche ≠ dipôle (pas de dipôle adouci)", () => {
    const m = (Math.PI * 2.5e-3 ** 2 * 4e-3) / (4e-7 * Math.PI);
    expect(Math.abs(cylinderField(body, [0, 0, 3])[2] - dipoleFieldMt(m, [0, 0, 1], [0, 0, 3])[2])).toBeGreaterThan(10);
  });
  test("cel : K(0) = π/2", () => expect(cel(1, 1, 1, 1)).toBeCloseTo(Math.PI / 2, 12));
});

describe("evaluatePose", () => {
  test("invariance par mouvement rigide commun reed + aimant", () => {
    const pose = { center: [3, 7, 1] as [number, number, number], axis: [0.6, 0.8, 0] as [number, number, number] };
    const a = evaluatePose(SMCO, pose, NOM, "B");
    const c = Math.cos(0.7), s = Math.sin(0.7);
    const rows: [[number, number, number], [number, number, number], [number, number, number]] = [[c, s, 0], [-s, c, 0], [0, 0, 1]];
    const origin: [number, number, number] = [10, -4, 2];
    const world = { center: [origin[0] + c * 3 - s * 7, origin[1] + s * 3 + c * 7, origin[2] + 1] as [number, number, number], axis: [c * 0.6 - s * 0.8, s * 0.6 + c * 0.8, 0] as [number, number, number] };
    const b = evaluatePose(SMCO, toReedFrame(origin, rows, world), NOM, "B");
    expect(a.ok && b.ok && Math.abs(a.response - b.response)).toBeLessThan(1e-9);
  });
  test("inversion N-S : même réponse", () => {
    for (const model of ["A", "B"] as const) {
      const a = evaluatePose(N45, { center: [5, 9, 0], axis: [1, 0, 0] }, NOM, model);
      const b = evaluatePose(N45, { center: [5, 9, 0], axis: [-1, 0, 0] }, NOM, model);
      expect(a.ok && b.ok && a.response).toBeCloseTo(b.ok ? b.response : NaN, 10);
    }
  });
  test("nullité centrale perpendiculaire et lobes de largeur finie", () => {
    const at = (x: number) => { const e = evaluatePose(SMCO, { center: [x, 7, 0], axis: [0, 1, 0] }, NOM, "A"); return e.ok ? e.response : NaN; };
    expect(at(0)).toBeLessThan(1e-9);
    expect(at(4)).toBeGreaterThan(1);
    expect(at(30)).toBeLessThan(at(4) / 20);
  });
  test("collision et hors domaine exclus", () => {
    expect(evaluatePose(SMCO, { center: [0, 2, 0], axis: [1, 0, 0] }, NOM, "A")).toEqual({ ok: false, reason: "collision" });
    expect(evaluatePose(SMCO, { center: [0, 80, 0], axis: [1, 0, 0] }, NOM, "A")).toEqual({ ok: false, reason: "domain" });
    expect(evaluatePose(SMCO, { center: [0, 8, 0], axis: [0, 0, 0] }, NOM, "A").ok).toBe(false);
  });
  test("modèle B = min(|M1|,|M2|), pas la moyenne géométrique ; zéro si signes opposés", () => {
    const e = evaluatePose(SMCO, { center: [3, 6, 0], axis: [1, 0, 0] }, NOM, "B");
    if (!e.ok) throw new Error("pose");
    expect(Math.abs(e.m1 - e.m2)).toBeGreaterThan(0.1);
    expect(e.response).toBe(Math.min(Math.abs(e.m1), Math.abs(e.m2)));
    expect(e.response).not.toBeCloseTo(Math.sqrt(Math.abs(e.m1 * e.m2)), 3);
    const perp = evaluatePose(SMCO, { center: [0, 7, 0], axis: [0, 1, 0] }, NOM, "B");
    expect(perp.ok && perp.response).toBe(0);
  });
});

describe("seuil partagé entre aimants", () => {
  test("un seul seuil par classe/modèle/borne, utilisé pour les deux aimants et les boîtiers", () => {
    const rows = buildPilotTable("A", "C1", calA);
    for (const c of ["C", "E"]) for (const b of ["up", "to"]) {
      const s = new Set(rows.filter((r) => r.className === c && r.bound === b && r.source !== "MK04").map((r) => r.sharedThreshold));
      expect(s.size).toBe(1);
    }
  });
  test("seuils implicites affichés, désaccord non compensé, seuil conjoint entre les deux", () => {
    for (const s of Object.values(calA)) {
      const v = Object.values(s.implied) as number[];
      expect(s.disagreement!).toBeGreaterThan(1);
      expect(s.shared!).toBeGreaterThanOrEqual(Math.min(...v));
      expect(s.shared!).toBeLessThanOrEqual(Math.max(...v));
      expect(s.cross).toHaveLength(2);
    }
  });
  test("falsification : moment N45 altéré ⇒ désaccord accru, pas de recalibrage silencieux", () => {
    const fake = magnetFrom("N45-4X19", N45.label, N45.material, 4, 19, N45.momentRaw, N45.q * 3);
    const pub = { "SMCO5-5X4": formRow("C", SMCO)!.distances.D1!.upMm!, "N45-4X19": formRow("C", N45)!.distances.D1!.upMm! };
    const ok = sharedThreshold([SMCO, N45], pub, "C", "A", "C1", "up");
    const bad = sharedThreshold([SMCO, fake], pub, "C", "A", "C1", "up");
    expect(bad.disagreement!).toBeGreaterThan(ok.disagreement! * 1.5);
    expect(bad.implied["SMCO5-5X4"]).toBeCloseTo(ok.implied["SMCO5-5X4"]!, 10);
  });
  test("D4 : maximum convergé (pas 1 mm vs 0,5 mm)", () => {
    const th = calA["C:up"]!.shared!;
    const a = distanceFor(SMCO, "D4", th, "C1", "A", 1), b = distanceFor(SMCO, "D4", th, "C1", "A", 0.5);
    expect(a.ok && b.ok && Math.abs(a.value - b.value)).toBeLessThan(0.01);
    const l = lobeMax(SMCO, "D4", 6, "C1", "A");
    expect(l.ok && l.x).toBeGreaterThan(1);
  });
  test("tableau : manquants et quarantaine comptés, apprentissage séparé", () => {
    const s = summarize(buildPilotTable("A", "C1", calA));
    expect(s.total).toBe(104);
    expect(s.byStatus.training).toBe(8);
    expect(s.byStatus.quarantine).toBe(8);
    expect(s.byStatus.missing).toBeGreaterThan(0);
    expect(s.byStatus.training + s.byStatus.control + s.byStatus.missing + s.byStatus.unavailable + s.byStatus.quarantine).toBe(104);
  });
  test("donnée suspecte : MK04 D3 inversé jamais estimé", () => {
    const r = buildPilotTable("A", "C1", calA).filter((x) => x.source === "MK04");
    expect(r.every((x) => x.estimated == null && x.status === "quarantine")).toBe(true);
    expect(r.some((x) => x.anomalies.includes("plage inversée up > to"))).toBe(true);
  });
});

describe("classification, suggestions et coupes", () => {
  const th = thresholdsFor(calA, "C");
  test("favorable exige l'accord de tous les scénarios ; enveloppes emboîtées", () => {
    const fav = classifyPose(SMCO, { center: [0, 6, 0], axis: [1, 0, 0] }, th, "A");
    expect(fav.category).toBe("favorable");
    expect(fav.ratios).toHaveLength(PROFILE.scenarios.length);
    const cut = computeCutById("1-parallel-C", SMCO, "A", "C1", calA);
    const maxY = (cat: string) => Math.max(...cut.cells.filter((c) => c.x === 0 && c.category === cat).map((c) => c.y));
    expect(maxY("favorable")).toBeLessThan(maxY("variable"));
  });
  test("deux causes défavorables distinctes par contrefactuel", () => {
    expect(classifyPose(SMCO, { center: [0, 7, 0], axis: [0, 1, 0] }, th, "A").cause).toBe("orientation");
    expect(classifyPose(SMCO, { center: [0, 22, 0], axis: [1, 0, 0] }, th, "A").cause).toBe("too_far");
  });
  test("suggestion : un seul déplacement latéral ou rotation 90°, vérifiée, jamais en collision", () => {
    const pose = { center: [0, 7, 0] as [number, number, number], axis: [0, 1, 0] as [number, number, number] };
    const s = suggest(SMCO, pose, th, "A")!;
    expect(s).not.toBeNull();
    expect(classifyPose(SMCO, s.pose, th, "A").category).toBe(s.after);
    expect(["favorable", "variable"]).toContain(s.after);
    if (s.kind === "shift") expect(s.pose.center.slice(1)).toEqual([7, 0]);
    expect(suggest(SMCO, { center: [0, 6, 0], axis: [1, 0, 0] }, th, "A")).toBeNull();
  });
  test("trajet : scénarios fixes, chronologie sans hystérésis (aller = retour)", () => {
    const c = computeCutById("6-path-C", SMCO, "A", "C1", calA);
    const cats = c.path!.points.map((p) => p.category);
    expect(cats).toEqual([...cats].reverse());
    expect(new Set(cats).size).toBeGreaterThan(2);
  });
  test("six coupes calculées et exportables", () => {
    for (const id of CUT_IDS) {
      const c = computeCutById(id, N45, "B", "C1", calA);
      expect(c.cells).toHaveLength(49 * 25);
      expect(cutToSvg(c)).toContain("<svg");
      expect(cutToCsv(c).split("\n").length).toBeGreaterThan(1225);
    }
    expect(tableToCsv(buildPilotTable("A", "C1", calA)).split("\n")).toHaveLength(105);
  });
});
