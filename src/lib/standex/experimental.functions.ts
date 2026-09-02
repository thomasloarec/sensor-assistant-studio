// Mode assistant expérimental : appel Claude API depuis le serveur uniquement.
// Aucune clé côté navigateur, appel réservé à un testeur authentifié.

import { createServerFn } from "@tanstack/react-start";

import type { Json } from "./types";

export interface ExperimentalInput {
  accessToken: string;
  scenarioId: string;
  userPrompt: string;
  expectedOutputType: string;
  expectedGuardrails: string[];
  contractItems: string[];
  forbiddenItems: string[];
}

export interface ExperimentalPayload {
  customer_response: string;
  output_type: string;
  confidence: string;
  routing_reason: string;
  guardrails_triggered: string[];
  missing_questions: string[];
  be_dossier: Record<string, Json>;
}

export interface ExperimentalResult {
  ok: boolean;
  model: string;
  payload: ExperimentalPayload | null;
  rawText: string | null;
  error: string | null;
  usage: { input_tokens?: number; output_tokens?: number } | null;
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/** Schéma imposé à Claude via tool use forcé : la sortie est structurée, jamais du texte libre. */
const RESPONSE_TOOL = {
  name: "reponse_capteur",
  description:
    "Retourne la réponse prospect et la trace interne de l'assistant capteur Standex. Toujours utiliser cet outil.",
  input_schema: {
    type: "object",
    properties: {
      customer_response: { type: "string", description: "Texte français destiné au prospect." },
      output_type: {
        type: "string",
        enum: [
          "S1_STANDARD_SUGGESTION",
          "S1_WITH_GUARDRAIL",
          "S1_MAINTENANCE_REFERENCE",
          "S2_BE_DOSSIER",
          "S2_BE_DOSSIER_OR_WARNING",
          "S2_BE_DOSSIER_OR_S1_WITH_CAVEAT",
          "S3_MISSING_INFO",
        ],
      },
      confidence: { type: "string", enum: ["low", "medium", "high"] },
      routing_reason: { type: "string" },
      guardrails_triggered: { type: "array", items: { type: "string" } },
      missing_questions: { type: "array", items: { type: "string" } },
      be_dossier: {
        type: "object",
        properties: {
          application_summary: { type: "string" },
          electrical_points: { type: "array", items: { type: "string" } },
          mechanical_points: { type: "array", items: { type: "string" } },
          risk_points: { type: "array", items: { type: "string" } },
          next_questions: { type: "array", items: { type: "string" } },
        },
        required: [
          "application_summary",
          "electrical_points",
          "mechanical_points",
          "risk_points",
          "next_questions",
        ],
      },
    },
    required: [
      "customer_response",
      "output_type",
      "confidence",
      "routing_reason",
      "guardrails_triggered",
      "missing_questions",
      "be_dossier",
    ],
  },
} as const;

function normalize(obj: Record<string, unknown>): ExperimentalPayload | null {
  if (typeof obj["customer_response"] !== "string" || !obj["customer_response"].trim()) return null;
  return {
    customer_response: obj["customer_response"],
    output_type: typeof obj["output_type"] === "string" ? obj["output_type"] : "S3_MISSING_INFO",
    confidence: typeof obj["confidence"] === "string" ? obj["confidence"] : "unknown",
    routing_reason: typeof obj["routing_reason"] === "string" ? obj["routing_reason"] : "",
    guardrails_triggered: asStringArray(obj["guardrails_triggered"]),
    missing_questions: asStringArray(obj["missing_questions"]),
    be_dossier:
      obj["be_dossier"] && typeof obj["be_dossier"] === "object"
        ? (obj["be_dossier"] as Record<string, Json>)
        : {},
  };
}

/** Filet de sécurité : seulement si l'outil n'a pas été utilisé. */
function extractJson(text: string): ExperimentalPayload | null {
  const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const obj = JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
    if (typeof obj["customer_response"] !== "string") return null;
    return {
      customer_response: obj["customer_response"],
      output_type: typeof obj["output_type"] === "string" ? obj["output_type"] : "S3_MISSING_INFO",
      confidence: typeof obj["confidence"] === "string" ? obj["confidence"] : "unknown",
      routing_reason: typeof obj["routing_reason"] === "string" ? obj["routing_reason"] : "",
      guardrails_triggered: asStringArray(obj["guardrails_triggered"]),
      missing_questions: asStringArray(obj["missing_questions"]),
      be_dossier:
        obj["be_dossier"] && typeof obj["be_dossier"] === "object"
          ? (obj["be_dossier"] as Record<string, Json>)
          : {},
    };
  } catch {
    return null;
  }
}

