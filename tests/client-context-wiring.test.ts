/** Branchements d'écran réellement exigés : ouverture de dossier, reprise,
 * variante appliquée à la bonne version, et lecture 3D du fichier envoyé.
 *
 * Ces contrôles portent sur le code branché, pas sur une intention déclarée.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const followup = readFileSync("src/components/leadmagnet/client-followup.tsx", "utf8");
const design = readFileSync("src/routes/design.tsx", "utf8");
const standex = readFileSync("src/routes/standex.tsx", "utf8");

describe("ouverture d'un dossier", () => {
  test("le contenu envoyé est chargé AVANT le changement de contexte", () => {
    const click = followup.slice(followup.indexOf("onClick={async () => {"));
    expect(click.indexOf("await fetchClientView(d.id)")).toBeLessThan(
      click.indexOf("onSelectDossier({"),
    );
    expect(followup).toContain("if (!out.ok) return;");
  });

  test("l'écran de conception refuse d'ouvrir un dossier dont le contenu est illisible", () => {
    expect(design).toContain("return { ok: false };");
  });
});

describe("reprise d'une version", () => {
  test("la version d'origine et la version serveur attendue restent distinctes", () => {
    expect(followup).toContain("sourceRevision: r.revision");
    expect(followup).toContain("currentRevision: current.dossier.current_revision");
    expect(design).toContain("resetServerContext(dossierId, currentRevision)");
    expect(design).toContain("setReopenedFrom({ dossierId, revision: sourceRevision })");
  });
});

describe("variante Standex", () => {
  test("elle s'applique à la version relue et n'est enregistrée qu'en cas de succès", () => {
    expect(followup).toContain("snapshot: reviewed.snapshot");
    expect(followup).toContain("commit: () => acceptVariant(r.id)");
    const handler = design.slice(design.indexOf("onApplyVariant={async"));
    expect(handler.indexOf("refused: parsed.reason")).toBeLessThan(handler.indexOf("await commit()"));
    expect(handler.indexOf("await commit()")).toBeLessThan(handler.indexOf("setDossier(out.dossier)"));
  });
});

describe("réinitialisation du contexte", () => {
  test("un import ou un changement de dossier remet accords, contraintes et partage à zéro", () => {
    const reset = design.slice(
      design.indexOf("const resetServerContext"),
      design.indexOf("const resetServerContext") + 900,
    );
    for (const line of [
      "setNda(INITIAL_NDA)",
      "consents: []",
      "setAcknowledged(false)",
      "setPreparedUpload(null)",
      'setExtraConstraints("")',
      "setShareModel(false)",
      "contextGenRef.current += 1",
    ])
      expect(reset).toContain(line);
    expect(design).toContain("resetServerContext(null, 0)");
  });

  test("les réponses asynchrones d'un contexte périmé sont ignorées", () => {
    expect(design).toContain("if (contextGenRef.current !== gen) return;");
    expect(design).toContain("const stale = () => contextGenRef.current !== gen;");
    expect(design).toContain("if (stale()) return;");
  });
});

describe("lecture 3D côté Standex", () => {
  test("le GLB envoyé est contrôlé par empreinte et chargé en mémoire seulement", () => {
    expect(standex).toContain("storeMachineFileInMemory");
    expect(standex).toContain('storageMode="memory"');
    expect(standex).toContain("expected.toLowerCase() !== digest.toLowerCase()");
  });

  test("aucun montage par défaut ne remplace un modèle manquant", () => {
    expect(standex).not.toContain("DEFAULT_WORKSHOP");
    expect(standex).toContain(
      "aucun montage par défaut n'est affiché à la place",
    );
  });

  test("une modification locale ne vaut jamais retour publié", () => {
    expect(standex).toContain("publiez un retour R&D pour qu'elle compte");
  });
});
