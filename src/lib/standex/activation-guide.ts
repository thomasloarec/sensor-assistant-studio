import raw from "@/data/studio-v2/activation-guide.json";
import { number } from "@/lib/i18n/core";
import { BARE_MAGNETS, type CatalogMagnet } from "./magnet-catalog";

/**
 * Guide d'activation officiel Standex (brochure 40 pages, édition 10/2025).
 *
 * Ce registre est SÉPARÉ du registre des distances publiées
 * (`magnetics/registries.ts`) et le reste : les colonnes « up » et « to » du
 * guide sont les BORNES D'UNE PLAGE mesurée par Standex sur une série de
 * capteurs. Elles ne sont JAMAIS lues comme un seuil d'activation (pull-in) ni
 * comme un seuil de relâchement (drop-out), jamais recopiées dans le moteur de
 * couverture, jamais interpolées, jamais moyennées. Elles sont affichées telles
 * quelles, avec l'aimant, l'approche et la référence exacte de la ligne.
 *
 * Trois autres règles de fidélité :
 * - une case « - » signifie NON PUBLIÉ (`upNote`/`toNote` = "not_published"),
 *   jamais zéro ;
 * - une case « <0 » signifie « sous zéro » (`"below_zero"`), jamais zéro ;
 * - la classe de sensibilité (A–G) ou le modèle de contact imprimés dans la
 *   colonne de gauche restent la CHAÎNE de la brochure (`sensorReference`) :
 *   ni convertis l'un en l'autre, ni confondus avec le matériau de l'aimant.
 *
 * Les pages impaires de la brochure portent, en coordonnées négatives, le
 * calque du tableau de la page paire précédente (planche double). L'extraction
 * ne conserve que la colonne réellement imprimée sur la page, d'où l'absence de
 * doublon contradictoire dans `rows`.
 */
export interface GuideSource {
  url: string;
  sha256: string;
  pages: string;
  title: string;
}
export interface GuideMagnet {
  id: string;
  /** Libellé exact de l'en-tête de tableau. */
  label: string;
  material: "AlNiCo" | "Ferrite" | "NdFeB" | "SmCo";
  shape: "cylinder" | "block";
  /** Moment magnétique publié, en 10⁻⁶ Vs·cm : documentaire, jamais converti. */
  momentE6Vscm: number;
}
export interface GuideRange {
  page: number;
  sensorFamily: string;
  /** Ligne du tableau, telle qu'imprimée (« MK15-B-X », « MK21-1A66A-X »…). */
  sensorReference: string;
  magnetId: string;
  approachId: string;
  /** Colonne « up » de la brochure, en mm. `null` si non publiée. */
  upMm: number | null;
  /** Colonne « to » de la brochure, en mm. `null` si non publiée. Elle peut
   *  être INFÉRIEURE à `upMm` : les deux colonnes ne sont pas triées. */
  toMm: number | null;
  upNote?: "not_published" | "below_zero";
  toNote?: "not_published" | "below_zero";
}
export interface ActivationGuide {
  version: string;
  source: GuideSource;
  magnets: readonly GuideMagnet[];
  rows: readonly GuideRange[];
}

const MATERIALS = ["AlNiCo", "Ferrite", "NdFeB", "SmCo"] as const;
const NOTES = ["not_published", "below_zero"] as const;
const EMPTY: ActivationGuide = {
  version: "unavailable",
  source: { url: "", sha256: "", pages: "", title: "" },
  magnets: [],
  rows: [],
};
const note = (v: unknown): GuideRange["upNote"] | undefined =>
  typeof v === "string" && (NOTES as readonly string[]).includes(v)
    ? (v as GuideRange["upNote"])
    : undefined;
const bound = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Lecture défensive : une ligne mal formée est ÉCARTÉE, jamais réparée. */
export function readActivationGuide(value: unknown): ActivationGuide {
  if (!value || typeof value !== "object") return EMPTY;
  const data = value as ActivationGuide;
  if (typeof data.version !== "string" || !Array.isArray(data.rows) || !Array.isArray(data.magnets))
    return EMPTY;
  const magnets = data.magnets.filter(
    (m): m is GuideMagnet =>
      !!m &&
      typeof m.id === "string" &&
      typeof m.label === "string" &&
      (MATERIALS as readonly string[]).includes(m.material) &&
      (m.shape === "cylinder" || m.shape === "block") &&
      Number.isFinite(m.momentE6Vscm),
  );
  const known = new Set(magnets.map((m) => m.id));
  const seen = new Set<string>();
  const rows: GuideRange[] = [];
  for (const r of data.rows) {
    if (
      !r ||
      typeof r.sensorFamily !== "string" ||
      typeof r.sensorReference !== "string" ||
      !known.has(r.magnetId) ||
      !/^D[1-5]$/.test(r.approachId) ||
      !Number.isFinite(r.page)
    )
      continue;
    const upMm = bound(r.upMm),
      toMm = bound(r.toMm);
    // Une valeur négative n'est pas corrigée : elle est écartée.
    // En revanche « to » PEUT être inférieur à « up » : ce sont deux colonnes
    // distinctes de la brochure, pas les bornes triées d'un intervalle. Elles
    // sont conservées dans l'ordre imprimé, sans tri ni correction.
    if (upMm !== null && upMm < 0) continue;
    if (toMm !== null && toMm < 0) continue;
    const key = r.sensorReference + "|" + r.magnetId + "|" + r.approachId;
    if (seen.has(key)) continue;
    seen.add(key);
    const upNote = note(r.upNote);
    const toNote = note(r.toNote);
    rows.push({
      page: r.page,
      sensorFamily: r.sensorFamily,
      sensorReference: r.sensorReference,
      magnetId: r.magnetId,
      approachId: r.approachId,
      upMm,
      toMm,
      ...(upNote === undefined ? {} : { upNote }),
      ...(toNote === undefined ? {} : { toNote }),
    });
  }
  const source = (data.source ?? {}) as GuideSource;
  return {
    version: data.version,
    source: {
      url: typeof source.url === "string" ? source.url : "",
      sha256: typeof source.sha256 === "string" ? source.sha256 : "",
      pages: typeof source.pages === "string" ? source.pages : "",
      title: typeof source.title === "string" ? source.title : "",
    },
    magnets,
    rows,
  };
}
export const ACTIVATION_GUIDE = readActivationGuide(raw);

