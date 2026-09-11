import { describe, expect, it } from "bun:test";
import { DEFAULT_WORKSHOP } from "@/lib/standex/magnetic-workshop";
import { COFFEE_ASSEMBLY } from "@/lib/standex/machine-assembly";
import {
  computeMounting,
  moveCouple,
  mountingFromWorkshop,
  workshopPatchFromMounting,
} from "@/lib/standex/mounting";

const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);
const machineConfig = () => ({
  ...DEFAULT_WORKSHOP,
  mode: "education" as const,
  machine: structuredClone(COFFEE_ASSEMBLY),
});

const moves = [
  { translationMm: [5, 0, 0] as [number, number, number] },
  { translationMm: [-3, 2, 7] as [number, number, number] },
  { rotationDeg: [0, 30, 0] as [number, number, number] },
  { rotationDeg: [0, 45, 0] as [number, number, number] },
  { rotationDeg: [0, -90, 0] as [number, number, number] },
  {
    translationMm: [2, 3, 4] as [number, number, number],
    rotationDeg: [0, 45, 0] as [number, number, number],
  },
];

describe("déplacer le couple ne touche jamais la trajectoire de la machine", () => {
  for (const u of [0, 0.37]) {
    for (const move of moves) {
      it(`modèle importé, u=${u}, ${JSON.stringify(move)} : course, pivot et axe intacts`, () => {
        const c = machineConfig();
        const before = mountingFromWorkshop(c, u);
        const moved = moveCouple(before, move);
        const n = { ...c, ...workshopPatchFromMounting(moved, c, u) };
        // La trajectoire est une contrainte de l'application de l'utilisateur.
        expect(n.machine!.travel).toEqual(COFFEE_ASSEMBLY.travel);
        expect(n.machine!.pivot).toEqual(COFFEE_ASSEMBLY.pivot);
        expect(n.machine!.rotationAxis).toBe(COFFEE_ASSEMBLY.rotationAxis);
        expect(n.machine!.openingAngle).toBe(COFFEE_ASSEMBLY.openingAngle);
        expect(n.machine!.movingNode).toBe(COFFEE_ASSEMBLY.movingNode);
        expect(n.machine!.magnetMount).toBe(COFFEE_ASSEMBLY.magnetMount);
        expect(n.machine!.sensorMount).toBe(COFFEE_ASSEMBLY.sensorMount);
        // Mais la pose demandée est réellement appliquée aux deux composants.
        const after = mountingFromWorkshop(n, u);
        after.anchor.positionMm.forEach((v, i) => near(v, moved.anchor.positionMm[i]!));
        after.anchor.rotationDeg.forEach((v, i) => near(v, moved.anchor.rotationDeg[i]!));
        after.relative.positionMm.forEach((v, i) => near(v, moved.relative.positionMm[i]!));
        after.relative.rotationDeg.forEach((v, i) => near(v, moved.relative.rotationDeg[i]!));
      });
    }
  }

  it("modèle importé : la translation demandée arrive bien sur le capteur", () => {
    const c = machineConfig();
    const moved = moveCouple(mountingFromWorkshop(c), { translationMm: [5, 0, 0] });
    const n = { ...c, ...workshopPatchFromMounting(moved, c) };
    expect(n.machine!.sensorPosition[0]).toBeCloseTo(104, 6);
    expect(n.machine!.travel).toEqual(COFFEE_ASSEMBLY.travel);
  });
});

describe("la rotation globale du montage ne change pas le verdict en espace vide", () => {
  for (const mountAngle of [0, 15, 45, 90, 180, -45]) {
    it(`mountAngle ${mountAngle} reste couvert`, () => {
      const r = computeMounting(mountingFromWorkshop({ ...DEFAULT_WORKSHOP, mountAngle }));
      expect(r.coverage).toBe("covered");
      expect(r.reasons).toEqual([]);
    });
  }
  it("mais l'orientation propre du capteur hors gabarit reste hors domaine", () => {
    const r = computeMounting(
      mountingFromWorkshop({ ...DEFAULT_WORKSHOP, sensorAngle: 45, magnetAngle: 45 }),
    );
    expect(r.coverage).toBe("outside");
  });
});
