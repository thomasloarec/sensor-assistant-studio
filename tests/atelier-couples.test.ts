import { describe, expect, test } from "bun:test";
import {
  DEFAULT_PAIRS,
  PAIR_ALTERNATIVES,
  defaultMagnetFor,
  documentedAlias,
  housingFor,
  magnetOptionsFor,
} from "../src/lib/standex/default-pairs";
import { PACKAGED_MAGNET_IDS, packagedMagnet } from "../src/lib/standex/magnet-catalog";
import { pairedMagnetModel } from "../src/lib/standex/paired-magnets";
import { sensorById, SENSOR_CATALOG } from "../src/lib/standex/sensor-catalog";
import {
  publishedApproaches,
  publishedClasses,
  publishedPairFor,
  publishedClassKind,
  publishedRowsForCouple,
  PUBLISHED_REGISTRY,
} from "../src/lib/standex/magnetics/registries";
import {
  DEFAULT_WORKSHOP,
  distanceBasis,
  parseWorkshopConfig,
  parseWorkshopNote,
  referenceAllowed,
  referenceNoteFor,
  serializeWorkshop,
  simulateCycle,
  summarizeWorkshop,
  unavailableReason,
  workshopPair,
} from "../src/lib/standex/magnetic-workshop";
import type { WorkshopConfig } from "../src/lib/standex/magnetic-workshop";

const config = (patch: Partial<WorkshopConfig> = {}): WorkshopConfig => ({
  ...DEFAULT_WORKSHOP,
  ...patch,
});

describe("couples par défaut : un vrai capteur reçoit son aimant, jamais un cylindre par défaut", () => {
  test("chaque couple demandé est appliqué par le tableau central", () => {
    const expected: Record<string, string> = {
      MK02: "M02",
      MK03: "M03",
      MK04: "M04",
      MK05: "M05",
      MK13: "M13",
      "MK11-B-M6": "M13B",
      "MK11-P-M8": "M11P",
      "MK11-M5": "M11S",
      "MK11-M8": "M11S",
      MK21: "M21P/1",
      MK21PR: "M21P/1",
      MK27: "M27",
      // Actionneurs de la variante réellement documentée par les fiches V00.
      MK36: "M36-N42",
      MK37: "M37-N42",
      MK38: "M38-N42",
    };
    for (const [sensorId, magnetId] of Object.entries(expected)) {
      expect(DEFAULT_PAIRS[sensorId]).toBe(magnetId);
      expect(defaultMagnetFor(sensorId)).toBe(magnetId);
      // Le boîtier réutilisé est celui du capteur demandé, jamais un repli.
      expect(pairedMagnetModel(magnetId, sensorId)).not.toBeNull();
      expect(pairedMagnetModel(magnetId, sensorId)!.magnet).toBe(true);
      expect(housingFor(magnetId, sensorId)).toBeTruthy();
    }
  });
  test("aucun capteur du catalogue ne tombe sur un aimant inexistant ni sur une forme inventée", () => {
    for (const sensor of SENSOR_CATALOG) {
      const magnetId = defaultMagnetFor(sensor.id);
      const model = pairedMagnetModel(magnetId, sensor.id);
      expect(model).not.toBeNull();
      expect(model!.body.every((n) => Number.isFinite(n) && n > 0)).toBe(true);
      const options = magnetOptionsFor(sensor.id);
      expect(options[0]).toBe(magnetId);
      expect(new Set(options).size).toBe(options.length);
      expect(parseWorkshopConfig(config({ sensorId: sensor.id, magnetModel: magnetId }))).not.toBeNull();
    }
  });
  test("les variantes M21P/1 et M21P/2 restent proposées et réellement différentes en 3D", () => {
    expect(PAIR_ALTERNATIVES["MK21"]).toContain("M21P/2");
    expect(PAIR_ALTERNATIVES["MK21PR"]).toContain("M21P/2");
    expect(magnetOptionsFor("MK21")).toContain("M21P/2");
    const one = pairedMagnetModel("M21P/1")!.holes!,
      two = pairedMagnetModel("M21P/2")!.holes!;
    expect(one.length).toBe(two.length);
    expect(one).not.toEqual(two);
    for (let i = 0; i < one.length; i++) {
      expect(one[i]![2]).toBeGreaterThan(one[i]![3]!); // oblong horizontal
      expect(two[i]![3]).toBeGreaterThan(two[i]![2]!); // oblong vertical
    }
  });
  test("les correspondances documentaires sont signalées, jamais présentées comme références vérifiées", () => {
    expect(documentedAlias("M13B")).toBe("M11B");
    expect(documentedAlias("M27")).toBe("MK27");
    expect(documentedAlias("M04")).toBeNull();
    for (const id of PACKAGED_MAGNET_IDS) expect(packagedMagnet(id)).not.toBeNull();
  });
  test("M11S suit la variante de capteur réellement sélectionnée", () => {
    expect(pairedMagnetModel("M11S", "MK11-M5")!.body).not.toEqual(
      pairedMagnetModel("M11S", "MK11-M8")!.body,
    );
  });
});

