/** Configuration câble/connecteur déplacée vers l'étape « Résultat » : seules
 * les destinations de navigation changent, jamais les états métier. */
import { describe, expect, test } from "bun:test";
import { createDossier } from "../src/lib/leadmagnet/dossier";
import {
  CHOSEN_BARE_LEADS,
  DELEGATED_CABLE,
  DELEGATED_CONNECTOR,
  projectChecklist,
} from "../src/lib/leadmagnet/project-checklist";
import { customLengthMm, standardLengthsMm } from "../src/lib/leadmagnet/cable-options";
import { buildDossierExport } from "../src/lib/leadmagnet/dossier-io";

const item = (d: ReturnType<typeof createDossier>, id: string) =>
  projectChecklist(d).find((i) => i.id === id)!;

describe("checklist : câble et connecteur pointent vers l'étape Résultat", () => {
  test("destinations resultat / section-cablage", () => {
    const d = { ...createDossier(), selectedSensorId: "MK03" };
    for (const id of ["cable", "connecteur"]) {
      expect(item(d, id).tab).toBe("resultat");
      expect(item(d, id).section).toBe("section-cablage");
    }
    expect(item(d, "contexte").tab).toBe("revue");
  });

  test("états métier inchangés : défaut todo, délégation, fils nus explicites", () => {
    const base = { ...createDossier(), selectedSensorId: "MK03" };
    expect(item(base, "cable").state).toBe("todo");
    expect(item(base, "connecteur").state).toBe("todo");
    const delegated = { ...base, delegatedDecisions: [DELEGATED_CABLE, DELEGATED_CONNECTOR] };
    expect(item(delegated, "cable").state).toBe("delegated");
    expect(item(delegated, "connecteur").state).toBe("delegated");
    const bare = { ...base, delegatedDecisions: [CHOSEN_BARE_LEADS] };
    expect(item(bare, "connecteur").state).toBe("chosen");
  });

  test("capteur PCB : pas d'étape câble/connecteur", () => {
    const d = { ...createDossier(), selectedSensorId: "MK01" };
    expect(projectChecklist(d).map((i) => i.id)).not.toContain("cable");
  });
});

describe("longueurs par produit et sur mesure", () => {
  test("standardLengthsMm reste l'autorité par modèle", () => {
    expect(standardLengthsMm("MK03")).toEqual([200, 300, 500, 1000, 1500, 2000, 3000, 5000]);
    expect(standardLengthsMm("MK38")).toEqual([300]);
    expect(standardLengthsMm(null)).toEqual([]);
  });
  test("customLengthMm convertit les cm", () => {
    expect(customLengthMm("42,5")).toBe(425);
    expect(customLengthMm("0")).toBeNull();
  });
});

describe("export inchangé", () => {
  test("le câble et la terminaison sont toujours exportés tels quels", () => {
    const d = {
      ...createDossier(),
      selectedSensorId: "MK03",
      delegatedDecisions: [CHOSEN_BARE_LEADS],
    };
    const out = JSON.parse(JSON.stringify(buildDossierExport(d)));
    const dossier = out.dossier ?? out;
    expect(dossier.termination).toEqual(d.termination);
    expect(dossier.cabling).toEqual(JSON.parse(JSON.stringify(d.cabling)));
    expect(dossier.delegatedDecisions).toEqual([CHOSEN_BARE_LEADS]);
  });
});
