import { describe, expect, test } from "bun:test";
import { stripThreeSourceTags } from "../vite/strip-three-source-tags";

/**
 * Les devtools injectent `data-tsd-source` sur chaque élément JSX. Sur un objet
 * Three, R3F lève « Cannot set "data-tsd-source" » au moment du commitUpdate
 * (changement de capteur) et la scène est détruite. Le plugin supprime la CAUSE
 * dans les modules de scène, sans toucher au reste du projet.
 */
const transform = (code: string, id: string) => {
  const plugin = stripThreeSourceTags();
  const fn = plugin.transform as unknown as (
    this: unknown,
    code: string,
    id: string,
  ) => { code: string } | null;
  return fn.call(null, code, id);
};

const SCENE = "/dev-server/src/components/standex/workshop/scene.tsx";

describe("attribut de débogage retiré des objets Three", () => {
  test("la sortie compilée d'une scène ne contient plus data-tsd-source", () => {
    const code = `jsx("mesh", { "data-tsd-source": "scene.tsx:12:4", position: [0, 0, 0] })`;
    const out = transform(code, SCENE);
    expect(out).toBeTruthy();
    expect(out!.code).not.toContain("data-tsd-source");
    expect(out!.code).toContain("position");
    expect(out!.code).toContain("mesh");
  });
  test("la forme JSX est également traitée, avec ou sans requête Vite", () => {
    const out = transform(`<group data-tsd-source="scene.tsx:3:1" name="a" />`, `${SCENE}?v=1`);
    expect(out!.code).toBe(`<group name="a" />`);
  });
  test("les trois modules de scène sont couverts", () => {
    for (const file of ["scene", "machine-scene", "candidate-thumbnail-scene"]) {
      const id = `/dev-server/src/components/standex/workshop/${file}.tsx`;
      expect(transform(`jsx("mesh", { "data-tsd-source": "x" })`, id)).toBeTruthy();
    }
  });
  test("aucun autre module n'est modifié : rien n'est masqué ailleurs", () => {
    const code = `jsx("div", { "data-tsd-source": "workshop.tsx:1:1" })`;
    expect(transform(code, "/dev-server/src/components/standex/workshop/workshop.tsx")).toBeNull();
    expect(transform(code, "/dev-server/src/routes/index.tsx")).toBeNull();
  });
  test("un module de scène sans attribut injecté est laissé intact", () => {
    expect(transform(`jsx("mesh", { position: [0, 0, 0] })`, SCENE)).toBeNull();
  });
  test("le plugin ne s'applique qu'au serveur de développement", () => {
    const plugin = stripThreeSourceTags();
    expect(plugin.apply).toBe("serve");
    expect(plugin.enforce).toBe("post");
  });
});
