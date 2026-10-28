import {test,expect} from 'bun:test';
import {readFileSync} from 'node:fs';
import {obbOverlap,type Obb} from '@/lib/detection-lab/obstacles';
import {clearanceRegions,clearanceContains,clearanceTextureData} from '@/lib/standex/zone-clearance';
import {DEFAULT_WORKSHOP,type Vec3} from '@/lib/standex/magnetic-workshop';
import {catalogueFrame,catalogueModel,cataloguePlacement,catalogueVolume,nearestPreparedT,type VolumeField} from '@/lib/standex/catalogue-pedagogical';
import {rotate} from '@/lib/standex/machine-assembly';
import {discoveryPatch} from '@/lib/standex/discovery-preset';
import {sectionVolume,contourPath} from '@/lib/standex/zone-section';
import {DEFAULT_EXPERIMENT,type SampledVolume} from '@/lib/detection-lab/workshop-experiment';
import {preparePivot,pinnedVolume,volumeKey} from '@/components/standex/workshop/pedagogical-controls';
import {parseMachineAsset} from '@/lib/standex/machine-assets';
import {registerAnimation} from '@/lib/standex/machine-clip-registry';
import {DEMO_ASSEMBLIES} from '@/lib/standex/machine-demos';

test('moving-envelope render mask agrees with the existing full-body SAT on 4000 poses',()=>{
 let seed=42;const rand=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
 const basis=(angle:Vec3)=>([[1,0,0],[0,1,0],[0,0,1]] as Vec3[]).map(v=>rotate(v,angle)) as Obb['a'];
 for(let i=0;i<80;i++){
  const a=basis([rand()*360,rand()*360,rand()*360]),h:[number,number,number]=[2+rand()*8,1+rand()*3,1+rand()*5];
  const obstacle:Obb={path:'part',c:[rand()*10,rand()*10,rand()*10],a:basis([rand()*360,rand()*360,rand()*360]),h:[4,6,3]};
  const regions=clearanceRegions(a,h.map(n=>2*n),[obstacle]);
  expect(clearanceTextureData(regions).length).toBe(128);
  for(let j=0;j<50;j++){const c=[rand()*30-10,rand()*30-10,rand()*30-10] as Vec3;
   expect(clearanceContains(regions,c)).toBe(obbOverlap({path:'magnet',c,a,h},obstacle));
  }
 }
});

test('discovery actions clear the bodies through the whole MK04/M04 cycle at both orientations',()=>{
 for(const motion of ['slide','pivot'] as const)for(const magnetAngle of [0,90]){
  const original={...DEFAULT_WORKSHOP,sensorId:'MK04',magnetModel:'M04',sensitivity:'C',magnetAngle};
  const config={...original,...discoveryPatch(original,{motion})};
  for(let i=0;i<=512;i++)expect(cataloguePlacement(config,catalogueFrame(config,i/512).pose).cause).not.toBe('overlap');
  expect(original.motion).toBe('approach');
 }
 const c={...DEFAULT_WORKSHOP,machine:structuredClone(DEMO_ASSEMBLIES['builtin:arm-v1']!)};
 expect(discoveryPatch(c,{motion:'pivot'})).toEqual({motion:'pivot'});
});

test('a smooth section preserves the zero corridor, null cells and out-of-domain planes',()=>{
 const f:VolumeField={xs:[-2,-1,0,1,2],ys:[-1,0,1],zs:[0,1],values:[],blocked:[]};
 for(const z of f.zs)for(const y of f.ys)for(const x of f.xs){f.values.push(x===0?0:10);f.blocked.push(false);}
 const v={field:f,cut:[],cells:[],key:'section',axis:[1,0,0],planeZ:0,extent:24,computeMs:0,nodeCount:30,truncated:false} as SampledVolume&{field:VolumeField};
 const section=sectionVolume(v,.5,{low:4,high:6});
 expect(section.cut.filter(c=>c.x===0).every(c=>c.zone===0&&c.response===0)).toBe(true);
 const paths=contourPath(section.cut,4).split('M').filter(Boolean);
 expect(paths.length).toBeGreaterThan(0);
 for(const path of paths){const xs=path.replace('Z','').split('L').map(p=>Number(p.split(',')[0]));
  expect(xs.every(x=>x<0)||xs.every(x=>x>0)).toBe(true);
 }
 expect(sectionVolume(v,2,{low:4,high:6}).cut).toHaveLength(0);
 f.values.fill(null);expect(contourPath(sectionVolume(v,.5,{low:4,high:6}).cut,4)).toBe('');
});

