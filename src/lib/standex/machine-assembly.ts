import { Euler, Quaternion, Vector3 } from "three";
import type { Vec3 } from "./magnetic-workshop";
import { parseAttachment } from "./machine-mounting";
import type { Attachment } from "./machine-mounting";

/** État du mouvement de la pièce mobile.
 *  - `unset` : nouveau fichier, aucun mouvement n'a été défini par l'utilisateur ;
 *  - `draft` : mouvement en cours de réglage, pas encore validé ;
 *  - `confirmed` : mouvement validé explicitement (ou fourni par un exemple).
 *  Absent = ancien montage V3, dont le mouvement a été saisi : traité comme validé. */
export type MotionStatus = "unset" | "draft" | "confirmed";

export interface MachineAssembly {
  assetKey: string;
  fileName: string;
  unitScale: number;
  /** Premier élément de la sélection mobile : conservé pour les anciens lecteurs. */
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
  /** Sélection mobile complète (pièces ou groupes). Absent = `[movingNode]`. */
  movingNodes?: string[];
  /** Axe de pivot quelconque. Absent = axe `rotationAxis` du repère. */
  axisVector?: Vec3;
  motionStatus?: MotionStatus;
  sensorAttach?: Attachment;
  magnetAttach?: Attachment;
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
/** Clés d'origine : un montage V3 n'en contient pas d'autres. */
const LEGACY_KEYS = Object.keys(COFFEE_ASSEMBLY) as (keyof MachineAssembly)[];

export const add = (a: Vec3, b: Vec3): Vec3 => a.map((v, i) => v + b[i]!) as Vec3;
export const scale = (a: Vec3, s: number): Vec3 => a.map((v) => v * s) as Vec3;
export const norm = (a: Vec3) => Math.hypot(...a);
export function unit(a: Vec3): Vec3 | null {
  const n = norm(a);
  return Number.isFinite(n) && n > 1e-9 ? (a.map((v) => v / n) as Vec3) : null;
}
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
/** Axe unitaire du pivot : vecteur libre s'il existe, sinon axe du repère. */
export function motionAxis(m: MachineAssembly): Vec3 {
  if (m.axisVector) {
    const u = unit(m.axisVector);
    if (u) return u;
  }
  return m.rotationAxis === "x" ? [1, 0, 0] : m.rotationAxis === "y" ? [0, 1, 0] : [0, 0, 1];
}
/** Rotation de la pièce mobile en Euler XYZ (degrés). Un axe incliné passe par
 *  un quaternion axe-angle : capteur, aimant, scène et calcul partagent cette
 *  même transformation. Sans `axisVector`, résultat identique aux montages V3. */
export function movingRotation(m: MachineAssembly, u: number): Vec3 {
  const r: Vec3 = [0, 0, 0];
  if (m.motion !== "rotation") return r;
  if (!m.axisVector) {
    r[{ x: 0, y: 1, z: 2 }[m.rotationAxis]] = m.openingAngle * u;
    return r;
  }
  const q = new Quaternion().setFromAxisAngle(
    new Vector3(...motionAxis(m)),
    (m.openingAngle * u * Math.PI) / 180,
  );
  const e = new Euler().setFromQuaternion(q, "XYZ");
  return [e.x, e.y, e.z].map((n) => (n * 180) / Math.PI) as Vec3;
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

/** Une pièce appartient-elle à un nœud (lui-même ou descendant) ? */
export const within = (path: string, node: string) =>
  node !== "" && (path === node || path.startsWith(node + "/"));
/** Retire doublons et descendants d'un groupe déjà choisi : chaque pièce ne
 *  reçoit la transformation qu'une seule fois. */
export function normalizeSelection(nodes: readonly string[]): string[] {
  const unique = [...new Set(nodes.filter((n) => n !== ""))];
  return unique.filter((n) => !unique.some((o) => o !== n && within(n, o)));
}
export function movingSelection(m: MachineAssembly): string[] {
  return normalizeSelection(m.movingNodes ?? (m.movingNode ? [m.movingNode] : []));
}
export const isMovingPath = (m: MachineAssembly, path: string) =>
  movingSelection(m).some((n) => within(path, n));
/** Ajoute ou retire un nœud de la sélection, sans double inclusion. */
export function toggleMoving(m: MachineAssembly, node: string): Pick<MachineAssembly, "movingNodes" | "movingNode"> {
  const current = movingSelection(m);
  const next = current.includes(node)
    ? current.filter((n) => n !== node)
    : normalizeSelection([...current.filter((n) => !within(n, node)), node]);
  return { movingNodes: next, movingNode: next[0] ?? "" };
}

/** Raison machine pour laquelle aucun cycle n'est calculé, ou null. */
export function motionProblem(m: MachineAssembly): string | null {
  if (movingSelection(m).length === 0)
    return "Aucune pièce mobile choisie : sélectionnez au moins une pièce dans la scène ou la liste.";
  if (m.motionStatus === "unset" || m.motionStatus === "draft")
    return "Mouvement non validé : définissez puis validez le mouvement de la pièce mobile. Aucun contact n'est calculé.";
  if (m.motion === "translation") {
    const s = norm(m.travel);
    if (!Number.isFinite(s) || s < 0.1 || s > 5000)
      return "Course invalide : indiquez une course entre 0,1 et 5000 mm.";
  } else {
    if (!unit(motionAxis(m))) return "Axe de pivot nul : choisissez un axe.";
    const a = Math.abs(m.openingAngle);
    if (!Number.isFinite(a) || a < 0.1 || a > 360)
      return "Angle invalide : indiquez un angle entre 0,1 et 360°.";
  }
  return null;
}

const finiteVec = (v: unknown, max = 10000): v is Vec3 =>
  Array.isArray(v) &&
  v.length === 3 &&
  v.every((n) => typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= max);

const BUILTIN = /^(builtin:(coffee|drawer|door|wall)-v1|sha256:[a-f0-9]{64})$/;

export function parseMachine(value: unknown): MachineAssembly | null {
  if (!value || typeof value !== "object") return null;
  const x = value as Record<string, unknown>;
  if (typeof x["assetKey"] !== "string" || !BUILTIN.test(x["assetKey"])) return null;
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
  ])
    if (!finiteVec(x[k])) return null;
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
  const out = Object.fromEntries(LEGACY_KEYS.map((k) => [k, x[k]])) as unknown as MachineAssembly;
  // Champs V4 : facultatifs, validés strictement ; toute valeur invalide rejette
  // le montage plutôt que de le corriger en silence.
  if (x["movingNodes"] !== undefined) {
    const n = x["movingNodes"];
    if (
      !Array.isArray(n) ||
      n.length > 200 ||
      !n.every((s) => typeof s === "string" && s.length > 0 && s.length <= 250)
    )
      return null;
    out.movingNodes = normalizeSelection(n as string[]);
    out.movingNode = out.movingNodes[0] ?? "";
  }
  if (x["axisVector"] !== undefined) {
    if (!finiteVec(x["axisVector"]) || !unit(x["axisVector"] as Vec3)) return null;
    out.axisVector = unit(x["axisVector"] as Vec3)!;
  }
  if (x["motionStatus"] !== undefined) {
    if (!["unset", "draft", "confirmed"].includes(x["motionStatus"] as string)) return null;
    out.motionStatus = x["motionStatus"] as MotionStatus;
  }
  for (const k of ["sensorAttach", "magnetAttach"] as const) {
    if (x[k] === undefined || x[k] === null) continue;
    const a = parseAttachment(x[k]);
    if (!a) return null;
    out[k] = a;
  }
  return out;
}
