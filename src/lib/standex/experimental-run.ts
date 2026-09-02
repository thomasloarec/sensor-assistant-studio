// Orchestration du mode assistant expérimental côté banc :
// appel serveur Claude, contrôles anti-fuite, persistance V0.3.

import * as db from "./queries";
import {
  generateExperimentalResponse,
  type ExperimentalPayload,
} from "./experimental.functions";
import { detectLeaks, safeOutputType, splitList } from "./response-contract";
import { requireSupabase } from "./supabase";
import type { SensorTestScenario } from "./types";

export interface ExperimentalRun {
  scenarioId: string;
  model: string;
  ok: boolean;
  error: string | null;
  payload: ExperimentalPayload | null;
  leaks: string[];
  violations: string[];
  outputId: string | null;
  schemaWarning: string | null;
  /** Fragment brut renvoyé par Claude, utile seulement en cas d'échec. */
  rawText: string | null;
  usage: { input_tokens?: number; output_tokens?: number } | null;
}

/** Contrôles post-génération obligatoires (au-delà de detectLeaks). */
export function checkExperimentalText(text: string, scenario: SensorTestScenario): string[] {
  const t = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const out: string[] = [];
  if (/(analyse|etude)[^.]{0,40}(terminee|finalisee|realisee|est faite)/.test(t))
    out.push("promesse d'analyse BE terminée");
  const safety = /securite|safety|porte machine/.test(
    `${scenario.user_prompt_fr} ${(scenario.trace_flags ?? []).join(" ")}`.toLowerCase(),
  );
  if (safety && /(certifi|conforme)/.test(t) && !/validation standex|standex (doit|valide)/.test(t))
    out.push("référence présentée comme certifiée sans validation Standex");
  if (
    /(couper|plier|limer)[^.]{0,60}(pattes|leads)/.test(t) &&
    !/(deconseill|ne (faut|doit)|sans process|process valide|eviter)/.test(t)
  )
    out.push("conseil de coupe/pliage d'un reed brut sans avertissement");
  if (!/2 jours ouvres/.test(t)) out.push("reprise sous 2 jours ouvrés absente");
  if (!/standex/.test(t)) out.push("validation Standex absente");
  return out;
}

async function insertModeAware<T>(
  insert: (extra: Record<string, unknown>) => Promise<T>,
): Promise<{ row: T; warning: string | null }> {
  try {
    return { row: await insert({ generation_mode: "experimental" }), warning: null };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (!/generation_mode/.test(message)) throw e;
    return {
      row: await insert({}),
      warning:
        "Colonne generation_mode absente : appliquer supabase/schema/migration_v0.3.sql pour distinguer baseline et expérimental.",
    };
  }
}

export async function runExperimental(params: {
  sessionId: string;
  scenario: SensorTestScenario;
  baselineOutputId?: string | null;
}): Promise<ExperimentalRun> {
  const { sessionId, scenario } = params;
  const sb = requireSupabase();
  const { data: sessionData } = await sb.auth.getSession();
  const accessToken = sessionData.session?.access_token ?? "";

  const result = await generateExperimentalResponse({
    data: {
      accessToken,
      scenarioId: scenario.scenario_id,
      userPrompt: scenario.user_prompt_fr,
      expectedOutputType: scenario.expected_output_type,
      expectedGuardrails: scenario.trace_flags ?? [],
      contractItems: splitList(scenario.must_include),
      forbiddenItems: splitList(scenario.must_not_include),
    },
  });

  if (!result.ok || !result.payload) {
    return {
      scenarioId: scenario.scenario_id,
      model: result.model,
      ok: false,
      error: result.error ?? "Génération expérimentale indisponible.",
      payload: null,
      leaks: [],
      violations: [],
      outputId: null,
      schemaWarning: null,
      rawText: result.rawText,
      usage: result.usage,
    };
  }

  const payload = result.payload;
  const leaks = detectLeaks(payload.customer_response);
  const violations = checkExperimentalText(payload.customer_response, scenario);

  const { row: output, warning } = await insertModeAware((extra) =>
    db.insertOutput({
      session_id: sessionId,
      output_type: safeOutputType(payload.output_type),
      customer_summary: payload.customer_response,
      standex_validation_required: true,
      be_dossier: payload.be_dossier as never,
      ...extra,
    } as never),
  );

  const { warning: traceWarning } = await insertModeAware((extra) =>
    db.insertTrace({
      session_id: sessionId,
      output_id: output.id,
      understood_application: payload.routing_reason,
      guardrails_triggered: payload.guardrails_triggered,
      missing_questions: payload.missing_questions,
      confidence: (["low", "medium", "high"].includes(payload.confidence)
        ? payload.confidence
        : "unknown") as never,
      routing_reason: `Claude ${result.model} · ${payload.routing_reason}`,
      product_candidates: [],
      datasheet_values_used: {
        generation_mode: "experimental",
        model: result.model,
        leaks,
        violations,
        usage: result.usage,
      } as never,
      ...extra,
    } as never),
  );

  return {
    scenarioId: scenario.scenario_id,
    model: result.model,
    ok: leaks.length === 0 && violations.length === 0,
    error: null,
    payload,
    leaks,
    violations,
    outputId: output.id,
    schemaWarning: warning ?? traceWarning,
    rawText: null,
    usage: result.usage,
  };
}

