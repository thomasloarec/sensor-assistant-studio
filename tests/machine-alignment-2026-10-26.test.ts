/** Atelier 3D — centrage dans un trou, alignement de l'aimant, position précise.
 *  Chaque test porte sur une règle demandée par le propriétaire le 26/10/2026. */
import { afterEach, describe, expect, test } from "bun:test";
import { Quaternion, Vector3 } from "three";
import {
  COFFEE_ASSEMBLY,
  componentPose,
  cycleU,
  parseMachine,
  partDelta,
  pointAt,
  syncAttachSupports,
} from "../src/lib/standex/machine-assembly";
import type { MachineAssembly } from "../src/lib/standex/machine-assembly";
import { applyAttachments, attachPose, parseAttachment } from "../src/lib/standex/machine-mounting";
import type { Attachment } from "../src/lib/standex/machine-mounting";
import {
  alignMagnetToSensor,
  faceTangents,
  holeCentreAttach,
  projectOntoFace,
  rayPlane,
  shiftAlongFace,
} from "../src/lib/standex/machine-alignment";
import {
  DEFAULT_WORKSHOP,
  parseWorkshopConfig,
  parseWorkshopNote,
  serializeWorkshop,
} from "../src/lib/standex/magnetic-workshop";
import type { Vec3, WorkshopConfig } from "../src/lib/standex/magnetic-workshop";
import {
  attachPatch,
  dimsFor,
  guideStepState,
  handleHoleRay,
  handlePick,
  INITIAL_GUIDE,
} from "../src/components/standex/workshop/machine-guide";
import type { GuideState } from "../src/components/standex/workshop/machine-guide";
import type { SceneHit } from "../src/components/standex/workshop/machine-scene";
import { registerAnimation } from "../src/lib/standex/machine-clip-registry";

const near = (a: readonly number[], b: readonly number[], d = 6) =>
  a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, d));
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unitV = (v: Vec3): Vec3 => new Vector3(...v).normalize().toArray() as Vec3;

const unregisters: (() => void)[] = [];
afterEach(() => {
  while (unregisters.length) unregisters.pop()!();
});

const surface = (patch: Partial<Attachment> = {}): Attachment => ({
  kind: "surface",
  support: "fixed",
  partPath: "0/0",
  point: [0, 0, 0],
  normal: [0, 1, 0],
  offsetMm: 0,
  spinDeg: 0,
  flip: false,
  depthRef: "collar",
  axisSource: "face",
  ...patch,
});
/** MK24-A-J (non cylindrique) par défaut : l'alignement n'est pas réservé aux cylindres. */
const cfg = (machine: MachineAssembly, sensorId = "MK24-A-J"): WorkshopConfig => ({
  ...DEFAULT_WORKSHOP,
  sensorId,
  magnetModel: "generic",
  mode: "education",
  machine,
});
function settle(m: MachineAssembly, sensorId = "MK24-A-J"): MachineAssembly {
  const c = cfg(m, sensorId);
  return applyAttachments(syncAttachSupports(m), dimsFor(c, "sensor"), dimsFor(c, "magnet"));
}
/** Pivot quelconque : pièce « 0/1 » mobile, axe incliné, pivot hors origine. */
function pivotMachine(magnet: Attachment, sensor?: Attachment): MachineAssembly {
  return settle({
    ...structuredClone(COFFEE_ASSEMBLY),
    assetKey: "sha256:" + "a".repeat(64),
    movingNode: "0/1",
    movingNodes: ["0/1"],
    motion: "rotation",
    pivot: [-20, 5, 3],
    axisVector: unitV([0.3, 1, 0.2]),
    openingAngle: 70,
    motionStatus: "confirmed",
    sensorPosition: [12, 30, 4],
    sensorRotation: [0, 0, 0],
    magnetAttach: magnet,
    ...(sensor ? { sensorAttach: sensor } : {}),
  });
}
/** Vérifie qu'à l'instant u le centre de l'aimant est la projection du centre
 *  du capteur sur le plan de pose (aucun écart tangent restant). */
