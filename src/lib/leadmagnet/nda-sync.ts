/** Synchronisation du choix NDA avec le serveur.
 *
 * Trois règles, isolées ici pour être réellement testables :
 * - une seule écriture à la fois ;
 * - une lecture commencée AVANT une écriture n'écrase jamais son résultat
 *   (une époque tranche ; un simple booléen « occupé » ne suffirait pas) ;
 * - une réponse née d'un autre dossier ne déverrouille pas l'opération en cours.
 */
export interface NdaSyncCallbacks<S> {
  setError(message: string | null): void;
  setBusy(busy: boolean): void;
  apply(status: S): void;
}

export interface NdaSync<S> {
  readonly busy: boolean;
  /** Changement de dossier, import, création, démontage : tout ce qui est en vol devient périmé. */
  invalidate(): void;
  refresh(load: () => Promise<S>, errText: (e: unknown) => string): Promise<void>;
  save(
    run: () => Promise<S>,
    opts: { optimistic?: () => void; errText: (e: unknown) => string; onSaved?: (s: S) => void },
  ): Promise<boolean>;
}

export function createNdaSync<S>(cb: NdaSyncCallbacks<S>): NdaSync<S> {
  let epoch = 0;
  let busy = false;
  return {
    get busy() {
      return busy;
    },
    invalidate() {
      epoch += 1;
      busy = false;
    },
    async refresh(load, errText) {
      // Un choix en cours d'enregistrement fait autorité tant qu'il n'a pas répondu.
      if (busy) return;
      const mine = epoch;
      try {
        const status = await load();
        if (epoch !== mine || busy) return;
        cb.apply(status);
      } catch (error) {
        if (epoch !== mine) return;
        cb.setError(errText(error));
      }
    },
    async save(run, opts) {
      if (busy) return false;
      busy = true;
      const mine = ++epoch;
      cb.setBusy(true);
      cb.setError(null);
      // Une ACTIVATION peut s'afficher tout de suite : elle ne fait que bloquer
      // davantage. Un retrait n'est jamais affiché avant la réponse du serveur.
      opts.optimistic?.();
      let ok = false;
      try {
        const status = await run();
        if (epoch !== mine) return false;
        cb.apply(status);
        opts.onSaved?.(status);
        ok = true;
      } catch (error) {
        if (epoch !== mine) return false;
        cb.setError(opts.errText(error));
      } finally {
        // Ne jamais déverrouiller une opération plus récente que la nôtre.
        if (epoch === mine) {
          busy = false;
          cb.setBusy(false);
        }
      }
      return ok;
    },
  };
}

/** Réponse née d'un autre dossier : elle est abandonnée sans message d'erreur. */
export class StaleContextError extends Error {
  constructor() {
    super("stale-context");
    this.name = "StaleContextError";
  }
}
