/** Contrat RPC du parcours Lead Magnet.
 *
 * Le schéma `lead` n'est pas exposé à l'API REST : aucune écriture directe depuis
 * le navigateur n'est possible. Toutes les actions passent par les fonctions
 * transactionnelles listées ici (voir supabase/schema/migration_v1.2_lead_magnet.sql).
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
  myDossiers: "lead_my_dossiers",
  staffInbox: "lead_staff_inbox",
  assignDossier: "lead_assign_dossier",
  openUploadSession: "lead_open_upload_session",
  addInternalNote: "lead_add_internal_note",
  acceptVariant: "lead_accept_variant",
  updateSample: "lead_update_sample",
  revalidateSample: "lead_revalidate_sample",
  setDossierTitle: "lead_set_dossier_title",
  recordNdaProof: "lead_admin_record_nda_proof",
} as const;

/** Comparaison de versions « majeur.mineur » : le serveur doit être au moins à la version requise. */
export function schemaVersionSatisfies(actual: string | null, required: string): boolean {
  if (!actual) return false;
  const parse = (v: string) => v.split(".").map((n) => Number.parseInt(n, 10));
  const a = parse(actual);
  const r = parse(required);
  if (a.some((n) => !Number.isFinite(n))) return false;
  for (let i = 0; i < Math.max(a.length, r.length); i += 1) {
    const av = a[i] ?? 0;
    const rv = r[i] ?? 0;
    if (av !== rv) return av > rv;
  }
  return true;
}


/** Version de schéma minimale attendue par cette version de l'application. */
export const REQUIRED_LEAD_SCHEMA_VERSION = "1.2";

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
    match: /BAD_TIERS|CONTRADICTORY_TIERS|TIERS_REQUIRED|BAD_VALIDITY|BAD_VERDICT|BAD_HASH|EMPTY_SNAPSHOT|BAD_CURRENCY|BAD_MOQ|BAD_NRE|BAD_INCOTERM|BAD_QUANTITY|BAD_STATUS/,
    message: "Les informations envoyées sont incomplètes ou incohérentes : rien n'a été enregistré.",
  },
  {
    match: /DOSSIER_NOT_FOUND|REVISION_NOT_FOUND|REVIEW_NOT_FOUND/,
    message: "Ce dossier n'est plus disponible sous cette forme.",
  },
];


const EXTRA_MESSAGES: { match: RegExp; message: string }[] = [
  {
    match: /PART_NUMBER_MISMATCH|EXACT_PART_NUMBER_REQUIRED/,
    message:
      "La référence exacte doit être celle confirmée par la revue Standex : rien n'a été enregistré.",
  },
  {
    match: /FILE_NOT_TRANSFERRED/,
    message: "Un fichier annoncé n'a pas été réellement déposé : l'envoi a été refusé.",
  },
  {
    match: /NDA_TEMPLATE_MISMATCH|NDA_SIGNED_DOCUMENT_INVALID|NDA_PROOF_INCOMPLETE|NDA_COUNTERPARTIES_REQUIRED|NDA_SIGNED_AT_INVALID/,
    message:
      "La preuve d'accord de confidentialité est incomplète ou ne correspond pas au document original : rien n'a été enregistré.",
  },
  { match: /NO_VARIANT_TO_ACCEPT/, message: "Aucune variante à reprendre sur ce retour." },
  { match: /NOT_STAFF/, message: "Cette personne ne fait pas partie de l'équipe Standex." },
  {
    match: /CONSENT_INCOMPLETE/,
    message:
      "Votre accord d'envoi doit être daté et rattaché au dossier concerné : aucun fichier n'a été transmis.",
  },
  {
    match: /NDA_SIGNED_FILE_NOT_FOUND/,
    message:
      "Le document signé annoncé n'a pas été retrouvé dans l'espace sécurisé : rien n'a été enregistré.",
  },
  {
    match: /SAMPLE_SUPERSEDED/,
    message:
      "Cet échantillon correspond à une version dépassée du dossier : une revalidation explicite est nécessaire.",
  },
  {
    match: /BAD_ANNUAL_VOLUME/,
    message:
      "Le volume annuel doit être un nombre entier de capteurs par an, ou déclaré inconnu : rien n'a été enregistré.",
  },
  {
    match: /BAD_SNAPSHOT_SHAPE/,
    message: "Le dossier envoyé est incomplet : complétez l'objectif et le contact, puis réessayez.",
  },
];

MESSAGES.unshift(...EXTRA_MESSAGES);

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
