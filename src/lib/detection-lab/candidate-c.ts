/** Isolated research, never imported by the client workshop.
 * M1/M2 are free-field averages, not measured blade magnetisations.
 * The sign gate is a phenomenological hypothesis, not a proven force law.
 */
import {evaluatePose,signGatedResponse,type MagnetPose,type PoseEvaluation} from './pose';
import {approachPose,type ApproachId,type Value} from './calibration';
import {scenarioForLength} from './pass2';
import {LAMBDA_STUDY} from './lambda-study';
import {PROFILE} from './profile';
import type {PilotMagnet} from './magnets';

export const C_STUDY_VERSION='sign-gated-a-study-1.0.0';
/** epsilon=0 is C as proposed; 0.01 is a separate sensitivity experiment.
 * A relative 1% dead strip is a model choice, not floating-point roundoff. */
export function responseC(m1:number,m2:number,epsilon=0):number{
 return signGatedResponse(m1,m2,epsilon);
}
export function evaluateC(magnet:PilotMagnet,pose:MagnetPose,epsilon=0,quadrature:number=PROFILE.reed.quadraturePerBlade):PoseEvaluation{
 const e=evaluatePose(magnet,pose,scenarioForLength(LAMBDA_STUDY.effectiveLengthMm),'A',quadrature);
 return e.ok?{...e,response:responseC(e.m1,e.m2,epsilon)}:e;
}
/** Existing pass-3 descending distance search and sampled maximum/golden refinement.
 * step is exposed to verify convergence of the discontinuous sign gate. */
export function cDistanceFor(magnet:PilotMagnet,approach:ApproachId,theta:number,datumMm:number,epsilon=0,step:number=PROFILE.search.xScanStepMm,quadrature:number=PROFILE.reed.quadraturePerBlade):Value{
 if(!(theta>0))return {ok:false,reason:'threshold'};
 const at=(d:number):Value=>{
  const response=(x:number)=>{const e=evaluateC(magnet,approachPose(magnet,approach,d,'C1',x,datumMm),epsilon,quadrature);return e.ok?e.response:-1;};
  if(approach==='D1'||approach==='D3'){const r=response(0);return r<0?{ok:false,reason:'collision'}:{ok:true,value:r,x:0};}
  let best=-1,bx=0;
  for(let x=0;x<=PROFILE.search.xScanMaxMm+1e-9;x+=step){const r=response(x);if(r>best){best=r;bx=x;}}
  if(best<0)return {ok:false,reason:'collision'};
  let lo=Math.max(0,bx-step),hi=bx+step;const gr=(Math.sqrt(5)-1)/2;
  let c=hi-gr*(hi-lo),e=lo+gr*(hi-lo),fc=response(c),fe=response(e);
  while(hi-lo>PROFILE.search.goldenTolMm){if(fc>fe){hi=e;e=c;fe=fc;c=hi-gr*(hi-lo);fc=response(c);}else{lo=c;c=e;fc=fe;e=lo+gr*(hi-lo);fe=response(e);}}
  const x=(lo+hi)/2,r=response(x);return r>best?{ok:true,value:r,x}:{ok:true,value:best,x:bx};
 };
 const {dMaxMm,dScanStepMm,bisectTolMm}=PROFILE.search;
 const top=at(dMaxMm);if(top.ok&&top.value>=theta)return {ok:false,reason:'beyond_domain'};
 for(let d=dMaxMm-dScanStepMm;d>=0;d-=dScanStepMm){const e=at(d);if(!e.ok)return {ok:false,reason:'collision_before_threshold'};
  if(e.value>=theta){let lo=d,hi=d+dScanStepMm,x=e.x;while(hi-lo>bisectTolMm){const mid=(lo+hi)/2,r=at(mid);if(r.ok&&r.value>=theta){lo=mid;x=r.x;}else hi=mid;}return {ok:true,value:(lo+hi)/2,x};}}
 return {ok:false,reason:'not_reached'};
}
