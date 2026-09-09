import { describe, expect, test } from "bun:test";
import {
  runGuardedSubmit,
  reviewOperationLabel,
  type ReviewOperation,
} from "../src/lib/leadmagnet/review-submit-state";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("verrou de transmission", () => {
  test("deux clics pendant une validation différée n'appellent le backend qu'une fois", async () => {
    const lock = { current: false };
    const gate = deferred<{ ok: boolean }>();
    let backendCalls = 0;
    let validations = 0;
    const ops: ReviewOperation[] = [];
    const run = () =>
      runGuardedSubmit({
        lock,
        generation: () => 1,
        setOperation: (op) => ops.push(op),
        validate: () => {
          validations += 1;
          return gate.promise;
        },
        onInvalid: () => undefined,
        onError: () => undefined,
        submit: async () => {
          backendCalls += 1;
        },
      });

    const first = run();
    const second = run();
    expect(await second).toBe("skipped");
    gate.resolve({ ok: true });
    expect(await first).toBe("done");
    expect(validations).toBe(1);
    expect(backendCalls).toBe(1);
    expect(lock.current).toBe(false);
    expect(ops[0]).toBe("validation");
    expect(ops.at(-1)).toBe(null);
  });

  test("validation refusée : message d'erreur, aucun backend, verrou libéré", async () => {
    const lock = { current: false };
    let backendCalls = 0;
    let problems: string[] = [];
    const outcome = await runGuardedSubmit({
      lock,
      generation: () => 1,
      setOperation: () => undefined,
      validate: async () => ({ ok: false, problems: ["NDA manquant"] }),
      onInvalid: (list) => {
        problems = list;
      },
      onError: () => undefined,
      submit: async () => {
        backendCalls += 1;
      },
    });
    expect(outcome).toBe("invalid");
    expect(problems).toEqual(["NDA manquant"]);
    expect(backendCalls).toBe(0);
    expect(lock.current).toBe(false);
  });

  test("rejet de la validation : erreur signalée, aucun backend, verrou libéré", async () => {
    const lock = { current: false };
    let backendCalls = 0;
    let errored = false;
    const outcome = await runGuardedSubmit({
      lock,
      generation: () => 1,
      setOperation: () => undefined,
      validate: async () => {
        throw new Error("hash indisponible");
      },
      onInvalid: () => undefined,
      onError: () => {
        errored = true;
      },
      submit: async () => {
        backendCalls += 1;
      },
    });
    expect(outcome).toBe("failed");
    expect(errored).toBe(true);
    expect(backendCalls).toBe(0);
    expect(lock.current).toBe(false);
  });

  test("changement de projet pendant la validation : rien n'est transmis", async () => {
    const lock = { current: false };
    let generation = 1;
    let backendCalls = 0;
    const gate = deferred<{ ok: boolean }>();
    const running = runGuardedSubmit({
      lock,
      generation: () => generation,
      setOperation: () => undefined,
      validate: () => gate.promise,
      onInvalid: () => undefined,
      onError: () => undefined,
      submit: async () => {
        backendCalls += 1;
      },
    });
    generation = 2;
    gate.resolve({ ok: true });
    expect(await running).toBe("stale");
    expect(backendCalls).toBe(0);
    expect(lock.current).toBe(false);
  });

  test("échec de l'envoi : le finally libère le verrou", async () => {
    const lock = { current: false };
    const outcome = await runGuardedSubmit({
      lock,
      generation: () => 1,
      setOperation: () => undefined,
      validate: async () => ({ ok: true }),
      onInvalid: () => undefined,
      onError: () => undefined,
      submit: async () => {
        throw new Error("réseau");
      },
    });
    expect(outcome).toBe("failed");
    expect(lock.current).toBe(false);
  });

  test("libellé contextuel de vérification", () => {
    expect(reviewOperationLabel("validation")).toBe("Vérification du dossier…");
  });
});
