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

/** Presentation-only orientation for a packaged magnet housing. MK21PR uses
 * the reverse-cable sensor body, while M21/P keeps the MK21 housing datum. In
 * D3 the matching housings therefore need the same half-turn so their raised
 * sides face each other. This does not alter polarity, distances or magnetic
 * calibration, and is deliberately unused by machine/manual poses. */
export const workshopMagnetHousingYawDeg = (
  sensorId: string,
  approach: string,
  hasPackagedHousing: boolean,
  magnetAngle = 0,
  motion = "",
): number => {
  if(!hasPackagedHousing)return 0;
  // D3 approach, positive quarter-turn: place the mounting flange outward.
  // A half-turn preserves the centred OBB and unoriented magnetic axis. Do not
  // change lateral demonstrations or any imported component transform.
  const quarter=((magnetAngle%360)+360)%360;
  if(approach==='D3'&&motion==='approach'&&Math.abs(quarter-90)<1e-8&&(FACING_HOUSINGS.has(sensorId)||sensorId==='MK21PR'))return 180;
  return sensorId === "MK21PR" && approach === "D3" ? 180 : 0;
};

/** Scene-level guard: an imported machine already owns the complete magnet
 * transform, so workshop presentation yaw must never leak into that pose. */
export const renderedMagnetHousingYawDeg = (
  sensorId: string,
  approach: string,
  hasPackagedHousing: boolean,
  hasMachinePose: boolean,
  magnetAngle = 0,
  motion = "",
): number =>
  hasMachinePose ? 0 : workshopMagnetHousingYawDeg(sensorId, approach, hasPackagedHousing,magnetAngle,motion);

/** Rotate an illustrative local Z offset around Y. Kept pure so 2D and 3D
 * presentation tests compare the actual sides rather than yaw constants. */
export const rotatedLocalZ = (localZ: number, yawDeg: number): number =>
  localZ * Math.cos((yawDeg * Math.PI) / 180);
export const transverseApproach = (approach: string, sensorId = ""): boolean =>
  (approach !== "D3" && approach !== "F1") || (approach === "F1" && FACING_HOUSINGS.has(sensorId));
