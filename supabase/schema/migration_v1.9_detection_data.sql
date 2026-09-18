-- ============================================================================
-- Lead Magnet — migration ADDITIVE 1.9 : annuaire des données de détection
-- Date : 2026-09-18
-- ÉTAT : PRÉPARÉE POUR REVUE. NON APPLIQUÉE par cette livraison.
--
-- Objet : permettre à un ADMINISTRATEUR Standex de saisir et de corriger les
-- distances réelles d'activation (pull-in) et de relâchement (drop-out) pour
-- des combinaisons EXACTES capteur / variante / classe ou modèle de contact /
-- aimant / approche / datum, y compris celles qui n'ont aujourd'hui AUCUNE
-- donnée compilée, et faire servir ces valeurs aux simulations du site.
--
-- Règles non négociables reprises telles quelles :
--   * les plages « up / to » du guide d'activation (brochure 40 pages) ne sont
--     PAS des seuils : elles ne vivent pas dans cette table, ne sont jamais
--     converties en pull-in/drop-out, jamais triées. Cette table ne contient
--     QUE de vraies distances de commutation saisies par l'ingénierie ;
--   * une valeur manquante reste NULL : jamais zéro, jamais une valeur par
--     défaut, jamais empruntée à une autre famille ou à un autre aimant ;
--   * une ligne incomplète est un BROUILLON (`status = 'draft'`) : elle est
--     lisible dans l'annuaire d'administration et n'est JAMAIS servie aux
--     simulations ;
--   * aucune donnée client existante n'est modifiée : additif seulement.
--
-- Sécurité : schémas `lead` / `lead_priv` non exposés, wrappers publics
-- invoker, `search_path` sûr, RLS active, tables inaccessibles directement,
-- écriture réservée au rôle admin réel du serveur, compare-and-swap sur chaque
-- écriture, journal des anciennes et nouvelles valeurs avec acteur et date.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Table des lignes de détection saisies par l'ingénierie
-- ----------------------------------------------------------------------------
create table if not exists lead.detection_rows (
  id uuid primary key default gen_random_uuid(),
  -- Famille et référence EXACTES : « MK06-4 » n'est pas « MK06 », la variante
  -- imprimée (« MK15-B-X ») est conservée telle quelle.
  sensor_family text not null check (length(btrim(sensor_family)) between 1 and 40),
  sensor_reference text not null check (length(btrim(sensor_reference)) between 1 and 60),
  -- Nature de la colonne de gauche : classe de sensibilité A–E, ou modèle de
  -- contact de la fiche. Jamais l'une convertie dans l'autre.
  class_kind text not null check (class_kind in ('sensitivity','switch_model')),
  sensitivity_class text not null check (length(btrim(sensitivity_class)) between 1 and 20),
  contact_form text not null check (contact_form in ('1A','1B','1C')),
  magnet_id text not null check (length(btrim(magnet_id)) between 1 and 60),
  approach_id text not null check (approach_id in ('D1','D2','D3','D4','D5','F1')),
  datum text not null check (datum in ('lateral_surface','frontal_faces')),
  threshold_kind text not null check (threshold_kind in ('typical','min_activation_max_release')),
  -- Distances réelles de commutation, en millimètres. NULL = inconnu.
  pull_in_mm numeric check (pull_in_mm is null or (pull_in_mm > 0 and pull_in_mm < 1000)),
  drop_out_mm numeric check (drop_out_mm is null or (drop_out_mm > 0 and drop_out_mm < 1000)),
  temperature_c numeric check (temperature_c is null or (temperature_c > -273 and temperature_c < 500)),
  status text not null default 'draft' check (status in ('draft','validated')),
  -- Provenance signifiante exigée : fiche, page, essai, date.
  source_type text not null check (length(btrim(source_type)) between 2 and 40),
  source_ref text not null check (length(btrim(source_ref)) >= 8),
  entered_on date not null,
  note text check (note is null or length(note) <= 2000),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  -- Le relâchement est STRICTEMENT plus loin que l'activation : c'est
  -- l'hystérésis physique du contact, jamais l'inverse ni l'égalité.
  constraint detection_order check (
    pull_in_mm is null or drop_out_mm is null or drop_out_mm > pull_in_mm),
  -- Une ligne servie aux simulations est complète, par construction.
  constraint detection_validated_complete check (
    status <> 'validated'
    or (pull_in_mm is not null and drop_out_mm is not null and drop_out_mm > pull_in_mm)),
  -- Le datum frontal appartient à l'approche frontale, et réciproquement.
  constraint detection_datum_matches_approach check (
    (approach_id = 'F1' and datum = 'frontal_faces')
    or (approach_id <> 'F1' and datum = 'lateral_surface'))
);

