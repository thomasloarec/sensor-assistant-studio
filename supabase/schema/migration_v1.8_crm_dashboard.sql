-- ============================================================================
-- Lead Magnet — migration ADDITIVE 1.8 : espace de travail interne (CRM V1)
-- Date : 2026-09-09
--
-- Portée : additive uniquement.
--   * AUCUNE colonne CRM sur `lead.design_dossiers` (donc rien d'exposable via
--     la projection client existante) ;
--   * AUCUNE fonction métier existante remplacée, à une exception assumée et
--     documentée : `lead_priv.role_of` prend en compte la désactivation d'un
--     membre (révocation réellement effective côté serveur) ;
--   * la version minimale exigée par l'application reste 1.4 : ce fichier
--     enregistre 1.8 et fournit une SONDE DISTINCTE `lead_crm_capabilities`
--     pour que le tableau de bord échoue proprement s'il n'est pas activé.
--
-- Règles conservées : schéma `lead`/`lead_priv` non exposé, wrappers publics
-- invoker, `search_path` sûr, EXECUTE retiré de public/anon, RLS active,
-- lecture technique réservée au staff AFFECTÉ, notes internes jamais côté
-- client, compare-and-swap sur toutes les écritures CRM.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Types
-- ----------------------------------------------------------------------------
do $$ begin
  create type lead.crm_stage as enum ('lead','qualification','solution_quote',
    'negotiate','closed_won','closed_lost','on_hold','dead');
exception when duplicate_object then null; end $$;

do $$ begin
  create type lead.crm_task_status as enum ('todo','in_progress','blocked','done','not_applicable');
exception when duplicate_object then null; end $$;

do $$ begin
  create type lead.crm_person_role as enum ('sales','fae');
exception when duplicate_object then null; end $$;

do $$ begin
  create type lead.crm_stakeholder as enum ('sales','fae','client');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- 2. Annuaire métier — des PERSONNES, pas des comptes
--    Un nom d'annuaire n'accorde aucun droit. Le rattachement à un compte est
--    un acte d'administration explicite, vérifié par e-mail réellement inscrit.
-- ----------------------------------------------------------------------------
create table if not exists lead.crm_directory (
  id uuid primary key default gen_random_uuid(),
  first_name text not null check (length(btrim(first_name)) between 1 and 80),
  last_name text not null check (length(btrim(last_name)) between 1 and 80),
  role lead.crm_person_role not null,
  active boolean not null default true,
  -- Lien explicite vers un compte DÉJÀ inscrit ; jamais créé ici.
  user_id uuid unique references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists crm_directory_person_idx
  on lead.crm_directory (lower(btrim(first_name)), lower(btrim(last_name)), role);
alter table lead.crm_directory enable row level security;

-- ----------------------------------------------------------------------------
-- 3. Fiche CRM d'un dossier (1 pour 1, jamais fusionnée au dossier client)
-- ----------------------------------------------------------------------------
create table if not exists lead.dossier_crm (
  dossier_id uuid primary key references lead.design_dossiers(id) on delete cascade,
  stage lead.crm_stage not null default 'lead',
  stage_since timestamptz not null default now(),
  company text,
  project_name text,
  -- Pays du projet : indépendant de la langue d'interface et de `sourceLocale`.
  country_code text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  sales_person uuid references lead.crm_directory(id) on delete set null,
  fae_person uuid references lead.crm_directory(id) on delete set null,
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  -- Prix de vente et coût UNITAIRES. Marge = (prix - coût) / prix, en %.
  unit_price numeric check (unit_price is null or (unit_price >= 0 and unit_price < 1e12)),
  unit_cost numeric check (unit_cost is null or (unit_cost >= 0 and unit_cost < 1e12)),
  -- Standard : le coût réel se lit dans SAP, il n'est donc pas connu ici.
  cost_in_sap boolean not null default false,
  -- Volume retenu par Standex quand la dernière révision ne le donne pas.
  annual_volume_override integer check (annual_volume_override is null or annual_volume_override > 0),
  -- Estimation manuelle du chiffre d'affaires annuel, AVANT prix connu.
  -- Elle n'est jamais écrasée par le calcul : les deux coexistent.
  estimated_annual_revenue numeric
    check (estimated_annual_revenue is null or (estimated_annual_revenue >= 0 and estimated_annual_revenue < 1e15)),
  series_launch date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Compare-and-swap : toute écriture annonce la version qu'elle a lue.
  version integer not null default 1 check (version >= 1)
);
alter table lead.dossier_crm enable row level security;
create index if not exists dossier_crm_stage_idx on lead.dossier_crm (stage, updated_at desc);

-- ----------------------------------------------------------------------------
-- 4. Plan d'action : items par étape
-- ----------------------------------------------------------------------------
create table if not exists lead.dossier_tasks (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references lead.design_dossiers(id) on delete cascade,
  stage lead.crm_stage not null,
  label text not null check (length(btrim(label)) between 1 and 200),
  stakeholder lead.crm_stakeholder not null,
  person_id uuid references lead.crm_directory(id) on delete set null,
  status lead.crm_task_status not null default 'todo',
  -- « Sans objet » exige un motif : sinon la progression serait truquée.
  na_reason text,
  due_on date,
  sort_order integer not null default 0,
  -- Activation de l'étape : sert à mesurer l'âge de l'étape en cours, et non
  -- la seule date de dernière modification.
  activated_at timestamptz,
  done_at timestamptz,
  done_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version >= 1),
  check (status <> 'not_applicable' or (na_reason is not null and length(btrim(na_reason)) > 0)),
  check ((status = 'done') = (done_at is not null))
);
alter table lead.dossier_tasks enable row level security;
create index if not exists dossier_tasks_dossier_idx on lead.dossier_tasks (dossier_id, stage, sort_order);

-- ----------------------------------------------------------------------------
-- 5. Notes SAP — append-only, générées par le serveur, en anglais
-- ----------------------------------------------------------------------------
create table if not exists lead.sap_notes (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references lead.design_dossiers(id) on delete cascade,
  created_at timestamptz not null default now(),
  author_id uuid references auth.users(id),
  author_name text not null,
  -- Clé d'événement : rend la génération idempotente (double clic, retry).
  event_key text not null,
  body_en text not null,
  unique (dossier_id, event_key)
);
alter table lead.sap_notes enable row level security;
create index if not exists sap_notes_dossier_idx on lead.sap_notes (dossier_id, created_at desc);

create or replace function lead_priv.sap_notes_append_only()
returns trigger language plpgsql
set search_path = pg_temp as $$
begin
  raise exception 'SAP_NOTES_APPEND_ONLY' using errcode = '42501';
end $$;

drop trigger if exists sap_notes_no_update on lead.sap_notes;
create trigger sap_notes_no_update before update or delete on lead.sap_notes
  for each row execute function lead_priv.sap_notes_append_only();

-- ----------------------------------------------------------------------------
-- 6. File d'attente de notification client (AUCUN fournisseur branché)
--    `sent` n'existe pas : rien ne peut prétendre avoir été envoyé.
-- ----------------------------------------------------------------------------
create table if not exists lead.client_notifications (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references lead.design_dossiers(id) on delete cascade,
  review_id uuid not null references lead.design_reviews(id) on delete cascade,
  revision integer not null check (revision >= 1),
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  -- Langue du client, figée à la soumission (jamais le sélecteur d'interface).
  locale text not null check (locale ~ '^[a-z]{2}$'),
  subject text not null,
  summary text not null,
  link_path text not null check (link_path ~ '^/'),
  status text not null default 'pending' check (status in ('pending','failed','cancelled')),
  provider text,
  last_error text,
  unique (dossier_id, review_id)
);
alter table lead.client_notifications enable row level security;

-- ----------------------------------------------------------------------------
-- 7. Révocation réellement effective : un membre désactivé n'a plus de rôle.
-- ----------------------------------------------------------------------------
alter table lead.staff_members add column if not exists active boolean not null default true;

create or replace function lead_priv.role_of(_user uuid)
returns lead.staff_role language sql stable security definer
set search_path = lead, lead_priv, pg_temp as $$
  select role from lead.staff_members where user_id = _user and active;
$$;

-- Révocation RÉELLEMENT effective : les gardes historiques interrogeaient
-- `staff_members` SANS tenir compte de `active`. Un membre désactivé gardait
-- donc l'accès hérité (lead_staff_view, notes internes, revue, fichiers de
-- storage). Ces deux redéfinitions sont volontaires et documentées : la porte
-- d'origine (rôle exigé ET affectation explicite) est conservée à l'identique,
-- on y ajoute seulement la condition d'activité.
create or replace function lead_priv.staff_can_act(_user uuid, _dossier uuid, _roles lead.staff_role[])
returns boolean language sql stable security definer
set search_path = lead, lead_priv, pg_temp as $$
  select exists (
    select 1 from lead.staff_members m
    where m.user_id = _user
      and m.active
      and m.role = any(_roles)
      and exists (select 1 from lead.dossier_assignments a
                  where a.dossier_id = _dossier and a.user_id = _user)
  );
$$;

create or replace function lead_priv.staff_can_read_design(_user uuid, _dossier uuid)
returns boolean language sql stable security definer
set search_path = lead, lead_priv, pg_temp as $$
  select exists (
    select 1 from lead.staff_members m
    join lead.dossier_assignments a on a.user_id = m.user_id
    where m.user_id = _user and m.active and a.dossier_id = _dossier
  );
$$;

-- Provenance d'une affectation : une affectation posée à la main par un
-- administrateur ne doit JAMAIS être effacée par un changement de responsable.
alter table lead.dossier_assignments
  add column if not exists source text not null default 'manual';
do $$ begin
  alter table lead.dossier_assignments
    add constraint dossier_assignments_source_chk check (source in ('manual','crm_owner'));
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- 8. Accès CRM : rôle staff + affectation explicite ; l'admin trie sans lire
--    le contenu technique (celui-ci reste gardé par staff_can_read_design).
-- ----------------------------------------------------------------------------
create or replace function lead_priv.crm_can_read(_user uuid, _dossier uuid)
returns boolean language sql stable security definer
set search_path = lead, lead_priv, pg_temp as $$
  -- Un rôle absent vaut NULL : sans `coalesce`, le test appelant serait
  -- « ni vrai ni faux » et laisserait passer un utilisateur sans rôle.
  select coalesce(lead_priv.role_of(_user) = 'admin', false)
      or (lead_priv.role_of(_user) is not null
          and exists (select 1 from lead.dossier_assignments a
                      where a.dossier_id = _dossier and a.user_id = _user));
