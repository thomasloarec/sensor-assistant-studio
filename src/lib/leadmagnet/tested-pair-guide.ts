/**
 * Vérité PARTAGÉE sur la ligne du guide d'un couple réellement testé.
 *
 * Un seul endroit décide de ce texte, pour que le récapitulatif de l'écran, le
 * PDF et l'historique des essais disent exactement la même chose : la ligne
 * imprimée (référence exacte de variante), l'approche retenue, les deux bornes
 * telles qu'elles sont publiées et la page de la brochure.
 *
 * Ce que ce module ne fait PAS : il ne convertit jamais les colonnes « up » et
 * « to » en seuils de fermeture ou de réouverture, il ne trie pas une ligne
 * d'ordre imprimé atypique (elle est signalée), et il n'emprunte aucune plage à
 * une autre famille ni à une autre approche. Sans ligne publiée pour ce couple
 * exact, il renvoie `null` : l'appelant dit alors l'absence, pas un mouvement de
 * l'utilisateur.
 */
import { formatGuideBound, guideRange, type GuideRange } from "@/lib/standex/activation-guide";
import { msg, t } from "@/lib/i18n/core";
import type { TestedPair } from "./tested-pairs";

export interface TestedPairGuideFact {
  range: GuideRange;
  /** « 14,4–16,6 mm · MK17-B-X · p. 35 », traduit au rendu. */
  label: string;
}

/** Ligne du guide réellement enregistrée avec cet essai, ou `null`. */
export function testedPairGuideFact(
  p: Pick<TestedPair, "sensorId" | "magnetId" | "approach" | "guideReference">,
  tr: (s: string) => string = t,
  fmt: (template: string, args: string[]) => string = msg,
): TestedPairGuideFact | null {
  if (!p.guideReference) return null;
  const range = guideRange(p.sensorId, p.guideReference, p.magnetId, p.approach);
  if (!range) return null;
  const label = fmt("plage du guide {0}–{1} mm, ligne {2}, page {3}", [
    formatGuideBound(range.upMm, range.upNote),
    formatGuideBound(range.toMm, range.toNote),
    range.sensorReference,
    String(range.page),
  ]);
  return {
    range,
    label: range.orderAtypical
      ? `${label} · ${tr("ordre imprimé inhabituel, à confirmer")}`
      : label,
  };
}
