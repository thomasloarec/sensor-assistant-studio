import { t } from "@/lib/i18n/core";
import { submissionBinding, type SubmissionInput } from "./submission";
import { pruneStaleConsents, type ConsentBinding, type PrivacyState } from "./privacy";

/** Recalcul de la liaison d'accord après CHAQUE changement d'état.
 *
 * Deux causes très différentes consomment les accords donnés :
 *  - le client a modifié le contenu, la cible ou les fichiers : il doit relire ;
 *  - un envoi vient d'être confirmé et le compteur de version est passé au
 *    suivant : rien n'a été modifié, il ne faut donc accuser aucune édition.
 *
 * `committedRevision` porte la révision réellement confirmée par le dernier
 * envoi. Elle vaut la révision serveur COURANTE juste après l'incrément : c'est
 * ce qui distingue une progression normale d'une vraie édition. */
export interface BindingCycleResult {
  binding: ConsentBinding;
  privacy: PrivacyState;
  /** Message à afficher, déjà traduit, ou null si aucun accord n'a été consommé. */
  consentNotice: string | null;
  /** La relecture doit-elle être redemandée ? */
  resetAcknowledged: boolean;
  afterCommit: boolean;
}

export async function applyBindingCycle(params: {
  input: SubmissionInput;
  /** Révision serveur courante ; la liaison vise la révision que le serveur créera. */
  serverRevision: number;
  committedRevision: number | null;
  privacy: PrivacyState;
}): Promise<BindingCycleResult> {
  const binding = await submissionBinding({
    ...params.input,
    serverRevision: params.serverRevision + 1,
  });
  const afterCommit = params.committedRevision === params.serverRevision;
  const pruned = pruneStaleConsents(params.privacy, binding);
  const changed = pruned !== params.privacy;
  return {
    binding,
    privacy: pruned,
    afterCommit,
    resetAcknowledged: changed,
    consentNotice: changed ? consentNoticeFor(afterCommit) : null,
  };
}

/** Message affiché quand des accords sont consommés : jamais une accusation
 * d'édition après un envoi confirmé. */
export function consentNoticeFor(afterCommit: boolean): string {
  return t(
    afterCommit
      ? "Votre envoi est confirmé. Pour transmettre de nouvelles modifications, relisez le résumé et confirmez à nouveau votre accord d'envoi."
      : "Le contenu, le dossier visé ou les fichiers ont changé : relisez le résumé et confirmez à nouveau votre accord d'envoi.",
  );
}
