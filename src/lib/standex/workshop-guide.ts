import { guideSelectionFor, type GuideRange } from "./activation-guide";
import type { WorkshopConfig } from "./magnetic-workshop";
import { documentedMagnetAngleDeg } from "./mounting/profiles";

/** Read the exact guide row actually SELECTED: variant stored in the project and
 *  approach actually drawn. No implicit fall back to the first printed row: when
 *  the stored variant publishes nothing for this approach, there is no range. */
export function workshopGuideRange(c: WorkshopConfig): GuideRange | null {
  if (!c.guideReference) return null;
  const selection = guideSelectionFor(c.sensorId, c.magnetModel, c.geometry, c.guideReference);
  return selection && selection.reference === c.guideReference ? selection.range : null;
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
