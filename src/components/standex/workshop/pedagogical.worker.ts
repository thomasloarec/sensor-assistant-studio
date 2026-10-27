import { sampleVolume, placementTimeline, type ExperimentSettings } from '@/lib/detection-lab/workshop-experiment';
import { pedagogicalFrame } from '@/lib/standex/pedagogical-poses';
import type { WorkshopConfig } from '@/lib/standex/magnetic-workshop';
import type { Vec3 } from '@/lib/detection-lab/field';
self.onmessage=(event:MessageEvent<{settings:ExperimentSettings;axis:Vec3;planeZ:number;key:string;config?:WorkshopConfig}>)=>{
  try {const {settings,axis,planeZ,key,config}=event.data;const result=config?placementTimeline(settings,t=>pedagogicalFrame(config,t).pose):sampleVolume(settings,axis,planeZ);self.postMessage({key,result});}
  catch {self.postMessage({key:event.data.key,error:true});}
};