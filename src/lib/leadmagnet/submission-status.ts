/** Distinction stricte entre le DERNIER ENVOI confirmé par le serveur et le
 * BROUILLON courant ouvert à l'écran.
 *
 * Un message de succès ne décrit jamais le brouillon : il décrit une révision
 * précise, réellement acceptée par le serveur. Dès que le contenu, le dossier
 * visé ou les fichiers changent, ce succès n'est plus celui du brouillon : il
 * devient un historique, et l'écran annonce « Modifications non envoyées ».
 * Aucun hash, aucun consentement et aucun contrôle de révision n'est affaibli
 * pour obtenir ce résultat : c'est uniquement l'affichage qui est corrigé.
 */
import { sameBinding, type ConsentBinding } from "./privacy";

/** Révision RÉELLEMENT transmise et confirmée par le serveur. */
export interface SentRevisionRecord {
  /** Dossier Standex visé au moment de l'envoi (null si créé par cet envoi). */
  dossierId: string | null;
  /** Identifiant serveur de la révision envoyée. */
  revisionId: string;
  /** Numéro de version côté serveur, tel que confirmé. */
  revisionNumber: number;
  /** Horodatage ISO de la confirmation serveur. */
  submittedAt: string;
  /** Contenu, dossier et fichiers exacts couverts par cet envoi. */
  binding: ConsentBinding;
}

export type SubmissionStatusKind = "draft" | "sent" | "modified";

/** `modified` est le repli sûr : sans empreinte courante calculable, on
 * n'affiche jamais un succès qui pourrait décrire autre chose. */
export function submissionStatusKind(
  last: SentRevisionRecord | null,
  current: ConsentBinding | null,
): SubmissionStatusKind {
  if (!last) return "draft";
  if (!current) return "modified";
  return sameBinding(last.binding, current) ? "sent" : "modified";
}

/** Le libellé ne promet « mes modifications » que si la version envoyée est
 * clairement identifiée : sinon le bouton reste neutre. */
export function submitButtonLabel(kind: SubmissionStatusKind, last: SentRevisionRecord | null) {
  return kind === "modified" && last && Number.isFinite(last.revisionNumber)
    ? "Envoyer mes modifications"
    : "Envoyer mon dossier";
}

export function statusHeadline(kind: SubmissionStatusKind): string | null {
  if (kind === "sent") return "Dossier transmis à la revue Standex.";
  if (kind === "modified") return "Modifications non envoyées";
  return null;
}

export function statusDetail(kind: SubmissionStatusKind): string | null {
  if (kind === "sent")
    return "Cette version exacte est arrivée chez Standex. Vous serez informé dès qu'un retour est publié.";
  if (kind === "modified")
    return "Le contenu ouvert ici diffère de la dernière version envoyée. Rien de ces changements n'est encore parti : relisez le résumé, confirmez votre accord, puis envoyez.";
  return null;
}

/** Historique daté, conservé même quand le brouillon a changé. */
export function sentHistory(
  last: SentRevisionRecord | null,
): { revisionNumber: number; date: string } | null {
  if (!last) return null;
  const parsed = new Date(last.submittedAt);
  return {
    revisionNumber: last.revisionNumber,
    date: Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10),
  };
}
