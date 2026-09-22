/** Compatibilité pédagogique du besoin : cas réels 9 et 10, cas révisés,
 *  négations, application normale, et impossibilité de contourner par la
 *  conception sur mesure ou par les filtres de critères. */
import { describe, expect, test } from "bun:test";
import { assessApplicationFit, FIT_PANEL } from "@/lib/leadmagnet/application-fit";
import type { Requirement } from "@/lib/leadmagnet/dossier";

const req = (key: string, value: string): Requirement => ({
  key,
  label: key,
  value,
  unit: null,
  state: "confirmed",
  source: "user",
});

/* Cas 10, mots exacts de la personne. */
const CASE10 = [
  req(
    "detection_goal",
    "Detect closure of an industrial machine cover and directly power the motor when closed.",
  ),
  req("target_object", "Magnet installed on the cover, sensor on the chassis."),
  req("states_motion", "Rotational, 5 mm."),
  req("environment", "0-50 °C indoor."),
  req(
    "electrical",
    "The motor operates at 230 VAC and draws 8 A. I want the motor supply current to pass directly through the reed sensor.",
  ),
  req("mounting", "Behind 2 mm plastic."),
];
const CASE10_FREE = "5,000 machines per year. I want to avoid using an additional relay or contactor.";

/* Cas 9, mots exacts de la personne. */
const CASE9 = [
  req("detection_goal", "Detect an aluminum part on a conveyor."),
  req("target_object", "Entirely aluminum, no magnet can be added."),
  req("states_motion", "10 mm, 0.5 m/s."),
  req("environment", "10-50 °C."),
  req("electrical", "24 VDC PLC input."),
  req("mounting", "No magnet or additional magnetic element permitted."),
];
const CASE9_FREE = "20 000 per year, I want a reed sensor.";

describe("cas 10 — la puissance moteur dans le contact", () => {
  const fit = assessApplicationFit(CASE10, CASE10_FREE);
  test("le point est levé et bloque toute proposition", () => {
    expect(fit.blocking).toBe(true);
    expect(fit.issues.map((i) => i.id)).toEqual(["direct_load_switching"]);
  });
  test("la charge réelle est nommée, pas inventée", () => {
    expect(fit.issues[0]!.whatFailsArgs.join(" ")).toContain("8 A");
    expect(fit.issues[0]!.whatFailsArgs.join(" ")).toContain("230 V AC");
  });
  test("le schéma distingue signal et puissance", () => {
    expect(fit.issues[0]!.diagram).toHaveLength(4);
    expect(fit.issues[0]!.diagram[0]).toContain("signal de position");
    expect(fit.issues[0]!.diagram[3]).toContain("circuit de puissance séparé");
  });
  test("aucun verrouillage de sécurité certifié n'est promis", () => {
    expect(fit.issues[0]!.cautions.join(" ")).toContain("verrouillage de sécurité machine certifié");
  });
  test("les modifications visent l'électrique, le refus d'interface et l'application", () => {
    const keys = fit.issues[0]!.changes.map((c) => c.step.key);
    expect(keys).toContain("electrical");
    expect(keys).toContain("free_constraints");
    expect(keys).toContain("detection_goal");
    expect(fit.issues[0]!.changes.every((c) => c.text.trim().length > 20)).toBe(true);
  });
  test("les citations sont les phrases de la personne, jamais réécrites", () => {
    expect(fit.issues[0]!.evidence.some((e) => e.quote.includes("pass directly through the reed sensor"))).toBe(true);
  });
  test("aucune réponse n'est modifiée par l'évaluation", () => {
    expect(CASE10.find((r) => r.key === "electrical")!.value).toContain("8 A");
  });
});

