/** Classement TRAÇABLE des capteurs suggérés, selon les exigences écrites.
 *
 * Avant ce module, l'ordre des cartes était l'ordre d'insertion du catalogue
 * (puis « couples documentés d'abord ») : MK26 montait dans les trois premières
 * cartes d'un lave-vaisselle ordinaire uniquement parce qu'il suit MK13 dans la
 * liste. Ici, chaque position est EXPLIQUÉE par une règle :
 *
 *  - les gammes SPÉCIALISÉES (MK26 commutation tension plus élevée, MK21 haute
 *    température, MK02 cible ferreuse, MK27 boîtier aluminium) sont réservées à
 *    la liste complète tant qu'aucune exigence écrite ne justifie leur
 *    spécialité ; une exigence vérifiée les promeut en tête, avec sa raison ;
 *  - une gamme dont la plage de température DOCUMENTÉE couvre la température au
 *    capteur passe devant celles qui ne la couvrent que sous condition, puis
 *    devant celles qui la dépassent ;
 *  - en emboîtement, une retenue DOCUMENTÉE dans ce trou passe devant un corps
 *    qui entre seulement physiquement (douille ou adaptateur à prévoir).
 *
 * Aucun prix ni coût n'intervient : aucune source tarifaire n'est disponible.
 * Le matériau n'intervient pas non plus : MK26 est en PBT renforcé de fibres de
 * verre (fiche de série), il n'est ni inox ni « premium ».
 */
import { thermalWarning, type SiteRangeC } from "./thermal-fit";
import { VALIDATION_POINT, type FitAssessment } from "./application-fit";
import type { CandidateResult } from "./candidates";
import type { Requirement } from "./dossier";
import { SENSOR_SPECIFICATIONS } from "@/lib/standex/sensor-specifications";

export type Specialty = "higher_voltage" | "high_temperature" | "ferrous_target" | "metal_housing";

/** Gammes spécialisées et leur spécialité documentée. */
export const SPECIALIZED: Readonly<Record<string, Specialty>> = {
  MK26: "higher_voltage",
  MK21: "high_temperature",
  MK02: "ferrous_target",
  MK27: "metal_housing",
};

/* i18n-canonical : raisons de classement affichées sur les cartes. */
export const RANK_REASON = {
  high_temperature:
    "Mis en avant : sa plage de température documentée couvre la température indiquée au capteur, contrairement aux gammes standard. Conditions de câble et variante à confirmer par Standex.",
  ferrous_target:
    "Mis en avant : capteur à aimant de polarisation intégré pour cible en acier, sans aimant externe à ajouter. Distance de détection à valider par la R&D Standex.",
  higher_voltage:
    "Mis en avant : option de contact documentée pour une tension commutée plus élevée. Variante exacte à confirmer par Standex.",
  metal_housing: "Mis en avant : boîtier métallique demandé.",
  kept_choice: "Choix déjà enregistré dans votre projet, conservé en tête.",
} as const;

export interface RankingContext {
  fit: Pick<FitAssessment, "sensorSiteC" | "validationPoints">;
  requirements: readonly Requirement[];
  freeConstraints?: string;
}

const norm = (v: string) =>
  v.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/** Plus haute tension de commutation écrite pour le SIGNAL (V), ou null. */
export function requestedVoltageV(requirements: readonly Requirement[]): number | null {
  const text = norm(requirements.filter((r) => r.key === "electrical").map((r) => r.value).join(" "));
  let max: number | null = null;
  for (const m of text.matchAll(/(\d{1,4}(?:[.,]\d+)?)\s*v(?:dc|ac| dc| ac)?\b/g)) {
    const v = Number(m[1]!.replace(",", "."));
    if (Number.isFinite(v)) max = max === null ? v : Math.max(max, v);
  }
  return max;
}

const maxVoltage = (id: string) =>
  Math.max(0, ...(SENSOR_SPECIFICATIONS[id]?.electrical ?? []).map((o) => o.voltage));

