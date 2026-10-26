/**
 * Profil d'hypothèses NOMMÉ et VERSIONNÉ du démonstrateur de détection reed.
 * Toute valeur qui n'est pas une donnée publiée est une hypothèse identifiée (H-…).
 * Le profil est exporté tel quel avec chaque rapport, coupe ou essai.
 *
 * Repère du reed (mm) : origine au centre de la longueur effective nominale,
 * x = axe des lames, y = normale d'approche latérale dans le plan des coupes,
 * z = normale au plan des coupes. Un seul repère nominal : les décalages
 * documentaires Form→produit ne déplacent jamais le reed.
 */
import type { Vec3 } from "./field";

export const MU0 = 4 * Math.PI * 1e-7; // convention historique ; écart relatif au CODATA 2018 ≈ 5e-10

export type ResponseModel = "A" | "B";
export type DistanceConvention = "C1" | "C2";

export interface ReedScenario {
  id: string;
  /** Facteur sur la longueur effective nominale. */
  lengthFactor: number;
  /** Déplacement du reed dans le repère nominal (mm). */
  shift: Vec3;
  /** Facteur sur le moment magnétique publié (appliqué à J, géométrie inchangée). */
  momentFactor: number;
}

export const PROFILE = {
  id: "reed-lab-hypotheses",
  version: "1.0.0",
  frozenOn: "2026-10-26",
  reed: {
    id: "66-er",
    /** H-L1 : longueur effective nominale, non publiée. */
    effectiveLengthMm: 8,
    /** H-ENV : enveloppe de verre pour l'exclusion de collision (capsule). */
    envelopeRadiusMm: 1,
    envelopeHalfLengthMm: 5,
    /** Gauss-Legendre par lame (moitié de longueur effective). */
    quadraturePerBlade: 12,
  },
  /** Scénarios DÉTERMINISTES, identiques le long d'un parcours (un facteur à la fois + nominal). */
  scenarios: [
    { id: "nominal", lengthFactor: 1, shift: [0, 0, 0], momentFactor: 1 },
    { id: "L-30%", lengthFactor: 0.7, shift: [0, 0, 0], momentFactor: 1 },
    { id: "L+30%", lengthFactor: 1.3, shift: [0, 0, 0], momentFactor: 1 },
    { id: "x-1mm", lengthFactor: 1, shift: [-1, 0, 0], momentFactor: 1 },
    { id: "x+1mm", lengthFactor: 1, shift: [1, 0, 0], momentFactor: 1 },
    { id: "y-1mm", lengthFactor: 1, shift: [0, -1, 0], momentFactor: 1 },
    { id: "y+1mm", lengthFactor: 1, shift: [0, 1, 0], momentFactor: 1 },
    { id: "m-10%", lengthFactor: 1, shift: [0, 0, 0], momentFactor: 0.9 },
    { id: "m+10%", lengthFactor: 1, shift: [0, 0, 0], momentFactor: 1.1 },
  ] as ReedScenario[],
  /** Retrait explicite de frontière appliqué aux seuils partagés. */
  classification: { boundaryMargin: 0.2 },
  domain: { maxCenterMm: 60 },
  grid: { xMin: -24, xMax: 24, yMin: 0, yMax: 24, stepMm: 1 },
  search: {
    dMaxMm: 40,
    dScanStepMm: 0.5,
    xScanStepMm: 1,
    xScanMaxMm: 24,
    bisectTolMm: 1e-4,
    goldenTolMm: 1e-3,
  },
  suggestions: { maxShiftMm: 12, shiftStepMm: 1 },
  /** Fraction de la portée D4 estimée pour le trajet de la coupe 6. */
  pathDepthFraction: 0.8,
  conventions: {
    C1: "Distance publiée = jeu entre la face de l'aimant la plus proche et le repère actif (axe du reed pour D1/D4/D5, extrémité de la longueur effective nominale pour D3). Le centre de l'aimant est décalé de la demi-dimension projetée.",
    C2: "Variante : distance publiée = du repère actif au CENTRE de l'aimant (demi-dimension ignorée). Présentée pour l'audit, non prouvée.",
  },
  approaches: {
    D1: "Aimant parallèle aux lames (aimantation selon x), centré en x, approche latérale selon y. Datum ambigu dans la source (registre R2b).",
    D3: "Aimant coaxial aux lames, approche par l'extrémité selon x. Datum ambigu dans la source (registre R2b).",
    D4: "H-D4 : aimant perpendiculaire aux lames (aimantation selon y), approche selon y ; distance = maximum de lobe sur x.",
    D5: "H-D5 : aimant perpendiculaire aux lames (aimantation selon y), déplacé selon z, face latérale vers le reed ; distance = maximum de lobe sur x. (Une première variante aimantée selon z, approchée selon y, donne Bx ≡ 0 dans le plan médian : rejetée et consignée.)",
  },
  models: {
    A: "Réponse A : |moyenne de Bx sur la longueur effective| (poids de Gauss normalisés), mT.",
    B: "Réponse B : M1, M2 = moyennes de Bx sur chaque lame ; réponse = min(|M1|, |M2|) si M1·M2 > 0, sinon 0. Le minimum n'est PAS la moyenne géométrique.",
  },
} as const;

export type Profile = typeof PROFILE;
