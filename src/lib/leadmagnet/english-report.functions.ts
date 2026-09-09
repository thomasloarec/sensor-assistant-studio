/**
 * Demande de version anglaise d'une révision déjà soumise.
 *
 * Enchaînement, dans cet ordre et sans raccourci possible :
 *   1. jeton porteur vérifié auprès de Supabase Auth (identité réelle) ;
 *   2. autorisation calculée EN BASE : droits sur ce dossier exact, empreinte
 *      de la révision, NDA en vigueur si requis, consentement explicite
 *      `ai_assistant` rattaché au dossier/révision/contenu exacts ;
 *   3. seulement alors, appel du traducteur avec le SNAPSHOT IMMUABLE ;
 *   4. contrôle strict de la sortie, puis publication `ready`.
 *
 * Toute anomalie (droits, consentement, délai, schéma, troncature) laisse
 * l'état à `pending` : le rapport n'est jamais annoncé prêt, l'original
 * français n'est jamais rangé sous une étiquette anglaise, et un nouvel appel
 * reprend proprement sans créer de doublon.
 */
import { createServerFn } from "@tanstack/react-start";

export interface EnglishReportRequest {
  accessToken: string;
  dossierId: string;
  revisionId: string;
  contentHash: string;
}

export type EnglishReportOutcome =
  | { state: "ready"; producer: string | null }
  | { state: "pending"; reason: string; retryable: boolean }
  | { state: "unavailable"; reason: string; missingConfig: string[] };

const DENIALS: Record<string, string> = {
  AUTH_REQUIRED: "Session expirée : reconnectez-vous pour relancer la version anglaise.",
  NOT_ALLOWED: "Ce dossier n'est pas accessible avec ce compte.",
  DOSSIER_NOT_FOUND: "Ce dossier n'existe plus sous cette forme.",
  REVISION_NOT_FOUND: "Cette version du dossier est introuvable.",
  CONTENT_HASH_MISMATCH:
    "Le contenu a changé depuis cette version : la version anglaise suit la version envoyée.",
  NDA_NOT_IN_FORCE:
    "L'accord de confidentialité n'est pas en vigueur : aucun texte n'a été transmis.",
  AI_CONSENT_MISSING:
    "Votre accord explicite de traduction n'a pas été enregistré pour cette version : aucun texte n'a été transmis.",
};

export const requestEnglishReport = createServerFn({ method: "POST" })
  .inputValidator((input: EnglishReportRequest) => input)
  .handler(async ({ data }): Promise<EnglishReportOutcome> => {
    const {
      serviceClient,
      userFromAccessToken,
      anthropicProvider,
      missingServerConfig,
    } = await import("./english-report.server");
    const { translateDossier } = await import("./english-translation");

    const missing = missingServerConfig();
    if (missing.length > 0)
      return {
        state: "unavailable",
        reason:
          "La production de la version anglaise n'est pas configurée sur le serveur : rien n'a été transmis.",
        missingConfig: missing,
      };

    const userId = await userFromAccessToken(data.accessToken);
    if (!userId)
      return { state: "pending", reason: DENIALS["AUTH_REQUIRED"]!, retryable: false };

    const admin = serviceClient();
    if (!admin)
      return {
        state: "unavailable",
        reason: "Accès serveur indisponible : rien n'a été transmis.",
        missingConfig: ["SUPABASE_SERVICE_ROLE_KEY"],
      };

    const hash = data.contentHash.trim().toLowerCase();
    const auth = await admin.rpc("lead_report_en_authorize", {
      p_user: userId,
      p_dossier: data.dossierId,
      p_revision_id: data.revisionId,
      p_content_hash: hash,
    });
    if (auth.error)
      return {
        state: "pending",
        reason: "La vérification des droits n'a pas abouti : rien n'a été transmis.",
        retryable: true,
      };
    const grant = auth.data as {
      allowed?: boolean;
      reason?: string | null;
      revision?: number;
      snapshot?: unknown;
    } | null;
    if (!grant?.allowed) {
      const code = grant?.reason ?? "NOT_ALLOWED";
      return {
        state: "pending",
        reason: DENIALS[code] ?? "Traduction non autorisée : rien n'a été transmis.",
        retryable: false,
      };
    }

    // Réservation idempotente : un retry ne crée pas de seconde ligne.
    const begun = await admin.rpc("lead_report_en_begin", {
      p_dossier: data.dossierId,
      p_revision_id: data.revisionId,
      p_content_hash: hash,
    });
    if (begun.error)
      return {
        state: "pending",
        reason: "La version anglaise n'a pas pu être réservée. Réessayez.",
        retryable: true,
      };
    if ((begun.data as { state?: string } | null)?.state === "ready")
      return { state: "ready", producer: null };

    const provider = anthropicProvider();
    if (!provider)
      return {
        state: "unavailable",
        reason: "Traducteur non configuré côté serveur : rien n'a été transmis.",
        missingConfig: ["ANTHROPIC_API_KEY"],
      };

    const snapshot = grant.snapshot as Parameters<typeof translateDossier>[0] | undefined;
    if (!snapshot || typeof snapshot !== "object")
      return {
        state: "pending",
        reason: "Contenu de la version envoyée illisible : rien n'a été traduit.",
        retryable: false,
      };

    const result = await translateDossier(
      snapshot,
      { revision: Number(grant.revision ?? 0) },
      provider,
    );
    if (!result.ok)
      return {
        state: "pending",
        reason: `Version anglaise non produite : ${result.reason} Vous pouvez relancer.`,
        retryable: true,
      };

    const done = await admin.rpc("lead_report_en_finalize", {
      p_dossier: data.dossierId,
      p_revision_id: data.revisionId,
      p_content_hash: hash,
      p_body: result.body,
      p_origin: "machine_translation",
      p_producer: result.producer,
      p_source_locale:
        typeof (snapshot as { sourceLocale?: unknown }).sourceLocale === "string"
          ? (snapshot as { sourceLocale: string }).sourceLocale
          : null,
    });
    if (done.error)
      return {
        state: "pending",
        reason: "La version anglaise n'a pas pu être enregistrée. Réessayez.",
        retryable: true,
      };
    return { state: "ready", producer: result.producer };
  });
