// Dossier d'application canonique V0.9 (24 champs).
// Lecture seule : dérivé des tables existantes (sessions, messages, outputs,
// traces, reviews). Aucune nouvelle table, aucun modèle génératif.
// V0.9 : extraction sémantique depuis le prompt prospect, filtrage des
// métadonnées de test (tags de scoring en anglais, libellés de régression).

import type {
  SensorTestInternalTrace,
  SensorTestMessage,
  SensorTestOutput,
  SensorTestReview,
  SensorTestSession,
} from "./types";

export type DossierSection =
  | "commercial"
  | "application"
  | "mechanical"
  | "electrical"
  | "performance";

export const SECTION_LABELS: Record<DossierSection, string> = {
  commercial: "Commercial",
  application: "Application",
  mechanical: "Mécanique / Intégration",
  electrical: "Électrique",
  performance: "Performance",
};

export type Importance = "critique" | "utile" | "optionnelle";
export type FieldSource = "prospect" | "trace interne" | "sortie assistant" | "revue";

export interface DossierFieldDef {
  id: string;
  section: DossierSection;
  labelFr: string;
  importance: Importance;
  /** Question conseillée côté testeur si le champ manque. */
  question: string;
}

/** Les 24 champs canoniques de ASSISTANT_CAPTEUR_APPLICATION_DOSSIER_FIELDS_V0.1.csv. */
export const DOSSIER_FIELDS: readonly DossierFieldDef[] = [
  { id: "contact_name", section: "commercial", labelFr: "Nom du contact", importance: "optionnelle", question: "Quel est le nom du contact chez vous ?" },
  { id: "company", section: "commercial", labelFr: "Entreprise", importance: "optionnelle", question: "Quelle est votre entreprise ?" },
  { id: "email", section: "commercial", labelFr: "E-mail", importance: "optionnelle", question: "À quelle adresse e-mail pouvons-nous vous envoyer le suivi ?" },
  { id: "phone", section: "commercial", labelFr: "Téléphone", importance: "optionnelle", question: "Quel numéro pouvons-nous utiliser pour le rappel ?" },
  { id: "city_based", section: "commercial", labelFr: "Ville où la personne est basée", importance: "critique", question: "Dans quelle ville êtes-vous basé ?" },
  { id: "country", section: "commercial", labelFr: "Pays", importance: "optionnelle", question: "Dans quel pays est situé le site concerné ?" },
  { id: "project_type", section: "commercial", labelFr: "Type de besoin", importance: "utile", question: "S'agit-il d'une nouvelle conception, d'une maintenance, d'un remplacement ou d'une équivalence ?" },
  { id: "annual_volume", section: "commercial", labelFr: "Volume annuel estimé", importance: "optionnelle", question: "Quel volume annuel estimez-vous ?" },
  { id: "timing", section: "commercial", labelFr: "Horizon projet", importance: "optionnelle", question: "Quel est votre horizon projet (prototype, série) ?" },
  { id: "application_context", section: "application", labelFr: "Contexte d'application", importance: "critique", question: "Pouvez-vous décrire la machine ou le process concerné ?" },
  { id: "detection_goal", section: "application", labelFr: "Ce qu'il faut détecter", importance: "critique", question: "Que faut-il détecter exactement (objet, état, mouvement) ?" },
  { id: "safety_criticality", section: "application", labelFr: "Criticité / sécurité", importance: "utile", question: "Cette fonction a-t-elle un rôle de sécurité ou une conséquence critique ?" },
  { id: "current_solution_or_reference", section: "application", labelFr: "Solution ou référence actuelle", importance: "utile", question: "Quelle solution ou référence utilisez-vous aujourd'hui ?" },
  { id: "competitor_reference_or_datasheet", section: "application", labelFr: "Référence concurrente ou datasheet", importance: "utile", question: "Pouvez-vous transmettre la datasheet de la référence concurrente ?" },
  { id: "mounting_type", section: "mechanical", labelFr: "Type de montage", importance: "critique", question: "Le capteur doit-il être vissé, encastré, cylindrique ou monté sur circuit imprimé ?" },
  { id: "available_space_constraints", section: "mechanical", labelFr: "Encombrement disponible", importance: "utile", question: "De quel encombrement disposez-vous à l'emplacement du capteur ?" },
  { id: "sensor_form_factor", section: "mechanical", labelFr: "Format capteur souhaité", importance: "utile", question: "Quel format de capteur visez-vous (cylindrique, bride, CMS, surmoulé, câble) ?" },
  { id: "magnet_context", section: "mechanical", labelFr: "Aimant et orientation", importance: "utile", question: "Quel aimant est prévu et selon quelle orientation par rapport au capteur ?" },
  { id: "target_distance_and_tolerance", section: "mechanical", labelFr: "Distance cible et tolérance", importance: "utile", question: "Quelle distance capteur-aimant visez-vous, et avec quelle tolérance ?" },
  { id: "environment_ip_temp", section: "mechanical", labelFr: "Environnement, IP, température", importance: "utile", question: "Quel est l'environnement (température, humidité, poussière, IP) ?" },
  { id: "electrical_role", section: "electrical", labelFr: "Rôle électrique du capteur", importance: "critique", question: "Le capteur envoie-t-il une information à une carte/automate, ou commute-t-il une charge ?" },
  { id: "voltage_current_power", section: "electrical", labelFr: "Tension, courant, puissance", importance: "critique", question: "Quelles sont les valeurs de tension, de courant et de puissance réellement commutées ?" },
  { id: "load_type_inrush", section: "electrical", labelFr: "Type de charge et appel", importance: "utile", question: "Quel type de charge est commuté, et connaissez-vous le courant d'appel ?" },
  { id: "precision_repeatability_lifetime", section: "performance", labelFr: "Précision, répétabilité, durée de vie", importance: "utile", question: "Y a-t-il une exigence de précision, de répétabilité ou de durée de vie ?" },
] as const;

