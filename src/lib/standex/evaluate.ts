// Évaluation d'une exécution de scénario contre le contrat V0.2.
// Aucun affichage brut du contrat : uniquement des verdicts et des motifs.

import type { ComposedResponse } from "./response-contract";
import { safeOutputType, splitList } from "./response-contract";
import type { SensorTestScenario } from "./types";

export interface ScenarioCheck {
  label: string;
  ok: boolean;
  detail?: string | undefined;
}

export interface ScenarioEvaluation {
  verdict: "OK" | "à corriger";
  checks: ScenarioCheck[];
  failures: string[];
  /** Détails structurés, pour la synthèse et l'export. */
  expectedOutput: string;
  outputOk: boolean;
  expectedFlags: string[];
  missingFlags: string[];
  missingMust: string[];
  presentForbidden: string[];
  cityAsked: boolean;
  twoBusinessDays: boolean;
  traceSufficient: boolean;
  suggestion: string | null;
}

function norm(v: string): string {
  return v
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Mots significatifs d'un item de contrat, pour une correspondance souple. */
function keywords(item: string): string[] {
  return norm(item)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 5)
    .slice(0, 4);
}

function matches(text: string, item: string): boolean {
  const kws = keywords(item);
  if (kws.length === 0) return text.includes(norm(item));
  const hits = kws.filter((k) => text.includes(k)).length;
  return hits / kws.length >= 0.5;
}

/**
 * Un élément interdit n'est considéré présent que si tous ses mots
 * significatifs apparaissent : évite les faux positifs sur un mot isolé.
 */
function matchesStrict(text: string, item: string): boolean {
  const kws = keywords(item);
  if (kws.length === 0) return text.includes(norm(item));
  return kws.every((k) => text.includes(k));
}

export function evaluateRun(
  scenario: SensorTestScenario,
  composed: ComposedResponse,
): ScenarioEvaluation {
  const text = norm(composed.customerText);
  // Certains éléments obligatoires du contrat sont tracés côté interne
  // (valeurs datasheet) plutôt que formulés tels quels au prospect.
  const traceText = norm(
    `${JSON.stringify(composed.datasheetValues)} ${composed.guardrails.join(" ")} ${composed.internalContractItems.join(" ")} ${composed.missingQuestions.join(" ")}`,
  );

  const mustText = `${text} ${traceText}`;
  const checks: ScenarioCheck[] = [];

  const expected = safeOutputType(scenario.expected_output_type);
  checks.push({
    label: "Sortie attendue",
    ok: composed.outputType === expected,
    detail: `${composed.outputType} vs ${expected}`,
  });

  const expectedFlags = scenario.trace_flags ?? [];
  const missingFlags = expectedFlags.filter((f) => !composed.guardrails.includes(f));
  checks.push({
    label: "Garde-fous attendus",
    ok: missingFlags.length === 0,
    detail: missingFlags.length ? `manquants : ${missingFlags.join(", ")}` : undefined,
  });

  const must = splitList(scenario.must_include);
  const missingMust = must.filter((m) => !matches(mustText, m));
  checks.push({
    label: "Éléments obligatoires",
    ok: missingMust.length === 0,
    detail: missingMust.length ? `absents : ${missingMust.join(" | ")}` : undefined,
  });

  const forbidden = splitList(scenario.must_not_include);
  const presentForbidden = forbidden.filter((f) => matchesStrict(text, f));
  checks.push({
    label: "Éléments interdits",
    ok: presentForbidden.length === 0,
    detail: presentForbidden.length ? `présents : ${presentForbidden.join(" | ")}` : undefined,
  });

  checks.push({
    label: "Ville demandée",
    ok: /\bville\b/.test(text),
  });
  checks.push({
    label: "Reprise sous 2 jours ouvrés",
    ok: /2 jours ouvres/.test(text),
  });
  checks.push({
    label: "Validation Standex",
    ok: composed.standexValidationRequired && /standex/.test(text),
  });
  checks.push({
    label: "Pas d'analyse BE présentée comme terminée",
    ok: !/(analyse|etude)[^.]{0,40}(terminee|finalisee|realisee|faite par le be)/.test(text),
  });
  // Les phrases de mise en garde ("je vous déconseille de couper…",
  // "il ne faut pas plier…") sont écartées : seul un conseil affirmatif
  // dangereux doit faire échouer le scénario.
  const warningMarkers =
    /(deconseill|ne (faut|pas|doit)|n'est pas recommand|eviter|evitez|jamais|risque|proscri|sauf si|plutot que de modifier|hors process|sans process)/;
  // La reformulation du besoin prospect ("ce que je comprends…") est une
  // citation, pas un conseil : elle est exclue de l'analyse.
  const advisoryText = text
    .split("\n")
    .filter((l) => !/ce que je comprends/.test(l))
    .join("\n")
    .split(/\n|(?<=[.;])\s+/)
    .filter((s) => !warningMarkers.test(s))
    .join(" ");
  const dangerousAdvice = /(couper|plier|limer|modifier)[^.]{0,60}pattes/.test(advisoryText);
  checks.push({
    label: "Pas de conseil dangereux (reed brut)",
    ok: !dangerousAdvice,
    detail: dangerousAdvice ? "phrase affirmative de coupe/pliage détectée" : undefined,
  });
  const traceSufficient =
    composed.guardrails.length > 0 ||
    composed.missingQuestions.length > 0 ||
    Object.keys(composed.datasheetValues).length > 0;
  checks.push({ label: "Trace interne séparée", ok: traceSufficient });

  const failures = checks
    .filter((c) => !c.ok)
    .map((c) => (c.detail ? `${c.label} (${c.detail})` : c.label));

  const suggestions: string[] = [];
  if (composed.outputType !== expected)
    suggestions.push(`aligner la sortie sur ${expected}`);
  if (missingFlags.length)
    suggestions.push(`déclencher les garde-fous ${missingFlags.join(", ")}`);
  if (missingMust.length)
    suggestions.push(
      `citer explicitement ${missingMust.join(" / ")} dans la réponse client ou la trace`,
    );
  if (presentForbidden.length)
    suggestions.push(`retirer toute formulation type ${presentForbidden.join(" / ")}`);
  if (!/\bville\b/.test(text)) suggestions.push("demander la ville du prospect");
  if (!/2 jours ouvres/.test(text))
    suggestions.push("annoncer la reprise Standex sous 2 jours ouvrés");
  if (!traceSufficient)
    suggestions.push("enrichir la trace interne (garde-fous, questions, valeurs datasheet)");

  return {
    verdict: failures.length ? "à corriger" : "OK",
    checks,
    failures,
    expectedOutput: expected,
    outputOk: composed.outputType === expected,
    expectedFlags,
    missingFlags,
    missingMust,
    presentForbidden,
    cityAsked: /\bville\b/.test(text),
    twoBusinessDays: /2 jours ouvres/.test(text),
    traceSufficient,
    suggestion: suggestions.length ? suggestions.join(" ; ") : null,
  };
}
