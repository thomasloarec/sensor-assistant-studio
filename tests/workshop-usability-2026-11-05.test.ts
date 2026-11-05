import {test,expect} from 'bun:test';
import {DEFAULT_WORKSHOP,type Vec3} from '../src/lib/standex/magnetic-workshop';
import {DEMO_ASSEMBLIES} from '../src/lib/standex/machine-demos';
import {catalogueFrame,catalogueModel,cataloguePlacement,catalogueNominalSampler,magnetBodyFrame} from '../src/lib/standex/catalogue-pedagogical';
import {INITIAL_GUIDE,guideOverlay,handlePick,guideStepState} from '../src/components/standex/workshop/machine-guide';
import {pointAt} from '../src/lib/standex/machine-assembly';
import {DEFAULT_EXPERIMENT} from '../src/lib/detection-lab/workshop-experiment';
import {preparePivot,pinnedVolume,volumeKey} from '../src/components/standex/workshop/pedagogical-controls';

test('first picked point stays on its moving support, and clears on completion or navigation',()=>{
 const m=structuredClone(DEMO_ASSEMBLIES['builtin:door-v1']!);
 const c={...DEFAULT_WORKSHOP,machine:m};
 const path=m.movingNode,point:Vec3=[10,35,20];
 const s=handlePick({...INITIAL_GUIDE,step:'motion',pick:{purpose:'axis-points',points:[]}},m,
  {point,normal:[0,1,0],path,moving:true},c).state;
 expect(s.pick?.points).toEqual([point]);
 const shown=guideOverlay(s,m,{},2000,.7);
 expect(shown.points).toEqual([pointAt(m,path,point,.7)]);
 expect(shown.points[0]).not.toEqual(point);
 const result=handlePick(s,m,{point:[10,50,20],normal:[0,1,0],path,moving:true},c);
 expect(result.done).toBe(true);expect(guideOverlay(result.state,m,{},2000,.7).points).toEqual([]);
 expect(guideOverlay(guideStepState(s,'install'),m,{},2000,.7).points).toEqual([]);
});

test('moving anchors reuse the exact orientation field, but orientation and physical inputs invalidate it',()=>{
 const c={...DEFAULT_WORKSHOP,sensorId:'MK15',magnetModel:'HF3225-14.95X10X5',sensitivity:'B',machine:structuredClone(DEMO_ASSEMBLIES['builtin:door-v1']!)};
 const key=(v:typeof c)=>volumeKey(DEFAULT_EXPERIMENT,catalogueFrame(v,.3),null,v);
 const moved={...c,machine:{...c.machine,magnetPosition:[20,30,40] as Vec3,sensorPosition:[2,5,7] as Vec3}};
 expect(key(moved)).toBe(key(c));
 expect(key({...moved,machine:{...moved.machine,magnetRotation:[10,0,0]}})).not.toBe(key(c));
 expect(key({...c,sensitivity:'D'})).not.toBe(key(c));
 expect(key({...c,magnetModel:'M04'})).not.toBe(key(c));
 expect(key({...c,sensorId:'MK04'})).not.toBe(key(c));
});

test('batch grid evaluator preserves point responses and full body exclusions',()=>{
 for(const sensorId of ['MK15','MK07','CUSTOM'])for(const magnetModel of ['HF3225-14.95X10X5','M04','SMCO5-5X4']){
  const c={...DEFAULT_WORKSHOP,sensorId,magnetModel,sensitivity:'B',magnetAngle:31,magnetTilt:17};
  const m=catalogueModel(c),frame=magnetBodyFrame(c,31),axis=catalogueFrame(c,.3).pose.axis;
  const obstacles=[{path:'part',c:[20,0,0] as Vec3,a:frame,h:[3,7,5] as Vec3}];
  const sample=catalogueNominalSampler(c,axis,frame,obstacles,m);
  for(let i=0;i<80;i++){
   const center:Vec3=[i%10*7-30,Math.floor(i/10)*5-15,i%7*4-10];
   const full=cataloguePlacement(c,{center,axis,frame},obstacles,m,true),fast=sample(center);
   expect(fast.blocked).toBe(full.cause==='overlap');
   expect(fast.response).toEqual(full.nominal?.ok?full.nominal.response:null);
  }
 }
});

class WorkerFake{sent:any[]=[];terminated=false;onmessage:any;onerror:any;postMessage(m:any){this.sent.push(m);}terminate(){this.terminated=true;}}
test('parallel preparation accepts out-of-order results, reuses cache, and cancels every worker',()=>{
 const workers:WorkerFake[]=[],factory=()=>{const w=new WorkerFake();workers.push(w);return w as unknown as Worker;};
 const c={...DEFAULT_WORKSHOP},request=(t:number)=>({key:'parallel-check-'+t,settings:DEFAULT_EXPERIMENT,frame:catalogueFrame(c,t),obstacles:null,catalogue:c});
 let done:any=null;const progress:number[]=[];
 preparePivot(c,request,p=>done=p,Infinity,factory,n=>progress.push(n),3);
 const plan={samples:[0,.25,.5,.75,1],intervals:[]};
 workers[0]!.onmessage({data:{plan}});expect(workers).toHaveLength(3);
 expect(workers.map(w=>w.sent.at(-1).key)).toEqual(['parallel-check-0','parallel-check-0.25','parallel-check-0.5']);
 const deliver=(w:WorkerFake)=>{const key=w.sent.at(-1).key;w.onmessage({data:{key,result:{key}}});};
 deliver(workers[2]!);deliver(workers[1]!);deliver(workers[0]!);
 expect(done).toBeNull();deliver(workers[1]!);deliver(workers[2]!);
 expect(done.samples).toEqual(plan.samples);expect(progress.at(-1)).toBe(5);
 expect(workers.every(w=>w.terminated)).toBe(true);
 expect(pinnedVolume('parallel-check-1')).toBeTruthy();
 const start=workers.length;
 preparePivot(c,request,p=>done=p,Infinity,factory,undefined,3);
 workers[start]!.onmessage({data:{plan}});
 expect(workers.slice(start).flatMap(w=>w.sent).filter(m=>m.mode==='volume')).toHaveLength(0);
 const second=workers.length;let called=false;
 const cancel=preparePivot(c,t=>({...request(t),key:'cancel-parallel-'+t}),()=>called=true,Infinity,factory,undefined,3);
 workers[second]!.onmessage({data:{plan}});cancel();
 expect(workers.slice(second).every(w=>w.terminated)).toBe(true);
 deliver(workers[second]!);expect(called).toBe(false);
});
