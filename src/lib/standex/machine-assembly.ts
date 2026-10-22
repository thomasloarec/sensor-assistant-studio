import { Euler, Quaternion, Vector3 } from "three";
import type { Vec3 } from "./magnetic-workshop";
import { parseAttachment } from "./machine-mounting";
import type { Attachment } from "./machine-mounting";
import { animationFor } from "./machine-clip-registry";
import type { ClipSampler, RigidDelta } from "./machine-clip-registry";

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
  /** Source du mouvement : saisi (`manual`, défaut) ou animation du fichier. */
  motionSource?: "manual" | "clip";
  /** Référence du clip choisi : jamais ses pistes, qui restent dans le fichier. */
  clip?: ClipRef;
  /** Repères de mesure (au plus deux), en pose statique du fichier. */
  markers?: Marker[];
}
export interface ClipRef {
  index: number;
  name: string;
  duration: number;
}
/** Repère cliqué sur une pièce : point en mm dans la pose STATIQUE du fichier,
 *  avec le chemin de sa pièce support. Il suit exactement ce support. */
export interface Marker {
  partPath: string;
  point: Vec3;
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
  return frameAxis(m);
}
function frameAxis(m: MachineAssembly): Vec3 {
  return m.rotationAxis === "x" ? [1, 0, 0] : m.rotationAxis === "y" ? [0, 1, 0] : [0, 0, 1];
}
/** Direction réelle du mouvement : vecteur libre, sinon `unit(travel)` pour une
 *  coulisse (ancien montage), sinon axe du repère pour un pivot. */
export function motionDirection(m: MachineAssembly): Vec3 | null {
  if (m.axisVector) return unit(m.axisVector);
  return m.motion === "translation" ? unit(m.travel) : frameAxis(m);
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
export function componentPose(
  m: MachineAssembly,
  which: "sensor" | "magnet",
  u: number,
): { position: Vec3; transform: (v: Vec3) => Vec3; rotationDeg?: Vec3 } {
  if (usesClip(m)) {
    const position = which === "sensor" ? m.sensorPosition : m.magnetPosition;
    const rotation = which === "sensor" ? m.sensorRotation : m.magnetRotation;
    const attach = which === "sensor" ? m.sensorAttach : m.magnetAttach;
    // Seul un composant ATTACHÉ à une pièce est emporté par le clip : sa
    // transformation est exactement celle de la pièce support.
    const d = attach ? partDelta(m, attach.partPath, u) : null;
    if (!d) return { position, transform: (v) => rotate(v, rotation), rotationDeg: [...rotation] };
    const q = new Quaternion(...d.quaternion);
    const [rx, ry, rz] = rotation.map((n) => (n * Math.PI) / 180) as Vec3;
    const own = new Quaternion().setFromEuler(new Euler(rx, ry, rz, "XYZ"));
    const e = new Euler().setFromQuaternion(q.clone().multiply(own), "XYZ");
    return {
      position: applyDelta(d, position),
      transform: (v) => new Vector3(...rotate(v, rotation)).applyQuaternion(q).toArray() as Vec3,
      rotationDeg: [e.x, e.y, e.z].map((n) => (n * 180) / Math.PI) as Vec3,
    };
  }
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

/* ---------------------------------------------------------------- */
/* Animation du fichier (lot 2)                                      */
/* ---------------------------------------------------------------- */
export const usesClip = (m: MachineAssembly) => m.motionSource === "clip";
/** Point du cycle : un clip est sa PROPRE chronologie (t linéaire, il peut
 *  déjà contenir son retour) ; un mouvement saisi fait l'aller-retour. */
export function cycleU(m: MachineAssembly | null | undefined, t: number): number {
  if (m && usesClip(m)) return Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0));
  return openingAt(t);
}
/** Échantillonneur du clip choisi, seulement si le fichier est chargé et que
 *  ce clip (même index ET même nom) y est réellement pris en charge. */
export function activeClip(m: MachineAssembly): ClipSampler | null {
  if (!usesClip(m) || !m.clip) return null;
  const a = animationFor(m.assetKey, m.unitScale);
  const info = a?.clips[m.clip.index];
  if (!a || !info || info.name !== m.clip.name || !info.supported) return null;
  return a.sampler(m.clip.index);
}
export function clipTime(m: MachineAssembly, u: number): number {
  const s = activeClip(m);
  return s ? u * s.duration : 0;
}
export function applyDelta(d: RigidDelta, p: Vec3): Vec3 {
  return new Vector3(...p)
    .applyQuaternion(new Quaternion(...d.quaternion))
    .add(new Vector3(...d.position))
    .toArray() as Vec3;
}
/** Transformation rigide d'une pièce au point de cycle `u`, null si elle est
 *  fixe. Saisi : celle de la sélection mobile ; clip : celle de SON nœud. */
