/** CSV ingestion schema. Physical values have no defaults. Empty optional cells become null. */
export type RegistryId = "R1" | "R2" | "R2b" | "R2c" | "R3" | "R3b";
export type Cell = string | number | boolean | null;
export type Row = Record<string, Cell>;
type Field = { name: string; type: "text" | "number" | "integer" | "boolean" | "date"; required: boolean; choices?: readonly string[]; pattern?: RegExp; min?: number; max?: number; positive?: boolean };
const f = (name: string, type: Field["type"] = "text", required = true, extra: Partial<Field> = {}): Field => ({ name, type, required, ...extra });
const opt = (name: string) => f(name, "text", false);
const en = (name: string, values: string, required = true) => f(name, "text", required, { choices: values.split("|") });
const num = (name: string, required = false, min?: number) => f(name, "number", required, min === undefined ? {} : { min });
const pos = (name: string, required = true) => f(name, "number", required, { positive: true });
const confidence = () => en("confidence", "high|medium|low");
const entered = () => [f("entered_by"), f("entered_on", "date"), confidence()];
const transcribed = () => [f("transcribed_by"), f("transcribed_on", "date")];
export const SCHEMAS: Record<RegistryId, { stem: string; key: string[]; fields: Field[] }> = {
  R1: { stem: "R1_aimants", key: ["magnet_id"], fields: [
    f("magnet_id", "text", true, { pattern: /^[A-Z0-9][A-Z0-9_-]{1,31}$/ }), f("designation"), opt("standex_reference"),
    en("shape", "block|cylinder|ring"), pos("dim_a_mm"), pos("dim_b_mm", false), pos("dim_c_mm"), pos("inner_diameter_mm", false),
    en("magnetization_axis", "a|b|c|diametral"), en("material_family", "NdFeB|SmCo|AlNiCo|ferrite|other"), opt("grade"),
    pos("br_mt_20c", false), num("br_tolerance_pct", false, 0), num("temp_coeff_br_pct_per_k"), num("max_service_temp_c"), opt("max_service_temp_source"),
    en("source_type", "datasheet|published_table|supplier_site|measured|inferred"), f("source_ref"), ...entered(),
  ] },
  R2: { stem: "R2_calibration_capteurs", key: ["calibration_id"], fields: [
    f("calibration_id", "text", true, { pattern: /^CAL-[0-9]{4}$/ }), f("sensor_family"), opt("sensor_reference"), f("sensitivity_class"),
    en("contact_form", "1A|1B|1C"), f("magnet_id"), f("approach_id"), f("datum_id"), pos("pull_in_mm"), pos("drop_out_mm"), num("temperature_c", true),
    en("value_type", "published_typical|measured_sample|measured_batch"), f("sample_count", "integer", false, { min: 1 }), num("dispersion_mm", false, 0),
    en("source_type", "published_table|datasheet|measured"), f("source_ref"), opt("figure_ref"), ...entered(),
  ] },
  R2b: { stem: "R2b_approches", key: ["approach_id"], fields: [
    f("approach_id"), f("label_source"), f("figure_ref"), en("motion_axis", "x|y|z"), en("offset_axis", "x|y|z", false), num("offset_mm"),
    f("magnet_orientation_deg"), f("description_fr"), f("ambiguous", "boolean"), ...transcribed(),
  ] },
  R2c: { stem: "R2c_datums", key: ["datum_id"], fields: [
    f("datum_id"), f("sensor_family"), f("reference_feature"), f("figure_ref"), num("offset_to_mrp_mm"), f("mrp_known", "boolean"), ...transcribed(),
  ] },
  R3: { stem: "R3_cas_application", key: ["case_id"], fields: [
    f("case_id", "text", true, { pattern: /^CAS-[0-9]{4}-[0-9]{4}$/ }), f("supersedes_case_id", "text", false, { pattern: /^CAS-[0-9]{4}-[0-9]{4}$/ }),
    f("client_masked", "text", true, { pattern: /^CLI-[0-9]{4}$/ }), en("sector", "électroménager|automobile|ferroviaire|médical|industrie|énergie|sécurité|domotique|nautique|aéronautique|autre"),
    f("country", "text", false, { pattern: /^[A-Z]{2}$/ }), f("year", "integer", false, { min: 1960, max: 2030 }), f("application_short_fr"),
    en("detected_object", "pièce mobile|porte ou capot|niveau de liquide|flotteur|piston|rotation|présence d'aimant|autre"),
    en("motion_type", "translation|rotation|basculement|flottaison|aucun"), en("actuation_principle", "aimant sur pièce mobile|aimant fixe et écran ferreux|aimant intégré au capteur et cible ferreuse|autre|inconnu"),
    num("travel_mm", false, 0), num("gap_closed_mm", false, 0), num("gap_open_mm", false, 0), num("gap_tolerance_mm", false, 0), num("temperature_min_c"), num("temperature_max_c"), opt("environment"),
    en("electrical_role", "signal vers carte ou automate|commutation directe de charge|inconnu"), num("switched_voltage_v", false, 0), num("switched_current_a", false, 0),
    en("voltage_nature", "continu|alternatif efficace|crête|inconnu", false), en("load_type", "résistive|inductive|capacitive|lampe|moteur|électrovanne|inconnu", false),
    en("annual_volume_band", "maintenance|<100|100-1000|1000-10000|>10000|inconnu", false), en("outcome", "gagné|perdu|abandonné|en cours|inconnu"),
    en("outcome_reason", "prix|délai|technique|concurrent|projet arrêté|autre|inconnu", false), opt("pitfall_fr"), f("source_document"), ...entered(),
  ] },
  R3b: { stem: "R3b_cas_produits", key: ["case_id", "product_reference", "role"], fields: [
    f("case_id"), f("product_reference"), opt("product_family"), en("role", "capteur retenu|capteur écarté|aimant|accessoire|concurrent"),
    f("quantity_per_unit", "integer", false, { min: 1 }), opt("note_fr"),
  ] },
};
export const REGISTRY_IDS = Object.keys(SCHEMAS) as RegistryId[];
export const header = (id: RegistryId) => SCHEMAS[id].fields.map(x => x.name).join(";");
export const DECIMAL = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/;
export const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
