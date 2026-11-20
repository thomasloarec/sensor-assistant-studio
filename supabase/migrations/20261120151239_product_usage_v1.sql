begin;
create table lead.product_usage_sessions (
 id uuid primary key, token_hash text not null, visitor uuid not null,
 created_at timestamptz not null default now(), last_at timestamptz not null default now(),
 locale text not null, device text not null, excluded boolean not null default false
);
create index product_usage_sessions_created on lead.product_usage_sessions(created_at);
create table lead.product_usage_events (
 id uuid primary key, session_id uuid not null references lead.product_usage_sessions(id) on delete cascade,
 flow uuid not null, name text not null, occurred_at timestamptz not null,
 step smallint, source text, format text, size text, import_id uuid
);
create index product_usage_events_session on lead.product_usage_events(session_id,occurred_at);
create table lead.product_usage_bindings (
 dossier_id uuid primary key, session_id uuid not null references lead.product_usage_sessions(id) on delete cascade,
 flow uuid not null, pending_at timestamptz, pending_expires_at timestamptz, confirmed_at timestamptz
);
create index product_usage_bindings_session on lead.product_usage_bindings(session_id);
alter table lead.product_usage_sessions enable row level security;
alter table lead.product_usage_events enable row level security;
alter table lead.product_usage_bindings enable row level security;
revoke all on lead.product_usage_sessions,lead.product_usage_events,lead.product_usage_bindings from public,anon,authenticated;

create function lead_priv.product_usage_ingest(_session uuid,_token uuid,_visitor uuid,_locale text,_device text,_events jsonb)
returns void language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare e jsonb; s lead.product_usage_sessions; total integer; staff boolean;
begin
 if _session is null or _token is null or _visitor is null or _locale not in ('fr','en','zh','de','es','ru','it','ja') or _device not in ('mobile','desktop')
 or _locale is null or _device is null or jsonb_typeof(_events) is distinct from 'array' or jsonb_array_length(_events) not between 1 and 50 or octet_length(_events::text)>40000 then raise exception 'BAD_INPUT'; end if;
 staff := auth.uid() is not null and lead_priv.role_of(auth.uid()) is not null;
 -- Bounded retention; expiry also enforced on reads. No customer content is stored here.
 delete from lead.product_usage_sessions where created_at<now()-interval '90 days';
 if not exists(select 1 from lead.product_usage_sessions where id=_session) and (select count(*) from lead.product_usage_sessions where created_at>now()-interval '1 day')>=10000 then raise exception 'RATE_LIMITED'; end if;
 insert into lead.product_usage_sessions(id,token_hash,visitor,locale,device,excluded)
 values(_session,md5(_token::text),_visitor,_locale,_device,coalesce(staff,false)) on conflict do nothing;
 select * into s from lead.product_usage_sessions where id=_session for update;
 if s.token_hash<>md5(_token::text) or s.visitor<>_visitor then raise exception 'NOT_ALLOWED'; end if;
 update lead.product_usage_sessions set last_at=now(),excluded=excluded or coalesce(staff,false) where id=_session;
 if s.excluded or coalesce(staff,false) then return; end if;
 select count(*) into total from lead.product_usage_events where session_id=_session;
 if total+jsonb_array_length(_events)>1500 then raise exception 'RATE_LIMITED'; end if;
 for e in select value from jsonb_array_elements(_events) loop
  if jsonb_typeof(e) is distinct from 'object' or exists(select 1 from jsonb_object_keys(e) k where k not in ('id','flow','name','at','step','source','format','size','import_id'))
   or coalesce(e->>'name','') not in ('visit','project_started','question_viewed','question_answered','question_skipped','suggestions_viewed','suggestions_empty','pair_selected','workshop_opened','workshop_ready','workshop_active','trial_started','result_viewed','result_unavailable','import_clicked','import_selected','import_ready','import_failed','import_cancelled','parts_defined','motion_confirmed','installation_completed','contact_viewed','submission_attempted','submission_blocked','submission_failed','pdf_generated','render_failed','heartbeat')
   or e->>'id' is null or e->>'flow' is null or e->>'at' is null
   or (e ? 'step' and (e->>'step')::int not between 1 and 6)
   or (e ? 'source' and e->>'source' not in ('basic','demo','personal'))
   or (e ? 'format' and e->>'format' not in ('glb','step','other'))
   or (e ? 'size' and e->>'size' not in ('small','medium','large'))
   or (e->>'at')::timestamptz<now()-interval '24 hours' or (e->>'at')::timestamptz>now()+interval '1 minute'
  then raise exception 'BAD_EVENT'; end if;
  insert into lead.product_usage_events(id,session_id,flow,name,occurred_at,step,source,format,size,import_id)
  values((e->>'id')::uuid,_session,(e->>'flow')::uuid,e->>'name',(e->>'at')::timestamptz,(e->>'step')::smallint,e->>'source',e->>'format',e->>'size',(e->>'import_id')::uuid)
  on conflict(id) do nothing;
 end loop;
