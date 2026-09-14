import type { SensorModel } from "./sensor-catalog";

export const ACTIVATION_BROCHURE =
  "https://standexdetect.com/wp-content/uploads/sites/2/2025/10/brochure-reed-sensor-activation-guide.pdf";
export interface CatalogMagnet {
  id: string;
  name: string;
  material: "AlNiCo" | "Ferrite" | "NdFeB" | "SmCo" | "unknown";
  shape: "cylinder" | "block";
  /** Envelope [length X, height Y, width Z] in mm, never active magnetic geometry. */
  body: readonly [number, number, number];
  sourcePage: number;
  moment: number | null;
}
const cylinder = (
  id: string,
  name: string,
  material: CatalogMagnet["material"],
  diameter: number,
  length: number,
  sourcePage: number,
  moment: number | null = null,
): CatalogMagnet => ({
  id,
  name,
  material,
  shape: "cylinder",
  body: [length, diameter, diameter],
  sourcePage,
  moment,
});
const block = (
  id: string,
  name: string,
  material: CatalogMagnet["material"],
  length: number,
  width: number,
  height: number,
  sourcePage: number,
  moment: number | null = null,
): CatalogMagnet => ({
  id,
  name,
  material,
  shape: "block",
  body: [length, height, width],
  sourcePage,
  moment,
});

/** Do not equate the ungraded 4003004003 reference with the AlNiCo500 table magnet. */
export const REFERENCE_CYLINDER = "4003004003";
export const BARE_MAGNETS: readonly CatalogMagnet[] = [
  cylinder(REFERENCE_CYLINDER, "4003004003 · Ø 4 × 19 mm", "unknown", 4, 19, 3),
  cylinder("SMCO5-5X4", "SmCo5 · Ø 5 × 4 mm", "SmCo", 5, 4, 4, 7.2),
  cylinder("N45-4X19", "NdFeB N45 · Ø 4 × 19 mm", "NdFeB", 4, 19, 5, 30.8),
  block("NDFEB-10X5X1.9", "NdFeB · 10 × 5 × 1,9 mm", "NdFeB", 10, 5, 1.9, 6, 10.3),
  block("HF3225-14.95X10X5", "HF 32/25 · 14,95 × 10 × 5 mm", "Ferrite", 14.95, 10, 5, 7, 28.8),
  cylinder("ALNICO500-5.5X22", "AlNiCo500 · Ø 5,5 × 22 mm", "AlNiCo", 5.5, 22, 8, 36.6),
  cylinder("ALNICO500-4X19", "AlNiCo500 · Ø 4 × 19 mm", "AlNiCo", 4, 19, 9, 14.8),
  cylinder("ALNICO500-3.7X22", "AlNiCo500 · Ø 3,7 × 22 mm", "AlNiCo", 3.7, 22, 10, 19.8),
  cylinder("N35-4X2", "NdFeB N35 · Ø 4 × 2 mm", "NdFeB", 4, 2, 11, 3.39),
  ...[
    [2.5, 12.7],
    [3, 12],
    [4, 19],
    [5, 4],
    [5, 20],
    [5.5, 22],
    [7.5, 27],
  ].map(([d, l]) =>
    cylinder("ALNICO-" + d + "X" + l, "AlNiCo · Ø " + d + " × " + l + " mm", "AlNiCo", d!, l!, 38),
  ),
  block("ALNICO-3.2X3.2X19", "AlNiCo · 3,2 × 3,2 × 19 mm", "AlNiCo", 19, 3.2, 3.2, 38),
  cylinder("N35-4X19", "NdFeB N35 · Ø 4 × 19 mm", "NdFeB", 4, 19, 39),
  cylinder("N35H-4X19", "NdFeB N35H · Ø 4 × 19 mm", "NdFeB", 4, 19, 39),
  cylinder("NDFEB250175H-6X10", "NdFeB 250/175H · Ø 6 × 10 mm", "NdFeB", 6, 10, 39),
  block("NDFEB250175H-10X5X1.9", "NdFeB 250/175H · 10 × 5 × 1,9 mm", "NdFeB", 10, 5, 1.9, 39),
  cylinder("SMCO5-1.9X3", "SmCo5 · Ø 1,9 × 3 mm", "SmCo", 1.9, 3, 39),
  cylinder("SMCO5-3X4", "SmCo5 · Ø 3 × 4 mm", "SmCo", 3, 4, 39),
  block("HF2826-2.6X2.6X4", "HF 28/26 · 2,6 × 2,6 × 4 mm", "Ferrite", 4, 2.6, 2.6, 39),
  block("HF2826-3.5X1.8X1.8", "HF 28/26 · 3,5 × 1,8 × 1,8 mm", "Ferrite", 3.5, 1.8, 1.8, 39),
  block("HF2826-6.7X6.7X2.7", "HF 28/26 · 6,7 × 6,7 × 2,7 mm", "Ferrite", 6.7, 6.7, 2.7, 39),
];
/**
 * Aimants en boîtier de `public/datasheets/Packaged-Magnets.pdf` V03, 18 juin 2026.
 * Chaque boîtier réutilise EXACTEMENT le dessin du capteur correspondant, sans
 * câble ni contacts : c'est une enveloppe cotée, jamais une géométrie magnétique
 * active. `documentedAs` signale une correspondance documentaire quand la
 * référence demandée par l'utilisateur diffère du nom de la fiche : rien n'y est
 * présenté comme référence constructeur vérifiée.
 */
