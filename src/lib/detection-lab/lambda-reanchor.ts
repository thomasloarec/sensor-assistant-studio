/** Single-anchor documentary datum fit per response, independent of client code.
 * L, k and D4 table correction are frozen. The datum is NOT a physical reed end.
 * Old fixed-datum outputs remain separate and reproducible.
 */
import {LAMBDA_STUDY,lambdaDistanceFor} from './lambda-study';
import {PILOT_MAGNETS} from './magnets';
import {AT_CLASSES,atRange,formRowFor,thetaFor} from './pass2';
import {DATUM_ANCHOR,D4_ANCHOR,type Pass3Row} from './pass3';

export const REANCHOR_VERSION='lambda-single-anchor-1.0.0';
export function fitLambdaDatum(lambda:number,publishedAnchorMm=formRowFor('C',PILOT_MAGNETS[0]!)!.distances['D3']!.upMm!){
 const theta=thetaFor('C','up',LAMBDA_STUDY.kMtPerAt)!;
 const fixed=lambdaDistanceFor(PILOT_MAGNETS[0]!,'D3',theta,lambda);
 if(!fixed.ok||!Number.isFinite(publishedAnchorMm)||publishedAnchorMm<=0)throw new Error('LAMBDA_ANCHOR_UNAVAILABLE');
 // Exact affine datum relation: d_reported = x_center - magnet_half_length - datum.
 const deltaMm=fixed.value-publishedAnchorMm;
 const datumMm=LAMBDA_STUDY.documentaryDatumMm+deltaMm;
 const verified=lambdaDistanceFor(PILOT_MAGNETS[0]!,'D3',theta,lambda,undefined,datumMm);
 if(!verified.ok)throw new Error('LAMBDA_ANCHOR_VERIFICATION_FAILED');
 return {lambda,datumMm,deltaMm,publishedAnchorMm,residualMm:verified.value-publishedAnchorMm,anchor:DATUM_ANCHOR};
}
export function buildReanchoredTable(lambda:number,datumMm:number):Pass3Row[]{
 const table:Pass3Row[]=[];
 for(const className of AT_CLASSES)for(const magnet of PILOT_MAGNETS)for(const approach of ['D1','D3','D4','D5'] as const)for(const bound of ['up','to'] as const){
  const theta=thetaFor(className,bound,LAMBDA_STUDY.kMtPerAt)!,fr=formRowFor(className,magnet),pub=fr?.distances[approach]?.[bound==='up'?'upMm':'toMm']??null;
  const d=lambdaDistanceFor(magnet,approach,theta,lambda,undefined,datumMm),raw=d.ok?d.value:null;
  const corrected=raw===null?null:raw-(approach==='D4'?LAMBDA_STUDY.documentaryD4DeltaMm:0),err=corrected!==null&&pub!==null?corrected-pub:null;
  const isDatum=className===DATUM_ANCHOR.className&&magnet.id===DATUM_ANCHOR.magnetId&&approach===DATUM_ANCHOR.approach&&bound===DATUM_ANCHOR.bound;
  const isD4=className===D4_ANCHOR.className&&magnet.id===D4_ANCHOR.magnetId&&approach===D4_ANCHOR.approach&&bound===D4_ANCHOR.bound;
  const anomaly=magnet.id==='N45-4X19'&&approach==='D3'&&((className==='B'&&bound==='up')||(className==='C'&&bound==='to'));
  const notes=[...(anomaly?['SUSPECTED_D1_TO_D3_COPY_RETAINED']:[]),...(isD4?['LEGACY_D4_ANCHOR_EXCLUDED_NOT_REFITTED']:[])];
  table.push({className,magnetId:magnet.id,approach,bound,at:atRange(className)![bound==='up'?'max':'min'],thetaMT:theta,publishedMm:pub,estimatedRawMm:raw,estimatedMm:corrected,errorMm:err,errorPct:err!==null&&pub?100*err/pub:null,
   status:!fr?'no_source':pub===null?'missing':raw===null?'unavailable':isDatum?'anchor_datum':isD4?'anchor_d4':approach==='D1'&&['C','E'].includes(className)?'training':'control',notes});
 }
 return table;
}
