/** Confidentialité : par défaut le projet d'exploration vit en mémoire de l'onglet.
 * Rien n'est écrit sur l'appareil ni transféré sans choix explicite.
 */
import type { StorageMode } from "./dossier";

export type TransferKind = "supabase_dossier" | "attachment_upload" | "ai_assistant";

export interface ConsentRecord {
  kind: TransferKind;
  grantedAt: string;
  /** Résumé montré au client avant l'envoi. */
  contentSummary: string;
  recipients: string[];
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

export function hasConsent(state: PrivacyState, kind: TransferKind): boolean {
  return state.consents.some((c) => c.kind === kind);
}

export function grantConsent(
  state: PrivacyState,
  record: Omit<ConsentRecord, "grantedAt">,
  now = new Date().toISOString(),
): PrivacyState {
  if (hasConsent(state, record.kind)) return state;
  return { ...state, consents: [...state.consents, { ...record, grantedAt: now }] };
}

export function revokeConsent(state: PrivacyState, kind: TransferKind): PrivacyState {
  return { ...state, consents: state.consents.filter((c) => c.kind !== kind) };
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