function expectAligned(m: MachineAssembly, u: number) {
  const s = componentPose(m, "sensor", u).position;
  const c = componentPose(m, "magnet", u).position;
  const d = partDelta(m, m.magnetAttach!.partPath, u);
  const n = d
    ? (new Vector3(...m.magnetAttach!.normal).applyQuaternion(new Quaternion(...d.quaternion)).toArray() as Vec3)
    : m.magnetAttach!.normal;
  const g = sub(s, c);
  const tangent = sub(g, n.map((v) => v * dot(g, n)) as Vec3);
  expect(Math.hypot(...tangent)).toBeLessThan(1e-6);
}
function align(m: MachineAssembly, u: number): MachineAssembly {
  const r = alignMagnetToSensor(m, u);
  if (!r.ok) throw new Error(r.reason);
  return settle({ ...m, ...attachPatch("magnet", r.attach, cfg(m)) });
}

describe("Centrer dans un trou : rayon/plan sur la face verrouillée", () => {
  const wall = (n: Vec3 = [0, 0, 1], path = "0/0", moving = false) => ({
    path,
    moving,
    point: [5, 0, 0] as Vec3,
    normal: unitV(n),
  });
  const fixed = settle({ ...structuredClone(COFFEE_ASSEMBLY), assetKey: "sha256:hole", motion: "translation", travel: [0, 0, 0] }, "MK03");

  test("clic dans le vide du trou : centre dans le plan, même si un objet est derrière", () => {
    // Le rayon traverse le trou (aucune matière) ; une pièce « 0/9 » est derrière.
    const r = holeCentreAttach(fixed, wall(), { origin: [1, 2, 100], direction: [0, 0, -1] }, 0, undefined);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    near(r.attach.point, [1, 2, 0]);
    expect(r.attach.partPath).toBe("0/0");
    expect(r.attach.support).toBe("fixed");
    near(r.attach.normal, [0, 0, 1]);
    expect(r.attach.axisSource).toBe("plane-centre");
  });

  test("parcours guidé : le premier clic ne modifie rien, le second garde SON support", () => {
    const c = cfg(fixed, "MK03");
    const start: GuideState = { ...INITIAL_GUIDE, step: "install", pick: { purpose: "hole-centre", points: [] } };
    const first: SceneHit = { point: [5, 0, 0], normal: [0, 0, 1], path: "0/0", moving: false, group: "fixed" };
    const a = handlePick(start, fixed, first, c);
    expect(a.patch).toBeNull();
    expect(a.done).toBe(false);
    expect(a.state.pick?.plane?.path).toBe("0/0");
    // Un clic de matière sur une autre pièce n'est pas relevé une seconde fois.
    const again = handlePick(a.state, fixed, { ...first, path: "0/9" }, c);
    expect(again.patch).toBeNull();
    expect(again.state.pick?.plane?.path).toBe("0/0");
    const b = handleHoleRay(a.state, fixed, { origin: [0, 0, 50], direction: [0, 0, -1] }, 0, c);
    expect(b.done).toBe(true);
    expect(b.state.pick).toBeNull();
    expect(b.patch?.sensorAttach?.partPath).toBe("0/0");
    near(b.patch!.sensorAttach!.point, [0, 0, 0]);
  });

  test("plan incliné : point exactement dans le plan statique", () => {
    const p = wall([0, 1, 1]);
    const r = holeCentreAttach(fixed, p, { origin: [3, 40, 40], direction: [0, -1, -1] }, 0, undefined);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Math.abs(dot(sub(r.attach.point, p.point), p.normal))).toBeLessThan(1e-9);
  });

  test("rayon parallèle ou plan derrière la caméra : refus utile, aucune mutation", () => {
    const c = cfg(fixed, "MK03");
    const state: GuideState = {
      ...INITIAL_GUIDE,
      pick: { purpose: "hole-centre", points: [], plane: wall() },
    };
    const par = handleHoleRay(state, fixed, { origin: [0, 0, 10], direction: [1, 0, 0] }, 0, c);
    expect(par.patch).toBeNull();
    expect(par.state.notice).toContain("parallèle");
    expect(par.state.pick?.plane).toBeDefined();
    const behind = rayPlane([0, 0, 10], [0, 0, 1], [0, 0, 0], [0, 0, 1]);
    expect(behind.ok).toBe(false);
  });

  test("annulation : changer d'étape efface la sélection temporaire sans patch", () => {
    const state: GuideState = { ...INITIAL_GUIDE, step: "install", pick: { purpose: "hole-centre", points: [], plane: wall() } };
    expect(guideStepState(state, "test").pick).toBeNull();
  });

  test("support mobile à mi-course : le centre est reconverti en pose statique", () => {
    const m = pivotMachine(surface({ partPath: "0/1", support: "moving" }));
    const u = 0.5;
    const restPlane = wall([0, 0, 1], "0/1", true);
    const restTarget: Vec3 = [2, -3, 0];
    const shown = pointAt(m, "0/1", restTarget, u);
    const d = partDelta(m, "0/1", u)!;
    const nShown = new Vector3(0, 0, 1).applyQuaternion(new Quaternion(...d.quaternion)).toArray() as Vec3;
    const origin = shown.map((v, i) => v + nShown[i]! * 80) as Vec3;
    const r = holeCentreAttach(m, restPlane, { origin, direction: nShown.map((v) => -v) as Vec3 }, u, undefined);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    near(r.attach.point, restTarget);
    expect(r.attach.support).toBe("moving");
  });

  test("relecture : la source « centre désigné » survit au JSON", () => {
    const a = surface({ kind: "through", axisSource: "plane-centre" });
    expect(parseAttachment(JSON.parse(JSON.stringify(a)))?.axisSource).toBe("plane-centre");
  });
});

