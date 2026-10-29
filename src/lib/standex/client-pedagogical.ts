/** Client boundary: versioned catalogue modelling hypotheses; no frozen field/threshold changes.
 * Evidence: docs/detection-lab/RAPPORT_COHERENCE_2026-10-26.md §§ MK03/MK13;
 * docs/detection-lab-pass3/RAPPORT_PASS3_2026-10-27.md (documentary datums).
 * Estimated internal pose is explicitly not a measured manufacturer datum.
 */
import { DEFAULT_EXPERIMENT, type ExperimentSettings, type PlacementState } from '@/lib/detection-lab/workshop-experiment';
import type { WorkshopConfig } from './magnetic-workshop';
import type { DesignDossier } from '../leadmagnet/dossier';
import { catalogueModel, cataloguePlacement, catalogueFrame, CATALOGUE_MODEL_VERSION } from './catalogue-pedagogical';
import { CATALOGUE_RESPONSE } from './catalogue-response';

export const CLIENT_PEDAGOGICAL_VERSION = CATALOGUE_MODEL_VERSION;
export const VERIFIED_PILOTS = ['SMCO5-5X4', 'N45-4X19'] as const;
/* i18n-canonical: explicit missing evidence, never catalogue aliases. */
export const CLIENT_LIMITS = {
  housing: 'Repère du reed dans ce boîtier non caractérisé : estimation du produit indisponible.',
  magnet: 'Aimant non pris en charge : seuls SMCO5-5X4 et N45-4X19 sont caractérisés pour ce modèle.',
  class: 'Classe AT non établie : une configuration de contact ne définit pas une classe de sensibilité.',
  g: 'Classe G hors du domaine du modèle figé.',
  a: 'Classe A partielle : seule la borne prudente ATmax 10 est disponible.',
  exploration: 'Exploration Form66 indépendante du produit choisi ; aucun résultat ne qualifie ce produit.',
  missing: 'Il manque une variante reed 66 sourcée, son orientation dans le boîtier et les repères par face. Les décalages de brochure ne sont pas des positions internes mesurées.',
};
export function clientCoupleAdapter(config: WorkshopConfig) {
  const model=catalogueModel(config);
  return { version: CLIENT_PEDAGOGICAL_VERSION, supported: true as const, reasons:model.reasons,model,
    settings: { ...DEFAULT_EXPERIMENT, magnetId: config.magnetModel, className: config.sensitivity,
      integration: 'unknown' as const, nearbyMaterial: config.ferromagnetic || config.temperature !== 'ambient',
      rotationFreedom: false, lateralFreedomMm: 0 } };
}
/** Explicit exploration has its OWN settings; never changes dossier identity/class. */
export function explorationSettings(config: WorkshopConfig): ExperimentSettings {
  return { ...DEFAULT_EXPERIMENT,
    magnetId: VERIFIED_PILOTS.some(id => id === config.magnetModel) ? config.magnetModel : DEFAULT_EXPERIMENT.magnetId,
    className: ['A','B','C','D','E','F','G'].includes(config.sensitivity) ? config.sensitivity : DEFAULT_EXPERIMENT.className,
    nearbyMaterial: config.ferromagnetic || config.temperature !== 'ambient' };
}
export interface ClientPedagogicalResult {
  kind: 'client-pedagogical-result'; version: 1; adapterVersion: string; profileVersion: string;
  /** Exact product configuration, NOT the exploratory capsule. Conservative local trace. */
  dossierId?: string;
  configKey: string; sensorId: string; magnetId: string; sensitivity: string;
  state: PlacementState; qualified: false; reasons: string[];
  indicative?: {version:string;progress:number;state:PlacementState;family:string;status:string;lengthMm:number;centre:number[];axis:number[];magnetMethod:string;reference:string};
}
export function clientPedagogicalResult(config: WorkshopConfig,progress=0): ClientPedagogicalResult {
  const adapter = clientCoupleAdapter(config);
  const t=Number.isFinite(progress)?Math.max(0,Math.min(1,progress)):0,model=adapter.model;
  const evidence=config.machine?null:cataloguePlacement(config,catalogueFrame(config,t).pose);
  return { kind: 'client-pedagogical-result', version: 1, adapterVersion: adapter.version,
    profileVersion: CATALOGUE_RESPONSE.id+'@'+CATALOGUE_RESPONSE.version, configKey: JSON.stringify(config), sensorId: config.sensorId,
    magnetId: config.magnetModel, sensitivity: config.sensitivity, state: 'unavailable', qualified: false,
    reasons: [...adapter.reasons],indicative:{version:CATALOGUE_MODEL_VERSION,progress:t,state:evidence?.state??'unavailable',family:model.family,status:model.status,lengthMm:model.lengthMm,centre:model.centre,axis:model.axis,magnetMethod:model.magnetGeometry,reference:model.reference} };
}

/** This trace has no authority: even a file claiming favorable is rebuilt unavailable. */
export function currentClientTrace(d: DesignDossier): ClientPedagogicalResult | null {
  const r=d.clientPedagogical;
  return r && d.workshop && r.dossierId===d.id && r.configKey===JSON.stringify(d.workshop)
    ? {...clientPedagogicalResult(d.workshop,r.indicative?.progress),dossierId:d.id} : null;
}
export function recordClientTrace(d: DesignDossier, config: WorkshopConfig,progress=d.clientPedagogical?.indicative?.progress??0): DesignDossier {
  return {...d,workshop:config,clientPedagogical:{...clientPedagogicalResult(config,progress),dossierId:d.id},
    // Superseded binary predictions cannot reappear in any existing summary/export path.
    testedPairs:(d.testedPairs??[]).map(p=>p.verdict==='expected'?{...p,verdict:'undocumented' as const,
      pullInMm:null,dropOutMm:null,mainMessage:CLIENT_LIMITS.housing,documentedPosition:false}:p)};
}
