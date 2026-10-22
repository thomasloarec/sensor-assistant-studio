/** Lecture des animations d'un GLB : uniquement des mouvements RIGIDES de nœuds
 *  (translation + rotation, avec leur interpolation réelle STEP / LINEAR /
 *  CUBICSPLINE), y compris parents transformés et groupes imbriqués.
 *
 *  Aucune pose n'est précalculée : un clip est évalué à la demande, au temps
 *  exact demandé, sur la hiérarchie conservée du fichier. Un clip qui dépend
 *  d'un squelette, de morphing, d'un changement d'échelle ou d'une
 *  transformation non rigide est REFUSÉ en entier, avec la raison : il n'est
 *  jamais rejoué partiellement. */
import { Matrix4, PropertyBinding, Quaternion, Vector3 } from "three";
import type { AnimationClip, Interpolant, Object3D } from "three";
import type {
  ClipInfo,
  ClipIssue,
  ClipSampler,
  MachineAnimation,
  RigidDelta,
} from "./machine-clip-registry";
import type { Vec3 } from "./magnetic-workshop";

const within = (path: string, node: string) =>
  node !== "" && (path === node || path.startsWith(node + "/"));
const MAX_CLIPS = 50;
const MAX_CHECK_TIMES = 160;
const TOL = 1e-4;

interface Bound {
  object: Object3D;
  prop: "position" | "quaternion" | "scale";
  interpolant: Interpolant;
}

