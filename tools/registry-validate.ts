import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync, renameSync, rmSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { SENSOR_CATALOG } from "../src/lib/standex/sensor-catalog.ts";
import { SCHEMAS, REGISTRY_IDS, DECIMAL, header, isDate } from "./registry-schema.ts";
import type { RegistryId, Row, Cell } from "./registry-schema.ts";
export { header, SCHEMAS } from "./registry-schema.ts";
export type { RegistryId, Row } from "./registry-schema.ts";

export interface Issue { file: string; line: number; column: string; message: string; severity: "error" | "warning" }
export interface Input { name: string; text: string }
export interface Snapshot { registry: RegistryId; version: number; file: string; sha256: string; rows: Row[]; lines: number[] }
export interface Result { ok: boolean; issues: Issue[]; snapshots: Snapshot[] }
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const present = (v: Cell | undefined) => v !== null && v !== undefined && v !== "";
const valueKey = (r: Row, keys: string[]) => JSON.stringify(keys.map(k => r[k]));
const filename = (name: string) => /^(R1|R2b|R2c|R2|R3b|R3)_[A-Za-z0-9_-]+_V([1-9][0-9]*)\.csv$/.exec(basename(name));

/** RFC-style quoting with semicolons, LF and comments only at the start of a record.
 * Values are never trimmed or normalized: quoted newlines, accents and spaces survive exactly. */
export function parseCsv(text: string): { cells: string[]; line: number }[] {
  const rows: { cells: string[]; line: number }[] = [];
  let cells: string[] = [], cell = "", quoted = false, afterQuote = false, line = 1, start = 1;
  const endCell = () => { cells.push(cell); cell = ""; afterQuote = false; };
  const endRow = () => { endCell(); rows.push({ cells, line: start }); cells = []; start = line + 1; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (!quoted && !afterQuote && cells.length === 0 && cell === "" && c === "#") {
      while (i < text.length && text[i] !== "\n") i++;
      line++; start = line; continue;
    }
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else { quoted = false; afterQuote = true; } }
      else { cell += c; if (c === "\n") line++; }
    } else if (c === ";") endCell();
    else if (c === "\n") { endRow(); line++; }
    else if (c === '"' && cell === "" && !afterQuote) quoted = true;
    else if (c === '"' || afterQuote) throw new Error(`Ligne ${line} : guillemets mal fermés ; entourez la cellule entière et doublez les guillemets internes.`);
    else cell += c;
  }
  if (quoted) throw new Error(`Ligne ${start} : cellule entre guillemets non terminée.`);
  if (cell !== "" || cells.length || afterQuote) endRow();
  return rows;
}

