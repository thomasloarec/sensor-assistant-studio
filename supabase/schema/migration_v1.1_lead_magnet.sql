-- ============================================================================
-- Migration V1.1 — parcours Lead Magnet (co-conception, revue R&D, offre, échantillons)
--
-- Projet cible EXCLUSIF : yyobodalwtsqdyrqwkjk (standex-assistant-mvp).
-- Remplace le brouillon V1.0 (commit 48d266aa), JAMAIS appliqué, qui laissait
-- le client écrire nda_status, donnait un accès staff global et permettait des
-- révisions / échantillons sans contrôle. Ne pas appliquer V1.0.
--
-- Propriétés de cette migration :
--   * additive : les six tables sensor_test_* du banc interne ne sont pas touchées ;
--   * le schéma `lead` n'est PAS exposé à l'API REST : aucun DML client direct.
--     Tout passe par des RPC transactionnelles publiques (contrat en fin de fichier) ;
--   * fonctions SECURITY DEFINER isolées dans `lead_priv` (schéma non exposé),
--     wrappers publics en SECURITY INVOKER, `search_path` figé, grants minimaux ;
--   * aucun accès `anon` sauf la sonde de version (lecture d'un simple numéro) ;
--   * rôles staff provisionnés par `service_role` uniquement : pas d'autoattribution ;
--   * notes internes stockées à part et jamais renvoyées par une RPC client ;
--   * statut NDA écrit uniquement sur preuve vérifiée côté serveur ;
--   * compare-and-swap sur la révision : pas de décalage révision / revue / offre.
--
-- Idempotente : réexécutable sans erreur.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Schémas
-- ----------------------------------------------------------------------------
create schema if not exists lead;
create schema if not exists lead_priv;

revoke all on schema lead from public;
revoke all on schema lead_priv from public;
grant usage on schema lead, lead_priv to service_role;
-- `authenticated` n'obtient PAS usage sur `lead` : aucune table n'est atteignable
-- directement, même si le schéma venait à être exposé par erreur.

-- Registre de migrations : sert de sonde non destructive côté application.
create table if not exists lead.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);
alter table lead.schema_migrations enable row level security;

-- ----------------------------------------------------------------------------
-- 2. Rôles staff (provisionnement serveur uniquement)
-- ----------------------------------------------------------------------------
do $$ begin
  create type lead.staff_role as enum ('rnd', 'sales', 'admin');
exception when duplicate_object then null; end $$;

create table if not exists lead.staff_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role lead.staff_role not null,
  granted_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
alter table lead.staff_members enable row level security;
-- Aucune policy : seul `service_role` (et les fonctions definer) y accèdent.

-- ----------------------------------------------------------------------------
-- 3. Tables métier
-- ----------------------------------------------------------------------------
create table if not exists lead.design_dossiers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Révision courante = dernière révision SOUMISE (0 = jamais soumis).
  current_revision integer not null default 0 check (current_revision >= 0),
  nda_required boolean not null default true,
  nda_status text not null default 'requested'
    check (nda_status in ('not_required','requested','prepared','awaiting_signatures','in_force'))
);

create table if not exists lead.design_collaborators (
  dossier_id uuid not null references lead.design_dossiers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (dossier_id, user_id)
);

-- Affectation explicite du staff à un dossier : pas d'accès global.
create table if not exists lead.dossier_assignments (
  dossier_id uuid not null references lead.design_dossiers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (dossier_id, user_id)
);

-- Instantanés immuables : aucune policy update/delete, aucune RPC de modification.
create table if not exists lead.design_revisions (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references lead.design_dossiers(id) on delete cascade,
  revision integer not null check (revision >= 1),
  snapshot jsonb not null,
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  submitted_at timestamptz not null default now(),
  submitted_by uuid not null references auth.users(id),
  consents jsonb not null default '[]'::jsonb,
  transferred_files jsonb not null default '[]'::jsonb,
  nda_status_at_submit text not null,
  unique (dossier_id, revision)
);

