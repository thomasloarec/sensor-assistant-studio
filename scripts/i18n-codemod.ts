/**
 * One-shot codemod: routes every UI literal reported by the inventory through t().
 * Run: bun scripts/i18n-codemod.ts <file> [...files]
 */
import ts from "typescript";
import { readFileSync, writeFileSync } from "node:fs";

const IGNORE = new Set([
  "mw-pole north",
  "mw-pole south",
  "Standex DETECT Electronics",
  "(SHA-256",
  "Standex Electronics",
  "width=device-width, initial-scale=1",
]);
const HUMAN = /[A-Za-zÀ-ÿ]{3,}/;
const FRENCH_HINT =
  /[àâäçéèêëîïôöùûüœÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŒ]|\b(le|la|les|un|une|des|du|de|et|ou|pour|avec|dans|sur|par|sans|vous|votre|vos|est|sont|ce|cette|aucun|aucune|pas|plus|non|oui|mon|ma|mes|au|aux|qui|que|quel|quelle|se|sa|son|ses|tout|toute|toutes|tous|encore|déjà|jamais|toujours|fichier|projet|capteur|langue|dossier|revue|câble|montage|besoin|choisir|ajouter|ouvrir|fermer|enregistrer|exporter|importer|reprendre|annuler|valider)\b/i;
const CODE_ATTRS = new Set([
  "className","class","id","key","htmlFor","type","role","name","href","to","src","rel","target",
  "lang","value","accept","autoComplete","inputMode","pattern","form","slot","style","attach",
  "color","wrap","encType","method","d","viewBox","fill","stroke","xmlns","aria-labelledby",
  "aria-describedby","aria-controls","aria-hidden","aria-live","aria-current","aria-expanded",
  "aria-modal","aria-haspopup","aria-selected","aria-atomic",
]);
const isProse = (raw: string, loose = false) => {
  const value = raw.trim();
  if (value.length < 3 || IGNORE.has(value)) return false;
  if (!HUMAN.test(value)) return false;
  if (/^[a-z0-9_.$/@-]+$/.test(value)) return false;
  if (/^[A-Z0-9_]+$/.test(value)) return false;
  if (/^#[0-9a-fA-F]{3,8}$/.test(value)) return false;
  if (/^https?:\/\//.test(value)) return false;
  if (/^[\w.-]+\.(png|jpg|jpeg|svg|glb|json|md|pdf|docx|css|ts|tsx)$/i.test(value)) return false;
  if (!loose && !/\s/.test(value) && !FRENCH_HINT.test(value)) return false;
  return loose || FRENCH_HINT.test(value) || /\s/.test(value);
};
const quote = (value: string) => JSON.stringify(value);

for (const file of process.argv.slice(2)) {
  const original = readFileSync(file, "utf8");
  const source = ts.createSourceFile(file, original, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits: { start: number; end: number; text: string }[] = [];
  const inTranslator = (node: ts.Node): boolean => {
    let current: ts.Node | undefined = node.parent;
    while (current) {
      if (ts.isCallExpression(current)) {
        const name = current.expression.getText(source);
        if (name === "t" || name === "msg") return true;
      }
      current = current.parent;
    }
    return false;
  };
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) {
      const raw = node.getText(source);
      if (isProse(raw, true)) {
        const lead = raw.match(/^\s*/)![0];
        const tail = raw.match(/\s*$/)![0];
        const body = raw.slice(lead.length, raw.length - tail.length).replace(/\s+/g, " ");
        edits.push({
          start: node.getStart(source),
          end: node.getEnd(),
          text: `${lead}{t(${quote(body)})}${tail}`,
        });
      }
    } else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const text = node.text;
      if (isProse(text) && !inTranslator(node)) {
        const parent = node.parent;
        if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) return;
        // Never touch a value that participates in logic rather than display.
        if (
          ts.isBinaryExpression(parent) ||
          ts.isCaseClause(parent) ||
          ts.isComputedPropertyName(parent) ||
          ts.isComputedPropertyName(parent)
        )
          return;
        if (ts.isJsxAttribute(parent)) {
          const attr = parent.name.getText(source);
          if (CODE_ATTRS.has(attr) || attr.startsWith("data-")) return;
          edits.push({ start: node.getStart(source), end: node.getEnd(), text: `{t(${quote(text)})}` });
        } else {
          let attr: string | null = null;
          if (ts.isJsxExpression(parent) && parent.parent && ts.isJsxAttribute(parent.parent))
            attr = parent.parent.name.getText(source);
          if (attr && (CODE_ATTRS.has(attr) || attr.startsWith("data-"))) return;
          edits.push({ start: node.getStart(source), end: node.getEnd(), text: `t(${quote(text)})` });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  let out = original;
  for (const edit of edits.sort((a, b) => b.start - a.start))
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
  writeFileSync(file, out);
  console.log(`${file}: ${edits.length} literals routed through t()`);
}
