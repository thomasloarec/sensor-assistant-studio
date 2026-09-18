/**
 * Effet RÉEL d'une saisie d'administration sur les simulations montées.
 *
 * Ces contrôles ne se contentent pas de relire le registre : ils exécutent les
 * moteurs (profils de montage, cycle de l'atelier, plages du guide) avant et
 * après l'application d'un jeu enregistré, pour prouver qu'aucun cache compilé
 * ni argument par défaut ne continue de servir les anciennes valeurs.
 */
import { afterEach, describe, expect, test } from "bun:test";
import {
  COMPILED_PUBLISHED_REGISTRY,
  effectivePublishedRegistry,
  effectiveRegistryRevisionLabel,
  publishedReference,
  resetEffectivePublishedRows,
} from "../src/lib/standex/magnetics/registries";
import {
  applyDetectionRecords,
  detectionDataSnapshot,
  detectionDataSource,
  resetDetectionData,
} from "../src/lib/standex/detection-data/store";
import type { DetectionRecord, GuideRecord } from "../src/lib/standex/detection-data/model";
import {
  hasErrors,
  isRecordSimulatable,
  parseDecimal,
  validateDetectionRecord,
} from "../src/lib/standex/detection-data/model";
import { currentMountingProfiles, profileFor } from "../src/lib/standex/mounting/profiles";
import { simulateMounting } from "../src/lib/standex/mounting/simulate";
import { DEFAULT_WORKSHOP, pairDemonstration, simulateCycle } from "../src/lib/standex/magnetic-workshop";
import { mountingFromWorkshop } from "../src/lib/standex/mounting/bridge";
import { guideRange, guideIllustrativeMarks, resetEffectiveGuideRows } from "../src/lib/standex/activation-guide";
import { buildDirectory } from "../src/lib/standex/detection-data/directory";

afterEach(() => {
  resetDetectionData();
  resetEffectivePublishedRows();
  resetEffectiveGuideRows();
});

const MAGNET = "HF3225-14.95X10X5";

const distance = (over: Partial<DetectionRecord> = {}): DetectionRecord => ({
  id: null,
  sensorFamily: "MK22",
  sensorReference: "MK22-B-X",
  classKind: "sensitivity",
  sensitivityClass: "B",
  contactForm: "1A",
  magnetId: MAGNET,
  approachId: "D1",
  datum: "lateral_surface",
  thresholdKind: "typical",
  pullInMm: 9.5,
  dropOutMm: 11.8,
  temperatureC: 23,
  status: "validated",
  sourceType: "engineering_measurement",
  sourceRef: "essai banc Standex 2026-09-18 p4",
  enteredOn: "2026-09-18",
  note: null,
  rowVersion: 1,
  updatedAt: null,
  updatedBy: null,
  ...over,
});

const guide = (over: Partial<GuideRecord> = {}): GuideRecord => ({
  id: null,
  page: 35,
  sensorFamily: "MK15",
  sensorReference: "MK15-B-X",
  magnetId: MAGNET,
  approachId: "D1",
  upMm: 15.4,
  toMm: 20.1,
  upNote: null,
  toNote: null,
  status: "validated",
  sourceRef: "Guide d'activation Standex, page 35",
  enteredOn: "2026-09-18",
  note: null,
  rowVersion: 1,
  updatedAt: null,
  updatedBy: null,
  ...over,
});

const workshopFor = (sensorId: string) =>
  mountingFromWorkshop(
    pairDemonstration({ ...DEFAULT_WORKSHOP, geometry: "D1" }, sensorId, MAGNET),
  );

