/** Les quatre modèles d'exemple réels remplacent les anciens exemples proposés. */
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { EXAMPLE_ASSEMBLIES, EXAMPLE_MODELS } from "../src/lib/standex/machine-demos";
import { BUILTIN_FILES, parseMachineAsset } from "../src/lib/standex/machine-assets";
import { parseMachine } from "../src/lib/standex/machine-assembly";
import { DemoButtons } from "../src/components/standex/workshop/machine-guide";

/** The four files are hosted assets (one exceeds the Git size limit): they are
 *  read through the running app, the same URL the workshop fetches on demand. */
const ORIGIN = process.env["EXAMPLE_MODELS_ORIGIN"] ?? "http://localhost:8080";
const bytes = async (url: string) => {
  const r = await fetch(ORIGIN + url);
  if (!r.ok) throw new Error("example model unavailable: " + url + " " + r.status);
  return r.arrayBuffer();
};

describe("Modèles d'exemple proposés", () => {
  test("exactement quatre, dans l'ordre demandé, sans ancien exemple", () => {
    expect(EXAMPLE_MODELS.map((m) => m.name)).toEqual(["Robot de cuisine", "Compteur d’eau", "Machine CNC", "Lit médical"]);
    expect(Object.keys(EXAMPLE_ASSEMBLIES)).toEqual(EXAMPLE_MODELS.map((m) => m.key));
    const html = renderToStaticMarkup(<DemoButtons onDemo={() => {}} />);
    for (const old of ["coffee", "drawer", "door", "wall", "arm"]) expect(html).not.toContain("builtin:" + old);
    expect(html).not.toContain("download");
    expect((html.match(/data-testid="demo-builtin:/g) ?? []).length).toBe(4);
  });
  test("licences exactes : deux CC BY 4.0, deux Sketchfab Standard", () => {
    const lic = Object.fromEntries(EXAMPLE_MODELS.map((m) => [m.key, m.license]));
    expect(lic).toEqual({
      "builtin:blender-v2": "Sketchfab Standard",
      "builtin:water-meter-v2": "CC BY 4.0",
      "builtin:cnc-v2": "CC BY 4.0",
      "builtin:hospital-bed-v2": "Sketchfab Standard",
    });
    for (const m of EXAMPLE_MODELS) expect(BUILTIN_FILES[m.key]).toMatch(/^\/__l5e\/assets-v1\/[0-9a-f-]{36}\//);
    for (const m of EXAMPLE_MODELS) expect(m.source).toMatch(/^https:\/\/sketchfab\.com\/3d-models\//);
  });
  test("aucun mouvement n'est validé ni supposé", () => {
    for (const m of Object.values(EXAMPLE_ASSEMBLIES)) {
      expect(m.motionStatus).toBe("unset");
      expect(m.movingNodes).toEqual([]);
      expect(m.motionSource).toBeUndefined();
      expect(parseMachine(m)?.assetKey).toBe(m.assetKey);
    }
  });
  test("anciens montages enregistrés toujours lisibles", () => {
    expect(BUILTIN_FILES["builtin:coffee-v1"]).toBe("/models/machine-cafe-bac-mobile.glb");
    expect(parseMachine({ ...EXAMPLE_ASSEMBLIES["builtin:cnc-v2"]!, assetKey: "builtin:arm-v1" })).not.toBeNull();
    expect(parseMachine({ ...EXAMPLE_ASSEMBLIES["builtin:cnc-v2"]!, assetKey: "builtin:cnc-v9" })).toBeNull();
  });
  const expected: Record<string, { clips: string[]; minMm: number; maxMm: number }> = {
    "builtin:blender-v2": { clips: [], minMm: 300, maxMm: 700 },
    "builtin:water-meter-v2": { clips: ["AnimationStack"], minMm: 40, maxMm: 150 },
    "builtin:cnc-v2": { clips: ["Wheel", "Vice", "Holder", "Spindle"], minMm: 1000, maxMm: 3000 },
    "builtin:hospital-bed-v2": { clips: [], minMm: 2000, maxMm: 3500 },
  };
  for (const m of EXAMPLE_MODELS)
    test("le fichier réel " + m.key + " se charge à l'échelle prévue, pièces séparées et clips rigides", async () => {
      const a = EXAMPLE_ASSEMBLIES[m.key]!;
      // Under a shared DOM test environment, texture images never decode and the
      // loader waits forever; textures are irrelevant to geometry and clips here.
      const g = globalThis as { document?: unknown; createImageBitmap?: unknown };
      const saved = [g.document, g.createImageBitmap] as const;
      g.document = undefined; g.createImageBitmap = undefined;
      const asset = await parseMachineAsset(await bytes(BUILTIN_FILES[m.key]!), a.unitScale)
        .finally(() => { [g.document, g.createImageBitmap] = saved; });
      try {
        const e = expected[m.key]!;
        const longest = Math.max(...asset.size);
        expect(longest).toBeGreaterThan(e.minMm);
        expect(longest).toBeLessThan(e.maxMm);
        expect(asset.parts.length).toBeGreaterThan(5);
        expect(new Set(asset.parts.map((p) => p.path)).size).toBe(asset.parts.length);
        expect(asset.animation.clips.map((c) => c.name)).toEqual(e.clips);
        for (const c of asset.animation.clips) expect(c.supported).toBe(true);
      } finally {
        asset.dispose();
      }
    }, 60000);
});
