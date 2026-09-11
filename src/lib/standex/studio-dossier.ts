import { PUBLISHED_REGISTRY, type PublishedApproach } from "./magnetics/registries";
import { DOSSIER_FIELDS } from "./application-dossier";
import { sensorById, MAGNET_REFERENCE } from "./sensor-catalog";
import type { WorkshopConfig } from "./magnetic-workshop";
import { EMPTY_NEED, validNeed } from "./magnetics/margin";
import type { Need } from "./magnetics/margin";
export interface StudioField {
  value: string;
  source: "atelier" | "user";
  state: "hypothesis" | "confirmed";
  proposal: string | null;
}
export interface StudioStudy {
  version: 1;
  selectedSolutionId?: string | null;
  comparisonApproach?: PublishedApproach;
  example: boolean;
  consulted: boolean;
  need: Need;
  fields: Record<string, StudioField>;
  envelopeMm: [number, number, number] | null;
  cycles: number | null;
}
export const newStudy = (): StudioStudy => ({
  version: 1,
  example: false,
  selectedSolutionId: null,
  comparisonApproach: "D1",
  consulted: false,
  need: { ...EMPTY_NEED },
  fields: {},
  envelopeMm: null,
  cycles: null,
});
export const DERIVABLE_FIELDS = [
  "mounting_type",
  "available_space_constraints",
  "sensor_form_factor",
  "magnet_context",
  "target_distance_and_tolerance",
  "environment_ip_temp",
  "precision_repeatability_lifetime",
] as const;
export function deriveStudioFields(study: StudioStudy, config: WorkshopConfig | null): StudioStudy {
  if (!study.consulted) return study;
  const proposed: Record<string, string> = {},
    n = study.need;
  if (config) {
    const sensor = sensorById(config.sensorId);
    const chosen = PUBLISHED_REGISTRY.rows.find(
      (r) =>
        [r.sensorFamily, r.sensitivityClass, r.magnetId, r.approachId].join("/") ===
          study.selectedSolutionId && r.approachId === (study.comparisonApproach ?? "D1"),
    );
    if (sensor.sourceFile && chosen?.sensorFamily === sensor.id) {
      proposed["mounting_type"] = sensor.category;
      proposed["sensor_form_factor"] = `${sensor.id} (${sensor.category})`;
    }
    if (study.envelopeMm)
      proposed["available_space_constraints"] =
        [...study.envelopeMm].sort((a, b) => b - a).join(" × ") + " mm";
    if (chosen) proposed["magnet_context"] = `${chosen.magnetId} ; ${chosen.approachId}`;
    if (n.gapClosedMm !== null && n.gapOpenMm !== null)
      proposed["target_distance_and_tolerance"] =
        `${n.gapClosedMm} mm / ${n.gapOpenMm} mm ; ±${n.gapToleranceMm === null ? "?" : n.gapToleranceMm} mm`;
    if (n.temperatureMinC !== null && n.temperatureMaxC !== null)
      proposed["environment_ip_temp"] =
        `${n.temperatureMinC} / ${n.temperatureMaxC} °C ; IP ? ; humidité ?`;
    if (study.cycles !== null)
      proposed["precision_repeatability_lifetime"] =
        `${study.cycles} cycles ; précision ? ; répétabilité ?`;
  }
  const fields = structuredClone(study.fields);
  for (const id of DERIVABLE_FIELDS) {
    const current = fields[id],
      value = proposed[id];
    if (!current || (current.state === "hypothesis" && current.source === "atelier")) {
      if (value) fields[id] = { value, source: "atelier", state: "hypothesis", proposal: null };
      else delete fields[id];
    } else fields[id] = { ...current, proposal: value && value !== current.value ? value : null };
  }
  return { ...study, fields };
}
export function confirmStudioField(study: StudioStudy, id: string): StudioStudy {
  const f = study.fields[id];
  return f?.value.trim()
    ? { ...study, fields: { ...study.fields, [id]: { ...f, state: "confirmed", source: "user" } } }
    : study;
}
export function parseStudioStudy(raw: unknown): StudioStudy | null {
  if (!raw || typeof raw !== "object") return null;
  const x = raw as StudioStudy;
  if (
    x.version !== 1 ||
    typeof x.example !== "boolean" ||
    typeof x.consulted !== "boolean" ||
    !x.need ||
    Object.keys(EMPTY_NEED).some((k) => !(k in x.need)) ||
    !validNeed(x.need) ||
    !x.fields ||
    typeof x.fields !== "object" ||
    Array.isArray(x.fields)
  )
    return null;
  if (
    !(x.cycles === null || (Number.isSafeInteger(x.cycles) && x.cycles > 0)) ||
    !(
      x.envelopeMm === null ||
      (Array.isArray(x.envelopeMm) &&
        x.envelopeMm.length === 3 &&
        x.envelopeMm.every((v) => Number.isFinite(v) && v > 0))
    )
  )
    return null;
  const fields: StudioStudy["fields"] = {};
  for (const [id, f] of Object.entries(x.fields)) {
    if (
      !DOSSIER_FIELDS.some((d) => d.id === id) ||
      !f ||
      typeof f.value !== "string" ||
      f.value.length > 10000 ||
      !["atelier", "user"].includes(f.source) ||
      !["hypothesis", "confirmed"].includes(f.state) ||
      !(f.proposal === null || typeof f.proposal === "string")
    )
      return null;
    fields[id] = { value: f.value, source: f.source, state: f.state, proposal: f.proposal };
  }
  return {
    version: 1,
    selectedSolutionId:
      typeof x.selectedSolutionId === "string" && x.selectedSolutionId.length < 200
        ? x.selectedSolutionId
        : null,
    comparisonApproach: ["D1", "D2", "D3", "D4", "D5"].includes(x.comparisonApproach ?? "")
      ? x.comparisonApproach!
      : "D1",
    example: x.example,
    consulted: x.consulted,
    need: Object.fromEntries(
      Object.keys(EMPTY_NEED).map((k) => [k, x.need[k as keyof Need]]),
    ) as unknown as Need,
    fields,
    envelopeMm: x.envelopeMm,
    cycles: x.cycles,
  };
}
