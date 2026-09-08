/** Revue R&D continue, offres et invalidation par version. */
export type StaffRole = "rnd" | "sales" | "admin";

export interface StaffIdentity {
  userId: string;
  /** Rôle provisionné côté serveur (app_metadata de confiance ou table membership). */
  role: StaffRole | null;
}

export interface DesignRevisionRef {
  dossierId: string;
  revision: number;
  hash: string;
}

export interface RndReview {
  id: string;
  dossierId: string;
  revision: number;
  authorId: string;
  createdAt: string;
  scope: string;
  conditions: string;
  verdict: "validated" | "variant_proposed" | "more_info";
  /** Retour client uniquement lorsqu'il est explicitement publié. */
  published: boolean;
  clientMessage: string | null;
  /** Notes internes : jamais transmises au client. */
  internalNotes: string | null;
  supersededBy: string | null;
}

export interface Offer {
  id: string;
  dossierId: string;
  revision: number;
  reviewId: string;
  authorId: string;
  createdAt: string;
  currency: string;
  tiers: { quantity: number; unitPrice: number }[];
  moq: number;
  nreToolingCost: number | null;
  incoterm: string;
  leadTimeWeeks: number | null;
  validUntil: string;
  expired: boolean;
}

export type OfferAttempt = { ok: true; offer: Offer } | { ok: false; reason: string };

export function createOffer(
  draft: Omit<Offer, "expired">,
  review: RndReview | null,
  actor: StaffIdentity,
  now = new Date(),
): OfferAttempt {
  if (actor.role !== "sales" && actor.role !== "admin")
    return { ok: false, reason: "Seul un commercial autorisé peut saisir une offre." };
  if (!review || review.verdict !== "validated")
    return { ok: false, reason: "Aucun devis avant une revue R&D validée." };
  if (review.revision !== draft.revision)
    return { ok: false, reason: "La revue validée ne porte pas sur cette révision." };
  if (!draft.tiers.length || draft.tiers.some((t) => t.unitPrice <= 0 || t.quantity <= 0))
    return { ok: false, reason: "Tranches de quantités et prix requis." };
  return {
    ok: true,
    offer: { ...draft, expired: new Date(draft.validUntil).getTime() < now.getTime() },
  };
}

export function offerIsExpired(offer: Offer, now = new Date()): boolean {
  return offer.expired || new Date(offer.validUntil).getTime() < now.getTime();
}

export type ChangeKind = "technical" | "business_volume_or_dates" | "cosmetic";

export interface InvalidationResult {
  reviewInvalidated: boolean;
  offerInvalidated: boolean;
  samplingInvalidated: boolean;
  newRevisionRequired: boolean;
  reason: string;
}

export function invalidationFor(change: ChangeKind): InvalidationResult {
  if (change === "technical")
    return {
      reviewInvalidated: true,
      offerInvalidated: true,
      samplingInvalidated: true,
      newRevisionRequired: true,
      reason:
        "Modification technique : nouvelle révision ; revue, offre et échantillonnage précédents sont périmés.",
    };
  if (change === "business_volume_or_dates")
    return {
      reviewInvalidated: false,
      offerInvalidated: true,
      samplingInvalidated: false,
      newRevisionRequired: false,
      reason: "Volumes ou dates modifiés : l'offre correspondante est périmée.",
    };
  return {
    reviewInvalidated: false,
    offerInvalidated: false,
    samplingInvalidated: false,
    newRevisionRequired: false,
    reason: "Modification sans effet sur la revue ni l'offre.",
  };
}

/** Concurrence optimiste : on écrit contre la version attendue, jamais en écrasant. */
export type ConcurrencyResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: string; currentRevision: number };

export function guardRevision<T>(
  expectedRevision: number,
  currentRevision: number,
  apply: () => T,
): ConcurrencyResult<T> {
  if (expectedRevision !== currentRevision)
    return {
      ok: false,
      reason: "Le dossier a changé depuis l'ouverture de cette revue.",
      currentRevision,
    };
  return { ok: true, value: apply() };
}

/** Vue client d'une revue : notes internes et traces retirées. */
export function reviewForClient(review: RndReview) {
  if (!review.published) return null;
  return {
    id: review.id,
    revision: review.revision,
    createdAt: review.createdAt,
    scope: review.scope,
    conditions: review.conditions,
    verdict: review.verdict,
    message: review.clientMessage,
  };
}

/** Résolution des rôles : uniquement à partir de revendications signées par le serveur.
 * Un rôle choisi dans l'interface, passé en paramètre d'URL ou stocké dans le navigateur
 * n'est jamais accepté : `app_metadata` est écrit par le backend et signé dans le JWT,
 * `user_metadata` est modifiable par l'utilisateur lui-même et doit être ignoré.
 */
export interface TrustedClaims {
  sub?: unknown;
  app_metadata?: { standex_role?: unknown } | null;
  user_metadata?: unknown;
  [key: string]: unknown;
}

const STAFF_ROLES: readonly StaffRole[] = ["rnd", "sales", "admin"];

export function staffIdentityFromClaims(claims: TrustedClaims | null | undefined): StaffIdentity | null {
  const userId = typeof claims?.sub === "string" ? claims.sub : null;
  if (!userId) return null;
  const raw = claims?.app_metadata?.standex_role;
  const role = STAFF_ROLES.find((r) => r === raw) ?? null;
  return { userId, role };
}

/** Garde-fou explicite : refuse toute identité fabriquée côté navigateur. */
export function assertServerTrustedIdentity(identity: StaffIdentity | null): StaffIdentity {
  if (!identity || !identity.role)
    throw new Error("Rôle Standex non reconnu : cette action est réservée à l'équipe Standex.");
  return identity;
}