$$;

create or replace function lead_priv.crm_require_write(_user uuid, _dossier uuid,
                                                       _roles lead.staff_role[])
returns void language plpgsql stable security definer
set search_path = lead, lead_priv, pg_temp as $$
declare r lead.staff_role := lead_priv.role_of(_user);
begin
  if r is null then raise exception 'NOT_ALLOWED' using errcode = '42501'; end if;
  if r = 'admin' then return; end if;
  if not (r = any(_roles)) then raise exception 'NOT_ALLOWED' using errcode = '42501'; end if;
  if not exists (select 1 from lead.dossier_assignments a
                 where a.dossier_id = _dossier and a.user_id = _user) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
end $$;

create or replace function lead_priv.crm_actor_name(_user uuid)
returns text language sql stable security definer
set search_path = lead, lead_priv, pg_temp as $$
  select coalesce(
    (select nullif(btrim(p.first_name || ' ' || p.last_name), '')
       from lead.crm_directory p where p.user_id = _user),
    (select nullif(btrim(m.display_name), '') from lead.staff_members m where m.user_id = _user),
    (select u.email from auth.users u where u.id = _user),
    'Standex');
$$;

-- Note SAP déterministe : même événement, même corps, une seule ligne.
create or replace function lead_priv.sap_note(_dossier uuid, _user uuid,
                                              _event_key text, _bullets text[])
returns void language plpgsql security definer
set search_path = lead, lead_priv, pg_temp as $$
declare header text; body text; b text;
begin
  if _bullets is null or array_length(_bullets, 1) is null then return; end if;
  header := to_char(now() at time zone 'UTC', 'DD/MM/YYYY') || ' - '
            || lead_priv.crm_actor_name(_user) || ' :';
  body := header;
  foreach b in array _bullets loop
    if b is not null and btrim(b) <> '' then
      body := body || E'\n- ' || btrim(b);
    end if;
  end loop;
  insert into lead.sap_notes (dossier_id, author_id, author_name, event_key, body_en)
  values (_dossier, _user, lead_priv.crm_actor_name(_user), _event_key, body)
  on conflict (dossier_id, event_key) do nothing;
end $$;

-- ----------------------------------------------------------------------------
-- 9. Fiche CRM : création paresseuse et lecture
-- ----------------------------------------------------------------------------
create or replace function lead_priv.crm_ensure(_dossier uuid)
returns lead.dossier_crm language plpgsql security definer
set search_path = lead, lead_priv, pg_temp as $$
declare row lead.dossier_crm%rowtype;
begin
  select * into row from lead.dossier_crm where dossier_id = _dossier;
  if found then return row; end if;
  if not exists (select 1 from lead.design_dossiers d where d.id = _dossier) then
    raise exception 'DOSSIER_NOT_FOUND' using errcode = '42501';
  end if;
  insert into lead.dossier_crm (dossier_id) values (_dossier)
  on conflict (dossier_id) do nothing;
  select * into row from lead.dossier_crm where dossier_id = _dossier;
  return row;
end $$;

-- Volume annuel de CAPTEURS réellement soumis (dernière révision).
create or replace function lead_priv.crm_submitted_volume(_dossier uuid)
returns integer language sql stable security definer
set search_path = lead, lead_priv, pg_temp as $$
  select lead_priv.annual_volume(r.snapshot)
    from lead.design_revisions r
   where r.dossier_id = _dossier
   order by r.revision desc limit 1;
$$;

-- Bloc « business » de la dernière révision RÉELLEMENT soumise. Lecture seule :
-- une soumission est immuable et n'est jamais réécrite depuis le tableau de bord.
create or replace function lead_priv.crm_submitted_business(_dossier uuid)
returns jsonb language sql stable security definer
set search_path = lead, lead_priv, pg_temp as $$
  select coalesce(r.snapshot->'business', '{}'::jsonb)
    from lead.design_revisions r
   where r.dossier_id = _dossier
   order by r.revision desc limit 1;
$$;

create or replace function lead_priv.crm_submitted_company(_dossier uuid)
returns text language sql stable security definer
set search_path = lead, lead_priv, pg_temp as $$
  select nullif(btrim(coalesce(lead_priv.crm_submitted_business(_dossier)->>'contactCompany','')), '');
$$;

create or replace function lead_priv.crm_submitted_series_launch(_dossier uuid)
returns date language plpgsql stable security definer
set search_path = lead, lead_priv, pg_temp as $$
declare v text := nullif(btrim(coalesce(
  lead_priv.crm_submitted_business(_dossier)->>'seriesStartDate','')), '');
begin
  if v is null then return null; end if;
  return v::date;
exception when others then return null;
end $$;

-- Un dossier sans fiche de suivi est projeté avec des valeurs HONNÊTES :
-- étape « lead » par défaut, aucune date d'entrée d'étape inventée, version 0.
-- Il apparaît ainsi naturellement dans le tableau et le pipeline, sans qu'un
-- humain doive ouvrir chaque dossier un par un pour le faire exister.
create or replace function lead_priv.crm_row_json(_dossier uuid)
returns jsonb language sql stable security definer
set search_path = lead, lead_priv, pg_temp as $$
  select jsonb_build_object(
    'dossier_id', d.id,
    'title', d.title,
    'current_revision', d.current_revision,
    'nda_status', d.nda_status,
    'dossier_created_at', d.created_at,
    'dossier_updated_at', d.updated_at,
    'filed', c.dossier_id is not null,
    'stage', coalesce(c.stage, 'lead'), 'stage_since', c.stage_since,
    'company', c.company, 'project_name', c.project_name, 'country_code', c.country_code,
    'sales_person', c.sales_person, 'fae_person', c.fae_person,
    'currency', c.currency, 'unit_price', c.unit_price, 'unit_cost', c.unit_cost,
    'cost_in_sap', c.cost_in_sap,
    'annual_volume_override', c.annual_volume_override,
    'annual_volume_submitted', lead_priv.crm_submitted_volume(d.id),
    'estimated_annual_revenue', c.estimated_annual_revenue,
    'series_launch', c.series_launch,
    -- Ce que le client a réellement déclaré : sert d'affichage par défaut, sans
    -- jamais écraser ni la soumission ni une correction interne explicite.
    'company_submitted', lead_priv.crm_submitted_company(d.id),
    'series_launch_submitted', lead_priv.crm_submitted_series_launch(d.id),
    'company_effective', coalesce(c.company, lead_priv.crm_submitted_company(d.id)),
    'series_launch_effective', coalesce(c.series_launch,
                                        lead_priv.crm_submitted_series_launch(d.id)),
    'company_source', case when c.company is not null then 'override'
                           when lead_priv.crm_submitted_company(d.id) is not null then 'submitted'
                           else 'unknown' end,
    'series_launch_source', case when c.series_launch is not null then 'override'
                                 when lead_priv.crm_submitted_series_launch(d.id) is not null
                                   then 'submitted' else 'unknown' end,
    'updated_at', coalesce(c.updated_at, d.updated_at), 'version', coalesce(c.version, 0),
    'tasks_total', (select count(*) from lead.dossier_tasks t
                     where t.dossier_id = d.id and t.status <> 'not_applicable'),
    'tasks_done', (select count(*) from lead.dossier_tasks t
                    where t.dossier_id = d.id and t.status = 'done'),
    'tasks_blocked', (select count(*) from lead.dossier_tasks t
                       where t.dossier_id = d.id and t.status = 'blocked'),
    'tasks_overdue', (select count(*) from lead.dossier_tasks t
                       where t.dossier_id = d.id and t.due_on is not null
                         and t.due_on < current_date
                         and t.status not in ('done','not_applicable')),
    -- Âge de l'étape EN COURS : activation des items de CETTE étape, et non le
    -- plus ancien item inachevé, qui pouvait appartenir à une étape future.
    -- Un plan d'actions créé d'un coup date TOUS ses items du même instant :
    -- une étape ne peut donc pas être « en cours » avant que le projet y entre.
    'stage_activated_at', coalesce(
      (select t.activated_at from lead.dossier_tasks t
        where t.dossier_id = d.id and t.status not in ('done','not_applicable')
          and t.activated_at is not null
        order by t.stage, t.sort_order, t.created_at limit 1),
      c.stage_since))

  from lead.design_dossiers d
  left join lead.dossier_crm c on c.dossier_id = d.id
  where d.id = _dossier;
$$;

-- Sonde de capacité DISTINCTE : l'absence de ce fichier ne casse rien d'autre.
create or replace function lead_priv.crm_capabilities()
returns jsonb language plpgsql stable security definer
set search_path = lead, lead_priv, pg_temp as $$
declare u uuid := lead_priv.require_user(); r lead.staff_role := lead_priv.role_of(u);
begin
  return jsonb_build_object(
    'crm_version', '1.8',
    'user_id', u,
    'role', r,
    'person', (select jsonb_build_object('id', p.id, 'first_name', p.first_name,
                        'last_name', p.last_name, 'role', p.role)
                 from lead.crm_directory p where p.user_id = u));
end $$;

create or replace function public.lead_crm_capabilities()
returns jsonb language sql stable security invoker
set search_path = public, lead_priv, pg_temp as $$ select lead_priv.crm_capabilities(); $$;

-- Tableau : l'admin voit la liste de tri, les autres leurs affectations.
create or replace function lead_priv.crm_board()
returns jsonb language plpgsql stable security definer
set search_path = lead, lead_priv, pg_temp as $$
declare u uuid := lead_priv.require_user(); r lead.staff_role := lead_priv.role_of(u);
begin
  if r is null then raise exception 'NOT_ALLOWED' using errcode = '42501'; end if;
  return jsonb_build_object(
    'role', r,
    -- Tous les dossiers visibles, fiche de suivi ou non : à la première
    -- activation, rien n'est caché derrière une liste annexe à ouvrir à la main.
    'projects', coalesce((
      select jsonb_agg(lead_priv.crm_row_json(d.id) order by d.updated_at desc)
        from lead.design_dossiers d
       where r = 'admin'
          or exists (select 1 from lead.dossier_assignments a
                     where a.dossier_id = d.id and a.user_id = u)), '[]'::jsonb),
    -- Conservé vide pour compatibilité : plus aucune section annexe.
    'unfiled', '[]'::jsonb,
    'directory', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'first_name', p.first_name,
               'last_name', p.last_name, 'role', p.role, 'active', p.active,
               'linked', p.user_id is not null)
             order by lower(p.last_name), lower(p.first_name))
        from lead.crm_directory p), '[]'::jsonb));
