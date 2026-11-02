/** Indicative C1% search on the original, finite mounting face only.
 * No stored mesh/track copies, no orientation/offset changes, no free-space fallback.
 * Sampling is bounded; a negative result means none FOUND, never impossibility.
 */
import { Quaternion, Vector3 } from "three";
import { PROFILE } from "../detection-lab/profile";
import { componentPose, partDelta, motionProblem, usesClip, rotate } from "./machine-assembly";
import type { MachineAssembly } from "./machine-assembly";
import type { MachineAsset } from "./machine-assets";
import { applyAttachments, attachPose, type Attachment } from "./machine-mounting";
import { magnetSize, type Vec3, type WorkshopConfig } from "./magnetic-workshop";
import { sensorById } from "./sensor-catalog";
import { mountingFace, footprintFits, type MountingFace } from "./machine-face";
import { catalogueFrame, catalogueModel, cataloguePlacement } from "./catalogue-pedagogical";
import { partEnvelopes, reedObstaclesAt } from "./pedagogical-envelopes";

/* i18n-canonical: refusal messages are translated by the UI. */
export const POSITION_MESSAGES = {
  mounting: "Posez d’abord l’aimant sur une face et confirmez le mouvement.",
  face: "La face de fixation ne peut pas être vérifiée. Choisissez une face plane du modèle chargé.",
  none: "Aucune position de détection trouvée sur cette face. Le montage est conservé.",
  failed: "La recherche n’a pas abouti. Le montage est conservé.",
};
export interface DetectionPosition {
  attach: Attachment;
  response: number;
  marginMm: number;
}
export interface DetectionPositions {
  positions: DetectionPosition[];
  t: number;
  stepMm: number;
  reason?: string;
}
function restPoint(m: MachineAssembly, path: string, p: Vec3, u: number): Vec3 {
  const d = partDelta(m, path, u),
    v = new Vector3(...p);
  return (
    d
      ? v.sub(new Vector3(...d.position)).applyQuaternion(new Quaternion(...d.quaternion).invert())
      : v
  ).toArray() as Vec3;
}
/** Closest sampled approach of the actual selected face to the sensor centre.
 * Refine around the best sample; arbitrary rigid pivots and GLB clips share
 * partDelta with rendering. The result is a preview time, not a motion edit.
 */
