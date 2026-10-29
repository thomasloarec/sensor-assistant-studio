/** Isolated research: Claude's A–B family, never imported by client code.
 * M1/M2 are averages of Bx in mT, NOT measured magnetomotive forces.
 * Lambda is a phenomenological hypothesis, not a new physical validation.
 * No field, coordinate warp, threshold or collision rule is refitted.
 * The default datum reproduces the fixed-datum study. An explicit datum allows
 * the separate single-anchor comparison; it never changes evaluateLambda poses.
 */
import { evaluatePose, type MagnetPose, type PoseEvaluation } from './pose';
import { approachPose, type ApproachId, type Value } from './calibration';
import type { PilotMagnet } from './magnets';
import { scenarioForLength } from './pass2';
import frozen from '../../data/detection-lab/workshop-profile.json';
import { PROFILE } from './profile';

export const LAMBDA_GRID = [0, 0.25, 0.5, 0.75, 1] as const;
export const LAMBDA_STUDY = Object.freeze({...frozen, frozenProfileVersion:frozen.version,version:'lambda-grid-1.0.0'});
export function responseLambda(m1:number,m2:number,lambda:number):number {
  if(!Number.isFinite(m1)||!Number.isFinite(m2)||!Number.isFinite(lambda)||lambda<0||lambda>1)
    throw new RangeError('LAMBDA_STUDY_INVALID_INPUT');
  return Math.max(0,Math.abs((m1+m2)/2)-lambda*Math.abs((m1-m2)/2));
}
export function evaluateLambda(magnet:PilotMagnet,pose:MagnetPose,lambda:number,quadrature=PROFILE.reed.quadraturePerBlade):PoseEvaluation {
  const e=evaluatePose(magnet,pose,scenarioForLength(frozen.effectiveLengthMm),'B',quadrature);
  return e.ok?{...e,response:responseLambda(e.m1,e.m2,lambda)}:e;
}
/** Same descending scan, global sampled maximum + golden refinement as pass 3.
 * Callback caches only actual evaluatePose results; no synthetic field values.
 */
export function lambdaResponseAt(magnet:PilotMagnet,approach:ApproachId,d:number,lambda:number,
  sample:(pose:MagnetPose)=>PoseEvaluation=(pose)=>evaluatePose(magnet,pose,scenarioForLength(frozen.effectiveLengthMm),'B'),
  datumMm:number=frozen.documentaryDatumMm):Value {
  const at=(x:number)=>{const e=sample(approachPose(magnet,approach,d,'C1',x,datumMm));return e.ok?responseLambda(e.m1,e.m2,lambda):-1;};
  if(approach==='D1'||approach==='D3'){const v=at(0);return v<0?{ok:false,reason:'collision'}:{ok:true,value:v,x:0};}
  let best=-1,bx=0;const step=PROFILE.search.xScanStepMm;
  for(let x=0;x<=PROFILE.search.xScanMaxMm+1e-9;x+=step){const v=at(x);if(v>best){best=v;bx=x;}}
  if(best<0)return {ok:false,reason:'collision'};
  let lo=Math.max(0,bx-step),hi=bx+step;const gr=(Math.sqrt(5)-1)/2;
  let c=hi-gr*(hi-lo),e=lo+gr*(hi-lo),fc=at(c),fe=at(e);
  while(hi-lo>PROFILE.search.goldenTolMm){if(fc>fe){hi=e;e=c;fe=fc;c=hi-gr*(hi-lo);fc=at(c);}else{lo=c;c=e;fc=fe;e=lo+gr*(hi-lo);fe=at(e);}}
  const xm=(lo+hi)/2,vm=at(xm);return vm>=best?{ok:true,value:vm,x:xm}:{ok:true,value:best,x:bx};
}
export function lambdaDistanceFor(magnet:PilotMagnet,approach:ApproachId,theta:number,lambda:number,
  sample?:(pose:MagnetPose)=>PoseEvaluation,datumMm:number=frozen.documentaryDatumMm):Value {
  if(!(theta>0)||!Number.isFinite(theta))return {ok:false,reason:'threshold'};
  const at=(d:number)=>lambdaResponseAt(magnet,approach,d,lambda,sample,datumMm);
  const {dMaxMm,dScanStepMm,bisectTolMm}=PROFILE.search;
  const top=at(dMaxMm);if(top.ok&&top.value>=theta)return {ok:false,reason:'beyond_domain'};
  for(let d=dMaxMm-dScanStepMm;d>=0;d-=dScanStepMm){const v=at(d);if(!v.ok)return {ok:false,reason:'collision_before_threshold'};
    if(v.value>=theta){let lo=d,hi=d+dScanStepMm,x=v.x;while(hi-lo>bisectTolMm){const mid=(lo+hi)/2,m=at(mid);if(m.ok&&m.value>=theta){lo=mid;x=m.x;}else hi=mid;}return {ok:true,value:(lo+hi)/2,x};}}
  return {ok:false,reason:'not_reached'};
}
