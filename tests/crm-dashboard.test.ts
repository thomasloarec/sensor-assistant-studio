import { describe, expect, test } from "bun:test";
import {
  CRM_STAGES,
  CRM_STAGE_LABEL,
  ageInDays,
  stageAgeDays,
  projectAgeDays,
  annualRevenue,
  annualVolume,
  filterProjects,
  formatAmount,
  groupByStage,
  isCrmStage,
  marginPercent,
  matchesSearch,
  parseAmountInput,
  parseVolumeInput,
  personFullName,
  pipelineTotals,
  projectAlerts,
  sortProjects,
  taskOverdueDays,
  taskProgress,
  type CrmProject,
  type CrmTask,
} from "../src/lib/leadmagnet/crm";
import {
  composeSapNote,
  dedupeSapNotes,
  sapDate,
  sapNoteHeader,
  sapNotesToText,
  type SapNote,
} from "../src/lib/leadmagnet/sap-note";

const project = (patch: Partial<CrmProject> = {}): CrmProject => ({
  dossierId: "d1",
  title: "Projet",
  currentRevision: 1,
  ndaStatus: "not_required",
  stage: "lead",
  stageSince: "2026-09-01T00:00:00.000Z",
  company: null,
  projectName: null,
  countryCode: null,
  salesPersonId: null,
  faePersonId: null,
  currency: null,
  unitPrice: null,
  unitCost: null,
  costInSap: false,
  annualVolumeSubmitted: null,
  annualVolumeOverride: null,
  estimatedAnnualRevenue: null,
  seriesLaunch: null,
  companySubmitted: null,
  seriesLaunchSubmitted: null,
  companyEffective: null,
  seriesLaunchEffective: null,
  companySource: "unknown",
  seriesLaunchSource: "unknown",
  updatedAt: "2026-09-05T00:00:00.000Z",
  dossierUpdatedAt: "2026-09-05T00:00:00.000Z",
  dossierCreatedAt: "2026-08-01T00:00:00.000Z",
  version: 1,
  tasksTotal: 0,
  tasksDone: 0,
  tasksBlocked: 0,
  tasksOverdue: 0,
  stageActivatedAt: null,
  ...patch,
});

const task = (patch: Partial<CrmTask> = {}): CrmTask => ({
  id: "t1",
  stage: "lead",
  label: "Étape",
  stakeholder: "sales",
  personId: null,
  status: "todo",
  naReason: null,
  dueOn: null,
  sortOrder: 10,
  activatedAt: null,
  doneAt: null,
  doneByName: null,
  createdAt: "2026-09-01T00:00:00.000Z",
  version: 1,
  ...patch,
});

describe("étapes du pipeline", () => {
  test("exactement les huit étapes convenues, dans l'ordre", () => {
    expect(CRM_STAGES).toEqual([
      "lead",
      "qualification",
      "solution_quote",
      "negotiate",
      "closed_won",
      "closed_lost",
      "on_hold",
      "dead",
    ]);
    expect(Object.values(CRM_STAGE_LABEL)).toEqual([
      "Lead",
      "Qualification",
      "Solution-Quote",
      "Negotiate",
      "Closed Won",
      "Closed Lost",
      "On Hold",
      "Dead",
    ]);
  });

  test("une étape inventée est refusée", () => {
    expect(isCrmStage("proposal")).toBe(false);
    expect(isCrmStage("closed_won")).toBe(true);
  });

  test("le pipeline montre toujours les huit colonnes, même vides", () => {
    const columns = groupByStage([project({ stage: "negotiate" })]);
    expect(columns).toHaveLength(8);
    expect(columns.find((c) => c.stage === "negotiate")?.projects).toHaveLength(1);
    expect(columns.find((c) => c.stage === "dead")?.projects).toEqual([]);
  });
});

