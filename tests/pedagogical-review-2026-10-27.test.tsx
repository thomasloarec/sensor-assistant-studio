import {expect,test,afterEach} from 'bun:test';
import {readFileSync} from 'node:fs';
import {GlobalRegistrator} from '@happy-dom/global-registrator';
import {useState} from 'react';
import {diagnosePlacement} from '../src/lib/detection-lab/placement-diagnosis';
import {PedagogicalControls,PedagogicalBanner} from '../src/components/standex/workshop/pedagogical-controls';
import {fireEvent} from '@testing-library/react';
import {render,act,cleanup} from '@testing-library/react';
import {StaffLabEntry} from '../src/components/standex/detection-lab/staff-gate';
import {DEFAULT_EXPERIMENT,EXPERIMENT,sampleVolume,evaluatePlacement,placementTimeline,replayDocumentedSwitch,documentaryDistances} from '../src/lib/detection-lab/workshop-experiment';
import {pedagogicalFrame,pedagogicalAvailability,suggestPedagogicalConfig,parsePedagogicalEnvelope} from '../src/lib/standex/pedagogical-poses';
import {DEFAULT_WORKSHOP} from '../src/lib/standex/magnetic-workshop';
import {DEMO_ASSEMBLIES} from '../src/lib/standex/machine-demos';
import {parseMachineAsset} from '../src/lib/standex/machine-assets';
import {registerAnimation} from '../src/lib/standex/machine-clip-registry';
import {surface} from '../src/components/standex/workshop/pedagogical-layer';
if(typeof document==='undefined')GlobalRegistrator.register({url:'http://localhost/'});
afterEach(cleanup);
const flush=()=>act(async()=>{await new Promise(r=>setTimeout(r,0));});
const pose={center:[8,16,0] as [number,number,number],axis:[0,1,0] as [number,number,number]};
test('Review1 unavailable profiles/material/integration have ZERO volume/cut nodes',()=>{
 for(const patch of [{profileVersion:'old'},{dataVersion:'old'},{integration:'unknown' as const},{nearbyMaterial:true}]){
  const s={...DEFAULT_EXPERIMENT,...patch};const volume=sampleVolume(s,pose.axis,0,8);
  expect(volume.cells.length).toBe(0);expect(volume.cut.length).toBe(0);expect(volume.nodeCount).toBe(0);expect(evaluatePlacement(s,pose).state).toBe('unavailable');
 }
});
test('Review2 slide and D3 suggestions refused; D1 candidate works through current effective pose',()=>{
 const s={...DEFAULT_EXPERIMENT,magnetId:'N45-4X19',lateralFreedomMm:12};
 const c={...DEFAULT_WORKSHOP,geometry:'D1' as const,motion:'approach' as const,start:24,end:8,magnetAngle:90,lateralShift:0};
 expect(suggestPedagogicalConfig({...c,motion:'slide'},.25,s)).toBeNull();expect(suggestPedagogicalConfig({...c,geometry:'D3'},.25,s)).toBeNull();
 expect(evaluatePlacement(s,pedagogicalFrame(c,.25).pose).state).toBe('unfavorable');
 const proposal=suggestPedagogicalConfig(c,.25,s);expect(proposal).not.toBeNull();if(!proposal)throw Error('proposal');
 expect(Math.abs(proposal.lateralShift-c.lateralShift)).toBeLessThanOrEqual(12);
 expect(evaluatePlacement(s,pedagogicalFrame(proposal,.25).pose).state).toBe('favorable');
});
test('Review3 same-account refresh reopens after server confirmation; denial closes',async()=>{
 let fire=()=>{},resolve:(v:boolean)=>void=()=>{};let fresh=false;
 const check=()=>fresh?new Promise<boolean>(r=>{resolve=r;}):Promise.resolve(true);
 const subscribe=(cb:()=>void)=>{fire=cb;return()=>{};};
 const r=render(<StaffLabEntry check={check} subscribe={subscribe} pedagogical renderLab={()=> <p>WORKSHOP</p>}/>);
 await flush();await act(async()=>r.getByRole('button').click());expect(r.queryByText('WORKSHOP')).not.toBeNull();
 fresh=true;await act(async()=>fire());expect(r.queryByText('WORKSHOP')).toBeNull();await act(async()=>resolve(true));await flush();expect(r.queryByText('WORKSHOP')).not.toBeNull();
 await act(async()=>fire());await act(async()=>resolve(false));await flush();expect(r.container.textContent).toBe('');
});
test('Review4 full pilot collision and unverified mounting/clip never favorable',()=>{
 const collision=evaluatePlacement({...DEFAULT_EXPERIMENT,magnetId:'N45-4X19'},{center:[0,5,0],axis:[0,1,0]});expect(collision.cause).toBe('collision');
 expect(evaluatePlacement(DEFAULT_EXPERIMENT,pose,true).state).toBe('unavailable');
 const timeline=placementTimeline(DEFAULT_EXPERIMENT,()=>pose,4,1,()=>true);expect(timeline.points.every(p=>p.state==='unavailable')).toBe(true);
 const unknown=placementTimeline(DEFAULT_EXPERIMENT,()=>pose,4,1,()=>undefined);expect(unknown.points.every(p=>p.state==='unavailable')).toBe(true);
 const machine=structuredClone(DEMO_ASSEMBLIES['builtin:arm-v1']);if(!machine)throw Error('demo');
 expect(pedagogicalAvailability({...DEFAULT_WORKSHOP,machine})).toBe('clip');
 expect(pedagogicalAvailability({...DEFAULT_WORKSHOP,machine:{...machine,motionSource:'manual',motionStatus:'unset'}})).toBe('motion');
});
test('Review5 equal samples do not certify absence of a fast crossing',()=>{
 const timeline=placementTimeline(DEFAULT_EXPERIMENT,()=>pose,4);expect(timeline.events.length).toBe(0);expect(timeline.resolutionCertified).toBe(false);
});
test('Review6 response null invalidates history until a bound restores it',()=>{
 const piece={name:'SYNTHETIC-TEST-ONLY',source:'synthetic fixture',ton:2,toff:1,initial:'open' as const};
 expect(replayDocumentedSwitch([{t:0,response:null},{t:1,response:1.5},{t:2,response:2.1},{t:3,response:null},{t:4,response:1.5},{t:5,response:.9}],piece)?.map(p=>p.state)).toEqual(['unknown','unknown','closed','unknown','unknown','open']);
});
test('Review8 frozen documentary rows reproduce source raw and D4 correction BEFORE floor',()=>{
 const rows=documentaryDistances(DEFAULT_EXPERIMENT,'D4');expect(rows.length).toBe(2);
 for(const r of rows){expect(r.prudentMm).toBe(Math.floor(((r.estimatedRawMm??0)-EXPERIMENT.documentaryD4DeltaMm)*2)/2);}
 expect(documentaryDistances({...DEFAULT_EXPERIMENT,integration:'unknown'},'D4')).toEqual([]);
});
test('Review9 envelope rejects wrong kind/version/profile and invalid progress, keeps old version stale',()=>{
 const v={kind:'pedagogical-workshop',version:1,config:DEFAULT_WORKSHOP,settings:DEFAULT_EXPERIMENT,profile:EXPERIMENT,progress:.25};
 expect(parsePedagogicalEnvelope(v)?.progress).toBe(.25);
 for(const patch of [{kind:'normal'},{version:9},{progress:NaN},{profile:{...EXPERIMENT,version:'other'}}])expect(parsePedagogicalEnvelope({...v,...patch})).toBeNull();
 const old=parsePedagogicalEnvelope({...v,settings:{...DEFAULT_EXPERIMENT,profileVersion:'old'},profile:{...EXPERIMENT,version:'old'}});expect(old).not.toBeNull();if(old)expect(evaluatePlacement(old.settings,pose).cause).toBe('stale');
});
test('Review10 topological neighbors remove BOTH internal faces across fine/coarse step',()=>{
 const cell={i:0,j:0,k:0,x:5,y:0,z:0,x0:4.875,x1:5.5,y0:-.5,y1:.5,z0:-.5,z1:.5,zone:2 as const,response:3};
 const next={...cell,i:1,x:6,x0:5.5,x1:6.5};const g=surface([cell,next],2);expect(g.getAttribute('position').count).toBe(60);g.dispose();
 const v=sampleVolume({...DEFAULT_EXPERIMENT,className:'A',hypotheses:false},[1,0,0],0,8);expect(v.truncated).toBe(true);
});
test('Review11 REAL animated GLB attachments and clip pose preserved at 25 percent after strict reprise',async()=>{
 const b=readFileSync('public/models/demo-bras-anime.glb');const asset=await parseMachineAsset(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength) as ArrayBuffer,1000);
 const m=structuredClone(DEMO_ASSEMBLIES['builtin:arm-v1']);if(!m)throw Error('demo');
 const dispose=registerAnimation(m.assetKey,m.unitScale,asset.animation);
 try{
 const clip=asset.animation.clips[0];expect(clip?.name).toBe('Cycle_complet');expect(clip?.supported).toBe(true);
 const node=asset.nodes.find(n=>n.name==='Levier');if(!node)throw Error('lever');
 const attach={kind:'surface' as const,support:'fixed' as const,partPath:node.path,point:[0,40,0] as [number,number,number],normal:[0,1,0] as [number,number,number],offsetMm:0,spinDeg:0,flip:false,depthRef:'collar' as const,axisSource:'face' as const};
 const c={...DEFAULT_WORKSHOP,machine:{...m,magnetAttach:attach}};
 const before=pedagogicalFrame(c,.25);expect(before.world.center).not.toEqual(pedagogicalFrame(c,0).world.center);
 const v=JSON.parse(JSON.stringify({kind:'pedagogical-workshop',version:1,config:c,settings:DEFAULT_EXPERIMENT,profile:EXPERIMENT,progress:.25}));const parsed=parsePedagogicalEnvelope(v);expect(parsed).not.toBeNull();if(!parsed)throw Error('parse');
 expect(parsed.config.machine?.magnetAttach).toEqual(attach);expect(parsed.config.machine?.clip?.name).toBe('Cycle_complet');expect(parsed.config.machine?.unitScale).toBe(1000);expect(pedagogicalFrame(parsed.config,parsed.progress)).toEqual(before);
 // Reimported JSON alone never carries geometry: unavailable until the GLB boxes are rebuilt.
 expect(pedagogicalAvailability(parsed.config)).toBe('asset');expect(pedagogicalAvailability(parsed.config,true)).toBe('ready');
 }finally{dispose();asset.dispose();}
});

