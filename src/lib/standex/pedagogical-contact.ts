import type { PlacementEvidence } from '../detection-lab/workshop-experiment';
import { catalogueThresholds as classThresholds } from './catalogue-response';

/** One illustrative specimen at the most sensitive documented class bound.
 * The yellow band is class dispersion, never an invented hysteresis band.
 * No hidden historical contact, forced closure or probability is used.
 * Null means no simulation; the circuit remains present but disabled.
 */
export function illustrativeContact(e:PlacementEvidence,className:string):'open'|'closed'|null {
  const th=classThresholds(className);
  if(!th||e.state==='unavailable'||!e.nominal?.ok)return null;
  const threshold=th.low??th.high;
  return e.nominal.response>=threshold?'closed':'open';
}
