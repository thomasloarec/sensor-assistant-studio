/** Local, conservative interpretation of written constraints. Never changes answers.
 * Quantities retain their subject: travel/cable/remote placement are not a gap,
 * and a motor's supply is not the signal switched by the sensor.
 */
import type { Requirement } from "./dossier";

export const normalizeRequirement = (value: string) =>
  value
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’`]/g, " ")
    .replace(/[\u2212\u2010-\u2015]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

export function requirementClauses(text: string): string[] {
  // A decimal point/comma is part of a number, not a clause boundary.
  return normalizeRequirement(text)
    .replace(/\b(mm|cm|m)\.s(?=[-^])/g, "$1·s")
    .split(/(?<!\d)[.,](?!\d)|[;!?\n]|\b(?:mais|but|whereas|alors que)\b/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function signalVoltageV(requirements: readonly Requirement[]): number | null {
  const clauses = requirements
    .filter((r) => r.key === "electrical")
    .flatMap((r) => requirementClauses(r.value ?? ""));
  const signal = /\b(sensor|capteur|reed|signal|plc|automate|entree|input|contact|microcontr\w*)\b/;
  const load = /\b(moteur|motor|chauffage|heater|resistance|power circuit|circuit de puissance)\b/;
  const negative = /\b(jamais|never|not|without|interdit\w*)\b|\bne\b.{0,35}\bpas\b/;
  const values: number[] = [];
  for (const c of clauses) {
    if (negative.test(c) || load.test(c)) continue;
    if (!signal.test(c) && clauses.some((s) => signal.test(s))) continue;
    for (const m of c.matchAll(
      /(?<![\d.,])([+]?[\d]+(?:[.,]\d+)?)\s*v(?:\s*(?:dc|ac|continu|alternatif))?\b/g,
    ))
      values.push(Number(m[1]!.replace(",", ".")));
  }
  return values.length ? Math.max(...values) : null;
}

const RATE =
  /^\s*(?:(?:[/⁄∕]|(?:per|par|pro|por)\s+)\s*(?:s|sec|seconds?|secondes?|min|minutes?|h|hr|hours?|heures?)\b|[.·⋅*]?\s*(?:s|sec|min|h)\s*(?:\^\s*)?[-−⁻]\s*[1¹])/;
const GAP =
  /\b(?:entrefer|gap|ecart|distance|separe\w*|separat\w*|detect\w*|sensing|range|portee|away)\b|\b(?:aimant|magnet)\s*[- ](?:capteur|sensor)\b/;
const OTHER_DISTANCE =
  /\b(?:course|travel|stroke|cable|cord|wire|fil|deport\w*|remote|offset|decalage|diametre|diameter|epaisseur|thickness|paroi|wall)\b/;

export function explicitGapsMm(raw: string): number[] {
  const out: number[] = [];
  for (const text of requirementClauses(raw)) {
    if (!GAP.test(text) && !/\b(?:aimant|magnet|capteur|sensor)\b/.test(text)) continue;
    for (const m of text.matchAll(
      /(?<![\d.,])([+-]?\d+(?:[.,]\d+)?)\s*(mm|cm|m|inches|inch|in|pouces?)\b/g,
    )) {
      const i = m.index!,
        before = text.slice(0, i),
        after = text.slice(i + m[0].length);
      if (RATE.test(after)) continue;
      // Compare the nearest semantic anchors, instead of rejecting the whole answer.
      const last = (re: RegExp) =>
        [...before.matchAll(new RegExp(re.source, "g"))].at(-1)?.index ?? -1;
      const gapAt = last(GAP),
        otherAt = last(OTHER_DISTANCE);
      if (otherAt > gapAt) continue;
      if (
        /^\s*(?:de |of )?(?:cable|wire|fil|course|travel|diametre|diameter|d epaisseur|thick)\b/.test(
          after,
        )
      )
        continue;
      // Remote placement explicitly names the protected object, not the gap.
      if (
        /\b(?:deporte|deportee|remote|offset)\b/.test(before) &&
        /\b(?:du flacon|du produit|from the product|from the bottle)\b/.test(after)
      )
        continue;
      const positioned =
        /\bat\s*$/.test(before) || (/\ba\s*$/.test(before) && /\b(?:capteur|aimant)\b/.test(text));
      if (gapAt < 0 && !(positioned && /\b(?:aimant|magnet|capteur|sensor)\b/.test(text))) continue;
      const n = Number(m[1]!.replace(",", ".")),
        u = m[2]!;
      out.push(n * (u === "m" ? 1000 : u === "cm" ? 10 : /^(in|pouce)/.test(u) ? 25.4 : 1));
    }
  }
  return out.filter(Number.isFinite);
}

export const CONTACT_REVIEW =
  "La fonction du contact demandée (NF ou inverseur) doit être confirmée pour la variante exacte avec Standex ; elle ne se déduit pas du seul boîtier.";
export const REMOTE_MAGNET_REVIEW =
  "Un aimant peut être placé sur un support lié au mouvement, à distance de la zone sensible. Confirmez avec Standex cet emplacement, le champ admissible et l’entrefer réel du couple.";
export const QUALIFICATION_REVIEW =
  "Vos exigences de certification, de protection ou de cadence nécessitent une qualification Standex spécifique. Les familles affichées ne sont pas déclarées conformes à ces exigences.";
export const INCOMPLETE_REVIEW =
  "Certaines informations restent à préciser avec Standex : cible et aimant, entrefer, montage, interface électrique ou environnement. Les couples affichés sont des pistes à étudier.";
export const SPECIAL_MOUNT_REVIEW =
  "Le montage en rainure de vérin nécessite une fixation adaptée à préciser avec Standex. Aucune compatibilité mécanique avec cette rainure n’est affirmée.";
export const PAIR_GAP_REVIEW =
  "L’entrefer demandé ({0} mm) dépasse la distance indicative affichée pour ce couple ({1} mm). Étudier un autre aimant, un rapprochement ou un autre placement avec Standex.";
export const PAIR_GAP_UNKNOWN =
  "L’entrefer demandé ({0} mm) reste à vérifier : aucune distance n’est publiée pour ce couple exact.";

export function pairGapWarning(
  asked: readonly number[],
  displayed: number | null,
): { text: string; args: string[] } | null {
  const valid = asked.filter((n) => n >= 0);
  if (!valid.length) return null;
  const max = Math.max(...valid);
  if (displayed === null) return { text: PAIR_GAP_UNKNOWN, args: [String(max)] };
  return max > displayed ? { text: PAIR_GAP_REVIEW, args: [String(max), String(displayed)] } : null;
}
