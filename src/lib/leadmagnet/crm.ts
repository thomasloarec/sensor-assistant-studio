/** Règles métier de l'espace de travail interne (tableau de bord Standex).
 *
 * Fonctions PURES : elles ne parlent ni au réseau ni à l'écran. Le serveur reste
 * l'autorité (voir supabase/schema/migration_v1.8_crm_dashboard.sql) ; ce module
 * calcule ce qui est affiché et refuse de fabriquer une valeur qui n'existe pas.
 *
 * Principe directeur : « inconnu » est une valeur légitime et visible. Jamais un
 * zéro implicite, jamais une marge calculée sur un prix absent, jamais une somme
 * mélangeant deux devises.
 */

export const CRM_STAGES = [
  "lead",
  "qualification",
  "solution_quote",
  "negotiate",
  "closed_won",
  "closed_lost",
  "on_hold",
  "dead",
] as const;
export type CrmStage = (typeof CRM_STAGES)[number];

/** Étiquette exacte demandée par l'équipe, en anglais, pour SAP et l'interface. */
export const CRM_STAGE_LABEL: Record<CrmStage, string> = {
  lead: "Lead",
  qualification: "Qualification",
  solution_quote: "Solution-Quote",
  negotiate: "Negotiate",
  closed_won: "Closed Won",
  closed_lost: "Closed Lost",
  on_hold: "On Hold",
  dead: "Dead",
};

/** Étapes considérées comme terminées : elles sortent du pipeline actif. */
export const CLOSED_STAGES: readonly CrmStage[] = ["closed_won", "closed_lost", "dead"];

export function isCrmStage(value: unknown): value is CrmStage {
  return typeof value === "string" && (CRM_STAGES as readonly string[]).includes(value);
}

export const TASK_STATUSES = ["todo", "in_progress", "blocked", "done", "not_applicable"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export function isTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === "string" && (TASK_STATUSES as readonly string[]).includes(value);
}

export const TASK_STAKEHOLDERS = ["sales", "fae", "client"] as const;
export type TaskStakeholder = (typeof TASK_STAKEHOLDERS)[number];

export type PersonRole = "sales" | "fae";

export interface CrmPerson {
  id: string;
  firstName: string;
  lastName: string;
  role: PersonRole;
  active: boolean;
  /** Compte réellement rattaché par un administrateur, sinon `null`. */
  userId: string | null;
  email: string | null;
  staffRole: "rnd" | "sales" | "admin" | null;
}

export function personFullName(p: Pick<CrmPerson, "firstName" | "lastName">): string {
  return `${p.firstName} ${p.lastName}`.replace(/\s+/g, " ").trim();
}

export interface CrmTask {
  id: string;
  stage: CrmStage;
  label: string;
  stakeholder: TaskStakeholder;
  personId: string | null;
  status: TaskStatus;
  naReason: string | null;
  dueOn: string | null;
  sortOrder: number;
  activatedAt: string | null;
  doneAt: string | null;
  doneByName: string | null;
  createdAt: string;
  version: number;
}

/**
 * D'où vient la valeur affichée : correction interne explicite, déclaration du
 * client dans la soumission, ou rien du tout. Jamais deviné.
 */
export type CrmValueSource = "override" | "submitted" | "unknown";

export interface CrmProject {
  dossierId: string;
  title: string;
  currentRevision: number;
  ndaStatus: string | null;
  stage: CrmStage;
  stageSince: string | null;
  /** false = aucune fiche de suivi enregistrée : les valeurs internes sont vides,
   *  l'étape affichée est le point de départ et aucun historique n'est inventé. */
  filed: boolean;
  company: string | null;
  projectName: string | null;
  countryCode: string | null;
  salesPersonId: string | null;
  faePersonId: string | null;
  currency: string | null;
  unitPrice: number | null;
  unitCost: number | null;
  /** Pièce standard : le coût réel se lit dans SAP, il est donc inconnu ici. */
  costInSap: boolean;
  annualVolumeSubmitted: number | null;
  annualVolumeOverride: number | null;
  estimatedAnnualRevenue: number | null;
  seriesLaunch: string | null;
  /** Valeur réellement déclarée par le client dans la dernière soumission. */
  companySubmitted: string | null;
  seriesLaunchSubmitted: string | null;
  /** Valeur affichée : correction interne si elle existe, sinon la soumission. */
  companyEffective: string | null;
  seriesLaunchEffective: string | null;
  companySource: CrmValueSource;
  seriesLaunchSource: CrmValueSource;
  updatedAt: string;
  dossierUpdatedAt: string;
  /** Date de création du dossier : sert à l'âge du projet, jamais à l'âge d'étape. */
  dossierCreatedAt: string;
  version: number;
  tasksTotal: number;
  tasksDone: number;
  tasksBlocked: number;
  tasksOverdue: number;
  stageActivatedAt: string | null;
}

