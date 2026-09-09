/**
 * Verrou de la demande de version anglaise — logique pure et testable.
 *
 * Deux problèmes concrets sont traités ici, et rien d'autre :
 *  1. deux demandes ne partent jamais en même temps (double clic, relance) ;
 *  2. une réponse tardive n'écrit JAMAIS dans l'écran d'un autre dossier, ni
 *     dans une demande plus récente — même si elle porte le même dossier et la
 *     même empreinte. Chaque exécution reçoit une génération unique : la
 *     réponse A ne peut donc ni modifier B, ni libérer le verrou de B.
 *
 * `invalidate()` est appelé de façon SYNCHRONE aux transitions de contexte
 * (changement, import, création, réouverture de projet, démontage de l'écran).
 */
export interface EnglishRun {
  /** Génération unique de cette exécution. */
  readonly id: number;
  /** Vrai tant que cette exécution est celle en cours. */
  isCurrent(): boolean;
  /** Libère le verrou, uniquement si cette exécution le détient encore. */
  release(): void;
}

export class EnglishRunLock {
  private generation = 0;
  private active: number | null = null;

  /** Une demande est-elle réellement en cours ? */
  get busy(): boolean {
    return this.active !== null;
  }

  /** Démarre une exécution, ou renvoie `null` si une autre est déjà en cours. */
  start(): EnglishRun | null {
    if (this.active !== null) return null;
    const id = ++this.generation;
    this.active = id;
    return {
      id,
      isCurrent: () => this.active === id,
      release: () => {
        if (this.active === id) this.active = null;
      },
    };
  }

  /**
   * Abandonne l'exécution en cours : elle n'est plus « courante », ses réponses
   * seront ignorées, et une nouvelle demande peut partir immédiatement.
   */
  invalidate(): void {
    this.generation += 1;
    this.active = null;
  }
}
