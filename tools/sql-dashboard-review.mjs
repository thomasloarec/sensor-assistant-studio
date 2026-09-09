// Recette SQL — espace de travail interne (migration 1.8) sur PostgreSQL jetable.
// Applique les migrations CUMULÉES réelles : 1.2 → 1.5 → 1.6 → 1.7 → 1.8.
// Outil de développement uniquement : jamais importé par l'application.
//   bun tools/sql-dashboard-review.mjs
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, writeFileSync } from 'node:fs';

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
  add('board_lists_unfiled_dossier', board.unfiled.some((d) => d.dossier_id === dossier));
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
  + ' on conflict (dossier_id,user_id) do nothing', [dossier, ids.rnd, ids.admin]);
await actor('authenticated', ids.admin,
  () => value('select public.lead_crm_set_owners($1,$2,$3,$4)',
    [dossier, franke.id, null, replaced.project.version]));
console.log('DBG assignments', JSON.stringify((await db.query('select user_id,source from lead.dossier_assignments where dossier_id=$1',[dossier])).rows));
add('derived_owner_access_is_revoked', await value(
  'select count(*)::int from lead.dossier_assignments where dossier_id=$1 and user_id=$2',
  [dossier, ids.rnd]) === 0);
add('unlinked_owner_gets_no_implicit_access', await value(
  'select count(*)::int from lead.dossier_assignments where dossier_id=$1', [dossier]) === 1);

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

const failedBefore = results.filter((r) => !r.pass).length;
add('regression_block_ran', results.length > 65, String(failedBefore));

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} contrôles OK`);
writeFileSync('/tmp/sql-review-v1.8.json', JSON.stringify(results, null, 2));
await db.close();
if (failed.length) process.exit(1);
