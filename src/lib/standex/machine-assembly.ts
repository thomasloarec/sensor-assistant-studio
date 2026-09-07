import type { Vec3 } from "./magnetic-workshop";

export interface MachineAssembly {
  assetKey: string;
  fileName: string;
  unitScale: number;
  movingNode: string;
  sensorPosition: Vec3;
  sensorRotation: Vec3;
  magnetPosition: Vec3;
  magnetRotation: Vec3;
  sensorMount: "fixed" | "moving";
  magnetMount: "fixed" | "moving";
  travel: Vec3;
  motion: "translation" | "rotation";
  pivot: Vec3;
  rotationAxis: "x" | "y" | "z";
  openingAngle: number;
  space: Vec3;
}
export const COFFEE_ASSET = "builtin:coffee-v1";
export const COFFEE_ASSEMBLY: MachineAssembly = {
  assetKey: COFFEE_ASSET,
  fileName: "machine-cafe-bac-mobile.glb",
  unitScale: 1000,
  movingNode: "0/1",
  sensorPosition: [99, 73.8, 62],
  sensorRotation: [0, 0, 0],
  magnetPosition: [85, 75, 62],
  magnetRotation: [0, 0, 0],
  sensorMount: "fixed",
  magnetMount: "moving",
  travel: [0, 0, 130],
  motion: "translation",
  pivot: [0, 0, 0],
  rotationAxis: "y",
  openingAngle: 90,
  space: [12, 8, 12],
};
export const add = (a: Vec3, b: Vec3): Vec3 => a.map((v, i) => v + b[i]!) as Vec3;
export const scale = (a: Vec3, s: number): Vec3 => a.map((v) => v * s) as Vec3;
/** XYZ Euler rotation, matching Three.js Euler order XYZ. */
export function rotate(v: Vec3, degrees: Vec3): Vec3 {
  const [a, b, c] = degrees.map((d) => (d * Math.PI) / 180),
    [x, y, z] = v;
  const x1 = x * Math.cos(c!) - y * Math.sin(c!),
    y1 = x * Math.sin(c!) + y * Math.cos(c!);
  const x2 = x1 * Math.cos(b!) + z * Math.sin(b!),
    z2 = -x1 * Math.sin(b!) + z * Math.cos(b!);
  return [x2, y1 * Math.cos(a!) - z2 * Math.sin(a!), y1 * Math.sin(a!) + z2 * Math.cos(a!)];
}
export function openingAt(t: number): number {
  return t <= 0.5 ? t * 2 : (1 - t) * 2;
}
export function movingRotation(m: MachineAssembly, u: number): Vec3 {
  const r: Vec3 = [0, 0, 0];
  if (m.motion === "rotation") r[{ x: 0, y: 1, z: 2 }[m.rotationAxis]] = m.openingAngle * u;
  return r;
}
export function movePoint(m: MachineAssembly, p: Vec3, u: number): Vec3 {
  if (m.motion === "translation") return add(p, scale(m.travel, u));
  return add(m.pivot, rotate(add(p, scale(m.pivot, -1)), movingRotation(m, u)));
}
export function componentPose(m: MachineAssembly, which: "sensor" | "magnet", u: number) {
  const position = which === "sensor" ? m.sensorPosition : m.magnetPosition;
  const rotation = which === "sensor" ? m.sensorRotation : m.magnetRotation;
  const moving = (which === "sensor" ? m.sensorMount : m.magnetMount) === "moving";
  const transform = (v: Vec3) =>
    moving ? rotate(rotate(v, rotation), movingRotation(m, u)) : rotate(v, rotation);
  return { position: moving ? movePoint(m, position, u) : position, transform };
}
export function parseMachine(value: unknown): MachineAssembly | null {
  if (!value || typeof value !== "object") return null;
  const x = value as Record<string, unknown>;
  if (
    typeof x["assetKey"] !== "string" ||
    !/^(builtin:coffee-v1|sha256:[a-f0-9]{64})$/.test(x["assetKey"])
  )
    return null;
  if (
    typeof x["fileName"] !== "string" ||
    x["fileName"].length > 180 ||
    typeof x["movingNode"] !== "string" ||
    x["movingNode"].length > 250
  )
    return null;
  if (![1, 10, 1000].includes(x["unitScale"] as number)) return null;
  for (const k of [
    "sensorPosition",
    "sensorRotation",
    "magnetPosition",
    "magnetRotation",
    "travel",
    "pivot",
    "space",
  ]) {
    const v = x[k];
    if (
      !Array.isArray(v) ||
      v.length !== 3 ||
      !v.every((n) => typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= 10000)
    )
      return null;
  }
  if (!(x["space"] as number[]).every((n) => n > 0 && n <= 1000)) return null;
  if (
    !["fixed", "moving"].includes(x["sensorMount"] as string) ||
    !["fixed", "moving"].includes(x["magnetMount"] as string) ||
    !["translation", "rotation"].includes(x["motion"] as string) ||
    !["x", "y", "z"].includes(x["rotationAxis"] as string) ||
    typeof x["openingAngle"] !== "number" ||
    !Number.isFinite(x["openingAngle"]) ||
    Math.abs(x["openingAngle"]) > 360
  )
    return null;
  return Object.fromEntries(
    Object.keys(COFFEE_ASSEMBLY).map((k) => [k, x[k]]),
  ) as unknown as MachineAssembly;
}
