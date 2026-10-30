import { Button } from '@/components/ui/button';
import { t, msg } from '@/lib/i18n/core';
import { VERIFIED_PILOTS } from '@/lib/standex/client-pedagogical';
import { approachOffset, type WorkshopConfig } from '@/lib/standex/magnetic-workshop';
import { publishedClasses } from '@/lib/standex/magnetics/registries';
import { catalogueClasses } from '@/lib/standex/catalogue-pedagogical';
import { catalogueThresholds } from '@/lib/standex/catalogue-response';
import { magnetOptionsFor } from '@/lib/standex/default-pairs';
import { sensorById } from '@/lib/standex/sensor-catalog';
import { isPcbSensor } from '@/lib/leadmagnet/product-presentation';
import { useMemo, type ReactNode } from 'react';
import { slideGapLimit } from '@/lib/standex/discovery-slide';
import { discoveryPatch } from '@/lib/standex/discovery-preset';

/** Colonne de découverte : disposition, mouvement, quart de tour et placement simple.
 * Les réglages détaillés restent disponibles après import ou en exploration ;
 * une configuration existante n'est jamais réécrite parce que sa commande devient invisible. */
export function ClientPedagogicalControls({config,update,onCatalog,onCable,approachControls}: {
  config:WorkshopConfig;update:(patch:Partial<WorkshopConfig>)=>void;onCatalog:()=>void;onCable:()=>void;approachControls?:ReactNode;
}) {
  // Keep an existing selection, but do not offer documented G as a new simulation
  // choice: the current model has no threshold for it. Contact names stay unranked.
  const available=catalogueClasses(config.sensorId,config.magnetModel,publishedClasses(config.sensorId,config.magnetModel))
    .filter(c=>!(/^[A-G]$/.test(c))||catalogueThresholds(c)!==null);
  const classes=[...new Set([config.sensitivity,...available])].sort();
  const ordinalClasses=classes.every(c=>/^[A-G]$/.test(c));
  const magnets=[...new Set([config.magnetModel,...magnetOptionsFor(config.sensorId,undefined,config.magnetModel),...VERIFIED_PILOTS])];
  const slideMax=useMemo(()=>config.motion==='slide'?slideGapLimit(config):15,[config.sensorId,config.magnetModel,config.sensitivity,config.motion,config.geometry,config.magnetAngle,config.magnetTilt,config.sensorAngle]);
  const motions:[WorkshopConfig['motion'],string][]=[['approach',t('Approche et retrait')],['slide',t('Passage latéral')]];
  return <div className="mw-ped-controls" data-testid="client-pedagogical-controls">
    <h2 className="t-title-m">{t(sensorById(config.sensorId).name)}</h2>
    <Button variant="secondary" onClick={onCatalog}>{t('Changer de couple')}</Button>
    {available.length > 0 && (ordinalClasses ? <div className="mw-sensitivity-control">
      <label className="mw-field"><span>{t('Sensibilité magnétique')}<output className="t-caption">{msg('Classe {0}',[config.sensitivity])}</output></span>
        {classes.length>1&&<input type="range" aria-label={t('Sensibilité magnétique')} aria-valuetext={msg('Classe {0}',[config.sensitivity])} min="0" max={classes.length-1} step="1" value={classes.indexOf(config.sensitivity)} onInput={e=>update({sensitivity:classes[Number(e.currentTarget.value)]!})}/>}
      </label>
      {classes.length>1&&<div className="mw-sensitivity-ends t-caption"><span>{t('Plus sensible · détecte de plus loin')}</span><span>{t('Moins sensible · aimant plus proche')}</span></div>}
    </div> : <label className="mw-select-label">{t('Configuration du contact')}<select aria-label={t('Configuration du contact')} value={config.sensitivity} onChange={e=>update({sensitivity:e.target.value})}>{classes.map(c=><option key={c} value={c}>{c}</option>)}</select></label>)}
    {!config.machine&&<>
      <section className="mw-choice" aria-label={t('Disposition')}>
        <p className="t-label">{t('Disposition')}</p>
        {approachControls}
      </section>
      <section className="mw-choice" aria-label={t('Mouvement')}>
        <p className="t-label">{t('Mouvement')}</p>
        <div className="mw-approach-row">
          {motions.map(([id,label])=><button key={id} type="button" className="mw-approach-button" aria-pressed={config.motion===id} onClick={()=>update(discoveryPatch(config,{motion:id}))}><span>{t(label)}</span></button>)}
        </div>
      </section>
      <section className="mw-choice" aria-label={t('Orientation de l’aimant')}>
        <p className="t-label">{t('Orientation de l’aimant')}</p>
        <Button variant="secondary" data-testid="quarter-turn" onClick={()=>update(discoveryPatch(config,{magnetAngle:((config.magnetAngle+90+180)%360)-180}))}>{t('Tourner de 90°')}</Button>
        <p className="t-caption">{config.magnetAngle===0?t('Aucune rotation appliquée'):msg('Rotation appliquée : {0}°',[config.magnetAngle])}</p>
      </section>
      {config.motion==='slide'&&<label className="mw-field"><span>{t('Écart minimal entre le capteur et l’aimant')}<output className="t-metric">{Math.round((config.offset-approachOffset({...config,geometry:'D1'}))*100)/100} mm</output></span><input type="range" aria-label={t('Écart minimal entre le capteur et l’aimant')} min="0.25" max={Math.max(slideMax,config.offset-approachOffset({...config,geometry:'D1'}))} step="0.25" value={config.offset-approachOffset({...config,geometry:'D1'})} onInput={e=>update({offset:approachOffset({...config,geometry:'D1'})+Number(e.currentTarget.value)})}/></label>}
      {config.motion==='approach'&&<>
        <div className="mw-offset-control">
          <label className="mw-field"><span>{t('Décalage de l’aimant')}<output className="t-metric">{config.lateralShift>0?'+':''}{config.lateralShift} mm</output></span><input type="range" aria-label={t('Décalage de l’aimant')} min={Math.min(-20,config.lateralShift)} max={Math.max(20,config.lateralShift)} step="0.5" value={config.lateralShift} onInput={e=>update({lateralShift:Number(e.currentTarget.value)})}/></label>
          <button type="button" className="mw-text-button" disabled={config.lateralShift===0} onClick={()=>update({lateralShift:0})}>{t('Recentrer')}</button>
        </div>
        <label className="mw-field"><span>{t('Écart minimal entre le capteur et l’aimant')}<output className="t-metric">{config.end} mm</output></span><input type="range" aria-label={t('Écart minimal entre le capteur et l’aimant')} min="0.25" max="15" step="0.25" value={config.end} onInput={e=>update({end:Number(e.currentTarget.value)})}/></label>
      </>}
    </>}
    <details className="mw-advanced"><summary>{t('Caractéristiques de l’aimant')}</summary>
      <label className="mw-select-label">{t('Aimant')}<select aria-label={t('Aimant')} value={config.magnetModel} onChange={e=>update({magnetModel:e.target.value})}>{magnets.map(id=><option key={id} value={id}>{id}</option>)}</select></label>
      {config.guideReference&&<p className="t-caption">{t('Référence documentaire')} : {config.guideReference}</p>}
    </details>
    {config.machine && !isPcbSensor(config.sensorId) && <Button variant="secondary" onClick={onCable}>{t('Pointer le câble dans la 3D')}</Button>}

  </div>;
}
