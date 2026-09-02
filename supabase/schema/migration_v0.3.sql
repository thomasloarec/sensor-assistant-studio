-- Migration V0.3 — comparaison baseline / experimental.
-- À appliquer manuellement dans le SQL editor du projet Supabase existant.
-- Aucune nouvelle table, aucun accès anon, RLS et policies existantes inchangées.

alter table public.sensor_test_outputs
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
    check (preferred_mode is null or preferred_mode in ('baseline', 'experimental', 'neither'));
