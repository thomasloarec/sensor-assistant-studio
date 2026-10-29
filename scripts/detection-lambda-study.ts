/** Reproducible research deliverable; no client activation or parameter changes.
 * bun scripts/detection-lambda-study.ts [output-directory]
 */
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {LAMBDA_GRID,LAMBDA_STUDY,responseLambda,lambdaDistanceFor} from '../src/lib/detection-lab/lambda-study';
import {evaluatePose,type MagnetPose,type PoseEvaluation} from '../src/lib/detection-lab/pose';
import {PILOT_MAGNETS,type PilotMagnet} from '../src/lib/detection-lab/magnets';
import {scenarioForLength,formRowFor,thetaFor,AT_CLASSES,atRange} from '../src/lib/detection-lab/pass2';
import {scorePass3Groups,type Pass3Row} from '../src/lib/detection-lab/pass3';
import {distanceFor} from '../src/lib/detection-lab/calibration';
import frozenDistances from '../src/data/detection-lab/workshop-distances.json';
import registry from '../src/data/studio-v2/published-references.json';

const OUT=resolve(process.argv[2]??'../detection-lambda-20261029');mkdirSync(OUT,{recursive:true});
const sc=scenarioForLength(LAMBDA_STUDY.effectiveLengthMm),k=LAMBDA_STUDY.kMtPerAt;
const csv=(file:string,rows:Record<string,unknown>[])=>{const keys=Object.keys(rows[0]??{}),cell=(v:unknown)=>JSON.stringify(v??'');writeFileSync(resolve(OUT,file),[keys.join(','),...rows.map(r=>keys.map(key=>cell(r[key])).join(','))].join('\n'));};
const json=(file:string,data:unknown)=>writeFileSync(resolve(OUT,file),JSON.stringify(data));
const sha=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
const sampleFor=(mag:PilotMagnet)=>{
 const cache=new Map<string,PoseEvaluation>();
 return (pose:MagnetPose):PoseEvaluation=>{const key=pose.center.join(',')+';'+pose.axis.join(',');let e=cache.get(key);if(!e){e=evaluatePose(mag,pose,sc,'B');cache.set(key,e);}return e;};
};
const samples=new Map(PILOT_MAGNETS.map(m=>[m.id,sampleFor(m)]));
const results:LResult[]=[],fullRows:Record<string,unknown>[]=[],widths:Record<string,unknown>[]=[],nodes:Record<string,unknown>[]=[],dead:Record<string,unknown>[]=[],peaks:Record<string,unknown>[]=[],checks:Record<string,unknown>[]=[];
type LResult={lambda:number;table:Pass3Row[];corrected:ReturnType<typeof scorePass3Groups>;raw:ReturnType<typeof scorePass3Groups>};
for(const lambda of LAMBDA_GRID){
 const table:Pass3Row[]=[];console.log('Distances lambda',lambda);
 for(const c of AT_CLASSES)for(const mag of PILOT_MAGNETS)for(const approach of ['D1','D3','D4','D5'] as const)for(const bound of ['up','to'] as const){
  const theta=thetaFor(c,bound,k)!,fr=formRowFor(c,mag),pub=fr?.distances[approach]?.[bound==='up'?'upMm':'toMm']??null;
  const v=lambdaDistanceFor(mag,approach,theta,lambda,samples.get(mag.id)),raw=v.ok?v.value:null;
  const estimate=raw===null?null:raw-(approach==='D4'?LAMBDA_STUDY.documentaryD4DeltaMm:0);
  const anchorDatum=c==='C'&&mag.id==='SMCO5-5X4'&&approach==='D3'&&bound==='up';
  const anchorD4=c==='C'&&mag.id==='SMCO5-5X4'&&approach==='D4'&&bound==='up';
  const status:Pass3Row['status']=!fr?'no_source':pub===null?'missing':raw===null?'unavailable':anchorDatum?'anchor_datum':anchorD4?'anchor_d4':approach==='D1'&&['C','E'].includes(c)?'training':'control';
  const anomaly=mag.id==='N45-4X19'&&approach==='D3'&&((c==='B'&&bound==='up')||(c==='C'&&bound==='to'));
  const error=estimate===null||pub===null?null:estimate-pub;
  const row:Pass3Row={className:c,magnetId:mag.id,approach,bound,at:atRange(c)![bound==='up'?'max':'min'],thetaMT:theta,publishedMm:pub,estimatedRawMm:raw,estimatedMm:estimate,errorMm:error,errorPct:error!==null&&pub?100*error/pub:null,status,notes:anomaly?['suspected D1→D3 copy; retained in score']:[]};table.push(row);
  fullRows.push({lambda,class:c,magnet:mag.id,approach,bound,theta_mT:theta,published_mm:pub,raw_mm:raw,corrected_mm:estimate,error_mm:error,status,anomaly});
 }
 const rawTable=table.map(r=>({...r,estimatedMm:r.estimatedRawMm,errorMm:r.publishedMm!==null&&r.estimatedRawMm!==null?r.estimatedRawMm-r.publishedMm:null}));
 results.push({lambda,table,corrected:scorePass3Groups(table),raw:scorePass3Groups(rawTable)});
}
// Independent reproduction against the frozen pass-3 output and shared distance search.
const base=results.find(r=>r.lambda===1)!;
let frozenMax=0,axisDelta=0;
for(const r of base.table){const old=frozenDistances.rows.find(o=>o.className===r.className&&o.magnetId===r.magnetId&&o.approach===r.approach&&o.bound===r.bound);if(old?.estimatedRawMm!=null&&r.estimatedRawMm!=null)frozenMax=Math.max(frozenMax,Math.abs(old.estimatedRawMm-r.estimatedRawMm));}
for(const v of results)for(const r of v.table.filter(r=>r.approach==='D1')){const b=base.table.find(b=>b.className===r.className&&b.magnetId===r.magnetId&&b.bound===r.bound&&b.approach==='D1')!;if(r.estimatedRawMm!==null&&b.estimatedRawMm!==null)axisDelta=Math.max(axisDelta,Math.abs(r.estimatedRawMm-b.estimatedRawMm));}
checks.push({check:'lambda1 frozen pass3 maximum rounding difference mm',value:frozenMax,pass:frozenMax<0.0001},{check:'D1 maximum distance difference across lambda mm',value:axisDelta,pass:axisDelta<1e-9});

