/** Adaptateur Supabase réel du parcours Lead Magnet.
 *
 * Backend unique : le projet Supabase existant du client (jamais Lovable Cloud).
 * Chaque action est une RPC transactionnelle : le navigateur n'écrit dans aucune
 * table, ne choisit pas son rôle et ne peut pas déclarer un NDA en vigueur.
 */
import { supabase, isSupabaseConfigured } from "@/lib/standex/supabase";
import {
  LEAD_RPC,
  REQUIRED_LEAD_SCHEMA_VERSION,
  humanRpcError,
  isMissingRpc,
  conflictRevision,
  schemaVersionSatisfies,
} from "./rpc";

import type { StaffRole } from "./review";
import type { SubmissionBackend, SubmissionSnapshot } from "./submission";

export interface LeadSchemaProbe {
  /** Variables Supabase présentes dans cet environnement. */
  configured: boolean;
  /** Espace de conception présent côté serveur (migration appliquée). */
  schemaReady: boolean;
  version: string | null;
  /** Diagnostic réservé au panneau administrateur. */
  adminDetail: string;
}

/** Sonde strictement non destructive : lecture d'un numéro de version, rien d'autre. */
export async function probeLeadSchema(): Promise<LeadSchemaProbe> {
  if (!isSupabaseConfigured || !supabase)
    return {
      configured: false,
      schemaReady: false,
      version: null,
      adminDetail: "Variables Supabase absentes de cet environnement.",
    };
  const { data, error } = await supabase.rpc(LEAD_RPC.schemaVersion);
  if (error)
    return {
      configured: true,
      schemaReady: false,
      version: null,
      adminDetail: isMissingRpc(error)
        ? "RPC lead_schema_version absente : migration_v1.2_lead_magnet.sql non appliquée."
        : `Sonde de version en échec : ${error.message}`,
    };
  const payload = (data ?? {}) as { version?: string | null; ready?: boolean };
  const version = payload.version ?? null;
  // Comparaison réelle de version : un simple booléen serveur ne suffit pas.
  const ready =
    Boolean(payload.ready) && schemaVersionSatisfies(version, REQUIRED_LEAD_SCHEMA_VERSION);
  return {
    configured: true,
    schemaReady: ready,
    version,
    adminDetail: ready
      ? `Schéma lead version ${version} (attendu ≥ ${REQUIRED_LEAD_SCHEMA_VERSION}).`
      : version
        ? `Schéma lead version ${version} < ${REQUIRED_LEAD_SCHEMA_VERSION} : migration à appliquer.`
        : "Registre de migrations vide côté serveur.",
  };
}

export interface LeadCapabilities {
  authenticated: boolean;
  userId: string | null;
  /** Rôle lu en base par le serveur ; jamais fourni ni choisi par le navigateur. */
  role: StaffRole | null;
  assignedDossiers: string[];
}

export const ANONYMOUS_CAPABILITIES: LeadCapabilities = {
  authenticated: false,
  userId: null,
  role: null,
  assignedDossiers: [],
};

export async function fetchLeadCapabilities(): Promise<LeadCapabilities> {
  if (!supabase) return ANONYMOUS_CAPABILITIES;
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) return ANONYMOUS_CAPABILITIES;
  const { data, error } = await supabase.rpc(LEAD_RPC.capabilities);
  if (error || !data) return { ...ANONYMOUS_CAPABILITIES, authenticated: true };
  const payload = data as {
    authenticated?: boolean;
    user_id?: string;
    role?: string | null;
    assigned_dossiers?: unknown;
  };
  const roles: StaffRole[] = ["rnd", "sales", "admin"];
  return {
    authenticated: Boolean(payload.authenticated),
    userId: payload.user_id ?? null,
    role: roles.find((r) => r === payload.role) ?? null,
    assignedDossiers: Array.isArray(payload.assigned_dossiers)
      ? payload.assigned_dossiers.filter((v): v is string => typeof v === "string")
      : [],
  };
}

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error(humanRpcError("not configured"));
  const { data, error } = await supabase.rpc(name, args);
  if (error) {
    const conflict = conflictRevision(error);
    const message = humanRpcError(error);
    throw Object.assign(new Error(message), { currentRevision: conflict });
  }
  return data as T;
}

export async function createDossier(title: string, ndaRequired: boolean): Promise<string> {
  return rpc<string>(LEAD_RPC.createDossier, { p_title: title, p_nda_required: ndaRequired });
}

export interface SubmittedRevision {
  revision_id: string;
  revision: number;
  submitted_at: string;
  content_hash: string;
  /** Le serveur recalcule l'empreinte : ce drapeau signale une divergence locale. */
  client_hash_matches?: boolean;
}

