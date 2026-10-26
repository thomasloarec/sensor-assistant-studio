/** Couples pilotes et tableau publié / estimé / écart / anomalie.
 * Sources conservées sans correction : transcription Form (96 lignes) et
 * tableaux commerciaux existants (activation-guide.json). */
import formData from "@/data/detection-lab/brochure-form-rows.json";
import guide from "@/data/studio-v2/activation-guide.json";
import { APPROACHES, distanceFor, sharedThreshold, type ApproachId, type SharedThreshold } from "./calibration";
import { PILOT_MAGNETS, type PilotMagnet } from "./magnets";
import type { DistanceConvention, ResponseModel } from "./profile";

export const PILOT_CLASSES = ["C", "E"] as const;
export type PilotClass = (typeof PILOT_CLASSES)[number];
export type Bound = "up" | "to";
export const BOUNDS: Bound[] = ["up", "to"];

interface FormDistance { upRaw: string; toRaw: string; upMm: number | null; toMm: number | null }
interface FormRow { page: number; printedLabel: string; reedLabel: string; class: string; magnetLabel: string; momentRaw: string; distances: Record<string, FormDistance> }
interface GuideRow { page: number; sensorFamily: string; sensorReference: string; magnetId: string; approachId: string; upMm: number | null; toMm: number | null }

export const FORM_SOURCE = (formData as { source: { url: string; sha256: string } }).source;
export const FORM_VERSION = (formData as { version: string }).version;
const FORM_ROWS = (formData as { rows: FormRow[] }).rows;
const GUIDE_ROWS = (guide as { rows: GuideRow[] }).rows;

export function formRow(className: string, magnet: PilotMagnet): FormRow | undefined {
  return FORM_ROWS.find((r) => r.reedLabel === "66-er" && r.class === className && r.magnetLabel === magnet.label);
}

/** Décalages empiriques Form → produit, vérifiés (produit = Form − décalage). Adaptation
 * DOCUMENTAIRE par borne : ce ne sont pas deux positions physiques du reed. */
export const DOC_OFFSETS: Record<"MK03" | "MK13", Record<ApproachId, Record<Bound, number>>> = {
  MK03: { D1: { up: 2.65, to: 0.95 }, D4: { up: 2.65, to: 0.95 }, D3: { up: 0.8, to: 0.8 }, D5: { up: 0.8, to: 0.8 } },
  MK13: { D1: { up: 4.5, to: 3.05 }, D4: { up: 4.5, to: 3.05 }, D3: { up: 3.4, to: 1.6 }, D5: { up: 3.4, to: 1.6 } },
};
export const KNOWN_EXCEPTIONS = [
  "MK04 D3 : 71 plages inversées sur 96 (up > to) — quarantaine, donnée inconnue.",
  "MK04 D1/D4/D5 : décalages identiques à MK13 (non utilisés pour une estimation dans ce lot).",
  "MK12 : ne suit pas une règle de décalage constant.",
  "MK21 66 D4 up : décalage non constant.",
  "La brochure n'est pas reproduite sans exceptions.",
];

export type RowStatus = "training" | "control" | "missing" | "unavailable" | "quarantine";
export interface PilotRow {
  source: "Form" | "MK03" | "MK13" | "MK04";
  page: number; reference: string; magnet: string; className: string; approach: ApproachId; bound: Bound;
  raw: string | null; published: number | null; estimated: number | null; errorMm: number | null; errorPct: number | null;
  status: RowStatus; anomalies: string[]; convention: DistanceConvention; model: ResponseModel; sharedThreshold: number | null;
}

export type Calibrations = Record<string, SharedThreshold>;
export const calKey = (c: string, b: Bound) => `${c}:${b}`;

export function buildCalibrations(model: ResponseModel, conv: DistanceConvention, magnets: PilotMagnet[] = PILOT_MAGNETS): Calibrations {
  const out: Calibrations = {};
  for (const c of PILOT_CLASSES)
    for (const b of BOUNDS) {
      const published: Record<string, number> = {};
      for (const m of magnets) published[m.id] = formRow(c, m)!.distances.D1![b === "up" ? "upMm" : "toMm"]!;
      out[calKey(c, b)] = sharedThreshold(magnets, published, c, model, conv, b);
    }
  return out;
}

const round = (v: number, n = 4) => Math.round(v * 10 ** n) / 10 ** n;

