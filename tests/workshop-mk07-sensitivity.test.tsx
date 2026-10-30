import {test,expect} from 'bun:test';
import React from 'react';
import {GlobalRegistrator} from '@happy-dom/global-registrator';
import {render,fireEvent,act,waitFor} from '@testing-library/react';
import {renderToStaticMarkup} from 'react-dom/server';
import {DEFAULT_WORKSHOP,applySensorSelection,applyPairSelection,parseWorkshopConfig,type WorkshopConfig} from '../src/lib/standex/magnetic-workshop';
import {catalogueClasses,catalogueFrame,catalogueTimeline} from '../src/lib/standex/catalogue-pedagogical';
import {guideSensitivityClass,guideReferenceForClass,guideRangesFor} from '../src/lib/standex/activation-guide';
import {publishedClasses} from '../src/lib/standex/magnetics/registries';
import {ClientPedagogicalControls} from '../src/components/standex/workshop/client-pedagogical-controls';
import {usePedagogicalVolume} from '../src/components/standex/workshop/pedagogical-controls';
import {DEFAULT_EXPERIMENT} from '../src/lib/detection-lab/workshop-experiment';
import {sensorById,overallEnvelope,sensorSource,sensorDrawingSource} from '../src/lib/standex/sensor-catalog';
import {insertionParts} from '../src/lib/standex/insertion-profile';
import {setLocale} from '../src/lib/i18n/core';
if(typeof document==='undefined')GlobalRegistrator.register({url:'http://localhost/'});
const classesFor=(c:WorkshopConfig)=>catalogueClasses(c.sensorId,c.magnetModel,publishedClasses(c.sensorId,c.magnetModel));
test('Custom starts with the documented HF block and reaches detectable positions without changing physics',()=>{
 const c=applySensorSelection(DEFAULT_WORKSHOP,'CUSTOM');
 expect(c.magnetModel).toBe('HF3225-14.95X10X5');
 const states=catalogueTimeline(c).points.map(p=>p.state);
 expect(states).toContain('favorable');expect(states).toContain('unfavorable');
 expect(applyPairSelection(c,'CUSTOM','NDFEB-10X5X1.9').magnetModel).toBe('NDFEB-10X5X1.9');
 expect(parseWorkshopConfig({...c,magnetModel:'generic'})?.magnetModel).toBe('generic');
});
for(const [id,expected] of [['MK06-4',['A','B','C','D','E']],['MK16',['B','C','D','E','F']],['MK17',['B','C','D','E']],['MK07',['A','B','C','D','E','F']]] as const){
 test(id+' offers actual guide classes and a matching reference',()=>{
  setLocale('fr');const c=applySensorSelection(DEFAULT_WORKSHOP,id);expect(classesFor(c)).toEqual([...expected]);
  expect(guideSensitivityClass(c.guideReference!)).toBe(c.sensitivity);
  const patches:Partial<WorkshopConfig>[]=[];
  const r=render(<ClientPedagogicalControls config={c} update={p=>patches.push(p)} onCatalog={()=>{}} onCable={()=>{}}/>);
  try{const slider=r.getByRole('slider',{name:'Sensibilité magnétique'});fireEvent.input(slider,{target:{value:String(expected.length-1)}});expect(patches[0]?.sensitivity).toBe(expected.at(-1));}finally{r.unmount();}
  for(const k of expected){const ref=guideReferenceForClass(id,c.magnetModel,c.geometry,k,c.guideReference);expect(guideSensitivityClass(ref!)).toBe(k);expect(guideRangesFor(id,c.magnetModel).some(row=>row.sensorReference===ref)).toBe(true);}
 });
}
test('no unverified default Class B or contact selector for undocumented couples',()=>{
 setLocale('fr');for(const id of ['MK01','MK22','MK30','MK31','MK24-A-J','MK14','MK18','MK20_1','MK20_2','MK21PR','MK26','MK27','CUSTOM']){
  const c=applySensorSelection(DEFAULT_WORKSHOP,id);expect(classesFor(c)).toEqual([]);
  const html=renderToStaticMarkup(<ClientPedagogicalControls config={c} update={()=>{}} onCatalog={()=>{}} onCable={()=>{}}/>);
  expect(html).not.toContain('Classe B');expect(html).not.toContain('Sensibilité magnétique');
 }
 expect(guideSensitivityClass('MK24-A-J')).toBeNull();
 expect(guideReferenceForClass('MK16','SMCO5-5X4','D1','B')).toBeNull();
 expect(guideSensitivityClass('MK07-GP501D-X')).toBe('D');
 expect(guideReferenceForClass('MK07','ALNICO500-4X19','D1','D','MK07-GP501B-X')).toBe('MK07-GP501D-X');
});
test('MK07 shared profile respects millimetres, short mounting thread, nut and source distinction',()=>{
 const m=sensorById('MK07'),parts=insertionParts(m);expect(m.body).toEqual([39.5,13,13]);
 expect(parts.find(p=>p.name==='nose')).toMatchObject({length:25.5,diameter:6.6});
 expect(parts.find(p=>p.name==='thread')).toMatchObject({length:6,diameter:8});
 expect(parts.find(p=>p.name==='nut')).toMatchObject({length:2.5,hexWidth:12,metal:true});
 expect(overallEnvelope(m)[1]).toBeCloseTo(12*2/Math.sqrt(3));
 expect(sensorSource(m)).toBe('/datasheets/MK07.pdf#page=2');
 expect(sensorDrawingSource(m)).toBe('/datasheets/MK07-1A66B-500W.png');
});
test('loading follows current request, ignores stale results, clears on completion/error and respects cache',async()=>{
 const RealWorker=globalThis.Worker;const pending:any[]=[];
 class FakeWorker {onmessage:any;onerror:any;terminated=false;message:any;postMessage(m:any){this.message=m;pending.push(this);}terminate(){this.terminated=true;}}
 globalThis.Worker=FakeWorker as any;
 const config={...applySensorSelection(DEFAULT_WORKSHOP,'MK16'),magnetTilt:13};
 function Harness({c,enabled=true}:{c:WorkshopConfig;enabled?:boolean}){const v=usePedagogicalVolume(enabled,DEFAULT_EXPERIMENT,catalogueFrame(c,.2),null,c);return <output data-testid="request">{v.failed?'failed':v.busy?'loading':v.volume?'ready':'off'}</output>;}
 const r=render(<Harness c={config}/>);const state=()=>r.getByTestId('request').textContent;
 const complete=(w:any)=>{const key=w.message.key;w.onmessage({data:{key,result:{key,cells:[],cut:[],field:{xs:[],ys:[],zs:[],values:[],blocked:[]},extent:24,computeMs:1,nodeCount:0,truncated:false}}});};
 try{
  expect(state()).toBe('loading');await waitFor(()=>expect(pending.length).toBe(1));
  const next={...config,sensitivity:'C'};r.rerender(<Harness c={next}/>);expect(state()).toBe('loading');
  await waitFor(()=>expect(pending.length).toBe(2));expect(pending[0].terminated).toBe(true);
  await act(async()=>complete(pending[0]));expect(state()).toBe('loading');
  await act(async()=>complete(pending[1]));expect(state()).toBe('ready');
  r.rerender(<Harness c={{...next,sensorId:'MK17'}}/>);expect(state()).toBe('loading');await waitFor(()=>expect(pending.length).toBe(3));
  await act(async()=>pending[2].onerror());expect(state()).toBe('failed');
  r.rerender(<Harness c={next}/>);expect(state()).toBe('ready');
  r.rerender(<Harness c={next} enabled={false}/>);expect(state()).toBe('off');
 }finally{r.unmount();globalThis.Worker=RealWorker;}
});
