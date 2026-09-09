import type { NdaState } from "./nda";

export type ReviewOperation = "validation" | "upload" | "submission" | "variant" | null;

/** Diagnostic affichable avant toute tentative. La preuve reste exclusivement serveur. */
export function ndaTransferGuidance(nda: NdaState): string | null {
  if (!nda.required) return null;
  if (nda.status === "requested")
    return "Le NDA est demandé, mais aucune preuve signée n'a encore été vérifiée par Standex. Votre accord d'envoi ne remplace pas cette preuve.";
  if (nda.status === "prepared")
    return "Le NDA est préparé mais non signé. Faites signer le document, puis demandez sa vérification par Standex avant de transmettre le dossier.";
  if (nda.status === "awaiting_signatures")
    return "Le NDA attend encore les signatures ou leur vérification par Standex. Actualisez le statut après confirmation de l'équipe.";
  if (nda.status === "in_force" && !nda.proof)
    return "Le statut indique « en vigueur », mais la preuve vérifiée manque. Actualisez le statut ; aucun transfert n'est autorisé dans cet état incohérent.";
  return null;
}

export function reviewOperationLabel(operation: ReviewOperation): string | null {
  if (operation === "upload") return "Dépôt et vérification du fichier 3D en cours…";
  if (operation === "submission") return "Transmission à la revue Standex en cours…";
  if (operation === "variant") return "Reprise de la proposition Standex en cours…";
  return null;
}