export function validateBatch(inputs: Input[], strict = false, previous: Snapshot[] = []): Result {
  const issues: Issue[] = [], snapshots: Snapshot[] = [];
  const add = (file: string, line: number, column: string, message: string, warning = false) => issues.push({ file, line, column, message, severity: warning && !strict ? "warning" : "error" });
  for (const input of inputs) {
    const file = basename(input.name), match = filename(file);
    if (!match) { add(file, 1, "fichier", "Utilisez un registre public versionné R1/R2/R2b/R2c/R3/R3b_<nom>_V<n>.csv. Les gabarits et fichiers privés sont exclus."); continue; }
    const id = match[1] as RegistryId, schema = SCHEMAS[id];
    if (snapshots.some(s => s.registry === id)) { add(file, 1, "fichier", "Une seule version de chaque registre est autorisée par import."); continue; }
    if (input.text.startsWith("\uFEFF") || input.text.includes("\r")) { add(file, 1, "format", "Enregistrez en UTF-8 sans BOM, avec des fins de ligne LF. Aucun contenu n'a été modifié."); continue; }
    let parsed: ReturnType<typeof parseCsv>;
    try { parsed = parseCsv(input.text); } catch (e) { add(file, 1, "CSV", (e as Error).message); continue; }
    if (!parsed[0] || parsed[0].line !== 1 || parsed[0].cells.join(";") !== header(id) || parsed[0].cells.length !== schema.fields.length) { add(file, 1, "en-tête", `En-tête attendu exactement : ${header(id)}`); continue; }
    const snapshot: Snapshot = { registry: id, version: Number(match[2]), file, sha256: hash(input.text), rows: [], lines: [] };
    snapshots.push(snapshot);
    for (const record of parsed.slice(1)) {
      const fail = (column: string, message: string, warning = false) => add(file, record.line, column, message, warning);
      if (record.cells.length !== schema.fields.length) { fail("ligne", `Cette ligne doit contenir ${schema.fields.length} colonnes ; vérifiez les points-virgules et les guillemets.`); continue; }
      const row: Row = {};
      for (const [index, field] of schema.fields.entries()) {
        const raw = record.cells[index]!;
        row[field.name] = raw === "" ? null : raw;
        if (raw === "") { if (field.required) fail(field.name, "Renseignez cette donnée obligatoire depuis sa source. Ne l'estimez pas."); continue; }
        if (raw.trim() === "") { fail(field.name, "Une cellule d'espaces n'est pas une donnée ; videz-la ou renseignez sa source."); continue; }
        if (field.type === "number" || field.type === "integer") {
          const n = Number(raw);
          if (!DECIMAL.test(raw) || !Number.isFinite(n) || (field.type === "integer" && !Number.isSafeInteger(n))) { fail(field.name, "Saisissez un nombre fini avec un point décimal, sans unité ni séparateur de milliers" + (field.type === "integer" ? ", et sans fraction." : ".")); continue; }
          row[field.name] = n;
          if ((field.positive && n <= 0) || (field.min !== undefined && n < field.min) || (field.max !== undefined && n > field.max)) fail(field.name, `Valeur hors plage autorisée${field.positive ? " : strictement supérieure à zéro" : ` : ${field.min ?? "sans minimum"} à ${field.max ?? "sans maximum"}`}.`);
        } else if (field.type === "boolean") {
          if (raw !== "true" && raw !== "false") fail(field.name, "Saisissez true ou false.");
          else row[field.name] = raw === "true";
        } else if (field.type === "date" && !isDate(raw)) fail(field.name, "Saisissez une date réelle au format AAAA-MM-JJ.");
        if (field.pattern && !field.pattern.test(raw)) fail(field.name, `Identifiant ou code invalide ; format attendu : ${field.pattern.source}.`);
        if (field.choices && !field.choices.includes(raw)) fail(field.name, `Choisissez exactement : ${field.choices.join(" / ")}.`);
      }
      snapshot.rows.push(row); snapshot.lines.push(record.line);
      if (snapshot.rows.slice(0, -1).some(r => valueKey(r, schema.key) === valueKey(row, schema.key))) fail(schema.key.join(" + "), "Identifiant en double ; donnez un identifiant distinct ou retirez le doublon.");
      if (row["confidence"] === "low") fail("confidence", "Confiance basse : donnée exclue de la calibration.", true);
      if (row["source_type"] === "inferred") fail("source_type", "Source inférée : donnée exclue de la calibration.", true);
      if (id === "R1") {
        if (String(row["designation"] ?? "").length > 120) fail("designation", "Limitez la désignation à 120 caractères.");
        if ((row["shape"] === "block") !== present(row["dim_b_mm"])) fail("dim_b_mm", "Renseignez la largeur pour un bloc ; laissez-la vide pour un cylindre ou un anneau.");
        if ((row["shape"] === "ring") !== present(row["inner_diameter_mm"])) fail("inner_diameter_mm", "Renseignez le diamètre intérieur uniquement pour un anneau.");
        if (row["shape"] === "ring" && Number(row["inner_diameter_mm"]) >= Number(row["dim_a_mm"])) fail("inner_diameter_mm", "Le diamètre intérieur doit être inférieur au diamètre extérieur.");
        if (present(row["max_service_temp_c"]) && !present(row["max_service_temp_source"])) fail("max_service_temp_source", "Citez la source de la température maximale ; conservez les deux sources en cas de divergence.");
      }
      if (id === "R2") {
        if (Number(row["drop_out_mm"]) <= Number(row["pull_in_mm"])) fail("drop_out_mm", "Le relâchement doit être plus éloigné que l'enclenchement : un contact reed reste fermé plus loin qu'il ne s'est fermé. Vérifiez que les deux colonnes ne sont pas inversées.");
        if (String(row["value_type"]).startsWith("measured") && !present(row["sample_count"])) fail("sample_count", "Indiquez au moins un échantillon pour une mesure.");
        if (String(row["value_type"]).startsWith("measured") && row["source_type"] !== "measured") fail("source_type", "Une mesure doit porter le type de source measured.");
      }
      if (id === "R2b") {
        if (row["ambiguous"] === true) fail("ambiguous", "APPROACH_AMBIGUOUS : la figure ne définit pas entièrement l'approche ; calibration interdite.", true);
        if (present(row["offset_axis"]) !== present(row["offset_mm"])) fail("offset_mm", "Renseignez ensemble l'axe et son décalage ; sinon laissez les deux vides.");
        if (present(row["offset_axis"]) && row["offset_axis"] === row["motion_axis"]) fail("offset_axis", "L'axe du décalage doit différer de celui du déplacement.");
        const angles = String(row["magnet_orientation_deg"] ?? "").split("/");
        if (angles.length !== 3 || angles.some(a => !DECIMAL.test(a) || !Number.isFinite(Number(a)))) fail("magnet_orientation_deg", "Indiquez trois angles finis séparés par /, en degrés XYZ intrinsèque ; ne les déduisez pas du nom D1/D3.");
      }
      if (id === "R2c" && row["mrp_known"] === true && !present(row["offset_to_mrp_mm"])) fail("offset_to_mrp_mm", "Le point magnétique déclaré connu doit avoir un décalage sourcé.");
      if (id === "R2c" && row["mrp_known"] === false && present(row["offset_to_mrp_mm"])) fail("offset_to_mrp_mm", "Laissez vide le décalage non sourcé ; l'ajustement appartient au rapport de calibration.");
      if (id === "R3") {
        if (present(row["switched_voltage_v"]) && !present(row["voltage_nature"])) fail("voltage_nature", "Précisez continu, alternatif efficace, crête ou inconnu pour la tension saisie.");
        if (present(row["temperature_min_c"]) && present(row["temperature_max_c"]) && Number(row["temperature_min_c"]) > Number(row["temperature_max_c"])) fail("temperature_max_c", "La température maximale doit être supérieure ou égale à la minimale.");
        if (present(row["environment"])) {
          const env = String(row["environment"]).split("|");
          if (env.some(e => !["humide", "poussière", "vibrations", "lavage", "huile", "extérieur", "atex", "aucun"].includes(e)) || new Set(env).size !== env.length || (env.includes("aucun") && env.length > 1)) fail("environment", "Utilisez les valeurs autorisées séparées par |, sans doublon ; aucun doit rester seul.");
        }
      }
    }
  }
  // Revalidate cross references of already accepted dependants when replacing only one registry.
  // An explicitly supplied empty registry overrides the previous data, never falls back to it.
  for (const old of previous) if (!snapshots.some(s => s.registry === old.registry)) snapshots.push(old);
  const rows = (id: RegistryId) => snapshots.find(s => s.registry === id)?.rows ?? [];
  const catalog = new Set(SENSOR_CATALOG.filter(s => s.sourceFile !== null).map(s => s.id));
  for (const s of snapshots) for (const [i, row] of s.rows.entries()) {
    const fail = (c: string, m: string) => add(s.file, s.lines[i]!, c, m);
    if ((s.registry === "R2" || s.registry === "R2c") && !catalog.has(String(row["sensor_family"]))) fail("sensor_family", "Famille absente du catalogue commercial ; choisissez un identifiant réel de SENSOR_CATALOG.");
    const ref = (field: string, id: RegistryId, key: string) => {
      const found = rows(id).find(r => r[key] === row[field]);
      if (!found) fail(field, `Référence absente de ${id} : complétez le registre lié avant l'import.`);
      return found;
    };
    if (s.registry === "R2") {
      ref("magnet_id", "R1", "magnet_id"); ref("approach_id", "R2b", "approach_id");
      const datum = ref("datum_id", "R2c", "datum_id");
      if (datum && datum["sensor_family"] !== row["sensor_family"]) fail("datum_id", "Le datum doit appartenir à la même famille de capteurs.");
    }
    if (s.registry === "R3b") ref("case_id", "R3", "case_id");
    if (s.registry === "R3" && present(row["supersedes_case_id"])) {
      ref("supersedes_case_id", "R3", "case_id");
      if (rows("R3").filter(r => r["supersedes_case_id"] === row["supersedes_case_id"]).length > 1) fail("supersedes_case_id", "Ce cas est déjà remplacé par une autre ligne.");
      let current: Row | undefined = row; const visited = new Set<Cell | undefined>();
      while (current && present(current["supersedes_case_id"])) {
        if (visited.has(current["case_id"])) { fail("supersedes_case_id", "Une correction ne peut pas créer de cycle ni se remplacer elle-même."); break; }
        visited.add(current["case_id"]); const next: Cell | undefined = current["supersedes_case_id"];
        current = rows("R3").find(r => r["case_id"] === next);
      }
    }
  }
  for (const old of previous) {
    const next = snapshots.find(s => s.registry === old.registry);
    if (!next) continue;
    if (next.version < old.version || (next.version === old.version && next.sha256 !== old.sha256)) add(next.file, 1, "version", "Version acceptée immuable : créez une version supérieure et conservez la précédente.");
    if (old.registry === "R3") for (const row of old.rows) {
      const same = next.rows.find(r => r["case_id"] === row["case_id"]);
      if (!same || JSON.stringify(same) !== JSON.stringify(row)) add(next.file, 1, "case_id", "Cas accepté supprimé ou modifié : conservez-le et ajoutez une correction avec un nouvel identifiant.");
    }
  }
  return { ok: !issues.some(i => i.severity === "error"), issues, snapshots };
}