describe("Aligner l'aimant avec le capteur", () => {
  test("plan principal fixe : seuls X/Z du point bougent, Y de la face conservé", () => {
    const m = settle({
      ...structuredClone(COFFEE_ASSEMBLY),
      assetKey: "sha256:a1",
      magnetMount: "fixed",
      magnetAttach: surface({ point: [80, 74, 60], offsetMm: 1.5, spinDeg: 25, flip: true }),
    });
    const r = alignMagnetToSensor(m, 0);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const before = m.magnetAttach!;
    expect(r.attach.point[1]).toBeCloseTo(before.point[1], 9);
    expect(r.attach.point[0]).toBeCloseTo(m.sensorPosition[0], 6);
    expect(r.attach.point[2]).toBeCloseTo(m.sensorPosition[2], 6);
    for (const k of ["partPath", "support", "normal", "offsetMm", "spinDeg", "flip", "kind"] as const)
      expect(r.attach[k]).toEqual(before[k]);
  });

  test("face inclinée avec écart, rotation et retournement conservés", () => {
    const n = unitV([0, 1, 1]);
    const m = settle({
      ...structuredClone(COFFEE_ASSEMBLY),
      assetKey: "sha256:a2",
      magnetAttach: surface({ point: [70, 60, 50], normal: n, offsetMm: 2, spinDeg: -40, flip: true }),
    });
    const a = align(m, 0);
    expectAligned(a, 0);
    expect(a.magnetAttach!.offsetMm).toBe(2);
    expect(a.magnetAttach!.spinDeg).toBe(-40);
    expect(a.magnetAttach!.flip).toBe(true);
    // Le déplacement est purement tangent : distance au plan d'origine nulle.
    expect(Math.abs(dot(sub(a.magnetAttach!.point, m.magnetAttach!.point), n))).toBeLessThan(1e-9);
  });

  test("pivot arbitraire, action à mi-course : aligné à u, suivi intact aux autres temps", () => {
    const m = pivotMachine(surface({ partPath: "0/1", support: "moving", point: [30, 10, -5], normal: unitV([1, 0.2, 0.1]), offsetMm: 0.8, spinDeg: 12 }));
    const u = cycleU(m, 0.3);
    const a = align(m, u);
    expectAligned(a, u);
    expect(a.magnetAttach!.support).toBe("moving");
    expect(a.magnetMount).toBe("moving");
    // Aux autres instants l'aimant suit exactement la pièce : sa pose est celle
    // du point de repos transformé, comme avant l'alignement.
    for (const t of [0, 0.1, 0.5, 0.8]) {
      const uu = cycleU(a, t);
      near(componentPose(a, "magnet", uu).position, pointAt(a, "0/1", a.magnetPosition, uu));
    }
  });

  test("capteur traversant oblique : centrage par projection signalé, pas de coaxialité", () => {
    const sensor = surface({ kind: "through", point: [12, 30, 4], normal: unitV([1, 1, 0]) });
    const m = settle(
      {
        ...pivotMachine(surface({ partPath: "0/1", support: "moving", point: [30, 10, -5], normal: [0, 1, 0] })),
        sensorAttach: sensor,
      },
      "MK03",
    );
    const r = alignMagnetToSensor(m, 0);
    expect(r.ok && r.oblique).toBe(true);
  });

  test("clip rigide : capteur et aimant sur deux supports animés différemment", () => {
    const qOf = (deg: number) =>
      new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), (deg * Math.PI) / 180).toArray() as [number, number, number, number];
    const m0: MachineAssembly = {
      ...structuredClone(COFFEE_ASSEMBLY),
      assetKey: "sha256:clip-align",
      motionSource: "clip",
      clip: { index: 0, name: "Bras", duration: 2 },
      magnetAttach: surface({ partPath: "arm", support: "moving", point: [40, 0, 0], normal: [0, 1, 0], offsetMm: 1 }),
      sensorAttach: surface({ partPath: "slide", support: "moving", point: [0, 30, 0], normal: [0, -1, 0] }),
    };
    unregisters.push(
      registerAnimation(m0.assetKey, m0.unitScale, {
        clips: [{ index: 0, name: "Bras", duration: 2, trackCount: 2, supported: true, issues: [], animatedPaths: ["arm", "slide"] }],
        sampler: () => ({
          index: 0,
          name: "Bras",
          duration: 2,
          affects: (p) => p === "arm" || p === "slide",
          groupOf: (p) => p,
          deltaAt: (p, time) =>
            p === "arm"
              ? { position: [0, 0, 0], quaternion: qOf(30 * time) }
              : p === "slide"
                ? { position: [10 * time, 0, 0], quaternion: [0, 0, 0, 1] }
                : null,
        }),
      }),
    );
    const m = settle(m0);
    const a = align(m, 0.5);
    expectAligned(a, 0.5);
    expect(a.magnetAttach!.partPath).toBe("arm");
    for (const uu of [0, 0.25, 1])
      near(componentPose(a, "magnet", uu).position, pointAt(a, "arm", a.magnetPosition, uu));
  });

  test("refus clair sans attache de surface", () => {
    const m = settle({ ...structuredClone(COFFEE_ASSEMBLY), assetKey: "sha256:a3" });
    const r = alignMagnetToSensor(m, 0);
    expect(r.ok).toBe(false);
  });

  test("annuler/rétablir et relecture : l'alignement est un seul patch réversible qui survit au JSON", () => {
    const m = pivotMachine(surface({ partPath: "0/1", support: "moving", point: [30, 10, -5] }));
    const a = align(m, 0.4);
    // Annuler = revenir au montage précédent (pile d'historique) : rien d'autre n'a changé.
    const { magnetAttach: _a, magnetPosition: _p, magnetRotation: _r, ...restA } = a;
    const { magnetAttach: _b, magnetPosition: _q, magnetRotation: _s, ...restM } = m;
    expect(restA).toEqual(restM);
    const c = cfg(a);
    const back = parseWorkshopConfig(parseWorkshopNote(serializeWorkshop(c))!);
    expect(back?.machine?.magnetAttach).toEqual(a.magnetAttach);
    expect(parseMachine(JSON.parse(JSON.stringify(a)))?.magnetAttach?.point).toEqual(a.magnetAttach!.point);
  });
});

