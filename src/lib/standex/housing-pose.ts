/** Model-to-sensor datum, independent of magnetic polarity. The flanged
 * sensor housing and reed are rotated together; dimensions and source distances
 * are unchanged. This does not characterise an internal magnetic datum. */
export const FACING_HOUSINGS = new Set(["MK02", "MK04", "MK05", "MK13", "MK21"]);
export const housingYawDeg = (sensorId: string): number =>
  FACING_HOUSINGS.has(sensorId) ? 180 : 0;
/** Housing orientation for documented workshop approaches only. D3 brings
 * the magnet from +X, so the cable exits on -X. Machine/manual poses do not
 * call this helper and keep their saved transform. */
export const workshopHousingYawDeg = (
  sensorId: string,
  approach: string,
  cableSide: -1 | 1 = -1,
): number => (approach === "D3" ? (cableSide === 1 ? 180 : 0) : housingYawDeg(sensorId));
export const transverseApproach = (approach: string, sensorId = ""): boolean =>
  (approach !== "D3" && approach !== "F1") || (approach === "F1" && FACING_HOUSINGS.has(sensorId));
