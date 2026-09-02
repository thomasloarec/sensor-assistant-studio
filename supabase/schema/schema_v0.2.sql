-- Assistant capteur MVP - Supabase minimal schema V0.2
-- Date: 2026-09-01
-- Purpose: internal Lovable/Supabase test bench for Standex sensor conversations.
-- Security posture: authenticated testers only; no public prospect access in this MVP.

create table if not exists public.sensor_test_scenarios (
  id uuid primary key default gen_random_uuid(),
  scenario_id text not null unique,
  priority text not null
    check (priority in ('P0', 'P1', 'P2')),
  user_prompt_fr text not null,
  expected_output_type text not null,
  expected_behavior text not null,
  must_include text,
  must_not_include text,
  trace_flags text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.sensor_test_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status text not null default 'draft'
    check (status in ('draft', 'in_review', 'closed', 'archived')),
  locale text not null default 'fr'
    check (locale in ('fr', 'en')),
  channel text not null default 'lovable_test'
    check (channel in ('lovable_test', 'manual_import', 'internal_review')),
  prospect_name text,
  prospect_company text,
  prospect_email text,
  prospect_phone text,
  prospect_city text,
  standex_city text,
  volume_band text
    check (volume_band is null or volume_band in ('maintenance', 'very_low', 'small', 'medium', 'high', 'unknown')),
  lead_potential text
    check (lead_potential is null or lead_potential in ('low', 'medium', 'high', 'unknown')),
  callback_commitment text not null default 'within_2_business_days',
  consent_notes text
);

create table if not exists public.sensor_test_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sensor_test_sessions(id) on delete cascade,
  created_at timestamptz not null default now(),
  role text not null check (role in ('prospect', 'assistant', 'internal')),
  content text not null,
  turn_index integer not null check (turn_index >= 0)
);

create table if not exists public.sensor_test_outputs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sensor_test_sessions(id) on delete cascade,
  created_at timestamptz not null default now(),
  output_type text not null
    check (output_type in (
      'S1_STANDARD_SUGGESTION',
      'S1_MAINTENANCE_REFERENCE',
      'S1_WITH_GUARDRAIL',
      'S1_WITH_DISTANCE_CAVEAT',
      'S1_WITH_INSTALLATION_CAVEAT_OR_S2',
      'S2_BE_DOSSIER',
      'S2_BE_DOSSIER_OR_WARNING',
      'S2_BE_DOSSIER_OR_KNOWLEDGE',
      'S2_BE_DOSSIER_OR_S1_WITH_CAVEAT',
      'S2_BE_DOSSIER_OR_S1_WITH_FOLLOWUP',
      'S3_MISSING_INFO',
      'KNOWLEDGE_ONLY_WITH_MAINTENANCE_EXCEPTION'
    )),
  customer_summary text not null,
  suggested_product_family text,
  suggested_reference text,
  standex_validation_required boolean not null default true,
  distributor_path_allowed boolean not null default false,
  callback_text text not null default 'Un responsable Standex reprend le sujet sous 2 jours ouvres.',
  be_dossier jsonb not null default '{}'::jsonb
);

create table if not exists public.sensor_test_internal_traces (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sensor_test_sessions(id) on delete cascade,
  output_id uuid references public.sensor_test_outputs(id) on delete set null,
  created_at timestamptz not null default now(),
  understood_application text,
  detection_target text,
  mounting_geometry text,
  electrical_load text,
  voltage_value text,
  current_value text,
  power_value text,
  volume_signal text,
  product_candidates jsonb not null default '[]'::jsonb,
  datasheet_values_used jsonb not null default '{}'::jsonb,
  guardrails_triggered text[] not null default '{}',
  missing_questions text[] not null default '{}',
  confidence text not null default 'unknown'
    check (confidence in ('low', 'medium', 'high', 'unknown')),
  routing_reason text
);

create table if not exists public.sensor_test_reviews (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sensor_test_sessions(id) on delete cascade,
  reviewer_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  reviewer_role text not null
    check (reviewer_role in ('thomas', 'claude', 'be', 'sales', 'other')),
  verdict text not null
    check (verdict in ('good', 'needs_revision', 'unsafe', 'unclear', 'not_reviewed')),
  notes text,
  corrected_output_type text
    check (corrected_output_type is null or corrected_output_type in (
      'S1_STANDARD_SUGGESTION',
      'S1_MAINTENANCE_REFERENCE',
      'S1_WITH_GUARDRAIL',
      'S1_WITH_DISTANCE_CAVEAT',
      'S1_WITH_INSTALLATION_CAVEAT_OR_S2',
      'S2_BE_DOSSIER',
      'S2_BE_DOSSIER_OR_WARNING',
      'S2_BE_DOSSIER_OR_KNOWLEDGE',
      'S2_BE_DOSSIER_OR_S1_WITH_CAVEAT',
      'S2_BE_DOSSIER_OR_S1_WITH_FOLLOWUP',
      'S3_MISSING_INFO',
      'KNOWLEDGE_ONLY_WITH_MAINTENANCE_EXCEPTION'
    )),
  corrected_product_family text,
  corrected_reference text
);

