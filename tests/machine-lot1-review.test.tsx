/** Revue indépendante du lot 1 de l'atelier : corrections P1/P2.
 *  Chaque test porte sur une règle de la revue, avec des valeurs concrètes. */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import {
  COFFEE_ASSEMBLY,
  motionDirection,
  motionProblem,
  parseMachine,
  rescaleMachine,
  syncAttachSupports,
  toggleMoving,
} from "../src/lib/standex/machine-assembly";
import type { MachineAssembly } from "../src/lib/standex/machine-assembly";
import {
  applyAttachments,
  attachPose,
  reconcileAttachments,
} from "../src/lib/standex/machine-mounting";
import type { Attachment } from "../src/lib/standex/machine-mounting";
import type { Vec3, WorkshopConfig } from "../src/lib/standex/magnetic-workshop";
import { DEFAULT_WORKSHOP, simulateCycle } from "../src/lib/standex/magnetic-workshop";
import { DEMO_ASSEMBLIES } from "../src/lib/standex/machine-demos";
import MachineGuide, {
  guideOverlay,
  handlePick,
  INITIAL_GUIDE,
} from "../src/components/standex/workshop/machine-guide";
import type { MachineAsset } from "../src/lib/standex/machine-assets";

const near = (a: Vec3, b: Vec3, d = 6) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, d));
const surface = (patch: Partial<Attachment> = {}): Attachment => ({
  kind: "surface",
  support: "fixed",
  partPath: "0/0",
  point: [10, 20, 30],
  normal: [0, 1, 0],
  offsetMm: 0,
  spinDeg: 0,
  flip: false,
  depthRef: "collar",
  axisSource: "face",
  ...patch,
});
const WORKSHOP = readFileSync("src/components/standex/workshop/workshop.tsx", "utf8");
const GUIDE = readFileSync("src/components/standex/workshop/machine-guide.tsx", "utf8");

describe("P2.9 — axe brut validé avant tout repli", () => {
  test("axe nul explicite sur un pivot confirmé : refusé", () => {
    const m = { ...COFFEE_ASSEMBLY, motion: "rotation" as const, axisVector: [0, 0, 0] as Vec3, motionStatus: "confirmed" as const };
    expect(motionProblem(m)).not.toBeNull();
  });
  test("axe NaN ou infini explicite : refusé", () => {
    for (const v of [NaN, Infinity])
      expect(motionProblem({ ...COFFEE_ASSEMBLY, axisVector: [v, 0, 0], motionStatus: "confirmed" })).not.toBeNull();
  });
  test("inverser une coulisse ancienne sans vecteur suit unit(travel), pas rotationAxis", () => {
    // Café : course +Z 130 mm, rotationAxis "y".
    near(motionDirection(COFFEE_ASSEMBLY)!, [0, 0, 1]);
  });
});

describe("P1.2 — le support d'une attache suit la sélection mobile réelle", () => {
  const drawer = DEMO_ASSEMBLIES["builtin:drawer-v1"]!;
  const movingPath = drawer.movingNodes![0]!;
  test("retirer la pièce mobile rend l'attache fixe ; la rajouter la rend mobile", () => {
    const m = syncAttachSupports({ ...drawer, sensorAttach: surface({ partPath: movingPath, support: "fixed" }) });
    expect(m.sensorAttach!.support).toBe("moving");
    expect(m.sensorMount).toBe("moving");
    const removed = syncAttachSupports({ ...m, ...toggleMoving(m, movingPath) });
    expect(removed.sensorAttach!.support).toBe("fixed");
    expect(removed.sensorMount).toBe("fixed");
  });
  test("choisir le groupe parent rend mobile une attache posée sur une sous-pièce", () => {
    const m: MachineAssembly = { ...drawer, movingNodes: ["0"], movingNode: "0", sensorAttach: surface({ partPath: "0/1/2" }) };
    expect(syncAttachSupports(m).sensorAttach!.support).toBe("moving");
  });
  test("la relecture d'un montage réconcilie un support incohérent", () => {
    const back = parseMachine({ ...drawer, sensorAttach: surface({ partPath: movingPath, support: "fixed" }) })!;
    expect(back.sensorAttach!.support).toBe("moving");
  });
  test("changer d'unités rééchelonne les points du modèle, pas la taille du produit", () => {
    const m: MachineAssembly = {
      ...COFFEE_ASSEMBLY,
      unitScale: 1000,
      sensorAttach: surface({ point: [10, 20, 30], offsetMm: 1.5 }),
    };
    const mm = rescaleMachine(m, 1);
    near(mm.sensorAttach!.point, [0.01, 0.02, 0.03]);
    expect(mm.sensorAttach!.offsetMm).toBe(1.5);
    near(mm.travel, [0, 0, 0.13]);
    expect(mm.motionStatus).toBe("draft");
    const placed = applyAttachments(mm, { lengthMm: 10, heightMm: 4 }, { lengthMm: 6, heightMm: 3 });
    // Face d'appui sur le point rééchelonné : centre à hauteur/2 + écart au-dessus.
    near(placed.sensorPosition, [0.01, 0.02 + 2 + 1.5, 0.03]);
  });
});

