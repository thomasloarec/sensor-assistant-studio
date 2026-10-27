/** Approches, recherche de racines/maxima et seuil PARTAGÉ entre aimants.
 * Un seuil par reed + classe + modèle de réponse (+ convention de datum) et par borne ;
 * jamais de facteur par aimant ou par approche. */
import { evaluatePose, type MagnetPose } from "./pose";
import { PROFILE, type DistanceConvention, type ResponseModel, type ReedScenario } from "./profile";
import type { PilotMagnet } from "./magnets";

export type ApproachId = "D1" | "D3" | "D4" | "D5";
export const APPROACHES: ApproachId[] = ["D1", "D3", "D4", "D5"];
const NOMINAL = PROFILE.scenarios[0]!;

export function approachPose(
  magnet: PilotMagnet, approach: ApproachId, d: number, conv: DistanceConvention, x = 0,
  /** Repère axial D3/D5 (mm) : défaut = demi-longueur effective du profil (lot 1). Explicite pour les expériences. */
  datumMm: number = PROFILE.reed.effectiveLengthMm / 2,
): MagnetPose {
  const r = magnet.diameterMm / 2,
    h = magnet.lengthMm / 2,
    c1 = conv === "C1";
  switch (approach) {
    case "D1":
      return { center: [x, d + (c1 ? r : 0), 0], axis: [1, 0, 0] };
    case "D3":
      return { center: [datumMm + d + (c1 ? h : 0), 0, 0], axis: [1, 0, 0] };
    case "D4":
      return { center: [x, d + (c1 ? h : 0), 0], axis: [0, 1, 0] };
    case "D5":
      // Schéma D5 (reed vertical, aimant horizontal, approche par l'extrémité) tourné
      // rigidement dans le repère reed : aimant ⟂ lames, approche selon x, lobes en ±t (= y).
      return { center: [datumMm + d + (c1 ? r : 0), x, 0], axis: [0, 1, 0] };
  }
}

export type Value = { ok: true; value: number; x: number } | { ok: false; reason: string };

/** Maximum de lobe sur le paramètre t ≥ 0 (x pour D4, y pour D5) (symétrie du nominal) : balayage puis section dorée. */
export function lobeMax(
  magnet: PilotMagnet, approach: "D4" | "D5", d: number, conv: DistanceConvention, model: ResponseModel,
  scenario: ReedScenario = NOMINAL, step: number = PROFILE.search.xScanStepMm, datumMm?: number,
): Value {
  let best = -1, bx = 0;
  const at = (x: number) => {
    const e = evaluatePose(magnet, approachPose(magnet, approach, d, conv, x, datumMm ?? PROFILE.reed.effectiveLengthMm / 2), scenario, model);
    return e.ok ? e.response : -1;
  };
  for (let x = 0; x <= PROFILE.search.xScanMaxMm + 1e-9; x += step) {
    const v = at(x);
    if (v > best) { best = v; bx = x; }
  }
  if (best < 0) return { ok: false, reason: "collision" };
  let lo = Math.max(0, bx - step), hi = bx + step;
  const gr = (Math.sqrt(5) - 1) / 2;
  let c = hi - gr * (hi - lo), e = lo + gr * (hi - lo), fc = at(c), fe = at(e);
  while (hi - lo > PROFILE.search.goldenTolMm) {
    if (fc > fe) { hi = e; e = c; fe = fc; c = hi - gr * (hi - lo); fc = at(c); }
    else { lo = c; c = e; fc = fe; e = lo + gr * (hi - lo); fe = at(e); }
  }
  const xm = (lo + hi) / 2, vm = at(xm);
  return vm >= best ? { ok: true, value: vm, x: xm } : { ok: true, value: best, x: bx };
}

export function responseAt(
  magnet: PilotMagnet, approach: ApproachId, d: number, conv: DistanceConvention, model: ResponseModel,
  step?: number, scenario: ReedScenario = NOMINAL, datumMm?: number,
): Value {
  if (approach === "D4" || approach === "D5") return lobeMax(magnet, approach, d, conv, model, scenario, step, datumMm);
  const e = evaluatePose(magnet, approachPose(magnet, approach, d, conv, 0, datumMm ?? PROFILE.reed.effectiveLengthMm / 2), scenario, model);
  return e.ok ? { ok: true, value: e.response, x: 0 } : { ok: false, reason: e.reason };
}

