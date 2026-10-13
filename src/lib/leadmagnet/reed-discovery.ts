/** Original PIC-inspired teaching regions, NOT physics or product calibration.
 * The same sampled polygons drive SVG and hit-testing: no visual-only masks.
 * Coordinates are dimensionless; ON/HOLD/OFF are pedagogical states only. */
export type ReedOrientation = "parallel" | "perpendicular";
export type ReedPoint = { x: number; y: number };
export type ReedZone = "ON" | "HOLD" | "OFF";
export type ReedState = { point: ReedPoint; orientation: ReedOrientation; closed: boolean; progress: number; holdOrientation?: ReedOrientation | undefined };
export const REED_SCENE = { width: 440, height: 280, margin: 34 };
export const ACTIVATE = 0.5;
export const RELEASE = 1 / 3;
export const REED_INITIAL: ReedState = { point: { x: 365, y: 225 }, orientation: "parallel", closed: false, progress: 0 };
type Curve = [ReedPoint, ReedPoint, ReedPoint];
const p = (x: number, y: number): ReedPoint => ({x,y});
/** Sample once, then render straight SVG segments and test those exact segments. */
function shape(start: ReedPoint, curves: Curve[]): ReedPoint[] {
  const points = [start];
  let from = start;
  for (const [a,b,end] of curves) {
    for (let i=1;i<=48;i++) {
      const t=i/48, u=1-t;
      points.push(p(u**3*from.x+3*u*u*t*a.x+3*u*t*t*b.x+t**3*end.x,
        u**3*from.y+3*u*u*t*a.y+3*u*t*t*b.y+t**3*end.y));
    }
    from=end;
  }
  return points;
}
const quarter = shape(p(12,-40), [
  [p(12,-52),p(12,-66),p(12,-78)],
  [p(12,-142),p(134,-142),p(140,-78)],
  [p(148,-32),p(103,-22),p(68,-22)],
  [p(54,-22),p(40,-22),p(28,-22)],
  [p(18,-22),p(12,-28),p(12,-40)],
]);
const main = shape(p(-26,-22), [
  [p(-32,-46),p(-68,-66),p(-68,-80)],
  [p(-68,-112),p(-38,-136),p(0,-136)],
  [p(38,-136),p(68,-112),p(68,-80)],
  [p(68,-66),p(32,-46),p(26,-22)],
  [p(18,-18),p(-18,-18),p(-26,-22)],
]);
const side = shape(p(54,0), [
  [p(72,-10),p(95,-53),p(123,-53)],
  [p(176,-53),p(176,53),p(123,53)],
  [p(95,53),p(72,10),p(54,0)],
]);
function region(points: ReedPoint[], cx: number, cy: number, sx=1, sy=1) {
  const outer=points.map(v=>p(220+sx*v.x,140+sy*v.y));
  const inner=points.map(v=>p(220+sx*(cx+(v.x-cx)*0.74),140+sy*(cy+(v.y-cy)*0.74)));
  return {outer,inner};
}
const geometry = {
  perpendicular: [region(quarter,76,-74),region(quarter,76,-74,-1),region(quarter,76,-74,1,-1),region(quarter,76,-74,-1,-1)],
  parallel: [region(main,0,-80),region(main,0,-80,1,-1),region(side,117,0),region(side,117,0,-1)],
};
function contains(points: ReedPoint[], point: ReedPoint): boolean {
  let inside=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++) {
    const a=points[i],b=points[j];
    if(!a || !b) continue;
    const cross=(point.x-a.x)*(b.y-a.y)-(point.y-a.y)*(b.x-a.x);
    if(Math.abs(cross)<1e-8 && point.x>=Math.min(a.x,b.x)-1e-8 && point.x<=Math.max(a.x,b.x)+1e-8 && point.y>=Math.min(a.y,b.y)-1e-8 && point.y<=Math.max(a.y,b.y)+1e-8) return true;
    if((a.y>point.y)!==(b.y>point.y) && point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x) inside=!inside;
  }
  return inside;
}
export function reedZone(point: ReedPoint, orientation: ReedOrientation): ReedZone {
  const regions=geometry[orientation];
  if(regions.some(r=>contains(r.inner,point))) return "ON";
  return regions.some(r=>contains(r.outer,point)) ? "HOLD" : "OFF";
}
export function reedContact(closed: boolean, point: ReedPoint, orientation: ReedOrientation): boolean {
  const zone=reedZone(point,orientation);
  return zone==="ON" || (zone==="HOLD" && closed);
}
export function reedContours(orientation: ReedOrientation, threshold: number) {
  return geometry[orientation].map(r=>{
    const points=threshold===ACTIVATE ? r.inner : r.outer;
    const path=points.map((v,i)=>`${i ? "L" : "M"}${v.x},${v.y}`).join(" ")+" Z";
    return {points,path,outerPath:path};
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
  return { ...state, point, closed, progress, holdOrientation: progress === 2 && !state.holdOrientation ? state.orientation : state.holdOrientation };
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