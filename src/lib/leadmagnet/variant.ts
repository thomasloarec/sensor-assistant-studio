/** Variante technique proposée par la R&D.
 *
 * Règles :
 *   - une variante DÉCRITE n'est pas une variante APPLIQUÉE ;
 *   - reprendre une variante ne vaut jamais approbation : elle alimente une
 *     nouvelle version, la version d'origine reste intacte ;
 *   - une valeur non finie, négative ou non reconnue n'est jamais appliquée :
 *     elle est signalée comme non reprise, sans toucher au dossier ;
 *   - un connecteur proposé reste « à vérifier par la R&D » : aucune
 *     qualification Standex n'est déduite d'une proposition.
 */
import type { DesignDossier } from "./dossier";
import type { CablingConfig } from "./cabling";
import type { Termination } from "./connectors";

export interface VariantProposal {
  /** Modifications chiffrées du câble, en millimètres. */
  cable?: {
    serviceReserveMm?: number;
    terminationMm?: number;
    toleranceMm?: number;
    surplusHousingMm?: number;
    minBendRadiusMm?: number | null;
    lengthChoice?: CablingConfig["lengthChoice"];
    /** Commentaire libre : jamais appliqué à la géométrie. */
    text?: string;
  };
  /** Connecteur proposé : référence exacte, statut à vérifier. */
  connector?: {
    manufacturer?: string;
    mpn?: string;
    mating?: string | null;
    positions?: number | null;
    pinout?: string | null;
    wireGauge?: string | null;
    conditions?: string | null;
    /** Commentaire libre : jamais appliqué à la terminaison. */
    text?: string;
  };
  /** Note carte / électronique : texte uniquement. */
  pcb?: string;
  description?: string;
}

export interface VariantApplication {
  dossier: DesignDossier;
  /** Ce qui a réellement changé dans le dossier. */
  applied: string[];
  /** Ce qui reste purement descriptif ou a été refusé, avec la raison. */
  notApplied: string[];
}

const positive = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n) && n >= 0;

/** Applique la variante sur une COPIE du dossier : l'original n'est pas muté. */
export function applyVariant(
  dossier: DesignDossier,
  variant: VariantProposal | null | undefined,
): VariantApplication {
  const applied: string[] = [];
  const notApplied: string[] = [];
  if (!variant || typeof variant !== "object")
    return { dossier, applied, notApplied: ["Aucune variante structurée n'est jointe."] };

  const cabling: CablingConfig = { ...dossier.cabling };
  const c = variant.cable ?? {};
  const numeric: [keyof VariantProposal["cable"] & string, string][] = [
    ["serviceReserveMm", "réserve de service"],
    ["terminationMm", "longueur de terminaison"],
    ["toleranceMm", "tolérance fournisseur"],
    ["surplusHousingMm", "surplus logeable"],
  ];
  for (const [key, label] of numeric) {
    const value = (c as Record<string, unknown>)[key];
    if (value === undefined) continue;
    if (positive(value)) {
      (cabling as unknown as Record<string, number>)[key] = value;
      applied.push(`Câble — ${label} : ${value} mm`);
    } else {
      notApplied.push(`Câble — ${label} : valeur refusée (nombre positif attendu).`);
    }
  }
  if (c.minBendRadiusMm !== undefined) {
    if (c.minBendRadiusMm === null || positive(c.minBendRadiusMm)) {
      cabling.minBendRadiusMm = c.minBendRadiusMm;
      applied.push(
        `Câble — rayon de courbure mini : ${c.minBendRadiusMm === null ? "inconnu" : c.minBendRadiusMm + " mm"}`,
      );
    } else notApplied.push("Câble — rayon de courbure : valeur refusée.");
  }
  if (c.lengthChoice !== undefined) {
    if (["undecided", "standard_to_confirm", "custom_to_confirm"].includes(c.lengthChoice)) {
      cabling.lengthChoice = c.lengthChoice;
      applied.push("Câble — choix de longueur mis à jour (toujours à confirmer).");
    } else notApplied.push("Câble — choix de longueur non reconnu.");
  }
  if (c.text?.trim()) notApplied.push(`Câble — commentaire R&D (non appliqué) : ${c.text.trim()}`);

  let termination: Termination = dossier.termination;
  const k = variant.connector ?? {};
  if (k.manufacturer?.trim() && k.mpn?.trim()) {
    termination = {
      kind: "unqualified_connector",
      status: "to_verify_by_rnd",
      spec: {
        manufacturer: k.manufacturer.trim(),
        mpn: k.mpn.trim(),
        mating: k.mating?.trim() || null,
        gender: "unknown",
        positions: typeof k.positions === "number" && Number.isFinite(k.positions) ? k.positions : null,
        pinout: k.pinout?.trim() || null,
        wireGauge: k.wireGauge?.trim() || null,
        cable: null,
        conditions: k.conditions?.trim() || null,
        note: "Proposé par la R&D Standex — reste à vérifier avant commande.",
      },
    };
    applied.push(`Connecteur — ${k.manufacturer.trim()} ${k.mpn.trim()} (à vérifier)`);
  } else if (k.manufacturer?.trim() || k.mpn?.trim()) {
    notApplied.push(
      "Connecteur — fabricant ET référence exacte requis : la proposition reste descriptive.",
    );
  }
  if (k.text?.trim())
    notApplied.push(`Connecteur — commentaire R&D (non appliqué) : ${k.text.trim()}`);
  if (variant.pcb?.trim()) notApplied.push(`Carte / électronique : ${variant.pcb.trim()}`);

  const noteLines = [
    "— Variante proposée par la R&D Standex, reprise dans cette version :",
    ...applied.map((a) => `  • ${a}`),
    ...(variant.description?.trim() ? [`  • Description : ${variant.description.trim()}`] : []),
    ...notApplied.map((n) => `  • Non appliqué automatiquement : ${n}`),
  ];

  return {
    dossier: {
      ...dossier,
      cabling,
      termination,
      freeConstraints: [dossier.freeConstraints, noteLines.join("\n")]
        .filter((s) => s.trim())
        .join("\n"),
      updatedAt: new Date().toISOString(),
    },
    applied,
    notApplied,
  };
}