describe("marge", () => {
  test("marge = (prix − coût) / prix, en pourcentage", () => {
    const m = marginPercent(project({ unitPrice: 2.5, unitCost: 1 }));
    expect(m.known && Math.round(m.value * 100) / 100).toBe(60);
  });

  test("ce n'est pas revenu − coût", () => {
    const m = marginPercent(project({ unitPrice: 4, unitCost: 3 }));
    expect(m.known && m.value).toBe(25);
  });

  test("prix absent : marge inconnue, jamais zéro", () => {
    expect(marginPercent(project({ unitCost: 1 }))).toEqual({ known: false, reason: "no_price" });
  });

  test("prix nul : marge inconnue, pas d'infini", () => {
    expect(marginPercent(project({ unitPrice: 0, unitCost: 1 }))).toEqual({
      known: false,
      reason: "zero_price",
    });
  });

  test("coût nul explicite : marge de 100 %", () => {
    const m = marginPercent(project({ unitPrice: 2, unitCost: 0 }));
    expect(m.known && m.value).toBe(100);
  });

  test("coût lu dans SAP : marge inconnue et dite comme telle", () => {
    expect(marginPercent(project({ unitPrice: 2, unitCost: 1, costInSap: true }))).toEqual({
      known: false,
      reason: "cost_in_sap",
    });
  });

  test("marge négative permise et affichée telle quelle", () => {
    const m = marginPercent(project({ unitPrice: 1, unitCost: 2 }));
    expect(m.known && m.value).toBe(-100);
  });

  test("valeur non finie traitée comme inconnue", () => {
    expect(marginPercent(project({ unitPrice: Number.NaN, unitCost: 1 })).known).toBe(false);
    expect(marginPercent(project({ unitPrice: 2, unitCost: Number.POSITIVE_INFINITY })).known).toBe(
      false,
    );
  });
});

describe("volume et chiffre d'affaires", () => {
  test("le volume soumis est utilisé, avec sa provenance", () => {
    const v = annualVolume(project({ annualVolumeSubmitted: 2000 }));
    expect(v.known && v.value).toEqual({ sensorsPerYear: 2000, source: "submitted" });
  });

  test("la valeur retenue par Standex prime sur celle soumise", () => {
    const v = annualVolume(project({ annualVolumeSubmitted: 2000, annualVolumeOverride: 5000 }));
    expect(v.known && v.value).toEqual({ sensorsPerYear: 5000, source: "override" });
  });

  test("volume absent : inconnu, jamais zéro implicite", () => {
    expect(annualVolume(project()).known).toBe(false);
  });

  test("volume × prix dès que les deux existent", () => {
    const r = annualRevenue(project({ annualVolumeSubmitted: 2000, unitPrice: 2.5, currency: "EUR" }));
    expect(r.known && r.value).toEqual({
      amount: 5000,
      currency: "EUR",
      source: "computed",
      volumeSource: "submitted",
    });
  });

  test("sans prix, l'estimation manuelle est utilisée et signalée", () => {
    const r = annualRevenue(project({ estimatedAnnualRevenue: 12000, currency: "EUR" }));
    expect(r.known && r.value.source).toBe("manual_estimate");
  });

  test("le calcul prime mais n'efface pas l'estimation saisie", () => {
    const p = project({
      annualVolumeSubmitted: 1000,
      unitPrice: 3,
      estimatedAnnualRevenue: 12000,
      currency: "EUR",
    });
    const r = annualRevenue(p);
    expect(r.known && r.value.source).toBe("computed");
    expect(p.estimatedAnnualRevenue).toBe(12000);
  });

  test("aucune base : inconnu", () => {
    expect(annualRevenue(project())).toEqual({ known: false, reason: "no_basis" });
  });

  test("les totaux sont par devise, jamais additionnés entre devises", () => {
    const totals = pipelineTotals([
      project({ annualVolumeSubmitted: 1000, unitPrice: 2, currency: "EUR" }),
      project({ annualVolumeSubmitted: 1000, unitPrice: 3, currency: "USD" }),
      project({ annualVolumeSubmitted: 1000, unitPrice: 1 }),
      project(),
    ]);
    expect(totals.byCurrency).toEqual([
      { currency: "USD", amount: 3000, projects: 1 },
      { currency: "EUR", amount: 2000, projects: 1 },
    ]);
    expect(totals.unknownCurrency).toBe(1);
    expect(totals.unknownAmount).toBe(1);
  });

  test("un montant inconnu se classe en fin de tri, pas comme un zéro", () => {
    const withAmount = project({ dossierId: "a", annualVolumeSubmitted: 10, unitPrice: 1 });
    const without = project({ dossierId: "b" });
    expect(sortProjects([without, withAmount], "revenue_desc").map((p) => p.dossierId)).toEqual([
      "a",
      "b",
    ]);
  });
});