/** Verdict humain de comparaison, persisté dans sensor_test_reviews. */
export async function saveComparisonVerdict(params: {
  sessionId: string;
  reviewerId: string;
  preferredMode: "baseline" | "experimental" | "neither";
  comparedOutputId: string | null;
  notes: string;
}): Promise<void> {
  const base = {
    session_id: params.sessionId,
    reviewer_id: params.reviewerId,
    reviewer_role: "thomas" as const,
    verdict: "not_reviewed" as const,
    notes: `[comparaison ${params.preferredMode}] ${params.notes}`.trim(),
  };
  try {
    await db.insertReview({
      ...base,
      preferred_mode: params.preferredMode,
      compared_output_id: params.comparedOutputId,
    } as never);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (!/preferred_mode|compared_output_id/.test(message)) throw e;
    await db.insertReview(base);
  }
}

/** Pack de comparaison baseline / expérimental, en Markdown. */
export function buildComparisonPack(
  rows: {
    scenarioId: string;
    prompt: string;
    baselineText: string;
    run: ExperimentalRun;
    sessionId: string;
  }[],
  meta: { tester: string; date: string },
): string {
  const lines: string[] = [
    `# Pack de comparaison baseline / expérimental`,
    ``,
    `- Date : ${meta.date}`,
    `- Testeur : ${meta.tester}`,
    `- Scénarios : ${rows.length}`,
    `- Modèle : ${rows[0]?.run.model ?? "—"}`,
    ``,
    `| Scénario | Sortie Claude | Fuite | Garde-fous | Questions | Écarts |`,
    `| --- | --- | --- | --- | --- | --- |`,
  ];
  for (const r of rows) {
    lines.push(
      `| ${r.scenarioId} | ${r.run.payload?.output_type ?? "erreur"} | ${
        r.run.leaks.length ? "oui" : "non"
      } | ${(r.run.payload?.guardrails_triggered ?? []).join(", ") || "—"} | ${
        (r.run.payload?.missing_questions ?? []).length
      } | ${[...r.run.leaks, ...r.run.violations].join(" ; ") || "—"} |`,
    );
  }
  for (const r of rows) {
    lines.push(
      ``,
      `## ${r.scenarioId}`,
      ``,
      `- session_id : \`${r.sessionId}\``,
      `- verdict humain : _à renseigner_`,
      ``,
      `### Prompt prospect`,
      ``,
      r.prompt,
      ``,
      `### Sortie baseline`,
      ``,
      r.baselineText || "_indisponible_",
      ``,
      `### Sortie Claude`,
      ``,
      r.run.payload?.customer_response ?? `_erreur : ${r.run.error ?? "inconnue"}_`,
      ``,
      `### Contrôles`,
      ``,
      `- fuite texte : ${r.run.leaks.length ? `oui (${r.run.leaks.join(" | ")})` : "non"}`,
      `- garde-fous : ${(r.run.payload?.guardrails_triggered ?? []).join(", ") || "—"}`,
      `- questions manquantes : ${
        (r.run.payload?.missing_questions ?? []).join(" | ") || "—"
      }`,
      `- écarts : ${r.run.violations.join(" ; ") || "—"}`,
    );
  }
  return lines.join("\n");
}
