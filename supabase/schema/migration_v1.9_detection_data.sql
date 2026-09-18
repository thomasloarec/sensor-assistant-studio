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
-- 3. Lecture EFFECTIVE, moindre privilège
--    Seules les lignes validées et complètes sortent, et uniquement les champs
--    techniques : aucun acteur, aucune note interne, aucun horodatage d'auteur.
-- ----------------------------------------------------------------------------
create or replace function lead_priv.detection_effective()
returns jsonb language sql stable security definer
set search_path = lead, lead_priv, pg_temp as $$
  select jsonb_build_object(
    'version', '1.9',
    'revision', coalesce((select max(version) + count(*) from lead.detection_rows), 0),
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

  return jsonb_build_object('id', res.id, 'rowVersion', res.version, 'status', res.status,
    'updatedAt', res.updated_at);
end $$;

create or replace function public.lead_detection_save_row(p_payload jsonb, p_expected_version integer)
returns jsonb language sql security invoker
set search_path = public, lead_priv, pg_temp as $$
  select lead_priv.detection_save_row(p_payload, p_expected_version); $$;

-- ----------------------------------------------------------------------------
-- 6. Droits : rien d'accessible en direct, points d'entrée explicites
-- ----------------------------------------------------------------------------
revoke all on lead.detection_rows, lead.detection_audit from public, anon, authenticated;

revoke all on function lead_priv.detection_effective() from public, anon, authenticated;
revoke all on function lead_priv.detection_directory() from public, anon, authenticated;
revoke all on function lead_priv.detection_save_row(jsonb, integer) from public, anon, authenticated;

-- Lecture technique effective : moindre privilège, ouverte en lecture seule
-- parce qu'elle ne contient ni identité, ni note, ni donnée client.
revoke all on function public.lead_detection_effective() from public;
grant execute on function public.lead_detection_effective() to anon, authenticated;

-- Annuaire et écriture : session requise, rôle admin vérifié DANS la fonction.
revoke all on function public.lead_detection_directory() from public, anon;
grant execute on function public.lead_detection_directory() to authenticated;
revoke all on function public.lead_detection_save_row(jsonb, integer) from public, anon;
grant execute on function public.lead_detection_save_row(jsonb, integer) to authenticated;

insert into lead.schema_migrations (version) values ('1.9')
on conflict (version) do nothing;

commit;

-- ============================================================================
-- Points d'entrée ajoutés :
--   public.lead_detection_effective() -> jsonb   (anon + authenticated, lecture)
--   public.lead_detection_directory() -> jsonb   (admin réel uniquement)
--   public.lead_detection_save_row(payload jsonb, expected_version int) -> jsonb
-- Erreurs : NOT_ALLOWED, AUTH_REQUIRED, DETECTION_BAD_PAYLOAD,
--           DETECTION_BAD_STATUS, DETECTION_INCOMPLETE,
--           DETECTION_CONFLICT:<version>
-- ============================================================================
