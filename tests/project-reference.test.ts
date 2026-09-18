import { describe, expect, test } from "bun:test";
import { createDossier } from "../src/lib/leadmagnet/dossier";
import { buildDossierExport, parseDossierExport } from "../src/lib/leadmagnet/dossier-io";
import {
  projectReference,
  projectIdentity,
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

  test("le brouillon téléchargé garde son identifiant ; une reprise détachée en reçoit un autre", () => {
    const d = createDossier();
    // Même projet en mémoire : le PDF d'avant envoi et l'envoi portent le même
    // identifiant COMPLET, jamais un abrégé qui pourrait coïncider.
    expect(projectPdfFilename(d.title, d.id, 1)).toContain(d.id.replace(/[^A-Za-z0-9]+/g, "-"));
    expect(projectPdfFilename(d.title, d.id, 2)).toContain(d.id.replace(/[^A-Za-z0-9]+/g, "-"));
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
    // Aucun identifiant serveur : le fichier se dit brouillon.
    expect(name.endsWith(`-${projectReference(d.id)}-brouillon-r3.pdf`)).toBe(true);
    expect(name.startsWith("reservoir-d-eau-machine-a-cafe")).toBe(true);
    expect(titleSlug("")).toBe("projet");
    const server = "11111111-2222-3333-4444-555555555555";
    const saved = projectPdfFilename("Projet", d.id, 3, server);
    expect(saved).toBe(`projet-${projectReference(server)}-r3.pdf`);
    expect(saved).not.toContain("brouillon");
  });

  test("l'identifiant serveur fait la référence définitive dès qu'il existe", () => {
    const d = createDossier();
    const server = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    expect(projectIdentity(null, d.id)).toEqual({
      reference: projectReference(d.id),
      provisional: true,
    });
    expect(projectIdentity(server, d.id)).toEqual({
      reference: projectReference(server),
      provisional: false,
    });
    // La référence provisoire n'est pas réécrite par l'identifiant serveur :
    // elle reste lisible dans le contenu envoyé pour retrouver le brouillon.
    expect(projectReference(d.id)).not.toBe(projectReference(server));
  });
});
