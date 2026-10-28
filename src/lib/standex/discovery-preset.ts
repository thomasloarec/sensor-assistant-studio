import { approachOffset, magnetSize, type WorkshopConfig } from './magnetic-workshop';
import { sensorById } from './sensor-catalog';
import { catalogueBodyObb, catalogueFrame } from './catalogue-pedagogical';
import { obbOverlap, type Obb } from '../detection-lab/obstacles';
/** Explicit discovery actions only. Mechanical clearance, never a magnetic success preset.
 * Imports, rendering, reopening and dossier restoration must not call this function. */
export function discoveryPatch(c:WorkshopConfig,patch:Partial<WorkshopConfig>):Partial<WorkshopConfig>{
 if(c.machine)return patch;
 const next={...c,...patch},out={...patch};
 if(next.motion==='slide'){
  out.offset=approachOffset({...next,geometry:'D1'})+2;
  out.travel=Math.ceil((sensorById(next.sensorId).body[0]+magnetSize(next)[0])/2+12);
 }else if(next.motion==='pivot'){
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