end $$;

create or replace function public.lead_crm_board()
returns jsonb language sql stable security invoker
set search_path = public, lead_priv, pg_temp as $$ select lead_priv.crm_board(); $$;

create or replace function lead_priv.crm_project(_dossier uuid)
returns jsonb language plpgsql security definer
set search_path = lead, lead_priv, pg_temp as $$
declare u uuid := lead_priv.require_user();
begin
  if not lead_priv.crm_can_read(u, _dossier) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  perform lead_priv.crm_ensure(_dossier);
  return jsonb_build_object(
    'project', lead_priv.crm_row_json(_dossier),
    'tasks', coalesce((select jsonb_agg(jsonb_build_object(
        'id', t.id, 'stage', t.stage, 'label', t.label, 'stakeholder', t.stakeholder,
        'person_id', t.person_id, 'status', t.status, 'na_reason', t.na_reason,
        'due_on', t.due_on, 'sort_order', t.sort_order, 'activated_at', t.activated_at,
        'done_at', t.done_at, 'done_by_name',
          case when t.done_by is null then null else lead_priv.crm_actor_name(t.done_by) end,
        'created_at', t.created_at, 'version', t.version)
        order by t.stage, t.sort_order, t.created_at)
      from lead.dossier_tasks t where t.dossier_id = _dossier), '[]'::jsonb),
    'sap_notes', coalesce((select jsonb_agg(jsonb_build_object(
        'id', n.id, 'created_at', n.created_at, 'author_name', n.author_name,
        'event_key', n.event_key, 'body_en', n.body_en)
        order by n.created_at desc)
      from lead.sap_notes n where n.dossier_id = _dossier), '[]'::jsonb),
    'notifications', coalesce((select jsonb_agg(jsonb_build_object(
        'id', x.id, 'review_id', x.review_id, 'revision', x.revision,
        'created_at', x.created_at, 'locale', x.locale, 'subject', x.subject,
        'summary', x.summary, 'link_path', x.link_path, 'status', x.status,
        'provider', x.provider)
        order by x.created_at desc)
      from lead.client_notifications x where x.dossier_id = _dossier), '[]'::jsonb));
end $$;

create or replace function public.lead_crm_project(p_dossier uuid)
returns jsonb language sql security invoker
set search_path = public, lead_priv, pg_temp as $$ select lead_priv.crm_project(p_dossier); $$;

-- ----------------------------------------------------------------------------
-- 10. Écritures CRM — compare-and-swap systématique
-- ----------------------------------------------------------------------------
create or replace function lead_priv.crm_bump(_dossier uuid, _expected integer)
returns lead.dossier_crm language plpgsql security definer
set search_path = lead, lead_priv, pg_temp as $$
declare row lead.dossier_crm%rowtype;
begin
  -- Une version attendue ABSENTE n'est pas « pas de conflit » : c'est une
  -- écriture à l'aveugle. Elle est refusée, jamais tolérée.
  if _expected is null then
    raise exception 'VERSION_REQUIRED' using errcode = '22023';
  end if;
  row := lead_priv.crm_ensure(_dossier);
  select * into row from lead.dossier_crm where dossier_id = _dossier for update;
  if row.version <> _expected then
    raise exception 'CRM_CONFLICT:%', row.version using errcode = '40001';
  end if;
  return row;
end $$;

-- Une devise ne se change pas « en silence » quand des montants existent déjà :
-- relabelliser 10 EUR en 10 USD fabriquerait une marge fausse. Aucune conversion
-- automatique n'est faite ; il faut d'abord effacer les montants.
create or replace function lead_priv.crm_currency_guard(_row lead.dossier_crm, _cur text)
returns void language plpgsql immutable
set search_path = pg_temp as $$
begin
  if _cur is null or _row.currency is null or _cur = _row.currency then return; end if;
  if _row.unit_price is not null or _row.unit_cost is not null
     or _row.estimated_annual_revenue is not null then
    raise exception 'CURRENCY_LOCKED' using errcode = '22023';
  end if;
end $$;

create or replace function lead_priv.crm_set_stage(_dossier uuid, _stage text, _expected integer)
returns jsonb language plpgsql security definer
set search_path = lead, lead_priv, pg_temp as $$
declare u uuid := lead_priv.require_user(); row lead.dossier_crm%rowtype; s lead.crm_stage;
begin
  perform lead_priv.crm_require_write(u, _dossier, array['sales','rnd']::lead.staff_role[]);
  begin s := _stage::lead.crm_stage; exception when others then
    raise exception 'BAD_STAGE' using errcode = '22023'; end;
  row := lead_priv.crm_bump(_dossier, _expected);
  if row.stage = s then return lead_priv.crm_project(_dossier); end if;
  update lead.dossier_crm
     set stage = s, stage_since = now(), updated_at = now(), version = version + 1
   where dossier_id = _dossier;
  -- L'étape change : la prochaine action de la nouvelle étape démarre son
  -- compteur maintenant, pas à la création du plan.
  perform lead_priv.crm_refresh_activation(_dossier);
  perform lead_priv.sap_note(_dossier, u,
    'stage:' || row.version::text || ':' || s::text,
    array['Stage changed from ' || replace(row.stage::text,'_',' ')
          || ' to ' || replace(s::text,'_',' ') || '.']);
  insert into lead.audit_log (actor, action, dossier_id, detail)
  values (u, 'crm_stage_set', _dossier, jsonb_build_object('from', row.stage, 'to', s));
  return lead_priv.crm_project(_dossier);
end $$;

create or replace function public.lead_crm_set_stage(p_dossier uuid, p_stage text,
                                                     p_expected_version integer)
returns jsonb language sql security invoker
set search_path = public, lead_priv, pg_temp as $$
  select lead_priv.crm_set_stage(p_dossier, p_stage, p_expected_version); $$;

