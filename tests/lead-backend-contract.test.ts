import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  humanRpcError,
  conflictRevision,
  isMissingRpc,
  LEAD_RPC,
  REQUIRED_LEAD_SCHEMA_VERSION,
} from "../src/lib/leadmagnet/rpc";
import { staffActionEnabled, type LeadBackendStatus } from "../src/lib/leadmagnet/backend";

const SQL = readFileSync("supabase/schema/migration_v1.2_lead_magnet.sql", "utf8");

const status = (over: Partial<LeadBackendStatus>): LeadBackendStatus => ({
  configured: true,
  schemaReady: true,
  authenticated: true,
  role: null,
  ready: true,
  version: "1.1",
  message: "",
  adminDetail: "",
  capabilities: { authenticated: true, userId: "u1", role: null, assignedDossiers: [] },
  ...over,
});

describe("messages d'erreur RPC", () => {
  test("aucun message brut de base de données n'est montré", () => {
    const raw = 'duplicate key value violates unique constraint "design_revisions_pkey"';
    const shown = humanRpcError({ message: raw });
    expect(shown).not.toContain("design_revisions");
    expect(shown).not.toContain("constraint");
    expect(shown).toContain("Votre dossier reste intact");
  });

  test("un conflit de révision est expliqué et resynchronisable", () => {
    const err = { message: "REVISION_CONFLICT:4" };
    expect(humanRpcError(err)).toContain("dernière version envoyée");
    expect(conflictRevision(err)).toBe(4);
  });

  test("NDA absent et consentement manquant ont des messages distincts et non techniques", () => {
    const nda = humanRpcError({ message: "NDA_NOT_IN_FORCE" });
    const consent = humanRpcError({ message: "CONSENT_MISSING" });
    expect(nda).not.toBe(consent);
    for (const m of [nda, consent])
      for (const jargon of ["RLS", "supabase", "rpc", "lead.", "42501"])
        expect(m.toLowerCase()).not.toContain(jargon.toLowerCase());
  });

  test("une RPC absente est reconnue comme migration non appliquée", () => {
    expect(isMissingRpc({ code: "PGRST202", message: "Could not find the function" })).toBe(true);
    expect(isMissingRpc({ code: "23505", message: "duplicate" })).toBe(false);
  });
});

describe("activation des actions", () => {
  test("aucune action Standex sans rôle renvoyé par le serveur", () => {
    expect(staffActionEnabled(status({ role: null }), ["rnd"])).toBe(false);
    expect(staffActionEnabled(null, ["rnd", "sales", "admin"])).toBe(false);
  });

  test("le rôle serveur ouvre uniquement les actions correspondantes", () => {
    expect(staffActionEnabled(status({ role: "sales" }), ["sales", "admin"])).toBe(true);
    expect(staffActionEnabled(status({ role: "sales" }), ["rnd"])).toBe(false);
    // `admin` n'est pas un passe-partout côté interface : il doit figurer dans la liste attendue.
    expect(staffActionEnabled(status({ role: "admin" }), ["rnd", "admin"])).toBe(true);
    expect(staffActionEnabled(status({ role: "admin" }), ["rnd"])).toBe(false);
  });

  test("un rôle serveur sans session ouverte n'active rien", () => {
    expect(staffActionEnabled(status({ role: "rnd", ready: false }), ["rnd"])).toBe(false);
  });
});

describe("migration V1.2 : invariants de sécurité", () => {
  test("elle enregistre la version attendue par l'application", () => {
    expect(SQL).toContain(`insert into lead.schema_migrations (version) values ('${REQUIRED_LEAD_SCHEMA_VERSION}')`);
  });

  test("toutes les RPC du contrat existent dans la migration", () => {
    for (const name of Object.values(LEAD_RPC))
      expect(SQL).toContain(`create or replace function public.${name}`);
  });

  test("le schéma lead n'est jamais ouvert en écriture à authenticated ou anon", () => {
    expect(SQL).not.toMatch(/grant\s+(select|insert|update|delete|all)[^;]*on\s+lead\.[^;]*to[^;]*anon/i);
    expect(SQL).not.toMatch(/grant\s+(insert|update|delete|all)\s+on\s+lead\.[^;]*to\s+authenticated/i);
  });

  test("aucun wrapper public ne permet de s'attribuer un rôle ni de déclarer un NDA signé", () => {
    expect(SQL).not.toContain("create or replace function public.lead_assign_staff");
    expect(SQL).not.toContain("create or replace function public.lead_record_nda_proof");
    expect(SQL).toMatch(
      /revoke all on function lead_priv\.assign_staff\(uuid, lead\.staff_role\) from public, anon, authenticated;/,
    );
    expect(SQL).toMatch(/revoke all on function lead_priv\.record_nda_proof[^;]*from public, anon, authenticated;/);
  });

  test("chaque fonction SECURITY DEFINER fige son search_path", () => {
    const definers = SQL.split("create or replace function").filter((b) =>
      b.includes("security definer"),
    );
    expect(definers.length).toBeGreaterThan(5);
    for (const block of definers) expect(block).toContain("set search_path =");
  });

  test("la soumission verrouille le dossier et compare la révision attendue", () => {
    const block = SQL.slice(SQL.indexOf("function lead_priv.submit_revision"));
    expect(block).toContain("for update");
    expect(block).toContain("REVISION_CONFLICT");
    expect(block).toContain("NDA_NOT_IN_FORCE");
    expect(block).toMatch(/CONSENT_(MISSING|INCOMPLETE)/);
  });

  test("la vue client ne peut pas renvoyer de notes internes", () => {
    const start = SQL.indexOf("function lead_priv.client_view");
    const view = SQL.slice(start, SQL.indexOf("function public.lead_client_view"));
    // La projection commune n'expose les notes qu'en interne, et la vue client
    // les retire explicitement en plus de demander la projection non interne.
    expect(view).toContain("dossier_projection(_dossier, false)");
    expect(view).toContain("- 'internal_notes'");
    const projection = SQL.slice(
      SQL.indexOf("function lead_priv.dossier_projection"),
      SQL.indexOf("function lead_priv.client_view"),
    );
    expect(projection).toContain("case when _internal then");
    expect(projection).toContain("(_internal or rv.published)");
  });

  test("offre et échantillons exigent une revue validée sur la révision courante", () => {
    for (const fn of ["lead_priv.create_offer", "lead_priv.request_samples"]) {
      const block = SQL.slice(SQL.indexOf(`function ${fn}`), SQL.indexOf(`function ${fn}`) + 3000);
      expect(block).toContain("REVIEW_NOT_VALIDATED");
      expect(block).toContain("REVISION_CONFLICT");
    }
  });

  test("le bucket de fichiers reste privé", () => {
    expect(SQL).toContain("values ('lead-design-files', 'lead-design-files', false,");
    expect(SQL).toContain("set public = false");
  });
});