-- Clé métier : la même combinaison exacte ne peut pas exister deux fois.
create unique index if not exists detection_rows_key_idx
  on lead.detection_rows (sensor_family, sensitivity_class, contact_form, magnet_id, approach_id);
create index if not exists detection_rows_family_idx on lead.detection_rows (sensor_family);

alter table lead.detection_rows enable row level security;

-- ----------------------------------------------------------------------------
-- 2. Journal : ancienne valeur, nouvelle valeur, acteur, date, source
--    Insert-only. Aucune suppression, aucune mise à jour côté client.
-- ----------------------------------------------------------------------------
create table if not exists lead.detection_audit (
  id bigserial primary key,
  row_id uuid,
  at timestamptz not null default now(),
  actor uuid references auth.users(id) on delete set null,
  action text not null check (action in ('detection_row_created','detection_row_updated')),
  old_value jsonb,
  new_value jsonb not null
);
create index if not exists detection_audit_row_idx on lead.detection_audit (row_id, at desc);
alter table lead.detection_audit enable row level security;


-- ----------------------------------------------------------------------------
-- 2bis. Catalogue AUTORISÉ, côté serveur
--    Le serveur n'accepte que des identifiants RÉELS du catalogue du site. La
--    démonstration pédagogique (« GENERIC ») et le « sur mesure » (« CUSTOM »)
--    n'y figurent pas : ils ne peuvent donc pas recevoir de distances.
--    Les variantes documentées de la famille M21 (« M21P/1 », « M21P/2 ») sont
--    listées telles qu'imprimées, sans alias ni conversion.
-- ----------------------------------------------------------------------------
create table if not exists lead.detection_sensor_allow (
  sensor_family text primary key,
  guide_only boolean not null default false
);
create table if not exists lead.detection_magnet_allow (
  magnet_id text primary key,
  guide_only boolean not null default false
);
alter table lead.detection_sensor_allow enable row level security;
alter table lead.detection_magnet_allow enable row level security;

insert into lead.detection_sensor_allow (sensor_family) values
  ('MK01'),
  ('MK15'),
  ('MK16'),
  ('MK17'),
  ('MK22'),
  ('MK30'),
  ('MK31'),
  ('MK06-4'),
  ('MK24-A-J'),
  ('MK03'),
  ('MK02'),
  ('MK04'),
  ('MK05'),
  ('MK13'),
  ('MK14'),
  ('MK18'),
  ('MK20_1'),
  ('MK20_2'),
  ('MK21'),
  ('MK21PR'),
  ('MK26'),
  ('MK27'),
  ('MK11-M5'),
  ('MK11-M8'),
  ('MK11-P-M8'),
  ('MK11-B-M6'),
  ('MK36'),
  ('MK37'),
  ('MK38')
on conflict (sensor_family) do nothing;

-- Familles présentes UNIQUEMENT dans le guide (brochure) : elles acceptent une
-- plage documentaire, pas une distance de commutation.
insert into lead.detection_sensor_allow (sensor_family, guide_only) values
  ('MK06-5', true),
  ('MK06-6', true),
  ('MK06-7', true),
  ('MK06-8', true),
  ('MK07', true),
  ('MK12', true)
on conflict (sensor_family) do nothing;

