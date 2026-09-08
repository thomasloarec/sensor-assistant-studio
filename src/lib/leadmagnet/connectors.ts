/** Terminaison : fils nus par défaut, connecteur uniquement par référence exacte.
 * Aucune compatibilité inventée : seules les combinaisons qualifiées documentées sont proposées.
 */
export interface ConnectorSpec {
  /** Référence exacte fabricant, telle qu'imprimée sur la fiche technique. */
  manufacturer: string;
  mpn: string;
  mating: string | null;
  gender: "male" | "female" | "unknown";
  positions: number | null;
  pinout: string | null;
  wireGauge: string | null;
  cable: string | null;
  conditions: string | null;
}

export type Termination =
  | { kind: "bare_leads" }
  | { kind: "qualified_connector"; combo: QualifiedCombo }
  | { kind: "free_reference"; text: string; status: "to_verify_by_rnd" };

export interface QualifiedCombo {
  id: string;
  sensorMpn: string;
  connector: ConnectorSpec;
  source: string;
}

/** Catalogue restreint : uniquement des combinaisons qualifiées et documentées. Vide par défaut. */
export const QUALIFIED_COMBOS: readonly QualifiedCombo[] = [];

export const DEFAULT_TERMINATION: Termination = { kind: "bare_leads" };

export function combosForSensor(
  sensorMpn: string,
  catalog: readonly QualifiedCombo[] = QUALIFIED_COMBOS,
): QualifiedCombo[] {
  return catalog.filter((c) => c.sensorMpn === sensorMpn);
}

export function freeReference(text: string): Termination {
  return { kind: "free_reference", text: text.trim(), status: "to_verify_by_rnd" };
}

export function terminationLabel(t: Termination): string {
  if (t.kind === "bare_leads") return "Fils nus (par défaut)";
  if (t.kind === "qualified_connector")
    return `${t.combo.connector.manufacturer} ${t.combo.connector.mpn} — combinaison qualifiée (${t.combo.source})`;
  return `${t.text} — à vérifier par la R&D`;
}
