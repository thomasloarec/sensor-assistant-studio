-- Territorial ownership is business routing, NEVER a grant of dossier access.
-- Requires CRM 1.8 and the site-location migration. Reference data imported separately.
begin;
create table lead.geo_countries(code text primary key check(code ~ '^[A-Z]{2}$'));
create table lead.geo_regions (
  code text primary key, country text not null check(country ~ '^[A-Z]{2}$'), name text not null,
  unique(country,code)
);
create table lead.geo_cities (
  id text primary key check(id ~ '^[0-9]{1,12}$'), name text not null,
  country text not null, region_code text not null, district text not null default '', search_name text not null,
  foreign key(country,region_code) references lead.geo_regions(country,code)
);
create index geo_cities_country_name on lead.geo_cities(country,lower(name) text_pattern_ops);
create table lead.geo_imports(country text primary key,imported_at timestamptz not null,source_sha256 text not null,place_count int not null);
create table lead.sales_territories (
  country text primary key check(country ~ '^[A-Z]{2}$'),
  version int not null default 0, owner uuid references lead.crm_directory(id),
  region_owners jsonb not null default '{}' check(jsonb_typeof(region_owners)='object'),
  check(owner is null or region_owners='{}'::jsonb)
);
create table lead.sales_profiles (
  person_id uuid primary key references lead.crm_directory(id),
  photo_path text, microsoft_photo_path text, microsoft_user_id uuid,
  booking_url text, version int not null default 0,
  check(booking_url is null or (length(booking_url)<=2048 and booking_url ~ '^https://[^/@[:space:]]+([/:?#]|$)' and booking_url !~ '[[:space:]]'))
);
create table lead.sales_routes (
  revision_id uuid primary key references lead.design_revisions(id),
  person_id uuid references lead.crm_directory(id), country text not null, region_code text,
  reason text not null check(reason in ('assigned','region_required','uncovered')),
  territory_version int, routed_at timestamptz not null default now()
);
alter table lead.geo_regions enable row level security;
alter table lead.geo_countries enable row level security;
alter table lead.geo_cities enable row level security;
alter table lead.geo_imports enable row level security;
alter table lead.sales_territories enable row level security;
alter table lead.sales_profiles enable row level security;
alter table lead.sales_routes enable row level security;
revoke all on lead.geo_regions,lead.geo_cities,lead.geo_imports,lead.sales_territories,lead.sales_profiles,lead.sales_routes from public,anon,authenticated;
revoke all on lead.geo_countries from public,anon,authenticated;

create function lead_priv.sales_overview() returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,lead,lead_priv,pg_temp as $$
begin
  perform lead_priv.crm_require_admin();
  return jsonb_build_object(
    'territories',coalesce((select jsonb_agg(to_jsonb(s) order by country) from lead.sales_territories s),'[]'),
    'regions',coalesce((select jsonb_agg(to_jsonb(r) order by country,name) from lead.geo_regions r),'[]'),
    'imports',coalesce((select jsonb_agg(to_jsonb(i)) from lead.geo_imports i),'[]'),
    'profiles',coalesce((select jsonb_agg(to_jsonb(p)) from lead.sales_profiles p),'[]'));
end $$;
create function public.lead_sales_overview() returns jsonb language sql security invoker
set search_path=pg_catalog,pg_temp as $$ select lead_priv.sales_overview(); $$;

-- A single locked row is the authority for a country. A region has one JSON key,
-- hence one owner; whole-country and regional ownership cannot coexist.
create function lead_priv.sales_change(_country text,_person uuid,_operation text,_regions text[],_version int,_confirm boolean)
returns jsonb language plpgsql security definer set search_path=pg_catalog,lead,lead_priv,pg_temp as $$
declare actor uuid:=lead_priv.crm_require_admin(); s lead.sales_territories; before_state jsonb;
  k text; conflict boolean:=false;
