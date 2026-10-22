/** Lot 2 : relecture des animations d'un GLB et mesure entre repères.
 *
 *  Les attentes de pose sont recalculées INDÉPENDAMMENT par composition des
 *  matrices locales écrites dans le générateur (portique incliné, chariot,
 *  bras), et non par les fonctions testées. */
import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AnimationClip,
  Bone,
  Euler,
  Group,
  Matrix4,
  Mesh,
  BoxGeometry,
  NumberKeyframeTrack,
  Quaternion,
  QuaternionKeyframeTrack,
  Vector3,
  VectorKeyframeTrack,
} from "three";
import type { Object3D } from "three";
import { parseMachineAsset } from "../src/lib/standex/machine-assets";
import type { MachineAsset } from "../src/lib/standex/machine-assets";
import { analyzeAnimations } from "../src/lib/standex/machine-animation";
import { registerAnimation } from "../src/lib/standex/machine-clip-registry";
import {
  COFFEE_ASSEMBLY,
  componentPose,
  cycleU,
  markerReading,
  motionProblem,
  movePoint,
  openingAt,
  partGroup,
  pointAt,
  toRest,
} from "../src/lib/standex/machine-assembly";
import type { MachineAssembly } from "../src/lib/standex/machine-assembly";
import { DEMO_ASSEMBLIES } from "../src/lib/standex/machine-demos";
import {
  DEFAULT_WORKSHOP,
  WORKSHOP_IMPORT_LIMIT,
  parseWorkshopConfig,
  poseAt,
  simulateCycle,
  summarizeWorkshop,
  unavailableReason,
  workshopExportJson,
} from "../src/lib/standex/magnetic-workshop";
import type { Vec3, WorkshopConfig } from "../src/lib/standex/magnetic-workshop";
import MachineGuide, { INITIAL_GUIDE, handlePick } from "../src/components/standex/workshop/machine-guide";
import type { GuideState } from "../src/components/standex/workshop/machine-guide";

