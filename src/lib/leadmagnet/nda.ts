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

/** Désactivation possible uniquement tant qu'aucun engagement réel n'existe :
 * un NDA en attente de signatures, en vigueur, ou avec preuve vérifiée reste en place. */
export function canDisableNda(state: NdaState): boolean {
  if (!state.required) return true;
  if (state.proof) return false;
  return state.status === "requested" || state.status === "prepared";
}

export function disableNda(state: NdaState): NdaState {
  if (!canDisableNda(state)) return state;
  return { ...state, required: false, status: "not_required", proof: null };
}

/** Raison lisible d'un refus de désactivation, à afficher près de la case. */
export function ndaDisableBlockedReason(state: NdaState): string | null {
  if (canDisableNda(state)) return null;
  if (state.proof || state.status === "in_force")
    return "Un accord de confidentialité vérifié est en vigueur sur ce dossier : il ne peut pas être retiré depuis cet écran.";
  return "Le document est déjà en attente de signatures : contactez l'équipe Standex pour annuler cette demande.";
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
