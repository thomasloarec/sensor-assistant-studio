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
  if (term.kind === "qualified_connector" || term.kind === "explicit_connector") {
    const spec = (d: ClientDossierDto) =>
      d.termination.kind === "qualified_connector"
        ? d.termination.combo.connector
        : d.termination.kind === "explicit_connector"
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

/** Jetons qui doivent survivre à la traduction : nombres, références, e-mails, fichiers. */
export function invariantTokens(text: string): string[] {
  const out: string[] = [];
  const patterns = [
    /[\w.+-]+@[\w-]+\.[\w.]+/g, // e-mails
    /\b[A-Z][A-Z0-9]*\d[A-Z0-9]*(?:-[A-Z0-9]+)*\b/g, // références type MK24-A-J
    /\b[\w-]+\.(?:glb|pdf|step|stp|iges|igs|docx|png|jpg|csv|json)\b/gi, // fichiers
    /\d+(?:[.,]\d+)?/g, // nombres
  ];
  for (const p of patterns) {
    for (const m of text.matchAll(p)) out.push(m[0]);
  }
  return out;
}

export type TranslationCheck = { ok: true } | { ok: false; reason: string };

/** Contrôle strict : rien de tronqué, rien d'inventé, aucun chiffre perdu. */
export function checkTranslation(source: Segment[], translated: Record<string, string>): TranslationCheck {
  for (const s of source) {
    const value = translated[s.id];
    if (typeof value !== "string" || value.trim().length === 0)
      return { ok: false, reason: `segment manquant ou vide : ${s.id}` };
    if (value.length > MAX_SEGMENT_CHARS)
      return { ok: false, reason: `segment hors limite : ${s.id}` };
    const missing = invariantTokens(s.text).filter((tok) => !value.includes(tok));
    if (missing.length > 0)
      return {
        ok: false,
        reason: `valeurs non préservées dans ${s.id} : ${missing.slice(0, 3).join(", ")}`,
      };
  }
  const unknown = Object.keys(translated).filter((id) => !source.some((s) => s.id === id));
  if (unknown.length > 0) return { ok: false, reason: `segments inattendus : ${unknown[0]}` };
  return { ok: true };
}

/** Sortie du fournisseur : structure imposée, validée avant tout usage. */
export function parseProviderOutput(raw: unknown): Record<string, string> | null {
  if (!raw || typeof raw !== "object") return null;
  const segments = (raw as { segments?: unknown }).segments;
  if (!Array.isArray(segments)) return null;
  const out: Record<string, string> = {};
  for (const item of segments) {
    if (!item || typeof item !== "object") return null;
    const id = (item as { id?: unknown }).id;
    const en = (item as { en?: unknown }).en;
    if (typeof id !== "string" || typeof en !== "string") return null;
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
    "## Cabling",
    `- Service reserve: ${dto.cabling.serviceReserveMm} mm — termination: ${dto.cabling.terminationMm} mm`,
    `- Supplier tolerance: ±${dto.cabling.toleranceMm} mm — housed surplus: ${dto.cabling.surplusHousingMm} mm`,
    `- Minimum bend radius: ${dto.cabling.minBendRadiusMm ?? "unknown"} mm`,
    `- Declared motion states: ${
      dto.cabling.declaredMotionStates.length
        ? dto.cabling.declaredMotionStates.map((s) => s.label).join(", ")
        : "none"
    }`,
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
