/** The proposed examples are small, versioned local files; old keys stay readable. */
import {describe,expect,test} from 'bun:test';
import {readFileSync} from 'node:fs';
import {renderToStaticMarkup} from 'react-dom/server';
import {EXAMPLE_ASSEMBLIES,EXAMPLE_MODELS} from '../src/lib/standex/machine-demos';
import {BUILTIN_FILES,parseMachineAsset} from '../src/lib/standex/machine-assets';
import {parseMachine} from '../src/lib/standex/machine-assembly';
import {DemoButtons} from '../src/components/standex/workshop/machine-guide';
import {LANGUAGES,t} from '../src/lib/i18n/core';

describe("Modèles d'exemple proposés",()=>{
 test('four selected examples replace the old menu and have translated names/details',()=>{
  expect(EXAMPLE_MODELS.map(m=>m.name)).toEqual(['Fenêtre ouvrante','Volet et paroi percée','Compteur à roues dentées','Vérin à piston']);
  expect(Object.keys(EXAMPLE_ASSEMBLIES)).toEqual(EXAMPLE_MODELS.map(m=>m.key));
  const html=renderToStaticMarkup(<DemoButtons onDemo={()=>{}}/>);
  for(const old of ['blender-v2','water-meter-v2','cnc-v2','hospital-bed-v2','coffee-v1','drawer-v1'])expect(html).not.toContain('builtin:'+old);
  expect((html.match(/data-testid="demo-builtin:/g)??[]).length).toBe(4);
  for(const m of EXAMPLE_MODELS)for(const locale of LANGUAGES.filter(l=>l.id!=='fr')){
   expect(t(m.name,locale.id)).not.toBe(m.name);expect(t(m.detail,locale.id)).not.toBe(m.detail);
  }
 });
 test('credits preserve source authors and identify adaptations without empty links',()=>{
  expect(EXAMPLE_MODELS.filter(m=>m.license==='CC BY 4.0')).toHaveLength(3);
  expect(EXAMPLE_MODELS.find(m=>m.key==='builtin:wall-flap-v3')?.author).toBe('Sensor Studio');
  expect(renderToStaticMarkup(<DemoButtons onDemo={()=>{}}/>)).not.toContain('href=""');
  for(const m of EXAMPLE_MODELS.filter(m=>m.adapted))expect(m.source).toMatch(/^https:\/\/sketchfab.com\/3d-models\//);
 });
 test('fresh examples preserve explicit motion setup and save/reopen their exact key',()=>{
  for(const m of Object.values(EXAMPLE_ASSEMBLIES)){
   expect(m.motionStatus).toBe('unset');expect(m.movingNodes).toEqual([]);expect(m.motionSource).toBeUndefined();
   expect(parseMachine(JSON.parse(JSON.stringify(m)))?.assetKey).toBe(m.assetKey);
  }
 });
 test('previous saved examples remain resolvable without appearing in the new picker',()=>{
  const base=EXAMPLE_ASSEMBLIES['builtin:window-v3']!;
  for(const key of ['coffee-v1','drawer-v1','door-v1','wall-v1','arm-v1','blender-v2','water-meter-v2','cnc-v2','hospital-bed-v2']){
   expect(BUILTIN_FILES['builtin:'+key]).toBeTruthy();expect(parseMachine({...base,assetKey:'builtin:'+key})?.assetKey).toBe('builtin:'+key);
  }
  expect(parseMachine({...base,assetKey:'builtin:cnc-v9'})).toBeNull();
 });
 const expected:Record<string,{parts:number;longest:number;clips:string[];moving:number}>={
  'builtin:window-v3':{parts:4,longest:1420,clips:[],moving:0},
  'builtin:wall-flap-v3':{parts:2,longest:160,clips:[],moving:0},
  'builtin:rotary-counter-v3':{parts:22,longest:72.7453,clips:['Rotation_des_roues_un_tour'],moving:10},
  'builtin:pneumatic-cylinder-v3':{parts:9,longest:139,clips:['Aller_retour_du_piston'],moving:2},
 };
 for(const m of EXAMPLE_MODELS)test('real GLB loads at the correct scale with independent parts: '+m.key,async()=>{
  const b=readFileSync('public'+BUILTIN_FILES[m.key]);const g=globalThis as {document?:unknown;createImageBitmap?:unknown};const saved=[g.document,g.createImageBitmap];
  g.document=undefined;g.createImageBitmap=undefined;
  const asset=await parseMachineAsset(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),EXAMPLE_ASSEMBLIES[m.key]!.unitScale).finally(()=>{[g.document,g.createImageBitmap]=saved;});
  try{
   const e=expected[m.key]!;expect(Math.max(...asset.size)).toBeCloseTo(e.longest,2);expect(asset.parts).toHaveLength(e.parts);
   expect(new Set(asset.parts.map(p=>p.path)).size).toBe(e.parts);expect(asset.animation.clips.map(c=>c.name)).toEqual(e.clips);
   for(const c of asset.animation.clips){expect(c.supported).toBe(true);const sampler=asset.animation.sampler(c.index)!;
    expect(asset.parts.filter(p=>sampler.affects(p.path))).toHaveLength(e.moving);
    for(const p of asset.parts.filter(p=>!sampler.affects(p.path)))for(const time of [0,1,2,3,4])expect(sampler.deltaAt(p.path,time)).toBeNull();
   }
  }finally{asset.dispose();}
 });
});
