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
import { momentFor, magnetSize, poseAt, type WorkshopConfig } from './magnetic-workshop';
import { PILOT_MAGNETS, type PilotMagnet } from '../detection-lab/magnets';
import { gaussLegendre, type MagnetPose, type PoseEvaluation } from '../detection-lab/pose';
import { cylinderField, cylinderSignedDistance } from '../detection-lab/field';
import { PROFILE, type ReedScenario } from '../detection-lab/profile';
import { fieldAtPoint } from './magnetics/field';
import { EXPERIMENT, DEFAULT_EXPERIMENT, classThresholds, experimentalScenarios, nominalScenario, axisNodes, type PlacementEvidence, type SampledVolume, type TableSample } from '../detection-lab/workshop-experiment';
import { magnetObb, obbOverlap, type Obb } from '../detection-lab/obstacles';
import { publishedRowsForCouple, publishedRowsSourceUrl, PUBLISHED_REGISTRY } from './magnetics/registries';

export const CATALOGUE_MODEL_VERSION='catalogue-b-analogy-1.1';
/* i18n-canonical: internal diagnostic codes, never UI labels. */
const INTERNAL={missing:'catalogue_profile_missing',prior:'catalogue_modelling_prior',source:'catalogue_illustrative',leads:'length_only_analogy_leads_uncharacterized'};
/* i18n-canonical: model status, not product qualification. */
export const CATALOGUE_LABELS={form66:'Modèle 66 adapté',documented:'Distances constructeur disponibles · géométrie estimée',analogy:'Modèle par analogie',notice:'Simulation indicative · distances à confirmer avec Standex',datum:'Centre et axe internes estimés, non mesurés par le fabricant.',proxy:'Aimant représenté par un cylindre équivalent approximatif ; identité et boîtier conservés.',class:'Classe de modèle indicative ; le contact électrique ne définit pas une classe AT.',ferrous:'MK02 est un détecteur de métal ferreux à aimant intégré : cette illustration reed + aimant externe ne prédit pas sa fonction.',f1:'L’implantation interne supposée ne reproduit pas encore la distance frontale publiée. Les zones affichées ne permettent pas de conclure sur cette approche ; faire confirmer le placement par Standex.',fallbackC:'Classe de modèle C de repli : classe du produit non connue.',reed66:'Reed 66 identifié par la variante choisie',reed66assumed:'Reed 66 supposé : variante non précisée',analogyReed:'Analogie avec un autre reed : réponse transposée, non mesurée',partialA:'Classe A : seule la borne prudente de 10 AT est modélisée ; aucune conclusion en dessous.',material:'Matériaux et implantation non caractérisés : zones indicatives, pas de prédiction affirmative.'};
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
 MK14:{family:'66-capable',lengthMm:14,method:'body-centre'}, MK18:{family:'other',lengthMm:10,method:'body-centre'},
 MK20_1:{family:'other',lengthMm:6,method:'body-centre'}, MK20_2:{family:'other',lengthMm:5,method:'body-centre'},
 MK21:{family:'66-capable',lengthMm:14,method:'body-centre'}, MK21PR:{family:'other',lengthMm:14,method:'body-centre'},
 MK26:{family:'other',lengthMm:14,method:'body-centre'}, MK27:{family:'other',lengthMm:14,method:'body-centre'},
 'MK11-M5':{family:'other',lengthMm:14,method:'body-centre'}, 'MK11-M8':{family:'66-capable',lengthMm:14,method:'body-centre'},
 'MK11-P-M8':{family:'other',lengthMm:14,method:'body-centre'}, 'MK11-B-M6':{family:'other',lengthMm:14,method:'body-centre'},
 MK36:{family:'other',lengthMm:10,method:'body-centre'}, MK37:{family:'other',lengthMm:14,method:'body-centre'},
 MK38:{family:'66-capable',lengthMm:14,method:'body-centre'}, GENERIC:{family:'illustrative',lengthMm:14,method:'illustrative-centre'},
 CUSTOM:{family:'illustrative',lengthMm:14,method:'illustrative-centre'},
};
export function catalogueModel(c:WorkshopConfig){
 const p=CATALOGUE_PROFILES[c.sensorId];if(!p)throw Error(INTERNAL.missing);
 const sensor=sensorById(c.sensorId),rows=guideRangesFor(c.sensorId,c.magnetModel),publishedRows=publishedRowsForCouple(c.sensorId,c.magnetModel,PUBLISHED_REGISTRY);
 const publishedSelection=publishedRows.find(r=>r.sensitivityClass===c.sensitivity);
 const selected=c.guideReference??publishedSelection?.sensorReference??'';
 const family=selected.includes('GP501')?'GP501':selected.includes('85')?'85':selected.includes('90')?'90':selected.includes('66')&&p.family==='66-capable'?'66':p.family==='66-capable'&&!selected&&c.sensorId!=='MK38'?'66-assumed':'analogy';
 const status=family==='66'||family==='66-assumed'?'form66':rows.length||publishedRows.length?'documented':'analogy';
 const lengthMm=family==='GP501'?Math.min(10,sensor.body[0]*.7):p.lengthMm;
 const bare=BARE_MAGNETS.find(m=>m.id===c.magnetModel),pack=packagedMagnet(c.magnetModel);
 const body=magnetSize(c);
 const moments=pack?.momentTypE6Vscm;const q=bare?.moment??(typeof moments==='number'?moments:Array.isArray(moments)?Math.min(...moments):null);
 const verified=PILOT_MAGNETS.find(m=>m.id===c.magnetModel);
 // Field source in PHYSICAL mm (never rescaled by the reed length):
 // verified pilots keep their frozen cylinder; bare catalogue blocks use the
 // analytic block field; bare cylinders use their own geometry; packaged inserts
 // are an explicit equivalent-cylinder hypothesis inside the real outer body.
 const vol=(bare?.shape==='block'?body[0]*body[1]*body[2]:Math.PI*(body[1]/2)**2*body[0])*1e-9;
 const insertD=Math.min(5,body[1],body[2]),insertL=Math.min(8,body[0]);
 const J=(q??7.2)*1e-8/(pack?Math.PI*(insertD/2000)**2*(insertL/1000):vol);
 const field:CatalogueField=verified?{kind:'cylinder',radiusMm:verified.diameterMm/2,lengthMm:verified.lengthMm,jT:verified.jT}:bare?.shape==='block'?{kind:'block',dims:[body[0],body[1],body[2]],brMt:J*1000}:pack?{kind:'cylinder',radiusMm:insertD/2,lengthMm:insertL,jT:J}:{kind:'cylinder',radiusMm:body[1]/2,lengthMm:body[0],jT:J};
 const magnet:PilotMagnet=verified??{...PILOT_MAGNETS[0]!,label:c.magnetModel,material:bare?.material??pack?.magnetMaterial??'unknown',momentRaw:INTERNAL.prior};
 const className=['A','B','C','D','E','F'].includes(c.sensitivity)?c.sensitivity:'C';
 const reasons=[CATALOGUE_LABELS.notice,CATALOGUE_LABELS.datum,...(pack||(!verified&&bare?.shape!=='block')?[CATALOGUE_LABELS.proxy]:[]),...(className!==c.sensitivity?[CATALOGUE_LABELS.class]:[]),...(className==='A'?[CATALOGUE_LABELS.partialA]:[]),...(c.sensorId==='MK02'?[CATALOGUE_LABELS.ferrous]:[]),...(c.ferromagnetic||c.temperature!=='ambient'?[CATALOGUE_LABELS.material]:[])];
 return {version:CATALOGUE_MODEL_VERSION,sensorId:c.sensorId,magnetId:c.magnetModel,family,status:status as 'form66'|'documented'|'analogy',lengthMm,scale:lengthMm/14,centre:[0,0,0] as Vec3,axis:[1,0,0] as Vec3,body:sensor.body,magnetBody:body,magnet,field,magnetGeometry:verified?'verified-cylinder':bare?.shape==='block'?'analytic-block':bare?.shape==='cylinder'&&q!==null?'moment-cylinder':'equivalent-cylinder',moment:q,unknownMoment:q===null,className,contact:sensor.contact,reference:selected,rows,publishedRows,publishedSource:publishedRowsSourceUrl(publishedRows),familyReferences:PUBLISHED_REGISTRY.rows.filter(r=>r.sensorFamily===c.sensorId).map(r=>r.sensorReference),reasons,sources:[ACTIVATION_BROCHURE,publishedRowsSourceUrl(publishedRows)??sensor.sourceFile??INTERNAL.source],method:p.method,leadEffect:INTERNAL.leads};
}
type Frame=[Vec3,Vec3,Vec3];
export type CatalogueField={kind:'cylinder';radiusMm:number;lengthMm:number;jT:number}|{kind:'block';dims:Vec3;brMt:number};
/** Magnet pose with its full BODY frame (rows = body X/Y/Z), independent of the pole axis. */
export type CataloguePose=MagnetPose&{frame?:Frame};
const dot=(a:readonly number[],b:readonly number[])=>a.reduce((sum,n,i)=>sum+n*(b[i]??0),0);
const E:Frame=[[1,0,0],[0,1,0],[0,0,1]];
/** Body frame in WORLD axes, same rotation as the scene and approachOffset. */
export function magnetBodyFrame(c:WorkshopConfig,angle:number):Frame{return E.map(e=>rotate(e,[0,-angle,c.magnetTilt])) as Frame;}
/** Shares poseAt (surface-gap convention incl. F1 faces) for position and the scene rotation for the body. */
export function catalogueFrame(c:WorkshopConfig,t:number):PedagogicalFrame&{pose:CataloguePose;world:CataloguePose}{
 const f=pedagogicalFrame(c,t);
 if(c.machine){
  const mp=componentPose(c.machine,'magnet',cycleU(c.machine,t)),axis=mp.transform(momentFor({...c,magnetTilt:0},0));
  const wf=magnetBodyFrame({...c,magnetTilt:0},0).map(v=>mp.transform(v)) as Frame;
  const toLocal=(v:Vec3)=>f.basis.map(b=>dot(b,v)) as Vec3;
  return {...f,world:{...f.world,axis,frame:wf},pose:{...f.pose,axis:toLocal(axis),frame:wf.map(toLocal) as Frame}};
 }
 // Global mounting (mountX/Z, mountAngle) then the sensor's own rotation, as in the scene.
 const p=poseAt(c,t),M=(v:Vec3)=>rotate(v,[0,-c.mountAngle,0]),origin:Vec3=[c.mountX,0,c.mountZ];
 const axis=M(momentFor(c,p.angle)),wf=magnetBodyFrame(c,p.angle).map(M) as Frame;
 const basis=E.map(e=>M(rotate(e,[0,-c.sensorAngle,0]))) as Frame,mp=M(p.position);
 const center=mp.map((v,i)=>v+(origin[i]??0)) as Vec3;
 const toLocal=(v:Vec3)=>basis.map(b=>dot(b,v)) as Vec3;
 return {origin,basis,world:{center,axis,frame:wf},pose:{center:toLocal(mp),axis:toLocal(axis),frame:wf.map(toLocal) as Frame}};
}
export function catalogueBodyObb(c:WorkshopConfig):Obb{return {path:'sensor-body',c:[0,0,0],a:E,h:sensorById(c.sensorId).body.map(n=>n/2) as Vec3};}
/** Catalogue evaluator (physical mm). Same blade integral, Gauss nodes and B response as the
 * frozen kernel; reed effective length and scenario shifts scale with the profile's estimated
 * reed length (documented hypothesis); the calculation domain does NOT. */
