import { profileFor, thresholdsFor } from "./profiles";
import type { MountingProfile } from "./profiles";
import type { GuidedMounting } from "./contract";
import { withComputed } from "./simulate";
import { centreOffsetMm } from "./simulate";
import { add, bodiesCollide, scale, toWorldPoint } from "./geometry";
import type { Pose, Vec3 } from "./geometry";

export interface MountingSuggestion {
  profileId: string;
  approachId: string;
  sensitivityClass: string;
  /** Pose suggérée de l'aimant dans le repère capteur. */
  relative: Pose;
  /** Entrefer de surface à la pose suggérée, en mm (valeur publiée). */
  gapMm: number;
  startGapMm: number;
  endGapMm: number;
  offsetsMm: Vec3;
  rotationDeg: Vec3;
  axis: Vec3;
  referencePlane: MountingProfile["referencePlane"];
  /** Le gabarit reste schématique : aucun datum caractérisé. */
  schematic: true;
  sourceRef: string;
}
export type SuggestionResult =
  | { ok: true; suggestion: MountingSuggestion }
  | { ok: false; reason: string };

/** Pose suggérée : sur l'axe documenté, axes parallèles, entre les deux distances publiées. */
export function suggestPose(
  m: GuidedMounting,
  profiles?: MountingProfile[],
): SuggestionResult {
  const profile = profileFor(m.couple.sensorId, m.couple.magnetId, m.couple.approachId, profiles);
  if (!profile) return { ok: false, reason: "NO_PROFILE" };
  const pair = thresholdsFor(profile, m.couple.sensitivityClass);
  if (!pair) return { ok: false, reason: "CLASS_NOT_PUBLISHED" };
  const aligned: Pose = { positionMm: [0, 0, 0], rotationDeg: [0, 0, 0] };
  const offset = centreOffsetMm({ ...m, relative: aligned }, profile);
  const relative: Pose = {
    positionMm: scale(profile.axis, pair[0] + offset),
    rotationDeg: [0, 0, 0],
  };
  if (bodiesCollide(m.couple.sensorId, m.couple.magnetId, relative))
    return { ok: false, reason: "COLLISION" };
  return {
    ok: true,
    suggestion: {
      profileId: profile.id,
      approachId: profile.approachId,
      sensitivityClass: m.couple.sensitivityClass,
      relative,
      gapMm: pair[0],
      startGapMm: pair[1],
      endGapMm: pair[0],
      offsetsMm: [...relative.positionMm] as Vec3,
      rotationDeg: [0, 0, 0],
      axis: profile.axis,
      referencePlane: profile.referencePlane,
      schematic: true,
      sourceRef: profile.provenance.sourceRef,
    },
  };
}
/** Prévisualisation : le montage retourné n'est pas appliqué tant que l'appelant garde l'original. */
export function previewSuggestion(
  m: GuidedMounting,
  suggestion: MountingSuggestion,
  profiles?: MountingProfile[],
): GuidedMounting {
  return withComputed(
    {
      ...m,
      profileId: suggestion.profileId,
      relative: {
        positionMm: [...suggestion.relative.positionMm] as Vec3,
        rotationDeg: [...suggestion.relative.rotationDeg] as Vec3,
      },
      travel: { startGapMm: suggestion.startGapMm, endGapMm: suggestion.endGapMm },
    },
    profiles,
  );
}
/** Applique la suggestion : l'ancrage du capteur, les attaches et le besoin sont conservés.
 * Une suggestion qui traverse la matière est refusée, jamais appliquée. */
export function applySuggestion(
  m: GuidedMounting,
  suggestion: MountingSuggestion,
  profiles?: MountingProfile[],
): { ok: true; mounting: GuidedMounting } | { ok: false; reason: string } {
  if (bodiesCollide(m.couple.sensorId, m.couple.magnetId, suggestion.relative))
    return { ok: false, reason: "COLLISION" };
  return { ok: true, mounting: previewSuggestion(m, suggestion, profiles) };
}
/** Déplace ou oriente TOUT le couple : la pose relative est inchangée par construction. */
export function moveCouple(
  m: GuidedMounting,
  move: { translationMm?: Vec3; rotationDeg?: Vec3 },
): GuidedMounting {
  const translation = move.translationMm ?? [0, 0, 0];
  const rotation = move.rotationDeg ?? [0, 0, 0];
  return {
    ...m,
    anchor: {
      positionMm: add(m.anchor.positionMm, translation),
      rotationDeg: m.anchor.rotationDeg.map((a, i) => a + rotation[i]!) as Vec3,
    },
    // `relative` volontairement inchangé : la pose relative est l'invariant du couple.
    computed: m.computed,
  };
}
/** Position monde (ou repère du modèle importé) de l'aimant à une pose relative donnée. */
export const magnetWorldPosition = (m: GuidedMounting, relative: Pose): Vec3 =>
  toWorldPoint(m.anchor, relative.positionMm);
