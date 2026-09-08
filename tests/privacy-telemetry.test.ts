import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import {
  openPrivateErrorScope,
  reportLovableError,
  reportPrivateError,
  isPrivateErrorScopeActive,
  PRIVATE_ERROR_CODES,
} from "../src/lib/lovable-error-reporting";
import { staffIdentityFromClaims, assertServerTrustedIdentity, createOffer } from "../src/lib/leadmagnet/review";
import { UNAVAILABLE_MESSAGE, READY_MESSAGE, LEAD_MIGRATION_FILE } from "../src/lib/leadmagnet/backend";

type Sent = { message: string; stack?: string; context?: Record<string, unknown> };
let sent: Sent[] = [];

beforeEach(() => {
  sent = [];
  (globalThis as unknown as { window: unknown }).window = {
    location: { pathname: "/design" },
    __lovableEvents: {
      captureException: (e: unknown, context?: Record<string, unknown>) =>
        sent.push({ message: (e as Error).message, ...(context ? { context } : {}) }),
    },
    __lovableReportRuntimeError: (p: { message: string; stack?: string }) => sent.push(p),
  };
});
afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
});

describe("télémétrie et confidentialité", () => {
  const secret = "geometrie client: bac mobile 42x18 chez K Motors";

  it("hors portée privée, l'erreur est transmise telle quelle", () => {
    reportLovableError(new Error(secret));
    expect(sent.some((s) => s.message.includes("K Motors"))).toBe(true);
  });

  it("en portée privée, ni message, ni pile, ni contexte privé ne sortent", () => {
    const close = openPrivateErrorScope();
    expect(isPrivateErrorScopeActive()).toBe(true);
    const err = new Error(secret);
    err.stack = `Error: ${secret}\n  at parseGlb`;
    reportLovableError(err, { glbName: "machine-client.glb", dossier: secret });
    const blob = JSON.stringify(sent);
    expect(blob).not.toContain("K Motors");
    expect(blob).not.toContain("machine-client.glb");
    expect(blob).not.toContain("parseGlb");
    expect(sent.every((s) => s.message === PRIVATE_ERROR_CODES.design_workspace)).toBe(true);
    close();
    expect(isPrivateErrorScopeActive()).toBe(false);
  });

  it("les portées imbriquées ne se referment qu'une fois toutes closes", () => {
    const a = openPrivateErrorScope();
    const b = openPrivateErrorScope();
    a();
    expect(isPrivateErrorScopeActive()).toBe(true);
    b();
    expect(isPrivateErrorScopeActive()).toBe(false);
  });

  it("le signalement privé n'émet qu'un code fixe", () => {
    reportPrivateError(PRIVATE_ERROR_CODES.design_model);
    expect(sent.every((s) => s.message === "design_model_error" && !s.stack)).toBe(true);
  });
});

describe("rôles Standex fiables côté serveur", () => {
  it("accepte uniquement app_metadata signé par le serveur", () => {
    expect(staffIdentityFromClaims({ sub: "u1", app_metadata: { standex_role: "rnd" } })).toEqual({
      userId: "u1",
      role: "rnd",
    });
  });

  it("ignore un rôle choisi côté navigateur", () => {
    const forged = {
      sub: "u2",
      app_metadata: {},
      user_metadata: { standex_role: "admin" },
      role: "sales",
    };
    expect(staffIdentityFromClaims(forged)).toEqual({ userId: "u2", role: null });
    expect(() => assertServerTrustedIdentity(staffIdentityFromClaims(forged))).toThrow();
  });

  it("un rôle inconnu ou absent ne donne aucun droit commercial", () => {
    const identity = staffIdentityFromClaims({ sub: "u3", app_metadata: { standex_role: "boss" } })!;
    const attempt = createOffer(
      {
        id: "o1",
        dossierId: "d1",
        revision: 1,
        reviewId: "r1",
        authorId: "u3",
        createdAt: new Date().toISOString(),
        currency: "EUR",
        tiers: [{ quantity: 100, unitPrice: 2 }],
        moq: 100,
        nreToolingCost: null,
        incoterm: "EXW",
        leadTimeWeeks: 8,
        validUntil: new Date(Date.now() + 8.64e7).toISOString(),
      },
      {
        id: "r1",
        dossierId: "d1",
        revision: 1,
        authorId: "x",
        createdAt: new Date().toISOString(),
        scope: "s",
        conditions: "c",
        verdict: "validated",
        published: true,
        clientMessage: null,
        internalNotes: null,
        supersededBy: null,
      },
      identity,
    );
    expect(attempt.ok).toBe(false);
  });
});

describe("messages client sans jargon technique", () => {
  it("l'indisponibilité parle d'activation, pas de tables ni de migration", () => {
    for (const forbidden of ["table", "migration", "Supabase", "SQL", "schéma", LEAD_MIGRATION_FILE])
      expect(UNAVAILABLE_MESSAGE.toLowerCase()).not.toContain(forbidden.toLowerCase());
    expect(UNAVAILABLE_MESSAGE).toContain("pas encore activée");
    expect(UNAVAILABLE_MESSAGE).not.toContain("envoyé avec succès");
    expect(READY_MESSAGE).toContain("active");
  });
});