begin
  if _country is null or _country !~ '^[A-Z]{2}$' or not exists(select 1 from lead.geo_countries where code=_country)
    then raise exception 'UNKNOWN_COUNTRY'; end if;
  -- All eligibility changes use the same lock order: person, then country.
  perform 1 from lead.crm_directory where id=_person and active and role='sales' for update;
  if not found then raise exception 'INVALID_SALES_PERSON'; end if;
  insert into lead.sales_territories(country) values(_country) on conflict do nothing;
  select * into s from lead.sales_territories where country=_country for update;
  if _version is distinct from s.version then raise exception 'TERRITORY_STALE'; end if;
  before_state:=to_jsonb(s);
  if _operation is null or _operation not in ('country','regions','remove_country','remove_regions') then raise exception 'BAD_TERRITORY'; end if;
  if _operation in ('regions','remove_regions') then
    if coalesce(cardinality(_regions),0)=0 or cardinality(_regions)>1000 then raise exception 'BAD_REGIONS'; end if;
    foreach k in array _regions loop
      if k is null or not exists(select 1 from lead.geo_regions where code=k and country=_country) then raise exception 'BAD_REGIONS'; end if;
    end loop;
  end if;
  if _operation='country' then
    conflict:=(s.owner is not null and s.owner<>_person) or exists(select 1 from jsonb_each_text(s.region_owners) where value<>_person::text);
    s.owner:=_person; s.region_owners:='{}';
  elsif _operation='regions' then
    conflict:=s.owner is not null and s.owner<>_person;
    if s.owner is not null then
      select jsonb_object_agg(code,s.owner::text) into s.region_owners from lead.geo_regions where country=_country;
      s.owner:=null;
    end if;
    foreach k in array _regions loop
      conflict:=conflict or (s.region_owners ? k and s.region_owners->>k <> _person::text);
      s.region_owners:=s.region_owners || jsonb_build_object(k,_person::text);
    end loop;
  elsif _operation='remove_country' then
    if s.owner=_person then s.owner:=null; end if;
    select coalesce(jsonb_object_agg(key,value),'{}') into s.region_owners from jsonb_each(s.region_owners) where value<>to_jsonb(_person::text);
    conflict:=true;
  else
    if s.owner is not null then raise exception 'SPLIT_FIRST'; end if;
    foreach k in array _regions loop
      if s.region_owners->>k=_person::text then s.region_owners:=s.region_owners-k; end if;
    end loop;
    conflict:=true;
  end if;
  if conflict and _confirm is distinct from true then raise exception 'TRANSFER_CONFIRMATION_REQUIRED'; end if;
  update lead.sales_territories set owner=s.owner,region_owners=s.region_owners,version=version+1 where country=_country;
  insert into lead.audit_log(actor,action,detail) values(actor,'sales_territory_changed',jsonb_build_object('before',before_state,'after',to_jsonb(s),'operation',_operation,'person',_person));
  return lead_priv.sales_overview();
end $$;
create function public.lead_sales_change(p_country text,p_person uuid,p_operation text,p_regions text[],p_version int,p_confirm boolean)
returns jsonb language sql security invoker set search_path=pg_catalog,pg_temp as $$
select lead_priv.sales_change(p_country,p_person,p_operation,p_regions,p_version,p_confirm); $$;

create function lead_priv.sales_person_guard() returns trigger language plpgsql security definer
set search_path=pg_catalog,lead,pg_temp as $$
begin
  if (not new.active or new.role<>'sales') and exists(select 1 from lead.sales_territories where owner=new.id
    or exists(select 1 from jsonb_each_text(region_owners) where value=new.id::text)) then
    raise exception 'TRANSFER_TERRITORIES_FIRST';
  end if;
  -- A different linked account must never inherit the previous account's photo.
  if new.user_id is distinct from old.user_id then
    update lead.sales_profiles set microsoft_photo_path=null,microsoft_user_id=null,version=version+1 where person_id=new.id;
  end if;
  return new;
end $$;
create trigger sales_person_guard before update on lead.crm_directory for each row execute function lead_priv.sales_person_guard();

create function lead_priv.geo_search(_country text,_query text) returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,lead,pg_temp as $$
declare q text:=lower(btrim(_query));
begin
  if length(q)<2 or length(q)>100 then return jsonb_build_object('ready',exists(select 1 from lead.geo_imports where country=_country),'cities','[]'::jsonb); end if;
  return jsonb_build_object('ready',exists(select 1 from lead.geo_imports where country=_country),
    'cities',coalesce((select jsonb_agg(to_jsonb(x)) from (
      select c.id,c.name,c.country,c.region_code,r.name as region_name,c.district
      from lead.geo_cities c join lead.geo_regions r on r.code=c.region_code
      where c.country=_country and (starts_with(lower(c.name),q) or position('|'||q in c.search_name)>0)
      order by (lower(c.name)=q) desc,c.name,c.district,c.id limit 25
    ) x),'[]'));
end $$;
create function public.lead_geo_search(p_country text,p_query text) returns jsonb language sql stable security invoker
set search_path=pg_catalog,pg_temp as $$ select lead_priv.geo_search(p_country,p_query); $$;

