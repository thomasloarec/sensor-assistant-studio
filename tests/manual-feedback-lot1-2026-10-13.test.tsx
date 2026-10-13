/** Lot 1 des retours de test manuel (13 octobre 2026). Chaque test exige le
 * comportement correct : aucun test.failing, aucune attente recopiée du code. */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { assessApplicationFit, VALIDATION_POINT } from "@/lib/leadmagnet/application-fit";
import { evaluateCandidates, threadOf } from "@/lib/leadmagnet/candidates";
import { blockedBy, filterLabel, suggestionFilters } from "@/lib/leadmagnet/suggestion-filters";
import { pairCards } from "@/lib/leadmagnet/pair-cards";
import { rankSuggestions, suggestedOrder } from "@/lib/leadmagnet/suggestion-ranking";
import { thermalWarning, THERMAL_SHORT } from "@/lib/leadmagnet/thermal-fit";
import { parseDecimalMm } from "@/lib/leadmagnet/decimal";
import { detectEnvelopeFromText, ENVELOPE_TEXT } from "@/lib/leadmagnet/envelope-text";
import { parseDossierImport } from "@/lib/leadmagnet/dossier-io";
import { sensorById } from "@/lib/standex/sensor-catalog";
import { SENSOR_SPECIFICATIONS } from "@/lib/standex/sensor-specifications";
import { LANGUAGES, msg, t } from "@/lib/i18n/core";
import type { EnvelopeMm, MountingChoice, Requirement } from "@/lib/leadmagnet/dossier";

const req = (o: Record<string, string>): Requirement[] =>
  Object.entries(o).map(([key, value]) => ({ key, value, label: key, unit: null, state: "confirmed", source: "client" }) as unknown as Requirement);
const NO_ENV: EnvelopeMm = { lengthMm: null, widthMm: null, heightMm: null };

/** Même chaîne que l'écran « Couples suggérés » (design-space.tsx). */
function top3(answers: Record<string, string>, mounting: MountingChoice = { kind: "undecided" }, envelope: EnvelopeMm = NO_ENV) {
  const requirements = req(answers);
  const fit = assessApplicationFit(requirements, "", { mountingChosen: mounting.kind !== "undecided", envelopeSet: false });
  const candidates = evaluateCandidates({ mounting, envelope, mountingText: answers.mounting ?? "" });
  const filters = suggestionFilters({ mounting, envelope, mountingText: answers.mounting ?? "" });
  const plausible = candidates.filter(
    (c) => c.id !== "GENERIC" && blockedBy(sensorById(c.id), filters, filters.map((f) => f.id), { mounting, envelope }).length === 0,
  );
  const ranked = rankSuggestions(plausible, { fit, requirements });
  return { fit, ranked, ids: pairCards(suggestedOrder(ranked), { limit: 3, keepOrder: true }).map((c) => c.sensorId) };
}

const A01 = { detection_goal: "Détecter la fermeture de la porte du lave-vaisselle", target_object: "Aimant sur la porte", electrical: "NO, 5 V, 2 mA", environment: "humidité, 65 °C max" };