export function analyzeAnimations(
  root: Object3D,
  clips: AnimationClip[],
  pathOf: Map<Object3D, string>,
  objectOf: Map<string, Object3D>,
  meshPaths: string[],
): MachineAnimation {
  const staticWorld = new Map<Object3D, Matrix4>();
  root.updateMatrixWorld(true);
  root.traverse((o) => staticWorld.set(o, o.matrixWorld.clone()));
  const rest = new Map<Object3D, { p: Vector3; q: Quaternion; s: Vector3 }>();
  const bounds: Bound[][] = [];
  const infos: ClipInfo[] = clips.slice(0, MAX_CLIPS).map((clip, index) => {
    const issues = new Set<ClipIssue>();
    const bound: Bound[] = [];
    const animated = new Set<string>();
    if (!(clip.duration > 0) || clip.tracks.length === 0) issues.add("empty");
    for (const track of clip.tracks) {
      let parsed: ReturnType<typeof PropertyBinding.parseTrackName>;
      try {
        parsed = PropertyBinding.parseTrackName(track.name);
      } catch {
        issues.add("unresolved");
        continue;
      }
      const object = PropertyBinding.findNode(root, parsed.nodeName) as Object3D | null;
      const path = object ? pathOf.get(object) : undefined;
      if (!object || path === undefined) {
        issues.add("unresolved");
        continue;
      }
      if ((object as { isBone?: boolean }).isBone) issues.add("skeleton");
      const prop = parsed.propertyName;
      if (prop === "morphTargetInfluences") {
        issues.add("morph");
        continue;
      }
      if ((prop !== "position" && prop !== "quaternion" && prop !== "scale") || parsed.objectName) {
        issues.add("property");
        continue;
      }
      if (prop === "scale") {
        // Une piste d'échelle CONSTANTE (égale à l'échelle du nœud) reste rigide.
        const s = object.scale.toArray();
        const v = track.values;
        for (let i = 0; i < v.length; i++)
          if (Math.abs(v[i]! - s[i % 3]!) > TOL * Math.max(1, Math.abs(s[i % 3]!))) {
            issues.add("scale");
            break;
          }
      }
      if (!rest.has(object))
        rest.set(object, {
          p: object.position.clone(),
          q: object.quaternion.clone(),
          s: object.scale.clone(),
        });
      animated.add(path);
      // Interpolation RÉELLE de la piste (STEP, LINEAR, slerp, CUBICSPLINE glTF).
      const interpolant = (track as unknown as { createInterpolant: () => Interpolant }).createInterpolant();
      bound.push({ object, prop, interpolant });
    }
    const animatedPaths = [...animated].sort();
    if (!issues.size && !meshPaths.some((p) => animatedPaths.some((a) => within(p, a))))
      issues.add("static");
    bounds.push(bound);
    return {
      index,
      name: clip.name,
      duration: Number.isFinite(clip.duration) ? clip.duration : 0,
      trackCount: clip.tracks.length,
      supported: false,
      issues: [...issues],
      animatedPaths,
    };
  });

  /* État courant de la hiérarchie : un seul clip/temps à la fois. */
  let current: { clip: number; time: number } | null = null;
  const worldCache = new Map<Object3D, Matrix4>();
  const deltaCache = new Map<string, RigidDelta | null>();
  function apply(clip: number, time: number) {
    if (current && current.clip === clip && current.time === time) return;
    for (const [o, r] of rest) {
      o.position.copy(r.p);
      o.quaternion.copy(r.q);
      o.scale.copy(r.s);
    }
    if (clip >= 0)
      for (const b of bounds[clip] ?? []) {
        const v = b.interpolant.evaluate(time);
        if (b.prop === "quaternion") b.object.quaternion.fromArray(v as unknown as number[]).normalize();
        else b.object[b.prop].fromArray(v as unknown as number[]);
      }
    for (const o of rest.keys()) o.updateMatrix();
    worldCache.clear();
    deltaCache.clear();
    current = { clip, time };
  }
  function world(o: Object3D): Matrix4 {
    const hit = worldCache.get(o);
    if (hit) return hit;
    const m = o.matrix.clone();
    if (o.parent) m.premultiply(world(o.parent));
    worldCache.set(o, m);
    return m;
  }
  const tmpP = new Vector3(),
    tmpQ = new Quaternion(),
    tmpS = new Vector3();
  function delta(o: Object3D): Matrix4 {
    return world(o).clone().multiply(staticWorld.get(o)!.clone().invert());
  }
  function rigid(m: Matrix4): boolean {
    const e = m.elements;
    const c = [0, 4, 8].map((i) => new Vector3(e[i], e[i + 1], e[i + 2]));
    return (
      c.every((v) => Math.abs(v.length() - 1) < 1e-3) &&
      Math.abs(c[0]!.dot(c[1]!)) < 1e-3 &&
      Math.abs(c[0]!.dot(c[2]!)) < 1e-3 &&
      Math.abs(c[1]!.dot(c[2]!)) < 1e-3 &&
      m.determinant() > 0
    );
  }
  // Rigidité vérifiée aux images clés et à intervalles réguliers, sur chaque
  // nœud animé (les pièces au-dessous partagent sa transformation).
  infos.forEach((info, index) => {
    if (info.issues.length) return;
    const times = new Set<number>([0, info.duration]);
    for (const track of clips[index]!.tracks) for (const time of track.times) times.add(time);
    for (let i = 0; i <= 16; i++) times.add((info.duration * i) / 16);
    let list = [...times].filter((x) => x >= 0 && x <= info.duration).sort((a, b) => a - b);
    if (list.length > MAX_CHECK_TIMES) {
      const step = list.length / MAX_CHECK_TIMES;
      list = Array.from({ length: MAX_CHECK_TIMES }, (_, i) => list[Math.floor(i * step)]!);
    }
    outer: for (const time of list) {
      apply(index, time);
      for (const p of info.animatedPaths)
        if (!rigid(delta(objectOf.get(p)!))) {
          info.issues.push("non-rigid");
          break outer;
        }
    }
    info.supported = info.issues.length === 0;
  });
  apply(-1, 0);

  const samplers = new Map<number, ClipSampler>();
  return {
    clips: infos,
    sampler(index) {
      const info = infos[index];
      if (!info?.supported) return null;
      const hit = samplers.get(index);
      if (hit) return hit;
      const groupOf = (path: string) =>
        info.animatedPaths.filter((a) => within(path, a)).sort((a, b) => b.length - a.length)[0] ?? "";
      const s: ClipSampler = {
        index,
        name: info.name,
        duration: info.duration,
        affects: (path) => info.animatedPaths.some((a) => within(path, a)),
        groupOf,
        deltaAt(path, time) {
          const group = groupOf(path);
          if (!group) return null;
          const t = Math.min(info.duration, Math.max(0, Number.isFinite(time) ? time : 0));
          apply(index, t);
          if (deltaCache.has(group)) return deltaCache.get(group)!;
          const o = objectOf.get(group);
          if (!o) return null;
          delta(o).decompose(tmpP, tmpQ, tmpS);
          const d: RigidDelta = {
            position: tmpP.toArray() as Vec3,
            quaternion: tmpQ.toArray() as [number, number, number, number],
          };
          deltaCache.set(group, d);
          return d;
        },
      };
      samplers.set(index, s);
      return s;
    },
  };
}

/* i18n-canonical : explications traduites au rendu par t(). */
export const CLIP_ISSUE_TEXT: Record<ClipIssue, string> = {
  empty: "clip vide ou de durée nulle",
  morph: "déformation par morphing (poids de cibles), non prise en charge",
  skeleton: "animation de squelette (os), non prise en charge",
  scale: "changement d'échelle au cours du clip, non pris en charge",
  "non-rigid": "transformation non rigide (cisaillement ou échelle héritée), non prise en charge",
  unresolved: "piste qui ne correspond à aucun nœud du fichier",
  property: "propriété animée autre que position ou rotation",
  static: "aucune pièce visible n'est emportée par ce clip",
};