create table if not exists lead.design_reviews (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references lead.design_dossiers(id) on delete cascade,
  revision_id uuid not null references lead.design_revisions(id) on delete cascade,
  revision integer not null check (revision >= 1),
  author_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  scope text not null,
  conditions text not null default '',
  verdict text not null check (verdict in ('validated','variant_proposed','more_info')),
  published boolean not null default false,
  published_at timestamptz,
  client_message text,
  superseded_by uuid references lead.design_reviews(id) on delete set null,
  check (published = (published_at is not null))
);
create index if not exists design_reviews_dossier_idx on lead.design_reviews (dossier_id, revision);

-- Notes internes Standex : table séparée, jamais lue par une RPC client.
create table if not exists lead.internal_notes (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references lead.design_dossiers(id) on delete cascade,
  review_id uuid references lead.design_reviews(id) on delete cascade,
  author_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  body text not null
);

create table if not exists lead.offers (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references lead.design_dossiers(id) on delete cascade,
  review_id uuid not null references lead.design_reviews(id) on delete cascade,
  revision integer not null check (revision >= 1),
  author_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  tiers jsonb not null,
  moq integer not null check (moq > 0),
  nre_tooling_cost numeric check (nre_tooling_cost is null or nre_tooling_cost >= 0),
  incoterm text not null check (length(btrim(incoterm)) > 0),
  lead_time_weeks integer check (lead_time_weeks is null or lead_time_weeks > 0),
  valid_until date not null,
  voided_at timestamptz,
  void_reason text
);

create table if not exists lead.sample_requests (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references lead.design_dossiers(id) on delete cascade,
  review_id uuid not null references lead.design_reviews(id) on delete cascade,
  revision integer not null check (revision >= 1),
  requested_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  part_number text not null check (length(btrim(part_number)) > 0),
  quantity integer not null check (quantity > 0),
  route text not null check (route in ('distributors','standex_direct','manual_review')),
  status text not null default 'requested'
    check (status in ('requested','confirmed','shipped','received','closed')),
  feedback text
);

-- Preuve NDA : écrite exclusivement par le serveur après vérification réelle.
create table if not exists lead.nda_proofs (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references lead.design_dossiers(id) on delete cascade,
  template_sha256 text not null check (template_sha256 ~ '^[a-f0-9]{64}$'),
  document_sha256 text not null check (document_sha256 ~ '^[a-f0-9]{64}$'),
  verified_at timestamptz not null,
  verified_by uuid not null references auth.users(id),
  verification_source text not null
);

-- Journal d'audit des actions serveur sensibles.
create table if not exists lead.audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor uuid,
  action text not null,
  dossier_id uuid,
  detail jsonb not null default '{}'::jsonb
);

do $$
declare t text;
begin
  foreach t in array array['design_dossiers','design_collaborators','dossier_assignments',
    'design_revisions','design_reviews','internal_notes','offers','sample_requests',
    'nda_proofs','audit_log']
  loop
    execute format('alter table lead.%I enable row level security', t);
    execute format('revoke all on lead.%I from public, anon, authenticated', t);
    execute format('grant all on lead.%I to service_role', t);
  end loop;
end $$;
grant all on lead.staff_members, lead.schema_migrations to service_role;
grant usage, select on all sequences in schema lead to service_role;
-- Défense en profondeur : RLS active et AUCUNE policy pour `authenticated`.
-- Le client n'atteint ces tables que via les RPC ci-dessous.

-- ----------------------------------------------------------------------------
-- 4. Helpers SECURITY DEFINER (schéma non exposé)
-- ----------------------------------------------------------------------------
create or replace function lead_priv.role_of(_user uuid)
returns lead.staff_role language sql stable security definer
set search_path = lead, lead_priv, pg_temp as $$
  select role from lead.staff_members where user_id = _user;
$$;

create or replace function lead_priv.require_user()
returns uuid language plpgsql stable security definer
set search_path = lead, lead_priv, pg_temp as $$
declare u uuid := auth.uid();
begin
  if u is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  return u;
end $$;

-- Accès staff : rôle requis ET affectation explicite au dossier (admin excepté).
create or replace function lead_priv.staff_can_act(_user uuid, _dossier uuid, _roles lead.staff_role[])
returns boolean language sql stable security definer
set search_path = lead, lead_priv, pg_temp as $$
  select exists (
    select 1 from lead.staff_members m
    where m.user_id = _user
      and m.role = any(_roles)
      and (m.role = 'admin'
           or exists (select 1 from lead.dossier_assignments a
                      where a.dossier_id = _dossier and a.user_id = _user))
  );