insert into lead.detection_magnet_allow (magnet_id) values
  ('M02'),
  ('M03'),
  ('M04'),
  ('M05'),
  ('M13'),
  ('M13B'),
  ('M11P'),
  ('M11S'),
  ('M21'),
  ('M21P/1'),
  ('M21P/2'),
  ('M27'),
  ('M36'),
  ('M37'),
  ('M38'),
  ('M36-N42'),
  ('M37-N42'),
  ('M38-N42'),
  ('4003004003'),
  ('SMCO5-5X4'),
  ('N45-4X19'),
  ('NDFEB-10X5X1.9'),
  ('HF3225-14.95X10X5'),
  ('ALNICO500-5.5X22'),
  ('ALNICO500-4X19'),
  ('ALNICO500-3.7X22'),
  ('N35-4X2'),
  ('ALNICO-2.5X12.7'),
  ('ALNICO-3X12'),
  ('ALNICO-4X19'),
  ('ALNICO-5X4'),
  ('ALNICO-5X20'),
  ('ALNICO-5.5X22'),
  ('ALNICO-7.5X27'),
  ('ALNICO-3.2X3.2X19'),
  ('N35-4X19'),
  ('N35H-4X19'),
  ('NDFEB250175H-6X10'),
  ('NDFEB250175H-10X5X1.9'),
  ('SMCO5-1.9X3'),
  ('SMCO5-3X4'),
  ('HF2826-2.6X2.6X4'),
  ('HF2826-3.5X1.8X1.8'),
  ('HF2826-6.7X6.7X2.7')
on conflict (magnet_id) do nothing;

-- Révision DÉTERMINISTE du jeu effectif : incrémentée dans la MÊME transaction
-- que chaque écriture. Deux écritures distinctes ne peuvent pas partager une
-- révision, même si elles portent sur des lignes différentes.
create table if not exists lead.detection_state (
  singleton boolean primary key default true check (singleton),
  revision bigint not null default 0,
  guide_revision bigint not null default 0
);
insert into lead.detection_state (singleton) values (true) on conflict do nothing;
alter table lead.detection_state enable row level security;

create or replace function lead_priv.detection_bump(_guide boolean)
returns bigint language sql
set search_path = lead, lead_priv, pg_temp as $$
  update lead.detection_state
     set revision = revision + (case when _guide then 0 else 1 end),
         guide_revision = guide_revision + (case when _guide then 1 else 0 end)
   where singleton
  returning case when _guide then guide_revision else revision end;
$$;

-- ----------------------------------------------------------------------------
-- 2ter. Plages DOCUMENTAIRES du guide d'activation (brochure 40 pages)
--    « up » et « to » sont les colonnes IMPRIMÉES. Ce ne sont PAS des seuils
--    d'activation ni de relâchement. Elles ne sont jamais converties, jamais
--    triées : aucune contrainte d'ordre n'existe ici, parce que la brochure
--    imprime elle-même des lignes où « up » dépasse « to ».
-- ----------------------------------------------------------------------------
create table if not exists lead.guide_rows (
  id uuid primary key default gen_random_uuid(),
  page integer check (page is null or (page between 1 and 400)),
  sensor_family text not null,
  sensor_reference text not null check (length(btrim(sensor_reference)) between 1 and 60),
  magnet_id text not null,
  approach_id text not null check (approach_id in ('D1','D2','D3','D4','D5')),
  up_mm numeric check (up_mm is null or (up_mm >= 0 and up_mm < 1000)),
  to_mm numeric check (to_mm is null or (to_mm >= 0 and to_mm < 1000)),
  up_note text check (up_note is null or up_note in ('not_published','below_zero')),
  to_note text check (to_note is null or to_note in ('not_published','below_zero')),
  status text not null default 'draft' check (status in ('draft','validated')),
  source_ref text not null check (length(btrim(source_ref)) >= 8),
  entered_on date not null,
  note text check (note is null or length(note) <= 2000),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  -- Une ligne servie porte au moins une borne lisible.
  constraint guide_validated_readable check (
    status <> 'validated' or up_mm is not null or to_mm is not null)
);
create unique index if not exists guide_rows_key_idx
  on lead.guide_rows (sensor_reference, magnet_id, approach_id);
alter table lead.guide_rows enable row level security;

create table if not exists lead.guide_audit (
  id bigserial primary key,
  row_id uuid,
  at timestamptz not null default now(),
  actor uuid references auth.users(id) on delete set null,
  action text not null check (action in ('guide_row_created','guide_row_updated')),
  old_value jsonb,
  new_value jsonb not null
);
alter table lead.guide_audit enable row level security;

