import { describe, expect, test } from "bun:test";
import {
  BackSide,
  BoxGeometry,
  DoubleSide,
  FrontSide,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Raycaster,
  Vector3,
} from "three";
import { visibleFaceNormal } from "../src/lib/standex/machine-picking";
import { attachPose, surfaceFootprint, type Attachment } from "../src/lib/standex/machine-mounting";
import { mountingFace, footprintFits } from "../src/lib/standex/machine-face";
import { componentPose, partDelta, toRest } from "../src/lib/standex/machine-assembly";
import { surfaceMoveFrame, surfaceMovePatch } from "../src/lib/standex/machine-surface-move";
import { attachPatch } from "../src/components/standex/workshop/machine-guide";
import { parseMachineAsset } from "../src/lib/standex/machine-assets";
import type { Vec3 } from "../src/lib/standex/magnetic-workshop";
import { fixture } from "./helpers/machine-search-fixture";

const attachment = (point: Vec3, normal: Vec3): Attachment => ({
  kind: "surface",
  support: "fixed",
  partPath: "0/1",
  point,
  normal,
  offsetMm: 0,
  spinDeg: 0,
  flip: false,
  depthRef: "collar",
  axisSource: "face",
});
function pick(mesh: Mesh, origin: Vector3, direction: Vector3) {
  mesh.updateMatrixWorld(true);
  const ray = new Raycaster(origin, direction);
  const hit = ray.intersectObject(mesh)[0]!;
  expect(hit).toBeDefined();
  const normal = visibleFaceNormal(hit.face!.normal, mesh.matrixWorld, ray.ray.direction);
  return { hit, normal, ray };
}

describe("mount on the clicked side of a visible surface", () => {
  test("front and back clicks put MK15 and magnet on their respective sides of the same sheet", () => {
    const mesh = new Mesh(new PlaneGeometry(80, 80), new MeshBasicMaterial({ side: DoubleSide }));
    for (const side of [-1, 1]) {
      const { hit, normal, ray } = pick(
        mesh,
        new Vector3(0, 0, side * 20),
        new Vector3(0, 0, -side),
      );
      expect(normal.z).toBe(side);
      expect(hit.face!.normal.z).toBe(1); // Input triangle normal was not mutated.
      for (const heightMm of [2.5, 1.9]) {
        const a = attachment(hit.point.toArray(), normal.toArray());
        const p = attachPose(a, { lengthMm: 16, heightMm });
        expect(new Vector3(...p.position).sub(hit.point).dot(ray.ray.direction)).toBeCloseTo(
          -heightMm / 2,
          8,
        );
      }
    }
  });

  test("slanted, non-uniformly scaled and mirrored meshes resolve the side in world coordinates", () => {
    for (const scaleX of [2, -2]) {
      const mesh = new Mesh(new PlaneGeometry(80, 80), new MeshBasicMaterial({ side: DoubleSide }));
      mesh.position.set(20, -9, 50);
      mesh.rotation.set(0.4, -0.7, 0.2);
      mesh.scale.set(scaleX, 3, 0.5);
      mesh.updateMatrixWorld(true);
      const outward = new Vector3(0, 0, 1).applyQuaternion(mesh.quaternion);
      for (const side of [-1, 1]) {
        const direction = outward.clone().multiplyScalar(-side);
        const { normal } = pick(
          mesh,
          mesh.position.clone().addScaledVector(outward, 20 * side),
          direction,
        );
        expect(normal.dot(direction)).toBeCloseTo(-1, 8);
        expect(normal.length()).toBeCloseTo(1, 8);
      }
    }
  });

  test("a thick wall retains the nearest actual face on either side", () => {
    const mesh = new Mesh(new BoxGeometry(80, 80, 6), new MeshBasicMaterial());
    for (const side of [-1, 1]) {
      const { hit, normal } = pick(mesh, new Vector3(0, 0, side * 20), new Vector3(0, 0, -side));
      const pose = attachPose(attachment(hit.point.toArray(), normal.toArray()), {
        lengthMm: 16,
        heightMm: 2.5,
      });
      expect(hit.point.z).toBe(side * 3);
      expect(pose.position[2]).toBe(side * 4.25);
    }
  });

  test("finite face checks follow material sidedness, including material groups", () => {
    const { asset } = fixture();
    const part = asset.parts[0]!;
    part.geometry.dispose();
    part.geometry = new PlaneGeometry(80, 80);
    for (const side of [FrontSide, BackSide, DoubleSide]) {
      part.material = new MeshBasicMaterial({ side });
      for (const normalZ of [-1, 1]) {
        const a = attachment([0, 0, 0], [0, 0, normalZ]);
        const face = mountingFace(asset, a);
        const permitted =
          side === DoubleSide || (normalZ > 0 ? side === FrontSide : side === BackSide);
        expect(!!face).toBe(permitted);
        if (face) {
          expect(footprintFits(face, a.point, surfaceFootprint(a, [16, 2.5, 2.5]))).toBe(true);
          expect(footprintFits(face, [39, 0, 0], surfaceFootprint(a, [16, 2.5, 2.5]))).toBe(false);
          expect(mountingFace(asset, { ...a, point: [0, 0, 1] })).toBeNull();
        }
      }
    }
    part.material = [
      new MeshBasicMaterial({ side: FrontSide }),
      new MeshBasicMaterial({ side: DoubleSide }),
    ];
    part.geometry.clearGroups();
    part.geometry.addGroup(0, 6, 1);
    expect(mountingFace(asset, attachment([0, 0, 0], [0, 0, -1]))).not.toBeNull();
    part.geometry.groups[0]!.materialIndex = 0;
    expect(mountingFace(asset, attachment([0, 0, 0], [0, 0, -1]))).toBeNull();
    asset.dispose();
  });

  test("a backside attachment survives moving-support poses and tangential dragging", () => {
    for (const which of ["sensor", "magnet"] as const) {
      const { c, asset } = fixture(16, 100);
      c.sensorId = "MK15";
      const m = c.machine!;
      m.motion = "rotation";
      m.rotationAxis = "z";
      m.openingAngle = 73;
      asset.parts[0]!.geometry.dispose();
      asset.parts[0]!.geometry = new PlaneGeometry(100, 100);
      asset.parts[0]!.material = new MeshBasicMaterial({ side: DoubleSide });
      const u = 0.6,
        d = partDelta(m, "0/1", u)!;
      const mesh = new Mesh(asset.parts[0]!.geometry, asset.parts[0]!.material);
      mesh.position.fromArray(d.position);
      mesh.quaternion.fromArray(d.quaternion);
      const back = new Vector3(0, 0, -1).applyQuaternion(mesh.quaternion);
      const { hit, normal } = pick(
        mesh,
        mesh.position.clone().addScaledVector(back, 20),
        back.clone().negate(),
      );
      const rest = toRest(m, "0/1", hit.point.toArray(), normal.toArray(), u);
      const a = { ...attachment(rest.point, rest.normal), support: "moving" as const };
      Object.assign(m, attachPatch(which, a, c));
      expect(a.normal[2]).toBeCloseTo(-1, 8);
      for (const time of [0, 0.4, 1]) {
        const frame = surfaceMoveFrame(m, which, time)!;
        const requested = new Vector3(...frame.position)
          .add(new Vector3(3, 2, 0).applyQuaternion(frame.quaternion))
          .toArray();
        const patch = surfaceMovePatch(c, asset, which, requested, time);
        expect(patch).not.toBeNull();
        const changed = which === "sensor" ? patch!.sensorAttach! : patch!.magnetAttach!;
        expect(changed.normal).toEqual(a.normal);
        expect(changed.partPath).toBe(a.partPath);
        const actual = componentPose({ ...m, ...patch }, which, time).position;
        actual.forEach((v, i) => expect(v).toBeCloseTo(requested[i]!, 7));
      }
      asset.dispose();
    }
  });
});

