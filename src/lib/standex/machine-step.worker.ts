import init from "occt-import-js";
import wasmUrl from "occt-import-js/dist/occt-import-js.wasm?url";
import { STEP_ERROR, STEP_LIMIT, STEP_PARAMS, stepToGlb, validateStep } from "./machine-step";

self.onmessage = async ({ data }: MessageEvent<ArrayBuffer>) => {
  try {
    validateStep(data);
    // Suppress native diagnostics: they can contain customer STEP entities.
    const occt = await init({ locateFile: () => wasmUrl, print: () => {}, printErr: () => {} });
    self.postMessage({ phase: "convert" });
    const result = occt.ReadStepFile(new Uint8Array(data), STEP_PARAMS);
    const bytes = stepToGlb(result);
    self.postMessage({ bytes }, { transfer: [bytes] });
  } catch (e) {
    self.postMessage({
      error: e instanceof Error && e.message === STEP_LIMIT ? STEP_LIMIT : STEP_ERROR,
    });
  }
};
