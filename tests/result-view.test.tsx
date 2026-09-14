import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ResultView, detectedObjectWord } from "../src/components/leadmagnet/result-view";
import type { TestedPair } from "../src/lib/leadmagnet/tested-pairs";

const noop = () => undefined;

const pair = (patch: Partial<TestedPair> = {}): TestedPair => ({
  sensorId: "MK04",
  magnetId: "M04",
  approach: "D1",
  sensitivity: "B",
  verdict: "expected",
  pullInMm: 15,
  dropOutMm: 17.5,
  travelStartMm: 32,
  travelEndMm: 5,
  mainMessage: null,
  limits: [],
  at: "2026-09-14T10:00:00.000Z",
  ...patch,
});

const render = (p: TestedPair | null) =>
  renderToStaticMarkup(
    <ResultView
      pair={p}
      detectionGoal={null}
      tested={p ? [p] : []}
      proposals={[]}
      onSeePairs={noop}
      onConfirmWithStandex={noop}
      onRequestTrial={noop}
      onReplaceMagnet={noop}
      onTestPair={noop}
    />,
  );

describe("écran Résultat", () => {
  test("sans essai : état vide et retour vers les couples", () => {
    const html = render(null);
    expect(html).toContain('data-testid="result-empty"');
    expect(html).toContain("Testez un couple pour voir son résultat ici.");
  });

  test("détection prévue : distances enregistrées, jamais recalculées", () => {
    const html = render(pair());
    expect(html).toContain('data-verdict="expected"');
    // Le séparateur décimal suit la langue active ; la valeur, elle, est celle enregistrée.
    expect(html).toMatch(/15 mm/);
    expect(html).toMatch(/17[.,]5 mm/);
    expect(html).toContain("Confirmer avec Standex →");
    expect(html).not.toContain("Demander un essai →");
  });

  test("pose non documentée : aucune valeur inventée, essai réel proposé", () => {
    const html = render(
      pair({
        verdict: "undocumented",
        pullInMm: null,
        dropOutMm: null,
        mainMessage: "Le comportement du capteur nécessite des tests en environnement réel",
      }),
    );
    expect(html).toContain('data-verdict="undocumented"');
    expect(html).toContain("Cette position n&#x27;est pas documentée.");
    expect(html).toContain("Replacer l&#x27;aimant");
    expect(html).toContain("Demander un essai →");
    expect(html).toContain("Le comportement du capteur nécessite des tests en environnement réel");
  });

  test("couple sans distances publiées : titre propre, aucun seuil emprunté", () => {
    const html = render(
      pair({ sensorId: "MK27", magnetId: "M27", verdict: "unpublished", pullInMm: null, dropOutMm: null }),
    );
    expect(html).toContain('data-verdict="unpublished"');
    expect(html).toContain("Les distances de ce couple ne sont pas publiées.");
    expect(html).toContain("Demander un essai →");
  });

  test("objet détecté : un seul mot repris, une phrase reste « votre pièce »", () => {
    expect(detectedObjectWord("capot")).toBe("capot");
    expect(detectedObjectWord("un capot qui se ferme")).toBeNull();
    expect(detectedObjectWord("   ")).toBeNull();
  });
});
