/** Accès serveur à l'annuaire des données de détection (migration 1.9).
 *
 *  Le navigateur n'écrit dans aucune table : tout passe par les RPC
 *  transactionnelles qui revérifient l'identité, le rôle administrateur réel et
 *  la version attendue. Aucune clé de service, aucune autorisation lue dans les
 *  métadonnées du compte.
 *
 *  Tant que la migration n'est pas appliquée sur le serveur, ces appels
 *  échouent proprement : l'écran l'annonce et NE prétend jamais avoir
 *  enregistré quoi que ce soit.
 */
import { supabase } from "@/lib/standex/supabase";
import type { DetectionRecord, DetectionStatus, GuideRecord } from "./model";
import { DETECTION_APPROACHES, DETECTION_CONTACT_FORMS, GUIDE_APPROACHES, GUIDE_BOUND_NOTES } from "./model";
import type { GuideApproachId } from "./model";
import type { PublishedApproach, PublishedClassKind } from "@/lib/standex/magnetics/registries";

export const DETECTION_RPC = {
  effective: "lead_detection_effective",
  directory: "lead_detection_directory",
  saveRow: "lead_detection_save_row",
  guideEffective: "lead_guide_effective",
  guideDirectory: "lead_guide_directory",
  guideSaveRow: "lead_guide_save_row",
} as const;

export const DETECTION_MIGRATION_FILE = "supabase/schema/migration_v1.9_detection_data.sql";

export interface DetectionConflict {
  conflict: true;
  currentVersion: number | null;
}

const num = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};
const str = (v: unknown, fallback = ""): string =>
  typeof v === "string" && v.trim() !== "" ? v : fallback;

/** Une ligne serveur est relue défensivement : un champ hors domaine fait
 *  écarter la ligne, jamais deviner une valeur. */
export function readRecord(raw: unknown): DetectionRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const approach = str(o["approachId"]) as PublishedApproach;
  const contact = str(o["contactForm"]) as (typeof DETECTION_CONTACT_FORMS)[number];
  const classKind = str(o["classKind"]) as PublishedClassKind;
  if (!DETECTION_APPROACHES.includes(approach)) return null;
  if (!DETECTION_CONTACT_FORMS.includes(contact)) return null;
  if (classKind !== "sensitivity" && classKind !== "switch_model") return null;
  const datum = str(o["datum"]);
  if (datum !== "lateral_surface" && datum !== "frontal_faces") return null;
  const thresholdKind = str(o["thresholdKind"]);
  if (thresholdKind !== "typical" && thresholdKind !== "min_activation_max_release") return null;
  const status = str(o["status"], "validated");
  if (status !== "draft" && status !== "validated") return null;
  const family = str(o["sensorFamily"]);
  const cls = str(o["sensitivityClass"]);
  const magnet = str(o["magnetId"]);
  if (family === "" || cls === "" || magnet === "") return null;
  return {
    id: str(o["id"], "") || null,
    sensorFamily: family,
    sensorReference: str(o["sensorReference"], family),
    classKind,
    sensitivityClass: cls,
    contactForm: contact,
    magnetId: magnet,
    approachId: approach,
    datum,
    thresholdKind,
    pullInMm: num(o["pullInMm"]),
    dropOutMm: num(o["dropOutMm"]),
    temperatureC: num(o["temperatureC"]),
    status: status as DetectionStatus,
    sourceType: str(o["sourceType"], "unknown"),
    sourceRef: str(o["sourceRef"], "unknown"),
    enteredOn: str(o["enteredOn"], "").slice(0, 10),
    note: str(o["note"], "") || null,
    rowVersion: num(o["rowVersion"]),
    updatedAt: str(o["updatedAt"], "") || null,
    updatedBy: str(o["updatedBy"], "") || null,
  };
}

export function isMissingDetectionRpc(error: unknown): boolean {
  const m = String((error as { message?: string })?.message ?? error ?? "");
  return /does not exist|schema .* does not exist|function .* not found|404/i.test(m);
}
export function detectionConflictVersion(error: unknown): number | null {
  const m = String((error as { message?: string })?.message ?? error ?? "");
  const found = /DETECTION_CONFLICT:(\d+)/.exec(m);
  return found ? Number(found[1]) : null;
}
/** Refus de rôle, formulé une seule fois : l'écran le compare et l'affiche via
 *  le dictionnaire, il ne le réécrit pas. */