describe("P1.4 — mode traversant réconcilié avec le produit", () => {
  test("un produit non cylindrique libère l'attache traversante", () => {
    const m = { ...COFFEE_ASSEMBLY, sensorAttach: surface({ kind: "through" }) };
    const r = reconcileAttachments(m, "block");
    expect(r.machine.sensorAttach).toBeUndefined();
    expect(r.freed).toEqual(["sensor"]);
    expect(reconcileAttachments(m, "cylinder").freed).toEqual([]);
  });
  test("l'effet de produit suit toutes les dimensions effectives, pas seulement les identifiants", () => {
    expect(WORKSHOP).toContain("[dimsKey, sensorShape, machine?.sensorAttach, machine?.magnetAttach]");
  });
  test("le mode affiché reprend le type d'une attache enregistrée", () => {
    expect(WORKSHOP).toContain("kind: { sensor: s ?? st.kind.sensor, magnet: g ?? st.kind.magnet }");
  });
});

describe("P1.8 — axe de trou par deux points", () => {
  const m = DEMO_ASSEMBLIES["builtin:wall-v1"]!;
  const config: WorkshopConfig = { ...DEFAULT_WORKSHOP, sensorId: "MK11-M8", machine: m } as WorkshopConfig;
  const start = { ...INITIAL_GUIDE, pick: { purpose: "hole-points" as const, points: [] } };
  test("le support du PREMIER point est conservé", () => {
    const one = handlePick(start, m, { point: [0, 60, 0], normal: [0, 0, 1], path: "0/0", moving: false }, config);
    const two = handlePick(one.state, m, { point: [0, 60, -5], normal: [1, 0, 0], path: "0/9", moving: false }, config);
    expect(two.patch?.sensorAttach?.partPath).toBe("0/0");
    expect(two.patch?.sensorAttach?.support).toBe("fixed");
  });
  test("deux supports non solidaires : refus expliqué, aucune attache", () => {
    const one = handlePick(start, m, { point: [0, 60, 0], normal: [0, 0, 1], path: "0/0", moving: false }, config);
    const two = handlePick(one.state, m, { point: [0, 60, -5], normal: [0, 0, 1], path: "0/1", moving: true }, config);
    expect(two.patch).toBeNull();
    expect(two.state.notice).toContain("non solidaires");
  });
  test("points confondus : message clair au lieu d'une fin silencieuse", () => {
    const one = handlePick(start, m, { point: [1, 1, 1], normal: [0, 0, 1], path: "0/0", moving: false }, config);
    const two = handlePick(one.state, m, { point: [1, 1, 1], normal: [0, 0, 1], path: "0/0", moving: false }, config);
    expect(two.patch).toBeNull();
    expect(two.state.notice).toContain("confondus");
  });
});

