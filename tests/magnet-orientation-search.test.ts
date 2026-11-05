import { expect, test } from "bun:test";
import { Vector3 } from "three";
import { fixture } from "./helpers/machine-search-fixture";
import {
  alignedMagnetSpin,
  configWithMagnetAttachment,
  initialMagnetAttachment,
} from "../src/lib/standex/machine-magnet-orientation";
import {
  catalogueFrame,
  cataloguePlacement,
  catalogueModel,
} from "../src/lib/standex/catalogue-pedagogical";
import {
  findDetectionPositions,
  mountingFootprint,
} from "../src/lib/standex/machine-detection-positions";
import { mountingFace, footprintFits } from "../src/lib/standex/machine-face";
import { partEnvelopes, reedObstaclesAt } from "../src/lib/standex/pedagogical-envelopes";
import { illustrativeContact } from "../src/lib/standex/pedagogical-contact";
import { playbackStep } from "../src/lib/standex/machine-playback";

test("initial mounting aligns with the sensor in the current moving pose and remains editable", () => {
  const { c, asset, attach } = fixture(12, 80);
  c.machine!.motion = "rotation";
  c.machine!.axisVector = [0, 1, 0];
  c.machine!.openingAngle = 63;
  const before = JSON.stringify(c),
    a = initialMagnetAttachment(c, attach, 0.25, asset);
  const next = configWithMagnetAttachment(c, a),
    frame = catalogueFrame(next, 0.25);
  expect(Math.abs(frame.pose.frame![0][0])).toBeCloseTo(1, 8);
  expect(a.point).toEqual(attach.point);
  expect(a.normal).toEqual(attach.normal);
  expect(a.partPath).toBe(attach.partPath);
  expect(JSON.stringify(c)).toBe(before);
  const edited = configWithMagnetAttachment(next, { ...a, spinDeg: a.spinDeg + 17 });
  expect(edited.machine!.magnetAttach!.spinDeg).toBe(a.spinDeg + 17);
  expect(Math.abs(catalogueFrame(edited, 0.25).pose.frame![0][0])).toBeLessThan(0.99);
  asset.dispose();
});

test("rotation recovers a placement that cannot fit the original slanted footprint; sensor and face are invariant", async () => {
  const { c, asset, attach } = fixture(12, 25);
  const slanted = { ...attach, spinDeg: 45 },
    config = configWithMagnetAttachment(c, slanted),
    before = JSON.stringify(config);
  const face = mountingFace(asset, slanted)!;
  expect(footprintFits(face, slanted.point, mountingFootprint(config, slanted))).toBe(false);
  const r = await findDetectionPositions(config, asset, undefined, 0);
  expect(r.positions.length).toBeGreaterThan(0);
  for (const p of r.positions) {
    expect(p.attach.spinDeg).not.toBe(45);
    expect(p.attach.partPath).toBe(slanted.partPath);
    expect(p.attach.normal).toEqual(slanted.normal);
    expect(footprintFits(face, p.attach.point, mountingFootprint(config, p.attach))).toBe(true);
    const next = configWithMagnetAttachment(config, p.attach),
      f = catalogueFrame(next, r.t);
    expect(next.machine!.sensorPosition).toEqual(config.machine!.sensorPosition);
    expect(next.machine!.sensorRotation).toEqual(config.machine!.sensorRotation);
    const e = cataloguePlacement(
      next,
      f.pose,
      reedObstaclesAt(next.machine!, partEnvelopes(asset)!, r.t, f),
    );
    expect(illustrativeContact(e, catalogueModel(next).className)).toBe("closed");
  }
  expect(JSON.stringify(config)).toBe(before);
  asset.dispose();
}, 30000);

test("search starts in the visible pose instead of resetting to the colliding end of the motion", async () => {
  const { c, asset } = fixture(14, 40);
  c.machine!.travel = [0, -16, 0];
  const result = await findDetectionPositions(c, asset, undefined, 0.1);
  expect(result.positions.length).toBeGreaterThan(0);
  expect(result.t).toBe(0.1);
  asset.dispose();
}, 30000);

test("sensor-axis projection stays in the original face plane after a rigid pivot", () => {
  const { c, asset, attach } = fixture();
  c.machine!.motion = "rotation";
  c.machine!.axisVector = [0, 1, 0];
  c.machine!.openingAngle = 120;
  const a = { ...attach, spinDeg: alignedMagnetSpin(c, attach, 0.2) };
  const frame = catalogueFrame(configWithMagnetAttachment(c, a), 0.2);
  expect(Math.abs(new Vector3(...frame.pose.frame![0]).dot(new Vector3(1, 0, 0)))).toBeCloseTo(
    1,
    9,
  );
  asset.dispose();
});

test("playback rates change elapsed time without moving the current pose or changing clip endpoints", () => {
  for (const rate of [0.05, 0.1, 0.25, 0.5, 1, 2, 4])
    expect(playbackStep(0.2, 100, 6, rate)).toBeCloseTo(0.2 + (0.1 * rate) / 6, 10);
  expect(playbackStep(0.4, 0, 6, 4)).toBe(0.4);
  expect(playbackStep(0.99, 100, 0.2, 4)).toBe(1);
  expect(playbackStep(0.2, 100, 6, true)).toBe(playbackStep(0.2, 100, 6, 0.5));
  expect(playbackStep(0.2, 100, 6, false)).toBe(playbackStep(0.2, 100, 6, 1));
  for (const rate of [0, -1, NaN, Infinity]) expect(playbackStep(0.2, 100, 6, rate)).toBe(0.2);
});

test("magnet edits never rederive or normalize an existing sensor pose", () => {
  const { c, attach, asset } = fixture();
  c.machine!.sensorAttach = { ...attach, support: "fixed", point: [999, 0, 0] };
  const before = structuredClone(c.machine!);
  const next = configWithMagnetAttachment(c, { ...attach, spinDeg: 37 });
  expect(next.machine!.sensorPosition).toEqual(before.sensorPosition);
  expect(next.machine!.sensorRotation).toEqual(before.sensorRotation);
  expect(next.machine!.sensorAttach).toEqual(before.sensorAttach);
  asset.dispose();
});
