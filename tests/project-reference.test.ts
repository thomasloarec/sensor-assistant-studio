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

  test("le nom de fichier porte le nom du projet, l'identifiant complet et la révision", () => {
    const d = createDossier();
    const name = projectPdfFilename("Réservoir d'eau — machine à café", d.id, 3);
    // Aucun identifiant serveur : le fichier se dit brouillon.
    expect(name.endsWith(`-${d.id.replace(/[^A-Za-z0-9]+/g, "-")}-brouillon-r3.pdf`)).toBe(true);
    expect(name.startsWith("reservoir-d-eau-machine-a-cafe")).toBe(true);
    expect(titleSlug("")).toBe("projet");
    const server = "11111111-2222-3333-4444-555555555555";
    const saved = projectPdfFilename("Projet", d.id, 3, server);
    // Identifiant serveur COMPLET dans le nom : aucune troncature silencieuse.
    expect(saved).toBe(`projet-11111111-2222-3333-4444-555555555555-r3.pdf`);
    expect(saved).not.toContain("brouillon");
  });

  test("l'identifiant serveur est l'identité définitive ; l'abrégé n'est qu'un affichage", () => {
    const d = createDossier();
    const server = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    expect(projectIdentity(null, d.id)).toEqual({
      reference: projectReference(d.id),
      fullId: d.id,
      idKind: "local",
      localId: d.id,
      provisional: true,
    });
    expect(projectIdentity(server, d.id)).toEqual({
      reference: projectReference(server),
      fullId: server,
      idKind: "server",
      localId: d.id,
      provisional: false,
    });
    expect(projectIdentity(null, null)).toEqual({
      reference: null,
      fullId: null,
      idKind: "none",
      localId: null,
      provisional: true,
    });
    // L'identifiant local du brouillon reste lisible après enregistrement :
    // il permet de retrouver le PDF d'avant envoi.
    expect(projectReference(d.id)).not.toBe(projectReference(server));
  });

  test("l'abrégé n'est jamais présenté comme unique : deux identifiants peuvent le partager", () => {
    // Même fin d'identifiant, projets différents : l'abrégé coïncide, donc il ne
    // sert pas de clé. L'identité reste l'identifiant complet.
    const a = "11111111-2222-3333-4444-aaaaaabbbbbb";
    const b = "99999999-8888-7777-6666-aaaaaabbbbbb";
    expect(projectReference(a)).toBe(projectReference(b));
    expect(projectIdentity(a, null).fullId).not.toBe(projectIdentity(b, null).fullId);
    expect(projectPdfFilename("Projet", null, 1, a)).not.toBe(
      projectPdfFilename("Projet", null, 1, b),
    );
  });
});
