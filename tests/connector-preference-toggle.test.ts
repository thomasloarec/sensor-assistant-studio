import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const SRC = readFileSync("src/components/leadmagnet/design-space.tsx", "utf8");

describe("préférence de connecteur : ouverture réelle, sans cercle fermé", () => {
  test("un état d'ouverture distinct de la référence technique existe", () => {
    expect(SRC).toContain("const [connectorWanted, setConnectorWanted] = useState(false)");
  });

  test("cocher ouvre la sélection au lieu de dépendre d'un connecteur déjà choisi", () => {
    expect(SRC).toContain("setConnectorWanted(true)");
    expect(SRC).toMatch(/connectorPreference =\s*\n?\s*connectorWanted \|\|/);
  });

  test("cocher ne sélectionne aucun connecteur automatiquement", () => {
    const handler = SRC.slice(SRC.indexOf("setConnectorWanted(true)"));
    const untilReturn = handler.slice(0, handler.indexOf("return;"));
    expect(untilReturn).not.toContain("terminationFromHousing");
    expect(untilReturn).not.toContain("housingById");
  });

  test("replier confie la décision à Standex sans effacer la référence", () => {
    const off = SRC.slice(SRC.indexOf("setConnectorWanted(false)"));
    const block = off.slice(0, off.indexOf("}}"));
    expect(block).toContain("DELEGATED_CONNECTOR");
    expect(block).not.toContain("termination:");
  });

  test("une référence enregistrée non déléguée réouvre la section à la reprise", () => {
    expect(SRC).toContain(
      '(termination.kind === "unqualified_connector" && !isDelegated(dossier, DELEGATED_CONNECTOR))',
    );
  });
});