-- ----------------------------------------------------------------------------
-- 3. Lecture EFFECTIVE, moindre privilège
--    Seules les lignes validées et complètes sortent, et uniquement les champs
--    techniques : aucun acteur, aucune note interne, aucun horodatage d'auteur.
-- ----------------------------------------------------------------------------
create or replace function lead_priv.detection_effective()
returns jsonb language sql stable security definer
set search_path = lead, lead_priv, pg_temp as $$
  select jsonb_build_object(
    'version', '1.9',
    'dataRevision', (select revision::text from lead.detection_state where singleton),
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'sensorFamily', r.sensor_family,
        'sensorReference', r.sensor_reference,
        'classKind', r.class_kind,
        'sensitivityClass', r.sensitivity_class,
        'contactForm', r.contact_form,
        'magnetId', r.magnet_id,
        'approachId', r.approach_id,
        'datum', r.datum,
        'thresholdKind', r.threshold_kind,
        'pullInMm', r.pull_in_mm,
        'dropOutMm', r.drop_out_mm,
        'temperatureC', r.temperature_c,
        'sourceType', r.source_type,
        'sourceRef', r.source_ref,
        'enteredOn', r.entered_on,
        'rowVersion', r.version)
        order by r.sensor_family, r.sensitivity_class, r.magnet_id, r.approach_id)
      from lead.detection_rows r
      where r.status = 'validated'
        and r.pull_in_mm is not null and r.drop_out_mm is not null), '[]'::jsonb));
$$;

create or replace function public.lead_detection_effective()
returns jsonb language sql stable security invoker
set search_path = public, lead_priv, pg_temp as $$
  select lead_priv.detection_effective(); $$;

-- ----------------------------------------------------------------------------
-- 4. Annuaire d'administration : tout, brouillons compris
-- ----------------------------------------------------------------------------
create or replace function lead_priv.detection_directory()
returns jsonb language plpgsql stable security definer
set search_path = lead, lead_priv, pg_temp as $$
declare u uuid := lead_priv.crm_require_admin();
begin
  return jsonb_build_object(
    'version', '1.9',
    'actor', u,
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'sensorFamily', r.sensor_family,
        'sensorReference', r.sensor_reference,
        'classKind', r.class_kind,
        'sensitivityClass', r.sensitivity_class,
        'contactForm', r.contact_form,
        'magnetId', r.magnet_id,
        'approachId', r.approach_id,
        'datum', r.datum,
        'thresholdKind', r.threshold_kind,
        'pullInMm', r.pull_in_mm,
        'dropOutMm', r.drop_out_mm,
        'temperatureC', r.temperature_c,
        'status', r.status,
        'sourceType', r.source_type,
        'sourceRef', r.source_ref,
        'enteredOn', r.entered_on,
        'note', r.note,
        'rowVersion', r.version,
        'updatedAt', r.updated_at,
        'updatedBy', lead_priv.crm_actor_name(r.updated_by))
        order by r.sensor_family, r.sensitivity_class, r.magnet_id, r.approach_id)
      from lead.detection_rows r), '[]'::jsonb));
end $$;

create or replace function public.lead_detection_directory()
returns jsonb language sql stable security invoker
set search_path = public, lead_priv, pg_temp as $$
  select lead_priv.detection_directory(); $$;

-- ----------------------------------------------------------------------------
-- 5. Écriture atomique, réservée à l'administrateur, avec compare-and-swap
--    `p_expected_version` : NULL pour une création, la version lue pour une
--    mise à jour. Toute divergence lève DETECTION_CONFLICT et n'écrit rien.
-- ----------------------------------------------------------------------------
create or replace function lead_priv.detection_save_row(_payload jsonb, _expected_version integer)
returns jsonb language plpgsql security definer
set search_path = lead, lead_priv, pg_temp as $$
declare
  u uuid := lead_priv.crm_require_admin();
  cur lead.detection_rows;
  res lead.detection_rows;
  old_json jsonb;
  pull numeric := nullif(_payload->>'pullInMm','')::numeric;
  drop_out numeric := nullif(_payload->>'dropOutMm','')::numeric;
  st text := coalesce(nullif(_payload->>'status',''), 'draft');