describe("A01 — classement traçable, MK26 spécialisé", () => {
  test("MK26 est en PBT renforcé de fibres de verre, -20…+80 °C câble immobile, pas inox", () => {
    const s = SENSOR_SPECIFICATIONS.MK26!;
    expect(s.material).toBe("PBT renforcé de fibres de verre");
    expect(s.material).not.toMatch(/inox|acier/i);
    expect(s.temperatures.find((c) => c.condition === "Câble immobile")).toMatchObject({ min: -20, max: 80 });
    expect(SENSOR_SPECIFICATIONS.MK27!.material).toBe("Aluminium");
    expect(SENSOR_SPECIFICATIONS["MK11-M8"]!.material).toBe("Acier inoxydable");
  });
  test("lave-vaisselle vissé 35×15×10 : MK26 hors des trois cartes, gammes ordinaires en tête", () => {
    const { ids, ranked } = top3(A01, { kind: "screw", style: "screw_fixed" }, { lengthMm: 35, widthMm: 15, heightMm: 10 });
    expect(ids).not.toContain("MK26");
    expect(ids[0]).toBe("MK04");
    expect(ids).toContain("MK13");
    expect(ranked.find((r) => r.id === "MK26")?.reserved).toBe(true);
  });
  test("sans montage : top 3 ordinaire, aucune gamme spécialisée", () => {
    const { ids } = top3(A01);
    for (const id of ["MK26", "MK21", "MK02", "MK27"]) expect(ids).not.toContain(id);
  });
  test("tension commutée 200 V documentée seulement par MK26 : il est promu avec sa raison", () => {
    const { ranked } = top3({ ...A01, electrical: "Signal 200 V DC, 1 mA, NO" }, { kind: "screw", style: "screw_fixed" });
    expect(ranked[0]!.id).toBe("MK26");
    expect(ranked[0]!.reason).toMatch(/tension commutée plus élevée/);
  });
  test("un choix déjà enregistré reste en tête, annoté", () => {
    const fit = assessApplicationFit(req(A01), "", { mountingChosen: false, envelopeSet: false });
    const r = rankSuggestions([{ id: "MK04", status: "to_verify" }, { id: "MK26", status: "to_verify" }], { fit, requirements: req(A01) }, "MK26");
    expect(r[0]).toMatchObject({ id: "MK26", reserved: false });
    expect(r[0]!.reason).toMatch(/déjà enregistré/);
  });
});