/** Résultat volontairement explicite : une valeur inconnue porte sa raison. */
export type Unknown<TReason extends string> = { known: false; reason: TReason };
export type Known<T> = { known: true; value: T };
export type Maybe<T, TReason extends string> = Known<T> | Unknown<TReason>;

const known = <T,>(value: T): Known<T> => ({ known: true, value });
const unknown = <R extends string>(reason: R): Unknown<R> => ({ known: false, reason });

function usableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

// ---------------------------------------------------------------------------
// Marge
// ---------------------------------------------------------------------------

export type MarginReason = "no_price" | "zero_price" | "cost_in_sap" | "no_cost";

/** Marge en POURCENTAGE : (prix de vente unitaire − coût unitaire) / prix de vente.
 *
 * Ce n'est PAS « revenu − coût ». Sans prix, ou avec un prix nul, la division n'a
 * pas de sens : la marge est inconnue et le reste. Un coût nul explicitement saisi
 * est une donnée valide (marge 100 %). Une marge négative est parfaitement
 * possible et doit être affichée telle quelle : c'est une alerte, pas une erreur.
 */
export function marginPercent(project: Pick<CrmProject, "unitPrice" | "unitCost" | "costInSap">):
  Maybe<number, MarginReason> {
  const price = usableNumber(project.unitPrice);
  if (price === null) return unknown("no_price");
  if (price === 0) return unknown("zero_price");
  if (project.costInSap) return unknown("cost_in_sap");
  const cost = usableNumber(project.unitCost);
  if (cost === null) return unknown("no_cost");
  return known(((price - cost) / price) * 100);
}

// ---------------------------------------------------------------------------
// Volume et chiffre d'affaires
// ---------------------------------------------------------------------------

export type VolumeSource = "submitted" | "override";

/** Volume annuel de CAPTEURS retenu, avec sa provenance affichable. */
export function annualVolume(project: Pick<CrmProject, "annualVolumeSubmitted" | "annualVolumeOverride">):
  Maybe<{ sensorsPerYear: number; source: VolumeSource }, "unknown"> {
  const override = usableNumber(project.annualVolumeOverride);
  if (override !== null && override > 0) {
    return known({ sensorsPerYear: override, source: "override" });
  }
  const submitted = usableNumber(project.annualVolumeSubmitted);
  if (submitted !== null && submitted > 0) {
    return known({ sensorsPerYear: submitted, source: "submitted" });
  }
  return unknown("unknown");
}

export type RevenueSource = "computed" | "manual_estimate";
export type RevenueReason = "no_basis";

/** Chiffre d'affaires annuel.
 *
 * Le calcul volume × prix prend le dessus dès qu'il est possible, mais il
 * n'efface jamais l'estimation manuelle saisie plus tôt : les deux coexistent et
 * la provenance est toujours affichée. Aucune conversion de devise n'est faite.
 */
export function annualRevenue(project: Pick<CrmProject,
  "annualVolumeSubmitted" | "annualVolumeOverride" | "unitPrice" | "currency" | "estimatedAnnualRevenue">):
  Maybe<{ amount: number; currency: string | null; source: RevenueSource; volumeSource?: VolumeSource },
    RevenueReason> {
  const volume = annualVolume(project);
  const price = usableNumber(project.unitPrice);
  if (volume.known && price !== null) {
    return known({
      amount: volume.value.sensorsPerYear * price,
      currency: project.currency,
      source: "computed",
      volumeSource: volume.value.source,
    });
  }
  const manual = usableNumber(project.estimatedAnnualRevenue);
  if (manual !== null) {
    return known({ amount: manual, currency: project.currency, source: "manual_estimate" });
  }
  return unknown("no_basis");
}

/** Totaux du pipeline PAR DEVISE : additionner EUR et USD produirait un chiffre faux. */
export function pipelineTotals(projects: readonly CrmProject[]): {
  byCurrency: { currency: string; amount: number; projects: number }[];
  unknownCurrency: number;
  unknownAmount: number;
} {
  const map = new Map<string, { amount: number; projects: number }>();
  let unknownCurrency = 0;
  let unknownAmount = 0;
  for (const project of projects) {
    const revenue = annualRevenue(project);
    if (!revenue.known) {
      unknownAmount += 1;
      continue;
    }
    const currency = revenue.value.currency;
    if (!currency) {
      unknownCurrency += 1;
      continue;
    }
    const entry = map.get(currency) ?? { amount: 0, projects: 0 };
    entry.amount += revenue.value.amount;
    entry.projects += 1;
    map.set(currency, entry);
  }
  return {
    byCurrency: [...map.entries()]
      .map(([currency, v]) => ({ currency, ...v }))
      .sort((a, b) => b.amount - a.amount || a.currency.localeCompare(b.currency)),
    unknownCurrency,
    unknownAmount,
  };
}

