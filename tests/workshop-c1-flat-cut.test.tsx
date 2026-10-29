import {test,expect,afterEach} from 'bun:test';
import {GlobalRegistrator} from '@happy-dom/global-registrator';
import {render,cleanup} from '@testing-library/react';
import {DEFAULT_WORKSHOP,type Vec3} from '../src/lib/standex/magnetic-workshop';
import {cataloguePlacement,catalogueCut,catalogueVolume,catalogueFrame} from '../src/lib/standex/catalogue-pedagogical';
import {CATALOGUE_CUT_PLANE_Z,catalogueThresholds} from '../src/lib/standex/catalogue-response';
import {sectionVolume} from '../src/lib/standex/zone-section';
import {PedagogicalCut} from '../src/components/standex/workshop/pedagogical-layer';
import {setLocale} from '../src/lib/i18n/core';
try{if(typeof document==='undefined')GlobalRegistrator.register({url:'http://localhost/'});}catch{}
afterEach(cleanup);
const E:[Vec3,Vec3,Vec3]=[[1,0,0],[0,1,0],[0,0,1]];
test('flat-face clearance uses Y thickness and does not move the actual montage',()=>{
 for(const [magnetModel,h] of [['SMCO5-5X4',5.45],['M04',5.9]] as const){
  const c={...DEFAULT_WORKSHOP,magnetModel},snapshot=JSON.stringify(c);
  const pose={center:[0,h+.01,0] as Vec3,axis:[1,0,0] as Vec3,frame:E};
  expect(cataloguePlacement(c,pose).nominal?.ok).toBe(true);
  expect(cataloguePlacement(c,{...pose,center:[0,h-.01,0]}).cause).toBe('overlap');
  expect(JSON.stringify(c)).toBe(snapshot);
 }
});
test('fixed flat cut at z=0 agrees with the same volume and point including dead zones',()=>{
 const c={...DEFAULT_WORKSHOP,sensorId:'MK24-A-J',magnetModel:'SMCO5-5X4',sensitivity:'C'},axis:Vec3=[1,0,0];
 const cut=catalogueCut(c,axis,0,[],7,E),v=catalogueVolume(c,axis,0,[],7,E),section=sectionVolume(v,CATALOGUE_CUT_PLANE_Z,catalogueThresholds('C')!);
 for(const cell of cut.cut){const p=section.cut.find(p=>p.x===cell.x&&p.y===cell.y)!;if(cell.response===null)expect(p.response).toBeNull();else expect(p.response!).toBeCloseTo(cell.response,10);expect(p.zone).toBe(cell.zone);}
});
test('flat section never projects an out-of-plane magnet onto a false activation point',()=>{
 setLocale('fr');const frame=catalogueFrame(DEFAULT_WORKSHOP,.5);
 const view=render(<PedagogicalCut volume={null} planeZ={0} frame={frame} body={[23,5.9,13.9]}/>);
 expect(view.getByRole('img',{name:'Coupe par la face plate'})).toBeTruthy();
 expect(view.getByTestId('pedagogical-cut-body').getAttribute('data-section')).toBe('section');
 expect(view.getByTestId('cut-magnet-out-of-plane')).toBeTruthy();expect(view.queryByTestId('cut-magnet-in-plane')).toBeNull();
 view.rerender(<PedagogicalCut volume={null} planeZ={0} frame={{...frame,pose:{...frame.pose,center:[0,8,0]}}} body={[23,5.9,13.9]}/>);
 expect(view.queryByTestId('cut-magnet-out-of-plane')).toBeNull();expect(view.getByTestId('cut-magnet-in-plane')).toBeTruthy();
});
