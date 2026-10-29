import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {responseC,evaluateC,cDistanceFor,C_STUDY_VERSION} from '../src/lib/detection-lab/candidate-c';
import {LAMBDA_STUDY} from '../src/lib/detection-lab/lambda-study';
import {PILOT_MAGNETS} from '../src/lib/detection-lab/magnets';
import {scorePass3Groups,scorePass3,pass3ControlRows,type Pass3Row} from '../src/lib/detection-lab/pass3';
import {evaluatePose} from '../src/lib/detection-lab/pose';
import {scenarioForLength} from '../src/lib/detection-lab/pass2';
import {catalogueModel,catalogueEvaluate,magnetBodyFrame,catalogueBodyObb} from '../src/lib/standex/catalogue-pedagogical';
import {catalogueNominalScenario} from '../src/lib/standex/catalogue-response';
import {DEFAULT_WORKSHOP,type Vec3} from '../src/lib/standex/magnetic-workshop';
import {obbOverlap} from '../src/lib/detection-lab/obstacles';
const out=resolve(process.argv[2]??'../detection-c-20261029');mkdirSync(out,{recursive:true});
const prior=JSON.parse(readFileSync('../detection-reanchor-20261029/results.json','utf8')).results[0];
const k=LAMBDA_STUDY.kMtPerAt;
const results:any[]=[],widths:any[]=[],dead:any[]=[],convergence:any[]=[];
const json=(name:string,value:unknown)=>writeFileSync(resolve(out,name),JSON.stringify(value,null,2));
const csv=(name:string,rows:any[])=>{const keys=Object.keys(rows[0]??{});writeFileSync(resolve(out,name),[keys.join(','),...rows.map(r=>keys.map(key=>JSON.stringify(r[key]??'')).join(','))].join('\n'));};
for(const epsilon of [0,.01]){
 const anchorRow=prior.table.find((r:Pass3Row)=>r.status==='anchor_datum') as Pass3Row;
 const anchor=cDistanceFor(PILOT_MAGNETS[0]!,'D3',anchorRow.thetaMT!,0,epsilon);if(!anchor.ok)throw Error('NO_ANCHOR');
 const datum=anchor.value-anchorRow.publishedMm!;
 const table:Pass3Row[]=prior.table.map((r:Pass3Row)=>{const mag=PILOT_MAGNETS.find(m=>m.id===r.magnetId)!;
  const d=cDistanceFor(mag,r.approach,r.thetaMT!,datum,epsilon),raw=d.ok?d.value:null,estimate=raw===null?null:raw-(r.approach==='D4'?LAMBDA_STUDY.documentaryD4DeltaMm:0);
  const error=estimate===null||r.publishedMm===null?null:estimate-r.publishedMm;
  return {...r,estimatedRawMm:raw,estimatedMm:estimate,errorMm:error,errorPct:error!==null&&r.publishedMm?100*error/r.publishedMm:null};});
 const delta=Object.fromEntries(['D1','D3','D4','D5'].map(a=>[a,Math.max(...table.filter(r=>r.approach===a).map(r=>{const old=prior.table.find((p:Pass3Row)=>p.className===r.className&&p.magnetId===r.magnetId&&p.approach===r.approach&&p.bound===r.bound);return r.estimatedRawMm===null?Infinity:Math.abs(r.estimatedRawMm-old.estimatedRawMm);} ))]));
 const result={name:epsilon?'C epsilon 1%':'C',epsilon,datum,table,scores:scorePass3Groups(table),deltaFromA:delta,secondary:scorePass3(pass3ControlRows(table).filter(r=>!r.notes.includes('SUSPECTED_D1_TO_D3_COPY_RETAINED')))};
 results.push(result);console.log(JSON.stringify({name:result.name,datum,delta,score:result.scores.grouped}));
}
// Refine search AND blade quadrature independently for class-C D4/D5 bounds.
for(const mag of PILOT_MAGNETS)for(const approach of ['D4','D5'] as const)for(const bound of ['up','to'] as const){
 const old=results[0].table.find((r:Pass3Row)=>r.magnetId===mag.id&&r.className==='C'&&r.approach===approach&&r.bound===bound);
 const d=cDistanceFor(mag,approach,old.thetaMT,results[0].datum,0,.25,24);
 convergence.push({magnet:mag.id,approach,bound,baseline_mm:old.estimatedRawMm,refined_mm:d.ok?d.value:null,delta_mm:d.ok?d.value-old.estimatedRawMm:null});
}
// New cuts from the shared free-field kernel, 0.25 mm, plus actual MK04/M04 proxy.
let inclusionViolations=0;let boundaryHighCount=0;
for(const id of [...PILOT_MAGNETS.map(m=>m.id),'M04'])for(const orientation of ['parallel','perpendicular']){
 const mag=PILOT_MAGNETS.find(m=>m.id===id),axis:Vec3=orientation==='parallel'?[1,0,0]:[0,0,1];
 const config={...DEFAULT_WORKSHOP,sensitivity:'C',sensorId:'MK04',magnetModel:id,guideReference:'MK04-1A66C-X'};
 const model=catalogueModel(config),frame=magnetBodyFrame(config,orientation==='parallel'?0:90);
 const xs=Array.from({length:321},(_,i)=>-40+i*.25),zs=Array.from({length:161},(_,i)=>i*.25);
 const m1:(number|null)[]=[],m2:(number|null)[]=[],housing:boolean[]=[];
 for(const z of zs)for(const x of xs){
  const pose={center:[x,0,z] as Vec3,axis};const e=mag?evaluatePose(mag,pose,scenarioForLength(LAMBDA_STUDY.effectiveLengthMm),'A'):catalogueEvaluate(model,pose,catalogueNominalScenario(),frame);
  m1.push(e.ok?e.m1:null);m2.push(e.ok?e.m2:null);
  housing.push(obbOverlap({path:'magnet',c:pose.center,a:frame,h:model.magnetBody.map(v=>v/2) as Vec3},catalogueBodyObb(config)));
  if(e.ok){const A=Math.abs((e.m1+e.m2)/2),B=e.m1*e.m2>0?Math.min(Math.abs(e.m1),Math.abs(e.m2)):0,C=responseC(e.m1,e.m2);if(C>A+1e-12||C<B-1e-12)inclusionViolations++;if(Math.min(Math.abs(e.m1),Math.abs(e.m2))<.01*A&&A>=15*k)boundaryHighCount++;}
 }
 json(`${id}-${orientation}-raw.json`,{magnet:id,orientation,xs,zs,m1,m2,housing,body:model.body,magnetBody:model.magnetBody,thresholds:{up:20*k,to:15*k},field:model.field});
 console.log('cut',id,orientation);
 if(mag){
 const value=(x:number,z:number,variant:string)=>{const e=evaluatePose(mag,{center:[x,0,z],axis},scenarioForLength(LAMBDA_STUDY.effectiveLengthMm),'A',24);return e.ok?variant==='A'?e.response:responseC(e.m1,e.m2,variant==='C1%'?.01:0):null;};
 const firstCross=(z:number,variant:string,theta:number,inside:boolean)=>{
  const first=value(0,z,variant);if(first===null)return null;if((first>=theta)!==inside)return 0;
  for(let x=.025;x<=40;x+=.025){const v=value(x,z,variant);if(v===null)return null;if((v>=theta)!==inside){let lo=x-.025,hi=x;for(let n=0;n<25;n++){const mid=(lo+hi)/2,vv=value(mid,z,variant);if(vv!==null&&(vv>=theta)===inside)lo=mid;else hi=mid;}return (lo+hi)/2;}}return null;};
 for(const variant of ['A','C','C1%']){
  if(orientation==='parallel')for(const bound of ['up','to']){
   const row=prior.table.find((r:Pass3Row)=>r.magnetId===id&&r.className==='C'&&r.approach==='D1'&&r.bound===bound),height=row.estimatedRawMm+mag.diameterMm/2,theta=bound==='up'?20*k:15*k;
   for(const [label,z] of [['z3.6',3.6],['z5.5',5.5],['0.5 D1 centre',height*.5],['0.75 D1 centre',height*.75]] as [string,number][]){
    const collision=obbOverlap({path:'magnet',c:[0,0,z],a:frame,h:model.magnetBody.map(v=>v/2) as Vec3},catalogueBodyObb(config));
    widths.push({magnet:id,variant,bound,label,z_mm:z,D1_center_mm:height,half_width_mm:firstCross(z,variant,theta,true),MK04_center_blocked:collision});
   }
  }else{
   const z=mag.id==='SMCO5-5X4'?8.6330322265625:18.6965087890625;
   dead.push({magnet:id,variant,z_mm:z,exact_zero_half_width_mm:firstCross(z,variant,1e-9,false),below_class_low_half_width_mm:firstCross(z,variant,15*k,false)});
  }
 }
 }
}
const hashes=Object.fromEntries(['src/lib/detection-lab/candidate-c.ts','src/lib/detection-lab/pose.ts','src/lib/detection-lab/field.ts','src/data/detection-lab/workshop-profile.json'].map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]));
json('results.json',{version:C_STUDY_VERSION,parameters:LAMBDA_STUDY,referenceA:prior,results,widths,dead,convergence,invariants:{inclusionViolations,boundaryHighCount},sourceHashes:hashes,decision:'Research only; client A unchanged. Assess D4/D5 <=0.5 mm and visible waist before proposing C.'});
csv('controls.csv',results.flatMap(v=>v.table.map((r:Pass3Row)=>({variant:v.name,datum_mm:v.datum,...r,notes:r.notes.join('|')}))));csv('widths.csv',widths);csv('dead-zones.csv',dead);csv('convergence.csv',convergence);
console.log(JSON.stringify({widths,dead,convergence,inclusionViolations},null,2));
