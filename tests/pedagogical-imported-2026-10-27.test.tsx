/** Imported mounting in the pedagogical workshop: loaded part boxes, full pilot
 *  bodies, same poses for scene/point/cut/timeline. Boxes are envelopes: an
 *  overlap is "possible, to verify", never a certain collision. */
import { afterEach, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { BoxGeometry, MeshBasicMaterial } from 'three';
import { parseMachineAsset, type MachineAsset } from '../src/lib/standex/machine-assets';
import { registerAnimation } from '../src/lib/standex/machine-clip-registry';
import { DEMO_ASSEMBLIES } from '../src/lib/standex/machine-demos';
import { activeClip, rescaleMachine, type MachineAssembly } from '../src/lib/standex/machine-assembly';
import { DEFAULT_WORKSHOP, parseWorkshopConfig, type Vec3, type WorkshopConfig } from '../src/lib/standex/magnetic-workshop';
import { partEnvelopes, reedObstaclesAt, toReedObstacles, worldObstacles } from '../src/lib/standex/pedagogical-envelopes';
import { pedagogicalAvailability, pedagogicalFrame, parsePedagogicalEnvelope, pilotBodies } from '../src/lib/standex/pedagogical-poses';
import { DEFAULT_EXPERIMENT, EXPERIMENT, evaluatePlacement, sampleVolume, tableTimeline } from '../src/lib/detection-lab/workshop-experiment';
import { obbOverlap, magnetObb, type Obb } from '../src/lib/detection-lab/obstacles';
import { attachPatch } from '../src/components/standex/workshop/machine-guide';
import { rotate } from '../src/lib/standex/machine-assembly';

const file = (name: string) => { const b = readFileSync('public/models/' + name); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer; };
const cleanup: (() => void)[] = [];
afterEach(() => { while (cleanup.length) cleanup.pop()!(); });
async function load(name: string, key: string, scale = 1000) {
  const asset = await parseMachineAsset(file(name), scale);
  cleanup.push(registerAnimation(key, scale, asset.animation), asset.dispose);
  return asset;
}
const table = (c: WorkshopConfig, env: NonNullable<ReturnType<typeof partEnvelopes>>, n = 64) =>
  Array.from({ length: n + 1 }, (_, i) => { const t = i / n, f = pedagogicalFrame(c, t); return { t, pose: f.pose, obstacles: reedObstaclesAt(c.machine!, env, t, f) }; });

/* Synthetic loaded file: two boxes, reed frame = world frame. */
function synthetic(boxes: { path: string; c: Vec3; size: Vec3 }[]): Pick<MachineAsset, 'parts'> {
  return { parts: boxes.map(b => { const g = new BoxGeometry(...b.size); g.translate(...b.c); return { path: b.path, name: b.path, geometry: g, material: new MeshBasicMaterial() }; }) };
}
const base = (magnet: Vec3): MachineAssembly => ({ ...structuredClone(DEMO_ASSEMBLIES['builtin:wall-v1']!), assetKey: 'test:synthetic', movingNodes: ['moving'], movingNode: 'moving', motionStatus: 'confirmed', travel: [0, 0, 10], sensorPosition: [0, 0, 0], sensorRotation: [0, 0, 0], magnetPosition: magnet, magnetRotation: [0, 0, 0], sensorMount: 'fixed', magnetMount: 'fixed' });
const far = { path: 'moving', c: [0, -40, 0] as Vec3, size: [4, 4, 4] as Vec3 };
function verdict(magnetId: string, magnet: Vec3, box: { path: string; c: Vec3; size: Vec3 }) {
  const m = base(magnet), c = { ...DEFAULT_WORKSHOP, machine: m }, env = partEnvelopes(synthetic([far, box]))!;
  const f = pedagogicalFrame(c, 0);
  return evaluatePlacement({ ...DEFAULT_EXPERIMENT, magnetId }, f.pose, reedObstaclesAt(m, env, 0, f));
}

describe('Pedagogical imported mounting', () => {
  test('clear mounting gives a physics verdict; body inside a box is mechanical "possible overlap"', () => {
    expect(verdict('SMCO5-5X4', [6, 6, 0], { path: 'fixed', c: [30, 30, 0], size: [4, 4, 4] }).state).toBe('favorable');
    const hit = verdict('SMCO5-5X4', [6, 6, 0], { path: 'fixed', c: [6, 8.5, 0], size: [2, 2, 2] });
    expect(hit.state).toBe('unavailable'); expect(hit.cause).toBe('overlap');
  });
  test('long N45: centre outside the box but body crossing it is never favorable; short SmCo at same centre is not blocked', () => {
    const box = { path: 'fixed', c: [8, 24, 0] as Vec3, size: [2, 2, 2] as Vec3 };
    const n45 = verdict('N45-4X19', [8, 16, 0], box);
    expect(n45.state).not.toBe('favorable'); expect(n45.cause).toBe('overlap');
    expect(verdict('N45-4X19', [8, 16, 0], { ...box, c: [40, 40, 0] }).state).toBe('favorable');
    expect(verdict('SMCO5-5X4', [8, 16, 0], box).cause).not.toBe('overlap');
  });
  test('a box enclosing a bore is only a possible overlap, never a certain collision', () => {
    const e = verdict('SMCO5-5X4', [6, 6, 0], { path: 'fixed', c: [6, 6, 0], size: [10, 10, 10] });
    expect(e.cause).toBe('overlap'); expect(e.cause).not.toBe('collision');
  });
  test('cut, volume and point share the same mechanical check; polarity invariant', () => {
    const obs: Obb[] = [{ path: 'fixed', c: [4, 6, 0], a: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], h: [1, 1, 1] }];
    const settings = { ...DEFAULT_EXPERIMENT, hypotheses: false }, axis: Vec3 = [0, 1, 0];
    const v = sampleVolume(settings, axis, 0, 8, obs);
    expect(v.cells.some(c => c.blocked)).toBe(false);
    const blocked = v.cut.filter(c => c.blocked); expect(blocked.length).toBeGreaterThan(0);
    for (const c of v.cut.filter(c => c.y === 6)) {
      const p = evaluatePlacement(settings, { center: [c.x, c.y, c.z], axis }, obs);
      expect(!!c.blocked).toBe(p.cause === 'overlap');
      if (!c.blocked) expect(c.zone).toBe(p.zone);
      const q = evaluatePlacement(settings, { center: [c.x, c.y, c.z], axis: [0, -1, 0] }, obs);
      expect(q.state).toBe(p.state); expect(q.cause).toBe(p.cause);
    }
  });
  test('global rigid rotation leaves reed-frame boxes unchanged', () => {
    const world: Obb[] = [{ path: 'p', c: [10, 2, -3], a: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], h: [1, 2, 3] }];
    const frame = { origin: [1, 1, 1] as Vec3, basis: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] as [Vec3, Vec3, Vec3] };
    const R: Vec3 = [20, -35, 50], r = (v: Vec3) => rotate(v, R);
    const rotated = toReedObstacles(world.map(o => ({ ...o, c: r(o.c), a: o.a.map(r) as [Vec3, Vec3, Vec3] })), { origin: r(frame.origin), basis: frame.basis.map(r) as [Vec3, Vec3, Vec3] });
    const plain = toReedObstacles(world, frame);
    rotated[0]!.c.forEach((v, i) => expect(v).toBeCloseTo(plain[0]!.c[i]!, 9));
    rotated[0]!.a.forEach((a, j) => a.forEach((v, i) => expect(v).toBeCloseTo(plain[0]!.a[j]![i]!, 9)));
  });
  test('missing file, missing clip, unconfirmed motion and stale profile never show a result', () => {
    const m = base([6, 6, 0]), c = { ...DEFAULT_WORKSHOP, machine: m };
    expect(pedagogicalAvailability(c, false)).toBe('asset');
    expect(pedagogicalAvailability(c, true)).toBe('ready');
    expect(pedagogicalAvailability({ ...c, machine: { ...m, motionStatus: 'unset' } }, true)).toBe('motion');
    expect(pedagogicalAvailability({ ...c, machine: { ...m, motionSource: 'clip', clip: { index: 0, name: 'absent', duration: 1 } } }, true)).toBe('clip');
    const f = pedagogicalFrame(c, 0);
    expect(tableTimeline(DEFAULT_EXPERIMENT, [{ t: 0, pose: f.pose, obstacles: null }]).points[0]!.state).toBe('unavailable');
    expect(evaluatePlacement({ ...DEFAULT_EXPERIMENT, profileVersion: 'old' }, f.pose, []).cause).toBe('stale');
  });
  test('attachment uses the pilot bodies (Form66 capsule, real cylinder), not catalogue dimensions', () => {
    const p = pilotBodies('N45-4X19')!; expect(p.magnet).toEqual({ lengthMm: 4, heightMm: 19 }); expect(p.sensor.lengthMm).toBe(16.2);
    const a = { kind: 'surface' as const, support: 'fixed' as const, partPath: 'fixed', point: [0, 10, 0] as Vec3, normal: [0, 1, 0] as Vec3, offsetMm: 0, spinDeg: 0, flip: false, depthRef: 'collar' as const, axisSource: 'face' as const };
    const patch = attachPatch('magnet', a, { ...DEFAULT_WORKSHOP, pilotBodies: p } as WorkshopConfig);
    expect(patch.magnetPosition).toEqual([0, 19.5, 0]);
    // Pilot body on a face is contact, not overlap.
    const body = magnetObb(4, 19, { center: [0, 19.5, 0], axis: [0, 1, 0] })!;
    expect(obbOverlap(body, { path: 'f', c: [0, 5, 0], a: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], h: [5, 5, 5] })).toBe(false);
  });

  test('R08 real animated arm: clip + moving attachment at 25 %, export/reimport and GLB reload give identical boxes and verdict', async () => {
    const asset = await load('demo-bras-anime.glb', 'builtin:arm-v1');
    const env = partEnvelopes(asset)!; expect(env.length).toBe(asset.parts.length);
    let m: MachineAssembly = structuredClone(DEMO_ASSEMBLIES['builtin:arm-v1']!);
    const moving = asset.parts.map(p => p.path).find(p => activeClip(m)!.affects(p))!; expect(moving).toBeTruthy();
    const box = env.find(e => e.path === moving)!;
    const a = { kind: 'surface' as const, support: 'moving' as const, partPath: moving, point: [(box.min[0] + box.max[0]) / 2, box.max[1], (box.min[2] + box.max[2]) / 2] as Vec3, normal: [0, 1, 0] as Vec3, offsetMm: 0, spinDeg: 0, flip: false, depthRef: 'collar' as const, axisSource: 'face' as const };
    m = { ...m, ...attachPatch('magnet', a, { ...DEFAULT_WORKSHOP, pilotBodies: pilotBodies('SMCO5-5X4')! } as WorkshopConfig) } as MachineAssembly;
    // Same normalization as the app (support resynchronised, JSON numbers).
    const c: WorkshopConfig = parseWorkshopConfig(JSON.parse(JSON.stringify({ ...DEFAULT_WORKSHOP, machine: m })))!; m = c.machine!;
    expect(m.magnetAttach?.partPath).toBe(moving);
    expect(pedagogicalAvailability(c, true)).toBe('ready');
    const rows = table(c, env, 64), at25 = rows.find(r => r.t === .25)!;
    expect(at25.pose).toEqual(pedagogicalFrame(c, .25).pose);
    expect(pedagogicalFrame(c, .25).world.center).not.toEqual(pedagogicalFrame(c, 0).world.center);
    const tl = tableTimeline(DEFAULT_EXPERIMENT, rows), direct = evaluatePlacement(DEFAULT_EXPERIMENT, at25.pose, at25.obstacles);
    expect(tl.points.find(p => p.t === .25)!.state).toBe(direct.state);
    expect(tl.resolutionCertified).toBe(false); expect(tl.events.every(e => !e.resolved)).toBe(true);
    // Export → reimport (JSON only) → reload the GLB from bytes → recompute.
    const json = JSON.stringify({ kind: 'pedagogical-workshop', version: 1, config: c, settings: DEFAULT_EXPERIMENT, profile: EXPERIMENT, progress: .25 });
    const back = parsePedagogicalEnvelope(JSON.parse(json))!; expect(back.progress).toBe(.25); expect(back.config.machine).toEqual(m);
    expect(json).not.toContain('Cycle_complet"' + ',"tracks'); expect(json.length).toBeLessThan(20000);
    cleanup.pop()!(); cleanup.pop()!();
    expect(activeClip(back.config.machine!)).toBeNull(); expect(pedagogicalAvailability(back.config, false)).toBe('clip');
    const reloaded = await load('demo-bras-anime.glb', 'builtin:arm-v1');
    const env2 = partEnvelopes(reloaded)!; expect(env2).toEqual(env);
    const f2 = pedagogicalFrame(back.config, .25), obs2 = reedObstaclesAt(back.config.machine!, env2, .25, f2);
    expect(obs2).toEqual(at25.obstacles); expect(evaluatePlacement(back.settings, f2.pose, obs2)).toEqual(direct);
  });
  test('second real GLB (wall, manual motion) and unit scale 1000 vs 1 are consistent', async () => {
    const wall = await load('demo-paroi-alesage.glb', 'builtin:wall-v1');
    const m = structuredClone(DEMO_ASSEMBLIES['builtin:wall-v1']!), c = { ...DEFAULT_WORKSHOP, machine: m };
    const env = partEnvelopes(wall)!; expect(env.length).toBe(wall.parts.length);
    const f = pedagogicalFrame(c, .25), obs = reedObstaclesAt(m, env, .25, f);
    expect(worldObstacles(m, env, .5).find(o => o.path.startsWith('0/1'))?.c).not.toEqual(worldObstacles(m, env, 0).find(o => o.path.startsWith('0/1'))?.c);
    const e = evaluatePlacement(DEFAULT_EXPERIMENT, f.pose, obs); expect(['favorable', 'variable', 'unfavorable', 'unavailable']).toContain(e.state);
    const small = await load('demo-paroi-alesage.glb', 'builtin:wall-v1', 1), ms = rescaleMachine(m, 1), envS = partEnvelopes(small)!;
    const cs = { ...DEFAULT_WORKSHOP, machine: { ...ms, motionStatus: 'confirmed' as const } }, fs = pedagogicalFrame(cs, .25);
    const obsS = reedObstaclesAt(cs.machine, envS, .25, fs);
    obsS.forEach((o, i) => { o.c.forEach((v, j) => expect(v * 1000).toBeCloseTo(obs[i]!.c[j]!, 4)); o.h.forEach((v, j) => expect(v * 1000).toBeCloseTo(obs[i]!.h[j]!, 4)); });
    fs.pose.center.forEach((v, j) => expect(v * 1000).toBeCloseTo(f.pose.center[j]!, 6));
  });
});
