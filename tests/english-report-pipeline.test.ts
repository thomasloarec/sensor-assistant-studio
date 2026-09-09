import { describe, expect, it } from "bun:test";

import { createDossier, toClientDto } from "../src/lib/leadmagnet/dossier";
import {
  runEnglishReport,
  validRequest,
  type AuthorizeGrant,
  type EnglishReportDeps,
} from "../src/lib/leadmagnet/english-report.pipeline";
import type { Segment } from "../src/lib/leadmagnet/english-translation";

const TOKEN = "a".repeat(40);
const DOSSIER = "11111111-1111-4111-8111-111111111111";
const REVISION = "22222222-2222-4222-8222-222222222222";
const HASH = "b".repeat(64);
const REQ = { accessToken: TOKEN, dossierId: DOSSIER, revisionId: REVISION, contentHash: HASH };

function snapshot() {
  const d = createDossier("2026-09-09T06:00:00Z");
  d.title = "Détection de niveau";
  return toClientDto(d);
}

/** Dépendances entièrement injectées : on COMPTE les appels réellement faits. */
function deps(
  over: Partial<EnglishReportDeps> & { grant?: AuthorizeGrant } = {},
): EnglishReportDeps & { calls: { provider: number; begin: number; finalize: number } } {
  const calls = { provider: 0, begin: 0, finalize: 0 };
  const base: EnglishReportDeps = {
    missingConfig: () => [],
    userFromAccessToken: async () => "user-1",
    authorize: async () => ({
      data: over.grant ?? { allowed: true, revision: 3, snapshot: snapshot() },
      error: null,
    }),
    begin: async () => {
      calls.begin++;
      return { data: { state: "pending" }, error: null };
    },
    provider: () => ({
      producer: "test",
      translate: async (segments: Segment[]) => {
        calls.provider++;
        return { segments: segments.map((s) => ({ id: s.id, en: `EN ${s.text}` })) };
      },
    }),
    finalize: async () => {
      calls.finalize++;
      return { data: { state: "ready" }, error: null };
    },
  };
  return Object.assign(base, over, { calls });
}

describe("validation d'entrée à l'exécution", () => {
  it("refuse jeton, UUID et empreinte non conformes", () => {
    expect(validRequest(null)).toBeNull();
    expect(validRequest({ ...REQ, accessToken: "court" })).toBeNull();
    expect(validRequest({ ...REQ, dossierId: "pas-un-uuid" })).toBeNull();
    expect(validRequest({ ...REQ, revisionId: 42 })).toBeNull();
    expect(validRequest({ ...REQ, contentHash: "zz" })).toBeNull();
    expect(validRequest({ ...REQ, contentHash: HASH.toUpperCase() })?.contentHash).toBe(HASH);
  });
});

describe("aucun appel fournisseur sans autorisation", () => {
  const denials = [
    "AUTH_REQUIRED",
    "NOT_ALLOWED",
    "AI_CONSENT_MISSING",
    "NDA_NOT_IN_FORCE",
    "CONTENT_HASH_MISMATCH",
  ] as const;

  it("refus d'authentification : zéro appel fournisseur", async () => {
    const d = deps({ userFromAccessToken: async () => null });
    const out = await runEnglishReport(d, REQ);
    expect(out).toEqual({ state: "pending", code: "AUTH_REQUIRED", retryable: false });
    expect(d.calls).toEqual({ provider: 0, begin: 0, finalize: 0 });
  });

  for (const reason of denials.slice(1)) {
    it(`refus ${reason} : zéro appel fournisseur`, async () => {
      const d = deps({ grant: { allowed: false, reason } });
      const out = await runEnglishReport(d, REQ);
      expect(out).toEqual({ state: "pending", code: reason, retryable: false });
      expect(d.calls).toEqual({ provider: 0, begin: 0, finalize: 0 });
    });
  }

  it("entrée invalide et configuration absente : zéro appel", async () => {
    const bad = deps();
    expect(await runEnglishReport(bad, { ...REQ, dossierId: "x" })).toEqual({
      state: "pending",
      code: "BAD_REQUEST",
      retryable: false,
    });
    expect(bad.calls.provider).toBe(0);

    const unconf = deps({ missingConfig: () => ["standex_supabase_secret_key"] });
    const out = await runEnglishReport(unconf, REQ);
    expect(out).toEqual({
      state: "unavailable",
      code: "NOT_CONFIGURED",
      missingConfig: ["standex_supabase_secret_key"],
    });
    expect(unconf.calls).toEqual({ provider: 0, begin: 0, finalize: 0 });
  });
});

describe("retry et échecs", () => {
  it("déjà prêt : aucune traduction relancée", async () => {
    const d = deps({ begin: async () => ({ data: { state: "ready" }, error: null }) });
    expect(await runEnglishReport(d, REQ)).toEqual({ state: "ready", producer: null });
    expect(d.calls.provider).toBe(0);
    expect(d.calls.finalize).toBe(0);
  });

  it("panne fournisseur : jamais prêt, relançable", async () => {
    const d = deps({
      provider: () => ({
        producer: "test",
        translate: async () => {
          throw new Error("timeout interne 10.0.0.1");
        },
      }),
    });
    const out = await runEnglishReport(d, REQ);
    expect(out).toEqual({ state: "pending", code: "TRANSLATION_FAILED", retryable: true });
    expect(JSON.stringify(out)).not.toContain("10.0.0.1");
    expect(d.calls.finalize).toBe(0);
  });

  it("sortie fournisseur invalide : jamais prêt", async () => {
    const d = deps({
      provider: () => ({ producer: "test", translate: async () => ({ text: "voilà" }) }),
    });
    const out = await runEnglishReport(d, REQ);
    expect(out).toEqual({ state: "pending", code: "TRANSLATION_FAILED", retryable: true });
    expect(d.calls.finalize).toBe(0);
  });

  it("finalisation non `ready` ou en erreur : jamais annoncé prêt", async () => {
    const notReady = deps({ finalize: async () => ({ data: { state: "pending" }, error: null }) });
    expect(await runEnglishReport(notReady, REQ)).toEqual({
      state: "pending",
      code: "SAVE_FAILED",
      retryable: true,
    });

    const failed = deps({ finalize: async () => ({ data: null, error: new Error("db") }) });
    expect((await runEnglishReport(failed, REQ)).state).toBe("pending");
  });

  it("snapshot illisible : rien n'est traduit", async () => {
    const d = deps({ grant: { allowed: true, revision: 1, snapshot: "texte" } });
    const out = await runEnglishReport(d, REQ);
    expect(out).toEqual({ state: "pending", code: "SNAPSHOT_UNREADABLE", retryable: false });
    expect(d.calls.provider).toBe(0);
  });

  it("chemin complet autorisé : prêt uniquement après confirmation serveur", async () => {
    const d = deps();
    expect(await runEnglishReport(d, REQ)).toEqual({ state: "ready", producer: "test" });
    expect(d.calls).toEqual({ provider: 1, begin: 1, finalize: 1 });
  });
});
