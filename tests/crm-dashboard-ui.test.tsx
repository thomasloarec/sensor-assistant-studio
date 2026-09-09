/** Écrans du tableau de bord interne : ce qui est affiché, ce qui reste
 * interne, et ce que le serveur seul décide. Les contrôles portent sur le code
 * réellement branché, jamais sur une intention déclarée. */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { consoleLayout } from "../src/components/standex/console/dossier-console";
import {
  ClientLocaleHint,
  CrmUnavailableNotice,
  InternalEnglishHint,
  MarginCell,
  RevenueCell,
  VolumeCell,
  personName,
} from "../src/components/standex/dashboard/crm-shared";
import { submittedSourceLocale } from "../src/routes/standex.projects.$dossierId";
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
    ...patch,
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
    expect(crmConflictVersion({ message: "CRM_CONFLICT:7" })).toBe(7);
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
      // Le prix d'une OFFRE publiée garde sa source d'origine ; ce sont les
      // champs commerciaux internes du tableau de bord qui ne sortent jamais.
      expect(source).not.toContain("unit_cost");
      expect(source).not.toContain("crm_stage");
      expect(source).not.toContain("lead_crm");
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

describe("console des dossiers : en-tête et liste de dossiers", () => {
  test("intégrée sans dossier imposé, la liste de sélection reste affichée", () => {
    expect(consoleLayout({ embedded: true })).toEqual({ header: false, sidebar: true });
  });

  test("un dossier imposé masque la liste, pas les autres écrans", () => {
    expect(consoleLayout({ embedded: true, initialDossierId: "d1" })).toEqual({
      header: false,
      sidebar: false,
    });
  });

  test("la console autonome garde en-tête et liste", () => {
    expect(consoleLayout({})).toEqual({ header: true, sidebar: true });
  });

  test("les deux masquages restent réglables séparément", () => {
    expect(consoleLayout({ hideHeader: true, hideSidebar: false, initialDossierId: "d1" })).toEqual({
      header: false,
      sidebar: true,
    });
  });

  test("la route directe /standex/console n'impose aucun dossier et garde la sélection", () => {
    const route = readFileSync("src/routes/standex.console.tsx", "utf8");
    expect(route).not.toContain("initialDossierId");
    expect(route).not.toContain("hideSidebar");
  });
});

describe("indisponibilité de l'espace interne", () => {
  test("un visiteur ordinaire lit une phrase simple, sans détail technique", () => {
    const html = renderToStaticMarkup(
      <CrmUnavailableNotice
        plain="Le suivi des projets n'est pas encore activé sur ce serveur."
        detail="RPC lead_crm_capabilities absente : migration_v1.8_crm_dashboard.sql non appliquée."
        isAdmin={false}
      />,
    );
    expect(html).toContain("pas encore activé");
    expect(html).not.toContain("migration_v1.8");
    expect(html).not.toContain("lead_crm_capabilities");
    expect(html).not.toContain(".sql");
  });

  test("un administrateur voit le diagnostic technique", () => {
    const html = renderToStaticMarkup(
      <CrmUnavailableNotice
        plain="Le suivi des projets n'est pas encore activé sur ce serveur."
        detail="RPC lead_crm_capabilities absente : migration_v1.8_crm_dashboard.sql non appliquée."
        isAdmin
      />,
    );
    expect(html).toContain("migration_v1.8_crm_dashboard.sql");
  });
});

describe("langue de rédaction des champs", () => {
  test("un champ interne indique explicitement l'anglais", () => {
    const html = renderToStaticMarkup(<InternalEnglishHint />);
    expect(html).toContain("Interne");
    expect(html).toContain("anglais");
  });

  test("un champ client affiche la langue enregistrée du projet", () => {
    const html = renderToStaticMarkup(<ClientLocaleHint locale="de" />);
    expect(html).toContain("de");
    expect(html).toContain("client");
  });

  test("la langue client vient de la dernière version réellement envoyée", () => {
    expect(
      submittedSourceLocale({
        revisions: [{ snapshot: { sourceLocale: "fr" } }, { snapshot: { sourceLocale: "de" } }],
      } as never),
    ).toBe("de");
    expect(submittedSourceLocale(null)).toBeNull();
    expect(submittedSourceLocale({ revisions: [{ snapshot: {} }] } as never)).toBeNull();
  });

  test("le libellé de tâche et le motif « sans objet » portent la mention interne", () => {
    const src = readFileSync("src/routes/standex.projects.$dossierId.tsx", "utf8");
    expect(src).toContain("<InternalEnglishHint />");
    expect(src.match(/<InternalEnglishHint \/>/g)?.length).toBeGreaterThanOrEqual(2);
    expect(src).toContain("<ClientLocaleHint locale={clientLocale} />");
  });

  test("la portée de revue et la note interne de la console portent la mention interne", () => {
    const src = readFileSync("src/components/standex/console/dossier-console.tsx", "utf8");
    expect(src.match(/<InternalEnglishHint \/>/g)?.length).toBeGreaterThanOrEqual(2);
  });

  test("les notes SAP automatiques restent des phrases anglaises modèles", () => {
    const sql = readFileSync("supabase/schema/migration_v1.8_crm_dashboard.sql", "utf8");
    const fn = sql.slice(
      sql.indexOf("function lead_priv.crm_audit_sentence"),
      sql.indexOf("$$;", sql.indexOf("function lead_priv.crm_audit_sentence")),
    );
    expect(fn).toContain("Customer submitted design revision");
    // Aucun texte libre du client ou de l'équipe n'est recopié dans la note.
    for (const free of ["'message'", "'note'", "'internal_note'", "'client_message'", "'scope'"])
      expect(fn).not.toContain(free);
  });
});

describe("annuaire métier et droits Standex", () => {
  const src = readFileSync("src/routes/standex.admin.tsx", "utf8");

  test("un compte rattaché sans droit reçoit une action d'attribution explicite", () => {
    expect(src).toContain("staffByUser");
    expect(src).toContain("Accorder ce droit");
    expect(src).toContain("!staffByUser.has(p.userId)");
  });

  test("la fiche annuaire est modifiable (nom et fonction)", () => {
    expect(src).toContain("Enregistrer la fiche");
    expect(src).toContain("edit[p.id]?.firstName");
    expect(src).toContain("edit[p.id]?.role");
  });

  test("aucun compte n'est créé ni invité depuis cet écran", () => {
    expect(src).not.toMatch(/signUp|createUser|inviteUserByEmail/);
  });
});
