/** Loaded, connected planar face. Never replace a mesh face with its infinite plane.
 * Geometry is already baked into the file's static millimetre coordinates.
 * The conservative rectangular mounting footprint must be entirely covered,
 * including its interior (four corner raycasts would miss holes).
 */
import { Triangle, Vector3 } from "three";
import type { MachineAsset } from "./machine-assets";
import type { Attachment } from "./machine-mounting";
import type { Vec3 } from "./magnetic-workshop";
import { faceTangents } from "./machine-alignment";

type P = [number, number];
const EPS = 1e-4;
const cross = (a: P, b: P, c: P) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const area = (p: P[]) =>
  Math.abs(
    p.reduce((s, a, i) => {
      const b = p[(i + 1) % p.length]!;
      return s + a[0] * b[1] - a[1] * b[0];
    }, 0),
  ) / 2;
function clip(p: P[], a: P, b: P): P[] {
  const out: P[] = [];
  for (let i = 0; i < p.length; i++) {
    const s = p[i]!,
      e = p[(i + 1) % p.length]!,
      ds = cross(a, b, s),
      de = cross(a, b, e);
    if (ds >= 0) out.push(s);
    if (ds >= 0 !== de >= 0) {
      const t = ds / (ds - de);
      out.push([s[0] + t * (e[0] - s[0]), s[1] + t * (e[1] - s[1])]);
    }
  }
  return out;
}
export interface MountingFace {
  origin: Vec3;
  normal: Vec3;
  tangents: [Vec3, Vec3];
  triangles: Triangle[];
  flat: [P, P, P][];
  bounds: { min: P; max: P };
  to2: (p: Vec3) => P;
  to3: (p: P) => Vec3;
}
/** Only the edge-connected coplanar component containing the original anchor.
 * Coincident triangle copies are removed; disconnected coplanar islands cannot
 * become a different mounting face. Non-planar/over-complex faces fail closed.
 */
export function mountingFace(
  asset: Pick<MachineAsset, "parts">,
  a: Attachment,
): MountingFace | null {
  if (a.kind !== "surface") return null;
  const g = asset.parts.find((p) => p.path === a.partPath)?.geometry;
  const positions = g?.getAttribute("position");
  if (!positions) return null;
  const [x, y] = faceTangents(a.normal),
    origin = new Vector3(...a.point),
    n = new Vector3(...a.normal).normalize();
  const to2 = (p: Vec3): P => {
    const d = new Vector3(...p).sub(origin);
    return [d.dot(new Vector3(...x)), d.dot(new Vector3(...y))];
  };
  const to3 = (p: P): Vec3 =>
    origin
      .clone()
      .addScaledVector(new Vector3(...x), p[0])
      .addScaledVector(new Vector3(...y), p[1])
      .toArray() as Vec3;
  const triangles: Triangle[] = [],
    flat: [P, P, P][] = [],
    edges = new Map<string, number[]>(),
    seen = new Set<string>();
  const count = g!.index?.count ?? positions.count;
  const key = (v: Vector3) =>
    v
      .toArray()
      .map((q) => Math.round(q / EPS))
      .join(",");
  for (let i = 0; i + 2 < count; i += 3) {
    const vs = [0, 1, 2].map((k) =>
      new Vector3().fromBufferAttribute(positions, g!.index ? g!.index.getX(i + k) : i + k),
    );
    const tri = new Triangle(vs[0]!, vs[1]!, vs[2]!);
    if (
      vs.some(
        (v) => !v.toArray().every(Number.isFinite) || Math.abs(v.clone().sub(origin).dot(n)) > EPS,
      ) ||
      tri.getArea() < EPS * EPS ||
      tri.getNormal(new Vector3()).dot(n) < 1 - 1e-5
    )
      continue;
    const keys = vs.map(key),
      id = [...keys].sort().join("|");
    if (seen.has(id)) continue;
    seen.add(id);
    if (triangles.length >= 4000) return null;
    const idx = triangles.length,
      pts = vs.map((v) => to2(v.toArray() as Vec3)) as [P, P, P];
    if (cross(...pts) < 0) [pts[1], pts[2]] = [pts[2], pts[1]];
    triangles.push(tri);
    flat.push(pts);
    for (let j = 0; j < 3; j++) {
      const edge = [keys[j]!, keys[(j + 1) % 3]!].sort().join("|");
      edges.set(edge, [...(edges.get(edge) ?? []), idx]);
    }
  }
  const seed = triangles.findIndex(
    (t) => t.closestPointToPoint(origin, new Vector3()).distanceTo(origin) <= EPS,
  );
  if (seed < 0) return null;
  const neighbors = triangles.map(() => new Set<number>());
  for (const list of edges.values())
    for (const i of list) for (const j of list) neighbors[i]!.add(j);
  const component = new Set([seed]),
    queue = [seed];
  for (let k = 0; k < queue.length; k++)
    for (const j of neighbors[queue[k]!]!)
      if (!component.has(j)) {
        component.add(j);
        queue.push(j);
      }
  const kept = queue.map((i) => flat[i]!),
    points = kept.flat();
  return {
    origin: [...a.point],
    normal: n.toArray() as Vec3,
    tangents: [x, y],
    triangles: queue.map((i) => triangles[i]!),
    flat: kept,
    to2,
    to3,
    bounds: {
      min: [Math.min(...points.map((p) => p[0])), Math.min(...points.map((p) => p[1]))],
      max: [Math.max(...points.map((p) => p[0])), Math.max(...points.map((p) => p[1]))],
    },
  };
}
/** Area intersection checks the whole pad, not merely the anchor/corners. */
export function footprintFits(face: MountingFace, point: Vec3, footprint: Vec3[]): boolean {
  if (
    Math.abs(
      new Vector3(...point).sub(new Vector3(...face.origin)).dot(new Vector3(...face.normal)),
    ) > EPS
  )
    return false;
  const polygon = footprint.map((v) =>
    face.to2(new Vector3(...point).add(new Vector3(...v)).toArray() as Vec3),
  );
  const required = area(polygon);
  if (!(required > EPS)) return false;
  const min = [Math.min(...polygon.map((p) => p[0])), Math.min(...polygon.map((p) => p[1]))],
    max = [Math.max(...polygon.map((p) => p[0])), Math.max(...polygon.map((p) => p[1]))];
  // Subtract the union of triangles from the pad. Summing intersection areas
  // would let overlapping triangles compensate for a hole elsewhere.
  let uncovered: P[][] = [polygon];
  for (const tri of face.flat) {
    if (
      [0, 1].some(
        (k) =>
          Math.max(...tri.map((p) => p[k]!)) < min[k]! - EPS ||
          Math.min(...tri.map((p) => p[k]!)) > max[k]! + EPS,
      )
    )
      continue;
    const remaining: P[][] = [];
    for (const fragment of uncovered) {
      let inside = fragment;
      for (let i = 0; i < 3 && inside.length; i++) {
        const outside = clip(inside, tri[(i + 1) % 3]!, tri[i]!);
        if (area(outside) > 1e-12) remaining.push(outside);
        inside = clip(inside, tri[i]!, tri[(i + 1) % 3]!);
      }
    }
    uncovered = remaining;
    if (!uncovered.length) return true;
    // Pathological meshes must fail closed, never skip coverage checks.
    if (uncovered.length > 2048) return false;
  }
  return uncovered.reduce((sum, p) => sum + area(p), 0) <= Math.max(1e-7, required * 1e-8);
}
