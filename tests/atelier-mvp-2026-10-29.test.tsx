import {test,expect,afterEach} from 'bun:test';
import {GlobalRegistrator} from '@happy-dom/global-registrator';
import {render,cleanup} from '@testing-library/react';
import {DEFAULT_WORKSHOP} from '@/lib/standex/magnetic-workshop';
import {catalogueFrame,cataloguePlacement,catalogueModel} from '@/lib/standex/catalogue-pedagogical';
import {illustrativeContact} from '@/lib/standex/pedagogical-contact';
import {clientDiscoveryConfig,discoveryPatch} from '@/lib/standex/discovery-preset';
import {renderedMagnetHousingYawDeg} from '@/lib/standex/housing-pose';
import {rotate} from '@/lib/standex/machine-assembly';
import {DEMO_ASSEMBLIES} from '@/lib/standex/machine-demos';
import {ClientPedagogicalControls} from '@/components/standex/workshop/client-pedagogical-controls';
import {setLocale} from '@/lib/i18n/core';
try{if(typeof document==='undefined')GlobalRegistrator.register({url:'http://localhost/'});}catch{}
afterEach(cleanup);

test('MVP discovery has two motions, no extra demonstration, gap after orientation',()=>{
 setLocale('fr');const r=render(<ClientPedagogicalControls config={DEFAULT_WORKSHOP} update={()=>{}} onCatalog={()=>{}} onCable={()=>{}}/>);
 expect(r.queryByRole('button',{name:'Pivot',exact:true})).toBeNull();
 expect(r.queryByRole('button',{name:'Comprendre les zones de détection'})).toBeNull();
 for(const label of ['Sources et limites','Inverser N / S','Température','Acier ou autre matière ferromagnétique proche'])expect(r.queryByText(label)).toBeNull();
 const turn=r.getByRole('button',{name:'Tourner de 90°'}),gap=r.getByRole('slider',{name:'Écart minimal entre le capteur et l’aimant'});
 expect(turn.compareDocumentPosition(gap)&4).toBe(4);
 expect(r.getByRole('button',{name:'Passage latéral'})).toBeTruthy();
});
test('obsolete discovery pivot migrates, imported pivot and all transforms are preserved',()=>{
 const c={...DEFAULT_WORKSHOP,motion:'pivot' as const};expect(clientDiscoveryConfig(c).motion).toBe('approach');
 const mounted={...c,machine:structuredClone(DEMO_ASSEMBLIES['builtin:wall-v1']!)};
 expect(clientDiscoveryConfig(mounted)).toBe(mounted);expect(c.motion).toBe('pivot');
});
test('lamp matches nominal yellow and green membership for all eight demonstration combinations',()=>{
 for(const geometry of ['D1','D3'] as const)for(const magnetAngle of [0,90])for(const motion of ['approach','slide'] as const){
  const base={...DEFAULT_WORKSHOP,geometry,magnetAngle};const c={...base,...discoveryPatch(base,{motion})},m=catalogueModel(c);
  for(let i=0;i<=256;i++){const e=cataloguePlacement(c,catalogueFrame(c,i/256).pose,[],m,true);
   expect(illustrativeContact(e,'B')).toBe(e.nominal===null?null:e.zone>0?'closed':'open');
  }
 }
});
test('D3 at 3 mm closes inside A; perpendicular lateral pass produces two separate closure windows',()=>{
 const axial={...DEFAULT_WORKSHOP,geometry:'D3' as const,end:3};
 const e=cataloguePlacement(axial,catalogueFrame(axial,.5).pose);expect(e.zone).toBeGreaterThan(0);expect(illustrativeContact(e,'B')).toBe('closed');
 for(const geometry of ['D1','D3'] as const){const base={...DEFAULT_WORKSHOP,geometry,magnetAngle:90};const c={...base,...discoveryPatch(base,{motion:'slide'})};let previous=false,closures=0;
  for(let i=0;i<=256;i++){const hit=illustrativeContact(cataloguePlacement(c,catalogueFrame(c,i/512).pose),'B')==='closed';if(hit&&!previous)closures++;previous=hit;}
  expect(closures).toBe(2);
 }
});
test('near centred perpendicular approach stays open and overlap cannot close the lamp',()=>{
 const c={...DEFAULT_WORKSHOP,magnetAngle:90};const e=cataloguePlacement(c,catalogueFrame(c,.5).pose);expect(illustrativeContact(e,'B')).toBe('open');
 const overlap=cataloguePlacement(c,{center:[0,0,0],axis:[1,0,0]});expect(illustrativeContact(overlap,'B')).toBeNull();
});
test('D3 quarter-turn puts mounting holes outward without affecting lateral or imported mounting',()=>{
 const yaw=renderedMagnetHousingYawDeg('MK04','D3',true,false,90,'approach');
 expect(rotate([0,0,3.05],[0,-(90+yaw),0])[0]).toBeGreaterThan(0);
 expect(renderedMagnetHousingYawDeg('MK04','D3',true,false,90,'slide')).toBe(0);
 expect(renderedMagnetHousingYawDeg('MK04','D3',true,true,90,'approach')).toBe(0);
});


test('raw A central lobe narrows toward its rounded summit above the housing',()=>{
 const c=DEFAULT_WORKSHOP,m=catalogueModel(c);
 const width=(z:number)=>{let w=0;for(let x=0;x<14;x+=.1){const e=cataloguePlacement(c,{center:[x,0,z],axis:[1,0,0]},[],m,true);if(e.zone>0)w=x;}return w;};
 expect(width(14.2)).toBeGreaterThan(7);
 expect(width(18)).toBeLessThan(width(14.2));
 expect(width(22)).toBe(0);
});
