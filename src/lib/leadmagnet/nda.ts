/** NDA : un seul modèle approuvé par le propriétaire, conservé à l'identique.
 * Générer un document n'est jamais une signature ; une case cochée n'est pas une preuve.
 */
import {
  EMPTY_NDA_VALUES,
  NDA_TEMPLATE_FILE_NAME,
  NDA_TEMPLATE_SHA256,
  NDA_TEMPLATE_URL,
  VARIABLE_FIELDS,
  type NdaVariableValues,
} from "./nda-docx";

export const APPROVED_NDA_TEMPLATE = {
  fileName: NDA_TEMPLATE_FILE_NAME,
  sha256: NDA_TEMPLATE_SHA256,
  /** Binaire original livré avec l'application, lu localement. */
  repoPath: "public/legal/nda-standex-k-motor-16062026.docx",
  url: NDA_TEMPLATE_URL,
} as const;

/** Seuls champs variables autorisés : rien d'autre n'est modifié dans le modèle. */
export type NdaVariableFields = NdaVariableValues;

export const EMPTY_NDA_FIELDS: NdaVariableFields = EMPTY_NDA_VALUES;

/** Libellés des champs variables, dans l'ordre du document. */
export const NDA_FIELD_LABELS = VARIABLE_FIELDS.map((f) => [f.key, f.label] as const);

export type NdaStatus =
  "not_required" | "requested" | "prepared" | "awaiting_signatures" | "in_force";

export interface NdaProof {
  /** Preuve vérifiée côté serveur : identifiant de document signé et empreinte. */
  documentSha256: string;
  verifiedAt: string;
  verifiedBy: string;
}

export interface NdaState {
  required: boolean;
  status: NdaStatus;
  fields: NdaVariableFields;
  templateAvailable: boolean;
  proof: NdaProof | null;
}

/** Le NDA est OPTIONNEL : un nouveau dossier démarre sans accord de confidentialité.
 * Le client l'active explicitement s'il en a besoin ; sinon il soumet directement. */
export const INITIAL_NDA: NdaState = {
  required: false,
  status: "not_required",
  fields: EMPTY_NDA_FIELDS,
  templateAvailable: true,
  proof: null,
};

/** Activation explicite : les champs déjà saisis sont conservés, rien n'est signé. */
export function enableNda(state: NdaState): NdaState {
  if (state.required) return state;
  return { ...state, required: true, status: "requested", proof: null };
}

/** Désactivation refusée uniquement en présence d'un engagement RÉEL :
 * une preuve vérifiée, ou un NDA en vigueur. Vérifié côté serveur :
 * `prepare_nda` passe le dossier en `awaiting_signatures` dès la préparation
 * d'un document vide, sans preuve ni envoi en signature — ce statut n'est donc
 * qu'une demande en cours, et le client garde le droit d'y renoncer. */
export function canDisableNda(state: NdaState): boolean {
  if (!state.required) return true;
  if (state.proof) return false;
  return (
    state.status === "requested" ||
    state.status === "prepared" ||
    state.status === "awaiting_signatures"
  );
}

export function disableNda(state: NdaState): NdaState {
  if (!canDisableNda(state)) return state;
  return { ...state, required: false, status: "not_required", proof: null };
}

/** Une demande déjà préparée peut être abandonnée, mais on le dit clairement. */
export function ndaDisableNeedsConfirmation(state: NdaState): boolean {
  return (
    state.required &&
    canDisableNda(state) &&
    (state.status === "prepared" || state.status === "awaiting_signatures")
  );
}

export const NDA_DISABLE_CONFIRMATION =
  "Une demande de NDA est déjà ouverte sur ce dossier. La retirer abandonne cette demande ; le document non signé reste sur votre appareil. Continuer ?";

/** Raison lisible d'un refus de désactivation, à afficher près de la case. */
export function ndaDisableBlockedReason(state: NdaState): string | null {
  if (canDisableNda(state)) return null;
  return "Un accord de confidentialité vérifié est en vigueur sur ce dossier : il ne peut pas être retiré depuis cet écran.";
}

/** Décision de basculement, séparée de l'écran pour être réellement testable.
 * `optimistic` n'est appliqué avant la réponse serveur que lorsqu'il RESTREINT
 * (activation) : un retrait n'est affiché qu'après confirmation du serveur. */
export type NdaTogglePlan =
  | { kind: "blocked"; reason: string }
  | { kind: "offline"; reason: string }
  | { kind: "local"; next: NdaState }
  | { kind: "server"; optimistic: NdaState | null };

export function planNdaToggle(
  state: NdaState,
  next: boolean,
  ctx: { serverDossier: boolean; backendReady: boolean },
): NdaTogglePlan {
  if (!next) {
    const blocked = ndaDisableBlockedReason(state);
    if (blocked) return { kind: "blocked", reason: blocked };
  }
  if (!ctx.serverDossier) return { kind: "local", next: next ? enableNda(state) : disableNda(state) };
  if (!ctx.backendReady)
    return {
      kind: "offline",
      reason:
        "Ce dossier est enregistré chez Standex : connectez-vous pour modifier le choix de NDA. Rien n'a été changé.",
    };
  return { kind: "server", optimistic: next ? enableNda(state) : null };
}


export function missingNdaFields(f: NdaVariableFields): (keyof NdaVariableFields)[] {
  return (Object.keys(f) as (keyof NdaVariableFields)[]).filter((k) => !f[k].trim());
}

export type NdaPreparation =
  | { ok: false; reason: string }
  | { ok: true; status: Extract<NdaStatus, "prepared">; fields: NdaVariableFields };

export function prepareNda(state: NdaState): NdaPreparation {
  if (!state.templateAvailable)
    return {
      ok: false,
      reason: `Le modèle approuvé « ${APPROVED_NDA_TEMPLATE.fileName} » n'est pas présent dans le projet. Aucun autre modèle ni résumé ne peut être généré.`,
    };
  const missing = missingNdaFields(state.fields);
  if (missing.length) return { ok: false, reason: `Champs à compléter : ${missing.join(", ")}.` };
  return { ok: true, status: "prepared", fields: state.fields };
}

/** Un transfert confidentiel n'est autorisé que sur preuve vérifiée d'un NDA en vigueur. */
export function ndaAllowsConfidentialTransfer(state: NdaState): boolean {
  if (!state.required) return true;
  return state.status === "in_force" && state.proof !== null;
}

export function ndaStatusLabel(state: NdaState): string {
  if (!state.required) return "NDA non requis";
  switch (state.status) {
    case "requested":
      return "NDA demandé";
    case "prepared":
      return "NDA préparé (non signé)";
    case "awaiting_signatures":
      return "En attente des signatures";
    case "in_force":
      return state.proof
        ? "NDA en vigueur (preuve vérifiée)"
        : "Statut incohérent : preuve absente";
    default:
      return "NDA demandé";
  }
}

/** Le préremplissage société n'est proposé qu'avec une source réelle, validée par le client. */
export interface CompanyLookupResult {
  legalName: string;
  address: string;
  source: string;
  fetchedAt: string;
}
export type CompanyLookup = (query: string) => Promise<CompanyLookupResult[]>;
export const NO_COMPANY_LOOKUP_CONFIGURED: CompanyLookup = async () => [];