test('Review8/R12 frozen UI distance rows reproduce the source CSV, without mutating physical estimates',()=>{
 const lines=readFileSync('docs/detection-lab-pass3/tableau_Lfit-d4corr.csv','utf8').trim().split('\n').slice(1);
 for(const cls of ['A','B','C','D','E','F'])for(const magnetId of ['SMCO5-5X4','N45-4X19'])for(const approach of ['D1','D3','D4','D5']){
  const rows=documentaryDistances({...DEFAULT_EXPERIMENT,className:cls,magnetId},approach);
  for(const r of rows){const line=lines.find(l=>{const x=l.split(',');return x[0]===cls&&x[1]===magnetId&&x[2]===approach&&x[3]===r.bound;});expect(line).toBeDefined();const cols=line?.split(',')??[];expect(r.estimatedRawMm).toBe(cols[7]?Number(cols[7]):null);expect(r.publishedMm).toBe(cols[6]?Number(cols[6]):null);}
 }
});


for(const [magnetId,depth] of [['SMCO5-5X4',6],['N45-4X19',16]] as const){
 test(`Complement UI ${magnetId}: same-depth centred/offset under nine hypotheses without time reset`,()=>{
  function Harness(){
   const [config,setConfig]=useState({...DEFAULT_WORKSHOP,geometry:'D1' as const,motion:'approach' as const,start:24,end:12,magnetAngle:90,lateralShift:0});
   const [settings,setSettings]=useState<import("../src/lib/detection-lab/workshop-experiment").ExperimentSettings>({...DEFAULT_EXPERIMENT,magnetId});
   const progress=.5,frame=pedagogicalFrame(config,progress),evidence=evaluatePlacement(settings,frame.pose);
   return <><PedagogicalControls settings={settings} setSettings={setSettings} config={config} update={patch=>setConfig(c=>({...c,...patch}))} frame={frame} busy={false} volume={null} failed={false} onSuggest={()=>{}} onUndo={()=>{}} canUndo={false}/><PedagogicalBanner evidence={evidence} diagnosis={diagnosePlacement(settings,frame.pose,false,evidence)}/><output data-testid="depth">{frame.pose.center[1]}</output><output data-testid="time">{progress}</output><output data-testid="scenario-count">{evidence.scenarios.length}</output></>;
  }
  const r=render(<Harness/>);
  fireEvent.input(r.getByRole('slider',{name:'Profondeur minimale'}),{target:{value:String(depth)}});
  expect(r.getByTestId('depth').textContent).toBe(String(depth));expect(r.getByTestId('time').textContent).toBe('0.5');
  expect(r.getByTestId('pedagogical-verdict').textContent).toContain('Placement défavorable');
  expect(r.getByTestId('pedagogical-verdict').textContent).toContain('Zone centrale entre les deux lobes');
  for(const offset of [6,8]){
   if(magnetId==='N45-4X19'&&offset===6)continue;
   fireEvent.input(r.getByRole('slider',{name:'Décalage latéral'}),{target:{value:String(offset)}});
   expect(r.getByTestId('depth').textContent).toBe(String(depth));expect(r.getByTestId('time').textContent).toBe('0.5');
   expect(r.getByTestId('scenario-count').textContent).toBe('9');expect(r.getByTestId('pedagogical-verdict').textContent).toContain('Placement favorable');
  }
 });
}
