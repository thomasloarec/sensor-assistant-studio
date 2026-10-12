-- ============================================================================
-- Lead Magnet v1.11 — contexte projet essentiel exigé côté serveur
-- STATUT : PRÉPARÉE, NON APPLIQUÉE. À appliquer uniquement après revue, sur le
-- backend yyobodalwtsqdyrqwkjk, par la session habilitée (jamais en parallèle).
--
-- But : parité avec `missingBusinessContext` (src/lib/leadmagnet/submission.ts).
-- Chaque champ essentiel du SNAPSHOT réellement inséré porte soit une valeur
-- valide, soit le marqueur explicite `business.undefinedFields` :
--   annualVolume        known + entier > 0           | "annualVolume"
--   projectPhase        exploration/design/prototype/industrialisation
--                                                    | unknown + "projectPhase"
--   seriesStartDate     date ISO AAAA-MM-JJ valide    | "seriesStartDate"
--   seriesDurationYears nombre fini > 0 et <= 100     | "seriesDurationYears"
-- `samplesNeededBy` reste facultatif.
--
-- Frontière de confiance : le contrôle lit le snapshot canonique stocké, jamais
-- un indicateur « vérifié » envoyé par le client.
-- Historique : déclencheur BEFORE INSERT uniquement. Aucune ligne existante
-- n'est relue, modifiée ni rendue illisible ; aucune lecture n'est touchée.
-- Limite assumée : un ancien dossier dont la phase « exploration » était la
-- valeur par défaut est indiscernable d'un choix explicite ; il est accepté.
-- Aucune table, colonne, policy ni grant d'accès n'est ajouté.
-- ============================================================================

create or replace function lead_priv.business_context_missing(_snapshot jsonb)
returns text[] language plpgsql immutable
set search_path = pg_temp as $$
declare
  b jsonb := coalesce(_snapshot -> 'business', '{}'::jsonb);
  deferred jsonb := case when jsonb_typeof(b -> 'undefinedFields') = 'array'
                         then b -> 'undefinedFields' else '[]'::jsonb end;
  missing text[] := '{}';
  v jsonb;
  d date;
begin
  -- Volume annuel
  v := b #> '{annualVolume,sensorsPerYear}';
  if not (deferred ? 'annualVolume')
     and not ((b #>> '{annualVolume,kind}') = 'known'
              and jsonb_typeof(v) = 'number'
              and (v::text)::numeric > 0
              and (v::text)::numeric = trunc((v::text)::numeric)
              and (v::text)::numeric <= 1000000000) then
    missing := array_append(missing, 'annualVolume');
  end if;
  -- Phase : « unknown » n'est valable qu'avec le marqueur explicite.
  if not ((b ->> 'projectPhase') in ('exploration','design','prototype','industrialisation')
          or ((b ->> 'projectPhase') = 'unknown' and deferred ? 'projectPhase')) then
    missing := array_append(missing, 'projectPhase');
  end if;
  -- Date de lancement série
  if not (deferred ? 'seriesStartDate') then
    d := null;
    if jsonb_typeof(b -> 'seriesStartDate') = 'string'
       and (b ->> 'seriesStartDate') ~ '^\d{4}-\d{2}-\d{2}$' then
      begin
        d := (b ->> 'seriesStartDate')::date;
        if to_char(d, 'YYYY-MM-DD') <> (b ->> 'seriesStartDate') then d := null; end if;
      exception when others then d := null;
      end;
    end if;
    if d is null then missing := array_append(missing, 'seriesStartDate'); end if;
  end if;
  -- Durée de série
  v := b -> 'seriesDurationYears';
  if not (deferred ? 'seriesDurationYears')
     and not (jsonb_typeof(v) = 'number'
              and (v::text)::numeric > 0
              and (v::text)::numeric <= 100) then
    missing := array_append(missing, 'seriesDurationYears');
  end if;
  return missing;
end $$;

create or replace function lead_priv.design_revisions_business_guard()
returns trigger language plpgsql
set search_path = pg_temp as $$
declare m text[];
begin
  m := lead_priv.business_context_missing(new.snapshot);
  if cardinality(m) > 0 then
    raise exception 'BUSINESS_CONTEXT_REQUIRED:%', array_to_string(m, ',')
      using errcode = '22023';
  end if;
  return new;
end $$;

revoke all on function lead_priv.business_context_missing(jsonb) from public, anon, authenticated;
revoke all on function lead_priv.design_revisions_business_guard() from public, anon, authenticated;

drop trigger if exists design_revisions_business_guard on lead.design_revisions;
create trigger design_revisions_business_guard
  before insert on lead.design_revisions
  for each row execute function lead_priv.design_revisions_business_guard();

insert into lead.schema_migrations (version) values ('1.11')
on conflict (version) do nothing;
