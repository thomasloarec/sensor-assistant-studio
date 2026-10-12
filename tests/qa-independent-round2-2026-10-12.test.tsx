/** Independent domain oracle, round 2. Correct expectations are deliberately
 * retained when production fails. No backend requests and no product mocks.
 * Machine-readable observations: /tmp/qa-round2/results.json (synthetic inputs).
 */
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { writeFileSync } from 'node:fs';
import * as React from 'react';
import { act, cleanup, fireEvent, render, waitFor, within, type RenderResult } from '@testing-library/react';
import { RouterContextProvider, createMemoryHistory, createRootRoute, createRouter } from '@tanstack/react-router';
import { assessApplicationFit, isSubstantive, temperaturesC, VALIDATION_POINT } from '@/lib/leadmagnet/application-fit';
import { createDossier, type DesignDossier, type Requirement } from '@/lib/leadmagnet/dossier';
import { evaluateCandidates } from '@/lib/leadmagnet/candidates';
import { blockedBy, suggestionFilters } from '@/lib/leadmagnet/suggestion-filters';
import { pairCards, pairCardFor } from '@/lib/leadmagnet/pair-cards';
import { detectEnvelopeFromText } from '@/lib/leadmagnet/envelope-text';
import { thermalWarning } from '@/lib/leadmagnet/thermal-fit';
import { BUSINESS_FIELD_MESSAGES, checkSubmission, isIsoDate, missingBusinessContext, submissionBinding, type SubmissionInput } from '@/lib/leadmagnet/submission';
import { INITIAL_NDA } from '@/lib/leadmagnet/nda';
import { sensorById, sensorDisplayTitle, sensorDisplayVariant } from '@/lib/standex/sensor-catalog';
import { LANGUAGES, setLocale } from '@/lib/i18n/core';
import { setWebGLSupportForTests } from '@/hooks/use-webgl-slot';
import { DOCUMENTED_HOUSINGS, terminationFromHousing } from '@/lib/leadmagnet/connector-library';

