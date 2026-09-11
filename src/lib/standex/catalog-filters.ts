import { t } from "@/lib/i18n/core";
import {
  CUSTOM_SENSOR_ID,
  SENSOR_CATALOG,
  overallEnvelope,
  type SensorModel,
} from "./sensor-catalog";

/** Valeurs de filtre CANONIQUES et stables : identifiant technique ou catégorie
 * brute du catalogue. Elles ne dépendent d'aucune langue. Seuls les libellés
 * passent par t() au rendu — sinon la liste se viderait hors français et à
 * chaque changement de langue. */
export const CATALOG_ALL = "all";

export function fixingGroup(model: SensorModel): string {
  if (model.shape === "flange" || model.shape === "block") return "screw";
  if (model.shape === "threaded") return "threaded";
  if (model.shape === "pressfit") return "pressfit";
  if (model.shape === "smd" || model.shape === "custom_pcb") return "pcb";
  return "unknown";
}

/** Raccordement déduit de la FORME documentée, pas d'un champ d'orientation :
 * `cableSide` n'indique que le côté de sortie quand il est précisé, son absence
 * ne signifie pas « pas de câble ». Cylindriques, à visser, filetés et bloc
 * aluminium sortent par câble d'après leurs fiches ; le reed nu et le schéma sur
 * mesure par pattes ; le CMS par broches. Les boîtiers à emmancher restent
 * « non documenté » : leur sortie n'est pas décrite dans les sources reprises. */
export function wiringGroup(model: SensorModel): string {
  if (model.category === "THT") return "leads";
  if (model.shape === "smd") return "smd";
  if (model.shape === "glass" || model.shape === "custom_pcb") return "leads";
  if (
    model.shape === "cylinder" ||
    model.shape === "flange" ||
    model.shape === "threaded" ||
    model.shape === "block"
  )
    return "cable";
  return "unknown";
}

export interface CatalogFilters {
  query: string;
  category: string;
  fixing: string;
  wiring: string;
  maxLength: string;
  maxWidth: string;
  maxHeight: string;
}

export const EMPTY_CATALOG_FILTERS: CatalogFilters = {
  query: "",
  category: CATALOG_ALL,
  fixing: CATALOG_ALL,
  wiring: CATALOG_ALL,
  maxLength: "",
  maxWidth: "",
  maxHeight: "",
};

/** Un champ vide n'est PAS une contrainte de 0 mm : il ne filtre rien. */
function withinLimit(value: number, raw: string): boolean {
  const limit = Number.parseFloat(raw.replace(",", "."));
  return !Number.isFinite(limit) || value <= limit;
}

/** Le sur mesure reste TOUJOURS proposé, même si aucune référence documentée
 * ne passe les filtres. */
export function filterCatalog(f: CatalogFilters): SensorModel[] {
  const needle = f.query.trim().toLocaleLowerCase();
  return SENSOR_CATALOG.filter((s) => {
    if (s.id === CUSTOM_SENSOR_ID) return true;
    const [length, height, width] = overallEnvelope(s);
    const haystack = (
      t(s.name) +
      " " +
      t(s.description) +
      " " +
      s.id +
      " " +
      t(s.category)
    ).toLocaleLowerCase();
    return (
      (f.category === CATALOG_ALL || s.category === f.category) &&
      (f.fixing === CATALOG_ALL || fixingGroup(s) === f.fixing) &&
      (f.wiring === CATALOG_ALL || wiringGroup(s) === f.wiring) &&
      withinLimit(length, f.maxLength) &&
      withinLimit(width, f.maxWidth) &&
      withinLimit(height, f.maxHeight) &&
      haystack.includes(needle)
    );
  });
}

export const documentedCount = (list: readonly SensorModel[]) =>
  list.filter((s) => s.id !== CUSTOM_SENSOR_ID).length;