begin
  if _payload is null or jsonb_typeof(_payload) <> 'object' then
    raise exception 'DETECTION_BAD_PAYLOAD' using errcode = '22023';
  end if;
  if st not in ('draft','validated') then
    raise exception 'DETECTION_BAD_STATUS' using errcode = '22023';
  end if;
  -- Un brouillon n'est jamais servi : il peut rester incomplet. Une ligne
  -- validée doit porter deux distances finies, dans l'ordre physique.
  if st = 'validated' and (pull is null or drop_out is null or drop_out <= pull) then
    raise exception 'DETECTION_INCOMPLETE' using errcode = '22023';
  end if;
  -- Catalogue RÉEL : un capteur ou un aimant inconnu est refusé ici, pas
  -- seulement dans l'écran. La démonstration et le sur mesure sont absents de
  -- la liste et donc refusés par construction.
  if not exists (select 1 from lead.detection_sensor_allow a
                  where a.sensor_family = _payload->>'sensorFamily' and not a.guide_only) then
    raise exception 'DETECTION_UNKNOWN_SENSOR' using errcode = '22023';
  end if;
  if not exists (select 1 from lead.detection_magnet_allow a
                  where a.magnet_id = _payload->>'magnetId') then
    raise exception 'DETECTION_UNKNOWN_MAGNET' using errcode = '22023';
  end if;
  if coalesce(_payload->>'classKind','') not in ('sensitivity','switch_model')
     or coalesce(_payload->>'contactForm','') not in ('1A','1B','1C')
     or coalesce(_payload->>'approachId','') not in ('D1','D2','D3','D4','D5','F1')
     or coalesce(_payload->>'thresholdKind','') not in ('typical','min_activation_max_release')
     or (_payload->>'approachId' = 'F1') <> (_payload->>'datum' = 'frontal_faces')
     or length(btrim(coalesce(_payload->>'sensorReference',''))) not between 1 and 64
     or length(btrim(coalesce(_payload->>'sensitivityClass',''))) not between 1 and 32
     or length(btrim(coalesce(_payload->>'sourceType',''))) not between 2 and 64
     or length(btrim(coalesce(_payload->>'sourceRef',''))) < 8
     or length(coalesce(_payload->>'note','')) > 2000 then
    raise exception 'DETECTION_BAD_PAYLOAD' using errcode = '22023';
  end if;
  -- Une date de saisie existe et n'est pas dans l'avenir.
  if coalesce(nullif(_payload->>'enteredOn','')::date, current_date) > current_date then
    raise exception 'DETECTION_BAD_PAYLOAD' using errcode = '22023';
  end if;
  if (pull is not null and pull <= 0) or (drop_out is not null and drop_out <= 0) then
    raise exception 'DETECTION_BAD_PAYLOAD' using errcode = '22023';
  end if;

  select * into cur from lead.detection_rows
   where sensor_family = _payload->>'sensorFamily'
     and sensitivity_class = _payload->>'sensitivityClass'
     and contact_form = _payload->>'contactForm'
     and magnet_id = _payload->>'magnetId'
     and approach_id = _payload->>'approachId'
   for update;

  if cur.id is null then
    if _expected_version is not null then
      raise exception 'DETECTION_CONFLICT:0' using errcode = '40001';
    end if;
    insert into lead.detection_rows (sensor_family, sensor_reference, class_kind,
      sensitivity_class, contact_form, magnet_id, approach_id, datum, threshold_kind,
      pull_in_mm, drop_out_mm, temperature_c, status, source_type, source_ref,
      entered_on, note, updated_by)
    values (_payload->>'sensorFamily', _payload->>'sensorReference', _payload->>'classKind',
      _payload->>'sensitivityClass', _payload->>'contactForm', _payload->>'magnetId',
      _payload->>'approachId', _payload->>'datum', _payload->>'thresholdKind',
      pull, drop_out, nullif(_payload->>'temperatureC','')::numeric, st,
      _payload->>'sourceType', _payload->>'sourceRef',
      coalesce(nullif(_payload->>'enteredOn','')::date, current_date),
      nullif(_payload->>'note',''), u)
    returning * into res;
    insert into lead.detection_audit (row_id, actor, action, old_value, new_value)
    values (res.id, u, 'detection_row_created', null, to_jsonb(res));
  else
    if _expected_version is null or cur.version <> _expected_version then
      raise exception 'DETECTION_CONFLICT:%', cur.version using errcode = '40001';
    end if;
    old_json := to_jsonb(cur);
    update lead.detection_rows set
      sensor_reference = _payload->>'sensorReference',
      class_kind = _payload->>'classKind',
      datum = _payload->>'datum',
      threshold_kind = _payload->>'thresholdKind',
      pull_in_mm = pull,
      drop_out_mm = drop_out,
      temperature_c = nullif(_payload->>'temperatureC','')::numeric,
      status = st,
      source_type = _payload->>'sourceType',
      source_ref = _payload->>'sourceRef',
      entered_on = coalesce(nullif(_payload->>'enteredOn','')::date, cur.entered_on),
      note = nullif(_payload->>'note',''),
      version = cur.version + 1,
      updated_at = now(),
      updated_by = u
     where id = cur.id
    returning * into res;
    insert into lead.detection_audit (row_id, actor, action, old_value, new_value)
    values (res.id, u, 'detection_row_updated', old_json, to_jsonb(res));
  end if;

  perform lead_priv.detection_bump(false);
  return jsonb_build_object('id', res.id, 'rowVersion', res.version, 'status', res.status,
    'updatedAt', res.updated_at);
