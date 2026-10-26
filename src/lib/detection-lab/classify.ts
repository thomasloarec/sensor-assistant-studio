/** Classification par accord des scénarios, diagnostic contrefactuel,
 * suggestions limitées, coupes 2D et trajet — tous via evaluatePose. */
import { approachPose, distanceFor } from "./calibration";
import type { Vec3 } from "./field";
import type { PilotMagnet } from "./magnets";
import { calKey, type Calibrations, type PilotClass } from "./pilot";
import { evaluatePose, normalize, type MagnetPose } from "./pose";
import { PROFILE, type DistanceConvention, type ResponseModel, type ReedScenario } from "./profile";

export type Category = "favorable" | "variable" | "unfavorable" | "unavailable";
export type Cause = "too_far" | "orientation";
export interface Thresholds { up: number; to: number }
export interface Classification {
  category: Category; cause?: Cause; reason?: string;
  /** Réponse / seuil moins sensible (up) par scénario, dans l'ordre du profil. */
  ratios: number[];
}

export function thresholdsFor(cal: Calibrations, c: PilotClass): Thresholds | null {
  const up = cal[calKey(c, "up")]?.shared, to = cal[calKey(c, "to")]?.shared;
  return up != null && to != null && up > 0 && to > 0 ? { up, to } : null;
}

const RANK: Record<Category, number> = { favorable: 3, variable: 2, unfavorable: 1, unavailable: 0 };
const PRINCIPAL: Vec3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

export function classifyPose(
  magnet: PilotMagnet, pose: MagnetPose, th: Thresholds | null, model: ResponseModel,
  scenarios: readonly ReedScenario[] = PROFILE.scenarios,
): Classification {
  if (!th) return { category: "unavailable", reason: "threshold", ratios: [] };
  const responses: number[] = [];
  for (const s of scenarios) {
    const e = evaluatePose(magnet, pose, s, model);
    if (!e.ok) return { category: "unavailable", reason: e.reason, ratios: [] };
    responses.push(e.response);
  }
  const m = PROFILE.classification.boundaryMargin;
  const ratios = responses.map((r) => r / th.up);
  if (responses.every((r) => r >= th.up * (1 + m))) return { category: "favorable", ratios };
  if (responses.every((r) => r <= th.to * (1 - m))) {
    // Contrefactuel : même centre, aimant tourné sur un axe principal (nominal).
    const best = Math.max(...PRINCIPAL.map((axis) => {
      const e = evaluatePose(magnet, { center: pose.center, axis }, scenarios[0]!, model);
      return e.ok ? e.response : 0;
    }));
    return { category: "unfavorable", cause: best >= th.to ? "orientation" : "too_far", ratios };
  }
  return { category: "variable", ratios };
}

export function rotate90(axis: Vec3, about: 0 | 1 | 2): Vec3 {
  const [x, y, z] = axis;
  if (about === 2) return [-y, x, z];
  if (about === 1) return [z, y, -x];
  return [x, -z, y];
}

export type Suggestion =
  | { kind: "shift"; dxMm: number; before: Category; after: Category; pose: MagnetPose }
  | { kind: "rotate"; about: "x" | "y" | "z"; before: Category; after: Category; pose: MagnetPose };

/** Un SEUL déplacement latéral (le long des lames) OU une rotation de 90°, recalculé et vérifié. */
export function suggest(magnet: PilotMagnet, pose: MagnetPose, th: Thresholds | null, model: ResponseModel): Suggestion | null {
  const before = classifyPose(magnet, pose, th, model).category;
  if (before === "favorable" || !th) return null;
  let best: Suggestion | null = null, bestRank = RANK[before], bestCost = Infinity;
  const consider = (s: Suggestion, cost: number) => {
    const r = RANK[s.after];
    if (s.after === "unavailable") return;
    if (r > bestRank || (r === bestRank && best && cost < bestCost)) { best = s; bestRank = r; bestCost = cost; }
  };
  const axis = normalize(pose.axis);
  if (!axis) return null;
  (["x", "y", "z"] as const).forEach((name, i) => {
    const p: MagnetPose = { center: pose.center, axis: rotate90(axis, i as 0 | 1 | 2) };
    if (Math.abs(p.axis[0] * axis[0] + p.axis[1] * axis[1] + p.axis[2] * axis[2]) > 0.999) return;
    consider({ kind: "rotate", about: name, before, after: classifyPose(magnet, p, th, model).category, pose: p }, 0.5);
  });
  const { maxShiftMm, shiftStepMm } = PROFILE.suggestions;
  for (let k = shiftStepMm; k <= maxShiftMm; k += shiftStepMm)
    for (const sgn of [1, -1]) {
      const p: MagnetPose = { center: [pose.center[0] + sgn * k, pose.center[1], pose.center[2]], axis };
      consider({ kind: "shift", dxMm: sgn * k, before, after: classifyPose(magnet, p, th, model).category, pose: p }, k);
    }
  return best;
}

