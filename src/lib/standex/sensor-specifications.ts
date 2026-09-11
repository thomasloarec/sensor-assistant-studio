/** Series values transcribed from the supplied manufacturer PDFs, pages 1–2.
 * Electrical options belong to the SERIES: compatibility with a specific housing/order
 * code must be checked. Never combine the maxima of different switch models.
 */
export interface ElectricalOption {
  model: string;
  power: number;
  voltage: number;
  switching: number;
  carry: number;
}
export interface SensorSpecifications {
  material: string;
  cableMaterial: string;
  cableLengths: readonly number[];
  temperatures: readonly { condition: string; min: number; max: number }[];
  electrical: readonly ElectricalOption[];
  strength: string;
  integration: string;
  electricalNote?: string;
  cableNote?: string;
  revision: string;
}
const option = (
  model: string,
  power: number,
  voltage: number,
  switching: number,
  carry: number,
): ElectricalOption => ({ model, power, voltage, switching, carry });
const v66 = option("66", 10, 180, 0.5, 1.25),
  v90 = option("90", 10, 175, 0.5, 1),
  v85 = option("85", 100, 1000, 1, 2.5);
const standardCable = [200, 300, 500, 1000, 1500, 2000, 3000, 5000];
const temperature = (min: number, max: number) => [
  { condition: "Câble immobile", min, max },
  { condition: "Câble en mouvement", min: -5, max },
];
const standard: SensorSpecifications = {
  material: "PBT renforcé de fibres de verre",
  cableMaterial: "PVC",
  cableLengths: standardCable,
  temperatures: temperature(-30, 80),
  electrical: [v66, v90],
  strength: "Intégration polyvalente",
  integration:
    "Éloignez le pli du câble d'au moins 5 mm du boîtier. La présence de fer peut modifier la distance de commutation.",
  revision: "2019-02-28",
};
const recessed: SensorSpecifications = {
  ...standard,
  material: "PBT",
  cableLengths: [300, 2000],
  cableNote:
    "300 mm : UL1569. 2 m : VdS. Ces deux câbles ont des plages de température différentes.",
  temperatures: [
    { condition: "UL · câble immobile", min: -40, max: 75 },
    { condition: "VdS · câble immobile", min: -30, max: 75 },
  ],
  strength: "Montage encastré",
  integration:
    "Trou de montage : au moins 9,53 mm. Adaptateurs disponibles pour le montage dans l'acier. Collerette : Ø 10,7 mm.",
  revision: "2025-01-17",
};
const threaded: SensorSpecifications = {
  ...standard,
  electrical: [v66, v85, v90],
  temperatures: temperature(-30, 70),
  strength: "Position réglable par filetage",
  integration:
    "Choisissez le filetage et le contact ensemble. La fiche de série ne garantit pas toutes les combinaisons de boîtier et de contact.",
};
// Local manufacturer datasheets MK01/MK06/MK15/MK16/MK17/MK22/MK30/MK31, pp.1–2.
const pcb: SensorSpecifications = {
  material: "Époxy chargée de minéraux",
  cableMaterial: "Sans câble",
  cableLengths: [],
  temperatures: [{ condition: "Température de fonctionnement", min: -40, max: 130 }],
  electrical: [],
  strength: "Reed surmoulé pour circuit imprimé",
  integration:
    "Enveloppe de la variante dessinée dans la fiche source ; connexions représentées de manière simplifiée. Vérifier la variante avant conception du circuit.",
  revision: "2019-02-28",
};
export const SENSOR_SPECIFICATIONS: Readonly<Record<string, SensorSpecifications>> = {
  MK01: {
    ...pcb,
    electrical: [option("66", 10, 180, 0.5, 1), v90],
    temperatures: [{ condition: "Température de fonctionnement", min: -20, max: 130 }],
  },
  "MK06-4": {
    ...pcb,
    material: "PBT renforcé de fibres de verre",
    electrical: [option("80 · size 4", 10, 170, 0.5, 0.5)],
    temperatures: [{ condition: "Température de fonctionnement", min: -20, max: 130 }],
  },
  MK15: { ...pcb, electrical: [option("66", 10, 180, 0.5, 1)] },
  MK16: { ...pcb, electrical: [option("87", 10, 200, 0.4, 0.5)] },
  MK17: { ...pcb, electrical: [option("80", 10, 170, 0.5, 0.5)] },
  MK22: { ...pcb, electrical: [option("35", 20, 200, 1, 1.25)] },
  MK30: { ...pcb, electrical: [v85] },
  MK31: {
    ...pcb,
    electrical: [option("04", 3, 30, 0.3, 0.5)],
    temperatures: [{ condition: "Température de fonctionnement", min: -40, max: 115 }],
    revision: "2019-02-27",
  },
  "MK24-A-J": {
    ...standard,
    material: "Époxy chargée de minéraux",
    cableMaterial: "Sans câble · connexions J",
    cableLengths: [],
    temperatures: [{ condition: "Température de fonctionnement", min: -40, max: 130 }],
    electrical: [
      option("04 · standard", 3, 30, 0.3, 0.5),
      option("04 · sensibilité A*", 1, 30, 0.1, 0.3),
    ],
    electricalNote:
      "Les valeurs réduites marquées * concernent la sensibilité magnétique A. La forme de contact A et la classe de sensibilité A sont deux notions distinctes.",
    strength: "Miniaturisation",
    integration:
      "Corps de 5 mm ; 5,5 mm avec connexions J. Montage sur circuit imprimé. Soudage : 260 °C maximum, pendant 5 secondes maximum.",
    cableNote:
      "Connexions de série : droites pour fente de circuit, CMS repliées ou J. Le montage représente la forme A avec connexions J.",
  },
  MK03: {
    ...standard,
    electrical: [v66, option("75", 10, 500, 0.5, 1), v90],
    strength: "Format cylindrique",
  },
  MK02: {
    ...standard,
    strength: "Détection de métal ferreux",
    integration:
      "Aimant intégré : détection d'une cible ferreuse. L'atelier ne calcule pas ce fonctionnement réel ; son animation reste pédagogique.",
  },
  MK04: { ...standard, strength: "Fixation par deux vis" },
  MK05: { ...standard, strength: "Fixation ajustable" },
  MK13: { ...standard, strength: "Fixation ajustable" },
  MK14: { ...standard, temperatures: temperature(-30, 70), strength: "Corps fin · Ø 4 mm" },
  MK18: {
    ...standard,
    temperatures: temperature(-30, 70),
    electrical: [option("87", 10, 200, 0.4, 0.5)],
    strength: "Format compact",
  },
  MK20_1: {
    ...standard,
    material: "PBT 30 % fibres de verre",
    cableLengths: [100, 200, 300, 500],
    temperatures: temperature(-30, 70),
    electrical: [option("80", 10, 170, 0.5, 0.5)],
    strength: "Format compact",
  },
  MK20_2: {
    ...standard,
    material: "PBT 30 % fibres de verre",
    cableLengths: [100, 200, 300, 500],
    temperatures: temperature(-30, 70),
    electrical: [option("04", 3, 30, 0.3, 0.5)],
    strength: "Miniaturisation",
  },
  MK21: {
    ...standard,
    material: "Résine époxy",
    cableMaterial: "Radox",
    cableLengths: standardCable.slice(2),
    electrical: [v66, v85, v90],
    temperatures: [
      { condition: "Câble immobile", min: -40, max: 150 },
      { condition: "Câble en mouvement", min: -30, max: 150 },
    ],
    strength: "Température jusqu'à 150 °C",
  },
  MK21PR: {
    ...standard,
    cableLengths: standardCable.slice(2),
    electrical: [v66, v85, v90],
    strength: "Sortie de câble inversée",
    revision: "2023-10-27",
  },
  MK26: {
    ...standard,
    temperatures: temperature(-20, 80),
    electrical: [option("35", 20, 200, 1, 1.25), v66, v85, v90],
    strength: "Profil bas",
  },
  MK27: {
    ...standard,
    material: "Aluminium",
    cableLengths: standardCable.slice(2),
    electrical: [v66, v85],
    strength: "Boîtier métallique",
  },
  "MK11-M5": { ...threaded, material: "Acier inoxydable" },
  "MK11-M8": { ...threaded, material: "Acier inoxydable" },
  "MK11-P-M8": { ...threaded, material: "Crastin" },
  "MK11-B-M6": { ...threaded, material: "Laiton" },
  MK36: { ...recessed, electrical: [option("1A", 3, 30, 0.2, 0.3)] },
  MK37: { ...recessed, electrical: [option("1A", 10, 180, 0.5, 1), option("1B", 3, 30, 0.2, 0.5)] },
  MK38: {
    ...recessed,
    cableLengths: [300],
    cableNote: "300 mm UL1569 en standard. Longueurs personnalisées sur demande.",
    temperatures: [{ condition: "Câble immobile", min: -40, max: 75 }],
    electrical: [
      option("1A66B", 10, 180, 0.5, 1),
      option("1A85C", 100, 300, 1, 2.5),
      option("1B90C / 1C90C", 3, 30, 0.2, 0.5),
    ],
  },
};
