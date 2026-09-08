-- ============================================================================
-- Migration V1.2 — parcours Lead Magnet (co-conception, revue R&D, offre, échantillons)
--
-- Projet cible EXCLUSIF : yyobodalwtsqdyrqwkjk (standex-assistant-mvp).
-- Remplace les brouillons V1.0 (commit 48d266aa) et V1.1 (e754ec7f), qui n'ont
-- JAMAIS été appliqués. Ne pas appliquer V1.0 ni V1.1.
--
-- Défauts réels corrigés depuis V1.1 (recette PGlite/PostgreSQL jetable) :
--   1. USAGE manquant sur lead_priv pour les wrappers INVOKER -> toutes les RPC
--      échouaient ; EXECUTE par défaut de PUBLIC révoqué sur toutes les fonctions.
--   2. staff_view déléguait à client_view qui recontrôlait le propriétaire : un
--      staff réellement affecté était refusé. Projection commune après
--      autorisation distincte, et snapshots techniques présents dans les DEUX vues.
--   3. submit_revision stockait le hash fourni par le client ; il est désormais
--      recalculé côté serveur (sha256 natif) et le hash client n'est qu'un
--      contrôle d'intégrité. Snapshot et consentements réellement validés.
--   4. create_offer acceptait tiers [{}] (comparaisons NULL) ; validation stricte,
--      verrou du dossier puis relecture de la revue.
--   5. request_samples acceptait une référence arbitraire, le volume et le
--      caractère standard fournis par le client ; ces valeurs viennent maintenant
--      de la revue publiée et de la révision soumise. Routage corrigé.
--   6. Une nouvelle revue publiée sur la MÊME révision périme les offres
--      antérieures et marque les demandes d'échantillons dépassées.
--   7. Stockage : plus de policy « owner-only for all ». Sessions d'upload
--      préalables liées au dossier/révision, objets soumis immuables, lecture du
--      staff affecté, identifiants de fichiers vérifiés contre storage.objects.
--   8. record_nda_proof impose le hash du modèle ORIGINAL, un artefact signé, des
--      contreparties, une référence de preuve, un vérificateur habilité et l'heure.
--
-- Propriétés conservées : additive (les six tables sensor_test_* ne sont pas
-- touchées), schéma `lead` non exposé à l'API REST, aucun DML client direct,
-- fonctions definer isolées dans `lead_priv`, wrappers publics invoker,
-- search_path figé, rôles staff provisionnés serveur, notes internes séparées.
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
-- Correctif 1 : les wrappers publics sont INVOKER ; sans USAGE sur lead_priv,
-- toutes les RPC échouaient. USAGE seul n'ouvre AUCUNE table ni fonction :
-- chaque EXECUTE reste explicitement accordé plus bas.
grant usage on schema lead_priv to anon, authenticated;
-- `authenticated` n'obtient PAS usage sur `lead` : aucune table n'est atteignable.

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
alter table lead.staff_members add column if not exists display_name text;
alter table lead.staff_members enable row level security;

-- ----------------------------------------------------------------------------
-- 3. Tables métier
-- ----------------------------------------------------------------------------
create table if not exists lead.design_dossiers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  current_revision integer not null default 0 check (current_revision >= 0),
  nda_required boolean not null default true,
  nda_status text not null default 'requested'
    check (nda_status in ('not_required','requested','prepared','awaiting_signatures','in_force'))
);

create table if not exists lead.design_collaborators (
  dossier_id uuid not null references lead.design_dossiers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Un collaborateur lit par défaut ; l'écriture est explicite (correctif 3).
  can_submit boolean not null default false,
  primary key (dossier_id, user_id)
);
alter table lead.design_collaborators
  add column if not exists can_submit boolean not null default false;

create table if not exists lead.dossier_assignments (
  dossier_id uuid not null references lead.design_dossiers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references auth.users(id),
  primary key (dossier_id, user_id)
);
alter table lead.dossier_assignments
  add column if not exists assigned_by uuid references auth.users(id);

create table if not exists lead.design_revisions (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references lead.design_dossiers(id) on delete cascade,
  revision integer not null check (revision >= 1),
  snapshot jsonb not null,
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  client_declared_hash text,
  submitted_at timestamptz not null default now(),
  submitted_by uuid not null references auth.users(id),
  consents jsonb not null default '[]'::jsonb,
  transferred_files jsonb not null default '[]'::jsonb,
  nda_status_at_submit text not null,
  unique (dossier_id, revision),
  -- Clé composite : une revue ne peut pas emprunter la révision d'un autre dossier.
  unique (id, dossier_id)
);
alter table lead.design_revisions
  add column if not exists client_declared_hash text;

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
  -- Référence exacte fixée par la R&D (jamais par le client).
  exact_part_number text,
  designation text check (designation is null or designation in ('standard','custom')),
  -- Variante bis proposée : câble, connecteur, PCB, description libre.
  variant jsonb not null default '{}'::jsonb,
  variant_accepted_at timestamptz,
  variant_accepted_by uuid references auth.users(id),
  superseded_by uuid references lead.design_reviews(id) on delete set null,
  check (published = (published_at is not null)),
  check (verdict <> 'validated' or exact_part_number is not null),
  unique (id, dossier_id)
);
alter table lead.design_reviews add column if not exists exact_part_number text;
alter table lead.design_reviews add column if not exists designation text;
alter table lead.design_reviews add column if not exists variant jsonb not null default '{}'::jsonb;
alter table lead.design_reviews add column if not exists variant_accepted_at timestamptz;
alter table lead.design_reviews add column if not exists variant_accepted_by uuid references auth.users(id);
create index if not exists design_reviews_dossier_idx on lead.design_reviews (dossier_id, revision);

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
  -- Base retenue au moment de l'offre : référence exacte et volume soumis.
  part_number text not null,
  designation text not null check (designation in ('standard','custom')),
  annual_volume_basis integer,
  voided_at timestamptz,
  void_reason text,
  -- L'offre appartient au même dossier que la revue (correctif offre inter-projets).
  foreign key (review_id, dossier_id) references lead.design_reviews (id, dossier_id)
);
alter table lead.offers add column if not exists part_number text;
alter table lead.offers add column if not exists designation text;
alter table lead.offers add column if not exists annual_volume_basis integer;

create table if not exists lead.sample_requests (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references lead.design_dossiers(id) on delete cascade,
  review_id uuid not null references lead.design_reviews(id) on delete cascade,
  revision integer not null check (revision >= 1),
  requested_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  part_number text not null check (length(btrim(part_number)) > 0),
  designation text not null default 'standard' check (designation in ('standard','custom')),
  annual_volume_basis integer,
  quantity integer not null check (quantity > 0),
  route text not null check (route in ('distributors','standex_direct','manual_review')),
  status text not null default 'requested'
    check (status in ('requested','confirmed','shipped','received','closed','superseded')),
  feedback text,
  feedback_at timestamptz,
  feedback_revision integer,
  foreign key (review_id, dossier_id) references lead.design_reviews (id, dossier_id)
);
alter table lead.sample_requests add column if not exists designation text not null default 'standard';
alter table lead.sample_requests add column if not exists annual_volume_basis integer;
alter table lead.sample_requests add column if not exists feedback_at timestamptz;
alter table lead.sample_requests add column if not exists feedback_revision integer;
-- Révision du dossier au moment du retour (contexte), distincte de la révision testée.
alter table lead.sample_requests add column if not exists feedback_context_revision integer;
alter table lead.sample_requests add column if not exists revalidated_at timestamptz;
alter table lead.sample_requests add column if not exists revalidated_by uuid references auth.users(id);

-- Preuve NDA : écrite exclusivement après vérification humaine habilitée.
create table if not exists lead.nda_proofs (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references lead.design_dossiers(id) on delete cascade,
  template_sha256 text not null check (template_sha256 ~ '^[a-f0-9]{64}$'),
  document_sha256 text not null check (document_sha256 ~ '^[a-f0-9]{64}$'),
  signed_object_path text,
  evidence_kind text not null default 'stored_object'
    check (evidence_kind in ('stored_object','external_archive')),
  proof_reference text not null check (length(btrim(proof_reference)) > 0),
  counterparties jsonb not null,
  signed_at date not null,
  verified_at timestamptz not null,
  verified_by uuid not null references auth.users(id),
  verification_source text not null check (length(btrim(verification_source)) > 0)
);
alter table lead.nda_proofs add column if not exists signed_object_path text;
alter table lead.nda_proofs add column if not exists proof_reference text;
alter table lead.nda_proofs add column if not exists counterparties jsonb;
alter table lead.nda_proofs add column if not exists signed_at date;
alter table lead.nda_proofs add column if not exists evidence_kind text not null default 'stored_object';
alter table lead.nda_proofs alter column signed_object_path drop not null;

-- Sessions d'upload : un fichier ne peut être déposé qu'après contrôle préalable.
create table if not exists lead.upload_sessions (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references lead.design_dossiers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  path_prefix text not null unique,
  kind text not null check (kind in ('design_model','document','nda_signed')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  closed_at timestamptz,
  consent jsonb
);
alter table lead.upload_sessions add column if not exists consent jsonb;
-- Un dépôt est annoncé AVANT d'exister : empreinte, taille et type exacts du
-- fichier relu par le client, plus la révision à laquelle il se rattache.
alter table lead.upload_sessions add column if not exists expected_sha256 text;
alter table lead.upload_sessions add column if not exists expected_bytes bigint;
alter table lead.upload_sessions add column if not exists expected_mime text;
alter table lead.upload_sessions add column if not exists expected_revision integer;


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
    'nda_proofs','upload_sessions','audit_log']
  loop
    execute format('alter table lead.%I enable row level security', t);
    execute format('revoke all on lead.%I from public, anon, authenticated', t);
    execute format('grant all on lead.%I to service_role', t);
  end loop;
