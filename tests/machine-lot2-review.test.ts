/** Revue lot 2 : lecture au temps réel, commutations illustratives liées à la
 *  ligne nominale publiée de la classe choisie, refus d'échelle réessayable. */
import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { DEFAULT_WORKSHOP, type WorkshopConfig } from "../src/lib/standex/magnetic-workshop";
import { mountingFromWorkshop, scenePoseSampler } from "../src/lib/standex/mounting/bridge";
import { simulateMounting, withComputed } from "../src/lib/standex/mounting/simulate";
import { illustrationSourceFor } from "../src/lib/standex/workshop-guide";
import {
  MANUAL_CYCLE_SECONDS,
  cycleSeconds,
  playbackStep,
  switchEvents,
} from "../src/lib/standex/machine-playback";
import { registerAnimation } from "../src/lib/standex/machine-clip-registry";
import { COFFEE_ASSEMBLY, type MachineAssembly } from "../src/lib/standex/machine-assembly";
import { parseMachineAsset } from "../src/lib/standex/machine-assets";

const unregisters: (() => void)[] = [];
afterEach(() => {
  while (unregisters.length) unregisters.pop()!();
});

function clipMachine(loadedDuration: number, savedDuration: number): MachineAssembly {
  const m: MachineAssembly = {
    ...structuredClone(COFFEE_ASSEMBLY),
    assetKey: "sha256:test-" + loadedDuration,
    motionSource: "clip",
    clip: { index: 0, name: "C", duration: savedDuration },
  };
  unregisters.push(
    registerAnimation(m.assetKey, m.unitScale, {
      clips: [
        { index: 0, name: "C", duration: loadedDuration, trackCount: 1, supported: true, issues: [], animatedPaths: [] },
      ],
      sampler: () => ({
        index: 0,
        name: "C",
        duration: loadedDuration,
        affects: () => false,
        groupOf: () => "",
        deltaAt: () => null,
      }),
    }),
  );
  return m;
}
/** Simule la lecture image par image (16 ms) sans attendre réellement. */
function playFor(seconds: number | null, ms: number, slow = false): number {
  let p = 0;
  for (let t = 0; t < ms; t += 16) p = playbackStep(p, 16, seconds, slow);
  return p;
}

describe("lecture au temps réel d'un clip", () => {
  test("clip de 0,2 s : durée réelle, dernière image exacte", () => {
    const m = clipMachine(0.2, 5);
    const s = cycleSeconds(m);
    expect(s).toBe(0.2); // durée du fichier CHARGÉ, pas celle du JSON (5 s)
    expect(playFor(s, 96)).toBeCloseTo(0.48, 5);
    expect(playFor(s, 400)).toBe(1);
    expect(playFor(s, 200, true)).toBeCloseTo(0.5, 1); // ralenti × 2
  });
  test("clip de 400 s : ni plafond de pas, ni durée tronquée", () => {
    const s = cycleSeconds(clipMachine(400, 400))!;
    expect(s).toBe(400);
    let p = 0;
    for (let i = 0; i < 1000; i++) p = playbackStep(p, 100, s, false); // 100 s
    expect(p).toBeCloseTo(0.25, 6);
    for (let i = 0; i < 3000; i++) p = playbackStep(p, 100, s, false);
    expect(p).toBe(1);
  });
  test("un onglet en arrière-plan ne fait pas sauter la lecture", () => {
    expect(playbackStep(0, 60_000, 0.2, false)).toBe(1);
    expect(playbackStep(0, 60_000, MANUAL_CYCLE_SECONDS, false)).toBeCloseTo(0.25 / 6, 6);
  });
  test("clip absent du fichier chargé : rien n'est lisible", () => {
    const m = { ...structuredClone(COFFEE_ASSEMBLY), motionSource: "clip" as const, clip: { index: 0, name: "X", duration: 2 } };
    expect(cycleSeconds(m)).toBeNull();
    expect(playbackStep(0.3, 100, cycleSeconds(m), false)).toBe(0.3);
  });
});