// The oracle is authored from physical modality, specified electrical architecture,
// and explicit catalog constraints, NOT generated from implementation output.
const ORDER = ['detection_goal', 'target_object', 'states_motion', 'mounting', 'electrical', 'environment'] as const;
type Answers = Partial<Record<typeof ORDER[number], string>>;
type Classification = 'catalog' | 'engineering' | 'out-of-scope' | 'insufficient' | 'exploration';
type Fixture = { id: string; a: Answers; expected: Classification; note: string; mounting?: DesignDossier['mounting']; caveat?: RegExp; include?: string; exclude?: RegExp; site?: {min: number | null; max: number | null} };
const req = (a: Answers): Requirement[] => ORDER.map(key => ({key, label: key, value: a[key] ?? '', unit: null, state: a[key] ? 'confirmed' : 'unknown', source: 'user'}));
const door: Answers = {detection_goal:'Packaging guard closed indication', target_object:'A permanent magnet behind a 2 mm ABS guard', states_motion:'Guard closes with magnet at 7 mm', mounting:'Adhesive carrier on stationary guard frame', electrical:'2 wire NO dry contact into 24 V PLC input, 8 mA', environment:'Sensor ambient 22°C'};
const fixtures: Fixture[] = [
 {id:'R01',a:door,expected:'catalog',note:'ABS is nonmagnetic; dry PLC control remains plausible, qualification required'},
 {id:'R02',a:{detection_goal:'Confirm nylon instrument lid seated',target_object:'Magnet actuator',states_motion:'Lid travels 3 mm',mounting:'Surface mount on PCB',electrical:'3.3 V pullup, 0.4 mA dry NO contact',environment:'Indoor 30°C'},mounting:{kind:'pcb_smd'},expected:'catalog',exclude:/^MK11|^MK36/,note:'SMD only, no silent bracket'},
 {id:'R03',a:{detection_goal:'Detect hydraulic piston end position',target_object:'Magnet moves with long-stroke piston',states_motion:'Stroke 450 mm; terminal magnet gap 6 mm',mounting:'Exterior threaded body in explicitly tapped M8 hole',electrical:'24 V PLC, 10 mA',environment:'Exterior ambient 45°C'},mounting:{kind:'screw',style:'threaded_body'},expected:'catalog',include:'MK11-M8',exclude:/^MK3[678]$/,note:'450 mm stroke is not sensing distance; M8 must remain available'},
 {id:'R04',a:{detection_goal:'Detect agricultural implement transport lock',target_object:'Magnet on steel linkage',states_motion:'6 mm gap, lateral offset varies with frame flex',mounting:'External clamp',electrical:'24 V 5 mA PLC',environment:'Mud and vibration'},expected:'engineering',caveat:/offset|decal|tol[eé]ran|acier|steel|champ|magn[eé]t/i,note:'Ferromagnetic frame and variable offset need assembly evidence'},
 {id:'R05',a:{detection_goal:'Coffee grounds drawer fully inserted indication',target_object:'Magnet bonded to plastic grounds drawer',states_motion:'Drawer slides to 5 mm gap',mounting:'Adhesive on outside casing',electrical:'5 V 1 mA logic input',environment:'Humid, sensor ambient 40°C'},expected:'catalog',note:'Legitimate position application, not coffee-sector matching'},
 {id:'R06',a:{detection_goal:'HVAC condensate float: two distinct level limits',target_object:'One magnetic float',states_motion:'Low and high limits 20 mm apart; two independent sensor elements required',electrical:'Two separate NO PLC channels 24 V 5 mA'},expected:'engineering',caveat:/deux|two|[ée]l[ée]ment|seuil|threshold/i,note:'Do not silently collapse two channels into one reed'},
 {id:'R07',a:{detection_goal:'Hot tank overflow alarm',target_object:'Magnetic float',states_motion:'Float trips a discrete upper limit',environment:'Fluid inside tank at 180°C. Sensor ambient outside at 35°C.'},expected:'catalog',site:{min:null,max:35},note:'Fluid temperature is not external sensor temperature; float still needs qualification'},
 {id:'R08',a:{...door,target_object:'Permanent magnet enclosed in a strong steel magnetic shield',states_motion:'Magnet at 9 mm behind the shielding'},expected:'engineering',caveat:/shield|blind|[ée]cran|champ|field/i,note:'Shielding may suppress actuation; geometry cannot prove capability'},
 {id:'R09',a:{...door,target_object:'Two adjacent permanent magnets at neighboring drawers',states_motion:'Desired magnet 5 mm away; neighbor magnet moves independently, cross-talk unknown'},expected:'engineering',caveat:/interf|cross|voisin|neighbor|champ/i,note:'Do not promise immunity to neighboring field'},
 {id:'R10',a:{...door,environment:'Sensor operating from -40 to +140°C, fixed immobile cable'},expected:'catalog',site:{min:-40,max:140},note:'MK21 fixed cable covers full range, mobile cable does not'},
 {id:'R11',a:{...door,environment:'Sensor operating from -40 to +140°C, moving cable flexes every cycle'},expected:'catalog',site:{min:-40,max:140},caveat:/mouvement|moving|condition/i,note:'MK21 mobile lower bound -30°C; warning must retain full range'},
 {id:'R12',a:{...door,electrical:'Reed feeds a 24 V 5 mA PLC control input. Separate externally rated contactor switches the 230 VAC 12 A machine motor.'},expected:'catalog',note:'High mains load elsewhere must not reject safe control architecture'},
 {id:'R13',a:{detection_goal:'Detect ferrous steel target approaching',target_object:'No external magnet available. Ferrous steel target; MK02 includes internal bias magnet.',states_motion:'Target arrives within a few millimetres'},expected:'engineering',include:'MK02',note:'MK02 internal magnet can detect ferrous target; no blanket magnetic-impossibility'},
 {id:'R14',a:{detection_goal:'Detect unmodified aluminium plate',target_object:'Nonmagnetic aluminum plate, no magnet allowed anywhere'},expected:'out-of-scope',note:'No ferrous target or field'},
 {id:'R15',a:{detection_goal:'Detect unmodified plastic flap',target_object:'Plastic target without any magnet; no ferrous insert permitted'},expected:'out-of-scope',note:'Neither reed nor Hall detects unmodified plastic without field'},
 {id:'R16',a:{detection_goal:'Measure continuous magnetic field amplitude with a linear Hall sensor',target_object:'Permanent magnet on test jig',electrical:'Active three-wire linear analog voltage, NOT a two-wire reed switch'},expected:'engineering',note:'Different supported technology must not silently become passive reed recommendation'},
 {id:'R17',a:{...door,electrical:'Two-wire normally-open dry circuit required, no supply wire for active three-wire Hall'},expected:'catalog',note:'2-wire NO reed legitimate; cannot substitute active Hall'},
 {id:'R18',a:{...door,electrical:'The reed directly powers the 110 VAC 5 A machine motor; omit contactor.'},expected:'out-of-scope',note:'Inductive mains load requires external rated interface'},
 {id:'R19',a:{...door,electrical:'The 230 VAC 12 A motor is powered directly through the reed, without an interface.'},expected:'out-of-scope',note:'Mains high-current direct switching unsafe'},
 {id:'R20',a:{...door,environment:'Sensor must operate continuously at 170°C'},expected:'engineering',note:'No standard operating rating above 150°C'},
 {id:'R21',a:{...door,environment:'Sensor remains at 200°C continuously'},expected:'engineering',note:'Do not invent thermal rating'},
 {id:'R22',a:{...door,environment:'Chamber operating at 200°C. Sensor ambient outside enclosure 40°C.'},expected:'catalog',site:{min:null,max:40},note:'External sensor, not hot chamber'},
 {id:'R23',a:{...door,environment:'Sensor continuous ambient 300°F'},expected:'catalog',site:{min:null,max:148.9},note:'300°F approximately 149°C, not 300°C'},
 {id:'R24',a:{...door,environment:'Sensor continuous ambient 392°F'},expected:'engineering',site:{min:null,max:200},note:'392°F = 200°C, not standard'},
 {id:'R25',a:{...door,environment:'Sensor operating range -40..+85°C'},expected:'catalog',site:{min:-40,max:85},caveat:/hors|condition|exceeded/i,note:'MK04 lower bound -30; warn both ends, consider MK21'},
 {id:'R26',a:{...door,target_object:'2 × 2 mm permanent magnet',states_motion:'Detection gap = 200 mm; show in 3D',mounting:'Cable 2 m to control box'},expected:'engineering',note:'2 m cable and scene mention cannot hide 200 mm gap'},
 {id:'R27',a:{...door,target_object:'2 × 2 mm permanent magnet',states_motion:'Detect magnet at 70 mm with +/-1 mm precision'},expected:'engineering',caveat:/essai|v[eé]rifi|garanti/i,note:'Below guide maximum does not prove this tiny magnet at this gap'},
 {id:'R28',a:{detection_goal:'Measure analog fluid flow in L/min continuously',target_object:'Sealed pipe without magnetic marker or moving parts',electrical:'4-20 mA proportional signal'},expected:'out-of-scope',note:'Not ordinary reed flow sensing'},
 {id:'R29',a:{detection_goal:'Flow threshold alarm',target_object:'Floating magnetic paddle allowed in water line',states_motion:'Paddle crosses discrete threshold when flowing',electrical:'24 V 5 mA dry contact'},expected:'catalog',note:'Discrete magnetic paddle flow detection remains plausible'},
 {id:'R30',a:{detection_goal:'Continuously measure temperature',target_object:'Process chamber',states_motion:'An unrelated motor has a magnet on its shaft',electrical:'Analog temperature transmitter 4–20 mA'},expected:'out-of-scope',note:'Unrelated moving magnet cannot erase temperature goal'},
 {id:'R31',a:{detection_goal:'Overheat alarm using a magnetic actuator',target_object:'Bimetal actuator carrying permanent magnet',states_motion:'At the alarm limit actuator moves the magnet to reed',electrical:'NO dry contact into PLC'},expected:'catalog',note:'Reed senses actuator state, not continuous temperature'},
 ...['force','humidity','pH','gas concentration','weight'].map((quantity,i):Fixture=>({id:`R${32+i}`,a:{detection_goal:`Measure ${quantity} continuously with reed`,target_object:'Nonmagnetic process sample, no magnet or ferrous target',electrical:'Analog 0-10 V proportional measurement'},expected:'out-of-scope',note:`Use appropriate ${quantity} technology, never fabricate reed response`})),
 {id:'R37',a:{},expected:'insufficient',note:'Blank has no recommended cards'},
 {id:'R38',a:{detection_goal:'I do not know',target_object:'je ne sais pas',states_motion:'no sé',electrical:'weiß nicht'},expected:'insufficient',note:'Four filler languages do not create a purpose'},
 {id:'R39',a:{mounting:'Bracket with two screw holes only'},expected:'exploration',note:'Mounting-only text is not a detection purpose'},
 {id:'R40',a:{mounting:'Sensor must fit inside 8 × 5 × 4 mm'},expected:'exploration',note:'Envelope-only requires consent, not recommended product'},
 {id:'R41',a:{detection_goal:'qzxv qzxv qzxv'},expected:'insufficient',note:'Gibberish is not a defensible detection requirement'},
];
const results: Record<string, unknown>[] = [];
function observe(f: Fixture) {
 const requirements = req(f.a);
 const mounting = f.mounting ?? {kind:'undecided'};
 const envelope = {lengthMm:null,widthMm:null,heightMm:null};
 const fit = assessApplicationFit(requirements,'',{mountingChosen:mounting.kind !== 'undecided',envelopeSet:false});
 const filters = suggestionFilters({mounting,envelope,mountingText:f.a.mounting});
 const rows = evaluateCandidates({mounting,envelope,mountingText:f.a.mounting}).sort((a,b)=>({kept:0,to_verify:1,excluded:2}[a.status]-{kept:0,to_verify:1,excluded:2}[b.status]));
 const eligible = rows.filter(r=>r.id !== 'GENERIC' && blockedBy(sensorById(r.id),filters,filters.map(x=>x.id),{mounting,envelope}).length===0);
 const candidateIds = fit.blocking ? [] : pairCards(eligible.map(r=>r.id),{limit:3}).map(c=>c.sensorId);
 const issues = fit.issues.map(i=>i.id);
 const classification: Classification = issues.includes('no_meaningful_requirement') ? 'insufficient' : issues.some(x=>['direct_load_switching','no_magnetic_source','continuous_temperature_measurement','continuous_flow_measurement'].includes(x)) ? 'out-of-scope' : fit.blocking || fit.validationPoints.length ? 'engineering' : fit.explorationOnly ? 'exploration' : 'catalog';
 const caveats = [...fit.validationPoints,...fit.issues.flatMap(i=>[i.why,...i.cautions]),...candidateIds.flatMap(id=>{const w=thermalWarning(id,fit.sensorSiteC);return w?[w.text,...w.documented.map(d=>d.condition)]:[];})];
 const unchanged = JSON.stringify(requirements)===JSON.stringify(req(f.a));
 return {classification,candidateIds,eligibleIds:eligible.map(r=>r.id),issues,caveats,sensorSiteC:fit.sensorSiteC,lossOfRequirements:!unchanged};
}
function checkFixture(f: Fixture) {
 const actual=observe(f);
 const errors:string[]=[];
 if(actual.classification!==f.expected) errors.push(`classification: expected ${f.expected}, actual ${actual.classification}`);
 if(f.include && !actual.eligibleIds.includes(f.include)) errors.push(`required plausible ${f.include} absent`);
 if(f.exclude && actual.eligibleIds.some(id=>f.exclude?.test(id))) errors.push(`mechanically forbidden IDs: ${actual.eligibleIds.filter(id=>f.exclude?.test(id))}`);
 if(f.caveat && !f.caveat.test(actual.caveats.join(' '))) errors.push('required caveat missing');
 if(f.site && JSON.stringify(actual.sensorSiteC)!==JSON.stringify(f.site)) errors.push(`sensor site: expected ${JSON.stringify(f.site)}, actual ${JSON.stringify(actual.sensorSiteC)}`);
 if(actual.lossOfRequirements) errors.push('requirements mutated');
 if(['out-of-scope','insufficient'].includes(f.expected) && actual.candidateIds.length) errors.push('ordinary candidate cards must not be proposed');
 results.push({id:f.id,category:'fixture',status:errors.length?'FAIL':'PASS',answers:ORDER.map(key=>({key,value:f.a[key]??''})),expected:{classification:f.expected,candidateIds:f.include?[f.include]:[],candidatePolicy:f.include?'must remain eligible':'not uniquely fixed by domain; max three observed',caveat:f.caveat?.source??f.note,lossOfRequirements:false,notes:f.note},actual,errors});
 expect(errors).toEqual([]);
}

