/** Campagne QA adverse pré-démo du 12/10/2026 (docs/QA_BROAD_PREDEMO_2026-10-12.md).
 *
 *  - `test(...)`         : comportement attendu ET constaté à HEAD.
 *  - `test.failing(...)` : DÉFAUT CONSTATÉ. Le test décrit le comportement
 *    attendu ; il passe tant que le défaut existe et deviendra rouge le jour où
 *    il sera corrigé : il faudra alors le convertir en `test(...)`.
 *  Aucune logique applicative n'est modifiée par ce fichier. */
import { describe, expect, test } from "bun:test";
import { assessApplicationFit, intakeIsEmpty, type FitIssueId } from "@/lib/leadmagnet/application-fit";
import type { Requirement } from "@/lib/leadmagnet/dossier";
import { createDossier } from "@/lib/leadmagnet/dossier";
import { checkSubmission, submissionBinding, type SubmissionInput } from "@/lib/leadmagnet/submission";
import { INITIAL_NDA } from "@/lib/leadmagnet/nda";
import { ACTIVATION_GUIDE } from "@/lib/standex/activation-guide";
import { SENSOR_SPECIFICATIONS } from "@/lib/standex/sensor-specifications";
import { thermalWarning } from "@/lib/leadmagnet/thermal-fit";

const req = (a: Record<string, string>): Requirement[] =>
  Object.entries(a).map(([key, value]) => ({ key, value }) as unknown as Requirement);
const none = { mountingChosen: false, envelopeSet: false };
const ids = (a: Record<string, string>, free = ""): FitIssueId[] =>
  assessApplicationFit(req(a), free, none).issues.map((i) => i.id);