describe("commutations illustratives", () => {
  test("indéterminé → fermé n'est pas un enclenchement", () => {
    const ev = switchEvents(null, [
      { t: 0, contact: "unknown" },
      { t: 0.1, contact: "closed" },
      { t: 0.2, contact: "open" },
      { t: 0.3, contact: "unknown" },
      { t: 0.4, contact: "open" },
      { t: 0.5, contact: "closed" },
    ]);
    expect(ev.map((e) => [e.kind, e.t])).toEqual([
      ["open", 0.2],
      ["close", 0.5],
    ]);
  });
  test("mouvement manuel : ouverture et phase aller / retour", () => {
    const m: MachineAssembly = { ...structuredClone(COFFEE_ASSEMBLY), motion: "translation", travel: [0, 0, 40] };
    const ev = switchEvents(m, [
      { t: 0.24, contact: "closed" },
      { t: 0.25, contact: "open" },
      { t: 0.75, contact: "closed" },
    ]);
    expect(ev[0]!.opening).toEqual({ value: 20, unit: "mm", phase: "aller" });
    expect(ev[1]!.opening).toEqual({ value: 20, unit: "mm", phase: "retour" });
  });
});

const mk04 = (sensitivity: string): WorkshopConfig =>
  ({
    ...DEFAULT_WORKSHOP,
    sensorId: "MK04",
    magnetModel: "M04",
    geometry: "D1",
    sensitivity,
    lateralShift: 2,
    start: 30,
    end: 5,
  }) as WorkshopConfig;
function closings(c: WorkshopConfig) {
  const src = illustrationSourceFor(c, null, null);
  const sim = simulateMounting(withComputed(mountingFromWorkshop(c)), 600, undefined, scenePoseSampler(c), src.bounds);
  return { src, sim, ev: switchEvents(null, sim.samples) };
}

describe("sensibilité : ligne nominale publiée de la classe choisie", () => {
  test("MK04 / M04 / D1, classes E et B : sources et commutations différentes à pose inchangée", () => {
    const e = closings(mk04("E")),
      b = closings(mk04("B"));
    expect(e.src).toMatchObject({ kind: "nominal", sensitivityClass: "E", bounds: { nearMm: 10, farMm: 13.5 } });
    expect(b.src).toMatchObject({ kind: "nominal", sensitivityClass: "B", bounds: { nearMm: 15, farMm: 17.5 } });
    expect(e.sim.illustrative && b.sim.illustrative).toBe(true);
    // La classe B (15 mm) ferme plus tôt pendant l'approche que la classe E (10 mm).
    const firstClose = (x: typeof e) => x.ev.find((v) => v.kind === "close")!.t;
    expect(firstClose(b)).toBeLessThan(firstClose(e));
    // Illustration seulement : aucun seuil publié recopié, couverture non acquise.
    expect(e.sim.coverage).not.toBe("covered");
  });
  test("sans ligne exploitable : source « none », aucune borne", () => {
    expect(illustrationSourceFor({ ...mk04("E"), geometry: "F1" }, null, null)).toEqual({ kind: "none", bounds: null });
    expect(illustrationSourceFor({ ...mk04("Z") }, null, null).kind).toBe("none");
  });
  test("plage du guide seulement si aucune ligne nominale", () => {
    const marks = { nearMm: 8, farMm: 12 };
    expect(illustrationSourceFor({ ...mk04("E"), geometry: "F1" }, marks, "REF").kind).toBe("guide");
    expect(illustrationSourceFor(mk04("E"), marks, "REF").kind).toBe("nominal");
  });
});

describe("unités à l'import", () => {
  test("un GLB en millimètres refusé en mètres est réessayable, puis accepté en mm", async () => {
    const b = readFileSync("public/models/demo-bras-anime.glb");
    const data = () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    // Le GLB de démo mesure ~0,2 m : lu en « mm » il fait 0,2 mm → hors échelle.
    let err: unknown = null;
    try {
      await parseMachineAsset(data(), 0.001 as never);
    } catch (e) {
      err = e;
    }
    expect((err as { code?: string })?.code).toBe("scale");
    const ok = await parseMachineAsset(data(), 1000);
    expect(Math.max(...ok.size)).toBeGreaterThan(1);
    ok.dispose();
  });
});
