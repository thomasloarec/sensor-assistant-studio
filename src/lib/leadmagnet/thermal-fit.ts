/** Avertissement de température PAR CANDIDAT, non bloquant.
 *
 * Compare la plage de température au capteur lue dans les réponses aux plages
 * de fonctionnement TRANSCRITES des fiches (`sensor-specifications.ts`). Aucune
 * limite n'est inventée : une gamme sans fiche transcrite reste « inconnue — à
 * vérifier ». Les températures de soudure ne sont jamais lues comme limites de
 * fonctionnement (elles ne figurent pas dans `temperatures`). Une gamme qui
 * couvre la plage n'est jamais présentée comme qualifiée : la référence
 * commandable et ses conditions sont confirmées par la R&D Standex.
 */
import { SENSOR_SPECIFICATIONS } from "@/lib/standex/sensor-specifications";

export type ThermalStatus = "covered" | "conditional" | "exceeded" | "unknown";

export interface ThermalWarning {
  status: Exclude<ThermalStatus, "covered">;
  /** Texte canonique FR, traduit au rendu ; {0} = plage demandée, {1} = plages documentées. */
  text: string;
  asked: string;
  /** Conditions documentées, libellés canoniques FR (traduits au rendu). */
  documented: readonly { condition: string; min: number; max: number }[];
}

export interface SiteRangeC {
  min: number | null;
  max: number | null;
}

const fmt = (n: number) => (Math.round(n * 10) / 10).toString().replace(".", ",");
const rangeLabel = (r: SiteRangeC) =>
  r.min !== null && r.max !== null ? `${fmt(r.min)} … ${fmt(r.max)} °C` : r.max !== null ? `${fmt(r.max)} °C` : `${fmt(r.min!)} °C`;

const covers = (c: { min: number; max: number }, r: SiteRangeC) =>
  (r.max === null || r.max <= c.max) && (r.min === null || r.min >= c.min);

/* i18n-canonical : textes des avertissements thermiques. */
export const THERMAL_TEXT = {
  exceeded:
    "Température demandée {0} hors de la plage de fonctionnement documentée pour cette gamme ({1}) : à revoir avec la R&D Standex avant tout choix.",
  conditional:
    "Température demandée {0} couverte seulement dans certaines conditions documentées ({1}) : à confirmer avec la R&D Standex. Ce n'est pas une qualification.",
  unknown:
    "Plage de température de cette gamme non transcrite dans l'outil : inconnue — à vérifier avec la R&D Standex pour {0}.",
} as const;

/* i18n-canonical : version COURTE affichée sur la carte ; le détail complet
 * (plages par état du câble, source) est dans « Voir les détails ». */
export const THERMAL_SHORT = {
  exceeded: "Plage demandée {0} hors de la plage documentée de cette gamme : revue d'ingénierie nécessaire.",
  conditional: "Plage demandée {0} couverte seulement sous condition documentée : à confirmer par Standex.",
  unknown: "Plage demandée {0} : limite de cette gamme non transcrite, à vérifier.",
} as const;

export function thermalWarning(sensorId: string, range: SiteRangeC | null): ThermalWarning | null {
  if (!range || (range.min === null && range.max === null)) return null;
  const spec = SENSOR_SPECIFICATIONS[sensorId];
  const asked = rangeLabel(range);
  if (!spec || spec.temperatures.length === 0)
    return { status: "unknown", text: THERMAL_TEXT.unknown, asked, documented: [] };
  const conds = spec.temperatures;
  const ok = conds.filter((c) => covers(c, range));
  if (ok.length === conds.length) return null;
  if (ok.length > 0) return { status: "conditional", text: THERMAL_TEXT.conditional, asked, documented: conds };
  return { status: "exceeded", text: THERMAL_TEXT.exceeded, asked, documented: conds };
}

/** Plage documentée lisible ; `tr` traduit uniquement le libellé de condition. */
export function documentedLabel(w: ThermalWarning, tr: (s: string) => string = (s) => s): string {
  return w.documented.map((c) => `${tr(c.condition)} ${fmt(c.min)} … ${fmt(c.max)} °C`).join(" · ");
}