describe("Position précise", () => {
  test("deux directions tangentes orthonormées, perpendiculaires à la face", () => {
    for (const n of [[0, 1, 0], [1, 0, 0], unitV([0.3, 0.4, 0.9])] as Vec3[]) {
      const [t1, t2] = faceTangents(n);
      expect(Math.abs(dot(t1, n))).toBeLessThan(1e-9);
      expect(Math.abs(dot(t2, n))).toBeLessThan(1e-9);
      expect(Math.abs(dot(t1, t2))).toBeLessThan(1e-9);
    }
  });
  test("déplacement et XYZ saisis restent sur la face conservée", () => {
    const a = surface({ normal: unitV([0, 1, 1]), point: [1, 2, 3], offsetMm: 2 });
    const s = shiftAlongFace(a, 3, -1);
    expect(Math.abs(dot(sub(s.point, a.point), a.normal))).toBeLessThan(1e-9);
    const p = projectOntoFace(a, [10, 20, 30]);
    expect(Math.abs(dot(sub(p.point, a.point), a.normal))).toBeLessThan(1e-9);
    expect(p.offsetMm).toBe(2);
    expect(p.partPath).toBe(a.partPath);
    // La pose qui en découle garde son écart à la face.
    const pose = attachPose(p, { lengthMm: 10, heightMm: 4 });
    expect(dot(sub(pose.position, p.point), a.normal)).toBeCloseTo(4, 9);
  });
});
