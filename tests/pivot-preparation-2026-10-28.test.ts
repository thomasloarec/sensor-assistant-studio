import { describe, it, expect } from 'bun:test';
import { adaptivePivotPlan, pivotSampleAt, obstacleBlocked, PIVOT_TOL_MM, type VolumeField } from '@/lib/standex/catalogue-pedagogical';
import { preparePivot } from '@/components/standex/workshop/pedagogical-controls';

describe('adaptive pivot plan', () => {
  it('certifies only intervals whose boundary shift is ≤ 0.5 mm', () => {
    const plan = adaptivePivotPlan(t => [20 * t]);
    for (const i of plan.intervals) { expect(i.certified).toBe(true); expect(Math.abs(20 * i.t1 - 20 * i.t0)).toBeLessThanOrEqual(PIVOT_TOL_MM); }
    expect(plan.samples.length).toBeGreaterThan(9);
  });
  it('flags a jump (x0 vs 14.75) as uncertified and hides it', () => {
    const plan = adaptivePivotPlan(t => [t < 0.3 ? 0 : 14.75]);
    const bad = plan.intervals.filter(i => !i.certified);
    expect(bad.length).toBe(1);
    expect(pivotSampleAt(plan, (bad[0]!.t0 + bad[0]!.t1) / 2)).toBeNull();
    expect(pivotSampleAt(plan, 0.9)).not.toBeNull();
  });
  it('null vs number is never certified', () => {
    expect(adaptivePivotPlan(t => [t < 0.5 ? null : 3]).intervals.some(i => !i.certified)).toBe(true);
  });
});

describe('current obstacle mask', () => {
  it('blocks nodes where the magnet body meets a current obstacle, keeps others', () => {
    const f: VolumeField = { xs: [0, 10], ys: [0], zs: [0], values: [1, 1], blocked: [false, false] };
    const c = { sensorId: 'MK03', magnetModel: 'SMCO5-5X4', magnetAngle: 0 } as never;
    const out = obstacleBlocked(c, f, [[1, 0, 0], [0, 1, 0], [0, 0, 1]], [{ path: 'p', c: [10, 0, 0], a: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], h: [1, 1, 1] }]);
    expect(out).toEqual([false, true]);
    expect(f.blocked).toEqual([false, false]);
  });
});

class FakeWorker { static all: FakeWorker[] = []; sent: any[] = []; terminated = false; onmessage: any; onerror: any;
  constructor() { FakeWorker.all.push(this); } postMessage(m: any) { this.sent.push(m); } terminate() { this.terminated = true; } }
const cfg = { sensorId: 'MK03' } as never;
const req = (t: number) => ({ key: 'k' + t, settings: {} as never, frame: { pose: { axis: [0, 1, 0], center: [0, 0, 0] } } as never, obstacles: null, catalogue: cfg });
const factory = () => new FakeWorker() as unknown as Worker;

describe('preparePivot cycle', () => {
  it('cancel terminates and never calls onDone', () => {
    let called = false; const cancel = preparePivot(cfg, req, () => { called = true; }, 48, factory);
    const w = FakeWorker.all.at(-1)!; cancel(); expect(w.terminated).toBe(true);
    w.onmessage({ data: { key: 'plan', plan: { samples: [0, 1], intervals: [{ t0: 0, t1: 1, certified: true }] } } });
    expect(called).toBe(false);
  });
  it('failure returns null (no playback)', () => {
    let out: unknown = 'x'; preparePivot(cfg, req, p => { out = p; }, 48, factory);
    FakeWorker.all.at(-1)!.onerror(); expect(out).toBeNull();
  });
  it('a newer preparation makes the older one stale', () => {
    let old: unknown = 'none'; preparePivot(cfg, req, p => { old = p; }, 48, factory); const w1 = FakeWorker.all.at(-1)!;
    preparePivot(cfg, req, () => {}, 48, factory);
    w1.onmessage({ data: { key: 'plan', plan: { samples: [0], intervals: [] } } }); expect(old).toBe('none');
  });
  it('pins every planned volume (> 12) and completes', () => {
    let done: any = null; preparePivot(cfg, req, p => { done = p; }, 48, factory); const w = FakeWorker.all.at(-1)!;
    const samples = Array.from({ length: 20 }, (_, i) => i / 19);
    w.onmessage({ data: { plan: { samples, intervals: samples.slice(1).map((t, i) => ({ t0: samples[i], t1: t, certified: true })) } } });
    for (const t of samples) w.onmessage({ data: { key: 'k' + t, result: { key: 'k' + t } } });
    expect(done?.samples.length).toBe(20);
    return import('@/components/standex/workshop/pedagogical-controls').then(m => { for (const t of samples) expect(m.pinnedVolume('k' + t)).toBeTruthy(); });
  });
});

describe('out-and-back pivot (micro-fix 2026-10-28)', () => {
  it('non-monotone sine: endpoints equal never certify the whole cycle', () => {
    const f = (t: number) => 20 * Math.sin(Math.PI * t) ** 2;
    const plan = adaptivePivotPlan(t => [f(t)]);
    expect(plan.intervals.length).toBeGreaterThan(2);
    expect(plan.intervals.some(i => i.t0 === 0 && i.t1 === 1)).toBe(false);
    for (const i of plan.intervals.filter(i => i.certified)) for (const u of [i.t0, (i.t0 + i.t1) / 2, i.t1]) expect(Math.abs(f(u) - f(i.t0))).toBeLessThanOrEqual(PIVOT_TOL_MM + 1e-9);
  });
  it('real engine MK03/C N45 magnetAngle 90: not certified on [0,1], core and shell both probed', async () => {
    const { DEFAULT_WORKSHOP } = await import('@/lib/standex/magnetic-workshop') as any;
    const { pivotBoundary } = await import('@/lib/standex/catalogue-pedagogical');
    const c = { ...(DEFAULT_WORKSHOP ?? {}), sensorId: 'MK03', motion: 'pivot', magnetAngle: 90, magnetModel: 'N45-4X19', sensitivity: 'C' } as never;
    const b0 = pivotBoundary(c, 0), b1 = pivotBoundary(c, 0.125);
    expect(b0.length).toBe(6);
    expect(b0).toEqual(pivotBoundary(c, 1));
    const plan = adaptivePivotPlan(t => pivotBoundary(c, t), 1 / 16);
    expect(plan.intervals.some(i => i.t0 === 0 && i.t1 === 1)).toBe(false);
    expect(plan.intervals.length).toBeGreaterThanOrEqual(16);
    console.log('MK03 t0', b0, 't.125', b1, 'uncertified', plan.intervals.filter(i => !i.certified).length);
  }, 60000);
});

describe('pause uses the exact pose', () => {
  it('prepared orientation only while playing', async () => {
    const { activePivotT } = await import('@/lib/standex/catalogue-pedagogical');
    const plan = adaptivePivotPlan(t => [20 * t]);
    expect(activePivotT(false, plan, 0.37)).toBeNull();
    expect(activePivotT(true, plan, 0.37)).not.toBeNull();
    expect(activePivotT(true, null, 0.37)).toBeNull();
  });
  it('pivot notes are not nested in the circuit block', async () => {
    const src = await Bun.file('src/components/standex/workshop/workshop.tsx').text();
    const i = src.indexOf('<PivotNotes'), c = src.indexOf('<div className="mw-circuit-ped"');
    expect(i).toBeGreaterThan(0); expect(i).toBeLessThan(c);
    expect(src.includes('précision de 0,5 mm')).toBe(false);
    expect(src.includes('setShowCircuit')).toBe(false);
  });
});
