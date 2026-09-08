/**
 * Reproducible inventory of UI strings that are not routed through the dictionary.
 *
 * Two failures are reported:
 *  - untranslated: a human-readable literal rendered by the UI without t()/msg().
 *  - missing: a literal that goes through t()/msg() but has no dictionary entry.
 *
 * Run: bun scripts/i18n-inventory.ts [--json]
 */
import ts from "typescript";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["src/routes", "src/components", "src/lib"];
const SKIP_FILES = [
  "src/lib/i18n/core.ts",
  "src/lib/i18n/react.tsx",
  "src/routeTree.gen.ts",
  // Contenus qui ne sont PAS de l'interface et qui doivent rester dans leur
  // langue d'origine :
  "src/lib/leadmagnet/nda-docx.ts", // NDA original immuable (juridique)
  "src/lib/standex/response-contract.ts", // contrat/prompt serveur
  "src/lib/standex/experimental.server.ts", // prompt serveur
  "src/lib/standex/migration-status.ts", // SQL et noms de colonnes
  "src/lib/error-page.ts", // page de secours statique hors React
];
const SKIP_DIRS = ["src/components/ui", "src/lib/i18n"];

/** Littéraux volontairement non traduits (marque, attributs techniques, valeurs de comparaison). */
const EXEMPT_TEXTS = new Set([
  "width=device-width, initial-scale=1",
  "Standex Electronics",
  "Standex DETECT Electronics",
  "(SHA-256",
  "Tous",
  "noindex, nofollow",
  "mw-pole north",
  "mw-pole south",
]);


/** Attributes whose string value reaches a human. */
const TEXT_ATTRS = new Set([
  "aria-label",
  "aria-description",
  "aria-roledescription",
  "aria-placeholder",
  "aria-valuetext",
  "alt",
  "title",
  "placeholder",
  "label",
  "backLabel",
  "summary",
  "downloadName",
]);
/** Attributes that never reach a human. */
const CODE_ATTRS = new Set([
  "className",
  "class",
  "id",
  "key",
  "htmlFor",
  "type",
  "role",
  "name",
  "href",
  "to",
  "src",
  "rel",
  "target",
  "lang",
  "value",
  "accept",
  "autoComplete",
  "inputMode",
  "pattern",
  "form",
  "slot",
  "style",
  "attach",
  "color",
  "wrap",
  "encType",
  "method",
  "d",
  "viewBox",
  "fill",
  "stroke",
  "xmlns",
  "aria-labelledby",
  "aria-describedby",
  "aria-controls",
  "aria-hidden",
  "aria-live",
  "aria-current",
  "aria-expanded",
  "aria-modal",
  "aria-haspopup",
  "aria-selected",
  "aria-atomic",
]);

const listFiles = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (SKIP_DIRS.some((d) => path.startsWith(d))) continue;
    if (statSync(path).isDirectory()) out.push(...listFiles(path));
    else if (/\.tsx?$/.test(path) && !SKIP_FILES.includes(path)) out.push(path);
  }
  return out;
};

/** Human prose heuristic: at least one word of 3+ letters, or French punctuation/diacritics. */
const HUMAN = /[A-Za-zÀ-ÿ]{3,}/;
const FRENCH_HINT =
  /[àâäçéèêëîïôöùûüœÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŒ]|\b(le|la|les|un|une|des|du|de|et|ou|pour|avec|dans|sur|par|sans|vous|votre|vos|est|sont|ce|cette|aucun|aucune|pas|plus|non|oui|mon|ma|mes|au|aux|qui|que|quel|quelle|se|sa|son|ses|tout|toute|toutes|tous|encore|déjà|jamais|toujours|fichier|projet|capteur|langue|dossier|revue|câble|montage|besoin|choisir|ajouter|ouvrir|fermer|enregistrer|exporter|importer|reprendre|annuler|valider)\b/i;

