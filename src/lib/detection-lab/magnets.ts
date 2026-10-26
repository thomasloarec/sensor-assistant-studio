/** Aimants pilotes : géométrie publiée (libellé brochure) et moment brut publié.
 * Conversion du moment, convention 10^-6 V·s·cm :
 *   q·1e-6 V·s·cm = q·1e-8 Wb·m  →  m = q·1e-8 / μ0  [A·m²]
 *   V = π r² h [m³], J_eff = μ0·m / V [T]  (aimantation supposée uniforme).
 */
import { MU0 } from "./profile";

export interface PilotMagnet {
  id: "SMCO5-5X4" | "N45-4X19";
  label: string;
  material: string;
  diameterMm: number;
  lengthMm: number;
  momentRaw: string;
  q: number;
  momentAm2: number;
  volumeM3: number;
  jT: number;
}

export function parseMomentRaw(raw: string): number | null {
  const m = raw.match(/([0-9]+(?:[.,][0-9]+)?)\s*x\s*10e-6\s*Vs\s*x\s*cm/i);
  if (!m) return null;
  const v = Number(m[1]!.replace(",", "."));
  return Number.isFinite(v) && v > 0 ? v : null;
}

export function magnetFrom(
  id: PilotMagnet["id"],
  label: string,
  material: string,
  diameterMm: number,
  lengthMm: number,
  momentRaw: string,
  qOverride?: number,
): PilotMagnet {
  const q = qOverride ?? parseMomentRaw(momentRaw);
  if (q == null) throw new Error(`moment illisible: ${momentRaw}`);
  const momentAm2 = (q * 1e-8) / MU0;
  const volumeM3 = Math.PI * (diameterMm / 2000) ** 2 * (lengthMm / 1000);
  return { id, label, material, diameterMm, lengthMm, momentRaw, q, momentAm2, volumeM3, jT: (MU0 * momentAm2) / volumeM3 };
}

export const PILOT_MAGNETS: PilotMagnet[] = [
  magnetFrom("SMCO5-5X4", "MAGNET SmCo5 5 x 4mm", "SmCo5", 5, 4, "Magnetic moment: 7,2 x 10e-6Vs x cm"),
  magnetFrom("N45-4X19", "MAGNET NdFeB N45 4 x 19mm", "NdFeB N45", 4, 19, "Magnetic moment: 30,8 x 10e-6Vs x cm"),
];
