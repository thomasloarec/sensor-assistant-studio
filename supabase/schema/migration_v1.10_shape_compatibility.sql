-- ============================================================================
-- Migration 1.10 — RÈGLE DE COMPATIBILITÉ DE FORME capteur / aimant
--
-- À RELIRE AVANT APPLICATION. Elle n'a PAS été appliquée par l'assistant.
-- Backend concerné : yyobodalwtsqdyrqwkjk (standex-assistant-mvp) uniquement.
--
-- Règle d'APPLICATION validée par le propriétaire (18 septembre 2026), et non
-- une affirmation de physique universelle :
--   * un capteur à corps TUBULAIRE (cylindre, fileté, à emmancher, ampoule) ne
--     travaille ici qu'avec un aimant TUBULAIRE ;
--   * un capteur NON tubulaire (collerette, bloc, reed CMS, circuit) ne
--     travaille ici qu'avec un aimant BLOC.
-- « M02 » porte le boîtier à collerette du MK02 : c'est un aimant BLOC, malgré
-- son nom voisin. « MK03 » est un corps cylindrique : MK03 + M02 n'est donc plus
-- une combinaison simulable.
--
-- Cette migration est ADDITIVE et ne touche AUCUNE donnée client :
--   1. deux colonnes `shape` sur les listes d'autorisation, renseignées d'après
--      la forme EXTÉRIEURE RÉELLE du catalogue ;
--   2. refus serveur d'une DISTANCE de commutation sur un couple de formes
--      contradictoires (`DETECTION_SHAPE_MISMATCH`) ;
--   3. filtrage du jeu EFFECTIF servi aux simulations ;
--   4. la ligne de recette MK03 / B / 1A / M02 / D1 (15 / 17.5), si elle existe,
--      repasse en `draft` AVEC audit : sa valeur, sa source et son historique
--      sont conservés, elle n'est simplement plus servie. Aucune valeur n'est
--      convertie vers un aimant tubulaire.
--
-- Les PLAGES du guide d'activation ne sont PAS touchées : ce sont des données
-- documentaires, conservées telles qu'imprimées, y compris pour des couples de
-- formes contradictoires. Seule leur utilisation comme démonstration est
-- interdite, côté application.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Forme déclarée des listes d'autorisation
-- ----------------------------------------------------------------------------
alter table lead.detection_sensor_allow
  add column if not exists shape text check (shape in ('tubular','block'));
alter table lead.detection_magnet_allow
  add column if not exists shape text check (shape in ('tubular','block'));

-- Capteurs réels du catalogue. Les familles présentes uniquement dans la
-- brochure (MK06-5 à MK06-8, MK07, MK12) restent SANS forme déclarée : elles
-- n'acceptent pas de distance de commutation, donc aucune forme n'est inventée.
update lead.detection_sensor_allow a
   set shape = v.shape
  from (values
  ('MK01','block'),
  ('MK15','block'),
  ('MK16','block'),
  ('MK17','block'),
  ('MK22','block'),
  ('MK30','block'),
  ('MK31','block'),
  ('MK06-4','block'),
  ('MK24-A-J','block'),
  ('MK03','tubular'),
  ('MK02','block'),
  ('MK04','block'),
  ('MK05','block'),
  ('MK13','block'),
  ('MK14','tubular'),
  ('MK18','tubular'),
  ('MK20_1','tubular'),
  ('MK20_2','tubular'),
  ('MK21','block'),
  ('MK21PR','block'),
  ('MK26','block'),
  ('MK27','block'),
  ('MK11-M5','tubular'),
  ('MK11-M8','tubular'),
  ('MK11-P-M8','tubular'),
  ('MK11-B-M6','tubular'),
  ('MK36','tubular'),
  ('MK37','tubular'),
  ('MK38','tubular')
  ) as v(sensor_family, shape)
 where a.sensor_family = v.sensor_family;

