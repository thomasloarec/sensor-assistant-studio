import { bareMagnetModel } from "./magnet-catalog";
import { sensorById, type SensorModel } from "./sensor-catalog";
/** Housing envelopes from Packaged-Magnets.pdf V03, 18 Jun 2026.
 * Housing details reuse matching sensor drawings; active material/axis is not inferred. */
export function pairedMagnetModel(id: string): SensorModel | null {
  const sensorId = (
    { M02: "MK02", M04: "MK04", M05: "MK05", M13: "MK13", M21: "MK21" } as Record<string, string>
  )[id];
  if (!sensorId) return bareMagnetModel(id);
  const base = sensorById(sensorId);
  const body: SensorModel["body"] =
    id === "M02" ? [32.4, 10, 16.7] : id === "M21" ? [28.5, 6.5, 19] : base.body;
  return {
    ...base,
    id,
    name: id,
    body,
    color: "#3a79ad",
    sourceFile: "Packaged-Magnets.pdf",
    contact: "unsupported",
  };
}