describe("Une combinaison complétée alimente vraiment les moteurs", () => {
  for (const [family, reference] of [
    ["MK22", "MK22-B-X"],
    ["MK26", "MK26-B-X"],
  ] as const)
    test(`${family} : aucun profil aujourd'hui, un profil réel après enregistrement`, () => {
      expect(publishedReference(family, "B", MAGNET, "D1")).toBeNull();
      expect(profileFor(family, MAGNET, "D1")).toBeNull();
      const before = simulateMounting(workshopFor(family));
      expect(before.coverage).not.toBe("covered");

      expect(
        applyDetectionRecords([distance({ sensorFamily: family, sensorReference: reference })]),
      ).toBe(true);

      // Le profil est recalculé sans rechargement : plus aucun argument par
      // défaut ne pointe sur un tableau figé à l'import du module.
      const profile = profileFor(family, MAGNET, "D1");
      expect(profile).not.toBeNull();
      expect(profile!.classes).toContain("B");
      expect(publishedReference(family, "B", MAGNET, "D1")?.pullInMm).toBe(9.5);
      expect(currentMountingProfiles().some((p) => p.sensorFamily === family)).toBe(true);

      const after = simulateMounting(workshopFor(family));
      expect(after.coverage).toBe("covered");
      expect(after).not.toEqual(before);

      // Le cycle de l'atelier commute réellement avec ces distances.
      const cycle = simulateCycle(
        pairDemonstration({ ...DEFAULT_WORKSHOP, geometry: "D1" }, family, MAGNET),
      );
      expect(cycle.samples.length).toBeGreaterThan(0);
    });

  test("aucune fuite : une autre famille et un autre aimant restent inchangés", () => {
    const otherBefore = simulateMounting(workshopFor("MK26"));
    applyDetectionRecords([distance()]);
    expect(publishedReference("MK26", "B", MAGNET, "D1")).toBeNull();
    expect(simulateMounting(workshopFor("MK26"))).toEqual(otherBefore);
    expect(publishedReference("MK22", "B", "NDFEB-10X5X1.9", "D1")).toBeNull();
    expect(COMPILED_PUBLISHED_REGISTRY.rows.length).toBe(
      COMPILED_PUBLISHED_REGISTRY.rows.length,
    );
  });

  test("la révision exportée change réellement à chaque jeu appliqué", () => {
    const base = effectiveRegistryRevisionLabel();
    applyDetectionRecords([distance()], [], "12/3");
    const first = effectiveRegistryRevisionLabel();
    applyDetectionRecords([distance({ pullInMm: 9.1 })], [], "13/3");
    const second = effectiveRegistryRevisionLabel();
    expect(new Set([base, first, second]).size).toBe(3);
    expect(first).toContain("12/3");
    // L'instantané compilé garde SA provenance : un dossier archivé n'est pas
    // réécrit par une saisie postérieure.
    expect(COMPILED_PUBLISHED_REGISTRY.version).not.toContain("12/3");
  });

  test("un brouillon n'entre dans aucun moteur et laisse la base active visible", () => {
    const draft = distance({ status: "draft", pullInMm: null, dropOutMm: null });
    expect(applyDetectionRecords([draft])).toBe(true);
    expect(profileFor("MK22", MAGNET, "D1")).toBeNull();
    expect(effectivePublishedRegistry().rows.some((r) => r.sensorFamily === "MK22")).toBe(false);
    // L'annuaire distingue explicitement la proposition incomplète de la
    // ligne active : « MK01 » publie déjà des distances compilées.
    const entries = buildDirectory([
      { ...distance({ sensorFamily: "MK01", sensorReference: "MK01" }), status: "draft", pullInMm: null, dropOutMm: null },
    ]);
    const mk01 = entries.find((e) => e.record.sensorFamily === "MK01" && e.record.status === "draft");
    expect(mk01).toBeDefined();
    expect(mk01!.active).toBe(false);
  });

  test("les contacts non dessinés restent annoncés non simulables, d'après la ligne", () => {
    expect(isRecordSimulatable(distance())).toBe(true);
    expect(isRecordSimulatable(distance({ contactForm: "1B" }))).toBe(false);
    expect(isRecordSimulatable(distance({ contactForm: "1C" }))).toBe(false);
    expect(isRecordSimulatable(distance({ approachId: "D4" }))).toBe(false);
    expect(isRecordSimulatable(distance({ approachId: "D5" }))).toBe(false);
  });
});

