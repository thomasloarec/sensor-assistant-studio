/** Annuaire des données de détection — comportement réel.
 *
 *  On vérifie ce qui compte pour l'ingénierie : la couverture du catalogue réel,
 *  le refus des valeurs invalides, l'effet RÉEL d'une ligne enregistrée sur les
 *  lectures de simulation, l'absence de fuite vers une autre famille ou un autre
 *  aimant, et le fait que les plages du guide d'activation ne bougent pas.
 */
import { afterEach, describe, expect, test } from "bun:test";
import {
  COMPILED_PUBLISHED_REGISTRY,
  applyEffectivePublishedRows,
  effectivePublishedRegistry,
  publishedRegistryRevision,
  publishedReference,
  publishedRowsForCouple,
  resetEffectivePublishedRows,
} from "../src/lib/standex/magnetics/registries";
import {
  DEMO_SENSOR_ID,
  datumForApproach,
  detectionKey,
  isSimulatable,
  knownMagnetIds,
  parseDecimal,
  publishedFromRecord,
  realSensors,
  recordFromPublished,
  validateDetectionRecord,
  type DetectionRecord,
} from "../src/lib/standex/detection-data/model";
import { buildDirectory, filterDirectory, EMPTY_FILTERS } from "../src/lib/standex/detection-data/directory";
import {
  detectionConflictVersion,
  humanDetectionError,
  isMissingDetectionRpc,
  readRecord,
} from "../src/lib/standex/detection-data/adapter";
import { applyDetectionRecords, resetDetectionData } from "../src/lib/standex/detection-data/store";
import { SENSOR_CATALOG, CUSTOM_SENSOR_ID } from "../src/lib/standex/sensor-catalog";
import { guideRangesFor } from "../src/lib/standex/activation-guide";

afterEach(() => {
  resetDetectionData();
  resetEffectivePublishedRows();
});

const record = (over: Partial<DetectionRecord> = {}): DetectionRecord => ({
  id: null,
  sensorFamily: "MK15",
  sensorReference: "MK15-B-X",
  classKind: "sensitivity",
  sensitivityClass: "B",
  contactForm: "1A",
  magnetId: knownMagnetIds().find((m) => m.startsWith("HF")) ?? knownMagnetIds()[0]!,
  approachId: "D1",
  datum: "lateral_surface",
  thresholdKind: "typical",
  pullInMm: 6,
  dropOutMm: 8,
  temperatureC: null,
  status: "validated",
  sourceType: "test",
  sourceRef: "rapport essai 2026-09-18 p3",
  enteredOn: "2026-09-18",
  note: null,
  rowVersion: null,
  updatedAt: null,
  updatedBy: null,
  ...over,
});

describe("Périmètre du catalogue", () => {
  test("toutes les références réelles sont présentes, sans la démonstration ni le sur mesure", () => {
    const ids = realSensors().map((s) => s.id);
    expect(ids).not.toContain(DEMO_SENSOR_ID);
    expect(ids).not.toContain(CUSTOM_SENSOR_ID);
    const expected = SENSOR_CATALOG.filter(
      (s) => s.id !== DEMO_SENSOR_ID && s.id !== CUSTOM_SENSOR_ID && s.magnet !== true,
    ).map((s) => s.id);
    expect(ids.sort()).toEqual(expected.sort());
    expect(ids.length).toBeGreaterThan(10);
  });

  test("une référence sans aucune donnée reste visible, à compléter", () => {
    const entries = buildDirectory([]);
    const missing = entries.filter((e) => e.origin === "missing");
    expect(missing.length).toBeGreaterThan(0);
    for (const sensor of realSensors()) {
      expect(entries.some((e) => e.record.sensorFamily === sensor.id)).toBe(true);
    }
    // Aucune ligne « à compléter » ne porte une distance inventée.
    expect(missing.every((e) => e.record.pullInMm === null && e.record.dropOutMm === null)).toBe(true);
    expect(missing.every((e) => e.complete === false)).toBe(true);
  });

  test("un contact non supporté reste annoncé non simulé", () => {
    const unsupported = SENSOR_CATALOG.filter((s) => s.contact === "unsupported").map((s) => s.id);
    for (const id of unsupported) expect(isSimulatable(id)).toBe(false);
  });

  test("les filtres réduisent l'annuaire sans le réécrire", () => {
    const entries = buildDirectory([]);
    const family = entries[0]!.record.sensorFamily;
    const shown = filterDirectory(entries, { ...EMPTY_FILTERS, family });
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.every((e) => e.record.sensorFamily === family)).toBe(true);
    expect(filterDirectory(entries, EMPTY_FILTERS).length).toBe(entries.length);
  });
});