-- Aimants : forme du boîtier réellement réutilisé pour les aimants en boîtier,
-- forme nue pour les aimants nus.
update lead.detection_magnet_allow a
   set shape = v.shape
  from (values
  ('M02','block'),
  ('M03','tubular'),
  ('M04','block'),
  ('M05','block'),
  ('M13','block'),
  ('M13B','tubular'),
  ('M11P','tubular'),
  ('M11S','tubular'),
  ('M21','block'),
  ('M21P/1','block'),
  ('M21P/2','block'),
  ('M27','block'),
  ('M36','tubular'),
  ('M37','tubular'),
  ('M38','tubular'),
  ('M36-N42','tubular'),
  ('M37-N42','tubular'),
  ('M38-N42','tubular'),
  ('4003004003','tubular'),
  ('SMCO5-5X4','tubular'),
  ('N45-4X19','tubular'),
  ('NDFEB-10X5X1.9','block'),
  ('HF3225-14.95X10X5','block'),
  ('ALNICO500-5.5X22','tubular'),
  ('ALNICO500-4X19','tubular'),
  ('ALNICO500-3.7X22','tubular'),
  ('N35-4X2','tubular'),
  ('ALNICO-2.5X12.7','tubular'),
  ('ALNICO-3X12','tubular'),
  ('ALNICO-4X19','tubular'),
  ('ALNICO-5X4','tubular'),
  ('ALNICO-5X20','tubular'),
  ('ALNICO-5.5X22','tubular'),
  ('ALNICO-7.5X27','tubular'),
  ('ALNICO-3.2X3.2X19','block'),
  ('N35-4X19','tubular'),
  ('N35H-4X19','tubular'),
  ('NDFEB250175H-6X10','tubular'),
  ('NDFEB250175H-10X5X1.9','block'),
  ('SMCO5-1.9X3','tubular'),
  ('SMCO5-3X4','tubular'),
  ('HF2826-2.6X2.6X4','block'),
  ('HF2826-3.5X1.8X1.8','block'),
  ('HF2826-6.7X6.7X2.7','block')
  ) as v(magnet_id, shape)
 where a.magnet_id = v.magnet_id;

-- ----------------------------------------------------------------------------
-- 2. Prédicat partagé : les deux formes doivent être CONNUES et identiques.
--    Une forme absente n'est jamais présumée compatible.
-- ----------------------------------------------------------------------------
create or replace function lead_priv.detection_shape_ok(_sensor text, _magnet text)
returns boolean language sql stable security definer
set search_path = lead, lead_priv, pg_temp as $$
  select coalesce(
    (select s.shape is not null and m.shape is not null and s.shape = m.shape
       from lead.detection_sensor_allow s, lead.detection_magnet_allow m
      where s.sensor_family = _sensor and m.magnet_id = _magnet),
    false);
$$;

-- ----------------------------------------------------------------------------
-- 3. Contrainte de données : aucune ligne de distance ne peut être enregistrée,
--    même par un administrateur, sur un couple de formes contradictoires.
-- ----------------------------------------------------------------------------
alter table lead.detection_rows
  drop constraint if exists detection_rows_shape_ok;
alter table lead.detection_rows
  add constraint detection_rows_shape_ok
  check (status <> 'validated' or lead_priv.detection_shape_ok(sensor_family, magnet_id)) not valid;

-- ----------------------------------------------------------------------------
-- 4. Ligne de recette devenue incompatible : repassée en brouillon AVEC audit.
--    Sa valeur (15 / 17.5), sa source et son historique restent intacts.
-- ----------------------------------------------------------------------------
insert into lead.detection_audit (row_id, actor, action, old_value, new_value)
select r.id,
       null,
       'detection_row_updated',
       to_jsonb(r),
       to_jsonb(r) || jsonb_build_object(
         'status', 'draft',
         'version', r.version + 1,
         'updated_at', now(),
         'updated_by', null)
  from lead.detection_rows r
 where r.status = 'validated'
   and not lead_priv.detection_shape_ok(r.sensor_family, r.magnet_id);

update lead.detection_rows r
   set status = 'draft',
       version = r.version + 1,
       updated_at = now()
 where not lead_priv.detection_shape_ok(r.sensor_family, r.magnet_id)
   and r.status <> 'draft';

-- La contrainte peut maintenant être validée : plus aucune ligne ACTIVE ne la
-- viole. Les brouillons incompatibles restent lisibles dans l'annuaire.
alter table lead.detection_rows validate constraint detection_rows_shape_ok;