/* ------------------------------------------------------------------ */
describe("Matrice A01–D03 — attendu = constaté", () => {
  const PASS: [string, Record<string, string>, string?][] = [
    ["A01 lave-vaisselle NO 5 V 2 mA", { detection_goal: "Détecter la fermeture de la porte du lave-vaisselle", electrical: "NO, 5 V, 2 mA", environment: "humidité, 65 °C max" }],
    ["A02 vérin hydraulique, montage externe", { detection_goal: "Hydraulic cylinder end position, sensor mounted externally on the tube", mounting: "threaded M8 body" }],
    ["A03 PCB CMS", { detection_goal: "PCB SMD reed on board, small footprint", mounting: "SMD on PCB" }],
    ["A04 protecteur (pas de faux blocage)", { detection_goal: "Safety guard door interlock on a machine", electrical: "24 V PLC input" }],
    ["A05 enveloppe en texte libre", {}, "Max envelope 8x5x4mm"],
    ["A06 -40..+85 °C", { environment: "-40 to +85°C operating" }],
    ["A07 vanne deux positions", { detection_goal: "Valve position, two independent positions open and closed" }],
    ["D01 FR flotteur seuil", { detection_goal: "Détecter un seuil de niveau avec un flotteur magnétique", electrical: "24 V continu" }],
    ["D02 DE SPS Schließer", { detection_goal: "Türposition erkennen", electrical: "SPS Eingang 24 V, Schließer" }],
    ["D03 ES normalmente abierto", { detection_goal: "Detectar la puerta cerrada", electrical: "normalmente abierto, 24 V" }],
  ];
  for (const [name, a, free] of PASS) test(`${name} → aucun blocage`, () => expect(ids(a, free)).toEqual([]));

  const BLOCK: [string, Record<string, string>, FitIssueId][] = [
    ["B01 EN aluminium no magnet", { target_object: "Aluminium part, no magnet can be added." }, "no_magnetic_source"],
    ["B01 FR", { target_object: "Pièce en aluminium, aucun aimant ne peut être ajouté." }, "no_magnetic_source"],
    ["B02 EN", { detection_goal: "Continuous temperature measurement 20–250°C", electrical: "analog 4–20mA" }, "continuous_temperature_measurement"],
    ["B02 FR", { detection_goal: "Mesure de température entre 20 et 250°C", electrical: "Sortie 4–20 mA" }, "continuous_temperature_measurement"],
    ["B02 '4 to 20 mA' sans symbole °", { detection_goal: "I need to measure temperature from 20 to 250 C", electrical: "4 to 20 mA output" }, "continuous_temperature_measurement"],
    ["B02 réparti sur deux questions", { detection_goal: "Measure the temperature of the oil.", electrical: "Output 4-20 mA." }, "continuous_temperature_measurement"],
    ["B03 EN", { detection_goal: "Continuous volumetric water flow measurement 0–40 L/min, proportional 0–10V.", target_object: "Sealed metal pipe, without magnet or turbine inside." }, "continuous_flow_measurement"],
    ["B03 FR", { detection_goal: "Mesurer le débit d'eau 0 à 40 L/min, sortie 0-10 V", target_object: "Tuyau métallique fermé, sans turbine ni aimant" }, "continuous_flow_measurement"],
    ["C01 EN 'without a relay or contactor'", { detection_goal: "I want all motor current to pass directly through the reed contact, without a relay or contactor.", electrical: "230 VAC 8 A" }, "direct_load_switching"],
    ["C01 230Vac/8A collés", { detection_goal: "The reed switches the motor directly, no relay.", electrical: "230Vac, 8A" }, "direct_load_switching"],
    ["C01 contraction don't", { electrical: "We don't want a contactor; the reed powers the 230 V 8 A motor." }, "direct_load_switching"],
    ["C01 FR", { electrical: "Le capteur alimente directement le moteur 230 V 8 A, sans contacteur." }, "direct_load_switching"],
    ["C01 intention en Q1, relais en Q5 (contradiction conservée)", { detection_goal: "Motor current must pass directly through the reed sensor.", electrical: "230 VAC, 8 A, through a relay" }, "direct_load_switching"],
    ["C02 EN 220 continu / 250 pointe", { environment: "The reed and magnet must remain at 220°C continuous, 250°C peak." }, "extreme_temperature_review"],
    ["C02 '220 °C' avec espace", { environment: "Sensor operating at 220 °C" }, "extreme_temperature_review"],
    ["C02 FR", { environment: "Le capteur reste en permanence à 220 °C." }, "extreme_temperature_review"],
    ["C03 500 mm aimant 5×2", { states_motion: "A 5mm diameter x 2mm magnet sensing reliably at 500mm ±1mm." }, "extreme_gap_review"],
    ["C03 '0,5 m'", { states_motion: "Magnet detected at 0,5 m from the sensor" }, "extreme_gap_review"],
    ["C03 '50 cm away'", { states_motion: "The sensor must detect the magnet 50 cm away" }, "extreme_gap_review"],
  ];
  for (const [name, a, id] of BLOCK) test(`${name} → ${id}`, () => {
    const r = assessApplicationFit(req(a), "", none);
    expect(r.blocking).toBe(true);
    expect(r.issues.map((i) => i.id)).toContain(id);
  });

  test("C02 : la valeur citée est la pointe 250 °C, pas une valeur inventée", () => {
    const i = assessApplicationFit(req({ environment: "The reed and magnet must remain at 220°C continuous, 250°C peak." }), "").issues[0]!;
    expect(i.whatFailsArgs).toEqual(["250"]);
  });
  test("C01 : la charge citée provient du texte", () => {
    const i = assessApplicationFit(req({ detection_goal: "I want all motor current to pass directly through the reed contact, without a relay or contactor.", electrical: "230 VAC 8 A" }), "").issues[0]!;
    expect(i.whatFailsArgs[0]).toContain("8 A");
    expect(i.whatFailsArgs[0]).toContain("230 V AC");
  });
});

