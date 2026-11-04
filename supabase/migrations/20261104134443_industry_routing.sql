begin;
create table lead.industries(name text primary key);
insert into lead.industries values
 ('Appliances'),('RnD University, Laboratory'),('Fluid Flow'),('Distributors'),
 ('Alternative Energy'),('SME Locations'),('Industrial Applications'),('HVAC'),
 ('Test & Measurement'),('Lighting'),('Medical'),('Agriculture & Construction Equipment'),
 ('Contract Manufacturer'),('Security'),('Automotive'),('Mil-Aero & Space'),('Meters'),
 ('Representatives'),('Consumer Electronics & Toys'),('Telecommunications, IT'),('Transportation');
create table lead.sales_industries(
 country text not null references lead.geo_countries(code),
 industry text not null references lead.industries(name),
 owner uuid references lead.crm_directory(id), version int not null default 0,
 primary key(country,industry)
);
alter table lead.industries enable row level security;
alter table lead.sales_industries enable row level security;
revoke all on lead.industries,lead.sales_industries from public,anon,authenticated;
alter table lead.sales_routes add column industry text references lead.industries(name),
 add column routing_basis text check(routing_basis in ('industry','geography')),
 add column industry_version int;

create or replace function lead_priv.sales_overview() returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,lead,lead_priv,pg_temp as $$
begin
 perform lead_priv.crm_require_admin();
 return jsonb_build_object(
 'territories',coalesce((select jsonb_agg(to_jsonb(s) order by country) from lead.sales_territories s),'[]'),
 'regions',coalesce((select jsonb_agg(to_jsonb(r) order by country,name) from lead.geo_regions r),'[]'),
 'imports',coalesce((select jsonb_agg(to_jsonb(i)) from lead.geo_imports i),'[]'),
 'profiles',coalesce((select jsonb_agg(to_jsonb(p)) from lead.sales_profiles p),'[]'),
 'industries',coalesce((select jsonb_agg(to_jsonb(i) order by country,industry) from lead.sales_industries i),'[]'));
end $$;

create function lead_priv.sales_industry_change(_country text,_industry text,_person uuid,_remove boolean,_version int,_confirm boolean)
returns jsonb language plpgsql security definer set search_path=pg_catalog,lead,lead_priv,pg_temp as $$
declare actor uuid:=lead_priv.crm_require_admin(); s lead.sales_industries; previous jsonb;
begin
 if not exists(select 1 from lead.geo_countries where code=_country) then raise exception 'UNKNOWN_COUNTRY'; end if;
 if not exists(select 1 from lead.industries where name=_industry) then raise exception 'INVALID_INDUSTRY'; end if;
 perform 1 from lead.crm_directory where id=_person and active and role='sales' for update;
 if not found then raise exception 'INVALID_SALES_PERSON'; end if;
 if _remove is null then raise exception 'BAD_OPERATION'; end if;
 insert into lead.sales_industries(country,industry) values(_country,_industry) on conflict do nothing;
 select * into s from lead.sales_industries where country=_country and industry=_industry for update;
 if s.version is distinct from _version then raise exception 'TERRITORY_STALE'; end if;
 if _confirm is distinct from true then raise exception 'TRANSFER_CONFIRMATION_REQUIRED'; end if;
 previous:=to_jsonb(s);
 if _remove and s.owner is distinct from _person then raise exception 'TERRITORY_STALE'; end if;
 update lead.sales_industries set owner=case when _remove then null else _person end,version=version+1
 where country=_country and industry=_industry returning * into s;
 insert into lead.audit_log(actor,action,detail) values(actor,'sales_industry_changed',jsonb_build_object('before',previous,'after',to_jsonb(s)));
 return lead_priv.sales_overview();
end $$;
create function public.lead_sales_industry_change(p_country text,p_industry text,p_person uuid,p_remove boolean,p_version int,p_confirm boolean)
returns jsonb language sql security invoker set search_path=pg_catalog,pg_temp as $$
 select lead_priv.sales_industry_change(p_country,p_industry,p_person,p_remove,p_version,p_confirm); $$;

create function lead_priv.sales_industry_person_guard() returns trigger language plpgsql security definer
set search_path=pg_catalog,lead,pg_temp as $$
begin
 if (not new.active or new.role<>'sales') and exists(select 1 from lead.sales_industries where owner=new.id) then
  raise exception 'TRANSFER_INDUSTRIES_FIRST';
 end if;
 return new;
end $$;
create trigger sales_industry_person_guard before update on lead.crm_directory for each row execute function lead_priv.sales_industry_person_guard();

create function lead_priv.sales_resolve_industry(_country text,_region text,_industry text) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,lead,lead_priv,pg_temp as $$
declare s lead.sales_industries;
begin
 select i.* into s from lead.sales_industries i join lead.crm_directory p on p.id=i.owner
 where i.country=_country and i.industry=_industry and p.active and p.role='sales';
 if found then return jsonb_build_object('person_id',s.owner,'reason','assigned','version',null,'basis','industry','industry_version',s.version); end if;
 return lead_priv.sales_resolve(_country,_region)||jsonb_build_object('basis','geography','industry_version',null);
