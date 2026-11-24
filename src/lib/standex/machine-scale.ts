import type { Vec3 } from "./magnetic-workshop";

/** Scale is millimetres per source unit; custom sizes must survive save/reopen. */
export function validMachineScale(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 1e-9 && value <= 1e9;
}

export function scaledMachineSize(sizeMm: Vec3, fromScale: number, toScale: number): Vec3 | null {
  if (!validMachineScale(fromScale) || !validMachineScale(toScale)) return null;
  const size = sizeMm.map(n => n / fromScale * toScale) as Vec3;
  const extent = Math.max(...size);
  return size.every(n => Number.isFinite(n) && n >= 0) && extent >= 0.1 && extent <= 20000 ? size : null;
}

/** Only an explicit real dimension determines scale. Never guess from object type. */
export function machineScaleFromLength(sizeMm: Vec3, fromScale: number, lengthCm: string): number | null {
  if (!/^\d+(?:[.,]\d+)?$/.test(lengthCm.trim())) return null;
  const mm = Number(lengthCm.trim().replace(",", ".")) * 10;
  const scale = fromScale * (mm / Math.max(...sizeMm));
  return mm >= 0.1 && mm <= 20000 && scaledMachineSize(sizeMm, fromScale, scale) ? scale : null;
}

export function machineScaleError(error: unknown): { sizeMm: Vec3 } | null {
  if (!error || typeof error !== "object") return null;
  const e = error as { code?: string; sizeMm?: unknown };
  return e.code === "scale" && Array.isArray(e.sizeMm) && e.sizeMm.length === 3 &&
    e.sizeMm.every(n => typeof n === "number" && Number.isFinite(n) && n >= 0) && Math.max(...e.sizeMm) > 0
    ? { sizeMm: e.sizeMm as Vec3 } : null;
}
