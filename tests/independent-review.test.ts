import { test, expect } from 'bun:test';
import { EMPTY_CABLING, estimateCableLength, compareStandardLengths } from '../src/lib/leadmagnet/cabling';
import { evaluateCandidates } from '../src/lib/leadmagnet/candidates';
import { createDossier } from '../src/lib/leadmagnet/dossier';
import { createOffer } from '../src/lib/leadmagnet/review';
import { buildSnapshot } from '../src/lib/leadmagnet/submission';
import { INITIAL_NDA } from '../src/lib/leadmagnet/nda';

const cable = () => ({...EMPTY_CABLING,sensorEndpoint:[0,0,0] as [number,number,number],connectionEndpoint:[100,0,0] as [number,number,number]});
test('negative cable reserves cannot reduce the required length',()=>{
  let refused=false;
  try { const result=estimateCableLength({...cable(),serviceReserveMm:-50}); refused=!result.complete; } catch { refused=true; }
  expect(refused).toBe(true);
});
test('non-finite cable coordinates cannot produce a complete estimate',()=>{
  let refused=false;
  try { const result=estimateCableLength({...cable(),connectionEndpoint:[NaN,0,0]}); refused=!result.complete; } catch { refused=true; }
  expect(refused).toBe(true);
});
test('an incomplete motion-state path cannot produce a complete estimate',()=>{
  let refused=false;
  try { const result=estimateCableLength({...cable(),statePaths:[{stateId:'open',label:'Open',points:[[0,0,0]]}]}); refused=!result.complete; } catch { refused=true; }
  expect(refused).toBe(true);
});
test('maximum manufacturing tolerance must fit the available surplus space',()=>{
  const result=compareStandardLengths('EXACT-200',150,50,[{mpn:'EXACT-200',nominalMm:200,toleranceMm:10,source:'Synthetic tolerance case'}]);
  expect(result.kind).not.toBe('standard_possible');
});
test('a stopping collar wider than a hole is not evidence that the body cannot enter',()=>{
  const result=evaluateCandidates({mounting:{kind:'press_fit',holeDiameterMm:9.5},envelope:{lengthMm:null,widthMm:null,heightMm:null}}).find(x=>x.id==='MK36');
  expect(result?.status).not.toBe('excluded');
});
const review={id:'review-A',dossierId:'project-A',revision:1,authorId:'rnd-A',createdAt:'2026-09-08T00:00:00Z',scope:'full',conditions:'test',verdict:'validated' as const,published:true,clientMessage:'test',internalNotes:null,supersededBy:null};
const offer={id:'offer-A',dossierId:'project-A',revision:1,reviewId:'review-A',authorId:'sales-A',createdAt:'2026-09-08T00:00:00Z',currency:'EUR',tiers:[{quantity:1000,unitPrice:1.2}],moq:1000,nreToolingCost:null,incoterm:'EXW',leadTimeWeeks:8,validUntil:'2026-12-31'};
test('an offer cannot borrow an approval from another project',()=>{
  expect(createOffer({...offer,dossierId:'project-B'},review,{userId:'sales-A',role:'sales'}).ok).toBe(false);
});
test('a price must be finite',()=>{
  expect(createOffer({...offer,tiers:[{quantity:1000,unitPrice:NaN}]},review,{userId:'sales-A',role:'sales'}).ok).toBe(false);
});
test('an invalid expiry date cannot make an offer valid indefinitely',()=>{
  expect(createOffer({...offer,validUntil:'2026-99-99'},review,{userId:'sales-A',role:'sales'}).ok).toBe(false);
});
test('an unpublished approval cannot support a customer offer',()=>{
  expect(createOffer(offer,{...review,published:false},{userId:'sales-A',role:'sales'}).ok).toBe(false);
});
test('a submission snapshot cannot change when its original nested state changes',async()=>{
  const d=createDossier();
  const snapshot=await buildSnapshot({dossier:d,nda:INITIAL_NDA,consents:[],reviewAcknowledged:true,additionalConstraints:''});
  const before=snapshot.dto.requirements[0]!.value;
  try { d.requirements[0]!.value='changed after submission'; } catch {}
  expect(snapshot.dto.requirements[0]!.value).toBe(before);
});
