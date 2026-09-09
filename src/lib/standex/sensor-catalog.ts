/** Dimensions read from the supplied Standex drawings. All lengths are millimetres.
 * This is a visual catalogue, not a recommendation or a calibrated switching model.
 * Internal contacts, cable lengths, fillets and thread profiles are illustrative.
 */
export type SensorShape =
  | "cylinder"
  | "threaded"
  | "flange"
  | "block"
  | "smd"
  | "pressfit"
  | "glass"
  | "custom_pcb";
export type SensorCategory =
  | "Cylindrique"
  | "À visser"
  | "À encastrer"
  | "CMS"
  | "Pédagogique"
  | "Sur mesure";
export interface SensorModel {
  id: string;
  name: string;
  category: SensorCategory;
  shape: SensorShape;
  /** Outside body envelope [length X, height Y, width Z], excluding cables/nuts/leads. */
  body: readonly [number, number, number];
  color: string;
  sourceFile: string | null;
  sourcePage: number;
  description: string;
  contact: "A" | "unsupported";
  cableSide?: -1 | 1;
  terminalSpan?: number;
  collarDiameter?: number;
  nutWidth?: number;
  /** Raised electronics portion, mounting plate thickness and holes [x,z,length,width]. */
  raisedDepth?: number;
  baseThickness?: number;
  holes?: readonly (readonly [number, number, number, number])[];
  /** Bare glass reed envelope [length X, diameter Y, diameter Z], for board-level schematics. */
  reed?: readonly [number, number, number];
  pcbThickness?: number;
  note?: string;
}
const cylindrical = (id: string, length: number, height: number, width = height): SensorModel => ({
  id,
  name: id.replace("_", "/"),
  category: "Cylindrique",
  shape: "cylinder",
  body: [length, height, width],
  color: "#333d45",
  sourceFile: id + ".pdf",
  sourcePage: 1,
  description: "Boîtier cylindrique avec sortie câble",
  contact: "A",
});
const flanged = (
  id: string,
  l: number,
  w: number,
  h: number,
  raisedDepth: number,
  baseThickness: number,
  holes: SensorModel["holes"],
  extra: Partial<SensorModel> = {},
): SensorModel => ({
  id,
  name: id,
  category: "À visser",
  shape: "flange",
  body: [l, h, w],
  color: "#576b80",
  sourceFile: id + ".pdf",
  sourcePage: 1,
  description: "Boîtier à fixation par vis",
  contact: "A",
  raisedDepth,
  baseThickness,
  ...(holes ? { holes } : {}),
  ...extra,
});
const threaded = (
  id: string,
  name: string,
  l: number,
  d: number,
  nutWidth: number,
  color: string,
  file: string,
): SensorModel => ({
  id,
  name,
  category: "À visser",
  shape: "threaded",
  body: [l, d, d],
  nutWidth,
  color,
  sourceFile: file,
  sourcePage: 1,
  description: "Corps fileté avec écrous de montage",
  contact: "A",
  note: "Le diamètre indiqué est celui du corps. Les écrous sont représentés séparément ; profil des filets simplifié.",
});
const pressfit = (id: string, l: number, d: number): SensorModel => ({
  id,
  name: id + " · sans adaptateur",
  category: "À encastrer",
  shape: "pressfit",
  body: [l, d, d],
  collarDiameter: 10.7,
  color: "#647180",
  sourceFile: id + ".pdf",
  sourcePage: 2,
  description: "Boîtier à collerette pour montage encastré",
  contact: "A",
  note: "Diamètre de la collerette : 10,7 mm. Version sans adaptateur, contact normalement ouvert.",
});
/** Schéma pédagogique sur mesure : cotes d'illustration, aucune référence commandable. */
export const CUSTOM_SENSOR_ID = "CUSTOM";
const CUSTOM_REED_LENGTH = 20;
const CUSTOM_REED_DIAMETER = 4;
const CUSTOM_PCB_THICKNESS = 1.6;
export const SENSOR_CATALOG: readonly SensorModel[] = [
  {
    id: "MK24-A-J",
    name: "MK24 · Form A · J",
    category: "CMS",
    shape: "smd",
    body: [5, 1.6, 2.2],
    terminalSpan: 5.5,
    color: "#333c44",
    sourceFile: "MK24.pdf",
    sourcePage: 1,
    description: "Reed miniature surmoulé, connexions repliées sous le boîtier",
    contact: "A",
    note: "Corps 5 × 2,2 × 1,6 mm ; encombrement avec connexions J : 5,5 mm. Les autres connexions et Form B ont d'autres encombrements.",
  },
  cylindrical("MK03", 25.5, 5.8),
  flanged(
    "MK02",
    32.4,
    16.8,
    10,
    8.65,
    3,
    [
      [-11, 4.15, 3.2, 5.4],
      [11, 4.15, 3.2, 5.4],
    ],
    {
      color: "#4478a2",
      contact: "unsupported",
      description: "Détecteur de métal ferreux, montage par vis",
      note: "Ce capteur utilise un aimant intégré pour détecter du métal ferreux. Le calcul reed + aimant externe de cet atelier ne modélise pas son activation.",
    },
  ),
  flanged("MK04", 23, 13.9, 5.9, 7.5, 2.9, [
    [-7, 3.05, 3.1, 3.1],
    [7, 3.05, 3.1, 3.1],
  ]),
  flanged("MK05", 23, 19.4, 5.9, 7.5, 2.9, [[0, 3.7, 17, 5.1]]),
  flanged("MK13", 23, 13.9, 5.9, 7.5, 2.9, [
    [-6.225, 3.05, 9, 3.1],
    [6.225, 3.05, 9, 3.1],
  ]),
  cylindrical("MK14", 25.5, 4),
  { ...cylindrical("MK18", 17, 5, 4.6), description: "Corps compact à section ovale" },
  { ...cylindrical("MK20_1", 10, 3, 2.7), description: "Petit boîtier à section ovale" },
  { ...cylindrical("MK20_2", 7.5, 2.7, 2.5), description: "Boîtier miniature à section ovale" },
  flanged("MK21", 28.5, 19, 6.25, 9.5, 3.4, [
    [-8.25, 4.78, 7.2, 3.25],
    [8.25, 4.78, 7.2, 3.25],
  ]),
  flanged(
    "MK21PR",
    28.5,
    19,
    6.25,
    9.5,
    3.4,
    [
      [-8.25, 4.78, 7.2, 3.25],
      [8.25, 4.78, 7.2, 3.25],
    ],
    {
      cableSide: 1,
      description: "Montage par vis, sortie câble inversée par rapport au MK21",
    },
  ),
  flanged(
    "MK26",
    32,
    10,
    6,
    7,
    3.3,
    [
      [-12, -1.5, 4.4, 3.3],
      [12, -1.5, 3.3, 3.3],
    ],
    {
      description: "Boîtier bas avec deux fixations",
      note: "Enveloppe vérifiée ; épaulements autour des fixations simplifiés.",
    },
  ),
  {
    ...flanged("MK27", 50, 20, 10, 20, 10, [
      [-16, -5.1, 4.5, 4.5],
      [16, -5.1, 4.5, 4.5],
    ]),
    shape: "block",
    color: "#96a3ac",
    description: "Boîtier aluminium rectangulaire",
    note: "Câble et renfort de sortie représentés schématiquement.",
  },
  threaded("MK11-M5", "MK11 · inox M5", 25, 5, 7, "#a1aeb6", "MK11-Stainless.pdf"),
  threaded("MK11-M8", "MK11 · inox M8", 50, 8, 13, "#a1aeb6", "MK11-Stainless.pdf"),
  threaded("MK11-P-M8", "MK11 · plastique M8", 38, 8, 13, "#3c444a", "MK11-Plastic.pdf"),
  threaded("MK11-B-M6", "MK11 · laiton M6", 38, 6, 10, "#b6a06a", "MK11-Brass.pdf"),
  pressfit("MK36", 15.5, 9.3),
  pressfit("MK37", 22, 9.3),
  pressfit("MK38", 31, 8.5),
  {
    id: "GENERIC",
    name: "Reed pédagogique",
    category: "Pédagogique",
    shape: "glass",
    body: [20, 4, 4],
    color: "#b3d4db",
    sourceFile: null,
    sourcePage: 1,
    description: "Contact nu fictif pour explorer le principe",
    contact: "A",
    note: "Dimensions choisies pour l'illustration ; aucune référence commerciale.",
  },
  {
    id: CUSTOM_SENSOR_ID,
    name: "Sur mesure · schéma pédagogique",
    category: "Sur mesure",
    shape: "custom_pcb",
    reed: [CUSTOM_REED_LENGTH, CUSTOM_REED_DIAMETER, CUSTOM_REED_DIAMETER],
    pcbThickness: CUSTOM_PCB_THICKNESS,
    body: [
      CUSTOM_REED_LENGTH * 3,
      CUSTOM_PCB_THICKNESS + CUSTOM_REED_DIAMETER,
      CUSTOM_REED_DIAMETER * 5,
    ],
    color: "#2f6b52",
    sourceFile: null,
    sourcePage: 1,
    description: "Reed nu soudé sur circuit imprimé : schéma pédagogique proportionnel",
    contact: "A",
    note: "Schéma pédagogique uniquement : reed nu en verre de 20 mm × Ø 4 mm posé sur un circuit imprimé de 60 × 20 × 1,6 mm (longueur = 3 × le corps du reed, largeur = 5 × son diamètre). Ce n'est pas une référence commandable, aucune distance de commutation n'est documentée et aucune caractéristique n'est validée.",
  },
];
export function sensorById(id: string): SensorModel {
  return SENSOR_CATALOG.find((s) => s.id === id) ?? SENSOR_CATALOG.find((s) => s.id === "GENERIC")!;
}
/** Existe-t-il réellement une entrée pour cet identifiant ? Un repli silencieux sur
 * un autre capteur (MK03, GENERIC) ne doit jamais passer pour le choix du client. */
