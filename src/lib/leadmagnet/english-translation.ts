/**
 * Production de la VERSION ANGLAISE du rapport — logique pure et testable.
 *
 * Ce module ne connaît ni le réseau ni Supabase : il reçoit le snapshot
 * immuable d'une révision, en extrait les segments RÉELLEMENT rédigés par des
 * personnes, les fait traduire par un fournisseur injecté, contrôle la sortie,
 * puis reconstruit un rapport anglais complet.
 *
 * Règles non négociables appliquées ici :
 *  - l'original n'est jamais modifié : on travaille sur une copie ;
 *  - la langue de départ du projet (`sourceLocale`) n'est pas la langue
 *    effective des saisies : on ne suppose rien, chaque segment est traduit
 *    « quelle que soit sa langue », y compris un dossier mélangeant fr/ru/ja ;
 *  - références (MK24-A-J), nombres, unités, dates, e-mails, noms de fichiers
 *    et identifiants doivent ressortir à l'identique : c'est vérifié, pas
 *    espéré. Un écart rend la traduction NON prête.
 *  - le texte utilisateur est une DONNÉE, jamais une instruction.
 */
import {
  estimateCableLength,
  uncoveredMotionStates,
  type Point,
} from "./cabling";
import type { ClientDossierDto } from "./dossier";

export interface Segment {
  id: string;
  text: string;
}

/** Limites d'entrée/sortie : au-delà, on refuse plutôt que de tronquer. */
export const MAX_SEGMENT_CHARS = 8000;
export const MAX_TOTAL_CHARS = 60000;

type PathSetter = (dto: ClientDossierDto, value: string) => void;

interface Field {
  id: string;
  get: (dto: ClientDossierDto) => string | null | undefined;
  set: PathSetter;
}

/** Champs textuels rédigés par des personnes, dans TOUTES les zones du dossier. */
function fields(dto: ClientDossierDto): Field[] {
  const list: Field[] = [
    { id: "title", get: (d) => d.title, set: (d, v) => (d.title = v) },
    {
      id: "freeConstraints",
      get: (d) => d.freeConstraints,
      set: (d, v) => (d.freeConstraints = v),
    },
  ];
  dto.requirements.forEach((_, i) => {
    list.push(
      {
        id: `req.${i}.label`,
        get: (d) => d.requirements[i]?.label,
        set: (d, v) => {
          const r = d.requirements[i];
          if (r) r.label = v;
        },
      },
      {
        id: `req.${i}.value`,
        get: (d) => d.requirements[i]?.value,
        set: (d, v) => {
          const r = d.requirements[i];
          if (r) r.value = v;
        },
      },
      {
        id: `req.${i}.note`,
        get: (d) => d.requirements[i]?.note,
        set: (d, v) => {
          const r = d.requirements[i];
          if (r) r.note = v;
        },
      },
    );
  });
  (dto.openQuestions ?? []).forEach((_, i) => {
    list.push({
      id: `question.${i}`,
      get: (d) => d.openQuestions[i],
      set: (d, v) => {
        d.openQuestions[i] = v;
      },
    });
  });
  if (dto.mounting.kind === "other") {
    list.push({
      id: "mounting.description",
      get: (d) => (d.mounting.kind === "other" ? d.mounting.description : ""),
      set: (d, v) => {
        if (d.mounting.kind === "other") d.mounting.description = v;
      },
    });
  }
  (dto.cabling.declaredMotionStates ?? []).forEach((_, i) => {
    list.push({
      id: `motion.${i}`,
      get: (d) => d.cabling.declaredMotionStates[i]?.label,
      set: (d, v) => {
        const s = d.cabling.declaredMotionStates[i];
        if (s) s.label = v;
      },
    });
  });
  const term = dto.termination;
  if (term.kind === "free_reference") {
    list.push({
      id: "termination.text",
      get: (d) => (d.termination.kind === "free_reference" ? d.termination.text : ""),
      set: (d, v) => {
        if (d.termination.kind === "free_reference") d.termination.text = v;
      },
    });
  }
  if (term.kind === "qualified_connector" || term.kind === "unqualified_connector") {
    const spec = (d: ClientDossierDto) =>
      d.termination.kind === "qualified_connector"
        ? d.termination.combo.connector
        : d.termination.kind === "unqualified_connector"
          ? d.termination.spec
          : null;
    list.push(
      {
        id: "termination.mating",
        get: (d) => spec(d)?.mating ?? "",
        set: (d, v) => {
          const s = spec(d);
          if (s) s.mating = v;
        },
      },
      {
        id: "termination.pinout",
        get: (d) => spec(d)?.pinout ?? "",
        set: (d, v) => {
          const s = spec(d);
          if (s) s.pinout = v;
        },
      },
      {
        id: "termination.conditions",
        get: (d) => spec(d)?.conditions ?? "",
        set: (d, v) => {
          const s = spec(d);
          if (s) s.conditions = v;
        },
      },
    );
  }
  return list;
}

