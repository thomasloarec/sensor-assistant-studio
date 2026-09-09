/** Publication d'un retour avec, éventuellement, un message client préparé.
 *
 * Le message est FACULTATIF. Mais s'il est commencé, il doit être complet :
 * publier en abandonnant silencieusement un objet ou un résumé saisi ferait
 * disparaître du contenu écrit par une personne, sans le dire.
 */

export type PublishDecision =
  | { kind: "plain" }
  | { kind: "atomic"; subject: string; summary: string }
  | { kind: "incomplete"; missing: "subject" | "summary" }
  | { kind: "unavailable" };

/**
 * Décide ce que fait le bouton de publication.
 * - les deux champs vides : publication simple, comportement d'origine ;
 * - les deux champs remplis : publication + mise en file, une seule opération ;
 * - un seul rempli : refus explicite, rien n'est publié ;
 * - message complet mais espace de suivi indisponible : refus explicite plutôt
 *   qu'une publication qui perdrait le message.
 */
export function publishDecision(
  subjectRaw: string,
  summaryRaw: string,
  crmAvailable: boolean,
): PublishDecision {
  const subject = subjectRaw.trim();
  const summary = summaryRaw.trim();
  if (!subject && !summary) return { kind: "plain" };
  if (!subject) return { kind: "incomplete", missing: "subject" };
  if (!summary) return { kind: "incomplete", missing: "summary" };
  if (!crmAvailable) return { kind: "unavailable" };
  return { kind: "atomic", subject, summary };
}

export interface NotificationPreview {
  subject: string;
  body: string;
  /** Langue enregistrée du client, jamais celle de l'écran interne. */
  locale: string;
  /** Lien absolu et cliquable vers le projet du client. */
  link: string;
}

/** Aperçu EXACT de ce qui sera mis en attente d'envoi, avant publication. */
export function notificationPreview(input: {
  subject: string;
  summary: string;
  locale: string;
  dossierId: string;
  origin: string;
}): NotificationPreview {
  const link = `${input.origin}/?dossier=${input.dossierId}`;
  return {
    subject: input.subject.trim(),
    body: input.summary.trim(),
    locale: input.locale,
    link,
  };
}
