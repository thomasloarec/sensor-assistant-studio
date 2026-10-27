/** Per-part bounding boxes of the LOADED file, posed with the same rigid
 *  transforms as the scene (`pointAt` → `partDelta`/`movePoint`, clips included)
 *  and expressed in the reed frame of the same instant. In-memory only: boxes
 *  are numbers, never the file, its tracks or its meshes. */
import type { MachineAsset } from './machine-assets';
import { cycleU, pointAt, type MachineAssembly } from './machine-assembly';
import type { Vec3 } from './magnetic-workshop';
import type { Obb } from '@/lib/detection-lab/obstacles';
import type { PedagogicalFrame } from './pedagogical-poses';
import { fingerprint } from './mounting/geometry';

export interface PartEnvelope { path: string; min: Vec3; max: Vec3 }
/** Every part is kept; a part without finite bounds makes the whole set unavailable (null). */
export function partEnvelopes(asset: Pick<MachineAsset, 'parts'>): PartEnvelope[] | null {
  if (asset.parts.length === 0) return null;
  const out: PartEnvelope[] = [];
  for (const p of asset.parts) {
    if (!p.geometry.boundingBox) p.geometry.computeBoundingBox();
    const b = p.geometry.boundingBox;
    const min = b ? (b.min.toArray() as Vec3) : null, max = b ? (b.max.toArray() as Vec3) : null;
    if (!min || !max || ![...min, ...max].every(Number.isFinite) || min.some((v, i) => v > max[i]!)) return null;
    out.push({ path: p.path, min, max });
  }
  return out;
}
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** World boxes at cycle point `u` (rigid motion: axes stay orthonormal). */
export function worldObstacles(m: MachineAssembly, envelopes: readonly PartEnvelope[], u: number): Obb[] {
  return envelopes.map(e => {
    const c0: Vec3 = [(e.min[0] + e.max[0]) / 2, (e.min[1] + e.max[1]) / 2, (e.min[2] + e.max[2]) / 2];
    const c = pointAt(m, e.path, c0, u);
    const axis = (i: number): Vec3 => { const p: Vec3 = [...c0]; p[i]! += 1; return sub(pointAt(m, e.path, p, u), c); };
    return { path: e.path, c, a: [axis(0), axis(1), axis(2)], h: [(e.max[0] - e.min[0]) / 2, (e.max[1] - e.min[1]) / 2, (e.max[2] - e.min[2]) / 2] };
  });
}
/** Same boxes in the reed frame of `frame` (same instant as the boxes). */
export function toReedObstacles(world: readonly Obb[], frame: Pick<PedagogicalFrame, 'origin' | 'basis'>): Obb[] {
  const [r0, r1, r2] = frame.basis;
  const dir = (v: Vec3): Vec3 => [dot(r0, v), dot(r1, v), dot(r2, v)];
  return world.map(o => ({ path: o.path, c: dir(sub(o.c, frame.origin)), a: [dir(o.a[0]), dir(o.a[1]), dir(o.a[2])], h: [...o.h] }));
}
export function reedObstaclesAt(m: MachineAssembly, envelopes: readonly PartEnvelope[], t: number, frame: Pick<PedagogicalFrame, 'origin' | 'basis'>): Obb[] {
  return toReedObstacles(worldObstacles(m, envelopes, cycleU(m, t)), frame);
}

/** Timeline cache key: settings, config, loaded file identity, CONTENT of the
 *  boxes and load generation of the clip. A reload of the same identifier with
 *  other boxes or a re-registered clip never matches an earlier result. */
export function pedagogicalTimelineKey(settings: unknown, config: unknown, assetId: string | null, envelopes: readonly PartEnvelope[] | null, clipGeneration: number): string {
  return JSON.stringify([settings, config, assetId, envelopes ? fingerprint(envelopes) : null, clipGeneration]);
}
