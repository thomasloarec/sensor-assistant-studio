import { describe, expect, test } from "bun:test";
import {
  BoxGeometry,
  BufferGeometry,
  Float32BufferAttribute,
  MeshBasicMaterial,
  Vector3,
} from "three";
import { mountingFace, footprintFits } from "../src/lib/standex/machine-face";
import {
  findDetectionPositions,
  mountingFootprint,
  closestFaceTime,
} from "../src/lib/standex/machine-detection-positions";
import {
  DEFAULT_WORKSHOP,
  magnetSize,
  type Vec3,
  type WorkshopConfig,
} from "../src/lib/standex/magnetic-workshop";
import {
  COFFEE_ASSEMBLY,
  componentPose,
  pointAt,
  cycleU,
} from "../src/lib/standex/machine-assembly";
import { applyAttachments, type Attachment } from "../src/lib/standex/machine-mounting";
import type { MachineAsset } from "../src/lib/standex/machine-assets";
import { sensorById } from "../src/lib/standex/sensor-catalog";
import { catalogueFrame, cataloguePlacement } from "../src/lib/standex/catalogue-pedagogical";
import { registerAnimation } from "../src/lib/standex/machine-clip-registry";
import { illustrativeContact } from "../src/lib/standex/pedagogical-contact";
import { attachPatch } from "../src/components/standex/workshop/machine-guide";
import { catalogueModel } from "../src/lib/standex/catalogue-pedagogical";
import { partEnvelopes, reedObstaclesAt } from "../src/lib/standex/pedagogical-envelopes";

