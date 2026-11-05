import { describe, expect, test } from "bun:test";
import {
  BoxGeometry,
  BufferGeometry,
  Float32BufferAttribute,
  MeshBasicMaterial,
  PlaneGeometry,
  Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { obstacleOverlap, obbOverlap, type Obb } from "../src/lib/detection-lab/obstacles";
import {
  partEnvelopes,
  worldObstacles,
  toReedObstacles,
  pedagogicalTimelineKey,
} from "../src/lib/standex/pedagogical-envelopes";
import { COFFEE_ASSEMBLY } from "../src/lib/standex/machine-assembly";
import {
  catalogueFrame,
  cataloguePlacement,
  catalogueTimeline,
  catalogueModel,
} from "../src/lib/standex/catalogue-pedagogical";
import { illustrativeContact } from "../src/lib/standex/pedagogical-contact";
import { findDetectionPositions } from "../src/lib/standex/machine-detection-positions";
import { attachPatch } from "../src/components/standex/workshop/machine-guide";
import { fixture } from "./helpers/machine-search-fixture";
import type { Vec3 } from "../src/lib/standex/magnetic-workshop";

const E: [Vec3, Vec3, Vec3] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];
const body = (c: Vec3, h: Vec3 = [1, 1, 1]): Obb => ({ path: "body", c, a: E, h });
function envelope(geometry: BufferGeometry) {
  return partEnvelopes({
    parts: [{ path: "fixed", name: "fixed", geometry, material: new MeshBasicMaterial() }],
  })!;
}
const obstacle = (geometry: BufferGeometry) =>
  worldObstacles(COFFEE_ASSEMBLY, envelope(geometry), 0)[0]!;

