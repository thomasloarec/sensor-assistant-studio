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
