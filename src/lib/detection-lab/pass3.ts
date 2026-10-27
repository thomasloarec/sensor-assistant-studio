/** Expérience de calibration PASS 3 — recalage du repère axial sur UNE borne
 * publiée et correction SCALAIRE D4, sous un critère révisé par borne.
 *
 * Validation RÉTROSPECTIVE : les données Form ont déjà été inspectées aux lots 1
 * et 2 ; les ancres ont été choisies après lecture des données. Ce n'est pas un
 * test indépendant nouveau.
 *
 * AUCUNE physique dupliquée : toutes les réponses viennent d'evaluatePose.
 * Le repère axial et la correction D4 sont des REPÈRES DOCUMENTAIRES : ils
 * changent la distance REPORTÉE dans le tableau, jamais la pose de l'aimant ni
 * la réponse dans le monde. La correction D4 est un retrait scalaire dans le
 * tableau — PAS un repère de face commun D1/D4 ni une transformation 3D.
 *
 * B′ = √(|M1·M2|) (mêmes signes, sinon 0) est un DIAGNOSTIC strict sur les
 * moyennes renvoyées par evaluatePose : aucun second calcul de champ, aucune
 * activation dans l'interface.
 *
 * Statut des tables : « accord brochure calibré B–E sur 2 aimants sous critère
 * révisé ». INTERDIT : « 3D validé », « ±1 mm » — le critère tolère 15 % et
 * 10 % d'échecs, et 4 maxima ne valident ni forme volumique ni rotations
 * intermédiaires. Le modèle 3D reste pédagogique, non qualifié.
 *
 * Module pur : aucun DOM, React, Three ni backend. Profil 1.1 et lot 2 intacts.
 */
import { approachPose, distanceFor, type Value } from "./calibration";
import { evaluatePose } from "./pose";
import { PILOT_MAGNETS, type PilotMagnet } from "./magnets";
import { PROFILE, type DistanceConvention, type ResponseModel } from "./profile";
import {
  AT_CLASSES, atRange, fitK, fitLength, formRowFor, scenarioForLength, thetaFor,
  type FormRow,
} from "./pass2";
import type { Bound } from "./pilot";

export const PASS3_VERSION = "reed-lab-pass3-1.0.0";

const SMCO = PILOT_MAGNETS[0]!;
const magnetById = (id: string): PilotMagnet => PILOT_MAGNETS.find((m) => m.id === id)!;

// --- Ancres EXPLICITES (choisies après lecture des données : rétrospectif) ---
/** Recalage du repère axial D3/D5 : unique borne Form C — SmCo — D3 — up. */
export const DATUM_ANCHOR = { className: "C", magnetId: "SMCO5-5X4", approach: "D3", bound: "up" } as const;
/** Correction scalaire D4 : unique borne Form C — SmCo — D4 — up (seconde ancre). */
export const D4_ANCHOR = { className: "C", magnetId: "SMCO5-5X4", approach: "D4", bound: "up" } as const;
const isAnchor = (a: typeof DATUM_ANCHOR, className: string, magnetId: string, approach: string, bound: string) =>
  a.className === className && a.magnetId === magnetId && a.approach === approach && a.bound === bound;

/** Critère révisé, explicite : par borne |erreur| ≤ max(1 mm, 15 % du publié) ;
 * ≥ 90 % des contrôles ; biais signé par approche (moyen ET médian) ≤ 1 mm. */
export const PASS3_CRITERION = { toleranceMm: 1, tolerancePct: 15, minPassRatio: 0.9, maxAbsBiasMm: 1 } as const;
export function boundPasses(publishedMm: number, errorMm: number): boolean {
  return Math.abs(errorMm) <= Math.max(PASS3_CRITERION.toleranceMm, (PASS3_CRITERION.tolerancePct / 100) * publishedMm);
}

