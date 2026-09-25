import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { maxPublishedPullIn, pairCardFor, pairCards } from "@/lib/leadmagnet/pair-cards";
import { CUSTOM_SENSOR_ID, sensorById } from "@/lib/standex/sensor-catalog";
import { defaultMagnetFor } from "@/lib/standex/default-pairs";

const source = readFileSync("src/components/leadmagnet/design-space.tsx", "utf8");

describe("couples proposés — écran d'après les six questions", () => {
  it("le couple porte l'aimant par défaut de la source unique", () => {
    const card = pairCardFor(sensorById("MK04"));
    expect(card.magnetId).toBe(defaultMagnetFor("MK04"));
    expect(card.couple).toBe("MK04 + M04");
  });

  it("sépare toujours les identités capteur et aimant dans la carte", () => {
    expect(source).toContain('className="pair-card-identities"');
    expect(source).toContain('{t("Capteur")}');
    expect(source).toContain('{t("Aimant")}');
    expect(source).not.toContain('<p className="t-title-m">{card.couple}</p>');
  });

  it("présente des faits stables et qualifie la plage du guide", () => {
    for (const label of [
      "Matériau de l'aimant",
      "Montage du capteur",
      "Dimensions du capteur",
      "Plage indicative d'activation",
      "Référence documentaire",
      "Plage documentaire indicative, sans validation de la simulation.",
      "Distances non publiées pour ce couple",
    ]) expect(source).toContain(label);
  });

  it("la distance annoncée est la fermeture maximale RÉELLEMENT publiée pour ce couple", () => {
    expect(maxPublishedPullIn("MK04", "M04")).toBe(15);
    expect(pairCardFor(sensorById("MK04")).maxPullInMm).toBe(15);
  });

  it("un couple sans table publiée reste sans distance : rien n'est emprunté", () => {
    expect(maxPublishedPullIn("MK27", "M27")).toBeNull();
    expect(pairCardFor(sensorById("MK27")).maxPullInMm).toBeNull();
  });

  it("trois cartes au maximum, les couples documentés d'abord", () => {
    const cards = pairCards(["MK27", "MK03", "MK04", "MK05"]);
    expect(cards).toHaveLength(3);
    expect(cards[0]!.maxPullInMm).not.toBeNull();
    const documented = cards.filter((c) => c.maxPullInMm !== null).length;
    expect(cards.slice(0, documented).every((c) => c.maxPullInMm !== null)).toBe(true);
  });

  it("le schéma pédagogique sur mesure n'est jamais proposé comme couple", () => {
    const cards = pairCards([CUSTOM_SENSOR_ID, "MK04"], { limit: 5 });
    expect(cards.map((c) => c.sensorId)).not.toContain(CUSTOM_SENSOR_ID);
  });

  it("un capteur déjà choisi ouvre la liste", () => {
    const cards = pairCards(["MK04", "MK05", "MK03"], { preferredSensorId: "MK03" });
    expect(cards[0]!.sensorId).toBe("MK03");
  });

  it("l'onglet annonce les couples et le bouton final y conduit", () => {
    expect(source).toContain('t("Couples proposés")');
    expect(source).toContain('t("À tester dans votre montage")');
    expect(source).toContain('t("Voir les couples proposés")');
  });

  it("tester un couple enregistre le choix ET ouvre l'atelier sur ce couple", () => {
    expect(source).toMatch(/const testPair[\s\S]{0,220}chooseSensor[\s\S]{0,120}openWorkshopPanel/);
  });

  it("le câble et le résumé ne sont plus dans l'onglet des couples", () => {
    const tab = source.slice(
      source.indexOf("const montageSection"),
      source.indexOf("const projectContextFields"),
    );
    expect(tab).not.toContain("{cablageSection}");
    // La checklist n'est plus affichée : elle ne pilote plus l'écran d'envoi.
    expect(source).not.toContain("{projectSummaryCard}");
    // Le câble vit dans les questions facultatives de la page « Avec Standex ».
    const questions = source.slice(source.indexOf("const optionalQuestions"));
    expect(questions).toContain("{cablageSection}");
    const revue = source.slice(source.indexOf("const revueSection"));
    expect(revue).toContain("!isPcbSensor(dossier.selectedSensorId) ? optionalQuestions : null");
  });
});
