/** Expérience de calibration PASS 2 — proposition reçue : θ = k·AT, longueur
 * effective L et repère axial D3/D5 EXPLICITES et indépendants.
 *
 * AUCUNE physique dupliquée : toutes les réponses viennent d'evaluatePose.
 * L entre par le scénario (lengthFactor relatif au profil 1.1), le repère axial
 * par le paramètre datumMm des MÊMES fonctions de recherche que le lot 1.
 * Le profil 1.1, les seuils partagés du lot 1 et l'interface ne sont pas modifiés.
 *
 * Module pur : aucun DOM, React, Three ni backend.
 *
 * Avertissements portés par chaque résultat :
 * - L et le repère sont des PARAMÈTRES AJUSTÉS, pas des dimensions prouvées ;
 *   L = 16 mm ne prouve pas des pattes de 1 mm.
 * - Les plages AT viennent de la fiche MK04 uniquement ; θ = k·AT n'est pas une
 *   conversion physique mT/AT universalisable.
 */
import atData from "@/data/detection-lab/at-classes-mk04.json";
import formData from "@/data/detection-lab/brochure-form-rows.json";
import { distanceFor, responseAt, type ApproachId } from "./calibration";
import { PILOT_MAGNETS, type PilotMagnet } from "./magnets";
import type { Bound } from "./pilot";
import { PROFILE, type DistanceConvention, type ReedScenario, type ResponseModel } from "./profile";

export const PASS2_VERSION = "reed-lab-pass2-1.0.0";

// --- Classes AT (fiche MK04 p2, vérifiée le 2026-10-27) ---
export const AT_SOURCE = (atData as { source: { title: string; url: string; checkedOn: string } }).source;
export const AT_NOTICE = (atData as { notice: string }).notice;
const AT_ROWS = (atData as { classes: Record<string, { min: number; max: number }> }).classes;
export const AT_CLASSES = Object.keys(AT_ROWS).sort();
export function atRange(className: string): { min: number; max: number } | null {
  return AT_ROWS[className] ?? null;
}
/** θ = k·AT : borne up = AT max (extrémité moins sensible), borne to = AT min. */
export function thetaFor(className: string, bound: Bound, k: number): number | null {
  const r = atRange(className);
  return r == null ? null : k * (bound === "up" ? r.max : r.min);
}

// --- Données Form (même transcription versionnée que le lot 1, jamais corrigée) ---
interface FormDistance { upRaw: string; toRaw: string; upMm: number | null; toMm: number | null }
export interface FormRow { page: number; printedLabel: string; reedLabel: string; class: string; magnetLabel: string; momentRaw: string; distances: Record<string, FormDistance> }
const FORM_ROWS = (formData as { rows: FormRow[] }).rows;
export function formRowFor(className: string, magnet: PilotMagnet, rows: FormRow[] = FORM_ROWS): FormRow | undefined {
  return rows.find((r) => r.reedLabel === "66-er" && r.class === className && r.magnetLabel === magnet.label);
}

/** Scénario nominal de longueur effective L : la physique reste evaluatePose,
 * seule la longueur d'intégration change (facteur relatif au profil 1.1). */
export function scenarioForLength(effectiveLengthMm: number): ReedScenario {
  return { id: `L=${effectiveLengthMm}mm`, lengthFactor: effectiveLengthMm / PROFILE.reed.effectiveLengthMm, shift: [0, 0, 0], momentFactor: 1 };
}

// --- Apprentissage : UNIQUEMENT les 8 bornes D1 Form C/E × 2 aimants ---
export interface TrainingBound { className: string; magnetId: string; bound: Bound; at: number; publishedMm: number }
export function trainingBounds(rows: FormRow[] = FORM_ROWS): TrainingBound[] {
  const out: TrainingBound[] = [];
  for (const className of ["C", "E"] as const)
    for (const m of PILOT_MAGNETS) {
      const fr = formRowFor(className, m, rows);
      if (!fr) continue;
      for (const bound of ["up", "to"] as const) {
        const publishedMm = bound === "up" ? fr.distances["D1"]!.upMm : fr.distances["D1"]!.toMm;
        const at = bound === "up" ? atRange(className)!.max : atRange(className)!.min;
        if (publishedMm != null) out.push({ className, magnetId: m.id, bound, at, publishedMm });
      }
    }
  return out;
}

