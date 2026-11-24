import { BARE_MAGNETS, PACKAGED_MAGNETS } from './magnet-catalog';
import { pairedMagnetModel } from './paired-magnets';
import type { SensorModel } from './sensor-catalog';

/** Workshop choices are mechanical options, independent of the initial pair policy.
 * Published moments remain documentary: no inferred material ranking or force. */
export type MagnetForm = 'cylinder' | 'block' | 'screw' | 'housed-cylinder' | 'threaded' | 'pressfit';
export const MAGNET_FORMS: readonly MagnetForm[] = ['cylinder', 'block', 'screw', 'housed-cylinder', 'threaded', 'pressfit'];
export interface WorkshopMagnetChoice {
  id: string;
  form: MagnetForm;
  model: SensorModel;
  material: string;
  moment: number | readonly number[] | null;
  sizeKey: string;
  powerKey: string;
  holeAxis?: 'horizontal' | 'vertical';
}

export function workshopMagnetChoices(sensorId?: string): WorkshopMagnetChoice[] {
  return [...BARE_MAGNETS, ...PACKAGED_MAGNETS].flatMap(entry => {
    const model = pairedMagnetModel(entry.id, sensorId);
    if (!model) return [];
    const bare = 'shape' in entry;
    const form: MagnetForm = bare ? entry.shape : model.shape === 'threaded' ? 'threaded'
      : model.shape === 'pressfit' ? 'pressfit' : model.shape === 'cylinder' ? 'housed-cylinder' : 'screw';
    const moment = bare ? entry.moment : entry.momentTypE6Vscm;
    return [{ id: entry.id, form, model,
      material: bare ? entry.material : entry.magnetMaterial, moment,
      // Group the actual rendered envelope, never fabricate a dimension from a thread name.
      sizeKey: JSON.stringify([model.body, model.collarDiameter ?? null]),
      powerKey: JSON.stringify(moment),
      ...(!bare && entry.holeAxis ? { holeAxis: entry.holeAxis } : {}),
    }];
  }).sort((a, b) => MAGNET_FORMS.indexOf(a.form) - MAGNET_FORMS.indexOf(b.form)
    || a.model.body.reduce((v, n) => v * n, 1) - b.model.body.reduce((v, n) => v * n, 1)
    || a.sizeKey.localeCompare(b.sizeKey)
    || compareMagnetPower(a, b)
    || a.id.localeCompare(b.id, 'en', { numeric: true }));
}

export function compareMagnetPower(a: WorkshopMagnetChoice, b: WorkshopMagnetChoice) {
  // Ranges/unspecified variants are not ranked as if a particular moment were known.
  const av = typeof a.moment === 'number' ? a.moment : Infinity;
  const bv = typeof b.moment === 'number' ? b.moment : Infinity;
  return (av === bv ? 0 : av - bv) || a.powerKey.localeCompare(b.powerKey);
}

export function distinctMagnetChoices(entries: WorkshopMagnetChoice[], key: 'sizeKey' | 'powerKey') {
  return entries.filter((entry, index) => entries.findIndex(other => other[key] === entry[key]) === index);
}

/** Keep the exact variant when it still matches; otherwise take the stable first option. */
export function matchingMagnet(entries: WorkshopMagnetChoice[], currentId: string) {
  return entries.find(entry => entry.id === currentId) ?? entries[0];
}