const round = (v: number, n = 4) => Math.round(v * 10 ** n) / 10 ** n;
const medianOf = (vals: number[]): number | null => {
  if (!vals.length) return null;
  const s = [...vals].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
};

// --- Recalage du repère axial sur l'ancre D3 (bissection monotone) ---
export interface DatumFit { datumMm: number; publishedMm: number; residualMm: number; thetaMT: number }
/** Repère axial tel que la distance D3 estimée de l'ancre égale le publié.
 * d(repère) décroît strictement avec le repère (pose = repère + d + demi-corps) :
 * bissection sur [0, 14]. Aucune autre borne n'est lue. */
export function fitAxialDatum(
  effectiveLengthMm: number, k: number, model: ResponseModel, conv: DistanceConvention, rows?: FormRow[],
): DatumFit {
  const publishedMm = formRowFor(DATUM_ANCHOR.className, SMCO, rows)!.distances[DATUM_ANCHOR.approach]!.upMm!;
  const thetaMT = thetaFor(DATUM_ANCHOR.className, DATUM_ANCHOR.bound, k)!;
  const sc = scenarioForLength(effectiveLengthMm);
  const at = (datum: number) => distanceFor(SMCO, DATUM_ANCHOR.approach, thetaMT, conv, model, undefined, sc, datum);
  let lo = 0, hi = 14; // f décroissante : f(lo) > publié, f(hi) < publié
  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    const v = at(mid);
    if (v.ok && v.value > publishedMm) lo = mid; else hi = mid;
  }
  const datumMm = (lo + hi) / 2;
  const v = at(datumMm);
  return { datumMm, publishedMm, residualMm: v.ok ? v.value - publishedMm : NaN, thetaMT };
}

// --- Correction scalaire D4 sur l'ancre D4 ---
export interface D4Correction { deltaMm: number; publishedMm: number; rawMm: number; thetaMT: number }
/** Retrait SCALAIRE δ tel que (brut − δ) de l'ancre D4 égale le publié.
 * δ = brut − publié. Correction de tableau uniquement : elle ne déplace ni
 * l'aimant ni la réponse, et ne définit aucun repère de face commun D1/D4. */
export function fitD4Correction(
  effectiveLengthMm: number, k: number, model: ResponseModel, conv: DistanceConvention, rows?: FormRow[],
): D4Correction {
  const publishedMm = formRowFor(D4_ANCHOR.className, SMCO, rows)!.distances[D4_ANCHOR.approach]!.upMm!;
  const thetaMT = thetaFor(D4_ANCHOR.className, D4_ANCHOR.bound, k)!;
  const sc = scenarioForLength(effectiveLengthMm);
  const raw = distanceFor(SMCO, D4_ANCHOR.approach, thetaMT, conv, model, undefined, sc);
  if (!raw.ok) throw new Error(`ancre D4 incalculable : ${raw.reason}`);
  return { deltaMm: raw.value - publishedMm, publishedMm, rawMm: raw.value, thetaMT };
}

// --- Diagnostic B′ (strictement hors moteur : moyennes d'evaluatePose seules) ---
/** B′ = √(|M1·M2|) si M1·M2 > 0, sinon 0. Point par point : B′ ≥ B, car pour des
 * signes concordants √(|M1·M2|) ≥ min(|M1|, |M2|), et sinon les deux sont nuls. */
export const bPrime = (m1: number, m2: number): number => (m1 * m2 > 0 ? Math.sqrt(Math.abs(m1 * m2)) : 0);