describe("Contrôles de saisie", () => {
  test("une ligne correcte passe", () => {
    expect(validateDetectionRecord(record())).toEqual({});
  });

  test("valeur non finie, négative ou nulle refusée", () => {
    expect(validateDetectionRecord(record({ pullInMm: Number.NaN })).pullInMm).toBeDefined();
    expect(validateDetectionRecord(record({ pullInMm: -1 })).pullInMm).toBeDefined();
    expect(validateDetectionRecord(record({ pullInMm: 0 })).pullInMm).toBeDefined();
    expect(validateDetectionRecord(record({ dropOutMm: Number.POSITIVE_INFINITY })).dropOutMm).toBeDefined();
  });

  test("le relâchement doit être plus loin que l'activation", () => {
    expect(validateDetectionRecord(record({ pullInMm: 8, dropOutMm: 8 })).dropOutMm).toBeDefined();
    expect(validateDetectionRecord(record({ pullInMm: 8, dropOutMm: 7 })).dropOutMm).toBeDefined();
  });

  test("référence, aimant, approche et datum inconnus refusés", () => {
    expect(validateDetectionRecord(record({ sensorFamily: "MK-INEXISTANT" })).sensorFamily).toBeDefined();
    expect(validateDetectionRecord(record({ sensorFamily: DEMO_SENSOR_ID })).sensorFamily).toBeDefined();
    expect(validateDetectionRecord(record({ magnetId: "AIMANT-INVENTE" })).magnetId).toBeDefined();
    expect(validateDetectionRecord(record({ approachId: "D9" as never })).approachId).toBeDefined();
    expect(validateDetectionRecord(record({ datum: "frontal_faces" })).datum).toBeDefined();
    expect(validateDetectionRecord(record({ approachId: "F1", datum: "frontal_faces" })).datum).toBeUndefined();
  });

  test("provenance et date exigées", () => {
    expect(validateDetectionRecord(record({ sourceRef: "p3" })).sourceRef).toBeDefined();
    expect(validateDetectionRecord(record({ sourceType: "" })).sourceType).toBeDefined();
    expect(validateDetectionRecord(record({ enteredOn: "18/09/2026" })).enteredOn).toBeDefined();
  });

  test("une ligne validée ne peut pas être incomplète, un brouillon peut l'être", () => {
    expect(validateDetectionRecord(record({ pullInMm: null })).status).toBeDefined();
    expect(validateDetectionRecord(record({ pullInMm: null, dropOutMm: null, status: "draft" }))).toEqual({});
  });

  test("clé dupliquée refusée", () => {
    const first = record();
    const clash = record({ pullInMm: 5, dropOutMm: 6 });
    expect(detectionKey(first)).toBe(detectionKey(clash));
    expect(validateDetectionRecord(clash, [first]).sensitivityClass).toBeDefined();
  });

  test("la virgule décimale est acceptée, un champ vide reste inconnu et non zéro", () => {
    expect(parseDecimal("6,4")).toBe(6.4);
    expect(parseDecimal("  ")).toBeNull();
    expect(parseDecimal("abc")).toBe("invalid");
    expect(parseDecimal("0")).toBe(0);
  });

  test("le datum découle de l'approche", () => {
    expect(datumForApproach("F1")).toBe("frontal_faces");
    expect(datumForApproach("D3")).toBe("lateral_surface");
  });
});

