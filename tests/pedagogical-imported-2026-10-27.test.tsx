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
    const e = verdict('SMCO5-5X4', [6, 6, 0], { path: 'fixed', c: [6, 6, 0], size: [8, 8, 8] });
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

import { renderToStaticMarkup } from 'react-dom/server';
import { PedagogicalControls } from '../src/components/standex/workshop/pedagogical-controls';
import { PEDAGOGICAL_CASES, pedagogicalPreset } from '../src/lib/standex/pedagogical-poses';
import { animationGeneration } from '../src/lib/standex/machine-clip-registry';
import { pedagogicalTimelineKey } from '../src/lib/standex/pedagogical-envelopes';
import { placementTimeline } from '../src/lib/detection-lab/workshop-experiment';

describe('Review 86e82ae5', () => {
  const reedBox = (c: Vec3 = [0, 0, 0]): Obb => ({ path: 'housing', c, a: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], h: [3, 3, 3] });
  test('1) reed inside an envelope: magnet [6,6,0] clear/favorable becomes unavailable for point, volume, cut and timeline; clearing restores', () => {
    const s = DEFAULT_EXPERIMENT, pose = { center: [6, 6, 0] as Vec3, axis: [0, 1, 0] as Vec3 };
    expect(evaluatePlacement(s, pose, []).state).toBe('favorable');
    const blocked = evaluatePlacement(s, pose, [reedBox()]);
    expect(blocked.state).toBe('unavailable'); expect(blocked.cause).toBe('reed_overlap'); expect(blocked.cause).not.toBe('collision');
    const v = sampleVolume(s, pose.axis, 0, 8, [reedBox()]);
    expect(v.reedBlocked).toBe(true); expect(v.cells.length).toBe(0); expect(v.cut.length).toBe(0);
    const tl = tableTimeline(s, [0, .5, 1].map(t => ({ t, pose, obstacles: [reedBox()] })));
    expect(tl.points.every(p => p.state === 'unavailable')).toBe(true);
    expect(evaluatePlacement(s, pose, [reedBox([0, -30, 0])]).state).toBe('favorable');
    expect(sampleVolume(s, pose.axis, 0, 8, [reedBox([0, -30, 0])]).cells.some(c => c.zone === 2)).toBe(true);
  });
  test('1) ±1 mm reed shift hypotheses are checked mechanically; nominal-only is not', () => {
    const pose = { center: [6, 6, 0] as Vec3, axis: [0, 1, 0] as Vec3 };
    // Box just touching the capsule at y = 1.1 overlaps once the reed moves +1 mm in y.
    const near: Obb = { path: 'wall', c: [0, 2.6, 0], a: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], h: [2, 1.5, 2] };
    expect(evaluatePlacement(DEFAULT_EXPERIMENT, pose, [near]).cause).toBe('scenario_overlap');
    expect(evaluatePlacement({ ...DEFAULT_EXPERIMENT, hypotheses: false }, pose, [near]).cause).not.toBe('scenario_overlap');
  });
  test('2) per-pilot presets: same depth centred vs offset, exploitable cases, traverse crosses favorable–central unfavorable–favorable', () => {
    for (const [id, depth] of [['SMCO5-5X4', 6], ['N45-4X19', 16]] as const) {
      const s = { ...DEFAULT_EXPERIMENT, magnetId: id };
      const at = (c: (typeof PEDAGOGICAL_CASES)[number]['id'], t = .5) => { const p = pedagogicalPreset(c, id)!; const cfg = { ...DEFAULT_WORKSHOP, ...p.config }; return { f: pedagogicalFrame(cfg, t), e: evaluatePlacement({ ...s, className: p.className }, pedagogicalFrame(cfg, t).pose) }; };
      const centred = at('centred'), offset = at('offset');
      expect(centred.f.pose.center[1]).toBe(depth); expect(offset.f.pose.center[1]).toBe(depth);
      expect(centred.e.state).toBe('unfavorable'); expect(offset.e.state).toBe('favorable');
      for (const c of ['parallel', 'oblique', 'classE'] as const) { const e = at(c).e; expect(['favorable', 'variable']).toContain(e.state); }
      const p = pedagogicalPreset('traverse', id)!, cfg = { ...DEFAULT_WORKSHOP, ...p.config };
      const tl = placementTimeline(s, t => pedagogicalFrame(cfg, t).pose, 64);
      const seq = tl.points.filter(q => q.t <= .5).map(q => q.state).filter((x, i, a) => i === 0 || a[i - 1] !== x);
      const f1 = seq.indexOf('favorable'), u = seq.indexOf('unfavorable', f1), f2 = seq.indexOf('favorable', u);
      expect(f1).toBeGreaterThanOrEqual(0); expect(u).toBeGreaterThan(f1); expect(f2).toBeGreaterThan(u);
    }
  });
  test('2) slide controls drive offset/travel, presets hidden for imported mounting', () => {
    const slide = { ...DEFAULT_WORKSHOP, ...pedagogicalPreset('traverse', 'SMCO5-5X4')!.config };
    expect(pedagogicalFrame({ ...slide, offset: 9 }, .25).pose.center[1]).toBe(9);
    expect(pedagogicalFrame({ ...slide, travel: 20 }, 0).pose.center[0]).toBe(-20);
    const props = { settings: DEFAULT_EXPERIMENT, setSettings: () => {}, update: () => {}, busy: false, volume: null, failed: false, onSuggest: () => {}, onUndo: () => {}, canUndo: false };
    const html = renderToStaticMarkup(<PedagogicalControls {...props} config={slide} frame={pedagogicalFrame(slide, 0)} />);
    expect(html).not.toContain('Décalage latéral'); expect(html).toContain('6 mm'); expect(html).toContain('20 mm');
    const imported = { ...DEFAULT_WORKSHOP, machine: base([6, 6, 0]) };
    const h2 = renderToStaticMarkup(<PedagogicalControls {...props} config={imported} frame={pedagogicalFrame(imported, 0)} mounting={null} />);
    expect(h2).toContain('pedagogical-cases-unavailable'); expect(h2).not.toContain('Traversée des lobes');
  });
  test('3) distances are collapsed lobe maxima with prudent/high labels; raw bound only in provenance', () => {
    const c = { ...DEFAULT_WORKSHOP, geometry: 'D1' as const, magnetAngle: 0 };
    const html = renderToStaticMarkup(<PedagogicalControls settings={DEFAULT_EXPERIMENT} setSettings={() => {}} update={() => {}} busy={false} volume={null} failed={false} onSuggest={() => {}} onUndo={() => {}} canUndo={false} config={c} frame={pedagogicalFrame(c, 0)} />);
    expect(html).toContain('pedagogical-depth-datum');
    if (html.includes('pedagogical-distances')) {
      expect(html).toMatch(/<details[^>]*data-testid="pedagogical-distances"(?![^>]*open)/);
      expect(html).toContain('Borne prudente'); expect(html).toContain('pas une portée dans la position affichée');
      const main = html.slice(html.indexOf('pedagogical-distances'), html.indexOf('Provenance'));
      expect(main).not.toMatch(/D[1-5] · (up|to)/);
    }
  });
  test('4) same identifier with new boxes or re-registered clip changes the timeline key', async () => {
    const env1 = [{ path: 'a', min: [0, 0, 0] as Vec3, max: [1, 1, 1] as Vec3 }], env2 = [{ path: 'a', min: [0, 0, 0] as Vec3, max: [2, 1, 1] as Vec3 }];
    const asset = await load('demo-bras-anime.glb', 'builtin:arm-v1');
    const g1 = animationGeneration('builtin:arm-v1', 1000);
    const k1 = pedagogicalTimelineKey(DEFAULT_EXPERIMENT, DEFAULT_WORKSHOP, 'builtin:arm-v1|1000', env1, g1);
    expect(pedagogicalTimelineKey(DEFAULT_EXPERIMENT, DEFAULT_WORKSHOP, 'builtin:arm-v1|1000', env2, g1)).not.toBe(k1);
    cleanup.push(registerAnimation('builtin:arm-v1', 1000, asset.animation));
    const g2 = animationGeneration('builtin:arm-v1', 1000); expect(g2).not.toBe(g1);
    expect(pedagogicalTimelineKey(DEFAULT_EXPERIMENT, DEFAULT_WORKSHOP, 'builtin:arm-v1|1000', env1, g2)).not.toBe(k1);
  });
});
