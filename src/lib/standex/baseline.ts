// Gel de la baseline déterministe V1.0.
// Aucune écriture Supabase, aucun appel externe, aucune clé de modèle.

export const BASELINE_VERSION = "V1.0";
export const BASELINE_LABEL = `Baseline déterministe ${BASELINE_VERSION}`;

export const BASELINE_FACTS: readonly string[] = [
  "Régression 22/22 OK",
  "Contrat de réponse V0.2",
  "Dossier application V0.1",
  "Reprise Standex sous 2 jours ouvrés",
  "Aucun modèle génératif branché",
] as const;

export type AssistantMode = "baseline" | "experimental";

export interface AssistantModeDef {
  id: AssistantMode;
  label: string;
  available: boolean;
  hint: string;
}

export const ASSISTANT_MODES: readonly AssistantModeDef[] = [
  {
    id: "baseline",
    label: "Baseline déterministe",
    available: true,
    hint: "Moteur déterministe gelé, contrat de réponse V0.2.",
  },
  {
    id: "experimental",
    label: "Assistant expérimental (bientôt disponible)",
    available: false,
    hint: "Mode génératif non configuré.",
  },
] as const;

export const EXPERIMENTAL_NOTICE =
  "Mode expérimental non configuré. La baseline déterministe reste la référence.";

/**
 * Proposition de modification de schéma — NON APPLIQUÉE.
 * À valider avant toute exécution : elle nécessiterait une migration Supabase.
 *
 *   alter table public.sensor_test_outputs
 *     add column generation_mode text not null default 'baseline'
 *       check (generation_mode in ('baseline','experimental'));
 *   alter table public.sensor_test_internal_traces
 *     add column generation_mode text not null default 'baseline'
 *       check (generation_mode in ('baseline','experimental'));
 *   alter table public.sensor_test_reviews
 *     add column compared_output_id uuid references public.sensor_test_outputs(id) on delete set null,
 *     add column preferred_mode text check (preferred_mode in ('baseline','experimental'));
 *
 * Sans cette migration, les deux sorties ne peuvent pas être stockées côte à côte :
 * la comparaison reste donc en mémoire, côté interface uniquement.
 */
export const PROPOSED_SCHEMA_CHANGE = `alter table public.sensor_test_outputs
  add column generation_mode text not null default 'baseline'
    check (generation_mode in ('baseline','experimental'));
alter table public.sensor_test_internal_traces
  add column generation_mode text not null default 'baseline'
    check (generation_mode in ('baseline','experimental'));
alter table public.sensor_test_reviews
  add column compared_output_id uuid references public.sensor_test_outputs(id) on delete set null,
  add column preferred_mode text check (preferred_mode in ('baseline','experimental'));`;

/** Différences ligne à ligne entre deux textes (comparaison interface seulement). */
export interface TextDiffRow {
  kind: "same" | "baseline" | "experimental";
  text: string;
}

export function diffLines(baseline: string, experimental: string): TextDiffRow[] {
  const a = baseline.split("\n").filter((l) => l.trim());
  const b = experimental.split("\n").filter((l) => l.trim());
  const rows: TextDiffRow[] = [];
  const bSet = new Set(b);
  const aSet = new Set(a);
  for (const line of a) rows.push({ kind: bSet.has(line) ? "same" : "baseline", text: line });
  for (const line of b) if (!aSet.has(line)) rows.push({ kind: "experimental", text: line });
  return rows;
}
