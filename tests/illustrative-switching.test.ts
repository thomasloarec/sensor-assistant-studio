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

  test("illustrer n'est pas qualifier : seul un contact non simulable reste inerte", () => {
    // Une pose hors gabarit, un décalage latéral, un environnement ferreux, une
    // température autre ou le mode démonstration restent ANIMÉS : la demande est
    // de montrer une réaction de proximité, marquée illustrative, jamais une mesure.
    expect(illustrativeAllowed(["ORIENTATION_OFF_TEMPLATE"])).toBe(true);
    expect(illustrativeAllowed(["LATERAL_OFFSET"])).toBe(true);
    expect(illustrativeAllowed(["FERROUS_DECLARED"])).toBe(true);
    expect(illustrativeAllowed(["EDUCATION_MODE"])).toBe(true);
    expect(illustrativeAllowed(["NO_PUBLISHED_TABLE"])).toBe(true);
    // Seule exception : une forme de contact qui n'est jamais simulée (1B/1C).
    expect(illustrativeAllowed(["CONTACT_FORM_NOT_SIMULATED"])).toBe(false);
  });

  test("le contact ferme près et rouvre loin, sur la séparation réelle de la scène", () => {
    expect(uncharacterised.illustrative).toBe(true);
    // `separationMm` est la séparation RÉELLE des deux enveloppes dans la scène,
    // décalage latéral compris : aucune conversion n'est inventée ici.
    const near = uncharacterised.samples.filter(
      (s) => s.separationMm > 0 && s.separationMm <= ILLUSTRATIVE_PULL_IN_MM,
    );
    const far = uncharacterised.samples.filter((s) => s.separationMm >= ILLUSTRATIVE_DROP_OUT_MM);
    expect(near.length).toBeGreaterThan(0);
    expect(far.length).toBeGreaterThan(0);
    expect(near.every((s) => s.contact === "closed")).toBe(true);
    expect(far.every((s) => s.contact === "open")).toBe(true);
    // Une commutation réelle est donc racontée par la chronologie.
    expect(uncharacterised.transitions.length).toBeGreaterThan(0);
  });

  test("un aimant écarté latéralement reste OUVERT, même si la course annonce 5 mm", () => {
    const sim = simulateMounting(
      mountingFromWorkshop(
        config({ sensorId: "MK02", magnetModel: "M02", start: 32, end: 5, lateralShift: 100 }),
      ),
    );
    // La séparation réelle reste au-delà du seuil « loin » : la scène n'a aucune
    // raison de fermer, contrairement à l'entrefer nominal de la course (5 mm).
    expect(sim.samples.every((s) => s.separationMm > 20)).toBe(true);
    expect(sim.samples.some((s) => s.contact === "closed")).toBe(false);
    expect(sim.samples.every((s) => !s.covered)).toBe(true);
  });

  test("la preuve reste absente : aucun seuil n'est fabriqué", () => {
    expect(uncharacterised.pullInMm).toBeNull();
    expect(uncharacterised.dropOutMm).toBeNull();
    expect(uncharacterised.coverage).not.toBe("covered");
    // Aucun échantillon n'est déclaré couvert par une source.
    expect(uncharacterised.samples.every((s) => !s.covered)).toBe(true);
  });
});
