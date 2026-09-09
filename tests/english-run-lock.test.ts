import { describe, expect, it } from "bun:test";
import { EnglishRunLock } from "../src/lib/leadmagnet/english-run-lock";

/** Promesse pilotée à la main : on décide quand la « réponse » arrive. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("verrou de la version anglaise", () => {
  it("une seule demande à la fois", () => {
    const lock = new EnglishRunLock();
    const a = lock.start();
    expect(a).not.toBeNull();
    expect(lock.start()).toBeNull();
    expect(lock.busy).toBe(true);
    a!.release();
    expect(lock.busy).toBe(false);
    expect(lock.start()).not.toBeNull();
  });

  it("la réponse A arrivée après changement de dossier n'écrit pas dans B et ne libère pas B", async () => {
    const lock = new EnglishRunLock();
    const screen: { message: string | null; busy: boolean } = { message: null, busy: false };

    const responseA = deferred<string>();
    const responseB = deferred<string>();

    const run = async (response: Promise<string>, label: string) => {
      const handle = lock.start();
      if (!handle) return "refusée";
      screen.busy = true;
      try {
        const text = await response;
        if (!handle.isCurrent()) return "ignorée";
        screen.message = `${label}: ${text}`;
        return "écrite";
      } finally {
        if (handle.isCurrent()) {
          handle.release();
          screen.busy = false;
        }
      }
    };

    const a = run(responseA.promise, "A");
    // Transition de contexte : l'utilisateur ouvre un autre dossier.
    lock.invalidate();
    screen.message = null;
    screen.busy = false;

    const b = run(responseB.promise, "B");
    expect(lock.busy).toBe(true);

    // La réponse du PREMIER dossier arrive maintenant.
    responseA.resolve("rapport A");
    expect(await a).toBe("ignorée");
    expect(screen.message).toBeNull();
    // Le verrou de B tient toujours : A ne l'a pas libéré.
    expect(lock.busy).toBe(true);
    expect(lock.start()).toBeNull();

    responseB.resolve("rapport B");
    expect(await b).toBe("écrite");
    expect(screen.message).toBe("B: rapport B");
    expect(lock.busy).toBe(false);
    expect(screen.busy).toBe(false);
  });

  it("même dossier et même empreinte : la relance après abandon reste distincte", async () => {
    const lock = new EnglishRunLock();
    const first = lock.start()!;
    lock.invalidate();
    const second = lock.start()!;
    expect(second.id).not.toBe(first.id);
    expect(first.isCurrent()).toBe(false);
    expect(second.isCurrent()).toBe(true);
    first.release();
    expect(second.isCurrent()).toBe(true);
    expect(lock.busy).toBe(true);
  });
});
