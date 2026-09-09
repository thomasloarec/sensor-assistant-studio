/** Concurrence réelle de l'espace interne : réponses retardées, changement de
 * compte, navigation A → B → A. Les contrôles utilisent de vraies promesses
 * différées, jamais une simple lecture du code. */
import { describe, expect, test } from "bun:test";
import { createGenerationGuard, createOwnedLock } from "../src/lib/leadmagnet/session-guard";

const later = <T,>(value: T, ms: number) => new Promise<T>((r) => setTimeout(() => r(value), ms));

describe("garde de génération sur les lectures", () => {
  test("une sonde lancée pour le compte précédent n'est plus acceptée", async () => {
    const guard = createGenerationGuard();
    let role: string | null = null;

    const first = guard.next();
    const slow = later("admin", 30).then((r) => {
      if (guard.accepts(first)) role = r;
    });

    // Déconnexion puis reconnexion d'un autre compte pendant la sonde lente.
    guard.invalidate();
    const second = guard.next();
    await later(null, 5).then(() => {
      if (guard.accepts(second)) role = null;
    });

    await slow;
    expect(role).toBeNull();
  });

  test("la réponse de la génération courante est bien appliquée", async () => {
    const guard = createGenerationGuard();
    let role: string | null = null;
    const gen = guard.next();
    await later("sales", 5).then((r) => {
      if (guard.accepts(gen)) role = r;
    });
    expect(role).toBe("sales");
  });
});

describe("verrou d'écriture attaché à sa génération", () => {
  test("une réponse ancienne ne libère pas le verrou d'une écriture récente", async () => {
    const lock = createOwnedLock();
    const guard = createGenerationGuard();

    // Écriture A sur le projet A.
    const genA = guard.next();
    expect(lock.acquire(genA)).toBe(true);

    // Navigation A → B → A : le contexte est abandonné, un nouveau projet est
    // ouvert, puis une nouvelle écriture démarre.
    lock.reset();
    guard.invalidate();
    const genA2 = guard.next();
    expect(lock.acquire(genA2)).toBe(true);

    // La réponse (tardive) de la PREMIÈRE écriture arrive maintenant.
    const releasedByOldRequest = await later(null, 20).then(() => lock.release(genA));
    expect(releasedByOldRequest).toBe(false);
    expect(lock.held()).toBe(true);
    expect(lock.owner()).toBe(genA2);

    // Seule l'écriture propriétaire rend le verrou.
    expect(lock.release(genA2)).toBe(true);
    expect(lock.held()).toBe(false);
  });

  test("un échec relit l'état sans laisser le verrou pris", async () => {
    const lock = createOwnedLock();
    const guard = createGenerationGuard();
    const gen = guard.next();
    expect(lock.acquire(gen)).toBe(true);
    try {
      await later(null, 5).then(() => {
        throw new Error("VERSION_CONFLICT");
      });
    } catch {
      guard.invalidate(); // relecture déclenchée par l'échec
    } finally {
      expect(lock.release(gen)).toBe(true);
    }
    expect(lock.held()).toBe(false);
  });

  test("deux clics rapides ne déclenchent qu'une écriture", () => {
    const lock = createOwnedLock();
    const guard = createGenerationGuard();
    expect(lock.acquire(guard.next())).toBe(true);
    expect(lock.acquire(guard.current() + 1)).toBe(false);
  });
});