end $$;
grant all on lead.staff_members, lead.schema_migrations to service_role;
grant usage, select on all sequences in schema lead to service_role;

-- ----------------------------------------------------------------------------
-- 4. Constantes et helpers SECURITY DEFINER (schéma non exposé)
-- ----------------------------------------------------------------------------

-- Empreinte du modèle NDA ORIGINAL approuvé : toute preuve doit s'y rattacher.
create or replace function lead_priv.nda_template_sha256()
returns text language sql immutable
set search_path = pg_temp as
$$ select '6e25345f1e83e92630258774d27a451d65d615cdd9f41a5331dae75c4072740b'::text $$;

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

-- Staff : rôle requis ET affectation explicite. L'admin peut trier et affecter
-- mais n'obtient PAS d'accès technique global (voir staff_can_read_design).
create or replace function lead_priv.staff_can_act(_user uuid, _dossier uuid, _roles lead.staff_role[])
returns boolean language sql stable security definer
set search_path = lead, lead_priv, pg_temp as $$
  select exists (
    select 1 from lead.staff_members m
    where m.user_id = _user
      and m.role = any(_roles)
      and exists (select 1 from lead.dossier_assignments a
                  where a.dossier_id = _dossier and a.user_id = _user)
  );
$$;

-- Lecture du contenu technique : uniquement le staff AFFECTÉ, quel que soit le rôle.
create or replace function lead_priv.staff_can_read_design(_user uuid, _dossier uuid)
returns boolean language sql stable security definer
set search_path = lead, lead_priv, pg_temp as $$
  select exists (
    select 1 from lead.staff_members m
    join lead.dossier_assignments a on a.user_id = m.user_id
    where m.user_id = _user and a.dossier_id = _dossier
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

create or replace function lead_priv.client_can_submit(_user uuid, _dossier uuid)
returns boolean language sql stable security definer
set search_path = lead, lead_priv, pg_temp as $$
  select exists (
    select 1 from lead.design_dossiers d
    where d.id = _dossier
      and (d.owner_id = _user
           or exists (select 1 from lead.design_collaborators c
                      where c.dossier_id = d.id and c.user_id = _user and c.can_submit))
  );
$$;

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

-- Sérialisation canonique IDENTIQUE à celle de l'application (stableStringify) :
-- clés triées en ordre d'octets, tableaux dans l'ordre, `updatedAt` exclu.
-- `jsonb::text` de PostgreSQL n'a PAS cet ordre : sans cette fonction, le hash
-- serveur et le hash client ne pourraient jamais coïncider.
create or replace function lead_priv.canonical_json(_v jsonb)
returns text language plpgsql immutable
set search_path = pg_temp as $$
declare out text;
begin
  if _v is null then return 'null'; end if;
  case jsonb_typeof(_v)
    when 'object' then
      select coalesce(string_agg(to_jsonb(k)::text || ':' || lead_priv.canonical_json(v),
                                 ',' order by k collate "C"), '')
        into out from jsonb_each(_v) as e(k, v);
      return '{' || out || '}';
    when 'array' then
      select coalesce(string_agg(lead_priv.canonical_json(v), ',' order by ord), '')
        into out from jsonb_array_elements(_v) with ordinality as e(v, ord);
      return '[' || out || ']';
    else
      return _v::text;
  end case;
end $$;

-- Hash faisant autorité : recalculé serveur sur la forme canonique partagée.
create or replace function lead_priv.snapshot_hash(_snapshot jsonb)
returns text language sql immutable
set search_path = pg_temp as $$
  select encode(sha256(convert_to(lead_priv.canonical_json(_snapshot - 'updatedAt'), 'UTF8')), 'hex');
$$;


-- Un nombre JSON réellement exploitable : ni null, ni texte, ni NaN/Infinity.
create or replace function lead_priv.json_number(_v jsonb)
returns numeric language plpgsql immutable
set search_path = pg_temp as $$
declare t text;
begin
  if _v is null or jsonb_typeof(_v) <> 'number' then return null; end if;
  t := _v #>> '{}';
  if t is null or t ~* 'nan|inf' then return null; end if;
  return t::numeric;
exception when others then return null;
end $$;

-- Correctif racine 2 : en Postgres, NaN::numeric = NaN::numeric, donc `x <> x`
-- ne détecte JAMAIS un NaN. On teste la représentation textuelle.
create or replace function lead_priv.finite_num(_v numeric)
returns boolean language sql immutable
set search_path = pg_temp as $$
  select _v is not null and _v::text !~* '(nan|inf)';
$$;

-- Horodatage réellement analysable, ni futur ni absurde.
create or replace function lead_priv.parse_ts(_t text)
returns timestamptz language plpgsql immutable
set search_path = pg_temp as $$
begin
  return _t::timestamptz;
exception when others then return null;
end $$;

-- Correctif racine 1 : forme RÉELLE de l'application,
-- business.annualVolume = {kind:'known', sensorsPerYear:N} | {kind:'unknown'}.
create or replace function lead_priv.annual_volume(_snapshot jsonb)
returns integer language plpgsql immutable
set search_path = pg_temp as $$
declare v jsonb; n numeric;
begin
  v := _snapshot #> '{business,annualVolume}';
  if v is null or jsonb_typeof(v) <> 'object' then return null; end if;
  if v->>'kind' is distinct from 'known' then return null; end if;
  n := lead_priv.json_number(v->'sensorsPerYear');
  -- Entier sûr, non négatif, jamais arrondi.
  if n is null or n < 0 or n <> trunc(n) or n > 2147483647 then return null; end if;
  return n::integer;
end $$;

-- Discriminant valide : `known` avec un entier sûr, ou `unknown`.
create or replace function lead_priv.annual_volume_valid(_snapshot jsonb)
returns boolean language sql immutable
set search_path = pg_temp as $$
  select case
    when jsonb_typeof(_snapshot #> '{business,annualVolume}') <> 'object' then false
    when (_snapshot #>> '{business,annualVolume,kind}') = 'unknown' then true
    when (_snapshot #>> '{business,annualVolume,kind}') = 'known'
      then lead_priv.annual_volume(_snapshot) is not null
    else false end;
$$;

create or replace function lead_priv.assign_staff(_user uuid, _role lead.staff_role)
returns void language sql security definer
set search_path = lead, lead_priv, pg_temp as $$
  insert into lead.staff_members (user_id, role, granted_by)
  values (_user, _role, auth.uid())
  on conflict (user_id) do update set role = excluded.role;
$$;

-- ----------------------------------------------------------------------------
-- 4bis. Preuve NDA (correctif 8)
-- ----------------------------------------------------------------------------
drop function if exists lead_priv.record_nda_proof(uuid, text, text, text, text, jsonb, date, uuid, text);
drop function if exists lead_priv.admin_record_nda_proof(uuid, text, text, text, text, jsonb, date, text);
drop function if exists public.lead_admin_record_nda_proof(uuid, text, text, text, text, jsonb, date, text);
create or replace function lead_priv.record_nda_proof(
  _dossier uuid, _template_sha text, _document_sha text, _signed_object_path text,
  _proof_reference text, _counterparties jsonb, _signed_at date,
  _verified_by uuid, _source text, _evidence_kind text)
returns uuid language plpgsql security definer
set search_path = lead, lead_priv, pg_temp as $$
declare pid uuid; d lead.design_dossiers%rowtype;
begin
  select * into d from lead.design_dossiers where id = _dossier for update;
  if not found then raise exception 'DOSSIER_NOT_FOUND' using errcode = '42501'; end if;
  -- Le document rempli DOIT dériver du modèle original approuvé.
  if lower(coalesce(_template_sha,'')) <> lead_priv.nda_template_sha256() then
    raise exception 'NDA_TEMPLATE_MISMATCH' using errcode = '22023';
  end if;
  if lower(coalesce(_document_sha,'')) !~ '^[a-f0-9]{64}$'
     or lower(_document_sha) = lead_priv.nda_template_sha256() then
    -- Un document « signé » identique au modèle vierge n'est pas une signature.
    raise exception 'NDA_SIGNED_DOCUMENT_INVALID' using errcode = '22023';
  end if;
  if coalesce(btrim(_proof_reference),'') = '' or coalesce(btrim(_source),'') = '' then
    raise exception 'NDA_PROOF_INCOMPLETE' using errcode = '22023';
  end if;
  if coalesce(_evidence_kind,'') not in ('stored_object','external_archive') then
    raise exception 'NDA_EVIDENCE_KIND_INVALID' using errcode = '22023';
  end if;
  -- Correctif racine 7 : soit l'artefact signé existe RÉELLEMENT dans le
  -- stockage privé de ce dossier, soit la preuve externe est déclarée comme
  -- telle — jamais un chemin quelconque déguisé en fichier stocké.
  if _evidence_kind = 'stored_object' then
    if coalesce(btrim(_signed_object_path),'') = '' then
      raise exception 'NDA_PROOF_INCOMPLETE' using errcode = '22023';
    end if;
    if not exists (
      select 1 from storage.objects o
      join lead.upload_sessions us on o.name like us.path_prefix || '/%'
      where o.bucket_id = 'lead-design-files' and o.name = btrim(_signed_object_path)
        and us.dossier_id = _dossier and us.kind = 'nda_signed') then
      raise exception 'NDA_SIGNED_FILE_NOT_FOUND' using errcode = '42501';
    end if;
  elsif coalesce(btrim(_signed_object_path),'') <> '' then
    raise exception 'NDA_EVIDENCE_KIND_INVALID' using errcode = '22023';
  end if;
  if jsonb_typeof(_counterparties) <> 'array' or jsonb_array_length(_counterparties) < 2
     or exists (select 1 from jsonb_array_elements(_counterparties) c
                where jsonb_typeof(c) <> 'object'
                   or coalesce(btrim(c->>'party'),'') = '') then
    raise exception 'NDA_COUNTERPARTIES_REQUIRED' using errcode = '22023';
  end if;
  if _signed_at is null or _signed_at > current_date then
    raise exception 'NDA_SIGNED_AT_INVALID' using errcode = '22023';
  end if;
  if _verified_by is null then
    raise exception 'NDA_VERIFIER_REQUIRED' using errcode = '42501';
  end if;
  insert into lead.nda_proofs (dossier_id, template_sha256, document_sha256, signed_object_path,
                               evidence_kind, proof_reference, counterparties, signed_at,
                               verified_at, verified_by, verification_source)
  values (_dossier, lower(_template_sha), lower(_document_sha),
          nullif(btrim(coalesce(_signed_object_path,'')), ''), _evidence_kind,
          btrim(_proof_reference), _counterparties, _signed_at, now(), _verified_by, _source)
  returning id into pid;
  update lead.design_dossiers set nda_status = 'in_force', updated_at = now() where id = _dossier;
  insert into lead.audit_log (actor, action, dossier_id, detail)
  values (_verified_by, 'nda_proof_recorded', _dossier,
          jsonb_build_object('source', _source, 'proof_reference', _proof_reference));
  return pid;
end $$;

-- Écran habilité : un admin Standex enregistre la preuve vérifiée.
create or replace function lead_priv.admin_record_nda_proof(
  _dossier uuid, _template_sha text, _document_sha text, _signed_object_path text,
  _proof_reference text, _counterparties jsonb, _signed_at date, _source text,
  _evidence_kind text)
returns uuid language plpgsql security definer
set search_path = lead, lead_priv, pg_temp as $$
declare u uuid := lead_priv.require_user();
begin
  if lead_priv.role_of(u) is distinct from 'admin' then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  return lead_priv.record_nda_proof(_dossier, _template_sha, _document_sha, _signed_object_path,
                                    _proof_reference, _counterparties, _signed_at, u, _source,
                                    _evidence_kind);
end $$;

create or replace function public.lead_admin_record_nda_proof(
  p_dossier uuid, p_template_sha text, p_document_sha text, p_signed_object_path text,
  p_proof_reference text, p_counterparties jsonb, p_signed_at date, p_source text,
  p_evidence_kind text default 'stored_object')
returns uuid language sql security invoker
set search_path = public, lead_priv, pg_temp as $$
  select lead_priv.admin_record_nda_proof(p_dossier, p_template_sha, p_document_sha,
    p_signed_object_path, p_proof_reference, p_counterparties, p_signed_at, p_source,
    p_evidence_kind);
$$;

-- ----------------------------------------------------------------------------
-- 5. RPC publiques (wrappers SECURITY INVOKER)
-- ----------------------------------------------------------------------------

-- 5.1 Sonde non destructive.
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

-- 5.2 Capacités de l'utilisateur courant.
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

-- 5.3 Création d'un dossier ; le NDA reste facultatif si le client ne le demande pas.
create or replace function lead_priv.create_dossier(_title text, _nda_required boolean)
returns uuid language plpgsql security definer
set search_path = lead, lead_priv, pg_temp as $$
declare u uuid := lead_priv.require_user(); did uuid; req boolean := coalesce(_nda_required, true);
begin
  -- Aucun titre potentiellement confidentiel avant preuve NDA vérifiée :
  -- une coquille générique est créée, renommable après vérification.
  insert into lead.design_dossiers (owner_id, title, nda_required, nda_status)
  values (u,
          case when req then 'Projet en préparation (titre masqué avant accord de confidentialité)'
               else btrim(_title) end,
          req, case when req then 'requested' else 'not_required' end)
  returning id into did;
  insert into lead.audit_log (actor, action, dossier_id, detail)
  values (u, 'dossier_created', did, jsonb_build_object('nda_required', req));
  return did;
end $$;

create or replace function public.lead_create_dossier(p_title text, p_nda_required boolean default true)
returns uuid language sql security invoker
set search_path = public, lead_priv, pg_temp as $$
  select lead_priv.create_dossier(p_title, p_nda_required);
$$;

-- Renommage : possible seulement quand le transfert confidentiel est autorisé.
create or replace function lead_priv.set_dossier_title(_dossier uuid, _title text)
returns void language plpgsql security definer
set search_path = lead, lead_priv, pg_temp as $$
declare u uuid := lead_priv.require_user();
begin
  if not lead_priv.client_can_submit(u, _dossier) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if not lead_priv.nda_allows_transfer(_dossier) then
    raise exception 'NDA_NOT_IN_FORCE' using errcode = '42501';
  end if;
  if coalesce(btrim(_title),'') = '' then
    raise exception 'BAD_TITLE' using errcode = '22023';
  end if;
  update lead.design_dossiers set title = btrim(_title), updated_at = now() where id = _dossier;
end $$;

create or replace function public.lead_set_dossier_title(p_dossier uuid, p_title text)
returns void language sql security invoker
set search_path = public, lead_priv, pg_temp as $$
  select lead_priv.set_dossier_title(p_dossier, p_title);
$$;

-- 5.3bis Liste des dossiers du client (reprise) et boîte de réception Standex.
create or replace function lead_priv.my_dossiers()
returns jsonb language plpgsql stable security definer
set search_path = lead, lead_priv, pg_temp as $$
declare u uuid := lead_priv.require_user();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', d.id, 'title', d.title, 'current_revision', d.current_revision,
      'nda_required', d.nda_required, 'nda_status', d.nda_status,
      'updated_at', d.updated_at, 'role', case when d.owner_id = u then 'owner' else 'collaborator' end,
      'published_reviews', (select count(*) from lead.design_reviews rv
                            where rv.dossier_id = d.id and rv.published),
      'active_offers', (select count(*) from lead.offers o
                        where o.dossier_id = d.id and o.voided_at is null
                          and o.valid_until >= current_date))
      order by d.updated_at desc)
    from lead.design_dossiers d
    where d.owner_id = u
       or exists (select 1 from lead.design_collaborators c
                  where c.dossier_id = d.id and c.user_id = u)), '[]'::jsonb);