const magnetById = (id: string): PilotMagnet => PILOT_MAGNETS.find((m) => m.id === id)!;

export interface KFitResidual { bound: TrainingBound; thetaMT: number; estimatedMm: number | null; errorMm: number | null; errorPct: number | null }
export interface KFit { k: number; sse: number; residuals: KFitResidual[]; medianAbsPct: number | null }

/** Ajustement de k (mT/AT) par moindres carrés sur les distances D1 d'apprentissage.
 * D1 ne dépend pas du repère axial : k est identique quel que soit datumMm.
 * Aucune borne de contrôle (D3/D4/D5, autres classes) n'est lue ici. */
export function fitK(effectiveLengthMm: number, model: ResponseModel, conv: DistanceConvention, rows?: FormRow[]): KFit {
  const bounds = trainingBounds(rows);
  const sc = scenarioForLength(effectiveLengthMm);
  const sse = (k: number) =>
    bounds.reduce((s, b) => {
      const d = distanceFor(magnetById(b.magnetId), "D1", k * b.at, conv, model, undefined, sc);
      return s + (d.ok ? (d.value - b.publishedMm) ** 2 : 1e6);
    }, 0);
  let lo = 0.02, hi = 0.6;
  const gr = (Math.sqrt(5) - 1) / 2;
  let c = hi - gr * (hi - lo), e = lo + gr * (hi - lo), fc = sse(c), fe = sse(e);
  for (let i = 0; i < 80; i++) {
    if (fc < fe) { hi = e; e = c; fe = fc; c = hi - gr * (hi - lo); fc = sse(c); }
    else { lo = c; c = e; fc = fe; e = lo + gr * (hi - lo); fe = sse(e); }
  }
  const k = (lo + hi) / 2;
  const residuals: KFitResidual[] = bounds.map((b) => {
    const d = distanceFor(magnetById(b.magnetId), "D1", k * b.at, conv, model, undefined, sc);
    const errorMm = d.ok ? d.value - b.publishedMm : null;
    return { bound: b, thetaMT: k * b.at, estimatedMm: d.ok ? d.value : null, errorMm, errorPct: errorMm != null ? (100 * errorMm) / b.publishedMm : null };
  });
  const pcts = residuals.filter((r) => r.errorPct != null).map((r) => Math.abs(r.errorPct!)).sort((a, b) => a - b);
  const medianAbsPct = pcts.length ? (pcts.length % 2 ? pcts[(pcts.length - 1) / 2]! : (pcts[pcts.length / 2 - 1]! + pcts[pcts.length / 2]!) / 2) : null;
  return { k, sse: sse(k), residuals, medianAbsPct };
}

export interface LengthFitPair { className: string; bound: Bound; thetaSmCo: number | null; thetaN45: number | null }
export interface LengthFit { effectiveLengthMm: number; rmsLogDisagreement: number; pairs: LengthFitPair[] }

/** Ajustement de L par accord INTER-AIMANTS sur D1 seul : minimise
 * Σ (log θ_N45 − log θ_SmCo)² sur les bornes d'apprentissage. Paramètre ajusté,
 * pas une dimension prouvée. Aucune borne de contrôle n'est lue. */
