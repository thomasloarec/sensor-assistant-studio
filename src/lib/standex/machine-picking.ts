import { Matrix3, type Matrix4, Vector3 } from "three";

/** World-space mounting normal, on the side from which the surface was clicked.
 * A double-sided mesh keeps its triangle normal even for a back-face hit.
 * Resolve the side before converting the hit into the support's rest pose. */
export function visibleFaceNormal(
  faceNormal: Vector3,
  matrixWorld: Matrix4,
  rayDirection: Vector3,
): Vector3 {
  const normal = faceNormal
    .clone()
    .applyMatrix3(new Matrix3().getNormalMatrix(matrixWorld))
    .normalize();
  if (normal.dot(rayDirection) > 0) normal.negate();
  return normal;
}
