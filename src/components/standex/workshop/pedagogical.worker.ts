import { sampleVolume, placementTimeline, tableTimeline, type ExperimentSettings, type TableSample } from '@/lib/detection-lab/workshop-experiment';
import { catalogueThresholds as classThresholds } from '@/lib/standex/catalogue-response';
import { pedagogicalFrame } from '@/lib/standex/pedagogical-poses';
import type { WorkshopConfig } from '@/lib/standex/magnetic-workshop';
import type { Vec3 } from '@/lib/detection-lab/field';
import type { Obb } from '@/lib/detection-lab/obstacles';
import { catalogueVolume, catalogueCut, catalogueTimeline, catalogueModel, adaptivePivotPlan, pivotBoundary, orientationBoundary, type CataloguePose } from '@/lib/standex/catalogue-pedagogical';
import { packSurface } from '@/lib/standex/zone-surface';
/** Physics only. Imported mountings arrive as numeric poses/boxes: no file, clip or track is sent here.
 * mode 'volume' returns the 3D grid (cut stripped); mode 'cut' computes ONLY the chosen plane.
 * Every result carries the REQUEST key: internal sampling keys never leak into the hook contract. */
self.onmessage=(event:MessageEvent<{settings:ExperimentSettings;axis:Vec3;planeZ:number;key:string;config?:WorkshopConfig;catalogue?:WorkshopConfig;table?:TableSample[];orientations?:{t:number;pose:CataloguePose}[];obstacles?:Obb[];frame?:[Vec3,Vec3,Vec3];mode?:'volume'|'cut'|'full'|'plan'}>)=>{
  try {
    const {settings,axis,planeZ,key,config,table,obstacles,catalogue,frame,mode}=event.data;
    if(catalogue&&mode==='plan'){
      const poses=new Map(event.data.orientations?.map(s=>[s.t,s.pose])),m=catalogueModel(catalogue);
      // Probe depends on orientation only. Out-and-back poses share it exactly;
      // avoid recomputing all rays for every repeated translation/time sample.
      const probes=new Map<string,(number|null)[]>();
      const probe=(t:number)=>{const p=poses.get(t);if(!p)return pivotBoundary(catalogue,t,m);
        const id=JSON.stringify([p.axis,p.frame].map(v=>v?.flat().map(n=>Math.round(n*1e10)/1e10)));
        const hit=probes.get(id);if(hit)return hit;
        const value=orientationBoundary(catalogue,p,m);probes.set(id,value);return value;};
      const close=(a:number,b:number)=>{
        const p=poses.get(a),q=poses.get(b);if(!p||!q)return true;
        const axes=[p.axis,...p.frame??[]],other=[q.axis,...q.frame??[]];
        return axes.every((v,i)=>v.reduce((s,n,j)=>s+n*(other[i]?.[j]??0),0)>=Math.cos(7.5*Math.PI/180)-1e-12);
      };
      self.postMessage({key,plan:adaptivePivotPlan(probe,1/128,.5,(a,b,c)=>close(a,b)&&close(b,c)&&close(a,c))});return;
    }
    if(catalogue){
      if(config||table){self.postMessage({key,result:{...catalogueTimeline(catalogue,table),key}});return;}
      if(mode==='cut'){self.postMessage({key,result:{...catalogueCut(catalogue,axis,planeZ,obstacles??[],24,frame),key}});return;}
      const v=catalogueVolume(catalogue,axis,mode==='volume'?0:planeZ,obstacles??[],24,frame);
      const th=classThresholds(catalogueModel(catalogue).className);
      const surfaces=th?[th.low===null?null:packSurface(v.field,th.low),packSurface(v.field,th.high)]:undefined;
      // Meshes are built once off-thread. Playback never reconstructs 190k cells in the UI.
      self.postMessage({key,result:{...v,key,surfaces,cells:mode==='volume'?[]:v.cells,cut:mode==='volume'?[]:v.cut}});
      return;
    }
    const result=table?tableTimeline(settings,table):config?placementTimeline(settings,t=>pedagogicalFrame(config,t).pose):sampleVolume(settings,axis,planeZ,24,obstacles??[]);
    self.postMessage({key,result:mode==='cut'?{...result,cells:[],key}:mode==='volume'?{...result,cut:[],key}:{...result,key}});
  }
  catch {self.postMessage({key:event.data.key,error:true});}
};
