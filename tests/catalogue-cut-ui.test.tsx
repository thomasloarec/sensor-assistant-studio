import { GlobalRegistrator } from '@happy-dom/global-registrator';
if(!(globalThis as {document?:unknown}).document)GlobalRegistrator.register();
import { test, expect } from 'bun:test';
import { render } from '@testing-library/react';
import { PedagogicalCut } from '../src/components/standex/workshop/pedagogical-layer';
import { EXPERIMENT } from '../src/lib/detection-lab/workshop-experiment';
const frame=(z:number)=>({origin:[0,0,0],basis:[[1,0,0],[0,1,0],[0,0,1]],pose:{center:[0,0,z],axis:[1,0,0]},world:{center:[0,0,z],axis:[1,0,0]}}) as never;
test('MK24 cut uses profile reed length and a box envelope; out-of-domain plane is explained',()=>{
  const reed=EXPERIMENT.effectiveLengthMm*3/14;
  const vol={cut:[],cells:[],extent:24,truncated:false} as never;
  const r=render(<PedagogicalCut volume={vol} frame={frame(24.5)} body={[5,1.6,2]} reedMm={reed}/>);
  expect(Number(r.getByTestId('pedagogical-cut-reed').getAttribute('data-length-mm'))).toBeCloseTo(reed,9);
  expect(r.getByTestId('pedagogical-cut-body').getAttribute('data-envelope')).toBe('box');
  expect(r.getByTestId('cut-out-of-domain')).toBeTruthy();
});