describe("loaded surfaces, empty spaces and actual penetration", () => {
  test("empty cabinet interior is clear; walls and enclosed solid remain blocked", () => {
    const shell = mergeGeometries([
      new BoxGeometry(2, 40, 40).translate(-21, 0, 0),
      new BoxGeometry(2, 40, 40).translate(21, 0, 0),
      new BoxGeometry(40, 2, 40).translate(0, 21, 0),
    ])!;
    const o = obstacle(shell);
    expect(obbOverlap(body([0, 0, 0]), o)).toBe(true);
    expect(obstacleOverlap(body([0, 0, 0]), o)).toBe(false);
    expect(obstacleOverlap(body([20, 0, 0]), o)).toBe(true);
    expect(obstacleOverlap(body([21, 0, 0], [0.2, 0.2, 0.2]), o)).toBe(true);
    expect(obstacleOverlap(body([19, 0, 0]), o)).toBe(false); // touching
    expect(obstacleOverlap(body([19.01, 0, 0]), o)).toBe(true);
  });
  test("slanted door permits flush mounting, rejects penetration, and survives a rigid frame change", () => {
    const angle = 0.63,
      rotate = (v: Vec3) =>
        new Vector3(...v).applyAxisAngle(new Vector3(0, 0, 1), angle).toArray() as Vec3;
    const o = obstacle(new BoxGeometry(100, 2, 80).rotateZ(angle));
    const b = { ...body(rotate([0, 2, 0])), a: E.map(rotate) as [Vec3, Vec3, Vec3] };
    expect(obbOverlap(b, o)).toBe(true);
    expect(obstacleOverlap(b, o)).toBe(false);
    expect(obstacleOverlap({ ...b, c: rotate([0, 1.9, 0]) }, o)).toBe(true);
    const frame = { origin: [32, -17, 5] as Vec3, basis: E.map(rotate) as [Vec3, Vec3, Vec3] };
    const [rb, ro] = toReedObstacles([b, o], frame);
    expect(obstacleOverlap(rb!, ro!)).toBe(false);
    expect(ro!.mesh).toBe(o.mesh); // no triangle copies per pose
  });
  test("open planes block crossing but never fill their enclosing space", () => {
    const g = new PlaneGeometry(20, 20).rotateX(0.7).rotateZ(0.2),
      o = obstacle(g);
    expect(obstacleOverlap(body([0, 0, 0]), o)).toBe(true);
    expect(obstacleOverlap(body([0, 4, -4], [0.1, 0.1, 0.1]), o)).toBe(false);
  });
  test("hole remains open even inside one mesh bounding box", () => {
    const bars = mergeGeometries([
      new BoxGeometry(4, 20, 4).translate(-8, 0, 0),
      new BoxGeometry(4, 20, 4).translate(8, 0, 0),
      new BoxGeometry(12, 4, 4).translate(0, -8, 0),
      new BoxGeometry(12, 4, 4).translate(0, 8, 0),
    ])!;
    const o = obstacle(bars);
    expect(obstacleOverlap(body([0, 0, 0]), o)).toBe(false);
    expect(obstacleOverlap(body([7, 0, 0]), o)).toBe(true);
    expect(obstacleOverlap(body([8, 0, 0], [0.1, 0.1, 0.1]), o)).toBe(true);
  });
  test("duplicated open faces do not become solids; closed hollow shells keep their cavity", () => {
    const plane = new PlaneGeometry(20, 20).toNonIndexed();
    const duplicated = obstacle(mergeGeometries([plane, plane.clone()])!);
    expect(duplicated.mesh!.solid.some(Boolean)).toBe(false);
    const outer = new BoxGeometry(20, 20, 20),
      inner = new BoxGeometry(10, 10, 10);
    const indices = inner.index!;
    for (let i = 0; i < indices.count; i += 3) {
      const a = indices.getX(i);
      indices.setX(i, indices.getX(i + 1));
      indices.setX(i + 1, a);
    }
    const hollow = obstacle(mergeGeometries([outer, inner])!);
    expect(obstacleOverlap(body([0, 0, 0]), hollow)).toBe(false);
    expect(obstacleOverlap(body([7, 0, 0], [0.2, 0.2, 0.2]), hollow)).toBe(true);
    const overlap = obstacle(
      mergeGeometries([outer, new BoxGeometry(20, 20, 20).translate(3, 0, 0)])!,
    );
    expect(obstacleOverlap(body([0, 0, 0]), overlap)).toBe(true);
  });
  test("same bounds with different interior geometry invalidate the timeline cache", () => {
    const hollow = mergeGeometries([
      new BoxGeometry(2, 20, 20).translate(-9, 0, 0),
      new BoxGeometry(2, 20, 20).translate(9, 0, 0),
    ])!;
    const a = envelope(hollow),
      b = envelope(new BoxGeometry(20, 20, 20));
    expect(a[0]!.min).toEqual(b[0]!.min);
    expect(a[0]!.max).toEqual(b[0]!.max);
    expect(pedagogicalTimelineKey({}, {}, "same", a, 0)).not.toBe(
      pedagogicalTimelineKey({}, {}, "same", b, 0),
    );
    const cloned = structuredClone(worldObstacles(COFFEE_ASSEMBLY, a, 0));
    expect(obstacleOverlap(body([0, 0, 0]), cloned[0]!)).toBe(false);
  });
  test("non-finite triangles fail closed even if a stale bounding box is present", () => {
    const g = new BoxGeometry(2, 2, 2);
    g.computeBoundingBox();
    g.setAttribute("position", new Float32BufferAttribute([NaN, 0, 0, 0, 1, 0, 0, 0, 1], 3));
    expect(
      partEnvelopes({
        parts: [{ path: "bad", name: "bad", geometry: g, material: new MeshBasicMaterial() }],
      }),
    ).toBeNull();
  });
});

test("cabinet cavity: search, live installation contact and playback timeline agree", async () => {
  const { asset, c } = fixture();
  const cabinet = mergeGeometries([
    new BoxGeometry(4, 100, 100).translate(-70, 0, 0),
    new BoxGeometry(4, 100, 100).translate(70, 0, 0),
    new BoxGeometry(144, 4, 100).translate(0, -52, 0),
  ])!;
  asset.parts.push({
    path: "fixed",
    name: "cabinet",
    geometry: cabinet,
    material: new MeshBasicMaterial(),
  });
  const result = await findDetectionPositions(c, asset);
  expect(result.positions.length).toBeGreaterThan(0);
  const next = {
    ...c,
    machine: { ...c.machine!, ...attachPatch("magnet", result.positions[0]!.attach, c) },
  };
  const f = catalogueFrame(next, result.t),
    obs = toReedObstacles(worldObstacles(next.machine, partEnvelopes(asset)!, result.t * 2), f);
  const point = cataloguePlacement(next, f.pose, obs);
  expect(illustrativeContact(point, catalogueModel(next).className)).toBe("closed");
  const timeline = catalogueTimeline(next, [{ t: result.t, pose: f.pose, obstacles: obs }]);
  expect(timeline.points[0]!.state).toBe(point.state);
  expect(timeline.points[0]!.response).toBe(point.nominal?.response);
  asset.dispose();
  cabinet.dispose();
}, 30000);
