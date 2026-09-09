-- ============================================================================
-- Lead Magnet — migration ADDITIVE 1.6
-- Chaîne serveur de production de la VERSION ANGLAISE du rapport.
--
-- La 1.5 (déjà appliquée) a créé lead.revision_reports_en : stockage, états
-- missing/pending/ready, origine explicite, écriture réservée à service_role.
-- La 1.6 n'y touche pas. Elle ajoute UNIQUEMENT les trois opérations dont le
-- serveur applicatif a besoin, toutes réservées à service_role :
--
--   1. lead_report_en_authorize : dit si un utilisateur donné a le droit de
--      faire traduire CETTE révision, et ne renvoie le snapshot qu'à ce prix.
--      Le contrôle est fait ICI, en base, pas dans l'application.
--   2. lead_report_en_begin     : réserve la production (état 'pending'),
--      idempotent — un second appel ne crée pas de doublon.
--   3. lead_report_en_finalize  : publie le texte anglais (état 'ready'),
--      idempotent — une version déjà prête n'est jamais réécrite.
--
-- Aucun contrôle existant n'est affaibli : submit_revision, snapshot_hash,
-- client_can_submit, nda_allows_transfer, staff_can_read_design et les
-- consentements exacts restent inchangés.
--
-- Aucune de ces fonctions n'est exécutable par anon ni authenticated : un
-- client ne peut donc pas déclarer une traduction « ready » avec un JSON.
--
-- Application : après revue, par le propriétaire du projet yyobodalwtsqdyrqwkjk.
-- Réversible : drop des trois fonctions publiques et des trois fonctions
-- lead_priv correspondantes, puis retrait de la ligne 1.6.
-- ============================================================================
begin;

-- ----------------------------------------------------------------------------
-- 1. Autorisation : auth réelle, droits réels, NDA réel, consentement réel
-- ----------------------------------------------------------------------------
-- L'accord de STOCKAGE (supabase_dossier) ne vaut PAS accord de traduction :
-- un consentement distinct de type 'ai_assistant' est exigé, rattaché au même
-- dossier, à la même révision et à la même empreinte de contenu.
create or replace function lead_priv.report_en_authorize(
  _user uuid, _dossier uuid, _revision_id uuid, _content_hash text)
returns jsonb language plpgsql stable security definer
set search_path = lead, lead_priv, pg_temp as $$
declare
  d lead.design_dossiers%rowtype;
  r lead.design_revisions%rowtype;
  c jsonb;
  deny text := null;
begin
  if _user is null then
    return jsonb_build_object('allowed', false, 'reason', 'AUTH_REQUIRED');
  end if;
  select * into d from lead.design_dossiers where id = _dossier;
  if d.id is null then
    return jsonb_build_object('allowed', false, 'reason', 'DOSSIER_NOT_FOUND');
  end if;
  select * into r from lead.design_revisions where id = _revision_id;
  if r.id is null or r.dossier_id <> _dossier then
    return jsonb_build_object('allowed', false, 'reason', 'REVISION_NOT_FOUND');
  end if;
  -- L'empreinte annoncée doit être celle réellement stockée : une traduction
  -- ne peut jamais se rattacher à un contenu que personne n'a soumis.
  if lower(coalesce(btrim(_content_hash), '')) is distinct from r.content_hash then
    return jsonb_build_object('allowed', false, 'reason', 'CONTENT_HASH_MISMATCH');
  end if;
  -- Droits sur CE dossier : propriétaire du dossier, ou staff réellement affecté.
  if not lead_priv.client_can_read(_user, _dossier)
     and not lead_priv.staff_can_read_design(_user, _dossier) then
    return jsonb_build_object('allowed', false, 'reason', 'NOT_ALLOWED');
  end if;
  -- NDA : si le dossier l'exige, il doit être en vigueur et vérifié côté serveur.
  if d.nda_required and not lead_priv.nda_allows_transfer(_dossier) then
    return jsonb_build_object('allowed', false, 'reason', 'NDA_NOT_IN_FORCE');
  end if;
  -- Consentement EXPLICITE de traduction, lié au contenu exact.
  select x into c
    from jsonb_array_elements(coalesce(r.consents, '[]'::jsonb)) x
   where x->>'kind' = 'ai_assistant'
   limit 1;
  if c is null
     or coalesce(btrim(c->>'statement'), '') = ''
     or coalesce(btrim(c->>'content_ref'), '') = ''
     or lead_priv.parse_ts(c->>'accepted_at') is null
     or lead_priv.parse_ts(c->>'accepted_at') > now() + interval '5 minutes'
     or c->>'dossier_id' is distinct from _dossier::text
     or lead_priv.json_number(c->'revision') is null
     or lead_priv.json_number(c->'revision') <> r.revision
     or lower(coalesce(c->>'content_hash', '')) is distinct from r.content_hash then
    deny := 'AI_CONSENT_MISSING';
  end if;
  if deny is not null then
    return jsonb_build_object('allowed', false, 'reason', deny);
  end if;
  return jsonb_build_object(
    'allowed', true,
    'reason', null,
    'dossier_id', d.id,
    'revision_id', r.id,
    'revision', r.revision,
    'content_hash', r.content_hash,
    -- Le texte à traduire vient du SNAPSHOT IMMUABLE, jamais d'un contenu
    -- envoyé par le navigateur au moment de la demande.
    'snapshot', r.snapshot,
    'consent_at', c->>'accepted_at');
