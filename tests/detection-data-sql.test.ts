/**
 * Recette SQL RÉELLE de la migration 1.9 (annuaire des données de détection).
 *
 * La migration est exécutée dans une base PostgreSQL isolée (PGlite), avec de
 * VRAIS rôles `anon` et `authenticated`, puis appelée en `set role` : c'est le
 * seul moyen de prouver que le chemin d'appel complet est exécutable et que
 * l'écriture reste réservée à l'administrateur réel du serveur.
 *
 * Aucune écriture n'est faite sur le backend Standex : cette base vit en
 * mémoire, le temps du test.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { detectionSavePayload, isSavedRowId } from "@/lib/standex/detection-data/adapter";
import type { DetectionRecord } from "@/lib/standex/detection-data/model";

const MIGRATION = readFileSync("supabase/schema/migration_v1.9_detection_data.sql", "utf8");
const SHAPE_MIGRATION = readFileSync(
  "supabase/schema/migration_v1.10_shape_compatibility.sql",
  "utf8",
);

const ADMIN = "11111111-1111-1111-1111-111111111111";
const STAFF = "22222222-2222-2222-2222-222222222222";

/** Socle minimal reproduisant ce que la migration 1.8 fournit déjà. */
async function bootstrap(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(`
    create schema lead;
    create schema lead_priv;
    create schema auth;
    create role anon;
    create role authenticated;
    grant usage on schema public to anon, authenticated;
    create table auth.users(id uuid primary key, email text);
    insert into auth.users values ('${ADMIN}','admin@standexelectronics.com'),
                                 ('${STAFF}','fae@standexelectronics.com');
    create table lead.schema_migrations(version text primary key);
    create table lead.staff_members(user_id uuid primary key, role text, full_name text, active boolean default true);
    insert into lead.staff_members values ('${ADMIN}','admin','Admin Standex',true),
                                          ('${STAFF}','rnd','FAE Standex',true);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create function lead_priv.current_user_id() returns uuid language sql stable as
      $$ select auth.uid() $$;
    create function lead_priv.role_of(_u uuid) returns text language sql stable
      security definer set search_path = lead, pg_temp as
      $$ select role from lead.staff_members where user_id = _u and active $$;
    create function lead_priv.crm_actor_name(_u uuid) returns text language sql stable
      security definer set search_path = lead, pg_temp as
      $$ select full_name from lead.staff_members where user_id = _u $$;
    create function lead_priv.crm_require_admin() returns uuid language plpgsql stable
      security definer set search_path = lead, lead_priv, pg_temp as $$
      declare u uuid := lead_priv.current_user_id();
      begin
        if u is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
        if lead_priv.role_of(u) is distinct from 'admin' then
          raise exception 'NOT_ALLOWED' using errcode = '42501';
        end if;
        return u;
      end $$;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
  `);
  await db.exec(MIGRATION);
  return db;
}

async function asRole(db: PGlite, role: "anon" | "authenticated", uid: string | null) {
  await db.exec(`reset role; select set_config('test.uid', ${uid ? `'${uid}'` : "''"}, false);`);
  await db.exec(`set role ${role}`);
}

const VALID = {
  sensorFamily: "MK22",
  sensorReference: "MK22-B-X",
  classKind: "sensitivity",
  sensitivityClass: "B",
  contactForm: "1A",
  magnetId: "HF3225-14.95X10X5",
  approachId: "D1",
  datum: "lateral_surface",
  thresholdKind: "typical",
  pullInMm: 12.4,
  dropOutMm: 15.1,
  temperatureC: 23,
  status: "validated",
  sourceType: "engineering_measurement",
  sourceRef: "Essai banc Standex 2026-09-18 / rapport 4417",
  enteredOn: "2026-09-18",
  note: null,
};

const save = (db: PGlite, payload: Record<string, unknown>, expected: number | null) =>
  db.query("select public.lead_detection_save_row($1::jsonb, $2) as r", [
    JSON.stringify(payload),
    expected,
  ]);