export function buildPilotTable(model: ResponseModel, conv: DistanceConvention, cal: Calibrations, magnets: PilotMagnet[] = PILOT_MAGNETS): PilotRow[] {
  const rows: PilotRow[] = [];
  const estimates = new Map<string, { value: number | null; reason?: string }>();
  for (const c of PILOT_CLASSES)
    for (const m of magnets) {
      const fr = formRow(c, m)!;
      for (const a of APPROACHES)
        for (const b of BOUNDS) {
          const th = cal[calKey(c, b)]!.shared;
          const d = th == null ? { ok: false as const, reason: "threshold" } : distanceFor(m, a, th, conv, model);
          estimates.set(`${c}|${m.id}|${a}|${b}`, d.ok ? { value: d.value } : { value: null, reason: d.reason });
          const fd = fr.distances[a]!;
          const raw = b === "up" ? fd.upRaw : fd.toRaw;
          const pub = b === "up" ? fd.upMm : fd.toMm;
          rows.push(makeRow("Form", fr.page, fr.printedLabel, m, c, a, b, raw, pub, d.ok ? d.value : null, d.ok ? undefined : d.reason, conv, model, th, a === "D1"));
        }
    }
  for (const fam of ["MK03", "MK13", "MK04"] as const)
    for (const c of PILOT_CLASSES)
      for (const m of magnets)
        for (const a of APPROACHES) {
          if (fam === "MK04" && a !== "D3") continue;
          const ref = `${fam}-1A66${c}-X`;
          const g = GUIDE_ROWS.find((r) => r.sensorReference === ref && r.magnetId === m.id && r.approachId === a);
          for (const b of BOUNDS) {
            const pub = g ? (b === "up" ? g.upMm : g.toMm) : null;
            const th = cal[calKey(c, b)]!.shared;
            if (fam === "MK04") {
              const inverted = g && g.upMm != null && g.toMm != null && g.upMm > g.toMm;
              rows.push({ source: fam, page: g?.page ?? 0, reference: ref, magnet: m.id, className: c, approach: a, bound: b, raw: pub == null ? null : String(pub), published: pub, estimated: null, errorMm: null, errorPct: null, status: "quarantine", anomalies: ["MK04 D3 en quarantaine (71/96 plages inversées)", ...(inverted ? ["plage inversée up > to"] : [])], convention: conv, model, sharedThreshold: th });
              continue;
            }
            const est = estimates.get(`${c}|${m.id}|${a}|${b}`)!;
            const value = est.value == null ? null : est.value - DOC_OFFSETS[fam][a][b];
            rows.push(makeRow(fam, g?.page ?? 0, ref, m, c, a, b, pub == null ? null : String(pub), pub, value != null && value < 0 ? null : value, est.reason ?? (value != null && value < 0 ? "negative_after_offset" : undefined), conv, model, th, false, true));
          }
        }
  return rows;
}

function makeRow(
  source: PilotRow["source"], page: number, reference: string, m: PilotMagnet, c: string, a: ApproachId, b: Bound,
  raw: string | null, pub: number | null, est: number | null, reason: string | undefined,
  conv: DistanceConvention, model: ResponseModel, th: number | null, training: boolean, adapted = false,
): PilotRow {
  const anomalies: string[] = [];
  if (raw && raw.includes(",")) anomalies.push(`virgule décimale dans la source (« ${raw} »)`);
  if (raw === "-" || pub == null) anomalies.push("borne non publiée");
  if (reason) anomalies.push(`estimation indisponible : ${reason}`);
  if (adapted) anomalies.push("adaptation documentaire Form→produit (décalage empirique)");
  if (source !== "Form" && a === "D1") anomalies.push("D1 produit : dérivé du D1 d'apprentissage Form, pas un contrôle indépendant de la physique");
  const errorMm = pub != null && est != null ? round(est - pub) : null;
  const errorPct = errorMm != null && pub ? round((100 * errorMm) / pub, 2) : null;
  if (errorPct != null && Math.abs(errorPct) > 20) anomalies.push("écart > 20 %");
  const status: RowStatus = pub == null ? "missing" : est == null ? "unavailable" : training ? "training" : "control";
  return { source, page, reference, magnet: m.id, className: c, approach: a, bound: b, raw, published: pub, estimated: est == null ? null : round(est), errorMm, errorPct, status, anomalies, convention: conv, model, sharedThreshold: th == null ? null : round(th, 6) };
}

export interface TableSummary {
  total: number; byStatus: Record<RowStatus, number>;
  controls: { n: number; meanAbsMm: number | null; medianAbsPct: number | null; over20: number };
  training: { n: number; meanAbsMm: number | null };
}
export function summarize(rows: PilotRow[]): TableSummary {
  const byStatus = { training: 0, control: 0, missing: 0, unavailable: 0, quarantine: 0 } as Record<RowStatus, number>;
  rows.forEach((r) => byStatus[r.status]++);
  const ctl = rows.filter((r) => r.status === "control" && r.errorMm != null);
  const tr = rows.filter((r) => r.status === "training" && r.errorMm != null);
  const mean = (v: number[]) => (v.length ? round(v.reduce((s, x) => s + x, 0) / v.length, 3) : null);
  const pcts = ctl.map((r) => Math.abs(r.errorPct!)).sort((a, b) => a - b);
  const median = pcts.length ? round(pcts.length % 2 ? pcts[(pcts.length - 1) / 2]! : (pcts[pcts.length / 2 - 1]! + pcts[pcts.length / 2]!) / 2, 2) : null;
  return {
    total: rows.length, byStatus,
    controls: { n: ctl.length, meanAbsMm: mean(ctl.map((r) => Math.abs(r.errorMm!))), medianAbsPct: median, over20: pcts.filter((p) => p > 20).length },
    training: { n: tr.length, meanAbsMm: mean(tr.map((r) => Math.abs(r.errorMm!))) },
  };
}
