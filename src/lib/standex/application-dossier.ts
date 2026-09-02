// Dossier d'application canonique V0.8 (24 champs).
// Lecture seule : dérivé des tables existantes (sessions, messages, outputs,
// traces, reviews). Aucune nouvelle table, aucun modèle génératif.

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
  { id: "mounting_type", section: "mechanical", labelFr: "Type de montage", importance: "critique", question: "Quel type de montage est prévu (encastré, vissé, CMS, bride) ?" },
  { id: "available_space_constraints", section: "mechanical", labelFr: "Encombrement disponible", importance: "utile", question: "De quel encombrement disposez-vous à l'emplacement du capteur ?" },
  { id: "sensor_form_factor", section: "mechanical", labelFr: "Format capteur souhaité", importance: "utile", question: "Quel format de capteur visez-vous (cylindrique, bride, CMS, surmoulé, câble) ?" },
  { id: "magnet_context", section: "mechanical", labelFr: "Aimant et orientation", importance: "utile", question: "Quel aimant est prévu et selon quelle orientation par rapport au capteur ?" },
  { id: "target_distance_and_tolerance", section: "mechanical", labelFr: "Distance cible et tolérance", importance: "utile", question: "Quelle distance capteur-aimant visez-vous, et avec quelle tolérance ?" },
  { id: "environment_ip_temp", section: "mechanical", labelFr: "Environnement, IP, température", importance: "utile", question: "Quel est l'environnement (température, humidité, poussière, IP) ?" },
  { id: "electrical_role", section: "electrical", labelFr: "Rôle électrique du capteur", importance: "critique", question: "Le capteur doit-il seulement informer une carte/automate, ou commuter directement une charge ?" },
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
  confidence: string | null;
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

const clean = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 && t !== "unknown" ? t : null;
};

const jsonText = (v: unknown): string => {
  try {
    return typeof v === "string" ? v : JSON.stringify(v ?? "");
  } catch {
    return "";
  }
};

