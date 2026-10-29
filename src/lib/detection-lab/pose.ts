/** evaluatePose : SEULE fonction physique utilisée par calibration, coupes,
 * classification, parcours et suggestions. */
import { cylinderField, cylinderSignedDistance, type CylinderMagnetBody, type Vec3 } from "./field";
import { PROFILE, type ResponseModel, type ReedScenario } from "./profile";
import type { PilotMagnet } from "./magnets";

export interface MagnetPose {
  center: Vec3;
  axis: Vec3;
}
export type PoseEvaluation =
  | { ok: true; response: number; m1: number; m2: number }
  | { ok: false; reason: "collision" | "domain" | "invalid" };

const gaussCache = new Map<number, { x: number[]; w: number[] }>();
/** Nœuds/poids de Gauss-Legendre sur [-1, 1] (Newton sur P_n). */
export function gaussLegendre(n: number) {
  const hit = gaussCache.get(n);
  if (hit) return hit;
  const x: number[] = [],
    w: number[] = [];
  for (let i = 1; i <= n; i++) {
    let r = Math.cos((Math.PI * (i - 0.25)) / (n + 0.5));
    let dp = 0;
    for (let it = 0; it < 100; it++) {
      let p0 = 1,
        p1 = r;
      for (let k = 2; k <= n; k++) {
        const p2 = ((2 * k - 1) * r * p1 - (k - 1) * p0) / k;
        p0 = p1;
        p1 = p2;
      }
      dp = (n * (r * p1 - p0)) / (r * r - 1);
      const dr = p1 / dp;
      r -= dr;
      if (Math.abs(dr) < 1e-15) break;
    }
    x.push(r);
    w.push(2 / ((1 - r * r) * dp * dp));
  }
  const out = { x, w };
  gaussCache.set(n, out);
  return out;
}

export function normalize(v: Vec3): Vec3 | null {
  const n = Math.hypot(...v);
  if (!Number.isFinite(n) || n === 0) return null;
  return [v[0] / n, v[1] / n, v[2] / n];
}

export function bodyFor(magnet: PilotMagnet, pose: MagnetPose, momentFactor = 1): CylinderMagnetBody | null {
  const axis = normalize(pose.axis);
  if (!axis || !pose.center.every(Number.isFinite)) return null;
  return { radiusMm: magnet.diameterMm / 2, lengthMm: magnet.lengthMm, jT: magnet.jT * momentFactor, center: pose.center, axis };
}

/** Collision avec l'enveloppe de verre (capsule fixe du repère nominal). */
export function collides(body: CylinderMagnetBody, shift: Vec3 = [0, 0, 0]): boolean {
  const { envelopeRadiusMm: r, envelopeHalfLengthMm: h } = PROFILE.reed;
  for (let x = -h; x <= h + 1e-9; x += 0.25)
    if (cylinderSignedDistance(body, [x + shift[0], shift[1], shift[2]]) < r) return true;
  return false;
}

/** Shared response of the two equally long blade averages, in mT.
 * A integrates the signed field over the full reed. B remains available for audits. */
export function reedResponse(m1: number, m2: number, model: ResponseModel | "C", epsilon = 0): number {
  if (model === "C") return signGatedResponse(m1, m2, epsilon);
  return model === "A" ? Math.abs((m1 + m2) / 2) : m1 * m2 > 0 ? Math.min(Math.abs(m1), Math.abs(m2)) : 0;
}

export function evaluatePose(
  magnet: PilotMagnet,
  pose: MagnetPose,
  scenario: ReedScenario,
  model: ResponseModel,
  quadrature: number = PROFILE.reed.quadraturePerBlade,
): PoseEvaluation {
  const body = bodyFor(magnet, pose, scenario.momentFactor);
  if (!body || !Number.isFinite(body.jT)) return { ok: false, reason: "invalid" };
  if (Math.hypot(...pose.center) > PROFILE.domain.maxCenterMm) return { ok: false, reason: "domain" };
  if (collides(body, scenario.shift)) return { ok: false, reason: "collision" };
  const half = (PROFILE.reed.effectiveLengthMm * scenario.lengthFactor) / 2;
  const g = gaussLegendre(quadrature);
  const blade = (from: number, to: number) => {
    let s = 0;
    for (let i = 0; i < g.x.length; i++) {
      const x = from + ((g.x[i]! + 1) / 2) * (to - from);
      const q: Vec3 = [x + scenario.shift[0], scenario.shift[1], scenario.shift[2]];
      if (cylinderSignedDistance(body, q) <= 0) return NaN;
      s += (g.w[i]! / 2) * cylinderField(body, q)[0];
    }
    return s; // moyenne : poids normalisés (somme = 1)
  };
  const m1 = blade(-half, 0),
    m2 = blade(0, half);
  if (!Number.isFinite(m1) || !Number.isFinite(m2)) return { ok: false, reason: "collision" };
  const response = reedResponse(m1, m2, model);
  return { ok: true, response, m1, m2 };
}

/** Pose donnée dans un repère monde : reed (origine, rotation 3×3 lignes) puis aimant. */
export function toReedFrame(reedOrigin: Vec3, reedRows: [Vec3, Vec3, Vec3], world: MagnetPose): MagnetPose {
  const d: Vec3 = [world.center[0] - reedOrigin[0], world.center[1] - reedOrigin[1], world.center[2] - reedOrigin[2]];
  const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  return {
    center: [dot(reedRows[0], d), dot(reedRows[1], d), dot(reedRows[2], d)],
    axis: [dot(reedRows[0], world.axis), dot(reedRows[1], world.axis), dot(reedRows[2], world.axis)],
  };
}

/** C: sign gate on free-field blade averages, not a measured force law.
 * The relative strip is an explicit modelling parameter, not roundoff. */
export function signGatedResponse(m1: number, m2: number, epsilon = 0): number {
  if (!Number.isFinite(m1) || !Number.isFinite(m2) || !Number.isFinite(epsilon) || epsilon < 0 || epsilon >= 1) throw new RangeError('C_INVALID_INPUT');
  const amplitude = Math.abs((m1 + m2) / 2);
  return m1 * m2 > 0 && Math.min(Math.abs(m1), Math.abs(m2)) > epsilon * amplitude ? amplitude : 0;
}
