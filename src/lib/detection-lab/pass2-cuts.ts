/** Coupes perpendiculaires RAFFINÉES — figures de revue du lot 2, pas d'UI client.
 * Grille à deux résolutions SANS recouvrement : pas 0,25 mm dans la zone locale
 * |x| ≤ 5 mm et y ≤ 5 mm, pas 1 mm ailleurs ; chaque cellule porte sa dimension
 * réelle. Classification inchangée du lot 1 (profil 1.1, modèle B, convention C1,
 * seuils partagés) : c'est un audit géométrique, pas une recalibration.
 *
 * Lecture en TROIS états distincts, jamais confondus :
 * - « collision » : invalidité géométrique (aimant contre l'enveloppe de verre) ;
 * - « reponse_nulle » : réponse nominale nulle du modèle B (zone centrale entre lobes) ;
 * - diagnostic défavorable/variable/favorable : accord des scénarios avec retrait.
 * Aucune de ces largeurs n'est une probabilité.
 *
 * Module pur : aucun DOM, React, Three ni backend. Physique uniquement via evaluatePose. */
import { computeCutById, classifyPose, pathDepth, suggest, thresholdsFor, type Category, type Cause, type Thresholds } from "./classify";
import type { Vec3 } from "./field";
import type { PilotMagnet } from "./magnets";
import type { Calibrations } from "./pilot";
import { evaluatePose } from "./pose";
import { PROFILE } from "./profile";

export type Reading = "collision" | "reponse_nulle" | Category;

export interface FineCell {
  x: number; y: number; sizeMm: number;
  category: Category; cause?: Cause | undefined; ratio: number | null; reading: Reading;
}
export interface FineMark { label: string; center: Vec3; category: Category; cause?: Cause | undefined }
export interface FineGridSpec {
  xMin: number; xMax: number; yMin: number; yMax: number; coarseStepMm: number;
  fineXMax: number; fineYMax: number; fineStepMm: number;
}
export const FINE_GRID: FineGridSpec = { xMin: -24, xMax: 24, yMin: 0, yMax: 24, coarseStepMm: 1, fineXMax: 5, fineYMax: 5, fineStepMm: 0.25 };

const r4 = (v: number) => Math.round(v * 10000) / 10000;

/** Centres et dimensions des cellules, géométrie pure (aucune physique).
 * Une cellule grossière dont le centre tombe dans la zone fine est retirée :
 * l'étendue fine maximale (5 + 0,125 = 5,125 mm) reste strictement inférieure
 * au bord de la première cellule grossière conservée (6 − 0,5 = 5,5 mm). */
export function fineGridCells(spec: FineGridSpec = FINE_GRID): { x: number; y: number; sizeMm: number }[] {
  const cells: { x: number; y: number; sizeMm: number }[] = [];
  const inFine = (x: number, y: number) => Math.abs(x) <= spec.fineXMax + 1e-9 && y <= spec.fineYMax + 1e-9;
  for (let y = spec.yMin; y <= spec.yMax + 1e-9; y += spec.coarseStepMm)
    for (let x = spec.xMin; x <= spec.xMax + 1e-9; x += spec.coarseStepMm)
      if (!inFine(x, y)) cells.push({ x: r4(x), y: r4(y), sizeMm: spec.coarseStepMm });
  for (let y = spec.yMin; y <= spec.fineYMax + 1e-9; y += spec.fineStepMm)
    for (let x = -spec.fineXMax; x <= spec.fineXMax + 1e-9; x += spec.fineStepMm)
      cells.push({ x: r4(x), y: r4(y), sizeMm: spec.fineStepMm });
  return cells;
}

export function classifyFineCell(magnet: PilotMagnet, x: number, y: number, sizeMm: number, axis: Vec3, th: Thresholds | null): FineCell {
  const c = classifyPose(magnet, { center: [x, y, 0], axis }, th, "B");
  const ratio = c.ratios[0] ?? null;
  const reading: Reading =
    c.category === "unavailable" && c.reason === "collision" ? "collision"
    : ratio === 0 ? "reponse_nulle"
    : c.category;
  return { x, y, sizeMm, category: c.category, cause: c.cause, ratio, reading };
}

export interface FineCut {
  id: string; title: string; magnetId: string; className: "C"; model: "B"; convention: "C1";
  axis: Vec3; thresholds: Thresholds | null; spec: FineGridSpec;
  cells: FineCell[]; marks: FineMark[]; computeMs: number;
}

