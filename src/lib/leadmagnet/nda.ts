/** NDA : un seul modèle approuvé par le propriétaire, conservé à l'identique.
 * Générer un document n'est jamais une signature ; une case cochée n'est pas une preuve.
 */
export const APPROVED_NDA_TEMPLATE = {
  fileName: "NDA Standex x K Motor_16062026.docx",
  sha256: "6e25345f1e83e92630258774d27a451d65d615cdd9f41a5331dae75c4072740b",
  /** Chemin attendu du binaire une fois fourni par le propriétaire. */
  repoPath: "docs/legal/NDA Standex x K Motor_16062026.docx",
} as const;

/** Seuls champs variables autorisés : rien d'autre n'est modifié dans le modèle. */
export interface NdaVariableFields {
  clientLegalName: string;
  clientAddress: string;
  signatoryName: string;
  signatoryRole: string;
  place: string;
  date: string;
}

export const EMPTY_NDA_FIELDS: NdaVariableFields = {
  clientLegalName: "",
  clientAddress: "",
  signatoryName: "",
  signatoryRole: "",
  place: "",
  date: "",
};

export type NdaStatus =
  | "not_required"
  | "requested"
  | "prepared"
  | "awaiting_signatures"
  | "in_force";

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

export const INITIAL_NDA: NdaState = {
  required: true,
  status: "requested",
  fields: EMPTY_NDA_FIELDS,
  templateAvailable: false,
  proof: null,
};

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
  if (missing.length)
    return { ok: false, reason: `Champs à compléter : ${missing.join(", ")}.` };
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
      return state.proof ? "NDA en vigueur (preuve vérifiée)" : "Statut incohérent : preuve absente";
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