describe("cas 10 révisé — signal de commande et interface", () => {
  const revised = CASE10.map((r) =>
    r.key === "electrical"
      ? req(
          "electrical",
          "The sensor signals a 24 VDC PLC input. The 230 VAC 8 A motor supply is switched by a separate contactor, never through the sensor.",
        )
      : r.key === "detection_goal"
        ? req("detection_goal", "Detect closure of an industrial machine cover to signal the PLC.")
        : r,
  );
  test("plus aucun point, les produits reviennent", () => {
    const fit = assessApplicationFit(revised, "5,000 machines per year.");
    expect(fit.issues).toHaveLength(0);
    expect(fit.blocking).toBe(false);
  });
  test("une contradiction restante maintient le blocage", () => {
    const fit = assessApplicationFit(revised, CASE10_FREE);
    expect(fit.blocking).toBe(true);
  });
});

describe("cas 9 — aucune source magnétique", () => {
  const fit = assessApplicationFit(CASE9, CASE9_FREE);
  test("le point est levé et bloque", () => {
    expect(fit.blocking).toBe(true);
    expect(fit.issues.map((i) => i.id)).toEqual(["no_magnetic_source"]);
  });
  test("le matériau réel est nommé", () => {
    expect(fit.issues[0]!.whatFailsArgs).toEqual(["aluminium"]);
  });
  test("deux voies honnêtes sont proposées, dont l'autre technologie", () => {
    const texts = fit.issues[0]!.changes.map((c) => c.text).join(" ");
    expect(texts).toContain("Autoriser un aimant");
    expect(texts).toContain("autre technologie de détection");
  });
  test("la réponse de montage contradictoire est nommée avec son numéro affiché", () => {
    const steps = fit.issues[0]!.steps;
    const mounting = steps.find((s) => s.key === "mounting");
    expect(mounting).toBeTruthy();
    expect(mounting!.number).toBe(4);
    expect(mounting!.label).toBe("Montage");
  });
  test("la conception sur mesure ne contourne pas le point", () => {
    expect(fit.issues[0]!.cautions.join(" ")).toContain("conception sur mesure");
  });
});

describe("cas 9 révisé", () => {
  test("aimant autorisé sur les deux réponses : point levé", () => {
    const fit = assessApplicationFit(
      [
        req("detection_goal", "Detect an aluminum part on a conveyor."),
        req("target_object", "Aluminum part; a magnet is added on the moving support."),
        req("states_motion", "Magnet to sensor gap 10 mm, 0.5 m/s."),
        req("environment", "10-50 °C."),
        req("electrical", "24 VDC PLC input."),
        req("mounting", "Magnet on the support, sensor on the frame."),
      ],
      "20 000 per year.",
    );
    expect(fit.issues).toHaveLength(0);
  });
  test("réponse de montage encore contradictoire : point maintenu", () => {
    const fit = assessApplicationFit(
      [
        req("target_object", "Aluminum part; a magnet is added on the moving support."),
        req("mounting", "No magnet or additional magnetic element permitted."),
      ],
      "",
    );
    expect(fit.blocking).toBe(true);
  });
});

describe("pas de faux positifs", () => {
  test("signal automate 24 V et moteur 230 VAC 8 A séparés", () => {
    const fit = assessApplicationFit(
      [
        req("electrical", "The sensor signals the PLC at 24 V. Separately, the motor runs on 230 VAC and 8 A."),
        req("mounting", "Sensor on the frame."),
      ],
      "No direct switching by the sensor.",
    );
    expect(fit.issues).toHaveLength(0);
  });
  test("« no relay needed because the PLC controls an external contactor »", () => {
    const fit = assessApplicationFit(
      [req("electrical", "230 VAC 8 A motor. No relay needed because the PLC controls an external contactor.")],
      "",
    );
    expect(fit.issues).toHaveLength(0);
  });
  test("aimant déjà présent : aucun refus d'en ajouter", () => {
    const fit = assessApplicationFit(
      [req("target_object", "A magnet is already installed on the cover, no additional magnet needed.")],
      "",
    );
    expect(fit.issues).toHaveLength(0);
  });
  test("application reed classique avec aimant et automate", () => {
    const fit = assessApplicationFit(
      [
        req("detection_goal", "Détecter la fermeture de la porte du lave-vaisselle."),
        req("target_object", "Un aimant est posé sur la porte."),
        req("states_motion", "Rotation, 5 mm."),
        req("mounting", "Vissé sur le châssis."),
        req("electrical", "Signal vers un automate en 24 V continu."),
        req("environment", "0-60 °C."),
      ],
      "",
    );
    expect(fit.issues).toHaveLength(0);
    expect(fit.blocking).toBe(false);
  });
  test("réponses vides : inconnu n'est pas incompatible", () => {
    expect(assessApplicationFit([], "").issues).toHaveLength(0);
    expect(assessApplicationFit([req("electrical", "Je ne sais pas.")], "").issues).toHaveLength(0);
  });
  test("mention seule d'un moteur 230 V sans intention de commutation directe", () => {
    const fit = assessApplicationFit(
      [req("detection_goal", "Savoir si le capot d'une machine à moteur 230 V est fermé.")],
      "",
    );
    expect(fit.issues).toHaveLength(0);
  });
});

