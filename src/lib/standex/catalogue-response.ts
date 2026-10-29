/** Pedagogical C1% profile selected after the 2026-10-29 sign-gate review.
 * Sign of free-field blade averages is a hypothesis, not a measured pole force.
 * Axial fit, k and L remain those of A; the gate and 1% strip are explicit.
 * Documentary offsets NEVER enter poses, field samples, or rendered surfaces.
 * Primary score: 43/45, median |error| 0.488 mm; D3 mean -1.134 mm exceeds
 * the 1 mm criterion. Suspected copies are retained, not manufacturer-confirmed.
 * This is a qualitative product illustration, not a qualified sensor model.
 */
import atData from '@/data/detection-lab/at-classes-mk04.json';
import { PROFILE, type ReedScenario } from '../detection-lab/profile';

export const CATALOGUE_RESPONSE = Object.freeze({
  id:'form66-lfit-c-eps01',version:'1.0.0',model:'C' as const,relativeSignEpsilon:0.01,
  effectiveLengthMm:15.63399603080886,kMtPerAt:0.13560548808516593,
  documentaryDatumMm:8.903153027386512,documentaryD4DeltaMm:1.4912902832031252,
  hypothesesVersion:'lfit-one-factor-1.0.0',sourceVersion:'sign-gated-a-study-1.0.0',
  primaryCriterionPassed:false,qualified:false,
});
export const catalogueNominalScenario=():ReedScenario=>({id:'nominal-lfit-c1',lengthFactor:CATALOGUE_RESPONSE.effectiveLengthMm/PROFILE.reed.effectiveLengthMm,shift:[0,0,0],momentFactor:1});
export function catalogueScenarios():ReedScenario[]{
  const nominal=catalogueNominalScenario();
  return PROFILE.scenarios.map(s=>({...s,shift:[...s.shift],lengthFactor:s.lengthFactor*nominal.lengthFactor}));
}
export function catalogueThresholds(className:string):{low:number|null;high:number}|null{
  if(className==='A')return {low:null,high:CATALOGUE_RESPONSE.kMtPerAt*10};
  if(!['B','C','D','E','F'].includes(className))return null;
  const row=(atData.classes as Record<string,{min:number;max:number}>)[className];
  return row?{low:row.min*CATALOGUE_RESPONSE.kMtPerAt,high:row.max*CATALOGUE_RESPONSE.kMtPerAt}:null;
}

/** Reed X plus flat-face normal Y; plane passes through the sensor axis.
 * Coordinates are sensor-local, so imported mounting remains unchanged. */
export const CATALOGUE_CUT_PLANE_Z = 0;
