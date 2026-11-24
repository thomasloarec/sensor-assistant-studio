import { useId } from 'react';
import { t, msg, number } from '@/lib/i18n/core';
import { magnetSource } from '@/lib/standex/magnet-catalog';
import { sizeLabel } from '@/lib/standex/sensor-catalog';
import { MAGNET_FORMS, compareMagnetPower, distinctMagnetChoices, matchingMagnet,
  workshopMagnetChoices, type WorkshopMagnetChoice } from '@/lib/standex/workshop-magnet-choice';
import { SensorPlan } from './sensor-plan';

/* i18n-canonical: translated when rendered. */
const FORMS = {
  cylinder: 'Cylindre nu', block: 'Bloc rectangulaire nu', screw: 'Boîtier à visser à plat',
  'housed-cylinder': 'Cylindre en boîtier', threaded: 'Boîtier fileté', pressfit: 'Boîtier à emmancher',
} as const;
/* i18n-canonical: material is explained after mechanical choices. */
const MATERIALS = {
  Ferrite: 'Ferrite : économique et résistante à la corrosion, mais moins puissante à volume égal et cassante.',
  AlNiCo: 'AlNiCo : bonne stabilité en température ; sensible aux champs opposés.',
  NdFeB: 'Néodyme : forte puissance dans un petit volume ; protection contre la corrosion et tenue en température à vérifier selon la nuance.',
  SmCo: 'Samarium-cobalt : adapté aux températures élevées, mais plus coûteux et fragile.',
  unknown: 'Matériau non précisé : consulter la fiche de la référence.',
} as const;

function powerLabel(entry: WorkshopMagnetChoice, ranked: WorkshopMagnetChoice[]) {
  if (entry.moment === null) return t('Puissance non documentée');
  if (typeof entry.moment !== 'number') return t('Puissance variable selon la variante');
  if (ranked.length < 2) return t('Un seul niveau documenté');
  const index = ranked.findIndex(other => other.powerKey === entry.powerKey);
  if (index === 0) return t('Moins puissant');
  if (index === ranked.length - 1) return t('Plus puissant');
  return msg('Niveau intermédiaire {0}', [index]);
}

/** Controlled by the real workshop reference. Opening, translating and rerendering
 * this picker never replaces an existing selection. No parallel saved filter state. */
export function MagnetPicker({ sensorId, value, onChange }: {
  sensorId: string; value: string; onChange: (id: string) => void;
}) {
  const helpId = useId();
  const entries = workshopMagnetChoices(sensorId);
  const selected = entries.find(entry => entry.id === value);
  const inForm = entries.filter(entry => entry.form === selected?.form);
  const sizes = distinctMagnetChoices(inForm, 'sizeKey');
  const inSize = inForm.filter(entry => entry.sizeKey === selected?.sizeKey);
  const powers = distinctMagnetChoices([...inSize].sort(compareMagnetPower), 'powerKey');
  const ranked = powers.filter(entry => typeof entry.moment === 'number');
  const matches = inSize.filter(entry => entry.powerKey === selected?.powerKey);
  const select = (choices: WorkshopMagnetChoice[]) => {
    const next = matchingMagnet(choices, value);
    if (next && next.id !== value) onChange(next.id);
  };
  const source = magnetSource(value);
  return <section className="mw-magnet-picker" aria-label={t('Choisir un aimant')}>
    <p className="t-caption">{t('Choisissez la forme, les dimensions, puis la puissance disponible.')}</p>
    <label className="mw-select-label">{t('Forme et fixation')}
      <select value={selected?.form ?? ''} onChange={e => select(entries.filter(entry => entry.form === e.target.value))}>
        {!selected && <option value="">{t('Choix actuel hors catalogue')}</option>}
        {MAGNET_FORMS.map(form => <option key={form} value={form}>{t(FORMS[form])}</option>)}
      </select>
    </label>
    {selected ? <>
      <label className="mw-select-label">{t('Dimensions de l’aimant')}
        <select value={selected.sizeKey} onChange={e => select(inForm.filter(entry => entry.sizeKey === e.target.value))}>
          {sizes.map(entry => <option key={entry.sizeKey} value={entry.sizeKey}>{sizeLabel(entry.model)}</option>)}
        </select>
      </label>
      <label className="mw-select-label">{t('Puissance magnétique')}
        <select aria-describedby={helpId} value={selected.powerKey} onChange={e => select(inSize.filter(entry => entry.powerKey === e.target.value))}>
          {powers.map(entry => <option key={entry.powerKey} value={entry.powerKey}>{powerLabel(entry, ranked)}</option>)}
        </select>
      </label>
      <p id={helpId} className="t-caption">{ranked.length > 1
        ? t('Comparaison du moment magnétique publié pour ces dimensions. La distance de détection dépend aussi du capteur et du montage.')
        : t('À ces dimensions, le catalogue ne propose pas plusieurs puissances documentées. Changez les dimensions pour explorer d’autres aimants.')}</p>
      {matches.length > 1 && <label className="mw-select-label">{t('Modèle correspondant')}
        <select value={value} onChange={e => onChange(e.target.value)}>
          {matches.map(entry => <option key={entry.id} value={entry.id}>{entry.id}{entry.holeAxis ? ` · ${t(entry.holeAxis === 'horizontal' ? 'Trous horizontaux' : 'Trous verticaux')}` : ''}</option>)}
        </select>
      </label>}
      <div className="mw-magnet-result" aria-live="polite" aria-atomic="true">
        <svg className="mw-magnet-preview" viewBox={`${-selected.model.body[0] / 2 - 4} ${-selected.model.body[2] / 2 - 4} ${selected.model.body[0] + 8} ${selected.model.body[2] + 8}`} role="img" aria-label={msg('Aperçu de l’aimant {0}', [value])}>
          <SensorPlan model={selected.model} xray={false} showCable={false} />
        </svg>
        <div><p className="t-label">{t('Aimant retenu')}</p><strong className="t-title-s">{value}</strong><p className="t-metric">{sizeLabel(selected.model)}</p></div>
        <p className="t-caption mw-magnet-explanation">{t(MATERIALS[selected.material as keyof typeof MATERIALS] ?? MATERIALS.unknown)}</p>
        <details className="mw-magnet-explanation"><summary className="t-body">{t('Comprendre cette puissance')}</summary>
          <p className="t-caption">{t('Le moment magnétique caractérise l’aimant. Ce n’est ni une force d’arrachement, ni une distance de détection garantie.')}</p>
          <p className="t-metric">{selected.moment === null ? t('Valeur non publiée') : `${(typeof selected.moment === 'number' ? [selected.moment] : selected.moment).map(v => number(v)).join(' / ')} × 10⁻⁶ Vs·cm`}</p>
          {source && <a className="t-caption" href={source} target="_blank" rel="noreferrer">{t('Consulter la fiche de cet aimant')}</a>}
        </details>
      </div>
    </> : <p className="t-caption">{value}</p>}
  </section>;
}
