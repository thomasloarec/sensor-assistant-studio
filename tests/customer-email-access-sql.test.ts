import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { createDossier, dossierHash, toClientDto } from "../src/lib/leadmagnet/dossier";
const A = "10000000-0000-4000-8000-000000000001";
const B = "10000000-0000-4000-8000-000000000002";
const C = "10000000-0000-4000-8000-000000000003";
const receipt = "a".repeat(64);
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage; create schema extensions;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,is_anonymous boolean default false);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table storage.buckets(id text primary key,name text,public boolean default false,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner uuid,owner_id text,metadata jsonb default '{}');
    alter table storage.objects enable row level security;
    grant usage on schema auth,storage to anon,authenticated,service_role;
    grant select,insert,update,delete on storage.objects to authenticated;
    grant execute on function auth.uid() to anon,authenticated,service_role;
  `);
  for (const file of [
    "supabase/schema/migration_v1.2_lead_magnet.sql",
    "supabase/schema/migration_v1.7_optional_nda.sql",
    "supabase/schema/migration_v1.11_business_context_guard.sql",
    "supabase/migrations/20261103140450_customer_email_access.sql",
  ])
    await db.exec(readFileSync(file, "utf8"));
  await db.exec(
    `insert into auth.users values('${A}','a@example.invalid',now(),false),('${B}','b@example.invalid',now(),false),('${C}','c@example.invalid',null,false);`,
  );
}, 30000);
afterAll(async () => {
  await db?.close();
});
async function command(action: string, args: Record<string, unknown>, role = "service_role") {
  await db.exec("set role " + role);
  try {
    return (
      await db.query<{ value: any }>("select public.lead_customer_access($1,$2::jsonb) as value", [
        action,
        JSON.stringify(args),
      ])
    ).rows[0]!.value;
  } finally {
    await db.exec("reset role");
  }
}
async function saved(email = "a@example.invalid", id = crypto.randomUUID(), withFile = false) {
  const d = createDossier();
  d.title = "Synthetic project";
  d.requirements[0]!.value = "Detect a door";
  d.requirements[0]!.state = "confirmed";
  d.business.contactEmail = email;
  d.business.contactName = "Synthetic Customer";
  d.business.siteCity = "Paris";
  d.business.siteCountry = "FR";
  d.business.undefinedFields = [
    "annualVolume",
    "projectPhase",
    "seriesStartDate",
    "seriesDurationYears",
  ];
  if (withFile) {
    const file = {
      path: id + "/pending/model.glb",
      fileName: "model.glb",
      sha256: "b".repeat(64),
      bytes: 100,
      mimeType: "model/gltf-binary",
    };
    await command("reserve_file", { id, email, receipt_hash: receipt, file });
    await db.query("insert into storage.objects(bucket_id,name) values('lead-design-files',$1)", [
      file.path,
    ]);
    await command("file_verified", { id, email, receipt_hash: receipt });
    d.attachments = [
      {
        id: file.path,
        fileName: file.fileName,
        bytes: file.bytes,
        transferred: true,
        storagePath: file.path,
        sha256: file.sha256,
        mimeType: file.mimeType,
      },
    ];
  }
  const snapshot = toClientDto(d);
  const hash = await dossierHash(snapshot);
  const binding = {
    serverDossierId: null,
    revision: 1,
    contentHash: hash,
    fileDigests: withFile ? ["b".repeat(64)] : [],
  };
  const args = {
    id,
    email,
    receipt_hash: receipt,
    snapshot,
    content_hash: hash,
    consents: [
      {
        kind: "supabase_dossier",
        grantedAt: new Date().toISOString(),
        contentSummary: "Send to Standex",
        recipients: ["Standex"],
        binding,
      },
    ],
  };
  await command("save", args);
  return args;
}
describe("private pending submissions and verified ownership", () => {
  test("anonymous and customer roles cannot call the privileged boundary or read pending rows", async () => {
    for (const role of ["anon", "authenticated"]) {
      await expect(command("list", { user_id: A }, role)).rejects.toThrow("permission denied");
      await db.exec("set role " + role);
      try {
        await expect(db.query("select * from lead.customer_pending")).rejects.toThrow(
          "permission denied",
        );
      } finally {
        await db.exec("reset role");
      }
    }
  });
  test("saving creates no commercial dossier or verified event", async () => {
    const p = await saved();
    expect(
      (await db.query("select id from lead.design_dossiers where id=$1", [p.id])).rows,
    ).toHaveLength(0);
    expect(
      (await db.query("select * from lead.customer_verified_events where pending_id=$1", [p.id]))
        .rows,
    ).toHaveLength(0);
    expect((await command("list", { user_id: A })).pending.some((x: any) => x.id === p.id)).toBe(
      true,
    );
    expect((await command("list", { user_id: B })).pending.some((x: any) => x.id === p.id)).toBe(
      false,
    );
  });
  test("different and unverified emails cannot claim or enumerate", async () => {
    const p = await saved();
    await expect(command("claim", { user_id: B, id: p.id })).rejects.toThrow("NOT_ALLOWED");
    const c = await saved("c@example.invalid");
    await expect(command("claim", { user_id: C, id: c.id })).rejects.toThrow(
      "VERIFIED_EMAIL_REQUIRED",
    );
    await expect(command("list", { user_id: C })).rejects.toThrow("VERIFIED_EMAIL_REQUIRED");
  });
  test("claim preserves existing identity, uses the real submission pipeline and is idempotent", async () => {
    const p = await saved();
    const first = await command("claim", { user_id: A, id: p.id });
    expect(first.dossier_id).toBe(p.id);
    expect(first.revision).toBe(1);
    expect(await command("claim", { user_id: A, id: p.id })).toEqual(first);
    const row = (
      await db.query<any>(
        "select owner_id,current_revision from lead.design_dossiers where id=$1",
        [p.id],
      )
    ).rows[0];
    expect(row).toEqual({ owner_id: A, current_revision: 1 });
    expect(
      (await db.query("select * from lead.customer_verified_events where pending_id=$1", [p.id]))
        .rows,
    ).toHaveLength(1);
    expect(
      (await db.query("select * from lead.staff_members where user_id=$1", [A])).rows,
    ).toHaveLength(0);
    expect((await command("list", { user_id: A })).profile.contact_name).toBe("Synthetic Customer");
    expect(
      (await db.query<any>("select current_setting('request.jwt.claim.sub',true) as sub")).rows[0]
        .sub ?? "",
    ).toBe("");
  });
  test("expired entries do not become projects", async () => {
    const p = await saved();
    await db.query(
      "update lead.customer_pending set expires_at=now()-interval '1 second' where id=$1",
      [p.id],
    );
    await expect(command("claim", { user_id: A, id: p.id })).rejects.toThrow("EXPIRED");
  });
  test("retry requires the same receipt and sealed content cannot change", async () => {
    const p = await saved();
    await command("save", p);
    await expect(command("save", { ...p, receipt_hash: "b".repeat(64) })).rejects.toThrow(
      "NOT_ALLOWED",
    );
    const next = { ...p.snapshot, title: "Altered" };
    const hash = await dossierHash(next);
    await expect(
      command("save", {
        ...p,
        snapshot: next,
        content_hash: hash,
        consents: p.consents.map((c) => ({ ...c, binding: { ...c.binding, contentHash: hash } })),
      }),
    ).rejects.toThrow("SEALED_SUBMISSION");
  });
  test("two projects with the same email remain distinct", async () => {
    const p = await saved(),
      q = await saved();
    const one = await command("claim", { user_id: A, id: p.id }),
      two = await command("claim", { user_id: A, id: q.id });
    expect(one.dossier_id).not.toBe(two.dossier_id);
  });
  test("invalid content, missing consent and forged file references fail closed", async () => {
    const p = await saved();
    await expect(
      command("save", { ...p, id: crypto.randomUUID(), content_hash: "0".repeat(64) }),
    ).rejects.toThrow("BAD_SNAPSHOT");
    await expect(command("save", { ...p, id: crypto.randomUUID(), consents: [] })).rejects.toThrow(
      "CONSENT_REQUIRED",
    );
    const dto = {
      ...p.snapshot,
      attachments: [
        { id: "bad", transferred: true, storagePath: "another/project", sha256: "0".repeat(64) },
      ],
    };
    const hash = await dossierHash(dto as any);
    await expect(
      command("save", {
        ...p,
        id: crypto.randomUUID(),
        snapshot: dto,
        content_hash: hash,
        consents: p.consents.map((c) => ({ ...c, binding: { ...c.binding, contentHash: hash } })),
      }),
    ).rejects.toThrow("BAD_FILE");
  });
  test("shared rate limits persist across requests", async () => {
    expect((await command("rate", { key: "test", limit: 1 })).allowed).toBe(true);
    expect((await command("rate", { key: "test", limit: 1 })).allowed).toBe(false);
  });
  test("prepared file is unreadable before claim, then only the verified owner may read it", async () => {
    const p = await saved("a@example.invalid", crypto.randomUUID(), true);
    const path = p.id + "/pending/model.glb";
    const readable = async (user: string) =>
      (
        await db.query<{ ok: boolean }>("select lead_priv.object_readable($1,$2::uuid) as ok", [
          path,
          user,
        ])
      ).rows[0]!.ok;
    expect(await readable(A)).toBe(false);
    expect(await readable(B)).toBe(false);
    const result = await command("claim", { user_id: A, id: p.id });
    expect(result.revision).toBe(1);
    expect(await readable(A)).toBe(true);
    expect(await readable(B)).toBe(false);
    const revision = (
      await db.query<any>("select transferred_files from lead.design_revisions where id=$1", [
        result.revision_id,
      ])
    ).rows[0];
    expect(revision.transferred_files[0].path).toBe(path);
  });
  test("cleanup only selects expired unclaimed entries and preserves claimed projects", async () => {
    const expired = await saved(),
      claimed = await saved();
    await command("claim", { user_id: A, id: claimed.id });
    await db.query(
      "update lead.customer_pending set expires_at=now()-interval '1 second' where id in ($1,$2)",
      [expired.id, claimed.id],
    );
    expect((await command("cleanup_candidates", {})).some((p: any) => p.id === expired.id)).toBe(
      false,
    );
    await db.query(
      "update lead.customer_pending set expires_at=now()-interval '3 hours' where id in ($1,$2)",
      [expired.id, claimed.id],
    );
    const candidates = await command("cleanup_candidates", { reserve: true });
    expect(candidates.some((p: any) => p.id === expired.id)).toBe(true);
    expect(candidates.some((p: any) => p.id === claimed.id)).toBe(false);
    await expect(command("claim", { user_id: A, id: expired.id })).rejects.toThrow("EXPIRED");
    await command("cleanup_delete", { ids: [expired.id, claimed.id] });
    expect(
      (await db.query("select id from lead.customer_pending where id=$1", [claimed.id])).rows,
    ).toHaveLength(1);
    expect(
      (await db.query("select id from lead.customer_pending where id=$1", [expired.id])).rows,
    ).toHaveLength(0);
  });
});
