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
  (dto.cabling.statePaths ?? []).forEach((_, i) => {
    list.push(
      {
        id: `path.${i}.label`,
        get: (d) => d.cabling.statePaths[i]?.label,
        set: (d, v) => {
          const p = d.cabling.statePaths[i];
          if (p) p.label = v;
        },
      },
      {
        id: `path.${i}.pose`,
        get: (d) => d.cabling.statePaths[i]?.pose?.label,
        set: (d, v) => {
          const p = d.cabling.statePaths[i];
          if (p?.pose) p.pose.label = v;
        },
      },
    );
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
    // `mating` est une référence fabricant exacte : elle n'est PAS traduite.
    list.push(
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
      {
        id: "termination.wireGauge",
        get: (d) => spec(d)?.wireGauge ?? "",
        set: (d, v) => {
          const s = spec(d);
          if (s) s.wireGauge = v;
        },
      },
      {
        id: "termination.cable",
        get: (d) => spec(d)?.cable ?? "",
        set: (d, v) => {
          const s = spec(d);
          if (s) s.cable = v;
        },
      },
      {
        id: "termination.note",
        get: (d) => spec(d)?.note ?? "",
        set: (d, v) => {
          const s = spec(d);
          if (s) s.note = v;
        },
      },
      {
        id: "termination.wireRangeHint",
        get: (d) => spec(d)?.wireRangeHint ?? "",
        set: (d, v) => {
          const s = spec(d);
          if (s) s.wireRangeHint = v;
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
/**
 * Nombre SIGNÉ, suivi le cas échéant de son unité, avec OU SANS espace :
 * `0.35A`, `0,35 A` et `300mm` sont tous reconnus. Le nombre ne peut pas être
 * tronqué (`5` ≠ `50`), mais une virgule ou un point de ponctuation qui suit
 * ne le fait pas disparaître.
 */
const RE_NUMBER = new RegExp(
  String.raw`(?<![\w.,])([-+]?\d+(?:[.,]\d+)?)(?!\d)[  ]?(` + UNIT_ALT + String.raw`)?(?![\w])`,
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

export type TranslationCheck = { ok: true } | { ok: false; reason: string };

/**
 * Contrôle strict par multiensembles : chaque jeton invariant de la source doit
 * se retrouver EXACTEMENT autant de fois dans la traduction — ni perdu, ni
 * ajouté, ni dupliqué, ni dédoublonné. Aucun `includes` : `5` ne peut plus être
 * satisfait par `50`, ni `0.35 A` par `0.35 mA`.
 * Ce contrôle est LEXICAL : il ne prétend pas juger le sens de la phrase.
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

    // Égalité EXACTE des multiensembles : un nombre, une référence, un e-mail
    // ou un nom de fichier ne peut être ni perdu, ni ajouté, ni dupliqué.
    const a = multiset(src);
    const b = multiset(dst);
    for (const [tok, n] of a) {
      const m = b.get(tok) ?? 0;
      if (m < n) return { ok: false, reason: `TOKEN_LOST:${s.id}` };
      if (m !== n) return { ok: false, reason: `TOKEN_COUNT:${s.id}` };
    }
    for (const [tok, m] of b) {
      if (!a.has(tok) && m > 0) return { ok: false, reason: `TOKEN_ADDED:${s.id}` };
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
    ...workshopEnglish(dto),
    ...mountingEnglish(dto),
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

const MOTION_EN: Record<string, string> = {
  approach: "head-on approach",
  slide: "lateral slide",
  pivot: "pivot",
};
const MAGNETIZATION_EN: Record<string, string> = {
  axial: "axial",
  diametral: "diametral",
  thickness: "through thickness",
};
const CONTACT_EN: Record<string, string> = {
  open: "open",
  closed: "closed",
  unknown: "unknown",
};
const vecEn = (v: readonly number[] | null | undefined): string =>
  v ? `(${v[0]}, ${v[1]}, ${v[2]})` : "unknown";

/**
 * Paramètres RÉELLEMENT enregistrés du montage 3D, en anglais.
 * Rien n'est inventé : sans configuration, la section le dit et s'arrête.
 * Ce montage est un modèle PÉDAGOGIQUE, pas une validation physique.
 */
function workshopEnglish(dto: ClientDossierDto): string[] {
  const w = dto.workshop;
  if (!w) return ["- Recorded 3D parameters: none"];
  const lines = [
    "- Recorded 3D parameters (educational model, not a physical validation):",
    `  - Sensor in the layout: ${w.sensorId} — mode: ${w.mode === "reference" ? "reference" : "education"}`,
    `  - Sensitivity: ${w.sensitivity} — activation geometry: ${w.geometry}`,
    `  - Movement: ${MOTION_EN[w.motion] ?? w.motion} — travel: ${w.travel} mm — span: ${w.span}°`,
    `  - Movement start: ${w.start} mm — end: ${w.end} mm — offset: ${w.offset} mm`,
    `  - Demonstration reach: ${w.demoReach} mm — lateral shift: ${w.lateralShift} mm`,
    `  - Sensor angle: ${w.sensorAngle}° — mounting angle: ${w.mountAngle}° — mounting X/Z: ${w.mountX} mm / ${w.mountZ} mm`,
    `  - Magnet: ${w.magnetModel} — angle: ${w.magnetAngle}° — tilt: ${w.magnetTilt}°`,
    `  - Magnetization: ${MAGNETIZATION_EN[w.magnetization] ?? w.magnetization} — polarity: ${w.polarity > 0 ? "N towards the sensor" : "S towards the sensor"}`,
    `  - Ferromagnetic environment: ${w.ferromagnetic ? "yes" : "no"} — temperature: ${w.temperature === "ambient" ? "ambient" : "other"}`,
    `  - Initial contact state: ${CONTACT_EN[w.initialContact] ?? w.initialContact}`,
    `  - Target detection window: ${w.targetStart}% to ${w.targetEnd}% of the cycle`,
  ];
  const m = w.machine;
  if (m) {
    lines.push(
      `  - Machine assembly: ${m.fileName} (asset ${m.assetKey}, scale ${m.unitScale})`,
      `  - Moving node: ${m.movingNode} — motion: ${m.motion === "rotation" ? "rotation" : "translation"}`,
      `  - Sensor position/rotation: ${vecEn(m.sensorPosition)} / ${vecEn(m.sensorRotation)} — mounted on the ${m.sensorMount === "moving" ? "moving part" : "fixed part"}`,
      `  - Magnet position/rotation: ${vecEn(m.magnetPosition)} / ${vecEn(m.magnetRotation)} — mounted on the ${m.magnetMount === "moving" ? "moving part" : "fixed part"}`,
      `  - Travel vector: ${vecEn(m.travel)} — pivot: ${vecEn(m.pivot)} — rotation axis: ${m.rotationAxis} — opening angle: ${m.openingAngle}°`,
      `  - Available space: ${vecEn(m.space)}`,
    );
  } else {
    lines.push("  - Machine assembly: none recorded");
  }
  return lines;
}

/** Codes de limite du montage guidé, rendus en anglais pour la revue R&D.
 * Aucun code brut ne sort dans le rapport client. */
const MOUNTING_REASON_EN: Record<string, string> = {
  NO_PROFILE: "no published reference profile for this sensor/magnet pair",
  SOURCE_NOT_QUALIFIED: "the available source is not a qualified Standex reference",
  CLASS_NOT_PUBLISHED: "this sensitivity class is not published for this pair",
  CUSTOM_MODEL_NOT_CHARACTERISED: "the imported assembly is not characterised (no datum, no measured pose)",
  FERROUS_DECLARED: "ferromagnetic material declared nearby",
  TEMPERATURE_NOT_AMBIENT: "operating temperature is not ambient",
  EDUCATION_MODE: "educational mode: distances are illustrative, not published values",
  MOTION_NOT_ON_APPROACH_AXIS: "movement is not along the published approach axis",
  MAGNETIZATION_NOT_TEMPLATE: "magnetisation differs from the published arrangement",
  POLARITY_NOT_TEMPLATE: "polarity differs from the published arrangement",
  SENSOR_ANGLE_OFF_TEMPLATE: "sensor angle differs from the published arrangement",
  ORIENTATION_OFF_TEMPLATE: "magnet orientation differs from the published arrangement",
  LATERAL_OFFSET: "lateral offset is outside the published arrangement",
  COLLISION_OR_CONTACT: "part of the travel is outside the published arrangement (contact or interference)",
};
const MOUNTING_VERDICT_EN: Record<string, string> = {
  expected: "detection expected in the reference model",
  not_expected: "detection NOT expected in the reference model",
  undetermined: "undetermined: outside the published reference model",
};
const MOUNTING_COVERAGE_EN: Record<string, string> = {
  covered: "the whole travel is covered by the published reference model",
  partial: "only part of the travel is covered",
  none: "no part of the travel is covered",
};

function mountingEnglish(dto: ClientDossierDto): string[] {
  const m = dto.guidedMounting;
  const c = m?.computed;
  if (!m || !c) return ["- Guided mounting study: none recorded"];
  const lines = [
    "- Guided mounting study (model result, never a physical validation):",
    `  - Result: ${MOUNTING_VERDICT_EN[c.verdict] ?? c.verdict}`,
    `  - Coverage: ${MOUNTING_COVERAGE_EN[c.coverage] ?? c.coverage}`,
    `  - Statement given to the customer: ${c.mainMessage}`,
    `  - Reference profile: ${m.profileId ?? "none"} — source: ${m.profileSource ?? "none"}`,
  ];
  if (m.need)
    lines.push(
      `  - Requested detection window: ${m.need.startPercent}% to ${m.need.endPercent}% of the cycle`,
    );
  if (m.cable)
    lines.push(
      `  - Recorded cable route: ${m.cable.points.length} points — required length: ${m.cable.lengthMm === null ? "unknown" : `${m.cable.lengthMm} mm`}`,
    );
  for (const r of c.reasons) lines.push(`  - Limit: ${MOUNTING_REASON_EN[r] ?? r}`);
  return lines;
}

function terminationEnglish(dto: ClientDossierDto): string[] {
  const t = dto.termination;
  if (t.kind === "bare_leads") return ["- Bare leads (default)"];
  if (t.kind === "free_reference") return [`- ${t.text} — to be checked by R&D`];
  const s = t.kind === "qualified_connector" ? t.combo.connector : t.spec;
  const GENDER_EN: Record<string, string> = {
    male: "male",
    female: "female",
    unknown: "unknown",
  };
  const lines = [
    `- Manufacturer: ${s.manufacturer}`,
    `- Exact part number: ${s.mpn}`,
    `- Mating part (exact reference, not translated): ${s.mating ?? "unknown"}`,
    `- Gender: ${GENDER_EN[s.gender] ?? s.gender}`,
    `- Positions: ${s.positions ?? "unknown"}`,
    `- Pitch: ${s.pitchMm === undefined ? "unknown" : `${s.pitchMm} mm`}`,
    `- Contact part number: ${s.contactMpn ?? "unknown"}`,
    `- Pinout: ${s.pinout ?? "unknown"}`,
    `- Wire gauge: ${s.wireGauge ?? "unknown"}`,
    `- Wire range: ${s.wireRangeHint ?? "unknown"}`,
    `- Cable: ${s.cable ?? "unknown"}`,
    `- Conditions: ${s.conditions ?? "unknown"}`,
    `- Note: ${s.note ?? "—"}`,
    `- Availability: ${s.availability ?? "unknown"}`,
    `- Documentary source: ${s.sourceUrl ?? "unknown"}${
      s.sourcePages?.length ? ` (pages ${s.sourcePages.join(", ")})` : ""
    }${s.sourceCheckedAt ? ` — checked on ${s.sourceCheckedAt}` : ""}`,
  ];
  if (t.kind === "qualified_connector") {
    lines.push(
      `- Qualified combination: ${t.combo.id}`,
      `- Sensor part number of the combination: ${t.combo.sensorMpn}`,
      `- Combination source: ${t.combo.source}`,
    );
  } else {
    lines.push("- Combination not qualified: to be checked by R&D.");
  }
  return lines;
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
