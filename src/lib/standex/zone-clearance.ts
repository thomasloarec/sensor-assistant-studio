/** Display mask for moving part envelopes. Same 15 separating axes as obbOverlap;
 * the candidate magnet centre is the variable. Never used to change the verdict. */
import { CONTACT_TOLERANCE_MM, type Obb } from '../detection-lab/obstacles';
import type { Vec3 } from './magnetic-workshop';
const dot=(a:Vec3,b:Vec3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const radius=(a:Obb['a'],h:Vec3,n:Vec3)=>h.reduce((r,v,i)=>r+v*Math.abs(dot(a[i]!,n)),0);
export type ClearanceRegion=readonly [number,number,number,number][];
export function clearanceRegions(axes:Obb['a'],size:readonly number[],obstacles:readonly Obb[]):ClearanceRegion[]{
 const h=size.map(n=>n/2) as Vec3;
 return obstacles.map(o=>{
  const ns=[...axes,...o.a];
  for(const a of axes)for(const b of o.a){const n=cross(a,b),l=Math.hypot(...n);if(l>1e-9)ns.push(n.map(v=>v/l) as Vec3);}
  return ns.flatMap(n=>{const r=radius(axes,h,n)+radius(o.a,o.h,n)-CONTACT_TOLERANCE_MM,c=dot(o.c,n);
   return [[...n,c+r],[-n[0],-n[1],-n[2],-c+r]] as [number,number,number,number][];
  });
 });
}
export function clearanceContains(regions:readonly ClearanceRegion[],p:Vec3):boolean{
 return regions.some(r=>r.every(n=>n[0]*p[0]+n[1]*p[1]+n[2]*p[2]<n[3]));
}
/** Fixed stride texture: 30 planes per part, unused slots are always inside. No part truncation. */
export function clearanceTextureData(regions:readonly ClearanceRegion[]):Float32Array{
 const out=new Float32Array(32*Math.max(1,regions.length)*4);
 for(let j=0;j<Math.max(1,regions.length);j++)for(let i=0;i<32;i++)out.set(regions[j]?.[i]??[0,0,0,1],(j*32+i)*4);
 return out;
}
