import {test,expect,afterEach} from 'bun:test';
import {GlobalRegistrator} from '@happy-dom/global-registrator';
import {render,cleanup,fireEvent,act} from '@testing-library/react';
import {DEFAULT_WORKSHOP} from '../src/lib/standex/magnetic-workshop';
import {ClientPedagogicalControls} from '../src/components/standex/workshop/client-pedagogical-controls';
import {catalogueFrame,cataloguePlacement} from '../src/lib/standex/catalogue-pedagogical';
import {DEMO_ASSEMBLIES} from '../src/lib/standex/machine-demos';
import {setLocale} from '../src/lib/i18n/core';
try{if(typeof document==='undefined')GlobalRegistrator.register({url:'http://localhost/'});}catch{}
afterEach(cleanup);
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