function responseBPrimeAt(
  magnet: PilotMagnet, approach: "D1" | "D3" | "D4" | "D5", d: number, conv: DistanceConvention,
  scenario: ReturnType<typeof scenarioForLength>, datumMm?: number,
): Value {
  const datum = datumMm ?? PROFILE.reed.effectiveLengthMm / 2;
  const at = (x: number) => {
    const e = evaluatePose(magnet, approachPose(magnet, approach, d, conv, x, datum), scenario, "B");
    return e.ok ? bPrime(e.m1, e.m2) : -1;
  };
  if (approach === "D1" || approach === "D3") {
    const v = at(0);
    return v >= 0 ? { ok: true, value: v, x: 0 } : { ok: false, reason: "collision" };
  }
  // Maximum de lobe sur t ≥ 0, même balayage/section dorée que calibration.ts.
  let best = -1, bx = 0;
  for (let x = 0; x <= PROFILE.search.xScanMaxMm + 1e-9; x += PROFILE.search.xScanStepMm) {
    const v = at(x);
    if (v > best) { best = v; bx = x; }
  }
  if (best < 0) return { ok: false, reason: "collision" };
  let lo = Math.max(0, bx - PROFILE.search.xScanStepMm), hi = bx + PROFILE.search.xScanStepMm;
  const gr = (Math.sqrt(5) - 1) / 2;
  let c = hi - gr * (hi - lo), e = lo + gr * (hi - lo), fc = at(c), fe = at(e);
  while (hi - lo > PROFILE.search.goldenTolMm) {
    if (fc > fe) { hi = e; e = c; fe = fc; c = hi - gr * (hi - lo); fc = at(c); }
    else { lo = c; c = e; fc = fe; e = lo + gr * (hi - lo); fe = at(e); }
  }
  const xm = (lo + hi) / 2, vm = at(xm);
  return vm >= best ? { ok: true, value: vm, x: xm } : { ok: true, value: best, x: bx };
}

/** Recherche de distance avec réponse B′ — DIAGNOSTIC uniquement (variante bprime). */
export function distanceForBPrime(
  magnet: PilotMagnet, approach: "D1" | "D3" | "D4" | "D5", theta: number, conv: DistanceConvention,
  effectiveLengthMm: number, datumMm?: number,
): Value {
  if (!(theta > 0) || !Number.isFinite(theta)) return { ok: false, reason: "threshold" };
  const sc = scenarioForLength(effectiveLengthMm);
  const { dMaxMm, dScanStepMm, bisectTolMm } = PROFILE.search;
  const top = responseBPrimeAt(magnet, approach, dMaxMm, conv, sc, datumMm);
  if (top.ok && top.value >= theta) return { ok: false, reason: "beyond_domain" };
  for (let d = dMaxMm - dScanStepMm; d >= 0; d -= dScanStepMm) {
    const v = responseBPrimeAt(magnet, approach, d, conv, sc, datumMm);
    if (!v.ok) return { ok: false, reason: "collision_before_threshold" };
    if (v.value >= theta) {
      let lo = d, hi = d + dScanStepMm;
      while (hi - lo > bisectTolMm) {
        const mid = (lo + hi) / 2, m = responseBPrimeAt(magnet, approach, mid, conv, sc, datumMm);
        if (m.ok && m.value >= theta) lo = mid; else hi = mid;
      }
      return { ok: true, value: (lo + hi) / 2, x: v.x };
    }
  }
  return { ok: false, reason: "not_reached" };
}

