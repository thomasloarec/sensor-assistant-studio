import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { createDossier, toClientDto } from "../src/lib/leadmagnet/dossier";
import { parseServerSnapshot } from "../src/lib/leadmagnet/dossier-io";
import { evaluateCandidates } from "../src/lib/leadmagnet/candidates";
import { suggestionFilters, blockedBy } from "../src/lib/leadmagnet/suggestion-filters";
import { pairCards, pairCardFor } from "../src/lib/leadmagnet/pair-cards";
import { sensorById, bladeOffsetZ, CUSTOM_SENSOR_ID } from "../src/lib/standex/sensor-catalog";
import {
  cableConstruction,
  isPcbSensor,
  housingMaterial,
  suggestedProjectTitle,
} from "../src/lib/leadmagnet/product-presentation";
import { DEFAULT_WORKSHOP, pairDemonstration } from "../src/lib/standex/magnetic-workshop";
import { mountingFromWorkshop, scenePoseSampler } from "../src/lib/standex/mounting/bridge";
import { simulateMounting } from "../src/lib/standex/mounting/simulate";
import { observedCycleVerdict } from "../src/lib/leadmagnet/tested-pairs";
import { salesContactFor, bookingUrl } from "../src/lib/leadmagnet/sales-contact";
import { projectChecklist } from "../src/lib/leadmagnet/project-checklist";
import { checkSubmission, technicalSummary } from "../src/lib/leadmagnet/submission";
import { INITIAL_NDA } from "../src/lib/leadmagnet/nda";
import { projectReportSections } from "../src/lib/leadmagnet/project-report";

