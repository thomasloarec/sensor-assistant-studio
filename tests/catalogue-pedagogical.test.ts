import {describe,test,expect} from 'bun:test';
import {SENSOR_CATALOG} from '../src/lib/standex/sensor-catalog';
import {DEFAULT_WORKSHOP} from '../src/lib/standex/magnetic-workshop';
import {CATALOGUE_PROFILES,catalogueModel,cataloguePlacement,catalogueFrame,catalogueTimeline,catalogueVolume} from '../src/lib/standex/catalogue-pedagogical';
import {BARE_MAGNETS} from '../src/lib/standex/magnet-catalog';
import {defaultMagnetFor} from '../src/lib/standex/default-pairs';
import {ACTIVATION_GUIDE} from '../src/lib/standex/activation-guide';
import {catalogueNominalScenario} from '../src/lib/standex/catalogue-response';
import {evaluatePose,signGatedResponse} from '../src/lib/detection-lab/pose';
import {PILOT_MAGNETS} from '../src/lib/detection-lab/magnets';
import {createDossier} from '../src/lib/leadmagnet/dossier';
import {recordClientTrace,currentClientTrace} from '../src/lib/standex/client-pedagogical';
import {buildDossierExport,parseDossierExport} from '../src/lib/leadmagnet/dossier-io';
describe('versioned C1% catalogue layer, historical B isolated',()=>{
 test('guide inventory distinguishes rows from numeric bounds',()=>{
  expect(ACTIVATION_GUIDE.rows.length).toBe(3004);
  expect(ACTIVATION_GUIDE.rows.reduce((n,r)=>n+Number(typeof r.upMm==='number')+Number(typeof r.toMm==='number'),0)).toBe(5744);
 });
 test('published 66 families and MK38 variants stay distinct with exact couple sources',()=>{
  for(const [sensorId,magnetModel,sensitivity] of [['MK14','M02','B'],['MK11-M8','M02','B'],['MK38','M38-N42','1A66B']]){
   const m=catalogueModel({...DEFAULT_WORKSHOP,sensorId:sensorId??'',magnetModel:magnetModel??'',sensitivity:sensitivity??'',guideReference:null});expect(m.family).toBe('66');expect(m.publishedRows.length).toBeGreaterThan(0);
  }
  for(const [sensitivity,family] of [['1A85C','85'],['1B90C','90'],['1C90C','90']]){
   const m=catalogueModel({...DEFAULT_WORKSHOP,sensorId:'MK38',magnetModel:'M38-N42',sensitivity:sensitivity??'',guideReference:null});expect(m.family).toBe(family);expect(m.status).toBe('documented');
  }
  for(const sensorId of ['MK04','MK05','MK13']){const m=catalogueModel({...DEFAULT_WORKSHOP,sensorId,magnetModel:sensorId.replace('MK','M')});expect(m.publishedRows.length).toBe(20);expect(m.publishedRows.every(r=>r.magnetId===m.magnetId)).toBe(true);}
  expect(catalogueModel({...DEFAULT_WORKSHOP,sensorId:'MK38',magnetModel:'N45-4X19'}).publishedRows.length).toBe(0);
 });
 test('F1 uses frontal faces and preserves gap without becoming D1',()=>{
  const c={...DEFAULT_WORKSHOP,sensorId:'MK38',magnetModel:'M38-N42',geometry:'F1' as const,start:20,end:10};
  const m=catalogueModel(c),f=catalogueFrame(c,.5);
  expect(f.world.center[0]).toBe(10+(m.body[0]+m.magnetBody[0])/2);expect(f.world.center[2]).toBe(c.lateralShift);
  expect(m.publishedRows.every(r=>r.approachId==='F1'&&r.datum==='frontal_faces')).toBe(true);
 });
 test('31 explicit profiles retain every visual body and exact magnet identity',()=>{
  expect(SENSOR_CATALOG.length).toBe(31);expect(Object.keys(CATALOGUE_PROFILES).length).toBe(31);
  for(const s of SENSOR_CATALOG){const m=catalogueModel({...DEFAULT_WORKSHOP,sensorId:s.id});expect(m.body).toEqual(s.body);expect(m.lengthMm).toBeLessThanOrEqual(s.body[0]);expect(m.magnetId).toBe('M04');}
 });
 test('every catalogue proposed couple has indicative zones inside displayed domain',()=>{
  for(const s of SENSOR_CATALOG){const c={...DEFAULT_WORKSHOP,sensorId:s.id,magnetModel:defaultMagnetFor(s.id)},m=catalogueModel(c);let found=false;
   for(let x=-24;x<=24&&!found;x++)for(let z=-24;z<=24&&!found;z++)found=cataloguePlacement(c,{center:[x,0,z],axis:[1,0,0]},[],m,true).zone>0;
   expect(found).toBe(true);
  }
 });
 test('selected GP501 never inherits 66; miniature MK24 uses 3mm not 14mm',()=>{
  expect(catalogueModel({...DEFAULT_WORKSHOP,sensorId:'MK03',guideReference:'MK03-GP501C-X'}).family).toBe('GP501');
  expect(catalogueModel({...DEFAULT_WORKSHOP,sensorId:'MK03',guideReference:'MK03-1A66C-X'}).family).toBe('66');
  const m=catalogueModel({...DEFAULT_WORKSHOP,sensorId:'MK24-A-J',sensitivity:'1A'});expect(m.lengthMm).toBe(3);expect(m.className).toBe('C');expect(m.status).not.toBe('form66');
 });
 test('moment cylinders and block proxies preserve 8 brochure identities without pilot aliases',()=>{
  for(const b of BARE_MAGNETS.filter(m=>m.moment!==null)){const m=catalogueModel({...DEFAULT_WORKSHOP,magnetModel:b.id});expect(m.magnetId).toBe(b.id);expect(m.moment).toBe(b.moment);expect(m.magnet.jT).toBeGreaterThan(0);}
  expect(catalogueModel({...DEFAULT_WORKSHOP,magnetModel:'M04'}).magnetGeometry).toBe('equivalent-cylinder');
  expect(catalogueModel({...DEFAULT_WORKSHOP,magnetModel:'4003004003'}).unknownMoment).toBe(true);
 });
 test('66 pilots centred vs offset and inversion match raw C1% reference at same pose',()=>{
  for(const magnetModel of ['SMCO5-5X4','N45-4X19']){
   const c={...DEFAULT_WORKSHOP,sensorId:'MK03',guideReference:'MK03-1A66C-X',magnetModel,sensitivity:'C'};
   const depth=magnetModel==='SMCO5-5X4'?6:16;
   for(const x of [0,8]){const pose={center:[x,depth,0] as [number,number,number],axis:[0,1,0] as [number,number,number]};
    const a=cataloguePlacement(c,pose),b=evaluatePose(PILOT_MAGNETS.find(m=>m.id===magnetModel)!,pose,catalogueNominalScenario(),'A');expect(a.nominal).toEqual(b.ok?{...b,response:signGatedResponse(b.m1,b.m2,.01)}:b);
    expect(cataloguePlacement(c,{...pose,axis:[0,-1,0]}).state).toBe(a.state);
   }
  }
 });
 test('real body collision blocks even when internal reed is inside its own housing',()=>{
  const c={...DEFAULT_WORKSHOP,sensorId:'MK04',magnetModel:'SMCO5-5X4'};
  expect(cataloguePlacement(c,{center:[0,0,0],axis:[1,0,0]}).cause).toBe('overlap');
  expect(cataloguePlacement(c,{center:[0,20,0],axis:[1,0,0]}).cause).not.toBe('reed_overlap');
 });
 test('point timeline and cut share evaluator, continuous orientation key, no binary state',()=>{
  const c={...DEFAULT_WORKSHOP,sensorId:'MK24-A-J',magnetModel:'SMCO5-5X4',start:12,end:10};
  const timeline=catalogueTimeline(c,undefined,2);for(const p of timeline.points)expect(p.state).toBe(cataloguePlacement(c,catalogueFrame(c,p.t).pose).state);
  const v=catalogueVolume(c,[1,0,0],0,[],1);for(const cell of v.cut)expect(cell.zone).toBe(cataloguePlacement(c,{center:[cell.x,cell.y,cell.z],axis:[1,0,0]},[],catalogueModel(c),true).zone);
  expect(timeline.electrical).toBe('uncharacterized');expect(catalogueVolume(c,[1,.001,0],0,[],1).key).not.toBe(v.key);
 });
 test('export reprise rebuilds profile and keeps placement time without restoring qualification',()=>{
  const d=recordClientTrace(createDossier(),{...DEFAULT_WORKSHOP,sensorId:'MK24-A-J'},.5),out=buildDossierExport(d),r=parseDossierExport(JSON.parse(JSON.stringify(out)));
  expect(r.ok).toBe(true);if(!r.ok)return;const trace=currentClientTrace(r.dossier);expect(trace?.qualified).toBe(false);expect(trace?.indicative?.progress).toBe(.5);expect(trace?.indicative?.lengthMm).toBe(3);
 });
});