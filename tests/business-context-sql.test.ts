/** Recette PGlite de la migration v1.11 (NON appliquée au backend réel).
 *  On exécute le fichier exact dans un PostgreSQL jetable et on compare au
 *  contrôle client `missingBusinessContext` sur les mêmes snapshots. */
import { beforeAll, describe, expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { createDossier } from "@/lib/leadmagnet/dossier";
import { missingBusinessContext } from "@/lib/leadmagnet/submission";
import { humanRpcError } from "@/lib/leadmagnet/rpc";

const SQL = readFileSync("supabase/schema/migration_v1.11_business_context_guard.sql", "utf8");
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema lead; create schema lead_priv;
    create table lead.schema_migrations(version text primary key);
    create table lead.design_revisions(id serial primary key, snapshot jsonb not null);
    insert into lead.design_revisions(snapshot) values ('{"business":{"projectPhase":"exploration","annualVolume":{"kind":"unknown"}}}');
  `);
  await db.exec(SQL);
});

const ALL = ["annualVolume", "projectPhase", "seriesStartDate", "seriesDurationYears"];
const business = (patch: Record<string, unknown>) => ({
  projectPhase: "unknown", annualVolume: { kind: "unknown" }, seriesStartDate: null,
  seriesDurationYears: null, samplesNeededBy: null, undefinedFields: [], ...patch,
});
const insert = async (b: Record<string, unknown>) => {
  try {
    await db.query("insert into lead.design_revisions(snapshot) values ($1::jsonb)", [JSON.stringify({ business: b })]);
    return "ok";
  } catch (e) {
    return (e as Error).message;
  }
};
const clientMissing = (b: Record<string, unknown>) => {
  const d = createDossier("2026-10-12T00:00:00.000Z");
  d.business = { ...d.business, ...(b as never) };
  return missingBusinessContext(d).length;
};

describe("v1.11 — garde serveur du contexte projet", () => {
  test("la migration n'ajoute ni table ni policy, et se déclare non appliquée", () => {
    expect(SQL).not.toMatch(/create table|create policy|grant select|alter table/i);
    expect(SQL).toContain("NON APPLIQUÉE");
    expect(SQL).toContain("before insert");
  });
  test("une ligne historique existante reste lisible et intacte", async () => {
    const r = await db.query<{ n: number }>("select count(*)::int as n from lead.design_revisions where id = 1");
    expect(r.rows[0]!.n).toBe(1);
  });
  test("tout différé explicitement : accepté", async () =>
    expect(await insert(business({ undefinedFields: ALL }))).toBe("ok"));
  test("toutes valeurs réelles : accepté", async () =>
    expect(await insert(business({ projectPhase: "exploration", annualVolume: { kind: "known", sensorsPerYear: 500 }, seriesStartDate: "2027-03-01", seriesDurationYears: 5 }))).toBe("ok"));
  for (const f of ALL)
    test(`${f} ni renseigné ni différé : refusé et nommé`, async () => {
      const msg = await insert(business({ undefinedFields: ALL.filter((k) => k !== f) }));
      expect(msg).toContain("BUSINESS_CONTEXT_REQUIRED");
      expect(msg).toContain(f);
    });
  const bogus: [string, Record<string, unknown>][] = [
    ["volume 0", { annualVolume: { kind: "known", sensorsPerYear: 0 } }],
    ["volume négatif", { annualVolume: { kind: "known", sensorsPerYear: -3 } }],
    ["volume décimal", { annualVolume: { kind: "known", sensorsPerYear: 2.5 } }],
    ["volume texte", { annualVolume: { kind: "known", sensorsPerYear: "500" } }],
    ["phase inventée", { projectPhase: "launch" }],
    ["phase unknown sans marqueur", { projectPhase: "unknown" }],
    ["date 2026-02-31", { seriesStartDate: "2026-02-31" }],
    ["date libre", { seriesStartDate: "bientôt" }],
    ["durée 0", { seriesDurationYears: 0 }],
    ["durée négative", { seriesDurationYears: -1 }],
    ["durée 1000", { seriesDurationYears: 1000 }],
  ];
  for (const [name, patch] of bogus) {
    const field = Object.keys(patch)[0] === "annualVolume" ? "annualVolume" : Object.keys(patch)[0]!;
    const b = business({ ...patch, undefinedFields: ALL.filter((k) => k !== field) });
    test(`valeur invalide refusée (serveur ET client) : ${name}`, async () => {
      expect(await insert(b)).toContain("BUSINESS_CONTEXT_REQUIRED");
      expect(clientMissing(b)).toBe(1);
    });
  }
  test("date d'échantillons absente : jamais exigée", async () =>
    expect(await insert(business({ undefinedFields: ALL, samplesNeededBy: null }))).toBe("ok"));
  test("un indicateur client « vérifié » n'ouvre rien", async () =>
    expect(await insert(business({ clientCheckPassed: true }))).toContain("BUSINESS_CONTEXT_REQUIRED"));
  test("l'erreur serveur est traduite en message client lisible", () =>
    expect(humanRpcError({ message: "BUSINESS_CONTEXT_REQUIRED:projectPhase" })).toContain("Contexte projet incomplet"));
});
