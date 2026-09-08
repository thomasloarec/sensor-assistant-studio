/** Branchements d'écran réellement exigés : ouverture de dossier, reprise,
 * variante appliquée à la bonne version, et lecture 3D du fichier envoyé.
 *
 * Ces contrôles portent sur le code branché, pas sur une intention déclarée.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  EMPTY_CABLING,
  applyRoutingPick,
  estimateCableLength,
  resetRouting,
  routingPoints,
  undoRoutingPick,
} from "@/lib/leadmagnet/cabling";

const followup = readFileSync("src/components/leadmagnet/client-followup.tsx", "utf8");
const design = readFileSync("src/components/leadmagnet/design-space.tsx", "utf8");
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
    expect(handler.indexOf("refused: parsed.reason")).toBeLessThan(
      handler.indexOf("await commit()"),
    );
    expect(handler.indexOf("await commit()")).toBeLessThan(
      handler.indexOf("setDossier(out.dossier)"),
    );
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
    expect(standex).toContain("aucun montage par défaut n'est affiché à la place");
  });

  test("une modification locale ne vaut jamais retour publié", () => {
    expect(standex).toContain("publiez un retour R&D pour qu'elle compte");
  });
});

describe("copie de lecture du câble en revue R&D", () => {
  const base = {
    ...EMPTY_CABLING,
    declaredMotionStates: [{ id: "ouvert", label: "Bac ouvert" }],
  };

  test("un ajustement de revue ne modifie jamais la configuration envoyée", () => {
    const sent = structuredClone(base);
    const reading = structuredClone(sent);
    const picked = applyRoutingPick(reading, { kind: "base" }, "sensor", [0, 0, 0], {
      cycleT: 0,
      label: "Ajustement local de revue",
    });
    expect(routingPoints(picked, { kind: "base" })).toEqual([[0, 0, 0]]);
    expect(routingPoints(sent, { kind: "base" })).toEqual([]);
    expect(sent).toEqual(structuredClone(base));
  });

  test("le trajet suit l'état sélectionné et se remet à zéro état par état", () => {
    let cfg = applyRoutingPick(base, { kind: "base" }, "sensor", [0, 0, 0], null);
    cfg = applyRoutingPick(cfg, { kind: "state", stateId: "ouvert" }, "sensor", [10, 0, 0], {
      cycleT: 0.5,
      label: "Ajustement local de revue",
    });
    cfg = applyRoutingPick(cfg, { kind: "state", stateId: "ouvert" }, "connection", [10, 0, 40], {
      cycleT: 0.5,
      label: "Ajustement local de revue",
    });
    expect(routingPoints(cfg, { kind: "state", stateId: "ouvert" })).toHaveLength(2);
    const undone = undoRoutingPick(cfg, { kind: "state", stateId: "ouvert" });
    expect(routingPoints(undone, { kind: "state", stateId: "ouvert" })).toHaveLength(1);
    const cleared = resetRouting(cfg, { kind: "state", stateId: "ouvert" });
    expect(routingPoints(cleared, { kind: "state", stateId: "ouvert" })).toEqual([]);
    // Le trajet de référence n'est pas touché par la remise à zéro d'un état.
    expect(routingPoints(cleared, { kind: "base" })).toEqual([[0, 0, 0]]);
  });

  test("un trajet incomplet ne produit aucune longueur inventée", () => {
    const partial = applyRoutingPick(base, { kind: "base" }, "sensor", [0, 0, 0], null);
    expect(estimateCableLength(partial).requiredMm).toBeNull();
  });
});

describe("garde de contexte pendant une opération", () => {
  test("ouvrir, reprendre ou appliquer une variante est refusé pendant un commit", () => {
    for (const guard of [
      "if (busyRef.current) return { ok: false };",
      "if (busyRef.current)",
      "if (!file || busyRef.current) return;",
    ])
      expect(design).toContain(guard);
  });

  test("la liste de suivi oublie une réponse arrivée après changement de dossier", () => {
    expect(followup).toContain("const request = ++viewRequest.current;");
    expect(followup).toContain("if (request !== viewRequest.current) return;");
    expect(followup).toContain("}, [serverDossierId, contextGeneration]);");
  });

  test("la console R&D écarte les réponses périmées et lie le GLB à la configuration", () => {
    expect(standex).toContain(
      "request !== modelRequest.current || selection !== selectionRequest.current",
    );
    expect(standex).toContain("config.machine.assetKey !== `sha256:${digest}`");
    expect(standex).toContain("cableRouting: viewerCable");
  });
});
