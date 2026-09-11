import { rotate } from "../machine-assembly";
import { pairedMagnetModel } from "../paired-magnets";
import { sensorById } from "../sensor-catalog";

export type Vec3 = [number, number, number];
export interface Pose {
  positionMm: Vec3;
  rotationDeg: Vec3;
}
export const ZERO_POSE: Pose = { positionMm: [0, 0, 0], rotationDeg: [0, 0, 0] };

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
export const finiteVec = (v: unknown): v is Vec3 =>
  Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === "number" && Number.isFinite(x));

/** Inverse of `rotate`: the same three rotations undone in reverse order. */
export function unrotate(v: Vec3, degrees: Vec3): Vec3 {
  const [a, b, c] = degrees;
  return rotate(rotate(rotate(v, [-a!, 0, 0]), [0, -b!, 0]), [0, 0, -c!]);
}
/** Matrice colonne-par-colonne des trois rotations, dans l'ordre XYZ de `rotate`. */
export type Mat3 = [Vec3, Vec3, Vec3];
export function matFromEuler(degrees: Vec3): Mat3 {
  return [
    rotate([1, 0, 0], degrees),
    rotate([0, 1, 0], degrees),
    rotate([0, 0, 1], degrees),
  ];
}
export const applyMat = (m: Mat3, v: Vec3): Vec3 => [
  m[0][0] * v[0] + m[1][0] * v[1] + m[2][0] * v[2],
  m[0][1] * v[0] + m[1][1] * v[1] + m[2][1] * v[2],
  m[0][2] * v[0] + m[1][2] * v[1] + m[2][2] * v[2],
];
export const matTranspose = (m: Mat3): Mat3 => [
  [m[0][0], m[1][0], m[2][0]],
  [m[0][1], m[1][1], m[2][1]],
  [m[0][2], m[1][2], m[2][2]],
];
export const matMul = (a: Mat3, b: Mat3): Mat3 => [
  applyMat(a, b[0]),
  applyMat(a, b[1]),
  applyMat(a, b[2]),
];
const deg = (r: number) => (r * 180) / Math.PI;
/** Angles XYZ d'une matrice de rotation, réciproques exacts de `matFromEuler`. */
export function eulerFromMat(m: Mat3): Vec3 {
  const r02 = m[2][0],
    r00 = m[0][0],
    r01 = m[1][0],
    r12 = m[2][1],
    r22 = m[2][2],
    r21 = m[1][2],
    r11 = m[1][1];
  const y = Math.asin(Math.max(-1, Math.min(1, r02)));
  if (Math.abs(r02) < 1 - 1e-9)
    return [deg(Math.atan2(-r12, r22)), deg(y), deg(Math.atan2(-r01, r00))];
  return [deg(Math.atan2(r21, r11)), deg(y), 0];
}
/** Rotation composée : d'abord `inner`, puis `outer`. */
export const composeRotations = (outer: Vec3, inner: Vec3): Vec3 =>
  eulerFromMat(matMul(matFromEuler(outer), matFromEuler(inner)));
/** Rotation de `target` exprimée dans le repère de `frame`. */
export const relativeRotation = (frame: Vec3, target: Vec3): Vec3 =>
  eulerFromMat(matMul(matTranspose(matFromEuler(frame)), matFromEuler(target)));
/** Local point of an anchored frame expressed in the parent (world or model) frame. */
export const toWorldPoint = (anchor: Pose, local: Vec3): Vec3 =>
  add(anchor.positionMm, rotate(local, anchor.rotationDeg));
export const toLocalPoint = (anchor: Pose, world: Vec3): Vec3 =>
  unrotate(sub(world, anchor.positionMm), anchor.rotationDeg);
export const toWorldDirection = (anchor: Pose, local: Vec3): Vec3 =>
  rotate(local, anchor.rotationDeg);

export const bodyOf = (sensorId: string, magnetId: string, which: "sensor" | "magnet"): Vec3 =>
  which === "sensor"
    ? ([...sensorById(sensorId).body] as Vec3)
    : ((pairedMagnetModel(magnetId)?.body ?? [12, 4, 6]).slice(0, 3) as Vec3);

/** Half extent of an oriented box projected on a unit direction. */
export function halfExtent(size: Vec3, rotationDeg: Vec3, direction: Vec3): number {
  return size.reduce((sum, n, i) => {
    const e: Vec3 = [0, 0, 0];
    e[i] = 1;
    return sum + (Math.abs(dot(rotate(e, rotationDeg), direction)) * n) / 2;
  }, 0);
}
/** Surface-to-surface gap along `axis`. Never a centre-to-centre distance. */
export function surfaceGapMm(
  sensorId: string,
  magnetId: string,
  relative: Pose,
  axis: Vec3,
): number {
  const sensor = bodyOf(sensorId, magnetId, "sensor"),
    magnet = bodyOf(sensorId, magnetId, "magnet");
  return (
    Math.abs(dot(relative.positionMm, axis)) -
    halfExtent(sensor, [0, 0, 0], axis) -
    halfExtent(magnet, relative.rotationDeg, axis)
  );
}
/** Distance of the magnet centre off the approach axis, in the sensor frame. */
export function lateralOffsetMm(relative: Pose, axis: Vec3): number {
  const along = scale(axis, dot(relative.positionMm, axis));
  const off = sub(relative.positionMm, along);
  return Math.hypot(...off);
}
/** Conservative separating-axis test between the two oriented envelopes. */
export function bodiesCollide(sensorId: string, magnetId: string, relative: Pose): boolean {
  const sensor = bodyOf(sensorId, magnetId, "sensor"),
    magnet = bodyOf(sensorId, magnetId, "magnet");
  const axes: Vec3[] = [];
  for (let i = 0; i < 3; i++) {
    const e: Vec3 = [0, 0, 0];
    e[i] = 1;
    axes.push(e, rotate(e, relative.rotationDeg));
  }
  return axes.every(
    (n) =>
      Math.abs(dot(relative.positionMm, n)) <
      halfExtent(sensor, [0, 0, 0], n) + halfExtent(magnet, relative.rotationDeg, n) - 1e-6,
  );
}
/** Stable, dependency-free fingerprint. Only used to detect stale computed results. */
export function fingerprint(value: unknown): string {
  const text = stable(value);
  let h1 = 0x811c9dc5,
    h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    h1 = Math.imul(h1 ^ text.charCodeAt(i), 16777619) >>> 0;
    h2 = Math.imul(h2 + text.charCodeAt(i) * (i + 1), 2246822519) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}
function stable(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((k) => JSON.stringify(k) + ":" + stable((value as Record<string, unknown>)[k]))
        .join(",") +
      "}"
    );
  return typeof value === "number" && !Number.isFinite(value) ? "null" : JSON.stringify(value);
}
