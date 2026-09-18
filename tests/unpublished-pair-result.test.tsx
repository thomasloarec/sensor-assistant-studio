/** MK01 · Form C : le guide d'activation intégré ne publie AUCUNE ligne pour
 *  cette famille (vérifié : MK03, MK04, MK05, MK06-4…8, MK07, MK12, MK13, MK15,
 *  MK16, MK17, MK21 seulement). L'écran doit donc dire la vérité : la fiche
 *  produit existe, les distances de ce couple ne sont pas publiées, et rien ne
 *  suggère que la personne a déplacé l'aimant. */
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ResultView } from "../src/components/leadmagnet/result-view";
import { hasGuideData } from "../src/lib/standex/activation-guide";
import { pairCardFor } from "../src/lib/leadmagnet/pair-cards";
import { sensorById } from "../src/lib/standex/sensor-catalog";
import type { TestedPair } from "../src/lib/leadmagnet/tested-pairs";

const noop = () => {};
const pair = (patch: Partial<TestedPair> = {}): TestedPair => ({
  sensorId: "MK01",
  magnetId: "HF3225-14.95X10X5",
  approach: "D1",
  sensitivity: null,
  verdict: "unpublished",
  pullInMm: null,
  dropOutMm: null,
  travelStartMm: 30,
  travelEndMm: 0,
  mainMessage: null,
  limits: [],
  illustrative: true,
  guideReference: null,
  documentedPosition: true,
  at: "2026-09-18T10:00:00Z",
  ...patch,
});
const render = (p: TestedPair) =>
  renderToStaticMarkup(
    <ResultView
      pair={p}
      tested={[p]}
      proposals={[]}
      detectionGoal={null}
      onSeePairs={noop}
      onConfirmWithStandex={noop}
      onRequestTrial={noop}
      onReplaceMagnet={noop}
      onTestPair={noop}
    />,
  );

describe("couple sans ligne publiée dans le guide intégré", () => {
  test("aucune donnée MK01 n'est inventée ni empruntée à une autre famille", () => {
    expect(hasGuideData("MK01")).toBe(false);
    expect(sensorById("MK01").contact).toBe("unsupported");
  });

  test("le résultat nomme la cause réelle, sans parler de position", () => {
    const html = render();
    expect(html).toContain("Les distances de ce couple ne sont pas publiées.");
    expect(html).toContain("Fiche produit disponible pour ce capteur");
    expect(html).not.toContain("Revenir à une position documentée");
    expect(html).not.toContain("Position à mesurer");
    expect(html).not.toContain("distance non caractérisée");
    expect(html).not.toContain("Plage documentée");
  });

  test("la pose par défaut ne déclenche pas non plus « Replacer l'aimant »", () => {
    expect(render(pair({ documentedPosition: undefined }))).not.toContain("Replacer l'aimant");
  });

  test("la carte distingue fiche produit et distances du couple", () => {
    const card = pairCardFor(sensorById("MK01"));
    expect(card.maxPullInMm).toBeNull();
    expect(card.hasGuideRange).toBe(false);
  });
});
