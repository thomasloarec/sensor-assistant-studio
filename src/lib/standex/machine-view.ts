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
  const visible = asset.nodes.filter((n) => {
    const ownMesh = asset.parts.some((p) => p.path === n.path);
    const children = asset.nodes.filter((c) => c.path.slice(0, c.path.lastIndexOf("/")) === n.path);
    return ownMesh || children.length !== 1;
  });
  return visible.map((n) => ({ ...n, depth: visible.filter((p) => n.path.startsWith(p.path + "/")).length }));
}

export function machineFrame(asset: MachineAsset, m: MachineAssembly, focus: MachineFocus, u: number, sensorSize: Vec3, magnetSize: Vec3): { target: Vec3; radius: number } {
  if (focus === "sensor" || focus === "magnet") {
    return { target: componentPose(m, focus, u).position, radius: Math.max(8, Math.hypot(...(focus === "sensor" ? sensorSize : magnetSize)) / 2) };
  }
  const box = new Box3();
  const clip = usesClip(m) ? activeClip(m) : null;
  for (const p of asset.parts) {
    if (focus === "moving" && !(clip ? clip.affects(p.path) : isMovingPath(m, p.path))) continue;
    p.geometry.computeBoundingBox();
    const bounds = p.geometry.boundingBox;
    if (!bounds) continue;
    for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z])
      box.expandByPoint(new Vector3(...pointAt(m, p.path, [x, y, z], u)));
  }
  if (box.isEmpty()) return { target: asset.center, radius: Math.max(8, Math.hypot(...asset.size) / 2) };
  return { target: box.getCenter(new Vector3()).toArray() as Vec3, radius: Math.max(8, box.getSize(new Vector3()).length() / 2) };
}