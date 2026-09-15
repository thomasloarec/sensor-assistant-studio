/** La proximité illustrative doit se lire sur la pose RÉELLEMENT DESSINÉE.
 *
 *  Le contrat `GuidedMounting` réduit toute course à deux entrefers sur l'axe
 *  d'approche. Cette réduction ignore la course d'un modèle importé et les
 *  mouvements `slide` / `pivot` de l'espace vide, et elle TRIE ses deux extrêmes :
 *  « repos » et « ouverte » peuvent donc être inversés par rapport au cycle
 *  réellement animé. Lire la proximité là-dessus faisait fermer un contact alors
 *  que l'aimant part à 100 mm de côté.
 *
 *  Ces tests vérifient la source de la pose, jamais une qualification : dans tous
 *  les cas ci-dessous la simulation reste illustrative, sans seuil publié.
 */
import { describe, expect, test } from "bun:test";
import {
  DEFAULT_WORKSHOP,
  poseAt,
  type WorkshopConfig,
} from "../src/lib/standex/magnetic-workshop";
import { COFFEE_ASSEMBLY, openingAt } from "../src/lib/standex/machine-assembly";
import {
  mountingFromWorkshop,
  relativePoseInMachine,
  scenePoseSampler,
} from "../src/lib/standex/mounting/bridge";
import { ILLUSTRATIVE_FAR_MM, simulateMounting } from "../src/lib/standex/mounting/simulate";

const config = (patch: Partial<WorkshopConfig> = {}): WorkshopConfig => ({
  ...DEFAULT_WORKSHOP,
  ...patch,
});

/** Cas exact signalé : capteur fixe à l'origine, aimant mobile à 20 mm devant,
 *  emporté par une course de 100 mm LATÉRALE. À mi-cycle il est loin. */
const lateralMachine = {
  ...COFFEE_ASSEMBLY,
  sensorPosition: [0, 0, 0] as [number, number, number],
  magnetPosition: [0, 0, 20] as [number, number, number],
  sensorMount: "fixed" as const,
  magnetMount: "moving" as const,
  travel: [100, 0, 0] as [number, number, number],
  motion: "translation" as const,
};
const machineConfig = config({ sensorId: "MK27", machine: lateralMachine, start: 32, end: 5 });

