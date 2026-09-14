import type { Plugin } from "vite";

/**
 * Les devtools TanStack injectent un attribut `data-tsd-source` sur CHAQUE
 * élément JSX du projet. Sur un élément DOM c'est inoffensif ; sur un élément
 * React Three Fiber (`<mesh>`, `<group>`, `<primitive>`…) l'attribut devient une
 * propriété à écrire sur un objet Three, et R3F lève
 * « Cannot set "data-tsd-source" » au moment du `commitUpdate` — c'est-à-dire au
 * changement de capteur, quand les props des objets 3D sont réappliquées. La
 * scène est alors détruite et l'atelier se replie en vue plane.
 *
 * L'injection n'est PAS limitée au serveur de développement : les artefacts
 * compilés servis par l'aperçu la contiennent aussi. Le nettoyage s'applique
 * donc aux deux, et à deux niveaux :
 *
 *  1. `transform` : retire l'attribut des modules qui rendent des objets Three ;
 *  2. `renderChunk` : dernier filet, sur les chunks compilés qui contiennent ces
 *     mêmes modules, au cas où l'injection arrive après notre transformation.
 *
 * Aucune erreur n'est masquée : seule cette propriété fautive disparaît, et
 * seulement dans les modules 3D. Les autres modules gardent l'instrumentation.
 */
const THREE_MODULES =
  /\/src\/components\/(standex\/workshop\/(scene|machine-scene|candidate-thumbnail-scene)|leadmagnet\/connector-preview-scene)\.tsx$/;

const ATTRIBUTE = "data-tsd-source";

/**
 * Retire la propriété `data-tsd-source` quelle que soit sa forme : clé entre
 * guillemets doubles, simples, backticks ou non quotée, valeur littérale ou
 * expression simple, avec ou sans virgule de fin. La forme JSX brute est aussi
 * traitée si un autre plugin s'exécute après nous.
 */
function stripAttribute(code: string): string {
  return (
    code
      // objet compilé : "data-tsd-source": <valeur>, / 'data-tsd-source': … / data-tsd-source: …
      .replace(
        /(?:"data-tsd-source"|'data-tsd-source'|`data-tsd-source`|\bdata-tsd-source\b)\s*:\s*(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|[A-Za-z0-9_$.[\]]+)\s*,?\s*/g,
        "",
      )
      // JSX : data-tsd-source="…" ou data-tsd-source={…}
      .replace(/\sdata-tsd-source=(?:"[^"]*"|'[^']*'|\{[^{}]*\})/g, "")
  );
}

export function stripThreeSourceTags(): Plugin {
  return {
    name: "standex:strip-three-source-tags",
    enforce: "post",
    transform(code, id) {
      const file = id.split("?")[0]!;
      if (!THREE_MODULES.test(file) || !code.includes(ATTRIBUTE)) return null;
      const stripped = stripAttribute(code);
      return stripped === code ? null : { code: stripped, map: null };
    },
    renderChunk(code, chunk) {
      if (!code.includes(ATTRIBUTE)) return null;
      const touchesThree = chunk.moduleIds.some((moduleId) =>
        THREE_MODULES.test(moduleId.split("?")[0]!),
      );
      if (!touchesThree) return null;
      const stripped = stripAttribute(code);
      return stripped === code ? null : { code: stripped, map: null };
    },
  };
}