/** Coupe perpendiculaire raffinée (2 = centrée, 3 = décalée), même construction de
 * repères que le lot 1 (profondeur de trajet, suggestion de décalage). */
export function computeFineCut(
  id: "2-perpendicular-centred-C" | "3-perpendicular-offset-C",
  magnet: PilotMagnet, cal: Calibrations, spec: FineGridSpec = FINE_GRID,
): FineCut {
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  const th = thresholdsFor(cal, "C");
  const axis: Vec3 = [0, 1, 0];
  const cells = fineGridCells(spec).map((c) => classifyFineCell(magnet, c.x, c.y, c.sizeMm, axis, th));
  const yPath = pathDepth(magnet, "B", "C1", cal);
  const marks: FineMark[] = [{ label: "centré", center: [0, yPath, 0], ...classifyAt(magnet, [0, yPath, 0], axis, th) }];
  if (id === "3-perpendicular-offset-C") {
    const s = suggest(magnet, { center: [0, yPath, 0], axis }, th, "B");
    const dx = s?.kind === "shift" ? s.dxMm : Math.round(PROFILE.reed.effectiveLengthMm / 2);
    marks.push({ label: `décalé ${dx > 0 ? "+" : ""}${dx} mm`, center: [dx, yPath, 0], ...classifyAt(magnet, [dx, yPath, 0], axis, th) });
  }
  const t1 = typeof performance !== "undefined" ? performance.now() : Date.now();
  const title = id === "2-perpendicular-centred-C" ? "Perpendiculaire centré — classe C (raffinée)" : "Perpendiculaire décalé — classe C (raffinée)";
  return { id, title, magnetId: magnet.id, className: "C", model: "B", convention: "C1", axis, thresholds: th, spec, cells, marks, computeMs: Math.round(t1 - t0) };
}

function classifyAt(magnet: PilotMagnet, center: Vec3, axis: Vec3, th: Thresholds | null): { category: Category; cause?: Cause | undefined } {
  const c = classifyPose(magnet, { center, axis }, th, "B");
  return { category: c.category, cause: c.cause };
}

/** Comparaison aux nœuds communs : chaque cellule fine de centre entier doit
 * retrouver la catégorie de la coupe 1 mm du lot 1 au même point. */
export function commonNodeComparison(fine: FineCut, magnet: PilotMagnet, cal: Calibrations): { nodes: number; mismatches: number } {
  const coarse = computeCutById(fine.id as "2-perpendicular-centred-C", magnet, "B", "C1", cal);
  const byKey = new Map(coarse.cells.map((c) => [`${c.x}|${c.y}`, c.category]));
  let nodes = 0, mismatches = 0;
  for (const c of fine.cells) {
    if (c.sizeMm !== fine.spec.fineStepMm || !Number.isInteger(c.x) || !Number.isInteger(c.y)) continue;
    const cat = byKey.get(`${c.x}|${c.y}`);
    if (cat == null) continue;
    nodes++;
    if (cat !== c.category) mismatches++;
  }
  return { nodes, mismatches };
}

/** Demi-largeur de la zone centrale à réponse nominale NULLE (modèle B, scénario
 * nominal), balayage x ≥ 0 au pas demandé. Retourne null si collision avant la
 * sortie de zone. Ce n'est ni une probabilité ni une largeur de commutation. */
export function centralNullHalfWidth(magnet: PilotMagnet, y: number, stepMm: number, xMax = 8): number | null {
  const nominal = PROFILE.scenarios[0]!;
  const axis: Vec3 = [0, 1, 0];
  for (let x = stepMm; x <= xMax + 1e-9; x += stepMm) {
    const e = evaluatePose(magnet, { center: [r4(x), y, 0], axis }, nominal, "B");
    if (!e.ok) return null;
    if (e.response > 0) return r4(x);
  }
  return null;
}

/** Largeurs comparées aux pas 1,25 / 0,25 / 0,125 mm sur quelques profondeurs. */
export function centralNullWidthTable(magnet: PilotMagnet, depths: number[] = [6, 8, 10]): { y: number; stepMm: number; halfWidthMm: number | null }[] {
  const out: { y: number; stepMm: number; halfWidthMm: number | null }[] = [];
  for (const y of depths) for (const stepMm of [1.25, 0.25, 0.125]) out.push({ y, stepMm, halfWidthMm: centralNullHalfWidth(magnet, y, stepMm) });
  return out;
}