/* ------------------------------------------------------------------ */
describe("Contrôles positifs / métamorphiques — pas de faux blocage", () => {
  const OK: [string, Record<string, string>][] = [
    ["contacteur externe dimensionné", { electrical: "230 VAC 8 A motor switched by an external rated contactor; reed gives signal only." }],
    ["'with relay'", { electrical: "Reed drives a relay which switches the 230 VAC 8 A motor." }],
    ["'not directly' + contacteur", { electrical: "The motor current does not pass directly through the reed; 230 VAC 8 A via contactor." }],
    ["chambre 220 °C, capteur à 40 °C", { environment: "Chamber at 220°C; sensor mounted outside at 40°C ambient." }],
    ["comparaison 'unlike the oven'", { environment: "Ambient 25°C at the sensor, unlike the oven at 250°C next door." }],
    ["149 °C (sous le seuil de revue)", { environment: "Sensor must withstand 149°C" }],
    ["câble 500 mm n'est pas un écart", { mounting: "500 mm cable to the controller" }],
    ["58,3 mm (dans le guide)", { states_motion: "Magnet at 58.3 mm from the sensor" }],
    ["alarme de température par flotteur mobile", { detection_goal: "High temperature alarm using a moving float in the tank", electrical: "NO contact" }],
    ["seuil de niveau + température liquide mesurée par une autre sonde", { detection_goal: "Detect liquid level threshold with a magnetic float; liquid temperature monitored continuously by another probe 4-20 mA" }],
    ["contacteur de débit à palette aimantée", { detection_goal: "Flow switch, paddle with magnet triggers when flow > 2 L/min" }],
    ["aimant déjà posé, pas d'aimant supplémentaire", { target_object: "A magnet is already fitted on the door, no additional magnet required" }],
    ["plastique non magnétique, aimant sur le capot", { target_object: "Non-magnetic plastic housing, magnet on the moving lid" }],
    ["casse ignorée : CONTACTEUR EXTERNE", { electrical: "230 VAC 8 A MOTOR SWITCHED BY AN EXTERNAL RATED CONTACTOR." }],
  ];
  for (const [name, a] of OK) test(name, () => expect(ids(a)).toEqual([]));

  test("métamorphique C01 : casse et ordre des phrases ne changent pas le verdict", () => {
    const a = ids({ electrical: "230 VAC 8 A. The reed switches the motor directly, no relay." });
    const b = ids({ electrical: "THE REED SWITCHES THE MOTOR DIRECTLY, NO RELAY. 230 VAC 8 A." });
    expect(a).toEqual(b);
    expect(a).toContain("direct_load_switching");
  });
  test("métamorphique B02 : 4-20mA ≡ 4–20 mA ≡ 4 to 20 mA", () => {
    for (const e of ["4-20mA", "4–20 mA", "4 to 20 mA"])
      expect(ids({ detection_goal: "Measure the temperature of the oil.", electrical: e })).toContain("continuous_temperature_measurement");
  });
  test("métamorphique C03 : 500 mm ≡ 0,5 m ≡ 50 cm", () => {
    for (const d of ["at 500 mm from the sensor", "at 0,5 m from the sensor", "at 50 cm from the sensor"])
      expect(ids({ states_motion: `Magnet ${d}` })).toContain("extreme_gap_review");
  });
});

/* ------------------------------------------------------------------ */
describe("Questionnaire vide / délégué", () => {
  test("tout délégué sans texte = vide", () => expect(intakeIsEmpty(req({ detection_goal: "", mounting: "" }), "", none)).toBe(true));
  test("un seul caractère = vide", () => expect(intakeIsEmpty(req({ detection_goal: "x" }), "", none)).toBe(true));
  test("montage seul choisi = non vide (décision documentée P2)", () =>
    expect(intakeIsEmpty(req({}), "", { mountingChosen: true, envelopeSet: false })).toBe(false));
  test.failing("DÉFAUT P2 : « je ne sais pas » tapé à la main devrait compter comme non répondu", () =>
    expect(intakeIsEmpty(req({ detection_goal: "je ne sais pas" }), "", none)).toBe(true));
  test.failing("DÉFAUT P2 : « ??? ok » ne devrait pas suffire à afficher des capteurs", () =>
    expect(intakeIsEmpty(req({ detection_goal: "??? ok" }), "", none)).toBe(true));
});

/* ------------------------------------------------------------------ */
describe("Défauts constatés — faux négatifs (aucun blocage alors qu'il en faut un)", () => {
  test("P1 B02 : une porte citée dans une AUTRE réponse désactive le blocage température", () =>
    expect(ids({ detection_goal: "Continuous temperature measurement 20-250°C, 4-20mA", target_object: "Oven door position is known by another system" })).toContain("continuous_temperature_measurement"));
  test("P1 B03 : « proportional flow output … litres per minute » + « no moving parts » non reconnu", () =>
    expect(ids({ detection_goal: "Proportional flow output 0-10 V, 0-40 litres per minute", target_object: "No moving parts allowed in the pipe" })).toContain("continuous_flow_measurement"));
  test("P1 C01 : « reed should cut the motor power » 230 V 8 A non reconnu", () =>
    expect(ids({ detection_goal: "Reed should cut the motor power when lid opens", electrical: "230 V 8 A motor" })).toContain("direct_load_switching"));
  test("P1 C01 : « switch the 230 V mains load with the reed, 8 A » non reconnu", () =>
    expect(ids({ electrical: "Switch the 230 V mains load with the reed, 8 A" })).toContain("direct_load_switching"));
  test("P1 C02 : « component temperature at the sensor reaches 180°C » non reconnu (verbe absent)", () =>
    expect(ids({ environment: "Component temperature at the sensor reaches 180°C" })).toContain("extreme_temperature_review"));
  test("P1 C03 : écart 500 mm ignoré dès qu'un câble est cité dans la même phrase", () =>
    expect(ids({ states_motion: "Magnet at 500 mm from the sensor, with 2 m cable" })).toContain("extreme_gap_review"));
  test("P1 C03 : « gap = 500 mm » non reconnu", () =>
    expect(ids({ states_motion: "gap = 500 mm" })).toContain("extreme_gap_review"));
  test("CORRIGÉ P2 : 300 °F converti (≈149 °C), sous le seuil de revue", () =>
    expect(ids({ environment: "Sensor operates continuously at 300°F" })).toEqual([]));
});

