import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { t, msg, number } from '@/lib/i18n/core';
import { DEFAULT_EXPERIMENT, EXPERIMENT, FORM_ANOMALIES, documentaryDistances, experimentAvailable, evaluatePlacement, settingsKey, type ExperimentSettings, type SampledVolume, type PlacementEvidence } from '@/lib/detection-lab/workshop-experiment';
import { PEDAGOGICAL_CASES, pedagogicalPreset, type PedagogicalFrame, type PedagogicalRemedy } from '@/lib/standex/pedagogical-poses';
import type { PlacementDiagnosis } from '@/lib/detection-lab/placement-diagnosis';
import type { WorkshopConfig } from '@/lib/standex/magnetic-workshop';
import type { Obb } from '@/lib/detection-lab/obstacles';
import { fingerprint } from '@/lib/standex/mounting/geometry';
import { CATALOGUE_MODEL_VERSION, type PivotPlan } from '@/lib/standex/catalogue-pedagogical';
import { CATALOGUE_CUT_PLANE_Z } from '@/lib/standex/catalogue-response';
const cache=new Map<string,SampledVolume>();
const cutCache=new Map<string,SampledVolume>();
/** 3D volume key: couple, class, hypotheses, FULL magnet body orientation (axis + body frame)
 * and obstacles — never the magnet's translation nor the cut plane. A pure translation at
 * constant orientation therefore reuses the same volume during playback. */
export function volumeKey(settings:ExperimentSettings,frame:PedagogicalFrame,obstacles:readonly Obb[]|null,catalogue?:WorkshopConfig):string{
 // Floating arithmetic on the return leg must not create a second copy of the same orientation.
 // 1e-10 is numerical identity only, not an angular display quantisation.
 const round=(v:number)=>Math.round(v*1e10)/1e10;
 const axis=catalogue?frame.pose.axis.map(round) as typeof frame.pose.axis:frame.pose.axis;
 const body=(frame.pose as {frame?:number[][]}).frame?.map(row=>row.map(round));
 // Discovery translations move the point through an unchanged sensor-local field.
 // Keep the volume visible while dragging; full orientation and obstacles still key it.
 const volumeConfig=catalogue?{...catalogue,lateralShift:0,start:0,end:0,offset:0}:null;
 return settingsKey(settings,axis,0)+'|'+(obstacles?fingerprint(obstacles):'free')+'|'+(catalogue?CATALOGUE_MODEL_VERSION:'frozen')+'|'+JSON.stringify(volumeConfig)+'|'+JSON.stringify(catalogue?body??null:null);
}
/** Cut key: fixed flat-face plane for catalogue; instant plane for historical staff mode. */
export function cutKey(settings:ExperimentSettings,frame:PedagogicalFrame,obstacles:readonly Obb[]|null,catalogue?:WorkshopConfig):string{
 return volumeKey(settings,frame,obstacles,catalogue)+'|plane:'+(catalogue?CATALOGUE_CUT_PLANE_Z:frame.pose.center[2]);
}
function useWorkerVolume(enabled:boolean,available:boolean,key:string,mode:'volume'|'cut',settings:ExperimentSettings,frame:PedagogicalFrame,obstacles:readonly Obb[]|null,catalogue?:WorkshopConfig){
 const store=mode==='volume'?cache:cutCache;
 const [result,setResult]=useState<SampledVolume|null>(null),[failedKey,setFailedKey]=useState<string|null>(null);
 useEffect(()=>{
  setResult(null);setFailedKey(null);
  if(!enabled||!available){return;}
  const hit=(mode==='volume'?pinned.get(key):undefined)??store.get(key);if(hit){setResult(hit);return;}
  if(typeof Worker==='undefined'){setFailedKey(key);return;}
  let current=true,worker:Worker|null=null;
  const timer=setTimeout(()=>{
   worker=new Worker(new URL('./pedagogical.worker.ts',import.meta.url),{type:'module'});
   worker.onmessage=(event:MessageEvent<{key:string;result?:SampledVolume;error?:boolean}>)=>{
    if(!current||event.data.key!==key)return;
    if(event.data.result&&event.data.result.key===key&&available){if(store.size>=12){const first=store.keys().next().value;if(first)store.delete(first);}store.set(key,event.data.result);setResult(event.data.result);}else setFailedKey(key);
    worker?.terminate();worker=null;
   };
   worker.onerror=()=>{if(current){setFailedKey(key);}worker?.terminate();};
   worker.postMessage({settings,axis:frame.pose.axis,planeZ:catalogue?CATALOGUE_CUT_PLANE_Z:frame.pose.center[2],key,mode,obstacles:obstacles??[],catalogue,frame:catalogue?(frame.pose as {frame?:unknown}).frame:undefined});
  },0);
  return ()=>{current=false;clearTimeout(timer);worker?.terminate();};
 },[enabled,available,key]);
 // Read a prepared hit synchronously. Waiting for an effect used to blank every orientation change.
 const hit=(mode==='volume'?pinned.get(key):undefined)??store.get(key);
 const volume=enabled&&available?(hit??(result?.key===key?result:null)):null;
 const failed=enabled&&available&&!hit&&failedKey===key;
 return {volume,busy:enabled&&available&&!volume&&!failed,failed};
}
/** `obstacles`: loaded part boxes in the reed frame of the SAME instant; they enter the key.
 * The volume no longer depends on the instant: it stays computed and displayed during playback. */