describe("Données effectives et simulations", () => {
  test("une combinaison jamais documentée devient réellement lisible", () => {
    const family = realSensors().find(
      (s) => publishedRowsForCouple(s.id, "HF3225-14.95X10X5").length === 0 && s.contact === "A",
    );
    expect(family).toBeDefined();
    const row = record({
      sensorFamily: family!.id,
      sensorReference: family!.name,
      sensitivityClass: "B",
      magnetId: "HF3225-14.95X10X5",
      pullInMm: 6.4,
      dropOutMm: 7.9,
    });
    expect(publishedReference(family!.id, "B", "HF3225-14.95X10X5", "D1")).toBeNull();
    expect(applyDetectionRecords([row])).toBe(true);
    const found = publishedReference(family!.id, "B", "HF3225-14.95X10X5", "D1");
    expect(found?.pullInMm).toBe(6.4);
    expect(found?.dropOutMm).toBe(7.9);
    expect(found?.provenance.sourceRef).toBe("rapport essai 2026-09-18 p3");
  });

  test("aucune fuite vers une autre famille ni un autre aimant", () => {
    const before = COMPILED_PUBLISHED_REGISTRY.rows.length;
    const family = realSensors().find(
      (s) => publishedRowsForCouple(s.id, "HF3225-14.95X10X5").length === 0 && s.contact === "A",
    )!;
    applyDetectionRecords([
      record({ sensorFamily: family.id, magnetId: "HF3225-14.95X10X5", sensitivityClass: "B" }),
    ]);
    // Le jeu compilé n'est jamais modifié en place.
    expect(COMPILED_PUBLISHED_REGISTRY.rows.length).toBe(before);
    const others = realSensors().filter((s) => s.id !== family.id);
    for (const s of others.slice(0, 8)) {
      const rows = publishedRowsForCouple(s.id, "HF3225-14.95X10X5");
      const compiled = COMPILED_PUBLISHED_REGISTRY.rows.filter(
        (r) => r.sensorFamily === s.id && r.magnetId === "HF3225-14.95X10X5",
      );
      expect(rows.length).toBe(compiled.length);
    }
  });

  test("une ligne enregistrée remplace la ligne compilée de MÊME combinaison", () => {
    const compiled = COMPILED_PUBLISHED_REGISTRY.rows[0]!;
    const changed = recordFromPublished(compiled);
    changed.pullInMm = compiled.pullInMm + 1.5;
    changed.dropOutMm = compiled.pullInMm + 3;
    const revision = publishedRegistryRevision();
    expect(applyDetectionRecords([changed])).toBe(true);
    expect(publishedRegistryRevision()).not.toBe(revision);
    const found = publishedReference(
      compiled.sensorFamily,
      compiled.sensitivityClass,
      compiled.magnetId,
      compiled.approachId,
    );
    expect(found?.pullInMm).toBe(compiled.pullInMm + 1.5);
    expect(effectivePublishedRegistry().rows.length).toBe(COMPILED_PUBLISHED_REGISTRY.rows.length);
  });

  test("un brouillon n'alimente jamais une simulation", () => {
    const draft = record({ status: "draft", pullInMm: 4, dropOutMm: 5, sensorFamily: "MK15" });
    expect(publishedFromRecord(draft)).toBeNull();
    applyDetectionRecords([draft]);
    expect(
      publishedReference("MK15", draft.sensitivityClass, draft.magnetId, "D1"),
    ).toEqual(
      COMPILED_PUBLISHED_REGISTRY.rows.find(
        (r) =>
          r.sensorFamily === "MK15" &&
          r.sensitivityClass === draft.sensitivityClass &&
          r.magnetId === draft.magnetId &&
          r.approachId === "D1",
      ) ?? null,
    );
  });

  test("un jeu comportant une ligne invalide est refusé en entier", () => {
    const family = realSensors().find((s) => s.contact === "A")!;
    const bad = {
      ...publishedFromRecord(record({ sensorFamily: family.id }))!,
      pullInMm: Number.NaN,
    };
    const result = applyEffectivePublishedRows([bad]);
    expect(result.ok).toBe(false);
    expect(effectivePublishedRegistry()).toBe(COMPILED_PUBLISHED_REGISTRY);
  });

  test("le retour au jeu compilé est complet", () => {
    applyDetectionRecords([record({ sensorFamily: "MK15", magnetId: "HF3225-14.95X10X5" })]);
    resetEffectivePublishedRows();
    expect(effectivePublishedRegistry()).toBe(COMPILED_PUBLISHED_REGISTRY);
  });

  test("les plages documentaires du guide ne bougent pas", () => {
    const before = guideRangesFor("MK15", "HF3225-14.95X10X5");
    applyDetectionRecords([
      record({ sensorFamily: "MK15", magnetId: "HF3225-14.95X10X5", pullInMm: 1, dropOutMm: 2 }),
    ]);
    expect(guideRangesFor("MK15", "HF3225-14.95X10X5")).toEqual(before);
  });
});

describe("Serveur : lecture défensive et concurrence", () => {
  test("une ligne serveur hors domaine est écartée, jamais devinée", () => {
    expect(readRecord({ ...record(), approachId: "D9" })).toBeNull();
    expect(readRecord({ ...record(), contactForm: "2A" })).toBeNull();
    expect(readRecord({ ...record(), datum: "autre" })).toBeNull();
    expect(readRecord({ ...record(), sensorFamily: "" })).toBeNull();
    expect(readRecord({ ...record(), pullInMm: "6,4" })).not.toBeNull();
    expect(readRecord({ ...record(), pullInMm: "abc" })?.pullInMm).toBeNull();
  });

  test("un conflit de version est reconnu et expliqué", () => {
    expect(detectionConflictVersion(new Error("DETECTION_CONFLICT:7"))).toBe(7);
    expect(detectionConflictVersion(new Error("autre"))).toBeNull();
    expect(humanDetectionError(new Error("DETECTION_CONFLICT:7"))).toBe("Ligne modifiée entre-temps");
    expect(humanDetectionError(new Error("NOT_ALLOWED"))).toBe("Réservé à l'administration Standex");
    expect(humanDetectionError(new Error("DETECTION_INCOMPLETE"))).toBe(
      "Une ligne validée porte deux distances",
    );
  });

  test("migration absente : dit non activé, sans prétendre enregistrer", () => {
    const missing = new Error('function public.lead_detection_directory does not exist');
    expect(isMissingDetectionRpc(missing)).toBe(true);
    expect(humanDetectionError(missing)).toBe("Annuaire non activé sur ce serveur");
  });
});
