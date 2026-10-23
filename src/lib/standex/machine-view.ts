/** Presentation only: stable file identities, current-pose camera bounds. */
import { Box3, Vector3 } from "three";
import type { MachineAsset, MachineNode } from "./machine-assets";
import type { MachineAssembly } from "./machine-assembly";
import { componentPose, isMovingPath, pointAt, usesClip, activeClip } from "./machine-assembly";
import type { Vec3 } from "./magnetic-workshop";

export type MachineFocus = "assembly" | "moving" | "sensor" | "magnet";

/** Hide only meshless one-child wrappers; never rewrite paths or selection. */
export function displayMachineNodes(asset: Pick<MachineAsset, "nodes" | "parts">, detailed: boolean): MachineNode[] {
  if (detailed) return asset.nodes;
  const meshPaths = new Set(asset.parts.map((p) => p.path));
  const childCounts = new Map<string, number>();
  for (const n of asset.nodes) {
    const parent = n.path.slice(0, n.path.lastIndexOf("/"));
    childCounts.set(parent, (childCounts.get(parent) ?? 0) + 1);
  }
  const visible = asset.nodes.filter((n) => {
    return meshPaths.has(n.path) || childCounts.get(n.path) !== 1;
  });
  const visiblePaths = new Set(visible.map((n) => n.path));
  return visible.map((n) => {
    const path = n.path.split("/");
    let depth = 0;
    for (let i = 1; i < path.length; i++) if (visiblePaths.has(path.slice(0, i).join("/"))) depth++;
    return { ...n, depth };
  });
}

export function machineFrame(asset: MachineAsset, m: MachineAssembly, focus: MachineFocus, u: number, sensorSize: Vec3, magnetSize: Vec3): { target: Vec3; radius: number } {
  if (focus === "sensor" || focus === "magnet") {
    return { target: componentPose(m, focus, u).position, radius: Math.max(8, Math.hypot(...(focus === "sensor" ? sensorSize : magnetSize)) / 2) };
  }
  const box = new Box3();
  const clip = usesClip(m) ? activeClip(m) : null;
  for (const p of asset.parts) {
    if (focus === "moving" && !(clip ? clip.affects(p.path) : isMovingPath(m, p.path))) continue;
    if (!p.geometry.boundingBox) p.geometry.computeBoundingBox();
    const bounds = p.geometry.boundingBox;
    if (!bounds) continue;
    for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z])
      box.expandByPoint(new Vector3(...pointAt(m, p.path, [x, y, z], u)));
  }
  if (box.isEmpty()) return { target: asset.center, radius: Math.max(8, Math.hypot(...asset.size) / 2) };
  return { target: box.getCenter(new Vector3()).toArray() as Vec3, radius: Math.max(8, box.getSize(new Vector3()).length() / 2) };
}