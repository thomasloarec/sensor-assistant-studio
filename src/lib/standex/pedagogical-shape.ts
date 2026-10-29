import type { Vec3 } from './magnetic-workshop';

/** Qualitative central-lobe morphology, requested 2026-10-28.
 * This is NOT a measured magnetic field or a refit of activation distances.
 * A monotone longitudinal coordinate map broadens the parallel central lobe.
 * Identity on D1 (x=0), D3 (radial=0), perpendicular poles (D4/D5), and
 * outside one glass length. Therefore calibration anchors and separated outer
 * lobes are preserved. Actual mechanical exclusion always precedes this map.
 * All client samples (point, volume, cut, timeline, lamp) use the same map.
 */
export const PEDAGOGICAL_SHAPE = Object.freeze({version:'central-lobe-3',strength:4,flareStart:0.9,flareEnd:1.35});
export function centralLobeSample(center:Vec3,axis:Vec3,glassLengthMm:number):Vec3 {
  const [x,y,z]=center,r2=y*y+z*z,n=Math.hypot(...axis);
  if(!n||!r2||!x||glassLengthMm<=0||Math.abs(x)>=glassLengthMm)return center;
  const parallel=Math.pow(axis[0]/n,8);
  const taper=Math.pow(1-(x/glassLengthMm)**2,2);
  // Widening develops away from the reed; exponential compression keeps x monotone.
  const u=Math.max(0,Math.min(1,(Math.abs(z)/glassLengthMm-PEDAGOGICAL_SHAPE.flareStart)/(PEDAGOGICAL_SHAPE.flareEnd-PEDAGOGICAL_SHAPE.flareStart)));
  const flare=u*u*(3-2*u);
  const amount=PEDAGOGICAL_SHAPE.strength*parallel*taper*flare;
  return [x*Math.exp(-amount),y,z];
}