describe("P1.12/13 — référence de profondeur et repères", () => {
  test("la référence arrière n'est plus nommée collerette", () => {
    expect(GUIDE).not.toContain("face d'appui / collerette");
    expect(GUIDE).toContain("l'extrémité arrière du corps modélisé");
  });
  test("le repère d'une attache mobile suit la transformation de son support", () => {
    const door = DEMO_ASSEMBLIES["builtin:door-v1"]!;
    const a = surface({ partPath: door.movingNodes![0]!, support: "moving", point: [40, 10, 0] });
    const m = { ...door, sensorAttach: a, sensorMount: "moving" as const };
    const closed = guideOverlay(INITIAL_GUIDE, m, {}, 100, 0).attachMarks[0]!;
    const open = guideOverlay(INITIAL_GUIDE, m, {}, 100, 1).attachMarks[0]!;
    near(closed, [40, 10, 0]);
    // Ouverte, la marque a quitté sa position de repos avec la porte.
    expect(Math.hypot(...open.map((v, i) => v - closed[i]!))).toBeGreaterThan(10);
    // Et coïncide avec le point d'attache emporté (même transformation que le capteur).
    const pose = attachPose(a, { lengthMm: 10, heightMm: 0 });
    near(closed, pose.position);
  });
});

describe("P1.1 — import transactionnel", () => {
  const body = WORKSHOP.slice(WORKSHOP.indexOf("async function importMachine"), WORKSHOP.indexOf("function failed3d"));
  test("la géométrie est chargée et validée AVANT de remplacer le montage", () => {
    expect(body.indexOf("loadMachineAsset(")).toBeGreaterThan(0);
    expect(body.indexOf("loadMachineAsset(")).toBeLessThan(body.indexOf("update({"));
    expect(body.indexOf("loadMachineAsset(")).toBeLessThan(body.indexOf("historyRef.current ="));
  });
  test("l'aimant n'est jamais réinitialisé par un import", () => {
    expect(body).not.toContain("defaultMagnetFor");
    expect(body).not.toContain("magnetModel");
  });
  test("seul le dernier import demandé est appliqué", () => {
    expect(body).toContain("seq !== importSeqRef.current");
  });
});

describe("P1.5 — aucun contact sans mouvement validé ni fichier chargé", () => {
  test("mouvement en brouillon : la chronologie ne contient que de l'indéterminé", () => {
    expect(WORKSHOP).toContain("const machineBlocked = !!machine && (!!motionProblem(machine) || !machineAsset);");
    const c = { ...DEFAULT_WORKSHOP, mode: "education", magnetModel: "generic", machine: { ...COFFEE_ASSEMBLY, motionStatus: "draft" } } as WorkshopConfig;
    expect(simulateCycle(c).reason).not.toBeNull();
  });
});

describe("P2.11 — mouvement réduit dans l'Essai", () => {
  const asset = {
    parts: [{ path: "0/0" }, { path: "0/1" }],
    nodes: [{ path: "0/1", name: "Bac", depth: 1, meshCount: 1 }],
    size: [100, 50, 80],
    center: [0, 0, 0],
    min: [0, 0, 0],
    animationCount: 0,
    dispose: () => undefined,
  } as unknown as MachineAsset;
  const render = (reduced: boolean) => {
    const config = { ...DEFAULT_WORKSHOP, mode: "education", magnetModel: "generic", machine: COFFEE_ASSEMBLY } as WorkshopConfig;
    return renderToStaticMarkup(
      <MachineGuide
        state={{ ...INITIAL_GUIDE, step: "test" }}
        setState={() => undefined}
        config={config}
        asset={asset}
        tool="navigate"
        setTool={() => undefined}
        onChange={() => undefined}
        history={{ canUndo: false, canRedo: false, undo: () => undefined, redo: () => undefined }}
        sample={simulateCycle(config).samples[0]!}
        progress={0}
        setProgress={() => undefined}
        playing={false}
        setPlaying={() => undefined}
        reason={null}
        onDemo={() => undefined}
        reduced={reduced}
      />,
    );
  };
  test("lecture automatique désactivée, pas manuel conservé", () => {
    const html = render(true);
    expect(html).toMatch(/data-testid="guide-play"[^>]*disabled/);
    expect(html).toContain('data-testid="guide-reduced"');
    expect(html).toContain("Avancer d&#x27;un pas");
  });
  test("sans mouvement réduit, la lecture reste disponible", () => {
    expect(render(false)).not.toMatch(/data-testid="guide-play"[^>]*disabled/);
  });
});
