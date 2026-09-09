/**
 * Point d'entrée serveur de la version anglaise d'une révision déjà soumise.
 *
 * Ce fichier ne contient QUE le câblage des dépendances réelles (Supabase
 * service role, Supabase Auth, Anthropic) : la logique, elle, vit dans
 * `english-report.pipeline.ts` et est testée avec des dépendances injectées.
 *
 * Le navigateur ne reçoit jamais qu'un état et un CODE stable : aucun détail
 * serveur, aucun extrait du texte client, aucune trace fournisseur.
 */
import { createServerFn } from "@tanstack/react-start";

import {
  runEnglishReport,
  type EnglishReportOutcome,
  type EnglishReportRequest,
} from "./english-report.pipeline";

export type { EnglishReportOutcome, EnglishReportRequest, EnglishReportCode } from "./english-report.pipeline";

export const requestEnglishReport = createServerFn({ method: "POST" })
  .inputValidator((input: EnglishReportRequest) => input)
  .handler(async ({ data }): Promise<EnglishReportOutcome> => {
    const {
      serviceClient,
      userFromAccessToken,
      anthropicProvider,
      missingServerConfig,
    } = await import("./english-report.server");

    const admin = serviceClient();
    return runEnglishReport(
      {
        missingConfig: () => (admin ? missingServerConfig() : ["SUPABASE_SERVICE_ROLE_KEY"]),
        userFromAccessToken,
        provider: () => anthropicProvider(),
        authorize: (a) =>
          admin!.rpc("lead_report_en_authorize", {
            p_user: a.userId,
            p_dossier: a.dossierId,
            p_revision_id: a.revisionId,
            p_content_hash: a.contentHash,
          }),
        begin: (a) =>
          admin!.rpc("lead_report_en_begin", {
            p_dossier: a.dossierId,
            p_revision_id: a.revisionId,
            p_content_hash: a.contentHash,
          }),
        finalize: (a) =>
          admin!.rpc("lead_report_en_finalize", {
            p_dossier: a.dossierId,
            p_revision_id: a.revisionId,
            p_content_hash: a.contentHash,
            p_body: a.body,
            p_origin: "machine_translation",
            p_producer: a.producer,
            p_source_locale: a.sourceLocale,
          }),
      },
      data,
    );
  });