/** Raison VÉRIFIÉE de promouvoir une gamme spécialisée, ou null. */
export function specialtyReason(id: string, ctx: RankingContext): Specialty | null {
  const specialty = SPECIALIZED[id];
  if (!specialty) return null;
  const site: SiteRangeC | null = ctx.fit.sensorSiteC;
  switch (specialty) {
    case "high_temperature": {
      // Au-delà des gammes standard (80 °C) ET couvert par la plage documentée.
      if (!site || site.max === null || site.max <= 80) return null;
      const w = thermalWarning(id, site);
      return w === null || w.status === "conditional" ? "high_temperature" : null;
    }
    case "ferrous_target":
      return ctx.fit.validationPoints.includes(VALIDATION_POINT.internalBias) ? "ferrous_target" : null;
    case "higher_voltage": {
      // Tension écrite au-delà de ce que couvrent les contacts des gammes
      // ordinaires (MK04/MK05/MK13 : 180 V), et dans ce que documente MK26.
      const v = requestedVoltageV(ctx.requirements);
      return v !== null && v > maxVoltage("MK04") && v <= maxVoltage(id) ? "higher_voltage" : null;
    }
    case "metal_housing": {
      const t = norm([...ctx.requirements.map((r) => r.value), ctx.freeConstraints ?? ""].join(" "));
      return /\b(boitier (metallique|aluminium|alu)|metal housing|aluminium housing|aluminum housing)\b/.test(t)
        ? "metal_housing"
        : null;
    }
  }
}

export interface RankedSuggestion {
  id: string;
  /** Rang de tri : plus petit = plus haut. */
  tier: number;
  /** Raison affichable (canonique FR) quand la position est promue. */
  reason: string | null;
  /** Gamme spécialisée sans raison vérifiée : hors des trois premières cartes. */
  reserved: boolean;
}

/** Retenue documentée du capteur dans le trou déclaré (emboîtement). */
export type Retention = "documented" | "adapter_required" | null;

/**
 * Classe les identifiants REÇUS (déjà filtrés par les critères mécaniques),
 * de façon stable : à rang égal, l'ordre reçu est conservé.
 */
export function rankSuggestions(
  candidates: readonly Pick<CandidateResult, "id" | "status"> & { retention?: Retention }[] | readonly (Pick<CandidateResult, "id" | "status"> & { retention?: Retention })[],
  ctx: RankingContext,
  preferredSensorId: string | null = null,
): RankedSuggestion[] {
  const site = ctx.fit.sensorSiteC;
  const rows = (candidates as readonly (Pick<CandidateResult, "id" | "status"> & { retention?: Retention })[]).map((c, index) => {
    const promoted = specialtyReason(c.id, ctx);
    const reserved = !!SPECIALIZED[c.id] && !promoted;
    const w = site ? thermalWarning(c.id, site) : null;
    const thermal = !w ? 0 : w.status === "conditional" ? 1 : w.status === "unknown" ? 2 : 3;
    const retention = c.retention === "documented" ? 0 : c.retention === "adapter_required" ? 1 : 0;
    const status = c.status === "kept" ? 0 : c.status === "to_verify" ? 1 : 2;
    let tier = (promoted ? 0 : 10) + thermal * 3 + retention + status * 0.5 + (reserved ? 100 : 0);
    let reason: string | null = promoted ? RANK_REASON[promoted] : null;
    if (preferredSensorId && c.id === preferredSensorId) {
      tier = -1;
      reason = RANK_REASON.kept_choice;
    }
    return { id: c.id, tier, reason, reserved: reserved && c.id !== preferredSensorId, index };
  });
  return rows
    .sort((a, b) => a.tier - b.tier || a.index - b.index)
    .map(({ index: _index, ...r }) => r);
}

/** Identifiants ordonnés pour les cartes « suggérées » : gammes réservées exclues. */
export function suggestedOrder(ranked: readonly RankedSuggestion[]): string[] {
  return ranked.filter((r) => !r.reserved).map((r) => r.id);
}