end $$;

create or replace function public.lead_my_dossiers()
returns jsonb language sql stable security invoker
set search_path = public, lead_priv, pg_temp as $$ select lead_priv.my_dossiers(); $$;

-- Boîte de réception Standex : dossiers affectés, plus le tri de métadonnées
-- non confidentielles pour l'admin (aucun contenu technique).
create or replace function lead_priv.staff_inbox()
returns jsonb language plpgsql stable security definer
set search_path = lead, lead_priv, pg_temp as $$
declare u uuid := lead_priv.require_user(); r lead.staff_role := lead_priv.role_of(u);
begin
  if r is null then raise exception 'NOT_ALLOWED' using errcode = '42501'; end if;
  return jsonb_build_object(
    'role', r,
    'assigned', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id, 'title', d.title, 'current_revision', d.current_revision,
        'nda_status', d.nda_status, 'updated_at', d.updated_at,
        'awaiting_review', not exists (select 1 from lead.design_reviews rv
                                       where rv.dossier_id = d.id
                                         and rv.revision = d.current_revision and rv.published))
        order by d.updated_at desc)
      from lead.design_dossiers d
      join lead.dossier_assignments a on a.dossier_id = d.id and a.user_id = u), '[]'::jsonb),
    -- Triage admin : métadonnées seulement, jamais les snapshots.
    'triage', case when r = 'admin' then coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id, 'title', d.title, 'current_revision', d.current_revision,
        'nda_required', d.nda_required, 'nda_status', d.nda_status,
        'updated_at', d.updated_at,
        'assignees', coalesce((select jsonb_agg(jsonb_build_object(
                                 'user_id', a.user_id, 'role', m.role,
                                 'display_name', coalesce(m.display_name, au.email)))
                               from lead.dossier_assignments a
                               join lead.staff_members m on m.user_id = a.user_id
                               join auth.users au on au.id = a.user_id
                               where a.dossier_id = d.id), '[]'::jsonb))
        order by d.updated_at desc)
      from lead.design_dossiers d), '[]'::jsonb) else '[]'::jsonb end,
    -- Correctif racine 8 : l'admin choisit des personnes, pas des identifiants.
    'staff_directory', case when r = 'admin' then coalesce((
      select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'role', m.role,
        'email', au.email, 'display_name', coalesce(m.display_name, au.email)))
      from lead.staff_members m join auth.users au on au.id = m.user_id), '[]'::jsonb)
      else '[]'::jsonb end);
end $$;

create or replace function public.lead_staff_inbox()
returns jsonb language sql stable security invoker
set search_path = public, lead_priv, pg_temp as $$ select lead_priv.staff_inbox(); $$;

