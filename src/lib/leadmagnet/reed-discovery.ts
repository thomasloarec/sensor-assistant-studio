/** Generic teaching geometry, NOT a physical calibration or a product rating.
 * Axial point-dipole response with an excluded central core. Contour vertices
 * solve the SAME response analytically; straight SVG segments approximate it.
 * Positions are dimensionless scene coordinates; no distance in mm exists.
 */
export type ReedOrientation = "parallel" | "perpendicular";
export type ReedPoint = { x: number; y: number };
export type ReedZone = "ON" | "HOLD" | "OFF";
export type ReedState = { point: ReedPoint; orientation: ReedOrientation; closed: boolean; progress: number; holdOrientation?: ReedOrientation };
export const REED_SCENE = { width: 440, height: 280, margin: 34 };
export const ACTIVATE = 0.5;
export const RELEASE = 1 / 3;
export const REED_INITIAL: ReedState = { point: { x: 365, y: 225 }, orientation: "parallel", closed: false, progress: 0 };
// Axial |Bx| of a point dipole, in scene units only. A core of radius 18
// is excluded (point-dipole approximation invalid there); r^3+core^3 caps
// response outside it. Both axes remain EXACT nulls for a vertical magnet.
const CORE = 18;
const SCALE = 80;
export function reedAngular(theta: number, orientation: ReedOrientation): number {
  return orientation === "parallel" ? Math.abs(3 * Math.cos(theta) ** 2 - 1) : Math.abs(3 * Math.cos(theta) * Math.sin(theta));
}
export function reedResponse(point: ReedPoint, orientation: ReedOrientation): number {
  const x = point.x - 220, y = point.y - 140;
  const r = Math.hypot(x, y);
  if (r < CORE) return 0;
  // Avoid floating point residues on perpendicular null axes.
  if (orientation === "perpendicular" && (x === 0 || y === 0)) return 0;
  return SCALE ** 3 * reedAngular(Math.atan2(y, x), orientation) / (r ** 3 + CORE ** 3);
}
export function reedZone(point: ReedPoint, orientation: ReedOrientation): ReedZone {
  const force = reedResponse(point, orientation);
  return force >= ACTIVATE ? "ON" : force <= RELEASE ? "OFF" : "HOLD";
}
export function reedContact(closed: boolean, point: ReedPoint, orientation: ReedOrientation): boolean {
  const zone = reedZone(point, orientation);
  return zone === "ON" || (zone === "HOLD" && closed);
}
export function reedContours(orientation: ReedOrientation, threshold: number) {
  // Four angular sectors bounded by dipole null directions, not hand-drawn blobs.
  const alpha = Math.acos(1 / Math.sqrt(3));
  const cuts = orientation === "perpendicular" ? [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2, 2 * Math.PI] : [-alpha, alpha, Math.PI - alpha, Math.PI + alpha, 2 * Math.PI - alpha];
  const required = threshold * 2 * CORE ** 3 / SCALE ** 3;
  const polar = (r: number, a: number) => ({ x: 220 + r * Math.cos(a), y: 140 + r * Math.sin(a) });
  return cuts.slice(0, -1).map((start, i) => {
    const end = cuts[i + 1] ?? start;
    const mid = (start + end) / 2;
    const boundary = (nullAngle: number) => {
      let outside = nullAngle, inside = mid;
      for (let j = 0; j < 48; j++) {
        const a = (outside + inside) / 2;
        if (reedAngular(a, orientation) < required) outside = a; else inside = a;
      }
      return inside;
    };
    const lo = boundary(start), hi = boundary(end);
    const angles = Array.from({ length: 181 }, (_, j) => lo + (hi - lo) * j / 180);
    const outer = angles.map(a => polar(Math.cbrt(SCALE ** 3 * reedAngular(a, orientation) / threshold - CORE ** 3), a));
    const points = [...outer, ...angles.toReversed().map(a => polar(CORE, a))];
    const path = points.map((p, j) => `${j ? "L" : "M"}${p.x},${p.y}`).join(" ") + " Z";
    return { outer, points, path };
  });
}
export function clampReedPoint(point: ReedPoint): ReedPoint {
  return {
    x: Math.max(REED_SCENE.margin, Math.min(REED_SCENE.width - REED_SCENE.margin, point.x)),
    y: Math.max(REED_SCENE.margin, Math.min(REED_SCENE.height - REED_SCENE.margin, point.y)),
  };
}
/** Sample the actual traversed path, not only its endpoint. Even a fast drag
 * crossing ON and ending in HOLD must activate. No timers or perpetual loop. */
export function moveReed(state: ReedState, destination: ReedPoint): ReedState {
  if (!Number.isFinite(destination.x) || !Number.isFinite(destination.y)) return state;
  const point = clampReedPoint(destination);
  const count = Math.max(1, Math.ceil(Math.hypot(point.x - state.point.x, point.y - state.point.y) / 2));
  let closed = state.closed;
  let progress = state.progress;
  for (let i = 1; i <= count; i++) {
    const sample = { x: state.point.x + (point.x - state.point.x) * i / count, y: state.point.y + (point.y - state.point.y) * i / count };
    closed = reedContact(closed, sample, state.orientation);
    if (closed && progress === 0) progress = 1;
    if (closed && progress === 3 && state.holdOrientation !== state.orientation && reedZone(sample, state.orientation) === "ON") progress = 4;
  }
  // Proof of hysteresis requires stopping IN HOLD after activation, not merely
  // crossing it (nor activating once, nor toggling a visual overlay).
  if (progress === 1 && closed && reedZone(point, state.orientation) === "HOLD") progress = 2;
  return { ...state, point, closed, progress, holdOrientation: progress === 2 && state.progress === 1 ? state.orientation : state.holdOrientation };
}
export function orientReed(state: ReedState, orientation: ReedOrientation): ReedState {
  if (state.orientation === orientation) return state;
  const closed = reedContact(state.closed, state.point, orientation);
  let progress = state.progress;
  if (closed && progress === 0) progress = 1;
  if (state.holdOrientation && progress >= 2 && progress < 4) {
    progress = orientation === state.holdOrientation ? 2 : 3;
    if (progress === 3 && reedZone(state.point, orientation) === "ON") progress = 4;
  }
  return { ...state, orientation, closed, progress };
}
/** Invert SVG's screen CTM, including preserveAspectRatio letterboxing. Kept
 * pure for tests; caller supplies getScreenCTM().inverse(). */
export function mapReedPointer(clientX: number, clientY: number, inverse: { a: number; b: number; c: number; d: number; e: number; f: number }): ReedPoint {
  return { x: inverse.a * clientX + inverse.c * clientY + inverse.e, y: inverse.b * clientX + inverse.d * clientY + inverse.f };
}