describe("retours du 17 septembre : parcours et physique", () => {
  test("réservoir 15 mm vissé : aucun standard, mais sur mesure sans seuil inventé", () => {
    const d = createDossier();
    d.mounting = { kind: "screw" };
    d.envelope = { lengthMm: 15, widthMm: 15, heightMm: 15 };
    const all = evaluateCandidates(d);
    expect(all.filter((c) => c.status !== "excluded").map((c) => c.id)).toEqual([CUSTOM_SENSOR_ID]);
    const custom = pairCardFor(sensorById(CUSTOM_SENSOR_ID));
    expect(custom.maxPullInMm).toBeNull();
    expect(
      pairCards(
        all.map((c) => c.id),
        { limit: 100 },
      ).length,
    ).toBeGreaterThan(20);
  });
  test("lever l’encombrement rend réellement MK04 accessible sans réécrire les réponses", () => {
    const input = {
      mounting: { kind: "screw" as const },
      envelope: { lengthMm: 15, widthMm: 15, heightMm: 15 },
    };
    const filters = suggestionFilters(input);
    expect(blockedBy(sensorById("MK04"), filters, ["fixation", "encombrement"], input)).toContain(
      "encombrement",
    );
    expect(blockedBy(sensorById("MK04"), filters, ["fixation"], input)).toEqual([]);
    expect(input.envelope.lengthMm).toBe(15);
  });
  test("logement Ø8 : cylindriques retenus sous réserve de fixation et sans forcer un gros diamètre", () => {
    const d = createDossier();
    d.mounting = { kind: "press_fit", holeDiameterMm: 8 };
    const all = evaluateCandidates(d);
    expect(all.find((c) => c.id === "MK18")?.status).toBe("to_verify");
    expect(all.find((c) => c.id === "MK14")?.status).toBe("to_verify");
    const filters = suggestionFilters(d);
    expect(blockedBy(sensorById("MK18"), filters, ["fixation", "forme"], d)).toEqual([]);
  });
  for (const [sensor, magnet] of [
    ["MK04", "M04"],
    ["MK05", "M05"],
  ])
    test(`${sensor} + ${magnet} : scène et résultat détectent avec le couple par défaut`, () => {
      const config = pairDemonstration(
        { ...DEFAULT_WORKSHOP, geometry: "F1", lateralShift: 12, magnetTilt: 30 },
        sensor!,
        magnet!,
      );
      const mounting = mountingFromWorkshop(config);
      const sim = simulateMounting(mounting, 600, undefined, scenePoseSampler(config));
      expect(sim.coverage).toBe("covered");
      expect(sim.samples.some((s) => s.contact === "closed")).toBe(true);
      expect(sim.samples.some((s) => s.contact === "open")).toBe(true);
      expect(observedCycleVerdict(sim, true)).toBe("expected");
      const dossier = createDossier();
      dossier.selectedSensorId = sensor!;
      dossier.workshop = config;
      expect(
        projectReportSections(dossier)
          .find((s) => s.title === "Configuration du montage")
          ?.entries.find((e) => e.label === "Le résultat")?.value,
      ).toBe("Détection prévue dans ce montage");
      const far = { ...config, start: 55, end: 50 };
      expect(
        observedCycleVerdict(
          simulateMounting(mountingFromWorkshop(far), 600, undefined, scenePoseSampler(far)),
          true,
        ),
      ).toBe("none");
      const shifted = { ...config, lateralShift: 40 };
      expect(observedCycleVerdict(simulateMounting(mountingFromWorkshop(shifted)), true)).toBe(
        "undocumented",
      );
    });
  test("matériaux MK11, câbles et MK26 partagent une définition cohérente", () => {
    expect(housingMaterial(sensorById("MK11-P-M8"))).toContain("plastique");
    expect(housingMaterial(sensorById("MK11-B-M6"))).toContain("laiton");
    expect(housingMaterial(sensorById("MK11-M8"))).toContain("inoxydable");
    expect(cableConstruction(sensorById("MK18"))).toBe("wires");
    expect(cableConstruction(sensorById("MK27"))).toBe("metal");
    expect(cableConstruction(sensorById("MK04"))).toBe("jacket");
    const m = sensorById("MK26");
    expect(m.shape).toBe("block");
    expect(m.holes).toHaveLength(2);
    for (const h of m.holes!) expect(Math.abs(bladeOffsetZ(m) - h[1])).toBeGreaterThan(h[3] / 2);
  });
  test("PCB : pas de câble dans les données transmises, la checklist ni le résumé", () => {
    const d = createDossier();
    d.selectedSensorId = "MK31";
    d.workshop = { ...DEFAULT_WORKSHOP, sensorId: "MK31", cableLengthMm: 900 };
    expect(isPcbSensor("MK31")).toBe(true);
    expect(toClientDto(d).workshop?.cableLengthMm).toBeNull();
    expect(d.workshop.cableLengthMm).toBe(900); // draft preserved when switching back
    expect(projectChecklist(d).some((c) => c.id === "cable" || c.id === "connecteur")).toBe(false);
    expect(technicalSummary(d)).toContain("non applicables");
  });
  test("ville et pays survivent à une reprise, anciens dossiers acceptés à la lecture", async () => {
    const d = createDossier();
    d.business.siteCity = "Lyon";
    d.business.siteCountry = "FR";
    const restored = parseServerSnapshot(toClientDto(d));
    expect(restored.ok).toBe(true);
    if (restored.ok) expect(restored.dossier.business.siteCity).toBe("Lyon");
    delete d.business.siteCity;
    delete d.business.siteCountry;
    expect(parseServerSnapshot(toClientDto(d)).ok).toBe(true);
    const check = await checkSubmission({
      dossier: d,
      nda: INITIAL_NDA,
      consents: [],
      reviewAcknowledged: true,
      additionalConstraints: "",
    });
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.problems.join(" ")).toContain("ville et le pays");
  });
  test("responsables territoriaux et rendez-vous non simulés", () => {
    expect(salesContactFor("FR")?.name).toBe("Thomas LOAREC");
    expect(salesContactFor("DE")?.name).toBe("Thomas FRANKE");
    expect(salesContactFor("US")?.name).toBe("Hemant SINGH");
    expect(salesContactFor(null)).toBeNull();
    expect(bookingUrl(undefined)).toBeNull();
    expect(bookingUrl("javascript:alert(1)")).toBeNull();
    expect(bookingUrl("https://calendly.com/example")).toContain("https:");
    expect(suggestedProjectTitle("Détecter le réservoir. Autre phrase.")).toBe(
      "Détecter le réservoir",
    );
  });
});

