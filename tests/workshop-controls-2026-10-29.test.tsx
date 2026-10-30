import {test,expect,afterEach} from 'bun:test';
import {GlobalRegistrator} from '@happy-dom/global-registrator';
import {render,cleanup,fireEvent,act} from '@testing-library/react';
import {DEFAULT_WORKSHOP} from '../src/lib/standex/magnetic-workshop';
import {ClientPedagogicalControls} from '../src/components/standex/workshop/client-pedagogical-controls';
import {catalogueFrame,cataloguePlacement,catalogueClasses} from '../src/lib/standex/catalogue-pedagogical';
import {defaultMagnetFor} from '../src/lib/standex/default-pairs';
import {DEMO_ASSEMBLIES} from '../src/lib/standex/machine-demos';
import {setLocale} from '../src/lib/i18n/core';
import {volumeKey,cutKey} from '../src/components/standex/workshop/pedagogical-controls';
import {DEFAULT_EXPERIMENT} from '../src/lib/detection-lab/workshop-experiment';
try{if(typeof document==='undefined')GlobalRegistrator.register({url:'http://localhost/'});}catch{}
afterEach(cleanup);
test('moving the discovery gap or offset keeps the same volume and cut, but sensitivity invalidates them',()=>{
 const c={...DEFAULT_WORKSHOP,magnetAngle:90};
 const changed={...c,lateralShift:4,end:5,start:40};
 for(const key of [volumeKey,cutKey]){
  const original=key(DEFAULT_EXPERIMENT,catalogueFrame(c,.5),null,c);
  expect(key(DEFAULT_EXPERIMENT,catalogueFrame(changed,.5),null,changed)).toBe(original);
  expect(key(DEFAULT_EXPERIMENT,catalogueFrame(changed,.5),null,{...changed,sensitivity:'E'})).not.toBe(original);
 }
});
test('MK15 documentary classes restore a usable sensitivity slider; G is not offered without a threshold',()=>{
 setLocale('fr');const patches:object[]=[];
 const config={...DEFAULT_WORKSHOP,sensorId:'MK15',magnetModel:defaultMagnetFor('MK15')};
 expect(catalogueClasses(config.sensorId,config.magnetModel,[])).toEqual(['B','C','D','E','F','G']);
 const v=render(<ClientPedagogicalControls config={config} update={p=>patches.push(p)} onCatalog={()=>{}} onCable={()=>{}}/>);
 const slider=v.getByRole('slider',{name:'Sensibilité magnétique'}) as HTMLInputElement;
 expect(slider.max).toBe('4');expect(slider.value).toBe('0');
 fireEvent.input(slider,{target:{value:'3'}});expect(patches.at(-1)).toEqual({sensitivity:'E'});
 expect(catalogueClasses('MK24',defaultMagnetFor('MK24'),[])).not.toContain('A');
});
test('one translation control and recenter are available for discovery approach only',()=>{
 setLocale('fr');const patches:object[]=[];
 const props={update:(p:object)=>patches.push(p),onCatalog:()=>{},onCable:()=>{}};
 const v=render(<ClientPedagogicalControls {...props} config={{...DEFAULT_WORKSHOP,lateralShift:4}}/>);
 fireEvent.input(v.getByRole('slider',{name:'Décalage de l’aimant'}),{target:{value:'-4'}});
 expect(patches.at(-1)).toEqual({lateralShift:-4});
 fireEvent.click(v.getByRole('button',{name:'Recentrer'}));expect(patches.at(-1)).toEqual({lateralShift:0});
 v.rerender(<ClientPedagogicalControls {...props} config={{...DEFAULT_WORKSHOP,motion:'slide'}}/>);
 expect(v.queryByRole('slider',{name:'Décalage de l’aimant'})).toBeNull();
 v.rerender(<ClientPedagogicalControls {...props} config={{...DEFAULT_WORKSHOP,machine:structuredClone(DEMO_ASSEMBLIES['builtin:wall-v1'])}}/>);
 expect(v.queryByRole('slider',{name:'Décalage de l’aimant'})).toBeNull();
});
test('offset previews nearest pose immediately; recenter restores zero and launch starts far',async()=>{
 setLocale('fr');const {default:Workshop}=await import('../src/components/standex/workshop/workshop');
 const v=render(<Workshop embedded clientPedagogical initialConfig={{...DEFAULT_WORKSHOP,sensorId:'MK15',magnetModel:defaultMagnetFor('MK15'),magnetAngle:90}} storageMode="memory" onClose={()=>{}} onSave={async()=>{}}/>);
 const offset=v.getByRole('slider',{name:'Décalage de l’aimant'}) as HTMLInputElement;
 await act(async()=>fireEvent.input(offset,{target:{value:'4'}}));
 expect(offset.value).toBe('4');
 expect((v.getByRole('slider',{name:'Position dans le cycle'}) as HTMLInputElement).value).toBe('50');
 await act(async()=>fireEvent.click(v.getByRole('button',{name:'Recentrer'})));
 expect(offset.value).toBe('0');
 expect((v.getByRole('slider',{name:'Position dans le cycle'}) as HTMLInputElement).value).toBe('50');
 await act(async()=>fireEvent.click(v.getByRole('button',{name:'Lancer le mouvement',exact:true})));
 expect(Number((v.getByRole('slider',{name:'Position dans le cycle'}) as HTMLInputElement).value)).toBeLessThan(10);
});
test('MK15 centered quarter-turn stays OFF; signed offsets reach a lobe without rotating or colliding',()=>{
 for(const geometry of ['D1','D3'] as const){
  const c={...DEFAULT_WORKSHOP,sensorId:'MK15',magnetModel:defaultMagnetFor('MK15'),geometry,magnetAngle:90,end:.5};
  expect(cataloguePlacement(c,catalogueFrame(c,.5).pose).zone).toBe(0);
  for(const lateralShift of [-4,4]){
   const moved={...c,lateralShift};
   const p=cataloguePlacement(moved,catalogueFrame(moved,.5).pose);
   expect(p.state).toBe('favorable');expect(p.zone).toBe(2);
   for(const time of [0,.25,.5,.75,1]){
    const before=catalogueFrame(c,time).pose,after=catalogueFrame(moved,time).pose;
    expect(after.axis).toEqual(before.axis);
    expect(Math.hypot(...after.center.map((v,i)=>v-before.center[i]!))).toBeCloseTo(4,8);
    expect(cataloguePlacement(moved,after).nominal?.ok).toBe(true);
   }
  }
 }
});
test('sensitivity slider keeps published order even when reopened in E; cable requires an imported model',()=>{
 setLocale('fr');const patches:object[]=[];
 const props={update:(p:object)=>patches.push(p),onCatalog:()=>{},onCable:()=>{}};
 const v=render(<ClientPedagogicalControls {...props} config={{...DEFAULT_WORKSHOP,sensitivity:'E'}}/>);
 const slider=v.getByRole('slider',{name:'Sensibilité magnétique'});
 expect((slider as HTMLInputElement).value).toBe('3');
 fireEvent.input(slider,{target:{value:'0'}});expect(patches.at(-1)).toEqual({sensitivity:'B'});
 expect(v.getByText('Plus sensible · détecte de plus loin')).toBeTruthy();
 expect(v.queryByRole('button',{name:'Pointer le câble dans la 3D'})).toBeNull();
 v.rerender(<ClientPedagogicalControls {...props} config={{...DEFAULT_WORKSHOP,machine:structuredClone(DEMO_ASSEMBLIES['builtin:wall-v1'])}}/>);
 expect((v.getByRole('button',{name:'Pointer le câble dans la 3D'}) as HTMLButtonElement).disabled).toBe(false);
});
test('minimum-gap input shows nearest real pose; launch resets to far pose without changing the gap',async()=>{
 setLocale('fr');const {default:Workshop}=await import('../src/components/standex/workshop/workshop');
 const v=render(<Workshop embedded clientPedagogical initialConfig={DEFAULT_WORKSHOP} storageMode="memory" onClose={()=>{}} onSave={async()=>{}}/>);
 const gap=v.getByRole('slider',{name:'Écart minimal entre le capteur et l’aimant'});
 await act(async()=>fireEvent.input(gap,{target:{value:'4'}}));
 expect((v.getByRole('slider',{name:'Position dans le cycle'}) as HTMLInputElement).value).toBe('50');
 await act(async()=>fireEvent.input(gap,{target:{value:'8'}}));
 expect((gap as HTMLInputElement).value).toBe('8');
 expect((v.getByRole('slider',{name:'Position dans le cycle'}) as HTMLInputElement).value).toBe('50');
 await act(async()=>fireEvent.click(v.getByRole('button',{name:'Lancer le mouvement',exact:true})));
 expect(Number((v.getByRole('slider',{name:'Position dans le cycle'}) as HTMLInputElement).value)).toBeLessThan(10);
 expect((gap as HTMLInputElement).value).toBe('8');
});
test('in-line approach with quarter turn is OFF on the central corridor despite body overlapping both lobes',()=>{
 for(const end of [.5,3.3,8]){
  const c={...DEFAULT_WORKSHOP,geometry:'D3' as const,motion:'approach' as const,magnetAngle:90,end};
  const f=catalogueFrame(c,.5),p=cataloguePlacement(c,f.pose);
  expect(p.nominal?.ok).toBe(true);if(!p.nominal?.ok)throw Error('invalid fixture');
  // In this axial/perpendicular symmetry each blade's axial mean is near zero,
  // rather than the opposed nonzero means of the transverse centred example.
  expect(Math.abs(p.nominal.m1)).toBeLessThan(1e-10);
  expect(Math.abs(p.nominal.m2)).toBeLessThan(1e-10);
  expect(p.nominal.response).toBeLessThan(1e-10);expect(p.zone).toBe(0);
 }
});
