import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

/**
 * Lot 2 — l'atelier recadré.
 *
 * Ces tests portent sur la COQUILLE : disposition, bandeau de verdict,
 * chronologie, réglages repliés. Ils vérifient aussi ce qui ne doit PAS avoir
 * bougé : aucun moteur de montage ou de magnétisme n'est réécrit, et aucun
 * contrôle existant n'a disparu de l'écran — il a seulement été replié.
 */
const WORKSHOP = readFileSync("src/components/standex/workshop/workshop.tsx", "utf8");
const CSS = readFileSync("src/components/standex/workshop/workshop.css", "utf8");
const PANEL = readFileSync("src/components/leadmagnet/workspace-panel.tsx", "utf8");
const SPACE = readFileSync("src/components/leadmagnet/design-space.tsx", "utf8");
const SCENE = readFileSync("src/components/standex/workshop/scene.tsx", "utf8");

describe("ouverture d'un couple depuis les cartes", () => {
  test("le cadrage par défaut contient le couple entier, capteur ET aimant", () => {
    expect(WORKSHOP).toContain('setFocus("assembly")');
    expect(WORKSHOP).not.toContain('setFocus("sensor")');
  });
  test("la source des distances n'est répétée sur la scène que si elle est fictive", () => {
    expect(WORKSHOP).toContain('{basis === "fictitious" ? (');
  });
  test("l'aimant est posé à la pose suggérée par le gabarit publié", () => {
    expect(WORKSHOP).toContain("suggestPose(guided)");
    expect(WORKSHOP).toContain("applySuggestion(guided, proposal.suggestion)");
    expect(WORKSHOP).toContain("workshopPatchFromMounting(applied.mounting");
  });
  test("un montage déjà enregistré ou déjà couvert n'est jamais réécrit", () => {
    expect(WORKSHOP).toContain("if (saved !== null) return;");
    expect(WORKSHOP).toContain('if (guided.computed?.coverage === "covered") return;');
  });
  test("la démonstration à distances fictives n'est pas un point de départ", () => {
    expect(WORKSHOP).toContain("if (!isFictitiousSensor(config.sensorId) && config.mode");
  });
});