/** Aimant du guide, enrichi de ses cotes d'enveloppe si le catalogue les publie. */
export interface GuideMagnetOption extends GuideMagnet {
  /** Enveloppe [X, Y, Z] en mm quand le catalogue la publie, sinon `null`. */
  body: CatalogMagnet["body"] | null;
}
const bodyOf = (id: string) => BARE_MAGNETS.find((m) => m.id === id)?.body ?? null;

/** Familles de capteurs réellement présentes dans le guide. */
export function guideFamilies(guide = ACTIVATION_GUIDE): string[] {
  return [...new Set(guide.rows.map((r) => r.sensorFamily))].sort();
}
/** Le guide publie-t-il au moins une plage pour cette famille ? */
export function hasGuideData(sensorFamily: string, guide = ACTIVATION_GUIDE): boolean {
  return guide.rows.some((r) => r.sensorFamily === sensorFamily);
}
/**
 * Aimants standard que le guide documente POUR CETTE FAMILLE, dans l'ordre
 * d'apparition de la brochure. Aucun aimant n'est ajouté par ressemblance de
 * nom ou de forme : seule la présence d'une ligne compte.
 */
export function guideMagnetsFor(
  sensorFamily: string,
  guide = ACTIVATION_GUIDE,
): GuideMagnetOption[] {
  const ids = new Set(guide.rows.filter((r) => r.sensorFamily === sensorFamily).map((r) => r.magnetId));
  return guide.magnets.filter((m) => ids.has(m.id)).map((m) => ({ ...m, body: bodyOf(m.id) }));
}
/** Matériaux réellement documentés pour cette famille, avec leurs aimants. */
export function guideMaterialsFor(
  sensorFamily: string,
  guide = ACTIVATION_GUIDE,
): { material: GuideMagnet["material"]; magnets: GuideMagnetOption[] }[] {
  const out: { material: GuideMagnet["material"]; magnets: GuideMagnetOption[] }[] = [];
  for (const magnet of guideMagnetsFor(sensorFamily, guide)) {
    const bucket = out.find((o) => o.material === magnet.material);
    if (bucket) bucket.magnets.push(magnet);
    else out.push({ material: magnet.material, magnets: [magnet] });
  }
  return out;
}
/** Plages publiées d'un couple famille + aimant, telles qu'elles sont saisies. */
export function guideRangesFor(
  sensorFamily: string,
  magnetId: string,
  guide = ACTIVATION_GUIDE,
): GuideRange[] {
  return guide.rows.filter((r) => r.sensorFamily === sensorFamily && r.magnetId === magnetId);
}
/** Références (lignes) publiées pour ce couple, dans l'ordre de la brochure. */
export function guideReferencesFor(
  sensorFamily: string,
  magnetId: string,
  guide = ACTIVATION_GUIDE,
): string[] {
  return [...new Set(guideRangesFor(sensorFamily, magnetId, guide).map((r) => r.sensorReference))];
}
/** Approches publiées pour ce couple. */
export function guideApproachesFor(
  sensorFamily: string,
  magnetId: string,
  guide = ACTIVATION_GUIDE,
): string[] {
  return [...new Set(guideRangesFor(sensorFamily, magnetId, guide).map((r) => r.approachId))];
}
/** Une plage exacte, ou `null` si la brochure ne publie pas cette combinaison. */
export function guideRange(
  sensorFamily: string,
  sensorReference: string,
  magnetId: string,
  approachId: string,
  guide = ACTIVATION_GUIDE,
): GuideRange | null {
  return (
    guide.rows.find(
      (r) =>
        r.sensorFamily === sensorFamily &&
        r.sensorReference === sensorReference &&
        r.magnetId === magnetId &&
        r.approachId === approachId,
    ) ?? null
  );
}
/**
 * Choix par défaut pour une famille : le PLUS GRAND aimant d'un matériau
 * économique documenté (bloc ferrite, sinon cylindre AlNiCo). C'est une
 * politique de recommandation, pas une preuve de prix : aucun tarif n'est
 * publié dans le guide et rien n'est présenté comme « le moins cher ».
 */
export function guideEconomicalMagnet(
  sensorFamily: string,
  guide = ACTIVATION_GUIDE,
): GuideMagnetOption | null {
  const magnets = guideMagnetsFor(sensorFamily, guide);
  const order: GuideMagnet["material"][] = ["Ferrite", "AlNiCo", "NdFeB", "SmCo"];
  for (const material of order) {
    const found = magnets.filter((m) => m.material === material);
    if (found.length > 0)
      return found.reduce((a, b) => (b.momentE6Vscm > a.momentE6Vscm ? b : a));
  }
  return null;
}
/** Rendu d'une borne : « 15,4 » ; « <0 » ; « non publié ». */
export function formatGuideBound(
  value: number | null,
  bound: GuideRange["upNote"] | undefined,
): string {
  if (value !== null) return number(value);
  if (bound === "below_zero") return "<0";
  return "—";
}