function pick(
  candidates: Array<[string | null, FieldSource]>,
): { value: string | null; source: FieldSource | null } {
  for (const [value, source] of candidates) {
    if (clean(value)) return { value: clean(value), source };
  }
  return { value: null, source: null };
}

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
  const fromProspect = (cond: boolean, label: string): string | null => (cond ? label : null);

  const traceElectrical = clean(trace?.electrical_load);
  const vcp = [clean(trace?.voltage_value), clean(trace?.current_value), clean(trace?.power_value)]
    .filter(Boolean)
    .join(" / ");
  const datasheet = trace ? jsonText(trace.datasheet_values_used) : "";

  const projectType = fromProspect(
    has("maintenance", "remplac", "panne", "en panne"),
    "maintenance / remplacement",
  ) ??
    fromProspect(has("équivalen", "equivalen", "concurrent", "cross"), "équivalence / cross-reference") ??
    fromProspect(has("nouveau", "nouvelle", "conception", "projet", "prototype"), "nouvelle conception");

  const raw: Record<string, { value: string | null; source: FieldSource | null }> = {
    contact_name: pick([[session.prospect_name, "prospect"]]),
    company: pick([[session.prospect_company, "prospect"]]),
    email: pick([[session.prospect_email, "prospect"]]),
    phone: pick([[session.prospect_phone, "prospect"]]),
    city_based: pick([
      [session.prospect_city, "prospect"],
      [session.standex_city, "prospect"],
    ]),
    country: pick([[fromProspect(has("france", "french"), "France"), "prospect"]]),
    project_type: pick([[projectType, "prospect"]]),
    annual_volume: pick([
      [clean(trace?.volume_signal), "trace interne"],
      [session.volume_band, "prospect"],
    ]),
    timing: pick([
      [fromProspect(has("prototype", "urgent", "mois", "semaine"), "indication d'horizon dans la demande"), "prospect"],
    ]),
    application_context: pick([
      [clean(trace?.understood_application), "trace interne"],
      [prospectText.slice(0, 200) || null, "prospect"],
    ]),
    detection_goal: pick([[clean(trace?.detection_target), "trace interne"]]),
    safety_criticality: pick([
      [
        (trace?.guardrails_triggered ?? []).some((g) => g.includes("safety"))
          ? "contexte sécurité signalé"
          : fromProspect(has("sécurit", "securit", "safety"), "contexte sécurité évoqué"),
        trace ? "trace interne" : "prospect",
      ],
    ]),
    current_solution_or_reference: pick([
      [clean(output?.suggested_reference), "sortie assistant"],
      [fromProspect(has("gp501", "actuel", "existant"), "référence existante mentionnée"), "prospect"],
    ]),
    competitor_reference_or_datasheet: pick([
      [
        has("concurrent", "équivalen", "equivalen")
          ? "référence concurrente évoquée, datasheet à obtenir"
          : null,
        "prospect",
      ],
      [datasheet && datasheet !== "{}" ? "valeurs datasheet Standex utilisées" : null, "trace interne"],
    ]),
    mounting_type: pick([[clean(trace?.mounting_geometry), "trace interne"]]),
    available_space_constraints: pick([
      [fromProspect(has("mm", "encombrement", "diamètre", "diametre"), "contrainte dimensionnelle évoquée"), "prospect"],
    ]),
    sensor_form_factor: pick([[clean(output?.suggested_product_family), "sortie assistant"]]),
    magnet_context: pick([
      [fromProspect(has("aimant", "magnet"), "aimant évoqué dans la demande"), "prospect"],
    ]),
    target_distance_and_tolerance: pick([
      [
        (trace?.guardrails_triggered ?? []).includes("distance_claim_guardrail")
          ? "distance à valider (garde-fou distance actif)"
          : null,
        "trace interne",
      ],
    ]),
    environment_ip_temp: pick([
      [fromProspect(has("°c", " degc", "ip6", "humid", "poussi", "température", "temperature"), "contrainte environnement évoquée"), "prospect"],
    ]),
    electrical_role: pick([[traceElectrical, "trace interne"]]),
    voltage_current_power: pick([[vcp || null, "trace interne"]]),
    load_type_inrush: pick([
      [
        traceElectrical && /induct|pompe|moteur|relais|bobine/i.test(traceElectrical)
          ? `${traceElectrical} — appel de courant à confirmer`
          : null,
        "trace interne",
      ],
      [fromProspect(has("pompe", "moteur", "inductif", "bobine", "relais"), "charge inductive évoquée"), "prospect"],
    ]),
    precision_repeatability_lifetime: pick([
      [fromProspect(has("précis", "precis", "répétab", "repetab", "cycles", "durée de vie"), "exigence de performance évoquée"), "prospect"],
    ]),
  };

  const fields: DossierFieldValue[] = DOSSIER_FIELDS.map((def) => ({
    ...def,
    value: raw[def.id]?.value ?? null,
    source: raw[def.id]?.value ? (raw[def.id]?.source ?? null) : null,
  }));

  const missing = fields.filter((f) => !f.value);
  const order: Importance[] = ["critique", "utile", "optionnelle"];
  const missingCritical = [...missing].sort(
    (a, b) => order.indexOf(a.importance) - order.indexOf(b.importance),
  );

  const traceQuestions = (trace?.missing_questions ?? []).filter(Boolean);
  const suggestedQuestions = [
    ...traceQuestions,
    ...missingCritical.filter((f) => f.importance === "critique").map((f) => f.question),
    ...missingCritical.filter((f) => f.importance === "utile").map((f) => f.question),
  ]
    .filter((q, i, arr) => arr.indexOf(q) === i)
    .slice(0, 3);

  return {
    sessionId: session.id,
    createdAt: session.created_at,
    outputType: output?.output_type ?? null,
    confidence: trace?.confidence ?? null,
    callback: output?.callback_text ?? session.callback_commitment ?? null,
    routing: clean(trace?.routing_reason),
    summary: output?.customer_summary ?? null,
    guardrails: trace?.guardrails_triggered ?? [],
    remainingQuestions: traceQuestions,
    fields,
    missingCritical,
    suggestedQuestions,
    reviewNotes: reviews.map((r) => `${r.reviewer_role} / ${r.verdict}${r.notes ? ` — ${r.notes}` : ""}`),
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
  L.push(`- Niveau de confiance : ${d.confidence ?? "—"}`);
  L.push(`- Reprise Standex : ${d.callback ?? "—"}`);
  L.push("");
  L.push("## Synthese application", "");
  L.push(d.summary ?? "_Aucune sortie client enregistrée._");
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

  L.push("## Garde-fous declenches", "");
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
  L.push(`- Champs critiques manquants : ${d.missingCritical.filter((f) => f.importance === "critique").length}`);
  L.push("");
  L.push("## Notes de revue", "");
  L.push(d.reviewNotes.length ? d.reviewNotes.map((n) => `- ${n}`).join("\n") : "- aucune revue");
  L.push("");
  return L.join("\n");
}