export function fitLength(model: ResponseModel, conv: DistanceConvention, rows?: FormRow[]): LengthFit {
  const bounds = trainingBounds(rows);
  const theta = (m: PilotMagnet, b: TrainingBound, L: number) => {
    const v = responseAt(m, "D1", b.publishedMm, conv, model, undefined, scenarioForLength(L));
    return v.ok && v.value > 0 ? v.value : null;
  };
  const sse = (L: number) =>
    bounds.reduce((s, b) => {
      const ts = theta(PILOT_MAGNETS[0]!, b, L), tn = theta(PILOT_MAGNETS[1]!, b, L);
      return s + (ts != null && tn != null ? (Math.log(tn) - Math.log(ts)) ** 2 : 1e6);
    }, 0);
  let lo = 4, hi = 30;
  const gr = (Math.sqrt(5) - 1) / 2;
  let c = hi - gr * (hi - lo), e = lo + gr * (hi - lo), fc = sse(c), fe = sse(e);
  for (let i = 0; i < 80; i++) {
    if (fc < fe) { hi = e; e = c; fe = fc; c = hi - gr * (hi - lo); fc = sse(c); }
    else { lo = c; c = e; fc = fe; e = lo + gr * (hi - lo); fe = sse(e); }
  }
  const L = (lo + hi) / 2;
  const pairs: LengthFitPair[] = bounds.map((b) => ({ className: b.className, bound: b.bound, thetaSmCo: theta(PILOT_MAGNETS[0]!, b, L), thetaN45: theta(PILOT_MAGNETS[1]!, b, L) }));
  return { effectiveLengthMm: L, rmsLogDisagreement: Math.sqrt(sse(L) / Math.max(1, bounds.length)), pairs };
}

// --- Tableau complet : classes A..G, toutes approches, disponibilité réelle ---
export type Pass2Status = "training" | "control" | "missing" | "unavailable" | "no_source";
export interface Pass2Row {
  className: string; approach: ApproachId; bound: Bound; magnetId: string;
  at: number | null; thetaMT: number | null; publishedMm: number | null; estimatedMm: number | null;
  errorMm: number | null; errorPct: number | null; status: Pass2Status; notes: string[];
}
export interface Pass2Params { effectiveLengthMm: number; axialDatumMm: number; model: ResponseModel; conv: DistanceConvention; k: number }

const round = (v: number, n = 4) => Math.round(v * 10 ** n) / 10 ** n;

export function buildPass2Table(p: Pass2Params, rows?: FormRow[]): Pass2Row[] {
  const sc = scenarioForLength(p.effectiveLengthMm);
  const out: Pass2Row[] = [];
  for (const className of AT_CLASSES)
    for (const m of PILOT_MAGNETS)
      for (const approach of ["D1", "D3", "D4", "D5"] as const)
        for (const bound of ["up", "to"] as const) {
          const theta = thetaFor(className, bound, p.k);
          const fr = formRowFor(className, m, rows);
          const fd = fr?.distances[approach];
          const publishedMm = fd ? (bound === "up" ? fd.upMm : fd.toMm) : null;
          const d = theta == null ? null : distanceFor(m, approach, theta, p.conv, p.model, undefined, sc, p.axialDatumMm);
          const estimatedMm = d?.ok ? d.value : null;
          const training = (className === "C" || className === "E") && approach === "D1";
          const notes: string[] = [];
          if (training) notes.push("apprentissage : k ajusté sur cette borne");
          if ((className === "B" || className === "D") && approach === "D1") notes.push("D1 hors apprentissage : contrôle isolé");
          if (!fr) notes.push("classe absente de la transcription Form 66 : aucune validation prétendue");
          if (theta != null && estimatedMm == null && d && !d.ok) notes.push(`estimation indisponible : ${d.reason}`);
          const status: Pass2Status = !fr ? "no_source" : publishedMm == null ? "missing" : estimatedMm == null ? "unavailable" : training ? "training" : "control";
          const errorMm = publishedMm != null && estimatedMm != null ? round(estimatedMm - publishedMm) : null;
          out.push({
            className, approach, bound, magnetId: m.id,
            at: theta == null ? null : bound === "up" ? atRange(className)!.max : atRange(className)!.min,
            thetaMT: theta == null ? null : round(theta, 6), publishedMm, estimatedMm: estimatedMm == null ? null : round(estimatedMm),
            errorMm, errorPct: errorMm != null && publishedMm ? round((100 * errorMm) / publishedMm, 2) : null,
            status, notes,
          });
        }
  return out;
}