export function usePedagogicalVolume(enabled:boolean,settings:ExperimentSettings,frame:PedagogicalFrame,obstacles:readonly Obb[]|null=null,catalogue?:WorkshopConfig) {
 const available=!!catalogue||experimentAvailable(settings);
 return useWorkerVolume(enabled,available,volumeKey(settings,frame,obstacles,catalogue),'volume',settings,frame,obstacles,catalogue);
}
/** Instantaneous cut: follows the chosen plane, recomputed on pause or plane change only. */
export function usePedagogicalCut(enabled:boolean,settings:ExperimentSettings,frame:PedagogicalFrame,obstacles:readonly Obb[]|null=null,catalogue?:WorkshopConfig) {
 const available=!!catalogue||experimentAvailable(settings);
 return useWorkerVolume(enabled,available,cutKey(settings,frame,obstacles,catalogue),'cut',settings,frame,obstacles,catalogue);
}
/** Pinned volumes of the CURRENT preparation: never evicted while it runs or plays; replaced
 * wholesale by the next preparation (token). The general cache stays bounded at 12. */
let pinned=new Map<string,SampledVolume>(),pinToken=0;
export type PrepRequest={key:string;settings:ExperimentSettings;frame:PedagogicalFrame;obstacles:readonly Obb[]|null;catalogue?:WorkshopConfig};
/** Pivot preparation: (1) worker computes the adaptive orientation plan, (2) each exact planned
 * orientation volume is computed and pinned. Cancel terminates the worker; a stale token never
 * writes nor calls onDone. onDone(null) = failure (playback must not start). */
