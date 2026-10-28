import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n/core';
import { CLIENT_LIMITS, VERIFIED_PILOTS, clientCoupleAdapter } from '@/lib/standex/client-pedagogical';
import type { WorkshopConfig } from '@/lib/standex/magnetic-workshop';
import { publishedClasses } from '@/lib/standex/magnetics/registries';
import { catalogueClasses, catalogueFamilySentence } from '@/lib/standex/catalogue-pedagogical';
import { magnetOptionsFor } from '@/lib/standex/default-pairs';
import { guideRangesFor, formatGuideBound, ACTIVATION_GUIDE } from '@/lib/standex/activation-guide';
import { sensorById } from '@/lib/standex/sensor-catalog';
import { isPcbSensor } from '@/lib/leadmagnet/product-presentation';
import type { ReactNode } from 'react';
import { CATALOGUE_LABELS } from '@/lib/standex/catalogue-pedagogical';

/** Colonne de découverte avant import : trois choix (disposition, mouvement, quart de tour),
 * puis observation. Les curseurs numériques restent disponibles après import ou en exploration ;
 * une configuration existante n'est jamais réécrite parce que sa commande devient invisible. */
export function ClientPedagogicalControls({config,update,onCatalog,onExplore,onCable,approachControls}: {
  config:WorkshopConfig;update:(patch:Partial<WorkshopConfig>)=>void;onCatalog:()=>void;onExplore:()=>void;onCable:()=>void;approachControls?:ReactNode;
}) {
  const adapter=clientCoupleAdapter(config);
  const classes=[...new Set([config.sensitivity,...catalogueClasses(config.sensorId,config.magnetModel,publishedClasses(config.sensorId,config.magnetModel))])];
  const magnets=[...new Set([config.magnetModel,...magnetOptionsFor(config.sensorId,undefined,config.magnetModel),...VERIFIED_PILOTS])];
  const rows=guideRangesFor(config.sensorId,config.magnetModel);
  const motions:[WorkshopConfig['motion'],string][]=[['approach',t('Approche et retrait')],['slide',t('Passage latéral')],['pivot',t('Pivot')]];
  return <div className="mw-ped-controls" data-testid="client-pedagogical-controls">
    <h2 className="t-title-m">{t(sensorById(config.sensorId).name)}</h2>
    <Button variant="secondary" onClick={onCatalog}>{t('Changer de couple')}</Button>
    {!config.machine&&<>
      <section className="mw-choice" aria-label={t('Disposition')}>
        <p className="t-label">{t('Disposition')}</p>
        {approachControls}
      </section>
      <section className="mw-choice" aria-label={t('Mouvement')}>
        <p className="t-label">{t('Mouvement')}</p>
        <div className="mw-approach-row">
          {motions.map(([id,label])=><button key={id} type="button" className="mw-approach-button" aria-pressed={config.motion===id} onClick={()=>update({motion:id})}><span>{t(label)}</span></button>)}
        </div>
      </section>
      <section className="mw-choice" aria-label={t('Orientation de l’aimant')}>
        <p className="t-label">{t('Orientation de l’aimant')}</p>
        <Button variant="secondary" data-testid="quarter-turn" onClick={()=>update({magnetAngle:((config.magnetAngle+90+180)%360)-180})}>{t('Tourner de 90°')}</Button>
        <p className="t-caption">{t(config.magnetAngle===0?'Pose documentaire de départ':'Quart de tour appliqué relatif à la pose de départ')}</p>
      </section>
    </>}
    <Button variant="secondary" onClick={onExplore}>{t('Comprendre les zones de détection')}</Button>
    <details className="mw-advanced"><summary>{t('Caractéristiques du couple')}</summary>
      <label className="mw-select-label">{t('Aimant')}<select aria-label={t('Aimant')} value={config.magnetModel} onChange={e=>update({magnetModel:e.target.value})}>{magnets.map(id=><option key={id} value={id}>{id}</option>)}</select></label>
      <label className="mw-select-label">{t('Classe de sensibilité')}<select aria-label={t('Classe de sensibilité')} value={config.sensitivity} onChange={e=>update({sensitivity:e.target.value})}>{classes.map(c=><option key={c} value={c}>{c}</option>)}</select></label>
      {config.guideReference&&<p className="t-caption">{t('Référence documentaire')} : {config.guideReference}</p>}
      <p className="t-body">{t(CATALOGUE_LABELS[adapter.model.status])}</p>
      <Button variant="secondary" aria-pressed={config.polarity===-1} onClick={()=>update({polarity:config.polarity===1?-1:1})}>{t('Inverser N / S')}</Button>
      <label className="mw-check"><input type="checkbox" checked={config.ferromagnetic} onChange={e=>update({ferromagnetic:e.target.checked})}/>{t('Acier ou autre matière ferromagnétique proche')}</label>
      <label className="mw-select-label">{t('Température')}<select aria-label={t('Température')} value={config.temperature} onChange={e=>update({temperature:e.target.value as WorkshopConfig['temperature']})}><option value="ambient">{t('Ambiante · exemple de référence')}</option><option value="other">{t('Autre température')}</option></select></label>
    </details>
    {!isPcbSensor(config.sensorId) && <Button variant="secondary" disabled={!config.machine} onClick={onCable}>{t('Pointer le câble dans la 3D')}</Button>}
    <details className="mw-advanced" data-testid="client-pedagogical-sources"><summary>{t('Sources et limites')}</summary>
      {adapter.reasons.map(reason=><p className="t-caption" key={reason}>{t(reason)}</p>)}
      <p className="t-caption">{t(catalogueFamilySentence(adapter.model))}</p><p className="t-caption">{t(CATALOGUE_LABELS.datum)}</p><p className="t-caption">{t('Longueur de reed hypothétique')} : <span className="t-metric">{adapter.model.lengthMm} mm</span></p><p className="t-caption">{t('Détail technique')} · {adapter.version}</p>
      <p className="t-caption">{t('Plage documentaire indicative, sans validation de la simulation.')}</p>
      {rows.map((r,i)=><p className="t-caption" key={i}>{r.sensorReference} · {r.approachId} · <span className="t-metric">{formatGuideBound(r.upMm,r.upNote)} – {formatGuideBound(r.toMm,r.toNote)} mm</span> · {t('Guide Standex, page')} {r.page}</p>)}
      {adapter.model.publishedRows.map(r=><p className="t-caption" key={r.id}>{r.sensorReference} · {r.magnetId} · {r.approachId} · {t(r.thresholdKind==='min_activation_max_release'?'Activation minimale / relâchement maximal':'Plage documentaire indicative, sans validation de la simulation.')} : <span className="t-metric">{r.pullInMm} / {r.dropOutMm} mm</span></p>)}
      {adapter.model.publishedSource&&<a href={adapter.model.publishedSource} target="_blank" rel="noreferrer">{t('Source Standex ↗')}</a>}
      <a href={ACTIVATION_GUIDE.source.url} target="_blank" rel="noreferrer">{t('Source Standex ↗')}</a>
    </details>
  </div>;
}
