import type { PlacementEvidence } from '../detection-lab/workshop-experiment';
import { classThresholds } from '../detection-lab/workshop-experiment';

/** One illustrative specimen at the midpoint of the selected AT class.
 * The yellow band is class dispersion, never an invented hysteresis band.
 * No hidden historical contact, forced closure or probability is used.
 * Null means no simulation; the circuit remains present but disabled.
 */
export function illustrativeContact(e:PlacementEvidence,className:string):'open'|'closed'|null {
  const th=classThresholds(className);
  if(!th||e.state==='unavailable'||!e.nominal?.ok)return null;
  const threshold=th.low===null?th.high:(th.high+th.low)/2;
  return e.nominal.response>=threshold?'closed':'open';
}
