/** Géométrie de précision de l'installation : centre désigné dans un plan et
 *  centrage de l'aimant en face du capteur.
 *
 *  Toutes les attaches restent stockées en pose STATIQUE du fichier ; les
 *  calculs lisent les poses au même instant `u` que la scène, via
 *  `partDelta`/`pointAt`/`componentPose`, puis reconvertissent vers le repos.
 *
 *  Ce module ne reconnaît AUCUN trou, diamètre ou perçage : le centre est le
 *  point que l'utilisateur désigne sur le plan de la face d'entrée. Le centrage
 *  de l'aimant est une projection géométrique sur sa face de pose, jamais une
 *  coaxialité magnétique ni une garantie de détection.
 *
 *  i18n-canonical : les messages refusés sont traduits au rendu par t(). */
import { Quaternion, Vector3 } from "three";
import type { Vec3 } from "./magnetic-workshop";
import type { MachineAssembly } from "./machine-assembly";
import { componentPose, partDelta, pointAt } from "./machine-assembly";
import type { Attachment } from "./machine-mounting";

const v3 = (a: Vec3) => new Vector3(...a);
const arr = (v: Vector3) => v.toArray() as Vec3;
const finiteVec = (a: Vec3) => a.every((n) => Number.isFinite(n));
/** Bornes de coordonnées acceptées par la relecture d'une attache. */
const COORD_LIMIT = 10000;

/** Rotation d'une direction par la transformation de sa pièce à l'instant u. */
function dirAt(m: MachineAssembly, path: string, dir: Vec3, u: number): Vector3 {
  const d = partDelta(m, path, u);
  const v = v3(dir);
  return d ? v.applyQuaternion(new Quaternion(...d.quaternion)) : v;
}
/** Direction affichée → direction en pose statique. */
function dirToRest(m: MachineAssembly, path: string, dir: Vector3, u: number): Vector3 {
  const d = partDelta(m, path, u);
  return d ? dir.clone().applyQuaternion(new Quaternion(...d.quaternion).invert()) : dir.clone();
}

export type Refusal = { ok: false; reason: string };

/** Intersection d'un rayon et d'un plan (aucun raycast sur les pièces). */
export function rayPlane(
  origin: Vec3,
  dir: Vec3,
  planePoint: Vec3,
  normal: Vec3,
): { ok: true; point: Vec3 } | Refusal {
  const n = v3(normal),
    d = v3(dir);
  if (!finiteVec(origin) || !finiteVec(dir) || n.lengthSq() < 1e-12 || d.lengthSq() < 1e-12)
    return { ok: false, reason: "Point refusé : rayon ou plan illisible. Aucun réglage n'a été modifié." };
  n.normalize();
  d.normalize();
  const den = d.dot(n);
  if (Math.abs(den) < 0.02)
    return {
      ok: false,
      reason:
        "Vue rasante : le regard est presque parallèle à la paroi. Tournez la vue face au trou puis cliquez son centre. Aucun réglage n'a été modifié.",
    };
  const t = v3(planePoint).sub(v3(origin)).dot(n) / den;
  if (!Number.isFinite(t) || t <= 0)
    return { ok: false, reason: "Le plan de la paroi est derrière la caméra : tournez la vue vers la paroi. Aucun réglage n'a été modifié." };
  const p = arr(v3(origin).addScaledVector(d, t));
  if (!finiteVec(p) || p.some((x) => Math.abs(x) > COORD_LIMIT))
    return { ok: false, reason: "Point trop éloigné du modèle : cliquez le centre du trou plus près de la paroi. Aucun réglage n'a été modifié." };
  return { ok: true, point: p };
}

/** Face d'entrée verrouillée par le premier clic, en pose statique du fichier. */
export interface LockedPlane {
  path: string;
  moving: boolean;
  group?: string | undefined;
  point: Vec3;
  normal: Vec3;
}
/** Plan verrouillé tel qu'affiché à l'instant u (suit sa pièce support). */
export function planeAt(m: MachineAssembly, plane: LockedPlane, u: number): { point: Vec3; normal: Vec3 } {
  return {
    point: pointAt(m, plane.path, plane.point, u),
    normal: arr(dirAt(m, plane.path, plane.normal, u).normalize()),
  };
}

/** Second clic du parcours « Centrer dans un trou » : le rayon de la caméra est
 *  coupé par le plan de la face d'entrée, quelle que soit la pièce derrière.
 *  Le support, le plan et la normale restent ceux du premier clic ; profondeur,
 *  référence, inversion et rotation précédentes sont conservées. */
