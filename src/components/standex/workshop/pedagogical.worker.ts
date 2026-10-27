import { sampleVolume, placementTimeline, tableTimeline, type ExperimentSettings, type TableSample } from '@/lib/detection-lab/workshop-experiment';
import { pedagogicalFrame } from '@/lib/standex/pedagogical-poses';
import type { WorkshopConfig } from '@/lib/standex/magnetic-workshop';
import type { Vec3 } from '@/lib/detection-lab/field';
import type { Obb } from '@/lib/detection-lab/obstacles';
import { catalogueVolume, catalogueTimeline } from '@/lib/standex/catalogue-pedagogical';
/** Physics only. Imported mountings arrive as numeric poses/boxes: no file, clip or track is sent here. */
self.onmessage=(event:MessageEvent<{settings:ExperimentSettings;axis:Vec3;planeZ:number;key:string;config?:WorkshopConfig;catalogue?:WorkshopConfig;table?:TableSample[];obstacles?:Obb[];frame?:[Vec3,Vec3,Vec3]}>)=>{
  try {
    const {settings,axis,planeZ,key,config,table,obstacles,catalogue,frame}=event.data;
    const result=catalogue?(config||table?catalogueTimeline(catalogue,table):{...catalogueVolume(catalogue,axis,planeZ,obstacles??[],24,frame),key}):table?tableTimeline(settings,table):config?placementTimeline(settings,t=>pedagogicalFrame(config,t).pose):{...sampleVolume(settings,axis,planeZ,24,obstacles??[]),key};
    self.postMessage({key,result});
  }
  catch {self.postMessage({key:event.data.key,error:true});}
};