// --- Variantes : 2 longueurs × 3 modes ---
export type Pass3Mode = "axial" | "bprime" | "d4corr";
export interface Pass3Variant { id: string; label: string; lengthMm: number | "fitted"; mode: Pass3Mode; note: string }
export const PASS3_VARIANTS: Pass3Variant[] = [
  { id: "L16-axial", label: "L = 16 mm, repère axial recalé", lengthMm: 16, mode: "axial", note: "Repère axial ajusté sur l'unique ancre C-SmCo-D3-up ; aucune correction D4." },
  { id: "L16-bprime", label: "L = 16 mm, diagnostic B′ sur D4", lengthMm: 16, mode: "bprime", note: "D4 estimé avec B′ = √(|M1·M2|), L/k/repère inchangés. B′ ≥ B point par point : ne peut pas raccourcir D4 à seuils égaux. Diagnostic strict, aucune activation." },
  { id: "L16-d4corr", label: "L = 16 mm, repère recalé + correction scalaire D4", lengthMm: 16, mode: "d4corr", note: "Retrait scalaire D4 ajusté sur l'unique ancre C-SmCo-D4-up. Correction de tableau, pas une transformation 3D." },
  { id: "Lfit-axial", label: "L ajusté D1, repère axial recalé", lengthMm: "fitted", mode: "axial", note: "L par accord inter-aimants D1 (lot 2) ; repère axial sur la même ancre." },
  { id: "Lfit-bprime", label: "L ajusté D1, diagnostic B′ sur D4", lengthMm: "fitted", mode: "bprime", note: "Même diagnostic B′ que L16-bprime." },
  { id: "Lfit-d4corr", label: "L ajusté D1, repère recalé + correction scalaire D4", lengthMm: "fitted", mode: "d4corr", note: "Même correction scalaire D4 que L16-d4corr." },
];

// --- Tableau 112 lignes : brute / corrigée / erreur distinguées ---
export type Pass3Status = "training" | "anchor_datum" | "anchor_d4" | "control" | "missing" | "unavailable" | "no_source";
export interface Pass3Row {
  className: string; approach: "D1" | "D3" | "D4" | "D5"; bound: Bound; magnetId: string;
  at: number | null; thetaMT: number | null; publishedMm: number | null;
  /** Estimation BRUTE physique (modèle B ; B′ sur D4 pour la variante bprime). */
  estimatedRawMm: number | null;
  /** Estimation documentaire RETENUE : brute − δD4 pour D4 en mode d4corr, brute sinon. */
  estimatedMm: number | null;
  errorMm: number | null; errorPct: number | null; status: Pass3Status; notes: string[];
}
export interface Pass3Params {
  effectiveLengthMm: number; k: number; axialDatumMm: number; mode: Pass3Mode;
  /** Retrait scalaire D4 (mm) ; ignoré hors mode d4corr. */
  d4DeltaMm: number;
  model: ResponseModel; conv: DistanceConvention;
}

export function buildPass3Table(p: Pass3Params, rows?: FormRow[]): Pass3Row[] {
  const sc = scenarioForLength(p.effectiveLengthMm);
  const out: Pass3Row[] = [];
  for (const className of AT_CLASSES)
    for (const m of PILOT_MAGNETS)
      for (const approach of ["D1", "D3", "D4", "D5"] as const)
        for (const bound of ["up", "to"] as const) {
          const theta = thetaFor(className, bound, p.k);
          const fr = formRowFor(className, m, rows);
          const fd = fr?.distances[approach];
          const publishedMm = fd ? (bound === "up" ? fd.upMm : fd.toMm) : null;
          const d = theta == null
            ? null
            : p.mode === "bprime" && approach === "D4"
              ? distanceForBPrime(m, approach, theta, p.conv, p.effectiveLengthMm, p.axialDatumMm)
              : distanceFor(m, approach, theta, p.conv, p.model, undefined, sc, p.axialDatumMm);
          const rawMm = d?.ok ? d.value : null;
          const corrected = rawMm != null && p.mode === "d4corr" && approach === "D4" ? rawMm - p.d4DeltaMm : rawMm;
          const training = (className === "C" || className === "E") && approach === "D1";
          const anchorDatum = isAnchor(DATUM_ANCHOR, className, m.id, approach, bound);
          const anchorD4 = p.mode === "d4corr" && isAnchor(D4_ANCHOR, className, m.id, approach, bound);
          const notes: string[] = [];
          if (training) notes.push("apprentissage : k ajusté sur cette borne (lot 2)");
          if (anchorDatum) notes.push("ancre : repère axial ajusté sur cette borne — exclue du contrôle");
          if (anchorD4) notes.push("ancre : correction scalaire D4 ajustée sur cette borne — exclue du contrôle");
          if (p.mode === "d4corr" && approach === "D4" && !anchorD4)
            notes.push(`estimation corrigée = brute − ${round(p.d4DeltaMm, 6)} mm (retrait scalaire de tableau, pas une transformation 3D)`);
          if (p.mode === "bprime" && approach === "D4") notes.push("diagnostic B′ = √(|M1·M2|) : aucune activation, aucun second calcul de champ");
          if (!fr) notes.push("classe absente de la transcription Form 66 : aucune validation prétendue");
          if (theta != null && rawMm == null && d && !d.ok) notes.push(`estimation indisponible : ${d.reason}`);
          const status: Pass3Status = !fr
            ? "no_source"
            : publishedMm == null
              ? "missing"
              : rawMm == null
                ? "unavailable"
                : training
                  ? "training"
                  : anchorDatum
                    ? "anchor_datum"
                    : anchorD4
                      ? "anchor_d4"
                      : "control";
          const errorMm = publishedMm != null && corrected != null ? round(corrected - publishedMm) : null;
          out.push({
            className, approach, bound, magnetId: m.id,
            at: theta == null ? null : bound === "up" ? atRange(className)!.max : atRange(className)!.min,
            thetaMT: theta == null ? null : round(theta, 6), publishedMm,
            estimatedRawMm: rawMm == null ? null : round(rawMm),
            estimatedMm: corrected == null ? null : round(corrected),
            errorMm, errorPct: errorMm != null && publishedMm ? round((100 * errorMm) / publishedMm, 2) : null,
            status, notes,
          });
        }
  return out;
}

