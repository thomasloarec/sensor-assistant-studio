// Recette SQL — exécute la migration Lead Magnet dans un PostgreSQL jetable (PGlite).
// Outil de développement uniquement : jamais importé par l'application.
//   bun tools/sql-review.mjs [chemin_migration]
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

const path = process.argv[2] ?? 'supabase/schema/migration_v1.2_lead_magnet.sql';
await db.exec(readFileSync(path, 'utf8'));

const ids = {
  a: '10000000-0000-4000-8000-000000000001',
  b: '10000000-0000-4000-8000-000000000002',
  rnd: '10000000-0000-4000-8000-000000000003',
  sales: '10000000-0000-4000-8000-000000000004',
  admin: '10000000-0000-4000-8000-000000000005',
  outsider: '10000000-0000-4000-8000-000000000006',
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

const consent = [{
  kind: 'supabase_dossier',
  statement: 'Transfert du dossier de conception à Standex pour revue R&D.',
  accepted_at: '2026-09-08T09:00:00Z',
  content_ref: 'dossier-v1',
}];
const snapshot = {
  detection_goal: 'OWNER_A_DESIGN_SECRET',
  business: { annualVolume: { value: 2000, unit: 'pieces/an', state: 'known' } },
};

// 1. Sonde de version sans la moindre réparation locale.
try {
  const v = await actor('anon', null, () => value('select public.lead_schema_version()'));
  add('anon_schema_probe_can_execute', v.ready === true, JSON.stringify(v));
} catch (e) { add('anon_schema_probe_can_execute', false, e.message); }

const dossier = await actor('authenticated', ids.a,
  () => value('select public.lead_create_dossier($1,false)', ['Synthetic test A']));
const submitted = await actor('authenticated', ids.a,
  () => value('select public.lead_submit_revision($1,0,$2,$3,$4,$5)',
    [dossier, snapshot, 'a'.repeat(64), consent, []]));
add('server_recomputes_hash', submitted.content_hash !== 'a'.repeat(64) && submitted.client_hash_matches === false, submitted.content_hash);

await expectFail('consent_without_content_is_rejected', () => actor('authenticated', ids.a,
  () => value('select public.lead_submit_revision($1,1,$2,$3,$4,$5)',
    [dossier, snapshot, null, [{ kind: 'supabase_dossier' }], []])), 'CONSENT_INCOMPLETE');
await expectFail('json_null_snapshot_is_rejected', () => actor('authenticated', ids.a,
  () => value('select public.lead_submit_revision($1,1,$2,$3,$4,$5)',
    [dossier, { a: null }, null, consent, []])), 'EMPTY_SNAPSHOT');
await expectFail('unknown_file_id_is_rejected', () => actor('authenticated', ids.a,
  () => value('select public.lead_submit_revision($1,1,$2,$3,$4,$5)',
    [dossier, snapshot, null, consent, [{ path: 'anything/forged.glb' }]])), 'FILE_NOT_TRANSFERRED');

await expectFail('stranger_cannot_read', () => actor('authenticated', ids.b,
  () => value('select public.lead_client_view($1)', [dossier])), 'NOT_ALLOWED');

await db.query("insert into lead.staff_members(user_id,role) values ($1,'rnd'),($2,'sales'),($3,'admin')",
  [ids.rnd, ids.sales, ids.admin]);
await expectFail('unassigned_staff_cannot_read_design', () => actor('authenticated', ids.rnd,
  () => value('select public.lead_staff_view($1)', [dossier])), 'NOT_ALLOWED');

// L'admin affecte : pas de saisie manuelle d'UUID côté client, pas d'auto-attribution.
await actor('authenticated', ids.admin, () => value('select public.lead_assign_dossier($1,$2)', [dossier, ids.rnd]));
await actor('authenticated', ids.admin, () => value('select public.lead_assign_dossier($1,$2)', [dossier, ids.sales]));
await expectFail('non_admin_cannot_assign', () => actor('authenticated', ids.sales,
  () => value('select public.lead_assign_dossier($1,$2)', [dossier, ids.outsider])), 'NOT_ALLOWED');

try {
  const v = await actor('authenticated', ids.rnd, () => value('select public.lead_staff_view($1)', [dossier]));
  add('assigned_rnd_can_read_design', JSON.stringify(v).includes('OWNER_A_DESIGN_SECRET'));
} catch (e) { add('assigned_rnd_can_read_design', false, e.message); }

try {
  const inbox = await actor('authenticated', ids.rnd, () => value('select public.lead_staff_inbox()'));
  add('staff_inbox_lists_assigned_dossiers', inbox.assigned.some((x) => x.id === dossier));
  const adminInbox = await actor('authenticated', ids.admin, () => value('select public.lead_staff_inbox()'));
  add('admin_triage_has_no_design_payload',
    adminInbox.triage.length > 0 && !JSON.stringify(adminInbox.triage).includes('OWNER_A_DESIGN_SECRET'));
} catch (e) { add('staff_inbox_lists_assigned_dossiers', false, e.message); }

await expectFail('validated_review_requires_exact_mpn', () => actor('authenticated', ids.rnd,
  () => value('select public.lead_publish_review($1,$2,$3,$4,$5,$6)',
    [submitted.revision_id, 'full', '', 'validated', 'msg', null])), 'EXACT_PART_NUMBER_REQUIRED');

const review = await actor('authenticated', ids.rnd,
  () => value('select public.lead_publish_review($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [submitted.revision_id, 'full', 'conditions', 'validated', 'Technical response',
      'INTERNAL_ONLY_SECRET', 'MK03-1A66-200W', 'custom',
      { cable: '300 mm PVC', connector: 'à qualifier', pcb: 'sans' }]));