describe("avancement, âges et retards", () => {
  const now = new Date("2026-09-10T00:00:00.000Z");

  test("les items sans objet sortent de la base de calcul", () => {
    const progress = taskProgress([
      task({ id: "1", status: "done" }),
      task({ id: "2", status: "todo" }),
      task({ id: "3", status: "not_applicable", naReason: "Client déjà équipé" }),
    ]);
    expect(progress).toEqual({ total: 2, done: 1, blocked: 0, percent: 50 });
  });

  test("sans aucune tâche, l'avancement est inconnu et non 0 %", () => {
    expect(taskProgress([]).percent).toBeNull();
  });

  test("une tâche terminée ou sans objet n'est jamais en retard", () => {
    expect(taskOverdueDays(task({ dueOn: "2026-09-01", status: "done" }), now)).toBeNull();
    expect(
      taskOverdueDays(task({ dueOn: "2026-09-01", status: "not_applicable" }), now),
    ).toBeNull();
    expect(taskOverdueDays(task({ dueOn: "2026-09-01", status: "todo" }), now)).toBe(9);
  });

  test("une échéance absente ne crée pas de retard", () => {
    expect(taskOverdueDays(task(), now)).toBeNull();
    expect(ageInDays(null, now)).toBeNull();
    expect(ageInDays("pas une date", now)).toBeNull();
  });

  test("les repères d'attention comptent bloqués, retards et âge d'étape", () => {
    const alerts = projectAlerts(
      project({ stageSince: "2026-09-01T00:00:00.000Z" }),
      [task({ status: "blocked" }), task({ id: "t2", dueOn: "2026-09-05" })],
      now,
    );
    expect(alerts).toEqual({
      blocked: 1, overdue: 1, stageAgeDays: 9, idleDays: 5, projectAgeDays: 40,
    });
  });

  test("l'âge de l'étape part de son activation réelle, pas de la création du dossier", () => {
    const p = project({
      stageSince: "2026-09-01T00:00:00.000Z",
      stageActivatedAt: "2026-09-08T00:00:00.000Z",
    });
    expect(stageAgeDays(p, now)).toBe(2);
    expect(projectAgeDays(p, now)).toBe(40);
  });

  test("sans activation connue, l'étape retombe sur sa date d'entrée, jamais sur zéro", () => {
    const p = project({ stageSince: "2026-09-01T00:00:00.000Z", stageActivatedAt: null });
    expect(stageAgeDays(p, now)).toBe(9);
  });

  test("un dossier sans date de création n'a pas d'âge inventé", () => {
    expect(projectAgeDays(project({ dossierCreatedAt: "" }), now)).toBeNull();
  });
});

describe("recherche, filtres et tri", () => {
  const alpha = project({
    dossierId: "a",
    company: "K Motor",
    projectName: "Verrou de porte",
    countryCode: "FR",
    stage: "qualification",
    updatedAt: "2026-09-08T00:00:00.000Z",
  });
  const beta = project({
    dossierId: "b",
    company: "Ökonom GmbH",
    countryCode: "DE",
    stage: "negotiate",
    updatedAt: "2026-09-09T00:00:00.000Z",
    tasksOverdue: 2,
  });

  test("la recherche ignore la casse et les accents", () => {
    expect(matchesSearch(beta, "okonom")).toBe(true);
    expect(matchesSearch(alpha, "k motor")).toBe(true);
    expect(matchesSearch(alpha, "porte verrou")).toBe(true);
    expect(matchesSearch(alpha, "inconnu")).toBe(false);
  });

  test("la recherche porte sur les données saisies : elle ne dépend pas de la langue", () => {
    const results = ["fr", "de", "ru", "zh", "es", "it", "pt", "en"].map(
      () => filterProjects([alpha, beta], { search: "K Motor" }).map((p) => p.dossierId),
    );
    expect(new Set(results.map((r) => r.join(","))).size).toBe(1);
    expect(results[0]).toEqual(["a"]);
  });

  test("filtres par étape, pays et responsable", () => {
    expect(filterProjects([alpha, beta], { stages: ["negotiate"] }).map((p) => p.dossierId)).toEqual([
      "b",
    ]);
    expect(filterProjects([alpha, beta], { countryCode: "fr" }).map((p) => p.dossierId)).toEqual([
      "a",
    ]);
    expect(
      filterProjects([alpha, beta], { salesPersonId: "nobody" }).map((p) => p.dossierId),
    ).toEqual([]);
  });

  test("le filtre « en retard » s'appuie sur des faits, pas sur une supposition", () => {
    expect(filterProjects([alpha, beta], { onlyLate: true }).map((p) => p.dossierId)).toEqual(["b"]);
  });

  test("tris disponibles", () => {
    expect(sortProjects([alpha, beta], "updated_desc").map((p) => p.dossierId)).toEqual(["b", "a"]);
    expect(sortProjects([alpha, beta], "updated_asc").map((p) => p.dossierId)).toEqual(["a", "b"]);
    expect(sortProjects([alpha, beta], "company_asc").map((p) => p.dossierId)).toEqual(["a", "b"]);
  });
});

