/**
 * Traduction des CODES stables du serveur en phrases lisibles.
 *
 * Le serveur ne renvoie jamais de texte : il renvoie un code. La phrase est
 * choisie ici et passe par le dictionnaire, donc les huit langues sont
 * couvertes et aucun détail interne n'atteint l'interface.
 */
import type { EnglishReportCode } from "./english-report.pipeline";

export function englishReportMessage(
  code: EnglishReportCode,
  tr: (s: string) => string,
): string {
  switch (code) {
    case "AUTH_REQUIRED":
      return tr("Session expirée : reconnectez-vous pour relancer la version anglaise.");
    case "NOT_ALLOWED":
      return tr("Ce dossier n'est pas accessible avec ce compte.");
    case "DOSSIER_NOT_FOUND":
      return tr("Ce dossier n'existe plus sous cette forme.");
    case "REVISION_NOT_FOUND":
      return tr("Cette version du dossier est introuvable.");
    case "CONTENT_HASH_MISMATCH":
      return tr(
        "Le contenu a changé depuis cette version : la version anglaise suit la version envoyée.",
      );
    case "NDA_NOT_IN_FORCE":
      return tr(
        "L'accord de confidentialité n'est pas en vigueur : aucun texte n'a été transmis.",
      );
    case "AI_CONSENT_MISSING":
      return tr(
        "Votre accord explicite de traduction n'a pas été enregistré pour cette version : aucun texte n'a été transmis.",
      );
    case "AUTHORIZE_FAILED":
      return tr("La vérification des droits n'a pas abouti : rien n'a été transmis.");
    case "RESERVE_FAILED":
      return tr("La version anglaise n'a pas pu être réservée. Réessayez.");
    case "SNAPSHOT_UNREADABLE":
      return tr("Contenu de la version envoyée illisible : rien n'a été traduit.");
    case "TRANSLATION_FAILED":
      return tr("Version anglaise non produite. Vous pouvez relancer.");
    case "SAVE_FAILED":
      return tr("La version anglaise n'a pas pu être enregistrée. Réessayez.");
    case "BAD_REQUEST":
      return tr("Demande de version anglaise invalide : rien n'a été transmis.");
    case "NOT_CONFIGURED":
    default:
      return tr(
        "La production de la version anglaise n'est pas configurée sur le serveur : rien n'a été transmis.",
      );
  }
}
