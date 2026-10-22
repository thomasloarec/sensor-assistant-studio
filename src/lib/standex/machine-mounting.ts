/** Montage guidé d'un capteur ou d'un aimant sur une pièce importée.
 *
 *  Toutes les grandeurs sont en millimètres et en degrés, exprimées dans le
 *  repère du modèle en POSITION FERMÉE (u = 0). Une attache sur une pièce
 *  mobile suit ensuite exactement la transformation de cette pièce.
 *
 *  Ce module ne détecte AUCUN centre de trou : le point et l'axe viennent soit
 *  du point cliqué et de la normale de la face, soit de deux points choisis
 *  explicitement par l'utilisateur. */
import { Euler, Quaternion, Vector3 } from "three";
import type { Vec3 } from "./magnetic-workshop";

export type MountKind = "surface" | "through";
export interface Attachment {
  kind: MountKind;
  support: "fixed" | "moving";
  /** Chemin de la pièce support, tel que dans le fichier (jamais traduit). */
  partPath: string;
  /** Point d'appui (surface) ou point d'entrée (traversant), en mm. */
  point: Vec3;
  /** Normale unitaire sortante de la face. */
  normal: Vec3;
  /** Surface : écart face d'appui → plan. Traversant : profondeur de la référence
   *  au-delà de la face (positif = en retrait dans la paroi, négatif = dépasse). */
  offsetMm: number;
  spinDeg: number;
  flip: boolean;
  /** Traversant : référence de la profondeur. */
  depthRef: "collar" | "tip";
  axisSource: "face" | "two-points";
}
export const ATTACH_LIMIT_MM = 500;

const SHAPES_THROUGH = new Set(["cylinder", "threaded", "pressfit"]);
/** « À travers une paroi » n'est proposé qu'aux corps cylindriques. */
export const throughAllowed = (shape: string) => SHAPES_THROUGH.has(shape);

const toDeg = (e: Euler): Vec3 => [e.x, e.y, e.z].map((n) => (n * 180) / Math.PI) as Vec3;
const v3 = (a: Vec3) => new Vector3(...a);

/** Pose (position + Euler XYZ en degrés) d'un composant attaché.
 *  `lengthMm` = dimension locale X (axe longitudinal), `heightMm` = dimension
 *  locale Y (la face d'appui est la face locale −Y). */
export function attachPose(
  a: Attachment,
  dims: { lengthMm: number; heightMm: number },
): { position: Vec3; rotation: Vec3 } {
  const n = v3(a.normal).normalize();
  const spin = (a.spinDeg * Math.PI) / 180;
  if (a.kind === "surface") {
    const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), n);
    if (a.flip) q.multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI));
    q.premultiply(new Quaternion().setFromAxisAngle(n, spin));
    const p = v3(a.point).addScaledVector(n, dims.heightMm / 2 + a.offsetMm);
    return { position: p.toArray() as Vec3, rotation: toDeg(new Euler().setFromQuaternion(q)) };
  }
  const i = a.flip ? n.clone() : n.clone().negate();
  const q = new Quaternion().setFromUnitVectors(new Vector3(1, 0, 0), i);
  q.premultiply(new Quaternion().setFromAxisAngle(i, spin));
  const reference = v3(a.point).addScaledVector(i, a.offsetMm);
  const center = reference.addScaledVector(i, (a.depthRef === "tip" ? -1 : 1) * (dims.lengthMm / 2));
  return { position: center.toArray() as Vec3, rotation: toDeg(new Euler().setFromQuaternion(q)) };
}

/** Axe défini par deux points : A = entrée, B = plus loin dans la paroi. */
export function axisFromTwoPoints(a: Vec3, b: Vec3): { point: Vec3; normal: Vec3 } | null {
  const d = v3(b).sub(v3(a));
  if (!Number.isFinite(d.length()) || d.length() < 0.05) return null;
  return { point: [...a], normal: d.normalize().negate().toArray() as Vec3 };
}

/** Lecture humaine de la profondeur d'insertion. */
export function depthReading(a: Attachment): "flush" | "recessed" | "protruding" {
  if (Math.abs(a.offsetMm) < 0.005) return "flush";
  return a.offsetMm > 0 ? "recessed" : "protruding";
}

const finite = (v: unknown, max: number): v is Vec3 =>
  Array.isArray(v) &&
  v.length === 3 &&
  v.every((n) => typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= max);

export function parseAttachment(value: unknown): Attachment | null {
  if (!value || typeof value !== "object") return null;
  const x = value as Record<string, unknown>;
  if (!["surface", "through"].includes(x["kind"] as string)) return null;
  if (!["fixed", "moving"].includes(x["support"] as string)) return null;
  if (typeof x["partPath"] !== "string" || x["partPath"].length > 250) return null;
  if (!finite(x["point"], 10000) || !finite(x["normal"], 10)) return null;
  const n = Math.hypot(...(x["normal"] as Vec3));
  if (!(n > 1e-6)) return null;
  for (const k of ["offsetMm", "spinDeg"]) {
    const v = x[k];
    if (typeof v !== "number" || !Number.isFinite(v)) return null;
  }
  if (Math.abs(x["offsetMm"] as number) > ATTACH_LIMIT_MM) return null;
  if (Math.abs(x["spinDeg"] as number) > 360) return null;
  if (typeof x["flip"] !== "boolean") return null;
  if (!["collar", "tip"].includes(x["depthRef"] as string)) return null;
  if (!["face", "two-points"].includes(x["axisSource"] as string)) return null;
  return {
    kind: x["kind"] as MountKind,
    support: x["support"] as "fixed" | "moving",
    partPath: x["partPath"] as string,
    point: [...(x["point"] as Vec3)],
    normal: (x["normal"] as Vec3).map((v) => v / n) as Vec3,
    offsetMm: x["offsetMm"] as number,
    spinDeg: x["spinDeg"] as number,
    flip: x["flip"] as boolean,
    depthRef: x["depthRef"] as "collar" | "tip",
    axisSource: x["axisSource"] as "face" | "two-points",
  };
}

/** Ouverture du mécanisme au temps t du cycle aller-retour, distincte de
 *  l'écart capteur–aimant. */
export function openingReading(
  m: { motion: "translation" | "rotation"; travel: Vec3; openingAngle: number },
  t: number,
): { value: number; unit: "mm" | "°"; phase: "closed" | "opening" | "open" | "return" } {
  const u = t <= 0.5 ? t * 2 : (1 - t) * 2;
  const full = m.motion === "translation" ? Math.hypot(...m.travel) : Math.abs(m.openingAngle);
  const phase = t <= 1e-9 || t >= 1 - 1e-9 ? "closed" : Math.abs(t - 0.5) < 1e-9 ? "open" : t < 0.5 ? "opening" : "return";
  return { value: full * u, unit: m.motion === "translation" ? "mm" : "°", phase };
}
