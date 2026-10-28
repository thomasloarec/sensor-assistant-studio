import { sampleVolume, placementTimeline, tableTimeline, type ExperimentSettings, type TableSample } from '@/lib/detection-lab/workshop-experiment';
import { pedagogicalFrame } from '@/lib/standex/pedagogical-poses';
import type { WorkshopConfig } from '@/lib/standex/magnetic-workshop';
import type { Vec3 } from '@/lib/detection-lab/field';
import type { Obb } from '@/lib/detection-lab/obstacles';
import { catalogueVolume, catalogueCut, catalogueTimeline } from '@/lib/standex/catalogue-pedagogical';
/** Physics only. Imported mountings arrive as numeric poses/boxes: no file, clip or track is sent here.
 * mode 'volume' returns the 3D grid (cut stripped); mode 'cut' computes ONLY the chosen plane.
 * Every result carries the REQUEST key: internal sampling keys never leak into the hook contract. */
self.onmessage=(event:MessageEvent<{settings:ExperimentSettings;axis:Vec3;planeZ:number;key:string;config?:WorkshopConfig;catalogue?:WorkshopConfig;table?:TableSample[];obstacles?:Obb[];frame?:[Vec3,Vec3,Vec3];mode?:'volume'|'cut'|'full'}>)=>{
  try {
    const {settings,axis,planeZ,key,config,table,obstacles,catalogue,frame,mode}=event.data;
    if(catalogue){
      if(config||table){self.postMessage({key,result:{...catalogueTimeline(catalogue,table),key}});return;}
      if(mode==='cut'){self.postMessage({key,result:{...catalogueCut(catalogue,axis,planeZ,obstacles??[],24,frame),key}});return;}
      const v=catalogueVolume(catalogue,axis,planeZ,obstacles??[],24,frame);
      self.postMessage({key,result:{...v,key,cut:mode==='volume'?[]:v.cut}});
      return;
    }
    const result=table?tableTimeline(settings,table):config?placementTimeline(settings,t=>pedagogicalFrame(config,t).pose):sampleVolume(settings,axis,planeZ,24,obstacles??[]);
    self.postMessage({key,result:mode==='cut'?{...result,cells:[],key}:mode==='volume'?{...result,cut:[],key}:{...result,key}});
  }
  catch {self.postMessage({key:event.data.key,error:true});}
};