/** Segments réellement à traduire : les champs vides ne partent nulle part. */
export function collectSegments(dto: ClientDossierDto): Segment[] {
  return fields(dto)
    .map((f) => ({ id: f.id, text: (f.get(dto) ?? "").toString() }))
    .filter((s) => s.text.trim().length > 0);
}

/** Copie traduite : l'objet d'origine n'est jamais touché. */
export function applySegments(
  dto: ClientDossierDto,
  translated: Record<string, string>,
): ClientDossierDto {
  const copy = structuredClone(dto) as ClientDossierDto;
  for (const f of fields(copy)) {
    const value = translated[f.id];
    if (typeof value === "string" && value.trim()) f.set(copy, value);
  }
  return copy;
}

/** Nombre maximal de jetons contrôlés par segment : au-delà, on refuse. */
export const MAX_TOKENS_PER_SEGMENT = 300;
/** Taille maximale cumulée de la sortie fournisseur acceptée. */
export const MAX_OUTPUT_CHARS = MAX_TOTAL_CHARS * 2;

/** Unités reconnues, comparées telles quelles : mm ne devient jamais cm. */
const UNITS = [
  "mm²","mm2","cm²","cm2","mm","cm","dm","µm","um","m","km",
  "°C","°F","K","kV","mV","V","mA","µA","uA","A","kΩ","Ω","ohm","mW","kW","W",
  "kHz","MHz","Hz","mT","µT","uT","T","G","N·m","Nm","N","AWG","%",
  "ms","µs","us","s","min","h","kg","mg","g","bar","Pa","kPa","VA","Ah","mAh",
];
const UNIT_ALT = UNITS.map((u) => u.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");

const RE_EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/g;
const RE_REF = /\b[A-Z][A-Z0-9]*\d[A-Z0-9]*(?:-[A-Z0-9]+)*\b/g;
const RE_FILE = /\b[\w-]+\.(?:glb|pdf|step|stp|iges|igs|docx|png|jpg|jpeg|csv|json)\b/gi;
const RE_HEX = /\b[0-9a-f]{16,}\b/gi;
/** Nombre SIGNÉ, jamais collé à un autre chiffre ni à une lettre : 5 ≠ 50. */
const RE_NUMBER = new RegExp(
  String.raw`(?<![\w.,])([-+]?\d+(?:[.,]\d+)?)(?![\w.,]*\d)\s?(` + UNIT_ALT + String.raw`)?(?![\w])`,
  "gu",
);

/**
 * Jetons qui doivent survivre à la traduction, AVEC leur multiplicité.
 * Un nombre est capturé signé (`-40`, `+85`) et, si une unité le suit, le
 * couple « nombre unité » devient un jeton supplémentaire : ainsi `2,5 mm`
 * traduit en `2,5 cm` est refusé, et `-40` transformé en `+40` aussi.
 * Ce contrôle est LEXICAL : il ne prétend pas détecter une erreur de sens.
 */
export function invariantTokens(text: string): string[] {
  const out: string[] = [];
  for (const p of [RE_EMAIL, RE_REF, RE_FILE, RE_HEX]) {
    for (const m of text.matchAll(p)) out.push(m[0]);
  }
  for (const m of text.matchAll(RE_NUMBER)) {
    const num = m[1]!;
    out.push(num);
    if (m[2]) out.push(`${num} ${m[2]}`);
  }
  return out;
}

function multiset(tokens: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const tok of tokens) counts.set(tok, (counts.get(tok) ?? 0) + 1);
  return counts;
}