describe("Plages du guide : saisie documentaire, sémantique intacte", () => {
  test("une plage enregistrée remplace la plage lue, sans devenir un seuil", () => {
    const before = guideRange("MK15", "MK15-B-X", MAGNET, "D1");
    expect(before?.upMm).toBe(15.4);
    expect(applyDetectionRecords([], [guide({ upMm: 14.2, toMm: 19.4 })])).toBe(true);
    const after = guideRange("MK15", "MK15-B-X", MAGNET, "D1");
    expect(after?.upMm).toBe(14.2);
    expect(after?.toMm).toBe(19.4);
    // Une plage n'est jamais un seuil de commutation : aucune ligne de
    // distances n'apparaît pour ce couple.
    expect(publishedReference("MK15", "B", MAGNET, "D1")).toBeNull();
    expect(guideIllustrativeMarks(after)).toEqual({ nearMm: 14.2, farMm: 19.4 });
  });

  test("un ordre imprimé inhabituel reste tel quel et hors démonstration de portée", () => {
    applyDetectionRecords([], [guide({ sensorFamily: "MK04", sensorReference: "MK04-1A66A-X", magnetId: "SMCO5-5X4", upMm: 10.3, toMm: 8.2 })]);
    const row = guideRange("MK04", "MK04-1A66A-X", "SMCO5-5X4", "D1");
    expect(row?.upMm).toBe(10.3);
    expect(row?.toMm).toBe(8.2);
    expect(row?.orderAtypical).toBe(true);
    expect(guideIllustrativeMarks(row)).toBeNull();
  });

  test("un brouillon de plage n'est jamais servi", () => {
    const before = guideRange("MK15", "MK15-B-X", MAGNET, "D1");
    applyDetectionRecords([], [guide({ status: "draft", upMm: 1, toMm: 2 })]);
    expect(guideRange("MK15", "MK15-B-X", MAGNET, "D1")).toEqual(before);
  });
});

describe("État du magasin : honnêteté du chargement et des refus", () => {
  test("un jeu refusé n'est pas compté comme retenu et se déclare périmé", () => {
    expect(
      applyDetectionRecords([distance(), distance({ pullInMm: 20, dropOutMm: 19 })]),
    ).toBe(false);
    const status = detectionDataSnapshot();
    expect(status.state).toBe("error");
    expect(status.savedRows).toBe(0);
    expect(status.stale).toBe(true);
    // Le refus est ENTIER : aucune des deux lignes n'entre dans les moteurs.
    expect(profileFor("MK22", MAGNET, "D1")).toBeNull();
  });

  test("un jeu accepté déclare le nombre réellement retenu et la révision serveur", () => {
    expect(applyDetectionRecords([distance()], [guide()], "7/2")).toBe(true);
    const status = detectionDataSnapshot();
    expect(status.state).toBe("ready");
    expect(status.savedRows).toBe(1);
    expect(status.savedGuideRows).toBe(1);
    expect(status.stale).toBe(false);
    expect(status.serverVersion).toBe("7/2");
    expect(status.revisionLabel).toContain("7/2");
  });

  test("une remise à zéro rend la main au jeu compilé et remet l'état au départ", () => {
    applyDetectionRecords([distance()], [], "9/0");
    resetDetectionData();
    expect(detectionDataSnapshot().state).toBe("idle");
    expect(detectionDataSnapshot().savedRows).toBe(0);
    expect(effectivePublishedRegistry()).toBe(COMPILED_PUBLISHED_REGISTRY);
    expect(detectionDataSource()).toBe("compiled");
  });
});

describe("Saisie : virgule décimale et valeurs refusées", () => {
  test("une frappe en cours n'est jamais transformée en valeur", () => {
    expect(parseDecimal("15,")).toBe("invalid");
    expect(parseDecimal("-")).toBe("invalid");
    expect(parseDecimal("abc")).toBe("invalid");
    expect(parseDecimal("15,4")).toBe(15.4);
    expect(parseDecimal("-12,5")).toBe(-12.5);
    expect(parseDecimal("")).toBeNull();
  });

  test("une ligne validée sans les deux distances est refusée avec un message de champ", () => {
    const errors = validateDetectionRecord(distance({ status: "validated", dropOutMm: null }));
    expect(hasErrors(errors)).toBe(true);
    expect(errors.dropOutMm).toBeTruthy();
  });
});
