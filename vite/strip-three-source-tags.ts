import type { Plugin } from "vite";

/**
 * Les devtools TanStack injectent en développement un attribut `data-tsd-source`
 * sur CHAQUE élément JSX du projet. Sur un élément DOM c'est inoffensif ; sur un
 * élément React Three Fiber (`<mesh>`, `<group>`, `<primitive>`…) l'attribut
 * devient une propriété à écrire sur un objet Three, et R3F lève
 * « Cannot set "data-tsd-source" » au moment du `commitUpdate` — c'est-à-dire au
 * changement de capteur, quand les props des objets 3D sont réappliquées. La
 * scène est alors détruite et l'atelier se replie en vue plane.
 *
 * On retire donc l'attribut injecté UNIQUEMENT dans les modules qui rendent des
 * objets Three. Aucune erreur n'est masquée : le prop fautif n'est plus créé,
 * les autres modules gardent leur instrumentation devtools, et la production
 * n'est pas concernée (l'injection est déjà retirée du build).
 */
const THREE_MODULES = /\/src\/components\/standex\/workshop\/(scene|machine-scene|candidate-thumbnail-scene)\.tsx$/;

export function stripThreeSourceTags(): Plugin {
  return {
    name: "standex:strip-three-source-tags",
    enforce: "post",
    apply: "serve",
    transform(code, id) {
      const file = id.split("?")[0]!;
      if (!THREE_MODULES.test(file) || !code.includes("data-tsd-source")) return null;
      const stripped = code
        // sortie compilée : jsx("mesh", { "data-tsd-source": "…", … })
        .replace(/"data-tsd-source":\s*"[^"]*",?\s*/g, "")
        // sortie encore en JSX si un autre plugin s'exécute plus tard
        .replace(/\sdata-tsd-source="[^"]*"/g, "");
      return stripped === code ? null : { code: stripped, map: null };
    },
  };
}
