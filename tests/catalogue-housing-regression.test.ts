import { describe, expect, test } from 'bun:test';
import { DEFAULT_WORKSHOP, poseAt } from '../src/lib/standex/magnetic-workshop';
import { catalogueModel, cataloguePlacement, catalogueFrame, catalogueEvaluate, magnetBodyFrame } from '../src/lib/standex/catalogue-pedagogical';
import { cylinderField } from '../src/lib/detection-lab/field';
import { gaussLegendre } from '../src/lib/detection-lab/pose';
import { EXPERIMENT, nominalScenario } from '../src/lib/detection-lab/workshop-experiment';
import { PILOT_MAGNETS } from '../src/lib/detection-lab/magnets';

// Independent physical-mm integral: Gauss 48 per blade, own loop.
function independentB(center:[number,number,number],axis:[number,number,number],L:number){
  const n45=PILOT_MAGNETS.find(m=>m.id==='N45-4X19')!,g=gaussLegendre(48),h=L/2;
  const body={radiusMm:n45.diameterMm/2,lengthMm:n45.lengthMm,jT:n45.jT,center,axis};
  const mean=(a:number,b:number)=>g.x.reduce((s,x,i)=>s+g.w[i]!/2*cylinderField(body,[a+(x+1)/2*(b-a),0,0])[0],0);
  const m1=mean(-h,0),m2=mean(0,h);return m1*m2>0?Math.min(Math.abs(m1),Math.abs(m2)):0;
}
describe('catalogue housing regressions (physical invariants)',()=>{
  const mk24={...DEFAULT_WORKSHOP,sensorId:'MK24-A-J',magnetModel:'N45-4X19',sensitivity:'C'};
  test('MK24 at 20 mm is inside the physical calculation domain',()=>{
    expect(cataloguePlacement(mk24,{center:[0,0,20],axis:[1,0,0]}).cause).not.toBe('domain');
  });
  test('MK24/N45 nominal integral in physical mm',()=>{
    const e=cataloguePlacement(mk24,{center:[0,0,20],axis:[1,0,0]});
    const ref=independentB([0,0,20],[1,0,0],EXPERIMENT.effectiveLengthMm*3/14);
    expect(ref).toBeCloseTo(2.25882959405002,12);
    expect(e.nominal?.ok&&e.nominal.response).toBeCloseTo(2.25882959405002,10);
  });
  test('class A stays A',()=>{
    expect(catalogueModel({...DEFAULT_WORKSHOP,sensorId:'MK03',guideReference:'MK03-1A66A-X',magnetModel:'SMCO5-5X4',sensitivity:'A'}).className).toBe('A');
  });
  test('class A never zero-fills the low bound',()=>{
    const c={...DEFAULT_WORKSHOP,sensorId:'MK03',magnetModel:'SMCO5-5X4',sensitivity:'A'};
    const far=cataloguePlacement(c,{center:[0,0,50],axis:[1,0,0]},[],undefined,true);
    expect(far.zone).toBe(0);
  });
  test('MK04/M04 approach shares poseAt surface-gap convention',()=>{
    const c={...DEFAULT_WORKSHOP,sensorId:'MK04',magnetModel:'M04',geometry:'D1' as const,motion:'approach' as const,start:10,end:6,sensorAngle:0,mountAngle:0,mountX:0,mountZ:0};
    const w=catalogueFrame(c,.5).world.center,p=poseAt(c,.5).position;
    w.forEach((v,i)=>expect(v).toBeCloseTo(p[i]!,9));
    expect(w[2]).toBeCloseTo(19.9,6);
  });
  test('HF3225 thickness-magnetised body is not aligned with its poles',()=>{
    const c={...DEFAULT_WORKSHOP,sensorId:'MK24-A-J',magnetModel:'HF3225-14.95X10X5',magnetization:'thickness' as const,magnetAngle:0,magnetTilt:0,sensorAngle:0};
    const e=cataloguePlacement(c,{center:[0,6,0],axis:[0,1,0],frame:magnetBodyFrame(c,0)});
    expect(e.cause).not.toBe('overlap');
    expect(catalogueModel(c).field.kind).toBe('block');
  });
  test('block body frame follows roll independently of poles',()=>{
    const c={...DEFAULT_WORKSHOP,sensorId:'MK24-A-J',magnetModel:'HF3225-14.95X10X5',magnetization:'thickness' as const,magnetAngle:90,magnetTilt:0,sensorAngle:0};
    const f=magnetBodyFrame(c,90);expect(Math.abs(f[0][2])).toBeCloseTo(1,9);
  });
  test('N/S inversion leaves the non-polarised response unchanged',()=>{
    const m=catalogueModel(mk24),f=magnetBodyFrame(mk24,0);
    const a=catalogueEvaluate(m,{center:[3,0,12],axis:[1,0,0]},nominalScenario(),f),b=catalogueEvaluate(m,{center:[3,0,12],axis:[-1,0,0]},nominalScenario(),f);
    expect(a.ok&&b.ok&&a.response).toBeCloseTo(b.ok?b.response:NaN,12);
  });
});
import { DEFAULT_PAIRS } from '../src/lib/standex/default-pairs';
test('F1 frontal approach of MK36 reaches an estimated zone along its own faces',()=>{
  const c={...DEFAULT_WORKSHOP,sensorId:'MK36',magnetModel:DEFAULT_PAIRS.MK36!,geometry:'F1' as const,motion:'approach' as const,start:30,end:.5};
  let best=0;for(let i=0;i<=50;i++)best=Math.max(best,cataloguePlacement(c,catalogueFrame(c,i/100).pose,[],undefined,true).zone);
  expect(best).toBeGreaterThan(0);
});
import { catalogueVolume, catalogueClasses } from '../src/lib/standex/catalogue-pedagogical';
import { rotate } from '../src/lib/standex/machine-assembly';
import { publishedClasses } from '../src/lib/standex/magnetics/registries';
test('global mounting composes with poseAt; relative response unchanged',()=>{
  const c={...DEFAULT_WORKSHOP,sensorId:'MK04',magnetModel:'M04',mountX:12,mountZ:-7,mountAngle:30,sensorAngle:20};
  const p=poseAt(c,.5),r=rotate(p.position,[0,-30,0]),w=catalogueFrame(c,.5).world.center;
  [r[0]+12,r[1],r[2]-7].forEach((v,i)=>expect(w[i]).toBeCloseTo(v,9));
  const c0={...c,mountX:0,mountZ:0,mountAngle:0},a=cataloguePlacement(c,catalogueFrame(c,.5).pose),b=cataloguePlacement(c0,catalogueFrame(c0,.5).pose);
  expect(a.nominal?.ok&&a.nominal.response).toBeCloseTo(b.nominal?.ok?b.nominal.response:NaN,10);
});
test('volume cell equals point evaluation with the same body frame',()=>{
  const c={...DEFAULT_WORKSHOP,sensorId:'MK24-A-J',magnetModel:'HF3225-14.95X10X5',magnetization:'thickness' as const,sensorAngle:45,magnetAngle:0,magnetTilt:0};
  const f=catalogueFrame(c,0),v=catalogueVolume(c,f.pose.axis,0,[],6,f.pose.frame);
  const cell=v.cut.find(k=>k.x===2&&k.y===6&&k.z===0)!,pt=cataloguePlacement(c,{...f.pose,center:[2,6,0]},[],catalogueModel(c),true);
  expect(cell.response).toBeCloseTo(pt.nominal?.ok?pt.nominal.response:NaN,12);
});
test('rolling a block around unchanged poles changes the volume key and values',()=>{
  const c={...DEFAULT_WORKSHOP,sensorId:'MK24-A-J',magnetModel:'HF3225-14.95X10X5',magnetization:'thickness' as const};
  const f0=magnetBodyFrame(c,0),f1:typeof f0=[f0[2],f0[1],[-f0[0][0],-f0[0][1],-f0[0][2]]];
  const a=catalogueVolume(c,[0,1,0],0,[],6,f0),b=catalogueVolume(c,[0,1,0],0,[],6,f1);
  expect(a.key).not.toBe(b.key);
  expect(JSON.stringify(a.cut.map(k=>k.response))).not.toBe(JSON.stringify(b.cut.map(k=>k.response)));
});
test('MK04 + SmCo offers guide classes C and E for the 66 reed',()=>{
  const k=catalogueClasses('MK04','SMCO5-5X4',publishedClasses('MK04','SMCO5-5X4'));
  expect(k).toContain('C');expect(k).toContain('E');
});
import { catalogueVerdictNotes, catalogueFamilySentence, CATALOGUE_LABELS } from '../src/lib/standex/catalogue-pedagogical';
test('verdict notes: A partial, C fallback, F1 MK37/38 limit, MK02 function',()=>{
  const a={...DEFAULT_WORKSHOP,sensorId:'MK03',magnetModel:'SMCO5-5X4',sensitivity:'A'};
  expect(catalogueVerdictNotes(a,catalogueModel(a))).toContain(CATALOGUE_LABELS.partialA);
  const g={...DEFAULT_WORKSHOP,sensorId:'MK03',magnetModel:'SMCO5-5X4',sensitivity:'G'};
  expect(catalogueVerdictNotes(g,catalogueModel(g))).toContain(CATALOGUE_LABELS.fallbackC);
  for(const id of ['MK37','MK38']){const c={...DEFAULT_WORKSHOP,sensorId:id,magnetModel:DEFAULT_PAIRS[id]!,geometry:'F1' as const};expect(catalogueVerdictNotes(c,catalogueModel(c))).toContain(CATALOGUE_LABELS.f1);}
  const m2={...DEFAULT_WORKSHOP,sensorId:'MK02',magnetModel:DEFAULT_PAIRS.MK02??DEFAULT_WORKSHOP.magnetModel};
  expect(catalogueVerdictNotes(m2,catalogueModel(m2))).toContain(CATALOGUE_LABELS.ferrous);
  expect(catalogueFamilySentence(catalogueModel({...DEFAULT_WORKSHOP,sensorId:'MK24-A-J'}))).toBe(CATALOGUE_LABELS.analogyReed);
});