export interface DossierFieldValue extends DossierFieldDef {
  value: string | null;
  source: FieldSource | null;
}

export interface ApplicationDossier {
  sessionId: string;
  createdAt: string;
  outputType: string | null;
  /** Confiance sur la proposition produit (issue de la trace interne). */
  productConfidence: string | null;
  /** Confiance sur la décision de routage. */
  routingConfidence: string | null;
  callback: string | null;
  routing: string | null;
  summary: string | null;
  guardrails: string[];
  remainingQuestions: string[];
  fields: DossierFieldValue[];
  missingCritical: DossierFieldValue[];
  suggestedQuestions: string[];
  reviewNotes: string[];
}

/** Fragments techniques / de scoring à ne jamais afficher comme contenu prospect. */
const METADATA_PATTERNS: RegExp[] = [
  /\bMVP-TS-\d+/i,
  /\br[ée]gression\b/i,
  /\bsc[ée]nario\b/i,
  /intermediary interface/i,
  /inductive load/i,
  /standex follow-?up/i,
  /high potential/i,
  /contact capture/i,
  /business day/i,
  /^explain\b/i,
  /^give\b/i,
  /^do not\b/i,
  /follow-?up/i,
  /guardrail/i,
  /datasheet values/i,
  /valeurs datasheet/i,
];

/** Un texte majoritairement anglais est une métadonnée de test, pas du contenu prospect. */
const ENGLISH_WORDS =
  /\b(the|and|with|should|must|switch(?:ing)?|load|current|voltage|carry|not|use|used|recommended|direct|drive|customer|answer|response|reference|missing|potential|volume|city)\b/gi;

function isMetadata(v: string): boolean {
  if (METADATA_PATTERNS.some((re) => re.test(v))) return true;
  const words = v.split(/\s+/).filter(Boolean).length;
  const en = (v.match(ENGLISH_WORDS) ?? []).length;
  return words >= 2 && en / words >= 0.34;
}

const clean = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (t.length === 0 || t.toLowerCase() === "unknown") return null;
  if (isMetadata(t)) return null;
  return t;
};

function pick(
  candidates: Array<[string | null, FieldSource]>,
): { value: string | null; source: FieldSource | null } {
  for (const [value, source] of candidates) {
    const c = clean(value);
    if (c) return { value: c, source };
  }
  return { value: null, source: null };
}

