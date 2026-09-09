/**
 * Enchaînement de la version anglaise, SANS réseau ni Supabase : toutes les
 * dépendances sont injectées, donc réellement testables.
 *
 * Ordre non contournable :
 *   1. entrée validée à l'exécution (jeton, UUID, empreinte) ;
 *   2. identité réelle vérifiée auprès du service d'authentification ;
 *   3. autorisation calculée EN BASE (droits, révision, empreinte, NDA,
 *      consentement `ai_assistant` exact) ;
 *   4. seulement alors, appel du traducteur ;
 *   5. publication `ready` UNIQUEMENT si le serveur confirme `ready`.
 *
 * Le client ne reçoit que des CODES stables : aucun détail interne, aucun
 * extrait de son texte, aucune trace fournisseur.
 */
import { translateDossier, type TranslationProvider } from "./english-translation";
import type { ClientDossierDto } from "./dossier";

export interface EnglishReportRequest {
  accessToken: string;
  dossierId: string;
  revisionId: string;
  contentHash: string;
}

/** Codes stables, traduits côté interface dans les huit langues. */
export type EnglishReportCode =
  | "BAD_REQUEST"
  | "AUTH_REQUIRED"
  | "NOT_ALLOWED"
  | "DOSSIER_NOT_FOUND"
  | "REVISION_NOT_FOUND"
  | "CONTENT_HASH_MISMATCH"
  | "NDA_NOT_IN_FORCE"
  | "AI_CONSENT_MISSING"
  | "AUTHORIZE_FAILED"
  | "RESERVE_FAILED"
  | "SNAPSHOT_UNREADABLE"
  | "TRANSLATION_FAILED"
  | "SAVE_FAILED"
  | "NOT_CONFIGURED";

export type EnglishReportOutcome =
  | { state: "ready"; producer: string | null }
  | { state: "pending"; code: EnglishReportCode; retryable: boolean }
  | { state: "unavailable"; code: EnglishReportCode; missingConfig: string[] };

export interface AuthorizeGrant {
  allowed?: boolean;
  reason?: string | null;
  revision?: number;
  snapshot?: unknown;
}

export interface EnglishReportDeps {
  missingConfig(): string[];
  /** Identité RÉELLE de l'appelant, ou null. */
  userFromAccessToken(accessToken: string): Promise<string | null>;
  authorize(args: {
    userId: string;
    dossierId: string;
    revisionId: string;
    contentHash: string;
  }): Promise<{ data: AuthorizeGrant | null; error: unknown }>;
  begin(args: {
    dossierId: string;
    revisionId: string;
    contentHash: string;
  }): Promise<{ data: { state?: string } | null; error: unknown }>;
  provider(): TranslationProvider | null;
  finalize(args: {
    dossierId: string;
    revisionId: string;
    contentHash: string;
    body: string;
    producer: string;
    sourceLocale: string | null;
  }): Promise<{ data: { state?: string } | null; error: unknown }>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/;

const DENIAL: Record<string, EnglishReportCode> = {
  NOT_ALLOWED: "NOT_ALLOWED",
  DOSSIER_NOT_FOUND: "DOSSIER_NOT_FOUND",
  REVISION_NOT_FOUND: "REVISION_NOT_FOUND",
  CONTENT_HASH_MISMATCH: "CONTENT_HASH_MISMATCH",
  NDA_NOT_IN_FORCE: "NDA_NOT_IN_FORCE",
  AI_CONSENT_MISSING: "AI_CONSENT_MISSING",
};

/** `inputValidator` de TanStack est une assertion de TYPE : on valide ici, à l'exécution. */
export function validRequest(input: unknown): EnglishReportRequest | null {
  if (!input || typeof input !== "object") return null;
  const r = input as Partial<Record<keyof EnglishReportRequest, unknown>>;
  const token = r.accessToken;
  const dossierId = r.dossierId;
  const revisionId = r.revisionId;
  const contentHash = r.contentHash;
  if (typeof token !== "string" || token.length < 20 || token.length > 4096) return null;
  if (typeof dossierId !== "string" || !UUID.test(dossierId)) return null;
  if (typeof revisionId !== "string" || !UUID.test(revisionId)) return null;
  if (typeof contentHash !== "string") return null;
  const hash = contentHash.trim().toLowerCase();
  if (!SHA256.test(hash)) return null;
  return { accessToken: token, dossierId, revisionId, contentHash: hash };
}

export async function runEnglishReport(
  deps: EnglishReportDeps,
  input: unknown,
): Promise<EnglishReportOutcome> {
  const missing = deps.missingConfig();
  if (missing.length > 0)
    return { state: "unavailable", code: "NOT_CONFIGURED", missingConfig: missing };

  const req = validRequest(input);
  if (!req) return { state: "pending", code: "BAD_REQUEST", retryable: false };

  const userId = await deps.userFromAccessToken(req.accessToken).catch(() => null);
  if (!userId) return { state: "pending", code: "AUTH_REQUIRED", retryable: false };

  const auth = await deps
    .authorize({ userId, dossierId: req.dossierId, revisionId: req.revisionId, contentHash: req.contentHash })
    .catch(() => ({ data: null, error: new Error("authorize") }));
  if (auth.error) return { state: "pending", code: "AUTHORIZE_FAILED", retryable: true };
  const grant = auth.data;
  if (!grant?.allowed)
    return {
      state: "pending",
      code: DENIAL[grant?.reason ?? "NOT_ALLOWED"] ?? "NOT_ALLOWED",
      retryable: false,
    };

  // Réservation idempotente : un retry ne crée pas de seconde ligne.
  const begun = await deps
    .begin({ dossierId: req.dossierId, revisionId: req.revisionId, contentHash: req.contentHash })
    .catch(() => ({ data: null, error: new Error("begin") }));
  if (begun.error) return { state: "pending", code: "RESERVE_FAILED", retryable: true };
  if (begun.data?.state === "ready") return { state: "ready", producer: null };

  const provider = deps.provider();
  if (!provider)
    return { state: "unavailable", code: "NOT_CONFIGURED", missingConfig: ["ANTHROPIC_API_KEY"] };

  const snapshot = grant.snapshot as ClientDossierDto | undefined;
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot))
    return { state: "pending", code: "SNAPSHOT_UNREADABLE", retryable: false };

  let result;
  try {
    result = await translateDossier(snapshot, { revision: Number(grant.revision ?? 0) }, provider);
  } catch {
    return { state: "pending", code: "TRANSLATION_FAILED", retryable: true };
  }
  if (!result.ok) return { state: "pending", code: "TRANSLATION_FAILED", retryable: true };

  const done = await deps
    .finalize({
      dossierId: req.dossierId,
      revisionId: req.revisionId,
      contentHash: req.contentHash,
      body: result.body,
      producer: result.producer,
      sourceLocale:
        typeof (snapshot as { sourceLocale?: unknown }).sourceLocale === "string"
          ? (snapshot as { sourceLocale: string }).sourceLocale
          : null,
    })
    .catch(() => ({ data: null, error: new Error("finalize") }));
  if (done.error) return { state: "pending", code: "SAVE_FAILED", retryable: true };
  // Le succès n'est annoncé QUE si le serveur confirme l'état publié.
  if (done.data?.state !== "ready")
    return { state: "pending", code: "SAVE_FAILED", retryable: true };
  return { state: "ready", producer: result.producer };
}