// --- Contrôles : classes B..E, approches D3/D4/D5, ancres exclues ---
export function pass3ControlRows(table: Pass3Row[]): Pass3Row[] {
  return table.filter(
    (r) =>
      (r.className === "B" || r.className === "C" || r.className === "D" || r.className === "E") &&
      r.approach !== "D1" &&
      r.publishedMm != null &&
      r.status !== "anchor_datum" &&
      r.status !== "anchor_d4",
  );
}

export interface ApproachBias { approach: string; n: number; meanMm: number | null; medianMm: number | null }
export interface Pass3Score {
  total: number; passed: number; failed: number; unavailable: number; ratio: number | null;
  medianAbsMm: number | null; maxAbsMm: number | null;
  biases: ApproachBias[]; pass: boolean;
  failures: { className: string; magnetId: string; approach: string; bound: string; publishedMm: number; estimatedMm: number; errorMm: number }[];
}
export function scorePass3(rows: Pass3Row[]): Pass3Score {
  const cmp = rows.filter((r) => r.errorMm != null);
  const unavailable = rows.length - cmp.length;
  const passed = cmp.filter((r) => boundPasses(r.publishedMm!, r.errorMm!));
  const abs = cmp.map((r) => Math.abs(r.errorMm!));
  const biases: ApproachBias[] = (["D3", "D4", "D5"] as const).map((a) => {
    const errs = cmp.filter((r) => r.approach === a).map((r) => r.errorMm!);
    return {
      approach: a, n: errs.length,
      meanMm: errs.length ? round(errs.reduce((s, e) => s + e, 0) / errs.length, 6) : null,
      medianMm: medianOf(errs),
    };
  });
  const ratio = rows.length ? passed.length / rows.length : null;
  const biasOk = biases.every((b) => b.n === 0 || (Math.abs(b.meanMm!) <= PASS3_CRITERION.maxAbsBiasMm && Math.abs(b.medianMm!) <= PASS3_CRITERION.maxAbsBiasMm));
  const pass = ratio != null && ratio >= PASS3_CRITERION.minPassRatio && biasOk;
  return {
    total: rows.length, passed: passed.length, failed: cmp.length - passed.length, unavailable,
    ratio: ratio == null ? null : round(ratio, 4),
    medianAbsMm: medianOf(abs), maxAbsMm: abs.length ? round(Math.max(...abs), 6) : null,
    biases, pass,
    failures: cmp
      .filter((r) => !boundPasses(r.publishedMm!, r.errorMm!))
      .map((r) => ({ className: r.className, magnetId: r.magnetId, approach: r.approach, bound: r.bound, publishedMm: r.publishedMm!, estimatedMm: r.estimatedMm!, errorMm: r.errorMm! })),
  };
}

