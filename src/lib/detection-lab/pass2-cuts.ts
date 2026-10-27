/** Coupes perpendiculaires RAFFINÉES — figures de revue du lot 2, pas d'UI client.
 * Maillage CONTINU du domaine dessiné, sans recouvrement ni trou : nœuds de calcul
 * au pas 0,25 mm dans la bande |x| ≤ 5 mm SUR TOUTE LA HAUTEUR y = 0..24, pas 1 mm
 * ailleurs. Chaque cellule porte ses bornes RÉELLES (rectangles) : frontières aux
 * milieux entre nœuds voisins, tronquées au domaine ; x, y restent les points de
 * calcul. Classification inchangée du lot 1 (profil 1.1, modèle B, convention C1,
 * seuils partagés) : c'est un audit géométrique, pas une recalibration.
 *
 * Lecture en états distincts, jamais confondus :
 * - « collision » : invalidité géométrique NOMINALE (aimant contre la capsule testée) ;
 * - « collision_hypothese » : pose nominale valide, mais un scénario décalé de ±1 mm
 *   entre en collision — ce n'est PAS un chevauchement du corps dessiné ;
 * - « reponse_nulle » : réponse nominale nulle du modèle B (zone centrale entre lobes) ;
 * - diagnostic défavorable/variable/favorable : accord des scénarios avec retrait.
 * Aucune de ces largeurs n'est une probabilité.
 *
 * Module pur : aucun DOM, React, Three ni backend. Physique uniquement via evaluatePose. */
import { computeCutById, classifyPose, pathDepth, suggest, thresholdsFor, type Category, type Cause, type CutId, type Thresholds } from "./classify";
import type { Vec3 } from "./field";
import type { PilotMagnet } from "./magnets";
import type { Calibrations } from "./pilot";
import { evaluatePose } from "./pose";
import { PROFILE } from "./profile";

export type Reading = "collision" | "collision_hypothese" | "reponse_nulle" | Category;
/** État de la pose NOMINALE seule (scénario nominal du profil). */
export type NominalState = "collision" | "nulle" | "positive";

export interface GridCell {
  /** Point de calcul (nœud). */
  x: number; y: number;
  /** Bornes réelles de la cellule (milieux entre nœuds, tronquées au domaine). */
  x0: number; x1: number; y0: number; y1: number;
}
export interface FineCell extends GridCell {
  category: Category; cause?: Cause | undefined; ratio: number | null;
  reading: Reading; nominal: NominalState;
}
export interface FineMark { label: string; center: Vec3; category: Category; cause?: Cause | undefined }
export interface FineGridSpec {
  xMin: number; xMax: number; yMin: number; yMax: number; coarseStepMm: number;
  /** Bande fine |x| ≤ fineXMax sur TOUTE la hauteur. */
  fineXMax: number; fineStepMm: number;
}
export const FINE_GRID: FineGridSpec = { xMin: -24, xMax: 24, yMin: 0, yMax: 24, coarseStepMm: 1, fineXMax: 5, fineStepMm: 0.25 };

const r4 = (v: number) => Math.round(v * 10000) / 10000;

/** Nœuds et cellules du maillage, géométrie pure (aucune physique).
 * Les pas 1 et 0,25 et leurs milieux sont exacts en binaire : les bornes sont
 * calculées sans epsilon. Couverture exacte du domaine, sans trou ni recouvrement. */
export function fineGridCells(spec: FineGridSpec = FINE_GRID): GridCell[] {
  const xs: number[] = [];
  for (let x = spec.xMin; x <= spec.xMax + 1e-9; x += spec.coarseStepMm)
    if (Math.abs(x) > spec.fineXMax + 1e-9) xs.push(r4(x));
  for (let x = -spec.fineXMax; x <= spec.fineXMax + 1e-9; x += spec.fineStepMm) xs.push(r4(x));
  xs.sort((a, b) => a - b);
  const ys: number[] = [];
  for (let y = spec.yMin; y <= spec.yMax + 1e-9; y += spec.fineStepMm) ys.push(r4(y));
  const bounds = (nodes: number[], i: number, lo: number, hi: number): [number, number] => [
    i === 0 ? lo : (nodes[i - 1]! + nodes[i]!) / 2,
    i === nodes.length - 1 ? hi : (nodes[i]! + nodes[i + 1]!) / 2,
  ];
  const cells: GridCell[] = [];
  for (let j = 0; j < ys.length; j++) {
    const [y0, y1] = bounds(ys, j, spec.yMin, spec.yMax);
    for (let i = 0; i < xs.length; i++) {
      const [x0, x1] = bounds(xs, i, spec.xMin, spec.xMax);
      cells.push({ x: xs[i]!, y: ys[j]!, x0, x1, y0, y1 });
    }
  }
  return cells;
}