export function closestFaceTime(m: MachineAssembly, face: MountingFace, path: string): number {
  const distance = (u: number) => {
    const p = new Vector3(...restPoint(m, path, componentPose(m, "sensor", u).position, u));
    return Math.min(
      ...face.triangles.map((tri) =>
        tri.closestPointToPoint(p, new Vector3()).distanceToSquared(p),
      ),
    );
  };
  let best = 0,
    value = distance(0);
  for (let i = 1; i <= 128; i++) {
    const u = i / 128,
      v = distance(u);
    if (v < value - 1e-10) {
      best = u;
      value = v;
    }
  }
  let lo = Math.max(0, best - 1 / 128),
    hi = Math.min(1, best + 1 / 128);
  for (let i = 0; i < 16; i++) {
    const a = lo + (hi - lo) / 3,
      b = hi - (hi - lo) / 3;
    if (distance(a) <= distance(b)) hi = b;
    else lo = a;
  }
  const refined = (lo + hi) / 2;
  if (distance(refined) < value - 1e-10) best = refined;
  return usesClip(m) ? best : best / 2;
}
export function mountingFootprint(c: WorkshopConfig, a: Attachment): Vec3[] {
  const size = magnetSize(c),
    rotation = attachPose(a, { lengthMm: size[0], heightMm: size[1] }).rotation;
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([x, z]) => rotate(a.surfaceOrientation === "end"
    ? [0, (x! * size[1]) / 2, (z! * size[2]) / 2]
    : [(x! * size[0]) / 2, 0, (z! * size[2]) / 2], rotation));
}
export async function findDetectionPositions(
  c: WorkshopConfig,
  asset: MachineAsset,
  signal?: AbortSignal,
): Promise<DetectionPositions> {
  const empty = (reason: string): DetectionPositions => ({
    positions: [],
    t: 0,
    stepMm: 0,
    reason,
  });
  const m = c.machine,
    a = m?.magnetAttach;
  if (!m || !a || a.kind !== "surface" || a.offsetMm < 0 || motionProblem(m))
    return empty(POSITION_MESSAGES.mounting);
  const face = mountingFace(asset, a),
    envelopes = partEnvelopes(asset);
  if (!face || !envelopes) return empty(POSITION_MESSAGES.face);
  const aborted = () => {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  };
  aborted();
  const t = closestFaceTime(m, face, a.partPath),
    u = usesClip(m) ? t : 2 * t;
  const model = catalogueModel(c),
    frame = catalogueFrame(c, t);
  const obstacles = reedObstaclesAt(m, envelopes, t, frame);
  // Model domain is 60 mm around the reed datum, in physical millimetres.
  const reedWorld = frame.origin.map(
    (v, i) => v + frame.basis.reduce((s, b, j) => s + b[i]! * model.centre[j]!, 0),
  ) as Vec3;
  const centre = face.to2(restPoint(m, a.partPath, reedWorld, u)),
    radius = PROFILE.domain.maxCenterMm;
  const min = face.bounds.min.map((v, i) => Math.max(v, centre[i]! - radius));
  const max = face.bounds.max.map((v, i) => Math.min(v, centre[i]! + radius));
  if (min.some((v, i) => v >= max[i]!)) return empty(POSITION_MESSAGES.none);
  const step = Math.max(0.4, ...min.map((v, i) => (max[i]! - v) / 120));
  const nx = Math.ceil((max[0]! - min[0]!) / step) + 1,
    ny = Math.ceil((max[1]! - min[1]!) / step) + 1;
  const footprint = mountingFootprint(c, a),
    size = magnetSize(c),
    sensor = sensorById(c.sensorId);
  const machineAt = (attach: Attachment) =>
    applyAttachments(
      { ...m, magnetAttach: attach },
      { lengthMm: sensor.body[0], heightMm: sensor.body[1] },
      { lengthMm: size[0], heightMm: size[1] },
    );
  const score = (point: Vec3): number => {
    if (point.some((v) => Math.abs(v) > 10000) || !footprintFits(face, point, footprint)) return 0;
    const candidate = { ...c, machine: machineAt({ ...a, point }) };
    const result = cataloguePlacement(
      candidate,
      catalogueFrame(candidate, t).pose,
      obstacles,
      model,
      true,
    );
    return result.zone === 2 && result.nominal?.ok ? result.nominal.response : 0;
  };
  const points: Vec3[] = [],
    scores = new Float64Array(nx * ny);
  for (let j = 0; j < ny; j++) {
    aborted();
    for (let i = 0; i < nx; i++) {
      const point = face.to3([min[0]! + i * step, min[1]! + j * step]),
        k = j * nx + i;
      points[k] = point;
      scores[k] = score(point);
    }
    // Keep cancellation, navigation and input responsive during the search.
    if (j % 3 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  aborted();
  const adjacent = (k: number) => [
    k % nx > 0 ? k - 1 : -1,
    k % nx < nx - 1 ? k + 1 : -1,
    k >= nx ? k - nx : -1,
    k < (ny - 1) * nx ? k + nx : -1,
  ];
  // Separate regions without interpolating through dead zones or missing matter.
  const labels = new Int32Array(scores.length).fill(-1),
    regions: number[][] = [];
  for (let seed = 0; seed < scores.length; seed++)
    if (scores[seed]! > 0 && labels[seed] === -1) {
      const id = regions.length,
        queue = [seed];
      labels[seed] = id;
      for (let q = 0; q < queue.length; q++) {
        const k = queue[q]!;
        for (const n of adjacent(k))
          if (n >= 0 && scores[n]! > 0 && labels[n] === -1) {
            const mid = points[k]!.map((v, i) => (v + points[n]![i]!) / 2) as Vec3;
            if (score(mid) > 0) {
              labels[n] = id;
              queue.push(n);
            }
          }
        if (q % 128 === 0) {
          aborted();
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }
      }
      regions.push(queue);
    }
  // Discrete erosion ranks the interior before response strength. The outer
  // grid edge is a boundary too; no edge sample masquerades as a deep interior.
  const depths = new Int32Array(scores.length),
    queue: number[] = [];
  for (let k = 0; k < scores.length; k++)
    if (scores[k]! > 0 && adjacent(k).some((n) => n < 0 || labels[n] !== labels[k])) {
      depths[k] = 1;
      queue.push(k);
    }
  for (let q = 0; q < queue.length; q++)
    for (const n of adjacent(queue[q]!))
      if (n >= 0 && scores[n]! > 0 && !depths[n]) {
        depths[n] = depths[queue[q]!]! + 1;
        queue.push(n);
      }
  const positions = regions
    .map((region) => {
      const k = region.reduce((best, n) =>
        depths[n]! > depths[best]! || (depths[n] === depths[best] && scores[n]! > scores[best]!)
          ? n
          : best,
      );
      return {
        attach: { ...a, point: points[k]! },
        response: scores[k]!,
        marginMm: Math.max(0, depths[k]! - 1) * step,
      };
    })
    .sort((a, b) => b.marginMm - a.marginMm || b.response - a.response);
  aborted();
  return {
    positions,
    t,
    stepMm: step,
    ...(!positions.length ? { reason: POSITION_MESSAGES.none } : {}),
  };
}