-- Affectation d'un dossier à un membre du staff : admin uniquement.
create or replace function lead_priv.assign_dossier(_dossier uuid, _user uuid)
returns void language plpgsql security definer
set search_path = lead, lead_priv, pg_temp as $$
declare u uuid := lead_priv.require_user();
begin
  if lead_priv.role_of(u) is distinct from 'admin' then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if lead_priv.role_of(_user) is null then
    raise exception 'NOT_STAFF' using errcode = '42501';
  end if;
  insert into lead.dossier_assignments (dossier_id, user_id, assigned_by)
  values (_dossier, _user, u)
  on conflict (dossier_id, user_id) do nothing;
  insert into lead.audit_log (actor, action, dossier_id, detail)
  values (u, 'dossier_assigned', _dossier, jsonb_build_object('user_id', _user));
end $$;

create or replace function public.lead_assign_dossier(p_dossier uuid, p_user uuid)
returns void language sql security invoker
set search_path = public, lead_priv, pg_temp as $$
  select lead_priv.assign_dossier(p_dossier, p_user);
$$;

-- 5.3ter Session d'upload : contrôle préalable AVANT tout dépôt de fichier.
drop function if exists lead_priv.open_upload_session(uuid, text);
drop function if exists public.lead_open_upload_session(uuid, text);
create or replace function lead_priv.open_upload_session(_dossier uuid, _kind text, _consent jsonb)
returns jsonb language plpgsql security definer
set search_path = lead, lead_priv, pg_temp as $$
declare
  u uuid := lead_priv.require_user();
  prefix text; sid uuid; d lead.design_dossiers%rowtype;
  digest text; bytes numeric; mime text; rev numeric; expected_rev integer;
begin
  select * into d from lead.design_dossiers where id = _dossier for update;
  if not found then raise exception 'DOSSIER_NOT_FOUND' using errcode = '42501'; end if;
  if _kind not in ('design_model','document','nda_signed') then
    raise exception 'BAD_KIND' using errcode = '22023';
  end if;
  -- Le client dépose ses fichiers ; pour le SEUL document NDA signé, un admin
  -- Standex AFFECTÉ peut aussi déposer la pièce vérifiée du dossier client.
  if not lead_priv.client_can_submit(u, _dossier)
     and not (_kind = 'nda_signed'
              and lead_priv.staff_can_act(u, _dossier, array['admin']::lead.staff_role[])) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  -- Un fichier technique n'est jamais déposé avant que le NDA autorise le transfert.
  if _kind <> 'nda_signed' and not lead_priv.nda_allows_transfer(_dossier) then
    raise exception 'NDA_NOT_IN_FORCE' using errcode = '42501';
  end if;
  -- Correctif racine 4 : préflight RÉEL. Le consentement est daté, lié à CE
  -- dossier, à la révision visée, et à l'empreinte EXACTE du fichier relu.
  -- Aucun champ n'est « optionnel » : absent = refusé (IS DISTINCT FROM).
  expected_rev := case when _kind = 'nda_signed' then d.current_revision
                       else d.current_revision + 1 end;
  digest := lower(coalesce(_consent->>'file_sha256',''));
  bytes  := lead_priv.json_number(_consent->'file_bytes');
  mime   := btrim(coalesce(_consent->>'file_mime',''));
  rev    := lead_priv.json_number(_consent->'revision');
  if _consent is null or jsonb_typeof(_consent) <> 'object'
     or _consent->>'kind' is distinct from 'supabase_files'
     or coalesce(btrim(_consent->>'statement'),'') = ''
     or coalesce(btrim(_consent->>'content_ref'),'') = ''
     or _consent->>'dossier_id' is distinct from _dossier::text
     or rev is null or rev <> expected_rev
     or digest !~ '^[a-f0-9]{64}$'
     or bytes is null or bytes <= 0 or bytes <> trunc(bytes) or bytes > 31457280
     or mime = '' or mime !~ '^[a-z0-9.+-]+/[a-z0-9.+-]+$'
     or lead_priv.parse_ts(_consent->>'accepted_at') is null
     or lead_priv.parse_ts(_consent->>'accepted_at') > now() + interval '5 minutes'
     or lead_priv.parse_ts(_consent->>'accepted_at') < now() - interval '1 day' then
    raise exception 'CONSENT_INCOMPLETE' using errcode = '42501';
  end if;
  -- Pas de dépôts illimités sous une coquille générique.
  if (select count(*) from lead.upload_sessions s
       where s.dossier_id = _dossier and s.user_id = u
         and s.closed_at is null and s.expires_at > now()) >= 5 then
    raise exception 'TOO_MANY_UPLOAD_SESSIONS' using errcode = '42501';
  end if;
  prefix := _dossier::text || '/' || u::text || '/' || gen_random_uuid()::text;
  insert into lead.upload_sessions (dossier_id, user_id, path_prefix, kind, expires_at, consent,
                                    expected_sha256, expected_bytes, expected_mime, expected_revision)
  values (_dossier, u, prefix, _kind, now() + interval '2 hours', _consent,
          digest, bytes::bigint, mime, expected_rev)
  returning id into sid;
  insert into lead.audit_log (actor, action, dossier_id, detail)
  values (u, 'upload_session_opened', _dossier,
          jsonb_build_object('kind', _kind, 'sha256', digest, 'revision', expected_rev));
  return jsonb_build_object('session_id', sid, 'bucket', 'lead-design-files',
                            'path_prefix', prefix, 'expires_at', now() + interval '2 hours',
                            'expected_sha256', digest, 'expected_revision', expected_rev);
end $$;

create or replace function public.lead_open_upload_session(
  p_dossier uuid, p_kind text, p_consent jsonb default null)
returns jsonb language sql security invoker
set search_path = public, lead_priv, pg_temp as $$
  select lead_priv.open_upload_session(p_dossier, p_kind, p_consent);
$$;

-- 5.4 Soumission d'une révision (correctif 3).
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
  server_hash text;
  files jsonb := coalesce(_transferred_files, '[]'::jsonb);
  consent jsonb;
  bad integer;
