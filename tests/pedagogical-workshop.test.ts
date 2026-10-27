import { describe, expect, test } from 'bun:test';
import frozenResult from '../docs/detection-lab-pass3/resultats_pass3.json';
import { EXPERIMENT, DEFAULT_EXPERIMENT, FORM_ANOMALIES, evaluatePlacement, classThresholds, experimentalScenarios, nominalScenario, conservativeDistance, derivedDatum, settingsKey, sampleVolume, placementTimeline, replayDocumentedSwitch, findPlacement, axisNodes } from '../src/lib/detection-lab/workshop-experiment';
import { evaluatePose } from '../src/lib/detection-lab/pose';
import { PILOT_MAGNETS } from '../src/lib/detection-lab/magnets';
import { PROFILE } from '../src/lib/detection-lab/profile';
import { pedagogicalFrame } from '../src/lib/standex/pedagogical-poses';
import { DEFAULT_WORKSHOP, parseWorkshopConfig } from '../src/lib/standex/magnetic-workshop';
import { DEMO_ASSEMBLIES } from '../src/lib/standex/machine-demos';

describe('Internal pedagogical Form66 workshop',()=>{
 test('Frozen exact Lfit values are read from pass3, never refitted',()=>{
   const row=frozenResult.variants.find(v=>v.id==='Lfit-d4corr');expect(row).toBeDefined();
   expect(EXPERIMENT.effectiveLengthMm).toBe(row?.L);expect(EXPERIMENT.kMtPerAt).toBe(row?.k);
   expect(EXPERIMENT.documentaryDatumMm).toBe(row?.datumMm);expect(EXPERIMENT.documentaryD4DeltaMm).toBe(row?.d4DeltaMm);
   expect(EXPERIMENT.effectiveLengthMm).toBe(15.63399603080886);expect(PROFILE.reed.effectiveLengthMm).toBe(8);
 });
 test('R01 perpendicular centred is unfavorable and lateral shift favorable outside collision',()=>{
   const settings={...DEFAULT_EXPERIMENT,magnetId:'N45-4X19'};
   const centred=evaluatePlacement(settings,{center:[0,16,0],axis:[0,1,0]});
   expect(centred.nominal?.ok).toBe(true);expect(centred.state).toBe('unfavorable');expect(centred.cause).toBe('orientation');
   const shifted=evaluatePlacement(settings,{center:[8,16,0],axis:[0,1,0]});expect(shifted.nominal?.ok).toBe(true);expect(shifted.state).toBe('favorable');
 });
 test('R02 shared volume/cut/point responses at common refined nodes',()=>{
   const settings={...DEFAULT_EXPERIMENT,hypotheses:false},axis:[number,number,number]=[0,1,0];
   const volume=sampleVolume(settings,axis,0,8);
   expect(volume.cells.length).toBeGreaterThan(100);expect(volume.cut.length).toBeGreaterThan(100);
   for(const c of volume.cut.filter(c=>Math.abs(c.x)<=5&&c.y===6)){
     const point=evaluatePlacement(settings,{center:[c.x,c.y,c.z],axis});
     expect(c.response).toBe(point.nominal?.ok?point.nominal.response:null);expect(c.zone).toBe(point.zone);
     if(c.zone)expect(volume.cells.find(v=>v.x===c.x&&v.y===c.y&&v.z===c.z)?.response).toBe(c.response);
   }
   expect(volume.cut.find(c=>c.x===0&&c.y===6)?.zone).toBe(0);
   expect(axisNodes(-8,8,true)).toContain(.25);
 });
 test('R02 rotation is continuous and reevaluates the same kernel',()=>{
   const magnet=PILOT_MAGNETS[0];if(!magnet)throw Error('pilot');
   const values=[44,45,46].map(a=>evaluatePose(magnet,{center:[8,12,0],axis:[Math.cos(a*Math.PI/180),Math.sin(a*Math.PI/180),0]},nominalScenario(),'B'));
   expect(values.every(v=>v.ok)).toBe(true);const responses=values.flatMap(v=>v.ok?[v.response]:[]);expect(responses[0]).not.toBe(responses[2]);expect(Math.abs((responses[0]??0)-(responses[1]??0))).toBeLessThan(.2);
 });
 test('R03 global rigid motion preserves relative pose and attachments',()=>{
   const source=DEMO_ASSEMBLIES['builtin:wall-v1'];if(!source)throw Error('demo');
   const m={...structuredClone(source),sensorMount:'moving' as const,magnetMount:'moving' as const,sensorPosition:[0,0,0] as [number,number,number],magnetPosition:[8,16,0] as [number,number,number]};
   const a=pedagogicalFrame({...DEFAULT_WORKSHOP,machine:m},0),b=pedagogicalFrame({...DEFAULT_WORKSHOP,machine:m},.25);
   expect(b.pose.center).toEqual(a.pose.center);expect(b.pose.axis).toEqual(a.pose.axis);expect(b.world.center).not.toEqual(a.world.center);
 });
 test('R04 scenarios retain fixed thresholds around new nominal without refit',()=>{
   const scenarios=experimentalScenarios(true);expect(scenarios).toHaveLength(9);
   expect(scenarios[1]?.lengthFactor).toBeCloseTo(EXPERIMENT.effectiveLengthMm/8*.7,12);
   expect(scenarios.find(s=>s.id==='m+10%')?.momentFactor).toBe(1.1);
   expect(classThresholds('C')?.high).toBe(20*EXPERIMENT.kMtPerAt);
   expect(placementTimeline(DEFAULT_EXPERIMENT,()=>({center:[8,16,0],axis:[0,1,0]}),8).electrical).toBe('uncharacterized');
 });
 test('R05 partial A has exactly one bound and never a firm placement verdict',()=>{
   expect(classThresholds('A')).toEqual({low:null,high:10*EXPERIMENT.kMtPerAt});
   expect(evaluatePlacement({...DEFAULT_EXPERIMENT,className:'A'},{center:[8,8,0],axis:[1,0,0]}).state).toBe('unavailable');
   expect(classThresholds('G')).toBeNull();
 });
 test('R05 unsupported identities, materials, collisions and domain never become favorable',()=>{
   const pose={center:[8,16,0] as [number,number,number],axis:[0,1,0] as [number,number,number]};
   for(const patch of [{magnetId:'M04'},{magnetId:'M13'},{integration:'unknown' as const},{nearbyMaterial:true},{className:'G'}])expect(evaluatePlacement({...DEFAULT_EXPERIMENT,...patch},pose).state).toBe('unavailable');
   expect(evaluatePlacement(DEFAULT_EXPERIMENT,{...pose,center:[0,0,0]}).cause).toBe('collision');
   expect(evaluatePlacement(DEFAULT_EXPERIMENT,{...pose,center:[0,61,0]}).cause).toBe('domain');
 });
 test('R05/R12 both suspected source copies are preserved with equality evidence',()=>{
   expect(FORM_ANOMALIES.map(a=>a.publishedMm)).toEqual([17.3,17.7]);
   expect(FORM_ANOMALIES.every(a=>a.equalToD1&&!a.manufacturerConfirmed)).toBe(true);
 });
 test('R06 synthetic documented hysteresis is deterministic, unknown remains unknown',()=>{
   const points=[{t:0,response:0},{t:.2,response:3},{t:.4,response:1.5},{t:.6,response:.5},{t:1,response:3}];
   const piece={name:'SYNTHETIC-TEST-ONLY',source:'test fixture, not a catalogue part',ton:2,toff:1,initial:'open' as const};
   expect(replayDocumentedSwitch(points,piece)?.map(p=>p.state)).toEqual(['open','closed','closed','open','closed']);
   expect(replayDocumentedSwitch([...points].reverse(),piece)).toEqual(replayDocumentedSwitch(points,piece));expect(replayDocumentedSwitch(points,null)).toBeNull();
 });
 test('R07 multiple lobe crossings and unresolved coarse events remain explicit',()=>{
   const settings={...DEFAULT_EXPERIMENT,magnetId:'N45-4X19',hypotheses:false};
   const poseAt=(t:number)=>({center:[-16+t*32,16,0] as [number,number,number],axis:[0,1,0] as [number,number,number]});
   const timeline=placementTimeline(settings,poseAt,32);expect(timeline.events.length).toBeGreaterThanOrEqual(4);expect(timeline.events.every(e=>e.resolved)).toBe(true);
   expect(placementTimeline(settings,poseAt,32,0).events.some(e=>!e.resolved)).toBe(true);
 });
 test('R08 machine JSON roundtrip retains scale, support, clip and pose at 25 percent',()=>{
   const source=DEMO_ASSEMBLIES['builtin:wall-v1'];if(!source)throw Error('demo');
   const config={...DEFAULT_WORKSHOP,machine:structuredClone(source)};const parsed=parseWorkshopConfig(JSON.parse(JSON.stringify(config)));expect(parsed?.machine).toEqual(config.machine);
   if(!parsed)throw Error('parse');expect(pedagogicalFrame(parsed,.25)).toEqual(pedagogicalFrame(config,.25));
 });
 test('R09 polarity inversion preserves nonpolarized response and state',()=>{
   for(const magnet of PILOT_MAGNETS){const s={...DEFAULT_EXPERIMENT,magnetId:magnet.id};const a=evaluatePlacement(s,{center:[8,16,0],axis:[0,1,0]}),b=evaluatePlacement(s,{center:[8,16,0],axis:[0,-1,0]});expect(b.state).toBe(a.state);expect(b.nominal?.ok?b.nominal.response:null).toBe(a.nominal?.ok?a.nominal.response:null);}
 });
 test('R10 changed profile/data invalidate result and cache key',()=>{
   const s={...DEFAULT_EXPERIMENT,profileVersion:'old'};expect(settingsKey(s,[1,0,0],0)).not.toBe(settingsKey(DEFAULT_EXPERIMENT,[1,0,0],0));expect(evaluatePlacement(s,{center:[8,16,0],axis:[0,1,0]}).cause).toBe('stale');
   expect(evaluatePlacement({...DEFAULT_EXPERIMENT,dataVersion:'old'},{center:[8,16,0],axis:[0,1,0]}).state).toBe('unavailable');
 });
 test('R11 mechanical centre alignment is not magnetic validation',()=>{
   expect(evaluatePlacement({...DEFAULT_EXPERIMENT,magnetId:'N45-4X19'},{center:[0,16,0],axis:[0,1,0]}).state).toBe('unfavorable');
   const pose={center:[0,16,0] as [number,number,number],axis:[0,1,0] as [number,number,number]};expect(findPlacement(DEFAULT_EXPERIMENT,pose,false)).toBeNull();expect(findPlacement({...DEFAULT_EXPERIMENT,lateralFreedomMm:12},pose,true)).toBeNull();
 });
 test('R12 documentary D4 subtraction precedes half-mm flooring, never a housing offset',()=>{
   const raw=8.291290283203125;expect(conservativeDistance(raw,'D4')).toBe(6.5);expect(conservativeDistance(raw,'D1')).toBe(8);
   expect(raw-EXPERIMENT.documentaryD4DeltaMm-conservativeDistance(raw,'D4')).toBeLessThan(.5);
   expect(derivedDatum(4,2,6,'documented-housing-offset')).toBe(6);expect(derivedDatum(4,2,6.1,'documented-housing-offset')).toBeNull();expect(derivedDatum(4,2,6,'empirical-d4')).toBeNull();
 });
});