describe("migration 1.9 exécutée : chemin d'appel et autorisation réels", () => {
  test("la lecture effective est réellement exécutable par anon et par authenticated", async () => {
    const db = await bootstrap();
    try {
      for (const role of ["anon", "authenticated"] as const) {
        await asRole(db, role, null);
        const r = await db.query<{ r: { rows: unknown[]; dataRevision: string } }>(
          "select public.lead_detection_effective() as r",
        );
        expect(r.rows[0]!.r.rows).toEqual([]);
        expect(r.rows[0]!.r.dataRevision).toBe("0");
        const g = await db.query<{ r: { rows: unknown[] } }>(
          "select public.lead_guide_effective() as r",
        );
        expect(g.rows[0]!.r.rows).toEqual([]);
      }
    } finally {
      await db.close();
    }
  });

  test("anon ne peut ni lire l'annuaire ni écrire", async () => {
    const db = await bootstrap();
    try {
      await asRole(db, "anon", null);
      await expect(db.query("select public.lead_detection_directory()")).rejects.toThrow(
        /permission denied/i,
      );
      await expect(save(db, VALID, null)).rejects.toThrow(/permission denied/i);
      await expect(db.query("select * from lead.detection_rows")).rejects.toThrow(
        /permission denied/i,
      );
    } finally {
      await db.close();
    }
  });

  test("une session sans rôle admin est refusée, l'administrateur passe", async () => {
    const db = await bootstrap();
    try {
      await asRole(db, "authenticated", null);
      await expect(db.query("select public.lead_detection_directory()")).rejects.toThrow(
        "AUTH_REQUIRED",
      );
      await asRole(db, "authenticated", STAFF);
      await expect(db.query("select public.lead_detection_directory()")).rejects.toThrow(
        "NOT_ALLOWED",
      );
      await expect(save(db, VALID, null)).rejects.toThrow("NOT_ALLOWED");
      await asRole(db, "authenticated", ADMIN);
      const dir = await db.query<{ r: { rows: unknown[] } }>(
        "select public.lead_detection_directory() as r",
      );
      expect(dir.rows[0]!.r.rows).toEqual([]);
      const saved = await save(db, VALID, null);
      expect((saved.rows[0] as { r: { rowVersion: number } }).r.rowVersion).toBe(1);
    } finally {
      await db.close();
    }
  });

  test("le serveur refuse les identifiants hors catalogue, démonstration et sur mesure comprises", async () => {
    const db = await bootstrap();
    try {
      await asRole(db, "authenticated", ADMIN);
      for (const family of ["NOT_A_SENSOR", "GENERIC", "CUSTOM", "MK07"])
        await expect(save(db, { ...VALID, sensorFamily: family }, null)).rejects.toThrow(
          "DETECTION_UNKNOWN_SENSOR",
        );
      await expect(save(db, { ...VALID, magnetId: "NOT_A_MAGNET" }, null)).rejects.toThrow(
        "DETECTION_UNKNOWN_MAGNET",
      );
      // La famille documentée M21 est acceptée telle qu'imprimée ; ses variantes
      // relèvent du contrôle dédié plus bas (elles ne portent pas de distance).
      const ok = await save(db, { ...VALID, sensorFamily: "MK21", sensorReference: "MK21", magnetId: "M21" }, null);
      expect((ok.rows[0] as { r: { status: string } }).r.status).toBe("validated");
      expect((await db.query("select public.lead_detection_directory()")).rows).toHaveLength(1);
    } finally {
      await db.close();
    }
  });

  test("valeurs et combinaisons invalides refusées côté serveur", async () => {
    const db = await bootstrap();
    try {
      await asRole(db, "authenticated", ADMIN);
      await expect(
        save(db, { ...VALID, pullInMm: 15.1, dropOutMm: 12.4 }, null),
      ).rejects.toThrow("DETECTION_INCOMPLETE");
      await expect(save(db, { ...VALID, dropOutMm: null }, null)).rejects.toThrow(
        "DETECTION_INCOMPLETE",
      );
      await expect(save(db, { ...VALID, pullInMm: -3, dropOutMm: 4 }, null)).rejects.toThrow(
        "DETECTION_BAD_PAYLOAD",
      );
      await expect(save(db, { ...VALID, approachId: "F1" }, null)).rejects.toThrow(
        "DETECTION_BAD_PAYLOAD",
      );
      await expect(save(db, { ...VALID, contactForm: "2A" }, null)).rejects.toThrow(
        "DETECTION_BAD_PAYLOAD",
      );
      await expect(save(db, { ...VALID, sourceRef: "court" }, null)).rejects.toThrow(
        "DETECTION_BAD_PAYLOAD",
      );
      await expect(save(db, { ...VALID, enteredOn: "2099-01-01" }, null)).rejects.toThrow(
        "DETECTION_BAD_PAYLOAD",
      );
      await expect(save(db, { ...VALID, status: "published" }, null)).rejects.toThrow(
        "DETECTION_BAD_STATUS",
      );
      // Un brouillon peut rester incomplet : il n'est jamais servi.
      const draft = await save(
        db,
        { ...VALID, status: "draft", pullInMm: null, dropOutMm: null, approachId: "D3" },
        null,
      );
      expect((draft.rows[0] as { r: { status: string } }).r.status).toBe("draft");
      const eff = await db.query<{ r: { rows: unknown[] } }>(
        "select public.lead_detection_effective() as r",
      );
      expect(eff.rows[0]!.r.rows).toEqual([]);
    } finally {
      await db.close();
    }
  });

  test("une variante lue via une famille documentée est refusée comme clé de distance", async () => {
    const db = await bootstrap();
    try {
      await asRole(db, "authenticated", ADMIN);
      // « M21P/1 » et « M21P/2 » sont imprimées au catalogue, mais la lecture du
      // simulateur canonise « M21 » : une ligne sous la variante serait acceptée
      // puis IGNORÉE. Le serveur la refuse donc, et nomme la famille à saisir.
      for (const magnetId of ["M21P/1", "M21P/2"])
        await expect(
          save(db, { ...VALID, sensorFamily: "MK21", sensorReference: "MK21", magnetId }, null),
        ).rejects.toThrow("DETECTION_ALIAS_MAGNET");
      // La même donnée sous la famille documentée passe et est servie.
      const ok = await save(
        db,
        { ...VALID, sensorFamily: "MK21", sensorReference: "MK21", magnetId: "M21" },
        null,
      );
      expect((ok.rows[0] as { r: { rowVersion: number } }).r.rowVersion).toBe(1);
      const eff = (
        await db.query<{ r: { rows: { magnetId: string }[] } }>(
          "select public.lead_detection_effective() as r",
        )
      ).rows[0]!.r.rows;
      expect(eff.map((r) => r.magnetId)).toEqual(["M21"]);
      // Les PLAGES du guide gardent la variante telle qu'imprimée.
      const guide = await db.query("select public.lead_guide_save_row($1::jsonb, $2) as r", [
        JSON.stringify({
          page: 12,
          sensorFamily: "MK21",
          sensorReference: "MK21",
          magnetId: "M21P/1",
          approachId: "D1",
          upMm: 6.4,
          toMm: 8.2,
          status: "validated",
          sourceRef: "Guide d'activation Standex, page 12",
          enteredOn: "2026-09-18",
        }),
        null,
      ]);
      expect((guide.rows[0] as { r: { rowVersion: number } }).r.rowVersion).toBe(1);
    } finally {
      await db.close();
    }
  });

  test("la clé d'une ligne existante est immuable et ne peut pas en écraser une autre", async () => {
    const db = await bootstrap();
    try {
      await asRole(db, "authenticated", ADMIN);
      const a = (
        await save(db, VALID, null)
      ).rows[0] as { r: { id: string; rowVersion: number } };
      const b = (
        await save(db, { ...VALID, sensitivityClass: "C", pullInMm: 5, dropOutMm: 7 }, null)
      ).rows[0] as { r: { id: string; rowVersion: number } };
      expect(a.r.id).not.toBe(b.r.id);

      // Clé modifiée dans le panneau : la ligne A pointerait sur la ligne B et,
      // les versions coïncidant (1 et 1), l'écraserait. Le serveur refuse.
      await expect(
        save(db, { ...VALID, id: a.r.id, sensitivityClass: "C", pullInMm: 99, dropOutMm: 111 }, 1),
      ).rejects.toThrow("DETECTION_KEY_LOCKED");

      // Aucune des deux lignes n'a bougé.
      const rows = (
        await db.query<{ r: { rows: { sensitivityClass: string; pullInMm: string }[] } }>(
          "select public.lead_detection_effective() as r",
        )
      ).rows[0]!.r.rows;
      expect(
        rows.map((r) => [r.sensitivityClass, Number(r.pullInMm)]).sort(),
      ).toEqual([
        ["B", 12.4],
        ["C", 5],
      ]);

      // Écriture par identifiant stable, à clé inchangée : acceptée et versionnée.
      const up = await save(db, { ...VALID, id: a.r.id, pullInMm: 12.9 }, 1);
      expect((up.rows[0] as { r: { rowVersion: number } }).r.rowVersion).toBe(2);
      // Un identifiant inconnu ne crée rien en douce.
      await expect(
        save(db, { ...VALID, id: "00000000-0000-0000-0000-000000000000" }, 1),
      ).rejects.toThrow("DETECTION_MISSING_ROW");
    } finally {
      await db.close();
    }
  });

  test("concurrence : la version attendue protège des écritures perdues", async () => {
    const db = await bootstrap();
    try {
      await asRole(db, "authenticated", ADMIN);
      await save(db, VALID, null);
      await expect(save(db, VALID, null)).rejects.toThrow("DETECTION_CONFLICT:1");
      await expect(save(db, VALID, 7)).rejects.toThrow("DETECTION_CONFLICT:1");
      const bumped = await save(db, { ...VALID, pullInMm: 11.9 }, 1);
      expect((bumped.rows[0] as { r: { rowVersion: number } }).r.rowVersion).toBe(2);
      const rows = (
        await db.query<{ r: { rows: { pullInMm: string }[] } }>(
          "select public.lead_detection_effective() as r",
        )
      ).rows[0]!.r.rows;
      expect(Number(rows[0]!.pullInMm)).toBe(11.9);
    } finally {
      await db.close();
    }
  });

  test("la révision servie est déterministe et distincte à chaque écriture", async () => {
    const db = await bootstrap();
    try {
      await asRole(db, "authenticated", ADMIN);
      const revision = async () =>
        (
          await db.query<{ r: { dataRevision: string } }>(
            "select public.lead_detection_effective() as r",
          )
        ).rows[0]!.r.dataRevision;
      await save(db, VALID, null);
      const first = await revision();
      await save(db, { ...VALID, approachId: "D3", pullInMm: 8, dropOutMm: 9 }, null);
      const second = await revision();
      await save(db, { ...VALID, pullInMm: 12.1 }, 1);
      const third = await revision();
      expect(new Set([first, second, third]).size).toBe(3);
    } finally {
      await db.close();
    }
  });

  test("le journal conserve l'ancienne et la nouvelle valeur avec l'acteur", async () => {
    const db = await bootstrap();
    try {
      await asRole(db, "authenticated", ADMIN);
      await save(db, VALID, null);
      await save(db, { ...VALID, pullInMm: 12.9 }, 1);
      await db.exec("reset role");
      const audit = await db.query<{
        action: string;
        actor: string;
        old_value: { pull_in_mm: string } | null;
        new_value: { pull_in_mm: string };
      }>("select action, actor, old_value, new_value from lead.detection_audit order by id");
      expect(audit.rows.map((r) => r.action)).toEqual([
        "detection_row_created",
        "detection_row_updated",
      ]);
      expect(audit.rows[1]!.actor).toBe(ADMIN);
      expect(Number(audit.rows[1]!.old_value!.pull_in_mm)).toBe(12.4);
      expect(Number(audit.rows[1]!.new_value.pull_in_mm)).toBe(12.9);
    } finally {
      await db.close();
    }
  });

  test("plages du guide : ordre imprimé inhabituel conservé tel quel, jamais converti", async () => {
    const db = await bootstrap();
    try {
      await asRole(db, "authenticated", ADMIN);
      const atypical = {
        page: 12,
        sensorFamily: "MK04",
        sensorReference: "MK04-1A66A-X",
        magnetId: "SMCO5-5X4",
        approachId: "D1",
        upMm: 10.3,
        toMm: 8.2,
        upNote: null,
        toNote: null,
        status: "validated",
        sourceRef: "Guide d'activation Standex, page 12",
        enteredOn: "2026-09-18",
        note: "ordre imprimé inhabituel",
      };
      const saved = await db.query("select public.lead_guide_save_row($1::jsonb, $2) as r", [
        JSON.stringify(atypical),
        null,
      ]);
      expect((saved.rows[0] as { r: { rowVersion: number } }).r.rowVersion).toBe(1);
      await asRole(db, "anon", null);
      const rows = (
        await db.query<{ r: { rows: { upMm: string; toMm: string }[] } }>(
          "select public.lead_guide_effective() as r",
        )
      ).rows[0]!.r.rows;
      expect(Number(rows[0]!.upMm)).toBe(10.3);
      expect(Number(rows[0]!.toMm)).toBe(8.2);
      // Le guide documente des familles absentes du catalogue : elles restent
      // consultables, mais ne peuvent pas recevoir de distance de commutation.
      await asRole(db, "authenticated", ADMIN);
      const guideOnly = await db.query("select public.lead_guide_save_row($1::jsonb, $2) as r", [
        JSON.stringify({ ...atypical, sensorFamily: "MK07", sensorReference: "MK07-A-X" }),
        null,
      ]);
      expect((guideOnly.rows[0] as { r: { status: string } }).r.status).toBe("validated");
      await expect(
        db.query("select public.lead_guide_save_row($1::jsonb, $2) as r", [
          JSON.stringify({ ...atypical, sensorFamily: "NOT_A_SENSOR" }),
          null,
        ]),
      ).rejects.toThrow("GUIDE_UNKNOWN_SENSOR");
      await expect(
        db.query("select public.lead_guide_save_row($1::jsonb, $2) as r", [
          JSON.stringify({ ...atypical, upMm: null, toMm: null }),
          null,
        ]),
      ).rejects.toThrow("GUIDE_INCOMPLETE");
    } finally {
      await db.close();
    }
  });

  test("la migration s'enregistre en 1.9 et laisse les tables hors d'atteinte du client", async () => {
    const db = await bootstrap();
    try {
      const versions = await db.query<{ version: string }>("select version from lead.schema_migrations");
      expect(versions.rows.map((r) => r.version)).toContain("1.9");
      await asRole(db, "authenticated", ADMIN);
      for (const table of ["detection_rows", "guide_rows", "detection_audit", "detection_state"])
        await expect(db.query(`select * from lead.${table}`)).rejects.toThrow(/permission denied/i);
    } finally {
      await db.close();
    }
  });
});