/* ------------------------------------------------------------------ */
describe("Seuils P0 confrontés aux données catalogue", () => {
  const guideMax = Math.max(
    ...ACTIVATION_GUIDE.rows.flatMap((r) => [r.upMm, r.toMm]).filter((v): v is number => typeof v === "number"),
  );
  test("le seuil d'écart réel est le maximum du guide (75 mm), pas 58,3 mm", () => {
    expect(guideMax).toBe(75);
    expect(ids({ states_motion: "Magnet at 74 mm from the sensor" })).toEqual([]);
    expect(ids({ states_motion: "Magnet at 76 mm from the sensor" })).toContain("extreme_gap_review");
  });
  test("aucune gamme documentée au-delà de 150 °C", () => {
    const maxima = Object.values(SENSOR_SPECIFICATIONS).flatMap((s: any) => (s.temperatures ?? []).map((t: any) => t.max));
    expect(Math.max(...maxima)).toBe(150);
  });
  test("P1 : 150 °C est déclaré « sans correspondance documentée » alors que MK21 est documenté à 150 °C", () =>
    expect(ids({ environment: "Sensor must withstand 150°C" })).toEqual([]));
  test("CORRIGÉ P1 : 140 °C → aucun blocage global, avertissement par gamme (MK03 dépassé, MK21 couvert)", () => {
    const r = assessApplicationFit(req({ environment: "Sensor must withstand 140°C" }), "", none);
    expect(r.blocking).toBe(false);
    expect(thermalWarning("MK03", r.sensorSiteC)?.status).toBe("exceeded");
    expect(thermalWarning("MK21", r.sensorSiteC)).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
describe("Soumission — garde-fous", () => {
  const base = (deferAll = true): SubmissionInput => {
    const d = createDossier("2026-10-12T00:00:00.000Z");
    if (deferAll) d.business.undefinedFields = ["annualVolume", "projectPhase", "seriesStartDate", "seriesDurationYears"];
    d.business.contactEmail = "qa@example.invalid";
    d.business.siteCity = "Lyon";
    d.business.siteCountry = "FR";
    return { dossier: d, nda: INITIAL_NDA, consents: [], reviewAcknowledged: true, additionalConstraints: "" };
  };
  const withConsent = async (i: SubmissionInput): Promise<SubmissionInput> => ({
    ...i,
    consents: [{ kind: "supabase_dossier", grantedAt: "x", contentSummary: "", recipients: [], binding: await submissionBinding(i) } as any],
  });
  test("sans consentement : refusé", async () => {
    const r = await checkSubmission(base());
    expect(r.ok).toBe(false);
  });
  test("consentement lié puis contenu modifié : refusé", async () => {
    const i = await withConsent(base());
    const changed = { ...i, additionalConstraints: "nouvelle contrainte" };
    expect((await checkSubmission(changed)).ok).toBe(false);
  });
  test("NDA demandé non vérifié : refusé même avec consentement", async () => {
    const i = await withConsent({ ...base(), nda: { ...INITIAL_NDA, required: true, status: "requested" } });
    expect((await checkSubmission(i)).ok).toBe(false);
  });
  test("NDA optionnel non requis + consentement lié : accepté", async () => {
    expect((await checkSubmission(await withConsent(base()))).ok).toBe(true);
  });
  test("P1 : volume/phase/dates inconnus sans mention explicite « à définir » devraient être signalés", async () => {
    const i = await withConsent(base(false));
    expect(i.dossier.business.annualVolume.kind).not.toBe("known");
    expect((await checkSubmission(i)).ok).toBe(false);
  });
});