export const generateExperimentalResponse = createServerFn({ method: "POST" })
  .inputValidator((input: ExperimentalInput) => input)
  .handler(async ({ data }): Promise<ExperimentalResult> => {
    const { requireTester, EXPERIMENTAL_SYSTEM_PROMPT } = await import("./experimental.server");
    await requireTester(data.accessToken);

    const apiKey = process.env["ANTHROPIC_API_KEY"];
    const model = process.env["ANTHROPIC_MODEL"] || "claude-sonnet-4-5";
    if (!apiKey) {
      return {
        ok: false,
        model,
        payload: null,
        rawText: null,
        error: "Clé Claude absente côté serveur (ANTHROPIC_API_KEY).",
        usage: null,
      };
    }

    const internalSignals = {
      scenario_reference_interne: data.scenarioId,
      sortie_attendue: data.expectedOutputType,
      garde_fous_attendus: data.expectedGuardrails,
      elements_de_contrat: data.contractItems,
      elements_interdits: data.forbiddenItems,
    };

    const userContent = [
      "Demande prospect (français) :",
      data.userPrompt,
      "",
      "Signaux internes (ne jamais recopier dans customer_response) :",
      JSON.stringify(internalSignals, null, 2),
    ].join("\n");

    let res: Response;
    try {
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: 1200,
          system: EXPERIMENTAL_SYSTEM_PROMPT,
          messages: [{ role: "user", content: userContent }],
          tools: [RESPONSE_TOOL],
          tool_choice: { type: "tool", name: RESPONSE_TOOL.name },
        }),
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("[experimental] Claude API injoignable", message);
      return {
        ok: false,
        model,
        payload: null,
        rawText: null,
        error: `Claude API injoignable : ${message}`,
        usage: null,
      };
    }

    const bodyText = await res.text();
    if (!res.ok) {
      console.error("[experimental] Claude API erreur", res.status, bodyText.slice(0, 500));
      return {
        ok: false,
        model,
        payload: null,
        rawText: null,
        error: `Claude API a répondu ${res.status}. ${bodyText.slice(0, 300)}`,
        usage: null,
      };
    }

    let text = "";
    let usage: ExperimentalResult["usage"] = null;
    let toolPayload: ExperimentalPayload | null = null;
    try {
      const body = JSON.parse(bodyText) as {
        content?: { type: string; text?: string; name?: string; input?: unknown }[];
        usage?: { input_tokens?: number; output_tokens?: number };
      };
      const blocks = body.content ?? [];
      text = blocks
        .filter((c) => c.type === "text" && typeof c.text === "string")
        .map((c) => c.text as string)
        .join("\n");
      const tool = blocks.find(
        (c) => c.type === "tool_use" && c.name === RESPONSE_TOOL.name && c.input,
      );
      if (tool) {
        toolPayload = normalize(tool.input as Record<string, unknown>);
        if (!text) text = JSON.stringify(tool.input, null, 2);
      }
      usage = body.usage ?? null;
    } catch {
      return {
        ok: false,
        model,
        payload: null,
        rawText: bodyText.slice(0, 2000),
        error: "Réponse Claude illisible (corps non JSON).",
        usage: null,
      };
    }

    const payload = toolPayload ?? extractJson(text);
    console.log("[experimental]", model, "tokens", JSON.stringify(usage));
    if (!payload) {
      return {
        ok: false,
        model,
        payload: null,
        rawText: text,
        error: "JSON Claude invalide : la baseline reste la référence.",
        usage,
      };
    }
    return { ok: true, model, payload, rawText: text, error: null, usage };
  });
