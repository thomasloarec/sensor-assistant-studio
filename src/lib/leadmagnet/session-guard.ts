/** Gardes de concurrence partagées par l'espace de travail interne.
 *
 * Deux besoins distincts, souvent confondus :
 *  - une LECTURE périmée (compte précédent, projet précédent) ne doit jamais
 *    repeupler l'écran quand elle revient en retard ;
 *  - un VERROU d'écriture ne doit être rendu que par l'écriture qui l'a pris,
 *    sinon une réponse ancienne débloque une opération plus récente.
 *
 * Les deux structures sont volontairement synchrones et sans état React : le
 * comportement se teste tel quel, avec de vraies promesses retardées.
 */

/** Compteur de génération : `accepts()` répond faux dès qu'une demande plus
 *  récente a été émise. */
export function createGenerationGuard() {
  let current = 0;
  return {
    /** Ouvre une nouvelle génération et renvoie son numéro. */
    next(): number {
      current += 1;
      return current;
    },
    /** Invalide tout ce qui est encore en vol, sans ouvrir de demande. */
    invalidate(): void {
      current += 1;
    },
    current(): number {
      return current;
    },
    accepts(generation: number): boolean {
      return generation === current;
    },
  };
}

/** Verrou d'écriture attaché à sa génération : seule l'écriture propriétaire
 *  peut le rendre. Une réponse périmée qui appelle `release()` est ignorée. */
export function createOwnedLock() {
  let owner: number | null = null;
  return {
    /** Prend le verrou pour cette génération, ou renvoie faux s'il est pris. */
    acquire(generation: number): boolean {
      if (owner !== null) return false;
      owner = generation;
      return true;
    },
    /** Rend le verrou UNIQUEMENT si cette génération le détient encore. */
    release(generation: number): boolean {
      if (owner !== generation) return false;
      owner = null;
      return true;
    },
    /** Abandon explicite (changement de projet ou de compte). */
    reset(): void {
      owner = null;
    },
    owner(): number | null {
      return owner;
    },
    held(): boolean {
      return owner !== null;
    },
  };
}
