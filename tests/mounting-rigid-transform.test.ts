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

describe("un déplacement rigide du montage emmène sa trajectoire", () => {
  for (const u of [0, 0.37]) {
    for (const move of moves) {
      it(`modèle importé, u=${u}, ${JSON.stringify(move)} : course et couverture inchangées`, () => {
        const c = machineConfig();
        const before = mountingFromWorkshop(c, u);
        const moved = moveCouple(before, move);
        const after = mountingFromWorkshop(
          { ...c, ...workshopPatchFromMounting(moved, c, u) },
          u,
        );
        near(after.travel.startGapMm, before.travel.startGapMm);
        near(after.travel.endGapMm, before.travel.endGapMm);
        expect(computeMounting(after).coverage).toBe(computeMounting(before).coverage);
        // La pose relative du couple est l'invariant : elle ne bouge pas.
        after.relative.positionMm.forEach((v, i) => near(v, before.relative.positionMm[i]!));
      });
    }
  }

  it("modèle importé : la pose demandée est réellement appliquée aux deux composants", () => {
    const c = machineConfig();
    const moved = moveCouple(mountingFromWorkshop(c), { translationMm: [5, 0, 0] });
    const n = { ...c, ...workshopPatchFromMounting(moved, c) };
    expect(n.machine!.sensorPosition[0]).toBeCloseTo(104, 6);
    // Le nœud mobile, la nature des attaches et l'amplitude du mouvement sont conservés.
    expect(n.machine!.movingNode).toBe(c.machine!.movingNode);
    expect(n.machine!.magnetMount).toBe(c.machine!.magnetMount);
    expect(n.machine!.sensorMount).toBe(c.machine!.sensorMount);
    const norm = (v: readonly number[]) => Math.hypot(v[0]!, v[1]!, v[2]!);
    near(norm(n.machine!.travel), norm(c.machine!.travel));
  });

  it("une rotation non représentable sur un axe machine laisse la trajectoire inchangée", () => {
    const c = machineConfig();
    c.machine!.motion = "rotation";
    c.machine!.rotationAxis = "y";
    const moved = moveCouple(mountingFromWorkshop(c), { rotationDeg: [37, 0, 0] });
    const n = { ...c, ...workshopPatchFromMounting(moved, c) };
    expect(n.machine!.pivot).toEqual(c.machine!.pivot);
    expect(n.machine!.rotationAxis).toBe("y");
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
