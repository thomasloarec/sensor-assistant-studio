/** Place disponible POUR LE CAPTEUR écrite en texte libre (A05).
 *
 * Proposition seulement : rien n'est appliqué sans action explicite. Une phrase
 * n'est retenue que si elle parle d'espace/encombrement maximal et donne trois
 * cotes avec une unité millimétrique ou centimétrique. Les cotes d'aimant, de
 * pièce ou de câble ne sont jamais lues comme place capteur. Deux triplets
 * différents, une unité absente ou non métrique, un signe négatif → « ambigu »,
 * jamais une supposition.
 */
import type { EnvelopeMm, Requirement } from "./dossier";

export type EnvelopeSuggestion =
  | { kind: "found"; envelope: { lengthMm: number; widthMm: number; heightMm: number }; quote: string; key: string }
  | { kind: "ambiguous"; quote: string; key: string };

const norm = (v: string) =>
  v.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/['’`]/g, " ").replace(/\s+/g, " ");

const SPACE = /\b(available (sensor )?(space|volume|envelope)|maximum (available )?(sensor )?(space|volume|envelope|size)|max(imum)? (sensor )?(space|volume|envelope|size)|sensor (space|volume|envelope|pocket)|must fit (in|within|into|inside)|fits? inside|doit (tenir|entrer) dans|place disponible|espace disponible|volume disponible|encombrement (max\w*|disponible)|logement (du capteur|disponible)|taille max\w*|dimensions? max\w*)\b/;
const OTHER_OBJECT = /\b(aimant|aimants|magnet|magnets|cable|cables|piece|part|target|cible|bracket|support|housing of the machine)\b/;
const NUM = "(\\d+(?:[.,]\\d+)?)";
const TRIPLE = new RegExp(`(-\\s*)?${NUM}\\s*(mm|cm|m|in|")?\\s*[x×*]\\s*${NUM}\\s*(mm|cm|m|in|")?\\s*[x×*]\\s*${NUM}\\s*(mm|cm|m|in|"|inch|inches)?`, "g");

function sentences(requirements: readonly Requirement[], free: string) {
  const out: { key: string; quote: string }[] = [];
  const push = (key: string, raw: string) => {
    for (const s of raw.split(/(?<=[.;!?\n])\s+|\n+/)) if (s.trim()) out.push({ key, quote: s.trim() });
  };
  for (const r of requirements) if (r.value?.trim()) push(r.key, r.value);
  if (free.trim()) push("free_constraints", free);
  return out;
}

export function detectEnvelopeFromText(requirements: readonly Requirement[], free: string): EnvelopeSuggestion | null {
  const found: { env: [number, number, number]; quote: string; key: string }[] = [];
  let ambiguous: { quote: string; key: string } | null = null;
  for (const s of sentences(requirements, free)) {
    const text = norm(s.quote);
    if (!SPACE.test(text) || OTHER_OBJECT.test(text)) continue;
    const matches = [...text.matchAll(TRIPLE)];
    if (matches.length === 0) continue;
    for (const m of matches) {
      const units = [m[3], m[5], m[7]].filter(Boolean) as string[];
      const unit = units[units.length - 1];
      const mixed = new Set(units).size > 1;
      if (m[1] || !unit || mixed || !["mm", "cm"].includes(unit)) {
        ambiguous ??= s;
        continue;
      }
      const f = unit === "cm" ? 10 : 1;
      const v = [m[2], m[4], m[6]].map((x) => Number(x!.replace(",", ".")) * f) as [number, number, number];
      if (v.some((n) => !Number.isFinite(n) || n <= 0 || n > 1000)) {
        ambiguous ??= s;
        continue;
      }
      found.push({ env: v, quote: s.quote, key: s.key });
    }
  }
  const distinct = new Set(found.map((f) => f.env.join("x")));
  if (distinct.size > 1) return { kind: "ambiguous", quote: found[0]!.quote, key: found[0]!.key };
  if (found.length) {
    const [l, w, h] = found[0]!.env;
    return { kind: "found", envelope: { lengthMm: l, widthMm: w, heightMm: h }, quote: found[0]!.quote, key: found[0]!.key };
  }
  return ambiguous ? { kind: "ambiguous", ...ambiguous } : null;
}

/** La saisie structurée gagne toujours : rien n'est proposé dès qu'une cote existe. */
export const envelopeIsEmpty = (e: EnvelopeMm) => e.lengthMm === null && e.widthMm === null && e.heightMm === null;

/* i18n-canonical */
export const ENVELOPE_TEXT = {
  found: "Place disponible détectée dans vos réponses : {0} × {1} × {2} mm. L'appliquer aux dimensions ?",
  title: "Dimensions détectées dans vos réponses",
  notYet:
    "Les couples ci-dessous ne tiennent pas encore compte de ces dimensions : elles ne seront utilisées qu'après votre confirmation.",
  apply: "Appliquer ces dimensions",
  decline: "Ne pas appliquer",
  ambiguous:
    "Une place disponible semble décrite dans vos réponses, mais les cotes ou l'unité sont ambiguës : saisissez-les ci-dessous pour qu'elles filtrent les capteurs.",
} as const;
