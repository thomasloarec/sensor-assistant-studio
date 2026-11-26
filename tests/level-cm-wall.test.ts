import { GlobalRegistrator } from '@happy-dom/global-registrator';
if (typeof document === 'undefined') GlobalRegistrator.register({url:'https://example.invalid/'});
import { expect, test } from 'bun:test';
import { setLocale } from '../src/lib/i18n/core';
import { dimensionFromCm, dimensionInCm, formatCm } from '../src/lib/level/dimensions';
import { INITIAL_CONFIGURATION, INITIAL_CONTEXT, configurationIssues, demonstrationMax, floatCentres, pointBounds, verticalMechanics, fitStemToPoints, setPointCount, constrainPointLayout, minimumTankHeight, resizeTank, type LevelConfiguration } from '../src/lib/level/configuration';
import { seedConfiguration } from '../src/lib/level/intake';
import { sceneFrame, tankDimensions, verticalSensorX } from '../src/lib/level/presentation';

test('all dimension adapters preserve decimal centimetres and existing millimetre records',()=>{
  setLocale('fr');
  for(const [cm,mm] of [['20,5','205'],['3,25','32.5'],['0,01','0.1'],['190','1900'],['','']]) {
    expect(dimensionFromCm(cm!)).toBe(mm!); expect(dimensionInCm(mm!)).toBe(cm!);
  }
  expect(dimensionFromCm('invalid')).toBe('invalid');
  setLocale('en'); expect(formatCm(205)).toBe('20.5'); setLocale('fr');
});
test('horizontal point slider endpoints and intermediate values remain physically feasible',()=>{
  for(const height of [60,100,490,2000,10000]) for(const closedWhen of ['high','low'] as const) {
    const c=seedConfiguration({...INITIAL_CONTEXT,tankHeight:String(height),mountingAccess:'side',detectionGoal:closedWhen});
    const b=pointBounds(c,0);
    for(let i=0;i<=100;i++) expect(configurationIssues({...c,pointsMm:[b.min+(b.max-b.min)*i/100]})).toEqual([]);
    expect(configurationIssues({...c,pointsMm:[b.min-1]}).length).toBeGreaterThan(0);
    expect(configurationIssues({...c,pointsMm:[b.max+1]}).length).toBeGreaterThan(0);
  }
  for(const count of [2,4,6,12]) {
    const c=setPointCount({...INITIAL_CONFIGURATION,orientation:'horizontal',tankHeightMm:2000},count);
    for(let index=0;index<count;index++) {
      const b=pointBounds(c,index);
      for(const v of [b.min,(b.min+b.max)/2,b.max]) {
        expect(configurationIssues({...c,pointsMm:c.pointsMm.map((p,i)=>i===index?v:p)})).toEqual([]);
      }
    }
  }
});
test('filling reaches the mounting plane beyond upper float stops without wetting the cable entry',()=>{
  const configurations:LevelConfiguration[]=[];
  for(const height of [100,490,2000]) for(const goal of ['high','low'] as const) for(const access of ['free','top'] as const)
    configurations.push(seedConfiguration({...INITIAL_CONTEXT,tankHeight:String(height),detectionGoal:goal,mountingAccess:access}));
  configurations.push(seedConfiguration({...INITIAL_CONTEXT,tankHeight:'2000',detectionGoal:'high',detectionHeight:'1900'}));
  configurations.push(fitStemToPoints({...INITIAL_CONFIGURATION,mode:'continuous',tankHeightMm:490}));
  configurations.push(setPointCount({...INITIAL_CONFIGURATION,tankHeightMm:250,mountingHeightMm:250},4));
  for(const c of configurations) {
    expect(configurationIssues(c)).toEqual([]);
    const mechanics=verticalMechanics(c), max=demonstrationMax(c);
    expect(max).toBe(mechanics.datumMm);
    expect(max).toBeLessThanOrEqual(c.tankHeightMm);
    floatCentres(c,max).forEach((centre,i)=>expect(centre).toBeCloseTo(mechanics.floats[i]!.upperMm));
  }
  expect(demonstrationMax({...INITIAL_CONFIGURATION,orientation:'horizontal'})).toBe(100);
  expect(demonstrationMax({...INITIAL_CONFIGURATION,mounting:'bottom'})).toBe(100);
});
test('a wall-mounted sensor keeps a short support and a local inspection frame for any tank height',()=>{
  for(const height of [100,490,2000,10000]) {
    const c=seedConfiguration({...INITIAL_CONTEXT,tankHeight:String(height),detectionGoal:'high'});
    expect(verticalSensorX(c)+tankDimensions(height).width/2).toBe(35);
    const detail=sceneFrame(c,'LS01',c.pointsMm[0]!,false);
    expect(detail.target[0]).toBe(verticalSensorX(c)); expect(detail.height).toBeLessThan(100);
    const horizontal={...c,orientation:'horizontal' as const};
    expect(sceneFrame(horizontal,'LS03',c.pointsMm[0]!,false).height).toBe(125);
  }
});
test('tank slider minimum retains clearance for every horizontal point',()=>{
  for(let count=1;count<=12;count++) {
    let c=constrainPointLayout(setPointCount({...INITIAL_CONFIGURATION,orientation:'horizontal',tankHeightMm:2000},count));
    for(const height of [minimumTankHeight(c),490,2000]) {
      c=constrainPointLayout(resizeTank(c,Math.max(minimumTankHeight(c),height)));
      expect(configurationIssues(c)).toEqual([]);
      for(let i=0;i<count;i++) {
        const bounds=pointBounds(c,i);
        for(const p of [bounds.min,bounds.max]) expect(configurationIssues({...c,pointsMm:c.pointsMm.map((old,j)=>i===j?p:old)})).toEqual([]);
      }
    }
  }
});
