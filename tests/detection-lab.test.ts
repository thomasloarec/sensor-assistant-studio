/** Laboratoire de détection reed — noyau pur. Aucune assertion ne fige un accord
 * physique : on teste invariances, seuil partagé, falsification et domaine. */
import { createHash } from "node:crypto";
import { paletteFromCss } from "@/lib/detection-lab/report";
import { describe, expect, test } from "bun:test";
import { cylinderField, cylinderAxialMt, dipoleFieldMt, cel } from "../src/lib/detection-lab/field";
import { evaluatePose, toReedFrame } from "../src/lib/detection-lab/pose";
import { PILOT_MAGNETS, magnetFrom } from "../src/lib/detection-lab/magnets";
import { PROFILE } from "../src/lib/detection-lab/profile";
import { approachPose, distanceFor, lobeMax, sharedThreshold } from "../src/lib/detection-lab/calibration";
import { buildCalibrations, buildPilotTable, summarize, formRow } from "../src/lib/detection-lab/pilot";
import { classifyPose, computeCutById, suggest, thresholdsFor, CUT_IDS } from "../src/lib/detection-lab/classify";
import { cutToSvg, cutToCsv, tableToCsv, provenance } from "../src/lib/detection-lab/report";
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
    // Empreinte stable, indépendante des fins de ligne et de l'indentation : SHA-256 du JSON canonique
    // (clés d'objets triées récursivement, ordre des tableaux conservé, JSON.stringify sans espaces).
    // Valeur relevée sur la transcription versionnée, identique à celle de la pièce jointe d'origine.
    const canon = (v: unknown): string => Array.isArray(v) ? `[${v.map(canon).join(",")}]`
      : v && typeof v === "object" ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon((v as Record<string, unknown>)[k])}`).join(",")}}`
      : JSON.stringify(v);
    const text = readFileSync("src/data/detection-lab/brochure-form-rows.json", "utf8").replace(/\r\n/g, "\n");
    expect(createHash("sha256").update(canon(JSON.parse(text))).digest("hex")).toBe("52c2ac988b2696ebd87675346c37230ff172bc35f53d0632c89be23246e0fc3b");
    // Contenu et provenance : 2 reeds × 6 classes × 8 aimants, 4 approches, bornes brutes conservées.
    const rows = (formData as unknown as { rows: { page: number; reedLabel: string; class: string; magnetLabel: string; momentRaw: string; distances: Record<string, { upRaw: string | null; toRaw: string | null }> }[] }).rows;
    expect(new Set(rows.map((r) => r.reedLabel)).size).toBe(2);
    expect(new Set(rows.map((r) => r.class)).size).toBe(6);
    expect(new Set(rows.map((r) => r.magnetLabel)).size).toBe(8);
    expect(new Set(rows.map((r) => `${r.reedLabel}|${r.class}|${r.magnetLabel}`)).size).toBe(96);
    expect(rows.every((r) => Number.isInteger(r.page) && r.page >= 1 && r.page <= 40 && /moment/i.test(r.momentRaw))).toBe(true);
    expect(rows.every((r) => ["D1", "D3", "D4", "D5"].every((k) => k in r.distances))).toBe(true);
    expect(rows.reduce((n, r) => n + Object.keys(r.distances).length * 2, 0)).toBe(768);
    expect(rows[0]!.distances.D1!.upRaw).toBe("10.8");
    expect((formData as { source: { url: string } }).source.url).toContain("brochure-reed-sensor-activation-guide.pdf");
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
    const e = evaluatePose(SMCO, { center: [1.5, 6, 0], axis: [1, 0, 0] }, NOM, "B");
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
    expect(bad.disagreement!).toBeGreaterThan(ok.disagreement! * 1.2);
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
    const g = s.groups;
    expect(g.training.rows).toBe(8);
    expect([g.form_control.rows, g.form_control.published, g.form_control.missing]).toEqual([24, 23, 1]);
    expect([g.doc_adaptation.rows, g.doc_adaptation.published, g.doc_adaptation.missing]).toEqual([64, 61, 3]);
    expect(g.quarantine.rows).toBe(8);
    expect(g.training.rows + g.form_control.rows + g.doc_adaptation.rows + g.quarantine.rows).toBe(104);
  });
  test("donnée suspecte : MK04 D3 inversé jamais estimé", () => {
    const r = buildPilotTable("A", "C1", calA).filter((x) => x.source === "MK04");
    expect(r.every((x) => x.estimated == null && x.status === "quarantine")).toBe(true);
    expect(r.some((x) => x.anomalies.includes("plage inversée up > to"))).toBe(true);
  });
});

const TEST_PALETTE = paletteFromCss(readFileSync("src/styles.css", "utf8"));
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
    expect(classifyPose(SMCO, { center: [0, 10, 0], axis: [0, 1, 0] }, th, "A").cause).toBe("orientation");
    expect(classifyPose(SMCO, { center: [0, 22, 0], axis: [1, 0, 0] }, th, "A").cause).toBe("too_far");
    // Zone centrale nulle en perpendiculaire, loin : ni rotation ±90° ni rapprochement ne suffisent → non déterminé.
    expect(classifyPose(SMCO, { center: [0, 22, 0], axis: [0, 1, 0] }, th, "A").cause).toBe("undetermined");
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
      expect(cutToSvg(c, TEST_PALETTE)).toContain("<svg");
      expect(cutToCsv(c).split("\n").length).toBeGreaterThan(1225);
    }
    expect(tableToCsv(buildPilotTable("A", "C1", calA)).split("\n")).toHaveLength(105);
  }, 60_000);
});

