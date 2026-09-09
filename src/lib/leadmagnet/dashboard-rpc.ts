/** Contrat RPC de l'espace de travail interne (migration 1.8).
 *
 * Séparé de `rpc.ts` volontairement : le parcours client continue d'exiger la
 * version 1.4 du schéma. Si ces fonctions manquent, l'espace interne s'affiche
 * comme « non activé » et rien d'autre n'est cassé.
 */
export const LEAD_CRM_RPC = {
  capabilities: "lead_crm_capabilities",
  board: "lead_crm_board",
  project: "lead_crm_project",
  setStage: "lead_crm_set_stage",
  setFields: "lead_crm_set_fields",
  setCost: "lead_crm_set_cost",
  setPrice: "lead_crm_set_price",
  setOwners: "lead_crm_set_owners",
  applyTemplate: "lead_crm_apply_template",
  upsertTask: "lead_crm_upsert_task",
  queueNotification: "lead_crm_queue_review_notification",
  publishAndNotify: "lead_crm_publish_review_and_notify",

  adminOverview: "lead_crm_admin_overview",
  adminUpsertPerson: "lead_crm_admin_upsert_person",
  adminLinkPerson: "lead_crm_admin_link_person",
  adminSetStaff: "lead_crm_admin_set_staff",
} as const;

export type LeadCrmRpcName = (typeof LEAD_CRM_RPC)[keyof typeof LEAD_CRM_RPC];

/** Version de la migration attendue par cet espace. Sans elle : « non activé ». */
export const REQUIRED_CRM_VERSION = "1.8";

const MESSAGES: { match: RegExp; message: string }[] = [
  { match: /AUTH_REQUIRED/, message: "Connectez-vous avec votre compte Standex." },
  {
    match: /CRM_CONFLICT/,
    message:
      "Ce projet a été modifié entre-temps. L'écran vient d'être rechargé : vérifiez la valeur avant de réessayer.",
  },
  {
    match: /LAST_ADMIN_PROTECTED/,
    message:
      "Ce compte est le dernier administrateur actif : nommez d'abord un autre administrateur.",
  },
  {
    match: /ACCOUNT_NOT_FOUND/,
    message:
      "Aucun compte Standex n'existe avec cette adresse. La personne doit d'abord se connecter une première fois.",
  },
  {
    match: /ACCOUNT_ALREADY_LINKED/,
    message: "Ce compte est déjà rattaché à une autre personne de l'annuaire.",
  },
  {
    match: /REVIEW_NOT_PUBLISHED/,
    message: "Publiez d'abord le retour au client : rien n'est notifié avant publication.",
  },
  {
    match: /NOTIFICATION_INCOMPLETE/,
    message: "L'objet et le résumé de la notification sont nécessaires.",
  },
  { match: /NA_REASON_REQUIRED/, message: "Indiquez pourquoi cette étape est sans objet." },
  {
    match: /SAP_NOTES_APPEND_ONLY/,
    message: "L'historique SAP ne peut être ni modifié ni supprimé.",
  },
  {
    match: /BAD_PRICE|BAD_COST|BAD_CURRENCY|BAD_COUNTRY|BAD_DATE|BAD_ESTIMATE|BAD_ANNUAL_VOLUME|BAD_STAGE|BAD_TASK|BAD_PERSON|BAD_ROLE|BAD_PATCH/,
    message: "Cette valeur n'est pas exploitable : rien n'a été enregistré.",
  },
  {
    match: /PGRST202|Could not find the function|schema cache/,
    message: "L'espace de travail interne n'est pas encore activé sur ce serveur.",
  },
  {
    match: /NOT_ALLOWED|permission denied|42501/,
    message: "Cette action est réservée à l'équipe Standex en charge de ce projet.",
  },
  {
    match: /DOSSIER_NOT_FOUND|TASK_NOT_FOUND|REVIEW_NOT_FOUND/,
    message: "Cet élément n'existe plus sous cette forme.",
  },
  {
    match: /CURRENCY_LOCKED/,
    message:
      "La devise ne peut pas changer tant qu'un prix, un coût ou une estimation "
      + "sont saisis : aucune conversion n'est faite ici. Effacez d'abord ces montants.",
  },
  {
    match: /VERSION_REQUIRED/,
    message:
      "Cet écran n'était plus synchronisé. Rechargez le projet, puis refaites la modification.",
  },
  {
    match: /BAD_FIELD_TYPE|UNKNOWN_FIELD|BAD_PATCH/,
    message:
      "Cette valeur n'a pas le format attendu : elle a été refusée, et rien n'a été effacé.",
  },
];

/**
 * Jamais de message brut de base de données à l'écran.
 *
 * Le message par défaut ne prétend PAS que rien n'a changé : une coupure réseau
 * peut survenir APRÈS l'enregistrement côté serveur. On dit donc l'état réel :
 * le résultat est inconnu, et l'écran doit être rechargé avant de réessayer.
 */
export function humanCrmError(error: unknown): string {
  const raw =
    typeof error === "string"
      ? error
      : error && typeof error === "object" && "message" in error
        ? String((error as { message: unknown }).message)
        : "";
  return (
    MESSAGES.find((m) => m.match.test(raw))?.message ??
    "La confirmation de Standex n'a pas été reçue : la modification a peut-être été "
      + "enregistrée. Rechargez le projet pour voir l'état réel avant de réessayer."
  );
}

/** Version courante renvoyée par un conflit, pour resynchroniser l'écran. */
export function crmConflictVersion(error: unknown): number | null {
  const raw =
    error && typeof error === "object" && "message" in error
      ? String((error as { message: unknown }).message)
      : String(error ?? "");
  const m = /CRM_CONFLICT:(\d+)/.exec(raw);
  return m?.[1] ? Number(m[1]) : null;
}

/** Une RPC absente signifie « migration 1.8 pas encore appliquée », pas « panne ». */
export function isMissingRpc(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String((error as { code: unknown }).code) : "";
  const msg = "message" in error ? String((error as { message: unknown }).message) : "";
  return code === "PGRST202" || /could not find the function|schema cache/i.test(msg);
}
