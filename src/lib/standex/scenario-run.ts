// Exécution d'un scénario de test : la réponse assistant suit le contrat de
// réponse V0.2 (règles de comportement), puis tout est persisté dans les tables
// V0.2 existantes. Aucune nouvelle table, aucune clé secrète.

import * as db from "./queries";
import { composeResponse, safeOutputType, splitList } from "./response-contract";
import type {
  SensorTestInternalTrace,
  SensorTestMessage,
  SensorTestOutput,
  SensorTestReview,
} from "./types";

export { safeOutputType, splitList };

export interface ScenarioRunResult {
  messages: SensorTestMessage[];
  output: SensorTestOutput;
  trace: SensorTestInternalTrace;
  review: SensorTestReview;
}

export async function runScenario(params: {
  sessionId: string;
  reviewerId: string;
  scenario: import("./types").SensorTestScenario;
  startTurnIndex: number;
  assistantText?: string;
}): Promise<ScenarioRunResult> {
  const { sessionId, reviewerId, scenario, startTurnIndex } = params;
  const composed = composeResponse(scenario);
  const assistantText = params.assistantText?.trim() || composed.customerText;

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
    output_type: composed.outputType,
    customer_summary: assistantText,
    standex_validation_required: composed.standexValidationRequired,
    distributor_path_allowed: composed.distributorPathAllowed,
    be_dossier: composed.beDossier as never,
  });

  const trace = await db.insertTrace({
    session_id: sessionId,
    output_id: output.id,
    understood_application: scenario.expected_behavior,
    guardrails_triggered: composed.guardrails,
    missing_questions: composed.missingQuestions,
    confidence: composed.confidence,
    routing_reason: composed.routingReason,
    product_candidates: [],
    datasheet_values_used: {},
  });

  const review = await db.insertReview({
    session_id: sessionId,
    reviewer_id: reviewerId,
    reviewer_role: "thomas",
    verdict: "not_reviewed",
    notes: `Exécution automatique du scénario ${scenario.scenario_id} (contrat V0.2).`,
  });

  return { messages: [prospectMsg, assistantMsg], output, trace, review };
}