/** Consentement transmis au serveur : contenu, dossier, révision et fichiers liés.
 * Le serveur recalcule l'empreinte du contenu et refuse tout écart : une case
 * cochée sur un autre contenu ne peut plus servir.
 */
function serverConsents(snapshot: SubmissionSnapshot, dossierId: string, revision: number) {
  return snapshot.consents.map((c) => ({
    kind: c.kind,
    statement: c.contentSummary,
    accepted_at: c.grantedAt,
    dossier_id: dossierId,
    revision,
    content_hash: snapshot.hash,
    content_ref: `${dossierId}@r${revision}#${snapshot.hash.slice(0, 16)}`,
    file_digests: snapshot.transferredFiles.map((f) => f.sha256).sort(),
    recipients: c.recipients,
  }));
}

/** Soumission : le serveur refuse tout décalage de révision (compare-and-swap). */
export async function submitRevision(
  dossierId: string,
  expectedRevision: number,
  snapshot: SubmissionSnapshot,
): Promise<SubmittedRevision> {
  return rpc<SubmittedRevision>(LEAD_RPC.submitRevision, {
    p_dossier: dossierId,
    p_expected_revision: expectedRevision,
    p_snapshot: snapshot.dto as unknown as Record<string, unknown>,
    p_content_hash: snapshot.hash,
    p_consents: serverConsents(snapshot, dossierId, expectedRevision + 1),
    // Seuls les fichiers réellement déposés dans une session autorisée sont annoncés.
    p_transferred_files: snapshot.transferredFiles
      .filter((f) => Boolean(f.path))
      .map((f) => ({ path: f.path, file_name: f.fileName, sha256: f.sha256 })),
  });
}


export async function publishReview(input: {
  revisionId: string;
  scope: string;
  conditions: string;
  verdict: "validated" | "variant_proposed" | "more_info";
  clientMessage: string | null;
  internalNote: string | null;
  exactPartNumber: string | null;
  designation: "standard" | "custom" | null;
  /** Proposition structurée : valeurs chiffrées réellement applicables + notes. */
  variant: import("./variant").VariantProposal | null;
}): Promise<string> {
  return rpc<string>(LEAD_RPC.publishReview, {
    p_revision_id: input.revisionId,
    p_scope: input.scope,
    p_conditions: input.conditions,
    p_verdict: input.verdict,
    p_client_message: input.clientMessage,
    p_internal_note: input.internalNote,
    p_exact_part_number: input.exactPartNumber,
    p_designation: input.designation,
    p_variant: input.variant ?? {},
  });
}

export async function addInternalNote(dossierId: string, body: string): Promise<string> {
  return rpc<string>(LEAD_RPC.addInternalNote, { p_dossier: dossierId, p_body: body });
}

export async function acceptVariant(reviewId: string): Promise<{
  review_id: string;
  variant: Record<string, unknown>;
  next_revision: number;
}> {
  return rpc(LEAD_RPC.acceptVariant, { p_review_id: reviewId });
}

export async function createOffer(input: {
  reviewId: string;
  currency: string;
  tiers: { quantity: number; unit_price: number }[];
  moq: number;
  nreToolingCost: number | null;
  incoterm: string;
  leadTimeWeeks: number | null;
  validUntil: string;
}): Promise<string> {
  return rpc<string>(LEAD_RPC.createOffer, {
    p_review_id: input.reviewId,
    p_currency: input.currency,
    p_tiers: input.tiers,
    p_moq: input.moq,
    p_nre: input.nreToolingCost,
    p_incoterm: input.incoterm,
    p_lead_time_weeks: input.leadTimeWeeks,
    p_valid_until: input.validUntil,
  });
}

/** La référence n'est qu'une CONFIRMATION : le serveur impose celle de la revue. */
export async function requestSamples(input: {
  reviewId: string;
  partNumber: string;
  quantity: number;
}): Promise<{
  id: string;
  route: string;
  status: string;
  part_number: string;
  designation: string;
  annual_volume_basis: number | null;
}> {
  return rpc(LEAD_RPC.requestSamples, {
    p_review_id: input.reviewId,
    p_part_number: input.partNumber,
    p_quantity: input.quantity,
  });
}

export async function updateSample(input: {
  sampleId: string;
  status?: string | null;
  feedback?: string | null;
}): Promise<{ id: string; status: string; feedback: string | null }> {
  return rpc(LEAD_RPC.updateSample, {
    p_sample_id: input.sampleId,
    p_status: input.status ?? null,
    p_feedback: input.feedback ?? null,
  });
}

