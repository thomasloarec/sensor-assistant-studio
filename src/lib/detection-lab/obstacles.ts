/** Conservative mechanical clearance between the FULL pilot magnet body and
 *  bounding boxes of loaded parts. Pure: no Three, no DOM.
 *
 *  Boxes are envelopes, not surfaces: an overlap means "possible overlap, to
 *  verify", never a certain collision (a bore inside a part lies inside its
 *  box). No overlap of the enclosing boxes establishes clearance ONLY within
 *  this approximation. */
import type { Vec3 } from './field';
import type { MagnetPose } from './pose';

export interface Obb { path: string; c: Vec3; a: [Vec3, Vec3, Vec3]; h: Vec3 }
/** Faces in contact within this tolerance (mm) are not an overlap. */
export const CONTACT_TOLERANCE_MM = 1e-3;
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const radius = (o: Obb, n: Vec3) => o.h[0] * Math.abs(dot(o.a[0], n)) + o.h[1] * Math.abs(dot(o.a[1], n)) + o.h[2] * Math.abs(dot(o.a[2], n));
const bound = (o: Obb) => Math.hypot(...o.h);

/** Separating-axis test (15 axes). True = boxes interpenetrate beyond contact. */
export function obbOverlap(A: Obb, B: Obb, tol = CONTACT_TOLERANCE_MM): boolean {
  const d: Vec3 = [B.c[0] - A.c[0], B.c[1] - A.c[1], B.c[2] - A.c[2]];
  if (Math.hypot(...d) > bound(A) + bound(B)) return false;
  const axes: Vec3[] = [...A.a, ...B.a];
  for (const a of A.a) for (const b of B.a) { const n = cross(a, b), l = Math.hypot(...n); if (l > 1e-9) axes.push([n[0] / l, n[1] / l, n[2] / l]); }
  return axes.every(n => Math.abs(dot(d, n)) < radius(A, n) + radius(B, n) - tol);
}
/** Box enclosing the pilot cylinder (Ø × length along the magnetisation axis). */
export function magnetObb(diameterMm: number, lengthMm: number, pose: MagnetPose): Obb | null {
  const l = Math.hypot(...pose.axis);
  if (!(l > 0) || !pose.center.every(Number.isFinite)) return null;
  const y: Vec3 = [pose.axis[0] / l, pose.axis[1] / l, pose.axis[2] / l];
  const seed: Vec3 = Math.abs(y[0]) < .9 ? [1, 0, 0] : [0, 0, 1];
  const xr = cross(seed, y), xl = Math.hypot(...xr), x: Vec3 = [xr[0] / xl, xr[1] / xl, xr[2] / xl];
  return { path: 'magnet', c: [...pose.center], a: [x, y, cross(x, y)], h: [diameterMm / 2, lengthMm / 2, diameterMm / 2] };
}
/** Form66 exploratory capsule [-7,+7] + r 1.1 enclosed in the reed frame. */
export const REED_CAPSULE_OBB: Obb = { path: 'reed', c: [0, 0, 0], a: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], h: [8.1, 1.1, 1.1] };
/** Paths of every part envelope possibly overlapped by `body`. */
export function overlappedPaths(obstacles: readonly Obb[], body: Obb): string[] {
  return obstacles.filter(o => obbOverlap(o, body)).map(o => o.path);
}
export function magnetOverlaps(obstacles: readonly Obb[], diameterMm: number, lengthMm: number, pose: MagnetPose): boolean | null {
  const body = magnetObb(diameterMm, lengthMm, pose);
  if (!body) return null;
  return obstacles.some(o => obbOverlap(o, body));
}