begin
  select * into d from lead.design_dossiers where id = _dossier for update;
  if not found then raise exception 'DOSSIER_NOT_FOUND' using errcode = '42501'; end if;
  if not lead_priv.client_can_submit(u, _dossier) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if d.current_revision <> coalesce(_expected_revision, -1) then
    raise exception 'REVISION_CONFLICT:%', d.current_revision using errcode = '40001';
  end if;
  -- Snapshot réellement exploitable : objet non vide, pas un JSON null déguisé.
  if _snapshot is null or jsonb_typeof(_snapshot) <> 'object'
     or jsonb_strip_nulls(_snapshot) = '{}'::jsonb then
    raise exception 'EMPTY_SNAPSHOT' using errcode = '22023';
  end if;
  -- Correctif racine 3 : un JSON arbitraire ne devient JAMAIS un dossier soumis.
  -- La forme réelle produite par l'application est exigée (sans imposer que
  -- toutes les inconnues techniques soient résolues).
  if coalesce(btrim(_snapshot->>'id'),'') = ''
     or coalesce(btrim(_snapshot->>'title'),'') = ''
     or jsonb_typeof(_snapshot->'requirements') <> 'array'
     or jsonb_array_length(_snapshot->'requirements') = 0
     or jsonb_typeof(_snapshot->'business') <> 'object'
     or jsonb_typeof(_snapshot->'mounting') <> 'object'
     or jsonb_typeof(_snapshot->'envelope') <> 'object'
     or jsonb_typeof(_snapshot->'cabling') <> 'object'
     or jsonb_typeof(_snapshot->'termination') <> 'object'
     or jsonb_typeof(_snapshot->'attachments') <> 'array'
     or _snapshot ? 'internalNotes' then
    raise exception 'BAD_SNAPSHOT_SHAPE' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(_snapshot->'requirements') r
             where jsonb_typeof(r) <> 'object'
                or coalesce(btrim(r->>'key'),'') = ''
                or (r->>'state') not in ('confirmed','hypothesis','unknown')
                or (r->>'source') not in ('user','import','assistant','rnd')) then
    raise exception 'BAD_SNAPSHOT_SHAPE' using errcode = '22023';
  end if;
  -- But technique réellement renseigné : sans objectif de détection, rien à réviser.
  if not exists (select 1 from jsonb_array_elements(_snapshot->'requirements') r
                 where r->>'key' = 'detection_goal'
                   and coalesce(btrim(r->>'value'),'') <> ''
                   and (r->>'state') in ('confirmed','hypothesis')) then
    raise exception 'DETECTION_GOAL_REQUIRED' using errcode = '22023';
  end if;
  -- Contact obligatoire : sans lui, aucun retour Standex n'est possible.
  if coalesce(btrim(_snapshot #>> '{business,contactEmail}'),'')
     !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'CONTACT_REQUIRED' using errcode = '22023';
  end if;
  if (_snapshot #>> '{business,projectPhase}') not in
       ('exploration','design','prototype','industrialisation','unknown') then
    raise exception 'BAD_SNAPSHOT_SHAPE' using errcode = '22023';
  end if;
  -- Volume annuel : discriminant réel exigé, jamais un zéro implicite.
  if not lead_priv.annual_volume_valid(_snapshot) then
    raise exception 'BAD_ANNUAL_VOLUME' using errcode = '22023';
  end if;
  -- Correctif racine 4 : consentement explicite, daté, et lié à CE dossier,
  -- à la révision soumise et au contenu relu.
  if jsonb_typeof(_consents) <> 'array' then
    raise exception 'CONSENT_INCOMPLETE' using errcode = '42501';
  end if;
  select c into consent from jsonb_array_elements(_consents) c
   where c->>'kind' = 'supabase_dossier' limit 1;
  if consent is null
     or coalesce(btrim(consent->>'statement'), '') = ''
     or coalesce(btrim(consent->>'content_ref'), '') = ''
     or lead_priv.parse_ts(consent->>'accepted_at') is null
     or lead_priv.parse_ts(consent->>'accepted_at') > now() + interval '5 minutes'
     or lead_priv.parse_ts(consent->>'accepted_at') < now() - interval '30 days'
     or (consent ? 'dossier_id' and consent->>'dossier_id' is distinct from _dossier::text)
     or (consent ? 'revision'
         and consent->>'revision' is distinct from (d.current_revision + 1)::text)
     or (lower(coalesce(consent->>'content_ref','')) ~ '^[a-f0-9]{64}$'
         and lower(consent->>'content_ref') is distinct from lower(coalesce(_content_hash,''))) then
    raise exception 'CONSENT_INCOMPLETE' using errcode = '42501';
  end if;
  if not lead_priv.nda_allows_transfer(_dossier) then
    raise exception 'NDA_NOT_IN_FORCE' using errcode = '42501';
  end if;
  -- Aucun identifiant de fichier arbitraire : l'objet doit exister et provenir
  -- d'une session d'upload ouverte pour CE dossier par CET utilisateur.
  if jsonb_typeof(files) <> 'array' then
    raise exception 'BAD_FILES' using errcode = '22023';
  end if;
  select count(*) into bad from jsonb_array_elements(files) f
   where coalesce(btrim(f->>'path'), '') = ''
      or not exists (
        select 1 from storage.objects o
        join lead.upload_sessions s on o.name like s.path_prefix || '/%'
        where o.bucket_id = 'lead-design-files'
          and o.name = f->>'path'
          and s.dossier_id = _dossier
          and s.user_id = u);
  if bad > 0 then raise exception 'FILE_NOT_TRANSFERRED' using errcode = '42501'; end if;

  server_hash := lead_priv.snapshot_hash(_snapshot);
  next_rev := d.current_revision + 1;
  insert into lead.design_revisions (dossier_id, revision, snapshot, content_hash,
    client_declared_hash, submitted_by, consents, transferred_files, nda_status_at_submit)
  values (_dossier, next_rev, _snapshot, server_hash, lower(nullif(_content_hash,'')), u,
          _consents, files, d.nda_status)
  returning id into rid;

  update lead.design_dossiers
     set current_revision = next_rev, updated_at = now()
   where id = _dossier;

  update lead.offers set voided_at = now(),
         void_reason = 'Nouvelle révision soumise : offre périmée.'
   where dossier_id = _dossier and voided_at is null;

  -- Une demande d'échantillons porte sur une conception précise : elle est
  -- dépassée dès qu'une nouvelle révision est soumise.
  update lead.sample_requests set status = 'superseded'
   where dossier_id = _dossier and revision < next_rev
     and status not in ('closed','superseded');

  insert into lead.audit_log (actor, action, dossier_id, detail)
  values (u, 'revision_submitted', _dossier,
          jsonb_build_object('revision', next_rev, 'hash', server_hash,
                             'client_hash_matches', lower(nullif(_content_hash,'')) is not distinct from server_hash));

  return jsonb_build_object('revision_id', rid, 'revision', next_rev,
                            'submitted_at', now(), 'content_hash', server_hash,
                            'client_hash_matches',
                            lower(nullif(_content_hash,'')) is not distinct from server_hash);
end $$;

create or replace function public.lead_submit_revision(
  p_dossier uuid, p_expected_revision integer, p_snapshot jsonb,
  p_content_hash text, p_consents jsonb, p_transferred_files jsonb default '[]'::jsonb)
returns jsonb language sql security invoker
set search_path = public, lead_priv, pg_temp as $$
  select lead_priv.submit_revision(p_dossier, p_expected_revision, p_snapshot,
                                   p_content_hash, p_consents, p_transferred_files);
$$;

-- 5.5 Publication d'un retour R&D (correctif 6).
create or replace function lead_priv.publish_review(
  _revision_id uuid, _scope text, _conditions text, _verdict text,
  _client_message text, _internal_note text,
  _exact_part_number text, _designation text, _variant jsonb)
returns uuid language plpgsql security definer
set search_path = lead, lead_priv, pg_temp as $$
declare
  u uuid := lead_priv.require_user();
  r lead.design_revisions%rowtype;
  d lead.design_dossiers%rowtype;
  new_id uuid;
  mpn text := nullif(btrim(coalesce(_exact_part_number,'')), '');
begin
  select * into r from lead.design_revisions where id = _revision_id;
  if not found then raise exception 'REVISION_NOT_FOUND' using errcode = '42501'; end if;
  select * into d from lead.design_dossiers where id = r.dossier_id for update;
  if not lead_priv.staff_can_act(u, d.id, array['rnd','admin']::lead.staff_role[]) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if r.revision <> d.current_revision then
    raise exception 'REVISION_CONFLICT:%', d.current_revision using errcode = '40001';
  end if;
  if _verdict not in ('validated','variant_proposed','more_info') then
    raise exception 'BAD_VERDICT' using errcode = '22023';
  end if;
  -- Une validation sans référence exacte n'a aucune valeur commerciale.
  if _verdict = 'validated' and mpn is null then
    raise exception 'EXACT_PART_NUMBER_REQUIRED' using errcode = '22023';
  end if;
  if mpn is not null and coalesce(_designation,'') not in ('standard','custom') then
    raise exception 'DESIGNATION_REQUIRED' using errcode = '22023';
  end if;

  insert into lead.design_reviews (dossier_id, revision_id, revision, author_id, scope,
    conditions, verdict, published, published_at, client_message,
    exact_part_number, designation, variant)
  values (d.id, r.id, r.revision, u, coalesce(_scope,''), coalesce(_conditions,''),
          _verdict, true, now(), _client_message, mpn,
          case when mpn is null then null else _designation end,
          coalesce(_variant, '{}'::jsonb))
  returning id into new_id;

  update lead.design_reviews set superseded_by = new_id
   where dossier_id = d.id and id <> new_id and superseded_by is null;

  -- Correctif 6 : toute revue publiée plus récente périme les offres antérieures,
  -- y compris sur la MÊME révision, et marque les échantillons dépassés.
  update lead.offers set voided_at = now(),
         void_reason = 'Nouveau retour R&D publié : offre à refaire.'
   where dossier_id = d.id and review_id <> new_id and voided_at is null;
  update lead.sample_requests set status = 'superseded'
   where dossier_id = d.id and review_id <> new_id
     and status in ('requested','confirmed')
     and (_verdict <> 'validated' or mpn is distinct from part_number);

  if _internal_note is not null and btrim(_internal_note) <> '' then
    insert into lead.internal_notes (dossier_id, review_id, author_id, body)
    values (d.id, new_id, u, _internal_note);
  end if;

  insert into lead.audit_log (actor, action, dossier_id, detail)
  values (u, 'review_published', d.id,
          jsonb_build_object('revision', r.revision, 'verdict', _verdict, 'mpn', mpn));
  return new_id;
end $$;

create or replace function public.lead_publish_review(
  p_revision_id uuid, p_scope text, p_conditions text, p_verdict text,
  p_client_message text default null, p_internal_note text default null,
  p_exact_part_number text default null, p_designation text default null,
  p_variant jsonb default '{}'::jsonb)
returns uuid language sql security invoker
set search_path = public, lead_priv, pg_temp as $$
  select lead_priv.publish_review(p_revision_id, p_scope, p_conditions, p_verdict,
                                  p_client_message, p_internal_note,
                                  p_exact_part_number, p_designation, p_variant);
$$;

-- Note interne seule (jamais renvoyée au client).
create or replace function lead_priv.add_internal_note(_dossier uuid, _body text)
returns uuid language plpgsql security definer
set search_path = lead, lead_priv, pg_temp as $$
declare u uuid := lead_priv.require_user(); nid uuid;
begin
  if not lead_priv.staff_can_read_design(u, _dossier) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if coalesce(btrim(_body),'') = '' then raise exception 'EMPTY_NOTE' using errcode = '22023'; end if;
  insert into lead.internal_notes (dossier_id, author_id, body)
  values (_dossier, u, _body) returning id into nid;
  return nid;
end $$;

create or replace function public.lead_add_internal_note(p_dossier uuid, p_body text)
returns uuid language sql security invoker
set search_path = public, lead_priv, pg_temp as $$
  select lead_priv.add_internal_note(p_dossier, p_body);
$$;

-- Le client accepte la variante proposée : elle alimente la prochaine révision.
create or replace function lead_priv.accept_variant(_review_id uuid)
returns jsonb language plpgsql security definer
set search_path = lead, lead_priv, pg_temp as $$
declare u uuid := lead_priv.require_user(); rv lead.design_reviews%rowtype;
        d lead.design_dossiers%rowtype;
begin
  select * into rv from lead.design_reviews where id = _review_id;
  if not found then raise exception 'REVIEW_NOT_FOUND' using errcode = '42501'; end if;
  -- Correctif racine 5 : verrou du dossier PUIS relecture, pour ne jamais
  -- accepter une variante déjà remplacée ou portant sur une révision dépassée.
  select * into d from lead.design_dossiers where id = rv.dossier_id for update;
  select * into rv from lead.design_reviews where id = _review_id;
  if not lead_priv.client_can_submit(u, rv.dossier_id) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if not rv.published or rv.verdict <> 'variant_proposed' then
    raise exception 'NO_VARIANT_TO_ACCEPT' using errcode = '42501';
  end if;
  if rv.superseded_by is not null or rv.revision <> d.current_revision then
    raise exception 'STALE_VARIANT' using errcode = '40001';
  end if;
  update lead.design_reviews
     set variant_accepted_at = now(), variant_accepted_by = u
   where id = _review_id and variant_accepted_at is null;
  insert into lead.audit_log (actor, action, dossier_id, detail)
  values (u, 'variant_accepted', rv.dossier_id, jsonb_build_object('review_id', _review_id));
  -- La variante n'est pas appliquée d'office : elle est reprise dans la prochaine soumission.
  return jsonb_build_object('review_id', rv.id, 'variant', rv.variant,
                            'next_revision', rv.revision + 1);
end $$;

create or replace function public.lead_accept_variant(p_review_id uuid)
returns jsonb language sql security invoker
set search_path = public, lead_priv, pg_temp as $$
  select lead_priv.accept_variant(p_review_id);
$$;

-- 5.6 Offre (correctif 4).
create or replace function lead_priv.create_offer(
  _review_id uuid, _currency text, _tiers jsonb, _moq integer,
  _nre numeric, _incoterm text, _lead_time_weeks integer, _valid_until date)
returns uuid language plpgsql security definer
set search_path = lead, lead_priv, pg_temp as $$
declare
  u uuid := lead_priv.require_user();
  rv lead.design_reviews%rowtype;
  d lead.design_dossiers%rowtype;
  rev lead.design_revisions%rowtype;
  oid uuid;
  bad integer;
  qty_count integer;
  volume integer;
begin
  select dossier_id into d.id from lead.design_reviews where id = _review_id;
  if d.id is null then raise exception 'REVIEW_NOT_FOUND' using errcode = '42501'; end if;
  -- Verrou du dossier PUIS relecture de la revue : une supersession concurrente
  -- ne peut pas se glisser entre le contrôle et l'insertion.
  select * into d from lead.design_dossiers where id = d.id for update;
  select * into rv from lead.design_reviews where id = _review_id;
  if not lead_priv.staff_can_act(u, d.id, array['sales','admin']::lead.staff_role[]) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if rv.verdict <> 'validated' or rv.superseded_by is not null or not rv.published then
    raise exception 'REVIEW_NOT_VALIDATED' using errcode = '42501';
  end if;
  if rv.revision <> d.current_revision then
    raise exception 'REVISION_CONFLICT:%', d.current_revision using errcode = '40001';
  end if;
  if rv.exact_part_number is null or rv.designation is null then
    raise exception 'EXACT_PART_NUMBER_REQUIRED' using errcode = '22023';
  end if;
  if coalesce(_currency,'') !~ '^[A-Za-z]{3}$' then
    raise exception 'BAD_CURRENCY' using errcode = '22023';
  end if;
  if _moq is null or _moq <= 0 then raise exception 'BAD_MOQ' using errcode = '22023'; end if;
  -- Correctif racine 2 : NaN et ±Infini sont refusés explicitement.
  if _nre is not null and (not lead_priv.finite_num(_nre) or _nre < 0
                           or _nre > 100000000) then
    raise exception 'BAD_NRE' using errcode = '22023';
  end if;
  if _lead_time_weeks is not null and (_lead_time_weeks < 0 or _lead_time_weeks > 520) then
    raise exception 'BAD_LEAD_TIME' using errcode = '22023';
  end if;
  if _moq > 100000000 then raise exception 'BAD_MOQ' using errcode = '22023'; end if;
  if coalesce(btrim(_incoterm),'') = '' then
    raise exception 'BAD_INCOTERM' using errcode = '22023';
  end if;
  if jsonb_typeof(_tiers) <> 'array' or jsonb_array_length(_tiers) = 0 then
    raise exception 'TIERS_REQUIRED' using errcode = '22023';
  end if;
  -- Chaque palier : quantité entière > 0 et prix fini > 0, jamais NULL ni texte.
  select count(*) into bad from jsonb_array_elements(_tiers) t
   where jsonb_typeof(t) <> 'object'
      or lead_priv.json_number(t->'quantity') is null
      or lead_priv.json_number(t->'unit_price') is null
      or lead_priv.json_number(t->'quantity') <= 0
      or lead_priv.json_number(t->'quantity') <> trunc(lead_priv.json_number(t->'quantity'))
      or lead_priv.json_number(t->'unit_price') <= 0;
  if bad > 0 then raise exception 'BAD_TIERS' using errcode = '22023'; end if;
  -- Paliers contradictoires : quantités en double ou prix qui remonte avec le volume.
  select count(distinct lead_priv.json_number(t->'quantity')), count(*)
    into qty_count, bad from jsonb_array_elements(_tiers) t;
  if qty_count <> bad then raise exception 'CONTRADICTORY_TIERS' using errcode = '22023'; end if;
  if exists (
    select 1 from jsonb_array_elements(_tiers) a, jsonb_array_elements(_tiers) b
    where lead_priv.json_number(a->'quantity') < lead_priv.json_number(b->'quantity')
      and lead_priv.json_number(a->'unit_price') < lead_priv.json_number(b->'unit_price')) then
    raise exception 'CONTRADICTORY_TIERS' using errcode = '22023';
  end if;
  if _valid_until is null or _valid_until <= current_date
     or _valid_until > current_date + interval '5 years' then
    raise exception 'BAD_VALIDITY' using errcode = '22023';
  end if;

  select * into rev from lead.design_revisions where id = rv.revision_id;
  volume := lead_priv.annual_volume(rev.snapshot);

  insert into lead.offers (dossier_id, review_id, revision, author_id, currency, tiers, moq,
    nre_tooling_cost, incoterm, lead_time_weeks, valid_until,
    part_number, designation, annual_volume_basis)
  values (d.id, rv.id, rv.revision, u, upper(_currency), _tiers, _moq, _nre,
          _incoterm, _lead_time_weeks, _valid_until,
          rv.exact_part_number, rv.designation, volume)
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

-- 5.7 Échantillons (correctif 5) : référence, désignation et volume font autorité côté serveur.
create or replace function lead_priv.request_samples(
  _review_id uuid, _part_number text, _quantity integer,
  _annual_volume integer, _is_standard boolean)
returns jsonb language plpgsql security definer
set search_path = lead, lead_priv, pg_temp as $$
declare
  u uuid := lead_priv.require_user();
  rv lead.design_reviews%rowtype;
  d lead.design_dossiers%rowtype;
  rev lead.design_revisions%rowtype;
  route text;
  sid uuid;
  volume integer;
  is_standard boolean;
begin
  select dossier_id into d.id from lead.design_reviews where id = _review_id;
  if d.id is null then raise exception 'REVIEW_NOT_FOUND' using errcode = '42501'; end if;
  select * into d from lead.design_dossiers where id = d.id for update;
  select * into rv from lead.design_reviews where id = _review_id;
  if not (lead_priv.client_can_read(u, d.id) or lead_priv.staff_can_read_design(u, d.id)) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if rv.verdict <> 'validated' or not rv.published or rv.superseded_by is not null then
    raise exception 'REVIEW_NOT_VALIDATED' using errcode = '42501';
  end if;
  if rv.revision <> d.current_revision then
    raise exception 'REVISION_CONFLICT:%', d.current_revision using errcode = '40001';
  end if;
  if rv.exact_part_number is null or rv.designation is null then
    raise exception 'EXACT_PART_NUMBER_REQUIRED' using errcode = '22023';
  end if;
  -- La référence transmise n'est qu'une CONFIRMATION : elle doit correspondre.
  if upper(btrim(coalesce(_part_number,''))) <> upper(rv.exact_part_number) then
    raise exception 'PART_NUMBER_MISMATCH' using errcode = '42501';
  end if;
  if _quantity is null or _quantity <= 0 or _quantity > 100 then
    raise exception 'BAD_QUANTITY' using errcode = '22023';
  end if;

  -- Volume annuel : celui de la révision soumise, jamais celui fourni par l'appelant.
  select * into rev from lead.design_revisions where id = rv.revision_id;
  volume := lead_priv.annual_volume(rev.snapshot);
  is_standard := rv.designation = 'standard';

  route := case
    when volume is null then 'manual_review'
    when is_standard and volume < 1000 then 'distributors'
    when volume >= 1000 then 'standex_direct'
    else 'manual_review'   -- custom en faible volume : revue manuelle
  end;

  insert into lead.sample_requests (dossier_id, review_id, revision, requested_by,
    part_number, designation, annual_volume_basis, quantity, route)
  values (d.id, rv.id, rv.revision, u, rv.exact_part_number, rv.designation, volume, _quantity, route)
  returning id into sid;

  insert into lead.audit_log (actor, action, dossier_id, detail)
  values (u, 'samples_requested', d.id,
          jsonb_build_object('route', route, 'mpn', rv.exact_part_number, 'volume', volume));
  -- La gratuité n'est jamais automatique : `standex_direct` reste soumis à confirmation.
  return jsonb_build_object('id', sid, 'route', route, 'status', 'requested',
                            'part_number', rv.exact_part_number, 'designation', rv.designation,
                            'annual_volume_basis', volume);
end $$;

create or replace function public.lead_request_samples(
  p_review_id uuid, p_part_number text, p_quantity integer,
  p_annual_volume integer default null, p_is_standard boolean default false)
returns jsonb language sql security invoker
set search_path = public, lead_priv, pg_temp as $$
  select lead_priv.request_samples(p_review_id, p_part_number, p_quantity,
                                   p_annual_volume, p_is_standard);
$$;

-- Suivi et retour d'expérience échantillons : conservés même si le design évolue.
create or replace function lead_priv.update_sample(_sample_id uuid, _status text, _feedback text)
returns jsonb language plpgsql security definer
set search_path = lead, lead_priv, pg_temp as $$
declare
  u uuid := lead_priv.require_user(); s lead.sample_requests%rowtype; d lead.design_dossiers%rowtype;
  is_staff boolean;
begin
  -- Verrouillage constant dossier -> échantillon (évite tout interblocage
  -- avec la publication d'une revue).
  select * into s from lead.sample_requests where id = _sample_id;
  if not found then raise exception 'SAMPLE_NOT_FOUND' using errcode = '42501'; end if;
  select * into d from lead.design_dossiers where id = s.dossier_id for update;
  select * into s from lead.sample_requests where id = _sample_id for update;
  is_staff := lead_priv.staff_can_act(u, s.dossier_id, array['sales','rnd','admin']::lead.staff_role[]);
  if not (is_staff or lead_priv.client_can_read(u, s.dossier_id)) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  -- Le client annote son retour ; seul Standex fait avancer le statut logistique.
  if _status is not null then
    if not is_staff then raise exception 'NOT_ALLOWED' using errcode = '42501'; end if;
    if _status not in ('requested','confirmed','shipped','received','closed') then
      raise exception 'BAD_STATUS' using errcode = '22023';
    end if;
    -- Correctif racine 6 : une demande dépassée ne se réactive pas d'un simple
    -- bouton de suivi ; il faut une revalidation explicite et habilitée.
    if s.status = 'superseded' then
      raise exception 'SAMPLE_SUPERSEDED' using errcode = '42501';
    end if;
    update lead.sample_requests set status = _status where id = _sample_id;
  end if;
  if _feedback is not null and btrim(_feedback) <> '' then
    -- Le retour reste attaché à la révision RÉELLEMENT testée ; la révision
    -- courante n'est conservée que comme contexte.
    update lead.sample_requests
       set feedback = _feedback, feedback_at = now(), feedback_revision = s.revision,
           feedback_context_revision = d.current_revision
     where id = _sample_id;
  end if;
  select * into s from lead.sample_requests where id = _sample_id;
  return jsonb_build_object('id', s.id, 'status', s.status, 'feedback', s.feedback,
                            'feedback_revision', s.feedback_revision,
                            'feedback_context_revision', s.feedback_context_revision,
                            'design_revision', s.revision);
end $$;

-- Revalidation explicite d'une demande dépassée : acte habilité, jamais un
-- bouton de suivi ordinaire. La conception validée en cours doit porter la
-- MÊME référence exacte que l'échantillon.
create or replace function lead_priv.revalidate_sample(_sample_id uuid, _justification text)
returns jsonb language plpgsql security definer
set search_path = lead, lead_priv, pg_temp as $$
declare
  u uuid := lead_priv.require_user(); s lead.sample_requests%rowtype;
  d lead.design_dossiers%rowtype; rv lead.design_reviews%rowtype;
begin
  select * into s from lead.sample_requests where id = _sample_id;
  if not found then raise exception 'SAMPLE_NOT_FOUND' using errcode = '42501'; end if;
  select * into d from lead.design_dossiers where id = s.dossier_id for update;
  select * into s from lead.sample_requests where id = _sample_id for update;
  if not lead_priv.staff_can_act(u, s.dossier_id, array['rnd','admin']::lead.staff_role[]) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if coalesce(btrim(_justification),'') = '' then
    raise exception 'JUSTIFICATION_REQUIRED' using errcode = '22023';
  end if;
  select * into rv from lead.design_reviews
   where dossier_id = d.id and revision = d.current_revision and published
     and superseded_by is null and verdict = 'validated';
  if not found or upper(rv.exact_part_number) is distinct from upper(s.part_number) then
    raise exception 'REVALIDATION_NOT_SUPPORTED' using errcode = '42501';
  end if;
  update lead.sample_requests
     set status = 'confirmed', revision = d.current_revision, review_id = rv.id,
         revalidated_at = now(), revalidated_by = u
   where id = _sample_id;
  insert into lead.audit_log (actor, action, dossier_id, detail)
  values (u, 'sample_revalidated', d.id,
          jsonb_build_object('sample_id', _sample_id, 'justification', _justification));
  return jsonb_build_object('id', _sample_id, 'status', 'confirmed',
                            'design_revision', d.current_revision);
end $$;

create or replace function public.lead_revalidate_sample(p_sample_id uuid, p_justification text)
returns jsonb language sql security invoker
set search_path = public, lead_priv, pg_temp as $$
  select lead_priv.revalidate_sample(p_sample_id, p_justification);
$$;

create or replace function public.lead_update_sample(
  p_sample_id uuid, p_status text default null, p_feedback text default null)
returns jsonb language sql security invoker
set search_path = public, lead_priv, pg_temp as $$
  select lead_priv.update_sample(p_sample_id, p_status, p_feedback);
$$;

-- 5.8 Projection commune (correctif 2) : construite APRÈS autorisation, jamais autorisante.
create or replace function lead_priv.dossier_projection(_dossier uuid, _internal boolean)
returns jsonb language sql stable security definer
set search_path = lead, lead_priv, pg_temp as $$
  select jsonb_build_object(
    'dossier', (select jsonb_build_object('id', d.id, 'title', d.title,
        'current_revision', d.current_revision, 'nda_status', d.nda_status,
        'nda_required', d.nda_required, 'updated_at', d.updated_at,
        'owner_id', case when _internal then d.owner_id else null end)
      from lead.design_dossiers d where d.id = _dossier),
    -- Snapshot technique présent des deux côtés : sans lui, ni reprise client ni revue R&D.
    'revisions', coalesce((select jsonb_agg(jsonb_build_object(
        'id', r.id, 'revision', r.revision, 'content_hash', r.content_hash,
        'submitted_at', r.submitted_at, 'snapshot', r.snapshot,
        'consents', r.consents, 'transferred_files', r.transferred_files,
        'nda_status_at_submit', r.nda_status_at_submit) order by r.revision)
      from lead.design_revisions r where r.dossier_id = _dossier), '[]'::jsonb),
    'reviews', coalesce((select jsonb_agg(jsonb_build_object(
        'id', rv.id, 'revision', rv.revision, 'created_at', rv.created_at,
        'scope', rv.scope, 'conditions', rv.conditions, 'verdict', rv.verdict,
        'message', rv.client_message, 'exact_part_number', rv.exact_part_number,
        'designation', rv.designation, 'variant', rv.variant,
        'variant_accepted_at', rv.variant_accepted_at,
        'published', rv.published, 'superseded', rv.superseded_by is not null)
        order by rv.created_at)
      from lead.design_reviews rv
      where rv.dossier_id = _dossier and (_internal or rv.published)), '[]'::jsonb),
    'offers', coalesce((select jsonb_agg(jsonb_build_object(
        'id', o.id, 'revision', o.revision, 'review_id', o.review_id, 'currency', o.currency,
        'tiers', o.tiers, 'moq', o.moq, 'nre_tooling_cost', o.nre_tooling_cost,
        'incoterm', o.incoterm, 'lead_time_weeks', o.lead_time_weeks,
        'valid_until', o.valid_until, 'part_number', o.part_number,
        'designation', o.designation, 'annual_volume_basis', o.annual_volume_basis,
        'voided', o.voided_at is not null, 'void_reason', o.void_reason,
        'expired', o.valid_until < current_date,
        'active', o.voided_at is null and o.valid_until >= current_date)
        order by o.created_at)
      from lead.offers o where o.dossier_id = _dossier), '[]'::jsonb),
    'samples', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'part_number', s.part_number, 'designation', s.designation,
        'quantity', s.quantity, 'route', s.route, 'status', s.status,
        'annual_volume_basis', s.annual_volume_basis, 'revision', s.revision,
        'feedback', s.feedback, 'feedback_revision', s.feedback_revision)
        order by s.created_at)
      from lead.sample_requests s where s.dossier_id = _dossier), '[]'::jsonb),
    'internal_notes', case when _internal then coalesce((select jsonb_agg(jsonb_build_object(
        'id', n.id, 'created_at', n.created_at, 'author_id', n.author_id, 'body', n.body)
        order by n.created_at)
      from lead.internal_notes n where n.dossier_id = _dossier), '[]'::jsonb) else null end);