export function partDelta(m: MachineAssembly, path: string, u: number): RigidDelta | null {
  if (usesClip(m)) {
    const s = activeClip(m);
    return s ? s.deltaAt(path, u * s.duration) : null;
  }
  if (!isMovingPath(m, path)) return null;
  if (m.motion === "translation")
    return { position: scale(m.travel, u), quaternion: [0, 0, 0, 1] };
  const r = movingRotation(m, u).map((n) => (n * Math.PI) / 180) as Vec3;
  const q = new Quaternion().setFromEuler(new Euler(...r, "XYZ"));
  const pivot = new Vector3(...m.pivot);
  const t = pivot.clone().sub(pivot.clone().applyQuaternion(q));
  return { position: t.toArray() as Vec3, quaternion: q.toArray() as [number, number, number, number] };
}
/** Ensemble solidaire d'une pièce : deux points d'un même ensemble bougent ensemble. */
export function partGroup(m: MachineAssembly, path: string): string {
  if (usesClip(m)) {
    const s = activeClip(m);
    return s ? "clip:" + s.groupOf(path) : "clip:";
  }
  return isMovingPath(m, path) ? "moving" : "fixed";
}
/** Position courante d'un point lié à une pièce (mêmes règles que la scène). */
export function pointAt(m: MachineAssembly, path: string, p: Vec3, u: number): Vec3 {
  if (!usesClip(m)) return isMovingPath(m, path) ? movePoint(m, p, u) : p;
  const d = partDelta(m, path, u);
  return d ? applyDelta(d, p) : p;
}
/** Ramène un point (et une normale) relevés dans la pose affichée vers la pose
 *  statique du fichier, base de toutes les attaches et repères. */
export function toRest(
  m: MachineAssembly,
  path: string,
  point: Vec3,
  normal: Vec3,
  u: number,
): { point: Vec3; normal: Vec3 } {
  const d = partDelta(m, path, u);
  if (!d) return { point, normal };
  const inv = new Quaternion(...d.quaternion).invert();
  return {
    point: new Vector3(...point).sub(new Vector3(...d.position)).applyQuaternion(inv).toArray() as Vec3,
    normal: new Vector3(...normal).applyQuaternion(inv).toArray() as Vec3,
  };
}
/** Distance entre les deux repères au point `u`, et sa variation depuis le
 *  début du cycle. Ce n'est PAS un entrefer minimal entre surfaces. */
export function markerReading(
  m: MachineAssembly,
  u: number,
): { distance: number; initial: number; change: number; points: [Vec3, Vec3] } | null {
  const [a, b] = m.markers ?? [];
  if (!a || !b) return null;
  const pa = pointAt(m, a.partPath, a.point, u),
    pb = pointAt(m, b.partPath, b.point, u);
  const distance = norm(add(pa, scale(pb, -1)));
  const initial = norm(
    add(pointAt(m, a.partPath, a.point, 0), scale(pointAt(m, b.partPath, b.point, 0), -1)),
  );
  return { distance, initial, change: distance - initial, points: [pa, pb] };
}
/** Problème propre au clip choisi, ou null. */
function clipProblem(m: MachineAssembly): string | null {
  if (!m.clip) return "Aucune animation choisie : choisissez un clip du fichier ou définissez le mouvement.";
  const a = animationFor(m.assetKey, m.unitScale);
  if (!a) return "Animation du fichier non chargée : aucun contact n'est calculé tant que le fichier n'est pas chargé.";
  const info = a.clips[m.clip.index];
  if (!info || info.name !== m.clip.name)
    return "Animation absente de ce fichier : le clip enregistré n'existe plus. Choisissez un clip disponible ou définissez le mouvement.";
  if (!info.supported)
    return "Animation non prise en charge : ce clip n'est pas un mouvement rigide de pièces. Aucun contact n'est calculé.";
  return null;
}

