import { describe, expect, test } from "bun:test";
import {
  createDossier,
  REQUIREMENT_ORDER,
  REQUIREMENT_LABELS,
  type DesignDossier,
} from "../src/lib/leadmagnet/dossier";
import { GUIDED_QUESTIONS } from "../src/components/leadmagnet/design-space";
import { requirementAnswer } from "../src/lib/leadmagnet/requirement-answer";

describe("clés d'exigences : ajout, jamais réinterprétation", () => {
  test("six questions visibles, aucune question de volume ni de calendrier", () => {
    expect(GUIDED_QUESTIONS.map((q) => q.key)).toEqual([
      "detection_goal",
      "target_object",
      "states_motion",
      "mounting",
      "electrical",
      "environment",
    ]);
    const text = GUIDED_QUESTIONS.map((q) => `${q.category} ${q.prompt}`).join(" ").toLowerCase();
    for (const forbidden of ["volume", "annuel", "série", "date", "prix"]) {
      expect(text).not.toContain(forbidden);
    }
    // Les dimensions ne sont demandées qu'une fois, en saisie structurée.
    expect(GUIDED_QUESTIONS.filter((q) => /dimension/i.test(q.prompt)).length).toBe(0);
  });

  test("`target_object` est ADDITIF : `envelope` garde son sens de dimensions", () => {
    expect(REQUIREMENT_ORDER).toContain("target_object");
    expect(REQUIREMENT_ORDER).toContain("envelope");
    expect(REQUIREMENT_LABELS["envelope"]).toBe("Dimensions disponibles");
    expect(REQUIREMENT_LABELS["target_object"]).toBe("Élément à détecter");
    // `envelope` n'est PAS une question posée : les dimensions sont sous Montage.
    expect(GUIDED_QUESTIONS.some((q) => q.key === "envelope")).toBe(false);
  });

  test("une réponse `envelope` déjà écrite reste lisible, avec les dimensions saisies", () => {
    const legacy: DesignDossier = {
      ...createDossier(),
      requirements: [
        { key: "envelope", value: "boîtier étroit, 12 mm de dégagement", state: "confirmed", source: "user" },
      ],
      envelope: { lengthMm: 30, widthMm: 12, heightMm: null },
    };
    const shown = requirementAnswer(legacy, "envelope");
    expect(shown).toContain("boîtier étroit, 12 mm de dégagement");
    expect(shown).toContain("Longueur : 30 mm");
    expect(shown).toContain("Largeur : 12 mm");
    expect(shown).not.toContain("Hauteur");
    // Le texte historique n'est pas déplacé vers la nouvelle clé.
    expect(requirementAnswer(legacy, "target_object")).toBe("");
  });
});