const isNumeric = (tok: string) => /^[-+]?\d+(?:[.,]\d+)?$/.test(tok);

export type TranslationCheck = { ok: true } | { ok: false; reason: string };

/**
 * Contrôle strict par multiensembles : chaque jeton de la source doit se
 * retrouver AU MOINS autant de fois dans la traduction, et les nombres nus
 * doivent s'y retrouver EXACTEMENT autant de fois — ni ajoutés, ni supprimés,
 * ni dédoublonnés. Aucun `includes` : `5` ne peut plus être satisfait par `50`.
 */
export function checkTranslation(
  source: Segment[],
  translated: Record<string, string>,
): TranslationCheck {
  for (const s of source) {
    const value = translated[s.id];
    if (typeof value !== "string" || value.trim().length === 0)
      return { ok: false, reason: `SEGMENT_MISSING:${s.id}` };
    if (value.length > MAX_SEGMENT_CHARS) return { ok: false, reason: `SEGMENT_TOO_LARGE:${s.id}` };

    const src = invariantTokens(s.text);
    const dst = invariantTokens(value);
    if (src.length > MAX_TOKENS_PER_SEGMENT || dst.length > MAX_TOKENS_PER_SEGMENT)
      return { ok: false, reason: `TOKEN_BUDGET:${s.id}` };

    const a = multiset(src);
    const b = multiset(dst);
    for (const [tok, n] of a) {
      const m = b.get(tok) ?? 0;
      if (m < n) return { ok: false, reason: `TOKEN_LOST:${s.id}` };
      if (isNumeric(tok) && m !== n) return { ok: false, reason: `TOKEN_COUNT:${s.id}` };
    }
    for (const [tok, m] of b) {
      if (isNumeric(tok) && !a.has(tok) && m > 0) return { ok: false, reason: `TOKEN_ADDED:${s.id}` };
    }
  }
  const unknown = Object.keys(translated).filter((id) => !source.some((s) => s.id === id));
  if (unknown.length > 0) return { ok: false, reason: "SEGMENT_UNEXPECTED" };
  return { ok: true };
}

const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);

/** Sortie du fournisseur : structure imposée, ids uniques, taille bornée. */
export function parseProviderOutput(raw: unknown): Record<string, string> | null {
  if (!raw || typeof raw !== "object") return null;
  const segments = (raw as { segments?: unknown }).segments;
  if (!Array.isArray(segments)) return null;
  const out: Record<string, string> = Object.create(null) as Record<string, string>;
  let total = 0;
  for (const item of segments) {
    if (!item || typeof item !== "object") return null;
    const id = (item as { id?: unknown }).id;
    const en = (item as { en?: unknown }).en;
    if (typeof id !== "string" || typeof en !== "string") return null;
    if (id.length === 0 || id.length > 200 || FORBIDDEN_KEYS.has(id)) return null;
    if (Object.prototype.hasOwnProperty.call(out, id)) return null; // id dupliqué
    total += en.length;
    if (total > MAX_OUTPUT_CHARS) return null;
    out[id] = en;
  }
  return out;
}


const PHASE_EN: Record<string, string> = {
  exploration: "exploration",
  design: "design",
  prototype: "prototype",
  industrialisation: "industrialisation",
  unknown: "unknown",
};

const MOUNTING_EN: Record<string, string> = {
  pcb_smd: "PCB, surface mount",
  pcb_through_hole: "PCB, through hole",
  screw: "screwed",
  press_fit: "press-fit",
  other: "other",
  undecided: "not decided",
};

const WORKSHOP_SOURCE_EN: Record<string, string> = {
  none: "none",
  example: "example scene supplied by Standex",
  user_asset: "3D file supplied by the customer",
};

/** Coordonnées : valeurs conservées telles quelles, jamais arrondies. */
const pointEn = (p: Point | null): string => (p ? `(${p[0]}, ${p[1]}, ${p[2]}) mm` : "unknown");

