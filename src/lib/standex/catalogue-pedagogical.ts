/** Catalogue adaptation v1, separate from the frozen Form66 calibration.
 * Internal datums are explicit modelling hypotheses. No brochure bound is fitted.
 * All responses use evaluatePose/B and the common k×AT threshold.
 */
import { SENSOR_CATALOG, sensorById } from './sensor-catalog';
import { BARE_MAGNETS, packagedMagnet, ACTIVATION_BROCHURE } from './magnet-catalog';
import { guideRangesFor } from './activation-guide';
import { pedagogicalFrame, type PedagogicalFrame } from './pedagogical-poses';
import { rotate, componentPose, cycleU } from './machine-assembly';
import type { Vec3 } from './magnetic-workshop';
import { momentFor, magnetSize, type WorkshopConfig } from './magnetic-workshop';
import { PILOT_MAGNETS, type PilotMagnet } from '../detection-lab/magnets';
import { evaluatePose, type MagnetPose } from '../detection-lab/pose';
import { EXPERIMENT, DEFAULT_EXPERIMENT, classThresholds, experimentalScenarios, axisNodes, type PlacementEvidence, type SampledVolume, type TableSample } from '../detection-lab/workshop-experiment';
import { magnetObb, obbOverlap, type Obb } from '../detection-lab/obstacles';