-- Validate the selected immutable GeoNames identifier against the imported reference.
-- Free-text legacy/unresolved cities are kept, but never used to guess a region.
create function lead_priv.sales_validate_city(_business jsonb) returns text language plpgsql stable security definer
set search_path=pg_catalog,lead,pg_temp as $$
declare city lead.geo_cities;
begin
  if nullif(_business->>'siteCityId','') is null then
    if nullif(_business->>'siteRegionCode','') is not null then raise exception 'CITY_SELECTION_REQUIRED'; end if;
    return null;
  end if;
  select * into city from lead.geo_cities where id=_business->>'siteCityId';
  if not found or city.country is distinct from _business->>'siteCountry'
    or city.name is distinct from _business->>'siteCity'
    or city.region_code is distinct from _business->>'siteRegionCode'
    then raise exception 'CITY_SELECTION_REQUIRED'; end if;
  if nullif(_business->>'siteRegionName','') is not null and not exists(select 1 from lead.geo_regions where code=city.region_code and name=_business->>'siteRegionName') then raise exception 'CITY_SELECTION_REQUIRED'; end if;
  return city.region_code;
end $$;
create function lead_priv.sales_resolve(_country text,_region text) returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,lead,pg_temp as $$
declare s lead.sales_territories; person uuid; reason text;
begin
  select * into s from lead.sales_territories where country=_country;
  person:=coalesce(s.owner,(s.region_owners->>_region)::uuid);
  if person is not null and not exists(select 1 from lead.crm_directory where id=person and active and role='sales') then person:=null; end if;
  reason:=case when person is not null then 'assigned' when s.region_owners<>'{}' and _region is null then 'region_required' else 'uncovered' end;
  return jsonb_build_object('person_id',person,'reason',reason,'version',s.version);
end $$;
create function lead_priv.sales_contact(_country text,_city text) returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,lead,pg_temp as $$
declare region text; result jsonb;
begin
  select region_code into region from lead.geo_cities where id=_city and country=_country;
  result:=lead_priv.sales_resolve(_country,region);
  return result || jsonb_build_object('contact',(
    select jsonb_build_object('id',p.id,'name',p.first_name||' '||p.last_name,
      'photo_path',f.photo_path,'microsoft_photo_path',case when f.microsoft_user_id=p.user_id then f.microsoft_photo_path end,
      'booking_url',f.booking_url,'country',_country,'region_code',region)
    from lead.crm_directory p left join lead.sales_profiles f on f.person_id=p.id where p.id=(result->>'person_id')::uuid));
