import {test,expect} from 'bun:test';
import {responseC,evaluateC,cDistanceFor} from '../src/lib/detection-lab/candidate-c';
import {reedResponse} from '../src/lib/detection-lab/pose';
import {PILOT_MAGNETS} from '../src/lib/detection-lab/magnets';
import {LAMBDA_STUDY} from '../src/lib/detection-lab/lambda-study';
import {CATALOGUE_RESPONSE} from '../src/lib/standex/catalogue-response';

test('C obeys B <= C <= A, polarity and blade-exchange invariance',()=>{
 for(let a=-12;a<=12;a+=.25)for(let b=-12;b<=12;b+=.25){const c=responseC(a,b);expect(c).toBeGreaterThanOrEqual(reedResponse(a,b,'B'));expect(c).toBeLessThanOrEqual(reedResponse(a,b,'A'));expect(responseC(-a,-b)).toBe(c);expect(responseC(b,a)).toBe(c);if(a*b<=0)expect(c).toBe(0);}
 expect(()=>responseC(NaN,1)).toThrow();expect(()=>responseC(1,1,-.1)).toThrow();
});
test('sign boundary is discontinuous and 1% is a distinct model variant',()=>{
 expect(responseC(0,10)).toBe(0);expect(responseC(1e-8,10)).toBeGreaterThan(4.9);expect(responseC(1e-8,10,.01)).toBe(0);
 expect(responseC(2,3)).toBe(2.5);expect(responseC(-2,3)).toBe(0);
});
test('C retains collision masks and broad perpendicular dead band',()=>{
 for(const [i,m] of PILOT_MAGNETS.entries()){
  expect(evaluateC(m,{center:[0,0,0],axis:[1,0,0]}).ok).toBe(false);
  const z=[8.6330322265625,18.6965087890625][i]!;
  const dead=evaluateC(m,{center:[3.5,0,z],axis:[0,0,1]}),on=evaluateC(m,{center:[4.5,0,z],axis:[0,0,1]});
  expect(dead.ok&&on.ok).toBe(true);if(dead.ok&&on.ok){expect(dead.response).toBe(0);expect(on.response).toBeGreaterThan(15*LAMBDA_STUDY.kMtPerAt);}
 }
});
test('C D4/D5 maxima converge under finer scan and doubled quadrature; client uses the reviewed C1%',()=>{
 expect(CATALOGUE_RESPONSE.model).toBe('C');expect(CATALOGUE_RESPONSE.relativeSignEpsilon).toBe(.01);
 for(const m of PILOT_MAGNETS)for(const approach of ['D4','D5'] as const){const theta=20*LAMBDA_STUDY.kMtPerAt;
  const a=cDistanceFor(m,approach,theta,8.903167724609375),b=cDistanceFor(m,approach,theta,8.903167724609375,0,.25,24);
  expect(a.ok&&b.ok).toBe(true);if(a.ok&&b.ok)expect(Math.abs(a.value-b.value)).toBeLessThan(.001);
 }
},60000);