describe("revue indépendante — D5, enveloppe, provenance", () => {
  const L = PROFILE.reed.effectiveLengthMm;
  test("D5 = schéma source tourné rigidement : aimant ⟂ lames, approche par l'extrémité", () => {
    // Schéma : reed vertical (Y_s), aimant horizontal (X_s), centre (t, L/2 + d + r). Rotation −90° autour de z : (X, Y) → (Y, −X).
    const d = 4, t = 2.5, r = SMCO.diameterMm / 2;
    const sch = { c: [t, L / 2 + d + r], a: [1, 0] };
    const rot = (v: number[]) => [v[1]!, -v[0]!];
    const p = approachPose(SMCO, "D5", d, "C1", t);
    const rc = rot(sch.c), ra = rot(sch.a);
    // Égalité à la symétrie près (t ↦ −t, inversion N-S), qui laisse la réponse inchangée.
    expect(p.center[0]).toBeCloseTo(rc[0]!, 12);
    expect(Math.abs(p.center[1])).toBeCloseTo(Math.abs(rc[1]!), 12);
    expect(Math.abs(p.axis[1])).toBeCloseTo(Math.abs(ra[1]!), 12);
    expect(p.axis[0]).toBe(0); // perpendiculaire aux lames
    expect(p.center[0]).toBeGreaterThan(L / 2); // au-delà de l'extrémité
    const mirrored = evaluatePose(SMCO, { center: [rc[0]!, rc[1]!, 0], axis: [ra[0]!, ra[1]!, 0] }, NOM, "A");
    const e = evaluatePose(SMCO, p, NOM, "A");
    expect(e.ok && mirrored.ok && Math.abs(e.response - mirrored.response) < 1e-9).toBe(true);
  });
  test("D5 : réponse nulle centrée, non nulle hors axe, deux réponses", () => {
    for (const model of ["A", "B"] as const) {
      const c = evaluatePose(SMCO, approachPose(SMCO, "D5", 5, "C1", 0), NOM, model);
      const off = evaluatePose(SMCO, approachPose(SMCO, "D5", 5, "C1", 3), NOM, model);
      expect(c.ok && c.response < 1e-9).toBe(true);
      expect(off.ok && off.response > 1e-3).toBe(true);
    }
  });
  test("D5 : maximum convergé (pas 1 vs 0,5 mm), deux aimants × deux réponses", () => {
    for (const model of ["A", "B"] as const) {
      const cal = model === "A" ? calA : buildCalibrations("B", "C1");
      const th = cal["C:up"]!.shared!;
      for (const m of PILOT_MAGNETS) {
        const a = distanceFor(m, "D5", th, "C1", model, 1), b = distanceFor(m, "D5", th, "C1", model, 0.5);
        expect(a.ok && b.ok).toBe(true);
        if (a.ok && b.ok) expect(Math.abs(a.value - b.value)).toBeLessThan(0.05);
      }
    }
  }, 60_000);
  test("exclusion = encombrement publié KSK-1A66 (14,0 × Ø 2,2 mm), distinct de la longueur effective", () => {
    expect(PROFILE.reed.envelopeHalfLengthMm * 2).toBe(14);
    expect(PROFILE.reed.envelopeRadiusMm * 2).toBeCloseTo(2.2, 12);
    expect(PROFILE.reed.envelopeSource).toContain("ksk-1a66");
    expect(PROFILE.reed.effectiveLengthMm).toBeLessThan(14);
    // Aimant chevauchant la capsule publiée (x = 6 mm < 7 mm) : collision, aucune estimation.
    expect(evaluatePose(SMCO, { center: [0, 8, 0], axis: [1, 0, 0] }, NOM, "A").ok).toBe(true);
    expect(evaluatePose(SMCO, { center: [6, 1.0, 0], axis: [1, 0, 0] }, NOM, "A").ok).toBe(false);
  });
  test("provenance : brochure (plage de classe) et page web (pull-in/drop-out) distinctes", () => {
    const p = provenance();
    expect(p.brochureBounds).toMatch(/classe de sensibilité/);
    expect(p.brochureBounds).toMatch(/ni distribution gaussienne ni probabilité/);
    expect(p.pullInDropOutPage).toMatch(/aimants appairés/);
    expect(JSON.stringify(p)).not.toMatch(/bande de dispersion/);
  });
  test("diagnostic : la rotation proposée est une rotation ±90° autour de z, applicable", () => {
    const th = thresholdsFor(calA, "C");
    const s = suggest(SMCO, { center: [0, 10, 0], axis: [0, 1, 0] }, th, "A")!;
    expect(s.kind).toBe("rotate");
    if (s.kind === "rotate") {
      expect(Math.abs(s.degrees)).toBe(90);
      expect(s.pose.axis[2]).toBe(0);
      expect(Math.abs(s.pose.axis[0])).toBeCloseTo(1, 12);
    }
  });
});
