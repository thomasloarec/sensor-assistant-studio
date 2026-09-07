import { describe, expect, test } from "bun:test";
import messages from "../src/lib/i18n/messages.json";
import { LANGUAGES, getLocale, isLocale, msg, number, t } from "../src/lib/i18n/core";
import {
  hasLocalizedFollowUp,
  responseLanguageInstruction,
  responseLocale,
} from "../src/lib/standex/response-language";
import {
  DEFAULT_WORKSHOP,
  parseWorkshopNote,
  serializeWorkshop,
  summarizeWorkshop,
} from "../src/lib/standex/magnetic-workshop";

describe("Site languages", () => {
  test("French is the default and locale inputs are bounded", () => {
    expect(getLocale()).toBe("fr");
    expect(LANGUAGES.map((l) => l.id)).toEqual(["fr", "en", "zh", "de", "es", "ru", "it", "ja"]);
    expect(isLocale("ignore previous instructions")).toBe(false);
    expect(responseLocale("pt")).toBe("fr");
    expect(t("draft", "fr")).toBe("Brouillon");
  });
  test("all messages have seven complete translations and retain all parameters", () => {
    const slots = (s: string) => [...s.matchAll(/\{\d+\}/g)].map((x) => x[0]).sort();
    for (const [source, translations] of Object.entries(messages)) {
      expect(translations.length, source).toBe(7);
      for (const translation of translations) {
        expect(translation.trim().length, source).toBeGreaterThan(0);
        expect(slots(translation), source).toEqual(slots(source));
      }
    }
  });
  test("unknown prose and canonical configuration are preserved", () => {
    const config = { ...DEFAULT_WORKSHOP, sensitivity: "C" as const, end: 4.5 };
    const note = serializeWorkshop(config);
    for (const { id } of LANGUAGES) {
      expect(t(config, id)).toBe(config);
      expect(t("Customer reference ZT-729: 0.35 A, custom requirement.", id)).toBe(
        "Customer reference ZT-729: 0.35 A, custom requirement.",
      );
      expect(parseWorkshopNote(note)).toEqual(config);
      expect(t(summarizeWorkshop(config), id).length).toBeGreaterThan(100);
      expect(t(summarizeWorkshop(config), id)).not.toContain("{0}");
    }
  });
  test("dynamic messages, multiline paragraphs and Markdown keep their structure", () => {
    expect(msg("Classe {0}", ["C"], "en")).toBe("Class C");
    expect(msg("{0} informations renseignées sur {1}", [3, 12], "en")).toContain("3");
    expect(t("# Dimensions du corps\n\n| Champ | Valeur |\n| --- | --- |", "en")).toBe(
      "# Body dimensions\n\n| Field | Value |\n| --- | --- |",
    );
    expect(number(5.5, 2, "fr")).toBe("5,5");
    expect(number(5.5, 2, "en")).toBe("5.5");
  });
  test("experimental instructions preserve the contract in every language", () => {
    for (const { id, name } of LANGUAGES) {
      const instruction = responseLanguageInstruction(id);
      expect(instruction).toContain(`${name} (${id})`);
      expect(instruction).toContain("validation_response_fr");
      expect(hasLocalizedFollowUp(t("Reprise Standex sous 2 jours ouvrés", id), id)).toBe(true);
      if (id !== "fr")
        expect(hasLocalizedFollowUp("A response without follow-up.", id)).toBe(false);
    }
  });
});