/* ------------------------------------------------------------------ */
/* Vues                                                                */
/* ------------------------------------------------------------------ */

export interface DossierListItem {
  id: string;
  title: string;
  current_revision: number;
  nda_required: boolean;
  nda_status: string;
  updated_at: string;
  role: "owner" | "collaborator";
  published_reviews: number;
  active_offers: number;
}

export interface ReviewView {
  id: string;
  revision: number;
  created_at: string;
  scope: string;
  conditions: string;
  verdict: "validated" | "variant_proposed" | "more_info";
  message: string | null;
  exact_part_number: string | null;
  designation: "standard" | "custom" | null;
  variant: Record<string, unknown>;
  variant_accepted_at: string | null;
  published: boolean;
  superseded: boolean;
}

export interface OfferView {
  id: string;
  revision: number;
  review_id: string;
  currency: string;
  tiers: { quantity: number; unit_price: number }[];
  moq: number;
  nre_tooling_cost: number | null;
  incoterm: string;
  lead_time_weeks: number | null;
  valid_until: string;
  part_number: string;
  designation: string;
  annual_volume_basis: number | null;
  voided: boolean;
  void_reason: string | null;
  expired: boolean;
  active: boolean;
}

export interface SampleView {
  id: string;
  part_number: string;
  designation: string;
  quantity: number;
  route: string;
  status: string;
  annual_volume_basis: number | null;
  revision: number;
  /** Version qui a RÉELLEMENT servi à commander ces échantillons. */
  origin_revision: number | null;
  /** Version quittée lors d'une revalidation, si elle a eu lieu. */
  revalidated_from_revision: number | null;
  feedback: string | null;
  feedback_revision: number | null;
}

export interface RevisionView {
  id: string;
  revision: number;
  content_hash: string;
  submitted_at: string;
  snapshot: Record<string, unknown>;
  consents: unknown[];
  /** Empreinte et type déclarés à la soumission : ils permettent de contrôler
   * qu'un fichier rouvert est bien celui qui a été envoyé. */
  transferred_files: {
    path?: string;
    file_name?: string;
    sha256?: string;
    mime_type?: string;
    bytes?: number;
  }[];

  nda_status_at_submit: string;
}

export interface DossierView {
  dossier: {
    id: string;
    title: string;
    current_revision: number;
    nda_status: string;
    nda_required: boolean;
    updated_at: string;
    owner_id: string | null;
  };
  revisions: RevisionView[];
  reviews: ReviewView[];
  offers: OfferView[];
  samples: SampleView[];
  internal_notes?: { id: string; created_at: string; author_id: string; body: string }[];
  /** Versions anglaises enregistrées (vue équipe, schéma 1.5). Absent tant que
   * la migration additive n'est pas appliquée : aucune valeur n'est supposée. */
  reports_en?: EnglishReportRow[];
}

export async function fetchMyDossiers(): Promise<DossierListItem[]> {
  const data = await rpc<DossierListItem[]>(LEAD_RPC.myDossiers, {});
  return Array.isArray(data) ? data : [];
}

export interface StaffInbox {
  role: StaffRole;
  assigned: {
    id: string;
    title: string;
    current_revision: number;
    nda_status: string;
    updated_at: string;
    awaiting_review: boolean;
  }[];
  triage: {
    id: string;
    title: string;
    current_revision: number;
    nda_required: boolean;
    nda_status: string;
    updated_at: string;
    assignees: string[];
  }[];
  /** Annuaire lisible : jamais un choix par identifiant technique. */
  staff_directory: {
    user_id: string;
    role: StaffRole;
    email: string | null;
    display_name: string | null;
  }[];
}

export async function fetchStaffInbox(): Promise<StaffInbox> {
  return rpc<StaffInbox>(LEAD_RPC.staffInbox, {});
}

export async function assignDossier(dossierId: string, userId: string): Promise<void> {
  await rpc(LEAD_RPC.assignDossier, { p_dossier: dossierId, p_user: userId });
}

export async function fetchClientView(dossierId: string): Promise<DossierView> {
  return rpc<DossierView>(LEAD_RPC.clientView, { p_dossier: dossierId });
}

export async function fetchStaffView(dossierId: string): Promise<DossierView> {
  return rpc<DossierView>(LEAD_RPC.staffView, { p_dossier: dossierId });
}

/* ------------------------------------------------------------------ */
/* Fichiers : session autorisée puis dépôt réel dans le bucket privé    */
/* ------------------------------------------------------------------ */

export interface UploadSession {
  session_id: string;
  bucket: string;
  path_prefix: string;
  expires_at: string;
  expected_sha256?: string;
  expected_revision?: number;
}

