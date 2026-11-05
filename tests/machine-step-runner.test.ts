import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { convertStep } from "../src/lib/standex/machine-step-runner";
import {
  machineTransferFileName,
  storeMachineFileInMemory,
  memoryAssetBytes,
  loadMachineAsset,
} from "../src/lib/standex/machine-assets";
const input = () => {
  const b = readFileSync("node_modules/occt-import-js/test/testfiles/cube-units/cube-mm.step");
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
class ImportWorker {
  static last: ImportWorker;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  stopped = false;
  posted = false;
  constructor() {
    ImportWorker.last = this;
  }
  postMessage() {
    this.posted = true;
  }
  terminate() {
    this.stopped = true;
  }
}
async function fake(body: () => Promise<void>) {
  const previous = globalThis.Worker;
  globalThis.Worker = ImportWorker as unknown as typeof Worker;
  try {
    await body();
  } finally {
    globalThis.Worker = previous;
  }
}
test("STEP cancellation terminates native work immediately and rejects without a result", () =>
  fake(async () => {
    const abort = new AbortController(),
      promise = convertStep(input(), { signal: abort.signal });
    const worker = ImportWorker.last;
    expect(worker.posted).toBe(true);
    abort.abort();
    await expect(promise).rejects.toThrow("annulé");
    expect(worker.stopped).toBe(true);
  }));
test("STEP worker errors release worker and have a fixed user message", () =>
  fake(async () => {
    const promise = convertStep(input()),
      worker = ImportWorker.last;
    worker.onerror!();
    await expect(promise).rejects.toThrow("lecteur STEP");
    expect(worker.stopped).toBe(true);
  }));
test("STEP phase notification does not resolve import; success terminates worker", () =>
  fake(async () => {
    const phases: string[] = [],
      promise = convertStep(input(), { onPhase: (p) => phases.push(p) }),
      worker = ImportWorker.last;
    worker.onmessage!({ data: { phase: "convert" } });
    expect(worker.stopped).toBe(false);
    const bytes = new ArrayBuffer(24);
    worker.onmessage!({ data: { bytes } });
    expect(await promise).toBe(bytes);
    expect(worker.stopped).toBe(true);
    expect(phases).toEqual(["prepare", "convert"]);
  }));
test("original STEP input is converted before private storage and GLB loading", () =>
  fake(async () => {
    const promise = storeMachineFileInMemory(new File([input()], "CAD.STEP"));
    // Native conversion is exercised separately; this isolates browser orchestration/storage.
    await new Promise((r) => setTimeout(r, 25));
    const b = readFileSync("public/models/demo-tiroir-deux-pieces.glb"),
      bytes = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    ImportWorker.last.onmessage!({ data: { bytes } });
    const key = await promise;
    expect(memoryAssetBytes(key)).toEqual(bytes);
    const asset = await loadMachineAsset(key, 1000, "memory");
    try {
      expect(asset.parts.length).toBe(9);
    } finally {
      asset.dispose();
    }
  }));
test("shared converted geometry has a GLB extension and existing GLB names stay unchanged", () => {
  expect(machineTransferFileName("Assemblage.STEP")).toBe("Assemblage-converted.glb");
  expect(machineTransferFileName("Assemblage.stp")).toBe("Assemblage-converted.glb");
  expect(machineTransferFileName("demo.glb")).toBe("demo.glb");
});
