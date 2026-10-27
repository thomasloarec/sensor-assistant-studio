import { sampleVolume, type ExperimentSettings } from '@/lib/detection-lab/workshop-experiment';
import type { Vec3 } from '@/lib/detection-lab/field';
self.onmessage=(event:MessageEvent<{settings:ExperimentSettings;axis:Vec3;planeZ:number;key:string}>)=>{
  try {const {settings,axis,planeZ,key}=event.data;const result=sampleVolume(settings,axis,planeZ);self.postMessage({key,result});}
  catch {self.postMessage({key:event.data.key,error:true});}
};