export function preparePivot(config:WorkshopConfig,request:(t:number)=>PrepRequest,onDone:(plan:PivotPlan|null)=>void,maxVolumes=Infinity,factory:()=>Worker=()=>new Worker(new URL('./pedagogical.worker.ts',import.meta.url),{type:'module'}),onProgress?:(done:number,total:number)=>void):()=>void{
 const token=++pinToken,next=new Map<string,SampledVolume>(),previous=pinned;
 let worker:Worker;try{worker=factory();}catch{onDone(null);return()=>{};}
 pinned=next;
 let live=true,plan:PivotPlan|null=null,pending:PrepRequest[]=[],index=0;
 const finish=(p:PivotPlan|null)=>{if(!live||token!==pinToken)return;live=false;worker.terminate();if(p)pinned=next;onDone(p);};
 const send=()=>{onProgress?.(index,pending.length);const r=pending[index];if(!r){finish(plan);return;}
  const hit=previous.get(r.key)??cache.get(r.key);if(hit){next.set(r.key,hit);index++;send();return;}
  worker.postMessage({settings:r.settings,axis:r.frame.pose.axis,planeZ:0,key:r.key,mode:'volume',obstacles:r.obstacles??[],catalogue:r.catalogue,frame:r.catalogue?(r.frame.pose as {frame?:unknown}).frame:undefined});};
 worker.onmessage=(event:MessageEvent<{key:string;result?:SampledVolume;plan?:PivotPlan;error?:boolean}>)=>{
  if(!live||token!==pinToken)return;
  if(!plan){if(!event.data.plan){finish(null);return;}
   const samples=event.data.plan.samples.slice(0,maxVolumes),kept=new Set(samples);
   plan={samples,truncated:event.data.plan.samples.length>maxVolumes,intervals:event.data.plan.intervals.map(i=>({...i,certified:i.certified&&kept.has(i.t0)&&kept.has(i.t1)}))};
   pending=[...new Map(samples.map(t=>{const r=request(t);return [r.key,r] as const;})).values()];send();return;}
  const r=pending[index];
  if(!r||event.data.key!==r.key||!event.data.result||event.data.result.key!==r.key){finish(null);return;}
  next.set(r.key,event.data.result);index++;send();
 };
 worker.onerror=()=>finish(null);
 // Shared pose adapter resolves the loaded clip HERE. The worker receives numeric orientations,
 // never clip tracks or registry references. 256 includes every midpoint of the 1/128 plan.
 const orientations=Array.from({length:257},(_,i)=>({t:i/256,pose:request(i/256).frame.pose}));
 worker.postMessage({key:'plan:'+token,mode:'plan',catalogue:config,orientations,settings:request(0).settings,axis:[0,1,0],planeZ:0});
 return()=>{if(live){live=false;worker.terminate();}};
}
export function volumeCacheHas(key:string):boolean{return cache.has(key)||pinned.has(key);}
export function pinnedVolume(key:string):SampledVolume|undefined{return pinned.get(key);}

