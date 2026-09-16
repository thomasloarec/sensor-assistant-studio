/** Model-to-sensor datum, independent of magnetic polarity. The flanged
 * sensor housing and reed are rotated together; dimensions and source distances
 * are unchanged. This does not characterise an internal magnetic datum. */
export const FACING_HOUSINGS = new Set(["MK02", "MK04", "MK05", "MK13", "MK21"]);
export const housingYawDeg = (sensorId: string): number =>
  FACING_HOUSINGS.has(sensorId) ? 180 : 0;
export const transverseApproach = (approach: string, sensorId = ""): boolean =>
  (approach !== "D3" && approach !== "F1") || (approach === "F1" && FACING_HOUSINGS.has(sensorId));