-- ----------------------------------------------------------------------------
-- 5. Refus explicite à l'écriture, avec un code d'erreur parlant.
-- ----------------------------------------------------------------------------
create or replace function lead_priv.detection_require_shape(_payload jsonb)
returns void language plpgsql volatile security definer
set search_path = lead, lead_priv, pg_temp as $$
begin
  if not lead_priv.detection_shape_ok(_payload->>'sensorFamily', _payload->>'magnetId') then
    raise exception 'DETECTION_SHAPE_MISMATCH' using errcode = '22023';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. Écriture atomique 1.10 : fonction 1.9 conservée, avec le garde de forme.
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
  if st = 'validated' and (pull is null or drop_out is null or drop_out <= pull) then
    raise exception 'DETECTION_INCOMPLETE' using errcode = '22023';
  end if;
  if not exists (select 1 from lead.detection_sensor_allow a
                  where a.sensor_family = _payload->>'sensorFamily' and not a.guide_only) then
    raise exception 'DETECTION_UNKNOWN_SENSOR' using errcode = '22023';
  end if;
  if not exists (select 1 from lead.detection_magnet_allow a
                  where a.magnet_id = _payload->>'magnetId') then
    raise exception 'DETECTION_UNKNOWN_MAGNET' using errcode = '22023';
  end if;
  perform lead_priv.detection_require_shape(_payload);
  if exists (select 1 from lead.detection_magnet_allow a
              where a.magnet_id = _payload->>'magnetId' and a.family_alias) then
    raise exception 'DETECTION_ALIAS_MAGNET' using errcode = '22023';
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
  if coalesce(nullif(_payload->>'enteredOn','')::date, current_date) > current_date then
    raise exception 'DETECTION_BAD_PAYLOAD' using errcode = '22023';
  end if;
  if (pull is not null and pull <= 0) or (drop_out is not null and drop_out <= 0) then
    raise exception 'DETECTION_BAD_PAYLOAD' using errcode = '22023';
  end if;

  if nullif(_payload->>'id','') is not null then
    select * into cur from lead.detection_rows
     where id = (_payload->>'id')::uuid for update;
    if cur.id is null then
      raise exception 'DETECTION_MISSING_ROW' using errcode = '22023';
    end if;
    if cur.sensor_family <> _payload->>'sensorFamily'
       or cur.sensitivity_class <> _payload->>'sensitivityClass'
       or cur.contact_form <> _payload->>'contactForm'
       or cur.magnet_id <> _payload->>'magnetId'
       or cur.approach_id <> _payload->>'approachId' then
      raise exception 'DETECTION_KEY_LOCKED' using errcode = '22023';
    end if;
  else
    select * into cur from lead.detection_rows
     where sensor_family = _payload->>'sensorFamily'
       and sensitivity_class = _payload->>'sensitivityClass'
       and contact_form = _payload->>'contactForm'
       and magnet_id = _payload->>'magnetId'
       and approach_id = _payload->>'approachId' for update;
  end if;

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
      sensor_reference = _payload->>'sensorReference', class_kind = _payload->>'classKind',
      datum = _payload->>'datum', threshold_kind = _payload->>'thresholdKind',
      pull_in_mm = pull, drop_out_mm = drop_out,
      temperature_c = nullif(_payload->>'temperatureC','')::numeric, status = st,
      source_type = _payload->>'sourceType', source_ref = _payload->>'sourceRef',
      entered_on = coalesce(nullif(_payload->>'enteredOn','')::date, cur.entered_on),
      note = nullif(_payload->>'note',''), version = cur.version + 1,
      updated_at = now(), updated_by = u
     where id = cur.id returning * into res;
    insert into lead.detection_audit (row_id, actor, action, old_value, new_value)
    values (res.id, u, 'detection_row_updated', old_json, to_jsonb(res));
  end if;
  perform lead_priv.detection_bump(false);
  return jsonb_build_object('id', res.id, 'rowVersion', res.version, 'status', res.status,
    'updatedAt', res.updated_at);
end $$;

-- ----------------------------------------------------------------------------
-- 7. Jeu EFFECTIF 1.10 : filtre de forme inclus dans la fonction réellement
--    appelée par le wrapper public. Aucun TODO ni modification de 1.9 requise.
-- ----------------------------------------------------------------------------
create or replace function lead_priv.detection_effective()
returns jsonb language sql stable security definer
set search_path = lead, lead_priv, pg_temp as $$
  select jsonb_build_object(
    'version', '1.10',
    'dataRevision', (select revision::text from lead.detection_state where singleton),
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
        'id', r.id, 'sensorFamily', r.sensor_family, 'sensorReference', r.sensor_reference,
        'classKind', r.class_kind, 'sensitivityClass', r.sensitivity_class,
        'contactForm', r.contact_form, 'magnetId', r.magnet_id,
        'approachId', r.approach_id, 'datum', r.datum,
        'thresholdKind', r.threshold_kind, 'pullInMm', r.pull_in_mm,
        'dropOutMm', r.drop_out_mm, 'temperatureC', r.temperature_c,
        'sourceType', r.source_type, 'sourceRef', r.source_ref,
        'enteredOn', r.entered_on, 'rowVersion', r.version)
        order by r.sensor_family, r.sensitivity_class, r.magnet_id, r.approach_id)
      from lead.detection_rows r
      where r.status = 'validated'
        and r.pull_in_mm is not null and r.drop_out_mm is not null
        and lead_priv.detection_shape_ok(r.sensor_family, r.magnet_id)), '[]'::jsonb));
$$;

revoke all on function lead_priv.detection_shape_ok(text, text) from public, anon, authenticated;
revoke all on function lead_priv.detection_require_shape(jsonb) from public, anon, authenticated;

-- CREATE OR REPLACE conserve normalement les ACL, mais ces droits explicites
-- rendent le chemin wrapper public -> fonction privée vérifiable et autonome.
revoke all on function lead_priv.detection_effective() from public;
grant execute on function lead_priv.detection_effective() to anon, authenticated;
revoke all on function lead_priv.detection_save_row(jsonb, integer) from public, anon;
grant execute on function lead_priv.detection_save_row(jsonb, integer) to authenticated;

insert into lead.schema_migrations (version) values ('1.10')
on conflict (version) do nothing;

commit;
