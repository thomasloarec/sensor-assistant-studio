/**
 * Uniform surface-charge model, external field only, lengths in mm and induction in mT.
 * Ignores material response, surrounding ferromagnetic bodies, partial demagnetisation,
 * and nonuniform or misaligned magnetisation. No product constants belong in this file.
 * Rectangular-face integrals: scalar-potential surface formulation documented at
 * https://magpylib.readthedocs.io/en/stable/_pages/user_guide/guide_resources_01_physics.html
 * (Engel-Herbert & Hesjedal, J. Appl. Phys. 97, 074504, 2005).
 * Independent face-integral implementation; no off-axis error is inferred from an on-axis proxy.
 */
import type { Vec3, MagneticBody, FieldEvaluation } from "./types";
const rad = (d: number) => (d * Math.PI) / 180;
export function rotateXYZ(v: Vec3, angles: Vec3, inverse = false): Vec3 {
  let result = [...v] as Vec3;
  const order = inverse ? [0, 1, 2] : [2, 1, 0];
  for (const axis of order) {
    const angle = rad(angles[axis]! * (inverse ? -1 : 1)),
      c = Math.cos(angle),
      s = Math.sin(angle);
    const a = (axis + 1) % 3,
      b = (axis + 2) % 3,
      next = [...result] as Vec3;
    next[a] = c * result[a]! - s * result[b]!;
    next[b] = s * result[a]! + c * result[b]!;
    result = next;
  }
  return result;
}
export function cylinderAxis(
  radiusMm: number,
  lengthMm: number,
  faceGapMm: number,
  brMt: number,
): number {
  const z = faceGapMm,
    end = z + lengthMm;
  return (brMt / 2) * (end / Math.hypot(end, radiusMm) - z / Math.hypot(z, radiusMm));
}
export function prismAxis(
  aMm: number,
  bMm: number,
  lengthMm: number,
  faceGapMm: number,
  brMt: number,
): number {
  const z = faceGapMm,
    end = z + lengthMm;
  return (
    (brMt / Math.PI) *
    (Math.atan((aMm * bMm) / (z * Math.hypot(aMm, bMm, z))) -
      Math.atan((aMm * bMm) / (end * Math.hypot(aMm, bMm, end))))
  );
}
export function remanenceAt(
  brMt: number,
  coefficientPctPerK: number,
  temperatureC: number,
): number {
  if (![brMt, coefficientPctPerK, temperatureC].every(Number.isFinite)) return NaN;
  return brMt * (1 + (coefficientPctPerK / 100) * (temperatureC - 20));
}
export function fieldAtPoint(
  body: MagneticBody,
  observerMm: Vec3,
  bladeAxis: Vec3 = [1, 0, 0],
): FieldEvaluation {
  const values = [
    ...body.dimensionsMm,
    ...body.pose.positionMm,
    ...body.pose.rotationDeg,
    ...observerMm,
    ...bladeAxis,
    body.brMt,
    body.innerDiameterMm,
  ];
  if (
    !values.every(Number.isFinite) ||
    body.dimensionsMm.some((d) => d <= 0) ||
    body.brMt <= 0 ||
    ![0, 1, 2].includes(body.magnetizationAxis) ||
    ![-1, 1].includes(body.polarity) ||
    Math.hypot(...bladeAxis) === 0
  )
    return { ok: false, reason: "INVALID_INPUT" };
  const p = rotateXYZ(
    observerMm.map((x, i) => x - body.pose.positionMm[i]!) as Vec3,
    body.pose.rotationDeg,
    true,
  );
  const b: Vec3 = [0, 0, 0],
    axis = body.magnetizationAxis,
    u = (axis + 1) % 3,
    v = (axis + 2) % 3;
  const half = body.dimensionsMm.map((d) => d / 2),
    br = body.brMt * body.polarity;
  if (body.shape === "block") {
    if (p.every((x, i) => Math.abs(x) <= half[i]!))
      return { ok: false, reason: "GEOMETRY_OVERLAP" };
    for (const face of [-1, 1]) {
      const w = p[axis]! - face * half[axis]!;
      // Edge-extension singularities are named refusals, never perturbed geometry.
      if (Math.abs(w) <= Number.EPSILON * Math.max(...half))
        return { ok: false, reason: "NO_UNIQUE_CROSSING" };
      for (const su of [-1, 1])
        for (const sv of [-1, 1]) {
          const x = p[u]! + su * half[u]!,
            y = p[v]! + sv * half[v]!,
            r = Math.hypot(x, y, w);
          const factor = (face * su * sv * br) / (4 * Math.PI);
          b[u] = b[u]! - factor * Math.asinh(y / Math.hypot(x, w));
          b[v] = b[v]! - factor * Math.asinh(x / Math.hypot(y, w));
          b[axis] += factor * Math.atan((x * y) / (w * r));
        }
    }
  } else {
    if (
      !["cylinder", "ring"].includes(body.shape) ||
      body.dimensionsMm[0] !== body.dimensionsMm[1] ||
      (body.shape === "cylinder" && body.innerDiameterMm !== 0) ||
      (body.shape === "ring" && body.innerDiameterMm <= 0)
    )
      return { ok: false, reason: "INVALID_INPUT" };
    // Axis of a cylinder/ring is local z. A transverse magnetisation is not an axial cylinder rotated in space.
    if (axis !== 2 || Math.hypot(p[0], p[1]) > 1e-10 * Math.max(...half))
      return { ok: false, reason: "CYLINDER_OFF_AXIS_APPROXIMATION" };
    if (body.innerDiameterMm < 0 || body.innerDiameterMm >= body.dimensionsMm[0])
      return { ok: false, reason: "INVALID_INPUT" };
    if (Math.abs(p[2]) <= half[2]!) return { ok: false, reason: "GEOMETRY_OVERLAP" };
    const gap = Math.abs(p[2]) - half[2]!;
    b[2] = cylinderAxis(half[0]!, body.dimensionsMm[2], gap, br);
    if (body.shape === "ring" && body.innerDiameterMm > 0)
      b[2] -= cylinderAxis(body.innerDiameterMm / 2, body.dimensionsMm[2], gap, br);
  }
  const world = rotateXYZ(b, body.pose.rotationDeg),
    norm = Math.hypot(...bladeAxis);
  if (!world.every(Number.isFinite)) return { ok: false, reason: "INVALID_INPUT" };
  return {
    ok: true,
    field: {
      bVectorMt: world,
      bAlongBladeMt: world.reduce((sum, x, i) => sum + (x * bladeAxis[i]!) / norm, 0),
      bMagnitudeMt: Math.hypot(...world),
      approximation: "none",
      approximationErrorPct: 0,
    },
  };
}
