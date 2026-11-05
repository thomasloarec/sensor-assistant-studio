import { Euler, Quaternion, Vector3 } from "three";
import { cycleU, partDelta } from "./machine-assembly";
import { attachPose, surfaceFootprint, type Attachment } from "./machine-mounting";
import { catalogueFrame, cataloguePlacement } from "./catalogue-pedagogical";
import { magnetSize, type Vec3, type WorkshopConfig } from "./magnetic-workshop";
import { mountingFace, footprintFits } from "./machine-face";
import { partEnvelopes, reedObstaclesAt } from "./pedagogical-envelopes";
import type { MachineAsset } from "./machine-assets";

export const normalizedSpin = (v: number) => ((((v + 180) % 360) + 360) % 360) - 180;
export function configWithMagnetAttachment(c: WorkshopConfig, a: Attachment): WorkshopConfig {
  const magnet = magnetSize(c);
  const pose = attachPose(a, { lengthMm: magnet[0], heightMm: magnet[1] });
  return {
    ...c,
    machine: {
      ...c.machine!,
      magnetAttach: a,
      magnetPosition: pose.position,
      magnetRotation: pose.rotation,
      magnetMount: a.support,
    },
  };
}

/** Align an in-plane body axis with the projected reed axis at the DISPLAYED
 * pose. The stored spin remains relative to the file's original mounting face. */
export function alignedMagnetSpin(c: WorkshopConfig, a: Attachment, t: number): number {
  if (!c.machine || a.kind !== "surface") return a.spinDeg;
  const frame = catalogueFrame(c, t),
    delta = partDelta(c.machine, a.partPath, cycleU(c.machine, t));
  const inverse = delta ? new Quaternion(...delta.quaternion).invert() : new Quaternion();
  const normal = new Vector3(...a.normal).normalize();
  const pose = attachPose({ ...a, spinDeg: 0 }, { lengthMm: 1, heightMm: 1 });
  const axis = new Vector3(
    ...((a.surfaceOrientation === "end" ? [0, 0, 1] : [1, 0, 0]) as Vec3),
  ).applyEuler(new Euler(...(pose.rotation.map((v) => (v * Math.PI) / 180) as Vec3)));
  for (const basis of [frame.basis[0], frame.basis[2], frame.basis[1]]) {
    const target = new Vector3(...basis).applyQuaternion(inverse).projectOnPlane(normal);
    if (target.lengthSq() < 1e-10) continue;
    target.normalize();
    return normalizedSpin(
      (Math.atan2(normal.dot(axis.clone().cross(target)), axis.dot(target)) * 180) / Math.PI,
    );
  }
  return a.spinDeg;
}

/** A one-time starting suggestion, never an orientation lock. Cardinal poses
 * relative to the sensor are preferred; the common evaluator breaks the tie. */
export function initialMagnetAttachment(
  c: WorkshopConfig,
  a: Attachment,
  t: number,
  asset: MachineAsset | null,
): Attachment {
  if (!c.machine || a.kind !== "surface") return a;
  const aligned = alignedMagnetSpin(c, a, t),
    face = asset ? mountingFace(asset, a) : null;
  const envelopes = asset ? partEnvelopes(asset) : null;
  let best: Attachment | null = null,
    bestScore = -Infinity;
  for (const spinDeg of [aligned, normalizedSpin(aligned + 90)]) {
    const candidate = { ...a, spinDeg };
    if (face && !footprintFits(face, a.point, surfaceFootprint(candidate, magnetSize(c)))) continue;
    const next = configWithMagnetAttachment(c, candidate),
      f = catalogueFrame(next, t);
    const e = cataloguePlacement(
      next,
      f.pose,
      envelopes ? reedObstaclesAt(next.machine!, envelopes, t, f) : [],
    );
    const score = e.state !== "unavailable" && e.nominal?.ok ? e.nominal.response : -1;
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best ?? a;
}