describe("proximité lue sur la pose réellement dessinée", () => {
  test("montage importé : la course latérale de la machine est réellement suivie", () => {
    const sample = scenePoseSampler(machineConfig);
    // À t = 0,5, `openingAt` vaut 1 : l'aimant est au bout de sa course.
    expect(openingAt(0.5)).toBeCloseTo(1, 12);
    expect(sample(0.5)!.positionMm[0]).toBeCloseTo(100, 9);
    // Et c'est la MÊME pose que celle de la scène 3D au même instant.
    const scene = relativePoseInMachine(lateralMachine, openingAt(0.5));
    expect(sample(0.5)!.positionMm).toEqual(scene.positionMm);
    // Au repos, la pose n'a aucun décalage latéral : le tri des extrêmes du
    // contrat ne peut donc pas déduire la course depuis l'entrefer nominal.
    expect(sample(0)!.positionMm[0]).toBeCloseTo(0, 9);
  });

  test("un aimant emporté à 100 mm de côté est OUVERT, jamais fermé", () => {
    const guided = mountingFromWorkshop(machineConfig);
    const sim = simulateMounting(guided, 200, undefined, scenePoseSampler(machineConfig));
    expect(sim.illustrative).toBe(true);
    const mid = sim.samples.find((s) => Math.abs(s.t - 0.5) < 1e-9)!;
    expect(mid.separationMm).toBeGreaterThan(ILLUSTRATIVE_FAR_MM);
    expect(mid.contact).toBe("open");
    // La qualification n'a pas bougé d'un iota : aucun seuil publié, rien de couvert.
    expect(sim.pullInMm).toBeNull();
    expect(sim.dropOutMm).toBeNull();
    expect(mid.covered).toBe(false);
    expect(sim.coverage).not.toBe("covered");
  });

  test("sans échantillonneur, l'ancien axe virtuel fermait à tort : c'était le bug", () => {
    const guided = mountingFromWorkshop(machineConfig);
    const naive = simulateMounting(guided, 200);
    const mid = naive.samples.find((s) => Math.abs(s.t - 0.5) < 1e-9)!;
    // L'axe reconstruit garde le latéral de repos (0) : la séparation y est courte.
    expect(mid.separationMm).toBeLessThan(ILLUSTRATIVE_FAR_MM);
    // La pose corrigée, elle, est bien plus éloignée.
    const fixed = simulateMounting(guided, 200, undefined, scenePoseSampler(machineConfig));
    const fixedMid = fixed.samples.find((s) => Math.abs(s.t - 0.5) < 1e-9)!;
    expect(fixedMid.separationMm).toBeGreaterThan(mid.separationMm + 50);
  });

  test("espace vide : un glissement suit la position dessinée, pas l'axe d'approche", () => {
    const slide = config({ sensorId: "MK27", motion: "slide", travel: 60, offset: 30 });
    const sample = scenePoseSampler(slide);
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const drawn = poseAt(slide, t);
      expect(sample(t)!.positionMm[0]).toBeCloseTo(drawn.position[0], 9);
      expect(sample(t)!.positionMm[2]).toBeCloseTo(drawn.position[2], 9);
    }
    const sim = simulateMounting(mountingFromWorkshop(slide), 200, undefined, sample);
    expect(sim.illustrative).toBe(true);
    // Aux extrémités de la course, l'aimant est à 60 mm de côté : ouvert.
    expect(sim.samples[0]!.contact).toBe("open");
    // Au passage devant le capteur (8 mm d'écart), il ferme.
    const closest = sim.samples.reduce((a, b) => (b.separationMm < a.separationMm ? b : a));
    expect(closest.contact).toBe("closed");
    expect(closest.covered).toBe(false);
  });

  test("espace vide : un pivot suit l'arc dessiné", () => {
    const pivot = config({ sensorId: "MK27", motion: "pivot", span: 160, offset: 45 });
    const sample = scenePoseSampler(pivot);
    for (const t of [0, 0.3, 0.5, 1]) {
      const drawn = poseAt(pivot, t);
      expect(sample(t)!.positionMm[0]).toBeCloseTo(drawn.position[0], 9);
      expect(sample(t)!.positionMm[2]).toBeCloseTo(drawn.position[2], 9);
    }
    const sim = simulateMounting(mountingFromWorkshop(pivot), 200, undefined, sample);
    expect(sim.illustrative).toBe(true);
    // L'arc éloigne puis rapproche : les deux états doivent apparaître.
    const states = new Set(sim.samples.map((s) => s.contact));
    expect(states.has("closed")).toBe(true);
    expect(states.has("open")).toBe(true);
  });

  test("approche pure : l'échantillonneur reproduit exactement l'ancienne pose", () => {
    const approach = config({ sensorId: "MK27", geometry: "D1", start: 40, end: 4 });
    const guided = mountingFromWorkshop(approach);
    const before = simulateMounting(guided, 120);
    const after = simulateMounting(guided, 120, undefined, scenePoseSampler(approach));
    for (let i = 0; i < before.samples.length; i++) {
      expect(after.samples[i]!.separationMm).toBeCloseTo(before.samples[i]!.separationMm, 6);
      expect(after.samples[i]!.contact).toBe(before.samples[i]!.contact);
    }
  });

  test("contact affiché et chronologie viennent de la même série d'échantillons", () => {
    const sim = simulateMounting(
      mountingFromWorkshop(machineConfig),
      200,
      undefined,
      scenePoseSampler(machineConfig),
    );
    for (const tr of sim.transitions) {
      const s = sim.samples.find((x) => Math.abs(x.t - tr.t) < 1e-9)!;
      expect(s.contact).toBe(tr.contact);
    }
  });
});
