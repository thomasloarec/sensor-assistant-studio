import { supabase } from "./supabase";

/**
 * Détection en lecture seule des colonnes ajoutées par la migration V0.3.
 * Aucune écriture, aucune modification de schéma, RLS ou grants.
 */
export interface MigrationStatus {
  checked: boolean;
  applied: boolean;
  missing: string[];
}

export const MIGRATION_V03_SQL = `alter table public.sensor_test_outputs
  add column if not exists generation_mode text not null default 'baseline'
    check (generation_mode in ('baseline', 'experimental'));

alter table public.sensor_test_internal_traces
  add column if not exists generation_mode text not null default 'baseline'
    check (generation_mode in ('baseline', 'experimental'));

alter table public.sensor_test_reviews
  add column if not exists compared_output_id uuid
    references public.sensor_test_outputs(id) on delete set null;

alter table public.sensor_test_reviews
  add column if not exists preferred_mode text
    check (preferred_mode is null or preferred_mode in ('baseline', 'experimental', 'neither'));`;

async function hasColumns(table: string, columns: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from(table).select(columns).limit(1);
  if (!error) return true;
  // 42703 = colonne inexistante ; PGRST204 = colonne inconnue côté API.
  if (error.code === "42703" || error.code === "PGRST204" || /column/i.test(error.message)) {
    return false;
  }
  // Autre erreur (droits, réseau) : on ne conclut pas à une migration manquante.
  return true;
}

export async function checkMigrationV03(): Promise<MigrationStatus> {
  if (!supabase) return { checked: false, applied: false, missing: [] };
  const missing: string[] = [];
  if (!(await hasColumns("sensor_test_outputs", "id,generation_mode"))) {
    missing.push("sensor_test_outputs.generation_mode");
  }
  if (!(await hasColumns("sensor_test_internal_traces", "id,generation_mode"))) {
    missing.push("sensor_test_internal_traces.generation_mode");
  }
  if (!(await hasColumns("sensor_test_reviews", "id,compared_output_id,preferred_mode"))) {
    missing.push("sensor_test_reviews.compared_output_id / preferred_mode");
  }
  return { checked: true, applied: missing.length === 0, missing };
}