test("PostgreSQL : nouvelles soumissions sans ville/pays refusées, historique inchangé", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create schema lead; create schema lead_priv;
      create table lead.design_revisions(id serial, dossier_id uuid, revision int, snapshot jsonb);
      insert into lead.design_revisions(snapshot) values ('{}');
      create table lead.design_dossiers(id uuid primary key,title text,current_revision int,nda_status text,created_at timestamptz,updated_at timestamptz);
      create table lead.dossier_crm(dossier_id uuid,stage text,stage_since timestamptz,company text,project_name text,country_code text,sales_person uuid,fae_person uuid,currency text,unit_price numeric,unit_cost numeric,cost_in_sap boolean,annual_volume_override int,estimated_annual_revenue numeric,series_launch date,updated_at timestamptz,version int);
      create table lead.dossier_tasks(dossier_id uuid,status text,due_on date,activated_at timestamptz,stage text,sort_order int,created_at timestamptz);
      create function lead_priv.crm_submitted_volume(uuid) returns integer language sql as $$ select null::integer $$;`);
    const existing = readFileSync("supabase/schema/migration_v1.8_crm_dashboard.sql", "utf8");
    await db.exec(
      existing.slice(
        existing.indexOf("create or replace function lead_priv.crm_submitted_business"),
        existing.indexOf("create or replace function lead_priv.crm_row_json"),
      ),
    );
    const file = readdirSync("supabase/migrations").find((f) =>
      f.endsWith("feedback_20260917_site_location.sql"),
    )!;
    const sql = readFileSync(`supabase/migrations/${file}`, "utf8");
    await db.exec(sql);
    await expect(
      db.query("insert into lead.design_revisions(snapshot) values ($1)", [
        JSON.stringify({ business: { siteCountry: "FR" } }),
      ]),
    ).rejects.toThrow("SITE_LOCATION_REQUIRED");
    for (const code of ["FR", "DE", "IN"])
      await db.query("insert into lead.design_revisions(snapshot) values ($1)", [
        JSON.stringify({ business: { siteCountry: code, siteCity: "Site test" } }),
      ]);
    expect((await db.query("select * from lead.design_revisions")).rows).toHaveLength(4);
    await expect(
      db.query("insert into lead.design_revisions(snapshot) values ($1)", [
        JSON.stringify({ business: { siteCountry: "ZZ", siteCity: "Test" } }),
      ]),
    ).rejects.toThrow("SITE_LOCATION_REQUIRED");
    const id = "00000000-0000-0000-0000-000000000001";
    await db.query("insert into lead.design_dossiers(id,title) values ($1,'Synthetic QA')", [id]);
    for (const [code, contact] of [
      ["FR", "Thomas LOAREC"],
      ["DE", "Thomas FRANKE"],
      ["IN", "Hemant SINGH"],
    ]) {
      await db.query(
        "insert into lead.design_revisions(dossier_id,revision,snapshot) values ($1,(select count(*) from lead.design_revisions),$2)",
        [id, JSON.stringify({ business: { siteCity: "Site test", siteCountry: code } })],
      );
      const row = (
        await db.query<{
          payload: { country_code: string; site_city: string; sales_contact_suggested: string };
        }>("select lead_priv.crm_row_json($1) as payload", [id])
      ).rows[0]!.payload;
      expect(row.country_code).toBe(code);
      expect(row.site_city).toBe("Site test");
      expect(row.sales_contact_suggested).toBe(contact);
    }
    await db.query("insert into lead.dossier_crm(dossier_id,country_code) values ($1,'US')", [id]);
    expect(
      (
        await db.query<{ code: string }>(
          "select lead_priv.crm_row_json($1)->>'country_code' as code",
          [id],
        )
      ).rows[0]!.code,
    ).toBe("US");
  } finally {
    await db.close();
  }
});
