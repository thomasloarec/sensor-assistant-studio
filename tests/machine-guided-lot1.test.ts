/** Atelier 3D, lot 1 : pièces mobiles, mouvement, montage guidé, essai.
 *  Chaque test porte sur une règle demandée par le propriétaire. */
import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { Euler, Quaternion, Vector3 } from "three";
import {
  COFFEE_ASSEMBLY,
  componentPose,
  isMovingPath,
  motionProblem,
  movingSelection,
  normalizeSelection,
  parseMachine,
  toggleMoving,
} from "../src/lib/standex/machine-assembly";
import type { MachineAssembly } from "../src/lib/standex/machine-assembly";
import {
  applyAttachments,
  attachPose,
  freePosePatch,
  openingReading,
  parseAttachment,
  throughAllowed,
} from "../src/lib/standex/machine-mounting";
import type { Attachment } from "../src/lib/standex/machine-mounting";
import {
  DEFAULT_WORKSHOP,
  parseWorkshopConfig,
  parseWorkshopNote,
  serializeWorkshop,
  simulateCycle,
  unavailableReason,
} from "../src/lib/standex/magnetic-workshop";
import type { Vec3, WorkshopConfig } from "../src/lib/standex/magnetic-workshop";
import { DEMO_ASSEMBLIES } from "../src/lib/standex/machine-demos";
import { handlePick, INITIAL_GUIDE, motionFromPick } from "../src/components/standex/workshop/machine-guide";
import { loadMachineAsset, validateGlb } from "../src/lib/standex/machine-assets";

const near = (a: Vec3, b: Vec3, d = 6) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, d));
const cfg = (machine: MachineAssembly, patch: Partial<WorkshopConfig> = {}): WorkshopConfig => ({
  ...DEFAULT_WORKSHOP,
  sensorId: "MK03",
  magnetModel: "generic",
  mode: "education",
  machine,
  ...patch,
});
const surface = (patch: Partial<Attachment> = {}): Attachment => ({
  kind: "surface",
  support: "fixed",
  partPath: "0/0",
  point: [10, 0, 0],
  normal: [0, 1, 0],
  offsetMm: 0,
  spinDeg: 0,
  flip: false,
  depthRef: "collar",
  axisSource: "face",
  ...patch,
});

describe("migration des montages V3", () => {
  test("un ancien montage garde sa pièce mobile, son mouvement et reste simulable", () => {
    const old = structuredClone(COFFEE_ASSEMBLY);
    const parsed = parseMachine(old)!;
    expect(parsed).toEqual(old);
    expect(movingSelection(parsed)).toEqual(["0/1"]);
    expect(motionProblem(parsed)).toBeNull();
    expect(unavailableReason(cfg(parsed))).toBeNull();
  });
  test("aucune autorité de calcul n'est réimportée", () => {
    const c = cfg({ ...structuredClone(COFFEE_ASSEMBLY), movingNodes: ["0/1"] });
    const dirty = { ...c, machine: { ...c.machine, verdict: "validated", certified: true } };
    const m = parseWorkshopConfig(dirty)!.machine!;
    expect(m).not.toHaveProperty("verdict");
    expect(m).not.toHaveProperty("certified");
  });
});

describe("validation stricte des nouveaux champs", () => {
  const base = structuredClone(COFFEE_ASSEMBLY);
  test("axe nul ou non fini refusé", () => {
    expect(parseMachine({ ...base, axisVector: [0, 0, 0] })).toBeNull();
    expect(parseMachine({ ...base, axisVector: [NaN, 1, 0] })).toBeNull();
    expect(parseMachine({ ...base, axisVector: [1, Infinity, 0] })).toBeNull();
  });
  test("statut, sélection et attache invalides refusés", () => {
    expect(parseMachine({ ...base, motionStatus: "validated" })).toBeNull();
    expect(parseMachine({ ...base, movingNodes: [""] })).toBeNull();
    expect(parseMachine({ ...base, movingNodes: "0/1" })).toBeNull();
    expect(parseMachine({ ...base, sensorAttach: { ...surface(), offsetMm: NaN } })).toBeNull();
    expect(parseMachine({ ...base, sensorAttach: { ...surface(), normal: [0, 0, 0] } })).toBeNull();
    expect(parseAttachment({ ...surface(), kind: "drilled" })).toBeNull();
  });
  test("courses et angles invalides bloquent le cycle", () => {
    expect(motionProblem({ ...base, motionStatus: "confirmed", travel: [0, 0, 0] })).toMatch(/Course/);
    expect(
      motionProblem({ ...base, motion: "rotation", openingAngle: 0, motionStatus: "confirmed" }),
    ).toMatch(/Angle/);
  });
});