$$;

create or replace function lead_priv.client_can_read(_user uuid, _dossier uuid)
returns boolean language sql stable security definer
set search_path = lead, lead_priv, pg_temp as $$
  select exists (
    select 1 from lead.design_dossiers d
    where d.id = _dossier
      and (d.owner_id = _user
           or exists (select 1 from lead.design_collaborators c
                      where c.dossier_id = d.id and c.user_id = _user))
  );
$$;

-- Le NDA n'autorise un transfert confidentiel que sur preuve vérifiée serveur.
create or replace function lead_priv.nda_allows_transfer(_dossier uuid)
returns boolean language sql stable security definer
set search_path = lead, lead_priv, pg_temp as $$
  select case
    when d.nda_required is false and d.nda_status = 'not_required' then true
    when d.nda_status = 'in_force'
      and exists (select 1 from lead.nda_proofs p where p.dossier_id = d.id) then true
    else false
  end
  from lead.design_dossiers d where d.id = _dossier;
$$;

-- Provisionnement des rôles : service_role uniquement, aucun wrapper public.
create or replace function lead_priv.assign_staff(_user uuid, _role lead.staff_role)
returns void language sql security definer
set search_path = lead, lead_priv, pg_temp as $$
  insert into lead.staff_members (user_id, role, granted_by)
  values (_user, _role, auth.uid())
  on conflict (user_id) do update set role = excluded.role;
$$;
revoke all on function lead_priv.assign_staff(uuid, lead.staff_role) from public, anon, authenticated;
grant execute on function lead_priv.assign_staff(uuid, lead.staff_role) to service_role;

-- Enregistrement d'une preuve NDA vérifiée : service_role uniquement.
create or replace function lead_priv.record_nda_proof(
  _dossier uuid, _template_sha text, _document_sha text, _verified_by uuid, _source text)
returns uuid language plpgsql security definer
set search_path = lead, lead_priv, pg_temp as $$
declare pid uuid;
begin
  insert into lead.nda_proofs (dossier_id, template_sha256, document_sha256,
                               verified_at, verified_by, verification_source)
  values (_dossier, lower(_template_sha), lower(_document_sha), now(), _verified_by, _source)
  returning id into pid;
  update lead.design_dossiers set nda_status = 'in_force', updated_at = now() where id = _dossier;
  insert into lead.audit_log (actor, action, dossier_id, detail)
  values (_verified_by, 'nda_proof_recorded', _dossier, jsonb_build_object('source', _source));
  return pid;
end $$;
revoke all on function lead_priv.record_nda_proof(uuid, text, text, uuid, text) from public, anon, authenticated;
grant execute on function lead_priv.record_nda_proof(uuid, text, text, uuid, text) to service_role;

-- ----------------------------------------------------------------------------
-- 5. RPC publiques (wrappers SECURITY INVOKER)
-- ----------------------------------------------------------------------------

-- 5.1 Sonde non destructive : lecture seule d'un numéro de version.
create or replace function lead_priv.schema_version()
returns jsonb language sql stable security definer
set search_path = lead, lead_priv, pg_temp as $$
  select jsonb_build_object(
    'version', (select max(version) from lead.schema_migrations),
    'ready', exists (select 1 from lead.schema_migrations));
$$;

create or replace function public.lead_schema_version()
returns jsonb language sql stable security invoker
set search_path = public, lead_priv, pg_temp as $$
  select lead_priv.schema_version();
$$;
revoke all on function public.lead_schema_version() from public;
grant execute on function lead_priv.schema_version() to anon, authenticated;
grant execute on function public.lead_schema_version() to anon, authenticated;

-- 5.2 Capacités de l'utilisateur courant (rôle lu en base, jamais fourni par le client).
create or replace function lead_priv.my_capabilities()
returns jsonb language plpgsql stable security definer
set search_path = lead, lead_priv, pg_temp as $$
declare u uuid := auth.uid();
begin
  if u is null then
    return jsonb_build_object('authenticated', false, 'role', null);
  end if;
  return jsonb_build_object(
    'authenticated', true,
    'user_id', u,
    'role', lead_priv.role_of(u),
    'assigned_dossiers', coalesce((select jsonb_agg(dossier_id)
                                   from lead.dossier_assignments where user_id = u), '[]'::jsonb));
