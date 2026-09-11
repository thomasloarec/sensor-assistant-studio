import { test, expect } from "bun:test";
import { DEFAULT_WORKSHOP, simulateCycle } from "../src/lib/standex/magnetic-workshop";
import { PUBLISHED_REGISTRY, publishedPair } from "../src/lib/standex/magnetics/registries";
import {
  evaluateReference,
  marginsFromDistances,
  verdictFor,
  EMPTY_NEED,
} from "../src/lib/standex/magnetics/margin";
import { solveSwitching } from "../src/lib/standex/magnetics/solve";
import { exploreSolutions } from "../src/lib/standex/magnetics/solutions";
import {
  newStudy,
  deriveStudioFields,
  confirmStudioField,
  parseStudioStudy,
  DERIVABLE_FIELDS,
} from "../src/lib/standex/studio-dossier";
import { createDesignFreeze, verifyFreeze, freezeMarkdown } from "../src/lib/standex/design-freeze";
import { stableStringify, createDossier, toClientDto } from "../src/lib/leadmagnet/dossier";
import { buildDossierExport, parseDossierExport } from "../src/lib/leadmagnet/dossier-io";
const need = {
  gapClosedMm: 7.5,
  gapOpenMm: 22,
  gapToleranceMm: 0.5,
  temperatureMinC: 20,
  temperatureMaxC: 20,
  agingAllowancePct: null,
};
const key = {
    sensorFamily: "MK03",
    sensitivityClass: "B",
    magnetId: "M02",
    approachId: "D1" as const,
  },
  domain = { referencePose: true, ferrous: false };
