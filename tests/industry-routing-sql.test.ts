import { beforeAll, afterAll, expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
const ADMIN = "10000000-0000-4000-8000-000000000001",
  SALES = "10000000-0000-4000-8000-000000000002";
const GILLES = "20000000-0000-4000-8000-000000000001",
  THOMAS = "20000000-0000-4000-8000-000000000002";
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage; create schema extensions;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,is_anonymous boolean default false);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table storage.buckets(id text primary key,name text,public boolean default false,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner uuid,owner_id text,metadata jsonb default '{}');
    alter table storage.objects enable row level security;
    grant usage on schema auth,storage to anon,authenticated,service_role;
    grant select,insert,update,delete on storage.objects to authenticated;
    grant execute on function auth.uid() to anon,authenticated,service_role;`);
  for (const f of [
    "supabase/schema/migration_v1.2_lead_magnet.sql",
    "supabase/schema/migration_v1.8_crm_dashboard.sql",
    "supabase/migrations/20260917110421_feedback_20260917_site_location.sql",
    "supabase/migrations/20261104085232_sales_territories.sql",
    "supabase/migrations/20261104134443_industry_routing.sql",
  ])
    await db.exec(readFileSync(f, "utf8"));
  await db.exec(`insert into auth.users(id,email) values('${ADMIN}','admin@example.invalid'),('${SALES}','sales@example.invalid');
    insert into lead.staff_members(user_id,role) values('${ADMIN}','admin'),('${SALES}','sales');
    insert into lead.crm_directory(id,first_name,last_name,role) values('${GILLES}','Gilles','Test','sales'),('${THOMAS}','Thomas','Test','sales');
    insert into lead.geo_countries values('FR'),('DE'),('AQ');
    insert into lead.geo_regions values('FR.11','FR','Île-de-France'),('FR.53','FR','Bretagne'),('FR.44','FR','Grand Est'),('DE.02','DE','Bayern');
    insert into lead.geo_cities values('1','Paris','FR','FR.11','75','|paris'),('2','Saint-Test','FR','FR.53','35','|saint-test'),('3','Saint-Test','FR','FR.44','57','|saint-test'),('4','München','DE','DE.02','091','|munchen|munich');
    insert into lead.geo_imports values('FR',now(),'test',3),('DE',now(),'test',1);`);
}, 30000);
afterAll(async () => {
  await db?.close();
});
async function as(role = "authenticated", uid = ADMIN) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
  await db.exec("set role " + role);
}
async function industry(
  person: string,
  version: number,
  remove = false,
  confirm = true,
  name = "Automotive",
  country = "FR",
) {
  return db.query("select public.lead_sales_industry_change($1,$2,$3,$4,$5,$6) as value", [
    country,
    name,
    person,
    remove,
    version,
    confirm,
  ]);
}
async function contact(name: string | null, city: string | null = "2", country = "FR") {
  return (
    await db.query<any>("select public.lead_sales_contact_for_industry($1,$2,$3) as value", [
      country,
      city,
      name,
    ])
  ).rows[0].value;
}
test("national industry overrides regional routing, other industries retain geography", async () => {
  await as();
  await db.query("select public.lead_sales_change('FR',$1,'country','{}',0,true)", [THOMAS]);
  await industry(GILLES, 0);
  expect((await contact("Automotive")).contact.id).toBe(GILLES);
  expect((await contact("Automotive", null)).basis).toBe("industry");
  expect((await contact("Medical")).contact.id).toBe(THOMAS);
  expect((await contact(null)).basis).toBe("geography");
  expect((await contact("Automotive", null, "DE")).contact).toBeNull();
  await expect(contact("Automative")).rejects.toThrow("INVALID_INDUSTRY");
  await industry(GILLES, 0, false, true, "Medical");
  const overview = (await db.query<any>("select public.lead_sales_overview() as v")).rows[0].v;
  expect(overview.industries.filter((i: any) => i.owner === GILLES)).toHaveLength(2);
});
test("transfers require confirmation, reject stale versions and keep one owner", async () => {
  await as();
  await expect(industry(THOMAS, 1, false, false)).rejects.toThrow("TRANSFER_CONFIRMATION_REQUIRED");
  await industry(THOMAS, 1);
  await expect(industry(GILLES, 1)).rejects.toThrow("TERRITORY_STALE");
  await expect(industry(GILLES, 2, true)).rejects.toThrow("TERRITORY_STALE");
  await industry(THOMAS, 2, true);
  expect((await contact("Automotive")).basis).toBe("geography");
  await industry(GILLES, 3);
  await db.exec("reset role");
  expect(
    (
      await db.query(
        "select * from lead.sales_industries where country='FR' and industry='Automotive'",
      )
    ).rows,
  ).toHaveLength(1);
  await expect(
    db.query("update lead.crm_directory set active=false where id=$1", [GILLES]),
  ).rejects.toThrow("TRANSFER_INDUSTRIES_FIRST");
});
test("anonymous prospect reads only the contact; staff cannot mutate exceptions or rate counters", async () => {
  await as("anon", "");
  expect((await contact("Automotive")).contact.id).toBe(GILLES);
  await expect(industry(GILLES, 4)).rejects.toThrow();
  await expect(db.query("select * from lead.sales_industries")).rejects.toThrow();
  await expect(
    db.query("select lead_priv.sales_resolve_industry('FR',null,'Automotive')"),
  ).rejects.toThrow();
  await expect(
    db.query("select public.lead_project_identity_rate($1,true)", ["a".repeat(64)]),
  ).rejects.toThrow();
  await as("authenticated", SALES);
  await expect(industry(GILLES, 4)).rejects.toThrow("NOT_ALLOWED");
  await expect(db.query("select lead_priv.crm_row_json(null)")).rejects.toThrow();
});
test("submission requires a valid confirmed industry and records the reason without changing a manual CRM owner", async () => {
  await db.exec("reset role");
  const id = "40000000-0000-4000-8000-000000000003";
  await db.query(
    "insert into lead.design_dossiers(id,owner_id,title) values($1,$2,'Industry test')",
    [id, ADMIN],
  );
  await db.query("insert into lead.dossier_crm(dossier_id,sales_person) values($1,$2)", [
    id,
    THOMAS,
  ]);
  const business = {
    siteCityId: "2",
    siteCity: "Saint-Test",
    siteCountry: "FR",
    siteRegionCode: "FR.53",
    industry: "Automotive",
    industryConfirmed: true,
  };
  const insert = (b: unknown) =>
    db.query(
      "insert into lead.design_revisions(dossier_id,revision,snapshot,content_hash,submitted_by,nda_status_at_submit) values($1,1,$2,$3,$4,'not_required')",
      [id, JSON.stringify({ business: b }), "a".repeat(64), ADMIN],
    );
  for (const change of [
    { industry: null },
    { industry: "Automative" },
    { industryConfirmed: false },
    { industryConfirmed: "true" },
  ])
    await expect(insert({ ...business, ...change })).rejects.toThrow("INDUSTRY_REQUIRED");
  await insert(business);
  const crm = (await db.query<any>("select lead_priv.crm_row_json($1) as v", [id])).rows[0].v;
  expect(crm.sales_person).toBe(THOMAS);
  expect(crm.sales_contact_suggested).toBe("Gilles Test");
  expect(crm.industry).toBe("Automotive");
  expect(crm.routing_basis).toBe("industry");
  expect(
    (await db.query("select * from lead.dossier_assignments where dossier_id=$1", [id])).rows,
  ).toHaveLength(0);
});
test("provider usage is bounded across instances and counters are service-only", async () => {
  await as("service_role", "");
  for (let i = 1; i <= 13; i++)
    expect(
      (
        await db.query<any>("select public.lead_project_identity_rate($1,false) as ok", [
          "b".repeat(64),
        ])
      ).rows[0].ok,
    ).toBe(i <= 12);
  await expect(db.query("select public.lead_project_identity_rate('raw-ip',true)")).rejects.toThrow(
    "BAD_INPUT",
  );
});