end $$;

create or replace function public.lead_my_capabilities()
returns jsonb language sql stable security invoker
set search_path = public, lead_priv, pg_temp as $$
  select lead_priv.my_capabilities();
$$;
revoke all on function public.lead_my_capabilities() from public, anon;
grant execute on function lead_priv.my_capabilities() to authenticated;
grant execute on function public.lead_my_capabilities() to authenticated;

-- 5.3 Création d'un dossier.
create or replace function lead_priv.create_dossier(_title text, _nda_required boolean)
returns uuid language plpgsql security definer
set search_path = lead, lead_priv, pg_temp as $$
declare u uuid := lead_priv.require_user(); did uuid;
begin
  insert into lead.design_dossiers (owner_id, title, nda_required, nda_status)
  values (u, btrim(_title), coalesce(_nda_required, true),
          case when coalesce(_nda_required, true) then 'requested' else 'not_required' end)
  returning id into did;
  insert into lead.audit_log (actor, action, dossier_id) values (u, 'dossier_created', did);
  return did;
end $$;

create or replace function public.lead_create_dossier(p_title text, p_nda_required boolean default true)
returns uuid language sql security invoker
set search_path = public, lead_priv, pg_temp as $$
  select lead_priv.create_dossier(p_title, p_nda_required);
$$;
revoke all on function public.lead_create_dossier(text, boolean) from public, anon;
grant execute on function lead_priv.create_dossier(text, boolean) to authenticated;
grant execute on function public.lead_create_dossier(text, boolean) to authenticated;

-- 5.4 Soumission d'une révision : transactionnelle, compare-and-swap, gate NDA + consentements.
create or replace function lead_priv.submit_revision(
  _dossier uuid, _expected_revision integer, _snapshot jsonb,
  _content_hash text, _consents jsonb, _transferred_files jsonb)
returns jsonb language plpgsql security definer
set search_path = lead, lead_priv, pg_temp as $$
declare
  u uuid := lead_priv.require_user();
  d lead.design_dossiers%rowtype;
  rid uuid;
  next_rev integer;
begin
  -- Verrou de ligne : deux soumissions concurrentes ne peuvent pas produire la même révision.
  select * into d from lead.design_dossiers where id = _dossier for update;
  if not found then raise exception 'DOSSIER_NOT_FOUND' using errcode = '42501'; end if;
  if not lead_priv.client_can_read(u, _dossier) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if d.current_revision <> coalesce(_expected_revision, -1) then
    raise exception 'REVISION_CONFLICT:%', d.current_revision using errcode = '40001';
  end if;
  if _content_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'BAD_HASH' using errcode = '22023';
  end if;
  if jsonb_typeof(_snapshot) <> 'object' or _snapshot = '{}'::jsonb then
    raise exception 'EMPTY_SNAPSHOT' using errcode = '22023';
  end if;
  if jsonb_typeof(_consents) <> 'array'
     or not exists (select 1 from jsonb_array_elements(_consents) c
                    where c->>'kind' = 'supabase_dossier') then
    raise exception 'CONSENT_MISSING' using errcode = '42501';
  end if;
  if not lead_priv.nda_allows_transfer(_dossier) then
    raise exception 'NDA_NOT_IN_FORCE' using errcode = '42501';
  end if;

  next_rev := d.current_revision + 1;
  insert into lead.design_revisions (dossier_id, revision, snapshot, content_hash,
    submitted_by, consents, transferred_files, nda_status_at_submit)
  values (_dossier, next_rev, _snapshot, lower(_content_hash), u,
          _consents, coalesce(_transferred_files, '[]'::jsonb), d.nda_status)
  returning id into rid;

  update lead.design_dossiers
     set current_revision = next_rev, updated_at = now()
   where id = _dossier;

  -- Toute nouvelle révision périme les revues et offres précédentes.
  update lead.offers set voided_at = now(),
         void_reason = 'Nouvelle révision soumise : offre périmée.'
   where dossier_id = _dossier and voided_at is null;

  insert into lead.audit_log (actor, action, dossier_id, detail)
  values (u, 'revision_submitted', _dossier,
          jsonb_build_object('revision', next_rev, 'hash', lower(_content_hash)));

  return jsonb_build_object('revision_id', rid, 'revision', next_rev,
                            'submitted_at', now(), 'content_hash', lower(_content_hash));