const client = await actor('authenticated', ids.a, () => value('select public.lead_client_view($1)', [dossier]));
add('client_does_not_receive_internal_notes', !JSON.stringify(client).includes('INTERNAL_ONLY_SECRET'));
add('client_can_reopen_submitted_design', JSON.stringify(client).includes('OWNER_A_DESIGN_SECRET'));
add('client_sees_exact_part_number', client.reviews[0].exact_part_number === 'MK03-1A66-200W');

try {
  const list = await actor('authenticated', ids.a, () => value('select public.lead_my_dossiers()'));
  add('client_dossier_list_available', list.some((d) => d.id === dossier));
} catch (e) { add('client_dossier_list_available', false, e.message); }

// Offres : validations strictes.
await expectFail('offer_rejects_missing_tier_values', () => actor('authenticated', ids.sales,
  () => value('select public.lead_create_offer($1,$2,$3,$4,$5,$6,$7,$8)',
    [review, 'EUR', [{}], 1000, 0, 'EXW', 8, '2027-12-31'])), 'BAD_TIERS');
await expectFail('offer_rejects_nan_price', () => actor('authenticated', ids.sales,
  () => value('select public.lead_create_offer($1,$2,$3,$4,$5,$6,$7,$8)',
    [review, 'EUR', [{ quantity: 100, unit_price: 'NaN' }], 1000, 0, 'EXW', 8, '2027-12-31'])), 'BAD_TIERS');
await expectFail('offer_rejects_fractional_quantity', () => actor('authenticated', ids.sales,
  () => value('select public.lead_create_offer($1,$2,$3,$4,$5,$6,$7,$8)',
    [review, 'EUR', [{ quantity: 10.5, unit_price: 2 }], 1000, 0, 'EXW', 8, '2027-12-31'])), 'BAD_TIERS');
await expectFail('offer_rejects_contradictory_tiers', () => actor('authenticated', ids.sales,
  () => value('select public.lead_create_offer($1,$2,$3,$4,$5,$6,$7,$8)',
    [review, 'EUR', [{ quantity: 100, unit_price: 1 }, { quantity: 1000, unit_price: 5 }], 100, 0, 'EXW', 8, '2027-12-31'])), 'CONTRADICTORY_TIERS');
await expectFail('offer_rejects_past_validity', () => actor('authenticated', ids.sales,
  () => value('select public.lead_create_offer($1,$2,$3,$4,$5,$6,$7,$8)',
    [review, 'EUR', [{ quantity: 100, unit_price: 2 }], 100, 0, 'EXW', 8, '2020-01-01'])), 'BAD_VALIDITY');
await expectFail('rnd_cannot_price', () => actor('authenticated', ids.rnd,
  () => value('select public.lead_create_offer($1,$2,$3,$4,$5,$6,$7,$8)',
    [review, 'EUR', [{ quantity: 100, unit_price: 2 }], 100, 0, 'EXW', 8, '2027-12-31'])), 'NOT_ALLOWED');