describe("deux points affichés ensemble", () => {
  test("puissance directe ET aucun aimant", () => {
    const fit = assessApplicationFit(
      [
        req("electrical", "230 VAC 8 A motor current must pass directly through the reed sensor."),
        req("mounting", "No magnet can be added."),
      ],
      "",
    );
    expect(fit.issues.map((i) => i.id)).toEqual([
      "direct_load_switching",
      "no_magnetic_source",
    ]);
    expect(fit.blocking).toBe(true);
  });
});

describe("textes du panneau", () => {
  test("aucun produit promis et démonstration ≠ vérification", () => {
    expect(FIT_PANEL.noProducts).toContain("Aucun produit n'est proposé");
    expect(FIT_PANEL.demoNotApplication).toContain("ne valent pas vérification");
    expect(FIT_PANEL.noRewrite).toContain("jamais modifiées");
  });
});

describe("liens vers le questionnaire réel", () => {
  test("le contexte projet est une précision supplémentaire, jamais la question 6", () => {
    // Cas 10 : le refus du relais est écrit dans la précision, pas dans une question.
    const fit = assessApplicationFit(
      [
        { key: "detection_goal", value: "Détecter la fermeture d'un capot et alimenter directement le moteur 230 VAC 8 A quand il est fermé.", state: "confirmed", source: "client" },
        { key: "electrical", value: "Le moteur fonctionne en 230 VAC et consomme 8 A. Je veux que le courant d'alimentation du moteur passe directement dans le capteur reed.", state: "confirmed", source: "client" },
        { key: "environment", value: "0-50°C intérieur", state: "confirmed", source: "client" },
      ],
      "5 000 machines par an. Je veux éviter d'utiliser un relais ou un contacteur supplémentaire.",
    );
    expect(fit.blocking).toBe(true);
    const issue = fit.issues.find((i) => i.id === "direct_load_switching")!;
    const free = issue.steps.find((s) => s.key === "free_constraints")!;
    expect(free.number).toBeNull();
    expect(free.label).toBe("Précision supplémentaire");
    // Les six questions gardent leur numérotation réelle de l'interface.
    const numbered = issue.steps.filter((s) => s.number !== null);
    for (const s of numbered) expect(s.number).toBeGreaterThanOrEqual(1);
    for (const s of numbered) expect(s.number).toBeLessThanOrEqual(6);
  });

  test("l'explication de charge cite la protection des charges inductives et la source Standex", () => {
    const fit = assessApplicationFit(
      [{ key: "electrical", value: "230 VAC, 8 A, le courant du moteur passe directement dans le capteur.", state: "confirmed", source: "client" }],
      "",
    );
    const issue = fit.issues.find((i) => i.id === "direct_load_switching")!;
    expect(issue.why).toContain("courant d'appel");
    const joined = issue.cautions.join(" ");
    expect(joined).toContain("charge inductive");
    // L'URL brute et la liste de composants ne figurent plus dans le texte :
    // la source est un lien nommé, la protection reste générique.
    expect(joined).not.toContain("handling-and-load-precautions");
    expect(joined).not.toContain("diode");
    expect(joined).toContain("adaptée au type d'alimentation");
    expect(FIT_PANEL.sourceUrl).toContain("handling-and-load-precautions");
  });
});

