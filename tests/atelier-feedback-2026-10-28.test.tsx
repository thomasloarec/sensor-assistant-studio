import { test, expect, afterEach } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { render,cleanup,fireEvent } from '@testing-library/react';
import { DEFAULT_WORKSHOP, parseWorkshopConfig, pairDemonstration, type Vec3 } from '@/lib/standex/magnetic-workshop';
import { catalogueModel,catalogueFrame,cataloguePlacement,catalogueEvaluate,magnetBodyFrame } from '@/lib/standex/catalogue-pedagogical';
import { nominalScenario,classThresholds } from '@/lib/detection-lab/workshop-experiment';
import { centralLobeSample } from '@/lib/standex/pedagogical-shape';
import { illustrativeContact } from '@/lib/standex/pedagogical-contact';
import { discoveryPatch } from '@/lib/standex/discovery-preset';
import { ClientPedagogicalControls } from '@/components/standex/workshop/client-pedagogical-controls';
import ContactCircuit from '@/components/standex/workshop/contact-circuit';
import { setLocale } from '@/lib/i18n/core';
try{if(typeof document==='undefined')GlobalRegistrator.register({url:'http://localhost/'});}catch{}
afterEach(cleanup);

test('D1 and D3 calibrated axes and perpendicular D4/D5 responses remain identical',()=>{
 for(const magnetModel of ['SMCO5-5X4','N45-4X19','M04'])for(const sensitivity of ['B','C','D','E','F']){
  const c={...DEFAULT_WORKSHOP,magnetModel,sensitivity},m=catalogueModel(c),f=magnetBodyFrame(c,0);
  for(const [center,axis] of [ [[0,0,18],[1,0,0]], [[29,0,0],[1,0,0]], [[9,0,16],[0,0,1]], [[20,0,2],[0,1,0]] ] as [Vec3,Vec3][]){
   const raw=catalogueEvaluate(m,{center,axis},nominalScenario(),f);
   const e=cataloguePlacement(c,{center,axis,frame:f},[],m,true);
   if(e.nominal?.ok&&raw.ok)expect(e.nominal.response).toBe(raw.response);
  }
 }
});
test('central lobe has a wider usable passage without extending the D1 maximum',()=>{
 const c=DEFAULT_WORKSHOP,m=catalogueModel(c),f=magnetBodyFrame(c,0),th=classThresholds('B')!;
 const width=(shaped:boolean,z:number)=>{let half=0;for(let x=0;x<=14;x+=.1){const pose={center:[x,0,z] as Vec3,axis:[1,0,0] as Vec3,frame:f};const r=shaped?cataloguePlacement(c,pose,[],m,true).nominal:catalogueEvaluate(m,pose,nominalScenario(),f);if(r?.ok&&r.response>=th.low!)half=x;else break;}return half*2;};
 expect(width(true,15.9)).toBeGreaterThan(12);
 expect(width(true,15.9)).toBeLessThan(20);
 expect(width(true,15.9)).toBeGreaterThan(width(false,15.9)*1.4);
 for(let z=14;z<40;z+=.2){const pose={center:[0,0,z] as Vec3,axis:[1,0,0] as Vec3,frame:f};expect(cataloguePlacement(c,pose,[],m,true).nominal).toEqual(catalogueEvaluate(m,pose,nominalScenario(),f));}
});
test('shape map is continuous monotone, polarity-invariant; perpendicular dead axis unchanged',()=>{
 expect(centralLobeSample([8,18,0],[1,0,0],14)).toEqual([8,18,0]);
 expect(centralLobeSample([8,0,18],[1,0,0],14)[0]).toBeLessThan(3);
 let last=-Infinity;for(let x=-20;x<=20;x+=.05){const center:[number,number,number]=[x,0,16],p=centralLobeSample(center,[1,0,0],14);expect(p[0]).toBeGreaterThan(last);last=p[0];expect(centralLobeSample(center,[-1,0,0],14)).toEqual(p);expect(centralLobeSample(center,[0,0,1],14)).toEqual(center);}
 const c={...DEFAULT_WORKSHOP,magnetAngle:90};
 for(let gap=.5;gap<=12;gap+=.5)expect(cataloguePlacement(c,catalogueFrame({...c,end:gap},.5).pose).zone).toBe(0);
});
test('MK04/M04 default transverse and axial demonstrations close and reopen with no overlap',()=>{
 for(const geometry of ['D1','D3'] as const){const c={...DEFAULT_WORKSHOP,...discoveryPatch(DEFAULT_WORKSHOP,{geometry,motion:'approach'})};
  expect(parseWorkshopConfig(c)).not.toBeNull();
  const states=new Set<string|null>();
  for(let i=0;i<=128;i++){const e=cataloguePlacement(c,catalogueFrame(c,i/128).pose);expect(e.cause).not.toBe('overlap');expect(illustrativeContact(e,c.sensitivity)).toBe(e.zone>0?'closed':'open');states.add(illustrativeContact(e,c.sensitivity));}
  expect(states.has('open')).toBe(true);expect(states.has('closed')).toBe(true);expect(states.has(null)).toBe(false);
 }
 expect(pairDemonstration(DEFAULT_WORKSHOP,'MK04','M04').end).toBe(.5);
});
test('yellow band produces binary illustrative switching, not a third contact state',()=>{
 const c=DEFAULT_WORKSHOP,th=classThresholds('B')!,e=cataloguePlacement(c,catalogueFrame(c,.5).pose);
 for(const [response,expected] of [[th.low!-.01,'open'],[th.low!+.01,'closed'],[th.high-.01,'closed']] as const){expect(illustrativeContact({...e,state:'variable',zone:1,nominal:{ok:true,response,m1:response,m2:response}},'B')).toBe(expected);}
 expect(illustrativeContact({...e,state:'unavailable',nominal:null},'B')).toBeNull();
});
test('sensitivity is visible without opening details, clearance remains editable',()=>{
 setLocale('fr');const patches:unknown[]=[];const r=render(<ClientPedagogicalControls config={DEFAULT_WORKSHOP} update={p=>patches.push(p)} onCatalog={()=>{}} onCable={()=>{}}/>);
 const select=r.getByLabelText('Classe de sensibilité');expect(select.closest('details')).toBeNull();
 fireEvent.change(select,{target:{value:'C'}});expect(patches).toContainEqual({sensitivity:'C'});
 fireEvent.input(r.getByRole('slider',{name:'Écart minimal entre le capteur et l’aimant'}),{target:{value:'1'}});expect(patches).toContainEqual({end:1});cleanup();
});
test('unavailable circuit stays visible without asserting open or closed or showing question mark',()=>{
 setLocale('fr');const r=render(<ContactCircuit contact="open" unavailable/>);expect(r.getByRole('img').getAttribute('data-contact')).toBe('unavailable');expect(r.queryByText('?')).toBeNull();expect(r.queryByText('Contact ouvert')).toBeNull();cleanup();
});
test('legacy short pivot moves without collision and uses the shared activation response',()=>{
 const c={...DEFAULT_WORKSHOP,...discoveryPatch(DEFAULT_WORKSHOP,{motion:'pivot'})};
 expect(parseWorkshopConfig(c)).not.toBeNull();
 expect(catalogueFrame(c,0).world.center).not.toEqual(catalogueFrame(c,.5).world.center);
 const states=new Set();for(let i=0;i<=128;i++){const e=cataloguePlacement(c,catalogueFrame(c,i/128).pose);expect(e.cause).not.toBe('overlap');expect(illustrativeContact(e,c.sensitivity)).toBe(e.zone>0?'closed':'open');states.add(illustrativeContact(e,c.sensitivity));}
 expect(states.has(null)).toBe(false);
});
