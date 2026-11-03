-- Customer email access. Requires the reviewed lead schema through v1.11.
-- Not applied to a live project by creating this file. No anonymous table/RPC grants.
begin;
create table lead.customer_pending (
  id uuid primary key, email text not null, receipt_hash text not null,
  snapshot jsonb, content_hash text, consents jsonb, file_info jsonb,
  file_verified boolean not null default false,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  cleanup_started_at timestamptz,
  claimed_by uuid references auth.users(id) on delete cascade, result jsonb,
  check (length(email) <= 254), check (receipt_hash ~ '^[a-f0-9]{64}$')
);
create index customer_pending_email on lead.customer_pending(email, expires_at);
create table lead.customer_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  contact_name text, company text, phone text, city text, country text,
  created_at timestamptz not null default now()
);
create table lead.customer_access_limits (
  key text not null, window_start timestamptz not null, count integer not null,
  primary key(key, window_start)
);
create table lead.customer_verified_events (
  pending_id uuid primary key, dossier_id uuid not null references lead.design_dossiers(id) on delete cascade,
  revision_id uuid not null references lead.design_revisions(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table lead.customer_pending enable row level security;
alter table lead.customer_profiles enable row level security;
alter table lead.customer_access_limits enable row level security;
alter table lead.customer_verified_events enable row level security;
revoke all on lead.customer_pending, lead.customer_profiles, lead.customer_access_limits,
  lead.customer_verified_events from public, anon, authenticated;

-- This privileged command boundary is callable ONLY by the trusted server.
-- The server authenticates each user with Auth; SQL checks confirmation again.
create function lead_priv.customer_access(_action text, _args jsonb)
returns jsonb language plpgsql security definer
set search_path = lead, lead_priv, pg_temp as $$
declare
  p lead.customer_pending%rowtype; u uuid; v_email text; n integer; c jsonb;
  v_result jsonb; consent jsonb; files jsonb := '[]'; previous_sub text; previous_claims text;
  f jsonb; prefix text; bucket_time timestamptz; profile jsonb;
begin
  if _action = 'cleanup_candidates' then
    if not coalesce((_args->>'reserve')::boolean, false) then
      return coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'path', q.file_info->>'path'))
        from (select id, file_info from lead.customer_pending where expires_at <= now() - interval '2 hours' and result is null
          order by expires_at limit 100) q), '[]');
    end if;
    -- Wait for every previously issued two-hour upload grant to expire. Lock and
    -- mark before deleting Storage objects so a concurrent claim cannot race GC.
    with candidates as (
      select id from lead.customer_pending where expires_at <= now() - interval '2 hours' and result is null
      order by expires_at limit 100 for update skip locked
    ), marked as (
      update lead.customer_pending target set cleanup_started_at = coalesce(target.cleanup_started_at, now())
      from candidates gc where target.id = gc.id returning target.id, target.file_info
    ) select coalesce(jsonb_agg(jsonb_build_object('id', id, 'path', file_info->>'path')), '[]') into v_result from marked;
    return v_result;
  elsif _action = 'cleanup_delete' then
    delete from lead.customer_pending where result is null and cleanup_started_at is not null and expires_at <= now() - interval '2 hours'
      and id in (select value::uuid from jsonb_array_elements_text(_args->'ids'));
    get diagnostics n = row_count;
    delete from lead.customer_access_limits where window_start < now() - interval '2 days';
    return jsonb_build_object('deleted', n);
  end if;
  if _action = 'rate' then
    bucket_time := date_trunc('hour', now());
    insert into lead.customer_access_limits(key, window_start, count)
      values (_args->>'key', bucket_time, 1)
      on conflict(key, window_start) do update set count = customer_access_limits.count + 1
      returning count into n;
    return jsonb_build_object('allowed', n <= (_args->>'limit')::integer);
  end if;
  if _action in ('reserve_file', 'save', 'file_verified', 'file_info') then
    v_email := lower(btrim(_args->>'email'));
    if v_email is null or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
      or length(v_email) > 254 then raise exception 'BAD_INPUT'; end if;
    insert into lead.customer_pending(id, email, receipt_hash)
      values ((_args->>'id')::uuid, v_email, _args->>'receipt_hash') on conflict do nothing;
    select * into p from lead.customer_pending where id = (_args->>'id')::uuid for update;
    if p.email <> v_email or p.receipt_hash is distinct from _args->>'receipt_hash'
      or p.expires_at <= now() or p.cleanup_started_at is not null or p.result is not null then raise exception 'NOT_ALLOWED'; end if;
    if _action = 'file_info' then
      if p.file_info is null then raise exception 'BAD_FILE'; end if;
      return p.file_info;
    end if;
    if _action = 'reserve_file' then
      f := _args->'file';
      if p.snapshot is not null or (p.file_info is not null and p.file_info <> f)
        or f->>'path' is distinct from p.id::text || '/pending/model.glb'
        or (f->>'bytes')::bigint not between 20 and 31457280
        or f->>'sha256' !~ '^[a-f0-9]{64}$' then raise exception 'BAD_FILE'; end if;
      update lead.customer_pending set file_info = f where id = p.id;
      return jsonb_build_object('verified', p.file_verified);
    elsif _action = 'file_verified' then
      if p.file_info is null then raise exception 'BAD_FILE'; end if;
      update lead.customer_pending set file_verified = true where id = p.id;
      return jsonb_build_object('ok', true);
    end if;
    if jsonb_typeof(_args->'snapshot') is distinct from 'object'
      or octet_length((_args->'snapshot')::text) > 2097152
      or _args->'snapshot' ? 'internalNotes'
      or lower(btrim(_args #>> '{snapshot,business,contactEmail}')) is distinct from v_email
      or jsonb_typeof(_args->'consents') is distinct from 'array'
      or _args->>'content_hash' is distinct from lead_priv.snapshot_hash(_args->'snapshot')
      or cardinality(lead_priv.business_context_missing(_args->'snapshot')) > 0
      then raise exception 'BAD_SNAPSHOT'; end if;
    select value into c from jsonb_array_elements(_args->'consents')
      where value->>'kind' = 'supabase_dossier' limit 1;
    if c is null or c #>> '{binding,contentHash}' is distinct from _args->>'content_hash'
      or nullif(c->>'contentSummary','') is null
      or c #>> '{binding,serverDossierId}' is not null
      or c #>> '{binding,revision}' is distinct from '1'
      or lead_priv.parse_ts(c->>'grantedAt') is null
      or lead_priv.parse_ts(c->>'grantedAt') > now() + interval '5 minutes'
      or lead_priv.parse_ts(c->>'grantedAt') < now() - interval '1 hour'
      then raise exception 'CONSENT_REQUIRED'; end if;
    if p.file_info is not null then
      if not p.file_verified or c #> '{binding,fileDigests}' is distinct from jsonb_build_array(p.file_info->>'sha256')
        or (select count(*) from jsonb_array_elements(_args #> '{snapshot,attachments}') a where a->>'transferred' = 'true') <> 1
        or not exists (select 1 from jsonb_array_elements(_args #> '{snapshot,attachments}') a
          where a->>'storagePath' = p.file_info->>'path' and a->>'sha256' = p.file_info->>'sha256'
            and a->>'transferred' = 'true') then raise exception 'BAD_FILE'; end if;
    elsif c #> '{binding,fileDigests}' is distinct from '[]'::jsonb
      or exists(select 1 from jsonb_array_elements(_args #> '{snapshot,attachments}') a where a->>'transferred' = 'true')
      then raise exception 'BAD_FILE';
    end if;
    if p.snapshot is not null and (p.snapshot <> _args->'snapshot' or p.content_hash <> _args->>'content_hash')
      then raise exception 'SEALED_SUBMISSION'; end if;
    update lead.customer_pending set snapshot = _args->'snapshot', content_hash = _args->>'content_hash',
      consents = coalesce(p.consents, _args->'consents'),
      expires_at = least(expires_at, lead_priv.parse_ts(c->>'grantedAt') + interval '24 hours')
      where id = p.id returning expires_at into p.expires_at;
    return jsonb_build_object('id', p.id, 'expires_at', p.expires_at);
  end if;
  u := (_args->>'user_id')::uuid;
  select lower(btrim(a.email)) into v_email from auth.users a
    where a.id = u and a.email_confirmed_at is not null and not coalesce(a.is_anonymous, false);
  if v_email is null then raise exception 'VERIFIED_EMAIL_REQUIRED'; end if;
  if _action = 'list' then
    select to_jsonb(cp) - 'user_id' into profile from lead.customer_profiles cp where cp.user_id = u;
    return jsonb_build_object('profile', profile, 'pending', coalesce((
      select jsonb_agg(jsonb_build_object('id', q.id, 'title', q.snapshot->>'title',
        'expires_at', q.expires_at, 'created_at', q.created_at) order by q.created_at desc)
      from (select * from lead.customer_pending where customer_pending.email = v_email
        and snapshot is not null and result is null and expires_at > now() order by created_at desc limit 30) q), '[]'));
  end if;
  if _action <> 'claim' then raise exception 'BAD_ACTION'; end if;
  select * into p from lead.customer_pending where id = (_args->>'id')::uuid for update;
  if not found or p.email <> v_email then raise exception 'NOT_ALLOWED'; end if;
  if p.result is not null then
    if p.claimed_by <> u then raise exception 'NOT_ALLOWED'; end if;
    return p.result;
  end if;
  if p.snapshot is null or p.expires_at <= now() or p.cleanup_started_at is not null then raise exception 'EXPIRED'; end if;
  -- Existing account UUID is preserved. Never attach older dossiers by contact email.
  insert into lead.design_dossiers(id, owner_id, title, nda_required, nda_status)
    values(p.id, u, p.snapshot->>'title', false, 'not_required');
  if p.file_info is not null then
    if not p.file_verified then raise exception 'BAD_FILE'; end if;
    f := p.file_info; prefix := p.id::text || '/pending';
    insert into lead.upload_sessions(dossier_id, user_id, path_prefix, kind, expires_at,
      expected_sha256, expected_bytes, expected_mime, expected_revision,
      verified_sha256, verified_bytes, verified_mime, verified_object_path, verified_at, closed_at, consent)
      values(p.id, u, prefix, 'design_model', now(), f->>'sha256', (f->>'bytes')::bigint,
        'model/gltf-binary', 1, f->>'sha256', (f->>'bytes')::bigint, 'model/gltf-binary', f->>'path', now(), now(), p.consents);
    files := jsonb_build_array(jsonb_build_object('path', f->>'path', 'file_name', f->>'fileName', 'sha256', f->>'sha256'));
  end if;
  select jsonb_agg(jsonb_build_object('kind', v->>'kind', 'statement', v->>'contentSummary',
    'accepted_at', v->>'grantedAt', 'dossier_id', p.id, 'revision', 1, 'content_hash', p.content_hash,
    'content_ref', p.id::text || '@r1', 'file_digests', v #> '{binding,fileDigests}', 'recipients', v->'recipients'))
    into consent from jsonb_array_elements(p.consents) v;
  -- Reuse all existing submission, NDA, freeze, shape and business validation.
  previous_sub := current_setting('request.jwt.claim.sub', true);
  previous_claims := current_setting('request.jwt.claims', true);
  perform set_config('request.jwt.claim.sub', u::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', u, 'role', 'authenticated')::text, true);
  v_result := lead_priv.submit_revision(p.id, 0, p.snapshot, p.content_hash, consent, files)
    || jsonb_build_object('dossier_id', p.id);
  perform set_config('request.jwt.claim.sub', coalesce(previous_sub,''), true);
  perform set_config('request.jwt.claims', coalesce(previous_claims,'{}'), true);
  insert into lead.customer_profiles(user_id, contact_name, company, phone, city, country)
    values(u, p.snapshot #>> '{business,contactName}', p.snapshot #>> '{business,contactCompany}',
      p.snapshot #>> '{business,contactPhone}', p.snapshot #>> '{business,siteCity}', p.snapshot #>> '{business,siteCountry}')
    on conflict(user_id) do nothing;
  insert into lead.customer_verified_events(pending_id, dossier_id, revision_id)
    values(p.id, p.id, (v_result->>'revision_id')::uuid);
  update lead.customer_pending set claimed_by = u, result = v_result where id = p.id;
  return v_result;
end $$;
create function public.lead_customer_access(p_action text, p_args jsonb)
returns jsonb language sql security invoker set search_path = public, lead_priv, pg_temp as $$
  select lead_priv.customer_access(p_action, p_args);
$$;
revoke all on function lead_priv.customer_access(text,jsonb), public.lead_customer_access(text,jsonb) from public, anon, authenticated;
grant execute on function lead_priv.customer_access(text,jsonb), public.lead_customer_access(text,jsonb) to service_role;
insert into lead.schema_migrations(version) values('1.12') on conflict do nothing;
commit;
