/** Un point de compatibilité ouvert ne peut pas produire un résultat positif,
 *  ni dans l'écran Résultat, ni dans le rapport exporté. */
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ResultView } from "@/components/leadmagnet/result-view";
import { assessApplicationFit, FIT_PANEL } from "@/lib/leadmagnet/application-fit";
import { projectReportSections } from "@/lib/leadmagnet/project-report";
import { createDossier, setRequirement } from "@/lib/leadmagnet/dossier";
import type { TestedPair } from "@/lib/leadmagnet/dossier";

const noop = () => {};
const pair = (): TestedPair => ({
  sensorId: "MK17",
  magnetId: "HF3225-14.95X10X5",
  approach: "D1",
  verdict: "expected",
  pullInMm: 16.6,
  dropOutMm: 14.4,
  illustrative: true,
  documentedPosition: true,
  guideReference: "MK17-B-X",
  at: "2026-09-18T10:00:00.000Z",
});

const render = (blocked: boolean) =>
  renderToStaticMarkup(
    <ResultView
      pair={pair()}
      applicationBlocked={blocked}
      detectionGoal="Détecter la fermeture du capot."
      tested={[pair()]}
      proposals={[]}
      onSeePairs={noop}
      onConfirmWithStandex={noop}
      onRequestTrial={noop}
      onReplaceMagnet={noop}
      onTestPair={noop}
    />,
  );

describe("résultat et point de compatibilité", () => {
  test("bloqué : aucun verdict positif, la démonstration est qualifiée", () => {
    const html = render(true);
    expect(html).toContain("result-application-blocked");
    expect(html).toContain(FIT_PANEL.resultHeadline);
    expect(html).toContain("ne valent pas vérification");
  });
  test("non bloqué : le résultat documenté reste inchangé", () => {
    const html = render(false);
    expect(html).not.toContain("result-application-blocked");
    expect(html).not.toContain(FIT_PANEL.resultHeadline);
  });
});

describe("rapport exporté", () => {
  test("le point de compatibilité est écrit, avec les modifications proposées", () => {
    let d = createDossier("Projet", "fr");
    d = setRequirement(
      d,
      "electrical",
      {
        value:
          "The motor operates at 230 VAC and draws 8 A. I want the motor supply current to pass directly through the reed sensor.",
        source: "user",
      },
    );
    const sections = projectReportSections(d, {}, (s: string) => s, null);
    const flat = JSON.stringify(sections);
    expect(flat).toContain("Compatibilité de votre application");
    expect(flat).toContain("Le capteur ne peut pas couper lui-même");
    expect(flat).toContain("8 A");
    expect(flat).toContain("Aucun produit n'est proposé");
  });
  test("un besoin cohérent n'ajoute aucune section de compatibilité", () => {
    let d = createDossier("Projet", "fr");
    d = setRequirement(d, "electrical", {
      value: "Signal vers un automate en 24 V continu.",
      source: "user",
    });
    expect(JSON.stringify(projectReportSections(d, {}, (s: string) => s, null))).not.toContain(
      "Compatibilité de votre application",
    );
  });
});

describe("encart de compatibilité : liens vers le questionnaire", () => {
  test("la précision supplémentaire est un bouton cliquable, sans numéro de question", async () => {
    const { CompatibilityPanel } = await import("@/components/leadmagnet/compatibility-panel");
    const { assessApplicationFit } = await import("@/lib/leadmagnet/application-fit");
    const fit = assessApplicationFit(
      [
        { key: "electrical", value: "230 VAC, 8 A : le courant du moteur passe directement dans le capteur reed.", state: "confirmed", source: "client" },
      ],
      "Je veux éviter d'utiliser un relais ou un contacteur supplémentaire.",
    );
    expect(fit.blocking).toBe(true);
    const html = renderToStaticMarkup(
      <CompatibilityPanel assessment={fit} onGoToStep={() => {}} />,
    );
    expect(html).toContain('data-step="free_constraints"');
    expect(html).toContain('data-step="electrical"');
    // La précision n'est jamais présentée comme une question numérotée.
    const idx = html.indexOf('data-step="free_constraints"');
    expect(html.slice(idx, idx + 300)).not.toContain("Question");
    expect(html.slice(idx, idx + 300)).toContain("Précision supplémentaire");
  });
});

