import { describe, expect, test } from "bun:test";
import { createDossier } from "../src/lib/leadmagnet/dossier";
import { buildDossierExport, parseDossierExport } from "../src/lib/leadmagnet/dossier-io";
import {
  projectReference,
  projectPdfFilename,
  titleSlug,
} from "../src/lib/leadmagnet/project-reference";

describe("référence de projet", () => {
  test("même dossier, même référence à chaque appel et à chaque révision", () => {
    const d = createDossier();
    const first = projectReference(d.id);
    expect(first).toMatch(/^SST-/);
    expect(projectReference(d.id)).toBe(first);
    expect(projectReference({ ...d, revision: 7 }.id)).toBe(first);
  });

  test("deux projets distincts n'ont pas la même référence", () => {
    expect(projectReference(createDossier().id)).not.toBe(projectReference(createDossier().id));
  });

  test("le brouillon téléchargé garde sa référence ; une reprise détachée en reçoit une autre", () => {
    const d = createDossier();
    // Même projet en mémoire : le PDF d'avant envoi et l'envoi portent la même référence.
    expect(projectPdfFilename(d.title, d.id, 1)).toContain(projectReference(d.id)!);
    expect(projectPdfFilename(d.title, d.id, 2)).toContain(projectReference(d.id)!);
    // Une reprise importée est volontairement un NOUVEAU projet : autre référence.
    const round = parseDossierExport(buildDossierExport(d));
    expect(projectReference(round.dossier.id)).not.toBe(projectReference(d.id));
  });

  test("aucune référence inventée sans identifiant", () => {
    expect(projectReference("")).toBeNull();
    expect(projectReference(null)).toBeNull();
    expect(projectReference("dossier___")).toBeNull();
  });

  test("le nom de fichier porte le nom du projet, la référence et la révision", () => {
    const d = createDossier();
    const name = projectPdfFilename("Réservoir d'eau — machine à café", d.id, 3);
    expect(name.endsWith(`-${projectReference(d.id)}-r3.pdf`)).toBe(true);
    expect(name.startsWith("reservoir-d-eau-machine-a-cafe")).toBe(true);
    expect(titleSlug("")).toBe("projet");
  });
});
