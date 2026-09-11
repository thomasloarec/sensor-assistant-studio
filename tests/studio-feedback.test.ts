import { test, expect } from "bun:test";
import { unzipSync, strFromU8 } from "fflate";
import { readFile } from "node:fs/promises";
import { PUBLISHED_REGISTRY } from "../src/lib/standex/magnetics/registries";
import conflicts from "../src/data/studio-v2/source-conflicts.json";
import { evaluateReference, EMPTY_NEED } from "../src/lib/standex/magnetics/margin";
import { needIssues } from "../src/lib/standex/magnetics/need-issues";
import { newStudy, deriveStudioFields } from "../src/lib/standex/studio-dossier";
import {
  DEFAULT_WORKSHOP,
  simulateCycle,
  type WorkshopConfig,
} from "../src/lib/standex/magnetic-workshop";
import { COFFEE_ASSEMBLY } from "../src/lib/standex/machine-assembly";
import { storeMachineFileInMemory, loadMachineAsset } from "../src/lib/standex/machine-assets";
import { createDesignFreeze } from "../src/lib/standex/design-freeze";
import { studioExportSheets, workbookBytes } from "../src/lib/standex/studio-exports";
const need = { ...EMPTY_NEED, gapClosedMm: 7.5, gapOpenMm: 22, gapToleranceMm: 0.5 };
const domain = { referencePose: true, ferrous: false };
const key = {
  sensorFamily: "MK03",
  sensitivityClass: "B",
  magnetId: "M02",
  approachId: "D1" as const,
};
test("R04 published references cover thirteen families and all five paths, with auditable sources", () => {
  expect(PUBLISHED_REGISTRY.rows).toHaveLength(258);
  expect(new Set(PUBLISHED_REGISTRY.rows.map((r) => r.sensorFamily)).size).toBe(13);
  expect([...new Set(PUBLISHED_REGISTRY.rows.map((r) => r.approachId))].sort()).toEqual([
    "D1",
    "D2",
    "D3",
    "D4",
    "D5",
  ]);
  expect(
    PUBLISHED_REGISTRY.rows.every((r) =>
      r.provenance.sourceRef.startsWith("https://standexdetect.com/"),
    ),
  ).toBe(true);
});
test("R04 conflicting sources refuse every suspended pair", () => {
  expect(conflicts).toHaveLength(5);
  for (const c of conflicts) {
    const r = evaluateReference(
      {
        ...key,
        sensorFamily: c.sensor,
        sensitivityClass: c.class,
        approachId: c.approach as typeof key.approachId,
      },
      need,
      domain,
    );
    expect(r.reason).toBe("SOURCE_CONFLICT");
    expect(r.pullMm).toBeNull();
    expect(r.verdict).toBe("unavailable");
  }
});
test("R05 MK04 perpendicular comparison uses M04 D4 published pair", () => {
  const r = evaluateReference(
    { ...key, sensorFamily: "MK04", magnetId: "M04", approachId: "D4" },
    need,
    domain,
  );
  expect([r.pullMm, r.dropMm, r.closingMm, r.openingMm]).toEqual([8.5, 10.1, 0.5, 11.4]);
  expect(r.verdict).toBe("failed");
});
test("R07 missing user gaps preserve published values but cannot produce margins", () => {
  const r = evaluateReference(key, EMPTY_NEED, domain);
  expect(r.reason).toBe("GAPS_REQUIRED");
  expect([r.pullMm, r.dropMm]).toEqual([15, 17.5]);
  expect(r.closingMm).toBeNull();
  expect(r.verdict).toBe("unavailable");
  expect(needIssues({ ...need, gapOpenMm: -1.5 }).some((i) => i.field === "gapOpenMm")).toBe(true);
  expect(
    needIssues({ ...need, gapToleranceMm: -1 }).some((i) => i.field === "gapToleranceMm"),
  ).toBe(true);
});
test("R08 R09 unknown tolerance is conditional; temperature does not invent a correction", () => {
  const r = evaluateReference(key, { ...need, gapToleranceMm: null }, domain);
  expect(r.unknown).toContain("assembly_tolerance");
  expect(r.verdict).toBe("tight");
  expect(r.closingMm).toBe(7.5);
  const hot = evaluateReference(
    key,
    { ...need, temperatureMinC: -20, temperatureMaxC: 100 },
    domain,
  );
  expect(hot.closingMm).toBe(7);
  expect(hot.unknown).toContain("magnet_temperature_drift");
});
test("R21 example hardware never populates a client product choice without explicit selection", async () => {
  const s = deriveStudioFields({ ...newStudy(), need, consulted: true }, DEFAULT_WORKSHOP);
  for (const k of ["sensor_form_factor", "mounting_type", "magnet_context"])
    expect(s.fields[k]).toBeUndefined();
  const f = await createDesignFreeze({
    dossierId: "TEST",
    revision: 1,
    generatedAt: "2026-09-11T12:00:00Z",
    author: "",
    study: s,
    config: DEFAULT_WORKSHOP,
  });
  expect(f.sections[2]!.entries.find((e) => e.label === "Capteur")?.value).toBe("Non renseigné");
  const chosen = deriveStudioFields(
    { ...s, selectedSolutionId: "MK03/B/M02/D1" },
    DEFAULT_WORKSHOP,
  );
  expect(chosen.fields.sensor_form_factor?.value).toContain("MK03");
  const stale = deriveStudioFields({ ...chosen, comparisonApproach: "D4" }, DEFAULT_WORKSHOP);
  expect(stale.fields.sensor_form_factor).toBeUndefined();
});
test("R11 workbook preserves numeric cells, blanks, provenance and literal formula-like user text", async () => {
  const s = { ...newStudy(), need, selectedSolutionId: "MK03/B/M02/D1" };
  const f = await createDesignFreeze({
    dossierId: "TEST",
    revision: 1,
    generatedAt: "2026-09-11T12:00:00Z",
    author: "",
    study: s,
    config: DEFAULT_WORKSHOP,
  });
  const sheets = studioExportSheets(f, s, DEFAULT_WORKSHOP);
  expect(sheets.map((s) => s.name)).toEqual([
    "Revue",
    "Hypotheses",
    "Comparaisons",
    "Registre",
    "Catalogue",
    "Reglages",
  ]);
  expect(sheets[2]!.rows.find((r) => r[0] === "MK03" && r[1] === "B")?.slice(4, 8)).toEqual([
    15, 17.5, 7, 4,
  ]);
  const zip = unzipSync(
    workbookBytes([...sheets, { name: "Literal", rows: [["=1+1", null, 7.5]] }]),
  );
  const xml = strFromU8(zip["xl/worksheets/sheet7.xml"]!);
  expect(xml).toContain('<t xml:space="preserve">=1+1</t>');
  expect(xml).not.toContain("<f>");
  expect(xml).toContain("<v>7.5</v>");
  expect(xml).toContain('<c r="B1" s="0"/>');
  expect(strFromU8(zip["xl/worksheets/sheet1.xml"]!)).toContain(f.hash);
});
test("R16 supplied GLB loads at 120 x 40 x 80 mm with distinct moving block", async () => {
  const bytes = await readFile(new URL("./fixtures/studio-socle-mobile.glb", import.meta.url));
  const key = await storeMachineFileInMemory(new File([bytes], "01_socle_et_bloc_mobile.glb"));
  const asset = await loadMachineAsset(key, 1000);
  try {
    asset.size.forEach((v, i) => expect(v).toBeCloseTo([120, 40, 80][i]!, 2));
    expect(asset.nodes.map((n) => n.name)).toContain("Bloc_mobile");
    expect(asset.nodes.map((n) => n.name)).toContain("Socle_fixe");
  } finally {
    asset.dispose();
  }
});
test("R16 R17 documented fixture settings close, open, then reclose in both motion modes", () => {
  for (const motion of ["translation", "rotation"] as const) {
    const c: WorkshopConfig = {
      ...DEFAULT_WORKSHOP,
      mode: "education",
      sensorId: "MK24-A-J",
      magnetModel: "generic",
      demoReach: 25,
      machine: {
        ...COFFEE_ASSEMBLY,
        motion,
        sensorPosition: [45, 45, 0],
        magnetPosition: [25, 45, 0],
        travel: [0, 0, 60],
      },
    };
    const samples = simulateCycle(c).samples;
    expect([
      samples[0]!.contact,
      samples[Math.floor(samples.length / 2)]!.contact,
      samples.at(-1)!.contact,
    ]).toEqual(["closed", "open", "closed"]);
  }
});