// Raw blade means, not warped coordinates. Collision is null, NEVER zero.
const xs=Array.from({length:321},(_,i)=>-40+i*.25),zs=Array.from({length:129},(_,i)=>i*.25);
for(const mag of PILOT_MAGNETS){
 const sample=samples.get(mag.id)!;
 const response=(x:number,z:number,lambda:number,perp=false)=>{const e=sample({center:[x,0,z],axis:perp?[0,0,1]:[1,0,0]});return e.ok?responseLambda(e.m1,e.m2,lambda):null;};
 const halfWidth=(z:number,lambda:number,threshold:number,perp=false):number|null=>{
  const r=response(0,z,lambda,perp);if(r===null)return null;if(r<threshold)return 0;
  for(let x=.125;x<=32;x+=.125){const v=response(x,z,lambda,perp);if(v===null)return null;if(v<threshold){let lo=x-.125,hi=x;for(let it=0;it<24;it++){const mid=(lo+hi)/2,m=response(mid,z,lambda,perp);if(m!==null&&m>=threshold)lo=mid;else hi=mid;}return (lo+hi)/2;}}
  return null;
 };
 for(const orientation of ['parallel','perpendicular']){
  const m1:(number|null)[]=[],m2:(number|null)[]=[],mask:string[]=[];
  for(const z of zs)for(const x of xs){const e=sample({center:[x,0,z],axis:orientation==='parallel'?[1,0,0]:[0,0,1]});m1.push(e.ok?e.m1:null);m2.push(e.ok?e.m2:null);mask.push(e.ok?'valid':e.reason);}
  json(`${mag.id}-${orientation}-raw.json`,{magnet:mag,orientation,plane:'y=0',coordinates:'x along reed; z approach depth; centre coordinates mm',xs,zs,m1,m2,mask,lambdaGrid:LAMBDA_GRID,thresholds:{up:k*20,to:k*15}});
  console.log('Cut',mag.id,orientation,m1.length);
 }
 const d4=base.table.find(r=>r.magnetId===mag.id&&r.className==='C'&&r.approach==='D4'&&r.bound==='up')!.estimatedRawMm!;
 const deadDepth=mag.lengthMm/2+.8*d4;
 for(const lambda of LAMBDA_GRID){
  for(const bound of ['up','to'] as const){
   const theta=thetaFor('C',bound,k)!,row=base.table.find(r=>r.magnetId===mag.id&&r.className==='C'&&r.approach==='D1'&&r.bound===bound)!;
   const height=row.estimatedRawMm!+mag.diameterMm/2;
   for(const fraction of [.25,.5,.7,.9,.95,.975,.99,1]){const z=fraction*height,w=halfWidth(z,lambda,theta);widths.push({magnet:mag.id,lambda,bound,fraction,centre_depth_mm:z,surface_to_reed_axis_mm:z-mag.diameterMm/2,half_width_mm:w,normalized_half_width:w===null?null:w/height,status:w===null?'collision_or_domain':'valid'});}
   // First accessible central sample, not the inaccessible mathematical z=0.
   const z=mag.diameterMm/2+1.1+.025,w=halfWidth(z,lambda,theta);
   widths.push({magnet:mag.id,lambda,bound,fraction:'first-accessible',centre_depth_mm:z,surface_to_reed_axis_mm:z-mag.diameterMm/2,half_width_mm:w,normalized_half_width:w===null?null:w/height,status:w===null?'collision_or_domain':'valid'});
   peaks.push({magnet:mag.id,lambda,bound,d1_centre_mm:height});
  }
  // Half-width of exact-response-zero region, distinct from below-threshold gap.
  let edge:number|null=null,below:number|null=null;const center=response(0,deadDepth,lambda,true);
  if(center!==null){for(let x=.125;x<=24;x+=.125){const v=response(x,deadDepth,lambda,true);if(v===null)break;if(edge===null&&v>1e-9){let lo=x-.125,hi=x;for(let j=0;j<24;j++){const mid=(lo+hi)/2,r=response(mid,deadDepth,lambda,true);if(r!==null&&r>1e-9)hi=mid;else lo=mid;}edge=(lo+hi)/2;}if(below===null&&v>=15*k)below=x;if(edge!==null&&below!==null)break;}}
  dead.push({magnet:mag.id,lambda,fixed_depth_centre_mm:deadDepth,zero_half_width_mm:edge,below_low_threshold_half_width_mm:below,centre_response:center,passes_1mm:edge!==null&&edge>=1});
 }
 // Signed mean nodal roots: measured only outside the unchanged mechanical mask.
 for(const z of [0,.125,.5,1,2,mag.diameterMm/2+1.125,5,8,10,15,20]){
  let prev:{x:number;m:number}|null=null,root:number|null=null,maxR:number|null=null;
  for(let x=0;x<=32;x+=.125){const e=sample({center:[x,0,z],axis:[1,0,0]});if(!e.ok){prev=null;continue;}const m=(e.m1+e.m2)/2;
   if(prev&&prev.m*m<0){let lo=prev.x,hi=x,fl=prev.m;for(let j=0;j<35;j++){const mid=(lo+hi)/2,v=sample({center:[mid,0,z],axis:[1,0,0]});if(!v.ok)break;const fm=(v.m1+v.m2)/2;if(fl*fm<=0)hi=mid;else{lo=mid;fl=fm;}}root=(lo+hi)/2;const e0=sample({center:[root,0,z],axis:[1,0,0]});maxR=e0.ok?Math.max(...LAMBDA_GRID.map(l=>responseLambda(e0.m1,e0.m2,l))):null;break;}prev={x,m};
  }
  nodes.push({magnet:mag.id,z_mm:z,nodal_x_mm:root,max_response_on_node_mT:maxR,status:root===null?'no_accessible_sign_crossing':'accessible_root',glass_half_length_mm:7,effective_half_length_mm:LAMBDA_STUDY.effectiveLengthMm/2});
 }
 // Small 3D grid for actual isosurfaces clipped to a ±2mm slab by the renderer.
 const coords=Array.from({length:65},(_,i)=>-24+i*.75),depth=Array.from({length:41},(_,i)=>i*.75),ys=[-2,-1.5,-1,-.5,0,.5,1,1.5,2];
 const m1:(number|null)[]=[],m2:(number|null)[]=[];
 for(const z of depth)for(const y of ys)for(const x of coords){const e=sample({center:[x,y,z],axis:[1,0,0]});m1.push(e.ok?e.m1:null);m2.push(e.ok?e.m2:null);}
 json(`${mag.id}-slab-raw.json`,{xs:coords,ys,zs:depth,m1,m2,thresholds:{up:20*k,to:15*k}});
}
const cutChecks={inclusionViolations:0,lambdaMonotonicityViolations:0,maxEndpointError:0,validSamples:0};
const d2Predictions:Record<string,unknown>[]=[];
for(const mag of PILOT_MAGNETS)for(const orientation of ['parallel','perpendicular']){
 const g=JSON.parse(readFileSync(resolve(OUT,`${mag.id}-${orientation}-raw.json`),'utf8'));
 for(let i=0;i<g.m1.length;i++){if(g.m1[i]===null)continue;cutChecks.validSamples++;const a=g.m1[i],b=g.m2[i];let prev=Infinity;
  for(const l of LAMBDA_GRID){const r=responseLambda(a,b,l);if(r>prev+1e-12)cutChecks.lambdaMonotonicityViolations++;prev=r;if(r>=20*k&&!(r>=15*k))cutChecks.inclusionViolations++;}
  const B=a*b>0?Math.min(Math.abs(a),Math.abs(b)):0;cutChecks.maxEndpointError=Math.max(cutChecks.maxEndpointError,Math.abs(responseLambda(a,b,1)-B));
 }
 if(orientation==='parallel')for(const lambda of LAMBDA_GRID)for(const className of ['B','C'])for(const bound of ['up','to'] as const){
  const theta=thetaFor(className,bound,k)!;let maxZ=-1,xAt:number|null=null,touchesX=false;
  for(let i=0;i<g.m1.length;i++){if(g.m1[i]===null)continue;const a=g.m1[i],b=g.m2[i],x=g.xs[i%g.xs.length],z=g.zs[Math.floor(i/g.xs.length)];
   // Central parallel branch has negative m; positive m identifies outer branch.
   if(x>=0&&(a+b)/2>0&&responseLambda(a,b,lambda)>=theta){if(z>maxZ){maxZ=z;xAt=x;}if(x===40)touchesX=true;}}
  d2Predictions.push({magnet:mag.id,lambda,class:className,bound,centre_height_mm:maxZ<0?null:maxZ,surface_to_reed_axis_mm:maxZ<0?null:maxZ-mag.diameterMm/2,x_at_max_mm:xAt,grid_uncertainty_mm:.25,x_boundary_active:touchesX,comparison_to_M04:'not_comparable'});
 }
}
// D2 reference is M04 MK04 pull-in/drop-out, NOT a class-bound range on the bare pilots.
const d2Reference=registry.rows.find(r=>r.id==='MK04-B-M04-D2');
const sourceFiles=['src/lib/detection-lab/pose.ts','src/lib/detection-lab/field.ts','src/lib/detection-lab/lambda-study.ts','src/data/detection-lab/workshop-profile.json','src/data/detection-lab/brochure-form-rows.json'];
json('results.json',{version:'lambda-grid-1.0.0',generated:new Date().toISOString(),parameters:LAMBDA_STUDY,sourceHashes:Object.fromEntries(sourceFiles.map(p=>[p,sha(p)])),lambdaGrid:LAMBDA_GRID,results,checks,cutChecks,widths,dead,nodes,peaks,d2Reference,d2Predictions,d2ComparisonStatus:'NOT_COMPARABLE: M04 housed sensor reference and pull-in/drop-out; pilot study has class-bound activation only; no hysteresis model.',selection:'retrospective exploratory fit if lambda chosen on these prior controls; not independent validation'});
csv('controls.csv',fullRows);csv('widths.csv',widths);csv('dead-zones.csv',dead);csv('nodal-roots.csv',nodes);
csv('d2-pilot-predictions.csv',d2Predictions);
csv('scores.csv',results.map(r=>({lambda:r.lambda,passed:r.corrected.grouped.passed,total:r.corrected.grouped.total,ratio:r.corrected.grouped.ratio,criterion:r.corrected.grouped.pass,median_abs_mm:r.corrected.grouped.medianAbsMm,...Object.fromEntries(r.corrected.grouped.biases.map(b=>[b.approach+'_bias_mm',b.meanMm])),raw_passed:r.raw.grouped.passed,raw_criterion:r.raw.grouped.pass})));
console.log(JSON.stringify({checks,cutChecks,scores:results.map(r=>({lambda:r.lambda,score:r.corrected.grouped.passed+'/'+r.corrected.grouped.total,pass:r.corrected.grouped.pass,biases:r.corrected.grouped.biases})),dead},null,2));
