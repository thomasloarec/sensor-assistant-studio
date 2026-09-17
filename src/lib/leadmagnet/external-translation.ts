/**
 * Traduction externe DÉSACTIVÉE pour le parcours client.
 *
 * Le code de la version anglaise est conservé (serveur, pipeline, tests) mais il
 * n'est plus atteignable depuis l'espace client : aucun texte du projet ne part
 * vers un service de traduction externe par ce flux. La désactivation n'est pas
 * cosmétique :
 *
 * - la case d'accord et ses détails ne sont plus rendus ;
 * - un accord `ai_assistant` déjà enregistré, restauré ou réintroduit par un
 *   import est RETIRÉ de l'état de confidentialité (`stripDisabledConsents`),
 *   donc aucun garde-fou ne peut le lire comme une autorisation ;
 * - aucun appel automatique n'est déclenché à la soumission ni à la révision.
 *
 * Pour réactiver plus tard : passer `EXTERNAL_TRANSLATION_ENABLED` à `true`.
 * L'envoi normal du projet à Standex et le contenu d'origine ne dépendent pas
 * de ce drapeau.
 */
import type { PrivacyState } from "./privacy";

export const EXTERNAL_TRANSLATION_ENABLED = false;

/** Retire tout accord de traduction externe tant que la fonction est coupée. */
export function stripDisabledConsents(state: PrivacyState): PrivacyState {
  if (EXTERNAL_TRANSLATION_ENABLED) return state;
  if (!state.consents.some((c) => c.kind === "ai_assistant")) return state;
  return { ...state, consents: state.consents.filter((c) => c.kind !== "ai_assistant") };
}

/** Vrai seulement si la traduction externe est active ET l'accord est valable. */
export function externalTranslationAllowed(hasBoundAgreement: boolean): boolean {
  return EXTERNAL_TRANSLATION_ENABLED && hasBoundAgreement;
}
