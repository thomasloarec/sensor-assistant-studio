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
    expect(PANEL).toContain('"workspace-panel-bare min-h-0 min-w-0 flex-1 overflow-hidden"');
    expect(SPACE).toMatch(/bare\s+backLabel/);
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
    expect(WORKSHOP).toContain(
      'msg("Détection prévue — ferme à {0} mm, ouvre à {1} mm", [pull, drop])',
    );
  });
  test("hors couverture, le message du moteur est repris mot pour mot", () => {
    expect(WORKSHOP).toContain("{t(computed.mainMessage)}");
    expect(WORKSHOP).toContain('data-testid="verdict-main-message"');
  });
  test("le bandeau ne contient plus de CTA d'essai concurrent", () => {
    expect(WORKSHOP).not.toContain('data-testid="ask-trial"');
  });
  test("le bandeau est au-dessus de la scène et fait au moins 64 px", () => {
    expect(WORKSHOP.indexOf("{verdictBanner}")).toBeLessThan(
      WORKSHOP.indexOf('className="mw-canvas"'),
    );
    expect(CSS).toMatch(/\.mw-verdict-bar \{[^}]*min-block-size: 64px/s);
  });
  test("le bloc de limites retiré ne surcharge plus le bandeau", () => {
    expect(WORKSHOP).not.toContain("Valeurs typiques Standex · Ce que ce résultat ne dit pas ⌄");
  });
});

describe("colonne de gauche : réglages essentiels", () => {
  test("position, activation et lecture sont ouvertes ; la course reste avancée", () => {
    const column = WORKSHOP.slice(
      WORKSHOP.indexOf('<aside className="mw-controls">'),
      WORKSHOP.indexOf('<section className="mw-main"'),
    );
    expect(column).toContain("{approachPicker}");
    expect(column).toContain("{activationDistanceControl}");
    expect(column).toContain("{playButton}");
    expect(column).toContain("{advancedSettings}");
    // Aucun réglage avancé n'est ouvert directement dans la colonne.
    expect(column).not.toContain("Orientation sur la machine");
    expect(column).not.toContain("{travelControls}");
  });
  test("deux positions principales sont proposées sans réécrire une pose F1", () => {
    expect(WORKSHOP).toContain('const WORKSHOP_D1_LABEL = "Face à face"');
    expect(WORKSHOP).toContain('label: WORKSHOP_D1_LABEL');
    expect(WORKSHOP).toContain('label: t("Dans l’alignement")');
    expect(WORKSHOP).toContain('msg("Face à face{0}", [""])');
    expect(WORKSHOP).not.toContain('label: "Parallèle"');
    expect(WORKSHOP).not.toContain('label: "Perpendiculaire"');
    expect(WORKSHOP).toContain('config.geometry === "F1"');
    expect(WORKSHOP).toContain('data-testid="legacy-approach-notice"');
  });
  test("les curseurs décrivent les écarts physiques sans les confondre avec le contact", () => {
    expect(WORKSHOP).toContain('label={t("Écart au départ")}');
    expect(WORKSHOP).toContain('label={t("Écart au plus près")}');
    expect(WORKSHOP).not.toContain('label={t("Position ouverte")}');
    expect(WORKSHOP).not.toContain('label={t("Position fermée")}');
  });
  test("la distance d'activation utilise les seuils nominaux de l'approche", () => {
    expect(WORKSHOP).toContain("nominalSensitivityRowsFor(");
    expect(WORKSHOP).toContain('t("Distance d’activation")');
    expect(WORKSHOP).toContain("selectedActivationIndex >= 0");
    expect(WORKSHOP).toContain("applySuggestedActivation");
    expect(WORKSHOP).not.toContain("Math.max(0, selectedActivationIndex)");
    expect(WORKSHOP).toContain('msg("Choisir environ {0} mm (classe {1})"');
    expect(WORKSHOP).toContain('msg("Environ {0} mm (classe {1})"');
    expect(WORKSHOP).toContain('classKind === "switch_model"');
  });
  test("la navigation en quatre étapes a disparu", () => {
    expect(WORKSHOP).not.toContain("setStep");
    expect(WORKSHOP).not.toContain("Étape {0} sur {1}");
  });
  test("aucun contrôle avancé n'a été supprimé : tout est replié", () => {
    for (const label of [
      "Configuration du contact",
      "Orientation sur la machine",
      "Position et environnement",
      "Orientation de l'aimant",
      "Trajectoire",
      "Comportement recherché",
      "Longueur de câble retenue",
      "Reprendre un montage",
      "Échelle du champ fictif",
    ])
      expect(WORKSHOP).toContain(label);
    expect(WORKSHOP).toContain("<GuidedSuggestion");
    expect(WORKSHOP).toContain("<MachineControls");
    expect(WORKSHOP).not.toContain("<SensitivityComparison");
    expect(WORKSHOP).not.toContain('data-testid="published-rows"');
  });
  test("les réglages avancés sont répartis dans exactement trois catégories", () => {
    expect(WORKSHOP.match(/className="mw-advanced-category"/g)).toHaveLength(3);
    for (const label of [
      "Choix du produit",
      "Choix de l’aimant",
      "Positionnement du capteur et de l’aimant",
    ]) expect(WORKSHOP).toContain(`t("${label}")`);
    expect(WORKSHOP).toContain("useState(initialCableOpen)");
  });
  test("le choix de l'aimant ne répète pas sa carte et le câble sépare produit et trajet", () => {
    const magnetSection = WORKSHOP.slice(
      WORKSHOP.indexOf('data-testid="advanced-magnet"'),
      WORKSHOP.indexOf('data-testid="advanced-positioning"'),
    );
    expect(magnetSection).not.toContain('className="mw-product"');
    expect(magnetSection).toContain('msg("Correspondance documentaire : {0}"');
    expect(WORKSHOP).toContain('t("Trajet du câble")');
    expect(WORKSHOP).toContain("Le pointage du trajet du câble nécessite l’import de votre modèle 3D.");
  });
});

