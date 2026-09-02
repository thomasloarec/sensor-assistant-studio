// Types alignés sur le schéma Supabase V0.2 (supabase/schema/schema_v0.2.sql).
// Ne pas ajouter de table sans validation.

export type OutputType =
  | "S1_STANDARD_SUGGESTION"
  | "S1_MAINTENANCE_REFERENCE"
  | "S1_WITH_GUARDRAIL"
  | "S1_WITH_DISTANCE_CAVEAT"
  | "S1_WITH_INSTALLATION_CAVEAT_OR_S2"
  | "S2_BE_DOSSIER"
  | "S2_BE_DOSSIER_OR_WARNING"
  | "S2_BE_DOSSIER_OR_KNOWLEDGE"
  | "S2_BE_DOSSIER_OR_S1_WITH_CAVEAT"
  | "S2_BE_DOSSIER_OR_S1_WITH_FOLLOWUP"
  | "S3_MISSING_INFO"
  | "KNOWLEDGE_ONLY_WITH_MAINTENANCE_EXCEPTION";

export const OUTPUT_TYPES: readonly OutputType[] = [
  "S1_STANDARD_SUGGESTION",
  "S1_MAINTENANCE_REFERENCE",
  "S1_WITH_GUARDRAIL",
  "S1_WITH_DISTANCE_CAVEAT",
  "S1_WITH_INSTALLATION_CAVEAT_OR_S2",
  "S2_BE_DOSSIER",
  "S2_BE_DOSSIER_OR_WARNING",
  "S2_BE_DOSSIER_OR_KNOWLEDGE",
  "S2_BE_DOSSIER_OR_S1_WITH_CAVEAT",
  "S2_BE_DOSSIER_OR_S1_WITH_FOLLOWUP",
  "S3_MISSING_INFO",
  "KNOWLEDGE_ONLY_WITH_MAINTENANCE_EXCEPTION",
] as const;

export type Priority = "P0" | "P1" | "P2";
export type SessionStatus = "draft" | "in_review" | "closed" | "archived";
export type Locale = "fr" | "en";
export type Channel = "lovable_test" | "manual_import" | "internal_review";
export type VolumeBand =
  | "maintenance"
  | "very_low"
  | "small"
  | "medium"
  | "high"
  | "unknown";
export type LeadPotential = "low" | "medium" | "high" | "unknown";
export type MessageRole = "prospect" | "assistant" | "internal";
export type Confidence = "low" | "medium" | "high" | "unknown";
export type ReviewerRole = "thomas" | "claude" | "be" | "sales" | "other";
export type Verdict = "good" | "needs_revision" | "unsafe" | "unclear" | "not_reviewed";

export const VERDICTS: readonly Verdict[] = [
  "good",
  "needs_revision",
  "unsafe",
  "unclear",
  "not_reviewed",
] as const;
export const REVIEWER_ROLES: readonly ReviewerRole[] = [
  "thomas",
  "claude",
  "be",
  "sales",
  "other",
] as const;
export const VOLUME_BANDS: readonly VolumeBand[] = [
  "maintenance",
  "very_low",
  "small",
  "medium",
  "high",
  "unknown",
] as const;
export const LEAD_POTENTIALS: readonly LeadPotential[] = [
  "low",
  "medium",
  "high",
  "unknown",
] as const;
export const SESSION_STATUSES: readonly SessionStatus[] = [
  "draft",
  "in_review",
  "closed",
  "archived",
] as const;

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface SensorTestScenario {
  id: string;
  scenario_id: string;
  priority: Priority;
  user_prompt_fr: string;
  expected_output_type: string;
  expected_behavior: string;
  must_include: string | null;
  must_not_include: string | null;
  trace_flags: string[];
  is_active: boolean;
  created_at: string;
}

export interface SensorTestSession {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  status: SessionStatus;
  locale: Locale;
  channel: Channel;
  prospect_name: string | null;
  prospect_company: string | null;
  prospect_email: string | null;
  prospect_phone: string | null;
  prospect_city: string | null;
  standex_city: string | null;
  volume_band: VolumeBand | null;
  lead_potential: LeadPotential | null;
  callback_commitment: string;
  consent_notes: string | null;
}

export interface SensorTestMessage {
  id: string;
  session_id: string;
  created_at: string;
  role: MessageRole;
  content: string;
  turn_index: number;
}

export interface SensorTestOutput {
  id: string;
  session_id: string;
  created_at: string;
  output_type: OutputType;
  customer_summary: string;
  suggested_product_family: string | null;
  suggested_reference: string | null;
  standex_validation_required: boolean;
  distributor_path_allowed: boolean;
  callback_text: string;
  be_dossier: Json;
}

export interface SensorTestInternalTrace {
  id: string;
  session_id: string;
  output_id: string | null;
  created_at: string;
  understood_application: string | null;
  detection_target: string | null;
  mounting_geometry: string | null;
  electrical_load: string | null;
  voltage_value: string | null;
  current_value: string | null;
  power_value: string | null;
  volume_signal: string | null;
  product_candidates: Json;
  datasheet_values_used: Json;
  guardrails_triggered: string[];
  missing_questions: string[];
  confidence: Confidence;
  routing_reason: string | null;
}

export interface SensorTestReview {
  id: string;
  session_id: string;
  reviewer_id: string;
  created_at: string;
  reviewer_role: ReviewerRole;
  verdict: Verdict;
  notes: string | null;
  corrected_output_type: OutputType | null;
  corrected_product_family: string | null;
  corrected_reference: string | null;
}
