/** Un point de compatibilité ouvert ne peut pas produire un résultat positif,
 *  ni dans l'écran Résultat, ni dans le rapport exporté. */
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ResultView } from "@/components/leadmagnet/result-view";
import { FIT_PANEL } from "@/lib/leadmagnet/application-fit";
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
