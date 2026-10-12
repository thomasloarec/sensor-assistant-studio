/** Correctifs P1 pré-démo du 12/10/2026 — variantes, contre-exemples, propriétés.
 *  Voir docs/QA_PREDEMO_P1_FIXES_2026-10-12.md. */
import { describe, expect, test } from "bun:test";
import {
  assessApplicationFit,
  MAX_DOCUMENTED_GAP_MM,
  MAX_VERIFIED_OPERATING_C,
  temperaturesC,
  VALIDATION_POINT,
  type FitIssueId,
} from "@/lib/leadmagnet/application-fit";
import type { Requirement } from "@/lib/leadmagnet/dossier";
import { createDossier } from "@/lib/leadmagnet/dossier";
import { thermalWarning, documentedLabel } from "@/lib/leadmagnet/thermal-fit";
import { BUSINESS_FIELD_MESSAGES, missingBusinessContext } from "@/lib/leadmagnet/submission";
import { SENSOR_SPECIFICATIONS } from "@/lib/standex/sensor-specifications";
import messages from "@/lib/i18n/messages.json";

const req = (a: Record<string, string>): Requirement[] =>
  Object.entries(a).map(([key, value]) => ({ key, value }) as unknown as Requirement);
const none = { mountingChosen: false, envelopeSet: false };
const fit = (a: Record<string, string>, free = "") => assessApplicationFit(req(a), free, none);
const ids = (a: Record<string, string>): FitIssueId[] => fit(a).issues.map((i) => i.id);

describe("B02 — portée limitée au but énoncé", () => {
  const goal = "Continuous temperature measurement 20-250°C, 4-20mA";
  for (const other of [
    "Oven door position is known by another system",
    "A magnet is already fitted on the motor shaft",
    "The motor position is read by an encoder",
    "Another sensor detects the lid",
  ])
    test(`bloque malgré « ${other} »`, () =>
      expect(ids({ detection_goal: goal, target_object: other })).toContain("continuous_temperature_measurement"));
  test("la plage 20-250 n'est pas lue comme -250", () => expect(temperaturesC("20-250°c")).not.toContain(-250));
  for (const ok of [
    { detection_goal: "Detect a liquid level threshold with a magnetic float.", electrical: "4-20 mA loop elsewhere" },
    { detection_goal: "Temperature alarm: a bimetal moves a magnet that triggers the reed", electrical: "NO contact" },
    { detection_goal: "Detect the door; oil temperature is measured by another probe 4-20 mA" },
  ])
    test(`pas de blocage : ${Object.values(ok)[0]}`, () =>
      expect(ids(ok)).not.toContain("continuous_temperature_measurement"));
});

describe("B03 — variantes de débit continu", () => {
  const forbid = "No rotor, paddle, magnet or moving elements allowed in the pipe.";
  for (const goal of [
    "Proportional flow output 0-10 V, 0-40 litres per minute",
    "Continuous flow rate measurement, 0-10V, up to 40 L/min",
    "Mesure de débit proportionnel 0-10 V, 0 à 40 litres par minute",
    "Analog 4-20 mA water flow measurement",
  ])
    test(`bloque : ${goal}`, () => expect(ids({ detection_goal: goal, target_object: forbid })).toContain("continuous_flow_measurement"));
  for (const ok of [
    { detection_goal: "Flow switch, paddle with magnet triggers when flow > 2 L/min" },
    { detection_goal: "Continuous flow rate 0-10 V with a magnetic turbine rotor", target_object: "Turbine allowed" },
    { detection_goal: "Measure water flow 0-40 L/min, 0-10 V" }, // aucune interdiction : inconnu ≠ bloquant
  ])
    test(`pas de blocage : ${ok.detection_goal}`, () => expect(ids(ok)).not.toContain("continuous_flow_measurement"));
});