end $$;

create or replace function public.lead_report_en_authorize(
  p_user uuid, p_dossier uuid, p_revision_id uuid, p_content_hash text)
returns jsonb language sql security invoker
set search_path = public, lead_priv, pg_temp as $$
  select lead_priv.report_en_authorize(p_user, p_dossier, p_revision_id, p_content_hash);
$$;

-- ----------------------------------------------------------------------------
-- 2. Réservation idempotente
-- ----------------------------------------------------------------------------
create or replace function lead_priv.report_en_begin(
  _dossier uuid, _revision_id uuid, _content_hash text)
returns jsonb language plpgsql security definer
set search_path = lead, lead_priv, pg_temp as $$
declare s text;
begin
  insert into lead.revision_reports_en (dossier_id, revision_id, content_hash, state)
  values (_dossier, _revision_id, lower(btrim(_content_hash)), 'pending')
  on conflict (revision_id, content_hash) do nothing;
  select state into s from lead.revision_reports_en
   where revision_id = _revision_id and content_hash = lower(btrim(_content_hash));
  return jsonb_build_object('state', s);
end $$;

create or replace function public.lead_report_en_begin(
  p_dossier uuid, p_revision_id uuid, p_content_hash text)
returns jsonb language sql security invoker
set search_path = public, lead_priv, pg_temp as $$
  select lead_priv.report_en_begin(p_dossier, p_revision_id, p_content_hash);
$$;

-- ----------------------------------------------------------------------------
-- 3. Publication idempotente
-- ----------------------------------------------------------------------------
-- Un texte vide, une origine inconnue ou une empreinte inexistante sont déjà
-- refusés par les contraintes de la 1.5 : ici on refuse en plus d'écraser une
-- version déjà publiée (un retry ne duplique donc rien et ne réécrit rien).
create or replace function lead_priv.report_en_finalize(
  _dossier uuid, _revision_id uuid, _content_hash text,
  _body text, _origin text, _producer text, _source_locale text)
returns jsonb language plpgsql security definer
set search_path = lead, lead_priv, pg_temp as $$
declare s text;
begin
  if coalesce(btrim(_body), '') = '' then
    raise exception 'EMPTY_TRANSLATION' using errcode = '22023';
  end if;
  update lead.revision_reports_en
     set state = 'ready', body_en = _body, origin = _origin,
         producer = _producer, source_locale = _source_locale,
         produced_at = now()
   where revision_id = _revision_id
     and content_hash = lower(btrim(_content_hash))
     and dossier_id = _dossier
     and state <> 'ready';
  select state into s from lead.revision_reports_en
   where revision_id = _revision_id and content_hash = lower(btrim(_content_hash));
  if s is null then
    raise exception 'REPORT_EN_NOT_STARTED' using errcode = '22023';
  end if;
  return jsonb_build_object('state', s);
end $$;

create or replace function public.lead_report_en_finalize(
  p_dossier uuid, p_revision_id uuid, p_content_hash text,
  p_body text, p_origin text, p_producer text, p_source_locale text)
returns jsonb language sql security invoker
set search_path = public, lead_priv, pg_temp as $$
  select lead_priv.report_en_finalize(p_dossier, p_revision_id, p_content_hash,
                                      p_body, p_origin, p_producer, p_source_locale);
$$;

-- ----------------------------------------------------------------------------
-- 4. Permissions : service_role UNIQUEMENT
-- ----------------------------------------------------------------------------
revoke all on function lead_priv.report_en_authorize(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function lead_priv.report_en_begin(uuid, uuid, text) from public, anon, authenticated;
revoke all on function lead_priv.report_en_finalize(uuid, uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.lead_report_en_authorize(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.lead_report_en_begin(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.lead_report_en_finalize(uuid, uuid, text, text, text, text, text) from public, anon, authenticated;

grant execute on function lead_priv.report_en_authorize(uuid, uuid, uuid, text) to service_role;
grant execute on function lead_priv.report_en_begin(uuid, uuid, text) to service_role;
grant execute on function lead_priv.report_en_finalize(uuid, uuid, text, text, text, text, text) to service_role;
grant execute on function public.lead_report_en_authorize(uuid, uuid, uuid, text) to service_role;
grant execute on function public.lead_report_en_begin(uuid, uuid, text) to service_role;
grant execute on function public.lead_report_en_finalize(uuid, uuid, text, text, text, text, text) to service_role;

-- ----------------------------------------------------------------------------
-- 5. Enregistrement de la version
-- ----------------------------------------------------------------------------
insert into lead.schema_migrations (version) values ('1.6')
on conflict (version) do nothing;

commit;

-- ============================================================================
-- CONTRAT AJOUTÉ (service_role uniquement, jamais exposé au navigateur)
--   public.lead_report_en_authorize(user, dossier, revision_id, hash)
--     -> { allowed, reason, snapshot, revision, content_hash, consent_at }
--   public.lead_report_en_begin(dossier, revision_id, hash)     -> { state }
--   public.lead_report_en_finalize(dossier, revision_id, hash,
--            body, origin, producer, source_locale)             -> { state }
-- ============================================================================
