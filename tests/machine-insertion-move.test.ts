import { expect, test } from 'bun:test';
import { Vector3 } from 'three';
import { fixture } from './helpers/machine-search-fixture';
import { mountingMoveFrame, mountingMovePatch, surfaceMovePatch } from '../src/lib/standex/machine-surface-move';
import { attachPatch } from '../src/components/standex/workshop/machine-guide';
import { componentPose, pointAt } from '../src/lib/standex/machine-assembly';
import { freePosePatch } from '../src/lib/standex/machine-mounting';
import { parseWorkshopConfig, type Vec3 } from '../src/lib/standex/magnetic-workshop';

test('insertion drag preserves the hole and changes only depth on fixed and rotating supports', () => {
  const { c, asset, attach } = fixture();
  c.sensorId = 'MK07';
  c.machine!.motion = 'rotation'; c.machine!.axisVector = [0, 0, 1]; c.machine!.openingAngle = 73;
  try {
    for (const support of ['fixed', 'moving'] as const)
    for (const flip of [false, true])
    for (const depthRef of ['collar', 'tip'] as const) {
      const a = { ...attach, kind: 'through' as const, support, partPath: support === 'fixed' ? '0/0' : '0/1',
        normal: [0.6, -0.8, 0] as Vec3, offsetMm: 2, spinDeg: 37, flip, depthRef, axisSource: 'plane-centre' as const };
      Object.assign(c.machine!, attachPatch('sensor', a, c));
      for (const u of [0, 0.4, 1]) for (const delta of [-7, 6]) {
        const before = structuredClone(c.machine!);
        const frame = mountingMoveFrame(before, 'sensor', u)!;
        const shift = a.normal.map(v => v * (flip ? 1 : -1) * delta) as Vec3;
        const worldOrigin = new Vector3(...pointAt(before, a.partPath, [0, 0, 0], u));
        const worldShift = new Vector3(...pointAt(before, a.partPath, shift, u)).sub(worldOrigin);
        const requested = new Vector3(...frame.position).add(worldShift).toArray() as Vec3;
        const patch = mountingMovePatch(c, asset, 'sensor', requested, u)!;
        expect(patch).not.toBeNull();
        expect(patch.sensorAttach!.offsetMm).toBeCloseTo(2 + delta, 8);
        expect({ ...patch.sensorAttach, offsetMm: a.offsetMm }).toEqual(a);
        expect(patch.sensorRotation).toEqual(before.sensorRotation);
        expect(freePosePatch(patch).freed).toEqual([]);
        componentPose({ ...before, ...patch }, 'sensor', u).position.forEach((v, i) => expect(v).toBeCloseTo(requested[i]!, 8));
        expect(parseWorkshopConfig({ ...c, machine: { ...before, ...patch } })?.machine?.sensorAttach?.offsetMm).toBeCloseTo(2 + delta, 8);
        expect(c.machine).toEqual(before);
        // A pointer's tangential imprecision cannot shift the designated centre.
        const sideways = new Vector3(0, 12, 0).applyQuaternion(frame.quaternion);
        const projected = mountingMovePatch(c, asset, 'sensor', new Vector3(...requested).add(sideways).toArray() as Vec3, u)!;
        expect(projected.sensorAttach!.offsetMm).toBeCloseTo(2 + delta, 8);
        expect(projected.sensorAttach!.point).toEqual(a.point);
      }
    }
    expect(mountingMovePatch(c, asset, 'sensor', [NaN, 0, 0])).toBeNull();
    const frame = mountingMoveFrame(c.machine!, 'sensor')!;
    const outside = new Vector3(...frame.position).add(new Vector3(1000, 0, 0).applyQuaternion(frame.quaternion)).toArray() as Vec3;
    expect(mountingMovePatch(c, asset, 'sensor', outside)).toBeNull();
  } finally { asset.dispose(); }
});

test('the shared move tool preserves finite surface checks and refuses unattached components', () => {
  const { c, asset } = fixture();
  try {
    const frame = mountingMoveFrame(c.machine!, 'magnet')!;
    for (const delta of [2, 200]) {
      const p = new Vector3(...frame.position).add(new Vector3(delta, 0, 0).applyQuaternion(frame.quaternion)).toArray() as Vec3;
      expect(mountingMovePatch(c, asset, 'magnet', p)).toEqual(surfaceMovePatch(c, asset, 'magnet', p));
    }
    delete c.machine!.magnetAttach;
    expect(mountingMoveFrame(c.machine!, 'magnet')).toBeNull();
    expect(mountingMovePatch(c, asset, 'magnet', [0, 0, 0])).toBeNull();
  } finally { asset.dispose(); }
});