end $$;

create function lead_priv.product_usage_bind(_session uuid,_token uuid,_flow uuid,_dossier uuid,_receipt_hash text default null)
returns void language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare pending_time timestamptz; confirmed_time timestamptz; expiry_time timestamptz; attempt_time timestamptz;
begin
 if not exists(select 1 from lead.product_usage_sessions where id=_session and token_hash=md5(_token::text) and not excluded and created_at>now()-interval '90 days') then raise exception 'NOT_ALLOWED'; end if;
 if auth.uid() is not null and lead_priv.role_of(auth.uid()) is not null then
  update lead.product_usage_sessions set excluded=true where id=_session; return;
 end if;
 select max(occurred_at) into attempt_time from lead.product_usage_events where session_id=_session and flow=_flow and name='submission_attempted';
 if attempt_time is null then raise exception 'NOT_ALLOWED'; end if;
 if exists(select 1 from lead.design_dossiers where id=_dossier and owner_id=auth.uid()) then
  select min(submitted_at) into confirmed_time from lead.design_revisions where dossier_id=_dossier and submitted_at>=attempt_time-interval '1 minute';
 elsif _receipt_hash is not null then
  -- Email access is an optional, separately deployed feature. Never activate it
  -- just to install analytics. This statement is planned only on that branch.
  if to_regclass('lead.customer_pending') is null then raise exception 'NOT_ALLOWED'; end if;
  select expires_at into expiry_time from lead.customer_pending where id=_dossier and receipt_hash=_receipt_hash and snapshot is not null and expires_at>now();
  if not found then raise exception 'NOT_ALLOWED'; end if;
  pending_time:=greatest(now(),attempt_time+interval '1 millisecond');
  select min(submitted_at) into confirmed_time from lead.design_revisions where dossier_id=_dossier and submitted_at>=attempt_time-interval '1 minute';
 else raise exception 'NOT_ALLOWED'; end if;
 if pending_time is null and confirmed_time is null then raise exception 'NOT_SUBMITTED'; end if;
 if confirmed_time is not null then confirmed_time:=greatest(confirmed_time,attempt_time+interval '2 milliseconds',pending_time); end if;
 insert into lead.product_usage_bindings(dossier_id,session_id,flow,pending_at,pending_expires_at,confirmed_at)
 values(_dossier,_session,_flow,coalesce(pending_time,confirmed_time),expiry_time,confirmed_time) on conflict(dossier_id) do nothing;
end $$;

create function lead_priv.product_usage_confirm() returns trigger language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
begin
 if new.submitted_at is not null then
  update lead.product_usage_bindings set confirmed_at=coalesce(confirmed_at,greatest(new.submitted_at,pending_at)) where dossier_id=new.dossier_id;
 end if;
 return new;
end $$;
create trigger product_usage_submission_confirm after insert or update of submitted_at on lead.design_revisions for each row execute function lead_priv.product_usage_confirm();

