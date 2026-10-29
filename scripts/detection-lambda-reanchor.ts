import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {LAMBDA_GRID,LAMBDA_STUDY,evaluateLambda} from '../src/lib/detection-lab/lambda-study';
import {fitLambdaDatum,buildReanchoredTable,REANCHOR_VERSION} from '../src/lib/detection-lab/lambda-reanchor';
import {scorePass3Groups,scorePass3,pass3ControlRows,fitAxialDatum} from '../src/lib/detection-lab/pass3';
import {PILOT_MAGNETS} from '../src/lib/detection-lab/magnets';
import {distanceFor} from '../src/lib/detection-lab/calibration';
import {scenarioForLength} from '../src/lib/detection-lab/pass2';
const OUT=resolve(process.argv[2]??'../detection-reanchor-20261029');mkdirSync(OUT,{recursive:true});
const previous=JSON.parse(readFileSync(resolve(process.argv[3]??'../detection-lambda-20261029/results.json'),'utf8'));
const results=LAMBDA_GRID.map(lambda=>{const anchor=fitLambdaDatum(lambda);const table=buildReanchoredTable(lambda,anchor.datumMm);const old=previous.results.find((r:any)=>r.lambda===lambda);
 const invariant={d1MaxDeltaMm:0,d4MaxDeltaMm:0,axialAffineMaxResidualMm:0};
 for(const row of table){const b=old.table.find((r:any)=>r.className===row.className&&r.magnetId===row.magnetId&&r.approach===row.approach&&r.bound===row.bound);if(row.estimatedRawMm!==null&&b.estimatedRawMm!==null){const delta=row.estimatedRawMm-b.estimatedRawMm;if(row.approach==='D1')invariant.d1MaxDeltaMm=Math.max(invariant.d1MaxDeltaMm,Math.abs(delta));else if(row.approach==='D4')invariant.d4MaxDeltaMm=Math.max(invariant.d4MaxDeltaMm,Math.abs(delta));else invariant.axialAffineMaxResidualMm=Math.max(invariant.axialAffineMaxResidualMm,Math.abs(delta+anchor.deltaMm));}}
 const controls=pass3ControlRows(table),withoutSuspects=controls.filter(r=>!r.notes.includes('SUSPECTED_D1_TO_D3_COPY_RETAINED'));
 const scores=scorePass3Groups(table),secondary=scorePass3(withoutSuspects);
 const raw=scorePass3Groups(table.map(r=>({...r,estimatedMm:r.estimatedRawMm,errorMm:r.publishedMm!==null&&r.estimatedRawMm!==null?r.estimatedRawMm-r.publishedMm:null})));
 const extra=Object.fromEntries(['A','F','G'].map(c=>[c,scorePass3(table.filter(r=>r.className===c&&r.publishedMm!==null))]));
 const before=old.corrected.grouped;
 console.log(JSON.stringify({lambda,datum:anchor.datumMm,residual:anchor.residualMm,before:before.passed,after:scores.grouped.passed,total:scores.grouped.total,pass:scores.grouped.pass,biases:scores.grouped.biases,failures:scores.grouped.failures}));
 return {lambda,anchor,table,scores,secondaryWithoutSuspects:secondary,raw,extra,invariant,before};});
// Independent A endpoint: existing pass-3 fit/search, no lambda search code.
const anchorA=fitAxialDatum(LAMBDA_STUDY.effectiveLengthMm,LAMBDA_STUDY.kMtPerAt,'A','C1');
let maxAReproductionMm=0;
for(const r of results[0]!.table){const m=PILOT_MAGNETS.find(m=>m.id===r.magnetId)!;const d=distanceFor(m,r.approach,r.thetaMT!,'C1','A',undefined,scenarioForLength(LAMBDA_STUDY.effectiveLengthMm),anchorA.datumMm);if(d.ok&&r.estimatedRawMm!==null)maxAReproductionMm=Math.max(maxAReproductionMm,Math.abs(d.value-r.estimatedRawMm));}
// Refine the threshold-defined dead band at the SAME fixed depths as first study.
const dead=previous.dead.filter((d:any)=>d.lambda===0).map((d:any)=>{const m=PILOT_MAGNETS.find(m=>m.id===d.magnet)!;const theta=15*LAMBDA_STUDY.kMtPerAt;
 let lo=0,hi=d.below_low_threshold_half_width_mm;const z=d.fixed_depth_centre_mm;
 for(let i=0;i<35;i++){const x=(lo+hi)/2,e=evaluateLambda(m,{center:[x,0,z],axis:[0,0,1]},0);if(!e.ok)throw new Error('DEAD_BAND_COLLISION');if(e.response>=theta)hi=x;else lo=x;}
 const {passes_1mm,...measurements}=d;const halfWidth=(lo+hi)/2;
 return {...measurements,exact_zero_passed_old_1mm_test:passes_1mm,threshold_half_width_mm:halfWidth,threshold_dead_band_at_least_1mm:halfWidth>=1,thresholdMT:theta,refinement:'bisected first class-C low-threshold crossing; centre depth fixed from prior study'};});
const sourceFiles=['src/lib/detection-lab/lambda-study.ts','src/lib/detection-lab/lambda-reanchor.ts','src/lib/detection-lab/pose.ts','src/lib/detection-lab/field.ts','src/data/detection-lab/workshop-profile.json','src/data/detection-lab/brochure-form-rows.json'];
const hashes=Object.fromEntries(sourceFiles.map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]));
const report={version:REANCHOR_VERSION,generated:new Date().toISOString(),parameters:LAMBDA_STUDY,protocol:'one C-SmCo-D3-up anchor PER lambda; fixed L,k,D4 correction; two historical anchors excluded; suspected copies retained; retrospective',sourceHashes:hashes,previousResultsSha256:createHash('sha256').update(readFileSync(resolve(process.argv[3]??'../detection-lambda-20261029/results.json'))).digest('hex'),results,verification:{anchorAExistingFit:anchorA,maxAReproductionMm},dead,widths:previous.widths.filter((w:any)=>w.lambda===0||w.lambda===1),selection:{candidate:'A',lambda:0,passes:results[0]!.scores.grouped.pass,status:'candidate after single-anchor documentary recalibration; shape qualitative; not product qualification'}};
writeFileSync(resolve(OUT,'results.json'),JSON.stringify(report,null,2));
const csv=(file:string,rows:Record<string,unknown>[])=>{const ks=Object.keys(rows[0]??{});writeFileSync(resolve(OUT,file),[ks.join(','),...rows.map(r=>ks.map(k=>JSON.stringify(r[k]??'')).join(','))].join('\n'));};
csv('scores.csv',results.map(r=>({lambda:r.lambda,datum_mm:r.anchor.datumMm,passed:r.scores.grouped.passed,total:r.scores.grouped.total,pass:r.scores.grouped.pass,median_abs_mm:r.scores.grouped.medianAbsMm,...Object.fromEntries(r.scores.grouped.biases.map(b=>[b.approach+'_mean_mm',b.meanMm]))})));
csv('controls.csv',results.flatMap(v=>v.table.map(r=>({lambda:v.lambda,datum_mm:v.anchor.datumMm,class:r.className,magnet:r.magnetId,approach:r.approach,bound:r.bound,published_mm:r.publishedMm,raw_mm:r.estimatedRawMm,corrected_mm:r.estimatedMm,error_mm:r.errorMm,status:r.status,notes:r.notes.join('|')}))));
csv('dead-zones.csv',dead);console.log(JSON.stringify(report.verification));console.log(JSON.stringify(dead));