const file = (name: string) => {
  const b = readFileSync("public/models/" + name);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
const arm = () => parseMachineAsset(file("demo-bras-anime.glb"), 1000);
const unregisters: (() => void)[] = [];
afterEach(() => {
  while (unregisters.length) unregisters.pop()!();
});
async function loaded(): Promise<{ asset: MachineAsset; m: MachineAssembly }> {
  const asset = await arm();
  unregisters.push(registerAnimation("builtin:arm-v1", 1000, asset.animation), asset.dispose);
  return { asset, m: structuredClone(DEMO_ASSEMBLIES["builtin:arm-v1"]!) };
}
const pathOf = (asset: MachineAsset, name: string) => asset.nodes.find((n) => n.name === name)!.path;
const close = (a: Vec3, b: Vec3, eps = 1e-6) => a.forEach((v, i) => expect(Math.abs(v - b[i]!)).toBeLessThan(eps));

/* Pose attendue d'un point local du Levier / de la Plaque, par composition. */
const deg = Math.PI / 180;
const gantry = new Matrix4().compose(
  new Vector3(20, 30, -15),
  new Quaternion().setFromEuler(new Euler(8 * deg, 25 * deg, 0)),
  new Vector3(1, 1, 1),
);
const T = (x: number, y: number, z: number) => new Matrix4().makeTranslation(x, y, z);
const Rz = (a: number) => new Matrix4().makeRotationZ(a * deg);
function leverPoint(x: number, angle: number, local: Vec3): Vec3 {
  // Portique · Chariot(x,12,0) · Bras(0,10,0)·Rz · Levier(0,40,0)
  const m = gantry.clone().multiply(T(x, 12, 0)).multiply(T(0, 10, 0)).multiply(Rz(angle)).multiply(T(0, 40, 0));
  return new Vector3(...local).applyMatrix4(m).toArray() as Vec3;
}
function plateCenter(x: number): Vec3 {
  return new Vector3(0, 0, 0).applyMatrix4(gantry.clone().multiply(T(x, 12, 0))).toArray() as Vec3;
}
const LOCAL_TIP: Vec3 = [0, 40, 0];
const config = (m: MachineAssembly): WorkshopConfig => ({
  ...DEFAULT_WORKSHOP,
  mode: "education",
  magnetModel: "generic",
  machine: m,
});

describe("lecture des clips d'un GLB", () => {
  test("clips listés avec leur nom exact et leur durée ; échelle refusée", async () => {
    const asset = await arm();
    const clips = asset.animation.clips;
    expect(clips.map((c) => c.name)).toEqual(["Cycle_complet", "Ouverture_seule", "Etirement"]);
    expect(clips.map((c) => c.duration)).toEqual([4, 2, 2]);
    expect(clips.map((c) => c.supported)).toEqual([true, true, false]);
    expect(clips[2]!.issues).toEqual(["scale"]);
    expect(asset.animation.sampler(2)).toBeNull();
    asset.dispose();
  });
  test("noms d'origine conservés, y compris les doublons", async () => {
    const asset = await arm();
    expect(asset.nodes.filter((n) => n.name === "Vis").length).toBe(2);
    asset.dispose();
  });
  test("fichier statique : aucun clip, aucune option d'animation", async () => {
    const asset = await parseMachineAsset(file("demo-tiroir-deux-pieces.glb"), 1000);
    expect(asset.animation.clips).toEqual([]);
    asset.dispose();
  });
  test("chargement annulé : refusé sans résultat", async () => {
    const abort = new AbortController();
    abort.abort();
    await expect(parseMachineAsset(file("demo-bras-anime.glb"), 1000, abort.signal)).rejects.toThrow();
  });
});

describe("clip à t = 0, intermédiaire, fin puis retour à 0", () => {
  test("bras porté par le chariot : translation + rotation combinées sous un parent incliné", async () => {
    const { asset, m } = await loaded();
    const lever = pathOf(asset, "Levier");
    const rest = leverPoint(0, 0, LOCAL_TIP);
    close(pointAt(m, lever, rest, 0), rest);
    close(pointAt(m, lever, rest, 0.125), leverPoint(30, 15, LOCAL_TIP)); // 0,5 s
    close(pointAt(m, lever, rest, 0.25), leverPoint(60, 30, LOCAL_TIP)); // 1 s
    close(pointAt(m, lever, rest, 0.5), leverPoint(120, 60, LOCAL_TIP)); // 2 s
    // Dernière image : le clip contient son retour, pas de saut ni d'aller-retour ajouté.
    close(pointAt(m, lever, rest, 1), rest);
    close(pointAt(m, lever, rest, 0), rest);
    expect(cycleU(m, 0.75)).toBe(0.75);
    expect(cycleU({ ...m, motionSource: "manual" }, 0.75)).toBe(openingAt(0.75));
  });
  test("deux supports animés différemment", async () => {
    const { asset, m } = await loaded();
    const plate = pathOf(asset, "Plaque_chariot"),
      lever = pathOf(asset, "Levier");
    const p0 = plateCenter(0);
    close(pointAt(m, plate, p0, 0.5), plateCenter(120));
    expect(partGroup(m, plate)).not.toBe(partGroup(m, lever));
    expect(partGroup(m, pathOf(asset, "Tete"))).toBe(partGroup(m, lever));
    expect(partGroup(m, pathOf(asset, "Plateau"))).toBe("clip:");
  });
  test("changement de clip : même point au repos, autre chronologie", async () => {
    const { asset, m } = await loaded();
    const lever = pathOf(asset, "Levier");
    const rest = leverPoint(0, 0, LOCAL_TIP);
    const open: MachineAssembly = { ...m, clip: { index: 1, name: "Ouverture_seule", duration: 2 } };
    close(pointAt(open, lever, rest, 1), leverPoint(120, 45, LOCAL_TIP));
    close(pointAt(open, lever, rest, 0), rest);
  });
  test("point relevé en cours de clip ramené à la pose statique", async () => {
    const { asset, m } = await loaded();
    const lever = pathOf(asset, "Levier");
    const rest = leverPoint(0, 0, LOCAL_TIP);
    const shown = pointAt(m, lever, rest, 0.4);
    close(toRest(m, lever, shown, [0, 1, 0], 0.4).point, rest);
  });
});

describe("attaches portées par des pièces animées", () => {
  const attach = (partPath: string, point: Vec3) => ({
    kind: "surface" as const,
    support: "fixed" as const,
    partPath,
    point,
    normal: [0, 1, 0] as Vec3,
    offsetMm: 0,
    spinDeg: 0,
    flip: false,
    depthRef: "collar" as const,
    axisSource: "face" as const,
  });
  test("capteur sur le bras, aimant sur le chariot : chacun suit SON support", async () => {
    const { asset, m } = await loaded();
    const lever = pathOf(asset, "Levier"),
      plate = pathOf(asset, "Plaque_chariot");
    const s0 = leverPoint(0, 0, LOCAL_TIP),
      g0 = plateCenter(0);
    const mm: MachineAssembly = {
      ...m,
      sensorPosition: s0,
      magnetPosition: g0,
      sensorAttach: attach(lever, s0),
      magnetAttach: attach(plate, g0),
    };
    close(componentPose(mm, "sensor", 0.5).position, leverPoint(120, 60, LOCAL_TIP));
    close(componentPose(mm, "magnet", 0.5).position, plateCenter(120));
    // Orientation du capteur : celle du bras (60° autour de Z du portique).
    const x = componentPose(mm, "sensor", 0.5).transform([1, 0, 0]);
    const expected = new Vector3(1, 0, 0)
      .transformDirection(gantry.clone().multiply(Rz(60)))
      .toArray() as Vec3;
    close(x, expected, 1e-9);
  });
  test("inversé : capteur fixe sur le socle, aimant sur le bras", async () => {
    const { asset, m } = await loaded();
    const base = pathOf(asset, "Plateau"),
      lever = pathOf(asset, "Levier");
    const s0: Vec3 = [0, 0, 60],
      g0 = leverPoint(0, 0, LOCAL_TIP);
    const mm: MachineAssembly = {
      ...m,
      sensorPosition: s0,
      magnetPosition: g0,
      sensorAttach: attach(base, s0),
      magnetAttach: attach(lever, g0),
    };
    close(componentPose(mm, "sensor", 0.5).position, s0);
    close(componentPose(mm, "magnet", 0.25).position, leverPoint(60, 30, LOCAL_TIP));
  });
  test("composant non attaché : reste fixe avec l'animation", async () => {
    const { m } = await loaded();
    close(componentPose({ ...m, sensorMount: "moving" }, "sensor", 0.5).position, m.sensorPosition);
  });
  test("scène, mesure et contact illustratif lus au MÊME instant", async () => {
    const { asset, m } = await loaded();
    const lever = pathOf(asset, "Levier");
    const g0 = leverPoint(0, 0, LOCAL_TIP);
    const mm: MachineAssembly = { ...m, magnetPosition: g0, magnetAttach: attach(lever, g0) };
    const c = config(mm);
    const result = simulateCycle(c, 40);
    expect(result.reason).toBeNull();
    for (const s of result.samples) close(s.position, componentPose(mm, "magnet", s.t).position);
    close(poseAt(c, 0.5).position, leverPoint(120, 60, LOCAL_TIP));
    expect(summarizeWorkshop(c)).toContain("Cycle_complet");
  });
  test("deux points d'axe sur des pièces animées différemment : refusé", async () => {
    const { asset, m } = await loaded();
    const state: GuideState = {
      ...INITIAL_GUIDE,
      pick: { purpose: "hole-points", points: [[0, 0, 0]], support: { path: pathOf(asset, "Levier"), moving: true, group: partGroup(m, pathOf(asset, "Levier")) } },
    };
    const plate = pathOf(asset, "Plaque_chariot");
    const r = handlePick(state, m, { point: [0, 0, 5], normal: [0, 1, 0], path: plate, moving: true, group: partGroup(m, plate) }, config(m));
    expect(r.patch).toBeNull();
    expect(r.state.notice).toContain("ne bougent pas ensemble");
  });
});

describe("mesure entre deux repères", () => {
  test("distance courante et variation depuis le début, repères emportés", async () => {
    const { asset, m } = await loaded();
    const lever = pathOf(asset, "Levier"),
      base = pathOf(asset, "Plateau");
    const a = leverPoint(0, 0, LOCAL_TIP),
      b: Vec3 = [100, 0, 50];
    const mm: MachineAssembly = { ...m, markers: [{ partPath: lever, point: a }, { partPath: base, point: b }] };
    const d = (p: Vec3, q: Vec3) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
    const r = markerReading(mm, 0.5)!;
    expect(r.distance).toBeCloseTo(d(leverPoint(120, 60, LOCAL_TIP), b), 9);
    expect(r.initial).toBeCloseTo(d(a, b), 9);
    expect(r.change).toBeCloseTo(r.distance - r.initial, 12);
    expect(markerReading({ ...mm, markers: [mm.markers![0]!] }, 0.5)).toBeNull();
  });
  test("mouvement saisi : les repères suivent la coulisse", () => {
    const m: MachineAssembly = {
      ...structuredClone(COFFEE_ASSEMBLY),
      markers: [
        { partPath: "0/1", point: [0, 0, 0] },
        { partPath: "0/0", point: [0, 0, 100] },
      ],
    };
    const r = markerReading(m, 1)!;
    expect(r.initial).toBeCloseTo(100, 9);
    expect(r.distance).toBeCloseTo(30, 9); // course 130 mm en +Z
    expect(pointAt(m, "0/1", [1, 2, 3], 0.5)).toEqual(movePoint(m, [1, 2, 3], 0.5));
  });
});

describe("indéterminé tant que le fichier ou le clip manque", () => {
  test("fichier non chargé : aucun contact", () => {
    const m = structuredClone(DEMO_ASSEMBLIES["builtin:arm-v1"]!);
    expect(motionProblem(m)).toContain("non chargée");
    const result = simulateCycle(config(m), 20);
    expect(result.reason).not.toBeNull();
    expect(result.samples.every((s) => s.contact === "unknown")).toBe(true);
  });
  test("clip refusé ou renommé : aucun contact", async () => {
    const { m } = await loaded();
    expect(motionProblem({ ...m, clip: { index: 2, name: "Etirement", duration: 2 } })).toContain("non prise en charge");
    expect(motionProblem({ ...m, clip: { index: 0, name: "Autre", duration: 4 } })).toContain("absente");
    expect(unavailableReason(config({ ...m, clip: { index: 0, name: "Autre", duration: 4 } }))).not.toBeNull();
    expect(motionProblem(m)).toBeNull();
  });
  test("ancien montage sans animation : mouvement inchangé", () => {
    const m = structuredClone(COFFEE_ASSEMBLY);
    expect(componentPose(m, "magnet", 0.5).position).toEqual(movePoint(m, m.magnetPosition, 0.5));
    expect(cycleU(m, 0.75)).toBe(0.25);
  });
});

describe("sauvegarde et relecture", () => {
  test("clip, attaches et repères relus à l'identique", async () => {
    const { asset, m } = await loaded();
    const lever = pathOf(asset, "Levier");
    const mm: MachineAssembly = {
      ...m,
      markers: [{ partPath: lever, point: [1, 2, 3] }, { partPath: "0/0/0", point: [4, 5, 6] }],
    };
    const c = config(mm);
    const back = parseWorkshopConfig(JSON.parse(workshopExportJson(c)))!;
    expect(back.machine).toEqual(mm);
  });
  test("champs invalides refusés", () => {
    const m = structuredClone(DEMO_ASSEMBLIES["builtin:arm-v1"]!);
    for (const bad of [
      { ...m, clip: { index: -1, name: "x", duration: 1 } },
      { ...m, clip: { index: 0, name: "x", duration: Number.NaN } },
      { ...m, clip: undefined },
      { ...m, markers: [{ partPath: "0", point: [0, 0, Infinity] }] },
      { ...m, markers: [1, 2, 3] },
      { ...m, motionSource: "auto" },
    ])
      expect(parseWorkshopConfig(JSON.parse(JSON.stringify(config(bad as MachineAssembly))) as unknown)).toBeNull();
  });
  test("montage aux limites raisonnables : export relisible sous la limite", () => {
    const path = (i: number) => "0/" + "12/".repeat(10) + i;
    const m: MachineAssembly = {
      ...structuredClone(DEMO_ASSEMBLIES["builtin:arm-v1"]!),
      movingNodes: Array.from({ length: 60 }, (_, i) => path(i)),
      movingNode: path(0),
      clip: { index: 0, name: "N".repeat(200), duration: 4 },
      markers: [{ partPath: path(1), point: [1, 2, 3] }, { partPath: path(2), point: [4, 5, 6] }],
    };
    const text = workshopExportJson(config(m));
    expect(new TextEncoder().encode(text).byteLength).toBeLessThanOrEqual(WORKSHOP_IMPORT_LIMIT);
    expect(parseWorkshopConfig(JSON.parse(text))!.machine!.clip!.name).toBe("N".repeat(200));
  });
  test("montage trop volumineux : export refusé plutôt qu'illisible", () => {
    const m: MachineAssembly = {
      ...structuredClone(DEMO_ASSEMBLIES["builtin:arm-v1"]!),
      movingNodes: Array.from({ length: 200 }, (_, i) => "0/" + "9/".repeat(120) + i),
    };
    expect(() => workshopExportJson(config(m))).toThrow();
  });
  test("aucune piste ni hiérarchie copiée dans le montage", async () => {
    const { m } = await loaded();
    const text = JSON.stringify(config(m));
    expect(text).not.toContain("quaternion");
    expect(text).not.toContain("Chariot");
  });
});

describe("clips non rigides refusés", () => {
  function scene(build: (root: Group) => void) {
    const root = new Group();
    build(root);
    const pathOf = new Map<Object3D, string>(),
      objectOf = new Map<string, Object3D>(),
      meshes: string[] = [];
    const walk = (o: Object3D, p: string) => {
      pathOf.set(o, p);
      objectOf.set(p, o);
      if (o instanceof Mesh) meshes.push(p);
      o.children.forEach((c, i) => walk(c, p + "/" + i));
    };
    root.children.forEach((c, i) => walk(c, String(i)));
    return { root, pathOf, objectOf, meshes };
  }
  const part = (name: string) => {
    const m = new Mesh(new BoxGeometry(1, 1, 1));
    m.name = name;
    return m;
  };
  test("morphing, squelette, piste orpheline, cisaillement", () => {
    const s = scene((root) => {
      const stretched = new Group();
      stretched.name = "Etire";
      stretched.scale.set(2, 1, 1);
      stretched.add(part("Tourne"));
      const bone = new Bone();
      bone.name = "Os";
      bone.add(part("Peau"));
      root.add(stretched, bone, part("Bloc"));
    });
    const q = (a: number) => new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), a).toArray();
    const a = analyzeAnimations(
      s.root,
      [
        new AnimationClip("Morph", 1, [new NumberKeyframeTrack("Bloc.morphTargetInfluences[0]", [0, 1], [0, 1])]),
        new AnimationClip("Os", 1, [new QuaternionKeyframeTrack("Os.quaternion", [0, 1], [...q(0), ...q(1)])]),
        new AnimationClip("Orphelin", 1, [new VectorKeyframeTrack("Fantome.position", [0, 1], [0, 0, 0, 1, 0, 0])]),
        new AnimationClip("Cisaille", 1, [new QuaternionKeyframeTrack("Tourne.quaternion", [0, 1], [...q(0), ...q(1)])]),
        new AnimationClip("Rigide", 1, [new VectorKeyframeTrack("Bloc.position", [0, 1], [0, 0, 0, 5, 0, 0])]),
      ],
      s.pathOf,
      s.objectOf,
      s.meshes,
    );
    expect(a.clips.map((c) => [c.name, c.supported, c.issues])).toEqual([
      ["Morph", false, ["morph"]],
      ["Os", false, ["skeleton"]],
      ["Orphelin", false, ["unresolved"]],
      ["Cisaille", false, ["non-rigid"]],
      ["Rigide", true, []],
    ]);
  });
});