export const DETECTION_DENIED_MESSAGE = "Réservé à l'administration Standex";

/** Message de champ partagé entre la saisie et la validation. */
export const NON_NUMERIC_MESSAGE = "Saisie non numérique";

export function humanDetectionError(error: unknown): string {
  const m = String((error as { message?: string })?.message ?? error ?? "");
  if (isMissingDetectionRpc(error)) return "Annuaire non activé sur ce serveur";
  if (/NOT_ALLOWED|42501/.test(m)) return DETECTION_DENIED_MESSAGE;
  if (/AUTH_REQUIRED/.test(m)) return "Session requise";
  if (/DETECTION_CONFLICT/.test(m)) return "Ligne modifiée entre-temps";
  if (/DETECTION_INCOMPLETE/.test(m)) return "Une ligne validée porte deux distances";
  if (/DETECTION_ALIAS_MAGNET/.test(m))
    return "Saisir la famille documentée, qui couvre ses variantes";
  if (/DETECTION_KEY_LOCKED/.test(m))
    return "La combinaison d'une ligne existante ne change pas : créer une nouvelle combinaison";
  if (/DETECTION_MISSING_ROW/.test(m)) return "Ligne introuvable sur le serveur";
  if (/DETECTION_BAD_/.test(m)) return "Données refusées par le serveur";
  return "Serveur indisponible";
}

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error("not configured");
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data as T;
}

export interface EffectiveDetectionPayload {
  version: string;
  /** Révision DÉTERMINISTE du jeu servi, calculée par le serveur à chaque
   *  écriture. Elle sert de provenance traçable dans les exports : deux
   *  écritures distinctes ne peuvent pas porter la même révision. */
  dataRevision: string | null;
  rows: DetectionRecord[];
}

/** Lecture de moindre privilège : seules les lignes validées et complètes. */
export async function fetchEffectiveDetectionRows(): Promise<EffectiveDetectionPayload> {
  const data = await rpc<Record<string, unknown>>(DETECTION_RPC.effective, {});
  const rows = Array.isArray(data?.["rows"]) ? (data["rows"] as unknown[]) : [];
  return {
    version: str(data?.["version"], "unknown"),
    dataRevision: str(data?.["dataRevision"], "") || null,
    rows: rows
      .map((r) => readRecord({ ...(r as object), status: "validated" }))
      .filter((r): r is DetectionRecord => r !== null),
  };
}

/** Annuaire complet, brouillons compris : administrateur uniquement. */
export async function fetchDetectionDirectory(): Promise<DetectionRecord[]> {
  const data = await rpc<Record<string, unknown>>(DETECTION_RPC.directory, {});
  const rows = Array.isArray(data?.["rows"]) ? (data["rows"] as unknown[]) : [];
  return rows.map(readRecord).filter((r): r is DetectionRecord => r !== null);
}

export interface SaveDetectionResult {
  id: string;
  rowVersion: number;
  status: DetectionStatus;
  updatedAt: string | null;
}

/** Écriture atomique avec version attendue : `null` pour une création. */
export async function saveDetectionRow(
  record: DetectionRecord,
  expectedVersion: number | null,
): Promise<SaveDetectionResult> {
  const payload = {
    // Identifiant STABLE : le serveur localise la ligne par lui, jamais par la
    // clé métier recomposée. Une clé modifiée ne peut donc pas écraser une
    // autre ligne dont la version coïnciderait.
    id: record.id,
    sensorFamily: record.sensorFamily,
    sensorReference: record.sensorReference,
    classKind: record.classKind,
    sensitivityClass: record.sensitivityClass,
    contactForm: record.contactForm,
    magnetId: record.magnetId,
    approachId: record.approachId,
    datum: record.datum,
    thresholdKind: record.thresholdKind,
    pullInMm: record.pullInMm,
    dropOutMm: record.dropOutMm,
    temperatureC: record.temperatureC,
    status: record.status,
    sourceType: record.sourceType,
    sourceRef: record.sourceRef,
    enteredOn: record.enteredOn,
    note: record.note,
  };
  const data = await rpc<Record<string, unknown>>(DETECTION_RPC.saveRow, {
    p_payload: payload,
    p_expected_version: expectedVersion,
  });
  return {
    id: str(data?.["id"], ""),
    rowVersion: num(data?.["rowVersion"]) ?? 1,
    status: (str(data?.["status"], "draft") as DetectionStatus) ?? "draft",
    updatedAt: str(data?.["updatedAt"], "") || null,
  };
}