end $$;
create function public.lead_sales_contact(p_country text,p_city text default null) returns jsonb language sql stable security invoker
set search_path=pg_catalog,pg_temp as $$ select lead_priv.sales_contact(p_country,p_city); $$;
create function lead_priv.sales_route_revision() returns trigger language plpgsql security definer
set search_path=pg_catalog,lead,pg_temp as $$
declare region text; result jsonb;
begin
  region:=lead_priv.sales_validate_city(new.snapshot->'business');
  result:=lead_priv.sales_resolve(new.snapshot #>> '{business,siteCountry}',region);
  insert into lead.sales_routes(revision_id,person_id,country,region_code,reason,territory_version)
  values(new.id,(result->>'person_id')::uuid,new.snapshot #>> '{business,siteCountry}',region,result->>'reason',(result->>'version')::int);
  return new;
end $$;
create trigger sales_route_revision after insert on lead.design_revisions for each row execute function lead_priv.sales_route_revision();

-- Wrap the existing CRM projection, preserving manually assigned sales and all financial fields.
alter function lead_priv.crm_row_json(uuid) rename to crm_row_json_before_territories;
create function lead_priv.crm_row_json(_dossier uuid) returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,lead,lead_priv,pg_temp as $$
declare base jsonb:=lead_priv.crm_row_json_before_territories(_dossier); route lead.sales_routes; pname text;
begin
  select sr.* into route from lead.sales_routes sr join lead.design_revisions r on r.id=sr.revision_id where r.dossier_id=_dossier order by r.revision desc limit 1;
  select first_name||' '||last_name into pname from lead.crm_directory where id=route.person_id;
  return base || jsonb_build_object('sales_contact_suggested',pname,'territory_sales_person',route.person_id,'territory_status',route.reason,'site_region_code',route.region_code);
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('sales-portraits','sales-portraits',true,2097152,array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;
create function lead_priv.sales_storage_admin() returns boolean language sql stable security definer
set search_path=pg_catalog,pg_temp as $$ select auth.uid() is not null and lead_priv.role_of(auth.uid())='admin'; $$;
create policy sales_portrait_admin_insert on storage.objects for insert to authenticated
with check(bucket_id='sales-portraits' and lead_priv.sales_storage_admin());
create policy sales_portrait_admin_read on storage.objects for select to authenticated
using(bucket_id='sales-portraits' and lead_priv.sales_storage_admin());
create policy sales_portrait_admin_delete on storage.objects for delete to authenticated
using(bucket_id='sales-portraits' and lead_priv.sales_storage_admin());

create function lead_priv.sales_profile_save(_person uuid,_photo text,_booking text,_version int) returns jsonb language plpgsql security definer
set search_path=pg_catalog,lead,pg_temp as $$
declare actor uuid:=lead_priv.crm_require_admin(); v int;
begin
  if not exists(select 1 from lead.crm_directory where id=_person) then raise exception 'BAD_PERSON'; end if;
  insert into lead.sales_profiles(person_id) values(_person) on conflict do nothing;
  select version into v from lead.sales_profiles where person_id=_person for update;
  if v is distinct from _version then raise exception 'TERRITORY_STALE'; end if;
  if _photo is not null and (not starts_with(_photo,_person::text||'/') or _photo !~ '^[a-f0-9-]+/[a-f0-9-]+\.(jpg|png|webp)$'
    or not exists(select 1 from storage.objects where bucket_id='sales-portraits' and name=_photo)) then raise exception 'INVALID_PHOTO'; end if;
  if _booking is not null and (_booking !~ '^https://[^/@[:space:]]+([/:?#]|$)' or length(_booking)>2048 or _booking ~ '[[:space:]]') then raise exception 'INVALID_BOOKING_URL'; end if;
  update lead.sales_profiles set photo_path=_photo,booking_url=_booking,version=version+1 where person_id=_person;
  insert into lead.audit_log(actor,action,detail) values(actor,'sales_profile_changed',jsonb_build_object('person',_person,'photo',_photo is not null,'booking',_booking is not null));
  return lead_priv.sales_overview();
end $$;
create function public.lead_sales_profile_save(p_person uuid,p_photo text,p_booking text,p_version int) returns jsonb language sql security invoker
set search_path=pg_catalog,pg_temp as $$ select lead_priv.sales_profile_save(p_person,p_photo,p_booking,p_version); $$;

alter function lead_priv.crm_admin_overview() rename to crm_admin_overview_before_sales;
create function lead_priv.crm_admin_overview() returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,lead,pg_temp as $$
declare base jsonb:=lead_priv.crm_admin_overview_before_sales();
begin
  return base || jsonb_build_object('directory',coalesce((select jsonb_agg(p.value||jsonb_build_object('photo_path',f.photo_path,'microsoft_photo_path',case when f.microsoft_user_id=(p.value->>'user_id')::uuid then f.microsoft_photo_path end) order by p.ordinality)
    from jsonb_array_elements(base->'directory') with ordinality p(value,ordinality) left join lead.sales_profiles f on f.person_id=(p.value->>'id')::uuid),'[]'));
end $$;
-- SQL wrappers retain function OIDs; explicitly point them at the new projection.
create or replace function public.lead_crm_admin_overview() returns jsonb language sql stable security invoker
set search_path=pg_catalog,pg_temp as $$ select lead_priv.crm_admin_overview(); $$;
revoke all on function lead_priv.crm_admin_overview() from public;
grant execute on function lead_priv.crm_admin_overview() to authenticated;

revoke all on function lead_priv.sales_overview(),lead_priv.sales_change(text,uuid,text,text[],int,boolean),lead_priv.sales_person_guard(),lead_priv.geo_search(text,text),lead_priv.sales_validate_city(jsonb),lead_priv.sales_resolve(text,text),lead_priv.sales_contact(text,text),lead_priv.sales_route_revision(),lead_priv.sales_storage_admin(),lead_priv.sales_profile_save(uuid,text,text,int),lead_priv.crm_row_json(uuid) from public,anon,authenticated;
revoke all on function public.lead_sales_overview(),public.lead_sales_change(text,uuid,text,text[],int,boolean),public.lead_geo_search(text,text),public.lead_sales_contact(text,text),public.lead_sales_profile_save(uuid,text,text,int) from public;
grant execute on function lead_priv.sales_overview(),lead_priv.sales_change(text,uuid,text,text[],int,boolean),lead_priv.sales_storage_admin(),lead_priv.sales_profile_save(uuid,text,text,int),public.lead_sales_overview(),public.lead_sales_change(text,uuid,text,text[],int,boolean),public.lead_sales_profile_save(uuid,text,text,int) to authenticated;
grant execute on function lead_priv.geo_search(text,text),lead_priv.sales_contact(text,text),public.lead_geo_search(text,text),public.lead_sales_contact(text,text) to anon,authenticated;
commit;