test("T4 exact verdict boundaries and the unknown cap", () => {
  for (const [n, expected] of [
    [30, "held"],
    [29.9, "tight"],
    [10, "tight"],
    [9.9, "failed"],
  ] as const)
    expect(verdictFor(n, n, [])).toBe(expected);
  expect(verdictFor(50, 50, ["unknown"])).toBe("tight");
  expect(verdictFor(50, -1, [])).toBe("failed");
});
test("T4 typical comparisons propagate tolerances without a guaranteed worst case", () => {
  const r = evaluateReference(key, need, domain);
  expect(r.closingMm).toBe(7);
  expect(r.openingMm).toBe(4);
  expect(r.verdict).toBe("tight");
  expect(r.basis).toBe("published_typical");
  expect(r.unknown).toContain("reference_temperature_unknown");
  expect(r.invalidants).not.toHaveLength(0);
  const n = marginsFromDistances("physical", 15, 17.5, { ...need, gapToleranceMm: 0 }, [], []);
  expect(r.closingMm!).toBeLessThan(n.closingMm!);
  expect(r.openingMm!).toBeLessThan(n.openingMm!);
});
test("T4 no gap, invalid numbers, unknown family, ferrous and arbitrary pose refuse", () => {
  for (const n of [
    EMPTY_NEED,
    { ...need, gapClosedMm: NaN },
    { ...need, gapToleranceMm: -1 },
    { ...need, gapClosedMm: 23 },
  ])
    expect(evaluateReference(key, n, domain).verdict).toBe("unavailable");
  expect(evaluateReference(key, need, { ...domain, referencePose: false }).verdict).toBe(
    "unavailable",
  );
  expect(evaluateReference(key, need, { ...domain, ferrous: true }).verdict).toBe("unavailable");
  expect(
    solveSwitching({
      ...key,
      temperatureC: 20,
      ferrousBodies: { declared: false, nearestDistanceMm: null },
    }).switching,
  ).toBeNull();
});
test("T2.4/T6.5 removing actual published data removes all product results including legacy cycle", () => {
  const rows = PUBLISHED_REGISTRY.rows;
  PUBLISHED_REGISTRY.rows = [];
  try {
    expect(publishedPair("B", "D1")).toBeNull();
    expect(evaluateReference(key, need, domain).verdict).toBe("unavailable");
    expect(simulateCycle(DEFAULT_WORKSHOP).samples.every((s) => s.contact === "unknown")).toBe(
      true,
    );
    const solutions = exploreSolutions(need, "D1", domain);
    expect(solutions).toHaveLength(29);
    expect(
      solutions.every(
        (s) => s.reference.verdict === "unavailable" && s.physical.verdict === "unavailable",
      ),
    ).toBe(true);
  } finally {
    PUBLISHED_REGISTRY.rows = rows;
  }
});
test("T6 expanded catalogue retains four MK03 classes and refuses physical predictions", () => {
  const rows = exploreSolutions(need, "D1", domain);
  expect(rows).toHaveLength(69);
  expect(new Set(rows.map((r) => r.id)).size).toBe(69);
  expect(new Set(rows.map((r) => r.sensorFamily)).size).toBe(29);
  expect(rows.filter((r) => r.sensorFamily === "MK03")).toHaveLength(4);
  expect(
    new Set(rows.filter((r) => r.reference.provenance.length).map((r) => r.sensorFamily)).size,
  ).toBe(13);
  expect(rows.every((r) => r.physical.verdict === "unavailable")).toBe(true);
});
test("T5 consultation gate, exact derived fields, confirmations, conflict and removal", () => {
  let s = {
    ...newStudy(),
    need,
    envelopeMm: [45, 25, 15] as [number, number, number],
    cycles: 2000000,
    selectedSolutionId: "MK03/B/M02/D1",
  };
  expect(deriveStudioFields(s, DEFAULT_WORKSHOP).fields).toEqual({});
  s = deriveStudioFields({ ...s, consulted: true }, DEFAULT_WORKSHOP) as typeof s;
  expect(Object.keys(s.fields).sort()).toEqual([...DERIVABLE_FIELDS].sort());
  expect(
    Object.values(s.fields).every((f) => f.source === "atelier" && f.state === "hypothesis"),
  ).toBe(true);
  s = confirmStudioField(s, "target_distance_and_tolerance") as typeof s;
  const saved = s.fields["target_distance_and_tolerance"]!.value;
  s = deriveStudioFields(
    { ...s, need: { ...need, gapClosedMm: 8.2 } },
    DEFAULT_WORKSHOP,
  ) as typeof s;
  expect(s.fields["target_distance_and_tolerance"]!.value).toBe(saved);
  expect(s.fields["target_distance_and_tolerance"]!.proposal).toContain("8.2");
  const cleared = deriveStudioFields(s, null);
  expect(Object.keys(cleared.fields)).toEqual(["target_distance_and_tolerance"]);
  expect(parseStudioStudy({ ...s, signed: true })).not.toHaveProperty("signed");
});
test("T7 deterministic complete unsigned fiche, tamper detection, commercial exclusion and DTO roundtrip", async () => {
  const study = deriveStudioFields(
    { ...newStudy(), need, consulted: true, example: true },
    DEFAULT_WORKSHOP,
  );
  study.fields["company"] = {
    value: "PRIVATE_COMPANY",
    state: "confirmed",
    source: "user",
    proposal: null,
  };
  const input = {
    dossierId: "DEMO",
    revision: 1,
    generatedAt: "2026-09-10T12:00:00.000Z",
    author: "",
    study,
    config: DEFAULT_WORKSHOP,
  };
  const a = await createDesignFreeze(input),
    b = await createDesignFreeze(input);
  expect(stableStringify(a)).toBe(stableStringify(b));
  expect(a.sections).toHaveLength(10);
  expect(await verifyFreeze(a)).toBe(true);
  expect(stableStringify(a)).not.toContain("PRIVATE_COMPANY");
  expect(freezeMarkdown(a)).toContain("Non contre-signée");
  expect(freezeMarkdown(a, (s) => (s === "Le montage" ? "Assembly" : s))).toContain("Assembly");
  const changed = await createDesignFreeze({
    ...input,
    study: { ...study, need: { ...need, gapClosedMm: 8 } },
  });
  expect(changed.hash).not.toBe(a.hash);
  expect(changed.signature).toBeNull();
  expect(await verifyFreeze({ ...a, signature: { role: "rnd" } })).toBe(false);
  const tampered = structuredClone(a);
  tampered.sections[0]!.entries[0]!.value = "changed";
  expect(await verifyFreeze(tampered)).toBe(false);
  const d = { ...createDossier(), workshop: DEFAULT_WORKSHOP, studioV2: study, designFreeze: a };
  expect(toClientDto(d).designFreeze?.hash).toBe(a.hash);
  expect(toClientDto({ ...d, workshop: { ...DEFAULT_WORKSHOP, end: 6 } }).designFreeze).toBeNull();
  const imported = parseDossierExport(buildDossierExport(d));
  expect(imported.ok).toBe(true);
  if (imported.ok) {
    expect(imported.dossier.studioV2?.need).toEqual(need);
    expect(imported.dossier.designFreeze).toBeNull();
  }
});
