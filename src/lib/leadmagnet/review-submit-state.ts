import type { NdaState } from "./nda";

export type ReviewOperation = "validation" | "upload" | "submission" | "variant" | "nda" | null;

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
  if (operation === "validation") return "Vérification du dossier…";
  if (operation === "upload") return "Dépôt et vérification du fichier 3D en cours…";
  if (operation === "submission") return "Transmission à la revue Standex en cours…";
  if (operation === "variant") return "Reprise de la proposition Standex en cours…";
  if (operation === "nda") return "Enregistrement de votre choix de NDA…";
  return null;
}

export type SubmitGuardOutcome = "skipped" | "invalid" | "stale" | "failed" | "done";

/**
 * Verrou synchrone dès l'entrée : le second clic ne franchit jamais la validation.
 * La validation ET l'envoi sont couverts par le même try/catch/finally, donc
 * toute sortie anticipée ou tout rejet libère le verrou et l'état contextuel.
 */
export async function runGuardedSubmit(deps: {
  lock: { current: boolean };
  generation: () => number;
  setOperation: (operation: ReviewOperation) => void;
  validate: () => Promise<{ ok: boolean; problems?: string[] }>;
  onInvalid: (problems: string[]) => void;
  submit: () => Promise<void>;
  onError: (error: unknown) => void;
}): Promise<SubmitGuardOutcome> {
  if (deps.lock.current) return "skipped";
  deps.lock.current = true;
  const gen = deps.generation();
  deps.setOperation("validation");
  try {
    const check = await deps.validate();
    if (deps.generation() !== gen) return "stale";
    if (!check.ok) {
      deps.onInvalid(check.problems ?? []);
      return "invalid";
    }
    deps.setOperation("submission");
    await deps.submit();
    return "done";
  } catch (error) {
    if (deps.generation() === gen) deps.onError(error);
    return "failed";
  } finally {
    deps.lock.current = false;
    deps.setOperation(null);
  }
}