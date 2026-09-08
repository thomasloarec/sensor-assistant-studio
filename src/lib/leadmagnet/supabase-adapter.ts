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
  const ready = Boolean(payload.ready) && version !== null;
  return {
    configured: true,
    schemaReady: ready,
    version,
    adminDetail: ready
      ? `Schéma lead version ${version} (attendu ≥ ${REQUIRED_LEAD_SCHEMA_VERSION}).`
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

/** Consentement transmis au serveur : contenu identifié, date, portée explicite. */
function serverConsents(snapshot: SubmissionSnapshot) {
  return snapshot.consents.map((c) => ({
    kind: c.kind,
    statement: c.contentSummary,
    accepted_at: c.grantedAt,
    content_ref: `${snapshot.dossierId}@r${snapshot.revision}#${snapshot.hash.slice(0, 16)}`,
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
    p_consents: serverConsents(snapshot),
    // Seuls les fichiers réellement déposés dans une session autorisée sont annoncés.
    p_transferred_files: snapshot.transferredFiles
      .filter((f) => Boolean(f.path))
      .map((f) => ({ path: f.path, file_name: f.fileName })),
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
  variant: { cable?: string; connector?: string; pcb?: string; description?: string } | null;
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
  transferred_files: { path?: string; file_name?: string }[];
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
  staff_directory: { user_id: string; role: StaffRole }[];
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
}

export async function openUploadSession(
  dossierId: string,
  kind: "design_model" | "document" | "nda_signed",
): Promise<UploadSession> {
  return rpc<UploadSession>(LEAD_RPC.openUploadSession, { p_dossier: dossierId, p_kind: kind });
}

/** Dépôt réel du modèle 3D : jamais avant NDA et consentement vérifiés côté serveur. */
export async function uploadDesignFile(
  dossierId: string,
  file: { name: string; data: Blob | ArrayBuffer | Uint8Array },
  kind: "design_model" | "document" | "nda_signed" = "design_model",
): Promise<{ path: string; fileName: string }> {
  if (!supabase) throw new Error(humanRpcError("not configured"));
  const session = await openUploadSession(dossierId, kind);
  const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, "_");
  const path = `${session.path_prefix}/${safeName}`;
  const body =
    file.data instanceof Blob
      ? file.data
      : new Blob([file.data as unknown as BlobPart], { type: "application/octet-stream" });
  const { error } = await supabase.storage.from(session.bucket).upload(path, body, {
    upsert: false,
    contentType: "application/octet-stream",
  });
  if (error) throw new Error(humanRpcError(error));
  return { path, fileName: safeName };
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
  });
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
  const available =
    options.schemaReady && options.capabilities.authenticated && Boolean(supabase);
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
