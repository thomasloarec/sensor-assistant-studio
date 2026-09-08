/**
 * Remplissage du NDA Standex à partir du binaire original approuvé.
 *
 * Règles non négociables :
 * - le modèle original n'est jamais modifié : on produit une copie remplie ;
 * - seuls les champs variables listés dans VARIABLE_FIELDS sont touchés ;
 * - tous les autres fichiers du .docx sont réécrits à l'identique (octet pour octet) ;
 * - aucune signature n'est ajoutée : les mentions Stamp/Signature restent vides.
 *
 * Le traitement est purement local (zip + XML), il ne nécessite aucun envoi.
 */
import { unzipSync, zipSync } from "fflate";

/** SHA-256 du binaire original fourni par Standex. */
export const NDA_TEMPLATE_SHA256 =
  "6e25345f1e83e92630258774d27a451d65d615cdd9f41a5331dae75c4072740b";
export const NDA_TEMPLATE_FILE_NAME = "NDA Standex x K Motor_16062026.docx";
/** Chemin servi par l'application, lu localement par le navigateur. */
export const NDA_TEMPLATE_URL = "/legal/nda-standex-k-motor-16062026.docx";
const DOCUMENT_ENTRY = "word/document.xml";

export interface NdaVariableValues {
  /** Raison sociale du client. */
  companyName: string;
  /** Rue et numéro. */
  companyStreet: string;
  /** Code postal et ville. */
  companyPostalCity: string;
  /** Pays. */
  companyCountry: string;
  /** Date côté Standex (le lieu « Welschingen, Germany » reste figé). */
  standexDate: string;
  /** Nom du signataire client. */
  signatoryName: string;
  /** Fonction du signataire client. */
  signatoryPosition: string;
  /** Lieu et date de signature côté client. */
  clientPlaceDate: string;
}

export const EMPTY_NDA_VALUES: NdaVariableValues = {
  companyName: "",
  companyStreet: "",
  companyPostalCity: "",
  companyCountry: "",
  standexDate: "",
  signatoryName: "",
  signatoryPosition: "",
  clientPlaceDate: "",
};

type FieldKey = keyof NdaVariableValues;

interface VariableField {
  key: FieldKey;
  label: string;
  /** Index du paragraphe dans ./w:body/w:p, base zéro. */
  paragraph: number;
  /** Texte attendu dans le modèle original, sert de garde-fou. */
  expectedParagraph: string;
  /** Portion variable du paragraphe : tout le paragraphe si absent. */
  span?: { prefix: string; current: string };
  /** Espaces ajoutés autour de la valeur, dans ce champ uniquement. */
  pad?: { before: string; after: string };
  /** Normalise les tabulations de remplissage de ce paragraphe une fois rempli. */
  tidyTabs?: boolean;
}

/** Les seuls emplacements que le remplissage a le droit de toucher. */
export const VARIABLE_FIELDS: readonly VariableField[] = [
  {
    key: "companyName",
    label: "Raison sociale du client",
    paragraph: 11,
    expectedParagraph: "K Motors SAS",
  },
  {
    key: "companyStreet",
    label: "Rue du client",
    paragraph: 12,
    expectedParagraph: "30 Impasse du nid",
  },
  {
    key: "companyPostalCity",
    label: "Code postal et ville",
    paragraph: 13,
    expectedParagraph: "13790 Peynier",
  },
  {
    key: "companyCountry",
    label: "Pays",
    paragraph: 14,
    expectedParagraph: "France",
  },
  {
    key: "standexDate",
    label: "Date côté Standex",
    paragraph: 78,
    expectedParagraph:
      "Place/date:Welschingen, Germany – 16.06.2026Stamp/Signature:   ___________________",
    span: { prefix: "Place/date:Welschingen, Germany – ", current: "16.06.2026" },
  },
  {
    key: "signatoryName",
    label: "Nom du signataire client",
    paragraph: 84,
    expectedParagraph: "Name : TO BE DEFINED",
    span: { prefix: "Name : ", current: "TO BE DEFINED" },
  },
  {
    key: "signatoryPosition",
    label: "Fonction du signataire client",
    paragraph: 85,
    expectedParagraph: "Position : TO BE DEFINED",
    span: { prefix: "Position : ", current: "TO BE DEFINED" },
  },
  {
    key: "clientPlaceDate",
    label: "Lieu et date de signature du client",
    paragraph: 86,
    expectedParagraph: "Place/date:Stamp/Signature:   ____________________",
    // Un espace après le libellé, un espace de séparation après la valeur.
    span: { prefix: "Place/date:", current: "" },
    pad: { before: " ", after: " " },
    tidyTabs: true,
  },
];

/* ------------------------------------------------------------------ */
/* Validation des valeurs saisies                                      */
/* ------------------------------------------------------------------ */

const MAX_FIELD_LENGTH = 200;
/** Caractères interdits en XML 1.0 (NUL et autres commandes), plus les sauts de ligne. */
// eslint-disable-next-line no-control-regex
const FORBIDDEN_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\uFFFE\uFFFF]/;
const LINE_BREAKS = /[\r\n\t]/;

