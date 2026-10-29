import {test,expect} from 'bun:test';
import {DEFAULT_WORKSHOP,type Vec3} from '../src/lib/standex/magnetic-workshop';
import {catalogueModel,catalogueEvaluate,cataloguePlacement,catalogueFrame,catalogueVolume,catalogueCut,catalogueTimeline,magnetBodyFrame,CATALOGUE_MODEL_VERSION} from '../src/lib/standex/catalogue-pedagogical';
import {CATALOGUE_RESPONSE,catalogueScenarios,catalogueThresholds} from '../src/lib/standex/catalogue-response';
import {evaluatePose} from '../src/lib/detection-lab/pose';
import {PILOT_MAGNETS} from '../src/lib/detection-lab/magnets';
import {illustrativeContact} from '../src/lib/standex/pedagogical-contact';
import {clientPedagogicalResult} from '../src/lib/standex/client-pedagogical';
import {discoveryPatch} from '../src/lib/standex/discovery-preset';
import {readFileSync} from 'node:fs';
import {parseMachineAsset} from '../src/lib/standex/machine-assets';
import {DEMO_ASSEMBLIES} from '../src/lib/standex/machine-demos';
import {partEnvelopes,reedObstaclesAt} from '../src/lib/standex/pedagogical-envelopes';

test('66 housings reproduce raw pilot A under every versioned hypothesis',()=>{
 for(const sensorId of ['MK03','MK04','MK05','MK13','MK14','MK21','MK11-M8','MK38'])for(const mag of PILOT_MAGNETS){
  const c={...DEFAULT_WORKSHOP,sensorId,magnetModel:mag.id,guideReference:`${sensorId}-1A66C-X`,sensitivity:'C'},m=catalogueModel(c),frame=magnetBodyFrame(c,0);
  for(const scenario of catalogueScenarios())for(const pose of [{center:[5,0,18] as Vec3,axis:[1,0,0] as Vec3},{center:[12,0,14] as Vec3,axis:[0,0,1] as Vec3}]){
   const expected=evaluatePose(mag,pose,scenario,'A'),actual=catalogueEvaluate(m,pose,scenario,frame);
   expect(expected.ok&&actual.ok).toBe(true);if(expected.ok&&actual.ok)expect(actual.response).toBeCloseTo(expected.response,11);
  }
 }
 expect(catalogueThresholds('A')?.low).toBeNull();expect(catalogueThresholds('G')).toBeNull();
 expect(CATALOGUE_RESPONSE.documentaryDatumMm).toBeCloseTo(8.903153,5);
});
test('MK04 point, timeline and binary circuit agree across motions and quarter-turns',()=>{
 for(const geometry of ['D1','D3'] as const)for(const motion of ['approach','slide'] as const)for(const magnetAngle of [0,90]){
  const c={...DEFAULT_WORKSHOP,...discoveryPatch(DEFAULT_WORKSHOP,{geometry,motion}),magnetAngle};
  const timeline=catalogueTimeline(c,undefined,24),states=new Set<string|null>();
  for(const p of timeline.points){const pose=catalogueFrame(c,p.t).pose,e=cataloguePlacement(c,pose);expect(p.response).toBe(e.nominal?.ok?e.nominal.response:null);expect(p.zone).toBe(e.zone);const contact=illustrativeContact(e,c.sensitivity);states.add(contact);if(e.nominal?.ok)expect(contact).toBe(e.zone>0?'closed':'open');}
  // A perpendicular centred approach may remain open; never force closure.
  if(motion==='approach'&&magnetAngle===0){expect(states.has('open')).toBe(true);expect(states.has('closed')).toBe(true);expect(states.has(null)).toBe(false);}
 }
});
test('volume, cut and actual pose agree including body exclusions',()=>{
 const c={...DEFAULT_WORKSHOP,sensorId:'MK24-A-J',magnetModel:'SMCO5-5X4',sensitivity:'C'},frame=magnetBodyFrame(c,0),axis:Vec3=[1,0,0],m=catalogueModel(c);
 const volume=catalogueVolume(c,axis,0,[],7,frame),cut=catalogueCut(c,axis,0,[],7,frame);
 expect(volume.key).toContain(CATALOGUE_MODEL_VERSION);
 for(const cell of cut.cut){const v=volume.cut.find(v=>v.x===cell.x&&v.y===cell.y)!;if(cell.response===null)expect(v.response).toBeNull();else expect(v.response!).toBeCloseTo(cell.response,10);}
 for(let k=0;k<volume.field.zs.length;k+=3)for(let j=0;j<volume.field.ys.length;j+=3)for(let i=0;i<volume.field.xs.length;i+=5){
  const center:Vec3=[volume.field.xs[i]!,volume.field.ys[j]!,volume.field.zs[k]!],p=cataloguePlacement(c,{center,axis,frame},[],m,true),idx=(k*volume.field.ys.length+j)*volume.field.xs.length+i;
  if(p.nominal?.ok)expect(volume.field.values[idx]!).toBeCloseTo(p.nominal.response,9);else expect(volume.field.values[idx]).toBeNull();
 }
 expect(cataloguePlacement(c,{center:[0,0,0],axis,frame}).cause).toBe('overlap');
});
test('saved client trace identifies A and remains non-qualifying',()=>{
 const trace=clientPedagogicalResult(DEFAULT_WORKSHOP,.5);
 expect(trace.profileVersion).toBe('form66-lfit-a-c1@1.0.0');expect(trace.indicative?.version).toBe(CATALOGUE_MODEL_VERSION);expect(trace.qualified).toBe(false);
});
test('loaded GLB mounting keeps transforms and feeds the same A timeline with real part envelopes',async()=>{
 const bytes=readFileSync('public/models/demo-paroi-alesage.glb');
 const asset=await parseMachineAsset(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),1000);
 try{
  const env=partEnvelopes(asset)!;
  const machine={...structuredClone(DEMO_ASSEMBLIES['builtin:wall-v1']!),sensorPosition:[-80,100,-40] as Vec3,magnetPosition:[-80,100,-10] as Vec3,magnetMount:'moving' as const,travel:[0,0,15] as Vec3};
  const c={...DEFAULT_WORKSHOP,machine},before=JSON.stringify(c);
  const table=Array.from({length:17},(_,i)=>{const t=i/16,f=catalogueFrame(c,t);return {t,pose:f.pose,obstacles:reedObstaclesAt(machine,env,t,f)};});
  expect(table[0]!.pose.center).not.toEqual(table[8]!.pose.center);
  const timeline=catalogueTimeline(c,table);let computable=0;
  for(const [i,s] of table.entries()){
   const point=cataloguePlacement(c,s.pose,s.obstacles);expect(timeline.points[i]!.zone).toBe(point.zone);expect(timeline.points[i]!.state).toBe(point.state);
   if(point.nominal?.ok){computable++;expect(timeline.points[i]!.response).toBe(point.nominal.response);}
  }
  expect(computable).toBeGreaterThan(0);expect(JSON.stringify(c)).toBe(before);
 }finally{asset.dispose();}
});
