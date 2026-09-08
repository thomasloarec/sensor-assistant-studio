-- ============================================================================
-- Lead Magnet — migration ADDITIVE 1.5
-- Conservation de l'original + emplacement d'une VERSION ANGLAISE du rapport.
--
-- Périmètre volontairement limité :
--   * aucune traduction n'est produite ici ;
--   * aucun appel réseau, aucun fournisseur externe, aucun secret ;
--   * aucune écriture cliente : le seul rôle capable d'écrire une version
--     anglaise est `service_role`, qui n'est branché à rien dans ce lot.
--
-- Ce que la migration garantit :
--   * une version anglaise est TOUJOURS rattachée à (revision_id, content_hash)
--     réels : une empreinte inventée est refusée par la clé étrangère ;
--   * l'état ne peut valoir 'ready' que si un texte anglais non vide et une
--     origine explicite existent : pas de faux « prêt », pas de copie française
--     rangée sous un titre anglais ;
--   * l'original (lead.design_revisions) n'est jamais modifié ni remplacé.
--
-- Application : après revue, par le propriétaire du projet
-- yyobodalwtsqdyrqwkjk. Réversible : `drop table lead.revision_reports_en`
-- et retrait de la ligne 1.5 de lead.schema_migrations.
-- ============================================================================
begin;

-- ----------------------------------------------------------------------------
-- 1. Ancrage sur la révision RÉELLE (empreinte incluse)
-- ----------------------------------------------------------------------------
-- Permet une clé étrangère composite : une version anglaise ne peut pas
-- prétendre correspondre à une empreinte qui n'a jamais été soumise.
alter table lead.design_revisions
  add constraint design_revisions_id_hash_key unique (id, content_hash);

-- ----------------------------------------------------------------------------
-- 2. Table des versions anglaises
-- ----------------------------------------------------------------------------
create table if not exists lead.revision_reports_en (
  id                uuid primary key default gen_random_uuid(),
  dossier_id        uuid not null references lead.design_dossiers(id) on delete cascade,
  revision_id       uuid not null,
  -- Empreinte du contenu ORIGINAL traduit : recopiée, jamais recalculée côté client.
  content_hash      text not null,
  -- 'missing'  : rien n'existe (ligne facultative, sert à tracer une demande) ;
  -- 'pending'  : une production a été demandée, aucun texte publiable ;
  -- 'ready'    : un texte anglais complet existe pour CETTE empreinte.
  state             text not null default 'missing'
                      check (state in ('missing', 'pending', 'ready')),
  -- Origine explicite de la version : d'où vient ce texte anglais.
  --   'human_translation'   : rédigé/relu par une personne ;
  --   'source_is_english'   : l'original était déjà en anglais ;
  --   'machine_translation' : produit par un moteur autorisé (aucun n'est
  --                           branché dans ce lot).
  origin            text check (origin in
                      ('human_translation', 'source_is_english', 'machine_translation')),
  -- Identification de ce qui a produit le texte (personne, outil, version).
  producer          text,
  -- Langue du document original, conservée pour la lecture côté équipe.
  source_locale     text,
  body_en           text,
  produced_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- Une seule version anglaise courante par (révision, empreinte).
  unique (revision_id, content_hash),
  -- L'empreinte doit être celle de la révision citée.
  foreign key (revision_id, content_hash)
    references lead.design_revisions(id, content_hash) on delete cascade,
  -- 'ready' est un ENGAGEMENT : texte non vide, origine et date obligatoires.
  constraint revision_reports_en_ready_is_real check (
    state <> 'ready'
    or (body_en is not null and length(btrim(body_en)) > 0
        and origin is not null and produced_at is not null)),
  -- Un état non prêt ne publie aucun texte partiel.
  constraint revision_reports_en_not_ready_is_empty check (
    state = 'ready' or body_en is null)
);

create index if not exists revision_reports_en_dossier_idx
  on lead.revision_reports_en (dossier_id, revision_id);

