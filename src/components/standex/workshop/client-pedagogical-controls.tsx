import { Button } from '@/components/ui/button';
import { t, msg } from '@/lib/i18n/core';
import { CLIENT_LIMITS, VERIFIED_PILOTS, clientCoupleAdapter } from '@/lib/standex/client-pedagogical';
import type { WorkshopConfig } from '@/lib/standex/magnetic-workshop';
import { publishedClasses } from '@/lib/standex/magnetics/registries';
import { magnetOptionsFor } from '@/lib/standex/default-pairs';
import { guideRangesFor, formatGuideBound, ACTIVATION_GUIDE } from '@/lib/standex/activation-guide';
import { sensorById } from '@/lib/standex/sensor-catalog';
import { isPcbSensor } from '@/lib/leadmagnet/product-presentation';
import type { ReactNode } from 'react';
import { CATALOGUE_LABELS } from '@/lib/standex/catalogue-pedagogical';

export function ClientPedagogicalControls({config,update,onCatalog,onExplore,onCable,approachControls}: {
  config:WorkshopConfig;update:(patch:Partial<WorkshopConfig>)=>void;onCatalog:()=>void;onExplore:()=>void;onCable:()=>void;approachControls?:ReactNode;
}) {
  const adapter=clientCoupleAdapter(config);
  const classes=[...new Set([config.sensitivity,...publishedClasses(config.sensorId,config.magnetModel)])];
  const magnets=[...new Set([config.magnetModel,...magnetOptionsFor(config.sensorId,undefined,config.magnetModel),...VERIFIED_PILOTS])];
  const rows=guideRangesFor(config.sensorId,config.magnetModel);
  return <div className="mw-ped-controls" data-testid="client-pedagogical-controls">
    <h2 className="t-title-m">{t(sensorById(config.sensorId).name)}</h2>
    <Button variant="secondary" onClick={onCatalog}>{t('Voir les capteurs')}</Button>
    <label className="mw-select-label">{t('Aimant')}<select aria-label={t('Aimant')} value={config.magnetModel} onChange={e=>update({magnetModel:e.target.value})}>{magnets.map(id=><option key={id} value={id}>{id}</option>)}</select></label>
    <label className="mw-select-label">{t('Classe de sensibilité')}<select aria-label={t('Classe de sensibilité')} value={config.sensitivity} onChange={e=>update({sensitivity:e.target.value})}>{classes.map(c=><option key={c} value={c}>{c}</option>)}</select></label>
    {config.guideReference&&<p className="t-caption">{t('Référence documentaire')} : {config.guideReference}</p>}
    <p className="t-body">{t(CATALOGUE_LABELS[adapter.model.status])}</p>
    <Button variant="secondary" onClick={onExplore}>{t('Comprendre les zones de détection')}</Button>
    {!config.machine&&<>
      <label className="mw-field"><span>{t('Écart au départ')}<output className="t-metric">{config.start} mm</output></span><input aria-label={t('Écart au départ')} type="range" min="2" max="60" step=".5" value={config.start} onChange={e=>update({start:Number(e.target.value)})}/></label>
      <label className="mw-field"><span>{t('Écart au plus près')}<output className="t-metric">{config.end} mm</output></span><input aria-label={t('Écart au plus près')} type="range" min="1" max="59" step=".5" value={config.end} onChange={e=>update({end:Number(e.target.value)})}/></label>
      <label className="mw-field"><span>{t('Rotation du boîtier aimant')}<output className="t-metric">{config.magnetAngle}°</output></span><input aria-label={t('Rotation du boîtier aimant')} type="range" min="-180" max="180" value={config.magnetAngle} onChange={e=>update({magnetAngle:Number(e.target.value)})}/></label>
      <label className="mw-field"><span>{t('Décalage latéral')}<output className="t-metric">{config.lateralShift} mm</output></span><input aria-label={t('Décalage latéral')} type="range" min="-24" max="24" step=".25" value={config.lateralShift} onChange={e=>update({lateralShift:Number(e.target.value)})}/></label>
    </>}
    <details className="mw-advanced"><summary>{t('Position et environnement')}</summary>
      {!config.machine && approachControls}
      {!config.machine&&<>
        <label className="mw-select-label">{t('Trajectoire')}<select aria-label={t('Trajectoire')} value={config.motion} onChange={e=>update({motion:e.target.value as WorkshopConfig['motion']})}>
          <option value="approach">{t('Approche et retrait')}</option><option value="slide">{t('Passage latéral')}</option><option value="pivot">{t('Pivot')}</option>
        </select></label>
        {config.motion!=='approach'&&<>
          <label className="mw-field">{t(config.motion==='slide'?'Décalage du passage':'Rayon du pivot')}<input aria-label={t(config.motion==='slide'?'Décalage du passage':'Rayon du pivot')} type="range" min="6" max="30" step=".5" value={config.offset} onChange={e=>update({offset:Number(e.target.value)})}/></label>
          {config.motion==='slide'?<label className="mw-field">{t('Demi-course latérale')}<input aria-label={t('Demi-course latérale')} type="range" min="10" max="50" value={config.travel} onChange={e=>update({travel:Number(e.target.value)})}/></label>:<label className="mw-field">{t('Angle du pivot')}<input aria-label={t('Angle du pivot')} type="range" min="30" max="300" value={config.span} onChange={e=>update({span:Number(e.target.value)})}/></label>}
        </>}
        <label className="mw-field">{t('Orientation propre du reed')}<input aria-label={t('Orientation propre du reed')} type="range" min="-180" max="180" value={config.sensorAngle} onChange={e=>update({sensorAngle:Number(e.target.value)})}/></label>
        <label className="mw-field">{t('Inclinaison hors du plan')}<input aria-label={t('Inclinaison hors du plan')} type="range" min="-180" max="180" value={config.magnetTilt} onChange={e=>update({magnetTilt:Number(e.target.value)})}/></label>
      </>}
      <Button variant="secondary" aria-pressed={config.polarity===-1} onClick={()=>update({polarity:config.polarity===1?-1:1})}>{t('Inverser N / S')}</Button>
      <label className="mw-check"><input type="checkbox" checked={config.ferromagnetic} onChange={e=>update({ferromagnetic:e.target.checked})}/>{t('Acier ou autre matière ferromagnétique proche')}</label>
      <label className="mw-select-label">{t('Température')}<select aria-label={t('Température')} value={config.temperature} onChange={e=>update({temperature:e.target.value as WorkshopConfig['temperature']})}><option value="ambient">{t('Ambiante · exemple de référence')}</option><option value="other">{t('Autre température')}</option></select></label>
    </details>
    {!isPcbSensor(config.sensorId) && <Button variant="secondary" disabled={!config.machine} onClick={onCable}>{t('Pointer le câble dans la 3D')}</Button>}
    <details className="mw-advanced" data-testid="client-pedagogical-sources"><summary>{t('Sources et limites')}</summary>
      {adapter.reasons.map(reason=><p className="t-caption" key={reason}>{t(reason)}</p>)}
      <p className="t-caption">{adapter.model.family} · {adapter.model.lengthMm} mm · {adapter.model.method} · {adapter.version}</p>
      <p className="t-caption">{t('Plage documentaire indicative, sans validation de la simulation.')}</p>
      {rows.map((r,i)=><p className="t-caption" key={i}>{r.sensorReference} · {r.approachId} · <span className="t-metric">{formatGuideBound(r.upMm,r.upNote)} – {formatGuideBound(r.toMm,r.toNote)} mm</span> · {msg('Guide Standex, page {0}',[String(r.page)])}</p>)}
      <a href={ACTIVATION_GUIDE.source.url} target="_blank" rel="noreferrer">{t('Source Standex ↗')}</a>
    </details>
  </div>;
}