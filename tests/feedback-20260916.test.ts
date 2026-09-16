import { describe, expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import {
  createDossier,
  toClientDto,
  dossierHash,
  stableStringify,
} from "../src/lib/leadmagnet/dossier";
import {
  buildDossierExport,
  parseDossierExport,
  parseServerSnapshot,
} from "../src/lib/leadmagnet/dossier-io";
import { customLengthMm, standardLengthsMm } from "../src/lib/leadmagnet/cable-options";
import { projectReportSections, projectReportData } from "../src/lib/leadmagnet/project-report";
import { requirementAnswer } from "../src/lib/leadmagnet/requirement-answer";
import { imagePagesPdf } from "../src/lib/standex/studio-pdf";
import { pairCards } from "../src/lib/leadmagnet/pair-cards";
import { DEFAULT_WORKSHOP, poseAt, simulateCycle } from "../src/lib/standex/magnetic-workshop";
import { housingYawDeg } from "../src/lib/standex/housing-pose";
import { mountingFromWorkshop } from "../src/lib/standex/mounting/bridge";
import { approachAxisFor } from "../src/lib/standex/mounting/geometry";
import { simulateMounting } from "../src/lib/standex/mounting/simulate";
import { defaultMagnetFor } from "../src/lib/standex/default-pairs";
import { sensorById, bladeOffsetZ } from "../src/lib/standex/sensor-catalog";

function completeProject() {
  const d = createDossier();
  d.title = "Porte réfrigérateur – validation";
  d.business = {
    ...d.business,
    contactPhone: "+33 6 12 34 56 78",
    contactEmail: "qa@example.test",
    annualVolume: { kind: "known", sensorsPerYear: 12345 },
    seriesDurationYears: 7.5,
    samplesNeededBy: "2027-01-20",
    seriesStartDate: "2027-04-01",
    undefinedFields: [],
  };
  d.workshop = { ...DEFAULT_WORKSHOP, sensorId: "MK04", magnetModel: "M04", cableLengthMm: 725 };
  d.cabling = { ...d.cabling, lengthChoice: "custom_to_confirm" };
  d.termination = {
    kind: "free_reference",
    text: "REFERENCE-CLIENT-123",
    status: "to_verify_by_rnd",
  };
  d.internalNotes = [
    { id: "test", author: "test", createdAt: d.createdAt, body: "SECRET INTERNAL" },
  ];
  return d;
}

describe("retours 16/09 : données et export", () => {
  test("les choix structurés et le texte libre restent visibles ensemble", () => {
    const d = completeProject();
    d.mounting = { kind: "screw" };
    d.envelope = { ...d.envelope, lengthMm: 35 };
    expect(requirementAnswer(d, "mounting")).toBe("Fixation vissée");
    expect(requirementAnswer(d, "envelope")).toContain("35 mm");
    d.requirements = d.requirements.map((r) =>
      r.key === "mounting" ? { ...r, value: "Sur une équerre" } : r,
    );
    expect(requirementAnswer(d, "mounting")).toBe("Sur une équerre\nFixation vissée");
  });
  test("le PDF embarque les données complètes sans notes internes", () => {
    const data = JSON.stringify(projectReportData(completeProject(), { requis: true }));
    expect(data).toContain("725");
    expect(data).not.toContain("SECRET INTERNAL");
    const pdf = imagePagesPdf([], 1240, 1754, new TextEncoder().encode(data));
    const text = new TextDecoder().decode(pdf);
    expect(text).toStartWith("%PDF-1.4");
    expect(text).toContain("/EmbeddedFiles");
    expect(text).toContain("dossier-complet.json");
    expect(text).toContain("REFERENCE-CLIENT-123");
  });
  test("valeurs exactes conservées par export/import et reprise serveur", async () => {
    const d = completeProject();
    for (const imported of [
      parseDossierExport(buildDossierExport(d)),
      parseServerSnapshot(toClientDto(d)),
    ]) {
      expect(imported.ok).toBe(true);
      if (!imported.ok) continue;
      expect(imported.dossier.business).toEqual(d.business);
      expect(imported.dossier.workshop?.cableLengthMm).toBe(725);
      expect(imported.dossier.termination).toEqual(d.termination);
      expect(imported.dossier.internalNotes).toEqual([]);
    }
    const original = await dossierHash(toClientDto(d));
    d.business.contactPhone = "+33 6 99 99 99 99";
    expect(await dossierHash(toClientDto(d))).not.toBe(original);
  });
  test("anciens dossiers sans téléphone restent lisibles, inconnus explicites conservés", () => {
    const d = completeProject();
    delete d.business.contactPhone;
    delete d.business.undefinedFields;
    const old = parseServerSnapshot(toClientDto(d));
    expect(old.ok).toBe(true);
    if (old.ok) expect(old.dossier.business.contactPhone).toBeNull();
    d.business.annualVolume = { kind: "unknown" };
    d.business.undefinedFields = ["annualVolume", "seriesStartDate"];
    const restored = parseServerSnapshot(toClientDto(d));
    if (!restored.ok) throw new Error(restored.reason);
    expect(restored.dossier.business.annualVolume).toEqual({ kind: "unknown" });
    expect(restored.dossier.business.undefinedFields).toEqual(d.business.undefinedFields);
  });
  test("le rapport complet ne dépend pas d'une revue figée et contient projet, coordonnées, montage et NDA", () => {
    const d = completeProject();
    const report = JSON.stringify(
      projectReportSections(d, {
        requis: true,
        statut: "requested",
        contraintes: "CONTRAINTE TEST",
      }),
    );
    for (const value of [
      d.title,
      "12345",
      "+33 6 12 34 56 78",
      "2027-01-20",
      "7.5",
      "725",
      "REFERENCE-CLIENT-123",
      "M04",
      "CONTRAINTE TEST",
      "requested",
    ])
      expect(report).toContain(value);
    expect(report).not.toContain("SECRET INTERNAL");
    expect(report).not.toContain("internalNotes");
  });
  test("PostgreSQL conserve les champs additifs et le volume exact avec les fonctions SQL existantes", async () => {
    const db = new PGlite();
    try {
      const sql = readFileSync("supabase/schema/migration_v1.2_lead_magnet.sql", "utf8");
      await db.exec("create schema lead_priv; create table versions(snapshot jsonb not null)");
      await db.exec(
        sql.slice(
          sql.indexOf("create or replace function lead_priv.canonical_json"),
          sql.indexOf("create or replace function lead_priv.snapshot_hash"),
        ),
      );
      await db.exec(
        sql.slice(
          sql.indexOf("create or replace function lead_priv.json_number"),
          sql.indexOf("create or replace function lead_priv.json_num_ok"),
        ),
      );
      const dto = toClientDto(completeProject());
      await db.query("insert into versions values($1)", [JSON.stringify(dto)]);
      const row = (
        await db.query<{ snapshot: unknown; volume: number; valid: boolean; canonical: string }>(
          "select snapshot,lead_priv.annual_volume(snapshot) as volume,lead_priv.annual_volume_valid(snapshot) as valid,lead_priv.canonical_json(snapshot) as canonical from versions",
        )
      ).rows[0]!;
      expect(row.volume).toBe(12345);
      expect(row.valid).toBe(true);
      expect(row.canonical).toBe(stableStringify(dto));
      const restored = parseServerSnapshot(row.snapshot);
      expect(restored.ok).toBe(true);
      if (restored.ok) expect(restored.dossier.business.contactPhone).toBe("+33 6 12 34 56 78");
    } finally {
      await db.close();
    }
  });
});

describe("retours 16/09 : câble et couples", () => {
  test("longueurs fabricant et conversion cm/mm sans valeur inventée", () => {
    expect(standardLengthsMm("MK04")).toContain(300);
    expect(standardLengthsMm("MK21")).not.toContain(300);
    expect(standardLengthsMm("MK38")).toEqual([300]);
    expect(standardLengthsMm("UNKNOWN")).toEqual([]);
    expect(customLengthMm("72,5")).toBe(725);
    for (const invalid of ["", "0", "-12", "Infinity", "10001"])
      expect(customLengthMm(invalid)).toBeNull();
  });
  test("répétitions et références inconnues ne créent aucun couple supplémentaire", () => {
    const cards = pairCards(["MK04", "MK04", "MK13", "MISSING"], { limit: 20 });
    expect(cards.map((c) => c.sensorId).sort()).toEqual(["MK04", "MK13"]);
  });
});

describe("retours 16/09 : pose et honnêteté physique", () => {
  for (const id of ["MK04", "MK13", "MK02", "MK21", "MK05"])
    test(`${id} : corps actifs face à face, aucune distance F1 empruntée`, () => {
      const sensor = sensorById(id);
      expect(housingYawDeg(id)).toBe(180);
      expect(-bladeOffsetZ(sensor)).toBeGreaterThanOrEqual(0);
      expect(approachAxisFor("F1", id)).toEqual([0, 0, 1]);
      const c = {
        ...DEFAULT_WORKSHOP,
        sensorId: id,
        magnetModel: defaultMagnetFor(id),
        geometry: "F1" as const,
      };
      const pose = poseAt(c, 0);
      expect(pose.position[2]).toBeGreaterThan(0);
      const sim = simulateMounting(mountingFromWorkshop(c));
      expect(sim.coverage).not.toBe("covered");
      expect(sim.pullInMm).toBeNull();
      expect(sim.dropOutMm).toBeNull();
    });
  test("une polarité non caractérisée importée ne produit jamais de seuil publié", () => {
    const c = { ...DEFAULT_WORKSHOP, sensorId: "MK04", magnetModel: "M04", polarity: -1 as const };
    const sim = simulateMounting(mountingFromWorkshop(c));
    expect(sim.coverage).not.toBe("covered");
    expect(sim.pullInMm).toBeNull();
    expect(sim.dropOutMm).toBeNull();
    expect(sim.samples.every((s) => s.contact === "unknown")).toBe(true);
  });
});
