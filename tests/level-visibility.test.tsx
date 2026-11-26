import { GlobalRegistrator } from "@happy-dom/global-registrator";
if (typeof document === "undefined") GlobalRegistrator.register({ url: "https://example.invalid/" });
import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, within } from "@testing-library/react";
import { setLocale } from "../src/lib/i18n/core";
import { LevelMonitor } from "../src/components/level/level-monitor";
import { INITIAL_CONTEXT, INITIAL_CONFIGURATION, resizeTank, fitStemToPoints, configurationIssues,
  assessConfiguration, horizontalFloatPosition, illustrativeReading, createLevelBrief, type LevelConfiguration } from "../src/lib/level/configuration";
import { applyRemedy, configurationGuidance, horizontalAlternative } from "../src/lib/level/guidance";
import { intakeErrors, seedConfiguration, tankHeightFromCm, tankHeightInCm } from "../src/lib/level/intake";
import { markerLayout, sceneFrame, tankDimensions, LS05_ENVELOPE } from "../src/lib/level/presentation";

afterEach(() => { cleanup(); setLocale("fr"); });
describe("level viewport and requested thresholds", () => {
  test("continuous resize chains preserve full reach without floating-point floor errors", () => {
    for (const mounting of ["support", "top", "bottom"] as const) {
      let c = fitStemToPoints({...INITIAL_CONFIGURATION, mode:"continuous", mounting});
      for (const height of [60,70,80,90,100,110,490,600,1900,2000,60,490]) {
        c = resizeTank(c, height);
        expect(configurationIssues(c)).toEqual([]);
        expect(c.reachMm).toBe(height);
        expect(illustrativeReading(c,height/2).usable).toBe(true);
      }
    }
    let c = fitStemToPoints({...INITIAL_CONFIGURATION, mode:"continuous"});
    for(let h=60; h<=2000; h+=10) { c=resizeTank(c,h); expect(configurationIssues(c)).toEqual([]); }
    c = resizeTank(c,10000); expect(configurationIssues(c).join(" ")).toContain("200 cm");
    c = resizeTank(c,490); expect(c.reachMm).toBe(490); expect(configurationIssues(c)).toEqual([]);
  });
  test("cm input round trips into canonical mm and supports tanks beyond the stem range", () => {
    for (const [cm, mm] of [["49","490"],["190","1900"],["300","3000"],["6.5","65"],["6,5","65"],["",""]]) {
      expect(tankHeightFromCm(cm!)).toBe(mm!);
      if(cm) expect(Number(tankHeightInCm(mm!))).toBe(Number(cm!.replace(",",".")));
    }
    const context = {...INITIAL_CONTEXT, tankHeight:tankHeightFromCm("300"), mountingAccess:"side" as const, detectionGoal:"multiple" as const};
    expect(intakeErrors(context)).toEqual([]);
    const c=seedConfiguration(context);
    expect(c.tankHeightMm).toBe(3000); expect(c.pointsMm).toEqual([1000,2000]);
    expect(assessConfiguration(context,c).selected?.family).toBe("LS03");
  });
  test("separated points have one horizontal sensor each and independent onset signals", () => {
    const c:LevelConfiguration={...INITIAL_CONFIGURATION,tankHeightMm:3000,mountingHeightMm:3000,reachMm:2000,count:2,pointsMm:[50,2950]};
    expect(configurationIssues(c).length).toBeGreaterThan(0);
    const guide=configurationGuidance(INITIAL_CONTEXT,c)!;
    expect(guide.actions[0]).toBe("horizontal_array");
    expect(guide.actions).not.toContain("fit_stem");
    const next=applyRemedy(c,guide.actions[0]!);
    expect(next.pointsMm).toEqual(c.pointsMm); expect(next.count).toBe(2);
    expect(configurationIssues(next)).toEqual([]);
    expect(assessConfiguration(INITIAL_CONTEXT,next).selected?.family).toBe("LS03");
    for(const [height,states] of [[0,[true,false]],[1000,[false,false]],[3000,[false,true]]] as const)
      expect(illustrativeReading(next,height).pointStates.map(p=>p.active)).toEqual([...states]);
    expect(horizontalFloatPosition(next,50,0)).toBeCloseTo(1);
    expect(horizontalFloatPosition(next,2950,1)).toBeCloseTo(0);
    expect(horizontalFloatPosition(next,49.99,0)).toBeLessThan(1);
    expect(horizontalFloatPosition(next,2950.01,1)).toBeGreaterThan(0);
    const brief=createLevelBrief(INITIAL_CONTEXT,next,{lengthMm:"500",connector:""},{});
    expect(brief.sensor_count).toBe(2); expect(brief.requested_points.map(p=>p.intent)).toEqual(["low","high"]);
    expect(horizontalAlternative({...INITIAL_CONTEXT,mountingAccess:"top"},c)).toBeNull();
    const topGuide=configurationGuidance({...INITIAL_CONTEXT,mountingAccess:"top"},{...c,mounting:"top"})!;
    expect(topGuide.actions).toEqual(["custom"]);
  });
  test("crowded horizontal sensors get a real spacing repair without dropping a point", () => {
    const c={...INITIAL_CONFIGURATION,orientation:"horizontal" as const,tankHeightMm:600,count:2,pointsMm:[250,260]};
    const guide=configurationGuidance(INITIAL_CONTEXT,c)!;
    expect(guide.actions[0]).toBe("distribute");
    const fixed=applyRemedy(c,guide.actions[0]!);
    expect(configurationIssues(fixed)).toEqual([]); expect(fixed.count).toBe(2);
  });
  test("two requested points render exactly two thresholds with a normal state between them", () => {
    setLocale("fr");
    const c={...INITIAL_CONFIGURATION, tankHeightMm:600, orientation:"horizontal" as const,count:2,pointsMm:[100,500]};
    const view=render(<LevelMonitor configuration={c} family="LS03" level={300} available />);
    const list=within(view.getByRole("list",{name:"Repères atteints"}));
    expect(list.getAllByRole("listitem")).toHaveLength(2);
    expect(view.getByText("Entre les repères")).toBeTruthy();
    expect(view.queryByText("Niveau 0")).toBeNull();
    view.rerender(<LevelMonitor configuration={c} family="LS03" level={50} available />);
    expect(view.getByText("Niveau bas détecté")).toBeTruthy();
    expect(view.container.querySelector('[data-point="1"]')?.getAttribute("data-reached")).toBe("false");
    view.rerender(<LevelMonitor configuration={c} family="LS03" level={550} available />);
    expect(view.getByText("Niveau haut détecté")).toBeTruthy();
    expect(view.container.querySelector('[data-point="1"]')?.getAttribute("data-reached")).toBe("true");
  });
  test("labels stay separate and ordered under close points, extremes, zoom and short viewports", () => {
    for(const height of [100,192,320,500]) for(const count of [1,2,4,12]) for(const offset of [-300,0,100,400,2000]) {
      const source=Array.from({length:count},(_,i)=>({index:i,x:200,y:offset-i*3,visible:true}));
      const layout=markerLayout(source,height);
      expect(layout.markers).toHaveLength(count);
      for(let i=0;i<count;i++) {
        expect(layout.markers[i]!.labelY).toBeGreaterThanOrEqual(24);
        expect(layout.markers[i]!.labelY).toBeLessThanOrEqual(layout.contentHeight-24);
        if(i) expect(layout.markers[i]!.labelY-layout.markers[i-1]!.labelY).toBeGreaterThanOrEqual(48);
      }
      expect(source[0]!.y).toBe(offset);
    }
  });
  test("large tanks preserve proportions and sensor inspection uses a local camera, never a rescaled model", () => {
    expect(tankDimensions(2000).width).toBe(tankDimensions(490).width);
    const c=seedConfiguration({...INITIAL_CONTEXT,tankHeight:"2000",detectionGoal:"high",detectionHeight:"1900"});
    const all=sceneFrame(c,"LS01",null,false), detail=sceneFrame(c,"LS01",1900,false);
    expect(detail.height).toBeLessThan(150); expect(all.height).toBeGreaterThan(2000);
    expect(detail.target[1]).toBeGreaterThan(1800);
    expect(c.reachMm).toBe(32.5);
    expect(LS05_ENVELOPE.stemDiameterMm).toBeGreaterThanOrEqual(7); expect(LS05_ENVELOPE.stemDiameterMm).toBeLessThanOrEqual(16);
    expect(LS05_ENVELOPE.floatDiameterMm).toBeGreaterThanOrEqual(23.5); expect(LS05_ENVELOPE.floatDiameterMm).toBeLessThanOrEqual(38.3);
  });
});

test("discrete bars cross in order on filling and draining without turning the low alarm into a filled bar",()=>{
  setLocale("fr");
  for(const count of [2,4,12]) {
    const c=fitStemToPoints({...INITIAL_CONFIGURATION,tankHeightMm:2000,count,pointsMm:Array.from({length:count},(_,i)=>100+i*150)});
    const view=render(<LevelMonitor configuration={c} family="LS05" level={0} available />);
    for(const level of [0,...c.pointsMm,2000,...[...c.pointsMm].reverse().map(p=>p-.1),0]) {
      view.rerender(<LevelMonitor configuration={c} family="LS05" level={level} available />);
      expect(view.container.querySelectorAll('.lv-level-bars li')).toHaveLength(count);
      expect(view.container.querySelectorAll('.lv-level-bars [data-reached="true"]')).toHaveLength(c.pointsMm.filter(p=>p<=level).length);
      expect(view.queryByText(/points actifs/)).toBeNull();
    }
    expect(view.getByText("Niveau bas détecté")).toBeTruthy(); view.unmount();
  }
});