export interface CutCell { x: number; y: number; category: Category; cause?: Cause; ratio: number | null }
export interface CutMark { label: string; pose: MagnetPose; category: Category; cause?: Cause }
export interface PathPoint { x: number; y: number; category: Category; cause?: Cause }
export interface Cut {
  id: string; title: string; magnetId: string; className: PilotClass; model: ResponseModel; convention: DistanceConvention;
  axis: Vec3; thresholds: Thresholds | null;
  grid: { xMin: number; xMax: number; yMin: number; yMax: number; stepMm: number };
  cells: CutCell[]; marks: CutMark[]; path?: { points: PathPoint[]; segments: { from: number; to: number; category: Category }[] };
  computeMs: number;
}

export function computeCut(
  id: string, title: string, magnet: PilotMagnet, className: PilotClass, axis: Vec3,
  model: ResponseModel, conv: DistanceConvention, cal: Calibrations,
  marks: { label: string; center: Vec3; axis?: Vec3 }[] = [], pathY?: number,
): Cut {
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  const th = thresholdsFor(cal, className);
  const g = PROFILE.grid;
  const cells: CutCell[] = [];
  for (let y = g.yMin; y <= g.yMax + 1e-9; y += g.stepMm)
    for (let x = g.xMin; x <= g.xMax + 1e-9; x += g.stepMm) {
      const c = classifyPose(magnet, { center: [x, y, 0], axis }, th, model);
      cells.push({ x, y, category: c.category, cause: c.cause, ratio: c.ratios[0] ?? null });
    }
  const markOut = marks.map((m) => {
    const pose = { center: m.center, axis: m.axis ?? axis };
    const c = classifyPose(magnet, pose, th, model);
    return { label: m.label, pose, category: c.category, cause: c.cause };
  });
  let path: Cut["path"];
  if (pathY != null) {
    const points: PathPoint[] = [];
    for (let x = -20; x <= 20 + 1e-9; x += 0.5) {
      const c = classifyPose(magnet, { center: [x, pathY, 0], axis }, th, model);
      points.push({ x, y: pathY, category: c.category, cause: c.cause });
    }
    const segments: { from: number; to: number; category: Category }[] = [];
    points.forEach((p, i) => {
      const last = segments[segments.length - 1];
      if (last && last.category === p.category) last.to = i;
      else segments.push({ from: i, to: i, category: p.category });
    });
    path = { points, segments };
  }
  const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();
  return { id, title, magnetId: magnet.id, className, model, convention: conv, axis, thresholds: th, grid: { ...g }, cells, marks: markOut, path, computeMs: Math.round(t1 - t0) };
}

/** Profondeur du trajet de la coupe 6 : fraction fixe de la portée D4 estimée (classe C, borne up). */
export function pathDepth(magnet: PilotMagnet, model: ResponseModel, conv: DistanceConvention, cal: Calibrations): number {
  const th = cal[calKey("C", "up")]?.shared;
  const d = th ? distanceFor(magnet, "D4", th, conv, model) : null;
  if (!d || !d.ok) return 8;
  return Math.round(approachPose(magnet, "D4", d.value, conv).center[1] * PROFILE.pathDepthFraction * 2) / 2;
}

export const CUT_IDS = ["1-parallel-C", "2-perpendicular-centred-C", "3-perpendicular-offset-C", "4-oblique-45-C", "5-parallel-E", "6-path-C"] as const;
export type CutId = (typeof CUT_IDS)[number];

export function computeCutById(id: CutId, magnet: PilotMagnet, model: ResponseModel, conv: DistanceConvention, cal: Calibrations): Cut {
  const yPath = pathDepth(magnet, model, conv, cal);
  const perp: Vec3 = [0, 1, 0], par: Vec3 = [1, 0, 0];
  switch (id) {
    case "1-parallel-C":
      return computeCut(id, "Axes parallèles — classe C", magnet, "C", par, model, conv, cal);
    case "2-perpendicular-centred-C":
      return computeCut(id, "Perpendiculaire centré — classe C", magnet, "C", perp, model, conv, cal, [{ label: "centré", center: [0, yPath, 0] }]);
    case "3-perpendicular-offset-C": {
      const th = thresholdsFor(cal, "C");
      const centred: MagnetPose = { center: [0, yPath, 0], axis: perp };
      const s = suggest(magnet, centred, th, model);
      const dx = s?.kind === "shift" ? s.dxMm : Math.round(PROFILE.reed.effectiveLengthMm / 2);
      return computeCut(id, "Perpendiculaire décalé — classe C", magnet, "C", perp, model, conv, cal, [
        { label: "centré", center: [0, yPath, 0] },
        { label: `décalé ${dx > 0 ? "+" : ""}${dx} mm`, center: [dx, yPath, 0] },
      ]);
    }
    case "4-oblique-45-C":
      return computeCut(id, "Orientation intermédiaire 45° — classe C", magnet, "C", [Math.SQRT1_2, Math.SQRT1_2, 0], model, conv, cal);
    case "5-parallel-E":
      return computeCut(id, "Axes parallèles — classe E", magnet, "E", par, model, conv, cal);
    case "6-path-C":
      return computeCut(id, "Trajet traversant les lobes — classe C", magnet, "C", perp, model, conv, cal, [], yPath);
  }
}