create function lead_priv.product_usage_report(_days integer default 7) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,pg_temp as $$
declare since_time timestamptz; result jsonb;
begin
 perform lead_priv.crm_require_admin();
 if _days not in (7,30,90) or _days is null then raise exception 'BAD_PERIOD'; end if;
 since_time:=((now() at time zone 'Europe/Paris')::date-(_days-1))::timestamp at time zone 'Europe/Paris';
 if (select count(*) from lead.product_usage_events e join lead.product_usage_sessions s on s.id=e.session_id where not s.excluded and s.created_at>=since_time)>200000 then raise exception 'PERIOD_TOO_LARGE'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'visitor',s.visitor,'started',s.created_at,'last',s.last_at,'events',(
  select coalesce(jsonb_agg(x.payload order by x.at,x.id),'[]') from (
   select e.occurred_at at,e.id::text id,jsonb_strip_nulls(jsonb_build_object('id',e.id,'flow',e.flow,'name',e.name,'at',e.occurred_at,'step',e.step,'source',e.source,'format',e.format,'size',e.size,'import_id',e.import_id)) payload
   from lead.product_usage_events e where e.session_id=s.id
   union all
   select b.pending_at,b.dossier_id::text||'p',jsonb_build_object('id',b.dossier_id::text||'p','flow',b.flow,'name','submission_pending','at',b.pending_at) from lead.product_usage_bindings b where b.session_id=s.id and b.pending_at is not null
   union all
   select b.confirmed_at,b.dossier_id::text||'s',jsonb_build_object('id',b.dossier_id::text||'s','flow',b.flow,'name','submission_confirmed','at',b.confirmed_at) from lead.product_usage_bindings b where b.session_id=s.id and b.confirmed_at is not null
   union all
   select b.pending_expires_at,b.dossier_id::text||'x',jsonb_build_object('id',b.dossier_id::text||'x','flow',b.flow,'name','submission_expired','at',b.pending_expires_at) from lead.product_usage_bindings b where b.session_id=s.id and b.confirmed_at is null and b.pending_expires_at<=now()
  ) x
 ))),'[]') into result from lead.product_usage_sessions s where not s.excluded and s.created_at>=since_time;
 return jsonb_build_object('now',now(),'since',since_time,'sessions',result);
end $$;

create function public.product_usage_ingest(_session uuid,_token uuid,_visitor uuid,_locale text,_device text,_events jsonb) returns void language sql security invoker set search_path=pg_catalog,pg_temp as $$select lead_priv.product_usage_ingest(_session,_token,_visitor,_locale,_device,_events)$$;
create function public.product_usage_bind(_session uuid,_token uuid,_flow uuid,_dossier uuid,_receipt_hash text default null) returns void language sql security invoker set search_path=pg_catalog,pg_temp as $$select lead_priv.product_usage_bind(_session,_token,_flow,_dossier,_receipt_hash)$$;
create function public.product_usage_report(_days integer default 7) returns jsonb language sql stable security invoker set search_path=pg_catalog,pg_temp as $$select lead_priv.product_usage_report(_days)$$;
revoke all on function lead_priv.product_usage_ingest(uuid,uuid,uuid,text,text,jsonb),lead_priv.product_usage_bind(uuid,uuid,uuid,uuid,text),lead_priv.product_usage_report(integer),lead_priv.product_usage_confirm(),public.product_usage_ingest(uuid,uuid,uuid,text,text,jsonb),public.product_usage_bind(uuid,uuid,uuid,uuid,text),public.product_usage_report(integer) from public,anon,authenticated;
grant usage on schema lead_priv to anon,authenticated;
grant execute on function lead_priv.product_usage_ingest(uuid,uuid,uuid,text,text,jsonb),lead_priv.product_usage_bind(uuid,uuid,uuid,uuid,text),public.product_usage_ingest(uuid,uuid,uuid,text,text,jsonb),public.product_usage_bind(uuid,uuid,uuid,uuid,text) to anon,authenticated;
grant execute on function lead_priv.product_usage_report(integer),public.product_usage_report(integer) to authenticated;
commit;
