/** Explanation layer over the frozen experiment. It NEVER changes the four
 *  states, responses, thresholds or calibration: every probe goes through the
 *  same `evaluatePose` (nominal scenario) and the same class high bound, and a
 *  remedy is only claimed after `evaluatePlacement` with ALL hypotheses on. */
import { PILOT_MAGNETS } from './magnets';
import { evaluatePose, type MagnetPose } from './pose';
import type { Vec3 } from './field';
import type { Obb } from './obstacles';
import { classThresholds, evaluatePlacement, nominalScenario, type ExperimentSettings, type PlacementEvidence, type PlacementState } from './workshop-experiment';

/** Geometric tolerance for symmetry tests (mm, and unit-vector components).
 *  Pose composition noise is ~1e-12; the coarsest sampling step is 0.25 mm.
 *  1e-6 sits far from both, so it absorbs float noise without merging distinct
 *  positions. It is NOT a detection threshold. */
export const SYMMETRY_TOL = 1e-6;
/** Probe offset along the reed: half the glass length (capsule ±7 mm), i.e. a lobe position. */
export const LOBE_PROBE_MM = 7;
/** Reed capsule half-length incl. radius (16.2 / 2). */
const CAPSULE_HALF_MM = 8.1;

export type DiagnosedCause =
  | 'none' | 'hypotheses' | 'central' | 'axial' | 'orientation' | 'distance' | 'combined' | 'undetermined'
  | Exclude<PlacementEvidence['cause'], 'distance' | 'orientation'>;
/** Secondary findings, nominal probes only (never a remedy):
 *  rotationInPlace: does any OTHER orientation at the same centre reach the nominal high bound?
 *  closerAndRotated: does a closer centre (same radial line) with another orientation reach it? */
export interface PlacementDiagnosis { state: PlacementState; cause: DiagnosedCause; probes: number; rotationInPlace?: 'sufficient' | 'insufficient'; closerAndRotated?: boolean }

const norm = (v: Vec3): Vec3 => { const l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const AXES: Vec3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

export function diagnosePlacement(settings: ExperimentSettings, pose: MagnetPose, mounting: boolean | readonly Obb[] = false, evidence?: PlacementEvidence): PlacementDiagnosis {
  const e = evidence ?? evaluatePlacement(settings, pose, mounting);
  if (e.state === 'favorable') return { state: e.state, cause: 'none', probes: 0 };
  if (e.state === 'unavailable') return { state: e.state, cause: e.cause === 'distance' || e.cause === 'orientation' ? 'undetermined' : e.cause, probes: 0 };
  const magnet = PILOT_MAGNETS.find(m => m.id === settings.magnetId), th = classThresholds(settings.className);
  if (!magnet || !th) return { state: e.state, cause: 'undetermined', probes: 0 };
  const here = e.nominal?.ok ? e.nominal.response : null;
  if (here === null) return { state: e.state, cause: 'undetermined', probes: 0 };
  // Nominal already reaches the high bound: only the hypotheses/sensitivity disagree. Never blame orientation.
  if (here >= th.high) return { state: e.state, cause: 'hypotheses', probes: 0 };
  let probes = 0;
  const resp = (p: MagnetPose): number | null => { probes++; const r = evaluatePose(magnet, p, nominalScenario(), 'B'); return r.ok ? r.response : null; };
  const reaches = (p: MagnetPose) => { const r = resp(p); return r !== null && r >= th.high; };
  const [x, y, z] = pose.center, axis = norm(pose.axis);
  // Only orientations DIFFERENT from the current one (either sign) count as evidence.
  const others = AXES.filter(a => Math.abs(Math.abs(a[0] * axis[0] + a[1] * axis[1] + a[2] * axis[2]) - 1) > SYMMETRY_TOL);
  const rotationInPlace: 'sufficient' | 'insufficient' = others.some(a => reaches({ center: [x, y, z], axis: a })) ? 'sufficient' : 'insufficient';
  const closer = [0.75, 0.5].map(s => [x * s, y * s, z * s] as Vec3);
  const closerAndRotated = closer.some(c => others.some(a => reaches({ center: c, axis: a })));
  const extra = { rotationInPlace, closerAndRotated };
  const perpendicular = Math.abs(axis[0]) < SYMMETRY_TOL;
  if (perpendicular && Math.abs(x) < SYMMETRY_TOL) {
    const l = resp({ center: [x - LOBE_PROBE_MM, y, z], axis: pose.axis }), r = resp({ center: [x + LOBE_PROBE_MM, y, z], axis: pose.axis });
    if (l !== null && r !== null && l > here && r > here) return { state: e.state, cause: 'central', probes, ...extra };
  }
  if (perpendicular && Math.abs(y) < SYMMETRY_TOL && Math.abs(z) < SYMMETRY_TOL && Math.abs(x) > CAPSULE_HALF_MM) {
    const a = resp({ center: [x, y, z], axis: [Math.sign(x), 0, 0] });
    if (a !== null && a > here) return { state: e.state, cause: 'axial', probes, ...extra };
  }
  if (rotationInPlace === 'sufficient') return { state: e.state, cause: 'orientation', probes, ...extra };
  if (closer.some(c => reaches({ center: c, axis: pose.axis }))) return { state: e.state, cause: 'distance', probes, ...extra };
  if (closerAndRotated) return { state: e.state, cause: 'combined', probes, ...extra };
  return { state: e.state, cause: 'undetermined', probes, ...extra };
}
