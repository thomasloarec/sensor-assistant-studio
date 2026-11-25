import { describe, expect, test } from 'bun:test';
import { INITIAL_CONFIGURATION, constrainPointLayout, pointBounds, configurationIssues, setPointCount, resizeTank, type LevelConfiguration } from '../src/lib/level/configuration';
describe('interactive stem constraints', () => {
  test('540 mm tank / 175 mm stem keeps six reachable points and both material envelopes valid', () => {
    for (const mounting of ['top','support','bottom'] as const) {
      let c:LevelConfiguration = {...INITIAL_CONFIGURATION,tankHeightMm:540,mountingHeightMm:540,mounting,count:6,pointsMm:[73,154,230,310,386,467],reachMm:175};
      c=constrainPointLayout(c);
      expect(c.reachMm).toBe(175); expect(c.count).toBe(6);
      for(const family of ['LS04','LS05'] as const) expect(configurationIssues(c,family)).toEqual([]);
      for(let i=0;i<c.count;i++) for(const value of Object.values(pointBounds(c,i))) {
        const moved={...c,pointsMm:c.pointsMm.map((p,j)=>j===i?value:p)};
        expect(configurationIssues(moved)).toEqual([]);
      }
    }
  });
  test('length changes and point counts keep feasible assemblies visible',()=>{
    for(const pointsPerFloat of [1,2] as const) for(let count=2;count<=12;count++) {
      let c=constrainPointLayout(setPointCount({...INITIAL_CONFIGURATION,tankHeightMm:540,mountingHeightMm:540,pointsPerFloat},count));
      for(const reachMm of [175,439,100,540,2000,175]) {
        c=constrainPointLayout({...c,reachMm});
        expect(configurationIssues(c)).toEqual([]);
        expect(c.pointsMm).toHaveLength(count);
      }
      c=constrainPointLayout(resizeTank(c,1900));expect(configurationIssues(c)).toEqual([]);
    }
  });
});

test('single long-stem levels stay inside their local float travel',()=>{
  for(const mounting of ['top','support','bottom'] as const) for(const closedWhen of ['high','low'] as const) {
    const c=constrainPointLayout({...INITIAL_CONFIGURATION,tankHeightMm:540,mountingHeightMm:540,mounting,closedWhen,reachMm:175,pointsMm:[50]});
    expect(configurationIssues(c)).toEqual([]);
    for(const value of Object.values(pointBounds(c,0))) expect(configurationIssues({...c,pointsMm:[value]})).toEqual([]);
  }
});