describe("saisies", () => {
  test("un champ vide vaut inconnu, pas zéro", () => {
    expect(parseAmountInput("")).toEqual({ ok: true, value: null });
    expect(parseVolumeInput("  ")).toEqual({ ok: true, value: null });
  });

  test("un zéro explicite est accepté", () => {
    expect(parseAmountInput("0")).toEqual({ ok: true, value: 0 });
  });

  test("virgule décimale et espaces acceptés", () => {
    expect(parseAmountInput(" 2,50 ")).toEqual({ ok: true, value: 2.5 });
  });

  test("valeurs impossibles refusées", () => {
    expect(parseAmountInput("-1")).toEqual({ ok: false, reason: "negative" });
    expect(parseAmountInput("abc")).toEqual({ ok: false, reason: "not_a_number" });
    expect(parseVolumeInput("2.5")).toEqual({ ok: false, reason: "not_a_number" });
    expect(parseVolumeInput("0")).toEqual({ ok: false, reason: "not_a_number" });
  });

  test("un montant sans devise n'invente pas l'euro", () => {
    expect(formatAmount(5000, null, "fr")).not.toContain("€");
    expect(formatAmount(5000, "EUR", "fr")).toContain("EUR");
  });
});

describe("notes SAP", () => {
  const date = new Date("2026-09-09T10:00:00.000Z");

  test("format d'en-tête exact", () => {
    expect(sapNoteHeader("Thomas Loarec", date)).toBe("09/09/2026 - Thomas Loarec :");
    expect(sapDate(new Date("2027-01-05T23:00:00.000Z"))).toBe("05/01/2027");
  });

  test("une note est déterministe et en anglais", () => {
    const body = composeSapNote("Gilles Servant", ["Stage changed from Lead to Qualification."], date);
    expect(body).toBe("09/09/2026 - Gilles Servant :\n- Stage changed from Lead to Qualification.");
    expect(composeSapNote("Gilles Servant", ["Stage changed from Lead to Qualification."], date)).toBe(
      body,
    );
  });

  test("sans ligne utile, il n'y a pas de note", () => {
    expect(composeSapNote("Gilles Servant", ["", "   "], date)).toBeNull();
  });

  test("un même événement n'apparaît qu'une fois", () => {
    const notes: SapNote[] = [
      { id: "1", createdAt: "2026-09-09T10:00:00Z", authorName: "A", eventKey: "stage:1", bodyEn: "x" },
      { id: "2", createdAt: "2026-09-09T11:00:00Z", authorName: "A", eventKey: "stage:1", bodyEn: "x" },
      { id: "3", createdAt: "2026-09-09T12:00:00Z", authorName: "A", eventKey: "price:1", bodyEn: "y" },
    ];
    expect(dedupeSapNotes(notes).map((n) => n.id)).toEqual(["1", "3"]);
    expect(sapNotesToText(notes).split("\n\n")).toHaveLength(3);
  });

  test("nom complet lisible", () => {
    expect(personFullName({ firstName: " Elena ", lastName: "Tischer" })).toBe("Elena Tischer");
  });
});