export function holeCentreAttach(
  m: MachineAssembly,
  plane: LockedPlane,
  ray: { origin: Vec3; direction: Vec3 },
  u: number,
  previous: Attachment | undefined,
): { ok: true; attach: Attachment } | Refusal {
  const shown = planeAt(m, plane, u);
  const hit = rayPlane(ray.origin, ray.direction, shown.point, shown.normal);
  if (!hit.ok) return hit;
  const d = partDelta(m, plane.path, u);
  const rest = d
    ? arr(v3(hit.point).sub(v3(d.position)).applyQuaternion(new Quaternion(...d.quaternion).invert()))
    : hit.point;
  const same = previous?.kind === "through";
  const n = v3(plane.normal).normalize();
  // Le point reste exactement dans le plan statique (élimine l'arrondi).
  const onPlane = v3(rest).addScaledVector(n, -v3(rest).sub(v3(plane.point)).dot(n));
  return {
    ok: true,
    attach: {
      kind: "through",
      support: plane.moving ? "moving" : "fixed",
      partPath: plane.path,
      point: arr(onPlane),
      normal: arr(n),
      offsetMm: same ? previous!.offsetMm : 0,
      spinDeg: same ? previous!.spinDeg : 0,
      flip: same ? previous!.flip : false,
      depthRef: same ? previous!.depthRef : "collar",
      axisSource: "plane-centre",
    },
  };
}

/** Axe longitudinal (X local) du capteur affiché à l'instant u. */
function sensorAxisAt(m: MachineAssembly, u: number): Vector3 | null {
  const pose = componentPose(m, "sensor", u);
  const a = v3(pose.transform([1, 0, 0]));
  return a.lengthSq() > 1e-12 ? a.normalize() : null;
}

/** « Aligner avec le capteur » : déplace l'aimant UNIQUEMENT dans le plan de sa
 *  face de pose pour que son centre soit la projection du centre du capteur
 *  sur ce plan, à l'instant u. Pièce, normale, écart, rotation, retournement et
 *  support sont conservés ; le point d'attache est recalculé en pose statique,
 *  donc le suivi de la pièce mobile (coulisse, pivot, clip) reste intact. */
export function alignMagnetToSensor(
  m: MachineAssembly,
  u: number,
): { ok: true; attach: Attachment; shiftMm: number; oblique: boolean } | Refusal {
  const a = m.magnetAttach;
  if (!a || a.kind !== "surface")
    return { ok: false, reason: "Alignement indisponible : posez d'abord l'aimant sur une surface." };
  const sensor = v3(componentPose(m, "sensor", u).position);
  const magnet = v3(componentPose(m, "magnet", u).position);
  const n = dirAt(m, a.partPath, a.normal, u).normalize();
  const gap = sensor.clone().sub(magnet);
  const shift = gap.clone().addScaledVector(n, -gap.dot(n));
  if (![...shift.toArray(), ...magnet.toArray(), ...sensor.toArray()].every(Number.isFinite))
    return { ok: false, reason: "Alignement refusé : pose du capteur ou de l'aimant illisible. Aucun réglage n'a été modifié." };
  const restShift = dirToRest(m, a.partPath, shift, u);
  const point = arr(v3(a.point).add(restShift));
  if (point.some((x) => Math.abs(x) > COORD_LIMIT))
    return { ok: false, reason: "Alignement refusé : le point obtenu sort du modèle. Aucun réglage n'a été modifié." };
  const axis = sensorAxisAt(m, u);
  // Un capteur traversant oblique à la face n'est PAS rendu coaxial : centrage par projection seulement.
  const oblique = m.sensorAttach?.kind === "through" && !!axis && Math.abs(axis.dot(n)) < 0.999;
  return { ok: true, attach: { ...a, point }, shiftMm: shift.length(), oblique };
}

/** Deux directions tangentes à une face, stables et orthonormées. */
export function faceTangents(normal: Vec3): [Vec3, Vec3] {
  const n = v3(normal).normalize();
  const abs = [Math.abs(n.x), Math.abs(n.y), Math.abs(n.z)];
  const i = abs.indexOf(Math.min(...abs));
  const ref = new Vector3(i === 0 ? 1 : 0, i === 1 ? 1 : 0, i === 2 ? 1 : 0);
  const t1 = ref.addScaledVector(n, -ref.dot(n)).normalize();
  const t2 = n.clone().cross(t1).normalize();
  return [arr(t1), arr(t2)];
}
/** Déplacement dans le plan de la face (mm le long des deux tangentes). */
export function shiftAlongFace(a: Attachment, du: number, dv: number): Attachment {
  const [t1, t2] = faceTangents(a.normal);
  return { ...a, point: arr(v3(a.point).addScaledVector(v3(t1), du).addScaledVector(v3(t2), dv)) };
}
/** Coordonnée saisie : le point demandé est projeté sur la face conservée. */
export function projectOntoFace(a: Attachment, target: Vec3): Attachment {
  const n = v3(a.normal).normalize();
  const t = v3(target);
  return { ...a, point: arr(t.addScaledVector(n, -t.clone().sub(v3(a.point)).dot(n))) };
}
/** Lecture d'une direction : « +X » si elle suit un axe, sinon ses composantes. */
export function directionLabel(v: Vec3): string {
  const names = ["X", "Y", "Z"];
  const i = v.findIndex((c) => Math.abs(c) > 0.999);
  if (i >= 0) return (v[i]! > 0 ? "+" : "−") + names[i];
  return v.map((c, k) => `${names[k]} ${c >= 0 ? "+" : "−"}${Math.abs(c).toFixed(2)}`).join(" ");
}
