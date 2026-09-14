import { describe, expect, test } from "bun:test";
import { stripThreeSourceTags } from "../vite/strip-three-source-tags";

const SCENE = "/dev-server/src/components/standex/workshop/scene.tsx";
const MACHINE = "/dev-server/src/components/standex/workshop/machine-scene.tsx";
const THUMB = "/dev-server/src/components/standex/workshop/candidate-thumbnail-scene.tsx";
const OTHER = "/dev-server/src/components/standex/workshop/workshop.tsx";

function plugin() {
  const p = stripThreeSourceTags() as unknown as {
    apply?: unknown;
    transform: (code: string, id: string) => { code: string } | null;
    renderChunk: (code: string, chunk: { moduleIds: string[] }) => { code: string } | null;
  };
  return p;
}

function transform(code: string, id: string) {
  return plugin().transform.call(null as never, code, id)?.code ?? null;
}

function renderChunk(code: string, moduleIds: string[]) {
  return plugin().renderChunk.call(null as never, code, { moduleIds })?.code ?? null;
}

describe("plugin de nettoyage data-tsd-source", () => {
  test("s'applique aussi au build (pas seulement au serveur de dev)", () => {
    expect(plugin().apply).toBeUndefined();
  });

  test("retire la clé quelle que soit sa forme dans les modules 3D", () => {
    const forms = [
      `jsx("mesh", { "data-tsd-source": "scene.tsx:12", position: p })`,
      `jsx("mesh", { 'data-tsd-source': 'scene.tsx:12', position: p })`,
      `jsx("mesh", { "data-tsd-source": src, position: p })`,
      `jsx("mesh", { "data-tsd-source": tsd.src[0], position: p })`,
      `<mesh data-tsd-source="scene.tsx:12" position={p} />`,
      `<mesh data-tsd-source={src} position={p} />`,
    ];
    for (const code of forms) {
      const out = transform(code, SCENE);
      expect(out).not.toBeNull();
      expect(out).not.toContain("data-tsd-source");
      expect(out).toContain("position");
    }
  });

  test("couvre les trois modules 3D et laisse les autres intacts", () => {
    const code = `jsx("mesh", { "data-tsd-source": "x", a: 1 })`;
    for (const id of [SCENE, MACHINE, THUMB]) {
      expect(transform(code, id)).not.toContain("data-tsd-source");
    }
    expect(transform(code, OTHER)).toBeNull();
  });

  test("nettoie aussi le chunk compilé qui contient un module 3D", () => {
    const chunk = `const S=()=>jsx("group",{"data-tsd-source":"scene.tsx:1",children:m});`;
    const out = renderChunk(chunk, [SCENE + "?v=1"]);
    expect(out).not.toBeNull();
    expect(out).not.toContain("data-tsd-source");
    expect(out).toContain("children");
    expect(renderChunk(chunk, [OTHER])).toBeNull();
  });
});