/** Readiness is not calibration: these are only the missing-data gates for the next lot. */
export function calibrationBlockers(row: Row, snapshots: Snapshot[]): string[] {
  const find = (id: RegistryId, key: string) => snapshots.find(s => s.registry === id)?.rows.find(r => r[key] === row[key]);
  const magnet = find("R1", "magnet_id"), approach = find("R2b", "approach_id"), datum = find("R2c", "datum_id");
  const reasons: string[] = [];
  if (!magnet) reasons.push("MAGNET_NOT_IN_REGISTRY");
  else { if (magnet["br_mt_20c"] === null) reasons.push("MAGNET_BR_UNKNOWN"); if (magnet["source_type"] === "inferred" || magnet["confidence"] === "low") reasons.push("MAGNET_SOURCE_INFERRED"); }
  if (!approach || approach["ambiguous"] === true) reasons.push("APPROACH_AMBIGUOUS");
  if (!datum || !present(datum["reference_feature"]) || !present(datum["figure_ref"])) reasons.push("DATUM_UNKNOWN");
  if (row["confidence"] === "low") reasons.push("CALIBRATION_SOURCE_LOW_CONFIDENCE");
  return reasons;
}

export function formatReport(result: Result): string {
  const lines = result.issues.map(i => `${i.file} — Ligne ${i.line}, colonne « ${i.column} » : ${i.severity === "warning" ? "AVERTISSEMENT : " : ""}${i.message}`);
  for (const s of result.snapshots) {
    const counts: Record<string, number> = {};
    s.rows.forEach(r => { const type = String(r["source_type"] ?? "transcription"); counts[type] = (counts[type] ?? 0) + 1; });
    lines.push(`${s.registry} V${s.version} : ${s.rows.length} lignes ; sources ${JSON.stringify(counts)}.`);
    if (s.registry === "R2") {
      const blocked = s.rows.map(row => ({ id: row["calibration_id"], reasons: calibrationBlockers(row, result.snapshots) })).filter(r => r.reasons.length);
      lines.push(`${blocked.length}/${s.rows.length} lignes inutilisables pour la calibration absolue. Aucun résultat de solveur n'est validé par cet import.`);
      blocked.forEach(r => lines.push(`${r.id} : ${r.reasons.join(", ")}`));
    }
    if (s.registry === "R1") s.rows.filter(r => r["br_mt_20c"] === null).forEach(r => lines.push(`${r["magnet_id"]} : MAGNET_BR_UNKNOWN ; aucune rémanence de repli.`));
  }
  lines.push(result.ok ? "Validation acceptée, zéro erreur." : "Import refusé : aucun JSON ni journal modifié.");
  return lines.join("\n") + "\n";
}