/**
 * Régression : une ligne COMPILÉE porte un identifiant de clé métier, pas un
 * UUID de base. La charge utile réellement envoyée doit donc valoir création
 * (id null, version attendue null), puis la ligne enregistrée repart avec son
 * UUID stable pour une mise à jour versionnée.
 */
describe("enregistrement d'une ligne compilée puis d'une ligne réellement enregistrée", () => {
  test("compilé -> création, enregistré -> mise à jour par identifiant stable", async () => {
    const db = await bootstrap();
    try {
      const compiled = {
        ...VALID,
        id: "MK22/B/1A/HF3225-14.95X10X5/D1",
      } as unknown as DetectionRecord;
      expect(isSavedRowId(compiled.id)).toBe(false);

      const first = detectionSavePayload(compiled, 4);
      expect(first.p_payload["id"]).toBeNull();
      expect(first.p_expected_version).toBeNull();
      expect(first.p_payload["pullInMm"]).toBe(VALID.pullInMm);
      expect(first.p_payload["sourceRef"]).toBe(VALID.sourceRef);

      await asRole(db, "authenticated", ADMIN);
      const created = await db.query<{ r: { id: string; rowVersion: number } }>(
        "select public.lead_detection_save_row($1::jsonb, $2) as r",
        [JSON.stringify(first.p_payload), first.p_expected_version],
      );
      const saved = created.rows[0]!.r;
      expect(isSavedRowId(saved.id)).toBe(true);
      expect(saved.rowVersion).toBe(1);

      const second = detectionSavePayload(
        { ...compiled, id: saved.id, pullInMm: 12.9 } as DetectionRecord,
        saved.rowVersion,
      );
      expect(second.p_payload["id"]).toBe(saved.id);
      expect(second.p_expected_version).toBe(1);
      const updated = await db.query<{ r: { id: string; rowVersion: number } }>(
        "select public.lead_detection_save_row($1::jsonb, $2) as r",
        [JSON.stringify(second.p_payload), second.p_expected_version],
      );
      expect(updated.rows[0]!.r.id).toBe(saved.id);
      expect(updated.rows[0]!.r.rowVersion).toBe(2);

      const all = await db.query<{ r: { rows: unknown[] } }>(
        "select public.lead_detection_directory() as r",
      );
      expect(all.rows[0]!.r.rows).toHaveLength(1);
    } finally {
      await db.close();
    }
  });
});