/** Rapport anglais complet : étiquettes anglaises + segments traduits. */
export function englishReportBody(dto: ClientDossierDto, meta: { revision: number }): string {
  const req = (r: { label: string; value: string; unit: string | null; state: string }) =>
    `- ${r.label}: ${r.value || "unknown"}${r.unit ? " " + r.unit : ""} (${
      r.state === "confirmed" ? "confirmed" : r.state === "hypothesis" ? "assumption" : "unknown"
    })`;
  const volume =
    dto.business.annualVolume.kind === "known"
      ? `${dto.business.annualVolume.sensorsPerYear} sensors/year`
      : "unknown";
  const mounting =
    dto.mounting.kind === "press_fit"
      ? `press-fit, hole diameter ${dto.mounting.holeDiameterMm} mm`
      : dto.mounting.kind === "other"
        ? dto.mounting.description
        : (MOUNTING_EN[dto.mounting.kind] ?? dto.mounting.kind);
  const env = dto.envelope;
  const estimate = estimateCableLength(dto.cabling);
  const uncovered = uncoveredMotionStates(dto.cabling);

  const lines = [
    `# ${dto.title} — revision ${meta.revision}`,
    "",
    "_English version of the customer report. The customer original is kept unchanged._",
    "",
    "## Requirements",
    ...dto.requirements.map((r) => req(r) + (r.note ? `\n  Note: ${r.note}` : "")),
    "",
    "## Free constraints",
    dto.freeConstraints || "—",
    "",
    "## Open questions",
    ...(dto.openQuestions.length ? dto.openQuestions.map((q) => `- ${q}`) : ["—"]),
    "",
    "## Mechanical mounting",
    `- Mounting: ${mounting}`,
    `- Available envelope: ${env.lengthMm ?? "unknown"} × ${env.widthMm ?? "unknown"} × ${env.heightMm ?? "unknown"} mm`,
    "",
    "## Sensor selection and 3D layout",
    `- Followed range (not an orderable part number): ${dto.selectedSensorId ?? "none"}`,
    `- Sensor shown in the workshop: ${dto.workshopSensorId ?? "none"}`,
    `- Workshop sensor matches the followed range: ${dto.sensorSyncConfirmed ? "confirmed by the customer" : "not confirmed"}`,
    `- 3D layout provenance: ${WORKSHOP_SOURCE_EN[dto.workshopSource] ?? dto.workshopSource}`,
    `- 3D asset: ${dto.workshopAsset ? `${dto.workshopAsset.fileName} (${dto.workshopAsset.storage})` : "none"}`,
    `- Workshop configuration recorded: ${dto.workshop ? "yes" : "no"}`,
    "",
    "## Cabling",
    `- Required length: ${estimate.requiredMm === null ? "unknown (incomplete or invalid path)" : estimate.requiredMm.toFixed(1) + " mm"}`,
    `- Longest measured path: ${estimate.longestPathMm === null ? "unknown" : estimate.longestPathMm.toFixed(1) + " mm"}`,
    `- Sensor point: ${pointEn(dto.cabling.sensorEndpoint)} — connection point: ${pointEn(dto.cabling.connectionEndpoint)}`,
    `- Intermediate waypoints (${dto.cabling.waypoints.length}): ${
      dto.cabling.waypoints.length ? dto.cabling.waypoints.map(pointEn).join(" → ") : "none"
    }`,
    ...(dto.cabling.statePaths.length
      ? dto.cabling.statePaths.map(
          (p) =>
            `- Path "${p.label}" (state ${p.stateId}, ${p.points.length} points${
              p.pose ? `, pose "${p.pose.label}" at cycle ${p.pose.cycleT}` : ", pose unknown"
            }): ${p.points.map(pointEn).join(" → ")}`,
        )
      : ["- Recorded paths: none"]),
    `- Service reserve: ${dto.cabling.serviceReserveMm} mm — termination: ${dto.cabling.terminationMm} mm`,
    `- Supplier tolerance: ±${dto.cabling.toleranceMm} mm — housed surplus: ${dto.cabling.surplusHousingMm} mm`,
    `- Minimum bend radius: ${dto.cabling.minBendRadiusMm ?? "unknown"} mm`,
    `- Declared motion states: ${
      dto.cabling.declaredMotionStates.length
        ? dto.cabling.declaredMotionStates.map((s) => s.label).join(", ")
        : "none"
    }`,
    `- Motion states without a recorded path: ${uncovered.length ? uncovered.map((s) => s.label).join(", ") : "none"}`,
    `- Motion coverage confirmed: ${dto.cabling.motionCoverageConfirmed ? "yes" : "no"}`,
    `- Length choice: ${
      dto.cabling.lengthChoice === "standard_to_confirm"
        ? "catalogue length, to be confirmed"
        : dto.cabling.lengthChoice === "custom_to_confirm"
          ? "custom length, to be confirmed"
          : "not decided"
    }`,
    "- No length is approved here: Standex R&D checks it.",

    "",
    "## Termination",
    ...terminationEnglish(dto),
    "",
    "## Project context",
    `- Phase: ${PHASE_EN[dto.business.projectPhase] ?? dto.business.projectPhase}`,
    `- Annual volume: ${volume}`,
    `- Series start: ${dto.business.seriesStartDate ?? "unknown"}`,
    `- Samples needed by: ${dto.business.samplesNeededBy ?? "unknown"}`,
    `- Series duration: ${dto.business.seriesDurationYears ?? "unknown"} years`,
    `- Contact: ${dto.business.contactName ?? "unknown"} — ${dto.business.contactEmail ?? "unknown"}${
      dto.business.contactCompany ? ` — ${dto.business.contactCompany}` : ""
    }`,
    "",
    "## Attachments actually transferred",
    ...(dto.attachments.filter((a) => a.transferred).length
      ? dto.attachments
          .filter((a) => a.transferred)
          .map((a) => `- ${a.fileName} (SHA-256 ${a.sha256 ?? "unknown"})`)
      : ["—"]),
  ];
  return lines.join("\n");
}

