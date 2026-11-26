import { expect, test } from "bun:test";
import { INITIAL_CONTEXT, configurationIssues, fitStemToPoints, createLevelBrief, demonstrationMax, verticalMechanics, architectureFamily } from "../src/lib/level/configuration";
import { intakeErrors, requestedIntakePoints, seedConfiguration } from "../src/lib/level/intake";
import { dimensionFromPercent, heightPercent } from "../src/lib/level/dimensions";
import { verticalSensorX } from "../src/lib/level/presentation";

test("requested levels seed count, float groups and exact heights across supported mountings",()=>{
  for(const access of ["top","free","bottom","side"] as const) for(let count=2;count<=12;count++) {
    const heights=Array.from({length:count},(_,i)=>String(100+(1800/(count-1))*i));
    const context={...INITIAL_CONTEXT,tankHeight:"2000",mountingAccess:access,detectionGoal:"multiple" as const,detectionCount:count,detectionHeights:heights};
    expect(intakeErrors(context)).toEqual([]);
    const c=seedConfiguration(context);
    expect(c.count).toBe(count);
    c.pointsMm.forEach((point,i)=>expect(point).toBeCloseTo(Number(heights[i]),4));
    expect(configurationIssues(c)).toEqual([]);
    if(access!=="side") expect(verticalMechanics(c).floats).toHaveLength(Math.ceil(count/2));
  }
});

test("empty answers interpolate, ordering errors stay explicit and endpoints remain in the exported request",()=>{
  const context={...INITIAL_CONTEXT,tankHeight:"1000",mountingAccess:"top" as const,detectionGoal:"multiple" as const,detectionCount:5,detectionHeights:["0","250","500","750","1000"]};
  expect(intakeErrors(context)).toEqual([]);
  const c=seedConfiguration(context);
  expect(configurationIssues(c)).toEqual([]);
  expect(c.pointsMm[0]).toBeGreaterThan(0);
  expect(c.pointsMm.at(-1)).toBeLessThan(1000);
  const brief=createLevelBrief(context,c,{lengthMm:"",connector:""},{name:"",company:"",email:"",phone:"",country:"",city:""});
  expect(JSON.stringify(brief)).toContain('"detectionHeights":["0","250","500","750","1000"]');
  expect(requestedIntakePoints({...context,detectionCount:4,detectionHeights:["","200","","800"]})).toEqual([100,200,500,800]);
  for(const heights of [["0","500","500","750","1000"],["0","500","200","750","1000"],["-1"],["invalid"],["1001"]])
    expect(intakeErrors({...context,detectionHeights:heights}).length).toBeGreaterThan(0);
});

test("percentages round trip decimal height while the mounting plane controls the filling limit",()=>{
  for(const height of [60,312,490,1900,2000,10000]) for(const percent of [0,10,15,20.5,25,50,75,100]) {
    const mm=Number(dimensionFromPercent(String(percent).replace(".",","),height));
    expect(heightPercent(mm,height)).toBeCloseTo(percent,3);
  }
  const top=fitStemToPoints({...seedConfiguration({...INITIAL_CONTEXT,tankHeight:"312",mountingAccess:"top",detectionGoal:"low"}),pointsMm:[23]});
  expect(architectureFamily(top)).toBe("LS05");
  expect(demonstrationMax(top)).toBe(312);
  expect(verticalMechanics(top).floats[0]!.upperMm).toBeLessThan(60);
  expect(verticalSensorX(top)).toBe(0);
  const support=fitStemToPoints({...seedConfiguration({...INITIAL_CONTEXT,tankHeight:"2000",mountingAccess:"free",detectionGoal:"high"}),pointsMm:[1900]});
  expect(demonstrationMax(support)).toBe(1907);
  expect(verticalSensorX(support)).toBeLessThan(0);
  expect(verticalSensorX({...support,mounting:"bottom"})).toBe(0);
});