describe("chronologie et lecture", () => {
  test("un aller-retour dure 6 secondes en lecture normale", () => {
    expect(WORKSHOP).toContain("const CYCLE_STEPS_NORMAL = 120;");
  });
  test("la lecture lente reste disponible dans les réglages avancés", () => {
    expect(WORKSHOP).toContain('t("Vitesse de lecture")');
    expect(WORKSHOP).toContain("const CYCLE_STEPS_SLOW = 240;");
  });
  test("la chronologie utilise les mêmes échantillons que la scène", () => {
    const cycle = WORKSHOP.slice(WORKSHOP.indexOf('className="mw-cycle"'));
    expect(cycle).toContain("result.samples");
    expect(cycle).toContain("timelineContacts.map");
    expect(cycle).not.toContain("Position ouverte");
    expect(cycle).not.toContain("Position fermée");
    expect(cycle).not.toContain("Un aller-retour");
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
    expect(WORKSHOP).toContain('t("Valider ce choix et voir le résultat")');
    // Le verdict remonte de l'atelier : l'écran Résultat ne le recalcule pas.
    expect(WORKSHOP).toContain("onResult(testedPair())");
    expect(SPACE).toContain("onResult={(result) => {");
    expect(SPACE).toContain("recordResult(result)");
    expect(SPACE).toContain('setTab("resultat")');
  });
  test("le bloc de demande d'essai est retiré du formulaire final", () => {
    expect(SPACE).not.toContain('data-testid="trial-request"');
    expect(SPACE).toContain(
      "if (workshopDraftRef.current) applyWorkshopConfig(workshopDraftRef.current)",
    );
  });
});

describe("scène : plus d'étiquettes superposées", () => {
  test("le badge flottant d'état est absent de toutes les vues", () => {
    expect(WORKSHOP).not.toContain("mw-live-state");
  });
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
