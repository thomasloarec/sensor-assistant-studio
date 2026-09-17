import { sensorById, type SensorModel } from "@/lib/standex/sensor-catalog";

/** Shared by forms, reports and product drawings. No cable on board components. */
export function isPcbSensor(id: string | null | undefined): boolean {
  if (!id) return false;
  const m = sensorById(id);
  return ["smd", "glass", "custom_pcb"].includes(m.shape) || m.category === "THT";
}

export function cableConstruction(model: SensorModel): "none" | "wires" | "jacket" | "metal" {
  if (model.magnet || isPcbSensor(model.id)) return "none";
  return model.id === "MK18" ? "wires" : model.id === "MK27" ? "metal" : "jacket";
}

// i18n-canonical: labels translated by callers.
export function housingMaterial(model: SensorModel): string | null {
  if (model.id.startsWith("MK11-P")) return "Boîtier en plastique";
  if (model.id.startsWith("MK11-B")) return "Boîtier en laiton";
  if (model.id.startsWith("MK11")) return "Boîtier en acier inoxydable";
  return null;
}

// i18n-canonical: grouping is descriptive, never a suitability verdict.
export function pairCategory(model: SensorModel): string {
  if (isPcbSensor(model.id)) return "Capteurs sur PCB et sur mesure";
  if (["cylinder", "pressfit", "threaded"].includes(model.shape))
    return "Capteurs cylindriques et filetés";
  return "Capteurs à visser";
}

/** Title from the user's own first sentence; a manually supplied title wins. */
export function suggestedProjectTitle(goal: string): string {
  return goal
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.!?].*$/, "")
    .split(" ")
    .slice(0, 9)
    .join(" ")
    .slice(0, 80);
}