$$;

create or replace function lead_priv.client_view(_dossier uuid)
returns jsonb language plpgsql stable security definer
set search_path = lead, lead_priv, pg_temp as $$
declare u uuid := lead_priv.require_user();
begin
  if not lead_priv.client_can_read(u, _dossier) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  return lead_priv.dossier_projection(_dossier, false) - 'internal_notes';
end $$;

create or replace function public.lead_client_view(p_dossier uuid)
returns jsonb language sql stable security invoker
set search_path = public, lead_priv, pg_temp as $$ select lead_priv.client_view(p_dossier); $$;

create or replace function lead_priv.staff_view(_dossier uuid)
returns jsonb language plpgsql stable security definer
set search_path = lead, lead_priv, pg_temp as $$
declare u uuid := lead_priv.require_user();
begin
  -- Autorisation staff DISTINCTE : ne repasse jamais par le contrôle client.
  if not lead_priv.staff_can_read_design(u, _dossier) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  return lead_priv.dossier_projection(_dossier, true);
end $$;

create or replace function public.lead_staff_view(p_dossier uuid)
returns jsonb language sql stable security invoker
set search_path = public, lead_priv, pg_temp as $$ select lead_priv.staff_view(p_dossier); $$;

-- ----------------------------------------------------------------------------
-- 6. Stockage privé (correctif 7)
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('lead-design-files', 'lead-design-files', false)
on conflict (id) do nothing;

