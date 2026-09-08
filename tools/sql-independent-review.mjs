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

const snapshot=JSON.parse(readFileSync('tests/fixtures/synthetic-dossier-fixture.json','utf8'));
const consent=[{kind:'supabase_dossier',statement:'Explicit synthetic review consent',accepted_at:new Date().toISOString(),content_ref:'fixture-revision-1'}];
await db.query("insert into lead.staff_members(user_id,role) values($1,'rnd'),($2,'sales'),($3,'admin')",[ids.rnd,ids.sales,ids.admin]);
const as=(id,fn)=>actor('authenticated',id,fn);
const dossier=await as(ids.a,()=>value('select public.lead_create_dossier($1,false)',['Actual application DTO fixture']));
await db.query('insert into lead.dossier_assignments(dossier_id,user_id) values($1,$2),($1,$3)',[dossier,ids.rnd,ids.sales]);
const sub=await as(ids.a,()=>value('select public.lead_submit_revision($1,0,$2,$3,$4,$5)',[dossier,snapshot,'a'.repeat(64),consent,[]]));
const review=await as(ids.rnd,()=>value('select public.lead_publish_review($1,$2,$3,$4,$5,$6,$7,$8,$9)',[sub.revision_id,'full','Synthetic conditions','validated','review',null,'MK03-1A66-200W','custom',{}]));
const sample=await as(ids.a,()=>value('select public.lead_request_samples($1,$2,1,null,false)',[review,'MK03-1A66-200W']));
add('actual_app_2000_volume_routes_direct',sample.route==='standex_direct',JSON.stringify(sample));
const args=[review,'EUR',[{quantity:100,unit_price:4}],100,0,'EXW',8,'2027-12-31'];
await expectFail('numeric_NaN_NRE_is_rejected',()=>as(ids.sales,()=>value('select public.lead_create_offer($1,$2,$3,$4,$5,$6,$7,$8)',args.map((x,i)=>i===4?'NaN':x))),'BAD_NRE');
await expectFail('numeric_Infinity_NRE_is_rejected',()=>as(ids.sales,()=>value('select public.lead_create_offer($1,$2,$3,$4,$5,$6,$7,$8)',args.map((x,i)=>i===4?'Infinity':x))),'BAD_NRE');
const offer=await as(ids.sales,()=>value('select public.lead_create_offer($1,$2,$3,$4,$5,$6,$7,$8)',args));
const ov=await as(ids.a,()=>value('select public.lead_client_view($1)',[dossier]));
add('actual_app_volume_is_bound_to_offer',ov.offers.find(o=>o.id===offer)?.annual_volume_basis===2000,JSON.stringify(ov.offers.find(o=>o.id===offer)?.annual_volume_basis));
const badD=await as(ids.a,()=>value('select public.lead_create_dossier($1,false)',['Malformed input test']));
await expectFail('incomplete_nontechnical_snapshot_is_rejected',()=>as(ids.a,()=>value('select public.lead_submit_revision($1,0,$2,null,$3,$4)',[badD,{arbitrary:true},consent,[]])));
const badConsentD=await as(ids.a,()=>value('select public.lead_create_dossier($1,false)',['Consent test']));
await expectFail('consent_date_and_content_ref_are_validated',()=>as(ids.a,()=>value('select public.lead_submit_revision($1,0,$2,null,$3,$4)',[badConsentD,snapshot,[{kind:'supabase_dossier',statement:'x',accepted_at:'not-a-date',content_ref:'wrong-design'}],[]])));
const vr=await as(ids.rnd,()=>value('select public.lead_publish_review($1,$2,$3,$4,$5,$6,$7,$8,$9)',[sub.revision_id,'full','pending','variant_proposed','variant',null,'MK03-1A66-500W','custom',{description:'Synthetic alternative'}]));
await as(ids.rnd,()=>value('select public.lead_publish_review($1,$2,$3,$4,$5,$6)',[sub.revision_id,'full','more info','more_info','Stop old variant',null]));
await expectFail('superseded_variant_cannot_be_accepted',()=>as(ids.a,()=>value('select public.lead_accept_variant($1)',[vr])));
const sub2=await as(ids.a,()=>value('select public.lead_submit_revision($1,1,$2,null,$3,$4)',[dossier,{...snapshot,freeConstraints:'Revision two'},consent,[]]));
const feedback=await as(ids.a,()=>value('select public.lead_update_sample($1,null,$2)',[sample.id,'Feedback about sample from design revision ONE']));
add('feedback_stays_bound_to_tested_sample_revision',feedback.feedback_revision===1,JSON.stringify(feedback));
await expectFail('superseded_sample_is_not_reactivated_for_shipping',()=>as(ids.sales,()=>value('select public.lead_update_sample($1,$2,null)',[sample.id,'shipped'])));
const errors=results.filter(x=>!x.pass);writeFileSync('/tmp/sql-independent-v12.json',JSON.stringify(results,null,2));
console.log(`${results.length-errors.length}/${results.length} independent checks pass`);await db.close();if(errors.length)process.exit(1);
