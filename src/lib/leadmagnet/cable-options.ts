/** Family lengths transcribed from the bundled manufacturer datasheets, p.1.
 * Family options are not orderable part numbers or an approval of the assembly. */
const COMMON = [200, 300, 500, 1000, 1500, 2000, 3000, 5000] as const;
const OPTIONS: Record<string, readonly number[]> = {
  MK02: COMMON,
  MK03: COMMON,
  MK04: COMMON,
  MK05: COMMON,
  MK13: COMMON,
  MK14: COMMON,
  MK18: COMMON,
  MK26: COMMON,
  "MK11-B-M6": COMMON,
  "MK11-M5": COMMON,
  "MK11-M8": COMMON,
  "MK11-P-M8": COMMON,
  MK20_1: [100, 200, 300, 500],
  MK20_2: [100, 200, 300, 500],
  MK21: [500, 1000, 1500, 2000, 3000, 5000],
  MK21PR: [500, 1000, 1500, 2000, 3000, 5000],
  MK27: [500, 1000, 1500, 2000, 3000, 5000],
  MK36: [300, 2000],
  MK37: [300, 2000],
  MK38: [300],
};
export const standardLengthsMm = (sensorId: string | null): readonly number[] =>
  OPTIONS[sensorId ?? ""] ?? [];
export function customLengthMm(cm: string): number | null {
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(cm.trim())) return null;
  const mm = Number(cm.replace(",", ".")) * 10;
  return Number.isFinite(mm) && mm > 0 && mm <= 100000 ? mm : null;
}