end $$;

create or replace function public.lead_submit_revision(
  p_dossier uuid, p_expected_revision integer, p_snapshot jsonb,
  p_content_hash text, p_consents jsonb, p_transferred_files jsonb default '[]'::jsonb)
returns jsonb language sql security invoker
set search_path = public, lead_priv, pg_temp as $$
  select lead_priv.submit_revision(p_dossier, p_expected_revision, p_snapshot,
                                   p_content_hash, p_consents, p_transferred_files);
$$;
revoke all on function public.lead_submit_revision(uuid, integer, jsonb, text, jsonb, jsonb) from public, anon;
grant execute on function lead_priv.submit_revision(uuid, integer, jsonb, text, jsonb, jsonb) to authenticated;
grant execute on function public.lead_submit_revision(uuid, integer, jsonb, text, jsonb, jsonb) to authenticated;

-- 5.5 Publication d'un retour R&D : rôle rnd/admin + affectation, révision vérifiée.
create or replace function lead_priv.publish_review(
  _revision_id uuid, _scope text, _conditions text, _verdict text,
  _client_message text, _internal_note text)
returns uuid language plpgsql security definer
set search_path = lead, lead_priv, pg_temp as $$
declare
  u uuid := lead_priv.require_user();
  r lead.design_revisions%rowtype;
  d lead.design_dossiers%rowtype;
  new_id uuid;
begin
  select * into r from lead.design_revisions where id = _revision_id;
  if not found then raise exception 'REVISION_NOT_FOUND' using errcode = '42501'; end if;
  select * into d from lead.design_dossiers where id = r.dossier_id for update;
  if not lead_priv.staff_can_act(u, d.id, array['rnd','admin']::lead.staff_role[]) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  -- Pas de revue sur une révision dépassée : la validation suit la dernière soumission.
  if r.revision <> d.current_revision then
    raise exception 'REVISION_CONFLICT:%', d.current_revision using errcode = '40001';
  end if;
  if _verdict not in ('validated','variant_proposed','more_info') then
    raise exception 'BAD_VERDICT' using errcode = '22023';
  end if;

  insert into lead.design_reviews (dossier_id, revision_id, revision, author_id, scope,
    conditions, verdict, published, published_at, client_message)
  values (d.id, r.id, r.revision, u, coalesce(_scope,''), coalesce(_conditions,''),
          _verdict, true, now(), _client_message)
  returning id into new_id;

  update lead.design_reviews set superseded_by = new_id
   where dossier_id = d.id and id <> new_id and superseded_by is null;

  if _internal_note is not null and btrim(_internal_note) <> '' then
    insert into lead.internal_notes (dossier_id, review_id, author_id, body)
    values (d.id, new_id, u, _internal_note);
  end if;

  insert into lead.audit_log (actor, action, dossier_id, detail)
  values (u, 'review_published', d.id,
          jsonb_build_object('revision', r.revision, 'verdict', _verdict));
  return new_id;
end $$;

create or replace function public.lead_publish_review(
  p_revision_id uuid, p_scope text, p_conditions text, p_verdict text,
  p_client_message text default null, p_internal_note text default null)
returns uuid language sql security invoker
set search_path = public, lead_priv, pg_temp as $$
  select lead_priv.publish_review(p_revision_id, p_scope, p_conditions, p_verdict,
                                  p_client_message, p_internal_note);
$$;
revoke all on function public.lead_publish_review(uuid, text, text, text, text, text) from public, anon;
grant execute on function lead_priv.publish_review(uuid, text, text, text, text, text) to authenticated;
grant execute on function public.lead_publish_review(uuid, text, text, text, text, text) to authenticated;

-- 5.6 Offre : rôle sales/admin, revue validée non périmée, sur la révision courante.
create or replace function lead_priv.create_offer(
  _review_id uuid, _currency text, _tiers jsonb, _moq integer,
  _nre numeric, _incoterm text, _lead_time_weeks integer, _valid_until date)
returns uuid language plpgsql security definer
set search_path = lead, lead_priv, pg_temp as $$
declare
  u uuid := lead_priv.require_user();
  rv lead.design_reviews%rowtype;
  d lead.design_dossiers%rowtype;
  oid uuid;
  bad integer;