/** État nominal seul : evaluatePose sur le scénario nominal du profil. */
export function nominalState(magnet: PilotMagnet, x: number, y: number, axis: Vec3): NominalState {
  const e = evaluatePose(magnet, { center: [x, y, 0], axis }, PROFILE.scenarios[0]!, "B");
  if (!e.ok) return "collision";
  return e.response === 0 ? "nulle" : "positive";
}

export function classifyFineCell(magnet: PilotMagnet, cell: GridCell, axis: Vec3, th: Thresholds | null): FineCell {
  const nominal = nominalState(magnet, cell.x, cell.y, axis);
  const c = classifyPose(magnet, { center: [cell.x, cell.y, 0], axis }, th, "B");
  const ratio = c.ratios[0] ?? null;
  const reading: Reading =
    nominal === "collision" ? "collision"
    : nominal === "nulle" ? "reponse_nulle"
    : c.category === "unavailable" && c.reason === "collision" ? "collision_hypothese"
    : c.category;
  return { ...cell, category: c.category, cause: c.cause, ratio, reading, nominal };
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
  const cells = fineGridCells(spec).map((c) => classifyFineCell(magnet, c, axis, th));
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

/** Comparaison aux nœuds communs : chaque nœud fin à coordonnées entières (|x| ≤ 5,
 * y entier, sur toute la hauteur) doit retrouver la catégorie de la coupe 1 mm du
 * lot 1 DE MÊME IDENTIFIANT au même point. */
export function commonNodeComparison(fine: FineCut, magnet: PilotMagnet, cal: Calibrations): { nodes: number; mismatches: number } {
  const coarse = computeCutById(fine.id as CutId, magnet, "B", "C1", cal);
  const byKey = new Map(coarse.cells.map((c) => [`${c.x}|${c.y}`, c.category]));
  let nodes = 0, mismatches = 0;
  for (const c of fine.cells) {
    if (Math.abs(c.x) > fine.spec.fineXMax || !Number.isInteger(c.x) || !Number.isInteger(c.y)) continue;
    const cat = byKey.get(`${c.x}|${c.y}`);
    if (cat == null) continue;
    nodes++;
    if (cat !== c.category) mismatches++;
  }
  return { nodes, mismatches };
}

/** Issue du balayage de la zone centrale : statut EXPLICITE, jamais null ambigu. */
export type NullWidthScan =
  | { status: "collision"; atMm: number }
  | { status: "not_found" }
  | { status: "ok"; lastNullMm: number; firstPositiveMm: number };

/** Demi-largeur de la zone centrale à réponse nominale NULLE (modèle B, scénario
 * nominal), balayage x ≥ 0 au pas demandé, x = 0 vérifié en premier.
 * Intervalle [dernier point nul, premier point positif] ; collision et sortie non
 * trouvée sont des statuts distincts. Ni probabilité ni largeur de commutation. */
export function centralNullHalfWidth(magnet: PilotMagnet, y: number, stepMm: number, xMax = 8): NullWidthScan {
  const nominal = PROFILE.scenarios[0]!;
  const axis: Vec3 = [0, 1, 0];
  let lastNull = -1;
  for (let x = 0; x <= xMax + 1e-9; x += stepMm) {
    const e = evaluatePose(magnet, { center: [r4(x), y, 0], axis }, nominal, "B");
    if (!e.ok) return { status: "collision", atMm: r4(x) };
    if (e.response > 0)
      return lastNull < 0 ? { status: "ok", lastNullMm: 0, firstPositiveMm: 0 } : { status: "ok", lastNullMm: r4(lastNull), firstPositiveMm: r4(x) };
    lastNull = x;
  }
  return { status: "not_found" };
}

/** Largeurs comparées aux pas 1 / 0,25 / 0,125 mm sur des profondeurs où les deux
 * aimants sont physiquement valides (au-delà de la capsule de collision). */
export function centralNullWidthTable(magnet: PilotMagnet, depths: number[] = [12, 16, 20, 24]): { y: number; stepMm: number; scan: NullWidthScan }[] {
  const out: { y: number; stepMm: number; scan: NullWidthScan }[] = [];
  for (const y of depths) for (const stepMm of [1, 0.25, 0.125]) out.push({ y, stepMm, scan: centralNullHalfWidth(magnet, y, stepMm) });
  return out;
}
