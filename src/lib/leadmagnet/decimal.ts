/** « 9.6 », « 9,6 » → 9.6 ; vide, « 9, », « 9.6.1 », négatif ou non fini → null. */
export function parseDecimalMm(raw: string): number | null {
  const s = raw.trim();
  if (!/^\d+(?:[.,]\d+)?$/.test(s)) return null;
  const v = Number(s.replace(",", "."));
  return Number.isFinite(v) && v > 0 && v <= 10000 ? v : null;
}
