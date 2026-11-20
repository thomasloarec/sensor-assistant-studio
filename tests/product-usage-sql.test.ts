import { beforeAll, afterAll, expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
let db: PGlite;
const sid = crypto.randomUUID(),
  token = crypto.randomUUID(),
  visitor = crypto.randomUUID(),
  flow = crypto.randomUUID(),
  owner = crypto.randomUUID(),
  admin = crypto.randomUUID();
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
create role anon;create role authenticated;create schema auth;create schema lead;create schema lead_priv;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function lead_priv.role_of(u uuid) returns text language sql stable as $$select case when u='${admin}' then 'admin' else null end$$;
create function lead_priv.crm_require_admin() returns uuid language plpgsql stable as $$begin if auth.uid() is distinct from '${admin}'::uuid then raise exception 'NOT_ALLOWED';end if;return auth.uid();end$$;
create table lead.design_dossiers(id uuid primary key,owner_id uuid);
create table lead.design_revisions(dossier_id uuid,submitted_at timestamptz);
grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;
`);
  await db.exec(readFileSync("supabase/migrations/20261120151239_product_usage_v1.sql", "utf8"));
  // Installation must also work before the optional customer-email feature.
  await db.exec("create table lead.customer_pending(id uuid primary key,receipt_hash text,snapshot jsonb,expires_at timestamptz,created_at timestamptz default now())");
}, 30000);
afterAll(async () => {
  await db?.close();
});
async function asRole(role: string, sql: string, args: any[] = [], user = "") {
  await db.exec(`set role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  try {
    return await db.query<any>(sql, args);
  } finally {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub','',false)");
  }
}
const ev = (name: string, extra = {}) => ({
  id: crypto.randomUUID(),
  flow,
  name,
  at: new Date().toISOString(),
  ...extra,
});
const ingest = (events: any[], secret = token, user = "") =>
  asRole(
    user ? "authenticated" : "anon",
    "select public.product_usage_ingest($1,$2,$3,$4,$5,$6::jsonb)",
    [sid, secret, visitor, "fr", "desktop", JSON.stringify(events)],
    user,
  );
