import { Matrix4, Quaternion, Vector3 } from "three";
import { componentPose, pointAt, toRest, type MachineAssembly } from "./machine-assembly";
import { faceTangents, projectOntoFace } from "./machine-alignment";
import { mountingFace, footprintFits, type MountingFace } from "./machine-face";
import { ATTACH_LIMIT_MM, attachPose, surfaceFootprint } from "./machine-mounting";
import { magnetSize, type WorkshopConfig, type Vec3 } from "./magnetic-workshop";
import { sensorById } from "./sensor-catalog";
import type { MachineAsset } from "./machine-assets";

export function surfaceMoveFrame(m:MachineAssembly, which:"sensor"|"magnet", u=0) {
  const a=which==="sensor"?m.sensorAttach:m.magnetAttach;
  if(a?.kind!=="surface")return null;
  const origin=new Vector3(...pointAt(m,a.partPath,a.point,u));
  const axes=faceTangents(a.normal).map(v=>new Vector3(...pointAt(m,a.partPath,
    a.point.map((q,i)=>q+v[i]!) as Vec3,u)).sub(origin).normalize());
  const normal=axes[0]!.clone().cross(axes[1]!).normalize();
  return {position:componentPose(m,which,u).position,
    quaternion:new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(axes[0]!,axes[1]!,normal))};
}

/** Drag only changes the original anchor tangentially. Never detach, switch
 * support or accept a position outside the finite connected face. */
export function surfaceMovePatch(c:WorkshopConfig,asset:MachineAsset,which:"sensor"|"magnet",worldCentre:Vec3,u=0,cachedFace?:MountingFace|null):Partial<MachineAssembly>|null {
  const m=c.machine,a=which==="sensor"?m?.sensorAttach:m?.magnetAttach;
  if(!m||a?.kind!=="surface"||!worldCentre.every(Number.isFinite))return null;
  const size=(which==="sensor"?sensorById(c.sensorId).body:magnetSize(c)) as Vec3;
  const face=cachedFace===undefined?mountingFace(asset,a):cachedFace;
  if(!face)return null;
  const centre=toRest(m,a.partPath,worldCentre,[0,0,1],u).point;
  const rest=attachPose(a,{lengthMm:size[0],heightMm:size[1]});
  const next=projectOntoFace(a,a.point.map((v,i)=>v+centre[i]!-rest.position[i]!) as Vec3);
  if(next.point.some(v=>Math.abs(v)>10000)||!footprintFits(face,next.point,surfaceFootprint(a,size)))return null;
  const pose=attachPose(next,{lengthMm:size[0],heightMm:size[1]});
  return which==="sensor"
    ? {sensorAttach:next,sensorPosition:pose.position,sensorRotation:pose.rotation}
    : {magnetAttach:next,magnetPosition:pose.position,magnetRotation:pose.rotation};
}

/** Same move tool: two tangent axes on a face, only the insertion axis in a hole. */
export function mountingMoveFrame(m: MachineAssembly, which: "sensor" | "magnet", u = 0) {
  const a = which === "sensor" ? m.sensorAttach : m.magnetAttach;
  if (a?.kind !== "through") return surfaceMoveFrame(m, which, u);
  const origin = new Vector3(...pointAt(m, a.partPath, a.point, u));
  const insertion = a.normal.map(v => v * (a.flip ? 1 : -1)) as Vec3;
  const direction = new Vector3(...pointAt(m, a.partPath,
    a.point.map((v, i) => v + insertion[i]!) as Vec3, u)).sub(origin).normalize();
  return { position: componentPose(m, which, u).position,
    quaternion: new Quaternion().setFromUnitVectors(new Vector3(1, 0, 0), direction) };
}

/** Insertion changes only depth. The designated hole centre, axis, support,
 * reference end and rotation stay exact, including on an animated support. */
export function mountingMovePatch(c: WorkshopConfig, asset: MachineAsset, which: "sensor" | "magnet",
  worldCentre: Vec3, u = 0, cachedFace?: MountingFace | null): Partial<MachineAssembly> | null {
  const m = c.machine, a = which === "sensor" ? m?.sensorAttach : m?.magnetAttach;
  if (a?.kind !== "through") return surfaceMovePatch(c, asset, which, worldCentre, u, cachedFace);
  if (!m || which !== "sensor" || !worldCentre.every(Number.isFinite)) return null;
  const size = sensorById(c.sensorId).body;
  const dims = { lengthMm: size[0], heightMm: size[1] };
  const rest = attachPose(a, dims);
  const centre = toRest(m, a.partPath, worldCentre, [0, 0, 1], u).point;
  const direction = new Vector3(...a.normal).normalize().multiplyScalar(a.flip ? 1 : -1);
  const offsetMm = a.offsetMm + new Vector3(...centre).sub(new Vector3(...rest.position)).dot(direction);
  if (!Number.isFinite(offsetMm) || Math.abs(offsetMm) > ATTACH_LIMIT_MM) return null;
  const next = { ...a, offsetMm };
  const pose = attachPose(next, dims);
  if (pose.position.some(v => !Number.isFinite(v) || Math.abs(v) > 10000)) return null;
  return { sensorAttach: next, sensorPosition: pose.position, sensorRotation: pose.rotation };
}
