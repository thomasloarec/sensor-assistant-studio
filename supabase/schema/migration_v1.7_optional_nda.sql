-- ============================================================================
-- Lead Magnet — migration ADDITIVE 1.7 : NDA OPTIONNEL
-- Date : 2026-09-09
--
-- Portée : AUCUNE table modifiée, AUCUNE donnée existante mise à jour en masse.
-- Objet unique : permettre au PROPRIÉTAIRE d'un dossier de déclarer explicitement
-- si un accord de confidentialité est nécessaire, dans les deux sens, et
-- seulement tant qu'aucune signature n'existe réellement.
--
-- Règles serveur conservées telles quelles :
--   * `lead_priv.nda_allows_transfer` reste l'autorité du transfert ;
--   * une preuve vérifiée ne peut JAMAIS être annulée depuis le client ;
--   * `in_force` n'est pas rétrogradable ici ;
--   * aucun dossier existant n'est modifié par l'application de ce fichier.
--
-- Note vérifiée sur l'existant : `lead_priv.prepare_nda` place le dossier en
-- `awaiting_signatures` DÈS la préparation d'un document vide, sans preuve et
-- sans envoi en signature. Ce statut ne constitue donc pas, à lui seul, un
-- engagement contractuel : le retrait explicite du propriétaire y reste permis
-- tant qu'aucune preuve n'est enregistrée et que le statut n'est pas `in_force`.
-- ============================================================================

begin;

create or replace function lead_priv.set_nda_requirement(_dossier uuid, _required boolean)
returns jsonb language plpgsql security definer
set search_path = lead, lead_priv, pg_temp as $$
declare u uuid := lead_priv.require_user(); d lead.design_dossiers%rowtype; req boolean := coalesce(_required, false);
begin
  if _dossier is null then raise exception 'DOSSIER_NOT_FOUND' using errcode = '42501'; end if;
  select * into d from lead.design_dossiers where id = _dossier for update;
  if not found then raise exception 'DOSSIER_NOT_FOUND' using errcode = '42501'; end if;
  -- Choix réservé au propriétaire : un collaborateur autorisé à soumettre ne
  -- décide pas du régime de confidentialité du dossier.
  if d.owner_id <> u then raise exception 'NOT_ALLOWED' using errcode = '42501'; end if;

  if req then
    -- Activation : jamais de saut de statut, jamais de mise en vigueur implicite.
    if not d.nda_required then
      update lead.design_dossiers
         set nda_required = true, nda_status = 'requested', updated_at = now()
       where id = d.id and nda_required = false and nda_status = 'not_required';
    end if;
  else
    -- Retrait : refusé dès qu'une preuve existe ou que le NDA est en vigueur.
    -- `requested`, `prepared` et `awaiting_signatures` sans preuve ne sont que
    -- des étapes de demande : le client garde le droit de renoncer au NDA.
    if d.nda_required then
      if d.nda_status = 'in_force'
         or exists (select 1 from lead.nda_proofs p where p.dossier_id = d.id) then
        raise exception 'NDA_ENGAGEMENT_IN_PROGRESS' using errcode = '42501';
      end if;
      update lead.design_dossiers
         set nda_required = false, nda_status = 'not_required', updated_at = now()
       where id = d.id
         and nda_status in ('requested', 'prepared', 'awaiting_signatures')
         and not exists (select 1 from lead.nda_proofs p where p.dossier_id = d.id);
    end if;
  end if;

  insert into lead.audit_log (actor, action, dossier_id, detail)
  values (u, 'nda_requirement_set', d.id, jsonb_build_object('nda_required', req));
  return lead_priv.nda_status(d.id);
end $$;

create or replace function public.lead_set_nda_requirement(p_dossier uuid, p_required boolean)
returns jsonb language sql security invoker
set search_path = public, lead_priv, pg_temp as $$
  select lead_priv.set_nda_requirement(p_dossier, p_required);
$$;

-- ----------------------------------------------------------------------------
-- Permissions : EXECUTE public par défaut retiré des DEUX fonctions.
-- La fonction privée security definer n'est atteignable que par le wrapper
-- invoker, appelé par un utilisateur authentifié.
-- ----------------------------------------------------------------------------
revoke all on function lead_priv.set_nda_requirement(uuid, boolean) from public, anon;
revoke all on function public.lead_set_nda_requirement(uuid, boolean) from public, anon;

grant execute on function lead_priv.set_nda_requirement(uuid, boolean) to authenticated;
grant execute on function public.lead_set_nda_requirement(uuid, boolean) to authenticated;

insert into lead.schema_migrations (version) values ('1.7')
on conflict (version) do nothing;

commit;

-- ============================================================================
-- CONTRAT AJOUTÉ
--   public.lead_set_nda_requirement(dossier uuid, required boolean) -> jsonb
--     [authentifié, propriétaire du dossier uniquement]
--   Erreurs : DOSSIER_NOT_FOUND, NOT_ALLOWED, NDA_ENGAGEMENT_IN_PROGRESS
-- ============================================================================