-- Le dossier de la ligne doit être celui de la révision citée.
create or replace function lead_priv.report_en_guard()
returns trigger language plpgsql
security definer set search_path = lead, lead_priv, pg_temp as $$
declare d uuid;
begin
  select r.dossier_id into d from lead.design_revisions r where r.id = new.revision_id;
  if d is null or d <> new.dossier_id then
    raise exception 'REPORT_REVISION_MISMATCH';
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists report_en_guard on lead.revision_reports_en;
create trigger report_en_guard before insert or update on lead.revision_reports_en
  for each row execute function lead_priv.report_en_guard();

-- ----------------------------------------------------------------------------
-- 3. RLS et permissions : lecture par les fonctions, écriture serveur seulement
-- ----------------------------------------------------------------------------
alter table lead.revision_reports_en enable row level security;
-- Le schéma `lead` n'est pas exposé à l'API REST : aucune policy permissive
-- n'est créée. Les lectures passent par les fonctions SECURITY DEFINER, qui
-- vérifient déjà l'habilitation (client_can_read / staff_can_read_design).
revoke all on table lead.revision_reports_en from public, anon, authenticated;
grant select, insert, update on table lead.revision_reports_en to service_role;

-- ----------------------------------------------------------------------------
-- 4. Lecture : la projection expose l'état, jamais une supposition
-- ----------------------------------------------------------------------------
create or replace function lead_priv.reports_en_of(_dossier uuid)
returns jsonb language sql stable security definer
set search_path = lead, lead_priv, pg_temp as $$
  select coalesce((select jsonb_agg(jsonb_build_object(
      'id', x.id, 'revision_id', x.revision_id, 'content_hash', x.content_hash,
      'state', x.state, 'origin', x.origin, 'producer', x.producer,
      'source_locale', x.source_locale, 'body_en', x.body_en,
      'produced_at', x.produced_at, 'updated_at', x.updated_at)
      order by x.created_at)
    from lead.revision_reports_en x where x.dossier_id = _dossier), '[]'::jsonb);
$$;

-- La projection existante est enrichie d'une clé supplémentaire, sans rien
-- retirer : les appelants actuels continuent de fonctionner à l'identique.
create or replace function lead_priv.dossier_projection_v15(_dossier uuid, _internal boolean)
returns jsonb language sql stable security definer
set search_path = lead, lead_priv, pg_temp as $$
  select lead_priv.dossier_projection(_dossier, _internal)
      || jsonb_build_object('reports_en', lead_priv.reports_en_of(_dossier));
$$;

create or replace function lead_priv.staff_view(_dossier uuid)
returns jsonb language plpgsql stable security definer
set search_path = lead, lead_priv, pg_temp as $$
declare u uuid := lead_priv.require_user();
begin
  if not lead_priv.staff_can_read_design(u, _dossier) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  return lead_priv.dossier_projection_v15(_dossier, true);
end $$;

-- Le client garde SON original : la vue cliente n'expose pas la version
-- anglaise interne et n'est pas modifiée par cette migration.

revoke all on function lead_priv.reports_en_of(uuid) from public, anon, authenticated;
revoke all on function lead_priv.dossier_projection_v15(uuid, boolean) from public, anon, authenticated;
revoke all on function lead_priv.report_en_guard() from public, anon, authenticated;
grant execute on function lead_priv.reports_en_of(uuid) to service_role;
grant execute on function lead_priv.dossier_projection_v15(uuid, boolean) to service_role;
grant execute on function lead_priv.staff_view(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 5. Enregistrement de la version
-- ----------------------------------------------------------------------------
-- 1.5 : emplacement d'une version anglaise liée à (revision_id, content_hash),
-- état missing/pending/ready, origine explicite, écriture réservée au rôle
-- serveur. Aucun backfill : les anciennes révisions restent SANS version
-- anglaise, et l'interface le dit.
insert into lead.schema_migrations (version) values ('1.5')
on conflict (version) do nothing;

commit;

-- ============================================================================
-- CONTRAT DE LECTURE AJOUTÉ
--   public.lead_staff_view(dossier) -> { ..., reports_en: [
--     { id, revision_id, content_hash, state, origin, producer,
--       source_locale, body_en, produced_at, updated_at } ] }        [staff]
--
-- Aucune RPC publique d'écriture n'est ajoutée : un JSON client ne peut pas
-- déclarer 'ready'.
-- ============================================================================