create or replace function lead_priv.upload_path_allowed(_name text, _user uuid)
returns boolean language sql stable security definer
set search_path = lead, lead_priv, pg_temp as $$
  select exists (
    select 1 from lead.upload_sessions s
    where s.user_id = _user
      and s.closed_at is null
      and s.expires_at > now()
      and _name like s.path_prefix || '/%');
$$;

-- Lecture : déposant, propriétaire du dossier, ou staff AFFECTÉ.
create or replace function lead_priv.object_readable(_name text, _user uuid)
returns boolean language sql stable security definer
set search_path = lead, lead_priv, pg_temp as $$
  select exists (
    select 1 from lead.upload_sessions s
    where _name like s.path_prefix || '/%'
      and (s.user_id = _user
           or lead_priv.client_can_read(_user, s.dossier_id)
           or lead_priv.staff_can_read_design(_user, s.dossier_id)));
$$;

-- Un objet déjà rattaché à une révision soumise est immuable.
create or replace function lead_priv.object_submitted(_name text)
returns boolean language sql stable security definer
set search_path = lead, lead_priv, pg_temp as $$
  select exists (
    select 1 from lead.design_revisions r, jsonb_array_elements(r.transferred_files) f
    where f->>'path' = _name);
$$;

-- Un artefact de preuve NDA est immuable une fois enregistré.
create or replace function lead_priv.object_is_nda_proof(_name text)
returns boolean language sql stable security definer
set search_path = lead, lead_priv, pg_temp as $$
  select exists (select 1 from lead.nda_proofs where signed_object_path = _name);