begin
  select * into rv from lead.design_reviews where id = _review_id;
  if not found then raise exception 'REVIEW_NOT_FOUND' using errcode = '42501'; end if;
  select * into d from lead.design_dossiers where id = rv.dossier_id for update;
  if not lead_priv.staff_can_act(u, d.id, array['sales','admin']::lead.staff_role[]) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if rv.verdict <> 'validated' or rv.superseded_by is not null or not rv.published then
    raise exception 'REVIEW_NOT_VALIDATED' using errcode = '42501';
  end if;
  if rv.revision <> d.current_revision then
    raise exception 'REVISION_CONFLICT:%', d.current_revision using errcode = '40001';
  end if;
  if jsonb_typeof(_tiers) <> 'array' or jsonb_array_length(_tiers) = 0 then
    raise exception 'TIERS_REQUIRED' using errcode = '22023';
  end if;
  -- Prix et quantités : finis, strictement positifs, jamais NaN.
  select count(*) into bad from jsonb_array_elements(_tiers) t
   where jsonb_typeof(t->'quantity') <> 'number' or jsonb_typeof(t->'unit_price') <> 'number'
      or (t->>'quantity')::numeric <= 0 or (t->>'unit_price')::numeric <= 0
      or (t->>'unit_price') ~* 'nan|infinity';
  if bad > 0 then raise exception 'BAD_TIERS' using errcode = '22023'; end if;
  if _valid_until < current_date then
    raise exception 'BAD_VALIDITY' using errcode = '22023';
  end if;

  insert into lead.offers (dossier_id, review_id, revision, author_id, currency, tiers, moq,
    nre_tooling_cost, incoterm, lead_time_weeks, valid_until)
  values (d.id, rv.id, rv.revision, u, upper(_currency), _tiers, _moq, _nre,
          _incoterm, _lead_time_weeks, _valid_until)
  returning id into oid;

  insert into lead.audit_log (actor, action, dossier_id, detail)
  values (u, 'offer_created', d.id, jsonb_build_object('revision', rv.revision));
  return oid;
end $$;

create or replace function public.lead_create_offer(
  p_review_id uuid, p_currency text, p_tiers jsonb, p_moq integer,
  p_nre numeric, p_incoterm text, p_lead_time_weeks integer, p_valid_until date)
returns uuid language sql security invoker
set search_path = public, lead_priv, pg_temp as $$
  select lead_priv.create_offer(p_review_id, p_currency, p_tiers, p_moq, p_nre,
                                p_incoterm, p_lead_time_weeks, p_valid_until);
$$;
revoke all on function public.lead_create_offer(uuid, text, jsonb, integer, numeric, text, integer, date) from public, anon;
grant execute on function lead_priv.create_offer(uuid, text, jsonb, integer, numeric, text, integer, date) to authenticated;
grant execute on function public.lead_create_offer(uuid, text, jsonb, integer, numeric, text, integer, date) to authenticated;

-- 5.7 Échantillons : après revue validée seulement ; la route est décidée serveur.
create or replace function lead_priv.request_samples(
  _review_id uuid, _part_number text, _quantity integer,
  _annual_volume integer, _is_standard boolean)
returns jsonb language plpgsql security definer
set search_path = lead, lead_priv, pg_temp as $$
declare
  u uuid := lead_priv.require_user();
  rv lead.design_reviews%rowtype;
  d lead.design_dossiers%rowtype;
  route text;
  sid uuid;
begin
  select * into rv from lead.design_reviews where id = _review_id;
  if not found then raise exception 'REVIEW_NOT_FOUND' using errcode = '42501'; end if;
  select * into d from lead.design_dossiers where id = rv.dossier_id;
  if not (lead_priv.client_can_read(u, d.id)
          or lead_priv.staff_can_act(u, d.id, array['rnd','sales','admin']::lead.staff_role[])) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if rv.verdict <> 'validated' or not rv.published or rv.superseded_by is not null then
    raise exception 'REVIEW_NOT_VALIDATED' using errcode = '42501';
  end if;
  if rv.revision <> d.current_revision then
    raise exception 'REVISION_CONFLICT:%', d.current_revision using errcode = '40001';
  end if;

  -- Volume inconnu ou produit spécifique : revue manuelle, jamais d'automatisme.
  route := case
    when coalesce(_is_standard, false) is not true then 'manual_review'
    when _annual_volume is null then 'manual_review'
    when _annual_volume < 1000 then 'distributors'
    else 'standex_direct'
  end;

  insert into lead.sample_requests (dossier_id, review_id, revision, requested_by,
    part_number, quantity, route)
  values (d.id, rv.id, rv.revision, u, btrim(_part_number), _quantity, route)
  returning id into sid;

  insert into lead.audit_log (actor, action, dossier_id, detail)
  values (u, 'samples_requested', d.id, jsonb_build_object('route', route));
  -- La gratuité n'est jamais automatique : `standex_direct` reste soumis à confirmation.
  return jsonb_build_object('id', sid, 'route', route, 'status', 'requested');
