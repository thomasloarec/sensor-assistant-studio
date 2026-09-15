/** Mode ILLUSTRATIF : un couple sans distance caractérisée doit tout de même
 *  montrer une commutation lisible à proximité, sans jamais valoir validation.
 *
 *  Deux notions distinctes, jamais confondues :
 *  - la PREUVE : `evidence` reste `uncharacterised` et les seuils publiés restent
 *    absents (`pullInMm` / `dropOutMm` à `null`) ;
 *  - l'AFFICHAGE : le contact ferme à 15 mm et rouvre à 18 mm pour que la scène
 *    raconte quelque chose, avec `illustrative: true` qui suit jusqu'aux exports.
 */
import { describe, expect, test } from "bun:test";
import { DEFAULT_WORKSHOP, type WorkshopConfig } from "../src/lib/standex/magnetic-workshop";
import { mountingFromWorkshop } from "../src/lib/standex/mounting/bridge";
import {
  ILLUSTRATIVE_DROP_OUT_MM,
  ILLUSTRATIVE_PULL_IN_MM,
  illustrativeAllowed,
  simulateMounting,
} from "../src/lib/standex/mounting/simulate";

const config = (patch: Partial<WorkshopConfig> = {}): WorkshopConfig => ({
  ...DEFAULT_WORKSHOP,
  ...patch,
});

/** Couple SANS table publiée : MK27 n'a pas de seuil caractérisé. */
const uncharacterised = simulateMounting(
  mountingFromWorkshop(config({ sensorId: "MK27", geometry: "D1", start: 40, end: 4 })),
);

describe("commutation illustrative des couples non caractérisés", () => {
  test("les distances illustratives sont fixes et documentées dans le code", () => {
    expect(ILLUSTRATIVE_PULL_IN_MM).toBe(15);
    expect(ILLUSTRATIVE_DROP_OUT_MM).toBe(18);
    expect(ILLUSTRATIVE_DROP_OUT_MM).toBeGreaterThan(ILLUSTRATIVE_PULL_IN_MM);
  });

  test("une pose hors gabarit n'ouvre JAMAIS le mode illustratif", () => {
    expect(illustrativeAllowed(["ORIENTATION_OFF_TEMPLATE"])).toBe(false);
    expect(illustrativeAllowed(["LATERAL_OFFSET"])).toBe(false);
    // Un contact non simulable ou un aimant en présence de fer non caractérisé
    // ne devient pas lisible pour autant.
    expect(illustrativeAllowed(["FERROUS_DECLARED"])).toBe(false);
    expect(illustrativeAllowed(["CONTACT_FORM_NOT_SIMULATED"])).toBe(false);
    expect(illustrativeAllowed(["NO_PUBLISHED_TABLE"])).toBe(true);
  });

  test("le contact ferme près et rouvre loin, sur l'entrefer de surfaces", () => {
    expect(uncharacterised.illustrative).toBe(true);
    // `gapMm` est l'entrefer de SURFACES, exactement la grandeur lue par la
    // scène et par les curseurs : aucune conversion n'est inventée ici.
    const near = uncharacterised.samples.filter((s) => s.gapMm > 0 && s.gapMm <= ILLUSTRATIVE_PULL_IN_MM);
    const far = uncharacterised.samples.filter((s) => s.gapMm >= ILLUSTRATIVE_DROP_OUT_MM);
    expect(near.length).toBeGreaterThan(0);
    expect(far.length).toBeGreaterThan(0);
    expect(near.every((s) => s.contact === "closed")).toBe(true);
    expect(far.every((s) => s.contact === "open")).toBe(true);
    // Une commutation réelle est donc racontée par la chronologie.
    expect(uncharacterised.transitions.length).toBeGreaterThan(0);
  });

  test("la preuve reste absente : aucun seuil n'est fabriqué", () => {
    expect(uncharacterised.pullInMm).toBeNull();
    expect(uncharacterised.dropOutMm).toBeNull();
    expect(uncharacterised.coverage).not.toBe("covered");
    // Aucun échantillon n'est déclaré couvert par une source.
    expect(uncharacterised.samples.every((s) => !s.covered)).toBe(true);
  });
});
