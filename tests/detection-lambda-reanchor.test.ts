import {describe,test,expect} from 'bun:test';
import {fitLambdaDatum,buildReanchoredTable} from '../src/lib/detection-lab/lambda-reanchor';
import {LAMBDA_STUDY,lambdaDistanceFor,evaluateLambda} from '../src/lib/detection-lab/lambda-study';
import {fitAxialDatum,scorePass3Groups,scorePass3,pass3ControlRows} from '../src/lib/detection-lab/pass3';
import {PILOT_MAGNETS} from '../src/lib/detection-lab/magnets';

describe('documentary datum fitted independently for each response',()=>{
 test('A agrees with independent pass3 fit, B retains its existing datum',()=>{
  const a=fitLambdaDatum(0),b=fitLambdaDatum(1);
  const independent=fitAxialDatum(LAMBDA_STUDY.effectiveLengthMm,LAMBDA_STUDY.kMtPerAt,'A','C1');
  expect(Math.abs(a.datumMm-independent.datumMm)).toBeLessThan(1e-4);
  expect(Math.abs(b.datumMm-LAMBDA_STUDY.documentaryDatumMm)).toBeLessThan(1e-4);
  expect(Math.abs(a.residualMm)).toBeLessThan(1e-4);
  // A different anchor changes only the reporting origin, not the response.
  expect(Math.abs(fitLambdaDatum(0,8.5).datumMm-(a.datumMm-1))).toBeLessThan(1e-4);
 });
 test('D1/D4 remain identical; axial distances move by the documentary offset only',()=>{
  const anchor=fitLambdaDatum(0),theta=20*LAMBDA_STUDY.kMtPerAt;
  for(const magnet of PILOT_MAGNETS)for(const approach of ['D1','D3','D4','D5'] as const){
   const before=lambdaDistanceFor(magnet,approach,theta,0),after=lambdaDistanceFor(magnet,approach,theta,0,undefined,anchor.datumMm);
   expect(before.ok&&after.ok).toBe(true);
   if(before.ok&&after.ok)expect(Math.abs(after.value-before.value+(['D3','D5'].includes(approach)?anchor.deltaMm:0))).toBeLessThan(1e-4);
  }
 },60000);
 test('primary score retains anomalies and does not silently declare A passing',()=>{
  const a=fitLambdaDatum(0),table=buildReanchoredTable(0,a.datumMm),score=scorePass3Groups(table).grouped;
  expect(score.total).toBe(45);expect(score.passed).toBe(43);expect(score.pass).toBe(false);
  expect(score.failures.every(r=>r.magnetId==='N45-4X19'&&r.approach==='D3')).toBe(true);
  const secondary=scorePass3(pass3ControlRows(table).filter(r=>!r.notes.includes('SUSPECTED_D1_TO_D3_COPY_RETAINED')));
  expect(secondary.total).toBe(43);expect(secondary.pass).toBe(true);
  expect(table.find(r=>r.status==='anchor_d4')!.notes).toContain('LEGACY_D4_ANCHOR_EXCLUDED_NOT_REFITTED');
 },60000);
 test('A preserves a finite under-threshold central band despite a zero-width exact null',()=>{
  const depths=[8.6330322265625,18.6965087890625],threshold=15*LAMBDA_STUDY.kMtPerAt;
  for(const [i,magnet] of PILOT_MAGNETS.entries()){
   for(const x of [0,1,2]){const v=evaluateLambda(magnet,{center:[x,0,depths[i]!],axis:[0,0,1]},0);expect(v.ok).toBe(true);if(v.ok)expect(v.response).toBeLessThan(threshold);}
   const inside=evaluateLambda(magnet,{center:[4,0,depths[i]!],axis:[0,0,1]},0);expect(inside.ok).toBe(true);if(inside.ok)expect(inside.response).toBeGreaterThan(threshold);
  }
 });
});
