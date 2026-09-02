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
    `${JSON.stringify(composed.datasheetValues)} ${composed.guardrails.join(" ")} ${composed.missingQuestions.join(" ")}`,
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
  checks.push({
    label: "Pas de conseil dangereux (reed brut)",
    // Les phrases de mise en garde ("il ne faut pas couper…") sont écartées :
    // seul un conseil affirmatif dangereux doit faire échouer le scénario.
    ok: !/(couper|plier|limer)[^.]{0,60}pattes/.test(
      text
        .split(/(?<=[.;])\s+/)
        .filter((s) => !/ne (faut|pas|doit)/.test(s))
        .join(" "),
    ),
  });
  checks.push({
    label: "Trace interne séparée",
    ok: composed.guardrails.length > 0 || composed.missingQuestions.length > 0,
  });

  const failures = checks
    .filter((c) => !c.ok)
    .map((c) => (c.detail ? `${c.label} (${c.detail})` : c.label));

  return { verdict: failures.length ? "à corriger" : "OK", checks, failures };
}