function terminationEnglish(dto: ClientDossierDto): string[] {
  const t = dto.termination;
  if (t.kind === "bare_leads") return ["- Bare leads (default)"];
  if (t.kind === "free_reference") return [`- ${t.text} — to be checked by R&D`];
  const s = t.kind === "qualified_connector" ? t.combo.connector : t.spec;
  return [
    `- Manufacturer: ${s.manufacturer}`,
    `- Exact part number: ${s.mpn}`,
    `- Mating part: ${s.mating ?? "unknown"}`,
    `- Positions: ${s.positions ?? "unknown"}`,
    `- Pinout: ${s.pinout ?? "unknown"}`,
    `- Wire gauge: ${s.wireGauge ?? "unknown"}`,
    `- Conditions: ${s.conditions ?? "unknown"}`,
    t.kind === "qualified_connector"
      ? `- Qualified combination (${t.combo.source})`
      : "- Combination not qualified: to be checked by R&D.",
  ];
}

export interface TranslationProvider {
  /** Reçoit les segments, renvoie la sortie BRUTE du fournisseur (non validée). */
  translate(segments: Segment[]): Promise<unknown>;
  /** Identification de ce qui a produit le texte (modèle, version). */
  producer: string;
}

export type TranslationResult =
  | { ok: true; body: string; producer: string }
  | { ok: false; reason: string };

/** Chaîne complète : extraction → traduction → contrôle → rapport anglais. */
export async function translateDossier(
  dto: ClientDossierDto,
  meta: { revision: number },
  provider: TranslationProvider,
): Promise<TranslationResult> {
  const segments = collectSegments(dto);
  const total = segments.reduce((n, s) => n + s.text.length, 0);
  if (total > MAX_TOTAL_CHARS)
    return { ok: false, reason: "Dossier trop volumineux pour une traduction fiable." };
  if (segments.some((s) => s.text.length > MAX_SEGMENT_CHARS))
    return { ok: false, reason: "Un texte dépasse la taille maximale traduisible." };

  let raw: unknown;
  try {
    raw = await provider.translate(segments);
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "Traduction indisponible.",
    };
  }
  const parsed = parseProviderOutput(raw);
  if (!parsed) return { ok: false, reason: "Réponse de traduction invalide ou tronquée." };
  const check = checkTranslation(segments, parsed);
  if (!check.ok) return { ok: false, reason: check.reason };
  return {
    ok: true,
    body: englishReportBody(applySegments(dto, parsed), meta),
    producer: provider.producer,
  };
}
