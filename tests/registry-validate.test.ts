import { describe, expect, test } from "bun:test";
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  rmSync,
  mkdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  validateBatch,
  importFiles,
  resolveInputs,
  calibrationBlockers,
  parseCsv,
  formatReport,
  header,
  SCHEMAS,
} from "../tools/registry-validate";
import type { RegistryId, Row } from "../tools/registry-validate";
import { MK03_DISTANCES } from "../src/lib/standex/magnetic-workshop";
import { SENSOR_CATALOG, MAGNET_REFERENCE } from "../src/lib/standex/sensor-catalog";

// Entirely synthetic physical inputs, never copied to the application registries.
const provenance = {
  source_type: "measured",
  source_ref: "FIXTURE SYNTHÉTIQUE sans valeur produit",
  entered_by: "Test automatique",
  entered_on: "2026-09-10",
  confidence: "high",
};
const transcription = { transcribed_by: "Test automatique", transcribed_on: "2026-09-10" };
const fixture: Record<RegistryId, Row[]> = {
  R1: [
    {
      magnet_id: "TEST-M",
      designation: "Aimant synthétique",
      shape: "block",
      dim_a_mm: 20,
      dim_b_mm: 10,
      dim_c_mm: 5,
      magnetization_axis: "c",
      material_family: "NdFeB",
      br_mt_20c: 1000,
      ...provenance,
    },
  ],
  R2: [
    {
      calibration_id: "CAL-9001",
      sensor_family: "MK03",
      sensitivity_class: "B",
      contact_form: "1A",
      magnet_id: "TEST-M",
      approach_id: "TEST-D",
      datum_id: "TEST-FACE",
      pull_in_mm: 10,
      drop_out_mm: 12,
      temperature_c: 20,
      value_type: "measured_sample",
      sample_count: 1,
      ...provenance,
    },
  ],
  R2b: [
    {
      approach_id: "TEST-D",
      label_source: "Fixture",
      figure_ref: "FIXTURE SYNTHÉTIQUE",
      motion_axis: "z",
      magnet_orientation_deg: "0/0/0",
      description_fr: "Approche de test sans valeur produit.",
      ambiguous: false,
      ...transcription,
    },
  ],
  R2c: [
    {
      datum_id: "TEST-FACE",
      sensor_family: "MK03",
      reference_feature: "Face synthétique",
      figure_ref: "FIXTURE SYNTHÉTIQUE",
      mrp_known: false,
      ...transcription,
    },
  ],
  R3: [
    {
      case_id: "CAS-2026-9001",
      client_masked: "CLI-9001",
      sector: "industrie",
      application_short_fr: '  Texte synthétique ; "ne pas corriger"\nSuite.  ',
      detected_object: "pièce mobile",
      motion_type: "translation",
      actuation_principle: "aimant sur pièce mobile",
      electrical_role: "inconnu",
      outcome: "inconnu",
      source_document: "FIXTURE SYNTHÉTIQUE",
      entered_by: "Test automatique",
      entered_on: "2026-09-10",
      confidence: "high",
    },
  ],
  R3b: [
    {
      case_id: "CAS-2026-9001",
      product_reference: "TEST-M",
      role: "aimant",
      quantity_per_unit: 1,
      note_fr: "Fixture uniquement",
    },
  ],
};
const csv = (id: RegistryId, rows: Row[]) =>
  header(id) +
  "\n" +
  rows
    .map((r) =>
      SCHEMAS[id].fields
        .map((f) => {
          const value = String(r[f.name] ?? "");
          return /[;"\n]/.test(value) ? '"' + value.replaceAll('"', '""') + '"' : value;
        })
        .join(";"),
    )
    .map((l) => l + "\n")
    .join("");
const inputs = (data = fixture, version = 1) =>
  (Object.keys(data) as RegistryId[]).map((id) => ({
    name: `${SCHEMAS[id].stem}_V${version}.csv`,
    text: csv(id, data[id]),
  }));
const mutated = (id: RegistryId, changes: Row) => {
  const data = structuredClone(fixture);
  Object.assign(data[id][0]!, changes);
  return inputs(data);
};
const invalid = (id: RegistryId, changes: Row, column: string) => {
  const result = validateBatch(mutated(id, changes));
  expect(result.ok).toBe(false);
  expect(result.issues.some((i) => i.column === column && i.severity === "error")).toBe(true);
};

describe("T0 — registres données-gated", () => {
  test("T0.1 les six registres synthétiques et leurs références sont acceptés", () => {
    const result = validateBatch(inputs(), true);
    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.snapshots[0]!.rows[0]!["br_mt_20c"]).toBe(1000);
    expect(result.snapshots[0]!.rows[0]!["br_tolerance_pct"]).toBeNull();
  });
  test("T0.2 en-tête exact, ordonné, sans colonnes privées ou supplémentaires", () => {
    for (const badHeader of [
      header("R1") + ";extra",
      header("R1").split(";").reverse().join(";"),
      header("R1").replace("designation", "client_real_name"),
    ]) {
      const result = validateBatch([{ name: "R1_aimants_V1.csv", text: badHeader + "\n" }]);
      expect(result.ok).toBe(false);
      expect(result.issues[0]!.message).toContain(header("R1"));
      expect(result.snapshots).toEqual([]);
    }
  });
  test("T0.3 UTF-8 sans BOM, LF, virgule décimale refusée", () => {
    for (const text of [
      "\uFEFF" + csv("R1", fixture.R1),
      csv("R1", fixture.R1).replaceAll("\n", "\r\n"),
    ])
      expect(validateBatch([{ name: "R1_aimants_V1.csv", text }]).ok).toBe(false);
    for (const value of ["NaN", "Infinity", "1,2", "1e3", " 2", "0x10"])
      invalid("R1", { dim_a_mm: value }, "dim_a_mm");
  });
  test("T0.4 dates et booléens stricts", () => {
    invalid("R1", { entered_on: "2026-02-30" }, "entered_on");
    invalid("R2b", { ambiguous: "oui" }, "ambiguous");
  });
  test("T0.5 contrôles géométriques et température R1", () => {
    invalid("R1", { dim_a_mm: 0 }, "dim_a_mm");
    invalid("R1", { dim_b_mm: null }, "dim_b_mm");
    invalid("R1", { shape: "ring", dim_b_mm: null, inner_diameter_mm: 21 }, "inner_diameter_mm");
    invalid("R1", { max_service_temp_c: 80 }, "max_service_temp_source");
    invalid("R1", { br_tolerance_pct: -1 }, "br_tolerance_pct");
  });
  test("T0.6 relâchement strictement supérieur à l'enclenchement", () => {
    invalid("R2", { drop_out_mm: 10 }, "drop_out_mm");
    invalid("R2", { drop_out_mm: 9 }, "drop_out_mm");
  });
  test("T0.7 mesures et échantillons", () => {
    invalid("R2", { sample_count: null }, "sample_count");
    invalid("R2", { sample_count: 1.5 }, "sample_count");
    invalid("R2", { source_type: "published_table" }, "source_type");
  });
  test("T0.8 approche : aucun angle deviné, décalage complet", () => {
    invalid("R2b", { magnet_orientation_deg: "0/0" }, "magnet_orientation_deg");
    invalid("R2b", { offset_axis: "x" }, "offset_mm");
  });
  test("T0.9 datum connu nécessite une valeur sourcée", () => {
    invalid("R2c", { mrp_known: true }, "offset_to_mrp_mm");
    invalid("R2c", { offset_to_mrp_mm: 2 }, "offset_to_mrp_mm");
  });
  test("T0.10 intégrité catalogue, aimant, approche, datum et famille du datum", () => {
    invalid("R2", { sensor_family: "INCONNU" }, "sensor_family");
    invalid("R2", { sensor_family: "GENERIC" }, "sensor_family");
    invalid("R2", { magnet_id: "ABSENT" }, "magnet_id");
    invalid("R2", { approach_id: "ABSENT" }, "approach_id");
    invalid("R2", { datum_id: "ABSENT" }, "datum_id");
    const data = structuredClone(fixture);
    data.R2c[0]!["sensor_family"] = "MK04";
    expect(validateBatch(inputs(data)).issues.some((i) => i.column === "datum_id")).toBe(true);
  });
  test("T0.11 mutation : vider chaque dépendance fait refuser R2", () => {
    for (const id of ["R1", "R2b", "R2c"] as const) {
      const data = structuredClone(fixture);
      data[id] = [];
      expect(validateBatch(inputs(data)).ok).toBe(false);
    }
    const data = structuredClone(fixture);
    data.R2 = [];
    const result = validateBatch(inputs(data));
    expect(result.ok).toBe(true);
    expect(result.snapshots.find((s) => s.registry === "R2")!.rows).toEqual([]);
  });
  test("T0.12 strict transforme les avertissements en erreurs", () => {
    for (const [id, change] of [
      ["R1", { confidence: "low" }],
      ["R1", { source_type: "inferred" }],
      ["R2b", { ambiguous: true }],
    ] as [RegistryId, Row][]) {
      expect(validateBatch(mutated(id, change)).ok).toBe(true);
      expect(validateBatch(mutated(id, change), true).ok).toBe(false);
    }
  });
  test("T0.13 absence de Br : null et MAGNET_BR_UNKNOWN sans valeur de repli", () => {
    const result = validateBatch(mutated("R1", { br_mt_20c: null }));
    expect(result.ok).toBe(true);
    expect(
      calibrationBlockers(
        result.snapshots.find((s) => s.registry === "R2")!.rows[0]!,
        result.snapshots,
      ),
    ).toEqual(["MAGNET_BR_UNKNOWN"]);
    expect(formatReport(result)).toContain("1/1 lignes inutilisables");
  });
  test("T0.14 provenance et verbatim conservés exactement, guillemets et LF inclus", () => {
    const r = validateBatch(inputs());
    expect(r.snapshots.find((s) => s.registry === "R3")!.rows[0]!["application_short_fr"]).toBe(
      fixture.R3[0]!["application_short_fr"],
    );
    expect(r.snapshots[0]!.rows[0]!["source_ref"]).toBe(provenance.source_ref);
    expect(r.snapshots[0]!.sha256).toHaveLength(64);
  });
  test("T0.15 nature de la tension obligatoire même pour zéro", () => {
    invalid("R3", { switched_voltage_v: 0 }, "voltage_nature");
    invalid("R3", { environment: "aucun|humide" }, "environment");
  });
  test("T0.16 correction R3 : référence, unicité, cycles", () => {
    invalid("R3", { supersedes_case_id: "CAS-2026-9001" }, "supersedes_case_id");
    invalid("R3", { supersedes_case_id: "CAS-2026-9999" }, "supersedes_case_id");
    const data = structuredClone(fixture);
    data.R3.push({ ...data.R3[0], case_id: "CAS-2026-9002", supersedes_case_id: "CAS-2026-9001" });
    expect(validateBatch(inputs(data)).ok).toBe(true);
    data.R3.push({ ...data.R3[0], case_id: "CAS-2026-9003", supersedes_case_id: "CAS-2026-9001" });
    expect(validateBatch(inputs(data)).ok).toBe(false);
  });
  test("T0.17 doublons et produits orphelins refusés", () => {
    const data = structuredClone(fixture);
    data.R1.push({ ...data.R1[0] });
    expect(validateBatch(inputs(data)).ok).toBe(false);
    invalid("R3b", { case_id: "CAS-2026-9999" }, "case_id");
  });
  test("T0.18 CSV mal formé et commentaires", () => {
    expect(
      validateBatch([
        { name: "R1_aimants_V1.csv", text: "# Avant l'en-tête\n" + csv("R1", fixture.R1) },
      ]).ok,
    ).toBe(false);
    expect(() => parseCsv('a;b\n"pas fini')).toThrow();
    expect(() => parseCsv('a;b\n"fini"x;b')).toThrow();
    expect(parseCsv("a;b\n# Exemple ignoré\nx;y\n")[1]!.line).toBe(3);
  });
  test("T0.19 versions immuables et R3 append-only", () => {
    const previous = validateBatch(inputs()).snapshots;
    expect(validateBatch(mutated("R1", { designation: "Modifié" }), false, previous).ok).toBe(
      false,
    );
    const data = structuredClone(fixture);
    data.R3[0]!["application_short_fr"] = "Modifié";
    expect(validateBatch(inputs(data, 2), false, previous).ok).toBe(false);
    data.R3 = [];
    expect(validateBatch(inputs(data, 2), false, previous).ok).toBe(false);
  });
  test("T0.20 remplacer R1 par vide ne conserve pas une ancienne dépendance valide", () => {
    const previous = validateBatch(inputs()).snapshots;
    expect(
      validateBatch([{ name: "R1_aimants_V2.csv", text: header("R1") + "\n" }], false, previous).ok,
    ).toBe(false);
  });
  test("T0.21 import atomique : aucune écriture sur erreur, y compris en fin de lot", () => {
    const dir = mkdtempSync(join(tmpdir(), "studio-v2-test-"));
    try {
      const paths = inputs().map((i) => {
        const p = join(dir, i.name);
        writeFileSync(p, i.text);
        return p;
      });
      const options = {
        outputDir: join(dir, "output"),
        indexPath: join(dir, "INDEX.md"),
        today: "2026-09-10",
      };
      expect(importFiles(paths, options).ok).toBe(true);
      const before = readFileSync(join(options.outputDir, "R1.json"), "utf8"),
        indexBefore = readFileSync(options.indexPath, "utf8");
      const broken = inputs(structuredClone(fixture), 2);
      broken[broken.length - 1]!.text += "erreur\n";
      const badPaths = broken.map((i) => {
        const p = join(dir, i.name);
        writeFileSync(p, i.text);
        return p;
      });
      expect(importFiles(badPaths, options).ok).toBe(false);
      expect(readFileSync(join(options.outputDir, "R1.json"), "utf8")).toBe(before);
      expect(readFileSync(options.indexPath, "utf8")).toBe(indexBefore);
      expect(existsSync(join(options.outputDir, "history/R1_V2.json"))).toBe(false);
      expect(importFiles(paths, options).ok).toBe(true);
      expect(readFileSync(options.indexPath, "utf8")).toBe(indexBefore);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  test("T0.22 mode check et UTF-8 invalide n'écrivent rien", () => {
    const dir = mkdtempSync(join(tmpdir(), "studio-v2-test-"));
    try {
      const p = join(dir, "R1_aimants_V1.csv"),
        options = { outputDir: join(dir, "out"), indexPath: join(dir, "INDEX.md") };
      writeFileSync(p, csv("R1", fixture.R1));
      expect(importFiles([p], { ...options, check: true }).ok).toBe(true);
      expect(existsSync(options.outputDir)).toBe(false);
      writeFileSync(p, Buffer.from([0xc3, 0x28]));
      expect(importFiles([p], options).ok).toBe(false);
      expect(existsSync(options.outputDir)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  test("T0.23 privé refusé avant lecture et glob ne sélectionne ni privé ni modèle", () => {
    const dir = mkdtempSync(join(tmpdir(), "studio-v2-test-"));
    try {
      writeFileSync(join(dir, "R1_aimants_V2.csv"), header("R1") + "\n");
      writeFileSync(join(dir, "R1_aimants_V10.csv"), header("R1") + "\n");
      writeFileSync(join(dir, "R1_aimants_MODELE.csv"), "exemple");
      mkdirSync(join(dir, "R3c_clients_prives.csv"));
      expect(resolveInputs([dir])).toEqual([join(dir, "R1_aimants_V10.csv")]);
      expect(
        importFiles([join(dir, "R3c_clients_prives.csv")], {
          outputDir: join(dir, "out"),
          indexPath: join(dir, "INDEX.md"),
        }).ok,
      ).toBe(false);
      expect(existsSync(join(dir, "out"))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  test("T0.24 transcriptions MK03 identiques au témoin HEAD", () => {
    const source = readFileSync("registres/en-attente/R2_calibration_capteurs_V1.csv", "utf8");
    const parsed = parseCsv(source);
    const keys = parsed[0]!.cells;
    expect(parsed.length - 1).toBe(8);
    for (const line of parsed.slice(1)) {
      const r = Object.fromEntries(keys.map((k, i) => [k, line.cells[i]]));
      const pair =
        MK03_DISTANCES[r["sensitivity_class"] as keyof typeof MK03_DISTANCES][
          r["approach_id"] as "D1" | "D3"
        ];
      expect([Number(r["pull_in_mm"]), Number(r["drop_out_mm"])]).toEqual(pair);
    }
    expect(MAGNET_REFERENCE).toEqual({ length: 32.4, height: 10, width: 16.7 });
    expect(SENSOR_CATALOG.filter((s) => s.sourceFile !== null).length).toBe(29);
  });
  test("T0.25 contrôle de fuite dans tous les JSON applicatifs", () => {
    const walk = (dir: string): string[] =>
      existsSync(dir)
        ? readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
            e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
          )
        : [];
    for (const path of walk("src/data/registries")) {
      expect(path).not.toContain("R3c");
      expect(readFileSync(path, "utf8")).not.toContain("client_real_name");
    }
    expect(readFileSync(".gitignore", "utf8")).toContain("R3c_clients_prives");
  });
});
