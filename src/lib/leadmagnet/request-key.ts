/**
 * Clé de demande stable, conservée par l'écran pendant TOUTES ses tentatives.
 *
 * Un double-clic, une reprise réseau ou un rechargement de page pendant une
 * publication doivent rejouer la MÊME demande, pas en créer une seconde. La clé
 * est donc dérivée de la portée (par exemple la version concernée) et gardée
 * localement jusqu'à confirmation du serveur, où elle est effacée.
 *
 * Elle ne contient aucune donnée client : uniquement un identifiant aléatoire.
 */

const PREFIX = "standex.request-key.";

function store(): Storage | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

const memory = new Map<string, string>();

function newKey(): string {
  const c = typeof crypto !== "undefined" ? crypto : undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Une clé appartient au compte qui l'a créée : le serveur refuse qu'un autre
 *  compte reprenne la même clé, la portée locale doit donc en tenir compte. */
function scopeName(scope: string, account?: string | null): string {
  return `${PREFIX}${account ?? "anon"}.${scope}`;
}

/** Clé de la portée demandée : identique tant qu'elle n'a pas été relâchée. */
export function requestKeyFor(scope: string, account?: string | null): string {
  const name = scopeName(scope, account);
  const s = store();
  const existing = s?.getItem(name) ?? memory.get(name);
  if (existing) return existing;
  const key = newKey();
  memory.set(name, key);
  try {
    s?.setItem(name, key);
  } catch {
    /* stockage indisponible : la clé reste valable pour cette session */
  }
  return key;
}

/** Après confirmation serveur : la prochaine demande sera une vraie nouvelle demande. */
export function releaseRequestKey(scope: string, account?: string | null): void {
  const name = scopeName(scope, account);
  memory.delete(name);
  try {
    store()?.removeItem(name);
  } catch {
    /* rien à faire : la clé expirera avec la session */
  }
}
