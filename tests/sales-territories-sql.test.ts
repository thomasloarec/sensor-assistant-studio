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
async function change(
  person: string,
  operation: string,
  regions: string[],
  version: number,
  confirm = true,
  country = "FR",
) {
  return db.query("select public.lead_sales_change($1,$2,$3,$4,$5,$6) as value", [
    country,
    person,
    operation,
    regions,
    version,
    confirm,
  ]);
}
test("admin can assign a country, split without losing remaining regions, then transfer a region with a current confirmation", async () => {
  await as();
  await change(GILLES, "country", [], 0);
  await expect(change(THOMAS, "regions", ["FR.53"], 1, false)).rejects.toThrow(
    "TRANSFER_CONFIRMATION_REQUIRED",
  );
  await change(THOMAS, "regions", ["FR.53"], 1);
  const overview = (await db.query<any>("select public.lead_sales_overview() as value")).rows[0]
    .value;
  const france = overview.territories[0];
  expect(france.owner).toBeNull();
  expect(france.region_owners).toEqual({ "FR.11": GILLES, "FR.53": THOMAS, "FR.44": GILLES });
  await expect(change(THOMAS, "regions", ["FR.44"], 1)).rejects.toThrow("TERRITORY_STALE");
  await change(THOMAS, "regions", ["FR.44"], 2);
  await expect(change(GILLES, "country", [], 3, false)).rejects.toThrow(
    "TRANSFER_CONFIRMATION_REQUIRED",
  );
  await change(GILLES, "country", [], 3);
  const contact = (await db.query<any>("select public.lead_sales_contact('FR',null) as value"))
    .rows[0].value;
  expect(contact.contact.id).toBe(GILLES);
});
test("rights: anonymous and sales cannot change territories, tables remain inaccessible", async () => {
  await as("anon", "");
  await expect(change(GILLES, "country", [], 4)).rejects.toThrow();
  await expect(db.query("select * from lead.sales_profiles")).rejects.toThrow();
  await as("authenticated", SALES);
  await expect(db.query("select lead_priv.crm_row_json(null)")).rejects.toThrow();
  await expect(db.query("select lead_priv.sales_resolve('FR','FR.11')")).rejects.toThrow();
  await expect(change(GILLES, "country", [], 4)).rejects.toThrow("NOT_ALLOWED");
  await expect(db.query("select public.lead_sales_overview()")).rejects.toThrow("NOT_ALLOWED");
});
test("homonyms remain distinct, aliases work, only a verified city routes a divided country", async () => {
  await as();
  await change(THOMAS, "regions", ["FR.53"], 4);
  await as("anon", "");
  const cities = (await db.query<any>("select public.lead_geo_search('FR','saint') as value"))
    .rows[0].value.cities;
  expect(cities).toHaveLength(2);
  expect(cities[0].region_code).not.toBe(cities[1].region_code);
  expect(
    (await db.query<any>("select public.lead_geo_search('DE','munich') as value")).rows[0].value
      .cities[0].name,
  ).toBe("München");
  for (const [city, person] of [
    ["1", GILLES],
    ["2", THOMAS],
    ["3", GILLES],
  ])
    expect(
      (await db.query<any>("select public.lead_sales_contact('FR',$1) as value", [city])).rows[0]
        .value.contact.id,
    ).toBe(person);
  for (const city of [null, "4", "999"])
    expect(
      (await db.query<any>("select public.lead_sales_contact('FR',$1) as value", [city])).rows[0]
        .value.reason,
    ).toBe("region_required");
  expect(
    (await db.query<any>("select public.lead_geo_search('US','Boston') as value")).rows[0].value
      .ready,
  ).toBe(false);
});
test("server rejects invented or stale city/region combinations", async () => {
  await db.exec("reset role");
  for (const b of [
    { siteCityId: "1", siteCountry: "DE", siteCity: "Paris", siteRegionCode: "FR.11" },
    { siteCityId: "1", siteCountry: "FR", siteCity: "Rennes", siteRegionCode: "FR.11" },
    { siteCityId: "1", siteCountry: "FR", siteCity: "Paris", siteRegionCode: "FR.53" },
    { siteCountry: "FR", siteRegionCode: "FR.53" },
  ])
    await expect(
      db.query("select lead_priv.sales_validate_city($1)", [JSON.stringify(b)]),
    ).rejects.toThrow("CITY_SELECTION_REQUIRED");
  expect(
    (
      await db.query<any>("select lead_priv.sales_validate_city($1) as code", [
        JSON.stringify({
          siteCityId: "2",
          siteCountry: "FR",
          siteCity: "Saint-Test",
          siteRegionCode: "FR.53",
        }),
      ])
    ).rows[0].code,
  ).toBe("FR.53");
});
test("an assigned salesperson cannot be deactivated and invalid regions cannot be assigned", async () => {
  await db.exec("reset role");
  await expect(
    db.query("update lead.crm_directory set active=false where id=$1", [THOMAS]),
  ).rejects.toThrow("TRANSFER_TERRITORIES_FIRST");
  await as();
  await expect(change(THOMAS, "regions", ["DE.02"], 5)).rejects.toThrow("BAD_REGIONS");
  await change(THOMAS, "remove_regions", ["FR.53"], 5);
  expect(
    (await db.query<any>("select public.lead_sales_contact('FR','2') as value")).rows[0].value
      .reason,
  ).toBe("uncovered");
  await change(GILLES, "country", [], 0, true, "AQ");
});
test("photo writes are admin-only, require an existing owned path, and are versioned", async () => {
  const path = GILLES + "/30000000-0000-4000-8000-000000000001.webp";
  await as("authenticated", SALES);
  await expect(
    db.query("insert into storage.objects(bucket_id,name) values('sales-portraits',$1)", [path]),
  ).rejects.toThrow();
  await as();
  await db.query("insert into storage.objects(bucket_id,name) values('sales-portraits',$1)", [
    path,
  ]);
  await expect(
    db.query("select public.lead_sales_profile_save($1,$2,null,0)", [THOMAS, path]),
  ).rejects.toThrow("INVALID_PHOTO");
  await db.query("select public.lead_sales_profile_save($1,$2,$3,0)", [
    GILLES,
    path,
    "https://outlook.office.com/book/example",
  ]);
  await expect(
    db.query("select public.lead_sales_profile_save($1,null,null,0)", [GILLES]),
  ).rejects.toThrow("TERRITORY_STALE");
  const overview = (await db.query<any>("select public.lead_crm_admin_overview() as value")).rows[0]
    .value;
  expect(overview.directory.find((p: any) => p.id === GILLES).photo_path).toBe(path);
  await expect(
    db.query("select public.lead_sales_profile_save($1,null,$2,1)", [
      GILLES,
      "https://attacker@example.com/",
    ]),
  ).rejects.toThrow("INVALID_BOOKING_URL");
});
test("submission records its geographic owner without replacing manual CRM ownership or granting access", async () => {
  await as();
  await change(THOMAS, "regions", ["FR.53"], 6);
  await db.exec("reset role");
  const dossier = "40000000-0000-4000-8000-000000000001";
  await db.query("update lead.crm_directory set user_id=$1 where id=$2", [SALES, THOMAS]);
  await db.query("insert into lead.design_dossiers(id,owner_id,title) values($1,$2,$3)", [
    dossier,
    ADMIN,
    "Synthetic territory test",
  ]);
  await db.query("insert into lead.dossier_crm(dossier_id,sales_person) values($1,$2)", [
    dossier,
    GILLES,
  ]);
  const business = {
    siteCityId: "2",
    siteCity: "Saint-Test",
    siteCountry: "FR",
    siteRegionCode: "FR.53",
    siteRegionName: "Bretagne",
  };
  await db.query(
    "insert into lead.design_revisions(dossier_id,revision,snapshot,content_hash,submitted_by,nda_status_at_submit) values($1,1,$2,$3,$4,'not_required')",
    [dossier, JSON.stringify({ business }), "a".repeat(64), ADMIN],
  );
  const route = (
    await db.query<any>("select * from lead.sales_routes where person_id=$1", [THOMAS])
  ).rows;
  expect(route).toHaveLength(1);
  expect(route[0].region_code).toBe("FR.53");
  const crm = (await db.query<any>("select lead_priv.crm_row_json($1) as value", [dossier])).rows[0]
    .value;
  expect(crm.sales_person).toBe(GILLES);
  expect(crm.sales_contact_suggested).toBe("Thomas Test");
  expect(
    (await db.query("select * from lead.dossier_assignments where dossier_id=$1", [dossier])).rows,
  ).toHaveLength(0);
  await expect(
    db.query(
      "insert into lead.design_revisions(dossier_id,revision,snapshot,content_hash,submitted_by,nda_status_at_submit) values($1,2,$2,$3,$4,'not_required')",
      [
        dossier,
        JSON.stringify({ business: { ...business, siteCountry: "DE" } }),
        "b".repeat(64),
        ADMIN,
      ],
    ),
  ).rejects.toThrow("CITY_SELECTION_REQUIRED");
  expect(
    (await db.query("select * from lead.design_revisions where dossier_id=$1", [dossier])).rows,
  ).toHaveLength(1);
});