create index if not exists sensor_test_sessions_user_id_idx
  on public.sensor_test_sessions(user_id);

create index if not exists sensor_test_messages_session_id_turn_idx
  on public.sensor_test_messages(session_id, turn_index);

create index if not exists sensor_test_outputs_session_id_idx
  on public.sensor_test_outputs(session_id);

create index if not exists sensor_test_internal_traces_session_id_idx
  on public.sensor_test_internal_traces(session_id);

create index if not exists sensor_test_reviews_session_id_idx
  on public.sensor_test_reviews(session_id);

revoke all on table public.sensor_test_scenarios from anon, authenticated;
revoke all on table public.sensor_test_sessions from anon, authenticated;
revoke all on table public.sensor_test_messages from anon, authenticated;
revoke all on table public.sensor_test_outputs from anon, authenticated;
revoke all on table public.sensor_test_internal_traces from anon, authenticated;
revoke all on table public.sensor_test_reviews from anon, authenticated;

grant usage on schema public to authenticated;
grant select on table public.sensor_test_scenarios to authenticated;
grant select, insert, update, delete on table public.sensor_test_sessions to authenticated;
grant select, insert on table public.sensor_test_messages to authenticated;
grant select, insert on table public.sensor_test_outputs to authenticated;
grant select, insert on table public.sensor_test_internal_traces to authenticated;
grant select, insert on table public.sensor_test_reviews to authenticated;

alter table public.sensor_test_scenarios enable row level security;
alter table public.sensor_test_sessions enable row level security;
alter table public.sensor_test_messages enable row level security;
alter table public.sensor_test_outputs enable row level security;
alter table public.sensor_test_internal_traces enable row level security;
alter table public.sensor_test_reviews enable row level security;

drop policy if exists "testers read active scenarios" on public.sensor_test_scenarios;
drop policy if exists "testers select own sessions" on public.sensor_test_sessions;
drop policy if exists "testers insert own sessions" on public.sensor_test_sessions;
drop policy if exists "testers update own sessions" on public.sensor_test_sessions;
drop policy if exists "testers delete own sessions" on public.sensor_test_sessions;
drop policy if exists "testers select own session messages" on public.sensor_test_messages;
drop policy if exists "testers insert own session messages" on public.sensor_test_messages;
drop policy if exists "testers select own outputs" on public.sensor_test_outputs;
drop policy if exists "testers insert own outputs" on public.sensor_test_outputs;
drop policy if exists "testers select own traces" on public.sensor_test_internal_traces;
drop policy if exists "testers insert own traces" on public.sensor_test_internal_traces;
drop policy if exists "testers select own reviews" on public.sensor_test_reviews;
drop policy if exists "testers insert own reviews" on public.sensor_test_reviews;

create policy "testers read active scenarios"
  on public.sensor_test_scenarios for select
  to authenticated
  using (is_active = true);

create policy "testers select own sessions"
  on public.sensor_test_sessions for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "testers insert own sessions"
  on public.sensor_test_sessions for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "testers update own sessions"
  on public.sensor_test_sessions for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "testers delete own sessions"
  on public.sensor_test_sessions for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "testers select own session messages"
  on public.sensor_test_messages for select
  to authenticated
  using (
    exists (
      select 1
      from public.sensor_test_sessions s
      where s.id = sensor_test_messages.session_id
        and s.user_id = (select auth.uid())
    )
  );

create policy "testers insert own session messages"
  on public.sensor_test_messages for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.sensor_test_sessions s
      where s.id = sensor_test_messages.session_id
        and s.user_id = (select auth.uid())
    )
  );

create policy "testers select own outputs"
  on public.sensor_test_outputs for select
  to authenticated
  using (
    exists (
      select 1
      from public.sensor_test_sessions s
      where s.id = sensor_test_outputs.session_id
        and s.user_id = (select auth.uid())
    )
  );

create policy "testers insert own outputs"
  on public.sensor_test_outputs for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.sensor_test_sessions s
      where s.id = sensor_test_outputs.session_id
        and s.user_id = (select auth.uid())
    )
  );

create policy "testers select own traces"
  on public.sensor_test_internal_traces for select
  to authenticated
  using (
    exists (
      select 1
      from public.sensor_test_sessions s
      where s.id = sensor_test_internal_traces.session_id
        and s.user_id = (select auth.uid())
    )
  );

create policy "testers insert own traces"
  on public.sensor_test_internal_traces for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.sensor_test_sessions s
      where s.id = sensor_test_internal_traces.session_id
        and s.user_id = (select auth.uid())
    )
  );

create policy "testers select own reviews"
  on public.sensor_test_reviews for select
  to authenticated
  using (
    exists (
      select 1
      from public.sensor_test_sessions s
      where s.id = sensor_test_reviews.session_id
        and s.user_id = (select auth.uid())
    )
  );

create policy "testers insert own reviews"
  on public.sensor_test_reviews for insert
  to authenticated
  with check (
    reviewer_id = (select auth.uid())
    and exists (
      select 1
      from public.sensor_test_sessions s
      where s.id = sensor_test_reviews.session_id
        and s.user_id = (select auth.uid())
    )
  );