/** Raison machine pour laquelle aucun cycle n'est calculé, ou null. */
export function motionProblem(m: MachineAssembly): string | null {
  if (usesClip(m)) return clipProblem(m);
  if (movingSelection(m).length === 0)
    return "Aucune pièce mobile choisie : sélectionnez au moins une pièce dans la scène ou la liste.";
  // Un vecteur fourni explicitement est validé BRUT : un axe nul ou non fini
  // n'est jamais remplacé en silence par un axe du repère.
  if (m.axisVector !== undefined && !unit(m.axisVector))
    return "Axe nul ou non fini : choisissez une direction valide.";
  if (m.motionStatus === "unset" || m.motionStatus === "draft")
    return "Mouvement non validé : définissez puis validez le mouvement de la pièce mobile. Aucun contact n'est calculé.";
  if (m.motion === "translation") {
    const s = norm(m.travel);
    if (!Number.isFinite(s) || s < 0.1 || s > 5000)
      return "Course invalide : indiquez une course entre 0,1 et 5000 mm.";
  } else {
    if (!m.pivot.every(Number.isFinite)) return "Pivot non fini : indiquez un point valide.";
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

const BUILTIN = /^(builtin:(coffee|drawer|door|wall|arm)-v1|sha256:[a-f0-9]{64})$/;

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
    const v = x["axisVector"] as Vec3;
    // Un vecteur déjà unitaire est conservé tel quel (relecture exacte).
    out.axisVector = Math.abs(norm(v) - 1) < 1e-12 ? [...v] : unit(v)!;
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
  // Champs lot 2 : source du mouvement, référence de clip, repères.
  if (x["motionSource"] !== undefined) {
    if (!["manual", "clip"].includes(x["motionSource"] as string)) return null;
    out.motionSource = x["motionSource"] as "manual" | "clip";
  }
  if (x["clip"] !== undefined) {
    const c = x["clip"] as Record<string, unknown> | null;
    if (
      !c ||
      typeof c !== "object" ||
      !Number.isInteger(c["index"]) ||
      (c["index"] as number) < 0 ||
      (c["index"] as number) > 999 ||
      typeof c["name"] !== "string" ||
      c["name"].length > 200 ||
      typeof c["duration"] !== "number" ||
      !Number.isFinite(c["duration"]) ||
      c["duration"] <= 0 ||
      c["duration"] > 36000
    )
      return null;
    out.clip = { index: c["index"] as number, name: c["name"], duration: c["duration"] };
  }
  if (out.motionSource === "clip" && !out.clip) return null;
  if (x["markers"] !== undefined) {
    const k = x["markers"];
    if (
      !Array.isArray(k) ||
      k.length > 2 ||
      !k.every(
        (r) =>
          r &&
          typeof r === "object" &&
          typeof (r as Marker).partPath === "string" &&
          (r as Marker).partPath.length > 0 &&
          (r as Marker).partPath.length <= 250 &&
          finiteVec((r as Marker).point),
      )
    )
      return null;
    out.markers = (k as Marker[]).map((r) => ({ partPath: r.partPath, point: [...r.point] as Vec3 }));
  }
  return syncAttachSupports(out);
}

/** Le support d'une attache suit TOUJOURS la sélection mobile réelle : ajouter
 *  ou retirer une pièce (ou son groupe parent) met à jour support et montage. */
export function syncAttachSupports(m: MachineAssembly): MachineAssembly {
  let out = m;
  for (const k of ["sensor", "magnet"] as const) {
    const a = out[`${k}Attach`];
    if (!a) continue;
    const support = isMovingPath(out, a.partPath) ? "moving" : "fixed";
    if (a.support === support && out[`${k}Mount`] === support) continue;
    out = { ...out, [`${k}Attach`]: { ...a, support }, [`${k}Mount`]: support };
  }
  return out;
}

/** Changement d'unités du fichier : tout ce qui est exprimé dans le repère du
 *  modèle (positions, pivot, course, points d'attache) est rééchelonné pour
 *  rester sur la même face ; les tailles des produits, angles, écarts et
 *  profondeurs physiques (mm) sont conservés. */
export function rescaleMachine(m: MachineAssembly, unitScale: number): MachineAssembly {
  const r = unitScale / m.unitScale;
  if (!Number.isFinite(r) || r === 1) return { ...m, unitScale };
  const out: MachineAssembly = {
    ...m,
    unitScale,
    sensorPosition: scale(m.sensorPosition, r),
    magnetPosition: scale(m.magnetPosition, r),
    pivot: scale(m.pivot, r),
    travel: scale(m.travel, r),
  };
  if (m.sensorAttach) out.sensorAttach = { ...m.sensorAttach, point: scale(m.sensorAttach.point, r) };
  if (m.magnetAttach) out.magnetAttach = { ...m.magnetAttach, point: scale(m.magnetAttach.point, r) };
  if (m.markers) out.markers = m.markers.map((k) => ({ ...k, point: scale(k.point, r) }));
  // La course a changé d'échelle : elle doit être revue et revalidée.
  if (m.motionStatus === "confirmed" || m.motionStatus === undefined) out.motionStatus = "draft";
  return out;
}
