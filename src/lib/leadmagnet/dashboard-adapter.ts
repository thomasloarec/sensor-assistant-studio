/** Adaptateur Supabase de l'espace de travail interne (migration 1.8).
 *
 * Sonde SÉPARÉE : l'absence de la migration 1.8 n'empêche pas le reste de
 * fonctionner ; l'écran affiche alors « pas encore activé » au lieu d'échouer.
 * La version minimale exigée par le parcours client reste 1.4 (voir rpc.ts).
 *
 * Le navigateur n'écrit dans aucune table : tout passe par des RPC
 * transactionnelles qui revérifient rôle, affectation et version attendue.
 */
import { supabase, isSupabaseConfigured } from "@/lib/standex/supabase";
import { LEAD_CRM_RPC, humanCrmError, crmConflictVersion, isMissingRpc } from "./dashboard-rpc";
import type { CrmPerson, CrmProject, CrmStage, CrmTask, TaskStakeholder, TaskStatus } from "./crm";
import { isCrmStage, isTaskStatus } from "./crm";
import type { SapNote } from "./sap-note";
import type { StaffRole } from "./review";

export interface CrmCapabilities {
  /** Migration 1.8 réellement présente côté serveur. */
  available: boolean;
  crmVersion: string | null;
  userId: string | null;
  role: StaffRole | null;
  /** Personne de l'annuaire rattachée à ce compte, si un administrateur l'a liée. */
  person: { id: string; firstName: string; lastName: string; role: "sales" | "fae" } | null;
  /** Diagnostic réservé à l'écran d'administration. */
  detail: string;
}

export const CRM_UNAVAILABLE: CrmCapabilities = {
  available: false,
  crmVersion: null,
  userId: null,
  role: null,
  person: null,
  detail: "Espace de travail interne non activé sur ce serveur.",
};

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error(humanCrmError("not configured"));
  const { data, error } = await supabase.rpc(name, args);
  if (error) {
    throw Object.assign(new Error(humanCrmError(error)), {
      currentVersion: crmConflictVersion(error),
      missing: isMissingRpc(error),
    });
  }
  return data as T;
}

const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v : null;
const num = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};
const int = (v: unknown): number => Math.trunc(num(v) ?? 0);

function toProject(raw: unknown): CrmProject | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const dossierId = str(r["dossier_id"]);
  if (!dossierId) return null;
  const stage = isCrmStage(r["stage"]) ? r["stage"] : "lead";
  return {
    dossierId,
    title: str(r["title"]) ?? "",
    currentRevision: int(r["current_revision"]),
    ndaStatus: str(r["nda_status"]),
    stage,
    stageSince: str(r["stage_since"]),
    company: str(r["company"]),
    projectName: str(r["project_name"]),
    countryCode: str(r["country_code"]),
    salesPersonId: str(r["sales_person"]),
    faePersonId: str(r["fae_person"]),
    currency: str(r["currency"]),
    unitPrice: num(r["unit_price"]),
    unitCost: num(r["unit_cost"]),
    costInSap: r["cost_in_sap"] === true,
    annualVolumeSubmitted: num(r["annual_volume_submitted"]),
    annualVolumeOverride: num(r["annual_volume_override"]),
    estimatedAnnualRevenue: num(r["estimated_annual_revenue"]),
    seriesLaunch: str(r["series_launch"]),
    // Ce que le client a réellement déclaré, et ce qui s'affiche par défaut.
    companySubmitted: str(r["company_submitted"]),
    seriesLaunchSubmitted: str(r["series_launch_submitted"]),
    companyEffective: str(r["company_effective"]) ?? str(r["company"]),
    seriesLaunchEffective: str(r["series_launch_effective"]) ?? str(r["series_launch"]),
    companySource: source(r["company_source"]),
    seriesLaunchSource: source(r["series_launch_source"]),
    updatedAt: str(r["updated_at"]) ?? str(r["dossier_updated_at"]) ?? "",
    dossierUpdatedAt: str(r["dossier_updated_at"]) ?? "",
    dossierCreatedAt: str(r["dossier_created_at"]) ?? "",
    version: Math.max(1, int(r["version"])),
    tasksTotal: int(r["tasks_total"]),
    tasksDone: int(r["tasks_done"]),
    tasksBlocked: int(r["tasks_blocked"]),
    tasksOverdue: int(r["tasks_overdue"]),
    stageActivatedAt: str(r["stage_activated_at"]),
  };
}

