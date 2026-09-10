import { test, expect } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { createDesignFreeze } from "../src/lib/standex/design-freeze";
import { newStudy } from "../src/lib/standex/studio-dossier";
import { DEFAULT_WORKSHOP } from "../src/lib/standex/magnetic-workshop";
test("T7 server attestation binds the exact revision, authenticated R&D and canonical hash; no historical or forged signature", async () => {
  // Disposable in-memory PostgreSQL only. No network connection, no real dossier or user.
  const db = new PGlite();
  const user = "00000000-0000-0000-0000-000000000001",
    owner = "00000000-0000-0000-0000-000000000002",
    stranger = "00000000-0000-0000-0000-000000000003",
    dossier = "00000000-0000-0000-0000-000000000010",
    revision = "00000000-0000-0000-0000-000000000011";
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth; create schema lead; create schema lead_priv;
      create type lead.staff_role as enum('rnd','sales','admin');
      create table auth.users(id uuid primary key, raw_app_meta_data jsonb, raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.user',true),'')::uuid $$;
      create table lead.staff_members(user_id uuid primary key, role lead.staff_role, display_name text);
      create table lead.design_dossiers(id uuid primary key, current_revision int, owner_id uuid);
      create table lead.dossier_assignments(dossier_id uuid,user_id uuid);
      create table lead.design_revisions(id uuid primary key,dossier_id uuid,revision int,snapshot jsonb);
      create table lead.design_reviews(id uuid primary key,dossier_id uuid,revision_id uuid,revision int,author_id uuid,published boolean,published_at timestamptz,scope text,conditions text,verdict text,superseded_by uuid);
      create function lead_priv.require_user() returns uuid language plpgsql as $$ begin if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if; return auth.uid(); end $$;
      create function lead_priv.staff_can_act(u uuid,d uuid,roles lead.staff_role[]) returns boolean language sql as $$ select exists(select 1 from lead.staff_members m join lead.dossier_assignments a on a.user_id=m.user_id where m.user_id=u and a.dossier_id=d and m.role=any(roles)) $$;
      create function lead_priv.client_can_read(u uuid,d uuid) returns boolean language sql as $$ select exists(select 1 from lead.design_dossiers where id=d and owner_id=u) $$;
      create function lead_priv.staff_can_read_design(u uuid,d uuid) returns boolean language sql as $$ select exists(select 1 from lead.dossier_assignments where user_id=u and dossier_id=d) $$;`);
    const existing = readFileSync("supabase/schema/migration_v1.2_lead_magnet.sql", "utf8");
    const canonical = existing.slice(
      existing.indexOf("create or replace function lead_priv.canonical_json"),
      existing.indexOf("create or replace function lead_priv.snapshot_hash"),
    );
    await db.exec(canonical);
    await db.exec(
      readFileSync("supabase/migrations/20260910090918_studio_v2_freeze_attestation.sql", "utf8"),
    );
    const freeze = await createDesignFreeze({
      dossierId: dossier,
      revision: 1,
      generatedAt: "2026-09-10T09:00:00.000Z",
      author: "",
      config: DEFAULT_WORKSHOP,
      study: newStudy(),
    });
    await db.query(
      "insert into auth.users values ($1, '{}'::jsonb, '{\"standex_role\":\"rnd\"}'::jsonb)",
      [user],
    );
    await db.query("insert into lead.staff_members values ($1, 'rnd', 'Synthetic R&D')", [user]);
    await db.query("insert into lead.design_dossiers values ($1,1,$2)", [dossier, owner]);
    await db.query("insert into lead.dossier_assignments values ($1,$2)", [dossier, user]);
    await db.query("insert into lead.design_revisions values ($1,$2,1,$3)", [
      revision,
      dossier,
      JSON.stringify({ designFreeze: freeze }),
    ]);
    await db.query("select set_config('test.user',$1,false)", [user]);
    let count = 20;
    const publish = async () => {
      const id = "00000000-0000-0000-0000-" + String(++count).padStart(12, "0");
      const result = await db.query<{ freeze_attestation: unknown }>(
        "insert into lead.design_reviews(id,dossier_id,revision_id,revision,author_id,published,published_at,scope,conditions,verdict,freeze_attestation) values ($1,$2,$3,1,$4,true,now(),'test scope','test conditions','more_info','{\"forged\":true}') returning freeze_attestation",
        [id, dossier, revision, user],
      );
      return result.rows[0]!.freeze_attestation;
    };
    expect(await publish()).toBeNull(); // user_metadata cannot confer a role
    await db.query(
      'update auth.users set raw_app_meta_data = \'{"standex_role":"rnd"}\' where id=$1',
      [user],
    );
    const attestation = await publish();
    expect(attestation).toMatchObject({
      role: "rnd",
      freezeHash: freeze.hash,
      authorId: user,
      authorName: "Synthetic R&D",
      revisionId: revision,
    });
    const read = async () =>
      (
        await db.query<{ attestation: unknown }>(
          "select public.lead_freeze_attestation($1,$2,$3) as attestation",
          [dossier, revision, freeze.hash],
        )
      ).rows[0]!.attestation;
    expect(await read()).toEqual(attestation);
    await db.query("select set_config('test.user',$1,false)", [stranger]);
    await expect(read()).rejects.toThrow("NOT_ALLOWED");
    await db.query("select set_config('test.user',$1,false)", [owner]);
    expect(await read()).toEqual(attestation);
    await db.exec("update lead.design_dossiers set current_revision=2");
    expect(await read()).toBeNull();
    await db.exec("update lead.design_dossiers set current_revision=1");
    await db.query("select set_config('test.user',$1,false)", [user]);
    await db.exec(
      "update lead.design_revisions set snapshot=jsonb_set(snapshot,'{designFreeze,hash}',to_jsonb(repeat('0',64)))",
    );
    expect(await publish()).toBeNull();
    expect(await read()).toBeNull();
    await db.query("select set_config('test.user','',false)");
    await expect(read()).rejects.toThrow("AUTH_REQUIRED");
    const access = await db.query<{ anon: boolean; authenticated: boolean }>(
      "select has_function_privilege('anon','public.lead_freeze_attestation(uuid,uuid,text)','EXECUTE') as anon, has_function_privilege('authenticated','public.lead_freeze_attestation(uuid,uuid,text)','EXECUTE') as authenticated",
    );
    expect(access.rows[0]).toEqual({ anon: false, authenticated: true });
  } finally {
    await db.close();
  }
}, 30000);
