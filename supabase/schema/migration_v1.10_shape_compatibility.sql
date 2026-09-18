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
  check (lead_priv.detection_shape_ok(sensor_family, magnet_id)) not valid;

-- ----------------------------------------------------------------------------
-- 4. Ligne de recette devenue incompatible : repassée en brouillon AVEC audit.
--    Sa valeur (15 / 17.5), sa source et son historique restent intacts.
-- ----------------------------------------------------------------------------
insert into lead.detection_audit (row_id, action, old_value, new_value, actor_id, actor_name, source)
select r.id,
       'shape_rule_deactivated',
       to_jsonb(r),
       jsonb_build_object('status','draft'),
       null,
       'migration 1.10',
       'Règle de compatibilité de forme (capteur tubulaire / aimant tubulaire, sinon bloc) : couple conservé pour mémoire, retiré des simulations.'
  from lead.detection_rows r
 where not lead_priv.detection_shape_ok(r.sensor_family, r.magnet_id);

update lead.detection_rows r
   set status = 'draft',
       version = r.version + 1,
       updated_at = now()
 where not lead_priv.detection_shape_ok(r.sensor_family, r.magnet_id)
   and r.status <> 'draft';

-- La contrainte peut maintenant être validée : plus aucune ligne active ne la
-- viole. Les brouillons conservés restent lisibles dans l'annuaire.
-- (Validation volontairement laissée à la relecture : décommenter après
--  vérification du contenu réel de la table.)
-- alter table lead.detection_rows validate constraint detection_rows_shape_ok;

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
-- 6. Jeu EFFECTIF : les couples de formes contradictoires n'en sortent jamais.
--    (Vue filtrée réutilisée par `lead_priv.detection_effective`, qui doit être
--     recréée à l'identique en ajoutant la clause ci-dessous.)
-- ----------------------------------------------------------------------------
create or replace view lead_priv.detection_effective_rows as
  select r.*
    from lead.detection_rows r
   where r.status = 'validated'
     and r.pull_in_mm is not null
     and r.drop_out_mm is not null
     and r.drop_out_mm > r.pull_in_mm
     and lead_priv.detection_shape_ok(r.sensor_family, r.magnet_id);

revoke all on lead_priv.detection_effective_rows from public, anon, authenticated;
revoke all on function lead_priv.detection_shape_ok(text, text) from public, anon, authenticated;
revoke all on function lead_priv.detection_require_shape(jsonb) from public, anon, authenticated;

commit;

-- ============================================================================
-- À FAIRE DANS LA MÊME RELECTURE (édition manuelle de la 1.9 en place) :
--  * appeler `lead_priv.detection_require_shape(_payload)` dans
--    `lead_priv.detection_save_row`, juste après le contrôle
--    `DETECTION_UNKNOWN_MAGNET` ;
--  * faire lire `lead_priv.detection_effective_rows` à
--    `lead_priv.detection_effective()` au lieu de `lead.detection_rows`.
-- Aucune modification n'est demandée aux fonctions du GUIDE : ses plages restent
-- documentaires, conservées telles qu'imprimées.
-- ============================================================================