describe('Round2 independent core oracle: six fields in real order',()=>{
 for(const f of fixtures) test(`${f.id} ${f.note}`,()=>checkFixture(f));
});

// Sixty transformations, checked against pre-authored physical expectation.
const mutations: Fixture[]=[];
for(const [prefix,base] of [['heat',fixtures.find(f=>f.id==='R21')],['mains',fixtures.find(f=>f.id==='R19')],['safe',fixtures.find(f=>f.id==='R12')],['flow',fixtures.find(f=>f.id==='R28')],['gap',fixtures.find(f=>f.id==='R26')],['alarm',fixtures.find(f=>f.id==='R31')]] as const){
 if(!base) throw new Error('Missing independently specified mutation base');
 for(let i=0;i<10;i++){
  let a:Answers={...base.a};
  if(i===0) a=Object.fromEntries(ORDER.map(k=>[k,(a[k]??'').toUpperCase()])) as Answers;
  if(i===1) a=Object.fromEntries(ORDER.map(k=>[k,`  ${a[k]??''}  `])) as Answers;
  if(i===2) a={...a,mounting:`${a.mounting??''}. Cable length 1.5 m to the PLC`};
  if(i===3) a={...a,environment:`${a.environment??''}. Another unrelated system uses a Hall encoder.`};
  if(i===4) a={...a,target_object:`${a.target_object??''}. An unrelated motor and its Hall encoder are not the measurement target.`};
  if(i===5) a={...a,states_motion:`${a.states_motion??''}. The 3D rendering has no physical validation.`};
  if(i===6) a=Object.fromEntries([...ORDER].reverse().map(k=>[k,a[k]??''])) as Answers;
  if(i===7) a=Object.fromEntries(ORDER.map(k=>[k,(a[k]??'').replace(/4-20/g,'4–20').replace(/2 × 2/g,'2x2')])) as Answers;
  if(i===8) a={...a,mounting:`${a.mounting??''}. Cable 1500 mm long; magnet on some OTHER machine.`};
  if(i===9) a=Object.fromEntries(ORDER.map(k=>[k,(a[k]??'').replace(/200°C/g,'392°F').replace(/gap = 200 mm/g,'gap = 20 cm')])) as Answers;
  mutations.push({...base,id:`M-${prefix}-${i+1}`,a,note:`${prefix} metamorphism ${i+1}: ${base.note}`});
 }
}
describe('Round2 60 adversarial semantic mutations',()=>{for(const f of mutations)test(f.id,()=>checkFixture(f));});