describe("portée locale des négations et des contextes bénins", () => {
  test("intention directe en Application : une réponse électrique sûre ne l'annule pas", () => {
    const fit = assessApplicationFit(
      [
        req("detection_goal", "Directly power the motor when the cover closes."),
        req(
          "electrical",
          "Motor 230 VAC 8 A; the reed sends a control signal to the PLC with a separate contactor.",
        ),
      ],
      "",
    );
    expect(fit.blocking).toBe(true);
    const issue = fit.issues.find((i) => i.id === "direct_load_switching")!;
    expect(issue.evidence.some((e) => e.quote.includes("Directly power the motor"))).toBe(true);
    expect(issue.steps.some((s) => s.key === "detection_goal")).toBe(true);
  });
  test("phrase directe explicite plus phrase sûre séparée : le point subsiste", () => {
    const fit = assessApplicationFit(
      [
        req(
          "electrical",
          "The 230 VAC 8 A motor current must pass directly through the reed sensor. A separate contactor drives the pump.",
        ),
      ],
      "",
    );
    expect(fit.blocking).toBe(true);
  });
  test("phrase niée seule : aucun point", () => {
    const fit = assessApplicationFit(
      [
        req(
          "electrical",
          "The reed does not directly switch the 230 VAC 8 A motor; a rated contactor does.",
        ),
      ],
      "",
    );
    expect(fit.issues).toHaveLength(0);
  });
  test("« aucun aimant ne peut être ajouté » en Montage reste une contradiction", () => {
    const fit = assessApplicationFit(
      [
        req("target_object", "A magnet is already installed on the cover."),
        req("mounting", "No magnet can be added."),
      ],
      "",
    );
    expect(fit.issues.map((i) => i.id)).toEqual(["no_magnetic_source"]);
    expect(fit.issues[0]!.evidence.some((e) => e.quote.includes("No magnet can be added"))).toBe(true);
  });
  test("« a magnet is not already installed » ne supprime rien", () => {
    const fit = assessApplicationFit(
      [req("target_object", "A magnet is not already installed and no magnet can be added.")],
      "",
    );
    expect(fit.blocking).toBe(true);
  });
  test("« boîtier plastique non magnétique, aimant sur le capot mobile » : aucun refus", () => {
    const fit = assessApplicationFit(
      [
        req("target_object", "Non-magnetic plastic housing, magnet on the moving cover."),
        req("mounting", "Sensor screwed on the frame."),
      ],
      "",
    );
    expect(fit.issues).toHaveLength(0);
  });
  test("aimant déjà posé, seul un aimant supplémentaire jugé inutile : aucun point", () => {
    const fit = assessApplicationFit(
      [req("target_object", "A magnet is already installed on the cover, no additional magnet needed.")],
      "",
    );
    expect(fit.issues).toHaveLength(0);
  });
});

describe("textes non catégoriques et autre technologie concrète", () => {
  test("l'introduction parle d'architecture adaptée, sans promesse", () => {
    expect(FIT_PANEL.intro).toContain("architecture adaptée");
    expect(FIT_PANEL.intro).not.toContain("tout à fait réalisable");
  });
  test("aluminium : détecteur inductif ou optique nommés, sans garantie", () => {
    const fit = assessApplicationFit(
      [
        req("target_object", "Entirely aluminum, no magnet can be added."),
        req("mounting", "No magnet or additional magnetic element permitted."),
      ],
      "",
    );
    const issue = fit.issues.find((i) => i.id === "no_magnetic_source")!;
    expect(issue.whatWorks).toContain("champ magnétique adapté");
    expect(issue.whatWorks).not.toContain("aucune difficulté en soi");
    const texts = issue.changes.map((c) => c.text).join(" ");
    expect(texts).toContain("détecteur inductif");
    expect(texts).toContain("optique");
    expect(texts).toContain("ne garantissons pas");
    // La distance aimant-capteur se revoit à la question 3.
    expect(issue.steps.some((s) => s.key === "states_motion" && s.number === 3)).toBe(true);
    expect(issue.changes.some((c) => c.step.key === "states_motion")).toBe(true);
  });
});