/** Résultats séparés CE / BD et groupés, comme demandé. */
export interface Pass3Scores { ce: Pass3Score; bd: Pass3Score; grouped: Pass3Score }
export function scorePass3Groups(table: Pass3Row[]): Pass3Scores {
  const controls = pass3ControlRows(table);
  return {
    ce: scorePass3(controls.filter((r) => r.className === "C" || r.className === "E")),
    bd: scorePass3(controls.filter((r) => r.className === "B" || r.className === "D")),
    grouped: scorePass3(controls),
  };
}

/** Classes A/F : jamais dans le critère ; résumé séparé, toutes approches. */
export function scoreAF(table: Pass3Row[]): Pass3Score {
  return scorePass3(table.filter((r) => (r.className === "A" || r.className === "F") && r.publishedMm != null));
}

// --- Résolution complète d'une variante ---
export interface Pass3Result {
  variant: Pass3Variant; effectiveLengthMm: number; k: number;
  datum: DatumFit; d4: D4Correction | null;
  table: Pass3Row[]; scores: Pass3Scores; af: Pass3Score;
}
export function runPass3Variant(
  variant: Pass3Variant, model: ResponseModel, conv: DistanceConvention,
  lengthFitMm?: number, rows?: FormRow[],
): Pass3Result {
  const L = variant.lengthMm === "fitted" ? (lengthFitMm ?? fitLength(model, conv, rows).effectiveLengthMm) : variant.lengthMm;
  const k = fitK(L, model, conv, rows).k;
  const datum = fitAxialDatum(L, k, model, conv, rows);
  const d4 = variant.mode === "d4corr" ? fitD4Correction(L, k, model, conv, rows) : null;
  const table = buildPass3Table(
    { effectiveLengthMm: L, k, axialDatumMm: datum.datumMm, mode: variant.mode, d4DeltaMm: d4?.deltaMm ?? 0, model, conv },
    rows,
  );
  return { variant, effectiveLengthMm: L, k, datum, d4, table, scores: scorePass3Groups(table), af: scoreAF(table) };
}

// --- Graphique SVG simple : écarts signés par classe et aimant ---
export interface LabPalette { fav: string; var: string; far: string; orient: string; undet: string; na: string; ink: string }
/** Points = écarts signés (mm) des contrôles, x = borne groupée par classe, couleur = aimant.
 * Lignes ±1 mm et 0 rappelées ; la tolérance réelle est max(1 mm, 15 %) par borne. */