// Cases not inferred from the recognition regex vocabulary.
const localized: [string,string][]=[['en','Continuously measure temperature; 4-20 mA analog'],['fr','Relever la température en permanence, signal analogique 4-20 mA'],['de','Temperatur kontinuierlich messen, analoges Signal 4-20 mA'],['es','Medir temperatura de forma continua, señal analógica 4-20 mA'],['nl','Temperatuur continu meten met analoog signaal 4-20 mA'],['it','Misurare continuamente la temperatura, segnale analogico 4-20 mA'],['zh','连续测量温度，模拟输出4-20mA']];
describe('Round2 explicit locale coverage (NL is not claimed supported)',()=>{
 for(const [lang,text] of localized)test(`L-${lang}`,()=>{
  const supported=LANGUAGES.some(l=>l.id===lang);
  const actual=observe({id:lang,a:{detection_goal:text},expected:'out-of-scope',note:'Analog temperature modality'});
  results.push({id:`L-${lang}`,category:'locale',status:actual.classification==='out-of-scope'?'PASS':'FAIL',supportedLocale:supported,expected:'out-of-scope',actual});
  expect(actual.classification).toBe('out-of-scope');
 });
});

describe('Round2 dimensions, thermal and identities',()=>{
 for(const [id,text,kind] of [
  ['E01','Sensor must fit inside 8 × 5 × 4 mm','found'],
  ['E02','Sensor maximum envelope 0,8 × 0,5 × 0,4 cm','found'],
  ['E03','Magnet dimensions 8x5x4 mm',null],
  ['E04','Machine part dimensions 8 × 5 × 4 mm',null],
  ['E05','Sensor cable length 2 m',null],
 ] as const)test(id,()=>{
  const actual=detectEnvelopeFromText(req({mounting:text}),'');
  const got=actual?.kind??null;
  results.push({id,category:'dimensions',status:got===kind?'PASS':'FAIL',expected:kind,actual});
  expect(got).toBe(kind);
  if(actual?.kind==='found')expect(actual.envelope).toEqual({lengthMm:8,widthMm:5,heightMm:4});
 });
 test('T01 Fahrenheit and decimal comma independent arithmetic',()=>{expect(temperaturesC('sensor 300°f')[0]).toBeCloseTo((300-32)*5/9,1);expect(temperaturesC('sensor 392°f')[0]).toBe(200);expect(temperaturesC('sensor 140,5°c')[0]).toBe(140.5);});
 test('T02 fixed vs mobile MK21 and both MK04 bounds',()=>{expect(thermalWarning('MK21',{min:-40,max:140})?.status).toBe('conditional');expect(thermalWarning('MK04',{min:-40,max:85})?.status).toBe('exceeded');expect(thermalWarning('MK21',{min:-30,max:140})).toBeNull();});
 test('T03 MK24 family and exact variant preserved',()=>{expect(sensorDisplayTitle('MK24-A-J')).toBe('MK24');expect(sensorDisplayVariant('MK24-A-J')).toBeTruthy();expect(sensorById('MK24-A-J').terminalSpan).toBe(5.5);});
 test('T04 press-fit vs threaded independently known shape',()=>{expect(sensorById('MK11-M8').shape).toBe('threaded');expect(sensorById('MK36').shape).toBe('pressfit');expect(pairCardFor(sensorById('MK36')).fixingLabel).not.toContain('taraud');});
 test('T05 pure fitting cannot silently mutate sensor requirement',()=>{const a=req(door);const frozen=a.map(r=>Object.freeze({...r}));expect(()=>assessApplicationFit(frozen,'',{mountingChosen:false,envelopeSet:false})).not.toThrow();expect(frozen.map(r=>r.value)).toEqual(ORDER.map(k=>door[k]??''));});
 for(const filler of ['I do not know','je ne sais pas','no sé','weiß nicht'])test(`Filler ${filler}`,()=>expect(isSubstantive(filler)).toBe(false));
});

