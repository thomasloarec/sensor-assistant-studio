import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { inventory, isTechnicalString } from "../scripts/i18n-inventory";
import { LANGUAGES, msg, t } from "../src/lib/i18n/core";

const findings = inventory();

describe("Aucune chaîne technique ne passe par le dictionnaire", () => {
  test("l'inventaire ne signale ni classe traduite ni texte figé au chargement", () => {
    const bad = findings.filter((f) => f.kind === "code-translated" || f.kind === "frozen");
    expect(bad).toEqual([]);
  });

  test("l'inventaire ne signale aucun texte d'interface hors dictionnaire", () => {
    expect(findings).toEqual([]);
  });

  test("les classes, media queries et modules sont reconnus comme techniques", () => {
    for (const value of [
      "(prefers-reduced-motion: reduce)",
      "min-h-screen bg-background text-foreground",
      "t-caption text-[var(--success)]",
      "inset-y-0 right-0 w-full sm:max-w-3xl lg:max-w-4xl",
      "@/components/leadmagnet/design-space",
    ])
      expect(isTechnicalString(value)).toBe(true);
    for (const value of ["Continuer", "Question 1 sur 6", "Que voulez-vous détecter ?"])
      expect(isTechnicalString(value)).toBe(false);
  });

  test("le dictionnaire ne contient aucune classe CSS ni media query", () => {
    const dict = JSON.parse(readFileSync("src/lib/i18n/messages.json", "utf8")) as Record<
      string,
      string[]
    >;
    const technical = Object.keys(dict).filter((k) => isTechnicalString(k));
    expect(technical).toEqual([]);
    for (const [key, values] of Object.entries(dict)) {
      expect(values.length, key).toBe(LANGUAGES.length - 1);
      for (const v of values) expect(v.trim().length, key).toBeGreaterThan(0);
    }
  });

  test("les phrases entières changent réellement de langue", () => {
    expect(t("Continuer", "de")).toBe("Weiter");
    expect(t("Continuer", "ja")).not.toBe("Continuer");
    expect(msg("Question {0} sur {1}", [2, 6], "de")).toBe("Frage 2 von 6");
    expect(msg("Question {0} sur {1}", [2, 6], "en")).toBe("Question 2 of 6");
  });
});
