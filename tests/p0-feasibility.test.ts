/** Scénarios P0 du retour utilisateur (« test Sensor Studio_12102026.pdf »),
 *  avec contrôles positifs indépendants. Le câblage UI (aucune carte quand
 *  `blocking`) est vérifié dans questionnaire-render.test.tsx. */
import { describe, expect, test } from "bun:test";
import { assessApplicationFit, intakeIsEmpty } from "@/lib/leadmagnet/application-fit";
import type { Requirement } from "@/lib/leadmagnet/dossier";

const req = (answers: Record<string, string>): Requirement[] =>
  Object.entries(answers).map(([key, value]) => ({ key, value }) as unknown as Requirement);
const ids = (answers: Record<string, string>, free = "") =>
  assessApplicationFit(req(answers), free).issues.map((i) => i.id);
const none = { mountingChosen: false, envelopeSet: false };

describe("P0 — blocages attendus", () => {
  test("B01 aluminium sans aimant", () => {
    expect(ids({ target_object: "Pièce en aluminium, aucun aimant ne peut être ajouté." })).toContain("no_magnetic_source");
  });
  test("B02 température continue 20–250 °C, 4–20 mA (EN + FR)", () => {
    expect(ids({ detection_goal: "Continuous temperature measurement 20–250°C", electrical: "analog 4–20mA" })).toEqual(["continuous_temperature_measurement"]);
    expect(ids({ detection_goal: "Mesurer la température en continu de 20 à 250 °C", electrical: "sortie 4-20 mA" })).toEqual(["continuous_temperature_measurement"]);
  });
  test("B03 débit continu 0–40 L/min, 0–10 V, sans aimant ni turbine", () => {
    expect(
      ids({
        detection_goal: "Continuous volumetric water flow measurement 0–40 L/min, proportional 0–10V.",
        target_object: "Sealed metal pipe, without magnet or turbine inside.",
      }),
    ).toContain("continuous_flow_measurement");
  });
  test("C01 courant moteur direct, « without a relay or contactor »", () => {
    expect(
      ids({
        detection_goal: "I want all motor current to pass directly through the reed contact, without a relay or contactor.",
        electrical: "230 VAC 8 A",
      }),
    ).toContain("direct_load_switching");
  });
  test("C02 220 °C continu / 250 °C pointe au capteur", () => {
    expect(ids({ environment: "The reed and magnet must remain at 220°C continuous, 250°C peak." })).toEqual(["extreme_temperature_review"]);
    expect(ids({ environment: "Le capteur reste en permanence à 220 °C." })).toEqual(["extreme_temperature_review"]);
  });
  test("C03 aimant 5 × 2 mm à 500 mm ±1 mm", () => {
    expect(ids({ states_motion: "A 5mm diameter x 2mm magnet sensing reliably at 500mm ±1mm." })).toEqual(["extreme_gap_review"]);
  });
  test("questionnaire entièrement vide (y compris tout délégué sans texte)", () => {
    const blank = req({ detection_goal: "", target_object: " ", states_motion: "", mounting: "", electrical: "", environment: "" });
    expect(intakeIsEmpty(blank, "", none)).toBe(true);
    const a = assessApplicationFit(blank, "", none);
    expect(a.blocking).toBe(true);
    expect(a.issues[0]!.id).toBe("no_meaningful_requirement");
    expect(intakeIsEmpty(blank, "", { mountingChosen: true, envelopeSet: false })).toBe(false);
  });
});

describe("P0 — contrôles positifs (aucun blocage)", () => {
  test("A01 lave-vaisselle", () => {
    expect(ids({ detection_goal: "Détecter la fermeture de la porte du lave-vaisselle.", environment: "Humidité, 65 °C max." })).toEqual([]);
  });
  test("D01 seuil de niveau avec flotteur magnétique", () => {
    expect(ids({ detection_goal: "Detect a liquid level threshold with a magnetic float.", electrical: "continuous 24 V supply" })).toEqual([]);
  });
  test("contacteur externe dimensionné", () => {
    expect(
      ids({
        detection_goal: "Detect the lid position.",
        electrical: "The 230 VAC 8 A motor is switched by an external properly rated contactor; the reed only gives the signal.",
      }),
    ).toEqual([]);
    expect(ids({ electrical: "No relay needed because the PLC controls an external contactor. 230 VAC 8 A motor." })).toEqual([]);
  });
  test("commande automate 24 V ordinaire", () => {
    expect(ids({ electrical: "Ordinary 24 V DC PLC input, 10 mA." })).toEqual([]);
  });
  test("haute température citée en comparaison seulement", () => {
    expect(ids({ environment: "Ambient 25°C at the sensor, unlike the oven at 250°C next door." })).toEqual([]);
    expect(ids({ environment: "-40 to +85°C operating range." })).toEqual([]);
  });
  test("distance ordinaire et longueur de câble ne bloquent pas", () => {
    expect(ids({ states_motion: "Magnet at 10 mm from the sensor when closed.", mounting: "A 2 m cable to the controller." })).toEqual([]);
  });
});
