import {test,expect} from 'bun:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {DEFAULT_WORKSHOP,type Vec3} from '../src/lib/standex/magnetic-workshop';
import {catalogueModel,catalogueEvaluate,cataloguePlacement,catalogueVolume,catalogueCut,magnetBodyFrame} from '../src/lib/standex/catalogue-pedagogical';
import {catalogueNominalScenario} from '../src/lib/standex/catalogue-response';
import {sensorById,bladeOffsetY} from '../src/lib/standex/sensor-catalog';
import {fixingGroup,filterCatalog,EMPTY_CATALOG_FILTERS} from '../src/lib/standex/catalog-filters';
import {SensorPlan} from '../src/components/standex/workshop/sensor-plan';

test('round push-in sensors have their own filter, separate from ribbed press-fit bodies',()=>{
 const ids=['MK03','MK14','MK18','MK20_1','MK20_2'];
 expect(filterCatalog({...EMPTY_CATALOG_FILTERS,fixing:'pushin'}).map(s=>s.id)).toEqual([...ids,'CUSTOM']);
 for(const id of ['MK36','MK37','MK38'])expect(fixingGroup(sensorById(id))).toBe('pressfit');
 expect(fixingGroup(sensorById('MK02'))).toBe('screw');
});
const config={...DEFAULT_WORKSHOP,sensorId:'CUSTOM',magnetModel:'SMCO5-5X4'};
test('custom reed response uses the drawn component centre above the PCB',()=>{
 const m=catalogueModel(config),frame=magnetBodyFrame(config,0),s=catalogueNominalScenario();
 expect(m.centre[1]).toBe(bladeOffsetY(sensorById('CUSTOM')));
 const pose={center:[3,10,5] as Vec3,axis:[1,0,0] as Vec3,frame};
 const actual=catalogueEvaluate(m,pose,s,frame);
 const relative={...pose,center:pose.center.map((v,i)=>v-m.centre[i]!) as Vec3};
 const expected=catalogueEvaluate({...m,centre:[0,0,0]},relative,s,frame);
 expect(actual.ok&&expected.ok).toBe(true);
 if(actual.ok&&expected.ok)expect(actual.response).toBeCloseTo(expected.response,12);
});
test('custom PCB excludes its actual thickness and moulding, not empty space above the whole board',()=>{
 const frame=magnetBodyFrame(config,0),pose=(center:Vec3)=>({center,axis:[1,0,0] as Vec3,frame});
 expect(cataloguePlacement(config,pose([20,3,0])).cause).not.toBe('overlap');
 expect(cataloguePlacement(config,pose([20,-2,0])).cause).toBe('overlap');
 expect(cataloguePlacement(config,pose([0,3,0])).cause).toBe('overlap');
});
test('custom volume and cut do not mirror the raised reed or erase the PCB exclusion',()=>{
 const frame=magnetBodyFrame(config,0),axis:Vec3=[1,0,0],m=catalogueModel(config);
 const volume=catalogueVolume(config,axis,0,[],8,frame),cut=catalogueCut(config,axis,0,[],8,frame);
 for(const cell of [...volume.cut,...cut.cut]){
  const e=cataloguePlacement(config,{center:[cell.x,cell.y,cell.z],axis,frame},[],m,true);
  expect(cell.response).toBe(e.nominal?.ok?e.nominal.response:null);
  expect(cell.blocked).toBe(e.cause==='overlap');
 }
});
test('custom 2D body stays opaque until contacts are requested',()=>{
 const render=(xray:boolean)=>renderToStaticMarkup(createElement('svg',null,createElement(SensorPlan,{model:sensorById('CUSTOM'),xray})));
 expect(render(false)).toContain('fill="var(--standex-deep)" fill-opacity="1"');
 expect(render(true)).toContain('fill="var(--standex-deep)" fill-opacity="0.25"');
 expect(render(false)).toContain('fill="#2f6b52"');
 expect(render(true)).toContain('fill="#2f6b52"');
});


test('N42 family analogy never becomes a documented moment or a favorable qualification',async()=>{
 const {pairDemonstration}=await import('../src/lib/standex/magnetic-workshop');
 const {defaultMagnetFor}=await import('../src/lib/standex/default-pairs');
 const {catalogueFrame,catalogueExtent,catalogueVerdictNotes}=await import('../src/lib/standex/catalogue-pedagogical');
 const {packagedMagnet}=await import('../src/lib/standex/magnet-catalog');
 for(const [sensorId,family,q] of [['MK36','M36',49],['MK37','M37',75],['MK38','M38',101.5]] as const){
  const c=pairDemonstration(DEFAULT_WORKSHOP,sensorId,defaultMagnetFor(sensorId)),m=catalogueModel(c),p=catalogueFrame(c,0).pose;
  expect(c.magnetModel).toBe(family+'-N42');expect(packagedMagnet(c.magnetModel)?.momentTypE6Vscm).toBeNull();
  expect(m.moment).toBeNull();expect(m.unknownMoment).toBe(true);expect(m.fieldMoment).toBe(q);expect(m.familyMagnet).toBe(family);
  expect(catalogueVerdictNotes(c,m).some(n=>n.includes('N42'))).toBe(true);
  expect(catalogueExtent(c)).toBe(48);
  const cut=catalogueCut(c,p.axis,0,[],undefined,p.frame);
  expect(cut.cut.some(n=>Math.abs(n.x)>24&&n.zone>0)).toBe(true);
  expect(cut.cut.some(n=>Math.abs(n.x)===48&&n.zone>0)).toBe(false);
  for(const cell of cut.cut.filter(n=>n.zone===2).filter((_,i)=>i%50===0)){
   expect(cataloguePlacement(c,{...p,center:[cell.x,cell.y,cell.z]},[],m).state).not.toBe('favorable');
  }
 }
 expect(catalogueModel({...DEFAULT_WORKSHOP,magnetModel:'4003004003'}).familyAnalogy).toBe(false);
});
