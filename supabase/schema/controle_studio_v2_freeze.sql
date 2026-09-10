-- READ ONLY. Run only when separately assessing an approved migration installation.
select to_regprocedure('public.lead_freeze_attestation(uuid,uuid,text)') as read_rpc,
       to_regprocedure('lead_priv.capture_freeze_attestation()') as capture_trigger_function;
select tgname, tgenabled from pg_trigger
where tgrelid = 'lead.design_reviews'::regclass and tgname = 'studio_capture_freeze';
select has_function_privilege('anon','public.lead_freeze_attestation(uuid,uuid,text)','EXECUTE') as anon_must_be_false,
       has_function_privilege('authenticated','public.lead_freeze_attestation(uuid,uuid,text)','EXECUTE') as authenticated_must_be_true;
select relrowsecurity from pg_class where oid = 'lead.design_reviews'::regclass;