// Opt-in regression on the user's original asset; the licensed file is not copied into the repository.
test.skipIf(!process.env.BLENDER_GLB_PATH)(
  "real blender: inside and outside clicks on the black cap stay on the clicked side",
  async () => {
    const g = globalThis as { document?: unknown; createImageBitmap?: unknown };
    const saved = [g.document, g.createImageBitmap] as const;
    g.document = undefined;
    g.createImageBitmap = undefined;
    const asset = await parseMachineAsset(
      await Bun.file(process.env.BLENDER_GLB_PATH!).arrayBuffer(),
      10,
    ).finally(() => {
      [g.document, g.createImageBitmap] = saved;
    });
    try {
      const part = asset.parts.find((p) => p.name === "Cube.001_BlackPlastic_0")!;
      const mesh = new Mesh(part.geometry, part.material);
      for (const [y, directionY] of [
        [420, 1],
        [480, -1],
      ] as const) {
        const { hit, normal, ray } = pick(
          mesh,
          new Vector3(110, y, 0),
          new Vector3(0, directionY, 0),
        );
        expect(hit.point.y).toBeCloseTo(444.73697078948646, 5);
        // Demonstrates why the old triangle-normal placement went outside from both views.
        expect(hit.face!.normal.y).toBeGreaterThan(0.97);
        const a = { ...attachment(hit.point.toArray(), normal.toArray()), partPath: part.path };
        const pose = attachPose(a, { lengthMm: 16, heightMm: 2.5 });
        expect(new Vector3(...pose.position).sub(hit.point).dot(ray.ray.direction)).toBeLessThan(
          -1.2,
        );
        expect(mountingFace(asset, a)).not.toBeNull();
      }
    } finally {
      asset.dispose();
    }
  },
);