// --- Score des contrôles : TOUTES les bornes publiées C/E D3/D4/D5 ---
/** Anomalie de source SUSPECTÉE : C-N45-D3 to = 17,7, identique au D1 to du même couple.
 * Jamais corrigée dans la source ; le score secondaire l'exclut, sans exclusion opportuniste. */
export const SUSPECTED_ANOMALY = { className: "C", magnetId: "N45-4X19", approach: "D3", bound: "to", publishedMm: 17.7 } as const;
export const isSuspectedAnomaly = (r: Pass2Row): boolean =>
  r.className === SUSPECTED_ANOMALY.className && r.magnetId === SUSPECTED_ANOMALY.magnetId && r.approach === SUSPECTED_ANOMALY.approach && r.bound === SUSPECTED_ANOMALY.bound;

/** Critère reçu, explicite : médiane ≤ 10 % ET ≤ 3/23 bornes > 20 % ET aucune indisponible.
 * Si échec : pas de volume 3D. Un résidu systématique n'est pas une marge validée. */
export const CRITERION = { medianPctMax: 10, over20Max: 3, unavailableMax: 0 } as const;

export interface ControlScore {
  total: number; published: number; missing: number; computable: number; unavailable: number;
  medianAbsPct: number | null; over20: number; pass: boolean;
}
export function controlRows(table: Pass2Row[]): Pass2Row[] {
  return table.filter((r) => (r.className === "C" || r.className === "E") && r.approach !== "D1");
}
export function scoreControls(table: Pass2Row[], exclude?: (r: Pass2Row) => boolean): ControlScore {
  const rows = controlRows(table).filter((r) => !(exclude && exclude(r)));
  const published = rows.filter((r) => r.publishedMm != null);
  const cmp = published.filter((r) => r.errorPct != null);
  const pcts = cmp.map((r) => Math.abs(r.errorPct!)).sort((a, b) => a - b);
  const medianAbsPct = pcts.length ? round(pcts.length % 2 ? pcts[(pcts.length - 1) / 2]! : (pcts[pcts.length / 2 - 1]! + pcts[pcts.length / 2]!) / 2, 2) : null;
  const over20 = pcts.filter((p) => p > 20).length;
  const unavailable = published.filter((r) => r.estimatedMm == null).length;
  const pass = medianAbsPct != null && medianAbsPct <= CRITERION.medianPctMax && over20 <= CRITERION.over20Max && unavailable <= CRITERION.unavailableMax;
  return { total: rows.length, published: published.length, missing: rows.length - published.length, computable: cmp.length, unavailable, medianAbsPct, over20, pass };
}

// --- Variantes de l'expérience ---
export interface Pass2Variant { id: string; label: string; effectiveLengthMm: number | "fitted"; axialDatumMm: number; note: string }
export const PASS2_VARIANTS: Pass2Variant[] = [
  { id: "V1-L16-d7", label: "L = 16 mm, repère axial +7 mm", effectiveLengthMm: 16, axialDatumMm: 7, note: "Proposition reçue : repère à l'extrémité du verre (encombrement publié 14 mm), indépendant de L." },
  { id: "V2-L16-d4", label: "L = 16 mm, repère axial +4 mm", effectiveLengthMm: 16, axialDatumMm: 4, note: "Repère fixe +4 mm : DIAGNOSTIC uniquement, non validé physiquement." },
  { id: "V3-L8-d7", label: "L = 8 mm (profil 1.1), repère axial +7 mm", effectiveLengthMm: 8, axialDatumMm: 7, note: "Longueur effective du profil 1.1 avec le repère proposé." },
  { id: "V4-Lfit-d7", label: "L ajusté sur D1, repère axial +7 mm", effectiveLengthMm: "fitted", axialDatumMm: 7, note: "L optimisé par accord inter-aimants sur D1 seul : paramètre ajusté, pas une dimension prouvée." },
];
