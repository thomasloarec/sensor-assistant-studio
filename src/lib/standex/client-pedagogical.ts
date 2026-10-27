/** Client boundary v1. No field/threshold changes and no inferred housing pose.
 * Evidence: docs/detection-lab/RAPPORT_COHERENCE_2026-10-26.md §§ MK03/MK13;
 * docs/detection-lab-pass3/RAPPORT_PASS3_2026-10-27.md (documentary datums).
 * None of the named housings has a sourced variant-66 + physical face adapter.
 */
import { DEFAULT_EXPERIMENT, EXPERIMENT, type ExperimentSettings, type PlacementState } from '@/lib/detection-lab/workshop-experiment';
import type { WorkshopConfig } from './magnetic-workshop';
import type { DesignDossier } from '../leadmagnet/dossier';

export const CLIENT_PEDAGOGICAL_VERSION = 'client-form66-boundary-1';
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
  const reasons: string[] = [CLIENT_LIMITS.housing];
  if (!VERIFIED_PILOTS.some(id => id === config.magnetModel)) reasons.push(CLIENT_LIMITS.magnet);
  if (!['A','B','C','D','E','F','G'].includes(config.sensitivity)) reasons.push(CLIENT_LIMITS.class);
  if (config.sensitivity === 'G') reasons.push(CLIENT_LIMITS.g);
  if (config.sensitivity === 'A') reasons.push(CLIENT_LIMITS.a);
  return { version: CLIENT_PEDAGOGICAL_VERSION, supported: false as const, reasons,
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
}
export function clientPedagogicalResult(config: WorkshopConfig): ClientPedagogicalResult {
  const adapter = clientCoupleAdapter(config);
  return { kind: 'client-pedagogical-result', version: 1, adapterVersion: adapter.version,
    profileVersion: EXPERIMENT.version, configKey: JSON.stringify(config), sensorId: config.sensorId,
    magnetId: config.magnetModel, sensitivity: config.sensitivity, state: 'unavailable', qualified: false,
    reasons: [...adapter.reasons] };
}

/** This trace has no authority: even a file claiming favorable is rebuilt unavailable. */
export function currentClientTrace(d: DesignDossier): ClientPedagogicalResult | null {
  const r=d.clientPedagogical;
  return r && d.workshop && r.dossierId===d.id && r.configKey===JSON.stringify(d.workshop)
    ? {...clientPedagogicalResult(d.workshop),dossierId:d.id} : null;
}
export function recordClientTrace(d: DesignDossier, config: WorkshopConfig): DesignDossier {
  return {...d,workshop:config,clientPedagogical:{...clientPedagogicalResult(config),dossierId:d.id},
    // Superseded binary predictions cannot reappear in any existing summary/export path.
    testedPairs:(d.testedPairs??[]).map(p=>p.verdict==='expected'?{...p,verdict:'undocumented' as const,
      pullInMm:null,dropOutMm:null,mainMessage:CLIENT_LIMITS.housing,documentedPosition:false}:p)};
}