/* i18n-canonical: shared placement labels translated at the point of display. */
export const PLACEMENT_LABEL={favorable:'Placement favorable',variable:'Détection variable',unfavorable:'Placement défavorable',unavailable:'Estimation indisponible'};
/* No 'distance'/'orientation' fallback: those come only from the diagnosis layer. */
const CAUSE_LABEL:Partial<Record<PlacementEvidence['cause'],string>>={motion:'Mouvement non confirmé : estimation indisponible',clip:'Clip absent ou non pris en charge : estimation indisponible',asset:'Fichier 3D non chargé ou géométrie invalide : estimation indisponible',reed_overlap:'Chevauchement possible du reed, logement à vérifier : estimation indisponible',scenario_overlap:'Pose nominale dégagée ; chevauchement possible du reed dans une hypothèse de position ±1 mm',overlap:'Chevauchement possible du corps de l’aimant avec l’enveloppe d’une pièce, à vérifier : estimation indisponible',collision:'Collision du corps de l’aimant avec l’enveloppe ou le montage',scenario_collision:'Pose nominale valide ; collision dans une hypothèse',domain:'Hors du domaine de calcul',missing:'Aimant, reed ou intégration non caractérisés',material:'Matériau voisin non pris en compte',stale:'Ancienne version : recalcul nécessaire',partial:'Classe A partielle : ATmax 10 seulement, seconde surface non caractérisée'};
/* i18n-canonical: diagnosed causes (explanation only, never a new state). */
export const DIAGNOSIS_LABEL:Record<string,string>={central:'Zone centrale entre les deux lobes',axial:'Orientation défavorable sur le prolongement axial du reed',orientation:'Orientation défavorable à cet endroit',distance:'Aimant trop éloigné à cette orientation',combined:'Trop éloigné et orientation défavorable à cet endroit',hypotheses:'Réponse nominale suffisante ; le résultat dépend de la sensibilité ou des hypothèses internes',undetermined:'Cause non déterminée'};
export function causeLabel(d:PlacementDiagnosis,evidence:PlacementEvidence):string{
  return DIAGNOSIS_LABEL[d.cause]??CAUSE_LABEL[d.cause as PlacementEvidence['cause']]??CAUSE_LABEL[evidence.cause]??'Cause non déterminée';
}
/** Banner finding: at most one short line, explicitly limited to the trials. Never a remedy. */
export function findingLabels(d:PlacementDiagnosis):string[]{
  if(!['central','axial','undetermined'].includes(d.cause)||d.rotationInPlace!=='insufficient')return [];
  return [d.closerAndRotated?'Dans les essais, distance et orientation contribuent au résultat':'Les rotations testées seules ne suffisent pas à cet endroit'];
}
/** Technical detail of the same nominal trials, folded in « Sources et limites ». */
export function findingDetails(d:PlacementDiagnosis):string[]{
  if(!['central','axial','undetermined'].includes(d.cause)||!d.rotationInPlace)return [];
  if(d.rotationInPlace==='sufficient')return ['Essai nominal : une autre orientation testée au même endroit atteint le seuil nominal (pas un placement vérifié)'];
  return ['Essai nominal : les orientations testées à position constante restent sous le seuil nominal',
    d.closerAndRotated?'Essai nominal : le seuil est atteint en combinant un des rapprochements testés et une rotation ; constat, aucun remède proposé':'Essai nominal : ni les rotations ni les rapprochements testés combinés n’atteignent le seuil'];
}
export function remedyLabel(r:PedagogicalRemedy):string|null{
  if(r.kind==='verified')return r.rotationDeg&&r.lateralMm?msg('Placement favorable vérifié : rotation de {0}° et décalage de {1} mm',[r.rotationDeg,number(r.lateralMm,2)]):r.rotationDeg?msg('Placement favorable vérifié : rotation de {0}°',[r.rotationDeg]):msg('Placement favorable vérifié : décalage de {0} mm',[number(r.lateralMm,2)]);
  if(r.kind==='none-found')return t('Aucun placement favorable trouvé dans les mouvements autorisés');
  if(r.kind==='no-freedom')return t('Aucune liberté de mouvement déclarée : aucune action proposée');
  if(r.kind==='locked')return t('Montage importé : aucun mouvement proposé hors de ce montage');
  return t('Mouvement non pris en charge par la recherche : aucune action proposée');
}
export function PedagogicalBanner({evidence,diagnosis,remedy,onPropose}:{evidence:PlacementEvidence;diagnosis?:PlacementDiagnosis|null;remedy?:PedagogicalRemedy|null;onPropose?:(r:PedagogicalRemedy)=>void}) {
  // Not analysed (e.g. during playback): known unavailability reasons stay; never a stale cause or remedy.
  const pending=!diagnosis&&evidence.state!=='favorable'&&evidence.state!=='unavailable';
  const cause=evidence.state==='favorable'?null:diagnosis?causeLabel(diagnosis,evidence):evidence.state==='unavailable'?CAUSE_LABEL[evidence.cause]??'Cause non déterminée':'Mettre en pause pour analyser la cause';
  const findings=diagnosis&&evidence.state!=='favorable'?findingLabels(diagnosis):[];
  const remedyText=evidence.state!=='favorable'&&diagnosis&&remedy?remedyLabel(remedy):null;
  return <div className={`mw-verdict-banner notice-${evidence.state==='unfavorable'?'warning':'info'}`} role="status" data-testid="pedagogical-verdict" data-cause={evidence.state==='favorable'?'none':pending?'pending':diagnosis?.cause??evidence.cause}>
    <strong className="t-title-s">{t(PLACEMENT_LABEL[evidence.state])}</strong>
    <span className="t-caption">{t('Estimation indicative')}</span>
    {cause&&<span className="t-body" data-testid="pedagogical-cause">{t(cause)}</span>}
    {findings.map(f=><span key={f} className="t-caption" data-testid="pedagogical-finding">{t(f)}</span>)}
    {remedyText&&<span className="t-caption" data-testid="pedagogical-remedy">{remedyText}{remedy?.kind==='verified'&&onPropose&&<> <Button variant="secondary" onClick={()=>onPropose(remedy)}>{t('Proposer ce placement')}</Button></>}</span>}
  </div>;
}
export function PedagogicalControls({diagnosis,timelineNote,settings,setSettings,config,update,frame,busy,volume,failed,onSuggest,onUndo,canUndo,mounting}:{
  diagnosis?:PlacementDiagnosis|null;timelineNote?:import('react').ReactNode;mounting?:{parts:number;reedOverlap:string[]}|null;settings:ExperimentSettings;setSettings:(s:ExperimentSettings)=>void;config:WorkshopConfig;update:(p:Partial<WorkshopConfig>)=>void;frame:PedagogicalFrame;busy:boolean;volume:SampledVolume|null;failed:boolean;onSuggest:()=>void;onUndo:()=>void;canUndo:boolean;
}) {
  const canonical=!config.machine&&config.motion==='approach'&&config.magnetTilt===0;
  const approach=canonical?(config.geometry==='D3'&&config.magnetAngle===0&&config.lateralShift===0?'D3':config.geometry==='D1'&&config.magnetAngle===0&&config.lateralShift===0?'D1':config.geometry==='D1'&&Math.abs(config.magnetAngle)===90?'D4':null):null;
  const distances=approach?documentaryDistances(settings,approach):[];
  const change=(patch:Partial<ExperimentSettings>)=>setSettings({...settings,...patch});
  return <div className="mw-ped-controls">
    <h2 className="t-title-m">{t('Atelier pédagogique')}</h2>
    <label className="mw-select-label">{t('Aimant pilote vérifié')}<select aria-label={t('Aimant pilote vérifié')} value={settings.magnetId} onChange={e=>change({magnetId:e.target.value})}><option value="SMCO5-5X4">SmCo5 · Ø5 × 4 mm</option><option value="N45-4X19">N45 · Ø4 × 19 mm</option></select></label>
    {!config.machine&&<>
      <label className="mw-select-label">{t('Orientation')}<select value="" onChange={e=>{const value=e.target.value;if(value==='axial')update({geometry:'D3',magnetAngle:0,lateralShift:0});else update({geometry:'D1',magnetAngle:value==='parallel'?0:value==='oblique'?45:90,lateralShift:value==='offset'?8:0});}}><option value="" disabled>{t('Choisir une orientation')}</option><option value="parallel">{t('Parallèle')}</option><option value="perpendicular">{t('Perpendiculaire centré')}</option><option value="offset">{t('Perpendiculaire décalé')}</option><option value="axial">{t('Axial')}</option><option value="oblique">{t('Oblique 45°')}</option></select></label>
      <label className="mw-field"><span>{t('Rotation libre')}<output className="t-metric">{config.magnetAngle}°</output></span><input type="range" aria-label={t('Rotation libre')} min="-180" max="180" step="1" value={config.magnetAngle} onChange={e=>update({magnetAngle:Number(e.target.value)})}/></label>
      {config.motion==='slide'?<>
        {/* Slide pose = [-travel..travel, offset]: these controls drive exactly those values. */}
        <label className="mw-field"><span>{t('Profondeur minimale')}<output className="t-metric">{config.offset} mm</output></span><input type="range" aria-label={t('Profondeur minimale')} min="6" max="30" step=".25" value={config.offset} onInput={e=>update({offset:Number(e.currentTarget.value)})}/></label>
        <label className="mw-field"><span>{t('Course')}<output className="t-metric">{config.travel*2} mm</output></span><input type="range" aria-label={t('Course')} min="20" max="100" step="2" value={config.travel*2} onChange={e=>update({travel:Number(e.target.value)/2})}/></label>
      </>:<>
        <label className="mw-field"><span>{t('Décalage latéral')}<output className="t-metric">{config.lateralShift} mm</output></span><input type="range" aria-label={t('Décalage latéral')} min="-24" max="24" step=".25" value={config.lateralShift} onInput={e=>update({lateralShift:Number(e.currentTarget.value)})}/></label>
        <label className="mw-field"><span>{t('Profondeur minimale')}<output className="t-metric">{config.end} mm</output></span><input type="range" aria-label={t('Profondeur minimale')} min="1" max="24" step=".25" value={config.end} onInput={e=>{const end=Number(e.currentTarget.value);update({end,start:Math.min(60,end+config.start-config.end)});}}/></label>
        <label className="mw-field"><span>{t('Course')}<output className="t-metric">{config.start-config.end} mm</output></span><input type="range" aria-label={t('Course')} min="2" max="40" value={config.start-config.end} onChange={e=>update({start:config.end+Number(e.target.value)})}/></label>
      </>}
      <p className="t-caption" data-testid="pedagogical-depth-datum">{t('Profondeur : centre de l’aimant → repère du reed. Les distances de brochure se mesurent de la face de l’aimant au repère : pas de comparaison directe au millimètre.')}</p>
    </>}
    <p className="t-caption" role="status">{volume?.reedBlocked?t('Chevauchement possible du reed, logement à vérifier : estimation indisponible'):t(busy?'Calcul des volumes en cours…':failed?'Volumes indisponibles : calcul interrompu':volume?'Volumes recalculés':'Volumes en attente')}</p>
    <details className="mw-advanced"><summary>{t('Avancés')}</summary>
      <label className="mw-select-label">{t('Classe de sensibilité')}<select value={settings.className} onChange={e=>change({className:e.target.value})}>{['A','B','C','D','E','F','G'].map(c=><option key={c}>{c}</option>)}</select></label>
      <p className="t-caption">{t('Hypothèses : robustesse magnétique ; un montage importé contrôle aussi le dégagement du reed déplacé de ±1 mm.')}</p>
      <label><input type="checkbox" checked={settings.hypotheses} onChange={e=>change({hypotheses:e.target.checked})}/>{t('Hypothèses internes : longueur ±30 %, position ±1 mm, moment ±10 %')}</label>
      <p className="t-caption">{t('Noyau nominal et robustesse du placement sont distincts. Ni probabilité, ni tolérance fabricant.')}</p>
      <label><input type="checkbox" checked={settings.integration==='form66'} onChange={e=>change({integration:e.target.checked?'form66':'unknown'})}/>{t('Montage Form66 exploratoire au repère reed explicite')}</label>
      <label><input type="checkbox" checked={settings.nearbyMaterial} onChange={e=>change({nearbyMaterial:e.target.checked})}/>{t('Matériau voisin non pris en compte')}</label>
      <label><input type="checkbox" checked={settings.rotationFreedom} onChange={e=>change({rotationFreedom:e.target.checked})}/>{t('Liberté déclarée : rotation ±90°')}</label>
      <label className="mw-field"><span>{t('Liberté latérale déclarée')}<output className="t-metric">{settings.lateralFreedomMm} mm</output></span><input type="range" aria-label={t('Liberté latérale déclarée')} min="0" max="12" step=".25" value={settings.lateralFreedomMm} onChange={e=>change({lateralFreedomMm:Number(e.target.value)})}/></label>
      <Button variant="secondary" onClick={onSuggest}>{t('Chercher un placement favorable')}</Button>
      <p className="t-caption">{t('Sans liberté déclarée ou sous fixation verrouillée, aucune suggestion disponible. L’alignement mécanique ne valide pas la détection.')}</p>
      {canUndo&&<Button variant="secondary" onClick={onUndo}>{t('Annuler le placement proposé')}</Button>}
      <label><input type="checkbox" checked={config.polarity===-1} onChange={e=>update({polarity:e.target.checked?-1:1})}/>{t('Inverser N/S')}</label>
    </details>
    {config.machine?<p className="t-caption" data-testid="pedagogical-cases-unavailable">{t('Cas pédagogiques réservés à l’atelier libre : un montage importé garde ses propres poses.')}</p>:
    <details className="mw-advanced"><summary>{t('Six cas pédagogiques')}</summary>{PEDAGOGICAL_CASES.map(c=><Button key={c.id} variant="secondary" onClick={()=>{const p=pedagogicalPreset(c.id,settings.magnetId);if(!p)return;change({className:p.className});update(p.config);}}>{t(c.label)}</Button>)}</details>}
    {config.machine&&<p className="t-caption" data-testid="pedagogical-mounting">{mounting?<>{msg('Montage importé : boîtes englobantes de {0} pièces, mêmes poses que la scène ; dégagement établi seulement dans cette approximation.',[mounting.parts])}{mounting.reedOverlap.length>0&&<> {t('Chevauchement possible du reed, logement à vérifier : estimation indisponible')}</>}</>:t('Fichier 3D non chargé ou géométrie invalide : estimation indisponible')}</p>}
    {volume?.truncated&&<p className="notice-warning t-caption">{t('Lobes tronqués aux limites du domaine affiché ±24 mm ; aucune fermeture physique déduite.')}</p>}
    {distances.length>0&&<details className="mw-advanced" data-testid="pedagogical-distances"><summary>{t('Distances indicatives, calibrées sur la brochure Standex')}</summary>
      <p className="t-caption">{t('Maximum du lobe documenté, pas une portée dans la position affichée.')}</p>
      {distances.map(r=><p className="t-body" key={r.bound} data-testid="pedagogical-bound">{t(r.bound==='up'?'Borne prudente':'Borne haute indicative')} : {r.prudentMm===null?t('Estimation indisponible'):<span className="t-metric">{number(r.prudentMm,1)} mm</span>}</p>)}
      <p className="t-caption">{t('Correction D4 avant arrondi prudent ; volumes non corrigés.')}</p>
      <details><summary>{t('Provenance')}</summary>{distances.map(r=><p className="t-caption" key={r.bound}>{r.approach} · {r.bound} · {t('Publié')} {number(r.publishedMm??0,1)} mm</p>)}</details>
    </details>}
    <details className="mw-advanced" data-testid="pedagogical-sources"><summary>{t('Sources et limites')}</summary>
      <p className="t-caption" data-testid="pedagogical-hypotheses-mode">{t(settings.hypotheses?'Verdict : accord des neuf hypothèses internes, sans garantie de fabrication':'Verdict : scénario nominal seul (hypothèses internes désactivées), sans garantie de fabrication')}</p>
      <p className="t-caption">{t('Les suggestions de placement restent toujours vérifiées avec les neuf hypothèses.')}</p>
      <p className="t-caption">{t('Les deux lobes sont nominaux (bornes de la classe), distincts du verdict.')}</p>
      <p className="t-caption">{t('Repère reed Form66 exploratoire')}</p>
      <p className="t-caption">{t('Capteur générique, reed 66 monté : gabarit exploratoire égal à l’enveloppe mécanique testée, pas les dimensions d’un boîtier commercial.')}</p>
      {volume&&<p className="t-caption">{t('Volumes nominaux indicatifs, non corrigés')} · <span className="t-metric">{number(volume.computeMs/1000,2)} s</span> · <span className="t-metric">{volume.nodeCount}</span> {t('positions calculées')}</p>}
      {timelineNote}
      {diagnosis&&findingDetails(diagnosis).map(f=><p key={f} className="t-caption" data-testid="pedagogical-finding-detail">{t(f)}</p>)}
      <p className="t-caption">{t('Distances indicatives, calibrées sur la brochure Standex. B–E, deux aimants, montage Form66 ; modèle 3D pédagogique non qualifié.')}</p>
      <p className="t-caption">{t('A : ATmax 10 seulement. F : SmCo D3-up indisponible, D4-to hors tolérance, D5 absent. G hors périmètre.')}</p>
      <p className="t-caption">{t('Repère axial et correction D4 documentaires uniquement ; aucun déplacement du volume. Correction D4 avant arrondi prudent à 0,5 mm, jamais une marge physique.')}</p>
      <p className="t-metric">B / C1 · L = {number(EXPERIMENT.effectiveLengthMm,6)} mm · k = {number(EXPERIMENT.kMtPerAt,8)} mT/AT</p>
      <p className="t-caption">{t('Capsule conservative testée : 16,2 × Ø2,2 mm ; verre publié : 14 mm maximum ; longueur effective hypothétique distincte.')}</p>
      {FORM_ANOMALIES.map(a=><p key={a.className} className="t-caption">N45 D3 {a.className}-{a.bound} {a.publishedMm} mm = D1 {a.d1Mm} mm · {t('Recopie D1→D3 suspectée, non confirmée par le fabricant')}</p>)}
      <a href="https://standexdetect.com/resources/reed-technology-academy/reed-sensor-activation-distances/" target="_blank" rel="noreferrer">{t('Source Standex ↗')}</a>
    </details>
  </div>;
}
export { DEFAULT_EXPERIMENT, evaluatePlacement };/** Pivot status notes, shown independently of the circuit toggle. */
export function PivotNotes({failed,hidden}:{failed:boolean;hidden:boolean}){
 if(!failed&&!hidden)return null;
 return <div className="notice-info" data-testid="pivot-notes">
  {failed&&<p className="t-caption" role="alert">{t('Préparation impossible : zones non affichées, temps conservé.')}</p>}
  {hidden&&<p className="t-caption" role="status" data-testid="pivot-hidden">{t('Zones non disponibles pour cette orientation pendant le mouvement. Mettez en pause pour les recalculer.')}</p>}
 </div>;
}