function answeredBusiness(){const d=createDossier('2026-10-12T13:03:00Z');d.business={...d.business,annualVolume:{kind:'known',sensorsPerYear:2700},projectPhase:'exploration',seriesStartDate:'2028-02-29',seriesDurationYears:4.5,contactEmail:'qa@example.invalid',siteCity:'Lyon',siteCountry:'FR'};return d;}
describe('Round2 client business gates; no server assertion',()=>{
 for(const field of ['annualVolume','projectPhase','seriesStartDate','seriesDurationYears'] as const)test(`B-${field} explicit undefined marker is per-field`,()=>{
  const d=answeredBusiness();const fresh=createDossier('2026-10-12T13:03:00Z');Object.assign(d.business,{[field]:fresh.business[field]});
  expect(missingBusinessContext(d)).toEqual([BUSINESS_FIELD_MESSAGES[field]]);
  d.business.undefinedFields=[field];expect(missingBusinessContext(d)).toEqual([]);
  d.business.undefinedFields=['unrelated'];expect(missingBusinessContext(d)).toEqual([BUSINESS_FIELD_MESSAGES[field]]);
 });
 for(const n of [0,-1,1.5,NaN,Infinity,1000000001])test(`B-volume ${n} rejected`,()=>{const d=answeredBusiness();d.business.annualVolume={kind:'known',sensorsPerYear:n};expect(missingBusinessContext(d)).toContain(BUSINESS_FIELD_MESSAGES.annualVolume);});
 for(const n of [0,-1,NaN,Infinity,100.01])test(`B-duration ${n} rejected`,()=>{const d=answeredBusiness();d.business.seriesDurationYears=n;expect(missingBusinessContext(d)).toContain(BUSINESS_FIELD_MESSAGES.seriesDurationYears);});
 for(const s of ['2027-02-29','2026-04-31','2026-13-01','2026-10-12T00:00:00Z'])test(`B-date ${s}`,()=>expect(isIsoDate(s)).toBe(false));
 test('B-optional NDA and real local checkSubmission bound consent',async()=>{
  const input:SubmissionInput={dossier:answeredBusiness(),nda:{...INITIAL_NDA},consents:[],reviewAcknowledged:true,additionalConstraints:''};
  const binding=await submissionBinding(input);input.consents=[{kind:'supabase_dossier',binding,grantedAt:'2026-10-12T13:03:00Z',contentSummary:'Synthetic QA only',recipients:['Standex']}];
  expect(await checkSubmission(input)).toEqual({ok:true});
  input.dossier.business.seriesStartDate='2027-02-29';const check=await checkSubmission(input);expect(check.ok).toBe(false);if(!check.ok)expect(check.problems).toContain(BUSINESS_FIELD_MESSAGES.seriesStartDate);
 });
});

