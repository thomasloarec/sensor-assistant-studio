import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const PANEL = readFileSync("src/components/leadmagnet/workspace-panel.tsx", "utf8");
const WORKSHOP = readFileSync("src/components/standex/workshop/workshop.tsx", "utf8");

describe("en-tête des panneaux : marque et nom de l'outil (point 11)", () => {
  test("le nom Sensor Studio est présent dans l'en-tête du panneau", () => {
    expect(PANEL).toContain("Sensor Studio");
    expect(PANEL).toContain("app-header-tool");
  });

  test("la marque passe par BrandLogo, jamais par public/brand", () => {
    expect(PANEL).toContain("<BrandLogo");
    expect(PANEL).not.toContain("/brand/");
  });

  test("le verrou complet n'est pas réduit sous le plancher de charte", () => {
    expect(PANEL).toContain('variant="mark"');
  });
});

describe("outil de pointage du câble : réservé à l'étape câble", () => {
  test("le bloc n'est rendu qu'à l'étape 4 ou pointage actif", () => {
    expect(WORKSHOP).toContain(
      'cableRouting && (step === 3 || tool === "cable") ? (',
    );
  });

  test("les trajets et mesures existants sont conservés", () => {
    expect(WORKSHOP).toContain("cableRouting.lengthLabel");
    expect(WORKSHOP).toContain("cableRouting.onUndo");
    expect(WORKSHOP).toContain("cableRouting.onReset");
  });
});