end $$;

create or replace function public.lead_detection_save_row(p_payload jsonb, p_expected_version integer)
returns jsonb language sql security invoker
set search_path = public, lead_priv, pg_temp as $$
  select lead_priv.detection_save_row(p_payload, p_expected_version); $$;


-- ----------------------------------------------------------------------------
-- 5bis. Plages du guide : lecture effective, annuaire, écriture
--    Sémantique DOCUMENTAIRE conservée de bout en bout : aucune borne n'est
--    réordonnée, aucune n'est transformée en seuil de commutation.
-- ----------------------------------------------------------------------------
create or replace function lead_priv.guide_effective()
returns jsonb language sql stable security definer
set search_path = lead, lead_priv, pg_temp as $$
  select jsonb_build_object(
    'version', '1.9',
    'dataRevision', (select guide_revision::text from lead.detection_state where singleton),
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
        'id', g.id, 'page', g.page,
        'sensorFamily', g.sensor_family, 'sensorReference', g.sensor_reference,
        'magnetId', g.magnet_id, 'approachId', g.approach_id,
        'upMm', g.up_mm, 'toMm', g.to_mm,
        'upNote', g.up_note, 'toNote', g.to_note,
        'sourceRef', g.source_ref, 'enteredOn', g.entered_on,
        'rowVersion', g.version)
        order by g.sensor_reference, g.magnet_id, g.approach_id)
      from lead.guide_rows g
      where g.status = 'validated'
        and (g.up_mm is not null or g.to_mm is not null)), '[]'::jsonb));
$$;

create or replace function public.lead_guide_effective()
returns jsonb language sql stable security invoker
set search_path = public, lead_priv, pg_temp as $$
  select lead_priv.guide_effective(); $$;

create or replace function lead_priv.guide_directory()
returns jsonb language plpgsql stable security definer
set search_path = lead, lead_priv, pg_temp as $$
declare u uuid := lead_priv.crm_require_admin();
begin
  return jsonb_build_object('version', '1.9', 'actor', u,
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
        'id', g.id, 'page', g.page,
        'sensorFamily', g.sensor_family, 'sensorReference', g.sensor_reference,
        'magnetId', g.magnet_id, 'approachId', g.approach_id,
        'upMm', g.up_mm, 'toMm', g.to_mm,
        'upNote', g.up_note, 'toNote', g.to_note,
        'status', g.status, 'sourceRef', g.source_ref, 'enteredOn', g.entered_on,
        'note', g.note, 'rowVersion', g.version, 'updatedAt', g.updated_at,
        'updatedBy', lead_priv.crm_actor_name(g.updated_by))
        order by g.sensor_reference, g.magnet_id, g.approach_id)
      from lead.guide_rows g), '[]'::jsonb));
end $$;

create or replace function public.lead_guide_directory()
returns jsonb language sql stable security invoker
set search_path = public, lead_priv, pg_temp as $$
  select lead_priv.guide_directory(); $$;

create or replace function lead_priv.guide_save_row(_payload jsonb, _expected_version integer)
returns jsonb language plpgsql security definer
set search_path = lead, lead_priv, pg_temp as $$
declare
  u uuid := lead_priv.crm_require_admin();
  cur lead.guide_rows;
  res lead.guide_rows;
  old_json jsonb;
  up_v numeric := nullif(_payload->>'upMm','')::numeric;
  to_v numeric := nullif(_payload->>'toMm','')::numeric;
  st text := coalesce(nullif(_payload->>'status',''), 'draft');