// Rendering the actual components; only identity/readiness is replaced. No RPC
// submission is invoked; all questionnaire state lives in component memory.
mock.module('@/lib/leadmagnet/backend',()=>({checkLeadBackend:async()=>({configured:true,schemaReady:true,authenticated:true,role:null,ready:true,version:'test-only',message:'',adminDetail:'',capabilities:{authenticated:true,userId:'synthetic',role:null,assignedDossiers:[]}}),staffActionEnabled:()=>false,LEAD_MIGRATION_FILE:'',UNAVAILABLE_MESSAGE:'',READY_MESSAGE:''}));
mock.module('@/lib/standex/supabase',()=>({isSupabaseConfigured:true,requireSupabase:()=>({}),supabase:{auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe:()=>undefined}}})}}}));
mock.module('@radix-ui/react-use-layout-effect',()=>({useLayoutEffect:React.useLayoutEffect}));
const { DesignSpace }=await import('@/components/leadmagnet/design-space');
const { ConnectorChoices }=await import('@/components/leadmagnet/connector-choices');
const router=createRouter({routeTree:createRootRoute({component:()=>null}),history:createMemoryHistory({initialEntries:['/']}),origin:'https://exemple.invalid'});
function restoreDOM(){if(typeof document==='undefined'||typeof window==='undefined'){try{GlobalRegistrator.unregister();}catch{}GlobalRegistrator.register({url:'https://exemple.invalid/'});}}
beforeEach(()=>{restoreDOM();setLocale('fr');setWebGLSupportForTests(false);});
afterEach(()=>{cleanup();setLocale('fr');setWebGLSupportForTests(null);writeFileSync('/tmp/qa-round2/results.json',JSON.stringify(results,null,2));});
function space(){return render(<RouterContextProvider router={router}><DesignSpace visible/></RouterContextProvider>);}
async function change(el:HTMLElement,value:string){
 const setter=Object.getOwnPropertyDescriptor(el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value')?.set;
 const key=Object.keys(el).find(k=>k.startsWith('__reactProps$'));
 const props=key?(el as unknown as Record<string,{onChange?:(e:{target:HTMLElement})=>void}>)[key]:undefined;
 if(!setter||!props?.onChange)throw new Error('Native value setter or real React handler absent');
 await act(async()=>{setter.call(el,value);props.onChange?.({target:el});});
}
async function fillSix(view:RenderResult,a:Answers){for(let i=0;i<ORDER.length;i++){expect(view.getByText(`Question ${i+1} sur 6`)).toBeTruthy();const key=ORDER[i];if(key&&a[key])await change(view.getByLabelText('Votre réponse'),a[key]??'');if(i<5)await act(async()=>{fireEvent.click(view.getByRole('button',{name:'Continuer'}));});}}
async function pairs(view:RenderResult){await act(async()=>{fireEvent.click(view.getByRole('button',{name:'2. Couples proposés'}));});await waitFor(()=>expect(/D'après vos réponses|Exploration du catalogue|étude d'ingénierie|Décrivez votre besoin|à revoir avant de proposer/.test(view.container.ownerDocument.body.textContent??'')).toBe(true),{timeout:15000});}
describe('Round2 12 real render/integration interactions, SVG not WebGL',()=>{
 test('U01 safe PLC + independent mains contactor retains cards',async()=>{const v=space();const f=fixtures.find(x=>x.id==='R12');if(!f)throw new Error('Missing oracle');await fillSix(v,f.a);await pairs(v);expect(within(v.container.ownerDocument.body).getAllByTestId('pair-card').length).toBeGreaterThan(0);},30000);
 test('U02 sensor 200°C no cards, concise engineering disclosure closed',async()=>{const v=space();await fillSix(v,{...door,environment:'Sensor must operate at 200°C'});await pairs(v);const b=within(v.container.ownerDocument.body);expect(b.queryAllByTestId('pair-card')).toHaveLength(0);const details=b.getAllByTestId('fit-details');expect(details.length).toBeGreaterThan(0);for(const d of details)expect((d as HTMLDetailsElement).open).toBe(false);expect(b.getAllByText(/Aucune correspondance standard documentée/).length).toBeGreaterThan(0);},30000);
 test('U03 -40..85 retains cards AND thermal warnings',async()=>{const v=space();await fillSix(v,{...door,environment:'Sensor operating range -40..+85°C'});await pairs(v);const b=within(v.container.ownerDocument.body);expect(b.getAllByTestId('pair-card').length).toBeGreaterThan(0);expect(b.getAllByTestId('thermal-warning').length).toBeGreaterThan(0);},30000);
 test('U04 dimensions inside requires consent then keeps dimensions on return',async()=>{const v=space();for(let i=0;i<3;i++)await act(async()=>fireEvent.click(v.getByRole('button',{name:'Continuer'})));await change(v.getByLabelText('Votre réponse'),'The sensor must fit inside 8 × 5 × 4 mm');expect(v.getByTestId('envelope-hint')).toBeTruthy();expect((v.getByLabelText('Longueur') as HTMLInputElement).value).toBe('');await act(async()=>fireEvent.click(v.getByTestId('envelope-apply')));expect((v.getByLabelText('Longueur') as HTMLInputElement).value).toBe('8');await act(async()=>fireEvent.click(v.getByRole('button',{name:'Question précédente'})));await act(async()=>fireEvent.click(v.getByRole('button',{name:'Continuer'})));expect((v.getByLabelText('Hauteur') as HTMLInputElement).value).toBe('4');},30000);
 test('U05 magnet dimensions never creates consent hint',async()=>{const v=space();for(let i=0;i<3;i++)await act(async()=>fireEvent.click(v.getByRole('button',{name:'Continuer'})));await change(v.getByLabelText('Votre réponse'),'Magnet dimensions 8x5x4 mm, sensor cable 2 m');expect(v.queryByTestId('envelope-hint')).toBeNull();expect((v.getByLabelText('Longueur') as HTMLInputElement).value).toBe('');},30000);
 test('U06 blank end button disabled and no recommended cards',async()=>{const v=space();await fillSix(v,{});expect((v.getByRole('button',{name:'Voir les capteurs proposés'}) as HTMLButtonElement).disabled).toBe(true);await pairs(v);expect(within(v.container.ownerDocument.body).queryAllByTestId('pair-card')).toHaveLength(0);},30000);
 test('U07 no-magnet ferrous MK02 must not declare all magnetic detection impossible',async()=>{const v=space();await fillSix(v,{detection_goal:'Detect ferrous steel target approaching',target_object:'No external magnet. MK02 has integrated bias magnet and a steel target.',states_motion:'Target close to housing'});await pairs(v);expect(within(v.container.ownerDocument.body).queryAllByText(/Détecter sans aimant ni matière ferreuse/)).toHaveLength(0);expect(within(v.container.ownerDocument.body).queryAllByTestId('pair-card').length).toBeGreaterThan(0);},30000);
 test('U08 four distinct previews before selecting, siblings, no fifth on disclosure',async()=>{const v=render(<ConnectorChoices termination={{kind:'bare_leads'}} onSelect={()=>undefined}/>);const p=v.container.querySelectorAll('[data-housing]');expect(p).toHaveLength(4);expect(new Set([...p].map(e=>e.getAttribute('data-housing'))).size).toBe(4);for(const e of p){expect(e.closest('button,details')).toBeNull();expect(e.getAttribute('data-live')).toBe('2d');}const d=v.getByTestId('connector-technical-details') as HTMLDetailsElement;expect(d.open).toBe(false);d.open=true;fireEvent(d,new Event('toggle'));expect(d.querySelectorAll('[data-housing]')).toHaveLength(0);expect(within(d).getAllByRole('link',{name:'Source fabricant'})).toHaveLength(4);expect(d.textContent).toContain('qualifiée');});
 test('U09 preview gesture never selects; native focusable buttons preserve explicit state',async()=>{const select=mock(()=>undefined);const initial=DOCUMENTED_HOUSINGS.find(h=>h.housingMpn==='XHP-3');const next=DOCUMENTED_HOUSINGS.find(h=>h.housingMpn==='PHR-3');if(!initial||!next)throw new Error('Independent IDs absent');const v=render(<ConnectorChoices termination={terminationFromHousing(initial)} onSelect={select}/>);for(const e of v.container.querySelectorAll('[data-housing]')){fireEvent.pointerDown(e);fireEvent.pointerMove(e);fireEvent.click(e);}expect(select).not.toHaveBeenCalled();const button=v.getByRole('button',{name:'JST PHR-3'});button.focus();expect(document.activeElement).toBe(button);fireEvent.click(button);expect(select).toHaveBeenCalledWith(next);v.rerender(<ConnectorChoices termination={terminationFromHousing(next)} onSelect={select}/>);expect(v.container.querySelectorAll('[aria-pressed="true"]')).toHaveLength(1);expect(button.getAttribute('aria-pressed')).toBe('true');});
 test('U10 DesignSpace preferences reopen with second 3-position housing selected',async()=>{const v=space();await act(async()=>fireEvent.click(v.getByRole('button',{name:/4\. Avec Standex/})));const c=within(v.getByTestId('connector-choice'));await act(async()=>fireEvent.click(c.getByRole('button',{name:"J'ai une préférence"})));expect(v.container.querySelectorAll('[data-housing]')).toHaveLength(4);await act(async()=>fireEvent.click(v.getByRole('button',{name:'JST XHP-3'})));await act(async()=>fireEvent.click(c.getByRole('button',{name:'Je ne sais pas'})));expect(v.queryByTestId('connector-choices')).toBeNull();await act(async()=>fireEvent.click(c.getByRole('button',{name:"J'ai une préférence"})));expect(v.getByRole('button',{name:'JST XHP-3'}).getAttribute('aria-pressed')).toBe('true');expect(v.container.querySelectorAll('[data-housing]')).toHaveLength(4);},30000);
 test('U11 70mm tiny magnet shows explicit evidence warnings, not capability assertion',async()=>{const v=space();await fillSix(v,{...door,target_object:'2 × 2 mm magnet',states_motion:'Detect magnet at 70 mm, +/-1 mm repeatability'});await pairs(v);const p=within(v.container.ownerDocument.body).getByTestId('validation-points');expect(p.textContent).toContain(VALIDATION_POINT.tinyMagnet);expect(p.textContent).toContain(VALIDATION_POINT.precision);},30000);
 test('U12 direct high mains current renders no cards',async()=>{const v=space();await fillSix(v,{...door,electrical:'The reed directly powers the 110 VAC 5 A motor without a contactor.'});await pairs(v);expect(within(v.container.ownerDocument.body).queryAllByTestId('pair-card')).toHaveLength(0);},30000);
});
