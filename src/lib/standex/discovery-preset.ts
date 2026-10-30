import { approachOffset, magnetSize, type WorkshopConfig } from './magnetic-workshop';
import { sensorById } from './sensor-catalog';
import { catalogueBodyObb, catalogueFrame } from './catalogue-pedagogical';
import { obbOverlap, type Obb } from '../detection-lab/obstacles';
/** MVP discovery no longer offers pivot. Migrate only the obsolete unimported
 * demonstration; imported assemblies retain every saved transform and motion. */
export function clientDiscoveryConfig(c:WorkshopConfig):WorkshopConfig {
 return !c.machine&&c.motion==='pivot'?{...c,...discoveryPatch(c,{motion:'approach'})}:c;
}
/** Explicit discovery actions only. Mechanical clearance, never a forced magnetic state.
 * Imports, rendering, reopening and dossier restoration must not call this function. */
export function discoveryPatch(c:WorkshopConfig,patch:Partial<WorkshopConfig>):Partial<WorkshopConfig>{
 if(c.machine)return patch;
 const next={...c,...patch},out={...patch};
 if(next.motion==='approach'&&(patch.motion!==undefined||patch.geometry!==undefined)){
  out.end=.5;
  out.start=Math.max(next.start,24);
  if(next.sensorId==='MK07')out.lateralShift=next.geometry==='D3'?0:(sensorById(next.sensorId).reedOffsetX??0);
 }else if(next.motion==='slide'){
  out.offset=approachOffset({...next,geometry:'D1'})+2;
  // Stay within the persisted 50 mm half-travel limit: a larger Custom PCB
  // otherwise generates an invalid preset and silently rejects the selection.
  out.travel=Math.min(50,Math.ceil((sensorById(next.sensorId).body[0]+magnetSize(next)[0])/2+24));
 }else if(next.motion==='pivot'){
  // A short hinge movement stays near the useful region. The former 160° arc
  // forced packaged magnets far away simply to clear the housing corners.
  // This is a motion preset, not a threshold or an orientation-success search.
  if(patch.motion==='pivot'){out.span=30;next.span=30;}
  const h=magnetSize(next).map(n=>n/2) as Obb['h'],sensor=catalogueBodyObb(next);
  // Search an entire cycle at fine angular intervals; 1 mm final clearance covers between samples.
  const ceiling=Math.ceil(Math.hypot(...sensor.h)+Math.hypot(...h))+2;
  for(let offset=2;offset<=ceiling;offset+=.5){
   const trial={...next,offset};let clear=true;
   for(let i=0;i<=128&&clear;i++){const p=catalogueFrame(trial,i/128).pose;
    clear=!!p.frame&&!obbOverlap({path:'magnet',c:p.center,a:p.frame,h},sensor);
   }
   if(clear){out.offset=offset+1;break;}
  }
 }
 return out;
}