-- Lecture STRICTEMENT typée d'un champ du correctif. Une valeur du mauvais type
-- est REFUSÉE, jamais silencieusement convertie en « vide » : « not a number »
-- effaçait le montant au lieu d'échouer.
create or replace function lead_priv.crm_patch_text(_patch jsonb, _key text)
returns text language plpgsql immutable
set search_path = pg_temp as $$
declare v jsonb := _patch -> _key;
begin
  if v is null or jsonb_typeof(v) = 'null' then return null; end if;
  if jsonb_typeof(v) <> 'string' then
    raise exception 'BAD_FIELD_TYPE:%', _key using errcode = '22023';
  end if;
  return nullif(btrim(v #>> '{}'), '');
end $$;

create or replace function lead_priv.crm_patch_number(_patch jsonb, _key text)
returns numeric language plpgsql immutable
set search_path = pg_temp as $$
declare v jsonb := _patch -> _key; n numeric;
begin
  if v is null or jsonb_typeof(v) = 'null' then return null; end if;
  if jsonb_typeof(v) <> 'number' then
    raise exception 'BAD_FIELD_TYPE:%', _key using errcode = '22023';
  end if;
  n := lead_priv.json_number(v);
  if n is null or not lead_priv.finite_num(n) then
    raise exception 'BAD_FIELD_TYPE:%', _key using errcode = '22023';
  end if;
  return n;
end $$;

-- Identité du projet : société, nom de projet, pays, date de lancement série,
-- estimation manuelle du CA, volume retenu.
create or replace function lead_priv.crm_set_fields(_dossier uuid, _patch jsonb, _expected integer)
returns jsonb language plpgsql security definer
set search_path = lead, lead_priv, pg_temp as $$
declare u uuid := lead_priv.require_user(); row lead.dossier_crm%rowtype;
        bullets text[] := '{}'; v text; n numeric; d date; k text;
        allowed text[] := array['company','project_name','country_code','currency',
                                'series_launch','annual_volume_override',
                                'estimated_annual_revenue'];
begin
  perform lead_priv.crm_require_write(u, _dossier, array['sales','rnd']::lead.staff_role[]);
  if _patch is null or jsonb_typeof(_patch) <> 'object' then
    raise exception 'BAD_PATCH' using errcode = '22023';
  end if;
  -- Liste blanche : une clé inconnue est une erreur, pas un champ ignoré.
  for k in select jsonb_object_keys(_patch) loop
    if not (k = any(allowed)) then
      raise exception 'UNKNOWN_FIELD:%', k using errcode = '22023';
    end if;
  end loop;
  row := lead_priv.crm_bump(_dossier, _expected);

  if _patch ? 'company' then
    v := lead_priv.crm_patch_text(_patch, 'company');
    update lead.dossier_crm set company = v where dossier_id = _dossier;
    if v is distinct from row.company then
      bullets := bullets || ('Company set to ' || coalesce(v,'unknown') || '.');
    end if;
  end if;
  if _patch ? 'project_name' then
    v := lead_priv.crm_patch_text(_patch, 'project_name');
    update lead.dossier_crm set project_name = v where dossier_id = _dossier;
    if v is distinct from row.project_name then
      bullets := bullets || ('Project name set to ' || coalesce(v,'unknown') || '.');
    end if;
  end if;
  if _patch ? 'country_code' then
    v := upper(lead_priv.crm_patch_text(_patch, 'country_code'));
    if v is not null and v !~ '^[A-Z]{2}$' then
      raise exception 'BAD_COUNTRY' using errcode = '22023';
    end if;
    update lead.dossier_crm set country_code = v where dossier_id = _dossier;
    if v is distinct from row.country_code then
      bullets := bullets || ('Country set to ' || coalesce(v,'unknown') || '.');
    end if;
  end if;
  if _patch ? 'currency' then
    v := upper(lead_priv.crm_patch_text(_patch, 'currency'));
    if v is not null and v !~ '^[A-Z]{3}$' then
      raise exception 'BAD_CURRENCY' using errcode = '22023';
    end if;
    -- Même verrou que sur le prix : pas de relabellisation d'un montant existant.
    perform lead_priv.crm_currency_guard(row, v);
    if v is null and (row.unit_price is not null or row.unit_cost is not null
                      or row.estimated_annual_revenue is not null) then
      raise exception 'CURRENCY_LOCKED' using errcode = '22023';
    end if;
    update lead.dossier_crm set currency = v where dossier_id = _dossier;
    if v is distinct from row.currency then
      bullets := bullets || ('Currency set to ' || coalesce(v,'unknown') || '.');
    end if;
  end if;
  if _patch ? 'series_launch' then
    v := lead_priv.crm_patch_text(_patch, 'series_launch');
    if v is null then d := null; else
      if v !~ '^\d{4}-\d{2}-\d{2}$' then
        raise exception 'BAD_DATE' using errcode = '22023';
      end if;
      begin d := v::date; exception when others then
        raise exception 'BAD_DATE' using errcode = '22023'; end;
    end if;
    update lead.dossier_crm set series_launch = d where dossier_id = _dossier;
    if d is distinct from row.series_launch then
      bullets := bullets || ('Series launch date set to '
        || coalesce(to_char(d,'DD/MM/YYYY'),'unknown') || '.');
    end if;
  end if;
  if _patch ? 'annual_volume_override' then
    n := lead_priv.crm_patch_number(_patch, 'annual_volume_override');
    if n is not null and (n <= 0 or n <> trunc(n) or n > 2147483647) then
      raise exception 'BAD_ANNUAL_VOLUME' using errcode = '22023';
    end if;
    update lead.dossier_crm set annual_volume_override = n::integer where dossier_id = _dossier;
    if n::integer is distinct from row.annual_volume_override then
      bullets := bullets || ('Annual sensor volume retained: '
        || coalesce(n::integer::text,'unknown') || ' pcs/year.');
    end if;
  end if;
  if _patch ? 'estimated_annual_revenue' then
    n := lead_priv.crm_patch_number(_patch, 'estimated_annual_revenue');
    if n is not null and (n < 0 or n >= 1e15) then
      raise exception 'BAD_ESTIMATE' using errcode = '22023';
    end if;
    update lead.dossier_crm set estimated_annual_revenue = n where dossier_id = _dossier;
    if n is distinct from row.estimated_annual_revenue then
      bullets := bullets || ('Estimated annual revenue: '
        || coalesce(trim(to_char(n,'FM999999999999990.00')),'unknown')
        || coalesce(' ' || row.currency, '') || '.');
    end if;
  end if;

  update lead.dossier_crm set updated_at = now(), version = version + 1
   where dossier_id = _dossier;
  -- Réécrire la même valeur ne fabrique aucune note : `bullets` reste vide et
  -- `sap_note` sort immédiatement.
  perform lead_priv.sap_note(_dossier, u, 'fields:' || row.version::text, bullets);
  insert into lead.audit_log (actor, action, dossier_id, detail)
  values (u, 'crm_fields_set', _dossier, jsonb_build_object('keys',
          (select jsonb_agg(k2) from jsonb_object_keys(_patch) k2)));
  return lead_priv.crm_project(_dossier);
end $$;

create or replace function public.lead_crm_set_fields(p_dossier uuid, p_patch jsonb,
                                                      p_expected_version integer)
returns jsonb language sql security invoker
set search_path = public, lead_priv, pg_temp as $$
  select lead_priv.crm_set_fields(p_dossier, p_patch, p_expected_version); $$;

-- Coût unitaire : FAE (rnd) ou admin. `cost_in_sap` déclare un standard dont le
-- coût réel se lit dans SAP : coût et marge restent alors INCONNUS ici.
create or replace function lead_priv.crm_set_cost(_dossier uuid, _cost numeric,
                                                  _in_sap boolean, _expected integer)
returns jsonb language plpgsql security definer
set search_path = lead, lead_priv, pg_temp as $$
declare u uuid := lead_priv.require_user(); row lead.dossier_crm%rowtype; c numeric := _cost;
begin
  perform lead_priv.crm_require_write(u, _dossier, array['rnd']::lead.staff_role[]);
  if coalesce(_in_sap, false) then c := null; end if;
  if c is not null and not lead_priv.finite_num(c) then
    raise exception 'BAD_COST' using errcode = '22023';
  end if;
  if c is not null and (c < 0 or c >= 1e12) then
    raise exception 'BAD_COST' using errcode = '22023';
  end if;
  row := lead_priv.crm_bump(_dossier, _expected);
  update lead.dossier_crm
     set unit_cost = c, cost_in_sap = coalesce(_in_sap, false),
         updated_at = now(), version = version + 1
   where dossier_id = _dossier;
  -- Réécrire exactement la même valeur n'est pas un « progrès » : pas de note.
  if c is distinct from row.unit_cost
     or coalesce(_in_sap,false) is distinct from row.cost_in_sap then
    perform lead_priv.sap_note(_dossier, u, 'cost:' || row.version::text,
      array[case when coalesce(_in_sap,false) then 'Unit cost: see cost in SAP (standard part).'
            when c is null then 'Unit cost cleared.'
            else 'Unit cost set to ' || trim(to_char(c,'FM999999999990.0000'))
                 || coalesce(' ' || row.currency, '') || '.' end]);
  end if;
  insert into lead.audit_log (actor, action, dossier_id, detail)
  values (u, 'crm_cost_set', _dossier, jsonb_build_object('in_sap', coalesce(_in_sap,false)));
  return lead_priv.crm_project(_dossier);
end $$;

create or replace function public.lead_crm_set_cost(p_dossier uuid, p_cost numeric,
                                                    p_cost_in_sap boolean,
                                                    p_expected_version integer)
returns jsonb language sql security invoker
set search_path = public, lead_priv, pg_temp as $$
  select lead_priv.crm_set_cost(p_dossier, p_cost, p_cost_in_sap, p_expected_version); $$;

-- Prix de vente unitaire : commercial (sales) ou admin. Ce tarif CRM ne vaut
-- JAMAIS offre publiée : les offres restent `lead.offers`.
create or replace function lead_priv.crm_set_price(_dossier uuid, _price numeric,
                                                   _currency text, _expected integer)
returns jsonb language plpgsql security definer
set search_path = lead, lead_priv, pg_temp as $$
declare u uuid := lead_priv.require_user(); row lead.dossier_crm%rowtype;
        cur text := nullif(upper(btrim(coalesce(_currency,''))), '');
begin
  perform lead_priv.crm_require_write(u, _dossier, array['sales']::lead.staff_role[]);
  if _price is not null and not lead_priv.finite_num(_price) then
    raise exception 'BAD_PRICE' using errcode = '22023';
  end if;
  if _price is not null and (_price < 0 or _price >= 1e12) then
    raise exception 'BAD_PRICE' using errcode = '22023';
  end if;
  if cur is not null and cur !~ '^[A-Z]{3}$' then
    raise exception 'BAD_CURRENCY' using errcode = '22023';
  end if;
  row := lead_priv.crm_bump(_dossier, _expected);
  -- Un changement de devise ne peut pas rebaptiser en silence un coût FAE déjà
  -- saisi : sans conversion réelle, la marge deviendrait fausse.
  perform lead_priv.crm_currency_guard(row, cur);
  update lead.dossier_crm
     set unit_price = _price, currency = coalesce(cur, currency),
         updated_at = now(), version = version + 1
   where dossier_id = _dossier;
  if _price is distinct from row.unit_price
     or coalesce(cur, row.currency) is distinct from row.currency then
    perform lead_priv.sap_note(_dossier, u, 'price:' || row.version::text,
      array[case when _price is null then 'Unit sales price cleared.'
            else 'Unit sales price set to ' || trim(to_char(_price,'FM999999999990.0000'))
                 || coalesce(' ' || coalesce(cur, row.currency), '') || '.' end]);
  end if;
  insert into lead.audit_log (actor, action, dossier_id, detail)
  values (u, 'crm_price_set', _dossier, jsonb_build_object('currency', coalesce(cur, row.currency)));
  return lead_priv.crm_project(_dossier);
end $$;

create or replace function public.lead_crm_set_price(p_dossier uuid, p_price numeric,
                                                     p_currency text,
                                                     p_expected_version integer)
returns jsonb language sql security invoker
set search_path = public, lead_priv, pg_temp as $$
  select lead_priv.crm_set_price(p_dossier, p_price, p_currency, p_expected_version); $$;

-- Réconciliation des accès dérivés d'un rôle de responsable.
--
-- Deux règles fermes :
--   * une affectation posée à la main (`source = 'manual'`) n'est JAMAIS
--     supprimée ici : elle a été accordée explicitement par un administrateur ;
--   * seules les affectations créées par ce mécanisme (`source = 'crm_owner'`)
--     sont retirées quand la personne n'est plus responsable.
create or replace function lead_priv.crm_reconcile_owner_access(_dossier uuid, _actor uuid)
returns void language plpgsql security definer
set search_path = lead, lead_priv, pg_temp as $$
declare owners uuid[]; x uuid; r record;
begin
  select coalesce(array_agg(p.user_id), '{}') into owners
    from lead.crm_directory p
    join lead.dossier_crm c on c.dossier_id = _dossier
   where p.user_id is not null and p.active
     and p.id in (c.sales_person, c.fae_person);

  for r in select a.user_id from lead.dossier_assignments a
            where a.dossier_id = _dossier and a.source = 'crm_owner'
              and not (a.user_id = any(owners)) loop
    delete from lead.dossier_assignments a
     where a.dossier_id = _dossier and a.user_id = r.user_id and a.source = 'crm_owner';
    insert into lead.audit_log (actor, action, dossier_id, detail)
    values (_actor, 'crm_assignment_revoked', _dossier,
            jsonb_build_object('user_id', r.user_id, 'source', 'crm_owner'));
  end loop;

  foreach x in array owners loop
    -- Un nom d'annuaire n'accorde rien : il faut un rôle staff actif.
    if lead_priv.role_of(x) is not null then
      insert into lead.dossier_assignments (dossier_id, user_id, assigned_by, source)
      values (_dossier, x, _actor, 'crm_owner')
      on conflict (dossier_id, user_id) do nothing; -- une affectation manuelle reste manuelle
      insert into lead.audit_log (actor, action, dossier_id, detail)
      values (_actor, 'crm_assignment_granted', _dossier,
              jsonb_build_object('user_id', x, 'source', 'crm_owner'));
    end if;
  end loop;
end $$;

-- Responsables : nommer une personne n'accorde AUCUN accès par elle-même.
-- L'affectation technique reste un acte d'ADMINISTRATION : un commercial peut
-- renseigner qui suit le projet, mais il ne peut pas s'en servir pour ouvrir
-- l'accès technique d'un tiers.
create or replace function lead_priv.crm_set_owners(_dossier uuid, _sales uuid, _fae uuid,
                                                    _expected integer)
returns jsonb language plpgsql security definer
set search_path = lead, lead_priv, pg_temp as $$
declare u uuid := lead_priv.require_user(); row lead.dossier_crm%rowtype;
        bullets text[] := '{}'; is_admin boolean;
begin
  perform lead_priv.crm_require_write(u, _dossier, array['sales']::lead.staff_role[]);
  is_admin := coalesce(lead_priv.role_of(u) = 'admin', false);
  if _sales is not null and not exists (select 1 from lead.crm_directory p
      where p.id = _sales and p.role = 'sales' and p.active) then
    raise exception 'BAD_PERSON' using errcode = '22023';
  end if;
  if _fae is not null and not exists (select 1 from lead.crm_directory p
      where p.id = _fae and p.role = 'fae' and p.active) then
    raise exception 'BAD_PERSON' using errcode = '22023';
  end if;
  row := lead_priv.crm_bump(_dossier, _expected);

  update lead.dossier_crm
     set sales_person = _sales, fae_person = _fae,
         updated_at = now(), version = version + 1
   where dossier_id = _dossier;

  if is_admin then
    perform lead_priv.crm_reconcile_owner_access(_dossier, u);
  end if;

  if row.sales_person is distinct from _sales then
    bullets := bullets || ('Sales owner: ' || coalesce((select p.first_name || ' ' || p.last_name
      from lead.crm_directory p where p.id = _sales), 'unassigned') || '.');
  end if;
  if row.fae_person is distinct from _fae then
    bullets := bullets || ('FAE owner: ' || coalesce((select p.first_name || ' ' || p.last_name
      from lead.crm_directory p where p.id = _fae), 'unassigned') || '.');
  end if;
  if array_length(bullets, 1) is not null and not is_admin then
    bullets := bullets || array['Technical access unchanged: assignments are granted by an administrator.'];
  end if;
  perform lead_priv.sap_note(_dossier, u, 'owners:' || row.version::text, bullets);
  insert into lead.audit_log (actor, action, dossier_id, detail)
  values (u, 'crm_owners_set', _dossier,
          jsonb_build_object('sales', _sales, 'fae', _fae, 'access_reconciled', is_admin));
  return lead_priv.crm_project(_dossier);
end $$;

create or replace function public.lead_crm_set_owners(p_dossier uuid, p_sales uuid,
                                                      p_fae uuid, p_expected_version integer)
returns jsonb language sql security invoker
set search_path = public, lead_priv, pg_temp as $$
  select lead_priv.crm_set_owners(p_dossier, p_sales, p_fae, p_expected_version); $$;

-- ----------------------------------------------------------------------------
-- 11. Plan d'action : modèle par étapes, puis items adaptables
-- ----------------------------------------------------------------------------
create or replace function lead_priv.crm_template()
returns table (stage lead.crm_stage, label text, stakeholder lead.crm_stakeholder, sort_order integer)
language sql immutable set search_path = pg_temp as $$
  select * from (values
    ('lead'::lead.crm_stage,           'Log incoming request and source',        'sales'::lead.crm_stakeholder, 10),
    ('lead',           'Identify company, project and country',                  'sales',  20),
    ('qualification',  'Collect application and detection requirements',         'fae',    10),
    ('qualification',  'Confirm annual sensor volume and series launch',         'sales',  20),
    ('qualification',  'Check NDA requirement with the customer',                'sales',  30),
    ('solution_quote', 'Technical review of the submitted design',               'fae',    10),
    ('solution_quote', 'Define unit cost (or read standard cost in SAP)',        'fae',    20),
    ('solution_quote', 'Define unit sales price and currency',                   'sales',  30),
    ('solution_quote', 'Publish customer feedback and quotation',                'sales',  40),
    ('negotiate',      'Customer review meeting and open points',                'sales',  10),
    ('negotiate',      'Ship samples and record customer tests',                 'fae',    20),
    ('negotiate',      'Customer validation of the exact part number',           'client', 30),
    ('closed_won',     'Confirm series launch plan and hand over to operations', 'sales',  10)
  ) as v(stage, label, stakeholder, sort_order);
$$;

-- Activation réelle de la prochaine action : l'âge d'une action commence
-- quand elle DEVIENT courante, pas quand le plan a été créé. Appelée après
-- toute création, tout changement de statut et tout changement d'étape.
create or replace function lead_priv.crm_refresh_activation(_dossier uuid)
returns void language plpgsql security definer
set search_path = lead, lead_priv, pg_temp as $$
declare cur uuid;
begin
  select t.id into cur from lead.dossier_tasks t
   where t.dossier_id = _dossier and t.status not in ('done','not_applicable')
   order by t.stage, t.sort_order, t.created_at limit 1;

  -- Les actions encore à venir perdent toute date d'activation héritée.
  update lead.dossier_tasks
     set activated_at = null
   where dossier_id = _dossier and activated_at is not null
     and status not in ('done','not_applicable')
     and (cur is null or id <> cur);

  -- L'action courante est datée du moment où elle l'est devenue, une seule
  -- fois : un enregistrement sans changement ne remet pas le compteur à zéro.
  if cur is not null then
    update lead.dossier_tasks set activated_at = now()
     where id = cur and activated_at is null;
  end if;
end $$;

create or replace function lead_priv.crm_apply_template(_dossier uuid, _expected integer)
returns jsonb language plpgsql security definer
set search_path = lead, lead_priv, pg_temp as $$
declare u uuid := lead_priv.require_user(); row lead.dossier_crm%rowtype; added integer := 0; r record;
begin
  perform lead_priv.crm_require_write(u, _dossier, array['sales','rnd']::lead.staff_role[]);
  row := lead_priv.crm_bump(_dossier, _expected);
  for r in select * from lead_priv.crm_template() loop
    if not exists (select 1 from lead.dossier_tasks t
                   where t.dossier_id = _dossier and t.stage = r.stage and t.label = r.label) then
      -- Une action FUTURE n'est pas « en cours » : elle n'a pas de date
      -- d'activation tant qu'elle n'est pas la prochaine action réelle.
      insert into lead.dossier_tasks (dossier_id, stage, label, stakeholder, sort_order, activated_at)
      values (_dossier, r.stage, r.label, r.stakeholder, r.sort_order, null);
      added := added + 1;
    end if;
  end loop;
  perform lead_priv.crm_refresh_activation(_dossier);
  update lead.dossier_crm set updated_at = now(), version = version + 1 where dossier_id = _dossier;
  if added > 0 then
    perform lead_priv.sap_note(_dossier, u, 'template:' || row.version::text,
      array['Action plan created with ' || added::text || ' standard steps.']);
  end if;
  return lead_priv.crm_project(_dossier);
end $$;

create or replace function public.lead_crm_apply_template(p_dossier uuid, p_expected_version integer)
returns jsonb language sql security invoker
set search_path = public, lead_priv, pg_temp as $$
  select lead_priv.crm_apply_template(p_dossier, p_expected_version); $$;

-- Clé d'idempotence de création : un même envoi rejoué (double-clic, reprise
-- réseau) ne doit pas créer deux fois la même action.
alter table lead.dossier_tasks add column if not exists client_key text;
create unique index if not exists dossier_tasks_client_key_uq
  on lead.dossier_tasks (dossier_id, client_key) where client_key is not null;

create or replace function lead_priv.crm_upsert_task(_dossier uuid, _task jsonb)
returns jsonb language plpgsql security definer
set search_path = lead, lead_priv, pg_temp as $$
declare u uuid := lead_priv.require_user(); tid uuid; cur lead.dossier_tasks%rowtype;
        st lead.crm_task_status; sh lead.crm_stakeholder; sg lead.crm_stage;
        lbl text; due date; na text; pid uuid; expected integer; ckey text;
begin
  perform lead_priv.crm_require_write(u, _dossier, array['sales','rnd']::lead.staff_role[]);
  if _task is null or jsonb_typeof(_task) <> 'object' then
    raise exception 'BAD_TASK' using errcode = '22023';
  end if;
  lbl := lead_priv.crm_patch_text(_task, 'label');
  if lbl is null then raise exception 'BAD_TASK' using errcode = '22023'; end if;
  begin sg := coalesce(_task->>'stage','lead')::lead.crm_stage;
        sh := coalesce(_task->>'stakeholder','sales')::lead.crm_stakeholder;
        st := coalesce(_task->>'status','todo')::lead.crm_task_status;
  exception when others then raise exception 'BAD_TASK' using errcode = '22023'; end;
  na := lead_priv.crm_patch_text(_task, 'na_reason');
  if st = 'not_applicable' and na is null then
    raise exception 'NA_REASON_REQUIRED' using errcode = '22023';
  end if;
  if nullif(_task->>'due_on','') is null then due := null; else
    if _task->>'due_on' !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'BAD_DATE' using errcode = '22023';
    end if;
    begin due := (_task->>'due_on')::date; exception when others then
      raise exception 'BAD_DATE' using errcode = '22023'; end;
  end if;
  pid := nullif(_task->>'person_id','')::uuid;
  if pid is not null and not exists (select 1 from lead.crm_directory p where p.id = pid and p.active) then
    raise exception 'BAD_PERSON' using errcode = '22023';
  end if;
  tid := nullif(_task->>'id','')::uuid;
  expected := nullif(_task->>'expected_version','')::integer;
  ckey := lead_priv.crm_patch_text(_task, 'client_key');

  if tid is null then
    if ckey is not null then
      select * into cur from lead.dossier_tasks
       where dossier_id = _dossier and client_key = ckey for update;
      if found then
        -- Rejeu exact : on rend l'état existant, sans second item ni seconde note.
        return lead_priv.crm_project(_dossier);
      end if;
    end if;
    insert into lead.dossier_tasks (dossier_id, stage, label, stakeholder, person_id,
      status, na_reason, due_on, sort_order, activated_at,
      done_at, done_by, client_key)
    values (_dossier, sg, lbl, sh, pid, st, na, due,
      coalesce(nullif(_task->>'sort_order','')::integer, 100), null,
      case when st = 'done' then now() end, case when st = 'done' then u end, ckey)
    returning id into tid;
    perform lead_priv.sap_note(_dossier, u, 'task_new:' || tid::text,
      array['Action added: ' || lbl || '.']);
  else
    -- Modifier un item existant sans version attendue serait une écriture à
    -- l'aveugle : elle est refusée.
    if expected is null then
      raise exception 'VERSION_REQUIRED' using errcode = '22023';
    end if;
    select * into cur from lead.dossier_tasks where id = tid and dossier_id = _dossier for update;
    if not found then raise exception 'TASK_NOT_FOUND' using errcode = '42501'; end if;
    if cur.version <> expected then
      raise exception 'CRM_CONFLICT:%', cur.version using errcode = '40001';
    end if;
    update lead.dossier_tasks
       set stage = sg, label = lbl, stakeholder = sh, person_id = pid,
           status = st, na_reason = case when st = 'not_applicable' then na else na end,
           due_on = due,
           sort_order = coalesce(nullif(_task->>'sort_order','')::integer, cur.sort_order),
           done_at = case when st = 'done' then coalesce(cur.done_at, now()) else null end,
           done_by = case when st = 'done' then coalesce(cur.done_by, u) else null end,
           updated_at = now(), version = version + 1
     where id = tid;
    if cur.status is distinct from st then
      perform lead_priv.sap_note(_dossier, u,
        'task:' || tid::text || ':' || cur.version::text || ':' || st::text,
        array[lbl || ' — status ' || replace(st::text,'_',' ')
              || case when st = 'not_applicable' then ' (' || coalesce(na,'') || ')' else '' end || '.']);
    end if;
  end if;
  perform lead_priv.crm_refresh_activation(_dossier);
  update lead.dossier_crm set updated_at = now() where dossier_id = _dossier;
  insert into lead.audit_log (actor, action, dossier_id, detail)
  values (u, 'crm_task_upsert', _dossier, jsonb_build_object('task', tid, 'status', st));
  return lead_priv.crm_project(_dossier);
end $$;

create or replace function public.lead_crm_upsert_task(p_dossier uuid, p_task jsonb)
returns jsonb language sql security invoker
set search_path = public, lead_priv, pg_temp as $$
  select lead_priv.crm_upsert_task(p_dossier, p_task); $$;

-- ----------------------------------------------------------------------------
-- 12. Notification client : créée UNIQUEMENT sur une revue réellement publiée.
--     Aucun fournisseur n'est branché : le statut ne peut pas valoir « envoyé ».
-- ----------------------------------------------------------------------------
create or replace function lead_priv.crm_queue_review_notification(_review uuid, _subject text,
                                                                   _summary text)
returns jsonb language plpgsql security definer
set search_path = lead, lead_priv, pg_temp as $$
declare u uuid := lead_priv.require_user(); rv lead.design_reviews%rowtype;
        loc text; sub text; sum text;
begin
  select * into rv from lead.design_reviews where id = _review;
  if not found then raise exception 'REVIEW_NOT_FOUND' using errcode = '42501'; end if;
  perform lead_priv.crm_require_write(u, rv.dossier_id, array['sales','rnd']::lead.staff_role[]);
  if not rv.published then raise exception 'REVIEW_NOT_PUBLISHED' using errcode = '42501'; end if;

  -- Langue du client : celle figée dans la révision soumise, jamais l'interface.
  select coalesce(nullif(r.snapshot->>'sourceLocale',''), 'fr') into loc
    from lead.design_revisions r where r.id = rv.revision_id;
  if loc !~ '^[a-z]{2}$' then loc := 'fr'; end if;

  sub := nullif(btrim(coalesce(_subject,'')), '');
  sum := nullif(btrim(coalesce(_summary,'')), '');
  if sub is null or sum is null then
    raise exception 'NOTIFICATION_INCOMPLETE' using errcode = '22023';
  end if;

  insert into lead.client_notifications (dossier_id, review_id, revision, created_by,
    locale, subject, summary, link_path)
  values (rv.dossier_id, rv.id, rv.revision, u, loc, sub, sum,
          '/?dossier=' || rv.dossier_id::text)
  on conflict (dossier_id, review_id) do nothing;

  perform lead_priv.sap_note(rv.dossier_id, u, 'notify:' || rv.id::text,
    array['Customer feedback queued for notification (revision '
          || rv.revision::text || ', language ' || loc || ').',
          'No email provider is configured yet: nothing has been sent.']);
  insert into lead.audit_log (actor, action, dossier_id, detail)
  values (u, 'crm_notification_queued', rv.dossier_id, jsonb_build_object('review', rv.id));
  return lead_priv.crm_project(rv.dossier_id);
end $$;

create or replace function public.lead_crm_queue_review_notification(p_review uuid,
  p_subject text, p_summary text)
returns jsonb language sql security invoker
set search_path = public, lead_priv, pg_temp as $$
  select lead_priv.crm_queue_review_notification(p_review, p_subject, p_summary); $$;

-- ----------------------------------------------------------------------------
-- 13. Administration : annuaire, rattachement de compte, rôles staff
-- ----------------------------------------------------------------------------
create or replace function lead_priv.crm_require_admin()
returns uuid language plpgsql stable security definer
set search_path = lead, lead_priv, pg_temp as $$
declare u uuid := lead_priv.require_user();
begin
  if lead_priv.role_of(u) is distinct from 'admin' then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  return u;
end $$;

create or replace function lead_priv.crm_admin_overview()
returns jsonb language plpgsql stable security definer
set search_path = lead, lead_priv, pg_temp as $$
declare u uuid := lead_priv.crm_require_admin();
begin
  return jsonb_build_object(
    'crm_version', '1.8',
    'directory', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id, 'first_name', p.first_name, 'last_name', p.last_name,
        'role', p.role, 'active', p.active, 'user_id', p.user_id,
        'email', (select au.email from auth.users au where au.id = p.user_id),
        'staff_role', lead_priv.role_of(p.user_id))
        order by lower(p.last_name), lower(p.first_name))
      from lead.crm_directory p), '[]'::jsonb),
    'staff', coalesce((select jsonb_agg(jsonb_build_object(
        'user_id', m.user_id, 'role', m.role, 'active', m.active,
        'display_name', coalesce(m.display_name, au.email), 'email', au.email)
        order by coalesce(m.display_name, au.email))
      from lead.staff_members m join auth.users au on au.id = m.user_id), '[]'::jsonb),
    'audit', coalesce((select jsonb_agg(jsonb_build_object(
        'at', l.at, 'action', l.action, 'dossier_id', l.dossier_id,
        'actor_name', lead_priv.crm_actor_name(l.actor), 'detail', l.detail)
        order by l.at desc)
      from (select * from lead.audit_log order by at desc limit 100) l), '[]'::jsonb));