test('symmetry-reused grid agrees with direct physics for cylinders, blocks and a tilted body',()=>{
 for(const magnetModel of ['M04','SMCO5-5X4','HF3225-14.95X10X5'])for(const magnetTilt of [0,17]){
  const c={...DEFAULT_WORKSHOP,sensorId:'MK04',magnetModel,sensitivity:'C',magnetAngle:53,magnetTilt};
  const p=catalogueFrame(c,.25).pose,model=catalogueModel(c),v=catalogueVolume(c,p.axis,0,[],24,p.frame),f=v.field;
  for(let n=0;n<f.values.length;n+=193){
   const i=n%f.xs.length,j=Math.floor(n/f.xs.length)%f.ys.length,k=Math.floor(n/(f.xs.length*f.ys.length));
   const e=cataloguePlacement(c,{...p,center:[f.xs[i]!,f.ys[j]!,f.zs[k]!]},[],model,true),response=e.nominal?.ok?e.nominal.response:null;
   expect(f.blocked[n]).toBe(e.cause==='overlap');
   if(response===null)expect(f.values[n]).toBeNull();else expect(Math.abs(f.values[n]!-response)).toBeLessThan(1e-9);
  }
 }
},120000);

class WorkerFake{sent:any[]=[];onmessage:any;onerror:any;terminated=false;postMessage(m:any){this.sent.push(m);}terminate(){this.terminated=true;}}
test('preparation keeps the second half beyond 48 volumes; selects a computed, unblended transition',()=>{
 const w=new WorkerFake();let done:any=null;
 const c={...DEFAULT_WORKSHOP,sensorId:'MK04',magnetModel:'M04',motion:'pivot' as const};
 preparePivot(c,t=>({key:'all-'+t,settings:DEFAULT_EXPERIMENT,frame:catalogueFrame(c,t),obstacles:null,catalogue:c}),p=>{done=p;},undefined,()=>w as unknown as Worker);
 const samples=Array.from({length:65},(_,i)=>i/64);
 w.onmessage({data:{plan:{samples,intervals:samples.slice(1).map((t,i)=>({t0:samples[i],t1:t,certified:false}))}}});
 for(const t of samples)w.onmessage({data:{key:'all-'+t,result:{key:'all-'+t}}});
 expect(done.samples).toEqual(samples);expect(w.terminated).toBe(true);expect(pinnedVolume('all-1')).toBeTruthy();
 for(let i=0;i<=100;i++)expect(samples).toContain(nearestPreparedT(done,i/100)!);
});

test('a rotating GLB is prepared from loaded numeric poses although discovery motion remains approach',async()=>{
 const file=readFileSync('public/models/demo-bras-anime.glb');
 const asset=await parseMachineAsset(file.buffer.slice(file.byteOffset,file.byteOffset+file.byteLength),1000);
 const unregister=registerAnimation('builtin:arm-v1',1000,asset.animation);
 try{
  const machine=structuredClone(DEMO_ASSEMBLIES['builtin:arm-v1']!);
  machine.magnetAttach={kind:'surface',support:'fixed',partPath:asset.nodes.find(n=>n.name==='Levier')!.path,point:[0,40,0],normal:[0,1,0],offsetMm:0,spinDeg:0,flip:false,depthRef:'collar',axisSource:'face'};
  const config={...DEFAULT_WORKSHOP,sensorId:'MK04',magnetModel:'M04',sensitivity:'C',machine},w=new WorkerFake();
  const cancel=preparePivot(config,t=>{const f=catalogueFrame(config,t);return {key:volumeKey(DEFAULT_EXPERIMENT,f,null,config),settings:DEFAULT_EXPERIMENT,frame:f,obstacles:null,catalogue:config};},()=>{},undefined,()=>w as unknown as Worker);
  const orientations=w.sent[0].orientations;
  expect(config.motion).toBe('approach');expect(orientations).toHaveLength(257);
  expect(orientations[64].pose.axis).not.toEqual(orientations[0].pose.axis);
  expect(orientations[64].pose).toEqual(catalogueFrame(config,.25).pose);
  expect(JSON.stringify(orientations)).not.toContain('tracks');cancel();
 }finally{unregister();asset.dispose();}
});
