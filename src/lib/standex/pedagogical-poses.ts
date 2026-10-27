/** Shared scene/import adapter. Documentary datums never enter this transform. */
import { componentPose, cycleU, rotate } from './machine-assembly';
import type { WorkshopConfig, Vec3 } from './magnetic-workshop';
import { toReedFrame, type MagnetPose } from '@/lib/detection-lab/pose';
export interface PedagogicalFrame { origin:Vec3; basis:[Vec3,Vec3,Vec3]; pose:MagnetPose; world:MagnetPose }
export function pedagogicalFrame(c:WorkshopConfig,t:number):PedagogicalFrame {
  if(c.machine){
    const u=cycleU(c.machine,t),reed=componentPose(c.machine,'sensor',u),magnet=componentPose(c.machine,'magnet',u);
    const basis:[Vec3,Vec3,Vec3]=[reed.transform([1,0,0]),reed.transform([0,1,0]),reed.transform([0,0,1])];
    const world:MagnetPose={center:magnet.position,axis:magnet.transform([0,c.polarity,0])};
    return {origin:reed.position,basis,world,pose:toReedFrame(reed.position,basis,world)};
  }
  const u=t<=.5?t*2:(1-t)*2,depth=c.start+(c.end-c.start)*u;
  const center:Vec3=c.motion==='slide'?[-c.travel+2*c.travel*u,c.offset,0]:c.geometry==='D3'?[depth,c.lateralShift,0]:[c.lateralShift,depth,0];
  const angle=(c.magnetAngle+(c.motion==='pivot'?c.span*(u-.5):0))*Math.PI/180;
  const axis:Vec3=rotate([Math.cos(angle)*c.polarity,Math.sin(angle)*c.polarity,0],[c.magnetTilt,0,0]);
  const origin:Vec3=[c.mountX,0,c.mountZ],basis:[Vec3,Vec3,Vec3]=[[1,0,0],[0,1,0],[0,0,1]].map(v=>rotate(v as Vec3,[0,-c.mountAngle,0])) as [Vec3,Vec3,Vec3];
  const transform=(v:Vec3)=>basis[0].map((_,i)=>(basis[0][i]??0)*v[0]+(basis[1][i]??0)*v[1]+(basis[2][i]??0)*v[2]) as Vec3;
  const p=transform(center),world={center:p.map((v,i)=>v+(origin[i]??0)) as Vec3,axis:transform(axis)};
  return {origin,basis,pose:{center,axis},world};
}