describe("migration 1.10 exécutée sur le schéma 1.9 inchangé", () => {
  test("quarantaine, audit, lecture effective et RPC de forme sont atomiques", async () => {
    const db = await bootstrap();
    try {
      await asRole(db, "authenticated", ADMIN);
      const incompatible = {
        ...VALID,
        sensorFamily: "MK03",
        sensorReference: "MK03-1A66B-500W",
        magnetId: "M02",
        pullInMm: 15,
        dropOutMm: 17.5,
        sourceType: "datasheet",
        sourceRef: "datasheet-reed-sensor-series-mk03.pdf p1",
      };
      await save(db, incompatible, null);

      await db.exec("reset role");
      await db.exec(SHAPE_MIGRATION);

      const quarantined = await db.query<{
        status: string;
        pull_in_mm: string;
        drop_out_mm: string;
        source_type: string;
        source_ref: string;
        version: number;
      }>(`select status, pull_in_mm, drop_out_mm, source_type, source_ref, version
            from lead.detection_rows
           where sensor_family = 'MK03' and magnet_id = 'M02'`);
      expect(quarantined.rows).toHaveLength(1);
      expect(quarantined.rows[0]).toMatchObject({
        status: "draft",
        source_type: "datasheet",
        source_ref: "datasheet-reed-sensor-series-mk03.pdf p1",
        version: 2,
      });
      expect(Number(quarantined.rows[0]!.pull_in_mm)).toBe(15);
      expect(Number(quarantined.rows[0]!.drop_out_mm)).toBe(17.5);

      const audit = await db.query<{
        action: string;
        old_value: { status: string; pull_in_mm: string } | null;
        new_value: { status: string; pull_in_mm: string; version: number };
      }>(`select action, old_value, new_value
            from lead.detection_audit
           where row_id = (select id from lead.detection_rows
                            where sensor_family = 'MK03' and magnet_id = 'M02')
           order by id`);
      expect(audit.rows).toHaveLength(2);
      expect(audit.rows.map((row) => row.action)).toEqual([
        "detection_row_created",
        "detection_row_updated",
      ]);
      expect(audit.rows[1]!.old_value?.status).toBe("validated");
      expect(Number(audit.rows[1]!.old_value?.pull_in_mm)).toBe(15);
      expect(audit.rows[1]!.new_value.status).toBe("draft");
      expect(audit.rows[1]!.new_value.version).toBe(2);

      await asRole(db, "anon", null);
      const effective = await db.query<{ r: { version: string; rows: unknown[] } }>(
        "select public.lead_detection_effective() as r",
      );
      expect(effective.rows[0]!.r.version).toBe("1.10");
      expect(effective.rows[0]!.r.rows).toEqual([]);

      await asRole(db, "authenticated", STAFF);
      await expect(
        save(db, { ...VALID, sensorFamily: "MK15", magnetId: "4003004003" }, null),
      ).rejects.toThrow("NOT_ALLOWED");

      await asRole(db, "authenticated", ADMIN);
      for (const payload of [
        { ...VALID, sensorFamily: "MK03", sensorReference: "MK03-1A66B-500W", magnetId: "M02" },
        { ...VALID, sensorFamily: "MK15", sensorReference: "MK15-B-X", magnetId: "4003004003" },
      ])
        await expect(save(db, payload, null)).rejects.toThrow("DETECTION_SHAPE_MISMATCH");

      const tubular = await save(
        db,
        {
          ...VALID,
          sensorFamily: "MK03",
          sensorReference: "MK03-1A66B-500W",
          magnetId: "4003004003",
          approachId: "D3",
        },
        null,
      );
      const block = await save(db, VALID, null);
      expect((tubular.rows[0] as { r: { status: string } }).r.status).toBe("validated");
      expect((block.rows[0] as { r: { status: string } }).r.status).toBe("validated");

      const served = (
        await db.query<{ r: { rows: { sensorFamily: string; magnetId: string }[] } }>(
          "select public.lead_detection_effective() as r",
        )
      ).rows[0]!.r.rows;
      expect(served.map((row) => [row.sensorFamily, row.magnetId]).sort()).toEqual([
        ["MK03", "4003004003"],
        ["MK22", "HF3225-14.95X10X5"],
      ]);

      await db.exec("reset role");
      const versions = await db.query<{ version: string }>(
        "select version from lead.schema_migrations order by version",
      );
      expect(versions.rows.map((row) => row.version)).toEqual(["1.10", "1.9"]);
    } finally {
      await db.close();
    }
  });
});
