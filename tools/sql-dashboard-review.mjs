// Recette SQL — espace de travail interne (migration 1.8) sur PostgreSQL jetable.
// Applique les migrations CUMULÉES réelles : 1.2 → 1.5 → 1.6 → 1.7 → 1.8.
// Outil de développement uniquement : jamais importé par l'application.
//   bun tools/sql-dashboard-review.mjs
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, writeFileSync } from 'node:fs';
import { nextAction, actionAgeDays } from '../src/lib/leadmagnet/crm.ts';

const db = new PGlite();
const results = [];
const add = (name, pass, detail = '') => {
  results.push({ name, pass, detail: String(detail).slice(0, 200) });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + String(detail).slice(0, 160) : ''}`);
};

await db.exec(`
 create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create schema storage; create schema extensions;
 create table auth.users(id uuid primary key, email text);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table storage.buckets(id text primary key,name text,public boolean default false,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner uuid,owner_id text,metadata jsonb default '{}');
 alter table storage.objects enable row level security;
 grant usage on schema auth,storage to anon,authenticated,service_role;
 grant select,insert,update,delete on storage.objects to authenticated;
 grant execute on function auth.uid() to anon,authenticated,service_role;
`);

const migrations = [
  'supabase/schema/migration_v1.2_lead_magnet.sql',
  'supabase/schema/migration_v1.5_english_report.sql',
  'supabase/schema/migration_v1.6_english_report_pipeline.sql',
  'supabase/schema/migration_v1.7_optional_nda.sql',
  'supabase/schema/migration_v1.8_crm_dashboard.sql',
];
for (const file of migrations) {
  try {
    await db.exec(readFileSync(file, 'utf8'));
    add('migration_applies:' + file.split('/').pop(), true);
  } catch (e) {
    add('migration_applies:' + file.split('/').pop(), false, e.message);
    console.log(`\n0/${results.length} contrôles OK`);
    await db.close();
    process.exit(1);
  }
}

const ids = {
  client: '20000000-0000-4000-8000-000000000001',
  rnd: '20000000-0000-4000-8000-000000000002',
  sales: '20000000-0000-4000-8000-000000000003',
  admin: '20000000-0000-4000-8000-000000000004',
  admin2: '20000000-0000-4000-8000-000000000005',
  outsider: '20000000-0000-4000-8000-000000000006',
};
for (const [k, id] of Object.entries(ids))
  await db.query('insert into auth.users(id,email) values($1,$2)', [id, k + '@example.invalid']);

async function actor(role, id, fn) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id ?? '']);
  await db.exec('set role ' + role);
  try { return await fn(); } finally { await db.exec('reset role'); }
}
async function value(sql, params = []) {
  const r = await db.query(sql, params);
  return Object.values(r.rows[0] ?? {})[0];
}
async function expectFail(name, fn, expected) {
  try { await fn(); add(name, false, 'accepté alors que le refus est attendu'); }
  catch (e) { add(name, expected ? e.message.includes(expected) : true, e.message); }
}

const snapshot = JSON.parse(readFileSync('tests/fixtures/synthetic-dossier-fixture.json', 'utf8'));
const { dossierHash } = await import('../src/lib/leadmagnet/dossier.ts');
const consentFor = (dossierId, revision, contentHash) => [{
  kind: 'supabase_dossier',
  statement: 'Transfert du dossier de conception à Standex pour revue R&D.',
  accepted_at: new Date().toISOString(),
  content_ref: `${dossierId}@r${revision}`,
  dossier_id: dossierId, revision, content_hash: contentHash, file_digests: [],
}];

// ---------------------------------------------------------------------------
// Mise en place : un dossier réellement soumis, staff et affectations.
// ---------------------------------------------------------------------------
const dossier = await actor('authenticated', ids.client,
  () => value('select public.lead_create_dossier($1,false)', ['Tableau de bord — projet A']));
const hash = await dossierHash(snapshot);
const submitted = await actor('authenticated', ids.client,
  () => value('select public.lead_submit_revision($1,0,$2,$3,$4,$5)',
    [dossier, snapshot, hash, consentFor(dossier, 1, hash), []]));

await db.query(
  "insert into lead.staff_members(user_id,role,display_name) values ($1,'rnd','Sascha Knoblauch'),($2,'sales','Gilles Servant'),($3,'admin','Thomas Loarec'),($4,'admin','Second Admin')",
  [ids.rnd, ids.sales, ids.admin, ids.admin2]);
await actor('authenticated', ids.admin, () => value('select public.lead_assign_dossier($1,$2)', [dossier, ids.rnd]));
await actor('authenticated', ids.admin, () => value('select public.lead_assign_dossier($1,$2)', [dossier, ids.sales]));

// 1. Sonde de capacité DISTINCTE et version de schéma inchangée pour l'app.
try {
  const probe = await actor('authenticated', ids.rnd, () => value('select public.lead_crm_capabilities()'));
  add('crm_capabilities_is_a_separate_probe', probe.crm_version === '1.8' && probe.role === 'rnd', JSON.stringify(probe));
} catch (e) { add('crm_capabilities_is_a_separate_probe', false, e.message); }
try {
  const schema = await actor('anon', null, () => value('select public.lead_schema_version()'));
  add('base_schema_probe_still_ready', schema.ready === true, JSON.stringify(schema));
} catch (e) { add('base_schema_probe_still_ready', false, e.message); }

// 2. Cloisonnement : ni anonyme, ni client, ni staff non affecté.
await expectFail('anon_cannot_read_board', () => actor('anon', null,
  () => value('select public.lead_crm_board()')), 'permission denied');
await expectFail('client_cannot_read_crm', () => actor('authenticated', ids.client,
  () => value('select public.lead_crm_project($1)', [dossier])), 'NOT_ALLOWED');
await expectFail('unassigned_staff_cannot_read_crm', () => actor('authenticated', ids.outsider,
  () => value('select public.lead_crm_project($1)', [dossier])), 'NOT_ALLOWED');

// 3. Le tableau liste les dossiers affectés, et le dossier sans fiche apparaît
//    comme « à classer » sans jamais transporter le contenu technique.
try {
  const board = await actor('authenticated', ids.sales, () => value('select public.lead_crm_board()'));
  // Un dossier sans fiche de suivi apparaît dans la liste normale, avec des
  // valeurs par défaut honnêtes : étape « lead », version 0, aucun historique
  // d'étape inventé, et aucune section annexe à ouvrir à la main.
  const legacy = board.projects.find((d) => d.dossier_id === dossier);
  add('board_lists_unfiled_dossier',
    Boolean(legacy) && legacy.stage === 'lead' && Number(legacy.version) === 0
    && !legacy.stage_since && board.unfiled.length === 0,
    JSON.stringify(legacy));
  add('board_carries_no_design_payload', !JSON.stringify(board).includes('OWNER_A_DESIGN_SECRET'));
  add('board_exposes_directory', board.directory.length === 12
    && board.directory.some((p) => p.last_name === 'Knoblauch' && p.role === 'fae'));
  add('directory_names_grant_nothing', board.directory.every((p) => p.linked === false));
} catch (e) { add('board_lists_unfiled_dossier', false, e.message); }

// 4. Étapes : exactement huit, valeur inconnue refusée, CAS respecté.
const project0 = await actor('authenticated', ids.sales, () => value('select public.lead_crm_project($1)', [dossier]));
add('project_starts_at_lead_stage', project0.project.stage === 'lead', project0.project.stage);
const stages = (await db.query("select unnest(enum_range(null::lead.crm_stage))::text as s")).rows.map((r) => r.s);
add('exactly_eight_stages', stages.length === 8 && stages.join(',') ===
  'lead,qualification,solution_quote,negotiate,closed_won,closed_lost,on_hold,dead', stages.join(','));
await expectFail('unknown_stage_is_rejected', () => actor('authenticated', ids.sales,
  () => value('select public.lead_crm_set_stage($1,$2,$3)', [dossier, 'proposal', project0.project.version])), 'BAD_STAGE');
await expectFail('stale_version_is_rejected', () => actor('authenticated', ids.sales,
  () => value('select public.lead_crm_set_stage($1,$2,$3)', [dossier, 'qualification', 999])), 'CRM_CONFLICT');
const project1 = await actor('authenticated', ids.sales,
  () => value('select public.lead_crm_set_stage($1,$2,$3)', [dossier, 'qualification', project0.project.version]));
add('stage_change_is_persisted', project1.project.stage === 'qualification');
add('stage_change_writes_sap_note',
  project1.sap_notes.some((n) => /Stage changed from lead to qualification\./.test(n.body_en)));
add('sap_note_header_format',
  /^\d{2}\/\d{2}\/\d{4} - Gilles Servant :\n- /.test(project1.sap_notes[0].body_en), project1.sap_notes[0].body_en);
// Rejouer la même étape ne duplique pas la note.
const replay = await actor('authenticated', ids.sales,
  () => value('select public.lead_crm_set_stage($1,$2,$3)', [dossier, 'qualification', project1.project.version]));
add('same_stage_is_idempotent', replay.sap_notes.length === project1.sap_notes.length);

// 5. Rôles d'écriture : le prix est commercial, le coût est FAE/R&D.
await expectFail('rnd_cannot_set_price', () => actor('authenticated', ids.rnd,
  () => value('select public.lead_crm_set_price($1,$2,$3,$4)', [dossier, 1.5, 'EUR', replay.project.version])), 'NOT_ALLOWED');
await expectFail('sales_cannot_set_cost', () => actor('authenticated', ids.sales,
  () => value('select public.lead_crm_set_cost($1,$2,$3,$4)', [dossier, 1.0, false, replay.project.version])), 'NOT_ALLOWED');
await expectFail('negative_price_is_rejected', () => actor('authenticated', ids.sales,
  () => value('select public.lead_crm_set_price($1,$2,$3,$4)', [dossier, -1, 'EUR', replay.project.version])), 'BAD_PRICE');
await expectFail('bad_currency_is_rejected', () => actor('authenticated', ids.sales,
  () => value('select public.lead_crm_set_price($1,$2,$3,$4)', [dossier, 2, 'EURO', replay.project.version])), 'BAD_CURRENCY');

const priced = await actor('authenticated', ids.sales,
  () => value('select public.lead_crm_set_price($1,$2,$3,$4)', [dossier, 2.5, 'EUR', replay.project.version]));
add('price_is_stored_with_currency', Number(priced.project.unit_price) === 2.5 && priced.project.currency === 'EUR');
const costed = await actor('authenticated', ids.rnd,
  () => value('select public.lead_crm_set_cost($1,$2,$3,$4)', [dossier, 1, false, priced.project.version]));
add('zero_or_positive_cost_is_accepted', Number(costed.project.unit_cost) === 1);
const sapCost = await actor('authenticated', ids.rnd,
  () => value('select public.lead_crm_set_cost($1,$2,$3,$4)', [dossier, 9.99, true, costed.project.version]));
add('cost_in_sap_clears_the_local_cost', sapCost.project.unit_cost === null && sapCost.project.cost_in_sap === true);
const backToCost = await actor('authenticated', ids.rnd,
  () => value('select public.lead_crm_set_cost($1,$2,$3,$4)', [dossier, 0, false, sapCost.project.version]));
add('explicit_zero_cost_is_allowed', Number(backToCost.project.unit_cost) === 0 && backToCost.project.cost_in_sap === false);

// 6. Volume annuel : celui réellement soumis, sinon la valeur retenue.
add('submitted_annual_volume_is_read_from_last_revision',
  backToCost.project.annual_volume_submitted === 2000, String(backToCost.project.annual_volume_submitted));
await expectFail('zero_annual_volume_override_is_rejected', () => actor('authenticated', ids.sales,
  () => value('select public.lead_crm_set_fields($1,$2,$3)',
    [dossier, { annual_volume_override: 0 }, backToCost.project.version])), 'BAD_ANNUAL_VOLUME');

const identified = await actor('authenticated', ids.sales,
  () => value('select public.lead_crm_set_fields($1,$2,$3)', [dossier,
    { company: 'K Motor', project_name: 'Door latch', country_code: 'fr', series_launch: '2027-03-01',
      estimated_annual_revenue: 12000 }, backToCost.project.version]));
add('country_is_normalised', identified.project.country_code === 'FR');
add('manual_estimate_survives_price', Number(identified.project.estimated_annual_revenue) === 12000
  && Number(identified.project.unit_price) === 2.5);
await expectFail('bad_country_is_rejected', () => actor('authenticated', ids.sales,
  () => value('select public.lead_crm_set_fields($1,$2,$3)',
    [dossier, { country_code: 'FRA' }, identified.project.version])), 'BAD_COUNTRY');
await expectFail('bad_date_is_rejected', () => actor('authenticated', ids.sales,
  () => value('select public.lead_crm_set_fields($1,$2,$3)',
    [dossier, { series_launch: '31/02/2027' }, identified.project.version])), 'BAD_DATE');

// 7. Plan d'action.
const templated = await actor('authenticated', ids.sales,
  () => value('select public.lead_crm_apply_template($1,$2)', [dossier, identified.project.version]));
add('template_creates_tasks', templated.tasks.length === 13, String(templated.tasks.length));
const templatedAgain = await actor('authenticated', ids.sales,
  () => value('select public.lead_crm_apply_template($1,$2)', [dossier, templated.project.version]));
add('template_is_idempotent', templatedAgain.tasks.length === templated.tasks.length);


const firstTask = templatedAgain.tasks[0];
await expectFail('not_applicable_requires_a_reason', () => actor('authenticated', ids.sales,
  () => value('select public.lead_crm_upsert_task($1,$2)',
    [dossier, { id: firstTask.id, label: firstTask.label, stage: firstTask.stage,
      stakeholder: firstTask.stakeholder, status: 'not_applicable' }])), 'NA_REASON_REQUIRED');
const doneOne = await actor('authenticated', ids.sales,
  () => value('select public.lead_crm_upsert_task($1,$2)',
    [dossier, { id: firstTask.id, label: firstTask.label, stage: firstTask.stage,
      stakeholder: firstTask.stakeholder, status: 'done', expected_version: firstTask.version }]));
const doneTask = doneOne.tasks.find((t) => t.id === firstTask.id);
add('done_task_records_time_and_author', doneTask.status === 'done' && !!doneTask.done_at
  && doneTask.done_by_name === 'Gilles Servant');
add('done_task_counts_in_progress', doneOne.project.tasks_done === 1 && doneOne.project.tasks_total === 13);
await expectFail('task_conflict_is_detected', () => actor('authenticated', ids.sales,
  () => value('select public.lead_crm_upsert_task($1,$2)',
    [dossier, { id: firstTask.id, label: firstTask.label, stage: firstTask.stage,
      stakeholder: firstTask.stakeholder, status: 'todo', expected_version: firstTask.version }])), 'CRM_CONFLICT');

const na = doneOne.tasks.find((t) => t.stakeholder === 'client');
const naDone = await actor('authenticated', ids.sales,
  () => value('select public.lead_crm_upsert_task($1,$2)',
    [dossier, { id: na.id, label: na.label, stage: na.stage, stakeholder: na.stakeholder,
      status: 'not_applicable', na_reason: 'Customer validated by phone', expected_version: na.version }]));
add('not_applicable_leaves_the_progress_base', naDone.project.tasks_total === 12);

// 7b. Activation réelle de l'action courante : une action FUTURE n'a pas de
// date d'activation ; elle démarre quand elle devient la prochaine action.
const activatedAtCreation = templatedAgain.tasks.filter((t) => t.activated_at);
add('only_the_current_task_is_activated_at_creation', activatedAtCreation.length === 1,
  String(activatedAtCreation.length));
// Le plan a 30 jours : l'action courante aussi, les suivantes n'existent pas
// encore en tant qu'actions en cours.
await db.exec(`update lead.dossier_tasks
   set created_at = now() - interval '30 days',
       activated_at = case when activated_at is null then null
                           else now() - interval '30 days' end
 where dossier_id = '${dossier}'`);
const aged = await actor('authenticated', ids.sales,
  () => value('select public.lead_crm_project($1)', [dossier]));
const agedCurrent = aged.tasks.find((t) => t.activated_at);
add('current_task_keeps_its_real_age',
  Math.round((Date.now() - Date.parse(agedCurrent.activated_at)) / 86400000) === 30);
const firstOpen = aged.tasks.find((t) => t.status !== 'done' && t.status !== 'not_applicable');
const advanced = await actor('authenticated', ids.sales,
  () => value('select public.lead_crm_upsert_task($1,$2)',
    [dossier, { id: firstOpen.id, label: firstOpen.label, stage: firstOpen.stage,
      stakeholder: firstOpen.stakeholder, status: 'done', expected_version: firstOpen.version }]));
const nextOpen = advanced.tasks.find((t) => t.status !== 'done' && t.status !== 'not_applicable');
add('next_task_age_starts_when_it_becomes_current',
  nextOpen.activated_at !== null
  && Math.abs(Date.now() - Date.parse(nextOpen.activated_at)) < 60000,
  String(nextOpen.activated_at));
add('future_tasks_stay_without_activation',
  advanced.tasks.filter((t) => t.activated_at
    && t.status !== 'done' && t.status !== 'not_applicable').length === 1);
// Réouvrir l'action terminée la rend de nouveau courante : son compteur repart
// de cet instant, et la suivante redevient une action future.
const reopened = await actor('authenticated', ids.sales,
  () => value('select public.lead_crm_upsert_task($1,$2)',
    [dossier, { id: firstOpen.id, label: firstOpen.label, stage: firstOpen.stage,
      stakeholder: firstOpen.stakeholder, status: 'todo',
      expected_version: advanced.tasks.find((t) => t.id === firstOpen.id).version }]));
add('reopening_moves_the_activation_back_to_that_task',
  reopened.tasks.find((t) => t.id === firstOpen.id).activated_at !== null
  && reopened.tasks.find((t) => t.id === nextOpen.id).activated_at === null);

// 7bis L'écran et le serveur désignent LA MÊME action courante, y compris
//      lorsque le projet avance alors que des actions d'une étape antérieure
//      restent ouvertes. Sinon l'écran afficherait une action que le serveur
//      n'a pas activée, donc sans âge.
const stagedForNext = await actor('authenticated', ids.sales,
  () => value('select public.lead_crm_set_stage($1,$2,$3)',
    [dossier, 'solution_quote', reopened.project.version]));
const uiTasks = stagedForNext.tasks.map((t) => ({
  id: t.id, stage: t.stage, label: t.label, stakeholder: t.stakeholder,
  personId: t.person_id ?? null, status: t.status, naReason: t.na_reason ?? null,
  dueOn: t.due_on ?? null, sortOrder: t.sort_order, activatedAt: t.activated_at ?? null,
  doneAt: t.done_at ?? null, doneByName: t.done_by_name ?? null,
  createdAt: t.created_at, version: t.version,
}));
const uiNext = nextAction({ stage: stagedForNext.project.stage }, uiTasks);
const serverActivated = uiTasks.filter((t) => t.activatedAt
  && t.status !== 'done' && t.status !== 'not_applicable');
add('stage_change_leaves_an_older_open_task_current',
  stagedForNext.project.stage === 'solution_quote'
  && serverActivated.length === 1 && serverActivated[0].stage !== 'solution_quote',
  JSON.stringify({ stage: stagedForNext.project.stage, task: serverActivated[0]?.stage }));
add('ui_next_action_matches_the_server_activated_task',
  !!uiNext && serverActivated.length === 1 && uiNext.id === serverActivated[0].id,
  JSON.stringify({ ui: uiNext && uiNext.stage, server: serverActivated[0]?.stage }));
add('ui_next_action_has_a_known_age', !!uiNext && actionAgeDays(uiNext) !== null);

// 8. Closed Won n'est jamais automatique : terminer les tâches ne bouge rien.
add('closed_won_is_never_automatic', naDone.project.stage === 'qualification', naDone.project.stage);

// 9. Notes SAP append-only.
await expectFail('sap_notes_cannot_be_updated',
  () => db.exec("update lead.sap_notes set body_en = 'forged'"), 'SAP_NOTES_APPEND_ONLY');
await expectFail('sap_notes_cannot_be_deleted',
  () => db.exec('delete from lead.sap_notes'), 'SAP_NOTES_APPEND_ONLY');

// 10. Notification client : uniquement sur revue publiée, jamais « envoyée ».
await expectFail('notification_requires_a_real_review', () => actor('authenticated', ids.sales,
  () => value('select public.lead_crm_queue_review_notification($1,$2,$3)',
    ['30000000-0000-4000-8000-0000000000ff', 'Sujet', 'Résumé'])), 'REVIEW_NOT_FOUND');
const review = await actor('authenticated', ids.rnd,
  () => value('select public.lead_publish_review($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [submitted.revision_id, 'full', 'conditions', 'validated', 'Réponse technique',
      'INTERNAL_ONLY_SECRET', 'MK03-1A66-200W', 'custom',
      { cable: '300 mm PVC', connector: 'à qualifier', pcb: 'sans' }]));
const notified = await actor('authenticated', ids.sales,
  () => value('select public.lead_crm_queue_review_notification($1,$2,$3)',
    [review.review_id ?? review, 'Standex feedback', 'Votre revue est disponible.']));
const note = notified.notifications[0];
add('notification_is_pending_never_sent', note.status === 'pending' && !!note.link_path
  && note.link_path.includes(dossier), JSON.stringify(note));
add('notification_uses_client_locale', note.locale === (snapshot.sourceLocale ?? 'fr'), note.locale);
add('notification_carries_no_internal_note', !JSON.stringify(notified.notifications).includes('INTERNAL_ONLY_SECRET'));
const notifiedAgain = await actor('authenticated', ids.sales,
  () => value('select public.lead_crm_queue_review_notification($1,$2,$3)',
    [review.review_id ?? review, 'Standex feedback', 'Votre revue est disponible.']));
add('notification_is_idempotent', notifiedAgain.notifications.length === 1);

// 11. La projection client reste indemne de tout champ CRM.
try {
  const client = await actor('authenticated', ids.client, () => value('select public.lead_client_view($1)', [dossier]));
  const raw = JSON.stringify(client);
  add('client_view_has_no_crm_field',
    !raw.includes('K Motor') && !raw.includes('unit_price') && !raw.includes('stage')
    && !raw.includes('INTERNAL_ONLY_SECRET'));
} catch (e) { add('client_view_has_no_crm_field', false, e.message); }

// 12. Administration : rattachement de compte, rôles, dernier admin protégé.
await expectFail('non_admin_cannot_open_administration', () => actor('authenticated', ids.sales,
  () => value('select public.lead_crm_admin_overview()')), 'NOT_ALLOWED');
const overview = await actor('authenticated', ids.admin, () => value('select public.lead_crm_admin_overview()'));
const gilles = overview.directory.find((p) => p.last_name === 'Servant');
await expectFail('linking_an_unknown_email_is_refused', () => actor('authenticated', ids.admin,
  () => value('select public.lead_crm_admin_link_person($1,$2)',
    [gilles.id, 'inconnu@example.invalid'])), 'ACCOUNT_NOT_FOUND');
const linked = await actor('authenticated', ids.admin,
  () => value('select public.lead_crm_admin_link_person($1,$2)', [gilles.id, 'sales@example.invalid']));
add('linking_uses_an_existing_account',
  linked.directory.find((p) => p.id === gilles.id).user_id === ids.sales);
await expectFail('an_account_cannot_be_linked_twice', () => actor('authenticated', ids.admin,
  () => value('select public.lead_crm_admin_link_person($1,$2)',
    [overview.directory.find((p) => p.last_name === 'Franke').id, 'sales@example.invalid'])), 'ACCOUNT_ALREADY_LINKED');

// Nommer un responsable rattaché accorde l'affectation ; le retirer la révoque.
const owned = await actor('authenticated', ids.sales,
  () => value('select public.lead_crm_set_owners($1,$2,$3,$4)',
    [dossier, gilles.id, overview.directory.find((p) => p.last_name === 'Rudolf').id,
     naDone.project.version]));
add('owners_are_recorded', owned.project.sales_person === gilles.id);
const stillAssigned = await value(
  'select count(*)::int from lead.dossier_assignments where dossier_id=$1 and user_id=$2', [dossier, ids.sales]);
add('linked_owner_keeps_access', stillAssigned === 1);
const franke = overview.directory.find((p) => p.last_name === 'Franke');
const replaced = await actor('authenticated', ids.admin,
  () => value('select public.lead_crm_set_owners($1,$2,$3,$4)',
    [dossier, franke.id, null, owned.project.version]));
// L'affectation du commercial a été posée à la main par un administrateur :
// changer de responsable ne doit PAS l'effacer.
const manualKept = await value(
  "select count(*)::int from lead.dossier_assignments where dossier_id=$1 and user_id=$2 and source='manual'",
  [dossier, ids.sales]);
add('manual_assignment_survives_owner_change',
  manualKept === 1 && replaced.project.sales_person === franke.id);
// En revanche, un accès DÉRIVÉ du rôle de responsable disparaît avec le rôle.
await db.query(
  "insert into lead.dossier_assignments(dossier_id,user_id,assigned_by,source) values($1,$2,$3,'crm_owner')"
  + ' on conflict (dossier_id,user_id) do nothing', [dossier, ids.admin2, ids.admin]);
await actor('authenticated', ids.admin,
  () => value('select public.lead_crm_set_owners($1,$2,$3,$4)',
    [dossier, franke.id, null, replaced.project.version]));
add('derived_owner_access_is_revoked', await value(
  'select count(*)::int from lead.dossier_assignments where dossier_id=$1 and user_id=$2',
  [dossier, ids.admin2]) === 0);
// Restent exactement les deux affectations accordées explicitement au départ.
add('unlinked_owner_gets_no_implicit_access', await value(
  "select count(*)::int from lead.dossier_assignments where dossier_id=$1 and source='manual'",
  [dossier]) === 2);

await actor('authenticated', ids.admin,
  () => value('select public.lead_crm_admin_set_staff($1,$2,$3)', [ids.admin2, 'sales', true]));
await expectFail('last_admin_cannot_be_downgraded', () => actor('authenticated', ids.admin,
  () => value('select public.lead_crm_admin_set_staff($1,$2,$3)', [ids.admin, 'sales', true])), 'LAST_ADMIN_PROTECTED');
await expectFail('last_admin_cannot_be_deactivated', () => actor('authenticated', ids.admin,
  () => value('select public.lead_crm_admin_set_staff($1,$2,$3)', [ids.admin, 'admin', false])), 'LAST_ADMIN_PROTECTED');
await actor('authenticated', ids.admin,
  () => value('select public.lead_crm_admin_set_staff($1,$2,$3)', [ids.rnd, 'rnd', false]));
await expectFail('deactivated_staff_loses_its_role', () => actor('authenticated', ids.rnd,
  () => value('select public.lead_crm_board()')), 'NOT_ALLOWED');
await actor('authenticated', ids.admin,
  () => value('select public.lead_crm_admin_set_staff($1,$2,$3)', [ids.rnd, 'rnd', true]));

// 13. Aucune table CRM n'est lisible directement, même authentifié.
await expectFail('crm_tables_are_not_directly_readable', () => actor('authenticated', ids.sales,
  () => value('select count(*) from lead.dossier_crm')), 'permission denied');
await expectFail('anon_cannot_execute_crm_wrappers', () => actor('anon', null,
  () => value('select public.lead_crm_admin_overview()')), 'permission denied');

// ---------------------------------------------------------------------------
// 14. Régressions issues de la revue indépendante (checkpoint a0fd94a6)
// ---------------------------------------------------------------------------

// 14.1 Les utilitaires internes ne sont exécutables par AUCUN compte connecté.
await expectFail('authenticated_cannot_read_internal_row_helper', () => actor('authenticated', ids.outsider,
  () => value('select lead_priv.crm_row_json($1)', [dossier])), 'permission denied');
await expectFail('client_cannot_forge_a_sap_note', () => actor('authenticated', ids.client,
  () => value("select lead_priv.sap_note($1,$2,'forged',array['Forged internal event'])",
    [dossier, ids.admin])), 'permission denied');
await expectFail('authenticated_cannot_read_role_helper', () => actor('authenticated', ids.outsider,
  () => value('select lead_priv.role_of($1)', [ids.admin])), 'permission denied');
add('no_forged_note_was_written', await value(
  "select count(*)::int from lead.sap_notes where body_en like '%Forged internal event%'") === 0);

// 14.2 Désactiver un membre lui retire AUSSI les accès historiques.
await actor('authenticated', ids.admin,
  () => value('select public.lead_crm_admin_set_staff($1,$2,$3)', [ids.rnd, 'rnd', false]));
await expectFail('deactivated_staff_loses_legacy_design_access', () => actor('authenticated', ids.rnd,
  () => value('select public.lead_staff_view($1)', [dossier])), 'NOT_ALLOWED');
add('deactivated_staff_loses_storage_access', await value(
  'select lead_priv.staff_can_read_design($1,$2)', [ids.rnd, dossier]) === false);
await actor('authenticated', ids.admin,
  () => value('select public.lead_crm_admin_set_staff($1,$2,$3)', [ids.rnd, 'rnd', true]));

const cur1 = await actor('authenticated', ids.sales, () => value('select public.lead_crm_project($1)', [dossier]));

// 14.3 Devise verrouillée quand des montants existent : aucune marge fabriquée.
await expectFail('currency_change_is_blocked_when_amounts_exist', () => actor('authenticated', ids.sales,
  () => value('select public.lead_crm_set_price($1,$2,$3,$4)',
    [dossier, 10, 'USD', cur1.project.version])), 'CURRENCY_LOCKED');
await expectFail('currency_change_is_blocked_through_set_fields', () => actor('authenticated', ids.sales,
  () => value('select public.lead_crm_set_fields($1,$2,$3)',
    [dossier, { currency: 'USD' }, cur1.project.version])), 'CURRENCY_LOCKED');
add('currency_and_cost_are_unchanged',
  cur1.project.currency === 'EUR' && Number(cur1.project.unit_cost) === 0);

// 14.4 Types stricts, liste blanche, version obligatoire.
await expectFail('non_numeric_amount_is_rejected', () => actor('authenticated', ids.sales,
  () => value('select public.lead_crm_set_fields($1,$2,$3)',
    [dossier, { estimated_annual_revenue: 'not a number' }, cur1.project.version])), 'BAD_FIELD_TYPE');
add('rejected_amount_was_not_cleared', Number((await actor('authenticated', ids.sales,
  () => value('select public.lead_crm_project($1)', [dossier]))).project.estimated_annual_revenue) === 12000);
await expectFail('unknown_field_is_rejected', () => actor('authenticated', ids.sales,
  () => value('select public.lead_crm_set_fields($1,$2,$3)',
    [dossier, { unit_price: 99 }, cur1.project.version])), 'UNKNOWN_FIELD');
await expectFail('missing_version_is_rejected', () => actor('authenticated', ids.sales,
  () => value('select public.lead_crm_set_fields($1,$2,$3)',
    [dossier, { project_name: 'Blind write' }, null])), 'VERSION_REQUIRED');

// 14.5 Rejeu de création de tâche : une seule action, une seule note.
const beforeTasks = (await actor('authenticated', ids.sales,
  () => value('select public.lead_crm_project($1)', [dossier]))).tasks.length;
const newTask = { label: 'Call the customer back', stage: 'qualification',
  stakeholder: 'sales', client_key: 'replay-1' };
await actor('authenticated', ids.sales,
  () => value('select public.lead_crm_upsert_task($1,$2)', [dossier, newTask]));
const replayed = await actor('authenticated', ids.sales,
  () => value('select public.lead_crm_upsert_task($1,$2)', [dossier, newTask]));
add('task_creation_replay_is_idempotent', replayed.tasks.length === beforeTasks + 1,
  String(replayed.tasks.length));
add('task_replay_writes_one_note_only', replayed.sap_notes
  .filter((n) => n.body_en.includes('Call the customer back')).length === 1);
const someTask = replayed.tasks.find((t) => t.label === 'Call the customer back');
await expectFail('task_edit_without_version_is_rejected', () => actor('authenticated', ids.sales,
  () => value('select public.lead_crm_upsert_task($1,$2)',
    [dossier, { id: someTask.id, label: 'Renamed', stage: someTask.stage,
                stakeholder: someTask.stakeholder, status: someTask.status }])), 'VERSION_REQUIRED');

// 14.6 Société et lancement série : valeur soumise affichée par défaut.
add('submitted_company_is_exposed',
  cur1.project.company_submitted === 'Synthetic Example SAS', String(cur1.project.company_submitted));
add('submitted_series_launch_is_exposed',
  String(cur1.project.series_launch_submitted).startsWith('2027-03-01'),
  String(cur1.project.series_launch_submitted));
add('override_provenance_is_explicit',
  cur1.project.company_source === 'override' && cur1.project.company_effective === 'K Motor');
const unfiledProject = await actor('authenticated', ids.admin,
  () => value('select public.lead_crm_project($1)', [dossier]));
add('submission_snapshot_is_never_mutated', await value(
  "select (snapshot->'business'->>'contactCompany') from lead.design_revisions where dossier_id=$1"
  + ' order by revision desc limit 1', [dossier]) === 'Synthetic Example SAS');
add('effective_values_do_not_touch_stored_override',
  unfiledProject.project.company === 'K Motor');

// 14.7 Les étapes réelles du dossier apparaissent dans les notes SAP.
add('submitted_revision_creates_a_sap_note', cur1.sap_notes
  .some((n) => /Customer submitted design revision \d+\./.test(n.body_en)));
add('legacy_notes_are_english_only',
  cur1.sap_notes.every((n) => !/révision|Votre revue/i.test(n.body_en)));
const auditNoteCount = await value(
  "select count(*)::int from lead.sap_notes where event_key like 'audit:%' and dossier_id=$1", [dossier]);
await db.query("insert into lead.audit_log(actor,action,dossier_id,detail) values($1,'unknown_action',$2,'{}')",
  [ids.admin, dossier]);
add('unknown_audit_action_creates_no_note', await value(
  "select count(*)::int from lead.sap_notes where event_key like 'audit:%' and dossier_id=$1",
  [dossier]) === auditNoteCount);

// 14.8 Rattachement d'annuaire puis attribution EXPLICITE du premier droit.
//      Le rattachement seul n'ouvre rien ; le droit est une action distincte.
const newbie = '20000000-0000-4000-8000-000000000007';
await db.query('insert into auth.users(id,email) values($1,$2)', [newbie, 'newbie@example.invalid']);
const dirOverview = await actor('authenticated', ids.admin,
  () => value("select public.lead_crm_admin_upsert_person(null,'New','Bie','sales',true)"));
const newPerson = dirOverview.directory.find((p) => p.last_name === 'Bie');
const linkedNewbie = await actor('authenticated', ids.admin,
  () => value('select public.lead_crm_admin_link_person($1,$2)', [newPerson.id, 'newbie@example.invalid']));
add('directory_link_records_the_account',
  linkedNewbie.directory.some((p) => p.id === newPerson.id && p.user_id === newbie));
add('directory_link_grants_no_staff_right',
  !linkedNewbie.staff.some((s) => s.user_id === newbie));
await expectFail('linked_account_without_right_cannot_read_board', () => actor('authenticated', newbie,
  () => value('select public.lead_crm_board()')), 'NOT_ALLOWED');
const grantedNewbie = await actor('authenticated', ids.admin,
  () => value("select public.lead_crm_admin_set_staff($1,'sales',true)", [newbie]));
add('explicit_grant_creates_the_staff_right',
  grantedNewbie.staff.some((s) => s.user_id === newbie && s.role === 'sales' && s.active !== false));
add('granted_account_can_read_board', Array.isArray(
  (await actor('authenticated', newbie, () => value('select public.lead_crm_board()'))).projects));
const revokedNewbie = await actor('authenticated', ids.admin,
  () => value("select public.lead_crm_admin_set_staff($1,'sales',false)", [newbie]));
add('disabling_marks_the_right_inactive',
  revokedNewbie.staff.some((s) => s.user_id === newbie && s.active === false));
await expectFail('disabled_account_loses_crm_access', () => actor('authenticated', newbie,
  () => value('select public.lead_crm_board()')), 'NOT_ALLOWED');
await expectFail('disabled_account_loses_legacy_staff_access', () => actor('authenticated', newbie,
  () => value('select public.lead_staff_view($1)', [dossier])));

// 14.9 Historique d'audit incomplet : dossier disparu, auteur disparu.
//      `lead.audit_log` n'a aucune clé étrangère et conserve légitimement ces
//      lignes. Ni le déclencheur ni la reprise ne doivent échouer, et rien ni
//      personne ne doit être inventé.
const ghostDossier = '30000000-0000-4000-8000-00000000dead';
const ghostAuthor = '20000000-0000-4000-8000-0000000000de';
let ghostRow = null;
try {
  await db.query(
    "insert into lead.audit_log(actor,action,dossier_id,detail) values($1,'revision_submitted',$2,'{\"revision\":1}')",
    [ids.admin, ghostDossier]);
  add('audit_event_on_missing_dossier_is_accepted', true);
} catch (e) { add('audit_event_on_missing_dossier_is_accepted', false, String(e.message)); }
add('audit_event_on_missing_dossier_creates_no_note', await value(
  'select count(*)::int from lead.sap_notes where dossier_id=$1', [ghostDossier]) === 0);
try {
  await db.query(
    "insert into lead.audit_log(actor,action,dossier_id,detail) values($1,'revision_submitted',$2,'{\"revision\":9}')",
    [ghostAuthor, dossier]);
  ghostRow = await value(
    "select id from lead.audit_log where actor=$1 order by id desc limit 1", [ghostAuthor]);
  add('audit_event_with_missing_author_is_accepted', true);
} catch (e) { add('audit_event_with_missing_author_is_accepted', false, String(e.message)); }
const ghostNote = await value(
  "select to_jsonb(n) from lead.sap_notes n where dossier_id=$1 and event_key=$2",
  [dossier, 'audit:' + ghostRow]);
add('missing_author_note_exists_without_author_reference',
  !!ghostNote && ghostNote.author_id === null && !!ghostNote.author_name,
  JSON.stringify(ghostNote));
// Reprise de la migration rejouée sur cet historique : elle ne doit pas échouer.
try {
  await db.exec(`do $$ declare l record; begin
    for l in select id, at, actor, dossier_id, action, detail from lead.audit_log
             where dossier_id is not null order by id loop
      perform lead_priv.crm_audit_note(l.id, l.at, l.actor, l.dossier_id, l.action, l.detail);
    end loop; end $$;`);
  add('migration_backfill_replay_survives_broken_history', true);
} catch (e) { add('migration_backfill_replay_survives_broken_history', false, String(e.message)); }

// 14.9bis La note SAP porte la DATE DE L'ÉVÉNEMENT, pas celle de la migration.
//         Sans cela, tout l'historique repris partagerait le même instant : le
//         tri « plus récent d'abord » et « copier la dernière note » seraient
//         faux, alors même que le corps de la note affiche la bonne date.
await db.query(
  "insert into lead.audit_log(at,actor,action,dossier_id,detail) " +
  "values('2026-08-01T09:00:00Z',$1,'revision_submitted',$2,'{\"revision\":41}')",
  [ids.admin, dossier]);
const oldAuditId = await value(
  "select id from lead.audit_log where dossier_id=$1 and detail->>'revision'='41'", [dossier]);
const oldNote = await value("select to_jsonb(n) from lead.sap_notes n where dossier_id=$1 and event_key=$2",
  [dossier, 'audit:' + oldAuditId]);
add('historical_note_keeps_the_event_date',
  !!oldNote && new Date(oldNote.created_at).toISOString() === '2026-08-01T09:00:00.000Z',
  JSON.stringify(oldNote && oldNote.created_at));
add('historical_note_body_matches_its_timestamp',
  !!oldNote && oldNote.body_en.startsWith('01/08/2026 - '), oldNote && oldNote.body_en);

await db.query(
  "insert into lead.audit_log(at,actor,action,dossier_id,detail) " +
  "values('2026-09-05T09:00:00Z',$1,'revision_submitted',$2,'{\"revision\":42}')",
  [ids.admin, dossier]);
const newAuditId = await value(
  "select id from lead.audit_log where dossier_id=$1 and detail->>'revision'='42'", [dossier]);
const ordered = await value(
  "select jsonb_agg(event_key order by created_at desc) from lead.sap_notes " +
  "where dossier_id=$1 and event_key = any($2)",
  [dossier, ['audit:' + oldAuditId, 'audit:' + newAuditId]]);
add('notes_sort_by_real_event_date',
  Array.isArray(ordered) && ordered[0] === 'audit:' + newAuditId && ordered[1] === 'audit:' + oldAuditId,
  JSON.stringify(ordered));

// Un avancement RÉELLEMENT nouveau garde l'heure du serveur.
await db.query(
  "insert into lead.audit_log(actor,action,dossier_id,detail) " +
  "values($1,'revision_submitted',$2,'{\"revision\":43}')", [ids.admin, dossier]);
const freshNote = await value(
  "select to_jsonb(n) from lead.sap_notes n where dossier_id=$1 and event_key='audit:' || " +
  "(select id::text from lead.audit_log where dossier_id=$1 and detail->>'revision'='43')", [dossier]);
add('new_progress_keeps_server_time',
  !!freshNote && Math.abs(Date.now() - new Date(freshNote.created_at).getTime()) < 5 * 60_000,
  JSON.stringify(freshNote && freshNote.created_at));

// Rejouer la reprise de migration ne décale aucune date déjà écrite.
await db.exec(`do $$ declare l record; begin
  for l in select id, at, actor, dossier_id, action, detail from lead.audit_log
           where dossier_id is not null order by id loop
    perform lead_priv.crm_audit_note(l.id, l.at, l.actor, l.dossier_id, l.action, l.detail);
  end loop; end $$;`);
const oldAfterReplay = await value(
  'select created_at from lead.sap_notes where dossier_id=$1 and event_key=$2',
  [dossier, 'audit:' + oldAuditId]);
add('migration_replay_does_not_move_note_dates',
  new Date(oldAfterReplay).toISOString() === '2026-08-01T09:00:00.000Z', String(oldAfterReplay));

// 14.10 Publication + notification : une seule opération, rejouable sans doublon.
const beforeReviews = await value(
  'select count(*)::int from lead.design_reviews where dossier_id=$1', [dossier]);
const pubArgs = ['req-key-1', submitted.revision_id, 'full', 'conditions', 'validated',
  'Réponse technique atomique', 'INTERNAL_ONLY_SECRET', 'MK03-1A66-200W', 'custom',
  { cable: '300 mm PVC' }, 'Standex feedback', 'Votre revue est disponible.'];
const pub1 = await actor('authenticated', ids.rnd,
  () => value('select public.lead_crm_publish_review_and_notify($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)', pubArgs));
const pub2 = await actor('authenticated', ids.rnd,
  () => value('select public.lead_crm_publish_review_and_notify($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)', pubArgs));
add('atomic_publish_replay_creates_one_review', await value(
  'select count(*)::int from lead.design_reviews where dossier_id=$1', [dossier]) === beforeReviews + 1,
  String(beforeReviews));
add('atomic_publish_replay_returns_same_state', !!pub1.project && !!pub2.project);
add('atomic_publish_leaks_no_internal_note',
  !JSON.stringify(pub2.notifications).includes('INTERNAL_ONLY_SECRET'));
await expectFail('atomic_publish_rejects_a_changed_payload', () => actor('authenticated', ids.rnd,
  () => value('select public.lead_crm_publish_review_and_notify($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
    [...pubArgs.slice(0, 10), 'Autre sujet', 'Autre résumé'])), 'REQUEST_KEY_CONFLICT');
await expectFail('atomic_publish_requires_a_request_key', () => actor('authenticated', ids.rnd,
  () => value('select public.lead_crm_publish_review_and_notify($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
    [null, ...pubArgs.slice(1)])), 'REQUEST_KEY_REQUIRED');

// Frontière des champs : deux contenus DIFFÉRENTS où un saut de ligne passe
// d'un champ au suivant doivent donner deux empreintes différentes.
const ambiguous = ['req-key-amb', submitted.revision_id, 'full', 'conditions', 'validated',
  'Message\nPartie', 'Note', 'MK03-1A66-200W', 'custom',
  { cable: '300 mm PVC' }, 'Standex feedback', 'Résumé'];
await actor('authenticated', ids.rnd,
  () => value('select public.lead_crm_publish_review_and_notify($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
    ambiguous));
await expectFail('newline_shifted_between_fields_is_a_different_payload',
  () => actor('authenticated', ids.rnd,
    () => value('select public.lead_crm_publish_review_and_notify($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
      [...ambiguous.slice(0, 5), 'Message', 'Partie\nNote', ...ambiguous.slice(7)])),
  'REQUEST_KEY_CONFLICT');
// Une clé appartient à son auteur : un autre compte ne peut pas la reprendre.
await expectFail('a_request_key_belongs_to_its_author', () => actor('authenticated', ids.sales,
  () => value('select public.lead_crm_publish_review_and_notify($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
    ambiguous)), 'REQUEST_KEY_CONFLICT');


// 14.11 Échantillons : `lead_update_sample` n'écrit aucune ligne d'audit.
//       Le suivi SAP passe donc par le déclencheur gardé sur les changements
//       réels de `lead.sample_requests` (expédition, réception, retour client).
const validReview = await value(
  `select id from lead.design_reviews where dossier_id=$1 and published
     and verdict='validated' and superseded_by is null order by revision desc limit 1`, [dossier]);
let sampleId = null;
if (validReview) {
  const req = await actor('authenticated', ids.client,
    () => value('select public.lead_request_samples($1,$2,$3,$4,$5)',
      [validReview, 'MK03-1A66-200W', 24, 2000, false]));
  sampleId = req && (req.id || req.sample_id);
}
add('sample_request_created_for_tracking', !!sampleId, String(sampleId));
const notesBeforeSample = await value(
  'select count(*)::int from lead.sap_notes where dossier_id=$1', [dossier]);
if (sampleId) {
  await actor('authenticated', ids.sales,
    () => value('select public.lead_update_sample($1,$2,$3)', [sampleId, 'shipped', null]));
}
const shippedNote = await value(
  'select body_en from lead.sap_notes where dossier_id=$1 and event_key=$2',
  [dossier, 'sample_status:' + sampleId + ':shipped']);
add('sample_shipping_creates_an_english_note',
  !!shippedNote && shippedNote.includes('shipped') && shippedNote.includes('MK03-1A66-200W')
    && shippedNote.includes('24 units'), String(shippedNote));
if (sampleId) {
  await actor('authenticated', ids.sales,
    () => value('select public.lead_update_sample($1,$2,$3)', [sampleId, 'shipped', null]));
}
add('sample_same_status_creates_no_duplicate', await value(
  'select count(*)::int from lead.sap_notes where dossier_id=$1 and event_key=$2',
  [dossier, 'sample_status:' + sampleId + ':shipped']) === 1);
if (sampleId) {
  await actor('authenticated', ids.client,
    () => value('select public.lead_update_sample($1,$2,$3)',
      [sampleId, null, 'Essais positifs, détection stable à 3 mm.']));
  await actor('authenticated', ids.client,
    () => value('select public.lead_update_sample($1,$2,$3)',
      [sampleId, null, 'Essais positifs, détection stable à 3 mm.']));
}
const fbNotes = await db.query(
  `select body_en from lead.sap_notes where dossier_id=$1 and event_key like 'sample_feedback:%'`,
  [dossier]);
add('sample_feedback_creates_one_english_note', fbNotes.rows.length === 1,
  String(fbNotes.rows.length));
add('sample_feedback_note_copies_no_client_text',
  fbNotes.rows.length === 1 && !fbNotes.rows[0].body_en.includes('Essais positifs')
    && fbNotes.rows[0].body_en.includes('Customer test feedback recorded'),
  String(fbNotes.rows[0] && fbNotes.rows[0].body_en));
add('sample_notes_were_added_beyond_previous_state', await value(
  'select count(*)::int from lead.sap_notes where dossier_id=$1', [dossier]) > notesBeforeSample);
const sampleRow = await value('select to_jsonb(s) from lead.sample_requests s where s.id=$1', [sampleId]);
add('sample_revision_provenance_unchanged',
  !!sampleRow && sampleRow.status === 'shipped' && sampleRow.revision >= 1
    && sampleRow.feedback_revision === sampleRow.revision,
  JSON.stringify(sampleRow && { r: sampleRow.revision, fr: sampleRow.feedback_revision }));

// 14.12 NDA : preuve vérifiée et exigence explicite méritent un événement.
add('nda_proof_sentence_is_english', await value(
  "select lead_priv.crm_audit_sentence('nda_proof_recorded','{}'::jsonb)")
  === 'Signed NDA proof verified and recorded.');
add('nda_requirement_sentence_reflects_the_choice',
  (await value("select lead_priv.crm_audit_sentence('nda_requirement_set','{\"nda_required\":true}'::jsonb)"))
    === 'NDA set as required for this project.'
  && (await value("select lead_priv.crm_audit_sentence('nda_requirement_set','{\"nda_required\":false}'::jsonb)"))
    === 'NDA set as not required for this project.');
add('no_noise_for_file_events',
  (await value("select lead_priv.crm_audit_sentence('file_uploaded','{}'::jsonb)")) === null);

const failedBefore = results.filter((r) => !r.pass).length;
add('regression_block_ran', results.length > 65, String(failedBefore));

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} contrôles OK`);
writeFileSync('/tmp/sql-review-v1.8.json', JSON.stringify(results, null, 2));
await db.close();
if (failed.length) process.exit(1);
