// Exécution d'un scénario de test : construit une réponse assistant déterministe
// à partir du contrat du scénario, puis persiste tout dans les tables V0.2 existantes.
// Aucune nouvelle table, aucune clé secrète.

import * as db from "./queries";
import {
  OUTPUT_TYPES,
  type Confidence,
  type OutputType,
  type SensorTestInternalTrace,
  type SensorTestMessage,
  type SensorTestOutput,
  type SensorTestReview,
  type SensorTestScenario,
} from "./types";

export function splitList(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(/[;\n|]|,(?![^()]*\))/g)
    .map((v) => v.trim())
    .filter(Boolean);
}

export function resolveOutputType(expected: string): OutputType {
  const first = expected
    .split(/[\s/|,]+/)
    .map((v) => v.trim().toUpperCase())
    .find((v) => (OUTPUT_TYPES as readonly string[]).includes(v));
  return (first as OutputType) ?? (expected.trim().toUpperCase() as OutputType) ??
    "S3_MISSING_INFO";
}

export function safeOutputType(expected: string): OutputType {
  const t = resolveOutputType(expected);
  return (OUTPUT_TYPES as readonly string[]).includes(t) ? t : "S3_MISSING_INFO";
}

function confidenceFor(type: OutputType): Confidence {
  if (type.startsWith("S1_")) return "medium";
  if (type.startsWith("S2_")) return "low";
  if (type === "S3_MISSING_INFO") return "low";
  return "unknown";
}

export function buildAssistantDraft(scenario: SensorTestScenario): string {
  const type = safeOutputType(scenario.expected_output_type);
  const must = splitList(scenario.must_include);
  const missing = splitList(scenario.must_not_include);
  const lines: string[] = [];

  lines.push(`[${type}] Réponse générée pour ${scenario.scenario_id} (${scenario.priority}).`);
  lines.push("");
  lines.push(scenario.expected_behavior);
  if (must.length) {
    lines.push("");
    lines.push("Points à couvrir :");
    must.forEach((m) => lines.push(`- ${m}`));
  }
  if (missing.length) {
    lines.push("");
    lines.push("À ne pas affirmer :");
    missing.forEach((m) => lines.push(`- ${m}`));
  }
  lines.push("");
  lines.push("Un responsable Standex reprend le sujet sous 2 jours ouvres.");
  return lines.join("\n");
}

export interface ScenarioRunResult {
  messages: SensorTestMessage[];
  output: SensorTestOutput;
  trace: SensorTestInternalTrace;
  review: SensorTestReview;
}

export async function runScenario(params: {
  sessionId: string;
  reviewerId: string;
  scenario: SensorTestScenario;
  startTurnIndex: number;
  assistantText?: string;
}): Promise<ScenarioRunResult> {
  const { sessionId, reviewerId, scenario, startTurnIndex } = params;
  const outputType = safeOutputType(scenario.expected_output_type);
  const assistantText = params.assistantText?.trim() || buildAssistantDraft(scenario);

  const prospectMsg = await db.insertMessage({
    session_id: sessionId,
    role: "prospect",
    content: scenario.user_prompt_fr,
    turn_index: startTurnIndex,
  });

  const assistantMsg = await db.insertMessage({
    session_id: sessionId,
    role: "assistant",
    content: assistantText,
    turn_index: startTurnIndex + 1,
  });

  const output = await db.insertOutput({
    session_id: sessionId,
    output_type: outputType,
    customer_summary: assistantText,
    standex_validation_required: true,
    distributor_path_allowed: false,
    be_dossier: outputType.startsWith("S2_")
      ? {
          scenario_id: scenario.scenario_id,
          demande: scenario.user_prompt_fr,
          attendu: scenario.expected_behavior,
        }
      : {},
  });

  const trace = await db.insertTrace({
    session_id: sessionId,
    output_id: output.id,
    understood_application: scenario.expected_behavior,
    guardrails_triggered: scenario.trace_flags ?? [],
    missing_questions: outputType === "S3_MISSING_INFO" ? splitList(scenario.must_include) : [],
    confidence: confidenceFor(outputType),
    routing_reason: `Scénario ${scenario.scenario_id} · attendu ${scenario.expected_output_type}`,
    product_candidates: [],
    datasheet_values_used: {},
  });

  const review = await db.insertReview({
    session_id: sessionId,
    reviewer_id: reviewerId,
    reviewer_role: "thomas",
    verdict: "not_reviewed",
    notes: `Exécution automatique du scénario ${scenario.scenario_id}.`,
  });

  return { messages: [prospectMsg, assistantMsg], output, trace, review };
}
