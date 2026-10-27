import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { describe, expect, test, mock } from 'bun:test';
import React from 'react';
import { render, fireEvent, act, waitFor } from '@testing-library/react';
import { DEFAULT_WORKSHOP } from '../src/lib/standex/magnetic-workshop';
import { CLIENT_LIMITS, clientCoupleAdapter, clientPedagogicalResult, explorationSettings } from '../src/lib/standex/client-pedagogical';
import { evaluatePlacement } from '../src/lib/detection-lab/workshop-experiment';
import { pedagogicalFrame, pedagogicalPreset } from '../src/lib/standex/pedagogical-poses';
if(typeof document==='undefined')GlobalRegistrator.register({url:'http://localhost/'});
mock.module('@radix-ui/react-use-layout-effect',()=>({useLayoutEffect:React.useLayoutEffect}));

describe('client boundary: no catalogue alias or fictitious qualification',()=>{
  for(const magnetModel of ['M04','M13','4003004003','SMCO5-5X4','N45-4X19'])test(magnetModel+' retains exact identity, housing unavailable',()=>{
    const c={...DEFAULT_WORKSHOP,magnetModel};const a=clientCoupleAdapter(c);
    expect(a.supported).toBe(false);expect(a.settings.magnetId).toBe(magnetModel);
    expect(a.reasons).toContain(CLIENT_LIMITS.housing);
    expect(evaluatePlacement(a.settings,{center:[8,16,0],axis:[0,1,0]}).state).toBe('unavailable');
    expect(clientPedagogicalResult(c).magnetId).toBe(magnetModel);
    expect(clientPedagogicalResult(c).qualified).toBe(false);
  });
  test('1A contact is not AT; exploration does not mutate it',()=>{
    const c={...DEFAULT_WORKSHOP,sensitivity:'1A'};
    expect(clientCoupleAdapter(c).settings.className).toBe('1A');
    expect(clientCoupleAdapter(c).reasons).toContain(CLIENT_LIMITS.class);
    explorationSettings(c);expect(c.sensitivity).toBe('1A');
  });
  for(const magnetModel of ['SMCO5-5X4','N45-4X19'])for(const sensitivity of ['A','B','C','D','E','F','G'])test(magnetModel+' explicit Form66 class '+sensitivity,()=>{
    const c={...DEFAULT_WORKSHOP,magnetModel,sensitivity};const settings=explorationSettings(c);
    expect(settings.magnetId).toBe(magnetModel);expect(settings.className).toBe(sensitivity);
    const p=evaluatePlacement(settings,{center:[8,magnetModel==='N45-4X19'?16:6,0],axis:[0,1,0]});
    expect(p.state==='unavailable').toBe(sensitivity==='A'||sensitivity==='G');
    if(sensitivity==='A')expect(p.cause).toBe('partial');if(sensitivity==='G')expect(p.cause).toBe('missing');
  });
  test('centred/offset same depth and instant, N/S inversion preserves state',()=>{
    for(const id of ['SMCO5-5X4','N45-4X19']){
      const settings=explorationSettings({...DEFAULT_WORKSHOP,magnetModel:id,sensitivity:'C'});
      const centred={...DEFAULT_WORKSHOP,...pedagogicalPreset('centred',id)?.config};
      const offset={...centred,lateralShift:8};
      expect(evaluatePlacement(settings,pedagogicalFrame(centred,.5).pose).state).toBe('unfavorable');
      expect(evaluatePlacement(settings,pedagogicalFrame(offset,.5).pose).state).toBe('favorable');
      expect(evaluatePlacement(settings,pedagogicalFrame({...offset,polarity:-1},.5).pose).state).toBe('favorable');
      expect(offset.end).toBe(centred.end);
    }
  });
});
describe('real mounted client workshop',()=>{
  test('explicit exploration never writes GENERIC into draft; result belongs to original product/cable',async()=>{
    const {setLocale}=await import('../src/lib/i18n/core');setLocale('fr');
    const {default:Workshop}=await import('../src/components/standex/workshop/workshop');
    const config={...DEFAULT_WORKSHOP,cableLengthMm:500};const drafts:typeof config[]=[];const results:ReturnType<typeof clientPedagogicalResult>[]=[];
    const view=render(<Workshop clientPedagogical embedded initialConfig={config} storageMode="memory" onClose={()=>{}} onSave={async()=>{}} onDraftChange={c=>drafts.push(c as typeof config)} onClientPedagogicalResult={r=>results.push(r)}/>);
    await waitFor(()=>expect(view.getByTestId('client-product-legend').textContent).toContain('MK04 + M04'));
    expect(view.container.querySelector('.mw-contact-circuit')).toBeNull();
    await act(async()=>fireEvent.click(view.getByRole('button',{name:'Explorer Form66 sans modifier mon produit'})));
    await waitFor(()=>expect(view.getByTestId('client-exploration')).toBeTruthy());
    await act(async()=>fireEvent.change(view.getByRole('combobox',{name:'Aimant pilote vérifié'}),{target:{value:'N45-4X19'}}));
    await act(async()=>fireEvent.click(view.getByRole('button',{name:'Valider ce choix et voir le résultat'})));
    expect(results).toHaveLength(1);expect(results[0]?.sensorId).toBe('MK04');expect(results[0]?.magnetId).toBe('M04');
    expect(results[0]?.state).toBe('unavailable');
    expect(JSON.parse(results[0]?.configKey??'{}').cableLengthMm).toBe(500);
    expect(drafts.every(c=>c.sensorId==='MK04'&&c.magnetModel==='M04'&&c.cableLengthMm===500)).toBe(true);
    await waitFor(()=>expect(view.getByTestId('client-product-legend').textContent).toContain('MK04 + M04'));
    view.unmount();
  });
  test('return and reopen preserve product pose and cable; changed pilot/class produce a new non-qualifying result',async()=>{
    const {setLocale}=await import('../src/lib/i18n/core');setLocale('fr');
    const {default:Workshop}=await import('../src/components/standex/workshop/workshop');
    const original={...DEFAULT_WORKSHOP,cableLengthMm:750,lateralShift:3,magnetAngle:25};
    let draft=original;
    const results:ReturnType<typeof clientPedagogicalResult>[]=[];
    const mount=()=>render(<Workshop clientPedagogical embedded initialConfig={draft} storageMode="memory" onClose={()=>{}} onSave={async()=>{}} onDraftChange={c=>{draft=c as typeof original;}} onClientPedagogicalResult={r=>results.push(r)}/>);
    let view=mount();
    await act(async()=>fireEvent.click(view.getByRole('button',{name:'Explorer Form66 sans modifier mon produit'})));
    await act(async()=>fireEvent.change(view.getByRole('combobox',{name:'Aimant pilote vérifié'}),{target:{value:'N45-4X19'}}));
    await act(async()=>fireEvent.click(view.getByRole('button',{name:'Revenir au couple de mon dossier'})));
    await waitFor(()=>expect(view.getByTestId('client-product-legend').textContent).toContain('MK04 + M04'));
    expect(draft.sensorId).toBe('MK04');expect(draft.magnetModel).toBe('M04');expect(draft.cableLengthMm).toBe(750);
    expect(draft.lateralShift).toBe(3);expect(draft.magnetAngle).toBe(25);expect(results).toHaveLength(0);
    view.unmount();view=mount();
    await waitFor(()=>expect(view.getByTestId('client-product-legend').textContent).toContain('MK04 + M04'));
    await act(async()=>fireEvent.click(view.getByRole('button',{name:'Valider ce choix et voir le résultat'})));
    const first=results[0];expect(first?.state).toBe('unavailable');expect(first?.qualified).toBe(false);
    await act(async()=>fireEvent.change(view.getByRole('combobox',{name:'Aimant',exact:true}),{target:{value:'N45-4X19'}}));
    await act(async()=>fireEvent.click(view.getByRole('button',{name:'Valider ce choix et voir le résultat'})));
    expect(results[1]?.magnetId).toBe('N45-4X19');expect(results[1]?.configKey).not.toBe(first?.configKey);
    view.unmount();draft={...draft,sensitivity:'G'};view=mount();
    await act(async()=>fireEvent.click(view.getByRole('button',{name:'Valider ce choix et voir le résultat'})));
    expect(results[2]?.sensitivity).toBe('G');expect(results[2]?.reasons).toContain(CLIENT_LIMITS.g);
    expect(results.every(r=>r.state==='unavailable'&&!r.qualified)).toBe(true);
    expect(draft.sensorId).toBe('MK04');expect(draft.cableLengthMm).toBe(750);
    view.unmount();
  });
});