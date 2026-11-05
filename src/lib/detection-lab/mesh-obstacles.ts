/** Loaded-mesh narrow phase. Pure numeric data can be shared with workers.
 * Vertices are relative to the broad-phase box centre, in its local axes.
 * Open surfaces obstruct crossing; only watertight components enclose solids.
 */
import type { Vec3 } from "./field";
import type { Obb } from "./obstacles";

type Triangle = [Vec3, Vec3, Vec3];
interface Node {
  min: Vec3;
  max: Vec3;
  children?: [Node, Node];
  ids?: number[];
}
export interface MeshObstacle {
  triangles: Triangle[];
  solid: boolean[];
  root: Node;
  signature: string;
}
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const axes: Vec3[] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

export function buildMeshObstacle(triangles: Triangle[]): MeshObstacle | undefined {
  // Identical render copies must not turn a single open surface into a solid.
  // Keep opposite windings: touching solids can carry two internal faces.
  const seen = new Set<string>();
  triangles = triangles.filter((t) => {
    const keys = t.map((v) => v.join(","));
    const key = [0, 1, 2]
      .map((i) => [keys[i], keys[(i + 1) % 3], keys[(i + 2) % 3]].join("|"))
      .sort()[0]!;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (!triangles.length) return undefined;
  const parent = triangles.map((_, i) => i),
    edges = new Map<string, number[]>();
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]!]!;
      i = parent[i]!;
    }
    return i;
  };
  // Weld duplicated render vertices, but never bridge physically distinct faces.
  const key = (v: Vec3) => v.map((x) => Math.round(x / 1e-5)).join(",");
  let hash = 2166136261;
  triangles.forEach((t, i) => {
    const keys = t.map(key);
    for (const v of t)
      for (const x of v)
        for (const ch of `${x};`) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619);
    for (let j = 0; j < 3; j++) {
      const k = [keys[j]!, keys[(j + 1) % 3]!].sort().join("|"),
        list = edges.get(k);
      if (list) {
        parent[find(i)] = find(list[0]!);
        list.push(i);
      } else edges.set(k, [i]);
    }
  });
  const open = new Set<number>();
  for (const ids of edges.values())
    if (ids.length % 2 !== 0) for (const i of ids) open.add(find(i));
  const solid = triangles.map((_, i) => !open.has(find(i)));
  const build = (ids: number[]): Node => {
    const min: Vec3 = [Infinity, Infinity, Infinity],
      max: Vec3 = [-Infinity, -Infinity, -Infinity];
    for (const i of ids)
      for (const v of triangles[i]!)
        for (let k = 0; k < 3; k++) {
          min[k] = Math.min(min[k]!, v[k]!);
          max[k] = Math.max(max[k]!, v[k]!);
        }
    if (ids.length <= 8) return { min, max, ids };
    let axis = 0;
    for (let k = 1; k < 3; k++) if (max[k]! - min[k]! > max[axis]! - min[axis]!) axis = k;
    ids.sort(
      (a, b) =>
        triangles[a]!.reduce((s, v) => s + v[axis]!, 0) -
        triangles[b]!.reduce((s, v) => s + v[axis]!, 0),
    );
    const mid = Math.floor(ids.length / 2);
    return { min, max, children: [build(ids.slice(0, mid)), build(ids.slice(mid))] };
  };
  return {
    triangles,
    solid,
    root: build(triangles.map((_, i) => i)),
    signature: `mesh-v1:${triangles.length}:${hash >>> 0}`,
  };
}

/** Triangle / box SAT in the body's own coordinates. Shrinking by tolerance
 * permits a mounting face to touch the body without declaring penetration. */
function triangleIntersects(t: Triangle, h: Vec3): boolean {
  const edges = [sub(t[1], t[0]), sub(t[2], t[1]), sub(t[0], t[2])];
  const candidates = [
    ...axes,
    cross(edges[0]!, edges[1]!),
    ...edges.flatMap((e) => axes.map((a) => cross(e, a))),
  ];
  return candidates.every((n) => {
    if (dot(n, n) < 1e-20) return true;
    const p = t.map((v) => dot(v, n)),
      r = h[0] * Math.abs(n[0]) + h[1] * Math.abs(n[1]) + h[2] * Math.abs(n[2]);
    return Math.min(...p) <= r && Math.max(...p) >= -r;
  });
}

export function meshIntersects(
  body: Obb,
  obstacle: Obb,
  mesh: MeshObstacle,
  tolerance: number,
): boolean {
  const local = (v: Vec3): Vec3 => obstacle.a.map((a) => dot(v, a)) as Vec3;
  const c = local(sub(body.c, obstacle.c)),
    a = body.a.map(local) as [Vec3, Vec3, Vec3];
  const h = body.h.map((v) => Math.max(0, v - tolerance)) as Vec3;
  const extent = axes.map((_, k) => h.reduce((s, v, i) => s + v * Math.abs(a[i]![k]!), 0));
  const toBody = (v: Vec3): Vec3 => a.map((n) => dot(sub(v, c), n)) as Vec3;
  const touches = (node: Node): boolean => {
    if (axes.some((_, k) => c[k]! + extent[k]! < node.min[k]! || c[k]! - extent[k]! > node.max[k]!))
      return false;
    if (node.children) return node.children.some(touches);
    return node.ids!.some((i) => triangleIntersects(mesh.triangles[i]!.map(toBody) as Triangle, h));
  };
  if (touches(mesh.root)) return true;
  // With no surface crossing, test whether the body centre is inside a closed
  // component. Signed crossings retain hollow interiors and cancel internal
  // faces of touching solids; shared triangle-edge hits count only once.
  const direction: Vec3 = [1, 0.3713906763541037, 0.613281947];
  const rayBox = (n: Node) => {
    let lo = 0,
      hi = Infinity;
    for (let k = 0; k < 3; k++) {
      const p = (n.min[k]! - c[k]!) / direction[k]!,
        q = (n.max[k]! - c[k]!) / direction[k]!;
      lo = Math.max(lo, Math.min(p, q));
      hi = Math.min(hi, Math.max(p, q));
    }
    return hi >= lo;
  };
  const hits: { distance: number; sign: number }[] = [];
  const ray = (node: Node) => {
    if (!rayBox(node)) return;
    if (node.children) {
      node.children.forEach(ray);
      return;
    }
    for (const i of node.ids!) {
      if (!mesh.solid[i]) continue;
      const t = mesh.triangles[i]!,
        e1 = sub(t[1], t[0]),
        e2 = sub(t[2], t[0]),
        p = cross(direction, e2),
        det = dot(e1, p);
      if (Math.abs(det) < 1e-12) continue;
      const s = sub(c, t[0]),
        u = dot(s, p) / det,
        q = cross(s, e1),
        v = dot(direction, q) / det,
        d = dot(e2, q) / det;
      if (u >= -1e-10 && v >= -1e-10 && u + v <= 1 + 1e-10 && d > tolerance)
        hits.push({ distance: d, sign: Math.sign(det) });
    }
  };
  ray(mesh.root);
  hits.sort((x, y) => x.distance - y.distance || x.sign - y.sign);
  let winding = 0;
  for (let i = 0; i < hits.length;) {
    const distance = hits[i]!.distance,
      signs = new Set<number>();
    do {
      signs.add(hits[i]!.sign);
      i++;
    } while (i < hits.length && hits[i]!.distance - distance <= 1e-6);
    for (const sign of signs) winding += sign;
  }
  return winding !== 0;
}