const isProse = (raw: string, loose = false) => {
  const value = raw.trim();
  if (value.length < 3) return false;
  if (!HUMAN.test(value)) return false;
  if (/^[a-z0-9_.$/@-]+$/.test(value)) return false; // identifiers, paths, ids
  if (/^[A-Z0-9_]+$/.test(value)) return false; // constants
  if (/^#[0-9a-fA-F]{3,8}$/.test(value)) return false;
  if (/^https?:\/\//.test(value)) return false;
  if (/^[\w.-]+\.(png|jpg|jpeg|svg|glb|json|md|pdf|docx|css|ts|tsx)$/i.test(value)) return false;
  if (!loose && !/\s/.test(value) && !FRENCH_HINT.test(value)) return false;
  return loose || FRENCH_HINT.test(value) || /\s/.test(value);
};

type Finding = {
  file: string;
  line: number;
  text: string;
  kind: "untranslated" | "missing";
};

/** Domain modules keep canonical French; they are translated by t() at the display site. */
const isDomainModule = (file: string) => file.startsWith("src/lib/");

const dictionary: Record<string, readonly string[]> = JSON.parse(
  readFileSync("src/lib/i18n/messages.json", "utf8"),
);
const normalize = (v: string) => v.replace(/\s+/g, " ").trim();
const dictKeys = new Set(Object.keys(dictionary).map(normalize));
const templates = Object.keys(dictionary)
  .filter((k) => /\{\d+\}/.test(k))
  .map((k) => new RegExp("^" + k.split(/\{\d+\}/).map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("(.*?)") + "$"));
const known = (text: string) => {
  const key = normalize(text);
  return dictKeys.has(key) || templates.some((r) => r.test(key));
};

export function inventory(): Finding[] {
  const findings: Finding[] = [];
  const files = ROOTS.flatMap(listFiles);
  for (const file of files) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const at = (node: ts.Node) =>
      source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
    const report = (node: ts.Node, text: string, kind: Finding["kind"]) => {
      const value = normalize(text);
      if (EXEMPT_TEXTS.has(value)) return;
      findings.push({ file, line: at(node), text: value, kind });
    };

    /** True when the node sits inside a t()/msg() call argument. */
    const inTranslator = (node: ts.Node): boolean => {
      let current: ts.Node | undefined = node.parent;
      while (current) {
        if (ts.isCallExpression(current)) {
          const name = current.expression.getText(source);
          if (name === "t" || name === "msg" || name.endsWith(".t")) return true;
        }
        current = current.parent;
      }
      return false;
    };

    /** Un littéral comparé (`mode === "cable"`) est une valeur logique, pas un texte. */
    const inComparison = (node: ts.Node): boolean => {
      let current: ts.Node | undefined = node.parent;
      while (current && !ts.isCallExpression(current)) {
        if (
          ts.isBinaryExpression(current) &&
          (current.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken ||
            current.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
            current.operatorToken.kind === ts.SyntaxKind.EqualsEqualsToken ||
            current.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsToken)
        )
          return true;
        current = current.parent;
      }
      return false;
    };

    const visit = (node: ts.Node) => {
      if (ts.isJsxText(node)) {
        const text = node.getText(source);
        if (isProse(text, true)) report(node, text, isDomainModule(file) ? "missing" : "untranslated");
      } else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        const text = node.text;
        // Un mot isolé passé à t() doit AUSSI avoir sa traduction : « Renommer »
        // n'a ni espace ni accent et échappait au filtre de prose.
        if (
          /\p{L}{3,}/u.test(text) &&
          inTranslator(node) &&
          !inComparison(node) &&
          !ts.isImportDeclaration(node.parent) &&
          !known(text)
        ) {
          report(node, text, "missing");
        } else if (isProse(text)) {
          const parent = node.parent;
          // Module specifiers and object property keys never reach a human.
          if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) {
            /* skip */
          } else if (inTranslator(node)) {
            if (!known(text)) report(node, text, "missing");
          } else {
            let attr: string | null = null;
            if (ts.isJsxAttribute(parent)) attr = parent.name.getText(source);
            else if (
              ts.isJsxExpression(parent) &&
              parent.parent &&
              ts.isJsxAttribute(parent.parent)
            )
              attr = parent.parent.name.getText(source);
            if (attr && CODE_ATTRS.has(attr)) {
              /* skip */
            } else if (attr && !TEXT_ATTRS.has(attr) && !FRENCH_HINT.test(text)) {
              /* unknown attribute with non-French value: not owned UI prose */
            } else if (isDomainModule(file)) {
              if (!known(text)) report(node, text, "missing");
            } else {
              report(node, text, "untranslated");
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return findings;
}

if (import.meta.main) {
  const findings = inventory();
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(findings, null, 2));
  } else {
    const byFile = new Map<string, Finding[]>();
    for (const f of findings) byFile.set(f.file, [...(byFile.get(f.file) ?? []), f]);
    for (const [file, list] of [...byFile].sort((a, b) => b[1].length - a[1].length)) {
      console.log(`\n${file} (${list.length})`);
      for (const f of list.slice(0, 400))
        console.log(`  ${f.line}\t${f.kind}\t${f.text.slice(0, 110)}`);
    }
    console.log(
      `\nTOTAL ${findings.length} — untranslated ${findings.filter((f) => f.kind === "untranslated").length}, missing ${findings.filter((f) => f.kind === "missing").length}`,
    );
  }
}
