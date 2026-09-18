/**
 * Recette ciblée de la passe consolidée.
 *
 * Chaque test reproduit un constat réel : navigation du calendrier bloquée au
 * changement de mois, récapitulatif d'essai qui annonçait « distances non
 * publiées » alors que la brochure publie la ligne, titres automatiques
 * réduits au début de la phrase, et pose physique modifiée pour tomber sur une
 * ligne du guide.
 */
import { describe, expect, test } from "bun:test";
import { navigateMonday, shiftWeek, weekStart, workWeek } from "@/components/leadmagnet/booking-dialog";
import { testedPairGuideFact } from "@/lib/leadmagnet/tested-pair-guide";
import { suggestedProjectTitle } from "@/lib/leadmagnet/product-presentation";
import { withDefaultGuideSelection } from "@/lib/standex/magnetic-workshop";
import type { TestedPair } from "@/lib/leadmagnet/tested-pairs";

describe("calendrier de démonstration : navigation par mois", () => {
  test("le lundi visé tombe DANS le mois cible (28 sept. -> 5 oct.)", () => {
    // Semaine du 14 septembre (mois affiché : septembre).
    const sep14 = new Date(2026, 8, 14);
    const next = shiftWeek(sep14, 1, "month");
    expect(next.getMonth()).toBe(9); // octobre
    expect(next.getDay()).toBe(1); // lundi
    expect(next.getDate()).toBeLessThanOrEqual(7);
    // La semaine du 28 septembre est affichée « septembre » (libellé du lundi) :
    // le mois suivant est octobre, dont le premier lundi est le 5 octobre.
    const fromSep28 = shiftWeek(new Date(2026, 8, 28), 1, "month");
    expect(fromSep28.getMonth()).toBe(9);
    expect(fromSep28.getDay()).toBe(1);
    expect(fromSep28.getDate()).toBe(5);
  });

  test("fin novembre : le mois suivant est bien décembre, pas novembre", () => {
    // Semaine du 30 novembre : affichée « novembre », le mois suivant est
    // décembre, dont le premier lundi est le 7 décembre.
    const nov30 = new Date(2026, 10, 30);
    const next = shiftWeek(nov30, 1, "month");
    expect(next.getMonth()).toBe(11);
    expect(next.getDay()).toBe(1);
    expect(next.getDate()).toBe(7);
  });

  test("avance et recul répétés restent cohérents, y compris au changement d'année", () => {
    const now = new Date(2026, 8, 15);
    let monday = weekStart(now);
    const months: string[] = [];
    for (let i = 0; i < 8; i += 1) {
      monday = navigateMonday(monday, now, 1, "month");
      months.push(`${monday.getFullYear()}-${monday.getMonth()}`);
      expect(monday.getDay()).toBe(1);
    }
    expect(months).toEqual([
      "2026-9",
      "2026-10",
      "2026-11",
      "2027-0",
      "2027-1",
      "2027-2",
      "2027-3",
      "2027-4",
    ]);
    for (let i = 0; i < 8; i += 1) monday = navigateMonday(monday, now, -1, "month");
    // Retour au mois en cours : la semaine en cours, jamais un lundi passé.
    expect(monday.getTime()).toBe(weekStart(now).getTime());
  });

  test("la grille reste lundi→vendredi", () => {
    const days = workWeek(new Date(2026, 9, 7));
    expect(days).toHaveLength(5);
    expect(days.map((d) => d.getDay())).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("récapitulatif d'un essai : la ligne du guide réellement enregistrée", () => {
  const pair = (over: Partial<TestedPair> = {}): TestedPair =>
    ({
      sensorId: "MK17",
      magnetId: "HF3225-14.95X10X5",
      approach: "D1",
      sensitivity: "B",
      verdict: "unpublished",
      pullInMm: null,
      dropOutMm: null,
      travelStartMm: 0,
      travelEndMm: 20,
      mainMessage: "",
      limits: [],
      guideReference: "MK17-B-X",
      at: "2026-09-18",
      ...over,
    }) as TestedPair;

  test("MK17 + ferrite en D1 : bornes, variante exacte et page de la brochure", () => {
    const fact = testedPairGuideFact(pair());
    expect(fact).not.toBeNull();
    expect(fact!.range.page).toBe(35);
    expect(fact!.range.sensorReference).toBe("MK17-B-X");
    expect(fact!.label).toContain("14,4");
    expect(fact!.label).toContain("16,6");
    expect(fact!.label).toContain("MK17-B-X");
    expect(fact!.label).toContain("35");
  });

  test("sans variante enregistrée, aucune plage n'est empruntée", () => {
    expect(testedPairGuideFact(pair({ guideReference: undefined }))).toBeNull();
  });

  test("MK01 : la brochure ne publie rien, donc aucun fait inventé", () => {
    expect(
      testedPairGuideFact(pair({ sensorId: "MK01", guideReference: "MK01-B-X" })),
    ).toBeNull();
  });
});

describe("titres automatiques : le nom de la pièce", () => {
  test("réservoir d'eau amovible", () => {
    expect(
      suggestedProjectTitle(
        "Détecter automatiquement la présence du réservoir d'eau amovible d'une machine à café professionnelle.",
      ),
    ).toBe("Réservoir d'eau amovible");
  });

  test("porte de lave-vaisselle", () => {
    expect(suggestedProjectTitle("Détecter la fermeture de la porte du lave-vaisselle.")).toBe(
      "Porte de lave-vaisselle",
    );
  });

  test("48 caractères au plus, jamais coupé en milieu de mot ni sur un petit mot", () => {
    const title = suggestedProjectTitle(
      "Détecter la position du chariot de manutention automatisé extrêmement long de la ligne",
    );
    expect(title.length).toBeLessThanOrEqual(48);
    expect(title.endsWith(" ")).toBe(false);
    expect(/\b(?:de|du|des|la|le|et|ou)$/i.test(title)).toBe(false);
  });

  test("une phrase sans groupe nominal ne produit pas un titre vide fabriqué", () => {
    expect(suggestedProjectTitle("")).toBe("");
  });
});

describe("pose physique : la lecture du guide ne déplace rien", () => {
  const config = {
    sensorId: "MK17",
    magnetModel: "HF3225-14.95X10X5",
    sensitivity: "B",
    geometry: "F1",
    magnetAngle: 37,
    mode: "reference",
    guideReference: null,
  } as never;

  test("une approche sans ligne publiée garde sa géométrie et son angle", () => {
    const next = withDefaultGuideSelection(config) as {
      geometry: string;
      magnetAngle: number;
      guideReference: string | null;
    };
    expect(next.geometry).toBe("F1");
    expect(next.magnetAngle).toBe(37);
    expect(next.guideReference).toBeNull();
  });

  test("l'approche dessinée qui EST publiée voit sa variante résolue, sans rotation", () => {
    const next = withDefaultGuideSelection({ ...(config as object), geometry: "D1" } as never) as {
      geometry: string;
      magnetAngle: number;
      guideReference: string | null;
    };
    expect(next.geometry).toBe("D1");
    expect(next.magnetAngle).toBe(37);
    expect(next.guideReference).not.toBeNull();
  });
});
