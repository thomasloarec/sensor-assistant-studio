import { describe, expect, test } from "bun:test";
import {
  CUSTOM_SENSOR_ID,
  SENSOR_CATALOG,
  customLayout,
  isKnownSensorId,
  sensorById,
  bladeLength,
  bladeOffsetY,
} from "../src/lib/standex/sensor-catalog";
import { SENSOR_SPECIFICATIONS } from "../src/lib/standex/sensor-specifications";
import { evaluateCandidates } from "../src/lib/leadmagnet/candidates";
import { createDossier } from "../src/lib/leadmagnet/dossier";
import { exportDossier, importDossier } from "../src/lib/leadmagnet/dossier-io";
import {
  DEFAULT_WORKSHOP,
  parseWorkshopConfig,
  unavailableReason,
} from "../src/lib/standex/magnetic-workshop";

const custom = sensorById(CUSTOM_SENSOR_ID);

describe("Schéma pédagogique sur mesure", () => {
  test("les proportions de la carte sont dérivées du reed, jamais saisies à la main", () => {
    const layout = customLayout(custom)!;
    expect(layout).not.toBeNull();
    expect(layout.pcbLength).toBe(layout.reedLength * 3);
    expect(layout.pcbWidth).toBe(layout.reedDiameter * 5);
    // L'enveloppe annoncée du modèle reprend exactement ces cotes.
    expect(custom.body[0]).toBe(layout.pcbLength);
    expect(custom.body[2]).toBe(layout.pcbWidth);
    expect(custom.body[1]).toBe(layout.pcbThickness + layout.reedDiameter);
    // Le reed est posé SUR la carte : ses lames ne sont pas au centre du volume.
    expect(bladeOffsetY(custom)).toBeCloseTo(
      -custom.body[1] / 2 + layout.pcbThickness + layout.reedDiameter / 2,
      12,
    );
    // Les lames restent à l'échelle du reed, pas à celle de la carte.
    expect(bladeLength(custom)).toBeLessThan(layout.reedLength);
    expect(bladeLength(custom)).toBeGreaterThan(layout.reedLength / 2);
    // Aucun autre modèle du catalogue n'emprunte cette forme.
    expect(SENSOR_CATALOG.filter((s) => s.shape === "custom_pcb")).toHaveLength(1);
    expect(customLayout(sensorById("MK03-1A66B-500W"))).toBeNull();
  });

  test("aucune référence commandable, aucune caractéristique ni distance validée", () => {
    expect(custom.sourceFile).toBeNull();
    expect(SENSOR_SPECIFICATIONS[CUSTOM_SENSOR_ID]).toBeUndefined();
    expect(custom.note).toContain("pédagogique");
    expect(custom.note).toContain("pas une référence commandable");
    // Hors démonstration pédagogique, la distance de commutation reste inconnue :
    // le moteur refuse de réutiliser la calibration MK03.
    const reason = unavailableReason({
      ...DEFAULT_WORKSHOP,
      sensorId: CUSTOM_SENSOR_ID,
      mode: "reference",
    });
    expect(reason).toBeTruthy();
    expect(reason).toContain("inconnue");
    const candidate = evaluateCandidates(createDossier()).find((c) => c.id === CUSTOM_SENSOR_ID)!;
    expect(candidate).toBeDefined();
    expect(candidate.status).not.toBe("kept");
    expect(candidate.familyOnly).toBe(true);
    expect(candidate.reasons.join(" ")).toContain("aucune distance de commutation documentée");
  });

  test("le sur mesure est sélectionnable et survit à l'export puis à la reprise", () => {
    const candidate = evaluateCandidates(createDossier()).find((c) => c.id === CUSTOM_SENSOR_ID)!;
    expect(candidate.status).toBe("to_verify"); // donc proposable, jamais « écarté »

    const dossier = { ...createDossier(), selectedSensorId: CUSTOM_SENSOR_ID };
    const reprise = importDossier(exportDossier(dossier));
    expect(reprise.ok).toBe(true);
    if (!reprise.ok) throw new Error("reprise refusée");
    expect(reprise.dossier.selectedSensorId).toBe(CUSTOM_SENSOR_ID);

    // Le montage de l'atelier accepte le sur mesure comme identité réelle.
    expect(isKnownSensorId(CUSTOM_SENSOR_ID)).toBe(true);
    expect(parseWorkshopConfig({ ...DEFAULT_WORKSHOP, sensorId: CUSTOM_SENSOR_ID })?.sensorId).toBe(
      CUSTOM_SENSOR_ID,
    );
  });

  test("un identifiant inconnu ne devient jamais un autre capteur à la reprise", () => {
    expect(isKnownSensorId("MK03-INVENTE")).toBe(false);
    expect(parseWorkshopConfig({ ...DEFAULT_WORKSHOP, sensorId: "MK03-INVENTE" })).toBeNull();
    const reprise = importDossier(
      exportDossier({ ...createDossier(), selectedSensorId: "MK03-INVENTE" }),
    );
    expect(reprise.ok).toBe(true);
    if (!reprise.ok) throw new Error("reprise refusée");
    expect(reprise.dossier.selectedSensorId).toBeNull();
  });
});
