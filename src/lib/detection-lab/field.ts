/**
 * Champ EXTÉRIEUR d'un cylindre fini uniformément aimanté selon son axe.
 * Modèle de nappe de courant équivalente (K = M), solution analytique exacte
 * via l'intégrale elliptique complète généralisée de Bulirsch (cel) :
 * N. Derby, S. Olbert, « Cylindrical magnets and ideal solenoids »,
 * Am. J. Phys. 78, 229 (2010), éq. (14)–(15). Aucune approximation dipolaire.
 *
 * Unités : longueurs en mm (seuls les rapports interviennent), J en tesla,
 * induction retournée en mT. Limites : aimantation uniforme et rigide (pas de
 * démagnétisation partielle, pas de perméabilité du reed ni des pièces), le
 * point doit être HORS de l'aimant (intérieur exclu par l'appelant).
 * Module pur : aucun DOM, React, Three ni backend.
 */
export type Vec3 = [number, number, number];

/** cel(kc, p, c, s) — algorithme de Bulirsch (1969), tolérance relative 1e-12. */
export function cel(kc: number, p: number, c: number, s: number): number {
  if (kc === 0 || !Number.isFinite(kc)) return NaN;
  const errtol = 1e-12;
  let k = Math.abs(kc);
  let pp = p,
    cc = c,
    ss = s,
    em = 1;
  if (p > 0) {
    pp = Math.sqrt(p);
    ss = s / pp;
  } else {
    let f = kc * kc;
    let q = 1 - f;
    const g = 1 - pp;
    f = f - pp;
    q = q * (ss - c * pp);
    pp = Math.sqrt(f / g);
    cc = (c - ss) / g;
    ss = -q / (g * g * pp) + cc * pp;
  }
  let f = cc;
  cc = cc + ss / pp;
  let g = k / pp;
  ss = 2 * (ss + f * g);
  pp = g + pp;
  g = em;
  em = k + em;
  let kk = k;
  for (let i = 0; i < 60 && Math.abs(g - k) > g * errtol; i++) {
    k = 2 * Math.sqrt(kk);
    kk = k * em;
    f = cc;
    cc = cc + ss / pp;
    g = kk / pp;
    ss = 2 * (ss + f * g);
    pp = g + pp;
    g = em;
    em = k + em;
  }
  return (Math.PI / 2) * (ss + cc * em) / (em * (em + pp));
}

/** Induction (mT) en coordonnées locales cylindriques (ρ, z), origine au centre. */
export function cylinderFieldLocal(
  radiusMm: number,
  lengthMm: number,
  jT: number,
  rho: number,
  z: number,
): { bRho: number; bZ: number } {
  const a = radiusMm,
    b = lengthMm / 2;
  const b0 = (jT * 1000) / Math.PI;
  const zp = z + b,
    zm = z - b;
  const dp = Math.sqrt(zp * zp + (rho + a) ** 2),
    dm = Math.sqrt(zm * zm + (rho + a) ** 2);
  const alphaP = a / dp,
    alphaM = a / dm;
  const betaP = zp / dp,
    betaM = zm / dm;
  const gamma = (a - rho) / (a + rho);
  const kP = Math.sqrt((zp * zp + (a - rho) ** 2) / (zp * zp + (a + rho) ** 2));
  const kM = Math.sqrt((zm * zm + (a - rho) ** 2) / (zm * zm + (a + rho) ** 2));
  const bRho = b0 * (alphaP * cel(kP, 1, 1, -1) - alphaM * cel(kM, 1, 1, -1));
  const bZ =
    ((b0 * a) / (a + rho)) *
    (betaP * cel(kP, gamma * gamma, 1, gamma) - betaM * cel(kM, gamma * gamma, 1, gamma));
  return { bRho, bZ };
}

/** Contrôle indépendant : formule axiale fermée (ρ = 0), en mT. */
export function cylinderAxialMt(radiusMm: number, lengthMm: number, jT: number, z: number) {
  const b = lengthMm / 2;
  return (
    ((jT * 1000) / 2) *
    ((z + b) / Math.hypot(z + b, radiusMm) - (z - b) / Math.hypot(z - b, radiusMm))
  );
}

export interface CylinderMagnetBody {
  radiusMm: number;
  lengthMm: number;
  jT: number;
  center: Vec3;
  /** Direction unitaire de l'aimantation (pôle N vers +axis). */
  axis: Vec3;
}

/** Induction vectorielle (mT) au point q, repère du reed. Le champ étant de révolution,
 * seuls ρ et z comptent : aucune convention de rotation propre n'est nécessaire. */
export function cylinderField(body: CylinderMagnetBody, q: Vec3): Vec3 {
  const d: Vec3 = [q[0] - body.center[0], q[1] - body.center[1], q[2] - body.center[2]];
  const u = body.axis;
  const z = d[0] * u[0] + d[1] * u[1] + d[2] * u[2];
  const r: Vec3 = [d[0] - z * u[0], d[1] - z * u[1], d[2] - z * u[2]];
  const rho = Math.hypot(r[0], r[1], r[2]);
  const { bRho, bZ } = cylinderFieldLocal(body.radiusMm, body.lengthMm, body.jT, rho, z);
  if (rho < 1e-12) return [bZ * u[0], bZ * u[1], bZ * u[2]];
  const s = bRho / rho;
  return [bZ * u[0] + s * r[0], bZ * u[1] + s * r[1], bZ * u[2] + s * r[2]];
}

/** Distance signée point → cylindre plein (négative à l'intérieur). */
export function cylinderSignedDistance(body: CylinderMagnetBody, q: Vec3): number {
  const d: Vec3 = [q[0] - body.center[0], q[1] - body.center[1], q[2] - body.center[2]];
  const u = body.axis;
  const z = d[0] * u[0] + d[1] * u[1] + d[2] * u[2];
  const rho = Math.hypot(d[0] - z * u[0], d[1] - z * u[1], d[2] - z * u[2]);
  const dx = rho - body.radiusMm,
    dz = Math.abs(z) - body.lengthMm / 2;
  return Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, dz), 0);
}

/** Dipôle ponctuel — uniquement pour le contrôle de limite lointaine, jamais en champ proche. */
export function dipoleFieldMt(momentAm2: number, axis: Vec3, rMm: Vec3): Vec3 {
  const r = rMm.map((v) => v / 1000) as Vec3;
  const n = Math.hypot(...r);
  const mu0 = 4 * Math.PI * 1e-7;
  const md = momentAm2 * (axis[0] * r[0] + axis[1] * r[1] + axis[2] * r[2]);
  const k = (mu0 / (4 * Math.PI)) * 1000;
  return [0, 1, 2].map(
    (i) => (k * ((3 * md * r[i]!) / n ** 5 - (momentAm2 * axis[i]!) / n ** 3)),
  ) as Vec3;
}