begin
  if _payload is null or jsonb_typeof(_payload) <> 'object' then
    raise exception 'GUIDE_BAD_PAYLOAD' using errcode = '22023';
  end if;
  if st not in ('draft','validated') then
    raise exception 'GUIDE_BAD_STATUS' using errcode = '22023';
  end if;
  -- Famille connue du guide OU du catalogue : la brochure documente des
  -- familles que le site ne propose pas, elles restent consultables.
  if not exists (select 1 from lead.detection_sensor_allow a
                  where a.sensor_family = _payload->>'sensorFamily') then
    raise exception 'GUIDE_UNKNOWN_SENSOR' using errcode = '22023';
  end if;
  if not exists (select 1 from lead.detection_magnet_allow a
                  where a.magnet_id = _payload->>'magnetId') then
    raise exception 'GUIDE_UNKNOWN_MAGNET' using errcode = '22023';
  end if;
  if coalesce(_payload->>'approachId','') not in ('D1','D2','D3','D4','D5')
     or coalesce(_payload->>'upNote','not_published') not in ('not_published','below_zero')
     or coalesce(_payload->>'toNote','not_published') not in ('not_published','below_zero')
     or length(btrim(coalesce(_payload->>'sensorReference',''))) not between 1 and 64
     or length(btrim(coalesce(_payload->>'sourceRef',''))) < 8
     or length(coalesce(_payload->>'note','')) > 2000
     or (up_v is not null and up_v < 0) or (to_v is not null and to_v < 0)
     or coalesce(nullif(_payload->>'enteredOn','')::date, current_date) > current_date then
    raise exception 'GUIDE_BAD_PAYLOAD' using errcode = '22023';
  end if;
  if st = 'validated' and up_v is null and to_v is null then
    raise exception 'GUIDE_INCOMPLETE' using errcode = '22023';
  end if;

  select * into cur from lead.guide_rows
   where sensor_reference = _payload->>'sensorReference'
     and magnet_id = _payload->>'magnetId'
     and approach_id = _payload->>'approachId'
   for update;

  if cur.id is null then
    if _expected_version is not null then
      raise exception 'GUIDE_CONFLICT:0' using errcode = '40001';
    end if;
    insert into lead.guide_rows (page, sensor_family, sensor_reference, magnet_id,
      approach_id, up_mm, to_mm, up_note, to_note, status, source_ref, entered_on,
      note, updated_by)
    values (nullif(_payload->>'page','')::integer, _payload->>'sensorFamily',
      _payload->>'sensorReference', _payload->>'magnetId', _payload->>'approachId',
      up_v, to_v, nullif(_payload->>'upNote',''), nullif(_payload->>'toNote',''), st,
      _payload->>'sourceRef',
      coalesce(nullif(_payload->>'enteredOn','')::date, current_date),
      nullif(_payload->>'note',''), u)
    returning * into res;
    insert into lead.guide_audit (row_id, actor, action, old_value, new_value)
    values (res.id, u, 'guide_row_created', null, to_jsonb(res));
  else
    if _expected_version is null or cur.version <> _expected_version then
      raise exception 'GUIDE_CONFLICT:%', cur.version using errcode = '40001';
    end if;
    old_json := to_jsonb(cur);
    update lead.guide_rows set
      page = nullif(_payload->>'page','')::integer,
      sensor_family = _payload->>'sensorFamily',
      up_mm = up_v, to_mm = to_v,
      up_note = nullif(_payload->>'upNote',''),
      to_note = nullif(_payload->>'toNote',''),
      status = st,
      source_ref = _payload->>'sourceRef',
      entered_on = coalesce(nullif(_payload->>'enteredOn','')::date, cur.entered_on),
      note = nullif(_payload->>'note',''),
      version = cur.version + 1, updated_at = now(), updated_by = u
     where id = cur.id
    returning * into res;
    insert into lead.guide_audit (row_id, actor, action, old_value, new_value)
    values (res.id, u, 'guide_row_updated', old_json, to_jsonb(res));
  end if;

  perform lead_priv.detection_bump(true);
  return jsonb_build_object('id', res.id, 'rowVersion', res.version, 'status', res.status,
    'updatedAt', res.updated_at);
end $$;

create or replace function public.lead_guide_save_row(p_payload jsonb, p_expected_version integer)
returns jsonb language sql security invoker
set search_path = public, lead_priv, pg_temp as $$
  select lead_priv.guide_save_row(p_payload, p_expected_version); $$;