// ---------------------------------------------------------------------------
// Avancement et âges
// ---------------------------------------------------------------------------

/** Avancement d'un projet : les items « sans objet » sortent de la base de calcul. */
export function taskProgress(tasks: readonly CrmTask[]): {
  total: number;
  done: number;
  blocked: number;
  percent: number | null;
} {
  const counted = tasks.filter((t) => t.status !== "not_applicable");
  const done = counted.filter((t) => t.status === "done").length;
  const blocked = tasks.filter((t) => t.status === "blocked").length;
  return {
    total: counted.length,
    done,
    blocked,
    percent: counted.length === 0 ? null : Math.round((done / counted.length) * 100),
  };
}

const DAY_MS = 86_400_000;

function parseTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

/** Âge en jours entiers d'une date ISO, ou `null` si la date est absente/invalide. */
export function ageInDays(iso: string | null | undefined, now: Date = new Date()): number | null {
  const t = parseTime(iso ?? null);
  if (t === null) return null;
  return Math.max(0, Math.floor((now.getTime() - t) / DAY_MS));
}

/** Retard d'une tâche, en jours. Une tâche terminée ou sans objet n'est jamais en retard. */
export function taskOverdueDays(task: Pick<CrmTask, "dueOn" | "status">, now: Date = new Date()):
  number | null {
  if (task.status === "done" || task.status === "not_applicable") return null;
  const due = parseTime(task.dueOn);
  if (due === null) return null;
  const diff = Math.floor((now.getTime() - due) / DAY_MS);
  return diff > 0 ? diff : null;
}

/** Âge du projet : depuis la création du dossier, valeur immuable. */
export function projectAgeDays(project: CrmProject, now: Date = new Date()): number | null {
  return ageInDays(project.dossierCreatedAt || null, now);
}

/**
 * Âge de l'étape EN COURS : depuis l'activation réelle des actions de cette
 * étape, jamais depuis la plus ancienne action inachevée d'une étape future ni
 * depuis la création d'un plan d'actions rédigé à l'avance. Une étape ne peut
 * pas être en cours avant que le projet y entre.
 */
export function stageAgeDays(project: CrmProject, now: Date = new Date()): number | null {
  const activated = parseTime(project.stageActivatedAt);
  const since = parseTime(project.stageSince);
  if (activated === null && since === null) return null;
  const start = Math.max(activated ?? Number.NEGATIVE_INFINITY, since ?? Number.NEGATIVE_INFINITY);
  return Math.max(0, Math.floor((now.getTime() - start) / DAY_MS));
}


/**
 * Prochaine action réellement en attente : la PREMIÈRE tâche du plan ni
 * terminée ni sans objet, dans l'ordre étape puis rang puis date de création.
 * Une seule et même définition que celle du serveur (`crm_refresh_activation`) :
 * une action ouverte d'une étape antérieure reste la courante même après un
 * changement d'étape, sinon l'écran afficherait une action que le serveur n'a
 * pas activée, donc sans âge. Aucune tâche en attente : rien à afficher,
 * pas « 0 ». Le paramètre `project` reste accepté pour la compatibilité des
 * appels, mais l'étape ne réordonne plus rien.
 */
export function nextAction(
  _project: Pick<CrmProject, "stage">,
  tasks: readonly CrmTask[],
): CrmTask | null {
  const open = tasks.filter((x) => x.status !== "done" && x.status !== "not_applicable");
  if (open.length === 0) return null;
  const order = (x: CrmTask) => (CRM_STAGES as readonly string[]).indexOf(x.stage);
  return [...open].sort((a, b) =>
    order(a) - order(b)
    || a.sortOrder - b.sortOrder
    || a.createdAt.localeCompare(b.createdAt)
    || a.id.localeCompare(b.id))[0] ?? null;
}

/** Âge, en jours, de la prochaine action en attente depuis son activation réelle.
 *  Une action pas encore devenue courante n'a pas de date d'activation : son
 *  âge est inconnu, jamais celui de la création du plan d'actions. */
