/**
 * Règle de compatibilité de FORME capteur / aimant, telle qu'appliquée par
 * l'application : capteur tubulaire ↔ aimant tubulaire, capteur non tubulaire ↔
 * aimant bloc. Ce n'est pas une affirmation de physique universelle.
 *
 * Ces contrôles exécutent les MOTEURS, pas seulement la classification : un
 * couple refusé ne doit produire ni profil, ni seuil, ni sélection du guide, et
 * un couple accepté doit continuer de fonctionner exactement comme avant.
 */
import { afterEach, describe, expect, test } from "bun:test";
import {
  isShapeCompatible,
  isShapeIncompatible,
  magnetShapeClass,
  sensorShapeClass,
  shapeCompatibility,
} from "../src/lib/standex/shape-compatibility";
import {
  COMPILED_PUBLISHED_REGISTRY,
  applyEffectivePublishedRows,
  effectivePublishedRegistry,
  publishedReference,
  resetEffectivePublishedRows,
  shapeSuppressedRowKeys,
} from "../src/lib/standex/magnetics/registries";
import { currentMountingProfiles, profileFor, thresholdsFor } from "../src/lib/standex/mounting/profiles";
import { defaultMagnetFor, magnetOptionsFor, normalizedMagnetFor } from "../src/lib/standex/default-pairs";
import {
  DEFAULT_WORKSHOP,
  applyPairSelection,
  parseWorkshopConfig,
} from "../src/lib/standex/magnetic-workshop";
import { defaultGuideSelection, guideSelectionFor } from "../src/lib/standex/activation-guide";
import { validateDetectionRecord, isRecordSimulatable } from "../src/lib/standex/detection-data/model";
import { buildDirectory, emptyRecordFor, filterDirectory, EMPTY_FILTERS } from "../src/lib/standex/detection-data/directory";

afterEach(() => {
  resetEffectivePublishedRows();
});

describe("classification par forme extérieure réelle", () => {
  test("MK03 est tubulaire, M02 est un bloc malgré son nom", () => {
    expect(sensorShapeClass("MK03")).toBe("tubular");
    expect(magnetShapeClass("M02")).toBe("block");
    expect(shapeCompatibility("MK03", "M02")).toBe("incompatible");
  });
  test("un identifiant inconnu n'est jamais présumé compatible", () => {
    expect(shapeCompatibility("PAS_UN_CAPTEUR", "M03")).toBe("unknown");
    expect(isShapeCompatible("PAS_UN_CAPTEUR", "M03")).toBe(false);
    expect(isShapeIncompatible("PAS_UN_CAPTEUR", "M03")).toBe(false);
  });
  test("capteur tubulaire + cylindre accepté, capteur bloc + bloc accepté", () => {
    expect(isShapeCompatible("MK03", "M03")).toBe(true);
    expect(isShapeCompatible("MK15", "HF3225-14.95X10X5")).toBe(true);
    expect(isShapeCompatible("MK15", "4003004003")).toBe(false);
  });
});

describe("moteurs : aucun seuil sur un couple incompatible", () => {
  test("MK03 + M02 quitte le jeu effectif mais reste dans le jeu livré", () => {
    const compiled = COMPILED_PUBLISHED_REGISTRY.rows.filter(
      (r) => r.sensorFamily === "MK03" && r.magnetId === "M02",
    );
    expect(compiled.length).toBeGreaterThan(0);
    expect(
      effectivePublishedRegistry().rows.some(
        (r) => r.sensorFamily === "MK03" && r.magnetId === "M02",
      ),
    ).toBe(false);
    expect(shapeSuppressedRowKeys().length).toBeGreaterThan(0);
    expect(publishedReference("MK03", "B", "M02", "D1")).toBeNull();
  });
  test("aucun profil de montage, donc aucun seuil", () => {
    const profiles = currentMountingProfiles();
    expect(profiles.some((p) => p.sensorFamily === "MK03" && p.magnetId === "M02")).toBe(false);
    expect(profileFor("MK03", "M02", "D1", profiles)).toBeNull();
  });
  test("un profil incompatible transmis directement ne produit pas de seuil", () => {
    const ok = currentMountingProfiles().find(
      (p) => p.sensorFamily === "MK03" && p.localisation === "axis_documented",
    );
    expect(ok).toBeTruthy();
    const forged = { ...ok!, magnetId: "M02" };
    expect(thresholdsFor(forged)).toBeNull();
  });
  test("un couple compatible documenté fonctionne toujours", () => {
    // Le seul aimant tubulaire publié pour MK03 : la ligne reste servie.
    const profile = profileFor("MK03", "4003004003", "D1");
    expect(profile).toBeTruthy();
    expect(publishedReference("MK03", "B", "4003004003", "D1")).toBeTruthy();
  });
});