describe("A02 — trou 9,6 mm : saisie et retenue documentée", () => {
  test("9.6 et 9,6 donnent 9.6 ; saisies intermédiaires ou invalides ne valent rien", () => {
    expect(parseDecimalMm("9.6")).toBe(9.6);
    expect(parseDecimalMm("9,6")).toBe(9.6);
    for (const v of ["", "9,", "9.6.1", "-9", "abc", "0"]) expect(parseDecimalMm(v)).toBeNull();
  });
  test("MK36/37/38 : retenue documentée (9,53 mm) ; MK03/MK14/MK18 : adaptateur requis", () => {
    const res = evaluateCandidates({ mounting: { kind: "press_fit", holeDiameterMm: 9.6 }, envelope: NO_ENV });
    const by = (id: string) => res.find((c) => c.id === id)!;
    for (const id of ["MK36", "MK37", "MK38"]) {
      expect(by(id).retention).toBe("documented");
      expect(by(id).reasons.join(" ")).toMatch(/9\.53 mm.*aucun serrage n'est garanti/);
    }
    for (const id of ["MK03", "MK14", "MK18"]) {
      expect(by(id).status).toBe("to_verify");
      expect(by(id).retention).toBe("adapter_required");
      expect(by(id).reasons.join(" ")).toMatch(/Douille, adaptateur/);
    }
  });
  test("le classement place la retenue documentée devant l'adaptation, sans exclure l'adaptation", () => {
    const { ranked, ids } = top3({ detection_goal: "Détecter la présence d'un couvercle", target_object: "aimant" }, { kind: "press_fit", holeDiameterMm: 9.6 });
    expect(ids.every((id) => ["MK36", "MK37", "MK38"].includes(id))).toBe(true);
    expect(ranked.some((r) => r.id === "MK03" && !r.reserved)).toBe(true);
  });
  test("le champ guidé utilise la saisie décimale contrôlée", () => {
    const src = readFileSync("src/components/leadmagnet/design-space.tsx", "utf8");
    expect(src).toContain('<DecimalMmInput\n              id="guided-hole"');
    expect(src).toContain('id="detailed-hole"');
  });
});

describe("A05 — taille de filetage", () => {
  const ids = (m: number) =>
    evaluateCandidates({ mounting: { kind: "screw", style: "threaded_body", threadMm: m }, envelope: NO_ENV })
      .filter((c) => c.status !== "excluded" && c.id.startsWith("MK11"))
      .map((c) => c.id)
      .sort();
  test("M8 → MK11-M8 et MK11-P-M8 ; M5 → MK11-M5 ; M6 → MK11-B-M6", () => {
    expect(ids(8)).toEqual(["MK11-M8", "MK11-P-M8"]);
    expect(ids(5)).toEqual(["MK11-M5"]);
    expect(ids(6)).toEqual(["MK11-B-M6"]);
    expect(threadOf("MK11-B-M6")).toBe(6);
  });
  test("puce de filetage et filtre réel", () => {
    const mounting: MountingChoice = { kind: "screw", style: "threaded_body", threadMm: 8 };
    const f = suggestionFilters({ mounting, envelope: NO_ENV });
    const chip = f.find((x) => x.labelKey === "Filetage M{0}")!;
    expect(chip.labelArgs).toEqual(["8"]);
    expect(blockedBy(sensorById("MK11-M5"), f, f.map((x) => x.id), { mounting, envelope: NO_ENV })).toContain("forme");
    expect(blockedBy(sensorById("MK11-M8"), f, f.map((x) => x.id), { mounting, envelope: NO_ENV })).toEqual([]);
  });
  test("sans taille, les quatre MK11 restent ; la reprise JSON garde threadMm (champ optionnel)", () => {
    expect(evaluateCandidates({ mounting: { kind: "screw", style: "threaded_body" }, envelope: NO_ENV }).filter((c) => c.id.startsWith("MK11") && c.status !== "excluded")).toHaveLength(4);
    const src = readFileSync("src/lib/leadmagnet/dossier-io.ts", "utf8");
    expect(src).toMatch(/threadMm: z\.number\(\)\.finite\(\)\.positive\(\)\.max\(100\)\.optional\(\)/);
    expect(typeof parseDossierImport).toBe("function");
  });
  test("l'écran affiche M5/M6/M8 et « taille inconnue — à vérifier »", () => {
    const src = readFileSync("src/components/leadmagnet/design-space.tsx", "utf8");
    expect(src).toContain('data-testid="thread-size"');
    expect(src).toContain("Taille inconnue — à vérifier");
  });
});

describe("B01 — dimensions détectées, encart visible", () => {
  test("8 × 5 × 4 mm détecté, jamais appliqué sans clic", () => {
    const h = detectEnvelopeFromText(req({ mounting: "The sensor must fit inside 8 × 5 × 4 mm." }), "");
    expect(h?.kind).toBe("found");
  });
  test("encart prioritaire : titre, avertissement, CTA principal puis secondaire, AVANT les couples", () => {
    const src = readFileSync("src/components/leadmagnet/design-space.tsx", "utf8");
    expect(src).toContain("ENVELOPE_TEXT.title");
    expect(src).toContain('data-testid="envelope-hint-warning"');
    const hint = src.indexOf("{fitBlocked ? null : envelopeHintView}");
    const panel = src.indexOf('<div className="panel-block-lg">\n        <p className="t-label">{t("D\'après vos réponses")}');
    expect(hint).toBeGreaterThan(0);
    expect(hint).toBeLessThan(panel);
    for (const l of LANGUAGES.filter((x) => x.id !== "fr")) {
      expect(t(ENVELOPE_TEXT.title, l.id)).not.toBe(ENVELOPE_TEXT.title);
      expect(t(ENVELOPE_TEXT.notYet, l.id)).not.toBe(ENVELOPE_TEXT.notYet);
    }
  });
});

describe("B02 / B03 — température", () => {
  test("B02 : avertissement de carte court, détail complet ailleurs", () => {
    const w = thermalWarning("MK04", { min: -40, max: 85 })!;
    expect(w.status).toBe("exceeded");
    const short = msg(THERMAL_SHORT.exceeded, [w.asked]);
    expect(short.length).toBeLessThan(120);
    expect(msg(THERMAL_SHORT.exceeded, [w.asked], "en")).toMatch(/exceeds the documented range.*engineering review required/);
    expect(readFileSync("src/components/standex/workshop/sensor-card.tsx", "utf8")).toContain('data-testid="detail-thermal"');
  });
  test("B03 : 140 °C au capteur câble fixe → MK21 en tête, avec sa raison", () => {
    const { ids, ranked, fit } = top3({ ...A01, environment: "140 °C at the sensor, cable fixed (not moving)." });
    expect(fit.blocking).toBe(false);
    expect(ids[0]).toBe("MK21");
    expect(ranked[0]!.reason).toMatch(/plage de température documentée/);
    expect(thermalWarning("MK04", fit.sensorSiteC)?.status).toBe("exceeded");
  });
  test("B03 : 220 °C au capteur → aucune correspondance standard", () => {
    const { fit } = top3({ ...A01, environment: "220 °C at the sensor continuously." });
    expect(fit.issues.map((i) => i.id)).toContain("extreme_temperature_review");
  });
  test("A01 ordinaire à 65 °C : MK21 n'est pas promu", () => {
    expect(top3(A01).ids).not.toContain("MK21");
  });
});

describe("B04 — deux sorties indépendantes", () => {
  const B04 = {
    detection_goal: "Detect both end positions of a pneumatic slide.",
    target_object: "Magnet on the slide.",
    states_motion: "Two distinct detection positions separated by 25 mm. I need two independent electrical signals. Two independent normally open outputs with one common wire, three-wire cable preferred.",
    electrical: "24 V DC PLC input, 10 mA.",
  };
  test("la phrase exacte lève le point de validation, sans bloquer", () => {
    const fit = assessApplicationFit(req(B04), "", { mountingChosen: false, envelopeSet: false });
    expect(fit.blocking).toBe(false);
    expect(fit.validationPoints).toContain(VALIDATION_POINT.dualOutput);
    expect(VALIDATION_POINT.dualOutput).toMatch(/n'est qu'un élément du système/);
  });
  for (const s of ["I need two independent electrical signals.", "Two independent normally open outputs.", "Deux sorties indépendantes avec un fil commun.", "Three-wire cable with one common wire for both outputs, two contacts."])
    test(`variante : ${s}`, () => {
      expect(assessApplicationFit(req({ ...B04, states_motion: s }), "", { mountingChosen: false, envelopeSet: false }).validationPoints).toContain(VALIDATION_POINT.dualOutput);
    });
  test("deux états mécaniques d'une seule sortie : aucun point", () => {
    const fit = assessApplicationFit(req({ ...B04, states_motion: "Two states, open and closed, one output." }), "", { mountingChosen: false, envelopeSet: false });
    expect(fit.validationPoints).not.toContain(VALIDATION_POINT.dualOutput);
  });
});

describe("B05 — MK02, cible en acier à aimant intégré", () => {
  const B05 = {
    detection_goal: "Detect the presence of a steel plate on a conveyor.",
    target_object: "Ferrous steel plate, no external magnet can be added. An MK02 sensor with integrated bias magnet is acceptable.",
    states_motion: "The plate passes 3 mm from the sensor.",
    electrical: "24 V PLC 10 mA",
    environment: "Indoor 20 °C",
  };
  test("MK02 en tête, raison explicite, aucune distance garantie", () => {
    const { ids, ranked, fit } = top3(B05);
    expect(fit.blocking).toBe(false);
    expect(ids[0]).toBe("MK02");
    expect(ranked[0]!.reason).toMatch(/sans aimant externe/);
    expect(fit.validationPoints).toContain(VALIDATION_POINT.internalBias);
  });
  test("la carte MK02 affiche l'aimant intégré, pas un aimant externe", () => {
    expect(readFileSync("src/components/leadmagnet/design-space.tsx", "utf8")).toContain('data-testid="pair-integrated-bias"');
  });
  test("aucun aimant nulle part / plaque aluminium : toujours bloqué", () => {
    for (const target of ["Aluminium plate, no magnet anywhere.", "Plastic part, no magnet at all and nothing ferrous."]) {
      const fit = assessApplicationFit(req({ detection_goal: "Detect a plate.", target_object: target }), "", { mountingChosen: false, envelopeSet: false });
      expect(fit.issues.map((i) => i.id)).toContain("no_magnetic_source");
    }
  });
});

describe("B06 — « another magnet » n'est pas « no magnet »", () => {
  const B06 = {
    detection_goal: "Detect the closed position of a sliding guard on a packaging machine.",
    target_object: "A magnet is fixed on the moving guard.",
    states_motion: "Open and closed, 10 mm gap when closed.",
    mounting: "Screw fixing on the frame.",
    electrical: "24 V DC PLC input, 10 mA, normally open.",
    environment: "Another permanent magnet is located nearby on a second station. Indoor, 20 to 40 °C.",
  };
  test("pas de blocage, point d'interférence non bloquant", () => {
    const fit = assessApplicationFit(req(B06), "", { mountingChosen: false, envelopeSet: false });
    expect(fit.issues.map((i) => i.id)).not.toContain("no_magnetic_source");
    expect(fit.validationPoints).toContain(VALIDATION_POINT.crosstalk);
  });
  for (const s of ["There is another magnet nearby.", "A second magnet is located close to the sensor.", "Un autre aimant se trouve à proximité.", "The cannon magnet holder is nearby."])
    test(`variante sans refus : ${s}`, () => {
      const fit = assessApplicationFit(req({ ...B06, environment: s }), "", { mountingChosen: false, envelopeSet: false });
      expect(fit.issues.map((i) => i.id)).not.toContain("no_magnetic_source");
    });
  for (const s of ["No magnet can be used.", "Without magnet.", "Aucun aimant n'est possible."])
    test(`vrai refus conservé : ${s}`, () => {
      const fit = assessApplicationFit(req({ detection_goal: "Detect a lid.", target_object: s }), "", { mountingChosen: false, envelopeSet: false });
      expect(fit.issues.map((i) => i.id)).toContain("no_magnetic_source");
    });
});

describe("C03 — débit continu sans élément mobile", () => {
  const C03 = {
    detection_goal: "Measure the continuous water flow rate in a sealed pipe, 0–40 litres per minute.",
    target_object: "Water in a closed pipe. No moving parts, rotor, paddle or magnetic marker permitted.",
    states_motion: "Flow varies continuously between 0 and 40 L/min.",
    mounting: "Outside the pipe.",
    electrical: "0–10 V analogue output proportional to flow.",
    environment: "Water at 20 °C.",
  };
  const ids = (o: Record<string, string>) => assessApplicationFit(req(o), "", { mountingChosen: false, envelopeSet: false }).issues.map((i) => i.id);
  test("phrases exactes : hors domaine reed", () => expect(ids(C03)).toContain("continuous_flow_measurement"));
  test("négation après la liste", () =>
    expect(ids({ ...C03, target_object: "Rotor, paddle, moving parts or magnetic markers are not permitted in the pipe." })).toContain("continuous_flow_measurement"));
  test("0–10 VDC reconnu", () => expect(ids({ ...C03, electrical: "0–10 VDC output." })).toContain("continuous_flow_measurement"));
  test("palette magnétique à seuil : reste candidat", () =>
    expect(ids({ detection_goal: "Detect when water flow exceeds a threshold with a flow switch using a magnetic paddle.", target_object: "Magnetic paddle moves with the flow.", electrical: "24 V PLC NO" })).toEqual([]));
  test("température du fluide seule : aucun blocage", () =>
    expect(ids({ detection_goal: "Detect the lid closed on a tank.", target_object: "Magnet on the lid.", environment: "Fluid at 60 °C inside the tank." })).toEqual([]));
});

describe("Puces paramétrées dans les huit langues", () => {
  const mounting: MountingChoice = { kind: "press_fit", holeDiameterMm: 9.6 };
  const env: EnvelopeMm = { lengthMm: 35, widthMm: 15, heightMm: 10 };
  const chips = suggestionFilters({ mounting, envelope: env });
  for (const l of LANGUAGES)
    test(`${l.id} : aucune puce ne reste en français, valeurs conservées`, () => {
      const out = chips.map((f) => filterLabel(f, (s) => t(s, l.id), (k, a) => msg(k, a, l.id)));
      expect(out.join(" ")).toContain("9.6");
      expect(out.join(" ")).toContain("35 mm × 15 mm × 10 mm");
      if (l.id !== "fr") expect(out.join(" ")).not.toMatch(/Tient dans la place|Corps tubulaire/);
      else expect(out.join(" ")).toContain("Tient dans la place annoncée (35 mm × 15 mm × 10 mm)");
    });
  test("l'écran ne traduit plus une phrase interpolée", () => {
    const src = readFileSync("src/components/leadmagnet/design-space.tsx", "utf8");
    expect(src).not.toContain("t(f.label)");
  });
});
