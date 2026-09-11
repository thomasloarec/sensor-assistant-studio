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
export const PACKAGED_MAGNET_IDS = ["M02", "M04", "M05", "M13", "M21"] as const;
export function magnetSource(id: string) {
  if (PACKAGED_MAGNET_IDS.some((x) => x === id)) return "/datasheets/Packaged-Magnets.pdf";
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
      }
    : null;
}
export function preferredMagnet(sensor: SensorModel): string {
  const paired = (
    { MK02: "M02", MK04: "M04", MK05: "M05", MK13: "M13", MK21: "M21" } as Record<string, string>
  )[sensor.id];
  if (paired) return paired;
  if (["cylinder", "threaded", "pressfit", "glass"].includes(sensor.shape))
    return REFERENCE_CYLINDER;
  return "NDFEB-10X5X1.9";
}
