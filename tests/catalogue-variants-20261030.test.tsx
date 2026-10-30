import {test,expect} from 'bun:test';
import React from 'react';
import {GlobalRegistrator} from '@happy-dom/global-registrator';
import {render,fireEvent} from '@testing-library/react';
import {renderToStaticMarkup} from 'react-dom/server';
import {SENSOR_CATALOG,sensorById} from '../src/lib/standex/sensor-catalog';
import {SENSOR_SPECIFICATIONS} from '../src/lib/standex/sensor-specifications';
import {DEFAULT_WORKSHOP,applySensorSelection,poseAt} from '../src/lib/standex/magnetic-workshop';
import {catalogueModel,catalogueBodyObbs,catalogueFrame,cataloguePlacement} from '../src/lib/standex/catalogue-pedagogical';
import {discoveryPatch} from '../src/lib/standex/discovery-preset';
import {slideClearance,slideGapLimit} from '../src/lib/standex/discovery-slide';
import {mk06ElectricalFits} from '../src/lib/leadmagnet/mk06-electrical';
import {evaluateCandidates} from '../src/lib/leadmagnet/candidates';
import {createDossier,type Requirement} from '../src/lib/leadmagnet/dossier';
import {pairCards} from '../src/lib/leadmagnet/pair-cards';
import {blockedBy,suggestionFilters} from '../src/lib/leadmagnet/suggestion-filters';
import {changeoverBlades} from '../src/lib/standex/changeover-contacts';
import SensorCard from '../src/components/standex/workshop/sensor-card';
import SensorCatalog from '../src/components/standex/workshop/sensor-catalog';
import {ClientPedagogicalControls} from '../src/components/standex/workshop/client-pedagogical-controls';
import {setLocale} from '../src/lib/i18n/core';
if(typeof document==='undefined')GlobalRegistrator.register({url:'http://localhost/'});
const req=(value:string):Requirement=>({key:'electrical',label:'Électrique',value,unit:null,state:'confirmed',source:'user'});
function crossings(c:typeof DEFAULT_WORKSHOP){
 let prev=false,count=0;const states:boolean[]=[];
 for(let i=0;i<=500;i++){const e=cataloguePlacement(c,catalogueFrame(c,i/1000).pose,[],undefined,true);const on=e.zone>0;if(on&&!prev)count++;prev=on;states.push(on);}
 return {count,states};
}
test('six MK06 dimensions, pitches and electrical contacts come from their own drawings/table',()=>{
 const sizes=SENSOR_CATALOG.filter(s=>s.productFamily==='MK06');expect(sizes.map(s=>s.sizeVariant)).toEqual([4,5,6,7,8,10]);
 expect(sizes.map(s=>s.body[0])).toEqual([12.06,14.3,17.24,19.78,22.32,28.5]);
 expect(sizes.map(s=>s.pinPitch)).toEqual([10.16,12.7,15.24,17.78,20.32,25.4]);
 expect(sizes.map(s=>SENSOR_SPECIFICATIONS[s.id]!.electrical[0]!.voltage)).toEqual([170,200,200,180,180,180]);
 expect(SENSOR_SPECIFICATIONS['MK06-8']!.electrical.map(o=>o.model)).toEqual(['66','90']);
});
test('MK06 recommendation evaluates size and electrical demand before family grouping',()=>{
 const d=createDossier();d.mounting={kind:'pcb_through_hole'};d.envelope={lengthMm:15,widthMm:8,heightMm:8};d.requirements=[req('190 V, 10 mA')];
 const rows=evaluateCandidates(d).filter(r=>r.id.startsWith('MK06-'));
 expect(rows.filter(r=>r.status!=='excluded').map(r=>r.id)).toEqual(['MK06-5']);
 const filters=suggestionFilters(d);expect(blockedBy(sensorById('MK06-5'),filters,filters.map(f=>f.id),d)).toEqual([]);
 expect(pairCards(['MK06-5','MK06-6','MK04'],{groupFamilies:true,keepOrder:true}).map(p=>p.sensorId)).toEqual(['MK06-5','MK04']);
 expect(mk06ElectricalFits('MK06-5',[req('24 V, 0.45 A')])).toBe(false);
 expect(mk06ElectricalFits('MK06-7',[req('12 V, 0.45 A')])).toBe(true);
 expect(mk06ElectricalFits('MK06-5',[req('230 V moteur, relais, signal 24 V')])).toBeNull();
});
test('gallery has one MK06 card and no repeated technical badges',()=>{
 setLocale('fr');const html=renderToStaticMarkup(<SensorCatalog inline selected="MK06-4" onSelect={()=>{}} onClose={()=>{}}/>);
 expect((html.match(/>MK06<\/strong>/g)??[])).toHaveLength(1);
 expect(html).not.toContain('Contacts internes symboliques');expect(html).not.toContain('Forme disponible');
 expect(sensorById('MK24-A-J').name).toBe('MK24');
});
test('size selection changes mechanical and electrical values and chooses that exact variant',()=>{
 setLocale('fr');let chosen='';const r=render(<SensorCard sensorId="MK06-4" onClose={()=>{}} onSelect={id=>chosen=id}/>);
 try{
  const selector=r.getByRole('combobox',{name:'Taille du MK06'});expect(selector.querySelectorAll('option')).toHaveLength(6);
  fireEvent.change(selector,{target:{value:'MK06-5'}});expect(r.container.textContent).toContain('14.3');
  // Selection action carries the exact size, not the original gallery entry.
  fireEvent.click(r.getByRole('button',{name:'Utiliser ce capteur'}));expect(chosen).toBe('MK06-5');
 }finally{r.unmount();}
});
test('Form C common touches NC at rest and NO when actuated; no third phantom state',()=>{
 const rest=changeoverBlades(12,.4,'open'),active=changeoverBlades(12,.4,'closed');
 expect(rest).toHaveLength(3);expect(rest[2]![1]).toEqual(rest[0]![1]);expect(active[2]![1]).toEqual(active[1]![1]);
 expect(rest[0]).toEqual(active[0]);expect(rest[1]).toEqual(active[1]);
 expect(sensorById('MK01').contactForm).toBe('C');expect(sensorById('MK04').contactForm).toBeUndefined();
});
test('MK07 nose datum and separated envelopes produce frontal closure without overlap or forced response',()=>{
 for(const geometry of ['D1','D3'] as const){
  const initial=applySensorSelection(DEFAULT_WORKSHOP,'MK07'),c={...initial,...discoveryPatch(initial,{geometry,motion:'approach'})};
  expect(catalogueBodyObbs(c)).toHaveLength(5);
  expect(catalogueModel(c).centre[0]).toBeCloseTo(geometry==='D3'?10.75:-10.75);
  expect(catalogueModel(c).method).toBe('nose-datum-estimate-2mm-cover');
  const cycle=crossings(c);expect(cycle.count).toBe(1);expect(cycle.states[0]).toBe(false);expect(cycle.states.at(-1)).toBe(true);
  expect(cataloguePlacement(c,catalogueFrame(c,.5).pose).cause).not.toBe('overlap');
  expect(cataloguePlacement(c,catalogueFrame(c,0).pose).state).not.toBe('unavailable');
 }
});
test('lateral sweep can cross three lobes close by, then only the central lobe near the distance limit',()=>{
 for(const id of ['MK07','MK06-4'])for(const geometry of ['D1','D3'] as const){
  const initial=applySensorSelection(DEFAULT_WORKSHOP,id),c={...initial,...discoveryPatch(initial,{geometry,motion:'slide'})};
  const near=crossings({...c,offset:slideClearance(c)+1});
  expect(near.count).toBe(3);expect(near.states[0]).toBe(false);expect(near.states.at(-1)).toBe(false);
  const far=crossings({...c,offset:slideClearance(c)+slideGapLimit(c)});expect(far.count).toBe(1);
 }
});
test('lateral distance slider moves the actual path without rotating the magnet',()=>{
 setLocale('fr');const initial=applySensorSelection(DEFAULT_WORKSHOP,'MK04'),c={...initial,...discoveryPatch(initial,{motion:'slide'})};let patch:Partial<typeof c>={};
 const r=render(<ClientPedagogicalControls config={c} update={p=>patch=p} onCatalog={()=>{}} onCable={()=>{}}/>);
 try{fireEvent.input(r.getByRole('slider',{name:'Écart minimal entre le capteur et l’aimant'}),{target:{value:'5'}});
  expect(patch).toEqual({offset:slideClearance(c)+5});const p=poseAt({...c,...patch},.25);expect(p.position).toEqual([0,0,slideClearance(c)+5]);expect(p.angle).toBe(c.magnetAngle);
 }finally{r.unmount();}
});
