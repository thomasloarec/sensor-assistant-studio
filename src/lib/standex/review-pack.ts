// Pack de revue qualitative V0.7 : document Markdown relisible par Thomas,
// Claude et le BE. Lecture seule, aucune écriture Supabase.

import type { ScenarioEvaluation } from "./evaluate";
import type {
  SensorTestInternalTrace,
  SensorTestReview,
  SensorTestScenario,
  SensorTestSession,
} from "./types";

/** Scénarios inclus par défaut dans le pack de revue qualitative. */
export const REVIEW_PACK_SCENARIOS: readonly string[] = [
  "MVP-TS-001",
  "MVP-TS-002",
  "MVP-TS-003",
  "MVP-TS-004",
  "MVP-TS-005",
  "MVP-TS-006",
  "MVP-TS-007",
  "MVP-TS-008",
  "MVP-TS-011",
  "MVP-TS-015",
  "MVP-TS-021",
  "MVP-TS-022",
] as const;

export const REVIEW_PACK_LABELS: Record<string, string> = {
  "MVP-TS-001": "porte machine, montage encastré, entrée automate",
  "MVP-TS-002": "pompe / charge inductive",
  "MVP-TS-003": "230 VAC RMS",
  "MVP-TS-004": "MK06-66",
  "MVP-TS-005": "MK33-87 / MK23-87",
  "MVP-TS-006": "MK38 1A85C",
  "MVP-TS-007": "GP501 maintenance",
  "MVP-TS-008": "reed switch brut avec coupe des pattes",
  "MVP-TS-011": "information manquante niveau réservoir",
  "MVP-TS-015": "ferrite 280 °C",
  "MVP-TS-021": "contexte sécurité",
  "MVP-TS-022": "équivalence concurrente",
};

const CHECKLIST: readonly string[] = [
  "La réponse aide-t-elle vraiment le prospect ?",
  "Le ton est-il clair et professionnel ?",
  "La réponse évite-t-elle une conclusion décevante ?",
  "La validation Standex est-elle présente sans être bloquante ?",
  "Le libellé « responsable Standex reprend le sujet sous 2 jours ouvrés » est-il correct ?",
  "La ville où le prospect est basé est-elle demandée quand nécessaire ?",
  "Les garde-fous sont-ils pertinents, sans bruit excessif ?",
  "La trace interne aide-t-elle Thomas / Claude / BE à comprendre le routage ?",
];

export interface ReviewPackRow {
  code: string;
  missing?: boolean;
  priority?: string | null;
  scenario?: SensorTestScenario | undefined;
  evaluation?: ScenarioEvaluation | undefined;
  outputType?: string | undefined;
  guardrails?: string[] | undefined;
  customerText?: string | undefined;
  trace?: SensorTestInternalTrace | undefined;
  review?: SensorTestReview | undefined;
  session?: SensorTestSession | undefined;
  sessionId?: string | undefined;
}

export interface ReviewPackMeta {
  testedAt: string;
  tester: string;
  contractVersion: string;
  regressionScore: string;
}

const dash = (v: unknown) =>
  v === null || v === undefined || v === "" ? "—" : String(v);

function traceBlock(t: SensorTestInternalTrace | undefined): string[] {
  if (!t) return ["_Trace interne non disponible._"];
  return [
    "```yaml",
    `understood_application: ${dash(t.understood_application)}`,
    `confidence: ${dash(t.confidence)}`,
    `routing_reason: ${dash(t.routing_reason)}`,
    `guardrails_triggered: ${(t.guardrails_triggered ?? []).join(", ") || "—"}`,
    `missing_questions: ${(t.missing_questions ?? []).join(" | ") || "—"}`,
    `datasheet_values_used: ${JSON.stringify(t.datasheet_values_used ?? {})}`,
    "```",
  ];
}

function leadBlock(s: SensorTestSession | undefined, asked: boolean): string[] {
  const lines: string[] = [];
  if (s) {
    lines.push(
      `- Société : ${dash(s.prospect_company)}`,
      `- Contact : ${dash(s.prospect_name)} · ${dash(s.prospect_email)} · ${dash(s.prospect_phone)}`,
      `- Ville prospect : ${dash(s.prospect_city)}`,
      `- Ville Standex : ${dash(s.standex_city)}`,
      `- Bande volume : ${dash(s.volume_band)} · potentiel : ${dash(s.lead_potential)}`,
      `- Engagement de rappel : ${dash(s.callback_commitment)}`,
    );
  } else {
    lines.push("- Session lead non disponible.");
  }
  lines.push(`- Ville demandée dans la réponse : ${asked ? "oui" : "non"}`);
  return lines;
}

export function buildReviewPack(rows: ReviewPackRow[], meta: ReviewPackMeta): string {
  const out: string[] = [];
  out.push("# Pack de revue qualitative - Assistant capteur Standex");
  out.push("");
  out.push(`- Date : ${meta.testedAt}`);
  out.push(`- Compte testeur : ${meta.tester}`);
  out.push(`- Score régression : ${meta.regressionScore}`);
  out.push(`- Version contrat : ${meta.contractVersion}`);
  out.push(`- Nombre de scénarios inclus : ${rows.length}`);
  out.push("");
  out.push(
    "> Moteur déterministe V0.2, aucun modèle génératif branché. Objectif : décider si cette baseline peut servir de référence avant branchement du vrai assistant.",
  );

  rows.forEach((r) => {
    const e = r.evaluation;
    out.push("");
    out.push("---");
    out.push("");
    const label = REVIEW_PACK_LABELS[r.code];
    out.push(`## ${r.code}${label ? ` — ${label}` : ""}`);
    out.push("");
    out.push(`- Priorité : ${dash(r.priority)}`);
    out.push(`- Session Supabase : \`${dash(r.sessionId)}\``);

    if (r.missing || !r.scenario) {
      out.push("");
      out.push("_Scénario introuvable dans `sensor_test_scenarios` : rien à relire._");
      return;
    }

    out.push(`- Sortie attendue : \`${dash(e?.expectedOutput ?? r.scenario.expected_output_type)}\``);
    out.push(`- Sortie obtenue : \`${dash(r.outputType)}\``);
    out.push(`- Garde-fous attendus : ${(e?.expectedFlags ?? []).join(", ") || "—"}`);
    out.push(`- Garde-fous obtenus : ${(r.guardrails ?? []).join(", ") || "—"}`);
    out.push(`- Verdict régression : ${dash(e?.verdict)}`);

    out.push("");
    out.push("### Prompt prospect");
    out.push("");
    out.push(r.scenario.user_prompt_fr);

    out.push("");
    out.push("### Réponse client complète");
    out.push("");
    out.push(dash(r.customerText));

    out.push("");
    out.push("### Trace interne complète");
    out.push("");
    out.push(...traceBlock(r.trace));

    out.push("");
    out.push("### Données lead capturées ou demandées");
    out.push("");
    out.push(...leadBlock(r.session, e?.cityAsked ?? false));

    out.push("");
    out.push("### Revue initiale");
    out.push("");
    out.push(`- Relecteur : ${dash(r.review?.reviewer_role)}`);
    out.push(`- Verdict : ${dash(r.review?.verdict)}`);
    out.push(`- Notes : ${dash(r.review?.notes)}`);

    out.push("");
    out.push("### Checklist qualitative");
    out.push("");
    CHECKLIST.forEach((q) => out.push(`- [ ] ${q}`));
    out.push("- Commentaire relecteur :");
  });

  return out.join("\n");
}
