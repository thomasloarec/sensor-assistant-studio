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
  /** Provenance documentaire fabricant (facultative, conservée dans les exports). */
  contactMpn?: string;
  pitchMm?: number;
  wireRangeHint?: string;
  sourceUrl?: string;
  sourcePages?: number[];
  sourceCheckedAt?: string;
  availability?: "unknown";
  note?: string;
}

export type Termination =
  | { kind: "bare_leads" }
  | { kind: "qualified_connector"; combo: QualifiedCombo }
  | { kind: "unqualified_connector"; spec: ConnectorSpec; status: "to_verify_by_rnd" }
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
  if (t.kind === "unqualified_connector")
    return `${t.spec.manufacturer} ${t.spec.mpn} — à vérifier par la R&D`;
  return `${t.text} — à vérifier par la R&D`;
}

/** Saisie structurée d'un connecteur non qualifié : chaque champ est explicite,
 * jamais un champ libre unique. Le statut reste « à vérifier par la R&D ».
 */
export interface ConnectorDraft {
  manufacturer: string;
  mpn: string;
  mating: string;
  gender: "male" | "female" | "unknown";
  positions: string;
  pinout: string;
  wireGauge: string;
  conditions: string;
}

export const EMPTY_CONNECTOR_DRAFT: ConnectorDraft = {
  manufacturer: "",
  mpn: "",
  mating: "",
  gender: "unknown",
  positions: "",
  pinout: "",
  wireGauge: "",
  conditions: "",
};

export const CONNECTOR_FIELD_LABELS: [keyof ConnectorDraft, string][] = [
  ["manufacturer", "Fabricant"],
  ["mpn", "Référence exacte"],
  ["mating", "Contrepartie (référence exacte)"],
  ["positions", "Nombre de voies"],
  ["pinout", "Brochage"],
  ["wireGauge", "Section / gauge des fils"],
  ["conditions", "Conditions (température, IP, courant…)"],
];

export type ConnectorDraftResult =
  { ok: true; termination: Termination } | { ok: false; missing: string[] };

/** Le connecteur n'est retenu que si fabricant et référence exacte sont donnés. */
export function terminationFromDraft(draft: ConnectorDraft): ConnectorDraftResult {
  const missing: string[] = [];
  if (!draft.manufacturer.trim()) missing.push("Fabricant");
  if (!draft.mpn.trim()) missing.push("Référence exacte");
  if (missing.length) return { ok: false, missing };
  const positions = Number(draft.positions.trim());
  const spec: ConnectorSpec = {
    manufacturer: draft.manufacturer.trim(),
    mpn: draft.mpn.trim(),
    mating: draft.mating.trim() || null,
    gender: draft.gender,
    positions: Number.isInteger(positions) && positions > 0 ? positions : null,
    pinout: draft.pinout.trim() || null,
    wireGauge: draft.wireGauge.trim() || null,
    cable: null,
    conditions: draft.conditions.trim() || null,
  };
  return {
    ok: true,
    termination: { kind: "unqualified_connector", spec, status: "to_verify_by_rnd" },
  };
}

export function connectorSummaryLines(t: Termination): string[] {
  if (t.kind === "bare_leads") return ["Fils nus (par défaut)"];
  if (t.kind === "free_reference") return [`${t.text} — à vérifier par la R&D`];
  const s = t.kind === "qualified_connector" ? t.combo.connector : t.spec;
  return [
    `Fabricant : ${s.manufacturer}`,
    `Référence exacte : ${s.mpn}`,
    `Contrepartie : ${s.mating ?? "inconnue"}`,
    `Voies : ${s.positions ?? "inconnu"}`,
    `Brochage : ${s.pinout ?? "inconnu"}`,
    `Section / gauge : ${s.wireGauge ?? "inconnu"}`,
    `Conditions : ${s.conditions ?? "inconnues"}`,
    t.kind === "qualified_connector"
      ? `Combinaison qualifiée (${t.combo.source})`
      : "Combinaison non qualifiée : à vérifier par la R&D.",
  ];
}
