/** Registre des animations des fichiers 3D CHARGÉS dans cet onglet.
 *
 *  Le montage n'enregistre qu'une RÉFÉRENCE de clip (index, nom, durée) : les
 *  pistes elles-mêmes restent dans le fichier chargé et ne sont ni copiées dans
 *  le montage, ni transmises. Sans fichier chargé, aucune pose animée n'existe
 *  et le contact reste indéterminé. */
import type { Vec3 } from "./magnetic-workshop";

/** Transformation rigide monde → monde, depuis la pose STATIQUE du fichier :
 *  p' = q · p + position. */
export interface RigidDelta {
  position: Vec3;
  quaternion: [number, number, number, number];
}
export type ClipIssue =
  | "empty"
  | "morph"
  | "skeleton"
  | "scale"
  | "non-rigid"
  | "unresolved"
  | "property"
  | "static";
export interface ClipInfo {
  index: number;
  /** Nom exact du clip dans le fichier : affiché tel quel, jamais traduit. */
  name: string;
  /** Durée en secondes, de 0 à la dernière image clé. */
  duration: number;
  trackCount: number;
  supported: boolean;
  issues: ClipIssue[];
  /** Nœuds animés par le clip (chemins du fichier). */
  animatedPaths: string[];
}
export interface ClipSampler {
  index: number;
  name: string;
  duration: number;
  /** La pièce est-elle emportée par le clip ? */
  affects: (path: string) => boolean;
  /** Ensemble solidaire : nœud animé le plus proche ("" = fixe). */
  groupOf: (path: string) => string;
  /** Transformation de la pièce au temps `time` (s), null si elle ne bouge pas. */
  deltaAt: (path: string, time: number) => RigidDelta | null;
}
export interface MachineAnimation {
  clips: ClipInfo[];
  sampler: (index: number) => ClipSampler | null;
}

const registry = new Map<string, { animation: MachineAnimation; generation: number }>();
let generations = 0;
const key = (assetKey: string, unitScale: number) => assetKey + "|" + unitScale;

/** Inscrit l'animation d'un fichier chargé ; renvoie la désinscription. */
export function registerAnimation(
  assetKey: string,
  unitScale: number,
  animation: MachineAnimation,
): () => void {
  const k = key(assetKey, unitScale);
  const entry = { animation, generation: ++generations };
  registry.set(k, entry);
  return () => {
    if (registry.get(k) === entry) registry.delete(k);
  };
}
export function animationFor(assetKey: string, unitScale: number): MachineAnimation | undefined {
  return registry.get(key(assetKey, unitScale))?.animation;
}
/** Load generation of the registered animation (0 = none): a reload of the same
 *  file identity gets a NEW generation, so derived results keyed on it expire. */
export function animationGeneration(assetKey: string, unitScale: number): number {
  return registry.get(key(assetKey, unitScale))?.generation ?? 0;
}
