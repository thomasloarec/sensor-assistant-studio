-- DRAFT ONLY. Do not apply during the Studio V2 delivery.
-- Prerequisite: existing Lead Magnet 1.2+ schema. No new table, no historical backfill.
-- Published reviews retain their existing workflow. Only an assigned R&D author with
-- server-managed app_metadata.standex_role = rnd can attest a valid frozen snapshot.
begin;
alter table lead.design_reviews add column if not exists freeze_attestation jsonb;

create or replace function lead_priv.capture_freeze_attestation()
returns trigger language plpgsql security definer
set search_path = lead, lead_priv, pg_temp as $$
declare r lead.design_revisions%rowtype; f jsonb; digest text; signer_name text; claim_role text;
begin
  if tg_op = 'UPDATE' and old.published then
    new.freeze_attestation := old.freeze_attestation;
    return new;
  end if;
  new.freeze_attestation := null;
  if not new.published or new.author_id is distinct from auth.uid() then return new; end if;
  if not lead_priv.staff_can_act(new.author_id, new.dossier_id, array['rnd']::lead.staff_role[]) then return new; end if;
  select raw_app_meta_data->>'standex_role' into claim_role from auth.users where id = new.author_id;
  if claim_role is distinct from 'rnd' then return new; end if;
  select * into r from lead.design_revisions where id = new.revision_id and dossier_id = new.dossier_id and revision = new.revision;
  if not found or not exists(select 1 from lead.design_dossiers where id = r.dossier_id and current_revision = r.revision) then return new; end if;
  f := r.snapshot->'designFreeze';
  if jsonb_typeof(f) is distinct from 'object' or f->>'schema' is distinct from '1'
    or f->'signature' is distinct from 'null'::jsonb
    or jsonb_typeof(f->'sections') is distinct from 'array' then return new; end if;
  if jsonb_array_length(f->'sections') <> 10 then return new; end if;
  if coalesce(f->>'hash','') !~ '^[a-f0-9]{64}$' then return new; end if;
  digest := encode(sha256(convert_to(lead_priv.canonical_json(jsonb_build_object(
    'schema', f->'schema', 'sections', f->'sections', 'inputKey', f->'inputKey', 'contextKey', f->'contextKey')), 'UTF8')), 'hex');
  if digest is distinct from f->>'hash' then return new; end if;
  select nullif(btrim(display_name), '') into signer_name from lead.staff_members where user_id = new.author_id;
  new.freeze_attestation := jsonb_build_object('reviewId', new.id, 'dossierId', new.dossier_id,
    'revisionId', new.revision_id, 'revision', new.revision, 'freezeHash', digest,
    'authorId', new.author_id, 'authorName', coalesce(signer_name, new.author_id::text),
    'role', 'rnd', 'publishedAt', new.published_at, 'scope', new.scope, 'conditions', new.conditions,
    'verdict', new.verdict);
  return new;
end $$;
revoke all on function lead_priv.capture_freeze_attestation() from public, anon, authenticated;
drop trigger if exists studio_capture_freeze on lead.design_reviews;
create trigger studio_capture_freeze before insert or update on lead.design_reviews
for each row execute function lead_priv.capture_freeze_attestation();

create or replace function lead_priv.freeze_attestation(_dossier uuid, _revision uuid, _hash text)
returns jsonb language plpgsql stable security definer
set search_path = lead, lead_priv, pg_temp as $$
declare u uuid := lead_priv.require_user(); result jsonb;
begin
  if not (lead_priv.client_can_read(u, _dossier) or lead_priv.staff_can_read_design(u, _dossier)) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  select rv.freeze_attestation into result from lead.design_reviews rv
  join lead.design_revisions r on r.id = rv.revision_id and r.dossier_id = rv.dossier_id
  join lead.design_dossiers d on d.id = rv.dossier_id
  where d.id = _dossier and r.id = _revision and d.current_revision = r.revision
    and rv.revision = r.revision and rv.published and rv.superseded_by is null
    and rv.freeze_attestation->>'freezeHash' = _hash
    and r.snapshot->'designFreeze'->>'hash' = _hash
  order by rv.published_at desc limit 1;
  return result;
end $$;
revoke all on function lead_priv.freeze_attestation(uuid, uuid, text) from public, anon, authenticated;
grant execute on function lead_priv.freeze_attestation(uuid, uuid, text) to authenticated;
create or replace function public.lead_freeze_attestation(p_dossier uuid, p_revision uuid, p_hash text)
returns jsonb language sql stable security invoker
set search_path = public, lead_priv, pg_temp as $$
select lead_priv.freeze_attestation(p_dossier, p_revision, p_hash);
$$;
revoke all on function public.lead_freeze_attestation(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.lead_freeze_attestation(uuid, uuid, text) to authenticated;
commit;
