/** Couverture des huit langues et langue d'origine du projet.
 *
 * Ces tests portent sur le comportement réel : inventaire AST des textes
 * d'interface, complétude du dictionnaire, capture et conservation de la
 * langue de départ d'un projet, et non-traduction des textes saisis.
 */
import { describe, expect, test } from "bun:test";
import { inventory } from "../scripts/i18n-inventory";
import messages from "../src/lib/i18n/messages.json";
import { LANGUAGES, isLocale, setLocale, t, msg, localeTag, type Locale } from "../src/lib/i18n/core";
import { createDossier } from "../src/lib/leadmagnet/dossier";
import { buildDossierExport, parseDossierExport } from "../src/lib/leadmagnet/dossier-io";

const dictionary = messages as Record<string, string[]>;
const OTHER: Locale[] = ["en", "zh", "de", "es", "ru", "it", "ja"];

describe("Couverture des langues de l'interface", () => {
  test("aucun texte d'interface n'échappe au dictionnaire", () => {
    const findings = inventory();
    expect(findings.filter((f) => f.kind === "untranslated")).toEqual([]);
    expect(findings.filter((f) => f.kind === "missing")).toEqual([]);
  });

  test("chaque entrée porte exactement sept traductions non vides", () => {
    const broken = Object.entries(dictionary).filter(
      ([, v]) => v.length !== 7 || v.some((x) => typeof x !== "string" || x.trim() === ""),
    );
    expect(broken.map(([k]) => k)).toEqual([]);
  });

  test("une entrée à trous de saisie garde ses trous dans les sept langues", () => {
    const mismatched = Object.entries(dictionary).filter(([source, values]) => {
      const holes = (source.match(/\{\d+\}/g) ?? []).sort().join(",");
      return values.some((v) => (v.match(/\{\d+\}/g) ?? []).sort().join(",") !== holes);
    });
    expect(mismatched.map(([k]) => k)).toEqual([]);
  });

  test("les huit langues sont proposées et ont une étiquette de langue valide", () => {
    expect(LANGUAGES.map((l) => l.id)).toEqual(["fr", "en", "zh", "de", "es", "ru", "it", "ja"]);
    for (const l of LANGUAGES) expect(localeTag(l.id)).toMatch(/^[a-z]{2}-[A-Z]{2}$/);
  });

  test("les huit langues successives ne laissent aucun résidu français sur des textes clés", () => {
    const samples = ["Nouveau projet", "Renommer", "Valider", "Annuler"].filter(
      (s) => dictionary[s],
    );
    expect(samples.length).toBeGreaterThan(0);
    for (const locale of OTHER)
      for (const source of samples) expect(t(source, locale)).not.toBe(source);
  });

  test("les références et unités ne sont jamais traduites", () => {
    for (const locale of OTHER) {
      expect(t("MK03", locale)).toBe("MK03");
      expect(t("MK24-A-J", locale)).toBe("MK24-A-J");
      expect(t("XHP-2", locale)).toBe("XHP-2");
    }
  });

  test("un texte à trous reste utilisable dans une autre langue", () => {
    const out = msg("Renommer le projet « {0} »", ["Vanne K"], "de");
    expect(out).toContain("Vanne K");
    expect(out).not.toContain("{0}");
  });
});

describe("Langue d'origine d'un projet", () => {
  test("un projet démarré en allemand garde l'allemand comme langue d'origine", () => {
    const d = createDossier(undefined, "de");
    expect(d.sourceLocale).toBe("de");
    setLocale("ja");
    // Changer la langue de l'interface ne réécrit pas le projet déjà démarré.
    expect(d.sourceLocale).toBe("de");
    setLocale("fr");
  });

  test("le titre par défaut est rédigé dans la langue de départ du projet", () => {
    expect(createDossier(undefined, "de").title).toBe("Neues Explorationsprojekt");
    expect(createDossier(undefined, "ja").title).not.toBe("Nouveau projet d'exploration");
    expect(createDossier(undefined, "fr").title).toBe("Nouveau projet d'exploration");
  });



  test("la langue d'origine survit à l'export puis à la reprise", () => {
    const d = { ...createDossier(undefined, "ja"), title: "Projet volet" };
    const back = parseDossierExport(JSON.parse(JSON.stringify(buildDossierExport(d))));
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.dossier.sourceLocale).toBe("ja");
    expect(back.dossier.title).toBe("Projet volet");
  });

  test("un texte saisi par l'utilisateur reste intact quelle que soit l'interface", () => {
    const saisie = "Détecter la fermeture du capot arrière";
    const d = createDossier(undefined, "ja");
    d.freeConstraints = saisie;
    const back = parseDossierExport(JSON.parse(JSON.stringify(buildDossierExport(d))));
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    setLocale("ja");
    expect(back.dossier.freeConstraints).toBe(saisie);
    setLocale("fr");
  });

  test("un dossier plus ancien, sans langue d'origine, repart en français", () => {
    const raw = JSON.parse(JSON.stringify(buildDossierExport(createDossier(undefined, "es"))));
    delete (raw.dossier as Record<string, unknown>).sourceLocale;
    const back = parseDossierExport(raw);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.dossier.sourceLocale).toBe("fr");
  });

  test("une langue inconnue n'est jamais adoptée", () => {
    expect(isLocale("kr")).toBe(false);
    expect(createDossier(undefined, "kr" as Locale).sourceLocale).toBe("fr");
    const raw = JSON.parse(JSON.stringify(buildDossierExport(createDossier(undefined, "it"))));
    (raw.dossier as Record<string, unknown>).sourceLocale = "kr";
    const back = parseDossierExport(raw);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.dossier.sourceLocale).toBe("fr");
  });
});