describe("choix, défauts et reprises", () => {
  test("M02 n'est plus proposé pour MK03, M03 reste le défaut", () => {
    expect(magnetOptionsFor("MK03")).not.toContain("M02");
    expect(isShapeCompatible("MK03", defaultMagnetFor("MK03"))).toBe(true);
  });
  test("un couple demandé incompatible est ramené au défaut du capteur", () => {
    expect(normalizedMagnetFor("MK03", "M02")).toBe(defaultMagnetFor("MK03"));
    expect(normalizedMagnetFor("MK03", "M03")).toBe("M03");
    const c = applyPairSelection(DEFAULT_WORKSHOP, "MK03", "M02");
    expect(c.magnetModel).not.toBe("M02");
    expect(isShapeCompatible("MK03", c.magnetModel)).toBe(true);
  });
  test("un fichier enregistré avant la règle est normalisé, pas refusé", () => {
    const saved = { ...DEFAULT_WORKSHOP, sensorId: "MK03", magnetModel: "M02", mode: "reference" };
    const parsed = parseWorkshopConfig(saved);
    expect(parsed).toBeTruthy();
    expect(parsed!.magnetModel).not.toBe("M02");
    expect(parsed!.guideReference).toBeNull();
  });
});

describe("guide d'activation : documentaire conservé, démonstration interdite", () => {
  test("aucune sélection illustrative sur un couple de formes contradictoires", () => {
    expect(guideSelectionFor("MK15", "4003004003", "D1")).toBeNull();
    expect(defaultGuideSelection("MK15", "4003004003")).toBeNull();
  });
  test("une sélection reste possible sur un couple compatible", () => {
    expect(defaultGuideSelection("MK15", "HF3225-14.95X10X5")).toBeTruthy();
  });
});

describe("annuaire d'administration", () => {
  test("la saisie d'un couple incompatible est refusée avec un message clair", () => {
    const r = {
      ...emptyRecordFor("MK03", "MK03-1A66B-500W"),
      sensitivityClass: "B",
      magnetId: "M02",
      pullInMm: 15,
      dropOutMm: 17.5,
      status: "validated" as const,
      sourceType: "datasheet",
      sourceRef: "datasheet-reed-sensor-series-mk03.pdf p1",
    };
    expect(validateDetectionRecord(r).magnetId).toBe(
      "Forme incompatible avec ce capteur : combinaison non simulée",
    );
    expect(isRecordSimulatable(r)).toBe(false);
  });
  test("une ligne livrée incompatible reste visible, marquée exclue et jamais active", () => {
    const entries = buildDirectory([]);
    const row = entries.find(
      (e) => e.record.sensorFamily === "MK03" && e.record.magnetId === "M02",
    );
    expect(row).toBeTruthy();
    expect(row!.excluded).toBe(true);
    expect(row!.active).toBe(false);
    expect(row!.simulatable).toBe(false);
    // Valeur d'origine conservée telle quelle, jamais transférée ni convertie.
    expect(row!.record.pullInMm).not.toBeNull();
    const only = filterDirectory(entries, { ...EMPTY_FILTERS, completeness: "excluded" });
    expect(only.every((e) => e.excluded)).toBe(true);
    expect(only.length).toBe(entries.filter((e) => e.excluded).length);
  });
  test("le jeu effectif refuse en bloc une saisie de formes contradictoires", () => {
    const row = COMPILED_PUBLISHED_REGISTRY.rows.find(
      (r) => r.sensorFamily === "MK03" && r.magnetId === "M02",
    )!;
    const result = applyEffectivePublishedRows([row], "test.1");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("SHAPE_MISMATCH");
  });
});
