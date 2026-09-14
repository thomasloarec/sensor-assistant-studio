/** Couples RÉELLEMENT testés dans l'atelier, conservés dans le dossier.
 *
 * Ce module ne calcule aucun seuil et n'en invente aucun : il enregistre le
 * verdict tel que le moteur guidé l'a produit, avec les distances publiées
 * telles quelles (`null` quand aucune ligne n'est publiée). Champ additif du
 * dossier : son absence dans un dossier ancien n'est jamais une erreur.
 */

export type TestedVerdict = "expected" | "none" | "undocumented" | "unpublished";

export interface TestedPair {
  sensorId: string;
  magnetId: string;
  /** Approche documentaire réellement retenue (D1, D3, F1). */
  approach: string;
  /** Classe de sensibilité du couple testé. */
  sensitivity: string | null;
  verdict: TestedVerdict;
  /** Distances publiées pour ce couple exact, jamais empruntées. */
  pullInMm: number | null;
  dropOutMm: number | null;
  /** Course déclarée dans l'atelier, en millimètres. */
  travelStartMm: number | null;
  travelEndMm: number | null;
  /** Message du moteur hors couverture, repris mot pour mot. */
  mainMessage: string | null;
  limits: readonly string[];
  at: string;
}

export const TESTED_PAIRS_KEPT = 12;

export function testedPairKey(entry: {
  sensorId: string;
  magnetId: string;
  approach: string;
}): string {
  return `${entry.sensorId}|${entry.magnetId}|${entry.approach}`;
}

/** Enregistre un essai : le même couple dans la même approche est REMPLACÉ
 *  (le dernier essai fait foi) et passe en tête ; les autres gardent leur ordre. */
export function recordTestedPair(
  list: readonly TestedPair[] | undefined,
  entry: TestedPair,
): TestedPair[] {
  const key = testedPairKey(entry);
  const rest = (list ?? []).filter((p) => testedPairKey(p) !== key);
  return [entry, ...rest].slice(0, TESTED_PAIRS_KEPT);
}

export function testedPairFor(
  list: readonly TestedPair[] | undefined,
  sensorId: string,
  magnetId: string,
): TestedPair | null {
  return (list ?? []).find((p) => p.sensorId === sensorId && p.magnetId === magnetId) ?? null;
}

/** Le couple courant est le dernier testé : c'est lui que l'écran Résultat montre. */
export function latestTestedPair(list: readonly TestedPair[] | undefined): TestedPair | null {
  return (list ?? [])[0] ?? null;
}
