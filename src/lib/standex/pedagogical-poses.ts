/** Shared scene/import adapter. Documentary datums never enter this transform. */
import { componentPose, cycleU, rotate, activeClip, movingSelection } from './machine-assembly';
import { parseWorkshopConfig, type WorkshopConfig, type Vec3 } from './magnetic-workshop';
import { DEFAULT_EXPERIMENT, evaluatePlacement, type ExperimentSettings } from '@/lib/detection-lab/workshop-experiment';
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
/** Imported solid collision cannot be verified here: never use a static fallback as valid. */
export function pedagogicalAvailability(c:WorkshopConfig): 'ready'|'motion'|'clip'|'mounting' {
  if(!c.machine)return 'ready';
  if(c.machine.motionSource==='clip') {if(!activeClip(c.machine))return 'clip';}
  else if(c.machine.motionStatus!=='confirmed'||movingSelection(c.machine).length===0)return 'motion';
  return 'mounting';
}
/** Only D1 approach is currently supported. Verify through effective pose at the SAME instant. */
export function suggestPedagogicalConfig(c:WorkshopConfig,t:number,settings:ExperimentSettings=DEFAULT_EXPERIMENT):WorkshopConfig|null {
  if(c.machine||c.motion!=='approach'||c.geometry!=='D1'||c.magnetTilt!==0)return null;
  const offsets=[0],angles=[0];
  if(settings.lateralFreedomMm>0&&settings.lateralFreedomMm<=12)for(let d=.25;d<=settings.lateralFreedomMm;d+=.25)offsets.push(-d,d);
  if(settings.rotationFreedom)angles.push(-90,90);
  for(const rotation of angles)for(const offset of offsets){
    if(rotation===0&&offset===0)continue;
    const candidate={...c,lateralShift:c.lateralShift+offset,magnetAngle:c.magnetAngle+rotation};
    if(evaluatePlacement(settings,pedagogicalFrame(candidate,t).pose,false).state==='favorable')return candidate;
  }
  return null;
}

export interface PedagogicalDraft { config:WorkshopConfig;settings:ExperimentSettings;progress:number }
/** Strict experimental envelope; legacy normal workshop import is unchanged. */
export function parsePedagogicalEnvelope(value:unknown):PedagogicalDraft|null {
  if(!value||typeof value!=='object')return null;
  const v=value as Record<string,unknown>,s=v.settings as ExperimentSettings|undefined,p=v.profile as {id?:string;version?:string;dataVersion?:string}|undefined;
  if(v.kind!=='pedagogical-workshop'||v.version!==1||!s||!p||p.id!=='form66-lfit-b-c1'||p.version!==s.profileVersion||p.dataVersion!==s.dataVersion||typeof v.progress!=='number'||!Number.isFinite(v.progress)||v.progress<0||v.progress>1)return null;
  if(!['A','B','C','D','E','F','G'].includes(s.className)||!['SMCO5-5X4','N45-4X19'].includes(s.magnetId)||typeof s.profileVersion!=='string'||typeof s.dataVersion!=='string'||!['form66','unknown'].includes(s.integration)||['hypotheses','nearbyMaterial','rotationFreedom'].some(k=>typeof (s as unknown as Record<string,unknown>)[k]!=='boolean')||!Number.isFinite(s.lateralFreedomMm)||s.lateralFreedomMm<0||s.lateralFreedomMm>12)return null;
  const config=parseWorkshopConfig(v.config);
  if(!config)return null;
  return {config,settings:{...s},progress:v.progress};
}
