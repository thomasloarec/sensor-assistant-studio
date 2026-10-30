import {expect,test} from 'bun:test';
import {DEFAULT_WORKSHOP,applySensorSelection} from '../src/lib/standex/magnetic-workshop';
import {catalogueFrame,catalogueModel,cataloguePlacement,catalogueVolume,catalogueCut,catalogueSamplingAxes,catalogueTimeline} from '../src/lib/standex/catalogue-pedagogical';
import {catalogueThresholds} from '../src/lib/standex/catalogue-response';
import {illustrativeContact} from '../src/lib/standex/pedagogical-contact';
import {smoothSurface} from '../src/lib/standex/zone-surface';

const config={...applySensorSelection(DEFAULT_WORKSHOP,'MK06-6'),magnetModel:'HF3225-14.95X10X5',sensitivity:'B'};
const pose=catalogueFrame(config,0).pose;

test('MK06-6 / HF3225: D2 closes beyond the old 24 mm display crop, with the same circuit response',()=>{
 const v=catalogueVolume(config,pose.axis,0,[],undefined,pose.frame),f=v.field;
 expect(v.truncated).toBe(false);
 expect(f.xs.at(-1)).toBeGreaterThan(33);
 const model=catalogueModel(config),thresholds=catalogueThresholds('B')!;
 const sample=(x:number,y:number,z:number)=>{
  const i=f.xs.indexOf(x),j=f.ys.indexOf(y),k=f.zs.indexOf(z);
  expect(Math.min(i,j,k)).toBeGreaterThanOrEqual(0);
  return f.values[(k*f.ys.length+j)*f.xs.length+i];
 };
 for(const x of [-30,-26,26,30]){
  const e=cataloguePlacement(config,{...pose,center:[x,4,0]},[],model);
  expect(e.zone).toBeGreaterThan(0);
  expect(illustrativeContact(e,'B')).toBe('closed');
  expect(sample(x,4,0)).toBeCloseTo(e.nominal!.ok?e.nominal!.response:NaN,10);
 }
 expect(illustrativeContact(cataloguePlacement(config,{...pose,center:[40,4,0]}),'B')).toBe('open');
 // No active sample reaches ANY face of the rectangular sampling box.
 for(const cell of v.cells){
  expect(cell.i>0&&cell.i<f.xs.length-1&&cell.j>0&&cell.j<f.ys.length-1&&cell.k>0&&cell.k<f.zs.length-1).toBe(true);
 }
 // The reconstructed shell has a real outer turn and no open edge in the added D2 region.
 const surface=smoothSurface(f,thresholds.low!),positions=surface.getAttribute('position'),idx=surface.index!;
 let xmax=0;for(let i=0;i<positions.count;i++)xmax=Math.max(xmax,positions.getX(i));
 expect(xmax).toBeGreaterThan(33);expect(xmax).toBeLessThan(35);
 const edges=new Map<string,{a:number;b:number;n:number}>();
 for(let i=0;i<idx.count;i+=3)for(const [a,b] of [[idx.getX(i),idx.getX(i+1)],[idx.getX(i+1),idx.getX(i+2)],[idx.getX(i+2),idx.getX(i)]]){
  const key=a!<b!?`${a}:${b}`:`${b}:${a}`,old=edges.get(key);edges.set(key,{a:a!,b:b!,n:(old?.n??0)+1});
 }
 const sideEdges=[...edges.values()].filter(e=>positions.getX(e.a)>24&&positions.getX(e.b)>24);
 expect(sideEdges.length).toBeGreaterThan(0);expect(sideEdges.every(e=>e.n===2)).toBe(true);
 surface.dispose();
},120000);

test('adaptive cuts and timeline activate in the added D2 area, while collision and far OFF stay intact',()=>{
 const cut=catalogueCut(config,pose.axis,0,[],undefined,pose.frame);
 expect(cut.truncated).toBe(false);
 for(const x of [-30,30])expect(cut.cut.find(p=>p.x===x&&p.y===4)?.zone).toBeGreaterThan(0);
 const points=[[40,4,0],[30,4,0],[26,4,0],[0,0,0]] as [number,number,number][];
 const timeline=catalogueTimeline(config,points.map((center,i)=>({t:i/3,pose:{...pose,center},obstacles:[]})));
 expect(timeline.points.map(p=>p.zone>0)).toEqual([false,true,true,false]);
 expect(timeline.points[3]!.state).toBe('unavailable');
},30000);

test('the crop adapts to orientation and sensitivity; explicit audit bounds remain fixed',()=>{
 for(const sensitivity of ['C','E']){
  const c={...config,sensitivity},axes=catalogueSamplingAxes(c,pose.axis,0,pose.frame);
  expect(axes[0].at(-1)).toBeGreaterThan(24);expect(axes[0].at(-1)).toBeLessThanOrEqual(40);
 }
 const c={...config,magnetAngle:90},p=catalogueFrame(c,0).pose;
 const axes=catalogueSamplingAxes(c,p.axis,0,p.frame);
 expect(axes.every(ns=>ns.at(-1)!>=24)).toBe(true);
 const e=cataloguePlacement(c,{...p,center:[0,0,20]});
 expect(e.zone).toBe(0);expect(illustrativeContact(e,'B')).toBe('open');
 const cropped=catalogueSamplingAxes(config,pose.axis,0,pose.frame,6);
 expect(cropped.map(ns=>[ns[0],ns.at(-1)])).toEqual([[-6,6],[-6,6],[-6,6]]);
},60000);
