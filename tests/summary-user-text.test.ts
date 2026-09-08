import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { connectorSummaryLines } from "../src/lib/leadmagnet/connectors";
import { LANGUAGES, t } from "../src/lib/i18n/core";
import type { Termination } from "../src/lib/leadmagnet/connectors";

/** Textes saisis par la personne, choisis EXPRÈS égaux à des entrées du
 * dictionnaire : ils doivent rester intacts dans toutes les langues. */
const PINOUT = "Fabricant";
const CONDITIONS = "Référence exacte";
const FREE_TEXT = "Conditions";

const termination: Termination = {
  kind: "unqualified_connector",
  status: "to_verify_by_rnd",
  spec: {
    manufacturer: "JST",
    mpn: "XHP-2",
    mating: "B2B-XH-A",
    gender: "female",
    positions: 2,
    pinout: PINOUT,
    wireGauge: "AWG 26",
    cable: null,
    conditions: CONDITIONS,
  },
};

const freeReference: Termination = { kind: "free_reference", text: FREE_TEXT };

describe("résumé terminaison : étiquettes traduites, saisie intacte", () => {
  it("le résumé canonique français est inchangé", () => {
    const lines = connectorSummaryLines(termination);
    expect(lines[0]).toBe("Fabricant : JST");
    expect(lines[4]).toBe(`Brochage : ${PINOUT}`);
    expect(lines[6]).toBe(`Conditions : ${CONDITIONS}`);
    expect(connectorSummaryLines(freeReference)[0]).toBe(`${FREE_TEXT} — à vérifier par la R&D`);
  });

  it("dans les 7 autres langues, la saisie n'est jamais traduite", () => {
    for (const { id } of LANGUAGES.filter((l) => l.id !== "fr")) {
      const tr = (text: string) => t(text, id);
      const lines = connectorSummaryLines(termination, tr);
      const pinoutLine = lines.find((l) => l.includes(PINOUT));
      const conditionsLine = lines.find((l) => l.endsWith(CONDITIONS));

      // La valeur saisie est recopiée telle quelle…
      expect(pinoutLine).toBeDefined();
      expect(pinoutLine!.endsWith(PINOUT)).toBe(true);
      expect(conditionsLine).toBeDefined();

      // …alors que l'étiquette, elle, a bien changé de langue.
      expect(pinoutLine!.startsWith("Brochage")).toBe(false);
      expect(pinoutLine!).toContain(tr("Brochage"));

      const free = connectorSummaryLines(freeReference, tr)[0]!;
      expect(free.startsWith(FREE_TEXT)).toBe(true);
      expect(free).toContain(tr("à vérifier par la R&D"));
    }
  });
});

describe("en-tête d'accueil avec projet ouvert", () => {
  const home = readFileSync("src/routes/index.tsx", "utf8");

  it("la rangée entière peut passer à la ligne (320 px, ru/de)", () => {
    expect(home).toContain("flex max-w-7xl flex-wrap items-center");
    expect(home).not.toContain("ml-auto flex shrink-0 flex-wrap");
  });

  it("aucune surcharge de taille de texte sur les boutons de l'en-tête", () => {
    expect(home).not.toContain('className="min-h-11 text-base"');
  });
});
