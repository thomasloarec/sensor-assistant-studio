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

describe("outil de pointage du câble : réservé au pointage actif", () => {
  // La navigation en quatre étapes a disparu de l'atelier recadré : le
  // configurateur de câble vit dans « Avec Standex ». Le pointage 3D reste
  // disponible depuis les réglages avancés et n'apparaît dans la scène que
  // lorsqu'il est RÉELLEMENT actif.
  test("le bloc n'est rendu que lorsque le pointage est actif", () => {
    expect(WORKSHOP).toContain(
      'cableRouting && tool === "cable" ? (',
    );
  });

  test("les trajets et mesures existants sont conservés", () => {
    expect(WORKSHOP).toContain("cableRouting.lengthLabel");
    expect(WORKSHOP).toContain("cableRouting.onUndo");
    expect(WORKSHOP).toContain("cableRouting.onReset");
  });
});