end $$;

create or replace function public.lead_crm_admin_overview()
returns jsonb language sql stable security invoker
set search_path = public, lead_priv, pg_temp as $$ select lead_priv.crm_admin_overview(); $$;

create or replace function lead_priv.crm_admin_upsert_person(_id uuid, _first text, _last text,
  _role text, _active boolean)
returns jsonb language plpgsql security definer
set search_path = lead, lead_priv, pg_temp as $$
declare u uuid := lead_priv.crm_require_admin(); r lead.crm_person_role;
        f text := nullif(btrim(coalesce(_first,'')), ''); l text := nullif(btrim(coalesce(_last,'')), '');
begin
  if f is null or l is null then raise exception 'BAD_PERSON' using errcode = '22023'; end if;
  begin r := _role::lead.crm_person_role; exception when others then
    raise exception 'BAD_PERSON' using errcode = '22023'; end;
  if _id is null then
    insert into lead.crm_directory (first_name, last_name, role, active)
    values (f, l, r, coalesce(_active, true))
    on conflict do nothing;
  else
    update lead.crm_directory
       set first_name = f, last_name = l, role = r,
           active = coalesce(_active, active), updated_at = now()
     where id = _id;
  end if;
  insert into lead.audit_log (actor, action, detail)
  values (u, 'crm_person_upsert', jsonb_build_object('name', f || ' ' || l, 'role', r));
  return lead_priv.crm_admin_overview();
