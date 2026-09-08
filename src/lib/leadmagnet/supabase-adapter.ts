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
        ? "RPC lead_schema_version absente : migration_v1.1_lead_magnet.sql non appliquée."
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
    p_consents: snapshot.consents,
    p_transferred_files: snapshot.transferredFiles,
  });
}

export async function publishReview(input: {
  revisionId: string;
  scope: string;
  conditions: string;
  verdict: "validated" | "variant_proposed" | "more_info";
  clientMessage: string | null;
  internalNote: string | null;
}): Promise<string> {
  return rpc<string>(LEAD_RPC.publishReview, {
    p_revision_id: input.revisionId,
    p_scope: input.scope,
    p_conditions: input.conditions,
    p_verdict: input.verdict,
    p_client_message: input.clientMessage,
    p_internal_note: input.internalNote,
  });
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

export async function requestSamples(input: {
  reviewId: string;
  partNumber: string;
  quantity: number;
  annualVolume: number | null;
  isStandard: boolean;
}): Promise<{ id: string; route: string; status: string }> {
  return rpc(LEAD_RPC.requestSamples, {
    p_review_id: input.reviewId,
    p_part_number: input.partNumber,
    p_quantity: input.quantity,
    p_annual_volume: input.annualVolume,
    p_is_standard: input.isStandard,
  });
}

export async function fetchClientView(dossierId: string): Promise<unknown> {
  return rpc(LEAD_RPC.clientView, { p_dossier: dossierId });
}

export async function fetchStaffView(dossierId: string): Promise<unknown> {
  return rpc(LEAD_RPC.staffView, { p_dossier: dossierId });
}

/** Backend de soumission réel : disponible seulement si migration appliquée ET session ouverte. */
export function createSupabaseSubmissionBackend(options: {
  schemaReady: boolean;
  capabilities: LeadCapabilities;
  /** Dossier serveur déjà créé, sinon il est créé à la première soumission. */
  dossierId: string | null;
  expectedRevision: number;
  onDossierCreated?: (id: string) => void;
}): SubmissionBackend {
  const available =
    options.schemaReady && options.capabilities.authenticated && Boolean(supabase);
  if (!available) return { available: false };
  return {
    available: true,
    submit: async (snapshot) => {
      const dossierId =
        options.dossierId ?? (await createDossier(snapshot.dto.title ?? "Dossier", true));
      if (!options.dossierId) options.onDossierCreated?.(dossierId);
      const result = await submitRevision(dossierId, options.expectedRevision, snapshot);
      return { id: result.revision_id, at: result.submitted_at };
    },
  };
}
