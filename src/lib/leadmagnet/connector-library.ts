/** Petite bibliothèque de boîtiers documentés par le fabricant.
 *
 * Ce n'est PAS un catalogue du marché ni une qualification d'assemblage :
 * chaque entrée reste « à vérifier par la R&D », sans brochage, sans section de
 * fil réelle et sans disponibilité connue. Boîtier, contacts et embase restent
 * trois références distinctes.
 */
import type { ConnectorDraft, ConnectorSpec, Termination } from "./connectors";

export interface DocumentedHousing {
  manufacturer: string;
  family: string;
  /** Référence exacte du BOÎTIER (le contact et l'embase sont séparés). */
  housingMpn: string;
  positions: number;
  pitchMm: number;
  /** Référence exacte du CONTACT à sertir. */
  contactMpn: string;
  /** Modèle d'embase en contrepartie (finition/conditionnement non figés). */
  matingHeaderModel: string;
  wireRangeHint: string;
  sourceUrl: string;
  sourcePages: readonly number[];
  checkedAt: string;
  qualification: "to_verify_by_rnd";
  pinout: null;
  actualWireGauge: null;
  availability: "unknown";
  note: string;
}

const NOTE =
  "Base de conception issue du fabricant. Boîtier et contacts distincts. " +
  "Finition/conditionnement de l'embase, fil, sertissage, brochage et conditions d'usage " +
  "à confirmer avant commande. Aucune qualification d'assemblage Standex présumée.";

const XH = {
  manufacturer: "JST",
  family: "XH",
  pitchMm: 2.5,
  contactMpn: "SXH-001T-P0.6",
  wireRangeHint: "AWG 28–22; isolant Ø0,9–1,9 mm",
  sourceUrl: "https://www.jst-mfg.com/product/pdf/eng/eXH.pdf",
  sourcePages: [3, 4, 5],
} as const;

const PH = {
  manufacturer: "JST",
  family: "PH",
  pitchMm: 2,
  contactMpn: "SPH-002T-P0.5S",
  wireRangeHint: "AWG 30–24; isolant Ø0,8–1,5 mm",
  sourceUrl: "https://www.jst-mfg.com/product/pdf/eng/ePH.pdf",
  sourcePages: [2, 3],
} as const;

const common = {
  checkedAt: "2026-09-08",
  qualification: "to_verify_by_rnd",
  pinout: null,
  actualWireGauge: null,
  availability: "unknown",
  note: NOTE,
} as const;

export const DOCUMENTED_HOUSINGS: readonly DocumentedHousing[] = [
  { ...XH, ...common, housingMpn: "XHP-2", positions: 2, matingHeaderModel: "B2B-XH-A" },
  { ...XH, ...common, housingMpn: "XHP-3", positions: 3, matingHeaderModel: "B3B-XH-A" },
  { ...PH, ...common, housingMpn: "PHR-2", positions: 2, matingHeaderModel: "B2B-PH-K-S" },
  { ...PH, ...common, housingMpn: "PHR-3", positions: 3, matingHeaderModel: "B3B-PH-K-S" },
];

export function housingById(housingMpn: string): DocumentedHousing | null {
  return DOCUMENTED_HOUSINGS.find((h) => h.housingMpn === housingMpn) ?? null;
}

export function housingLabel(h: DocumentedHousing): string {
  return `${h.manufacturer} ${h.family} ${h.housingMpn} — ${h.positions} voies, pas ${h.pitchMm} mm`;
}

/** Préremplissage : jamais de brochage ni de section réelle inventés. */
export function draftFromHousing(h: DocumentedHousing, base: ConnectorDraft): ConnectorDraft {
  return {
    ...base,
    manufacturer: h.manufacturer,
    mpn: h.housingMpn,
    mating: h.matingHeaderModel,
    gender: "female",
    positions: String(h.positions),
    pinout: "",
    wireGauge: "",
    conditions: base.conditions,
  };
}

/** Terminaison structurée conservant la provenance documentaire (export, snapshot, revue). */
export function terminationFromHousing(h: DocumentedHousing): Termination {
  const spec: ConnectorSpec = {
    manufacturer: h.manufacturer,
    mpn: h.housingMpn,
    mating: h.matingHeaderModel,
    gender: "female",
    positions: h.positions,
    pinout: null,
    wireGauge: null,
    cable: null,
    conditions: null,
    contactMpn: h.contactMpn,
    pitchMm: h.pitchMm,
    wireRangeHint: h.wireRangeHint,
    sourceUrl: h.sourceUrl,
    sourcePages: [...h.sourcePages],
    sourceCheckedAt: h.checkedAt,
    availability: "unknown",
    note: h.note,
  };
  return { kind: "unqualified_connector", spec, status: "to_verify_by_rnd" };
}