export function signedErrorsSvg(title: string, rows: Pass3Row[], palette: LabPalette): string {
  const W = 960, H = 420, ml = 56, mr = 16, mt = 44, mb = 64;
  const pw = W - ml - mr, ph = H - mt - mb;
  const errs = rows.map((r) => r.errorMm!).filter((v) => v != null);
  const maxAbs = Math.max(1, ...errs.map(Math.abs));
  const yMax = Math.ceil(maxAbs * 1.15 * 2) / 2;
  const sx = (i: number) => ml + (pw * (i + 0.5)) / rows.length;
  const sy = (e: number) => mt + ph / 2 - (e / yMax) * (ph / 2);
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="sans-serif" font-size="14">`,
    `<rect width="${W}" height="${H}" fill="#ffffff"/>`,
    `<text x="${ml}" y="26" font-size="16" fill="${palette.ink}">${esc(title)}</text>`,
    // bande ±1 mm et axe 0
    `<rect x="${ml}" y="${sy(1)}" width="${pw}" height="${sy(-1) - sy(1)}" fill="${palette.undet}" opacity="0.18"/>`,
    `<line x1="${ml}" y1="${sy(0)}" x2="${W - mr}" y2="${sy(0)}" stroke="${palette.ink}" stroke-width="1"/>`,
    `<line x1="${ml}" y1="${sy(1)}" x2="${W - mr}" y2="${sy(1)}" stroke="${palette.ink}" stroke-width="0.5" stroke-dasharray="4 3"/>`,
    `<line x1="${ml}" y1="${sy(-1)}" x2="${W - mr}" y2="${sy(-1)}" stroke="${palette.ink}" stroke-width="0.5" stroke-dasharray="4 3"/>`,
    `<text x="8" y="${sy(0) + 5}" fill="${palette.ink}">0</text>`,
    `<text x="8" y="${sy(1) + 5}" fill="${palette.ink}">+1</text>`,
    `<text x="8" y="${sy(-1) + 5}" fill="${palette.ink}">−1</text>`,
    `<text x="8" y="${sy(yMax) + 5}" fill="${palette.ink}">+${yMax}</text>`,
    `<text x="8" y="${sy(-yMax) + 5}" fill="${palette.ink}">−${yMax}</text>`,
  ];
  const classes = [...new Set(rows.map((r) => r.className))];
  for (const cl of classes) {
    const first = rows.findIndex((r) => r.className === cl);
    const last = rows.length - 1 - [...rows].reverse().findIndex((r) => r.className === cl);
    parts.push(`<text x="${(sx(first) + sx(last)) / 2 - 6}" y="${H - mb + 20}" fill="${palette.ink}">${cl}</text>`);
    if (first > 0) parts.push(`<line x1="${ml + (pw * first) / rows.length}" y1="${mt}" x2="${ml + (pw * first) / rows.length}" y2="${H - mb}" stroke="${palette.ink}" stroke-width="0.4" stroke-dasharray="2 4"/>`);
  }
  rows.forEach((r, i) => {
    if (r.errorMm == null) {
      parts.push(`<text x="${sx(i) - 4}" y="${sy(0) - 6}" font-size="12" fill="${palette.na}">∅</text>`);
      return;
    }
    const color = r.magnetId === "SMCO5-5X4" ? palette.fav : palette.var;
    const ok = boundPasses(r.publishedMm!, r.errorMm);
    parts.push(
      `<circle cx="${sx(i)}" cy="${sy(r.errorMm)}" r="4" fill="${ok ? color : palette.far}" opacity="0.85">` +
        `<title>${r.className} ${r.magnetId} ${r.approach} ${r.bound} : publié ${r.publishedMm} mm, estimé ${r.estimatedMm} mm, écart ${r.errorMm} mm${ok ? "" : " — HORS tolérance"}</title></circle>`,
    );
  });
  parts.push(
    `<circle cx="${ml + 8}" cy="${H - 26}" r="4" fill="${palette.fav}"/><text x="${ml + 18}" y="${H - 22}" fill="${palette.ink}">SmCo5 5×4</text>`,
    `<circle cx="${ml + 118}" cy="${H - 26}" r="4" fill="${palette.var}"/><text x="${ml + 128}" y="${H - 22}" fill="${palette.ink}">NdFeB N45 4×19</text>`,
    `<circle cx="${ml + 248}" cy="${H - 26}" r="4" fill="${palette.far}"/><text x="${ml + 258}" y="${H - 22}" fill="${palette.ink}">hors tolérance max(1 mm, 15 %)</text>`,
    `<text x="${ml + 8}" y="${H - 6}" font-size="12" fill="${palette.ink}">Écarts signés estimation − publié (mm), contrôles B–E D3/D4/D5, ancres exclues. La bande ±1 mm n'est qu'un repère : la tolérance est max(1 mm, 15 % du publié).</text>`,
    `</svg>`,
  );
  return parts.join("\n");
}