describe("C01 — intention de puissance explicite", () => {
  for (const e of [
    { detection_goal: "Reed should cut the motor power when lid opens", electrical: "230 V 8 A motor" },
    { electrical: "Switch the 230 V mains load with the reed, 8 A" },
    { electrical: "The 230 V 8 A motor is switched by the reed." },
    { electrical: "Le moteur 230 V 8 A est coupé par le capteur." },
    { electrical: "Without a relay, the reed powers the 230 VAC 8 A motor." },
  ])
    test(`bloque : ${Object.values(e).join(" / ")}`, () => expect(ids(e)).toContain("direct_load_switching"));
  for (const ok of [
    { electrical: "The 230 V 8 A motor is switched by an external rated contactor; the reed gives the signal." },
    { electrical: "Reed cuts the PLC input; the 230 V 8 A motor is switched by a contactor." },
    { detection_goal: "Detect the motor cover position", electrical: "24 V PLC input, 10 mA" },
    { electrical: "Motor 230 VAC 8 A, controlled through a separate relay, reed signal only" },
  ])
    test(`pas de blocage : ${Object.values(ok).join(" / ")}`, () => expect(ids(ok)).not.toContain("direct_load_switching"));
});

describe("C02 — exposition du capteur, seuils vérifiés", () => {
  test("le maximum vérifié vient des fiches (MK21 = 150 °C)", () => {
    expect(MAX_VERIFIED_OPERATING_C).toBe(150);
    expect(SENSOR_SPECIFICATIONS.MK21!.temperatures.every((t) => t.max === 150)).toBe(true);
  });
  for (const hot of [
    "Component temperature at the sensor reaches 180°C",
    "Sensor at 180°C",
    "The reed and magnet must remain at 220°C continuous, 250°C peak.",
    "Le capteur atteint 180 °C.",
    "Sensor operating at 151 °C",
  ])
    test(`revue d'ingénierie : ${hot}`, () => expect(ids({ environment: hot })).toContain("extreme_temperature_review"));
  for (const ok of [
    "Sensor must withstand 150°C",
    "Sensor must withstand 140°C",
    "Chamber at 220°C; sensor mounted outside at 40°C ambient.",
    "Soldering 260°C for 5 s maximum",
    "Ambient 25°C at the sensor, unlike the oven at 250°C next door.",
    "Sensor operates continuously at 300°F",
  ])
    test(`pas de blocage global : ${ok}`, () => expect(ids({ environment: ok })).toEqual([]));

  test("150 °C : MK21 couvert, MK03 dépassé, gamme sans fiche = inconnue", () => {
    const r = fit({ environment: "Sensor must withstand 150°C" }).sensorSiteC;
    expect(thermalWarning("MK21", r)).toBeNull();
    expect(thermalWarning("MK03", r)?.status).toBe("exceeded");
    expect(thermalWarning("MK04", r)?.status).toBe("unknown");
  });
  test("A06 -40…+85 vs -30…+80 : avertissement visible, rien d'écarté", () => {
    const r = fit({ environment: "-40 to +85°C operating" });
    expect(r.blocking).toBe(false);
    expect(r.sensorSiteC).toEqual({ min: -40, max: 85 });
    const w = thermalWarning("MK03", r.sensorSiteC)!;
    expect(w.status).toBe("exceeded");
    expect(documentedLabel(w)).toContain("-30 … 80 °C");
  });
  test("MK21 -40 °C : couvert câble immobile seulement → conditionnel, jamais « qualifié »", () => {
    const r = fit({ environment: "Sensor operating from -40 to +120 °C" }).sensorSiteC;
    const w = thermalWarning("MK21", r)!;
    expect(w.status).toBe("conditional");
    expect(w.text).toContain("Ce n'est pas une qualification");
  });
  test("plage couverte par toutes les conditions : aucun avertissement", () =>
    expect(thermalWarning("MK03", fit({ environment: "Sensor operating from 0 to 60 °C" }).sensorSiteC)).toBeNull());
  test("aucune température au capteur : aucun avertissement", () =>
    expect(thermalWarning("MK03", fit({ detection_goal: "Detect the door" }).sensorSiteC)).toBeNull());
  test("propriété : au-dessus de 150 bloque, à 150 ou moins ne bloque jamais", () => {
    for (let c = 60; c <= 260; c += 10) {
      const blocked = ids({ environment: `Sensor operating at ${c} °C` }).includes("extreme_temperature_review");
      expect(blocked).toBe(c > MAX_VERIFIED_OPERATING_C);
    }
  });
});

