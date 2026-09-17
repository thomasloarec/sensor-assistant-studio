-- New submissions require site location. Existing revisions are immutable and unchanged.
begin;
create or replace function lead_priv.require_site_location()
returns trigger language plpgsql security invoker
set search_path = pg_catalog, pg_temp as $$
begin
  if coalesce(btrim(new.snapshot #>> '{business,siteCity}'), '') = ''
     or length(new.snapshot #>> '{business,siteCity}') > 160
     or not coalesce((new.snapshot #>> '{business,siteCountry}') = any(string_to_array('AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW', ' ')), false) then
    raise exception 'SITE_LOCATION_REQUIRED' using errcode = '22023';
  end if;
  return new;
end $$;
revoke all on function lead_priv.require_site_location() from public;
drop trigger if exists require_site_location on lead.design_revisions;
create trigger require_site_location before insert on lead.design_revisions
for each row execute function lead_priv.require_site_location();
create or replace function lead_priv.crm_row_json(_dossier uuid)
returns jsonb language sql stable security definer
set search_path = lead, lead_priv, pg_temp as $$
  select jsonb_build_object(
    'dossier_id', d.id,
    'title', d.title,
    'current_revision', d.current_revision,
    'nda_status', d.nda_status,
    'dossier_created_at', d.created_at,
    'dossier_updated_at', d.updated_at,
    'filed', c.dossier_id is not null,
    'stage', coalesce(c.stage, 'lead'), 'stage_since', c.stage_since,
    'company', c.company, 'project_name', c.project_name, 'country_code', coalesce(c.country_code, lead_priv.crm_submitted_business(d.id)->>'siteCountry'),
    'site_city', lead_priv.crm_submitted_business(d.id)->>'siteCity',
    'sales_contact_suggested', case lead_priv.crm_submitted_business(d.id)->>'siteCountry' when 'FR' then 'Thomas LOAREC' when 'DE' then 'Thomas FRANKE' else case when lead_priv.crm_submitted_business(d.id)->>'siteCountry' is not null then 'Hemant SINGH' end end,
    'sales_person', c.sales_person, 'fae_person', c.fae_person,
    'currency', c.currency, 'unit_price', c.unit_price, 'unit_cost', c.unit_cost,
    'cost_in_sap', c.cost_in_sap,
    'annual_volume_override', c.annual_volume_override,
    'annual_volume_submitted', lead_priv.crm_submitted_volume(d.id),
    'estimated_annual_revenue', c.estimated_annual_revenue,
    'series_launch', c.series_launch,
    -- Ce que le client a réellement déclaré : sert d'affichage par défaut, sans
    -- jamais écraser ni la soumission ni une correction interne explicite.
    'company_submitted', lead_priv.crm_submitted_company(d.id),
    'series_launch_submitted', lead_priv.crm_submitted_series_launch(d.id),
    'company_effective', coalesce(c.company, lead_priv.crm_submitted_company(d.id)),
    'series_launch_effective', coalesce(c.series_launch,
                                        lead_priv.crm_submitted_series_launch(d.id)),
    'company_source', case when c.company is not null then 'override'
                           when lead_priv.crm_submitted_company(d.id) is not null then 'submitted'
                           else 'unknown' end,
    'series_launch_source', case when c.series_launch is not null then 'override'
                                 when lead_priv.crm_submitted_series_launch(d.id) is not null
                                   then 'submitted' else 'unknown' end,
    'updated_at', coalesce(c.updated_at, d.updated_at), 'version', coalesce(c.version, 0),
    'tasks_total', (select count(*) from lead.dossier_tasks t
                     where t.dossier_id = d.id and t.status <> 'not_applicable'),
    'tasks_done', (select count(*) from lead.dossier_tasks t
                    where t.dossier_id = d.id and t.status = 'done'),
    'tasks_blocked', (select count(*) from lead.dossier_tasks t
                       where t.dossier_id = d.id and t.status = 'blocked'),
    'tasks_overdue', (select count(*) from lead.dossier_tasks t
                       where t.dossier_id = d.id and t.due_on is not null
                         and t.due_on < current_date
                         and t.status not in ('done','not_applicable')),
    -- Âge de l'étape EN COURS : activation des items de CETTE étape, et non le
    -- plus ancien item inachevé, qui pouvait appartenir à une étape future.
    -- Un plan d'actions créé d'un coup date TOUS ses items du même instant :
    -- une étape ne peut donc pas être « en cours » avant que le projet y entre.
    'stage_activated_at', coalesce(
      (select t.activated_at from lead.dossier_tasks t
        where t.dossier_id = d.id and t.status not in ('done','not_applicable')
          and t.activated_at is not null
        order by t.stage, t.sort_order, t.created_at limit 1),
      c.stage_since))

  from lead.design_dossiers d
  left join lead.dossier_crm c on c.dossier_id = d.id
  where d.id = _dossier;
$$;
-- crm_row_json is private; its existing permission-checked public callers are unchanged.
revoke all on function lead_priv.crm_row_json(uuid) from public;
commit;