import { fixture } from "./helpers/machine-search-fixture";
const square = (half: number): Vec3[] => [
  [-half, -half, 0],
  [half, -half, 0],
  [half, half, 0],
  [-half, half, 0],
];
function flatMesh(rects: number[][]) {
  const data: number[] = [];
  for (const [x0, y0, x1, y1] of rects)
    data.push(x0!, y0!, 0, x1!, y0!, 0, x1!, y1!, 0, x0!, y0!, 0, x1!, y1!, 0, x0!, y1!, 0);
  return new BufferGeometry().setAttribute("position", new Float32BufferAttribute(data, 3));
}
describe("finite original mounting face", () => {
  test("overlapping triangulations cannot compensate for missing matter", () => {
    const rects: number[][] = [];
    for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++)
      if (x !== 1 || y !== 1) rects.push([x * 4 - 6, y * 4 - 6, x * 4 - 2, y * 4 - 2]);
    const geometry = flatMesh(rects);
    // Same left-middle tile triangulated along the OTHER diagonal: no exact
    // duplicate triangles, but 16 mm² double coverage versus a 16 mm² hole.
    geometry.setAttribute("position", new Float32BufferAttribute([
      ...geometry.getAttribute("position").array,
      -6,-2,0, -2,-2,0, -6,2,0,
      -2,-2,0, -2,2,0, -6,2,0,
    ], 3));
    const { asset, attach } = fixture(); asset.parts[0]!.geometry = geometry;
    const face = mountingFace(asset, { ...attach, point: [-4,0,0], normal: [0,0,1] })!;
    expect(footprintFits(face, [0,0,0], square(6))).toBe(false);
    expect(footprintFits(face, [-4,0,0], square(.5))).toBe(true);
  });
  test("whole footprint rejects a hole even when all four corners and anchor are supported", () => {
    // 3×3 tiled plate; middle tile is a hole. All tiles share complete edges.
    const rectangles: number[][] = [];
    for (let x = 0; x < 3; x++)
      for (let y = 0; y < 3; y++)
        if (x !== 1 || y !== 1) rectangles.push([x * 4 - 6, y * 4 - 6, x * 4 - 2, y * 4 - 2]);
    const { asset, attach } = fixture();
    asset.parts[0]!.geometry = flatMesh(rectangles);
    const face = mountingFace(asset, { ...attach, point: [-4, 0, 0], normal: [0, 0, 1] })!;
    expect(face).not.toBeNull();
    expect(footprintFits(face, [-4, 0, 0], square(0.5))).toBe(true);
    expect(footprintFits(face, [-3, 0, 0], square(2.5))).toBe(false);
    expect(footprintFits(face, [0, 0, 0], square(5))).toBe(false);
    expect(footprintFits(face, [-5.8, 0, 0], square(0.5))).toBe(false);
  });
  test("disconnected coplanar island, other side and point in empty space never become the same face", () => {
    const { asset, attach } = fixture();
    asset.parts[0]!.geometry = flatMesh([
      [-8, -4, -2, 4],
      [2, -4, 8, 4],
    ]);
    const a = { ...attach, point: [-4, 0, 0] as Vec3, normal: [0, 0, 1] as Vec3 };
    const face = mountingFace(asset, a)!;
    expect(footprintFits(face, [4, 0, 0], square(0.5))).toBe(false);
    expect(mountingFace(asset, { ...a, point: [0, 0, 0] })).toBeNull();
    expect(mountingFace(asset, { ...a, normal: [0, 0, -1] })).toBeNull();
  });
  test("indexed, rotated face retains a fully supported oriented pad", () => {
    const { asset, attach, c } = fixture();
    const angle = 0.63;
    asset.parts[0]!.geometry.rotateZ(angle);
    const transform = (v: Vec3) =>
      new Vector3(...v).applyAxisAngle(new Vector3(0, 0, 1), angle).toArray() as Vec3;
    const a = {
      ...attach,
      point: transform(attach.point),
      normal: transform(attach.normal),
      spinDeg: 37,
    };
    const face = mountingFace(asset, a)!;
    expect(face).not.toBeNull();
    expect(footprintFits(face, a.point, mountingFootprint(c, a))).toBe(true);
  });
});
describe("same-face C1% search", () => {
  test("MK15/HF3225 D4: a manually reachable sensitive-specimen lobe is found instead of rejected",async()=>{
    const {c,asset,attach}=fixture(26,100);
    c.sensorId="MK15";c.magnetModel="HF3225-14.95X10X5";c.sensitivity="B";
    c.machine!.sensorRotation=[0,0,90];
    Object.assign(c.machine!,attachPatch("magnet",attach,c));
    const known={...c,machine:{...c.machine!,...attachPatch("magnet",{...attach,point:[12,26,0]},c)}};
    const frame=catalogueFrame(known,0),obstacles=reedObstaclesAt(known.machine,partEnvelopes(asset)!,0,frame);
    const manual=cataloguePlacement(known,frame.pose,obstacles);
    expect(manual.zone).toBe(1);expect(illustrativeContact(manual,"B")).toBe("closed");
    expect(illustrativeContact(cataloguePlacement(c,catalogueFrame(c,0).pose),"B")).toBe("open");
    const result=await findDetectionPositions(c,asset);
    expect(result.positions.length).toBeGreaterThanOrEqual(2);
    expect(result.sensitiveOnly).toBe(true);
    for(const p of result.positions){
      const next={...c,machine:{...c.machine!,...attachPatch("magnet",p.attach,c)}};
      const f=catalogueFrame(next,result.t),e=cataloguePlacement(next,f.pose,reedObstaclesAt(next.machine,partEnvelopes(asset)!,result.t,f));
      expect(illustrativeContact(e,catalogueModel(next).className)).toBe("closed");
      expect({...p.attach,point:attach.point}).toEqual(attach);
    }
    asset.dispose();
  },30000);
  test("multiple ON regions, footprint support and attachment invariants; input remains immutable", async () => {
    const { c, asset, attach } = fixture(),
      before = JSON.stringify(c);
    const r = await findDetectionPositions(c, asset);
    expect(r.positions.length).toBeGreaterThanOrEqual(2);
    expect(r.t).toBe(0);
    expect(r.sensitiveOnly).toBe(false);
    const face = mountingFace(asset, attach)!;
    for (const p of r.positions) {
      expect({ ...p.attach, point: attach.point }).toEqual(attach);
      expect(footprintFits(face, p.attach.point, mountingFootprint(c, p.attach))).toBe(true);
      const size = magnetSize(c),
        s = sensorById(c.sensorId);
      const next = {
        ...c,
        machine: applyAttachments(
          { ...c.machine!, magnetAttach: p.attach },
          { lengthMm: s.body[0], heightMm: s.body[1] },
          { lengthMm: size[0], heightMm: size[1] },
        ),
      };
      expect(cataloguePlacement(next, catalogueFrame(next, r.t).pose).zone).toBe(2);
      for (const u of [0, 0.25, 0.5, 1]) {
        const anchor = pointAt(next.machine, "0/1", p.attach.point, u),
          centre = componentPose(next.machine, "magnet", u).position;
        expect(new Vector3(...anchor).distanceTo(new Vector3(...centre))).toBeCloseTo(
          size[1] / 2,
          7,
        );
      }
    }
    expect(JSON.stringify(c)).toBe(before);
  });
  test("too small face, distant face, missing geometry and unconfirmed motion do not move anything", async () => {
    for (const [height, width] of [
      [9, 1],
      [200, 80],
    ]) {
      const { c, asset } = fixture(height, width),
        before = JSON.stringify(c);
      expect((await findDetectionPositions(c, asset)).positions).toHaveLength(0);
      expect(JSON.stringify(c)).toBe(before);
    }
    const { c, asset } = fixture();
    c.machine!.motionStatus = "unset";
    expect((await findDetectionPositions(c, asset)).positions).toHaveLength(0);
    c.machine!.motionStatus = "confirmed";
    asset.parts = [];
    expect((await findDetectionPositions(c, asset)).positions).toHaveLength(0);
  });
  test("an obstacle covering a previously found region excludes its position", async () => {
    const { c, asset } = fixture(),
      r = await findDetectionPositions(c, asset);
    const p = r.positions[0]!.attach.point;
    asset.parts.push({
      path: "0/2",
      name: "obstacle",
      geometry: new BoxGeometry(15, 10, 15).translate(p[0], 3, p[2]),
      material: new MeshBasicMaterial(),
    });
    const next = await findDetectionPositions(c, asset);
    expect(
      next.positions.every((q) => new Vector3(...q.attach.point).distanceTo(new Vector3(...p)) > 5),
    ).toBe(true);
  },15000);
  test("nearest approach can be the open end; preview time uses manual half-cycle", async () => {
    const { c, asset } = fixture(14);
    c.machine!.travel = [0, -5, 0];
    const r = await findDetectionPositions(c, asset);
    expect(r.positions.length).toBeGreaterThan(0);
    expect(r.t).toBe(0.5);
  });
  test("clip nearest approach uses its own timeline, not the manual out-and-back", () => {
    const { c, asset, attach } = fixture();
    const m = c.machine!;
    m.assetKey = "search-clip";
    m.motionSource = "clip";
    m.clip = { index: 0, name: "approach", duration: 2 };
    const unregister = registerAnimation(m.assetKey, m.unitScale, {
      clips: [
        {
          index: 0,
          name: "approach",
          duration: 2,
          trackCount: 1,
          supported: true,
          issues: [],
          animatedPaths: ["0/1"],
        },
      ],
      sampler: () => ({
        index: 0,
        name: "approach",
        duration: 2,
        affects: (p) => p === "0/1",
        groupOf: (p) => (p === "0/1" ? p : ""),
        deltaAt: (p, time) =>
          p === "0/1"
            ? { position: [0, 20 * (time / 2 - 0.4) ** 2, 0], quaternion: [0, 0, 0, 1] }
            : null,
      }),
    });
    try {
      const time = closestFaceTime(m, mountingFace(asset, attach)!, "0/1");
      expect(time).toBeCloseTo(0.4, 3);
      expect(cycleU(m, time)).toBe(time);
    } finally {
      unregister();
    }
  });
  test("cancellation yields no late result or mutation", async () => {
    const { c, asset } = fixture(),
      before = JSON.stringify(c),
      controller = new AbortController();
    const pending = findDetectionPositions(c, asset, controller.signal);
    controller.abort();
    await expect(pending).rejects.toThrow("Aborted");
    expect(JSON.stringify(c)).toBe(before);
  });
});
