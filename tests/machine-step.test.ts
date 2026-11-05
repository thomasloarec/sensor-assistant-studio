import { expect, test, beforeAll } from "bun:test";
import { readFileSync } from "node:fs";
import init from "occt-import-js";
import {
  STEP_PARAMS,
  stepToGlb,
  validateStep,
  MODEL_BYTES_LIMIT,
} from "../src/lib/standex/machine-step";
import {
  parseMachineAsset,
  storeMachineFileInMemory,
  loadMachineAsset,
  clearMemoryMachineFiles,
} from "../src/lib/standex/machine-assets";
import { COFFEE_ASSEMBLY, pointAt } from "../src/lib/standex/machine-assembly";
import { mountingFace, footprintFits } from "../src/lib/standex/machine-face";
import { Triangle, Vector3 } from "three";
import type { Attachment } from "../src/lib/standex/machine-mounting";
import type { Vec3 } from "../src/lib/standex/magnetic-workshop";
let occt: Awaited<ReturnType<typeof init>>;
beforeAll(async () => {
  occt = await init({
    wasmBinary: readFileSync("node_modules/occt-import-js/dist/occt-import-js.wasm"),
    print: () => {},
    printErr: () => {},
  });
});
const read = (name: string) => {
  const b = readFileSync("node_modules/occt-import-js/test/testfiles/" + name);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
const convert = (name: string) => {
  const b = read(name);
  validateStep(b);
  return stepToGlb(occt.ReadStepFile(new Uint8Array(b), STEP_PARAMS));
};
for (const unit of ["mm", "m", "in"])
  test("STEP physical dimensions survive " + unit + " source units", async () => {
    const a = await parseMachineAsset(convert("cube-units/cube-" + unit + ".step"), 1000);
    try {
      a.size.forEach((n) => expect(n).toBeCloseTo(1000, 3));
      expect(a.animationCount).toBe(0);
    } finally {
      a.dispose();
    }
  });
test("AP214 assembly keeps 18 positioned solids and only selected part moves", async () => {
  const b = convert("cax-if/as1-oc-214.stp"),
    a = await parseMachineAsset(b, 1000);
  try {
    expect(a.parts.length).toBe(18);
    expect(a.size).toEqual([200, 150, 84]);
    expect(a.nodes.some((n) => n.name === "rod-assembly")).toBe(true);
    const m = {
      ...structuredClone(COFFEE_ASSEMBLY),
      movingNode: a.parts[0]!.path,
      movingNodes: [a.parts[0]!.path],
      motion: "translation" as const,
      travel: [10, 0, 0] as Vec3,
    };
    expect(pointAt(m, a.parts[0]!.path, [0, 0, 0], 1)).toEqual([10, 0, 0]);
    expect(pointAt(m, a.parts[1]!.path, [0, 0, 0], 1)).toEqual([0, 0, 0]);
    expect(a.parts.some((p) => p.geometry.getAttribute("color")?.count)).toBe(true);
    expect(new Uint8Array(convert("cax-if/as1-oc-214.stp"))).toEqual(new Uint8Array(b));
  } finally {
    a.dispose();
  }
});
test("AP203 assembly imports all solids", async () => {
  const a = await parseMachineAsset(convert("cax-if/as1_pe_203.stp"), 1000);
  try {
    expect(a.parts.length).toBe(18);
  } finally {
    a.dispose();
  }
});
test("STEP plane remains finite and suitable for mounting after tessellation", async () => {
  const a = await parseMachineAsset(convert("cube-units/cube-mm.step"), 1000);
  try {
    const p = a.parts[0]!,
      g = p.geometry,
      ix = g.index!,
      v = g.getAttribute("position"),
      t = new Triangle(
        ...([0, 1, 2].map((i) => new Vector3().fromBufferAttribute(v, ix.getX(i))) as [
          Vector3,
          Vector3,
          Vector3,
        ]),
      );
    const at: Attachment = {
      kind: "surface",
      support: "fixed",
      partPath: p.path,
      point: t.getMidpoint(new Vector3()).toArray() as Vec3,
      normal: t.getNormal(new Vector3()).toArray() as Vec3,
      offsetMm: 0,
      spinDeg: 0,
      flip: false,
      depthRef: "tip",
      axisSource: "face",
    };
    const face = mountingFace(a, at);
    expect(face).not.toBeNull();
    expect(face!.triangles.length).toBe(2);
    const footprint = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ].map(
      ([x, y]) =>
        new Vector3(...face!.tangents[0])
          .multiplyScalar(x!)
          .addScaledVector(new Vector3(...face!.tangents[1]), y!)
          .toArray() as Vec3,
    );
    expect(footprintFits(face!, at.point, footprint)).toBe(true);
    expect(footprintFits(face!, face!.to3([5000, 5000]), footprint)).toBe(false);
  } finally {
    a.dispose();
  }
});
test("curved BRep produces finite normals and triangles", async () => {
  const a = await parseMachineAsset(convert("rounded-cube/rounded-cube.step"), 1000);
  try {
    a.size.forEach((n) => expect(n).toBeCloseTo(10, 3));
    expect(a.parts[0]!.geometry.getAttribute("normal").count).toBeGreaterThan(24);
  } finally {
    a.dispose();
  }
});
test("converted asset reloads privately with stable paths; memory loss needs same file", async () => {
  const bytes = convert("cax-if/as1-oc-214.stp"),
    f = new File([bytes], "converted.glb"),
    key = await storeMachineFileInMemory(f),
    a = await loadMachineAsset(key, 1000, "memory");
  const paths = a.parts.map((p) => p.path);
  a.dispose();
  clearMemoryMachineFiles();
  await expect(loadMachineAsset(key, 1000, "memory")).rejects.toThrow();
  const key2 = await storeMachineFileInMemory(f),
    b = await loadMachineAsset(key2, 1000, "memory");
  try {
    expect(key2).toBe(key);
    expect(b.parts.map((p) => p.path)).toEqual(paths);
  } finally {
    b.dispose();
  }
});
test("invalid, truncated, empty and oversized STEP fail with fixed messages", () => {
  expect(() => validateStep(new TextEncoder().encode("private customer contents").buffer)).toThrow(
    "STEP illisible",
  );
  expect(() => validateStep(read("cube-units/cube-mm.step").slice(0, 2000))).toThrow(
    "STEP illisible",
  );
  expect(() => validateStep(new ArrayBuffer(MODEL_BYTES_LIMIT + 1))).toThrow("30 Mo");
  expect(() =>
    stepToGlb({ success: false, root: { name: "", children: [], meshes: [] }, meshes: [] }),
  ).toThrow("STEP illisible");
});
test("pre-cancelled import stores nothing", async () => {
  const abort = new AbortController();
  abort.abort();
  await expect(
    storeMachineFileInMemory(new File([read("cube-units/cube-mm.step")], "cube.step"), {
      signal: abort.signal,
    }),
  ).rejects.toThrow("annulé");
});

test("external STEP references are refused instead of silently losing assembly parts", () => {
  expect(() => validateStep(read("cax-if/s1_pe_214/s1_pe_214.stp"))).toThrow("STEP complet");
});