end $$;

create or replace function public.lead_crm_admin_upsert_person(p_id uuid, p_first_name text,
  p_last_name text, p_role text, p_active boolean)
returns jsonb language sql security invoker
set search_path = public, lead_priv, pg_temp as $$
  select lead_priv.crm_admin_upsert_person(p_id, p_first_name, p_last_name, p_role, p_active); $$;

-- Rattachement à un compte DÉJÀ inscrit, par e-mail saisi explicitement.
-- Aucun compte n'est créé, aucun rôle n'est accordé implicitement.
create or replace function lead_priv.crm_admin_link_person(_person uuid, _email text)
returns jsonb language plpgsql security definer
set search_path = lead, lead_priv, pg_temp as $$
declare u uuid := lead_priv.crm_require_admin(); target uuid;
        e text := lower(nullif(btrim(coalesce(_email,'')), ''));
begin
  if _person is null then raise exception 'BAD_PERSON' using errcode = '22023'; end if;
  if e is null then
    update lead.crm_directory set user_id = null, updated_at = now() where id = _person;
    perform lead_priv.crm_reconcile_owner_access(d, u)
       from (select c.dossier_id as d from lead.dossier_crm c
              where c.sales_person = _person or c.fae_person = _person) s(d);
    insert into lead.audit_log (actor, action, detail)
    values (u, 'crm_person_unlinked', jsonb_build_object('person', _person));
    return lead_priv.crm_admin_overview();
  end if;
  select id into target from auth.users where lower(email) = e;
  if target is null then raise exception 'ACCOUNT_NOT_FOUND' using errcode = '42501'; end if;
  if exists (select 1 from lead.crm_directory p where p.user_id = target and p.id <> _person) then
    raise exception 'ACCOUNT_ALREADY_LINKED' using errcode = '42501';
  end if;
  update lead.crm_directory set user_id = target, updated_at = now() where id = _person;
  -- Rebrancher une personne sur un autre compte change qui « suit » les dossiers
  -- où elle est responsable : les accès dérivés sont recalculés tout de suite,
  -- sinon l'ancien compte gardait un accès que plus rien ne justifie.
  perform lead_priv.crm_reconcile_owner_access(d, u)
     from (select c.dossier_id as d from lead.dossier_crm c
            where c.sales_person = _person or c.fae_person = _person) s(d);
  insert into lead.audit_log (actor, action, detail)
  values (u, 'crm_person_linked', jsonb_build_object('person', _person, 'user_id', target));
  return lead_priv.crm_admin_overview();