export const CATALOGUE_MODEL_VERSION='catalogue-b-analogy-1';
/* i18n-canonical: internal diagnostic codes, never UI labels. */
const INTERNAL={missing:'catalogue_profile_missing',prior:'catalogue_modelling_prior',source:'catalogue_illustrative',leads:'length_only_analogy_leads_uncharacterized'};
/* i18n-canonical: model status, not product qualification. */
export const CATALOGUE_LABELS={form66:'Modèle 66 adapté',documented:'Modèle appuyé sur distances documentées',analogy:'Modèle par analogie',notice:'Simulation indicative · distances à confirmer avec Standex',datum:'Centre et axe internes estimés, non mesurés par le fabricant.',proxy:'Aimant représenté par un cylindre équivalent approximatif ; identité et boîtier conservés.',class:'Classe de modèle indicative ; le contact électrique ne définit pas une classe AT.',material:'Matériaux et implantation non caractérisés : zones indicatives, pas de prédiction affirmative.'};
type Family='66-capable'|'other'|'illustrative';
/** Each entry is intentional. The length is a bounded modelling prior, NOT glass specification. */
export const CATALOGUE_PROFILES:Record<string,{family:Family;lengthMm:number;method:string}>= {
 MK01:{family:'other',lengthMm:12,method:'board-centre'}, MK15:{family:'other',lengthMm:10,method:'body-centre'},
 MK16:{family:'other',lengthMm:8,method:'body-centre'}, MK17:{family:'other',lengthMm:6,method:'body-centre'},
 MK22:{family:'other',lengthMm:8,method:'body-centre'}, MK30:{family:'other',lengthMm:14,method:'board-centre'},
 MK31:{family:'other',lengthMm:4,method:'board-centre'}, 'MK06-4':{family:'other',lengthMm:8,method:'body-centre'},
 'MK24-A-J':{family:'other',lengthMm:3,method:'miniature-centre'}, MK03:{family:'66-capable',lengthMm:14,method:'body-centre'},
 MK02:{family:'other',lengthMm:14,method:'body-centre'}, MK04:{family:'66-capable',lengthMm:14,method:'body-centre'},
 MK05:{family:'66-capable',lengthMm:14,method:'body-centre'}, MK13:{family:'66-capable',lengthMm:14,method:'body-centre'},
 MK14:{family:'other',lengthMm:14,method:'body-centre'}, MK18:{family:'other',lengthMm:10,method:'body-centre'},
 MK20_1:{family:'other',lengthMm:6,method:'body-centre'}, MK20_2:{family:'other',lengthMm:5,method:'body-centre'},
 MK21:{family:'66-capable',lengthMm:14,method:'body-centre'}, MK21PR:{family:'other',lengthMm:14,method:'body-centre'},
 MK26:{family:'other',lengthMm:14,method:'body-centre'}, MK27:{family:'other',lengthMm:14,method:'body-centre'},
 'MK11-M5':{family:'other',lengthMm:14,method:'body-centre'}, 'MK11-M8':{family:'other',lengthMm:14,method:'body-centre'},
 'MK11-P-M8':{family:'other',lengthMm:14,method:'body-centre'}, 'MK11-B-M6':{family:'other',lengthMm:14,method:'body-centre'},
 MK36:{family:'other',lengthMm:10,method:'body-centre'}, MK37:{family:'other',lengthMm:14,method:'body-centre'},
 MK38:{family:'other',lengthMm:14,method:'body-centre'}, GENERIC:{family:'illustrative',lengthMm:14,method:'illustrative-centre'},
 CUSTOM:{family:'illustrative',lengthMm:14,method:'illustrative-centre'},
};
export function catalogueModel(c:WorkshopConfig){
 const p=CATALOGUE_PROFILES[c.sensorId];if(!p)throw Error(INTERNAL.missing);
 const sensor=sensorById(c.sensorId),rows=guideRangesFor(c.sensorId,c.magnetModel);
 const selected=c.guideReference??'';
 const family=selected.includes('GP501')?'GP501':selected.includes('66')&&p.family==='66-capable'?'66':p.family==='66-capable'&&!selected?'66-assumed':'analogy';
 const status=family==='66'||family==='66-assumed'?'form66':rows.length?'documented':'analogy';
 const lengthMm=family==='GP501'?Math.min(10,sensor.body[0]*.7):p.lengthMm;
 const bare=BARE_MAGNETS.find(m=>m.id===c.magnetModel),pack=packagedMagnet(c.magnetModel);
 const body=magnetSize(c);
 const moments=pack?.momentTypE6Vscm;const q=bare?.moment??(typeof moments==='number'?moments:Array.isArray(moments)?Math.min(...moments):null);
 const verified=PILOT_MAGNETS.find(m=>m.id===c.magnetModel);
 // Unknown active material/geometry: equivalent cylinder, explicit fixed SmCo moment prior.
 const diameterMm=bare?.shape==='cylinder'?body[1]:Math.sqrt(4*body[1]*body[2]/Math.PI);
 const magnetLengthMm=body[0],jT=(q??7.2)*1e-8/(Math.PI*(diameterMm/2000)**2*(magnetLengthMm/1000));
 const scale=lengthMm/14;
 const magnet:PilotMagnet=verified&&scale===1?verified:{...PILOT_MAGNETS[0],id:'SMCO5-5X4',label:c.magnetModel,material:bare?.material??pack?.magnetMaterial??'unknown',diameterMm:(verified?.diameterMm??diameterMm)/scale,lengthMm:(verified?.lengthMm??magnetLengthMm)/scale,jT:verified?.jT??jT,q:q??7.2,momentAm2:(q??7.2)*1e-8/(4*Math.PI*1e-7),volumeM3:Math.PI*(diameterMm/2000)**2*(magnetLengthMm/1000),momentRaw:INTERNAL.prior};
 const className=['B','C','D','E','F'].includes(c.sensitivity)?c.sensitivity:'C';
 const reasons=[CATALOGUE_LABELS.notice,CATALOGUE_LABELS.datum,...(!verified||bare?.shape==='block'?[CATALOGUE_LABELS.proxy]:[]),...(className!==c.sensitivity?[CATALOGUE_LABELS.class]:[]),...(c.ferromagnetic||c.temperature!=='ambient'?[CATALOGUE_LABELS.material]:[])];
 return {version:CATALOGUE_MODEL_VERSION,sensorId:c.sensorId,magnetId:c.magnetModel,family,status:status as 'form66'|'documented'|'analogy',lengthMm,scale,centre:[0,0,0] as Vec3,axis:[1,0,0] as Vec3,body:sensor.body,magnetBody:body,magnet,magnetGeometry:verified?'verified-cylinder':bare?.shape==='cylinder'&&q!==null?'moment-cylinder':'equivalent-cylinder',moment:q,unknownMoment:q===null,className,contact:sensor.contact,reference:selected,rows,reasons,sources:[ACTIVATION_BROCHURE,sensor.sourceFile??INTERNAL.source],method:p.method,leadEffect:INTERNAL.leads};
}
export function catalogueFrame(c:WorkshopConfig,t:number):PedagogicalFrame{
 const f=pedagogicalFrame(c,t);
 // The scene already rotates the sensor body about local Y. Apply the same
 // orientation to the estimated reed, never brochure up/to datum offsets.
 if(c.machine){
  const magnet=componentPose(c.machine,'magnet',cycleU(c.machine,t)),axis=magnet.transform(momentFor({...c,magnetTilt:0},0));
  const dot=(a:Vec3,b:Vec3)=>a.reduce((sum,n,i)=>sum+n*(b[i]??0),0);
  return {...f,world:{...f.world,axis},pose:{...f.pose,axis:f.basis.map(v=>dot(v,axis)) as Vec3}};
 }
 const u=t<=.5?t*2:(1-t)*2,depth=c.start+(c.end-c.start)*u;
 const center:Vec3=c.motion==='slide'?[-c.travel+2*c.travel*u,0,c.offset]:c.motion==='pivot'?[Math.sin(c.span*(u-.5)*Math.PI/180)*c.offset,0,Math.cos(c.span*(u-.5)*Math.PI/180)*c.offset]:c.geometry==='D3'?[depth,0,c.lateralShift]:[c.lateralShift,0,depth];
 const angle=c.magnetAngle+(c.motion==='pivot'?c.span*(u-.5):0);
 const axis=momentFor(c,angle);
 const transform=(v:Vec3)=>f.basis[0].map((_,j)=>(f.basis[0][j]??0)*v[0]+(f.basis[1][j]??0)*v[1]+(f.basis[2][j]??0)*v[2]) as Vec3;
 const world={center:transform(center).map((n,i)=>n+(f.origin[i]??0)) as Vec3,axis:transform(axis)};
 const basis=f.basis.map((_,i)=>{const v=rotate(([ [1,0,0],[0,1,0],[0,0,1] ][i]??[1,0,0]) as Vec3,[0,-c.sensorAngle,0]);return f.basis[0].map((__,j)=>(f.basis[0][j]??0)*v[0]+(f.basis[1][j]??0)*v[1]+(f.basis[2][j]??0)*v[2]) as Vec3;}) as [Vec3,Vec3,Vec3];
 const dot=(a:Vec3,b:Vec3)=>a.reduce((sum,n,i)=>sum+n*(b[i]??0),0),d=world.center.map((n,i)=>n-(f.origin[i]??0)) as Vec3;
 return {...f,world,basis,pose:{center:basis.map(v=>dot(v,d)) as Vec3,axis:basis.map(v=>dot(v,world.axis)) as Vec3}};
}
export function catalogueBodyObb(c:WorkshopConfig):Obb{return {path:'sensor-body',c:[0,0,0],a:[[1,0,0],[0,1,0],[0,0,1]],h:sensorById(c.sensorId).body.map(n=>n/2) as Vec3};}
export function cataloguePlacement(c:WorkshopConfig,pose:MagnetPose,obstacles:readonly Obb[]=[],model=catalogueModel(c),nominalOnly=false):PlacementEvidence{
 const m=model,p={center:pose.center.map(n=>n/m.scale) as Vec3,axis:pose.axis},th=classThresholds(m.className);
 const unavailable=(cause:PlacementEvidence['cause']):PlacementEvidence=>({state:'unavailable',cause,nominal:null,scenarios:[],zone:0,partial:false});
 if(!th)return unavailable('missing');
 const realMagnet=magnetObb(Math.max(m.magnetBody[1],m.magnetBody[2]),m.magnetBody[0],pose);
 if(!realMagnet)return unavailable('domain');
 if(obbOverlap(realMagnet,catalogueBodyObb(c))||obstacles.some(o=>obbOverlap(realMagnet,o)))return unavailable('overlap');
 const scenarios=experimentalScenarios(!nominalOnly).map(s=>({id:s.id,result:evaluatePose(m.magnet,p,s,'B')}));
 const nominal=evaluatePose(m.magnet,p,experimentalScenarios(false)[0]??{id:'nominal',shift:[0,0,0],lengthFactor:1,momentFactor:1},'B');
 if(!nominal.ok)return unavailable(nominal.reason==='domain'?'domain':'collision');
 const responses=scenarios.flatMap(s=>s.result.ok?[s.result.response]:[]);
 const zone=nominal.response>=th.high?2:nominal.response>=(th.low??0)?1:0;
 let state:PlacementEvidence['state']=!nominalOnly&&responses.length!==9?'variable':responses.every(r=>r>=th.high)?'favorable':responses.every(r=>r<(th.low??0))?'unfavorable':'variable';
 if((c.ferromagnetic||c.temperature!=='ambient'||m.unknownMoment||!['B','C','D','E','F'].includes(c.sensitivity))&&state==='favorable')state='variable';
 return {state,cause:nominal.response===0?'orientation':'distance',nominal,scenarios,zone,partial:false};
}
export function catalogueVolume(c:WorkshopConfig,axis:Vec3,planeZ:number,obstacles:readonly Obb[]=[],extent=24):SampledVolume{
 const start=performance.now(),xs=axisNodes(-extent,extent,true),ys=axisNodes(-extent,extent),zs=axisNodes(-extent,extent);
 if(!zs.includes(planeZ)&&Math.abs(planeZ)<=extent){zs.push(planeZ);zs.sort((a,b)=>a-b);}
 const cells:SampledVolume['cells']=[],cut:SampledVolume['cut']=[];
 const model=catalogueModel(c);
 const bound=(ns:number[],i:number):[number,number]=>[i===0?-extent:((ns[i-1]??0)+(ns[i]??0))/2,i===ns.length-1?extent:((ns[i]??0)+(ns[i+1]??0))/2];
 // Same evaluator as point/cut/timeline, including body collision; no angle quantization.
 for(let k=0;k<zs.length;k++)for(let j=0;j<ys.length;j++)for(let i=0;i<xs.length;i++){
  const x=xs[i]??0,y=ys[j]??0,z=zs[k]??0,e=cataloguePlacement(c,{center:[x,y,z],axis},obstacles,model,true);
  const [x0,x1]=bound(xs,i),[y0,y1]=bound(ys,j),[z0,z1]=bound(zs,k);
  const cell={i,j,k,x,y,z,x0,x1,y0,y1,z0,z1,zone:e.zone,response:e.nominal?.ok?e.nominal.response:null,blocked:e.cause==='overlap'};
  if(e.zone)cells.push(cell);if(z===planeZ)cut.push(cell);
 }
 return {key:JSON.stringify([CATALOGUE_MODEL_VERSION,c,axis,planeZ,obstacles]),cells,cut,axis,planeZ,extent,computeMs:performance.now()-start,nodeCount:xs.length*ys.length*zs.length,truncated:cells.some(c=>Math.max(Math.abs(c.x),Math.abs(c.y),Math.abs(c.z))===extent)};
}
export function catalogueTimeline(c:WorkshopConfig,table?:readonly TableSample[],steps=128){
 const samples=table??Array.from({length:steps*2+1},(_,i)=>{const t=i/(steps*2);return {t,pose:catalogueFrame(c,t).pose,obstacles:[]};});
 const points=samples.map(s=>{const e=s.obstacles===null?{state:'unavailable' as const,nominal:null,zone:0 as const}:cataloguePlacement(c,s.pose,s.obstacles);return {t:s.t,state:e.state,response:e.nominal?.ok?e.nominal.response:null,zone:e.zone};});
 const events=points.flatMap((p,i)=>{const before=points[i-1];return before&&before.state!==p.state?[{from:before.t,to:p.t,resolved:false,before:before.state,after:p.state}]:[];});
 return {points,events,electrical:'uncharacterized' as const,baseResolution:1/(steps*2),resolutionCertified:false as const};
}
export function catalogueCoverage(){return SENSOR_CATALOG.map(s=>({sensorId:s.id,body:s.body,profile:CATALOGUE_PROFILES[s.id]}));}