export function actionAgeDays(task: CrmTask | null, now: Date = new Date()): number | null {
  if (!task || !task.activatedAt) return null;
  return ageInDays(task.activatedAt, now);
}


/** Repères d'attention d'un projet, sans jamais inventer une échéance absente. */
export function projectAlerts(project: CrmProject, tasks: readonly CrmTask[], now: Date = new Date()):
  { blocked: number; overdue: number; stageAgeDays: number | null; idleDays: number | null;
    projectAgeDays: number | null } {
  return {
    blocked: tasks.filter((t) => t.status === "blocked").length,
    overdue: tasks.filter((t) => taskOverdueDays(t, now) !== null).length,
    stageAgeDays: stageAgeDays(project, now),
    idleDays: ageInDays(project.updatedAt, now),
    projectAgeDays: projectAgeDays(project, now),
  };
}

// ---------------------------------------------------------------------------
// Recherche, filtres, tri
// ---------------------------------------------------------------------------

export interface BoardFilters {
  search?: string;
  stages?: readonly CrmStage[];
  salesPersonId?: string | null;
  faePersonId?: string | null;
  countryCode?: string | null;
  onlyLate?: boolean;
  /** Société : sous-chaîne, insensible à la casse et aux accents. */
  company?: string | null;
  /** Chiffre d'affaires annuel, dans la devise demandée. Un montant inconnu
   *  n'est jamais assimilé à zéro : il sort du résultat dès qu'une borne existe. */
  revenueMin?: number | null;
  revenueMax?: number | null;
  /** Aucune conversion de devise n'est faite : le filtre ne compare que la même. */
  revenueCurrency?: string | null;
  /** Plage sur la DATE DE LANCEMENT SÉRIE (bornes incluses, format ISO AAAA-MM-JJ). */
  seriesLaunchFrom?: string | null;
  seriesLaunchTo?: string | null;
}


export type BoardSort =
  | "updated_desc"
  | "updated_asc"
  | "revenue_desc"
  | "stage_age_desc"
  | "company_asc";

