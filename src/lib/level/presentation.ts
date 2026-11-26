import { horizontalMountHeight, verticalMechanics, type Family, type LevelConfiguration } from "./configuration";

/** LS05 series p.1: stem Ø7–16; float Ø23.5–38.3, height 11.7–26.3.
 * A representative envelope inside those ranges, not a qualified SKU. */
export const LS05_ENVELOPE = { stemDiameterMm: 12, floatDiameterMm: 32, floatHeightMm: 19 } as const;
export function tankDimensions(height: number) {
  // Only a local slice of the tank is shown, open to the right. Its width/depth
  // are not supplied dimensions and must not grow with the tank height.
  return { width: Math.max(110, Math.min(240, height * .7)), depth: 60 };
}
export function verticalSensorX(c: LevelConfiguration) { return c.mounting === "support" ? -tankDimensions(c.tankHeightMm).width / 2 + 35 : 0; }
export interface ProjectedMarker { index: number; x: number; y: number; visible: boolean }
/** Pack screen-space labels without changing their real measured heights.
 * If all labels cannot fit, the dedicated side rail scrolls instead of overlapping. */
export function markerLayout(markers: ProjectedMarker[], height: number) {
  const gap = 56, edge = 28;
  const contentHeight = Math.max(height, markers.length * gap + 8);
  const ordered = [...markers].sort((a, b) => a.y - b.y || b.index - a.index);
  const positions = ordered.map((m, i) => Math.max(edge + i * gap, Math.min(contentHeight - edge, m.y)));
  for (let i = 1; i < positions.length; i++) positions[i] = Math.max(positions[i]!, positions[i - 1]! + gap);
  if (positions.length) positions[positions.length - 1] = Math.min(positions.at(-1)!, contentHeight - edge);
  for (let i = positions.length - 2; i >= 0; i--) positions[i] = Math.min(positions[i]!, positions[i + 1]! - gap);
  return { contentHeight, markers: ordered.map((m, i) => ({ ...m, labelY: positions[i]! })) };
}
export function sceneFrame(c: LevelConfiguration, family: Family, focus: number | null, productOnly: boolean) {
  const tank = tankDimensions(c.tankHeightMm);
  if (focus === null && !productOnly) return { target: [0, c.tankHeightMm / 2 + 16, 0] as const,
    height: c.tankHeightMm + 65, width: tank.width + 130 };
  if (family === "LS03") {
    const index = focus === null ? 0 : c.pointsMm.reduce((best, p, i) => Math.abs(p - focus) < Math.abs(c.pointsMm[best]! - focus) ? i : best, 0);
    return { target: [-tank.width / 2 + 8, horizontalMountHeight(c, index) - 10, 0] as const, height: 125, width: 155 };
  }
  const m = verticalMechanics(c, family);
  const compact = family === "LS01" || family === "LS02";
  return { target: [verticalSensorX(c), compact || productOnly ? (m.datumMm + m.endMm) / 2 + (c.mounting === "bottom" ? -15 : 15) : focus ?? m.datumMm - 40, 0] as const,
    height: productOnly ? m.reachMm + 65 : compact ? m.reachMm + 65 : 130, width: productOnly ? 100 : 145 };
}