/** Inputs are untrusted bytes; private filenames are refused before readFileSync. */
export function importFiles(paths: string[], options: { outputDir: string; indexPath: string; strict?: boolean; check?: boolean; today?: string }): Result {
  if (paths.some(p => /R3c_/i.test(basename(p)))) return { ok: false, snapshots: [], issues: [{ file: "fichier privé", line: 1, column: "fichier", message: "La table privée reste sur le poste de Thomas et ne peut pas être importée.", severity: "error" }] };
  const previous: Snapshot[] = [];
  for (const id of REGISTRY_IDS) {
    const target = join(options.outputDir, `${id}.json`);
    if (existsSync(target)) previous.push(JSON.parse(readFileSync(target, "utf8")) as Snapshot);
  }
  let inputs: Input[];
  try { inputs = paths.map(p => ({ name: p, text: new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(readFileSync(p)) })); }
  catch { return { ok: false, snapshots: [], issues: [{ file: "entrée", line: 1, column: "format", message: "Lecture impossible ou UTF-8 invalide. Vérifiez le chemin et l'encodage.", severity: "error" }] }; }
  const result = validateBatch(inputs, options.strict ?? false, previous);
  if (!result.ok || options.check) return result;
  const date = options.today ?? new Date().toISOString().slice(0, 10);
  if (!isDate(date)) throw new Error("Date du journal invalide.");
  const index = existsSync(options.indexPath) ? readFileSync(options.indexPath, "utf8") : "# Versions acceptées\n\n| Registre | Version | Date | Lignes | SHA-256 CSV | Validation |\n|---|---|---|---|---|---|\n";
  const fresh = result.snapshots.filter(s => !previous.some(p => p.registry === s.registry && p.version === s.version && p.sha256 === s.sha256));
  if (!fresh.length) return result;
  const writes: { path: string; text: string }[] = [];
  for (const s of fresh) {
    const payload = JSON.stringify(s, null, 2) + "\n";
    const archive = join(options.outputDir, "history", `${s.registry}_V${s.version}.json`);
    if (existsSync(archive) && readFileSync(archive, "utf8") !== payload) {
      result.ok = false; result.issues.push({ file: s.file, line: 1, column: "version", message: "Cette version existe déjà dans l'historique avec un autre contenu.", severity: "error" }); return result;
    }
    writes.push({ path: archive, text: payload }, { path: join(options.outputDir, `${s.registry}.json`), text: payload });
  }
  writes.push({ path: options.indexPath, text: index + fresh.map(s => `| ${s.registry} | V${s.version} | ${date} | ${s.rows.length} | ${s.sha256} | zéro erreur |\n`).join("") });
  // Stage all files first; roll back committed paths if a filesystem operation fails.
  const backups = new Map(writes.map(w => [w.path, existsSync(w.path) ? readFileSync(w.path) : null]));
  const changed: string[] = []; const token = `${process.pid}-${Date.now()}`;
  try {
    for (const w of writes) { mkdirSync(dirname(w.path), { recursive: true }); writeFileSync(`${w.path}.${token}.tmp`, w.text, "utf8"); }
    for (const w of writes) { renameSync(`${w.path}.${token}.tmp`, w.path); changed.push(w.path); }
  } catch (e) {
    for (const p of changed.reverse()) { const old = backups.get(p); if (old) writeFileSync(p, old); else rmSync(p, { force: true }); }
    throw e;
  } finally { for (const w of writes) rmSync(`${w.path}.${token}.tmp`, { force: true }); }
  return result;
}