const norm = (v: string | null | undefined) =>
  (v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

/** La recherche porte sur des données saisies, pas sur des libellés traduits :
 *  le résultat est donc identique dans les huit langues de l'interface. */
export function matchesSearch(project: CrmProject, search: string): boolean {
  const q = norm(search).trim();
  if (!q) return true;
  const haystack = [
    // La valeur RÉELLEMENT affichée (déclarée par le client, sauf correction
    // interne explicite) doit être trouvable, pas seulement la correction.
    project.companyEffective,
    project.company,
    project.companySubmitted,
    project.projectName,
    project.title,
    project.countryCode,
    project.dossierId,
  ]
    .map(norm)
    .join(" ");
  return q.split(/\s+/).every((token) => haystack.includes(token));
}


export function filterProjects(
  projects: readonly CrmProject[],
  filters: BoardFilters,
  tasksByDossier: Readonly<Record<string, readonly CrmTask[]>> = {},
  now: Date = new Date(),
): CrmProject[] {
  const companyQuery = norm(filters.company ?? "").trim();
  const hasRevenueBound = filters.revenueMin != null || filters.revenueMax != null;
  return projects.filter((p) => {
    if (!matchesSearch(p, filters.search ?? "")) return false;
    if (filters.stages && filters.stages.length > 0 && !filters.stages.includes(p.stage)) return false;
    if (filters.salesPersonId !== undefined && filters.salesPersonId !== null
      && p.salesPersonId !== filters.salesPersonId) return false;
    if (filters.faePersonId !== undefined && filters.faePersonId !== null
      && p.faePersonId !== filters.faePersonId) return false;
    if (filters.countryCode) {
      if ((p.countryCode ?? "").toUpperCase() !== filters.countryCode.toUpperCase()) return false;
    }
    if (companyQuery) {
      const name = norm(p.companyEffective ?? p.company ?? p.companySubmitted);
      if (!name.includes(companyQuery)) return false;
    }
    if (hasRevenueBound) {
      const revenue = annualRevenue(p);
      // Un chiffre d'affaires inconnu ne vaut pas zéro : il ne peut pas
      // satisfaire une borne, donc il sort du résultat filtré.
      if (!revenue.known) return false;
      const wanted = (filters.revenueCurrency ?? "").trim().toUpperCase();
      if (wanted && (revenue.value.currency ?? "").toUpperCase() !== wanted) return false;
      if (filters.revenueMin != null && revenue.value.amount < filters.revenueMin) return false;
      if (filters.revenueMax != null && revenue.value.amount > filters.revenueMax) return false;
    }
    if (filters.seriesLaunchFrom || filters.seriesLaunchTo) {
      const launch = (p.seriesLaunchEffective ?? p.seriesLaunch ?? "").slice(0, 10);
      // Une date de lancement inconnue n'est ni « avant » ni « après » : elle est écartée.
      if (!launch) return false;
      if (filters.seriesLaunchFrom && launch < filters.seriesLaunchFrom) return false;
      if (filters.seriesLaunchTo && launch > filters.seriesLaunchTo) return false;
    }
    if (filters.onlyLate) {
      const tasks = tasksByDossier[p.dossierId] ?? [];
      const late = p.tasksOverdue > 0 || p.tasksBlocked > 0
        || tasks.some((t) => taskOverdueDays(t, now) !== null);
      if (!late) return false;
    }
    return true;
  });
}

export function sortProjects(projects: readonly CrmProject[], sort: BoardSort): CrmProject[] {
  const copy = [...projects];
  const time = (v: string | null) => parseTime(v) ?? 0;
  switch (sort) {
    case "updated_asc":
      return copy.sort((a, b) => time(a.updatedAt) - time(b.updatedAt));
    case "revenue_desc":
      return copy.sort((a, b) => {
        const ra = annualRevenue(a);
        const rb = annualRevenue(b);
        // Un montant inconnu ne se classe pas comme un zéro : il passe en fin de liste.
        if (ra.known !== rb.known) return ra.known ? -1 : 1;
        if (!ra.known || !rb.known) return time(b.updatedAt) - time(a.updatedAt);
        return rb.value.amount - ra.value.amount;
      });
    case "stage_age_desc":
      // Tri sur l'âge réellement affiché de l'étape en cours.
      return copy.sort((a, b) =>
        Math.max(time(a.stageActivatedAt), time(a.stageSince))
        - Math.max(time(b.stageActivatedAt), time(b.stageSince)));

    case "company_asc":
      return copy.sort((a, b) =>
        norm(a.companyEffective ?? a.company ?? a.title)
          .localeCompare(norm(b.companyEffective ?? b.company ?? b.title)));
    case "updated_desc":
    default:
      return copy.sort((a, b) => time(b.updatedAt) - time(a.updatedAt));
  }
}

/** Colonnes du pipeline : les huit étapes, toujours toutes présentes, même vides. */
export function groupByStage(projects: readonly CrmProject[]): { stage: CrmStage; projects: CrmProject[] }[] {
  return CRM_STAGES.map((stage) => ({
    stage,
    projects: projects.filter((p) => p.stage === stage),
  }));
}

// ---------------------------------------------------------------------------
// Saisies : ce que l'écran accepte d'envoyer au serveur
// ---------------------------------------------------------------------------

export type AmountInput = { ok: true; value: number | null } | { ok: false; reason: "not_a_number" | "negative" | "too_large" };

/** Lecture d'un montant saisi. Un champ vide vaut « inconnu », pas zéro. */
export function parseAmountInput(raw: string): AmountInput {
  const text = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (text === "") return { ok: true, value: null };
  const n = Number(text);
  if (!Number.isFinite(n)) return { ok: false, reason: "not_a_number" };
  if (n < 0) return { ok: false, reason: "negative" };
  if (n >= 1e12) return { ok: false, reason: "too_large" };
  return { ok: true, value: n };
}

export function parseVolumeInput(raw: string): AmountInput {
  const text = raw.trim().replace(/\s/g, "");
  if (text === "") return { ok: true, value: null };
  if (!/^\d+$/.test(text)) return { ok: false, reason: "not_a_number" };
  const n = Number(text);
  if (!Number.isFinite(n) || n <= 0) return { ok: false, reason: "not_a_number" };
  if (n > 2_147_483_647) return { ok: false, reason: "too_large" };
  return { ok: true, value: n };
}

export function isCurrencyCode(raw: string): boolean {
  return /^[A-Za-z]{3}$/.test(raw.trim());
}

export function isCountryCode(raw: string): boolean {
  return /^[A-Za-z]{2}$/.test(raw.trim());
}

/** Formatage d'un montant : la devise inconnue n'est pas remplacée par l'euro. */
export function formatAmount(amount: number, currency: string | null, locale: string): string {
  const value = new Intl.NumberFormat(locale, {
    maximumFractionDigits: Math.abs(amount) >= 100 ? 0 : 2,
  }).format(amount);
  return currency ? `${value} ${currency}` : value;
}

export function formatPercent(percent: number, locale: string): string {
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(percent)} %`;
}
