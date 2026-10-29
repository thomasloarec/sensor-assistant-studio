import { Button } from '@/components/ui/button';
import { t, msg } from '@/lib/i18n/core';
import { VERIFIED_PILOTS } from '@/lib/standex/client-pedagogical';
import type { WorkshopConfig } from '@/lib/standex/magnetic-workshop';
import { publishedClasses } from '@/lib/standex/magnetics/registries';
import { catalogueClasses } from '@/lib/standex/catalogue-pedagogical';
import { magnetOptionsFor } from '@/lib/standex/default-pairs';
import { sensorById } from '@/lib/standex/sensor-catalog';
import { isPcbSensor } from '@/lib/leadmagnet/product-presentation';
import type { ReactNode } from 'react';
import { discoveryPatch } from '@/lib/standex/discovery-preset';

/** Colonne de découverte avant import : trois choix (disposition, mouvement, quart de tour),
 * puis observation. Les curseurs numériques restent disponibles après import ou en exploration ;
 * une configuration existante n'est jamais réécrite parce que sa commande devient invisible. */
export function ClientPedagogicalControls({config,update,onCatalog,onCable,approachControls}: {
  config:WorkshopConfig;update:(patch:Partial<WorkshopConfig>)=>void;onCatalog:()=>void;onCable:()=>void;approachControls?:ReactNode;
}) {
  const classes=[...new Set([config.sensitivity,...catalogueClasses(config.sensorId,config.magnetModel,publishedClasses(config.sensorId,config.magnetModel))])].sort();
  const ordinalClasses=classes.every(c=>/^[A-G]$/.test(c));
  const magnets=[...new Set([config.magnetModel,...magnetOptionsFor(config.sensorId,undefined,config.magnetModel),...VERIFIED_PILOTS])];
  const motions:[WorkshopConfig['motion'],string][]=[['approach',t('Approche et retrait')],['slide',t('Passage latéral')]];
  return <div className="mw-ped-controls" data-testid="client-pedagogical-controls">
    <h2 className="t-title-m">{t(sensorById(config.sensorId).name)}</h2>
    <Button variant="secondary" onClick={onCatalog}>{t('Changer de couple')}</Button>
    {ordinalClasses ? <div className="mw-sensitivity-control">
      <label className="mw-field"><span>{t('Sensibilité magnétique')}<output className="t-caption">{msg('Classe {0}',[config.sensitivity])}</output></span>
        {classes.length>1&&<input type="range" aria-label={t('Sensibilité magnétique')} aria-valuetext={msg('Classe {0}',[config.sensitivity])} min="0" max={classes.length-1} step="1" value={classes.indexOf(config.sensitivity)} onInput={e=>update({sensitivity:classes[Number(e.currentTarget.value)]!})}/>}
      </label>
      {classes.length>1&&<div className="mw-sensitivity-ends t-caption"><span>{t('Plus sensible · détecte de plus loin')}</span><span>{t('Moins sensible · aimant plus proche')}</span></div>}
    </div> : <label className="mw-select-label">{t('Configuration du contact')}<select aria-label={t('Configuration du contact')} value={config.sensitivity} onChange={e=>update({sensitivity:e.target.value})}>{classes.map(c=><option key={c} value={c}>{c}</option>)}</select></label>}
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
      {config.motion==='approach'&&<label className="mw-field"><span>{t('Écart minimal entre le capteur et l’aimant')}<output className="t-metric">{config.end} mm</output></span><input type="range" aria-label={t('Écart minimal entre le capteur et l’aimant')} min="0.25" max="15" step="0.25" value={config.end} onInput={e=>update({end:Number(e.currentTarget.value)})}/></label>}
    </>}
    <details className="mw-advanced"><summary>{t('Caractéristiques du couple')}</summary>
      <label className="mw-select-label">{t('Aimant')}<select aria-label={t('Aimant')} value={config.magnetModel} onChange={e=>update({magnetModel:e.target.value})}>{magnets.map(id=><option key={id} value={id}>{id}</option>)}</select></label>
      {config.guideReference&&<p className="t-caption">{t('Référence documentaire')} : {config.guideReference}</p>}
    </details>
    {config.machine && !isPcbSensor(config.sensorId) && <Button variant="secondary" onClick={onCable}>{t('Pointer le câble dans la 3D')}</Button>}

  </div>;
}