export function catalogueEvaluate(m:ReturnType<typeof catalogueModel>,pose:CataloguePose,s:ReedScenario,frame:Frame,quadrature=PROFILE.reed.quadraturePerBlade):PoseEvaluation{
 const n=Math.hypot(...pose.axis);if(!(n>0)||!pose.center.every(Number.isFinite))return {ok:false,reason:'invalid'};
 if(Math.hypot(...pose.center)>PROFILE.domain.maxCenterMm)return {ok:false,reason:'domain'};
 const axis=pose.axis.map(v=>v/n) as Vec3,k=m.lengthMm/14,half=PROFILE.reed.effectiveLengthMm*s.lengthFactor*k/2,sh=s.shift.map(v=>v*k);
 const fd=m.field;
 const B=(q:Vec3):number=>{
  if(fd.kind==='cylinder'){const body={radiusMm:fd.radiusMm,lengthMm:fd.lengthMm,jT:fd.jT*s.momentFactor,center:pose.center,axis};return cylinderSignedDistance(body,q)<=0?NaN:cylinderField(body,q)[0];}
  const d=q.map((v,i)=>v-(pose.center[i]??0)) as Vec3,local=frame.map(r=>dot(r,d)) as Vec3;
  const proj=frame.map(r=>dot(r,axis)),ax=proj.map(Math.abs).indexOf(Math.max(...proj.map(Math.abs))) as 0|1|2;
  const r=fieldAtPoint({shape:'block',dimensionsMm:fd.dims,innerDiameterMm:0,magnetizationAxis:ax,brMt:fd.brMt*s.momentFactor,polarity:(proj[ax]??1)<0?-1:1,pose:{positionMm:[0,0,0],rotationDeg:[0,0,0]}} as Parameters<typeof fieldAtPoint>[0],local);
  if(!r.ok)return NaN;const b=r.field.bVectorMt;return frame.reduce((sum,row,i)=>sum+(b[i]??0)*(row[0]??0),0);
 };
 const g=gaussLegendre(quadrature);
 const blade=(from:number,to:number)=>{let sum=0;for(let i=0;i<g.x.length;i++){const x=from+((g.x[i]!+1)/2)*(to-from);sum+=(g.w[i]!/2)*B([x+(sh[0]??0),sh[1]??0,sh[2]??0]);}return sum;};
 const m1=blade(-half,0),m2=blade(0,half);
 if(!Number.isFinite(m1)||!Number.isFinite(m2))return {ok:false,reason:'collision'};
 return {ok:true,response:m1*m2>0?Math.min(Math.abs(m1),Math.abs(m2)):0,m1,m2};
}
export function cataloguePlacement(c:WorkshopConfig,pose:CataloguePose,obstacles:readonly Obb[]=[],model=catalogueModel(c),nominalOnly=false):PlacementEvidence{
 const m=model,th=classThresholds(m.className);
 const unavailable=(cause:PlacementEvidence['cause']):PlacementEvidence=>({state:'unavailable',cause,nominal:null,scenarios:[],zone:0,partial:false});
 if(!th)return unavailable('missing');
 if(!(Math.hypot(...pose.axis)>0)||!pose.center.every(Number.isFinite))return unavailable('domain');
 const frame=pose.frame??magnetBodyFrame(c,c.magnetAngle);
 const realMagnet:Obb={path:'magnet',c:[...pose.center],a:frame,h:m.magnetBody.map(n=>n/2) as Vec3};
 if(obbOverlap(realMagnet,catalogueBodyObb(c))||obstacles.some(o=>obbOverlap(realMagnet,o)))return unavailable('overlap');
 const nominal=catalogueEvaluate(m,pose,nominalScenario(),frame);
 if(!nominal.ok)return unavailable(nominal.reason==='domain'?'domain':'collision');
 const scenarios=nominalOnly?[]:experimentalScenarios(true).map(s=>({id:s.id,result:catalogueEvaluate(m,pose,s,frame)}));
 const responses=scenarios.flatMap(s=>s.result.ok?[s.result.response]:[]);
 const partial=th.low===null;
 const zone=nominal.response>=th.high?2:th.low!==null&&nominal.response>=th.low?1:0;
 // Class A: only the prudent 10 AT bound exists; below it nothing is claimed (never zero-filled).
 let state:PlacementEvidence['state']=nominalOnly||responses.length!==scenarios.length?'variable':responses.every(r=>r>=th.high)?'favorable':th.low!==null&&responses.every(r=>r<th.low!)?'unfavorable':'variable';
 if((c.ferromagnetic||c.temperature!=='ambient'||m.unknownMoment||m.className!==c.sensitivity)&&state==='favorable')state='variable';
 return {state,cause:nominal.response===0?'orientation':'distance',nominal,scenarios,zone,partial};
}
export function catalogueVolume(c:WorkshopConfig,axis:Vec3,planeZ:number,obstacles:readonly Obb[]=[],extent=24,frame?:Frame):SampledVolume{
 const start=performance.now(),xs=axisNodes(-extent,extent,true),ys=axisNodes(-extent,extent),zs=axisNodes(-extent,extent);
 if(!zs.includes(planeZ)&&Math.abs(planeZ)<=extent){zs.push(planeZ);zs.sort((a,b)=>a-b);}
 const cells:SampledVolume['cells']=[],cut:SampledVolume['cut']=[];
 const model=catalogueModel(c);
 const bound=(ns:number[],i:number):[number,number]=>[i===0?-extent:((ns[i-1]??0)+(ns[i]??0))/2,i===ns.length-1?extent:((ns[i]??0)+(ns[i+1]??0))/2];
 // Same evaluator as point/cut/timeline, including body collision; no angle quantization.
 for(let k=0;k<zs.length;k++)for(let j=0;j<ys.length;j++)for(let i=0;i<xs.length;i++){
  const x=xs[i]??0,y=ys[j]??0,z=zs[k]??0,e=cataloguePlacement(c,frame?{center:[x,y,z],axis,frame}:{center:[x,y,z],axis},obstacles,model,true);
  const [x0,x1]=bound(xs,i),[y0,y1]=bound(ys,j),[z0,z1]=bound(zs,k);
  const cell={i,j,k,x,y,z,x0,x1,y0,y1,z0,z1,zone:e.zone,response:e.nominal?.ok?e.nominal.response:null,blocked:e.cause==='overlap'};
  if(e.zone)cells.push(cell);if(z===planeZ)cut.push(cell);
 }
 return {key:JSON.stringify([CATALOGUE_MODEL_VERSION,c,axis,frame??null,planeZ,obstacles]),cells,cut,axis,planeZ,extent,computeMs:performance.now()-start,nodeCount:xs.length*ys.length*zs.length,truncated:cells.some(c=>Math.max(Math.abs(c.x),Math.abs(c.y),Math.abs(c.z))===extent)};
}
export function catalogueTimeline(c:WorkshopConfig,table?:readonly TableSample[],steps=128){
 const samples=table??Array.from({length:steps*2+1},(_,i)=>{const t=i/(steps*2);return {t,pose:catalogueFrame(c,t).pose,obstacles:[]};});
 const points=samples.map(s=>{const e=s.obstacles===null?{state:'unavailable' as const,nominal:null,zone:0 as const}:cataloguePlacement(c,s.pose,s.obstacles);return {t:s.t,state:e.state,response:e.nominal?.ok?e.nominal.response:null,zone:e.zone};});
 const events=points.flatMap((p,i)=>{const before=points[i-1];return before&&before.state!==p.state?[{from:before.t,to:p.t,resolved:false,before:before.state,after:p.state}]:[];});
 return {points,events,electrical:'uncharacterized' as const,baseResolution:1/(steps*2),resolutionCertified:false as const};
}
export function catalogueCoverage(){return SENSOR_CATALOG.map(s=>({sensorId:s.id,body:s.body,profile:CATALOGUE_PROFILES[s.id]}));}
/** AT classes selectable for the couple: published registry classes plus the 66-reed guide rows
 * (class letter right after "66"). Contact form (1A/1B/1C) is never an AT class. */