export const isKnownSensorId = (id: string) => SENSOR_CATALOG.some((s) => s.id === id);
/** Cotes pédagogiques du schéma sur mesure, dérivées du reed et jamais saisies à la main.
 * Longueur du PCB = 3 × la longueur du corps ; largeur = 5 × son diamètre. */
export function customLayout(s: SensorModel): {
  reedLength: number;
  reedDiameter: number;
  pcbLength: number;
  pcbWidth: number;
  pcbThickness: number;
  notchWidth: number;
  notchDepth: number;
  tabRadius: number;
  tabInset: number;
} | null {
  if (s.shape !== "custom_pcb" || !s.reed) return null;
  const reedLength = s.reed[0],
    reedDiameter = s.reed[1],
    pcbThickness = s.pcbThickness ?? 1.6;
  const pcbLength = reedLength * 3,
    pcbWidth = reedDiameter * 5;
  return {
    reedLength,
    reedDiameter,
    pcbLength,
    pcbWidth,
    pcbThickness,
    notchWidth: pcbWidth * 0.3,
    notchDepth: pcbLength * 0.12,
    tabRadius: pcbWidth * 0.09,
    tabInset: pcbWidth * 0.22,
  };
}
export { number as formatMm } from "@/lib/i18n/core";
import { number as formatMm } from "@/lib/i18n/core";
export function sizeLabel(s: SensorModel): string {
  const [l, h, w] = s.body;
  if (["cylinder", "threaded", "pressfit", "glass"].includes(s.shape) && h === w)
    return `${formatMm(l)} mm · Ø ${formatMm(h)} mm`;
  return `${formatMm(l)} × ${formatMm(w)} × ${formatMm(h)} mm`;
}
export const sensorSource = (s: SensorModel) =>
  s.sourceFile ? `/datasheets/${s.sourceFile}#page=${s.sourcePage}` : null;
