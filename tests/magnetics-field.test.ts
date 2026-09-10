import { test, expect } from "bun:test";
import {
  fieldAtPoint,
  prismAxis,
  cylinderAxis,
  rotateXYZ,
  remanenceAt,
} from "../src/lib/standex/magnetics/field";
import type { MagneticBody, Vec3 } from "../src/lib/standex/magnetics/types";
const base: MagneticBody = {
  shape: "block",
  dimensionsMm: [6, 8, 10],
  innerDiameterMm: 0,
  magnetizationAxis: 2,
  brMt: 1200,
  polarity: 1,
  pose: { positionMm: [0, 0, 0], rotationDeg: [0, 0, 0] },
};
function vector(b = base, p: Vec3 = [12, 17, 25]) {
  const r = fieldAtPoint(b, p);
  if (!r.ok) throw new Error(r.reason);
  return r.field.bVectorMt;
}
function relative(a: number, b: number, tol = 1e-9) {
  expect(Math.abs(a - b) / Math.max(Math.abs(b), 1e-12)).toBeLessThan(tol);
}
test("T1.1 external axial field matches independent closed forms at 12 distances", () => {
  for (let i = 0; i < 12; i++) {
    const gap = 5 + (195 * i) / 11;
    relative(vector(base, [0, 0, 5 + gap])[2], prismAxis(3, 4, 10, gap, 1200));
    relative(
      vector({ ...base, shape: "cylinder", dimensionsMm: [6, 6, 10] }, [0, 0, gap + 5])[2],
      cylinderAxis(3, 10, gap, 1200),
    );
  }
});
test("T1.2 subdivision cancels internal charges at off-axis observers", () => {
  const a = vector(),
    b = vector({
      ...base,
      dimensionsMm: [6, 8, 5],
      pose: { positionMm: [0, 0, -2.5], rotationDeg: [0, 0, 0] },
    }),
    c = vector({
      ...base,
      dimensionsMm: [6, 8, 5],
      pose: { positionMm: [0, 0, 2.5], rotationDeg: [0, 0, 0] },
    });
  a.forEach((v, i) => relative(v, b[i]! + c[i]!));
});
test("T1.3 polarity, T1.4 scale, T1.5 dipole falloff, T1.6 rotation", () => {
  const a = vector(),
    inverse = vector({ ...base, polarity: -1 });
  a.forEach((v, i) => expect(v).toBe(-inverse[i]!));
  const scaled = vector({ ...base, dimensionsMm: [12, 16, 20] }, [24, 34, 50]);
  a.forEach((v, i) => relative(v, scaled[i]!));
  const exponent =
    Math.log(vector(base, [0, 0, 210])[2] / vector(base, [0, 0, 200])[2]) / Math.log(210 / 200);
  expect(exponent).toBeGreaterThan(-3.05);
  expect(exponent).toBeLessThan(-2.95);
  const angles: Vec3 = [23, 41, -18],
    rotated = vector(
      { ...base, pose: { positionMm: [0, 0, 0], rotationDeg: angles } },
      rotateXYZ([12, 17, 25], angles),
    );
  rotateXYZ(a, angles).forEach((v, i) => relative(v, rotated[i]!));
});
test("independent midpoint surface quadrature agrees off axis", () => {
  const p: Vec3 = [12, 17, 25],
    sum: Vec3 = [0, 0, 0],
    steps = 180;
  for (const sign of [-1, 1])
    for (let i = 0; i < steps; i++)
      for (let j = 0; j < steps; j++) {
        const r = [
          p[0] - (-3 + ((i + 0.5) * 6) / steps),
          p[1] - (-4 + ((j + 0.5) * 8) / steps),
          p[2] - sign * 5,
        ];
        const factor = (((sign * 1200) / (4 * Math.PI)) * 48) / steps ** 2 / Math.hypot(...r) ** 3;
        r.forEach((v, k) => {
          sum[k] = sum[k]! + v * factor;
        });
      }
  vector(base, p).forEach((v, i) => relative(v, sum[i]!, 2e-6));
});
test("rings subtract the inner axial field; unsupported geometry refuses", () => {
  relative(
    vector({ ...base, shape: "ring", dimensionsMm: [6, 6, 10], innerDiameterMm: 2 }, [0, 0, 15])[2],
    cylinderAxis(3, 10, 10, 1200) - cylinderAxis(1, 10, 10, 1200),
  );
  expect(fieldAtPoint(base, [0, 0, 0]).ok).toBe(false);
  expect(fieldAtPoint({ ...base, brMt: NaN }, [0, 0, 15]).ok).toBe(false);
  expect(fieldAtPoint({ ...base, shape: "cylinder" }, [1, 1, 15]).ok).toBe(false);
  expect(remanenceAt(1000, -0.1, 80)).toBe(940);
});
