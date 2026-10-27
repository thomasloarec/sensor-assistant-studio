import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { t, msg, number } from '@/lib/i18n/core';
import { DEFAULT_EXPERIMENT, EXPERIMENT, FORM_ANOMALIES, documentaryDistances, experimentAvailable, evaluatePlacement, settingsKey, type ExperimentSettings, type SampledVolume, type PlacementEvidence } from '@/lib/detection-lab/workshop-experiment';
import type { PedagogicalFrame } from '@/lib/standex/pedagogical-poses';
import type { WorkshopConfig } from '@/lib/standex/magnetic-workshop';
const cache=new Map<string,SampledVolume>();
export function usePedagogicalVolume(enabled:boolean,settings:ExperimentSettings,frame:PedagogicalFrame) {
  const [result,setResult]=useState<SampledVolume|null>(null),[busy,setBusy]=useState(false),[failed,setFailed]=useState(false);
  // Quantization is not applied to physics orientation. The exact axis and plane enter the key.
  const key=settingsKey(settings,frame.pose.axis,frame.pose.center[2]);
  useEffect(()=>{
    setResult(null);setFailed(false);
    if(!enabled||!experimentAvailable(settings)){setBusy(false);return;}
    const hit=cache.get(key);if(hit){setResult(hit);setBusy(false);return;}
    if(typeof Worker==='undefined'){setFailed(true);return;}
    let current=true,worker:Worker|null=null;setBusy(true);
    const timer=setTimeout(()=>{
      worker=new Worker(new URL('./pedagogical.worker.ts',import.meta.url),{type:'module'});
      worker.onmessage=(event:MessageEvent<{key:string;result?:SampledVolume;error?:boolean}>)=>{
        if(!current||event.data.key!==key)return;
        if(event.data.result&&event.data.result.key===key&&experimentAvailable(settings)){if(cache.size>=3){const first=cache.keys().next().value;if(first)cache.delete(first);}cache.set(key,event.data.result);setResult(event.data.result);}else setFailed(true);
        setBusy(false);worker?.terminate();worker=null;
      };
      worker.onerror=()=>{if(current){setBusy(false);setFailed(true);}worker?.terminate();};
      worker.postMessage({settings,axis:frame.pose.axis,planeZ:frame.pose.center[2],key});
    },0);
    return ()=>{current=false;clearTimeout(timer);worker?.terminate();};
  },[enabled,key]);
  return {volume:enabled&&experimentAvailable(settings)&&result?.key===key?result:null,busy,failed};
}
/* i18n-canonical: shared placement labels translated at the point of display. */
export const PLACEMENT_LABEL={favorable:'Placement favorable',variable:'Détection variable',unfavorable:'Placement défavorable',unavailable:'Estimation indisponible'};
const CAUSE_LABEL={motion:'Mouvement non confirmé : estimation indisponible',clip:'Clip absent ou non pris en charge : estimation indisponible',mounting:'Collision avec les solides du montage non vérifiable : estimation indisponible',distance:'Trop loin pour la plage explorée',orientation:'Orientation défavorable / zone centrale à éviter',collision:'Collision du corps de l’aimant avec l’enveloppe ou le montage',scenario_collision:'Pose nominale valide ; collision dans une hypothèse',domain:'Hors du domaine de calcul',missing:'Aimant, reed ou intégration non caractérisés',material:'Matériau voisin non pris en compte',stale:'Ancienne version : recalcul nécessaire',partial:'Classe A partielle : ATmax 10 seulement, seconde surface non caractérisée'};
export function PedagogicalBanner({evidence}:{evidence:PlacementEvidence}) {
  return <div className={`mw-verdict-banner notice-${evidence.state==='favorable'?'info':evidence.state==='unfavorable'?'warning':'info'}`} role="status" data-testid="pedagogical-verdict">
    <strong className="t-title-s">{t(PLACEMENT_LABEL[evidence.state])}</strong>
    <span className="t-caption">{t(evidence.state==='favorable'?'Accord des hypothèses internes, sans garantie de fabrication':evidence.state==='variable'?'Le résultat dépend de la sensibilité ou des hypothèses':CAUSE_LABEL[evidence.cause])}</span>
  </div>;
}
export function PedagogicalControls({settings,setSettings,config,update,frame,busy,volume,failed,onSuggest,onUndo,canUndo}:{
  settings:ExperimentSettings;setSettings:(s:ExperimentSettings)=>void;config:WorkshopConfig;update:(p:Partial<WorkshopConfig>)=>void;frame:PedagogicalFrame;busy:boolean;volume:SampledVolume|null;failed:boolean;onSuggest:()=>void;onUndo:()=>void;canUndo:boolean;
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
      <label className="mw-field"><span>{t('Décalage latéral')}<output className="t-metric">{config.lateralShift} mm</output></span><input type="range" aria-label={t('Décalage latéral')} min="-24" max="24" step=".25" value={config.lateralShift} onInput={e=>update({lateralShift:Number(e.currentTarget.value)})}/></label>
      <label className="mw-field"><span>{t('Profondeur minimale')}<output className="t-metric">{config.end} mm</output></span><input type="range" aria-label={t('Profondeur minimale')} min="1" max="24" step=".25" value={config.end} onInput={e=>{const end=Number(e.currentTarget.value);update({end,start:Math.min(60,end+config.start-config.end)});}}/></label>
      <label className="mw-field"><span>{t('Course')}<output className="t-metric">{config.start-config.end} mm</output></span><input type="range" aria-label={t('Course')} min="2" max="40" value={config.start-config.end} onChange={e=>update({start:config.end+Number(e.target.value)})}/></label>
    </>}
    <p className="t-caption" role="status">{t(busy?'Calcul des volumes en cours…':failed?'Volumes indisponibles : calcul interrompu':volume?'Volumes recalculés':'Volumes en attente')} {volume&&`${number(volume.computeMs/1000,2)} s · ${volume.nodeCount} ${t('positions calculées')}`}</p>
    <details className="mw-advanced"><summary>{t('Avancés')}</summary>
      <label className="mw-select-label">{t('Classe de sensibilité')}<select value={settings.className} onChange={e=>change({className:e.target.value})}>{['A','B','C','D','E','F','G'].map(c=><option key={c}>{c}</option>)}</select></label>
      <label><input type="checkbox" checked={settings.hypotheses} onChange={e=>change({hypotheses:e.target.checked})}/>{t('Hypothèses internes : longueur ±30 %, position ±1 mm, moment ±10 %')}</label>
      <p className="t-caption">{t('Noyau nominal et robustesse du placement sont distincts. Ni probabilité, ni tolérance fabricant.')}</p>
      <label><input type="checkbox" checked={settings.integration==='form66'} onChange={e=>change({integration:e.target.checked?'form66':'unknown'})}/>{t('Montage Form66 exploratoire au repère reed explicite')}</label>
      <label><input type="checkbox" checked={settings.nearbyMaterial} onChange={e=>change({nearbyMaterial:e.target.checked})}/>{t('Matériau voisin non pris en compte')}</label>
      <label><input type="checkbox" checked={settings.rotationFreedom} onChange={e=>change({rotationFreedom:e.target.checked})}/>{t('Liberté déclarée : rotation ±90°')}</label>
      <label className="mw-field"><span>{t('Liberté latérale déclarée')}<output>{settings.lateralFreedomMm} mm</output></span><input type="range" aria-label={t('Liberté latérale déclarée')} min="0" max="12" step=".25" value={settings.lateralFreedomMm} onChange={e=>change({lateralFreedomMm:Number(e.target.value)})}/></label>
      <Button variant="secondary" onClick={onSuggest}>{t('Chercher un placement favorable')}</Button>
      <p className="t-caption">{t('Sans liberté déclarée ou sous fixation verrouillée, aucune suggestion disponible. L’alignement mécanique ne valide pas la détection.')}</p>
      {canUndo&&<Button variant="secondary" onClick={onUndo}>{t('Annuler le placement proposé')}</Button>}
      <label><input type="checkbox" checked={config.polarity===-1} onChange={e=>update({polarity:e.target.checked?-1:1})}/>{t('Inverser N/S')}</label>
    </details>
    <details className="mw-advanced"><summary>{t('Six cas pédagogiques')}</summary>{['Parallèle','Perpendiculaire centré','Perpendiculaire décalé','Oblique 45°','Parallèle · classe E','Traversée des lobes'].map((label,i)=><Button key={label} variant="secondary" onClick={()=>{change({className:i===4?'E':'C'});if(!config.machine)update({geometry:'D1',motion:i===5?'slide':'approach',magnetAngle:i===0||i===4?0:i===3?45:90,lateralShift:i===2?8:0,start:24,end:12,offset:16});}}>{t(label)}</Button>)}</details>
    {volume?.truncated&&<p className="notice-warning t-caption">{t('Lobes tronqués aux limites du domaine affiché ±24 mm ; aucune fermeture physique déduite.')}</p>}
    {distances.length>0&&<section aria-label={t('Distances indicatives, calibrées sur la brochure Standex')}>
      <h3 className="t-title-s">{t('Distances indicatives, calibrées sur la brochure Standex')}</h3>
      <p className="t-caption">{t('Borne documentaire prudente ; aucune portée pour une pose oblique ou importée.')}</p>
      {distances.map(r=><p className="t-metric" key={r.bound}>{r.approach} · {r.bound} : {r.prudentMm===null?t('Estimation indisponible'):`${number(r.prudentMm,1)} mm`} · {t('Publié')} {number(r.publishedMm??0,1)} mm</p>)}
      <p className="t-caption">{t('Correction D4 avant arrondi prudent ; volumes non corrigés.')}</p>
    </section>}
    <details className="mw-advanced"><summary>{t('Périmètre et sources')}</summary>
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
export { DEFAULT_EXPERIMENT, evaluatePlacement };