/** Plus grande distance où la réponse atteint θ (balayage descendant puis bissection). */
export function distanceFor(
  magnet: PilotMagnet, approach: ApproachId, theta: number, conv: DistanceConvention, model: ResponseModel,
  step?: number, scenario: ReedScenario = NOMINAL, datumMm?: number,
): Value {
  if (!(theta > 0) || !Number.isFinite(theta)) return { ok: false, reason: "threshold" };
  const { dMaxMm, dScanStepMm, bisectTolMm } = PROFILE.search;
  const top = responseAt(magnet, approach, dMaxMm, conv, model, step, scenario, datumMm);
  if (top.ok && top.value >= theta) return { ok: false, reason: "beyond_domain" };
  for (let d = dMaxMm - dScanStepMm; d >= 0; d -= dScanStepMm) {
    const v = responseAt(magnet, approach, d, conv, model, step, scenario, datumMm);
    if (!v.ok) return { ok: false, reason: "collision_before_threshold" };
    if (v.value >= theta) {
      let lo = d, hi = d + dScanStepMm, x = v.x;
      while (hi - lo > bisectTolMm) {
        const mid = (lo + hi) / 2, m = responseAt(magnet, approach, mid, conv, model, step, scenario, datumMm);
        if (m.ok && m.value >= theta) { lo = mid; x = m.x; } else hi = mid;
      }
      return { ok: true, value: (lo + hi) / 2, x };
    }
  }
  return { ok: false, reason: "not_reached" };
}

export interface SharedThreshold {
  className: string; model: ResponseModel; convention: DistanceConvention; bound: "up" | "to";
  implied: Record<string, number | null>;
  /** max/min des seuils implicites : désaccord entre aimants. */
  disagreement: number | null;
  shared: number | null;
  method: string;
  fitted: Record<string, number | null>;
  cross: { fromMagnet: string; toMagnet: string; predictedMm: number | null; publishedMm: number }[];
}

/** Ajustement conjoint identifié : moindres carrés sur les distances D1 de TOUS les aimants. */
export function sharedThreshold(
  magnets: PilotMagnet[], published: Record<string, number>, className: string,
  model: ResponseModel, convention: DistanceConvention, bound: "up" | "to",
): SharedThreshold {
  const implied: Record<string, number | null> = {};
  for (const m of magnets) {
    const v = responseAt(m, "D1", published[m.id]!, convention, model);
    implied[m.id] = v.ok && v.value > 0 ? v.value : null;
  }
  const vals = Object.values(implied).filter((v): v is number => v != null);
  const base = { className, model, convention, bound, implied, method: "moindres carrés conjoints sur D1 (log θ, section dorée)" };
  if (vals.length !== magnets.length) return { ...base, disagreement: null, shared: null, fitted: {}, cross: [] };
  const sse = (lt: number) => magnets.reduce((s, m) => {
    const d = distanceFor(m, "D1", Math.exp(lt), convention, model);
    return s + (d.ok ? (d.value - published[m.id]!) ** 2 : 1e6);
  }, 0);
  let lo = Math.log(Math.min(...vals)), hi = Math.log(Math.max(...vals));
  if (hi - lo > 1e-9) {
    const gr = (Math.sqrt(5) - 1) / 2;
    let c = hi - gr * (hi - lo), e = lo + gr * (hi - lo), fc = sse(c), fe = sse(e);
    for (let i = 0; i < 40; i++) {
      if (fc < fe) { hi = e; e = c; fe = fc; c = hi - gr * (hi - lo); fc = sse(c); }
      else { lo = c; c = e; fc = fe; e = lo + gr * (hi - lo); fe = sse(e); }
    }
  }
  const shared = Math.exp((lo + hi) / 2);
  const fitted: Record<string, number | null> = {};
  for (const m of magnets) { const d = distanceFor(m, "D1", shared, convention, model); fitted[m.id] = d.ok ? d.value : null; }
  const cross = magnets.flatMap((from) => magnets.filter((to) => to !== from).map((to) => {
    const d = distanceFor(to, "D1", implied[from.id]!, convention, model);
    return { fromMagnet: from.id, toMagnet: to.id, predictedMm: d.ok ? d.value : null, publishedMm: published[to.id]! };
  }));
  return { ...base, disagreement: Math.max(...vals) / Math.min(...vals), shared, fitted, cross };
}