/* ==========================================================================
 * Guide d'activation — jeu DOCUMENTAIRE
 *
 * Lecture et écriture strictement séparées des distances de commutation :
 * autres RPC, autre validation, aucune conversion. Les bornes « up » et « to »
 * sont relues telles qu'enregistrées, sans tri.
 * ======================================================================== */

const boundNote = (v: unknown): GuideRecord["upNote"] =>
  typeof v === "string" && (GUIDE_BOUND_NOTES as readonly string[]).includes(v)
    ? (v as GuideRecord["upNote"])
    : null;

export function readGuideRecord(raw: unknown): GuideRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const approach = str(o["approachId"]) as GuideApproachId;
  if (!(GUIDE_APPROACHES as readonly string[]).includes(approach)) return null;
  const status = str(o["status"], "validated");
  if (status !== "draft" && status !== "validated") return null;
  const family = str(o["sensorFamily"]);
  const reference = str(o["sensorReference"]);
  const magnet = str(o["magnetId"]);
  if (family === "" || reference === "" || magnet === "") return null;
  const up = num(o["upMm"]);
  const to = num(o["toMm"]);
  // Aucune valeur négative n'est acceptée, aucune n'est corrigée.
  if ((up !== null && up < 0) || (to !== null && to < 0)) return null;
  return {
    id: str(o["id"], "") || null,
    page: num(o["page"]),
    sensorFamily: family,
    sensorReference: reference,
    magnetId: magnet,
    approachId: approach,
    upMm: up,
    toMm: to,
    upNote: boundNote(o["upNote"]),
    toNote: boundNote(o["toNote"]),
    status: status as DetectionStatus,
    sourceRef: str(o["sourceRef"], "unknown"),
    enteredOn: str(o["enteredOn"], "").slice(0, 10),
    note: str(o["note"], "") || null,
    rowVersion: num(o["rowVersion"]),
    updatedAt: str(o["updatedAt"], "") || null,
    updatedBy: str(o["updatedBy"], "") || null,
  };
}

export interface EffectiveGuidePayload {
  version: string;
  dataRevision: string | null;
  rows: GuideRecord[];
}

export async function fetchEffectiveGuideRows(): Promise<EffectiveGuidePayload> {
  const data = await rpc<Record<string, unknown>>(DETECTION_RPC.guideEffective, {});
  const rows = Array.isArray(data?.["rows"]) ? (data["rows"] as unknown[]) : [];
  return {
    version: str(data?.["version"], "unknown"),
    dataRevision: str(data?.["dataRevision"], "") || null,
    rows: rows
      .map((r) => readGuideRecord({ ...(r as object), status: "validated" }))
      .filter((r): r is GuideRecord => r !== null),
  };
}

export async function fetchGuideDirectory(): Promise<GuideRecord[]> {
  const data = await rpc<Record<string, unknown>>(DETECTION_RPC.guideDirectory, {});
  const rows = Array.isArray(data?.["rows"]) ? (data["rows"] as unknown[]) : [];
  return rows.map(readGuideRecord).filter((r): r is GuideRecord => r !== null);
}

export async function saveGuideRow(
  record: GuideRecord,
  expectedVersion: number | null,
): Promise<SaveDetectionResult> {
  const payload = {
    page: record.page,
    sensorFamily: record.sensorFamily,
    sensorReference: record.sensorReference,
    magnetId: record.magnetId,
    approachId: record.approachId,
    upMm: record.upMm,
    toMm: record.toMm,
    upNote: record.upNote,
    toNote: record.toNote,
    status: record.status,
    sourceRef: record.sourceRef,
    enteredOn: record.enteredOn,
    note: record.note,
  };
  const data = await rpc<Record<string, unknown>>(DETECTION_RPC.guideSaveRow, {
    p_payload: payload,
    p_expected_version: expectedVersion,
  });
  return {
    id: str(data?.["id"], ""),
    rowVersion: num(data?.["rowVersion"]) ?? 1,
    status: (str(data?.["status"], "draft") as DetectionStatus) ?? "draft",
    updatedAt: str(data?.["updatedAt"], "") || null,
  };
}
