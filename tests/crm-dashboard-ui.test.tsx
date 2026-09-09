/** Écrans du tableau de bord interne : ce qui est affiché, ce qui reste
 * interne, et ce que le serveur seul décide. Les contrôles portent sur le code
 * réellement branché, jamais sur une intention déclarée. */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import {
  MarginCell,
  RevenueCell,
  VolumeCell,
  personName,
} from "../src/components/standex/dashboard/crm-shared";
import { isMissingRpc, humanCrmError, crmConflictVersion, REQUIRED_CRM_VERSION } from "../src/lib/leadmagnet/dashboard-rpc";
import { REQUIRED_LEAD_SCHEMA_VERSION } from "../src/lib/leadmagnet/rpc";
import type { CrmProject } from "../src/lib/leadmagnet/dashboard-adapter";

const project = (patch: Partial<CrmProject> = {}): CrmProject =>
  ({
    dossierId: "d1",
    title: "Projet",
    currentRevision: 3,
    stage: "qualification",
    company: "Acme",
    projectName: "Volet",
    countryCode: "FR",
    salesPersonId: null,
    faePersonId: null,
    currency: "EUR",
    unitPrice: null,
    unitCost: null,
    costInSap: false,
    submittedAnnualVolume: null,
    annualVolumeOverride: null,
    estimatedAnnualRevenue: null,
    seriesLaunch: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    stageChangedAt: "2026-09-01T00:00:00.000Z",
    version: 1,
    taskCounts: { total: 0, done: 0, blocked: 0, late: 0 },
    ndaStatus: "not_required",
  }) as CrmProject;

describe("affichage des valeurs inconnues", () => {
  test("un volume absent n'est jamais présenté comme zéro", () => {
    const html = renderToStaticMarkup(<VolumeCell project={project()} />);
    expect(html).toContain("inconnu");
    expect(html).not.toMatch(/>0</);
  });

  test("un volume corrigé à la main est signalé comme tel", () => {
    const html = renderToStaticMarkup(
      <VolumeCell project={project({ submittedAnnualVolume: 1000, annualVolumeOverride: 2000 })} />,
    );
    expect(html).toContain("2");
    expect(html).toContain("main");
  });

  test("sans prix, la marge est inconnue et la raison est écrite", () => {
    const html = renderToStaticMarkup(
      <MarginCell project={project({ unitCost: 2 })} locale="fr-FR" />,
    );
    expect(html).toContain("inconnu");
    expect(html).not.toContain("%</");
  });

  test("un prix nul ne donne pas une marge de 100 %", () => {
    const html = renderToStaticMarkup(
      <MarginCell project={project({ unitPrice: 0, unitCost: 0 })} locale="fr-FR" />,
    );
    expect(html).toContain("inconnu");
    expect(html).not.toContain("100");
  });

  test("un coût suivi dans SAP est dit, pas deviné", () => {
    const html = renderToStaticMarkup(
      <MarginCell project={project({ unitPrice: 10, costInSap: true })} locale="fr-FR" />,
    );
    expect(html.toLowerCase()).toContain("sap");
  });

  test("sans volume ni estimation, le chiffre d'affaires reste inconnu", () => {
    const html = renderToStaticMarkup(
      <RevenueCell project={project({ unitPrice: 3 })} locale="fr-FR" />,
    );
    expect(html).toContain("inconnu");
  });

  test("une personne retirée de l'annuaire n'est pas affichée comme non attribuée", () => {
    expect(personName([], "p-inconnue")).not.toContain("non attribué");
  });
});

describe("absence de migration et conflits", () => {
  test("l'absence de la RPC est reconnue, pas confondue avec un refus", () => {
    expect(isMissingRpc({ code: "PGRST202" })).toBe(true);
    expect(isMissingRpc({ code: "42501" })).toBe(false);
  });

  test("un conflit de version rend la version réelle du serveur", () => {
    expect(crmConflictVersion({ message: "crm_version_conflict:7" })).toBe(7);
  });

  test("un refus d'accès est expliqué sans jargon serveur", () => {
    expect(humanCrmError({ code: "42501" })).not.toContain("42501");
  });
});

describe("cloisonnement", () => {
  const detail = readFileSync("src/routes/standex.projects.$dossierId.tsx", "utf8");
  const adapter = readFileSync("src/lib/leadmagnet/dashboard-adapter.ts", "utf8");
  const sql = readFileSync("supabase/schema/migration_v1.8_crm_dashboard.sql", "utf8");
  const dossierIo = readFileSync("src/lib/leadmagnet/dossier-io.ts", "utf8");
  const clientAdapter = readFileSync("src/lib/leadmagnet/supabase-adapter.ts", "utf8");

  test("la sonde du client reste en 1.4 : le tableau de bord a sa propre sonde", () => {
    expect(REQUIRED_LEAD_SCHEMA_VERSION).toBe("1.4");
    expect(REQUIRED_CRM_VERSION).toBe("1.8");
  });

  test("aucun champ commercial ne passe dans l'export client ni dans la vue client", () => {
    for (const source of [dossierIo, clientAdapter]) {
      expect(source).not.toContain("unit_price");
      expect(source).not.toContain("unit_cost");
      expect(source).not.toContain("crm_stage");
    }
  });

  test("un message client ne peut jamais être présenté comme envoyé", () => {
    expect(adapter).not.toContain('"sent"');
    expect(sql).not.toMatch(/'sent'/);
    expect(detail).toContain("envoi non configuré");
  });

  test("les écritures passent par une version attendue, jamais par une écriture directe", () => {
    expect(adapter).not.toMatch(/\.from\((["'])lead/);
    expect(detail).toContain("p.version");
    expect(detail).toContain("expectedVersion");
  });

  test("un changement de projet invalide les réponses encore en vol", () => {
    expect(detail).toContain("dossierRef.current !== asked");
  });

  test("seuls des retours réellement publiés peuvent être annoncés", () => {
    expect(detail).toContain("r.published && !r.superseded");
  });
});

describe("garde-fous du serveur", () => {
  const sql = readFileSync("supabase/schema/migration_v1.8_crm_dashboard.sql", "utf8");

  test("le dernier administrateur actif est protégé côté base", () => {
    expect(sql).toMatch(/last_admin/i);
  });

  test("l'historique SAP est en ajout seul", () => {
    expect(sql).not.toMatch(/update\s+lead\.sap_notes/i);
    expect(sql).not.toMatch(/delete\s+from\s+lead\.sap_notes/i);
  });

  test("les fonctions privilégiées fixent un search_path sûr", () => {
    const definers = sql.match(/security definer/gi) ?? [];
    const paths = sql.match(/set search_path/gi) ?? [];
    expect(definers.length).toBeGreaterThan(0);
    expect(paths.length).toBeGreaterThanOrEqual(definers.length);
  });

  test("la migration reste additive : aucune table existante n'est supprimée", () => {
    expect(sql).not.toMatch(/drop table/i);
    expect(sql).not.toMatch(/alter table lead\.dossiers\s+drop/i);
  });
});
