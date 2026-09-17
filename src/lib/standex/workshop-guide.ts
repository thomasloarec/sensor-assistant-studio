import { guideRange, guideRangesFor, guideReferencesFor, type GuideRange } from "./activation-guide";
import type { WorkshopConfig } from "./magnetic-workshop";
import { documentedMagnetAngleDeg } from "./mounting/profiles";

/** Read the exact guide row for the approach actually drawn, never another approach. */
export function workshopGuideRange(c: WorkshopConfig): GuideRange | null {
  const refs = guideReferencesFor(c.sensorId, c.magnetModel);
  const reference = c.guideReference && refs.includes(c.guideReference)
    ? c.guideReference
    : guideRangesFor(c.sensorId, c.magnetModel).find(r => r.approachId === c.geometry)?.sensorReference;
  const row = reference ? guideRange(c.sensorId, reference, c.magnetModel, c.geometry) : null;
  return row && (row.upMm !== null || row.toMm !== null || row.upNote === "below_zero" || row.toNote === "below_zero") ? row : null;
}

/** Pose only: temperature and nearby metal are separate application conditions. */
export function onDocumentedPosition(c: WorkshopConfig): boolean {
  return c.machine === null && c.motion === "approach" && c.lateralShift === 0 &&
    c.magnetTilt === 0 && c.sensorAngle === 0 &&
    (c.magnetAngle - documentedMagnetAngleDeg(c.geometry, c.sensorId)) % 360 === 0 &&
    c.magnetization === "axial" && c.polarity === 1;
}

// i18n-canonical: translated at display/export time.
export const GUIDE_SIMULATION_NOTE = "Animation fondée sur la plage du guide Standex. Les colonnes « up » et « to » ne définissent pas à elles seules les seuils de fermeture et de réouverture de votre montage.";