describe("Résultat sans couple essayé", () => {
  const fit = assessApplicationFit(
    [
      setRequirement(createDossier("d3", "fr"), "detection_goal", {
        value: "Detect an aluminum part; no magnet can be added.",
        source: "client",
      }).requirements.find((r) => r.key === "detection_goal")!,
    ],
    "",
  );
  const html = renderToStaticMarkup(
    <ResultView
      pair={null}
      applicationBlocked
      fit={fit}
      onGoToStep={noop}
      detectionGoal="Detect an aluminum part; no magnet can be added."
      tested={[]}
      proposals={[]}
      onSeePairs={noop}
      onConfirmWithStandex={noop}
      onRequestTrial={noop}
      onReplaceMagnet={noop}
      onTestPair={noop}
    />,
  );
  test("l'encart pédagogique complet remplace « Testez un couple »", () => {
    expect(fit.blocking).toBe(true);
    expect(html).toContain('data-testid="fit-panel"');
    expect(html).toContain('data-testid="result-blocked-empty"');
    expect(html).not.toContain("Testez un couple pour voir son résultat ici");
    expect(html).not.toContain("Voir les couples proposés");
  });
  test("les liens d'édition exacts sont présents", () => {
    expect(html).toContain('data-step="target_object"');
    expect(html).toContain('data-step="mounting"');
    expect(html).toContain(FIT_PANEL.changeAction);
  });
  test("sans point ouvert, l'écran vide habituel revient", () => {
    const plain = renderToStaticMarkup(
      <ResultView
        pair={null}
        detectionGoal={null}
        tested={[]}
        proposals={[]}
        onSeePairs={noop}
        onConfirmWithStandex={noop}
        onRequestTrial={noop}
        onReplaceMagnet={noop}
        onTestPair={noop}
      />,
    );
    expect(plain).toContain('data-testid="result-empty"');
  });
  test("avec un couple essayé, l'encart s'affiche aussi et sans bouton redondant", () => {
    const withPair = renderToStaticMarkup(
      <ResultView
        pair={pair()}
        applicationBlocked
        fit={fit}
        onGoToStep={noop}
        detectionGoal="Detect an aluminum part; no magnet can be added."
        tested={[pair()]}
        proposals={[]}
        onSeePairs={noop}
        onConfirmWithStandex={noop}
        onRequestTrial={noop}
        onReplaceMagnet={noop}
        onTestPair={noop}
      />,
    );
    expect(withPair).toContain('data-testid="result-application-blocked"');
    expect(withPair).toContain('data-testid="fit-panel"');
    expect(withPair).not.toContain("Revoir les points de compatibilité");
  });
});

describe("essai « attendu » périmé dans le rapport", () => {
  const stale = (): TestedPair => ({
    sensorId: "MK17",
    magnetId: "HF3225-14.95X10X5",
    approach: "D1",
    verdict: "expected",
    pullInMm: 16.6,
    dropOutMm: 14.4,
    illustrative: true,
    documentedPosition: true,
    guideReference: "MK17-B-X",
    at: "2026-09-18T10:00:00.000Z",
  });
  const blockedDossier = () => {
    let d = createDossier("Projet", "fr");
    d = setRequirement(d, "electrical", {
      value:
        "The motor operates at 230 VAC and draws 8 A. I want the motor supply current to pass directly through the reed sensor.",
      source: "user",
    });
    return { ...d, testedPairs: [stale()] };
  };

  test("la donnée historique est conservée mais n'est plus une conclusion positive", () => {
    const flat = JSON.stringify(projectReportSections(blockedDossier(), {}, (s: string) => s, null));
    expect(flat).toContain("MK17 + HF3225-14.95X10X5");
    expect(flat).toContain(FIT_PANEL.historicalDemo);
    expect(flat).not.toContain("Détection attendue");
  });

  test("sans point de compatibilité, le verdict historique reste écrit tel quel", () => {
    let d = createDossier("Projet", "fr");
    d = setRequirement(d, "electrical", { value: "Signal 24 V vers un automate.", source: "user" });
    const flat = JSON.stringify(
      projectReportSections({ ...d, testedPairs: [stale()] }, {}, (s: string) => s, null),
    );
    expect(flat).not.toContain(FIT_PANEL.historicalDemo);
    expect(flat).toContain("MK17 + HF3225-14.95X10X5");
  });

  test("le lien pédagogique est nommé, sans URL brute dans le texte", async () => {
    const { CompatibilityPanel } = await import("@/components/leadmagnet/compatibility-panel");
    const fit = assessApplicationFit(
      [
        {
          key: "electrical",
          value: "230 VAC, 8 A : le courant du moteur passe directement dans le capteur reed.",
          state: "confirmed",
          source: "client",
        },
      ],
      "",
    );
    const html = renderToStaticMarkup(
      <CompatibilityPanel assessment={fit} onGoToStep={() => {}} />,
    );
    expect(html).toContain("fit-source-link");
    expect(html).toContain(FIT_PANEL.sourceLabel);
    expect(html).not.toContain("diode");
    expect(html).not.toContain("varistance");
  });
});