function toTask(raw: unknown): CrmTask | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = str(r["id"]);
  if (!id) return null;
  const stakeholder = ["sales", "fae", "client"].includes(String(r["stakeholder"]))
    ? (r["stakeholder"] as TaskStakeholder)
    : "sales";
  return {
    id,
    stage: isCrmStage(r["stage"]) ? r["stage"] : "lead",
    label: str(r["label"]) ?? "",
    stakeholder,
    personId: str(r["person_id"]),
    status: isTaskStatus(r["status"]) ? r["status"] : "todo",
    naReason: str(r["na_reason"]),
    dueOn: str(r["due_on"]),
    sortOrder: int(r["sort_order"]),
    activatedAt: str(r["activated_at"]),
    doneAt: str(r["done_at"]),
    doneByName: str(r["done_by_name"]),
    createdAt: str(r["created_at"]) ?? "",
    version: Math.max(1, int(r["version"])),
  };
}

function toPerson(raw: unknown): CrmPerson | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = str(r["id"]);
  const role = r["role"] === "fae" ? "fae" : r["role"] === "sales" ? "sales" : null;
  if (!id || !role) return null;
  const staffRole = ["rnd", "sales", "admin"].includes(String(r["staff_role"]))
    ? (r["staff_role"] as StaffRole)
    : null;
  return {
    id,
    firstName: str(r["first_name"]) ?? "",
    lastName: str(r["last_name"]) ?? "",
    role,
    active: r["active"] !== false,
    userId: str(r["user_id"]),
    email: str(r["email"]),
    staffRole,
  };
}

function toNote(raw: unknown): SapNote | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = str(r["id"]);
  if (!id) return null;
  return {
    id,
    createdAt: str(r["created_at"]) ?? "",
    authorName: str(r["author_name"]) ?? "",
    eventKey: str(r["event_key"]) ?? "",
    bodyEn: str(r["body_en"]) ?? "",
  };
}

export interface ClientNotification {
  id: string;
  reviewId: string;
  revision: number;
  createdAt: string;
  /** Langue figée du client, jamais celle de l'interface interne. */
  locale: string;
  subject: string;
  summary: string;
  linkPath: string;
  /** Jamais « envoyé » : aucun service d'envoi n'est raccordé. */
  status: "pending" | "failed" | "cancelled";
  provider: string | null;
}

function toNotification(raw: unknown): ClientNotification | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = str(r["id"]);
  const reviewId = str(r["review_id"]);
  if (!id || !reviewId) return null;
  const status = ["pending", "failed", "cancelled"].includes(String(r["status"]))
    ? (r["status"] as ClientNotification["status"])
    : "pending";
  return {
    id,
    reviewId,
    revision: int(r["revision"]),
    createdAt: str(r["created_at"]) ?? "",
    locale: str(r["locale"]) ?? "fr",
    subject: str(r["subject"]) ?? "",
    summary: str(r["summary"]) ?? "",
    linkPath: str(r["link_path"]) ?? "/",
    status,
    provider: str(r["provider"]),
  };
}

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export interface UnfiledDossier {
  dossierId: string;
  title: string;
  currentRevision: number;
  updatedAt: string;
}

export interface CrmBoard {
  role: StaffRole | null;
  projects: CrmProject[];
  /** Dossiers visibles mais pas encore suivis dans l'espace de travail. */
  unfiled: UnfiledDossier[];
  directory: CrmPerson[];
}

export interface CrmProjectDetail {
  project: CrmProject;
  tasks: CrmTask[];
  sapNotes: SapNote[];
  notifications: ClientNotification[];
}

function toDetail(raw: unknown): CrmProjectDetail {
  const r = (raw ?? {}) as Record<string, unknown>;
  const project = toProject(r["project"]);
  if (!project) throw new Error(humanCrmError("DOSSIER_NOT_FOUND"));
  return {
    project,
    tasks: list(r["tasks"]).map(toTask).filter((t): t is CrmTask => t !== null),
    sapNotes: list(r["sap_notes"]).map(toNote).filter((n): n is SapNote => n !== null),
    notifications: list(r["notifications"])
      .map(toNotification)
      .filter((n): n is ClientNotification => n !== null),
  };
}

