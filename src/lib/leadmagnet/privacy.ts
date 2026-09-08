/** Confidentialité : par défaut le projet d'exploration vit en mémoire de l'onglet.
 * Rien n'est écrit sur l'appareil ni transféré sans choix explicite.
 */
import type { StorageMode } from "./dossier";

export type TransferKind = "supabase_dossier" | "supabase_files" | "ai_assistant";

/** Ce à quoi un consentement se rattache RÉELLEMENT : sans cela, une case cochée
 * hier autoriserait l'envoi d'un contenu modifié depuis, ou d'un autre dossier.
 */
export interface ConsentBinding {
  /** Identifiant serveur du dossier visé (null tant qu'aucun dossier serveur n'existe). */
  serverDossierId: string | null;
  /** Révision serveur visée par cet envoi. */
  revision: number;
  /** Empreinte exacte du contenu relu. */
  contentHash: string;
  /** Empreintes exactes des fichiers relus, triées. */
  fileDigests: string[];
}

export interface ConsentRecord {
  kind: TransferKind;
  grantedAt: string;
  /** Résumé montré au client avant l'envoi. */
  contentSummary: string;
  recipients: string[];
  binding: ConsentBinding;
}

export interface PrivacyState {
  storage: StorageMode;
  consents: ConsentRecord[];
  /** Aucun service IA sécurisé relié : la qualification reste locale et guidée. */
  remoteAssistantConnected: boolean;
}

export const INITIAL_PRIVACY: PrivacyState = {
  storage: "memory",
  consents: [],
  remoteAssistantConnected: false,
};

export const STORAGE_BADGE: Record<StorageMode, string> = {
  memory: "Sur cet appareil • non partagé",
  "local-device": "Enregistré sur cet appareil • non partagé",
};

export const MEMORY_LOSS_WARNING =
  "Ce projet n'existe que dans cet onglet : fermer ou recharger la page l'efface. Exportez le dossier pour le reprendre plus tard.";

export const LOCAL_ASSISTANT_LABEL =
  "Qualification guidée locale — aucune IA distante n'est reliée. Vos réponses restent dans cet onglet.";

export function sameBinding(a: ConsentBinding | undefined, b: ConsentBinding | undefined): boolean {
  // Un accord sans rattachement (ancienne forme) ne vaut rien : fail-closed.
  if (!a || !b) return false;
  return (
    a.serverDossierId === b.serverDossierId &&
    a.revision === b.revision &&
    a.contentHash === b.contentHash &&
    a.fileDigests.length === b.fileDigests.length &&
    a.fileDigests.every((d, i) => d === b.fileDigests[i])
  );
}

export function hasConsent(state: PrivacyState, kind: TransferKind): boolean {
  return state.consents.some((c) => c.kind === kind);
}

/** Consentement RÉELLEMENT valable : même dossier, même révision, même contenu. */
export function hasBoundConsent(
  state: PrivacyState,
  kind: TransferKind,
  binding: ConsentBinding,
): boolean {
  return state.consents.some((c) => c.kind === kind && sameBinding(c.binding, binding));
}

export function grantConsent(
  state: PrivacyState,
  record: Omit<ConsentRecord, "grantedAt">,
  now = new Date().toISOString(),
): PrivacyState {
  const others = state.consents.filter((c) => c.kind !== record.kind);
  return { ...state, consents: [...others, { ...record, grantedAt: now }] };
}

export function revokeConsent(state: PrivacyState, kind: TransferKind): PrivacyState {
  return { ...state, consents: state.consents.filter((c) => c.kind !== kind) };
}

/** Toute évolution du contenu, du dossier actif ou des fichiers périme la case cochée. */
export function pruneStaleConsents(state: PrivacyState, binding: ConsentBinding): PrivacyState {
  const kept = state.consents.filter((c) => sameBinding(c.binding, binding));
  return kept.length === state.consents.length ? state : { ...state, consents: kept };
}


/** Garde-fou unique appelé avant tout envoi : consentement puis NDA. */
export function canTransfer(
  state: PrivacyState,
  kind: TransferKind,
  ndaAllows: boolean,
): { allowed: boolean; reason: string | null } {
  if (!hasConsent(state, kind))
    return { allowed: false, reason: "Consentement explicite non recueilli pour cet envoi." };
  if (!ndaAllows)
    return {
      allowed: false,
      reason: "Le NDA n'est pas en vigueur : aucun contenu confidentiel n'est transmis.",
    };
  return { allowed: true, reason: null };
}