end $$;

create or replace function public.lead_request_samples(
  p_review_id uuid, p_part_number text, p_quantity integer,
  p_annual_volume integer default null, p_is_standard boolean default false)
returns jsonb language sql security invoker
set search_path = public, lead_priv, pg_temp as $$
  select lead_priv.request_samples(p_review_id, p_part_number, p_quantity,
                                   p_annual_volume, p_is_standard);
$$;
revoke all on function public.lead_request_samples(uuid, text, integer, integer, boolean) from public, anon;
grant execute on function lead_priv.request_samples(uuid, text, integer, integer, boolean) to authenticated;
grant execute on function public.lead_request_samples(uuid, text, integer, integer, boolean) to authenticated;

-- 5.8 Vue client : revues PUBLIÉES uniquement, aucune note interne, aucun champ staff.
create or replace function lead_priv.client_view(_dossier uuid)
returns jsonb language plpgsql stable security definer
set search_path = lead, lead_priv, pg_temp as $$
declare u uuid := lead_priv.require_user(); d lead.design_dossiers%rowtype;
begin
  select * into d from lead.design_dossiers where id = _dossier;
  if not found or not lead_priv.client_can_read(u, _dossier) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'dossier', jsonb_build_object('id', d.id, 'title', d.title,
      'current_revision', d.current_revision, 'nda_status', d.nda_status,
      'nda_required', d.nda_required, 'updated_at', d.updated_at),
    'revisions', coalesce((select jsonb_agg(jsonb_build_object(
        'id', r.id, 'revision', r.revision, 'content_hash', r.content_hash,
        'submitted_at', r.submitted_at, 'transferred_files', r.transferred_files)
        order by r.revision)
      from lead.design_revisions r where r.dossier_id = _dossier), '[]'::jsonb),
    'reviews', coalesce((select jsonb_agg(jsonb_build_object(
        'id', rv.id, 'revision', rv.revision, 'created_at', rv.created_at,
        'scope', rv.scope, 'conditions', rv.conditions, 'verdict', rv.verdict,
        'message', rv.client_message, 'superseded', rv.superseded_by is not null)
        order by rv.created_at)
      from lead.design_reviews rv
      where rv.dossier_id = _dossier and rv.published), '[]'::jsonb),
    'offers', coalesce((select jsonb_agg(jsonb_build_object(
        'id', o.id, 'revision', o.revision, 'currency', o.currency, 'tiers', o.tiers,
        'moq', o.moq, 'incoterm', o.incoterm, 'lead_time_weeks', o.lead_time_weeks,
        'valid_until', o.valid_until, 'voided', o.voided_at is not null)
        order by o.created_at)
      from lead.offers o where o.dossier_id = _dossier), '[]'::jsonb),
    'samples', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'part_number', s.part_number, 'quantity', s.quantity,
        'route', s.route, 'status', s.status) order by s.created_at)
      from lead.sample_requests s where s.dossier_id = _dossier), '[]'::jsonb));
end $$;

create or replace function public.lead_client_view(p_dossier uuid)
returns jsonb language sql stable security invoker
set search_path = public, lead_priv, pg_temp as $$
  select lead_priv.client_view(p_dossier);
$$;
revoke all on function public.lead_client_view(uuid) from public, anon;
grant execute on function lead_priv.client_view(uuid) to authenticated;
grant execute on function public.lead_client_view(uuid) to authenticated;

