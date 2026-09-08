/** Échantillons : routage par volume annuel, références exactes, aucune donnée de stock inventée. */
import type { AnnualVolume } from "./dossier";

export const PARTNER_DISTRIBUTORS = [
  { id: "tti", name: "TTI Europe", search: "https://www.ttiinc.com/content/ttiinc/en/search.html?q=" },
  { id: "digikey", name: "DigiKey FR", search: "https://www.digikey.fr/fr/products/result?keywords=" },
  { id: "mouser", name: "Mouser FR", search: "https://www.mouser.fr/c/?q=" },
  { id: "rs", name: "RS FR", search: "https://fr.rs-online.com/web/c/?searchTerm=" },
  { id: "farnell", name: "Farnell", search: "https://fr.farnell.com/search?st=" },
] as const;

export const SEARCH_LINK_DISCLAIMER =
  "Lien de recherche chez le partenaire : ce n'est pas une preuve de stock ni de prix.";

export type SampleRoute =
  | { kind: "distributors"; partners: typeof PARTNER_DISTRIBUTORS; note: string }
  | { kind: "standex_direct"; note: string }
  | { kind: "manual_review"; note: string };

export function routeSamples(input: {
  volume: AnnualVolume;
  isCustom: boolean;
}): SampleRoute {
  if (input.volume.kind === "unknown")
    return {
      kind: "manual_review",
      note: "Volume annuel inconnu : revue manuelle Standex avant tout échantillonnage.",
    };
  if (input.isCustom && input.volume.sensorsPerYear < 1000)
    return {
      kind: "manual_review",
      note: "Produit spécifique en faible volume : revue manuelle Standex.",
    };
  if (input.volume.sensorsPerYear < 1000)
    return {
      kind: "distributors",
      partners: PARTNER_DISTRIBUTORS,
      note: "Moins de 1000 capteurs/an : passage par les distributeurs partenaires.",
    };
  return {
    kind: "standex_direct",
    note: "À partir de 1000 capteurs/an : échantillons Standex en direct, sous réserve de confirmation Standex. La gratuité n'est jamais automatique.",
  };
}

export interface SampleRequest {
  partNumber: string;
  quantity: number;
  route: SampleRoute["kind"];
  requestedAt: string;
  /** Aucun e-mail n'est envoyé par l'application. */
  transmitted: false;
}

export type SampleRequestAttempt = { ok: true; request: SampleRequest } | { ok: false; reason: string };

/** Conditions d'ouverture d'une demande d'échantillons. Toutes viennent du serveur. */
export interface SampleGate {
  /** Une revue R&D validée et publiée existe pour la révision courante. */
  reviewValidated: boolean;
  /** La référence est une MPN exacte confirmée, pas une gamme. */
  exactPartConfirmed: boolean;
}

export function createSampleRequest(
  partNumber: string,
  quantity: number,
  route: SampleRoute,
  gate: SampleGate = { reviewValidated: false, exactPartConfirmed: false },
  now = new Date().toISOString(),
): SampleRequestAttempt {
  if (!gate.reviewValidated)
    return {
      ok: false,
      reason: "Échantillons possibles seulement après une revue Standex validée et publiée.",
    };
  if (!gate.exactPartConfirmed)
    return {
      ok: false,
      reason:
        "Référence exacte requise : une gamme ne suffit pas, la revue doit d'abord fixer la référence commandable.",
    };
  if (!Number.isInteger(quantity) || quantity <= 0)
    return { ok: false, reason: "La quantité d'échantillons doit être un entier positif." };
  if (!partNumber.trim())
    return { ok: false, reason: "Référence exacte requise (aucune correspondance approchée)." };
  return {
    ok: true,
    request: { partNumber: partNumber.trim(), quantity, route: route.kind, requestedAt: now, transmitted: false },
  };
}

/** Recherche stricte : casse, suffixes et tirets comptent. Aucune substitution. */
export function findExactPart(
  query: string,
  catalog: readonly string[],
): { match: string } | { match: null; reason: string } {
  const found = catalog.find((p) => p === query);
  return found ? { match: found } : { match: null, reason: "Référence exacte introuvable." };
}

export interface Availability {
  partNumber: string;
  supplier: string;
  fetchedAt: string;
  stock: number | "unknown";
  moq: number | "unknown";
  multiple: number | "unknown";
  packaging: string | "unknown";
}

/** Sans fournisseur réellement connecté, tout est « inconnu » — jamais zéro. */
export function unknownAvailability(partNumber: string, supplier: string): Availability {
  return {
    partNumber,
    supplier,
    fetchedAt: new Date().toISOString(),
    stock: "unknown",
    moq: "unknown",
    multiple: "unknown",
    packaging: "unknown",
  };
}
