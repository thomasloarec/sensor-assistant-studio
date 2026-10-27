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
  | 'none' | 'central' | 'axial' | 'orientation' | 'distance' | 'combined' | 'undetermined'
  | Exclude<PlacementEvidence['cause'], 'distance' | 'orientation'>;
export interface PlacementDiagnosis { state: PlacementState; cause: DiagnosedCause; probes: number }

const norm = (v: Vec3): Vec3 => { const l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

export function diagnosePlacement(settings: ExperimentSettings, pose: MagnetPose, mounting: boolean | readonly Obb[] = false, evidence?: PlacementEvidence): PlacementDiagnosis {
  const e = evidence ?? evaluatePlacement(settings, pose, mounting);
  if (e.state === 'favorable') return { state: e.state, cause: 'none', probes: 0 };
  if (e.state === 'unavailable') return { state: e.state, cause: e.cause === 'distance' || e.cause === 'orientation' ? 'undetermined' : e.cause, probes: 0 };
  const magnet = PILOT_MAGNETS.find(m => m.id === settings.magnetId), th = classThresholds(settings.className);
  if (!magnet || !th) return { state: e.state, cause: 'undetermined', probes: 0 };
  let probes = 0;
  const resp = (p: MagnetPose): number | null => { probes++; const r = evaluatePose(magnet, p, nominalScenario(), 'B'); return r.ok ? r.response : null; };
  const reaches = (p: MagnetPose) => { const r = resp(p); return r !== null && r >= th.high; };
  const here = e.nominal?.ok ? e.nominal.response : null;
  if (here === null) return { state: e.state, cause: 'undetermined', probes };
  const [x, y, z] = pose.center, axis = norm(pose.axis);
  const perpendicular = Math.abs(axis[0]) < SYMMETRY_TOL;
  // Central zone: magnet perpendicular, centred between the lobes, and BOTH lobe probes respond more.
  if (perpendicular && Math.abs(x) < SYMMETRY_TOL) {
    const l = resp({ center: [x - LOBE_PROBE_MM, y, z], axis: pose.axis }), r = resp({ center: [x + LOBE_PROBE_MM, y, z], axis: pose.axis });
    if (l !== null && r !== null && l > here && r > here) return { state: e.state, cause: 'central', probes };
  }
  // Axial prolongation, perpendicular magnet: aligning the axis with the reed responds more.
  if (perpendicular && Math.abs(y) < SYMMETRY_TOL && Math.abs(z) < SYMMETRY_TOL && Math.abs(x) > CAPSULE_HALF_MM) {
    const a = resp({ center: [x, y, z], axis: [Math.sign(x), 0, 0] });
    if (a !== null && a > here) return { state: e.state, cause: 'axial', probes };
  }
  const orientations: Vec3[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  if (orientations.some(a => reaches({ center: [x, y, z], axis: a }))) return { state: e.state, cause: 'orientation', probes };
  const closer = [0.75, 0.5].map(s => [x * s, y * s, z * s] as Vec3);
  if (closer.some(c => reaches({ center: c, axis: pose.axis }))) return { state: e.state, cause: 'distance', probes };
  if (closer.some(c => orientations.some(a => reaches({ center: c, axis: a })))) return { state: e.state, cause: 'combined', probes };
  return { state: e.state, cause: 'undetermined', probes };
}