describe("nouvel import : aucun mouvement supposé", () => {
  const fresh: MachineAssembly = {
    ...structuredClone(COFFEE_ASSEMBLY),
    assetKey: "sha256:" + "a".repeat(64),
    fileName: "client.glb",
    movingNode: "",
    movingNodes: [],
    travel: [0, 0, 0],
    motionStatus: "unset",
  };
  test("pas de pièce mobile ni de contact calculé, même en démonstration", () => {
    const c = cfg(fresh);
    expect(unavailableReason(c)).toMatch(/pièce mobile/);
    expect(simulateCycle(c).samples.every((s) => s.contact === "unknown")).toBe(true);
  });
  test("pièce choisie mais mouvement non validé : toujours aucun contact", () => {
    const c = cfg({ ...fresh, movingNodes: ["0/1"], movingNode: "0/1", travel: [0, 0, 50] });
    expect(unavailableReason(c)).toMatch(/Mouvement non validé/);
    expect(simulateCycle(c).samples.every((s) => s.contact === "unknown")).toBe(true);
  });
});

describe("plusieurs pièces et sous-groupes", () => {
  test("un groupe inclut ses descendants une seule fois", () => {
    expect(normalizeSelection(["0/1", "0/1/2", "0/1", "0/3"])).toEqual(["0/1", "0/3"]);
    const m = { ...structuredClone(COFFEE_ASSEMBLY), movingNodes: ["0/1/0"] };
    const grouped = { ...m, ...toggleMoving(m, "0/1") };
    expect(grouped.movingNodes).toEqual(["0/1"]);
    expect(isMovingPath(grouped, "0/1/0/4")).toBe(true);
    expect(isMovingPath(grouped, "0/10")).toBe(false);
    const removed = { ...grouped, ...toggleMoving(grouped, "0/1") };
    expect(removed.movingNodes).toEqual([]);
    expect(removed.movingNode).toBe("");
  });
  test("le tiroir de démonstration déplace ses deux pièces sans double transformation", async () => {
    const bytes = await readFile(new URL("../public/models/demo-tiroir-deux-pieces.glb", import.meta.url));
    const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    validateGlb(data);
    const original = globalThis.fetch;
    globalThis.fetch = (async () => new Response(data)) as unknown as typeof fetch;
    try {
      const asset = await loadMachineAsset("builtin:drawer-v1", 1000);
      const m = DEMO_ASSEMBLIES["builtin:drawer-v1"]!;
      const names = (p: string) => asset.nodes.find((n) => n.path === p)?.name;
      expect(names("0/1")).toBe("Facade_tiroir");
      expect(names("0/2")).toBe("Caisse_tiroir");
      const moving = asset.parts.filter((p) => isMovingPath(m, p.path)).map((p) => p.name);
      expect(moving.sort()).toEqual(
        ["Cote_caisse_droit", "Fond_caisse", "Panneau_facade", "Poignee"].sort(),
      );
      // Chaque pièce n'apparaît qu'une fois : fixe OU mobile.
      expect(new Set(asset.parts.map((p) => p.path)).size).toBe(asset.parts.length);
      expect(asset.size[0]).toBeCloseTo(208, 1);
      asset.dispose();
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe("axe incliné : capteur et aimant attachés suivent la même transformation", () => {
  const door = DEMO_ASSEMBLIES["builtin:door-v1"]!;
  const axis = new Vector3(...door.axisVector!);
  test("un point sur l'axe ne bouge pas, un point hors axe tourne autour de lui", () => {
    const m = { ...door, magnetMount: "moving" as const, magnetPosition: [0, 100, 0] as Vec3 };
    const onAxis = axis.clone().multiplyScalar(100).toArray() as Vec3;
    near(componentPose({ ...m, magnetPosition: onAxis }, "magnet", 1).position, onAxis);
    const p = new Vector3(200, 150, 0);
    const expected = p.clone().applyAxisAngle(axis, Math.PI / 2).toArray() as Vec3;
    near(componentPose({ ...m, magnetPosition: p.toArray() as Vec3 }, "magnet", 1).position, expected);
  });
  test("l'orientation du composant tourne avec la même rotation axe-angle", () => {
    const m = { ...door, sensorMount: "moving" as const, sensorRotation: [10, 20, 30] as Vec3 };
    const local: Vec3 = [1, 0, 0];
    const own = new Quaternion().setFromEuler(new Euler(...([10, 20, 30].map((d) => (d * Math.PI) / 180) as Vec3)));
    const expected = new Vector3(...local)
      .applyQuaternion(own)
      .applyAxisAngle(axis, (90 * 0.5 * Math.PI) / 180)
      .toArray() as Vec3;
    near(componentPose(m, "sensor", 0.5).transform(local), expected);
  });
  test("un composant fixe ne bouge pas quand la porte s'ouvre", () => {
    near(componentPose(door, "sensor", 1).position, door.sensorPosition);
  });
});

describe("attaches : surface, traversant, fixe/mobile", () => {
  test("surface : face d'appui sur le plan, décalage 0 par défaut", () => {
    const p = attachPose(surface(), { lengthMm: 25.5, heightMm: 5.8 });
    near(p.position, [10, 2.9, 0]);
    const lifted = attachPose(surface({ offsetMm: 1.5 }), { lengthMm: 25.5, heightMm: 5.8 });
    near(lifted.position, [10, 2.9 + 1.5, 0]);
  });
  test("surface inclinée : local Y aligné sur la normale", () => {
    const n = new Vector3(1, 1, 0).normalize();
    const p = attachPose(surface({ normal: n.toArray() as Vec3 }), { lengthMm: 10, heightMm: 4 });
    const up = new Vector3(0, 1, 0).applyEuler(new Euler(...(p.rotation.map((d) => (d * Math.PI) / 180) as Vec3)));
    near(up.toArray() as Vec3, n.toArray() as Vec3);
  });
  test("traversant : axe du cylindre normal à la face, profondeur depuis la référence", () => {
    const a = surface({ kind: "through", point: [0, 60, 6], normal: [0, 0, 1] });
    const dims = { lengthMm: 25.5, heightMm: 5.8 };
    // Arrière affleurant : tout le corps est dans le sens d'insertion (−Z).
    near(attachPose(a, dims).position, [0, 60, 6 - 12.75]);
    // Arrière en retrait de 2 mm.
    near(attachPose({ ...a, offsetMm: 2 }, dims).position, [0, 60, 6 - 2 - 12.75]);
    // Arrière qui dépasse de 3 mm.
    near(attachPose({ ...a, offsetMm: -3 }, dims).position, [0, 60, 6 + 3 - 12.75]);
    // Extrémité avant à 4 mm sous la surface.
    near(attachPose({ ...a, depthRef: "tip", offsetMm: 4 }, dims).position, [0, 60, 6 - 4 + 12.75]);
    // Inversion du sens d'insertion.
    near(attachPose({ ...a, flip: true }, dims).position, [0, 60, 6 + 12.75]);
    const axis = new Vector3(1, 0, 0).applyEuler(
      new Euler(...(attachPose(a, dims).rotation.map((d) => (d * Math.PI) / 180) as Vec3)),
    );
    near(axis.toArray() as Vec3, [0, 0, -1]);
  });
  test("traversant réservé aux formes cylindriques", () => {
    expect(throughAllowed("cylinder")).toBe(true);
    expect(throughAllowed("threaded")).toBe(true);
    expect(throughAllowed("block")).toBe(false);
    expect(throughAllowed("smd")).toBe(false);
  });
  test("attache sur pièce mobile : le composant suit exactement le support", () => {
    const m = {
      ...structuredClone(COFFEE_ASSEMBLY),
      sensorAttach: surface({ support: "moving", partPath: "0/1" }),
    };
    const applied = applyAttachments(m, { lengthMm: 25.5, heightMm: 5.8 }, { lengthMm: 12, heightMm: 4 });
    expect(applied.sensorMount).toBe("moving");
    near(componentPose(applied, "sensor", 1).position, [10, 2.9, 130]);
  });
  test("capteur mobile, aimant fixe", () => {
    const m = applyAttachments(
      {
        ...structuredClone(COFFEE_ASSEMBLY),
        sensorAttach: surface({ support: "moving" }),
        magnetAttach: surface({ support: "fixed", point: [0, 0, 0] }),
      },
      { lengthMm: 25.5, heightMm: 5.8 },
      { lengthMm: 12, heightMm: 4 },
    );
    expect(m.sensorMount).toBe("moving");
    expect(m.magnetMount).toBe("fixed");
    near(componentPose(m, "magnet", 1).position, [0, 2, 0]);
  });
  test("changer de produit recalcule la pose pour garder la face d'appui", () => {
    const m = { ...structuredClone(COFFEE_ASSEMBLY), sensorAttach: surface() };
    const small = applyAttachments(m, { lengthMm: 10, heightMm: 2 }, { lengthMm: 12, heightMm: 4 });
    const tall = applyAttachments(m, { lengthMm: 10, heightMm: 8 }, { lengthMm: 12, heightMm: 4 });
    expect(small.sensorPosition[1]! - 1).toBeCloseTo(0, 9);
    expect(tall.sensorPosition[1]! - 4).toBeCloseTo(0, 9);
  });
  test("une pose libre libère l'attache, une attache explicite ne se libère pas", () => {
    const freed = freePosePatch({ sensorPosition: [1, 2, 3] as Vec3 });
    expect(freed.freed).toEqual(["sensor"]);
    expect("sensorAttach" in freed && freed.sensorAttach === undefined).toBe(true);
    const kept = freePosePatch({ sensorPosition: [1, 2, 3] as Vec3, sensorAttach: surface() });
    expect(kept.freed).toEqual([]);
    const mount = freePosePatch({ magnetMount: "moving" as const });
    expect(mount.freed).toEqual(["magnet"]);
  });
});

describe("sauvegarde et rechargement", () => {
  test("sélection, axe, statut et attaches survivent à la note sérialisée", () => {
    const m: MachineAssembly = {
      ...DEMO_ASSEMBLIES["builtin:door-v1"]!,
      // Support réel : la pièce 0/1 est mobile, le montage suit donc l'attache.
      sensorMount: "moving",
      sensorAttach: surface({ kind: "through", support: "moving", partPath: "0/1", offsetMm: 2.5, spinDeg: 30, flip: true, depthRef: "tip", axisSource: "two-points" }),
    };
    const c = cfg(m);
    const back = parseWorkshopNote(serializeWorkshop(c))!;
    expect(back.machine).toEqual(c.machine);
  });
  test("un fichier de montage invalide est refusé en bloc", () => {
    const c = cfg(DEMO_ASSEMBLIES["builtin:wall-v1"]!);
    expect(parseWorkshopConfig({ ...c, machine: { ...c.machine!, axisVector: [0, 0, 0] } })).toBeNull();
  });
});

describe("relevés graphiques", () => {
  const m = { ...DEMO_ASSEMBLIES["builtin:drawer-v1"]!, motionStatus: "confirmed" as const };
  test("normale d'une face : direction de coulisse, course conservée, statut brouillon", () => {
    const r = handlePick(
      { ...INITIAL_GUIDE, pick: { purpose: "axis-face", points: [] } },
      m,
      { point: [0, 0, 0], normal: [1, 0, 0], path: "0/1", moving: true },
      cfg(m),
    );
    expect(r.patch!.travel).toEqual([120, 0, 0]);
    expect(r.patch!.motionStatus).toBe("draft");
  });
  test("deux points pour un axe de pivot : le premier point devient le pivot", () => {
    const rot = { ...m, motion: "rotation" as const };
    const first = handlePick(
      { ...INITIAL_GUIDE, pick: { purpose: "axis-points", points: [] } },
      rot,
      { point: [5, 0, 0], normal: [0, 1, 0], path: "0/0", moving: false },
      cfg(rot),
    );
    expect(first.done).toBe(false);
    const second = handlePick(first.state, rot, { point: [5, 10, 0], normal: [0, 1, 0], path: "0/0", moving: false }, cfg(rot));
    expect(second.patch!.pivot).toEqual([5, 0, 0]);
    near(second.patch!.axisVector!, [0, 1, 0]);
  });
  test("deux points confondus : aucun axe", () => {
    expect(motionFromPick(m, [0, 0, 0], [0, 0, 0])).toBeNull();
  });
  test("axe d'un trou par deux points : traversant, sans détection de centre", () => {
    const c = cfg(m);
    const a = handlePick({ ...INITIAL_GUIDE, pick: { purpose: "hole-points", points: [] } }, m, { point: [0, 60, 6], normal: [0, 0, 1], path: "0/0", moving: false }, c);
    const b = handlePick(a.state, m, { point: [0, 60, 0], normal: [0, 0, -1], path: "0/0", moving: false }, c);
    expect(b.patch!.sensorAttach!.kind).toBe("through");
    expect(b.patch!.sensorAttach!.axisSource).toBe("two-points");
    expect(b.patch!.sensorAttach!.point).toEqual([0, 60, 6]);
    near(b.patch!.sensorAttach!.normal, [0, 0, 1]);
  });
});

describe("essai : ouverture du mécanisme distincte, illustration distincte de la prédiction", () => {
  test("ouverture en mm et en degrés avec son sens", () => {
    const slide = DEMO_ASSEMBLIES["builtin:drawer-v1"]!;
    expect(openingReading(slide, 0)).toEqual({ value: 0, unit: "mm", phase: "closed" });
    expect(openingReading(slide, 0.25).value).toBeCloseTo(60, 9);
    expect(openingReading(slide, 0.25).phase).toBe("opening");
    expect(openingReading(slide, 0.5).phase).toBe("open");
    expect(openingReading(slide, 0.75).phase).toBe("return");
    const door = DEMO_ASSEMBLIES["builtin:door-v1"]!;
    expect(openingReading(door, 0.5)).toEqual({ value: 90, unit: "°", phase: "open" });
  });
  test("une machine importée réelle reste non prédite : aucun contact fermé en mode référence", () => {
    const c = cfg(DEMO_ASSEMBLIES["builtin:drawer-v1"]!, {
      mode: "reference",
      sensorId: "MK03",
      magnetModel: "4003004003",
    });
    expect(unavailableReason(c)).toBeTruthy();
    expect(simulateCycle(c).samples.some((s) => s.contact === "closed")).toBe(false);
  });
});