describe("parcours guidé : option « Animation du fichier »", () => {
  const noop = () => undefined;
  async function render(step: GuideState["step"], m?: MachineAssembly, assetOverride?: MachineAsset) {
    const { asset, m: base } = await loaded();
    const machine = m ?? base;
    const c = config(machine);
    const result = simulateCycle(c, 20);
    return renderToStaticMarkup(
      <MachineGuide
        state={{ ...INITIAL_GUIDE, step }}
        setState={noop}
        config={c}
        asset={assetOverride ?? asset}
        tool="navigate"
        setTool={noop}
        onChange={noop}
        history={{ canUndo: false, canRedo: false, undo: noop, redo: noop }}
        sample={result.samples[10]!}
        progress={0.5}
        setProgress={noop}
        playing={false}
        setPlaying={noop}
        reason={unavailableReason(c)}
        onDemo={noop}
        onMarkers={noop}
      />,
    );
  }
  test("clips listés à l'étape Modèle, avec la raison du refus", async () => {
    const html = await render("model");
    expect(html).toContain("Cycle_complet");
    expect(html).toContain("changement d&#x27;échelle");
  });
  test("choix de la source à côté de « Définir le mouvement »", async () => {
    const html = await render("motion");
    expect(html).toContain('data-testid="guide-source-clip"');
    expect(html).toContain('data-testid="guide-source-manual"');
  });
  test("aucune option d'animation pour un fichier statique", async () => {
    const asset = await parseMachineAsset(file("demo-tiroir-deux-pieces.glb"), 1000);
    const html = await render("motion", { ...structuredClone(DEMO_ASSEMBLIES["builtin:drawer-v1"]!) }, asset);
    expect(html).not.toContain("guide-source-clip");
    asset.dispose();
  });
  test("essai : temps du clip, repères et contact illustratif", async () => {
    const html = await render("test");
    expect(html).toContain('data-testid="guide-clip-time"');
    expect(html).toContain("2.00 s / 4.00 s");
    expect(html).not.toContain("guide-test-opening");
    expect(html).toContain('data-testid="guide-markers"');
  });
});
