import { describe, expect, test } from "bun:test";
import { INITIAL_CONFIGURATION, INITIAL_CONTEXT, architectureFamily, assessConfiguration, configurationIssues, resizeTank,
  setPointCount, pointBounds, illustrativeReading, floatCentres, type LevelConfiguration } from "../src/lib/level/configuration";
import { configurationGuidance, applyRemedy } from "../src/lib/level/guidance";

describe("level configurator transitions and recovery", () => {
  test("100 → 600 → 2000 → 60 mm keeps ordered points, scales the reach and recovers without stale values", () => {
    for (const count of [1,2,3,4]) for (const mounting of ["top","bottom"] as const) {
      let c = setPointCount({ ...INITIAL_CONFIGURATION, mounting, reachMm: mounting === "bottom" ? 100 : 32.5 }, count);
      for (const height of [600,2000,60,100,2000,60]) {
        c = resizeTank(c,height);
        expect(c.pointsMm.every((p,i)=>p>=0 && p<=height && (i===0 || p>c.pointsMm[i-1]!))).toBe(true);
        expect(c.reachMm).toBeLessThanOrEqual(height);
        expect(configurationIssues(c)).toEqual([]);
        expect(illustrativeReading(c,height/2).usable).toBe(true);
        expect(floatCentres(c,height/2).length).toBeGreaterThan(0);
      }
    }
  });
  test("tank size is independent from the catalogue reach boundary", () => {
    const bigTank = { ...INITIAL_CONFIGURATION, tankHeightMm: 2000, pointsMm:[1980], reachMm:32.5 };
    expect(architectureFamily(bigTank)).toBe("LS01");
    expect(architectureFamily({...bigTank,reachMm:250,count:2,pointsMm:[1800,1900]})).toBe("LS04");
    expect(architectureFamily({...bigTank,reachMm:250.5})).toBe("LS05");
    expect(assessConfiguration(INITIAL_CONTEXT,{...bigTank,reachMm:2001}).selected).toBeNull();
  });
  test("horizontal multi-point and continuous requests explain the actual change and preserve it until clicked", () => {
    for(const mode of ["points","continuous"] as const) {
      const c={...setPointCount(INITIAL_CONFIGURATION,2),orientation:"horizontal" as const,mode};
      const before=structuredClone(c), guide=configurationGuidance(INITIAL_CONTEXT,c)!;
      expect(guide.message).not.toContain("LS03");
      expect(guide.actions).toContain("one_point");
      expect(c).toEqual(before);
      const fixed=applyRemedy(c,"one_point");
      expect(fixed.orientation).toBe("horizontal");
      expect(fixed.mode).toBe("points");
      expect(fixed.count).toBe(1);
      expect(configurationIssues(fixed)).toEqual([]);
      expect(assessConfiguration(INITIAL_CONTEXT,fixed).selected?.family).toBe("LS03");
    }
  });
  test("point controls prevent crossing neighbours; mechanical repairs retain the project", () => {
    const c=setPointCount(INITIAL_CONFIGURATION,4);
    expect(pointBounds(c,1)).toEqual({min:21,max:59});
    for(const broken of [{...c,reachMm:25},{...c,reachMm:150},{...c,pointsMm:[20,10,40,200]},
      setPointCount({...INITIAL_CONFIGURATION,tankHeightMm:60,pointsPerFloat:1},12)]) {
      const guidance=configurationGuidance(INITIAL_CONTEXT,broken)!;
      const fixed=applyRemedy(broken,guidance.actions[0]!);
      expect(configurationIssues(fixed)).toEqual([]);
      expect(fixed.customDescription).toBe(broken.customDescription);
    }
  });
  test("horizontal float clearance is guarded at both ends and has a direct repair", () => {
    for (const height of [60, 100, 2000]) for (const point of [0, height]) {
      const c: LevelConfiguration = { ...INITIAL_CONFIGURATION, orientation: "horizontal", tankHeightMm: height, pointsMm: [point] };
      const guidance = configurationGuidance(INITIAL_CONTEXT, c)!;
      expect(guidance.actions[0]).toBe("centre_point");
      expect(configurationIssues(applyRemedy(c, "centre_point"))).toEqual([]);
    }
  });
  test("every blocked combination in the UI matrix has an explanation and an explicit way forward", () => {
    let cases=0;
    for(const height of [60,250,600,2000]) for(const count of [1,2,4,6,12])
      for(const orientation of ["vertical","horizontal"] as const) for(const mounting of ["top","bottom"] as const)
        for(const mode of ["points","continuous"] as const) for(const pointsPerFloat of [1,2] as const)
          for(const connection of ["standard","DK","DL","GZ"] as const)
            for(const temperatureMax of ["","25","70","80","90","160","180","220"]) {
              const c:LevelConfiguration={...resizeTank(setPointCount(INITIAL_CONFIGURATION,count),height),
                orientation,mounting,mode,pointsPerFloat,connection};
              const context={...INITIAL_CONTEXT,temperatureMax};
              const before=structuredClone(c), a=assessConfiguration(context,c), issues=configurationIssues(c);
              const guidance=configurationGuidance(context,c);
              if(issues.length || !a.selected) {
                expect(guidance?.message.length).toBeGreaterThan(20);
                expect(guidance?.actions.length).toBeGreaterThan(0);
                expect(guidance?.actions.some(x=>["custom","liquid"].includes(x))).toBe(true);
              } else expect(guidance).toBeNull();
              expect(c).toEqual(before); cases++;
            }
    expect(cases).toBe(10240);
  });
});