const cap = (s: string) => (s.length ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function extractApplicationContext(text: string): string | null {
  if (!text.trim()) return null;
  const purpose = text.match(/pour\s+(?:une?|la|le|l')\s*([^.,;!?]{3,70})/i);
  if (purpose?.[1]) return purpose[1].trim().toLowerCase();
  const first = text.split(/[.\n!?]/)[0]?.trim() ?? "";
  if (!first) return null;
  const stripped = first
    .replace(/^(je\s+(?:veux|voudrais|cherche à|souhaite)|nous\s+(?:voulons|souhaitons|cherchons|aurons|avons))\s+/i, "")
    .trim();
  return (stripped || first).toLowerCase().slice(0, 180);
}

function extractDetectionGoal(text: string): string | null {
  const m =
    text.match(/d[ée]tection\s+(?:de\s+la|de\s+l'|du|des|de|d')\s*([^.,;!?]{2,50})/i) ??
    text.match(/d[ée]tecter\s+(?:la|le|les|l'|un|une)?\s*([^.,;!?]{2,50})/i);
  const obj = m?.[1]?.trim().toLowerCase();
  if (!obj) return null;
  return `détecter l'ouverture, la fermeture ou la position : ${obj}`;
}

function extractVolume(text: string): string | null {
  const m = text.match(
    /(\d[\d\s\u202f.,]{2,})\s*(?:pi[èe]ces?|pcs|unit[ée]s?)\s*(?:\/|par\s+)an/i,
  );
  const n = m?.[1]?.trim().replace(/[.,]$/, "");
  return n ? `${n} pièces/an` : null;
}

const LOAD_WORDS: Array<[RegExp, string]> = [
  [/pompe/i, "pompe"],
  [/moteur/i, "moteur"],
  [/[ée]lectrovanne|solenoide|sol[ée]no[iï]de/i, "électrovanne"],
  [/relais|bobine/i, "relais / bobine"],
  [/inductif|inductive/i, "charge inductive"],
];

export function buildApplicationDossier(input: {
  session: SensorTestSession;
  messages: SensorTestMessage[];
  output: SensorTestOutput | null;
  trace: SensorTestInternalTrace | null;
  reviews: SensorTestReview[];
}): ApplicationDossier {
  const { session, messages, output, trace, reviews } = input;
  const prospectText = messages
    .filter((m) => m.role === "prospect")
    .map((m) => m.content)
    .join("\n");
  const lower = prospectText.toLowerCase();
  const has = (...needles: string[]) => needles.some((n) => lower.includes(n));
  const when = (cond: boolean, label: string | null): string | null => (cond ? label : null);

  const loadHit = LOAD_WORDS.find(([re]) => re.test(prospectText));
  const inductive = Boolean(loadHit);
  const directSwitching =
    /command\w*\s+directement|commut\w*\s+directement|directement\s+(?:une|un|la|le)\s+(?:pompe|moteur|charge|[ée]lectrovanne)/i.test(
      prospectText,
    );
  const electricalMentioned =
    directSwitching || inductive || /\d+\s*(?:v|vdc|vac|a\b|ma\b|w\b)/i.test(prospectText);

  const volume = extractVolume(prospectText);
  const appContext = extractApplicationContext(prospectText);
  const detection = extractDetectionGoal(prospectText);

  const electricalValues = [trace?.voltage_value, trace?.current_value, trace?.power_value]
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter((v) => v.length > 0 && /\d/.test(v) && v.toLowerCase() !== "unknown");
  const vcp = electricalValues.length ? electricalValues.join(" / ") : null;

  const projectType =
    when(has("maintenance", "remplac", "panne", "en panne"), "maintenance / remplacement") ??
    when(has("équivalen", "equivalen", "concurrent", "cross"), "équivalence / cross-reference") ??
    when(has("nouveau", "nouvelle", "conception", "prototype"), "nouvelle conception") ??
    when(Boolean(volume), "nouveau design probable, à confirmer");

  const company = clean(session.prospect_company);

  const raw: Record<string, { value: string | null; source: FieldSource | null }> = {
    contact_name: pick([[session.prospect_name, "prospect"]]),
    company: pick([[company, "prospect"]]),
    email: pick([[session.prospect_email, "prospect"]]),
    phone: pick([[session.prospect_phone, "prospect"]]),
    city_based: pick([[session.prospect_city, "prospect"]]),
    country: pick([[when(has("france", "français"), "France"), "prospect"]]),
    project_type: pick([[projectType, "prospect"]]),
    annual_volume: pick([[volume, "prospect"]]),
    timing: pick([
      [when(has("prototype", "urgent", "série", "serie"), "horizon projet évoqué dans la demande"), "prospect"],
    ]),
    application_context: pick([[appContext, "prospect"]]),
    detection_goal: pick([[detection, "prospect"]]),
    safety_criticality: pick([
      [when(has("sécurit", "securit", "safety"), "contexte sécurité évoqué par le prospect"), "prospect"],
    ]),
    current_solution_or_reference: pick([
      [
        prospectText.match(/\b(?:MK|GP|KSK|OKI|MS|HE)[- ]?\w{2,10}\b/i)?.[0] ?? null,
        "prospect",
      ],
    ]),
    competitor_reference_or_datasheet: pick([
      [
        when(
          has("concurrent", "équivalen", "equivalen", "cross"),
          "référence concurrente évoquée, datasheet à obtenir",
        ),
        "prospect",
      ],
    ]),
    mounting_type: pick([
      [
        when(
          has("encastr", "vissé", "visse", "bride", "cms", "circuit imprimé", "surmoul", "cylindr"),
          prospectText.match(/(encastr\w+|viss\w+|bride|CMS|circuit imprimé|surmoul\w+|cylindr\w+)/i)?.[0] ?? null,
        ),
        "prospect",
      ],
      [clean(trace?.mounting_geometry), "trace interne"],
    ]),
    available_space_constraints: pick([
      [prospectText.match(/\d+([.,]\d+)?\s?mm\b[^.,;]{0,30}/i)?.[0]?.trim() ?? null, "prospect"],
    ]),
    sensor_form_factor: pick([
      [
        when(
          has("cylindr", "bride", "cms", "surmoul", "câble", "cable"),
          prospectText.match(/(cylindr\w+|bride|CMS|surmoul\w+|c[âa]ble)/i)?.[0] ?? null,
        ),
        "prospect",
      ],
    ]),
    magnet_context: pick([
      [when(has("aimant", "magnet"), "aimant évoqué dans la demande, orientation à préciser"), "prospect"],
    ]),
    target_distance_and_tolerance: pick([
      [prospectText.match(/(?:distance|entrefer|gap)[^.,;]{0,40}/i)?.[0]?.trim() ?? null, "prospect"],
    ]),
    environment_ip_temp: pick([
      [
        prospectText.match(/(-?\d+\s?°?\s?c\b|IP\s?\d{2}|humidit\w+|poussi\w+)/i)?.[0]?.trim() ?? null,
        "prospect",
      ],
    ]),
    electrical_role: pick([
      [
        directSwitching
          ? "commutation directe souhaitée par le prospect"
          : when(
              has("automate", "carte", "api", "entrée", "entree"),
              "information envoyée à une carte / un automate",
            ),
        "prospect",
      ],
    ]),
    voltage_current_power: pick([
      [prospectText.match(/\d+([.,]\d+)?\s?(?:V(?:DC|AC)?|A|mA|W)\b/i)?.[0] ?? null, "prospect"],
      [vcp, "trace interne"],
    ]),
    load_type_inrush: pick([
      [
        loadHit ? `${loadHit[1]} / charge inductive — courant d'appel à valider` : null,
        "prospect",
      ],
    ]),
    precision_repeatability_lifetime: pick([
      [
        when(
          has("précis", "precis", "répétab", "repetab", "cycles", "durée de vie"),
          "exigence de performance évoquée par le prospect",
        ),
        "prospect",
      ],
    ]),
  };

  const fields: DossierFieldValue[] = DOSSIER_FIELDS.map((def) => ({
    ...def,
    value: raw[def.id]?.value ?? null,
    source: raw[def.id]?.value ? (raw[def.id]?.source ?? null) : null,
  }));

  const byId = new Map(fields.map((f) => [f.id, f]));
  const missing = fields.filter((f) => !f.value);
  const order: Importance[] = ["critique", "utile", "optionnelle"];
  const missingCritical = [...missing].sort(
    (a, b) => order.indexOf(a.importance) - order.indexOf(b.importance),
  );

  // --- Questions restantes : toujours des questions en français ---
  const questions: string[] = [];
  const pushMissing = (id: string, override?: string) => {
    const f = byId.get(id);
    if (f && !f.value) questions.push(override ?? f.question);
  };

  if (electricalMentioned) {
    pushMissing(
      "voltage_current_power",
      loadHit
        ? `Quelle tension et quel courant nominal ${loadHit[1] === "pompe" ? "la pompe utilise-t-elle" : "la charge utilise-t-elle"} ?`
        : undefined,
    );
    if (inductive) {
      questions.push(
        "Le reed switch doit-il commander directement la charge, ou peut-il piloter une interface intermédiaire ?",
      );
    } else {
      pushMissing("electrical_role");
    }
    pushMissing("city_based");
    pushMissing("mounting_type");
    pushMissing("detection_goal");
  } else {
    pushMissing("city_based");
    pushMissing("mounting_type");
    pushMissing("electrical_role");
    pushMissing("detection_goal");
    pushMissing("voltage_current_power");
  }
  for (const f of missingCritical) pushMissing(f.id);

  const suggestedQuestions = questions
    .filter((q, i, arr) => q.trim().endsWith("?") && arr.indexOf(q) === i)
    .slice(0, 3);

  // --- Routage et confiance ---
  const s2 = (output?.output_type ?? "").startsWith("S2");
  const routingParts: string[] = [];
  if (s2 || inductive) routingParts.push("validation Standex requise");
  if (inductive)
    routingParts.push("interface intermédiaire recommandée entre le reed switch et la charge");
  if (session.lead_potential === "high" || volume)
    routingParts.push("potentiel projet élevé, reprise Standex prioritaire");
  if (routingParts.length === 0) routingParts.push("reprise par un responsable Standex");
  const routing = cap(routingParts.join(" ; "));

  const productConfidence = trace?.confidence ?? null;
  const routingConfidence = routingParts.length > 1 || s2 || inductive || volume ? "high" : "medium";

  // --- Synthèse en français naturel ---
  const summaryParts: string[] = [];
  if (appContext) summaryParts.push(`Le besoin porte sur : ${appContext}.`);
  if (volume) summaryParts.push(`Le volume annoncé est de ${volume}.`);
  if (inductive)
    summaryParts.push(
      `Comme ${loadHit?.[1] === "pompe" ? "une pompe" : "cette charge"} est une charge inductive, le dossier doit passer en validation Standex et l'orientation conseillée est d'utiliser une interface intermédiaire entre le reed switch et la charge.`,
    );
  if (volume || session.lead_potential === "high")
    summaryParts.push(
      "Le potentiel projet est élevé ; Standex doit reprendre le sujet pour cadrer le montage, l'aimant, l'interface électrique et la référence adaptée.",
    );
  if (summaryParts.length === 0) summaryParts.push("Besoin à préciser avec le prospect.");

  return {
    sessionId: session.id,
    createdAt: session.created_at,
    outputType: output?.output_type ?? null,
    productConfidence,
    routingConfidence,
    callback: output?.callback_text ?? session.callback_commitment ?? null,
    routing,
    summary: summaryParts.join(" "),
    guardrails: trace?.guardrails_triggered ?? [],
    remainingQuestions: suggestedQuestions,
    fields,
    missingCritical,
    suggestedQuestions,
    reviewNotes: reviews
      .map((r) => `${r.reviewer_role} / ${r.verdict}${r.notes ? ` — ${r.notes}` : ""}`)
      .filter((n) => !isMetadata(n.replace(/^[a-z_]+ \/ [a-z_]+/, ""))),
  };
}

export function buildDossierMarkdown(
  d: ApplicationDossier,
  meta: { tester: string; scenarioCode?: string | null },
): string {
  const L: string[] = [];
  L.push("# Dossier d'application - Assistant capteur Standex", "");
  L.push(`- Session : ${d.sessionId}${meta.scenarioCode ? ` (${meta.scenarioCode})` : ""}`);
  L.push(`- Date : ${new Date(d.createdAt).toISOString()}`);
  L.push(`- Compte testeur : ${meta.tester}`);
  L.push(`- Sortie : ${d.outputType ?? "—"}`);
  L.push(`- Confiance de proposition produit : ${d.productConfidence ?? "—"}`);
  L.push(`- Confiance routage : ${d.routingConfidence ?? "—"}`);
  L.push(`- Reprise Standex : ${d.callback ?? "—"}`);
  L.push("");
  L.push("## Synthese application", "");
  L.push(d.summary ?? "_manquant_");
  L.push("");

  for (const section of Object.keys(SECTION_LABELS) as DossierSection[]) {
    L.push(`## ${SECTION_LABELS[section]}`, "");
    L.push("| Champ | Valeur | Source | Importance |");
    L.push("| --- | --- | --- | --- |");
    for (const f of d.fields.filter((x) => x.section === section)) {
      L.push(
        `| ${f.labelFr} | ${f.value ?? "_manquant_"} | ${f.source ?? "—"} | ${f.importance} |`,
      );
    }
    L.push("");
  }

  L.push("## Garde-fous declenches (trace technique)", "");
  L.push(d.guardrails.length ? d.guardrails.map((g) => `- ${g}`).join("\n") : "- aucun");
  L.push("");
  L.push("## Questions restantes", "");
  L.push(
    d.suggestedQuestions.length
      ? d.suggestedQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")
      : "- aucune",
  );
  L.push("");
  L.push("## Recommandation de routage", "");
  L.push(`- Routage : ${d.routing ?? "—"}`);
  L.push(`- Sortie : ${d.outputType ?? "—"}`);
  L.push(`- Confiance routage : ${d.routingConfidence ?? "—"}`);
  L.push(`- Champs critiques manquants : ${d.missingCritical.filter((f) => f.importance === "critique").length}`);
  L.push("");
  L.push("## Notes de revue", "");
  L.push(d.reviewNotes.length ? d.reviewNotes.map((n) => `- ${n}`).join("\n") : "- aucune revue");
  L.push("");
  return L.join("\n");
}