describe("distances publiées : la source décide, jamais une liste de familles", () => {
  test("MK04 + M04 : les valeurs B, C, D et E de la brochure sont réellement exploitées", () => {
    expect(publishedPairFor("MK04", "B", "D1", "M04")).toEqual([15, 17.5]);
    expect(publishedPairFor("MK04", "B", "D2", "M04")).toEqual([6.5, 8]);
    expect(publishedPairFor("MK04", "B", "D3", "M04")).toEqual([9.3, 11.4]);
    expect(publishedPairFor("MK04", "B", "D4", "M04")).toEqual([8.5, 10.1]);
    expect(publishedPairFor("MK04", "B", "D5", "M04")).toEqual([8.5, 10.1]);
    expect(publishedPairFor("MK04", "C", "D1", "M04")).toEqual([13, 16.5]);
    expect(publishedPairFor("MK04", "D", "D1", "M04")).toEqual([11, 14.5]);
    expect(publishedPairFor("MK04", "E", "D1", "M04")).toEqual([10, 13.5]);
    const c = config({ sensorId: "MK04", magnetModel: "M04", sensitivity: "B", geometry: "D1" });
    expect(distanceBasis(c)).toBe("standex");
    expect(referenceAllowed(c)).toBe(true);
    expect(workshopPair(c)).toEqual([15, 17.5]);
    const r = simulateCycle({ ...c, start: 30, end: 1 });
    expect(r.unknown).toBe(false);
    expect(r.transitions[0]!.distance).toBeCloseTo(15, 0);
    expect(r.transitions[1]!.distance).toBeCloseTo(17.5, 0);
  });
  test("un MK04 n'emprunte jamais les seuils d'un MK03 : le titre et les valeurs suivent le couple", () => {
    const mk03 = config({ sensorId: "MK03", magnetModel: "M02", sensitivity: "C", geometry: "D1" }),
      mk04 = config({ sensorId: "MK04", magnetModel: "M04", sensitivity: "C", geometry: "D1" });
    // Chaque couple lit SA propre ligne de registre, avec sa propre provenance :
    // deux valeurs numériquement égales ne sont pas la même source.
    const rowMk03 = PUBLISHED_REGISTRY.rows.find(
        (r) => r.sensorFamily === "MK03" && r.magnetId === "M02" && r.sensitivityClass === "C" && r.approachId === "D1",
      )!,
      rowMk04 = PUBLISHED_REGISTRY.rows.find(
        (r) => r.sensorFamily === "MK04" && r.magnetId === "M04" && r.sensitivityClass === "C" && r.approachId === "D1",
      )!;
    expect(rowMk03.provenance.sourceRef).not.toBe(rowMk04.provenance.sourceRef);
    expect(workshopPair(mk03)).toEqual([rowMk03.pullInMm, rowMk03.dropOutMm]);
    expect(workshopPair(mk04)).toEqual([rowMk04.pullInMm, rowMk04.dropOutMm]);
    // Retirer la ligne MK04 n'emprunte jamais celle du MK03.
    expect(publishedPairFor("MK04", "C", "D1", "M02")).toBeNull();
    const note = summarizeWorkshop(mk04);
    expect(note).not.toContain("MK03");
    expect(note).toContain("MK04");
  });
  test("un couple sans table publiée reste explicitement non renseigné", () => {
    for (const magnetId of ["M03", "M11S", "M11P", "M13B", "M27", "M36", "M37", "M38"]) {
      expect(PUBLISHED_REGISTRY.rows.some((r) => r.magnetId === magnetId)).toBe(false);
    }
    const c = config({ sensorId: "MK36", magnetModel: "M36" });
    expect(distanceBasis(c)).toBe("unavailable");
    expect(workshopPair(c)).toBeNull();
    expect(referenceAllowed(c)).toBe(false);
    expect(unavailableReason(c)).toContain("tests en environnement réel");
    expect(simulateCycle(c).samples.every((s) => s.contact === "unknown")).toBe(true);
  });
  test("une classe ou une approche non publiée pour le couple ne devient jamais verte", () => {
    const classes = publishedClasses("MK04", "M04");
    expect(classes).toEqual(["B", "C", "D", "E"]);
    expect(publishedApproaches("MK04", "M04")).toEqual(["D1", "D2", "D3", "D4", "D5"]);
    // Une classe absente du couple : contact indéterminé, aucun repli.
    const c = config({ sensorId: "MK04", magnetModel: "M04", sensitivity: "A", geometry: "D1" });
    expect(workshopPair(c)).toBeNull();
    expect(simulateCycle(c).samples.every((s) => s.contact === "unknown")).toBe(true);
  });
  test("les capteurs explicitement fictifs restent seuls à porter la démonstration", () => {
    expect(distanceBasis(config({ sensorId: "GENERIC", magnetModel: "generic" }))).toBe("fictitious");
    expect(distanceBasis(config({ sensorId: "MK04", magnetModel: "M04" }))).not.toBe("fictitious");
  });
});

