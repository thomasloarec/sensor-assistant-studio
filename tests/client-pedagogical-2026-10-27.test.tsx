import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { describe, expect, test, mock } from 'bun:test';
import React from 'react';
import {createDossier} from '../src/lib/leadmagnet/dossier';
import {buildDossierExport,parseDossierExport} from '../src/lib/leadmagnet/dossier-io';
import {currentClientTrace,recordClientTrace} from '../src/lib/standex/client-pedagogical';
import {projectReportSections} from '../src/lib/leadmagnet/project-report';
import {ResultView} from '../src/components/leadmagnet/result-view';
import {renderToStaticMarkup} from 'react-dom/server';
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
    expect(a.supported).toBe(true);expect(a.settings.magnetId).toBe(magnetModel);
    expect(a.model.magnetId).toBe(magnetModel);
    expect(evaluatePlacement(a.settings,{center:[8,16,0],axis:[0,1,0]}).state).toBe('unavailable');
    expect(clientPedagogicalResult(c).magnetId).toBe(magnetModel);
    expect(clientPedagogicalResult(c).qualified).toBe(false);
  });
  test('1A contact is not AT; exploration does not mutate it',()=>{
    const c={...DEFAULT_WORKSHOP,sensitivity:'1A'};
    expect(clientCoupleAdapter(c).settings.className).toBe('1A');
    expect(clientCoupleAdapter(c).model.className).toBe('C');
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
  test('PCB MK01 arm cannot expose cable routing while wired MK04 retains working callbacks',async()=>{
    const {setLocale}=await import('../src/lib/i18n/core');setLocale('fr');
    const {default:Workshop}=await import('../src/components/standex/workshop/workshop');
    const {DEMO_ASSEMBLIES}=await import('../src/lib/standex/machine-demos');
    const machine=structuredClone(DEMO_ASSEMBLIES['builtin:arm-v1']);if(!machine)throw Error('fixture missing');
    for(const sensorId of ['MK01','MK04']){
      let calls=0;
      const view=render(<Workshop clientPedagogical embedded initialCableOpen initialConfig={{...DEFAULT_WORKSHOP,sensorId,machine}} storageMode="memory" onClose={()=>{}} onSave={async()=>{}} cableRouting={{slot:'sensor',points:[],targetLabel:'Sortie capteur',lengthLabel:'Non choisie',setSlot:()=>{calls++;},onPick:()=>{calls++;},onUndo:()=>{calls++;},onReset:()=>{calls++;}}}/>);
      if(sensorId==='MK01'){
        expect(view.queryByRole('button',{name:'Pointer le câble dans la 3D',exact:true})).toBeNull();
        expect(view.queryByTestId('cable-routing-panel')).toBeNull();expect(calls).toBe(0);
      }else{
        await act(async()=>fireEvent.click(view.getByRole('button',{name:'Pointer le câble dans la 3D',exact:true})));
        expect(view.getByTestId('cable-routing-panel')).toBeTruthy();
        await act(async()=>fireEvent.click(view.getByTestId('cable-slot-waypoint')));
        await act(async()=>fireEvent.click(view.getByRole('button',{name:'Effacer le trajet',exact:true})));
        expect(calls).toBe(2);
      }
      view.unmount();
    }
  });
  test('merged simple position controls preserve D3 geometry and independent motion/environment edits',async()=>{
    const {setLocale}=await import('../src/lib/i18n/core');setLocale('fr');
    const {default:Workshop}=await import('../src/components/standex/workshop/workshop');
    let draft={...DEFAULT_WORKSHOP};
    const view=render(<Workshop clientPedagogical embedded initialConfig={draft} storageMode="memory" onClose={()=>{}} onSave={async()=>{}} onDraftChange={c=>{draft=c;}}/>);
    await act(async()=>fireEvent.click(view.getByRole('button',{name:'Dans l’alignement',exact:true})));
    expect(draft.geometry).toBe('D3');
    await act(async()=>fireEvent.change(view.getByRole('combobox',{name:'Trajectoire'}),{target:{value:'slide'}}));
    await act(async()=>fireEvent.change(view.getByRole('combobox',{name:'Température'}),{target:{value:'other'}}));
    expect(draft.geometry).toBe('D3');expect(draft.motion).toBe('slide');expect(draft.temperature).toBe('other');
    view.unmount();
  });
  test('old expected cannot reappear after conservative dossier export/reprise',()=>{
    const old={...createDossier(),workshop:{...DEFAULT_WORKSHOP},testedPairs:[{sensorId:'MK04',magnetId:'M04',approach:'D1',sensitivity:'B',verdict:'expected' as const,pullInMm:15,dropOutMm:18,travelStartMm:30,travelEndMm:5,mainMessage:null,limits:[],at:'2026-10-27T15:11:00Z'}]};
    const next=recordClientTrace(old,DEFAULT_WORKSHOP);const exported=buildDossierExport(next);const resumed=parseDossierExport(JSON.parse(JSON.stringify(exported)));
    expect(resumed.ok).toBe(true);if(!resumed.ok)return;
    expect(resumed.dossier.testedPairs?.some(p=>p.verdict==='expected')).toBe(false);
    const trace=currentClientTrace(resumed.dossier);expect(trace?.qualified).toBe(false);expect(trace?.state).toBe('unavailable');
    expect(currentClientTrace({...resumed.dossier,id:'another'})).toBeNull();
    expect(currentClientTrace({...resumed.dossier,workshop:{...DEFAULT_WORKSHOP,lateralShift:8}})).toBeNull();
    const html=renderToStaticMarkup(<ResultView pedagogicalResult={trace} pair={old.testedPairs[0]??null} tested={old.testedPairs} proposals={[]} detectionGoal={null} onSeePairs={()=>{}} onConfirmWithStandex={()=>{}} onRequestTrial={()=>{}} onReplaceMagnet={()=>{}} onTestPair={()=>{}}/>);
    expect(html).toContain('client-pedagogical-result');expect(html).not.toContain('data-verdict="expected"');
    expect(JSON.stringify(projectReportSections(resumed.dossier))).not.toContain('Détection prévue');
    expect(JSON.stringify(exported)).not.toContain('"verdict":"expected"');
  });
  test('explicit exploration never writes GENERIC into draft; result belongs to original product/cable',async()=>{
    const {setLocale}=await import('../src/lib/i18n/core');setLocale('fr');
    const {default:Workshop}=await import('../src/components/standex/workshop/workshop');
    const config={...DEFAULT_WORKSHOP,cableLengthMm:500};const drafts:typeof config[]=[];const results:ReturnType<typeof clientPedagogicalResult>[]=[];
    const view=render(<Workshop clientPedagogical embedded initialConfig={config} storageMode="memory" onClose={()=>{}} onSave={async()=>{}} onDraftChange={c=>drafts.push(c as typeof config)} onClientPedagogicalResult={r=>results.push(r)}/>);
    await waitFor(()=>expect(view.getByTestId('client-product-legend').textContent).toContain('MK04 + M04'));
    expect(view.container.querySelector('.mw-contact-circuit')).toBeNull();
    await act(async()=>fireEvent.click(view.getByRole('button',{name:'Comprendre les zones de détection'})));
    await waitFor(()=>expect(view.getByTestId('client-exploration')).toBeTruthy());
    expect(view.getByTestId('client-exploration-context').parentElement).toBe(view.getByTestId('pedagogical-verdict').parentElement);
    await act(async()=>fireEvent.change(view.getByRole('combobox',{name:'Aimant pilote vérifié'}),{target:{value:'N45-4X19'}}));
    await act(async()=>fireEvent.click(view.getByRole('button',{name:'Valider ce choix et voir le résultat'})));
    expect(results).toHaveLength(1);expect(results[0]?.sensorId).toBe('MK04');expect(results[0]?.magnetId).toBe('M04');
    expect(results[0]?.state).toBe('unavailable');
    expect(JSON.parse(results[0]?.configKey??'{}').cableLengthMm).toBe(500);
    expect(drafts.every(c=>c.sensorId==='MK04'&&c.magnetModel==='M04'&&c.cableLengthMm===500)).toBe(true);
    await waitFor(()=>expect(view.getByTestId('client-product-legend').textContent).toContain('MK04 + M04'));
    view.unmount();
  });
  test('entering exploration from cable tool disconnects callbacks and restores product mounting',async()=>{
    const {default:Workshop}=await import('../src/components/standex/workshop/workshop');
    const {DEMO_ASSEMBLIES}=await import('../src/lib/standex/machine-demos');
    const machine=structuredClone(DEMO_ASSEMBLIES['builtin:wall-v1']);if(!machine)throw Error('fixture missing');
    const config={...DEFAULT_WORKSHOP,machine,cableLengthMm:500};let draft=config;let calls=0;
    const states:string[]=[];
    const view=render(<Workshop clientPedagogical embedded initialConfig={config} storageMode="memory" onClose={()=>{}} onSave={async()=>{}} onSaveState={s=>states.push(s)} onDraftChange={c=>{draft=c as typeof config;}} cableRouting={{slot:'sensor',points:[],targetLabel:'Sortie capteur',lengthLabel:'Non choisie',setSlot:()=>{calls++;},onPick:()=>{calls++;},onUndo:()=>{calls++;},onReset:()=>{calls++;}}}/>);
    await act(async()=>fireEvent.click(view.getByRole('button',{name:'Pointer le câble dans la 3D',exact:true})));
    expect(view.getByTestId('cable-routing-panel')).toBeTruthy();const before=states.length;
    await act(async()=>fireEvent.click(view.getByRole('button',{name:'Comprendre les zones de détection'})));
    expect(view.queryByTestId('cable-routing-panel')).toBeNull();
    await act(async()=>fireEvent.change(view.getByRole('combobox',{name:'Aimant pilote vérifié'}),{target:{value:'N45-4X19'}}));
    expect(states.length).toBe(before);expect(calls).toBe(0);
    await act(async()=>fireEvent.click(view.getByRole('button',{name:'Revenir au couple de mon dossier'})));
    expect(view.getByTestId('cable-routing-panel')).toBeTruthy();expect(draft.machine).toEqual(machine);expect(draft.cableLengthMm).toBe(500);
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
    await act(async()=>fireEvent.click(view.getByRole('button',{name:'Comprendre les zones de détection'})));
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
    view.unmount();draft={...draft,sensitivity:'C'};view=mount();
    await act(async()=>fireEvent.click(view.getByRole('button',{name:'Valider ce choix et voir le résultat'})));
    expect(results[2]?.sensitivity).toBe('C');expect(results[2]?.configKey).not.toBe(results[1]?.configKey);
    expect(results.every(r=>r.state==='unavailable'&&!r.qualified)).toBe(true);
    expect(draft.sensorId).toBe('MK04');expect(draft.cableLengthMm).toBe(750);
    view.unmount();
  });
});