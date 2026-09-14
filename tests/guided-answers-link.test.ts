/** Le parcours « six réponses → Mon montage » est-il RÉELLEMENT relié ?
 *
 * Règles vérifiées ici :
 * - le texte libre des six questions n'alimente aucun filtre : aucune fixation,
 *   aucune dimension, aucune négation interprétée, aucune langue devinée ;
 * - seul un choix structuré explicite (clic de fixation, dimension saisie)
 *   produit des filtres de suggestion ;
 * - « Je ne sais pas encore » enregistre une décision traitée sans fabriquer de
 *   valeur connue ;
 * - les dossiers anciens (sans `delegatedDecisions`) restent valides et
 *   sérialisables.
 */
import { describe, expect, test } from "bun:test";
import { newDossier, proposeRequirement, type DesignDossier } from "@/lib/leadmagnet/dossier";
import { exportDossier, parseDossier } from "@/lib/leadmagnet/dossier-io";
import {
  delegatedQuestion,
  delegatedQuestionKeys,
  isDelegated,
  projectChecklist,
  checklistProgress,
} from "@/lib/leadmagnet/project-checklist";
import { suggestionFilters } from "@/lib/leadmagnet/suggestion-filters";

const filtersOf = (d: DesignDossier) =>
  suggestionFilters({ mounting: d.mounting, envelope: d.envelope }).map((f) => f.id);

const aside = (d: DesignDossier, key: string): DesignDossier => ({
  ...d,
  delegatedDecisions: [...(d.delegatedDecisions ?? []), delegatedQuestion(key)],
});

describe("texte libre des six questions", () => {
  const freeText = [
    "machine à café, la trappe se ferme",
    "surtout PAS de vis, on ne peut rien percer",
    "no screws please, glued under the lid",
    "un logement à peu près carré",
    "ネジは使えません",
  ];

  for (const value of freeText) {
    test(`« ${value} » ne produit aucun filtre`, () => {
      let d = newDossier("fr");
      for (const key of ["detection_goal", "mounting", "envelope", "environment"]) {
        d = proposeRequirement(d, key, { value, source: "user" });
      }
      expect(d.mounting.kind).toBe("undecided");
      expect(d.envelope).toEqual({ lengthMm: null, widthMm: null, heightMm: null });
      expect(filtersOf(d)).toEqual([]);
    });
  }
});

describe("choix structurés explicites", () => {
  test("une fixation cliquée crée le filtre fixation, et lui seul", () => {
    const d: DesignDossier = { ...newDossier("fr"), mounting: { kind: "screw" } };
    expect(filtersOf(d)).toEqual(["fixation"]);
  });

  test("un trou renseigné ajoute le filtre de forme insérée", () => {
    const d: DesignDossier = {
      ...newDossier("fr"),
      mounting: { kind: "press_fit", holeDiameterMm: 6 },
    };
    expect(filtersOf(d)).toEqual(["fixation", "forme"]);
  });

  test("un trou laissé à zéro reste inconnu : pas de filtre de forme", () => {
    const d: DesignDossier = {
      ...newDossier("fr"),
      mounting: { kind: "press_fit", holeDiameterMm: 0 },
    };
    expect(filtersOf(d)).toEqual(["fixation"]);
  });

  test("une seule dimension saisie suffit à un filtre d'encombrement", () => {
    const d: DesignDossier = {
      ...newDossier("fr"),
      envelope: { lengthMm: 25, widthMm: null, heightMm: null },
    };
    expect(filtersOf(d)).toEqual(["encombrement"]);
  });
});

describe("« Je ne sais pas encore »", () => {
  test("enregistre la question comme traitée sans valeur ni filtre", () => {
    const d = aside(aside(newDossier("fr"), "mounting"), "envelope");
    expect(delegatedQuestionKeys(d).sort()).toEqual(["envelope", "mounting"]);
    expect(isDelegated(d, delegatedQuestion("mounting"))).toBe(true);
    expect(d.mounting.kind).toBe("undecided");
    expect(d.envelope.lengthMm).toBeNull();
    expect(filtersOf(d)).toEqual([]);

    const items = projectChecklist(d);
    const besoin = items.find((i) => i.id === "besoin")!;
    const montage = items.find((i) => i.id === "montage")!;
    expect(besoin.state).toBe("delegated");
    expect(montage.state).toBe("delegated");
    // Délégué compte comme traité, jamais comme validation technique.
    expect(checklistProgress(items).handled).toBe(2);
    expect(besoin.detail).toContain("aucune valeur technique");
  });

  test("un dossier neuf n'a rien de traité", () => {
    const items = projectChecklist(newDossier("fr"));
    expect(items.every((i) => i.state === "todo")).toBe(true);
    expect(checklistProgress(items).handled).toBe(0);
  });

  test("une vraie réponse reprend la main sur la délégation", () => {
    const d = proposeRequirement(aside(newDossier("fr"), "mounting"), "mounting", {
      value: "vissé sur une équerre",
      source: "user",
    });
    // Le composant retire la clé ; ici on vérifie que la réponse suffit à cocher.
    const withoutAside: DesignDossier = { ...d, delegatedDecisions: [] };
    expect(projectChecklist(withoutAside).find((i) => i.id === "besoin")!.state).toBe("chosen");
  });
});

describe("compatibilité des dossiers existants", () => {
  test("un dossier sans delegatedDecisions se relit et se réexporte", () => {
    const base = newDossier("fr");
    const raw = JSON.parse(exportDossier(base)) as Record<string, unknown>;
    delete (raw as { delegatedDecisions?: unknown }).delegatedDecisions;
    const parsed = parseDossier(JSON.stringify(raw));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.dossier.delegatedDecisions ?? []).toEqual([]);
    expect(delegatedQuestionKeys(parsed.dossier)).toEqual([]);
  });

  test("les décisions mises de côté survivent à un aller-retour", () => {
    const d = aside(newDossier("fr"), "electrical");
    const parsed = parseDossier(exportDossier(d));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(delegatedQuestionKeys(parsed.dossier)).toEqual(["electrical"]);
  });
});
