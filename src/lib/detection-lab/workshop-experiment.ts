/** Internal frozen Form66 experiment. No recalibration, DOM, Three or alternate field. */
import frozen from '@/data/detection-lab/workshop-profile.json';
import atData from '@/data/detection-lab/at-classes-mk04.json';
import formData from '@/data/detection-lab/brochure-form-rows.json';
import { PILOT_MAGNETS } from './magnets';
import { evaluatePose, type MagnetPose, type PoseEvaluation } from './pose';
import { PROFILE, type ReedScenario } from './profile';
import type { Vec3 } from './field';

export const EXPERIMENT = Object.freeze(frozen);
export type PlacementState = 'favorable' | 'variable' | 'unfavorable' | 'unavailable';
export interface ExperimentSettings {
  profileVersion: string; dataVersion: string; magnetId: string; className: string;
  hypotheses: boolean; integration: 'form66' | 'unknown'; nearbyMaterial: boolean;
  rotationFreedom: boolean; lateralFreedomMm: number;
}
export const DEFAULT_EXPERIMENT: ExperimentSettings = {
  profileVersion: EXPERIMENT.version, dataVersion: EXPERIMENT.dataVersion,
  magnetId: 'SMCO5-5X4', className: 'C', hypotheses: true, integration: 'form66',
  nearbyMaterial: false, rotationFreedom: false, lateralFreedomMm: 0,
};
export const nominalScenario = (): ReedScenario => ({ id: 'nominal-lfit', lengthFactor: EXPERIMENT.effectiveLengthMm / PROFILE.reed.effectiveLengthMm, shift: [0,0,0], momentFactor: 1 });
export function experimentalScenarios(hypotheses: boolean): ReedScenario[] {
  const nominal = nominalScenario();
  return hypotheses ? PROFILE.scenarios.map(s => ({ ...s, shift: [...s.shift], lengthFactor: s.lengthFactor * nominal.lengthFactor })) : [nominal];
}
export function classThresholds(className: string): { low: number | null; high: number } | null {
  if (className === 'A') return { low: null, high: EXPERIMENT.kMtPerAt * 10 };
  if (!['B','C','D','E','F'].includes(className)) return null;
  const row = (atData.classes as Record<string,{min:number;max:number}>)[className];
  return row ? { low: row.min * EXPERIMENT.kMtPerAt, high: row.max * EXPERIMENT.kMtPerAt } : null;
}
export interface PlacementEvidence {
  state: PlacementState; cause: 'distance' | 'orientation' | 'collision' | 'scenario_collision' | 'domain' | 'missing' | 'material' | 'stale' | 'partial';
  nominal: PoseEvaluation | null; scenarios: { id: string; result: PoseEvaluation }[];
  /** 0 below range, 1 sensitivity-dependent, 2 above high bound; never electrical ON/OFF. */
  zone: 0 | 1 | 2; partial: boolean;
}
export function evaluatePlacement(settings: ExperimentSettings, pose: MagnetPose, mountingCollision = false): PlacementEvidence {
  const unavailable = (cause: PlacementEvidence['cause'], nominal: PoseEvaluation | null = null): PlacementEvidence => ({ state:'unavailable', cause, nominal, scenarios:[],zone:0,partial:settings.className==='A' });
  if (settings.profileVersion !== EXPERIMENT.version || settings.dataVersion !== EXPERIMENT.dataVersion) return unavailable('stale');
  const magnet = PILOT_MAGNETS.find(m => m.id === settings.magnetId), thresholds = classThresholds(settings.className);
  if (!magnet || !thresholds || settings.integration !== 'form66') return unavailable('missing');
  if (settings.nearbyMaterial) return unavailable('material');
  const nominal = evaluatePose(magnet,pose,nominalScenario(),'B');
  if (mountingCollision) return unavailable('collision', nominal);
  if (!nominal.ok) return unavailable(nominal.reason==='domain'?'domain':nominal.reason==='collision'?'collision':'missing',nominal);
  const scenarios = experimentalScenarios(settings.hypotheses).map(s => ({id:s.id,result:evaluatePose(magnet,pose,s,'B')}));
  const partial = thresholds.low === null;
  const zone = nominal.response >= thresholds.high ? 2 : thresholds.low !== null && nominal.response >= thresholds.low ? 1 : 0;
  const bad = scenarios.find(s => !s.result.ok);
  if (bad) return {state:'unavailable',cause:!bad.result.ok&&bad.result.reason==='domain'?'domain':'scenario_collision',nominal,scenarios,zone,partial};
  const responses = scenarios.flatMap(s => s.result.ok ? [s.result.response] : []);
  if (partial) return {state:'unavailable',cause:'partial',nominal,scenarios,zone,partial};
  const state: PlacementState = responses.every(r=>r>=thresholds.high) ? 'favorable' : responses.every(r=>r<(thresholds.low??0)) ? 'unfavorable' : 'variable';
  return {state,cause:nominal.response===0?'orientation':'distance',nominal,scenarios,zone,partial};
}
/** The two original values stay in primary scores; equality is evidence of suspicion only. */
export const FORM_ANOMALIES = (['B','C'] as const).map(className => {
  const bound = className==='B'?'up':'to';
  const row = formData.rows.find(r=>r.reedLabel==='66-er'&&r.class===className&&r.magnetLabel===PILOT_MAGNETS[1]?.label);
  const d = row?.distances as Record<string,{upMm:number|null;toMm:number|null}> | undefined;
  const key = bound==='up'?'upMm':'toMm';
  return {className,magnetId:'N45-4X19',approach:'D3',bound,publishedMm:d?.['D3']?.[key]??null,d1Mm:d?.['D1']?.[key]??null,equalToD1:d?.['D3']?.[key]!=null&&d?.['D3']?.[key]===d?.['D1']?.[key],status:'suspected-d1-d3-copy',manufacturerConfirmed:false};
});
export const conservativeDistance = (raw: number, approach: string) => Math.floor((raw-(approach==='D4'?EXPERIMENT.documentaryD4DeltaMm:0))*2)/2;
/** Derived housing datum is usable only when provenance reproduces base + offset. D4 empirical correction is not a housing offset. */
export function derivedDatum(base: number, offset: number, claimed: number, kind: string): number | null {
  return kind==='documented-housing-offset' && [base,offset,claimed].every(Number.isFinite) && Math.abs(base+offset-claimed)<1e-9 ? claimed : null;
}
export function settingsKey(s: ExperimentSettings, axis: Vec3, planeZ: number) {
  return JSON.stringify([EXPERIMENT,s,axis,planeZ]);
}
export interface SampleCell { x:number;y:number;z:number;x0:number;x1:number;y0:number;y1:number;z0:number;z1:number;zone:0|1|2;response:number|null }
export interface SampledVolume { key:string;cells:SampleCell[];cut:SampleCell[];computeMs:number;nodeCount:number;axis:Vec3;planeZ:number }
export function axisNodes(lo:number,hi:number,fine=false): number[] {
  const values=new Set<number>();
  for(let x=lo;x<=hi;x++) values.add(x);
  if(fine) for(let x=-5;x<=5;x+=.25) if(x>=lo&&x<=hi) values.add(x);
  return [...values].sort((a,b)=>a-b);
}
const bounds=(nodes:number[],i:number,lo:number,hi:number):[number,number]=>[i===0?lo:((nodes[i-1]??lo)+(nodes[i]??lo))/2,i===nodes.length-1?hi:((nodes[i]??hi)+(nodes[i+1]??hi))/2];
/** Nominal volumes, NOT robustness contours. Midpoint voxels, no interpolation across zero response. */
export function sampleVolume(settings:ExperimentSettings,axis:Vec3,planeZ:number,extent=24):SampledVolume {
  const start=performance.now(), xs=axisNodes(-extent,extent,true),ys=axisNodes(-extent,extent),zs=axisNodes(-extent,extent);
  if(planeZ>=-extent&&planeZ<=extent&&!zs.includes(planeZ)) {zs.push(planeZ);zs.sort((a,b)=>a-b);}
  const magnet=PILOT_MAGNETS.find(m=>m.id===settings.magnetId),th=classThresholds(settings.className);
  const cells:SampleCell[]=[],cut:SampleCell[]=[];
  if(!magnet||!th) return {key:settingsKey(settings,axis,planeZ),cells,cut,computeMs:0,nodeCount:0,axis,planeZ};
  const nominal=nominalScenario();
  for(let k=0;k<zs.length;k++) for(let j=0;j<ys.length;j++) for(let i=0;i<xs.length;i++) {
    const x=xs[i]??0,y=ys[j]??0,z=zs[k]??0;
    const e=evaluatePose(magnet,{center:[x,y,z],axis},nominal,'B');
    const zone=e.ok&&e.response>=th.high?2:e.ok&&th.low!==null&&e.response>=th.low?1:0;
    const [x0,x1]=bounds(xs,i,-extent,extent),[y0,y1]=bounds(ys,j,-extent,extent),[z0,z1]=bounds(zs,k,-extent,extent);
    const cell:SampleCell={x,y,z,x0,x1,y0,y1,z0,z1,zone,response:e.ok?e.response:null};
    if(zone)cells.push(cell);
    if(z===planeZ)cut.push(cell);
  }
  return {key:settingsKey(settings,axis,planeZ),cells,cut,computeMs:performance.now()-start,nodeCount:xs.length*ys.length*zs.length,axis,planeZ};
}
export interface TimelinePoint {t:number;state:PlacementState;response:number|null;zone:0|1|2}
export interface TimelineEvent {from:number;to:number;resolved:boolean;before:PlacementState;after:PlacementState}
/** Adaptive bounded sampling. Unresolved intervals stay explicit; no electrical hysteresis from sensitivity bounds. */
export function placementTimeline(settings:ExperimentSettings,poseAt:(t:number)=>MagnetPose,steps=128,maxDepth=10) {
  const points=new Map<number,TimelinePoint>(),events:TimelineEvent[]=[];
  const sample=(t:number)=>{const hit=points.get(t);if(hit)return hit;const e=evaluatePlacement(settings,poseAt(t));const p={t,state:e.state,response:e.nominal?.ok?e.nominal.response:null,zone:e.zone};points.set(t,p);return p;};
  const refine=(a:number,b:number,depth:number)=>{
    const pa=sample(a),pb=sample(b),mid=(a+b)/2,pm=sample(mid);
    const transition=pa.state!==pb.state||pa.state!==pm.state||pa.zone!==pb.zone||pa.zone!==pm.zone;
    if(!transition)return;
    if(depth>=maxDepth){events.push({from:a,to:b,resolved:b-a<=1e-4,before:pa.state,after:pb.state});return;}
    refine(a,mid,depth+1);refine(mid,b,depth+1);
  };
  for(let i=0;i<steps;i++)refine(i/steps,(i+1)/steps,0);
  return {points:[...points.values()].sort((a,b)=>a.t-b.t),events,electrical:'uncharacterized' as const,baseResolution:1/(steps*2)};
}
export interface DocumentedSwitch {name:string;ton:number;toff:number;initial:'open'|'closed';source:string}
/** Explicit documented switching only. Replays the entire ordered history, independent of UI click order. */
export function replayDocumentedSwitch(points:readonly {t:number;response:number|null}[],piece:DocumentedSwitch|null) {
  if(!piece||!piece.source||!Number.isFinite(piece.ton)||!Number.isFinite(piece.toff)||piece.ton<=piece.toff||piece.toff<0)return null;
  let state:'open'|'closed'=piece.initial;
  return [...points].sort((a,b)=>a.t-b.t).map(p=>{if(p.response===null)return {...p,state:'unknown' as const};if(state==='open'&&p.response>=piece.ton)state='closed';else if(state==='closed'&&p.response<=piece.toff)state='open';return {...p,state};});
}
export function findPlacement(settings:ExperimentSettings,pose:MagnetPose,locked:boolean):MagnetPose|null {
  if(locked||settings.integration!=='form66'||settings.nearbyMaterial)return null;
  const candidates:MagnetPose[]=[];
  if(settings.rotationFreedom)for(const sign of [-1,1])candidates.push({center:[...pose.center],axis:[-sign*pose.axis[1],sign*pose.axis[0],pose.axis[2]]});
  if(settings.lateralFreedomMm>0&&settings.lateralFreedomMm<=12)for(let x=.25;x<=settings.lateralFreedomMm;x+=.25)for(const sign of [-1,1])candidates.push({center:[pose.center[0]+sign*x,pose.center[1],pose.center[2]],axis:[...pose.axis]});
  return candidates.find(p=>evaluatePlacement(settings,p).state==='favorable')??null;
}