/** Sonde non destructive et INDÉPENDANTE de la sonde de schéma du parcours client. */
export async function probeCrm(): Promise<CrmCapabilities> {
  if (!isSupabaseConfigured || !supabase)
    return { ...CRM_UNAVAILABLE, detail: "Variables Supabase absentes de cet environnement." };
  const { data, error } = await supabase.rpc(LEAD_CRM_RPC.capabilities);
  if (error) {
    return {
      ...CRM_UNAVAILABLE,
      detail: isMissingRpc(error)
        ? "RPC lead_crm_capabilities absente : migration_v1.8_crm_dashboard.sql non appliquée."
        : `Sonde de l'espace interne en échec : ${error.message}`,
    };
  }
  const payload = (data ?? {}) as Record<string, unknown>;
  const person = payload["person"] as Record<string, unknown> | null | undefined;
  const role = ["rnd", "sales", "admin"].includes(String(payload["role"]))
    ? (payload["role"] as StaffRole)
    : null;
  return {
    available: str(payload["crm_version"]) !== null,
    crmVersion: str(payload["crm_version"]),
    userId: str(payload["user_id"]),
    role,
    person:
      person && str(person["id"])
        ? {
            id: String(person["id"]),
            firstName: String(person["first_name"] ?? ""),
            lastName: String(person["last_name"] ?? ""),
            role: person["role"] === "fae" ? "fae" : "sales",
          }
        : null,
    detail: `Espace de travail interne version ${str(payload["crm_version"]) ?? "?"}.`,
  };
}

export async function fetchCrmBoard(): Promise<CrmBoard> {
  const raw = await rpc<Record<string, unknown>>(LEAD_CRM_RPC.board, {});
  const role = ["rnd", "sales", "admin"].includes(String(raw["role"]))
    ? (raw["role"] as StaffRole)
    : null;
  return {
    role,
    projects: list(raw["projects"]).map(toProject).filter((p): p is CrmProject => p !== null),
    unfiled: list(raw["unfiled"])
      .map((v) => {
        const r = (v ?? {}) as Record<string, unknown>;
        const id = str(r["dossier_id"]);
        return id
          ? {
              dossierId: id,
              title: str(r["title"]) ?? "",
              currentRevision: int(r["current_revision"]),
              updatedAt: str(r["updated_at"]) ?? "",
            }
          : null;
      })
      .filter((d): d is UnfiledDossier => d !== null),
    directory: list(raw["directory"]).map(toPerson).filter((p): p is CrmPerson => p !== null),
  };
}

export async function fetchCrmProject(dossierId: string): Promise<CrmProjectDetail> {
  return toDetail(await rpc(LEAD_CRM_RPC.project, { p_dossier: dossierId }));
}

export async function setCrmStage(
  dossierId: string,
  stage: CrmStage,
  expectedVersion: number,
): Promise<CrmProjectDetail> {
  return toDetail(
    await rpc(LEAD_CRM_RPC.setStage, {
      p_dossier: dossierId,
      p_stage: stage,
      p_expected_version: expectedVersion,
    }),
  );
}

export interface CrmFieldsPatch {
  company?: string | null;
  project_name?: string | null;
  country_code?: string | null;
  currency?: string | null;
  series_launch?: string | null;
  annual_volume_override?: number | null;
  estimated_annual_revenue?: number | null;
}

export async function setCrmFields(
  dossierId: string,
  patch: CrmFieldsPatch,
  expectedVersion: number,
): Promise<CrmProjectDetail> {
  return toDetail(
    await rpc(LEAD_CRM_RPC.setFields, {
      p_dossier: dossierId,
      p_patch: patch,
      p_expected_version: expectedVersion,
    }),
  );
}

export async function setCrmCost(
  dossierId: string,
  cost: number | null,
  costInSap: boolean,
  expectedVersion: number,
): Promise<CrmProjectDetail> {
  return toDetail(
    await rpc(LEAD_CRM_RPC.setCost, {
      p_dossier: dossierId,
      p_cost: costInSap ? null : cost,
      p_cost_in_sap: costInSap,
      p_expected_version: expectedVersion,
    }),
  );
}

export async function setCrmPrice(
  dossierId: string,
  price: number | null,
  currency: string | null,
  expectedVersion: number,
): Promise<CrmProjectDetail> {
  return toDetail(
    await rpc(LEAD_CRM_RPC.setPrice, {
      p_dossier: dossierId,
      p_price: price,
      p_currency: currency,
      p_expected_version: expectedVersion,
    }),
  );
}

export async function setCrmOwners(
  dossierId: string,
  salesPersonId: string | null,
  faePersonId: string | null,
  expectedVersion: number,
): Promise<CrmProjectDetail> {
  return toDetail(
    await rpc(LEAD_CRM_RPC.setOwners, {
      p_dossier: dossierId,
      p_sales: salesPersonId,
      p_fae: faePersonId,
      p_expected_version: expectedVersion,
    }),
  );
}

export async function applyCrmTemplate(
  dossierId: string,
  expectedVersion: number,
): Promise<CrmProjectDetail> {
  return toDetail(
    await rpc(LEAD_CRM_RPC.applyTemplate, {
      p_dossier: dossierId,
      p_expected_version: expectedVersion,
    }),
  );
}