describe("barre et disposition", () => {
  test("le corps de l'atelier occupe le panneau sans marge ni défilement propre", () => {
    expect(PANEL).toContain("bare?: boolean");
    expect(PANEL).toContain('"min-w-0 flex-1 overflow-hidden"');
    expect(SPACE).toContain("bare\n        backLabel={t(\"Retour aux couples\")}");
  });
  test("la barre porte le couple testé et l'état d'enregistrement", () => {
    expect(PANEL).toContain("badge?: ReactNode");
    expect(SPACE).toContain('data-testid="workshop-save-state"');
    expect(SPACE).toContain("${workshop.sensorId} + ${workshop.magnetModel}");
  });
  test("la grille est 320px + reste, et la colonne ne défile pas seule", () => {
    expect(CSS).toContain("grid-template-columns: 320px minmax(0, 1fr)");
    expect(CSS).toMatch(/\.mw-stage \.mw-controls \{[^}]*overflow: visible/s);
  });
  test("sous 1024 px, tout s'empile et la scène reste en tête", () => {
    expect(CSS).toMatch(
      /@media \(max-width: 1023px\) \{\s*\.mw-stage \.mw-stage-grid \{\s*grid-template-columns: minmax\(0, 1fr\)/,
    );
    expect(CSS).toMatch(/\.mw-stage \.mw-main \{\s*order: 1;/);
    expect(CSS).toMatch(/\.mw-stage \.mw-controls \{\s*order: 2;/);
  });
  test("la scène garde au moins 420 px de hauteur", () => {
    expect(CSS).toMatch(/\.mw-stage \.mw-canvas \{[^}]*min-height: 420px/s);
  });
});

describe("bandeau de verdict", () => {
  test("les quatre situations sont distinctes et nommées", () => {
    for (const kind of ["expected", "none", "undocumented", "unpublished"])
      expect(WORKSHOP).toContain(`"${kind}"`);
    expect(WORKSHOP).toContain("Détection prévue — ferme à {0} mm, ouvre à {1} mm");
    expect(WORKSHOP).toContain("Pas de détection sur ce cycle");
    expect(WORKSHOP).toContain("Position non documentée — Standex peut la mesurer pour vous");
    expect(WORKSHOP).toContain("Distances non publiées pour ce couple");
  });
  test("les seuils affichés sont ceux du couple lu par le moteur", () => {
    expect(WORKSHOP).toContain("msg(\"Détection prévue — ferme à {0} mm, ouvre à {1} mm\", [pull, drop])");
  });
  test("hors couverture, le message du moteur est repris mot pour mot", () => {
    expect(WORKSHOP).toContain("{t(computed.mainMessage)}");
    expect(WORKSHOP).toContain('data-testid="verdict-main-message"');
  });
  test("le bouton d'essai n'apparaît que hors gabarit ou sans table publiée", () => {
    expect(WORKSHOP).toContain(
      'const askTrial = verdictKind === "undocumented" || verdictKind === "unpublished";',
    );
    expect(WORKSHOP).toContain('data-testid="ask-trial"');
  });
  test("le bandeau est au-dessus de la scène et fait au moins 64 px", () => {
    expect(WORKSHOP.indexOf("{verdictBanner}")).toBeLessThan(
      WORKSHOP.indexOf('className="mw-canvas"'),
    );
    expect(CSS).toMatch(/\.mw-verdict-bar \{[^}]*min-block-size: 64px/s);
  });
  test("« ce que ce résultat ne dit pas » reste accessible, replié", () => {
    expect(WORKSHOP).toContain("Valeurs typiques Standex · Ce que ce résultat ne dit pas ⌄");
    expect(WORKSHOP).toContain("LIMIT_LABEL[l] ?? l");
  });
});

describe("colonne de gauche : trois réglages, rien de plus", () => {
  test("position, course et lecture sont les seuls contrôles ouverts", () => {
    const column = WORKSHOP.slice(
      WORKSHOP.indexOf('<aside className="mw-controls">'),
      WORKSHOP.indexOf('<section className="mw-main"'),
    );
    expect(column).toContain("{approachPicker}");
    expect(column).toContain("{travelControls}");
    expect(column).toContain("{playButton}");
    expect(column).toContain("{advancedSettings}");
    // Aucun réglage avancé n'est ouvert directement dans la colonne.
    expect(column).not.toContain("Orientation sur la machine");
    expect(column).not.toContain("Classe de sensibilité");
  });
  test("les approches non publiées sont désactivées et expliquées", () => {
    expect(WORKSHOP).toContain("disabled={!available}");
    expect(WORKSHOP).toContain('t("Non documentée pour ce couple")');
  });
  test("la course parle en positions, pas en distances abstraites", () => {
    expect(WORKSHOP).toContain('label={t("Position ouverte")}');
    expect(WORKSHOP).toContain('label={t("Position fermée")}');
  });
  test("la navigation en quatre étapes a disparu", () => {
    expect(WORKSHOP).not.toContain("setStep");
    expect(WORKSHOP).not.toContain("Étape {0} sur {1}");
  });
  test("aucun contrôle avancé n'a été supprimé : tout est replié", () => {
    for (const label of [
      "Classe de sensibilité",
      "Distances publiées (B–E, D1–D5)",
      "Orientation sur la machine",
      "Position et environnement",
      "Orientation de l'aimant",
      "Trajectoire",
      "Comportement recherché",
      "Longueur de câble retenue",
      "Reprendre un montage",
      "Échelle du champ fictif",
      "Inverser les pôles N / S",
    ])
      expect(WORKSHOP).toContain(label);
    expect(WORKSHOP).toContain("<GuidedSuggestion");
    expect(WORKSHOP).toContain("<SensitivityComparison");
    expect(WORKSHOP).toContain("<MachineControls");
  });
});

describe("chronologie et lecture", () => {
  test("un aller-retour dure 4 secondes en lecture normale", () => {
    expect(WORKSHOP).toContain("const CYCLE_STEPS_NORMAL = 80;");
    expect(WORKSHOP).toContain("const CYCLE_SECONDS_NORMAL = (CYCLE_STEPS_NORMAL * 50) / 1000;");
  });
  test("la lecture lente reste disponible dans les réglages avancés", () => {
    expect(WORKSHOP).toContain('t("Vitesse de lecture")');
    expect(WORKSHOP).toContain("const CYCLE_STEPS_SLOW = 240;");
  });
  test("la chronologie utilise les mêmes échantillons que la scène", () => {
    const cycle = WORKSHOP.slice(WORKSHOP.indexOf('className="mw-cycle"'));
    expect(cycle).toContain("result.samples");
  });
  test("la chronologie fait au moins 84 px", () => {
    expect(CSS).toMatch(/\.mw-stage \.mw-cycle \{[^}]*min-block-size: 84px/s);
  });
});

describe("enregistrement et sortie", () => {
  test("le montage est enregistré automatiquement après 800 ms", () => {
    expect(WORKSHOP).toContain("setTimeout(() => void save(), 800)");
  });
  test("l'enregistrement emprunte le chemin existant, sans autre écriture", () => {
    expect(WORKSHOP).toContain("onSaveState?.(saving ?");
  });
  test("« Voir le résultat » ouvre l'écran Résultat avec l'essai enregistré", () => {
    expect(WORKSHOP).toContain('t("Voir le résultat →")');
    // Le verdict remonte de l'atelier : l'écran Résultat ne le recalcule pas.
    expect(WORKSHOP).toContain("onResult(testedPair())");
    expect(SPACE).toContain("onResult={(result) => {");
    expect(SPACE).toContain("recordResult(result)");
    expect(SPACE).toContain('setTab("resultat")');
  });
  test("« Demander un essai » coche une demande, jamais une mesure", () => {
    expect(SPACE).toContain("TRIAL_REQUEST");
    expect(SPACE).toContain('data-testid="trial-request"');
    expect(SPACE).toContain("ce n'est ni une mesure, ni une validation technique.");
  });
});

describe("scène : plus d'étiquettes superposées", () => {
  test("les cotes « ferme / ouvre » ne sont plus dessinées dans la 3D", () => {
    expect(SCENE).not.toContain('t(i === 0 ? "Ferme" : "Ouvre")');
    // Les repères de distance eux-mêmes restent affichés.
    expect(SCENE).toContain("function ReferenceMarkers");
  });
  test("les calques et la légende vivent dans le menu Affichage", () => {
    expect(WORKSHOP).toContain('data-testid="display-menu"');
    expect(WORKSHOP).toContain('t("Affichage ⌄")');
    expect(WORKSHOP).toContain('t("Recadrer")');
  });
});

describe("aucun moteur n'a été touché", () => {
  test("le calcul reste importé, jamais recopié dans la coquille", () => {
    for (const forbidden of ["function evaluateCoverage", "function simulateMounting("])
      expect(WORKSHOP).not.toContain(forbidden);
    expect(WORKSHOP).toContain('from "@/lib/standex/mounting"');
  });
});