/** Consentement de dépôt : daté, lié au dossier, à la révision visée et à
 * l'empreinte EXACTE du fichier relu. Le serveur refuse tout champ manquant.
 */
export interface FileConsent {
  kind: "supabase_files";
  statement: string;
  accepted_at: string;
  content_ref: string;
  dossier_id: string;
  revision: number;
  file_sha256: string;
  file_bytes: number;
  file_mime: string;
  recipients?: string[];
}

export async function openUploadSession(
  dossierId: string,
  kind: "design_model" | "document" | "nda_signed",
  consent: FileConsent | null,
): Promise<UploadSession> {
  return rpc<UploadSession>(LEAD_RPC.openUploadSession, {
    p_dossier: dossierId,
    p_kind: kind,
    p_consent: consent,
  });
}

/** Empreinte des octets RÉELLEMENT envoyés : jamais un champ saisi à la main. */
export async function sha256Hex(data: ArrayBuffer | Uint8Array): Promise<string> {
  const buffer =
    data instanceof Uint8Array
      ? (data.slice().buffer as ArrayBuffer)
      : (data as ArrayBuffer);
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface UploadedFile {
  path: string;
  fileName: string;
  sha256: string;
  bytes: number;
  mimeType: string;
  /** Vrai seulement si le SERVEUR a relu les octets stockés et validé l'empreinte. */
  verified: boolean;
  /** Raison exacte quand la vérification serveur n'a pas eu lieu. */
  verificationError: string | null;
}

/** Relecture serveur des octets réellement stockés.
 * Le navigateur ne peut pas se certifier lui-même : la fonction Edge
 * `lead-verify-upload` lit le fichier sous les droits de l'appelant puis appelle
 * la finalisation réservée au service_role. Sans elle, la soumission refuse le
 * fichier.
 */
export async function verifyUploadedFile(
  sessionId: string,
  path: string,
): Promise<{ verified: boolean; error: string | null }> {
  if (!supabase) return { verified: false, error: humanRpcError("not configured") };
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { verified: false, error: "Session expirée : reconnectez-vous." };
  try {
    const { data: result, error } = await supabase.functions.invoke("lead-verify-upload", {
      body: { session_id: sessionId, path },
    });
    if (error || !(result as { verified_at?: string } | null)?.verified_at) {
      return {
        verified: false,
        error: "Le serveur n'a pas confirmé le contenu du fichier. Réessayez.",
      };
    }
    return { verified: true, error: null };
  } catch (error) {
    return { verified: false, error: error instanceof Error ? error.message : "network error" };
  }
}


/** Dépôt réel : préflight (empreinte + taille + type annoncés), transfert, puis
 * vérification serveur des octets stockés. Les trois étapes sont enchaînées ici
 * pour qu'aucun appelant ne puisse « oublier » la dernière.
 */
export async function uploadDesignFile(
  dossierId: string,
  file: { name: string; data: Blob | ArrayBuffer | Uint8Array; mimeType?: string },
  kind: "design_model" | "document" | "nda_signed" = "design_model",
  consent: Omit<FileConsent, "dossier_id" | "file_sha256" | "file_bytes" | "file_mime">,
): Promise<UploadedFile> {
  if (!supabase) throw new Error(humanRpcError("not configured"));
  const bytes =
    file.data instanceof Blob
      ? new Uint8Array(await file.data.arrayBuffer())
      : file.data instanceof Uint8Array
        ? file.data
        : new Uint8Array(file.data);
  const sha256 = await sha256Hex(bytes);
  const mimeType =
    file.mimeType ??
    (file.name.toLowerCase().endsWith(".glb")
      ? "model/gltf-binary"
      : file.name.toLowerCase().endsWith(".pdf")
        ? "application/pdf"
        : file.name.toLowerCase().endsWith(".docx")
          ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          : "application/octet-stream");
  const session = await openUploadSession(dossierId, kind, {
    ...consent,
    kind: "supabase_files",
    dossier_id: dossierId,
    file_sha256: sha256,
    file_bytes: bytes.byteLength,
    file_mime: mimeType,
  });
  const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, "_");
  const path = `${session.path_prefix}/${safeName}`;
  const { error } = await supabase.storage
    .from(session.bucket)
    .upload(path, new Blob([bytes as unknown as BlobPart], { type: mimeType }), {
      upsert: false,
      contentType: mimeType,
    });
  if (error) throw new Error(humanRpcError(error));
  const check = await verifyUploadedFile(session.session_id, path);
  return {
    path,
    fileName: safeName,
    sha256,
    bytes: bytes.byteLength,
    mimeType,
    verified: check.verified,
    verificationError: check.error,
  };
}