const offer = await actor('authenticated', ids.sales,
  () => value('select public.lead_create_offer($1,$2,$3,$4,$5,$6,$7,$8)',
    [review, 'EUR', [{ quantity: 100, unit_price: 4.2 }, { quantity: 1000, unit_price: 3.1 }],
      100, 1500, 'EXW', 8, '2027-12-31']));
add('sales_can_price_validated_review', !!offer);

// Échantillons : la référence, la désignation et le volume viennent du serveur.
await expectFail('samples_reject_unapproved_exact_reference', () => actor('authenticated', ids.a,
  () => value('select public.lead_request_samples($1,$2,$3,$4,$5)',
    [review, 'WRONG-REFERENCE', 1, 999, true])), 'PART_NUMBER_MISMATCH');
const sample = await actor('authenticated', ids.a,
  () => value('select public.lead_request_samples($1,$2,$3,$4,$5)',
    [review, 'MK03-1A66-200W', 1, 999, true]));
add('high_volume_custom_routes_standex_direct', sample.route === 'standex_direct', sample.route);
add('sample_volume_comes_from_submitted_business', sample.annual_volume_basis === 2000, String(sample.annual_volume_basis));
add('sample_designation_comes_from_review', sample.designation === 'custom', sample.designation);

// Retour d'expérience client conservé.
const updated = await actor('authenticated', ids.a,
  () => value('select public.lead_update_sample($1,$2,$3)', [sample.id, null, 'Fonctionne à 3 mm']));
add('client_feedback_persists', updated.feedback === 'Fonctionne à 3 mm');
await expectFail('client_cannot_move_logistics_status', () => actor('authenticated', ids.a,
  () => value('select public.lead_update_sample($1,$2,$3)', [sample.id, 'shipped', null])), 'NOT_ALLOWED');

// Nouvelle revue publiée sur la MÊME révision : offres périmées, échantillons dépassés.
await actor('authenticated', ids.rnd,
  () => value('select public.lead_publish_review($1,$2,$3,$4,$5,$6)',
    [submitted.revision_id, 'full', 'needs investigation', 'more_info', 'Review changed', null]));
const after = await actor('authenticated', ids.a, () => value('select public.lead_client_view($1)', [dossier]));
add('changed_review_voids_previous_offers', after.offers.length > 0 && after.offers.every((x) => x.voided && !x.active));
add('changed_review_supersedes_samples', after.samples.every((s) => s.status === 'superseded'));
add('sample_feedback_survives_design_change', after.samples.every((s) => s.feedback === 'Fonctionne à 3 mm'));

await expectFail('direct_table_access_denied', () => actor('authenticated', ids.a,
  () => value('select count(*) from lead.design_dossiers')));

// NDA demandé : aucun transfert avant preuve serveur.
const privateDossier = await actor('authenticated', ids.a,
  () => value('select public.lead_create_dossier($1,true)', ['Synthetic NDA request']));
await expectFail('unsigned_nda_blocks_submission', () => actor('authenticated', ids.a,
  () => value('select public.lead_submit_revision($1,0,$2,$3,$4,$5)',
    [privateDossier, { purpose: 'CONFIDENTIAL' }, null, consent, []])), 'NDA_NOT_IN_FORCE');
await expectFail('unsigned_nda_blocks_upload_session', () => actor('authenticated', ids.a,
  () => value('select public.lead_open_upload_session($1,$2)', [privateDossier, 'design_model'])), 'NDA_NOT_IN_FORCE');
await expectFail('client_cannot_declare_nda_in_force', () => actor('authenticated', ids.a,
  () => value('select public.lead_admin_record_nda_proof($1,$2,$3,$4,$5,$6,$7,$8)',
    [privateDossier, 'f'.repeat(64), 'b'.repeat(64), 'p/x.docx', 'REF-1',
      [{ party: 'Standex' }, { party: 'K Motor' }], '2026-06-16', 'manual'])), 'NOT_ALLOWED');