$$;

drop policy if exists lead_files_owner_rw on storage.objects;
drop policy if exists lead_files_insert on storage.objects;
drop policy if exists lead_files_select on storage.objects;
drop policy if exists lead_files_update on storage.objects;
drop policy if exists lead_files_delete on storage.objects;

-- `owner` est hérité (legacy) ; `owner_id` est la colonne actuelle. On accepte
-- l'une ou l'autre pour rester compatible avec le stockage réel.
create policy lead_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'lead-design-files'
              and coalesce(owner_id, owner::text) = auth.uid()::text
              and lead_priv.upload_path_allowed(name, auth.uid()));

create policy lead_files_select on storage.objects for select to authenticated
  using (bucket_id = 'lead-design-files' and lead_priv.object_readable(name, auth.uid()));

create policy lead_files_update on storage.objects for update to authenticated
  using (bucket_id = 'lead-design-files'
         and coalesce(owner_id, owner::text) = auth.uid()::text
         and not lead_priv.object_submitted(name) and not lead_priv.object_is_nda_proof(name))
  with check (bucket_id = 'lead-design-files'
              and coalesce(owner_id, owner::text) = auth.uid()::text
              and lead_priv.upload_path_allowed(name, auth.uid()));

create policy lead_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'lead-design-files'
         and coalesce(owner_id, owner::text) = auth.uid()::text
         and not lead_priv.object_submitted(name) and not lead_priv.object_is_nda_proof(name));

-- ----------------------------------------------------------------------------
-- 7. Grants d'exécution : PUBLIC révoqué partout, autorisations explicites
-- ----------------------------------------------------------------------------
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig, n.nspname
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname in ('lead_priv','lead')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
  for f in select p.oid::regprocedure as sig
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like 'lead\_%'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

-- Sonde de version : seule fonction ouverte à `anon`.
grant execute on function lead_priv.schema_version() to anon, authenticated;
grant execute on function public.lead_schema_version() to anon, authenticated;

do $$
declare
  pairs text[][] := array[
    ['lead_priv.my_capabilities()','public.lead_my_capabilities()'],
    ['lead_priv.my_dossiers()','public.lead_my_dossiers()'],
    ['lead_priv.staff_inbox()','public.lead_staff_inbox()'],
    ['lead_priv.create_dossier(text, boolean)','public.lead_create_dossier(text, boolean)'],
    ['lead_priv.assign_dossier(uuid, uuid)','public.lead_assign_dossier(uuid, uuid)'],
    ['lead_priv.open_upload_session(uuid, text, jsonb)',
     'public.lead_open_upload_session(uuid, text, jsonb)'],
    ['lead_priv.set_dossier_title(uuid, text)','public.lead_set_dossier_title(uuid, text)'],
    ['lead_priv.revalidate_sample(uuid, text)','public.lead_revalidate_sample(uuid, text)'],
    ['lead_priv.submit_revision(uuid, integer, jsonb, text, jsonb, jsonb)',
     'public.lead_submit_revision(uuid, integer, jsonb, text, jsonb, jsonb)'],
    ['lead_priv.publish_review(uuid, text, text, text, text, text, text, text, jsonb)',
     'public.lead_publish_review(uuid, text, text, text, text, text, text, text, jsonb)'],
    ['lead_priv.add_internal_note(uuid, text)','public.lead_add_internal_note(uuid, text)'],
    ['lead_priv.accept_variant(uuid)','public.lead_accept_variant(uuid)'],
    ['lead_priv.create_offer(uuid, text, jsonb, integer, numeric, text, integer, date)',
     'public.lead_create_offer(uuid, text, jsonb, integer, numeric, text, integer, date)'],
    ['lead_priv.request_samples(uuid, text, integer, integer, boolean)',
     'public.lead_request_samples(uuid, text, integer, integer, boolean)'],
    ['lead_priv.update_sample(uuid, text, text)','public.lead_update_sample(uuid, text, text)'],
    ['lead_priv.client_view(uuid)','public.lead_client_view(uuid)'],
    ['lead_priv.staff_view(uuid)','public.lead_staff_view(uuid)'],
    ['lead_priv.admin_record_nda_proof(uuid, text, text, text, text, jsonb, date, text, text)',
     'public.lead_admin_record_nda_proof(uuid, text, text, text, text, jsonb, date, text, text)']
  ];
  i integer;
begin
  for i in 1 .. array_length(pairs, 1) loop
    execute format('grant execute on function %s to authenticated', pairs[i][1]);
    execute format('grant execute on function %s to authenticated', pairs[i][2]);
  end loop;
end $$;

-- Fonctions utilisées par les policies de storage : exécutables par le porteur de session.
grant execute on function lead_priv.upload_path_allowed(text, uuid) to authenticated;
grant execute on function lead_priv.object_readable(text, uuid) to authenticated;
grant execute on function lead_priv.object_submitted(text) to authenticated;
grant execute on function lead_priv.object_is_nda_proof(text) to authenticated;
grant execute on function lead_priv.client_can_read(uuid, uuid) to authenticated;
grant execute on function lead_priv.staff_can_read_design(uuid, uuid) to authenticated;

-- Provisionnement des rôles et preuve NDA brute : service_role uniquement.
revoke all on function lead_priv.assign_staff(uuid, lead.staff_role) from public, anon, authenticated;
revoke all on function lead_priv.record_nda_proof(uuid, text, text, text, text, jsonb, date, uuid, text, text)
  from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 8. Enregistrement de la version
-- ----------------------------------------------------------------------------
insert into lead.schema_migrations (version) values ('1.2')
on conflict (version) do nothing;

commit;

-- ============================================================================
-- CONTRAT RPC (schéma `lead` non exposé ; tout passe par supabase.rpc)
--
--  public.lead_schema_version()                        -> {version, ready}       [anon+auth]
--  public.lead_my_capabilities()                       -> {authenticated, user_id, role,
--                                                          assigned_dossiers}     [auth]
--  public.lead_my_dossiers()                           -> [dossiers du client]    [auth]
--  public.lead_staff_inbox()                           -> {role, assigned, triage,
--                                                          staff_directory}       [staff]
--  public.lead_assign_dossier(dossier, user)           -> void                    [admin]
--  public.lead_create_dossier(title, nda_required)     -> uuid                    [auth]
--  public.lead_open_upload_session(dossier, kind)      -> {bucket, path_prefix}   [auteur du dossier]
--  public.lead_submit_revision(dossier, expected_revision, snapshot,
--       content_hash, consents, transferred_files)     -> {revision_id, revision,
--                                                          content_hash (serveur),
--                                                          client_hash_matches}   [auth]
--  public.lead_publish_review(revision_id, scope, conditions, verdict,
--       client_message, internal_note, exact_part_number, designation, variant)
--                                                      -> uuid                    [rnd|admin affecté]
--  public.lead_add_internal_note(dossier, body)        -> uuid                    [staff affecté]
--  public.lead_accept_variant(review_id)               -> {variant, next_revision}[client]
--  public.lead_create_offer(review_id, currency, tiers, moq, nre,
--       incoterm, lead_time_weeks, valid_until)        -> uuid                    [sales|admin affecté]
--  public.lead_request_samples(review_id, part_number, quantity, _, _)
--                                                      -> {id, route, status,
--                                                          part_number, designation,
--                                                          annual_volume_basis}   [client|staff]
--  public.lead_update_sample(sample_id, status, feedback) -> {status, feedback}   [staff|client]
--  public.lead_client_view(dossier)                    -> sans notes internes     [client]
--  public.lead_staff_view(dossier)                     -> avec notes internes     [staff affecté]
--  public.lead_admin_record_nda_proof(...)             -> uuid                    [admin]
--
-- Hors RPC (service_role uniquement) : lead_priv.assign_staff,
-- lead_priv.record_nda_proof. Le rôle staff n'est jamais auto-attribué.
-- ============================================================================
