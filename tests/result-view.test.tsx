import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ResultView, detectedObjectWord } from "../src/components/leadmagnet/result-view";
import type { TestedPair } from "../src/lib/leadmagnet/tested-pairs";
import { recordClientTrace, currentClientTrace } from "../src/lib/standex/client-pedagogical";
import { createDossier } from "../src/lib/leadmagnet/dossier";
import { DEFAULT_WORKSHOP } from "../src/lib/standex/magnetic-workshop";
import { CATALOGUE_LABELS } from "../src/lib/standex/catalogue-pedagogical";

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
  test("changed pair restores both product illustrations, synchronizes configuration and presents two ordered actions",()=>{
    const config={...DEFAULT_WORKSHOP,sensorId:"MK03",magnetModel:"NDFEB250175H-6X10",sensitivity:"B"};
    const dossier=recordClientTrace({...createDossier(),selectedSensorId:"MK13"},config);
    expect(dossier.selectedSensorId).toBe("MK03");
    expect(dossier.workshopSensorId).toBe("MK03");expect(dossier.sensorSyncConfirmed).toBe(true);
    const trace=currentClientTrace(dossier)!;
    const html=renderToStaticMarkup(<ResultView pedagogicalResult={trace} pair={null} tested={[]} proposals={[]}
      detectionGoal={null} onSeePairs={noop} onConfirmWithStandex={noop} onContinue={noop}
      onRequestTrial={noop} onReplaceMagnet={noop} onTestPair={noop}/>);
    expect(html).toContain('data-magnet-drawn="3d"');
    expect(html).toContain('MK03');expect(html).toContain('NDFEB250175H-6X10');expect(html).not.toContain('MK13');
    expect(html).toContain('Capteur');expect(html).toContain('Aimant');
    expect(html.split(CATALOGUE_LABELS.notice)).toHaveLength(2);
    expect(html).not.toContain(CATALOGUE_LABELS.datum);expect(html).not.toContain(CATALOGUE_LABELS.proxy);
    expect(html).not.toContain('Une revue publiée');expect(html).not.toContain("Replacer l");
    expect(html.match(/<button/g)).toHaveLength(2);
    expect(html.indexOf('Tester un autre couple')).toBeLessThan(html.indexOf('Configurer votre capteur'));
    // Presentation simplification never erases the provenance from the saved trace.
    expect(trace.reasons).toContain(CATALOGUE_LABELS.datum);
  });
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
    expect(html).toContain("Capteur");
    expect(html).toContain("Aimant");
    expect(html).not.toContain("MK04 + M04");
    expect(html).not.toContain("Distances non publiées pour ce couple");
  });

  test("les faits de l'aimant suivent le couple testé, pas son aimant conseillé", () => {
    const html = render(pair({ sensorId: "MK15", magnetId: "NDFEB-10X5X1.9" }));
    expect(html).toContain("NDFEB-10X5X1.9");
    expect(html).toContain("NdFeB");
    expect(html).not.toContain("Distances non publiées pour ce couple");
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
    expect(html).not.toContain("Replacer l&#x27;aimant");
    expect(html).toContain("Tester un autre couple");
    expect(html).toContain("Confirmer avec Standex →");
    expect(html).toContain("Le comportement du capteur nécessite des tests en environnement réel");
  });

  test("couple sans distances publiées : titre propre, aucun seuil emprunté", () => {
    const html = render(
      pair({ sensorId: "MK27", magnetId: "M27", verdict: "unpublished", pullInMm: null, dropOutMm: null }),
    );
    expect(html).toContain('data-verdict="unpublished"');
    expect(html).toContain("Les distances de ce couple ne sont pas publiées.");
    expect(html).toContain("Confirmer avec Standex →");
  });

  test("objet détecté : un seul mot repris, une phrase reste « votre pièce »", () => {
    expect(detectedObjectWord("capot")).toBe("capot");
    expect(detectedObjectWord("un capot qui se ferme")).toBeNull();
    expect(detectedObjectWord("   ")).toBeNull();
  });
});