export interface PackagedMagnet {
  id: string;
  /** Boîtier capteur réutilisé pour la géométrie. */
  housing: string;
  /** Boîtier alternatif selon la variante de capteur sélectionnée. */
  housingBySensor?: Readonly<Record<string, string>>;
  /** Nom porté par la fiche Packaged Magnets quand il diffère de `id`. */
  documentedAs?: string;
  /** Orientation des trous oblongs, réellement distincte en 3D. */
  holeAxis?: "horizontal" | "vertical";
  /** Page officielle du produit, quand elle existe. */
  productPage?: string;
  /** Fiche capteur qui publie l'actionneur, quand la variante en vient. */
  datasheet?: string;
  /** Nuance/variante exactement telle qu'elle est nommée par la fiche. */
  grade?: string;
}
/** Fiches MK36/MK37/MK38, V00 17 janvier 2025 : actionneurs nommés M36/M37/M38-N42. */
const MK_SERIES_DATASHEET = (family: string) =>
  `https://standexdetect.com/wp-content/uploads/sites/2/2026/06/datasheet-reed-sensor-series-${family}.pdf`;
export const PACKAGED_MAGNETS: readonly PackagedMagnet[] = [
  { id: "M02", housing: "MK02" },
  { id: "M03", housing: "MK03" },
  { id: "M04", housing: "MK04", productPage: "https://standexdetect.com/products/sensors/magnets-and-actuators/m04", datasheet: MK_SERIES_DATASHEET("mk04").replace("2026/06", "2025/09") },
  { id: "M05", housing: "MK05" },
  { id: "M13", housing: "MK13" },
  { id: "M13B", housing: "MK11-B-M6", documentedAs: "M11B" },
  { id: "M11P", housing: "MK11-P-M8" },
  {
    id: "M11S",
    housing: "MK11-M8",
    housingBySensor: { "MK11-M5": "MK11-M5", "MK11-M8": "MK11-M8" },
  },
  { id: "M21", housing: "MK21", holeAxis: "horizontal" },
  {
    id: "M21P/1",
    housing: "MK21",
    holeAxis: "horizontal",
    productPage: "https://standexdetect.com/products/sensors/magnets-and-actuators/m21p1",
  },
  {
    id: "M21P/2",
    housing: "MK21",
    holeAxis: "vertical",
    productPage: "https://standexdetect.com/products/sensors/magnets-and-actuators/m21p2",
  },
  { id: "M27", housing: "MK27", documentedAs: "MK27" },
  { id: "M36", housing: "MK36" },
  { id: "M37", housing: "MK37" },
  { id: "M38", housing: "MK38" },
  // Variantes nommées par les fiches produit : la nuance N42 est celle des
  // tableaux « Activation Distances », elle n'est jamais étendue aux autres.
  { id: "M36-N42", housing: "MK36", documentedAs: "M36", grade: "N42", datasheet: MK_SERIES_DATASHEET("mk36") },
  { id: "M37-N42", housing: "MK37", documentedAs: "M37", grade: "N42", datasheet: MK_SERIES_DATASHEET("mk37") },
  { id: "M38-N42", housing: "MK38", documentedAs: "M38", grade: "N42", datasheet: MK_SERIES_DATASHEET("mk38") },
];

export const PACKAGED_MAGNET_IDS: readonly string[] = PACKAGED_MAGNETS.map((m) => m.id);
export const packagedMagnet = (id: string): PackagedMagnet | null =>
  PACKAGED_MAGNETS.find((m) => m.id === id) ?? null;
/** Fiche « Magnet in housing » de la gamme, source complémentaire des boîtiers. */
export const HOUSING_DATASHEET =
  "https://standexdetect.com/wp-content/uploads/sites/2/2025/09/datasheet-reed-sensor-series-magnet-in-housing.pdf";
export function magnetSource(id: string) {
  const packaged = packagedMagnet(id);
  if (packaged) return packaged.datasheet ?? packaged.productPage ?? "/datasheets/Packaged-Magnets.pdf";

  if (id === REFERENCE_CYLINDER)
    return "https://standexdetect.com/wp-content/uploads/sites/2/2025/12/Activate-Distance-Guide-for-Reed-Sensors.pdf#page=3";
  const m = BARE_MAGNETS.find((m) => m.id === id);
  return m ? ACTIVATION_BROCHURE + "#page=" + m.sourcePage : null;
}
export function bareMagnetModel(id: string): SensorModel | null {
  const m = BARE_MAGNETS.find((m) => m.id === id);
  return m
    ? {
        ...m,
        category: m.shape === "cylinder" ? "Cylindrique" : "À visser",
        color: "#688997",
        sourceFile:
          id === REFERENCE_CYLINDER
            ? "Activate-Distance-Guide-for-Reed-Sensors.pdf"
            : "brochure-reed-sensor-activation-guide.pdf",
        description: "",
        contact: "unsupported",
        magnet: true,
      }
    : null;
}