await actor('authenticated', ids.admin, () => value('select public.lead_assign_dossier($1,$2)', [privateDossier, ids.admin]));
await expectFail('nda_proof_rejects_wrong_template_hash', () => actor('authenticated', ids.admin,
  () => value('select public.lead_admin_record_nda_proof($1,$2,$3,$4,$5,$6,$7,$8)',
    [privateDossier, 'f'.repeat(64), 'b'.repeat(64), 'p/x.docx', 'REF-1',
      [{ party: 'Standex' }, { party: 'K Motor' }], '2026-06-16', 'manual'])), 'NDA_TEMPLATE_MISMATCH');

const TEMPLATE = '6e25345f1e83e92630258774d27a451d65d615cdd9f41a5331dae75c4072740b';
await expectFail('nda_proof_requires_counterparties', () => actor('authenticated', ids.admin,
  () => value('select public.lead_admin_record_nda_proof($1,$2,$3,$4,$5,$6,$7,$8)',
    [privateDossier, TEMPLATE, 'b'.repeat(64), 'p/x.docx', 'REF-1', [{ party: 'Standex' }],
      '2026-06-16', 'manual'])), 'NDA_COUNTERPARTIES_REQUIRED');
await expectFail('nda_proof_rejects_unsigned_copy_of_template', () => actor('authenticated', ids.admin,
  () => value('select public.lead_admin_record_nda_proof($1,$2,$3,$4,$5,$6,$7,$8)',
    [privateDossier, TEMPLATE, TEMPLATE, 'p/x.docx', 'REF-1',
      [{ party: 'Standex' }, { party: 'K Motor' }], '2026-06-16', 'manual'])), 'NDA_SIGNED_DOCUMENT_INVALID');

const proof = await actor('authenticated', ids.admin,
  () => value('select public.lead_admin_record_nda_proof($1,$2,$3,$4,$5,$6,$7,$8)',
    [privateDossier, TEMPLATE, 'b'.repeat(64), privateDossier + '/signed/nda.docx', 'REF-2026-001',
      [{ party: 'Standex Electronics' }, { party: 'K Motor SAS' }], '2026-06-16', 'verification_manuelle']));
add('admin_can_record_verified_nda_proof', !!proof);

// Session d'upload : autorisée seulement après NDA en vigueur, chemin imposé.
let session;
try {
  session = await actor('authenticated', ids.a,
    () => value('select public.lead_open_upload_session($1,$2)', [privateDossier, 'design_model']));
  add('upload_session_after_nda_in_force', session.path_prefix.startsWith(privateDossier));
} catch (e) { add('upload_session_after_nda_in_force', false, e.message); }

if (session) {
  await actor('authenticated', ids.a, () => db.query(
    "insert into storage.objects(bucket_id,name,owner) values('lead-design-files',$1,$2)",
    [session.path_prefix + '/model.glb', ids.a]));
  add('upload_inside_authorized_session_allowed', true);
  await expectFail('upload_outside_session_denied', () => actor('authenticated', ids.a,
    () => db.query("insert into storage.objects(bucket_id,name,owner) values('lead-design-files',$1,$2)",
      ['forged/path/model.glb', ids.a])));

  const priv = await actor('authenticated', ids.a,
    () => value('select public.lead_submit_revision($1,0,$2,$3,$4,$5)',
      [privateDossier, { purpose: 'CONFIDENTIAL', business: { annualVolume: { value: 500 } } }, null, consent,
        [{ path: session.path_prefix + '/model.glb', kind: 'glb' }]]));
  add('real_file_can_be_attached_to_revision', priv.revision === 1);
  await expectFail('submitted_object_is_immutable', () => actor('authenticated', ids.a,
    () => db.query("delete from storage.objects where name = $1", [session.path_prefix + '/model.glb'])
      .then((r) => { if (r.affectedRows === 0) throw new Error('DELETE_BLOCKED'); })), 'DELETE_BLOCKED');
  await expectFail('outsider_cannot_read_object', () => actor('authenticated', ids.outsider,
    () => db.query('select name from storage.objects where bucket_id=$1', ['lead-design-files'])
      .then((r) => { if (r.rows.length === 0) throw new Error('NO_ROWS_VISIBLE'); })), 'NO_ROWS_VISIBLE');
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} contrôles OK`);
writeFileSync('/tmp/sql-review-v1.2.json', JSON.stringify(results, null, 2));
await db.close();
if (failed.length) process.exit(1);