export interface TaskInput {
  id?: string;
  stage: CrmStage;
  label: string;
  stakeholder: TaskStakeholder;
  status: TaskStatus;
  personId?: string | null;
  naReason?: string | null;
  dueOn?: string | null;
  sortOrder?: number;
  expectedVersion?: number;
}

export async function upsertCrmTask(
  dossierId: string,
  task: TaskInput,
): Promise<CrmProjectDetail> {
  return toDetail(
    await rpc(LEAD_CRM_RPC.upsertTask, {
      p_dossier: dossierId,
      p_task: {
        ...(task.id ? { id: task.id } : {}),
        stage: task.stage,
        label: task.label,
        stakeholder: task.stakeholder,
        status: task.status,
        person_id: task.personId ?? null,
        na_reason: task.naReason ?? null,
        due_on: task.dueOn ?? null,
        ...(task.sortOrder === undefined ? {} : { sort_order: task.sortOrder }),
        ...(task.expectedVersion === undefined ? {} : { expected_version: task.expectedVersion }),
      },
    }),
  );
}

/** Met en file une notification client. Rien n'est envoyé : aucun service d'e-mail
 *  n'est raccordé à ce projet, et l'état ne peut donc jamais valoir « envoyé ». */
export async function queueReviewNotification(
  reviewId: string,
  subject: string,
  summary: string,
): Promise<CrmProjectDetail> {
  return toDetail(
    await rpc(LEAD_CRM_RPC.queueNotification, {
      p_review: reviewId,
      p_subject: subject,
      p_summary: summary,
    }),
  );
}

export interface CrmAdminOverview {
  crmVersion: string | null;
  directory: CrmPerson[];
  staff: {
    userId: string;
    role: StaffRole;
    active: boolean;
    displayName: string;
    email: string | null;
  }[];
  audit: {
    at: string;
    action: string;
    dossierId: string | null;
    actorName: string;
    detail: unknown;
  }[];
}

function toOverview(raw: unknown): CrmAdminOverview {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    crmVersion: str(r["crm_version"]),
    directory: list(r["directory"]).map(toPerson).filter((p): p is CrmPerson => p !== null),
    staff: list(r["staff"])
      .map((v) => {
        const s = (v ?? {}) as Record<string, unknown>;
        const userId = str(s["user_id"]);
        const role = ["rnd", "sales", "admin"].includes(String(s["role"]))
          ? (s["role"] as StaffRole)
          : null;
        return userId && role
          ? {
              userId,
              role,
              active: s["active"] !== false,
              displayName: str(s["display_name"]) ?? str(s["email"]) ?? userId,
              email: str(s["email"]),
            }
          : null;
      })
      .filter((s): s is CrmAdminOverview["staff"][number] => s !== null),
    audit: list(r["audit"]).map((v) => {
      const a = (v ?? {}) as Record<string, unknown>;
      return {
        at: str(a["at"]) ?? "",
        action: str(a["action"]) ?? "",
        dossierId: str(a["dossier_id"]),
        actorName: str(a["actor_name"]) ?? "",
        detail: a["detail"] ?? null,
      };
    }),
  };
}

export async function fetchCrmAdminOverview(): Promise<CrmAdminOverview> {
  return toOverview(await rpc(LEAD_CRM_RPC.adminOverview, {}));
}

export async function upsertCrmPerson(
  id: string | null,
  firstName: string,
  lastName: string,
  role: "sales" | "fae",
  active: boolean,
): Promise<CrmAdminOverview> {
  return toOverview(
    await rpc(LEAD_CRM_RPC.adminUpsertPerson, {
      p_id: id,
      p_first_name: firstName,
      p_last_name: lastName,
      p_role: role,
      p_active: active,
    }),
  );
}

/** Rattache une personne de l'annuaire à un compte DÉJÀ inscrit. Aucun compte
 *  n'est créé ici, et un nom seul n'ouvre jamais d'accès. */
export async function linkCrmPerson(
  personId: string,
  email: string | null,
): Promise<CrmAdminOverview> {
  return toOverview(
    await rpc(LEAD_CRM_RPC.adminLinkPerson, { p_person: personId, p_email: email }),
  );
}

export async function setStaffRole(
  userId: string,
  role: StaffRole,
  active: boolean,
): Promise<CrmAdminOverview> {
  return toOverview(
    await rpc(LEAD_CRM_RPC.adminSetStaff, { p_user: userId, p_role: role, p_active: active }),
  );
}