/** Blade centre is illustrative, inside the raised part; this is not a CAD datum. */
export const bladeOffsetZ = (s: SensorModel) =>
  s.shape === "flange" ? -s.body[2] / 2 + (s.raisedDepth ?? s.body[2]) / 2 : 0;
/** Le reed du schéma sur mesure repose SUR la carte : ses lames ne sont pas au centre. */
export const bladeOffsetY = (s: SensorModel) => {
  const layout = customLayout(s);
  return layout ? -s.body[1] / 2 + layout.pcbThickness + layout.reedDiameter / 2 : 0;
};
export const bladeLength = (s: SensorModel) => (s.reed ? s.reed[0] : s.body[0]) * 0.64;
export const MAGNET_REFERENCE = { length: 32.4, height: 10, width: 16.7 }; // M02, Packaged Magnets V03, 18 Jun 2026.
/** Encombrement réellement occupé [longueur, hauteur, largeur] : la longueur
 * inclut les terminaisons quand elles sont documentées (MK24-A-J : 5,5 mm avec
 * connexions J, et non les 5 mm du seul corps). Aucune valeur n'est inventée :
 * sans terminaison documentée, c'est le corps qui fait foi. */
export function overallEnvelope(s: SensorModel): readonly [number, number, number] {
  return [Math.max(s.body[0], s.terminalSpan ?? 0), s.body[1], s.body[2]];
}
