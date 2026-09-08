/** Contrat RPC du parcours Lead Magnet.
 *
 * Le schéma `lead` n'est pas exposé à l'API REST : aucune écriture directe depuis
 * le navigateur n'est possible. Toutes les actions passent par les fonctions
 * transactionnelles listées ici (voir supabase/schema/migration_v1.1_lead_magnet.sql).
 * Les noms sont centralisés pour qu'une RPC absente soit détectée, pas devinée.
 */
export const LEAD_RPC = {
  schemaVersion: "lead_schema_version",
  capabilities: "lead_my_capabilities",
  createDossier: "lead_create_dossier",
  submitRevision: "lead_submit_revision",
  publishReview: "lead_publish_review",
  createOffer: "lead_create_offer",
  requestSamples: "lead_request_samples",
  clientView: "lead_client_view",
  staffView: "lead_staff_view",
} as const;

/** Version de schéma minimale attendue par cette version de l'application. */
export const REQUIRED_LEAD_SCHEMA_VERSION = "1.1";

export type LeadRpcName = (typeof LEAD_RPC)[keyof typeof LEAD_RPC];

/** Erreurs métier levées par les RPC, traduites pour l'utilisateur. */
const MESSAGES: { match: RegExp; message: string }[] = [
  { match: /AUTH_REQUIRED/, message: "Connectez-vous pour envoyer votre dossier à Standex." },
  {
    match: /REVISION_CONFLICT/,
    message:
      "Votre dossier a évolué depuis l'ouverture de cet écran. Rechargez-le : la revue et l'offre suivent toujours la dernière version envoyée.",
  },
  {
    match: /NDA_NOT_IN_FORCE/,
    message:
      "Aucun élément confidentiel n'est transmis tant que l'accord de confidentialité n'est pas en vigueur et vérifié par Standex.",
  },
  {
    match: /CONSENT_MISSING/,
    message: "Votre accord explicite d'envoi du dossier est nécessaire avant toute transmission.",
  },
  {
    match: /REVIEW_NOT_VALIDATED/,
    message: "Cette étape n'est possible qu'après un retour Standex validé sur la version en cours.",
  },
  {
    match: /NOT_ALLOWED|permission denied|42501/,
    message: "Cette action est réservée à l'équipe Standex en charge de ce dossier.",
  },
  {
    match: /BAD_TIERS|TIERS_REQUIRED|BAD_VALIDITY|BAD_VERDICT|BAD_HASH|EMPTY_SNAPSHOT/,
    message: "Les informations envoyées sont incomplètes ou incohérentes : rien n'a été enregistré.",
  },
  {
    match: /DOSSIER_NOT_FOUND|REVISION_NOT_FOUND|REVIEW_NOT_FOUND/,
    message: "Ce dossier n'est plus disponible sous cette forme.",
  },
];

/** Jamais de message brut de base de données côté client. */
export function humanRpcError(error: unknown): string {
  const raw =
    typeof error === "string"
      ? error
      : error && typeof error === "object" && "message" in error
        ? String((error as { message: unknown }).message)
        : "";
  const hit = MESSAGES.find((m) => m.match.test(raw));
  if (hit) return hit.message;
  return "L'envoi vers Standex n'a pas abouti. Votre dossier reste intact et exportable.";
}

/** Numéro de révision courant renvoyé par un conflit, pour resynchroniser l'écran. */
export function conflictRevision(error: unknown): number | null {
  const raw = error && typeof error === "object" && "message" in error ? String((error as { message: unknown }).message) : String(error ?? "");
  const m = /REVISION_CONFLICT:(\d+)/.exec(raw);
  return m?.[1] ? Number(m[1]) : null;
}

/** Une RPC absente signifie « migration pas encore appliquée », pas « panne ». */
export function isMissingRpc(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String((error as { code: unknown }).code) : "";
  const msg = "message" in error ? String((error as { message: unknown }).message) : "";
  return code === "PGRST202" || /could not find the function|schema cache/i.test(msg);
}
