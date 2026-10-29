import {describe,test,expect} from 'bun:test';
import {responseLambda,evaluateLambda,lambdaDistanceFor,LAMBDA_GRID,LAMBDA_STUDY} from '../src/lib/detection-lab/lambda-study';
import {PILOT_MAGNETS} from '../src/lib/detection-lab/magnets';
import {evaluatePose} from '../src/lib/detection-lab/pose';
import {scenarioForLength} from '../src/lib/detection-lab/pass2';
import {distanceFor} from '../src/lib/detection-lab/calibration';
describe('isolated lambda hypothesis',()=>{
 test('endpoints, signed symmetry and ordering for all sign combinations',()=>{
  for(const a of [-8,-2,0,1,7])for(const b of [-9,-1,0,3,6]){
   expect(responseLambda(a,b,0)).toBe(Math.abs((a+b)/2));
   expect(responseLambda(a,b,1)).toBe(a*b>0?Math.min(Math.abs(a),Math.abs(b)):0);
   let prev=Infinity;for(const l of LAMBDA_GRID){const r=responseLambda(a,b,l);expect(r).toBeLessThanOrEqual(prev);prev=r;expect(r).toBe(responseLambda(-a,-b,l));expect(r).toBe(responseLambda(b,a,l));}
  }
  expect(()=>responseLambda(1,2,-0.1)).toThrow();expect(()=>responseLambda(1,2,NaN)).toThrow();
 });
 test('D1 invariant, perpendicular centre zero, 3D rigid rotation around reed consistent',()=>{
  for(const mag of PILOT_MAGNETS)for(const z of [12,18,24])for(const l of LAMBDA_GRID){
   const base=evaluateLambda(mag,{center:[0,0,z],axis:[1,0,0]},1),v=evaluateLambda(mag,{center:[0,0,z],axis:[1,0,0]},l);
   expect(base.ok&&v.ok).toBe(true);if(base.ok&&v.ok)expect(Math.abs(v.response-base.response)).toBeLessThan(1e-9);
   const perp=evaluateLambda(mag,{center:[0,0,z],axis:[0,0,1]},l);expect(perp.ok).toBe(true);if(perp.ok)expect(perp.response).toBeLessThan(1e-9);
   const a=evaluateLambda(mag,{center:[5,0,z],axis:[0,0,1]},l),b=evaluateLambda(mag,{center:[5,z,0],axis:[0,1,0]},l);if(a.ok&&b.ok)expect(Math.abs(a.response-b.response)).toBeLessThan(1e-9);
  }
 });
 test('collision stays unavailable and frozen B endpoint is reproduced',()=>{
  for(const mag of PILOT_MAGNETS){for(const l of LAMBDA_GRID)expect(evaluateLambda(mag,{center:[0,0,0],axis:[1,0,0]},l).ok).toBe(false);
   for(const x of [0,3,9,15]){const pose={center:[x,0,15] as [number,number,number],axis:[1,0,0] as [number,number,number]};const a=evaluatePose(mag,pose,scenarioForLength(LAMBDA_STUDY.effectiveLengthMm),'B'),b=evaluateLambda(mag,pose,1);if(a.ok&&b.ok)expect(Math.abs(a.response-b.response)).toBeLessThan(1e-12);}
  }
 });
 test('all four distance searches reproduce pass3 at lambda=1',()=>{
  for(const m of PILOT_MAGNETS)for(const a of ['D1','D3','D4','D5'] as const){const t=LAMBDA_STUDY.kMtPerAt*20;
   const b=distanceFor(m,a,t,'C1','B',undefined,scenarioForLength(LAMBDA_STUDY.effectiveLengthMm),LAMBDA_STUDY.documentaryDatumMm),r=lambdaDistanceFor(m,a,t,1);
   expect(r.ok&&b.ok).toBe(true);if(r.ok&&b.ok)expect(Math.abs(r.value-b.value)).toBeLessThanOrEqual(1e-4);
  }
 },60000);
});
