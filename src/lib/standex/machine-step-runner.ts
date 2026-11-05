import { validateStep } from "./machine-step";

export type ModelImportPhase = "prepare" | "convert" | "validate";
export interface ModelImportOptions {
  signal?: AbortSignal;
  onPhase?: (phase: ModelImportPhase) => void;
}

/** One disposable worker per import: cancellation releases the WASM heap even
 * while the native parser is busy. Nothing is sent to a conversion service. */
export function convertStep(
  data: ArrayBuffer,
  options: ModelImportOptions = {},
): Promise<ArrayBuffer> {
  validateStep(data);
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(new DOMException("Chargement annulé.", "AbortError"));
      return;
    }
    const worker = new Worker(new URL("./machine-step.worker.ts", import.meta.url), {
      type: "module",
    });
    let finished = false;
    const finish = (error?: Error, bytes?: ArrayBuffer) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
      worker.terminate();
      if (error) reject(error);
      else resolve(bytes!);
    };
    const abort = () => finish(new DOMException("Chargement annulé.", "AbortError"));
    const timer = setTimeout(
      () =>
        finish(
          new Error(
            "Préparation STEP trop longue. Exportez uniquement le mécanisme utile puis réessayez.",
          ),
        ),
      120000,
    );
    options.signal?.addEventListener("abort", abort, { once: true });
    worker.onerror = () =>
      finish(new Error("Le lecteur STEP n’a pas pu démarrer. Rechargez la page puis réessayez."));
    worker.onmessageerror = () => finish(new Error("Import impossible."));
    worker.onmessage = ({ data: message }) => {
      if (message.phase === "convert") options.onPhase?.("convert");
      else if (message.error) finish(new Error(message.error));
      else if (message.bytes instanceof ArrayBuffer) finish(undefined, message.bytes);
      else finish(new Error("Import impossible."));
    };
    options.onPhase?.("prepare");
    worker.postMessage(data, [data]);
  });
}