-- 5.9 Vue staff : notes internes incluses, réservée au staff affecté.
create or replace function lead_priv.staff_view(_dossier uuid)
returns jsonb language plpgsql stable security definer
set search_path = lead, lead_priv, pg_temp as $$
declare u uuid := lead_priv.require_user();
begin
  if not lead_priv.staff_can_act(u, _dossier, array['rnd','sales','admin']::lead.staff_role[]) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  return lead_priv.client_view(_dossier) || jsonb_build_object(
    'internal_notes', coalesce((select jsonb_agg(jsonb_build_object(
        'id', n.id, 'created_at', n.created_at, 'author_id', n.author_id, 'body', n.body)
        order by n.created_at)
      from lead.internal_notes n where n.dossier_id = _dossier), '[]'::jsonb),
    'unpublished_reviews', coalesce((select jsonb_agg(jsonb_build_object(
        'id', rv.id, 'revision', rv.revision, 'verdict', rv.verdict))
      from lead.design_reviews rv
      where rv.dossier_id = _dossier and not rv.published), '[]'::jsonb));
end $$;

create or replace function public.lead_staff_view(p_dossier uuid)
returns jsonb language sql stable security invoker
set search_path = public, lead_priv, pg_temp as $$
  select lead_priv.staff_view(p_dossier);
$$;
revoke all on function public.lead_staff_view(uuid) from public, anon;
grant execute on function lead_priv.staff_view(uuid) to authenticated;
grant execute on function public.lead_staff_view(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 6. Stockage privé des fichiers explicitement transmis
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('lead-design-files', 'lead-design-files', false)
on conflict (id) do nothing;

drop policy if exists lead_files_owner_rw on storage.objects;
create policy lead_files_owner_rw on storage.objects for all to authenticated
  using (bucket_id = 'lead-design-files' and owner = auth.uid())
  with check (bucket_id = 'lead-design-files' and owner = auth.uid());

-- ----------------------------------------------------------------------------
-- 7. Enregistrement de la version
-- ----------------------------------------------------------------------------
insert into lead.schema_migrations (version) values ('1.1')
on conflict (version) do nothing;

commit;

-- ============================================================================
-- CONTRAT RPC (tout est appelé via supabase.rpc(...), schéma `lead` non exposé)
--
--  public.lead_schema_version()                       -> jsonb {version, ready}   [anon+auth]
--  public.lead_my_capabilities()                      -> jsonb {authenticated, user_id, role,
--                                                              assigned_dossiers}  [auth]
--  public.lead_create_dossier(p_title, p_nda_required)-> uuid                      [auth]
--  public.lead_submit_revision(p_dossier, p_expected_revision, p_snapshot,
--       p_content_hash, p_consents, p_transferred_files)
--                                                     -> jsonb {revision_id, revision,
--                                                              submitted_at, content_hash} [auth]
--  public.lead_publish_review(p_revision_id, p_scope, p_conditions, p_verdict,
--       p_client_message, p_internal_note)            -> uuid            [rôle rnd|admin affecté]
--  public.lead_create_offer(p_review_id, p_currency, p_tiers, p_moq, p_nre,
--       p_incoterm, p_lead_time_weeks, p_valid_until) -> uuid            [rôle sales|admin affecté]
--  public.lead_request_samples(p_review_id, p_part_number, p_quantity,
--       p_annual_volume, p_is_standard)               -> jsonb {id, route, status}  [auth]
--  public.lead_client_view(p_dossier)                 -> jsonb sans notes internes  [auth]
--  public.lead_staff_view(p_dossier)                  -> jsonb avec notes internes  [staff affecté]
--
-- Réservé à service_role (aucun wrapper public, donc inatteignable depuis le navigateur) :
--  lead_priv.assign_staff(user, role)
--  lead_priv.record_nda_proof(dossier, template_sha, document_sha, verified_by, source)
--
-- Codes d'erreur remontés : AUTH_REQUIRED, NOT_ALLOWED, DOSSIER_NOT_FOUND,
--  REVISION_NOT_FOUND, REVIEW_NOT_FOUND, REVISION_CONFLICT:<n>, CONSENT_MISSING,
--  NDA_NOT_IN_FORCE, REVIEW_NOT_VALIDATED, BAD_HASH, EMPTY_SNAPSHOT, BAD_TIERS,
--  BAD_VERDICT, BAD_VALIDITY, TIERS_REQUIRED.
-- ============================================================================