end $$;
create function lead_priv.sales_contact_for_industry(_country text,_city text,_industry text) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,lead,lead_priv,pg_temp as $$
declare region text; result jsonb;
begin
 if _industry is not null and not exists(select 1 from lead.industries where name=_industry) then raise exception 'INVALID_INDUSTRY'; end if;
 select region_code into region from lead.geo_cities where id=_city and country=_country;
 result:=lead_priv.sales_resolve_industry(_country,region,_industry);
 return result||jsonb_build_object('contact',(
 select jsonb_build_object('id',p.id,'name',p.first_name||' '||p.last_name,
 'photo_path',f.photo_path,'microsoft_photo_path',case when f.microsoft_user_id=p.user_id then f.microsoft_photo_path end,
 'booking_url',f.booking_url,'country',_country,'region_code',region)
 from lead.crm_directory p left join lead.sales_profiles f on f.person_id=p.id where p.id=(result->>'person_id')::uuid));
end $$;
create function public.lead_sales_contact_for_industry(p_country text,p_city text,p_industry text) returns jsonb
language sql stable security invoker set search_path=pg_catalog,pg_temp as $$
 select lead_priv.sales_contact_for_industry(p_country,p_city,p_industry); $$;

-- New submissions only. Historical snapshots are neither rewritten nor invalidated.
create function lead_priv.require_industry() returns trigger language plpgsql security definer
set search_path=pg_catalog,lead,pg_temp as $$
begin
 if not exists(select 1 from lead.industries where name=new.snapshot #>> '{business,industry}')
  or (new.snapshot #> '{business,industryConfirmed}') is distinct from 'true'::jsonb
 then raise exception 'INDUSTRY_REQUIRED' using errcode='22023'; end if;
 return new;
end $$;
create trigger require_industry before insert on lead.design_revisions for each row execute function lead_priv.require_industry();
-- Also protect anonymous pending submissions before an email is sent.
do $$ begin
 if to_regclass('lead.customer_pending') is not null then
 execute 'create trigger require_pending_industry before insert or update of snapshot on lead.customer_pending for each row when (new.snapshot is not null) execute function lead_priv.require_industry()';
 end if;
end $$;

create or replace function lead_priv.sales_route_revision() returns trigger language plpgsql security definer
set search_path=pg_catalog,lead,lead_priv,pg_temp as $$
declare region text; result jsonb;
begin
 region:=lead_priv.sales_validate_city(new.snapshot->'business');
 result:=lead_priv.sales_resolve_industry(new.snapshot #>> '{business,siteCountry}',region,new.snapshot #>> '{business,industry}');
 insert into lead.sales_routes(revision_id,person_id,country,region_code,reason,territory_version,industry,routing_basis,industry_version)
 values(new.id,(result->>'person_id')::uuid,new.snapshot #>> '{business,siteCountry}',region,result->>'reason',
 (result->>'version')::int,new.snapshot #>> '{business,industry}',result->>'basis',(result->>'industry_version')::int);
 return new;
end $$;
create or replace function lead_priv.crm_row_json(_dossier uuid) returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,lead,lead_priv,pg_temp as $$
declare base jsonb:=lead_priv.crm_row_json_before_territories(_dossier); route lead.sales_routes; pname text;
begin
 select sr.* into route from lead.sales_routes sr join lead.design_revisions r on r.id=sr.revision_id where r.dossier_id=_dossier order by r.revision desc limit 1;
 select first_name||' '||last_name into pname from lead.crm_directory where id=route.person_id;
 return base||jsonb_build_object('sales_contact_suggested',pname,'territory_sales_person',route.person_id,'territory_status',route.reason,
 'site_region_code',route.region_code,'industry',route.industry,'routing_basis',route.routing_basis);
end $$;
revoke all on function lead_priv.sales_industry_change(text,text,uuid,boolean,int,boolean),lead_priv.sales_industry_person_guard(),
 lead_priv.sales_resolve_industry(text,text,text),lead_priv.sales_contact_for_industry(text,text,text),lead_priv.require_industry()
 from public,anon,authenticated;
revoke all on function public.lead_sales_industry_change(text,text,uuid,boolean,int,boolean),public.lead_sales_contact_for_industry(text,text,text) from public,anon,authenticated;
grant execute on function lead_priv.sales_industry_change(text,text,uuid,boolean,int,boolean),public.lead_sales_industry_change(text,text,uuid,boolean,int,boolean) to authenticated;
grant execute on function lead_priv.sales_contact_for_industry(text,text,text),public.lead_sales_contact_for_industry(text,text,text) to anon,authenticated;
-- Bounded public AI service: persistent counters shared by all edge instances.
-- Only service_role can debit them; no project text or raw IP is stored.
create table lead.project_identity_limits(key text not null,window_start timestamptz not null,count int not null,primary key(key,window_start));
alter table lead.project_identity_limits enable row level security;
revoke all on lead.project_identity_limits from public,anon,authenticated;
create function lead_priv.project_identity_rate(_key text,_global boolean) returns boolean
language plpgsql security definer set search_path=pg_catalog,lead,pg_temp as $$
declare n int;
begin
 if _key is null or _key !~ '^[a-f0-9]{64}$' or _global is null then raise exception 'BAD_INPUT'; end if;
 delete from lead.project_identity_limits where window_start < now()-interval '2 days';
 insert into lead.project_identity_limits values(_key,date_trunc('hour',now()),1)
 on conflict(key,window_start) do update set count=project_identity_limits.count+1 returning count into n;
 return n <= case when _global then 120 else 12 end;
end $$;
create function public.lead_project_identity_rate(p_key text,p_global boolean) returns boolean
language sql security invoker set search_path=pg_catalog,pg_temp as $$select lead_priv.project_identity_rate(p_key,p_global);$$;
revoke all on function lead_priv.project_identity_rate(text,boolean),public.lead_project_identity_rate(text,boolean) from public,anon,authenticated;
grant execute on function lead_priv.project_identity_rate(text,boolean),public.lead_project_identity_rate(text,boolean) to service_role;
commit;