-- ----------------------------------------------------------------------------
-- 6. Droits : rien d'accessible en direct, points d'entrée explicites
-- ----------------------------------------------------------------------------
revoke all on lead.detection_rows, lead.detection_audit from public, anon, authenticated;
revoke all on lead.guide_rows, lead.guide_audit from public, anon, authenticated;
revoke all on lead.detection_sensor_allow, lead.detection_magnet_allow from public, anon, authenticated;
revoke all on lead.detection_state from public, anon, authenticated;

-- Le chemin d'appel COMPLET doit être exécutable : le wrapper public est
-- invoker, il n'emprunte aucun droit. Sans EXECUTE sur la fonction definer
-- appelée, chaque appel échoue par « permission denied ». On ouvre donc
-- exactement les trois (puis six) fonctions d'entrée, et rien d'autre : le
-- schéma lead_priv n'est pas exposé à l'API, toutes ses autres fonctions
-- restent révoquées, et le contrôle du rôle administrateur RÉEL reste à
-- l'intérieur des fonctions definer.
grant usage on schema lead_priv to anon, authenticated;

revoke all on function lead_priv.detection_bump(boolean) from public, anon, authenticated;

revoke all on function lead_priv.detection_effective() from public;
grant execute on function lead_priv.detection_effective() to anon, authenticated;
revoke all on function lead_priv.detection_directory() from public, anon;
grant execute on function lead_priv.detection_directory() to authenticated;
revoke all on function lead_priv.detection_save_row(jsonb, integer) from public, anon;
grant execute on function lead_priv.detection_save_row(jsonb, integer) to authenticated;

revoke all on function lead_priv.guide_effective() from public;
grant execute on function lead_priv.guide_effective() to anon, authenticated;
revoke all on function lead_priv.guide_directory() from public, anon;
grant execute on function lead_priv.guide_directory() to authenticated;
revoke all on function lead_priv.guide_save_row(jsonb, integer) from public, anon;
grant execute on function lead_priv.guide_save_row(jsonb, integer) to authenticated;

-- Lecture technique effective : moindre privilège, lecture seule, ni identité,
-- ni note interne, ni donnée client.
revoke all on function public.lead_detection_effective() from public;
grant execute on function public.lead_detection_effective() to anon, authenticated;
revoke all on function public.lead_guide_effective() from public;
grant execute on function public.lead_guide_effective() to anon, authenticated;

-- Annuaire et écriture : session requise, rôle admin vérifié DANS la fonction.
revoke all on function public.lead_detection_directory() from public, anon;
grant execute on function public.lead_detection_directory() to authenticated;
revoke all on function public.lead_detection_save_row(jsonb, integer) from public, anon;
grant execute on function public.lead_detection_save_row(jsonb, integer) to authenticated;
revoke all on function public.lead_guide_directory() from public, anon;
grant execute on function public.lead_guide_directory() to authenticated;
revoke all on function public.lead_guide_save_row(jsonb, integer) from public, anon;
grant execute on function public.lead_guide_save_row(jsonb, integer) to authenticated;

insert into lead.schema_migrations (version) values ('1.9')
on conflict (version) do nothing;

commit;

-- ============================================================================
-- Points d'entrée ajoutés :
--   public.lead_detection_effective() -> jsonb   (anon + authenticated, lecture)
--   public.lead_detection_directory() -> jsonb   (admin réel uniquement)
--   public.lead_detection_save_row(payload jsonb, expected_version int) -> jsonb
--   public.lead_guide_effective() -> jsonb       (anon + authenticated, lecture)
--   public.lead_guide_directory() -> jsonb       (admin réel uniquement)
--   public.lead_guide_save_row(payload jsonb, expected_version int) -> jsonb
-- Erreurs : NOT_ALLOWED, AUTH_REQUIRED, DETECTION_BAD_PAYLOAD,
--           DETECTION_BAD_STATUS, DETECTION_INCOMPLETE,
--           DETECTION_UNKNOWN_SENSOR, DETECTION_UNKNOWN_MAGNET,
--           DETECTION_CONFLICT:<version>, GUIDE_BAD_PAYLOAD, GUIDE_BAD_STATUS,
--           GUIDE_INCOMPLETE, GUIDE_UNKNOWN_SENSOR, GUIDE_UNKNOWN_MAGNET,
--           GUIDE_CONFLICT:<version>
-- ============================================================================
