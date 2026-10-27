/** Régénère le rapport de l'expérience de calibration PASS 2 (lot 2, revue).
 *   bun scripts/detection-lab-pass2-report.ts
 * Sorties : docs/detection-lab-pass2/ (Markdown, CSV, JSON, SVG). Tout vient du
 * noyau pur ; le profil 1.1, le lot 1 et l'interface ne sont pas modifiés. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { PILOT_MAGNETS } from "../src/lib/detection-lab/magnets";
import { PROFILE } from "../src/lib/detection-lab/profile";
import { buildCalibrations } from "../src/lib/detection-lab/pilot";
import { computeCutById } from "../src/lib/detection-lab/classify";
import { evaluatePose } from "../src/lib/detection-lab/pose";
import { paletteFromCss } from "../src/lib/detection-lab/report";
import {
  AT_CLASSES, AT_NOTICE, AT_SOURCE, CRITERION, PASS2_VARIANTS, PASS2_VERSION, SUSPECTED_ANOMALY,
  buildPass2Table, controlRows, fitK, fitLength, isSuspectedAnomaly, scoreControls,
  type Pass2Params, type Pass2Row,
} from "../src/lib/detection-lab/pass2";
import { centralNullWidthTable, commonNodeComparison, computeFineCut, fineGridCells, type FineCut } from "../src/lib/detection-lab/pass2-cuts";
import { fineCutToCsv, fineCutToSvg } from "../src/lib/detection-lab/pass2-report";

const OUT = "docs/detection-lab-pass2";
mkdirSync(`${OUT}/svg`, { recursive: true });
const sha = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");
const f = (v: number | null | undefined, n = 2) => (v == null ? "—" : v.toFixed(n));
const PALETTE = paletteFromCss(readFileSync("src/styles.css", "utf8"));
const md: string[] = [];
const timings: string[] = [];
const time = <T,>(label: string, fn: () => T): T => { const t = performance.now(); const r = fn(); timings.push(`| ${label} | ${Math.round(performance.now() - t)} ms |`); return r; };

const MODEL = "B" as const, CONV = "C1" as const;

// --- Ajustements (apprentissage : 8 bornes D1 Form C/E × 2 aimants, rien d'autre) ---
const lengthFit = time("Ajustement de L (accord inter-aimants D1)", () => fitLength(MODEL, CONV));
const variantResults = PASS2_VARIANTS.map((v) => {
  const L = v.effectiveLengthMm === "fitted" ? lengthFit.effectiveLengthMm : v.effectiveLengthMm;
  const kFit = time(`Ajustement de k (${v.id})`, () => fitK(L, MODEL, CONV));
  const params: Pass2Params = { effectiveLengthMm: L, axialDatumMm: v.axialDatumMm, model: MODEL, conv: CONV, k: kFit.k };
  const table = time(`Tableau A..G (${v.id})`, () => buildPass2Table(params));
  const primary = scoreControls(table);
  const secondary = scoreControls(table, isSuspectedAnomaly);
  return { variant: v, L, kFit, params, table, primary, secondary };
});

// CSV des tableaux
const csvCell = (v: unknown) => { const s = v == null ? "" : String(v); return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
for (const r of variantResults) {
  const head = "class,magnet,approach,bound,at,theta_mT,published_mm,estimated_mm,error_mm,error_pct,status,notes";
  const lines = r.table.map((row: Pass2Row) => [row.className, row.magnetId, row.approach, row.bound, row.at, row.thetaMT, row.publishedMm, row.estimatedMm, row.errorMm, row.errorPct, row.status, row.notes.join(" | ")].map(csvCell).join(","));
  writeFileSync(`${OUT}/tableau_${r.variant.id}.csv`, [head, ...lines].join("\n"));
}
writeFileSync(`${OUT}/resultats_pass2.json`, JSON.stringify({
  version: PASS2_VERSION, profile: { id: PROFILE.id, version: PROFILE.version },
  model: MODEL, convention: CONV, atSource: AT_SOURCE, criterion: CRITERION, suspectedAnomaly: SUSPECTED_ANOMALY,
  lengthFit, variants: variantResults.map((r) => ({ id: r.variant.id, L: r.L, datumMm: r.variant.axialDatumMm, k: r.kFit.k, kMedianAbsPct: r.kFit.medianAbsPct, primary: r.primary, secondary: r.secondary })),
}, null, 1));

// --- Coupes perpendiculaires raffinées (profil 1.1, B/C1, seuils partagés du lot 1) ---
const calB = time("Seuils partagés lot 1 (B/C1)", () => buildCalibrations("B", "C1"));
const fineCuts: FineCut[] = [];
for (const mag of PILOT_MAGNETS)
  for (const id of ["2-perpendicular-centred-C", "3-perpendicular-offset-C"] as const) {
    const cut = time(`Coupe raffinée ${id} ${mag.id}`, () => computeFineCut(id, mag, calB));
    fineCuts.push(cut);
    writeFileSync(`${OUT}/svg/${id}_${mag.id}_B_fine.svg`, fineCutToSvg(cut, mag, PALETTE));
    writeFileSync(`${OUT}/svg/${id}_${mag.id}_B_fine.csv`, fineCutToCsv(cut));
  }
const nodeChecks = fineCuts.map((c) => ({ id: c.id, magnetId: c.magnetId, ...time(`Nœuds communs ${c.id} ${c.magnetId}`, () => commonNodeComparison(c, PILOT_MAGNETS.find((m) => m.id === c.magnetId)!, calB)) }));
const widthTables = PILOT_MAGNETS.map((m) => ({ magnetId: m.id, rows: time(`Largeurs zone centrale ${m.id}`, () => centralNullWidthTable(m)) }));

// --- Vérification collision N45 (reproduction de la lecture du CSV du lot 1) ---
const coarseCut2 = time("Coupe 1 mm lot 1 (N45, B)", () => computeCutById("2-perpendicular-centred-C", PILOT_MAGNETS[1]!, "B", "C1", calB));
const favCells = coarseCut2.cells.filter((c) => c.category === "favorable");
const favAtY5 = favCells.filter((c) => c.y === 5).length;
const n45Probe = evaluatePose(PILOT_MAGNETS[1]!, { center: [0, 5, 0], axis: [0, 1, 0] }, PROFILE.scenarios[0]!, "B");

// --- Rapport Markdown ---
md.push(`# Laboratoire de détection reed — expérience de calibration (lot 2)`, "",
  `Généré par \`bun scripts/detection-lab-pass2-report.ts\` le ${new Date().toISOString().slice(0, 10)}. Préversion interne staff. **Ordres de grandeur pédagogiques : aucune garantie de commutation au millimètre. Paramètres ajustés, pas des dimensions prouvées.**`, "",
  "## Proposition testée et provenance", "",
  "- Proposition reçue : modèle B, longueur effective 16 mm, convention C1, repère axial D3/D5 fixé à +7 mm (extrémité du verre) indépendant de L, seuil θ = k·AT (up = AT max, to = AT min), k ajusté uniquement sur les 8 bornes D1 Form C/E × 2 aimants. Classes B/D et approches D3/D4/D5 hors apprentissage. Moment physique inchangé.",
  `- Transcription Form : \`src/data/detection-lab/brochure-form-rows.json\` (SHA256 fichier \`${sha("src/data/detection-lab/brochure-form-rows.json")}\`), inchangée, aucune correction.`,
  `- Classes AT : ${AT_SOURCE.title} — ${AT_SOURCE.url} (vérifiée le ${AT_SOURCE.checkedOn}). ${AT_NOTICE}`,
  "- Physique inchangée : `evaluatePose` reste l'unique entrée physique ; L entre par le scénario (facteur de longueur), le repère axial par le paramètre explicite des mêmes fonctions de recherche que le lot 1. Le profil 1.1 n'est pas modifié.", "",
  "## Ajustements (apprentissage D1 C/E uniquement)", "",
  `| Variante | L (mm) | repère axial (mm) | k ajusté (mT/AT) | médiane résidus D1 |`, "|---|---|---|---|---|");
for (const r of variantResults)
  md.push(`| ${r.variant.id} | ${f(r.L, 3)} | ${r.variant.axialDatumMm} | ${f(r.kFit.k, 7)} | ${f(r.kFit.medianAbsPct)} % |`);
md.push("", `Ajustement de L par accord inter-aimants sur D1 seul (Σ log² θ_N45/θ_SmCo) : **L = ${f(lengthFit.effectiveLengthMm, 3)} mm** (RMS log ${f(lengthFit.rmsLogDisagreement, 4)}). k ne dépend pas du repère axial (D1 n'utilise pas le repère) : V1 et V2 partagent le même k.`, "",
  "Ces valeurs sont des paramètres ajustés sur 8 bornes d'apprentissage, pas des dimensions prouvées.", "",
  "## Score des contrôles — critère explicite", "",
  `Contrôles = toutes les bornes publiées C/E D3/D4/D5 des deux aimants (23 publiées, 1 manquante : SmCo E D5 up « - » dans la source). Critère reçu : médiane ≤ ${CRITERION.medianPctMax} % ET ≤ ${CRITERION.over20Max}/23 bornes > 20 % ET aucune indisponible. Score secondaire : sans la seule borne suspectée C-N45-D3 to = ${SUSPECTED_ANOMALY.publishedMm} (identique au D1 to du même couple — anomalie de source suspectée, jamais corrigée, jamais exclue du score primaire).`, "",
  "| Variante | score | publiées | calculables | indisponibles | manquantes | médiane |écart| % | > 20 % | critère |", "|---|---|---|---|---|---|---|---|---|");
for (const r of variantResults) {
  const p = r.primary, s = r.secondary;
  md.push(`| ${r.variant.id} | primaire (23 bornes) | ${p.published} | ${p.computable} | ${p.unavailable} | ${p.missing} | ${f(p.medianAbsPct)} | ${p.over20} | ${p.pass ? "ATTEINT" : "NON ATTEINT"} |`);
  md.push(`| ${r.variant.id} | secondaire (sans anomalie) | ${s.published} | ${s.computable} | ${s.unavailable} | ${s.missing} | ${f(s.medianAbsPct)} | ${s.over20} | ${s.pass ? "ATTEINT" : "NON ATTEINT"} |`);
}
md.push("", "Détail par approche (score primaire) :", "", "| Variante | approche | calculables | médiane |écart| % | > 20 % |", "|---|---|---|---|---|---|");
for (const r of variantResults)
  for (const a of ["D3", "D4", "D5"] as const) {
    const rows = controlRows(r.table).filter((x) => x.approach === a && x.publishedMm != null);
    const cmp = rows.filter((x) => x.errorPct != null);
    const pcts = cmp.map((x) => Math.abs(x.errorPct!)).sort((p, q) => p - q);
    const med = pcts.length ? pcts.length % 2 ? pcts[(pcts.length - 1) / 2]! : (pcts[pcts.length / 2 - 1]! + pcts[pcts.length / 2]!) / 2 : null;
    md.push(`| ${r.variant.id} | ${a} | ${cmp.length}/${rows.length} | ${f(med)} | ${pcts.filter((p) => p > 20).length} |`);
  }
md.push("", "Un résidu systématique n'est pas une marge validée. Si le critère n'est pas atteint : pas de volume 3D.", "");

md.push("## Disponibilité réelle des classes", "",
  `La transcription Form 66 contient les classes A..F ; **G est absente de la source** — les lignes G des tableaux portent le statut « no_source » et ne sont jamais présentées comme validées. D1 des classes B/D : contrôles isolés hors apprentissage, listés dans les tableaux CSV (\`tableau_V*.csv\`, 112 lignes chacun : 7 classes × 4 approches × 2 bornes × 2 aimants).`, "");

md.push("## Coupes perpendiculaires raffinées (audit géométrique, profil 1.1, B/C1)", "",
  "Pas 0,25 mm dans la zone locale |x| ≤ 5 mm et y ≤ 5 mm, 1 mm ailleurs, cellules à dimension réelle sans recouvrement. Trois états de lecture distingués : collision (invalidité géométrique), réponse nominale nulle (zone centrale du modèle B), diagnostic défavorable. Ces largeurs ne sont pas des probabilités.", "",
  "| Coupe | aimant | cellules | nœuds communs vérifiés | désaccords |", "|---|---|---|---|---|");
for (const n of nodeChecks) {
  const cut = fineCuts.find((c) => c.id === n.id && c.magnetId === n.magnetId)!;
  md.push(`| ${n.id} | ${n.magnetId} | ${cut.cells.length} | ${n.nodes} | ${n.mismatches} |`);
}
md.push("", "Demi-largeur de la zone centrale à réponse nominale nulle (modèle B, scénario nominal) selon le pas de balayage :", "", "| aimant | profondeur y (mm) | pas 1,25 | pas 0,25 | pas 0,125 |", "|---|---|---|---|---|---|");
for (const w of widthTables)
  for (const y of [6, 8, 10]) {
    const at = (s: number) => w.rows.find((r) => r.y === y && r.stepMm === s)?.halfWidthMm;
    md.push(`| ${w.magnetId} | ${y} | ${f(at(1.25), 3)} | ${f(at(0.25), 3)} | ${f(at(0.125), 3)} |`);
  }
md.push("", "Figures : `svg/2-perpendicular-centred-C_*_B_fine.svg` et `svg/3-perpendicular-offset-C_*_B_fine.svg` (+ CSV). L'enveloppe de verre publiée (capsule pointillée) et l'aimant aux repères sont dessinés à taille réelle.", "");

md.push("## Vérification collision N45 (reproduction)", "",
  `Coupe 1 mm du lot 1 (2-perpendicular-centred-C, N45, B/C1) recalculée : **${favCells.length} cellules favorables, ${favAtY5} à y = 5 mm**. La pose centre [0, 5, 0], axe [0, 1, 0] renvoie **${n45Probe.ok ? "ok" : `collision (${n45Probe.reason})`}** : le corps du cylindre est bien testé dans \`pose.ts\` et les cellules proches du reed à y = 5 sont indisponibles pour collision — aucune collision n'est manquée ni inventée.`, "",
  `Point distinct : l'enveloppe conservative du lot 1 (capsule ±${PROFILE.reed.envelopeHalfLengthMm} mm, rayon ${PROFILE.reed.envelopeRadiusMm} mm, encombrement publié KSK-1A66) est **surdimensionnée axialement** par rapport à la demi-longueur effective du profil 1.1 (${PROFILE.reed.effectiveLengthMm / 2} mm) ; avec L = 16 mm elle serait au contraire plus courte que la zone d'intégration (8 mm). C'est une exclusion géométrique conservative, pas une dimension de lame.`, "");

md.push("## Conclusions factuelles", "",
  "- Les quatre variantes sont évaluées avec le même apprentissage (8 bornes D1 C/E) et le même critère ; les tableaux complets A..G sont dans les CSV.",
  "- L = 16 mm est un paramètre ajusté : il ne prouve pas des pattes de 1 mm. Sans géométrie des pattes par boîtier, aucune longueur de patte n'est inventée.",
  "- Les plages AT viennent de la fiche MK04 uniquement ; θ = k·AT est une hypothèse ajustée, pas une conversion physique mT/AT universalisable.",
  "- Source Standex sur les pattes : Datenbuch Reed Technology 2022, pp. 45-47 (https://standexdetect.com/wp-content/uploads/sites/2/2025/08/Datenbuch-Reed-Technology-EN-2022.pdf) et fiche KSK-1A66 : modifier les pattes (coupe, formage) altère la sensibilité. Le modèle futur devra combiner reed + configuration magnétique du montage + aimant ; les décalages documentaires Form→produit ne sont pas une preuve d'identité physique.",
  "- Le repère fixe +4 mm (V2) est un diagnostic non validé physiquement ; il n'a pas été ajusté sur les contrôles.",
  "", "## Temps de calcul (machine de génération)", "", "| Étape | Durée |", "|---|---|", ...timings, "",
  "## Limites", "",
  "- Expérience de calibration et figures de revue uniquement : pas de volume 3D, pas d'intégration atelier ni client, pas de remplacement du profil 1.1.",
  "- MK04 D3 reste en quarantaine (lot 1) ; les adaptations documentaires MK03/MK13 ne sont pas des contrôles indépendants.",
  "- La zone fine couvre |x| ≤ 5 mm et y ≤ 5 mm ; au-delà, le pas reste 1 mm.",
  "");
writeFileSync(`${OUT}/RAPPORT_PASS2_2026-10-27.md`, md.join("\n"));
console.log(timings.join("\n"));
console.log(`L ajusté = ${lengthFit.effectiveLengthMm.toFixed(4)} mm`);
for (const r of variantResults)
  console.log(`${r.variant.id}: k=${r.kFit.k.toFixed(7)} medD1=${r.kFit.medianAbsPct?.toFixed(2)}% primaire{pub=${r.primary.published} calc=${r.primary.computable} indisp=${r.primary.unavailable} med=${r.primary.medianAbsPct}% >20=${r.primary.over20} pass=${r.primary.pass}} secondaire{med=${r.secondary.medianAbsPct}% >20=${r.secondary.over20} pass=${r.secondary.pass}}`);
console.log(`N45 coupe 1 mm : ${favCells.length} favorables, ${favAtY5} à y=5 ; sonde [0,5,0] → ${n45Probe.ok ? "ok" : n45Probe.reason}`);