describe("sauvegarde et restauration du couple", () => {
  test("un aimant explicitement choisi est restitué à l'identique", () => {
    const c = config({ sensorId: "MK04", magnetModel: "M04", sensitivity: "C", geometry: "D3" });
    expect(parseWorkshopNote(serializeWorkshop(c))).toEqual(c);
    expect(parseWorkshopConfig({ ...c, magnetModel: "M21P/2" })?.magnetModel).toBe("M21P/2");
    // Les anciens enregistrements M21 restent lisibles.
    expect(parseWorkshopConfig({ ...c, magnetModel: "M21" })?.magnetModel).toBe("M21");
  });
  test("un aimant inventé est refusé", () => {
    expect(parseWorkshopConfig(config({ magnetModel: "M99" }))).toBeNull();
  });
  test("le nom du capteur affiché vient du catalogue réel", () => {
    expect(sensorById("MK04").name).toContain("MK04");
  });
});

describe("fiches frontales MK36 / MK37 / MK38", () => {
  // Fiches V00 17Jan2025, page 2, « Activation Distances » : la distance est
  // mesurée ENTRE LES FACES des collerettes en vis-à-vis, le long de l'axe des
  // cylindres. Ce n'est ni le D1 latéral ni une distance entre centres : les
  // lignes portent l'approche F1 et leur propre datum.
  const expected: Record<string, Array<[string, number, number]>> = {
    MK36: [["1A", 17, 25]],
    MK37: [
      ["1A", 19, 32],
      ["1B", 16, 26],
    ],
    MK38: [
      ["1A66B", 21, 36],
      ["1A85C", 20, 36],
      ["1B90C", 17, 28],
      ["1C90C", 17, 28],
    ],
  };
  test("les valeurs publiées sont saisies telles quelles, avec leur datum frontal", () => {
    for (const [family, lines] of Object.entries(expected)) {
      const magnetId = defaultMagnetFor(family);
      expect(magnetId).toBe(`${family.replace("MK", "M")}-N42`);
      const rows = publishedRowsForCouple(family, magnetId);
      expect(rows).toHaveLength(lines.length);
      for (const [cls, activation, release] of lines) {
        const row = rows.find((r) => r.sensitivityClass === cls);
        expect(row).toBeTruthy();
        expect(row!.approachId).toBe("F1");
        expect(row!.datum).toBe("frontal_faces");
        expect(row!.thresholdKind).toBe("min_activation_max_release");
        expect(row!.classKind).toBe("switch_model");
        expect(row!.pullInMm).toBe(activation);
        expect(row!.dropOutMm).toBe(release);
        expect(row!.provenance.sourceRef).toContain(
          `datasheet-reed-sensor-series-${family.toLowerCase()}.pdf`,
        );
      }
      // Aucune classe de sensibilité A–E n'est inventée pour ces familles.
      expect(publishedClassKind(family, magnetId)).toBe("switch_model");
      expect(publishedClasses(family, magnetId).some((c) => "ABCDE".includes(c))).toBe(false);
      expect(publishedApproaches(family, magnetId)).toEqual(["F1"]);
    }
  });
  test("le contact 1A est simulé ; 1B et 1C sont affichés sans être simulés", () => {
    const no = config({ sensorId: "MK37", magnetModel: "M37-N42", sensitivity: "1A", geometry: "F1" });
    expect(referenceAllowed(no)).toBe(true);
    expect(workshopPair(no)).toEqual([19, 32]);
    const nc = config({ sensorId: "MK37", magnetModel: "M37-N42", sensitivity: "1B", geometry: "F1" });
    expect(referenceAllowed(nc)).toBe(false);
    // La ligne 1B reste LISIBLE comme documentation : elle n'est ni supprimée
    // ni convertie, seule la simulation normalement ouverte la refuse.
    expect(workshopPair(nc)).toEqual([16, 26]);
    expect(unavailableReason(nc)).toContain("normalement ouvert");
    expect(simulateCycle(nc).samples.every((s) => s.contact === "unknown")).toBe(true);
  });
  test("la note rappelle que Min Activation et Max Release sont indicatives", () => {
    const c = config({ sensorId: "MK36", magnetModel: "M36-N42", sensitivity: "1A", geometry: "F1" });
    expect(referenceNoteFor(c)).toContain("Min Activation");
    expect(referenceNoteFor(c)).toContain("faces");
    expect(distanceBasis(c)).toBe("standex");
  });
  test("aucun emprunt croisé entre M36, M37 et M38", () => {
    for (const [family, magnetId] of [
      ["MK36", "M37-N42"],
      ["MK37", "M38-N42"],
      ["MK38", "M36-N42"],
    ] as const) {
      expect(publishedRowsForCouple(family, magnetId)).toHaveLength(0);
      const c = config({ sensorId: family, magnetModel: magnetId, sensitivity: "1A", geometry: "F1" });
      expect(workshopPair(c)).toBeNull();
      expect(distanceBasis(c)).toBe("unavailable");
    }
  });
  test("le MK27 ne reçoit aucun seuil fabriqué depuis « up to 40 mm »", () => {
    const magnetId = defaultMagnetFor("MK27");
    expect(publishedRowsForCouple("MK27", magnetId)).toHaveLength(0);
    expect(distanceBasis(config({ sensorId: "MK27", magnetModel: magnetId }))).toBe("unavailable");
  });
});
