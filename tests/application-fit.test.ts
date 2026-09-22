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