/** Lien de lecture temporaire d'un fichier privé (propriétaire ou staff affecté). */
export async function signedFileUrl(path: string, seconds = 300): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.storage
    .from("lead-design-files")
    .createSignedUrl(path, seconds);
  if (error) throw new Error(humanRpcError(error));
  return data?.signedUrl ?? null;
}

/** Octets réels d'un fichier privé, pour relire un modèle 3D dans l'atelier. */
export async function downloadDesignFile(path: string): Promise<ArrayBuffer> {
  if (!supabase) throw new Error(humanRpcError("not configured"));
  const { data, error } = await supabase.storage.from("lead-design-files").download(path);
  if (error || !data) throw new Error(humanRpcError(error ?? "download failed"));
  return data.arrayBuffer();
}

export interface NdaStatusView {
  dossier_id: string;
  nda_required: boolean;
  nda_status: "not_required" | "requested" | "prepared" | "awaiting_signatures" | "in_force";
  allows_transfer: boolean;
  proof: {
    document_sha256: string;
    verified_at: string;
    proof_reference: string;
    signed_at: string | null;
  } | null;
}

/** Coquille NDA côté serveur : métadonnées seules, aucun contenu technique,
 * aucune signature. Elle permet au client de déposer le document signé et à
 * Standex de voir un dossier en attente de vérification.
 */
export async function prepareNdaOnServer(dossierId: string | null): Promise<NdaStatusView> {
  return rpc<NdaStatusView>(LEAD_RPC.prepareNda, { p_dossier: dossierId });
}

/** Statut NDA faisant autorité : lu au serveur, jamais déduit d'une case cochée. */
export async function fetchNdaStatus(dossierId: string): Promise<NdaStatusView> {
  return rpc<NdaStatusView>(LEAD_RPC.ndaStatus, { p_dossier: dossierId });
}


/** Preuve NDA vérifiée : réservée à un administrateur Standex habilité. */
export async function recordNdaProof(input: {
  dossierId: string;
  templateSha256: string;
  documentSha256: string;
  signedObjectPath: string;
  proofReference: string;
  counterparties: { party: string; signatory?: string }[];
  signedAt: string;
  source: string;
  /** Un fichier réellement déposé, ou une archive externe explicitement déclarée. */
  evidenceKind: "stored_object" | "external_archive";
}): Promise<string> {
  return rpc<string>(LEAD_RPC.recordNdaProof, {
    p_dossier: input.dossierId,
    p_template_sha: input.templateSha256,
    p_document_sha: input.documentSha256,
    p_signed_object_path: input.signedObjectPath,
    p_proof_reference: input.proofReference,
    p_counterparties: input.counterparties,
    p_signed_at: input.signedAt,
    p_source: input.source,
    p_evidence_kind: input.evidenceKind,
  });
}

/** Réactivation d'un échantillon dépassé : acte explicite et tracé, jamais un bouton d'état. */
export async function revalidateSample(
  sampleId: string,
  justification: string,
): Promise<{ id: string; status: string }> {
  return rpc(LEAD_RPC.revalidateSample, {
    p_sample_id: sampleId,
    p_justification: justification,
  });
}

/** Titre lisible : un dossier préparé avant NDA reste volontairement générique. */
export async function setDossierTitle(dossierId: string, title: string): Promise<void> {
  await rpc(LEAD_RPC.setDossierTitle, { p_dossier: dossierId, p_title: title });
}

/** Backend de soumission réel : disponible seulement si migration appliquée ET session ouverte. */
export function createSupabaseSubmissionBackend(options: {
  schemaReady: boolean;
  capabilities: LeadCapabilities;
  /** Dossier serveur déjà créé, sinon il est créé à la première soumission. */
  dossierId: string | null;
  expectedRevision: number;
  /** Le NDA est facultatif : ce choix vient du client, jamais d'une valeur figée. */
  ndaRequired: boolean;
  onDossierCreated?: (id: string) => void;
}): SubmissionBackend {
  const available = options.schemaReady && options.capabilities.authenticated && Boolean(supabase);
  if (!available) return { available: false };
  return {
    available: true,
    submit: async (snapshot) => {
      const dossierId =
        options.dossierId ??
        (await createDossier(snapshot.dto.title ?? "Dossier", options.ndaRequired));
      if (!options.dossierId) options.onDossierCreated?.(dossierId);
      const result = await submitRevision(dossierId, options.expectedRevision, snapshot);
      return { id: result.revision_id, at: result.submitted_at };
    },
  };
}