/** Renvoie la liste des problèmes ; vide si toutes les valeurs sont acceptables. */
export function validateNdaValues(values: NdaVariableValues): string[] {
  const problems: string[] = [];
  for (const field of VARIABLE_FIELDS) {
    const raw = values[field.key];
    if (typeof raw !== "string") {
      problems.push(`${field.label} : valeur illisible.`);
      continue;
    }
    const value = raw.trim();
    if (!value) continue;
    if (value.length > MAX_FIELD_LENGTH)
      problems.push(`${field.label} : ${value.length} caractères, maximum ${MAX_FIELD_LENGTH}.`);
    if (FORBIDDEN_CHARS.test(value))
      problems.push(`${field.label} : contient un caractère que le document ne peut pas afficher.`);
    if (LINE_BREAKS.test(value)) problems.push(`${field.label} : doit tenir sur une seule ligne.`);
  }
  return problems;
}

/* ------------------------------------------------------------------ */
/* Lecture XML minimale, sans DOM : fonctionne au navigateur et en test */
/* ------------------------------------------------------------------ */

interface Range {
  start: number;
  end: number;
}

/** Portées des paragraphes enfants directs de w:body. */
export function bodyParagraphRanges(xml: string): Range[] {
  const bodyOpen = xml.indexOf("<w:body");
  const bodyStart = xml.indexOf(">", bodyOpen) + 1;
  const bodyEnd = xml.indexOf("</w:body>", bodyStart);
  if (bodyOpen < 0 || bodyEnd < 0) throw new Error("document.xml : w:body introuvable.");
  const ranges: Range[] = [];
  const tag = /<(\/?)([A-Za-z0-9:._-]+)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
  tag.lastIndex = bodyStart;
  let depth = 0;
  let open: { name: string; start: number } | null = null;
  let m: RegExpExecArray | null;
  while ((m = tag.exec(xml)) && m.index < bodyEnd) {
    const [full, closing, name, , selfClose] = m;
    if (selfClose === "/") {
      if (depth === 0 && name === "w:p")
        ranges.push({ start: m.index, end: m.index + full.length });
      continue;
    }
    if (closing === "/") {
      depth -= 1;
      if (depth === 0 && open && open.name === name) {
        if (name === "w:p") ranges.push({ start: open.start, end: m.index + full.length });
        open = null;
      }
      continue;
    }
    if (depth === 0) open = { name: name!, start: m.index };
    depth += 1;
  }
  return ranges;
}

const TEXT_NODE = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;

function decode(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");
}

