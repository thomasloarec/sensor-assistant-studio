import {describe,test,expect} from 'bun:test';
import {SENSOR_CATALOG} from '../src/lib/standex/sensor-catalog';
import {DEFAULT_WORKSHOP} from '../src/lib/standex/magnetic-workshop';
import {CATALOGUE_PROFILES,catalogueModel,cataloguePlacement,catalogueFrame,catalogueTimeline,catalogueVolume} from '../src/lib/standex/catalogue-pedagogical';
import {BARE_MAGNETS} from '../src/lib/standex/magnet-catalog';
import {evaluatePlacement,DEFAULT_EXPERIMENT} from '../src/lib/detection-lab/workshop-experiment';
import {createDossier} from '../src/lib/leadmagnet/dossier';
import {recordClientTrace,currentClientTrace} from '../src/lib/standex/client-pedagogical';
import {buildDossierExport,parseDossierExport} from '../src/lib/leadmagnet/dossier-io';
describe('versioned catalogue layer, unchanged reference B',()=>{
 test('31 explicit profiles retain every visual body and exact magnet identity',()=>{
  expect(SENSOR_CATALOG.length).toBe(31);expect(Object.keys(CATALOGUE_PROFILES).length).toBe(31);
  for(const s of SENSOR_CATALOG){const m=catalogueModel({...DEFAULT_WORKSHOP,sensorId:s.id});expect(m.body).toEqual(s.body);expect(m.lengthMm).toBeLessThanOrEqual(s.body[0]);expect(m.magnetId).toBe('M04');}
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
 test('66 pilots centred vs offset and inversion match frozen reference at same pose',()=>{
  for(const magnetModel of ['SMCO5-5X4','N45-4X19']){
   const c={...DEFAULT_WORKSHOP,sensorId:'MK03',guideReference:'MK03-1A66C-X',magnetModel,sensitivity:'C'};
   const depth=magnetModel==='SMCO5-5X4'?6:16;
   for(const x of [0,8]){const pose={center:[x,depth,0] as [number,number,number],axis:[0,1,0] as [number,number,number]};
    const a=cataloguePlacement(c,pose),b=evaluatePlacement({...DEFAULT_EXPERIMENT,magnetId:magnetModel},pose);expect(a.state).toBe(b.state);expect(a.nominal).toEqual(b.nominal);
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