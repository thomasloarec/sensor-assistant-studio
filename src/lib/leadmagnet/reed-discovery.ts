/** Generic teaching geometry, NOT a physical calibration or a product rating.
 * Each orientation has two elliptical response lobes. Response=max(1/(1+q)),
 * q being squared elliptical radius. Activation .5 > release 1/3.
 * The SVG contours are the EXACT q=1 and q=2 level sets of this same response.
 * Positions are dimensionless scene coordinates; no distance in mm exists.
 */
export type ReedOrientation = "parallel" | "perpendicular";
export type ReedPoint = { x: number; y: number };
export type ReedZone = "ON" | "HOLD" | "OFF";
export type ReedState = { point: ReedPoint; orientation: ReedOrientation; closed: boolean; progress: number };
export const REED_SCENE = { width: 440, height: 280, margin: 30 };
export const ACTIVATE = 0.5;
export const RELEASE = 1 / 3;
export const REED_INITIAL: ReedState = { point: { x: 365, y: 225 }, orientation: "parallel", closed: false, progress: 0 };
export function reedLobes(orientation: ReedOrientation) {
  return orientation === "parallel"
    ? [{ x: 135, y: 140, rx: 45, ry: 56 }, { x: 305, y: 140, rx: 45, ry: 56 }]
    : [{ x: 220, y: 65, rx: 72, ry: 27 }, { x: 220, y: 215, rx: 72, ry: 27 }];
}
export function reedResponse(point: ReedPoint, orientation: ReedOrientation): number {
  return Math.max(...reedLobes(orientation).map((l) => 1 / (1 + ((point.x - l.x) / l.rx) ** 2 + ((point.y - l.y) / l.ry) ** 2)));
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
  const scale = Math.sqrt(1 / threshold - 1);
  return reedLobes(orientation).map((l) => ({ ...l, rx: l.rx * scale, ry: l.ry * scale }));
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
    if (closed && progress === 3 && reedZone(sample, state.orientation) === "ON") progress = 4;
  }
  // Proof of hysteresis requires stopping IN HOLD after activation, not merely
  // crossing it (nor activating once, nor toggling a visual overlay).
  if (progress === 1 && closed && reedZone(point, state.orientation) === "HOLD") progress = 2;
  return { ...state, point, closed, progress };
}
export function orientReed(state: ReedState, orientation: ReedOrientation): ReedState {
  if (state.orientation === orientation) return state;
  return { ...state, orientation, closed: reedContact(state.closed, state.point, orientation), progress: state.progress === 2 ? 3 : state.progress };
}
/** Invert SVG's screen CTM, including preserveAspectRatio letterboxing. Kept
 * pure for tests; caller supplies getScreenCTM().inverse(). */
export function mapReedPointer(clientX: number, clientY: number, inverse: { a: number; b: number; c: number; d: number; e: number; f: number }): ReedPoint {
  return { x: inverse.a * clientX + inverse.c * clientY + inverse.e, y: inverse.b * clientX + inverse.d * clientY + inverse.f };
}