/** Select newest numeric versions in a directory, skipping models and private files before reading.
 * A single-file invocation also loads latest public dependencies from the same directory. */
export function resolveInputs(args: string[]): string[] {
  const selected = new Map<RegistryId, string>();
  const latest = (dir: string) => {
    const map = new Map<RegistryId, string>();
    for (const file of readdirSync(dir)) { const m = filename(file); if (!m) continue; const id = m[1] as RegistryId;
      const old = map.get(id); if (!old || Number(m[2]) > Number(filename(old)![2])) map.set(id, join(dir, file));
      else if (Number(m[2]) === Number(filename(old)![2])) throw new Error(`Deux fichiers ${id} portent la même version dans ${dir}.`);
    } return map;
  };
  for (const arg of args) {
    if (/R3c_/i.test(basename(arg))) throw new Error("Fichier privé interdit ; il n'a pas été lu.");
    if (arg.endsWith("*.csv") || !arg.toLowerCase().endsWith(".csv")) {
      for (const [id, file] of latest(arg.endsWith("*.csv") ? dirname(arg) : arg)) { if (selected.has(id) && selected.get(id) !== file) throw new Error(`Deux versions de ${id} sélectionnées.`); selected.set(id, file); }
    } else if (/_MODELE\.csv$/i.test(arg)) continue;
    else { const m = filename(arg); if (!m) throw new Error(`Nom de registre invalide : ${basename(arg)}.`); const id = m[1] as RegistryId; if (selected.has(id)) throw new Error(`Deux versions de ${id} sélectionnées.`); selected.set(id, arg); }
  }
  const dependencies: Partial<Record<RegistryId, RegistryId[]>> = { R2: ["R1", "R2b", "R2c"], R3b: ["R3"] };
  for (const [id, file] of [...selected]) for (const dep of dependencies[id] ?? []) {
    if (!selected.has(dep)) { const candidate = latest(dirname(file)).get(dep); if (candidate) selected.set(dep, candidate); }
  }
  if (!selected.size) throw new Error("Aucun registre public versionné sélectionné. Les gabarits ne sont jamais importés.");
  return [...selected.values()];
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2), flags = args.filter(a => a.startsWith("--"));
    if (flags.some(f => !["--strict", "--check"].includes(f))) throw new Error("Options autorisées : --strict, --check.");
    const paths = resolveInputs(args.filter(a => !a.startsWith("--")));
    const result = importFiles(paths, { outputDir: resolve("src/data/registries"), indexPath: join(dirname(paths[0]!), "INDEX.md"), strict: flags.includes("--strict"), check: flags.includes("--check") });
    process.stdout.write(formatReport(result)); process.exitCode = result.ok ? 0 : 1;
  } catch (e) { process.stdout.write(`Import refusé : ${(e as Error).message}\n`); process.exitCode = 1; }
}
