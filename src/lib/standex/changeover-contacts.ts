import type { Contact, Vec3 } from './magnetic-workshop';
/** Illustrative Form C: NC and NO on the left, common on the right.
 * The same endpoints drive SVG and 3D. Unknown is the uncommitted middle position. */
export function changeoverBlades(span:number,gap:number,contact:Contact):[Vec3,Vec3][] {
 return [
  [[-span/2,0,gap],[0,0,gap]],
  [[-span/2,0,-gap],[0,0,-gap]],
  [[span/2,0,0],[0,0,contact==='closed'?-gap:contact==='open'?gap:0]],
 ];
}