test("anonymous intake cannot read tables or reports, rejects private fields and fake conversions", async () => {
  await expect(asRole("anon", "select * from lead.product_usage_events")).rejects.toThrow();
  await expect(asRole("anon", "select public.product_usage_report(7)")).rejects.toThrow();
  await expect(ingest([ev("visit", { fileName: "secret.glb" })])).rejects.toThrow("BAD_EVENT");
  await expect(ingest([ev("submission_confirmed")])).rejects.toThrow("BAD_EVENT");
  await ingest([ev("visit")]);
  await expect(ingest([ev("visit")], crypto.randomUUID())).rejects.toThrow("NOT_ALLOWED");
});
test("retries are idempotent and a normal account cannot access the report", async () => {
  const e = ev("project_started");
  await ingest([e]);
  await ingest([e]);
  expect(
    (
      await db.query<any>("select count(*)::int n from lead.product_usage_events where id=$1", [
        e.id,
      ])
    ).rows[0].n,
  ).toBe(1);
  await expect(
    asRole("authenticated", "select public.product_usage_report(7)", [], owner),
  ).rejects.toThrow("NOT_ALLOWED");
});
test("pending submission requires its receipt; later confirmation is recorded by the database", async () => {
  const d = crypto.randomUUID(),
    receipt = "a".repeat(64);
  await ingest([ev("contact_viewed"), ev("submission_attempted")]);
  await db.query(
    "insert into lead.customer_pending(id,receipt_hash,snapshot,expires_at) values($1,$2,'{}',now()+interval '24 hours')",
    [d, receipt],
  );
  const bind = (proof: string) =>
    asRole("anon", "select public.product_usage_bind($1,$2,$3,$4,$5)", [
      sid,
      token,
      flow,
      d,
      proof,
    ]);
  await expect(bind("b".repeat(64))).rejects.toThrow("NOT_ALLOWED");
  await bind(receipt);
  await db.query("insert into lead.design_revisions(dossier_id,submitted_at) values($1,now())", [d]);
  const r = (await asRole("authenticated", "select public.product_usage_report(7) as r", [], admin))
    .rows[0].r;
  expect(r.sessions[0].events.filter((e: any) => e.name === "submission_confirmed")).toHaveLength(
    1,
  );
});
test("staff activity excludes its whole session", async () => {
  await ingest([ev("heartbeat")], token, admin);
  const r = (await asRole("authenticated", "select public.product_usage_report(7) as r", [], admin))
    .rows[0].r;
  expect(r.sessions).toHaveLength(0);
});
test("a logged-in customer cannot attach an old submission or another owner’s dossier", async () => {
  const s = crypto.randomUUID(),
    secret = crypto.randomUUID(),
    d = crypto.randomUUID();
  await asRole(
    "authenticated",
    "select public.product_usage_ingest($1,$2,$3,$4,$5,$6::jsonb)",
    [
      s,
      secret,
      visitor,
      "en",
      "desktop",
      JSON.stringify([
        ev("visit"),
        ev("project_started"),
        ev("contact_viewed"),
        ev("submission_attempted"),
      ]),
    ],
    owner,
  );
  await db.query("insert into lead.design_dossiers values($1,$2)", [d, owner]);
  await db.query("insert into lead.design_revisions values($1,now()-interval '2 days')", [d]);
  const bind = (user: string) =>
    asRole(
      "authenticated",
      "select public.product_usage_bind($1,$2,$3,$4)",
      [s, secret, flow, d],
      user,
    );
  await expect(bind(crypto.randomUUID())).rejects.toThrow("NOT_ALLOWED");
  await expect(bind(owner)).rejects.toThrow("NOT_SUBMITTED");
  await db.query("insert into lead.design_revisions values($1,now())", [d]);
  await bind(owner);
  await bind(owner);
  expect(
    (
      await db.query<any>(
        "select count(*)::int n from lead.product_usage_bindings where dossier_id=$1",
        [d],
      )
    ).rows[0].n,
  ).toBe(1);
  const r = (await asRole("authenticated", "select public.product_usage_report(7) as r", [], admin))
    .rows[0].r;
  expect(
    r.sessions
      .find((x: any) => x.id === s)
      .events.filter((e: any) => e.name === "submission_confirmed"),
  ).toHaveLength(1);
});
test("expired verification and retention are reflected without fabricated activity", async () => {
  const s = crypto.randomUUID(),
    secret = crypto.randomUUID(),
    d = crypto.randomUUID();
  await asRole("anon", "select public.product_usage_ingest($1,$2,$3,$4,$5,$6::jsonb)", [
    s,
    secret,
    visitor,
    "fr",
    "mobile",
    JSON.stringify([ev("project_started")]),
  ]);
  await db.query(
    "insert into lead.product_usage_bindings(dossier_id,session_id,flow,pending_at,pending_expires_at) values($1,$2,$3,now()-interval '2 days',now()-interval '1 day')",
    [d, s, flow],
  );
  let r = (await asRole("authenticated", "select public.product_usage_report(7) as r", [], admin))
    .rows[0].r;
  expect(
    r.sessions
      .find((x: any) => x.id === s)
      .events.some((e: any) => e.name === "submission_expired"),
  ).toBe(true);
  await db.query(
    "update lead.product_usage_sessions set created_at=now()-interval '91 days' where id=$1",
    [s],
  );
  r = (await asRole("authenticated", "select public.product_usage_report(90) as r", [], admin))
    .rows[0].r;
  expect(r.sessions.some((x: any) => x.id === s)).toBe(false);
  await db.exec(
    "delete from lead.product_usage_sessions where created_at < now() - interval '89 days 23 hours'",
  );
  expect(
    (
      await db.query<any>(
        "select count(*)::int n from lead.product_usage_events where session_id=$1",
        [s],
      )
    ).rows[0].n,
  ).toBe(0);
  expect(
    (
      await db.query<any>(
        "select count(*)::int n from lead.product_usage_bindings where session_id=$1",
        [s],
      )
    ).rows[0].n,
  ).toBe(0);
});
