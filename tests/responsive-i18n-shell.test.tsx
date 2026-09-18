import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { LANGUAGES, setLocale, subscribeLocale, t } from "../src/lib/i18n/core";

const css = readFileSync("src/styles.css", "utf8");
const shell = readFileSync("src/routes/standex.tsx", "utf8");
const designSpace = readFileSync("src/components/leadmagnet/design-space.tsx", "utf8");
const panel = readFileSync("src/components/leadmagnet/workspace-panel.tsx", "utf8");
const widths = [620, 768, 1024] as const;

afterAll(() => {
  setLocale("fr");
});

describe("en-têtes adaptatifs dans les huit langues", () => {
  test("aucun titre ni statut n'est réduit, masqué ou tronqué", () => {
    expect(css).not.toContain(".project-header .project-title-display {\n      max-width: 5.5rem;");
    expect(css).not.toContain("color: transparent;");
    expect(css).not.toContain(".workspace-panel-brand + .workspace-panel-title");
    expect(designSpace).toContain('className="t-title-l min-w-0"');
    expect(panel).toContain('className="workspace-panel-title t-title-s"');
  });

  test("les trois largeurs utilisent une zone de titre flexible et des contrôles de 44 px", () => {
    for (const width of widths) {
      expect(width).toBeGreaterThanOrEqual(620);
      expect(css).toContain("grid-template-columns: minmax(0, 1fr) auto;");
      expect(css).toContain(".project-header .project-title-display h1 {\n      white-space: normal;");
      expect(css).toContain(".workspace-panel-heading {\n      order: 2;\n      flex-basis: 100%;");
      expect(designSpace).toContain("min-h-11 min-w-11");
      expect(panel).toContain("min-h-11");
    }
  });

  test("les titres de compte et les états restent complets dans les 24 combinaisons", () => {
    for (const width of widths) {
      for (const { id } of LANGUAGES) {
        expect(t("Mon espace", id), `${width}px ${id}`).not.toBeEmpty();
        expect(t("Brouillon", id), `${width}px ${id}`).not.toBeEmpty();
        expect(t("Envoyé", id), `${width}px ${id}`).not.toBeEmpty();
      }
    }
    expect(t("Mon espace", "ru")).toBe("Мой аккаунт");
    expect(t("Mon espace", "it")).toBe("Il mio account");
    expect(t("Mon espace", "ja")).toBe("マイアカウント");
  });
});

describe("changement de langue du cadre Standex", () => {
  test("le cadre commun s'abonne et navigation + page changent dans le même rendu", () => {
    expect(shell).toContain("function StandexWorkspace() {\n  const locale = useLocale();");
    const renders: Array<[string, string]> = [];
    const unsubscribe = subscribeLocale(() => {
      renders.push([t("Projets"), t("Projets suivis")]);
    });
    for (const { id } of LANGUAGES) {
      setLocale(id);
      expect(renders.at(-1)).toEqual([t("Projets", id), t("Projets suivis", id)]);
    }
    unsubscribe();
  });
});