export function catalogueClasses(sensorId:string,magnetModel:string,published:readonly string[]):string[]{
 const guide=guideRangesFor(sensorId,magnetModel).flatMap(r=>{const m=/66([A-G])\b|66([A-G])-/.exec(r.sensorReference);const k=m?.[1]??m?.[2];return k?[k]:[];});
 return [...new Set([...published,...guide])].sort();
}

/** Notes shown next to the verdict (never remedies). */
export function catalogueVerdictNotes(c:WorkshopConfig,m:ReturnType<typeof catalogueModel>):string[]{
 return [...(m.className==='A'?[CATALOGUE_LABELS.partialA]:[]),...(m.className!==c.sensitivity?[CATALOGUE_LABELS.fallbackC]:[]),...(c.geometry==='F1'&&['MK37','MK38'].includes(c.sensorId)?[CATALOGUE_LABELS.f1]:[]),...(c.sensorId==='MK02'?[CATALOGUE_LABELS.ferrous]:[])];
}
/** Plain-language family sentence for Sources et limites. */
export function catalogueFamilySentence(m:ReturnType<typeof catalogueModel>):string{return m.family==='66'?CATALOGUE_LABELS.reed66:m.family==='66-assumed'?CATALOGUE_LABELS.reed66assumed:CATALOGUE_LABELS.analogyReed;}