function encode(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Texte concaténé de chaque paragraphe de w:body. */
export function bodyParagraphTexts(xml: string): string[] {
  return bodyParagraphRanges(xml).map((r) => {
    const slice = xml.slice(r.start, r.end);
    let out = "";
    for (const m of slice.matchAll(TEXT_NODE)) out += decode(m[1]!);
    return out;
  });
}

/** Une exécution ne contenant qu'une tabulation (avec ou sans mise en forme). */
const TAB_RUN_SOURCE = "<w:r\\b[^>]*>(?:<w:rPr>[\\s\\S]*?</w:rPr>)?<w:tab/></w:r>";
const SINGLE_TAB_RUN = "<w:r><w:tab/></w:r>";

/**
 * Nettoie les tabulations de remplissage du champ « Place/date » client :
 * une seule séparation entre la date et Stamp/Signature, plus de tabulations
 * inutiles après le trait de signature. Rien d'autre n'est touché.
 */
function tidyTabRuns(paragraphXml: string): string {
  return paragraphXml
    .replace(new RegExp(`(?:${TAB_RUN_SOURCE}){2,}`, "g"), SINGLE_TAB_RUN)
    .replace(new RegExp(`(?:${TAB_RUN_SOURCE})+(?=</w:p>)`, "g"), "");
}

function fillParagraph(paragraphXml: string, field: VariableField, rawValue: string): string {
  const value = field.pad ? field.pad.before + rawValue + field.pad.after : rawValue;
  const nodes: { start: number; end: number; text: string }[] = [];
  for (const m of paragraphXml.matchAll(TEXT_NODE)) {
    const inner = m[1]!;
    const innerStart = m.index! + m[0]!.length - inner.length - "</w:t>".length;
    nodes.push({ start: innerStart, end: innerStart + inner.length, text: decode(inner) });
  }
  const whole = nodes.map((n) => n.text).join("");
  if (whole !== field.expectedParagraph)
    throw new Error(
      `Le modèle NDA a changé : paragraphe ${field.paragraph} attendu « ${field.expectedParagraph} ».`,
    );

  // Portée à remplacer, en offsets du texte concaténé.
  let from = 0;
  let to = whole.length;
  if (field.span) {
    from = field.span.prefix.length;
    to = from + field.span.current.length;
  }

  let out = "";
  let cursor = 0;
  let offset = 0; // position dans le texte concaténé
  let written = false;
  for (const node of nodes) {
    const nodeStart = offset;
    const nodeEnd = offset + node.text.length;
    offset = nodeEnd;
    const overlaps = nodeEnd > from && nodeStart < to;
    const insertionPoint = from === to && nodeEnd === from;
    if (!overlaps && !insertionPoint) continue;
    const head = node.text.slice(0, Math.max(0, Math.min(node.text.length, from - nodeStart)));
    const tail = node.text.slice(Math.max(0, Math.min(node.text.length, to - nodeStart)));
    const replacement = written ? head + tail : head + value + tail;
    written = true;
    out += paragraphXml.slice(cursor, node.start) + encode(replacement);
    cursor = node.end;
  }
  if (!written) throw new Error(`Le modèle NDA a changé : champ « ${field.label} » introuvable.`);
  out += paragraphXml.slice(cursor);
  if (field.tidyTabs) out = tidyTabRuns(out);
  // Les espaces significatifs doivent survivre à Word.
  return out.replace(/<w:t>/g, '<w:t xml:space="preserve">');
}

/** Applique les seules valeurs variables au XML du document. */
export function fillDocumentXml(xml: string, values: NdaVariableValues): string {
  const ranges = bodyParagraphRanges(xml);
  let out = "";
  let cursor = 0;
  for (const field of [...VARIABLE_FIELDS].sort((a, b) => a.paragraph - b.paragraph)) {
    const range = ranges[field.paragraph];
    if (!range) throw new Error(`Le modèle NDA a changé : paragraphe ${field.paragraph} absent.`);
    const value = values[field.key].trim();
    if (!value) continue;
    out +=
      xml.slice(cursor, range.start) +
      fillParagraph(xml.slice(range.start, range.end), field, value);
    cursor = range.end;
  }
  return out + xml.slice(cursor);
}

/* ------------------------------------------------------------------ */
/* Zip                                                                 */
/* ------------------------------------------------------------------ */

export async function sha256Hex(data: ArrayBuffer | Uint8Array): Promise<string> {
  const view = data instanceof Uint8Array ? data : new Uint8Array(data);
  const buffer = new Uint8Array(view).buffer;
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface FilledNda {
  bytes: Uint8Array;
  fileName: string;
  /** Paragraphes du document rempli, pour l'aperçu local des clauses. */
  paragraphs: string[];
  /** Champs réellement renseignés. */
  filledFields: { label: string; value: string }[];
}

export function missingNdaFields(values: NdaVariableValues): string[] {
  return VARIABLE_FIELDS.filter((f) => !values[f.key].trim()).map((f) => f.label);
}

/** Vérifie l'empreinte du modèle puis produit une copie remplie et non signée. */
export async function fillNdaTemplate(
  template: ArrayBuffer | Uint8Array,
  values: NdaVariableValues,
): Promise<FilledNda> {
  const bytes = template instanceof Uint8Array ? template : new Uint8Array(template);
  const hash = await sha256Hex(bytes);
  if (hash !== NDA_TEMPLATE_SHA256)
    throw new Error(
      "Le fichier NDA local ne correspond pas au modèle approuvé (empreinte SHA-256 différente).",
    );
  const entries = unzipSync(bytes);
  const original = entries[DOCUMENT_ENTRY];
  if (!original) throw new Error("Le modèle NDA ne contient pas word/document.xml.");
  const problems = validateNdaValues(values);
  if (problems.length) throw new Error(`Valeurs refusées pour le NDA : ${problems.join(" ")}`);
  const xml = new TextDecoder().decode(original);
  const filled = fillDocumentXml(xml, values);
  // Tous les autres fichiers sont réinjectés tels quels.
  const next: Record<string, Uint8Array> = {};
  for (const [name, content] of Object.entries(entries)) next[name] = content;
  next[DOCUMENT_ENTRY] = new TextEncoder().encode(filled);
  return {
    bytes: zipSync(next, { level: 6, mtime: new Date("1980-01-01T00:00:00Z") }),
    fileName: ndaFileName(values),
    paragraphs: bodyParagraphTexts(filled),
    filledFields: VARIABLE_FIELDS.filter((f) => values[f.key].trim()).map((f) => ({
      label: f.label,
      value: values[f.key].trim(),
    })),
  };
}

export function ndaFileName(values: NdaVariableValues): string {
  const company = values.companyName
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_|_$/g, "");
  return `NDA Standex${company ? " x " + company : ""} - non signe.docx`;
}

/** Charge le modèle depuis l'application, sans transfert vers un tiers. */
export async function loadNdaTemplate(fetchImpl: typeof fetch = fetch): Promise<Uint8Array> {
  const response = await fetchImpl(NDA_TEMPLATE_URL);
  if (!response.ok) throw new Error("Modèle NDA introuvable dans l'application.");
  return new Uint8Array(await response.arrayBuffer());
}