end $$;

create or replace function public.lead_crm_admin_link_person(p_person uuid, p_email text)
returns jsonb language sql security invoker
set search_path = public, lead_priv, pg_temp as $$
  select lead_priv.crm_admin_link_person(p_person, p_email); $$;

-- Rôle staff d'un compte existant + activation. Le dernier admin actif est protégé.
create or replace function lead_priv.crm_admin_set_staff(_user uuid, _role text, _active boolean)
returns jsonb language plpgsql security definer
set search_path = lead, lead_priv, pg_temp as $$
declare u uuid := lead_priv.crm_require_admin(); r lead.staff_role; act boolean := coalesce(_active, true);
        admins integer;
begin
  if _user is null or not exists (select 1 from auth.users a where a.id = _user) then
    raise exception 'ACCOUNT_NOT_FOUND' using errcode = '42501';
  end if;
  begin r := _role::lead.staff_role; exception when others then
    raise exception 'BAD_ROLE' using errcode = '22023'; end;

  -- Deux rétrogradations simultanées pouvaient chacune voir « 2 admins » et
  -- supprimer le dernier. Le décompte se fait donc sur des lignes verrouillées.
  select count(*) into admins from (
    select 1 from lead.staff_members m
     where m.role = 'admin' and m.active
     order by m.user_id
     for update
  ) locked;
  if admins <= 1 and exists (select 1 from lead.staff_members m
      where m.user_id = _user and m.role = 'admin' and m.active)
     and (r <> 'admin' or not act) then
    raise exception 'LAST_ADMIN_PROTECTED' using errcode = '42501';
  end if;

  insert into lead.staff_members (user_id, role, granted_by, active)
  values (_user, r, u, act)
  on conflict (user_id) do update set role = excluded.role, active = excluded.active;

  insert into lead.audit_log (actor, action, detail)
  values (u, 'crm_staff_set', jsonb_build_object('user_id', _user, 'role', r, 'active', act));
  return lead_priv.crm_admin_overview();
end $$;

create or replace function public.lead_crm_admin_set_staff(p_user uuid, p_role text, p_active boolean)
returns jsonb language sql security invoker
set search_path = public, lead_priv, pg_temp as $$
  select lead_priv.crm_admin_set_staff(p_user, p_role, p_active); $$;

-- ----------------------------------------------------------------------------
-- 13 bis. Historique réel du dossier dans les notes SAP
--
-- Les étapes existantes (révision soumise, revue publiée, offre, échantillons…)
-- écrivaient déjà dans `lead.audit_log` mais ne laissaient aucune trace dans le
-- suivi interne. On les reprend ici SANS toucher aux fonctions d'origine :
-- un déclencheur traduit l'ÉVÉNEMENT (jamais le texte libre français saisi par
-- le client ou par l'équipe) en une phrase anglaise structurée, avec une clé
-- d'événement unique par ligne d'audit — donc idempotente et rejouable.
-- ----------------------------------------------------------------------------
create or replace function lead_priv.crm_audit_sentence(_action text, _detail jsonb)
returns text language sql immutable set search_path = pg_temp as $$
  select case _action
    when 'dossier_created'    then 'Customer project created.'
    when 'revision_submitted' then 'Customer submitted design revision '
                                   || coalesce(_detail->>'revision','?') || '.'
    when 'review_published'   then 'Engineering feedback published for revision '
                                   || coalesce(_detail->>'revision','?') || '.'
    when 'offer_created'      then 'Commercial offer recorded for revision '
                                   || coalesce(_detail->>'revision','?') || '.'
    when 'samples_requested'  then 'Samples requested.'
    when 'sample_revalidated' then 'Sample request revalidated.'
    when 'variant_accepted'   then 'Design variant accepted.'
    when 'nda_prepared'       then 'NDA document prepared.'
    when 'nda_proof_recorded' then 'Signed NDA proof verified and recorded.'
    when 'nda_requirement_set' then case
        when coalesce((_detail->>'nda_required')::boolean, false)
          then 'NDA set as required for this project.'
        else 'NDA set as not required for this project.' end
    when 'dossier_assigned'   then 'Team member assigned to the project.'
    else null end;
$$;

-- `lead.audit_log` n'a AUCUNE clé étrangère : il conserve légitimement des
-- lignes dont le dossier a été supprimé et dont le compte auteur n'existe plus.
-- La reprise doit donc ignorer ces dossiers disparus et accepter un auteur
-- absent (référence vide, attribution conservée en texte), sans jamais modifier
-- l'historique, ressusciter un enregistrement ni désactiver une contrainte.
create or replace function lead_priv.crm_audit_note(_id bigint, _at timestamptz, _actor uuid,
                                                    _dossier uuid, _action text, _detail jsonb)
returns void language plpgsql security definer
set search_path = lead, lead_priv, pg_temp as $$
declare s text; nm text; known boolean;
begin
  if _dossier is null then return; end if;
  -- Dossier supprimé : rien à suivre, et surtout aucune référence à fabriquer.
  if not exists (select 1 from lead.design_dossiers d where d.id = _dossier) then return; end if;
  s := lead_priv.crm_audit_sentence(_action, _detail);
  if s is null then return; end if;
  known := _actor is not null and exists (select 1 from auth.users a where a.id = _actor);
  nm := case
    when _actor is null then 'Standex'
    when known then lead_priv.crm_actor_name(_actor)
    -- Compte supprimé : le nom connu est préservé s'il existe encore ailleurs,
    -- sinon l'attribution reste explicitement anonyme. On n'invente personne.
    else coalesce(
      (select nullif(btrim(p.first_name || ' ' || p.last_name), '')
         from lead.crm_directory p where p.user_id = _actor),
      (select nullif(btrim(m.display_name), '') from lead.staff_members m where m.user_id = _actor),
      'Former Standex user')
  end;
  -- La note porte la date de l'événement, pas celle de la migration : sinon
  -- tout l'historique repris partagerait le même instant et le tri « plus
  -- récent d'abord » contredirait la date écrite dans le corps de la note.
  -- Les avancements réellement nouveaux passent ici avec `at = now()`.
  insert into lead.sap_notes (dossier_id, created_at, author_id, author_name, event_key, body_en)
  values (_dossier, _at, case when known then _actor end, nm, 'audit:' || _id::text,
          to_char(_at at time zone 'UTC', 'DD/MM/YYYY') || ' - '
          || nm || ' :' || E'\n- ' || s)
  on conflict (dossier_id, event_key) do nothing;
end $$;

create or replace function lead_priv.crm_audit_note_trg()
returns trigger language plpgsql security definer
set search_path = lead, lead_priv, pg_temp as $$
begin
  -- Le suivi interne ne doit jamais faire échouer l'écriture d'origine.
  begin
    perform lead_priv.crm_audit_note(new.id, new.at, new.actor, new.dossier_id,
                                     new.action, new.detail);
  exception when others then
    null;
  end;
  return null;
end $$;

drop trigger if exists crm_audit_note on lead.audit_log;
create trigger crm_audit_note after insert on lead.audit_log
  for each row execute function lead_priv.crm_audit_note_trg();

-- Reprise de l'historique déjà existant, à l'identique et sans doublon.
do $$
declare l record;
begin
  for l in select id, at, actor, dossier_id, action, detail from lead.audit_log
            where dossier_id is not null order by id loop
    perform lead_priv.crm_audit_note(l.id, l.at, l.actor, l.dossier_id, l.action, l.detail);
  end loop;
end $$;

