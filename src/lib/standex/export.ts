// Export de la synthèse de régression (CSV / Markdown). Lecture seule :
// aucune écriture Supabase, aucune donnée sensible.

import type { ScenarioEvaluation } from "./evaluate";

export interface ExportRow {
  code: string;
  priority?: string | null;
  missing?: boolean;
  outputType?: string | undefined;
  guardrails?: string[] | undefined;
  evaluation?: ScenarioEvaluation | undefined;
  sessionId?: string | undefined;
}

export interface ExportMeta {
  testedAt: string;
  tester: string;
  supabaseUrl: string;
}

const yn = (v: boolean | undefined) => (v === undefined ? "—" : v ? "oui" : "non");

const HEADERS = [
  "scenario_id",
  "priorite",
  "sortie_attendue",
  "sortie_obtenue",
  "gardefous_attendus",
  "gardefous_obtenus",
  "elements_obligatoires_presents",
  "elements_interdits_absents",
  "ville_demandee",
  "deux_jours_ouvres",
  "verdict",
  "ecarts",
  "suggestion",
  "session_id",
];

function cells(r: ExportRow): string[] {
  const e = r.evaluation;
  return [
    r.code,
    r.priority ?? "—",
    e?.expectedOutput ?? "—",
    r.missing ? "scénario absent" : (r.outputType ?? "—"),
    e?.expectedFlags.join(" ") || "—",
    r.guardrails?.join(" ") || "—",
    e ? yn(e.missingMust.length === 0) : "—",
    e ? yn(e.presentForbidden.length === 0) : "—",
    e ? yn(e.cityAsked) : "—",
    e ? yn(e.twoBusinessDays) : "—",
    r.missing ? "absent" : (e?.verdict ?? "—"),
    e?.failures.join(" ; ") || "—",
    e?.suggestion ?? "—",
    r.sessionId ?? "—",
  ];
}

export function buildCsv(rows: ExportRow[], meta: ExportMeta): string {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = [
    [`# date_test=${meta.testedAt}`, `compte=${meta.tester}`, `projet=${meta.supabaseUrl}`].join(
      ",",
    ),
    HEADERS.join(","),
    ...rows.map((r) => cells(r).map(esc).join(",")),
  ];
  return lines.join("\n");
}

export function buildMarkdown(rows: ExportRow[], meta: ExportMeta): string {
  const ok = rows.filter((r) => r.evaluation?.verdict === "OK").length;
  const out: string[] = [];
  out.push(`# Régression banc de test capteur — ${rows.length} scénarios`);
  out.push("");
  out.push(`- Date du test : ${meta.testedAt}`);
  out.push(`- Compte testeur : ${meta.tester}`);
  out.push(`- Projet Supabase : ${meta.supabaseUrl}`);
  out.push(`- Score global : **${ok}/${rows.length} OK**`);
  out.push("");
  out.push(`| ${HEADERS.join(" | ")} |`);
  out.push(`| ${HEADERS.map(() => "---").join(" | ")} |`);
  rows.forEach((r) => out.push(`| ${cells(r).join(" | ")} |`));

  const ko = rows.filter((r) => r.missing || (r.evaluation && r.evaluation.verdict !== "OK"));
  out.push("");
  out.push("## Écarts");
  if (ko.length === 0) {
    out.push("Aucun écart.");
  } else {
    ko.forEach((r) => {
      const e = r.evaluation;
      out.push("");
      out.push(`### ${r.code}`);
      if (r.missing) {
        out.push("- Scénario introuvable dans `sensor_test_scenarios`.");
        return;
      }
      out.push(`- Éléments obligatoires absents : ${e?.missingMust.join(" | ") || "—"}`);
      out.push(`- Éléments interdits présents : ${e?.presentForbidden.join(" | ") || "—"}`);
      out.push(`- Garde-fous manquants : ${e?.missingFlags.join(", ") || "—"}`);
      out.push(
        `- Sortie : ${e?.outputOk ? "conforme" : `incorrecte (${r.outputType} vs ${e?.expectedOutput})`}`,
      );
      out.push(`- Trace interne : ${e?.traceSufficient ? "suffisante" : "insuffisante"}`);
      out.push(`- Suggestion : ${e?.suggestion ?? "—"}`);
      out.push(`- Session Supabase : ${r.sessionId ?? "—"}`);
    });
  }
  return out.join("\n");
}

export function downloadText(filename: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