describe("C03 — écart, câble, petits aimants", () => {
  test("seuil = maximum du guide (75 mm), mentionné comme seuil de revue", () => {
    expect(MAX_DOCUMENTED_GAP_MM).toBe(75);
    const i = fit({ states_motion: "gap = 500 mm" }).issues[0]!;
    expect(i.cautions.join(" ")).toContain("guide d'activation Standex");
  });
  for (const far of ["Magnet at 500 mm from the sensor, with 2 m cable", "gap = 500 mm", "écart : 0,5 m", "A 2 m cable; magnet at 300 mm from the sensor"])
    test(`revue : ${far}`, () => expect(ids({ states_motion: far })).toContain("extreme_gap_review"));
  for (const ok of ["500 mm cable to the controller", "A 2 m cable to the sensor", "Magnet at 10 mm from the sensor with a 5 m cable", "gap = 20 mm"])
    test(`pas de revue : ${ok}`, () => expect(ids({ states_motion: ok })).toEqual([]));
  test("propriété : seul un écart > 75 mm déclenche", () => {
    for (const mm of [5, 30, 74, 75, 76, 120, 500])
      expect(ids({ states_motion: `Magnet at ${mm} mm from the sensor` }).includes("extreme_gap_review")).toBe(mm > 75);
  });
  test("petit aimant et ±1 mm restent des points explicites, même sous le seuil", () => {
    const r = fit({ states_motion: "A 5mm diameter x 2mm magnet at 10 mm, ±1 mm" });
    expect(r.blocking).toBe(false);
    expect(r.validationPoints).toEqual([VALIDATION_POINT.tinyMagnet, VALIDATION_POINT.precision]);
  });
  test("aimant ordinaire, sans précision : aucun point ajouté", () =>
    expect(fit({ states_motion: "Magnet 20 x 10 mm at 10 mm" }).validationPoints).toEqual([]));
});

describe("Soumission — contexte projet essentiel", () => {
  test("dossier neuf : quatre champs à renseigner ou différer, phase sans défaut", () => {
    const d = createDossier("2026-10-12T00:00:00.000Z");
    expect(d.business.projectPhase).toBe("unknown");
    expect(missingBusinessContext(d)).toEqual(Object.values(BUSINESS_FIELD_MESSAGES));
  });
  test("valeurs réelles ou « Non défini » explicite : rien ne manque", () => {
    const d = createDossier("2026-10-12T00:00:00.000Z");
    d.business = { ...d.business, annualVolume: { kind: "known", sensorsPerYear: 500 }, projectPhase: "exploration", seriesStartDate: "2027-03-01", undefinedFields: ["seriesDurationYears"] };
    expect(missingBusinessContext(d)).toEqual([]);
  });
  test("date invalide ≠ réponse ; date d'échantillons facultative", () => {
    const d = createDossier("2026-10-12T00:00:00.000Z");
    d.business = { ...d.business, seriesStartDate: "pas une date", undefinedFields: ["annualVolume", "projectPhase", "seriesDurationYears"] };
    expect(missingBusinessContext(d)).toEqual([BUSINESS_FIELD_MESSAGES.seriesStartDate]);
  });
  test("la vérification ne modifie pas le dossier", () => {
    const d = createDossier("2026-10-12T00:00:00.000Z");
    const before = JSON.stringify(d);
    missingBusinessContext(d);
    expect(JSON.stringify(d)).toBe(before);
  });
});

describe("i18n — huit langues pour chaque nouveau texte", () => {
  const dict = messages as unknown as Record<string, string[]>;
  const keys = [
    ...Object.values(BUSINESS_FIELD_MESSAGES),
    ...Object.values(VALIDATION_POINT),
    "Points à valider avec la R&D Standex",
    "Choisir une phase",
    "Seuil de revue : la plus grande distance publiée dans le guide d'activation Standex. Ce n'est pas une distance validée pour un couple précis ; la limite réelle est confirmée par la R&D Standex.",
  ];
  for (const k of keys)
    test(k.slice(0, 50), () => {
      expect(dict[k]).toHaveLength(7);
      for (const v of dict[k]!) expect(v.trim().length).toBeGreaterThan(0);
    });
});