-- `lead_update_sample` d'origine n'écrit AUCUNE ligne d'audit : l'expédition,
-- la réception et le retour d'essais client échappaient donc au suivi SAP.
-- Intégration additive minimale : un déclencheur gardé sur les CHANGEMENTS
-- réels de `lead.sample_requests`. L'RPC d'origine et la provenance de
-- révision restent inchangées. Aucun texte client (langue d'origine) n'est
-- recopié dans une note interne censée être en anglais.
create or replace function lead_priv.crm_sample_note_trg()
returns trigger language plpgsql security definer
set search_path = lead, lead_priv, pg_temp as $$
declare u uuid; part text; qty text;
begin
  begin
    u := auth.uid();
    if u is not null and not exists (select 1 from auth.users a where a.id = u) then
      u := null;
    end if;
    part := coalesce(nullif(btrim(new.part_number), ''), 'unspecified part');
    qty  := coalesce(new.quantity::text, '?');
    -- Statut : uniquement sur transition réelle (même valeur = aucune note).
    if new.status is distinct from old.status then
      perform lead_priv.sap_note(new.dossier_id, u,
        'sample_status:' || new.id::text || ':' || new.status,
        array['Sample request ' || new.status || ' (' || part || ', '
              || qty || ' units, design revision ' || new.revision::text || ').']);
    end if;
    -- Retour d'essais : on enregistre l'événement, jamais le texte du client.
    if coalesce(btrim(new.feedback), '') <> ''
       and new.feedback is distinct from old.feedback then
      perform lead_priv.sap_note(new.dossier_id, u,
        'sample_feedback:' || new.id::text || ':' || md5(new.feedback),
        array['Customer test feedback recorded for ' || part || ' samples ('
              || qty || ' units, design revision '
              || coalesce(new.feedback_revision, new.revision)::text
              || '). See customer record for the original wording.']);
    end if;
  exception when others then
    null; -- Le suivi interne ne fait jamais échouer l'écriture d'origine.
  end;
  return null;
end $$;

drop trigger if exists crm_sample_note on lead.sample_requests;
create trigger crm_sample_note after update on lead.sample_requests
  for each row execute function lead_priv.crm_sample_note_trg();

revoke all on function lead_priv.crm_sample_note_trg() from public, anon, authenticated;




-- Rejeu d'une même demande : un double-clic ou une reprise réseau renvoyait
-- deux revues publiées et deux notifications. La clé de demande, produite par
-- l'écran et conservée pendant ses tentatives, rend l'opération unique.
create table if not exists lead.crm_requests (
  request_key text primary key,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  operation text not null,
  payload_hash text not null,
  dossier_id uuid references lead.design_dossiers(id) on delete cascade,
  review_id uuid references lead.design_reviews(id) on delete set null
);
alter table lead.crm_requests enable row level security;

-- Publication de revue + mise en file de notification, dans UNE transaction.
-- La publication passe par la fonction d'origine, avec ses gardes inchangées ;
-- si la mise en file échoue, la publication est annulée avec elle. Il ne peut
-- donc plus exister de revue publiée sans notification en attente.
create or replace function lead_priv.crm_publish_review_and_notify(
  _request_key text,
  _revision uuid, _scope text, _conditions text, _verdict text,
  _client_message text, _internal_note text, _exact_part_number text,
  _designation text, _variant jsonb, _subject text, _summary text)
returns jsonb language plpgsql security definer
set search_path = lead, lead_priv, pg_temp as $$
declare u uuid := lead_priv.require_user(); rid uuid; d uuid;
        k text; h text; ex lead.crm_requests%rowtype;
begin
  k := nullif(btrim(coalesce(_request_key, '')), '');
  if k is null then raise exception 'REQUEST_KEY_REQUIRED' using errcode = '22023'; end if;
  -- Empreinte du contenu : sérialisation JSON sans ambiguïté. Une simple
  -- concaténation séparée par des sauts de ligne laissait deux contenus
  -- DIFFÉRENTS produire la même empreinte (un « \n » déplacé d'un champ à
  -- l'autre) ; jsonb distingue les frontières de champs.
  h := md5(jsonb_build_object(
        'author', u::text,
        'revision', coalesce(_revision::text, ''),
        'scope', coalesce(_scope, ''),
        'conditions', coalesce(_conditions, ''),
        'verdict', coalesce(_verdict, ''),
        'client_message', coalesce(_client_message, ''),
        'internal_note', coalesce(_internal_note, ''),
        'exact_part_number', coalesce(_exact_part_number, ''),
        'designation', coalesce(_designation, ''),
        'variant', coalesce(_variant, '{}'::jsonb),
        'subject', coalesce(_subject, ''),
        'summary', coalesce(_summary, '')
      )::text);

  -- La réservation est prise AVANT de publier : deux tentatives simultanées ne
  -- peuvent donc pas publier chacune une revue avant que l'une échoue.
  begin
    insert into lead.crm_requests (request_key, created_by, operation, payload_hash)
    values (k, u, 'publish_review_and_notify', h);
  exception when unique_violation then
    select * into ex from lead.crm_requests where request_key = k for update;
    if not found then raise exception 'REQUEST_IN_PROGRESS' using errcode = '40001'; end if;
    -- Une clé appartient à son auteur : personne d'autre ne reprend sa demande.
    if ex.created_by <> u then
      raise exception 'REQUEST_KEY_CONFLICT' using errcode = '22023';
    end if;
    -- Même clé, autre contenu : on refuse plutôt que d'écraser une décision.
    if ex.operation <> 'publish_review_and_notify' or ex.payload_hash <> h then
      raise exception 'REQUEST_KEY_CONFLICT' using errcode = '22023';
    end if;

    -- Même clé, même contenu : on rend l'état déjà obtenu, sans rien recréer.
    if ex.review_id is null then
      raise exception 'REQUEST_IN_PROGRESS' using errcode = '40001';
    end if;
    return lead_priv.crm_project(ex.dossier_id);
  end;

  rid := public.lead_publish_review(_revision, _scope, _conditions, _verdict,
           _client_message, _internal_note, _exact_part_number, _designation,
           coalesce(_variant, '{}'::jsonb));
  select r.dossier_id into d from lead.design_reviews r where r.id = rid;
  update lead.crm_requests set dossier_id = d, review_id = rid where request_key = k;
  return lead_priv.crm_queue_review_notification(rid, _subject, _summary);

end $$;

create or replace function public.lead_crm_publish_review_and_notify(
  p_request_key text,
  p_revision_id uuid, p_scope text, p_conditions text, p_verdict text,
  p_client_message text, p_internal_note text, p_exact_part_number text,
  p_designation text, p_variant jsonb, p_subject text, p_summary text)
returns jsonb language sql security invoker
set search_path = public, lead_priv, pg_temp as $$
  select lead_priv.crm_publish_review_and_notify(p_request_key, p_revision_id, p_scope,
    p_conditions, p_verdict, p_client_message, p_internal_note, p_exact_part_number,
    p_designation, p_variant, p_subject, p_summary); $$;

-- L'ancienne signature sans clé de demande ne doit plus exister : elle
-- permettait exactement le doublon que cette version corrige.
drop function if exists public.lead_crm_publish_review_and_notify(
  uuid, text, text, text, text, text, text, text, jsonb, text, text);
drop function if exists lead_priv.crm_publish_review_and_notify(
  uuid, text, text, text, text, text, text, text, jsonb, text, text);



-- ----------------------------------------------------------------------------
-- 14. Annuaire prérempli — CHOIX MÉTIER, aucun compte, aucun e-mail inventé
-- ----------------------------------------------------------------------------
insert into lead.crm_directory (first_name, last_name, role) values
  ('Thomas','Franke','sales'),
  ('Gilles','Servant','sales'),
  ('Thomas','Loarec','sales'),
  ('Aleksander','Wlos','sales'),
  ('Daniel','Gutierrez Blanco','sales'),
  ('Giuseppe','De Ponte','sales'),
  ('Hemant','Singh','sales'),
  ('Marco','Nagel','sales'),
  ('Sascha','Knoblauch','fae'),
  ('Tobias','Rudolf','fae'),
  ('Erich','Hoerl','fae'),
  ('Elena','Tischer','fae')
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- 15. Permissions.
--
-- Règle : un utilisateur connecté n'exécute JAMAIS un utilitaire interne.
-- L'ancienne boucle « grant à tout ce qui s'appelle crm_% » laissait par exemple
-- `crm_row_json` (données internes d'un dossier étranger) et `sap_note`
-- (fabrication d'une note d'administrateur) accessibles à n'importe quel compte
-- authentifié. Tout est donc révoqué, y compris pour `authenticated`, puis
-- SEULS les points d'entrée réellement contrôlés sont rouverts.
-- ----------------------------------------------------------------------------
do $$
declare f text;
begin
  for f in select 'lead_priv.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'lead_priv'
              and (p.proname like 'crm\_%' escape '\'
                   or p.proname in ('sap_note','sap_notes_append_only'))
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;

revoke all on function lead_priv.role_of(uuid) from public, anon, authenticated;

-- Points d'entrée contrôlés : chacun vérifie l'identité (`require_user`), le
-- rôle staff actif et l'affectation au dossier avant toute lecture ou écriture.
do $$
declare f text;
  entrypoints text[] := array['crm_capabilities','crm_board','crm_project','crm_set_stage',
    'crm_set_fields','crm_set_cost','crm_set_price','crm_set_owners','crm_apply_template',
    'crm_upsert_task','crm_queue_review_notification','crm_publish_review_and_notify',
    'crm_admin_overview','crm_admin_upsert_person','crm_admin_link_person','crm_admin_set_staff'];
begin
  for f in select 'lead_priv.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'lead_priv' and p.proname = any(entrypoints)
  loop
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  for f in select 'public.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like 'lead\_crm\_%' escape '\'
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- Les tables restent inaccessibles directement : tout passe par les fonctions.
revoke all on lead.crm_directory, lead.dossier_crm, lead.dossier_tasks,
              lead.sap_notes, lead.client_notifications, lead.crm_requests
         from public, anon, authenticated;

insert into lead.schema_migrations (version) values ('1.8')
on conflict (version) do nothing;

commit;

-- ============================================================================
-- CONTRAT AJOUTÉ (tous authentifiés ; rôle + affectation vérifiés côté serveur)
--   public.lead_crm_capabilities() -> jsonb            [sonde distincte, v1.8]
--   public.lead_crm_board() -> jsonb
--   public.lead_crm_project(dossier uuid) -> jsonb
--   public.lead_crm_set_stage(dossier, stage text, expected_version int) -> jsonb
--   public.lead_crm_set_fields(dossier, patch jsonb, expected_version int) -> jsonb
--   public.lead_crm_set_cost(dossier, cost numeric, cost_in_sap bool, expected int) -> jsonb
--   public.lead_crm_set_price(dossier, price numeric, currency text, expected int) -> jsonb
--   public.lead_crm_set_owners(dossier, sales uuid, fae uuid, expected int) -> jsonb
--   public.lead_crm_apply_template(dossier, expected int) -> jsonb
--   public.lead_crm_upsert_task(dossier, task jsonb) -> jsonb
--   public.lead_crm_queue_review_notification(review uuid, subject, summary) -> jsonb
--   public.lead_crm_publish_review_and_notify(request_key text, revision uuid,
--       scope, conditions, verdict, client_message, internal_note,
--       exact_part_number, designation, variant jsonb, subject, summary) -> jsonb
--       [publication + mise en file dans UNE transaction, rejouable sans doublon]
--   public.lead_crm_admin_overview() -> jsonb
--   public.lead_crm_admin_upsert_person(id, first, last, role, active) -> jsonb
--   public.lead_crm_admin_link_person(person uuid, email text) -> jsonb
--   public.lead_crm_admin_set_staff(user uuid, role text, active bool) -> jsonb
-- Erreurs : AUTH_REQUIRED, NOT_ALLOWED, DOSSIER_NOT_FOUND, TASK_NOT_FOUND,
--   REVIEW_NOT_FOUND, REVIEW_NOT_PUBLISHED, CRM_CONFLICT:<version>, BAD_STAGE,
--   BAD_PATCH, BAD_COUNTRY, BAD_CURRENCY, BAD_DATE, BAD_COST, BAD_PRICE,
--   BAD_PERSON, BAD_ROLE, BAD_TASK, BAD_ESTIMATE, BAD_ANNUAL_VOLUME,
--   NA_REASON_REQUIRED, NOTIFICATION_INCOMPLETE, ACCOUNT_NOT_FOUND,
--   REQUEST_KEY_REQUIRED, REQUEST_KEY_CONFLICT, REQUEST_IN_PROGRESS,
--   ACCOUNT_ALREADY_LINKED, LAST_ADMIN_PROTECTED, SAP_NOTES_APPEND_ONLY
-- ============================================================================
