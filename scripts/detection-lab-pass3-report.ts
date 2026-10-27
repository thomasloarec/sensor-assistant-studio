/** Régénère le rapport de l'expérience de calibration PASS 3 (revue, base 5e06d4c).
 *   bun scripts/detection-lab-pass3-report.ts
 * Sorties : docs/detection-lab-pass3/ (Markdown FR, 6 CSV de 112 lignes, JSON,
 * SVG des écarts signés). Tout vient du noyau pur ; le profil 1.1, le lot 2 et
 * l'interface ne sont pas modifiés. Validation RÉTROSPECTIVE : ancres choisies
 * après lecture des données, pas un test indépendant nouveau. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { PROFILE } from "../src/lib/detection-lab/profile";
import { paletteFromCss } from "../src/lib/detection-lab/report";
import { AT_SOURCE, fitLength } from "../src/lib/detection-lab/pass2";
import {
  D4_ANCHOR, DATUM_ANCHOR, PASS3_CRITERION, PASS3_VARIANTS, PASS3_VERSION,
  pass3ControlRows, runPass3Variant, signedErrorsSvg, type Pass3Result, type Pass3Row, type Pass3Score,
} from "../src/lib/detection-lab/pass3";

const OUT = "docs/detection-lab-pass3";
mkdirSync(`${OUT}/svg`, { recursive: true });
const sha = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");
const f = (v: number | null | undefined, n = 2) => (v == null ? "—" : v.toFixed(n));
const PALETTE = paletteFromCss(readFileSync("src/styles.css", "utf8"));
const md: string[] = [];
const timings: string[] = [];
const time = <T,>(label: string, fn: () => T): T => { const t = performance.now(); const r = fn(); timings.push(`| ${label} | ${Math.round(performance.now() - t)} ms |`); return r; };

const MODEL = "B" as const, CONV = "C1" as const;

// --- Ajustements : k et L du lot 2 (apprentissage D1 C/E), ancres pass 3 ---
const lengthFit = time("Ajustement de L (accord inter-aimants D1, lot 2)", () => fitLength(MODEL, CONV));
const results: Pass3Result[] = PASS3_VARIANTS.map((v) =>
  time(`Variante ${v.id} (fit k, repère, tableau 112, scores)`, () => runPass3Variant(v, MODEL, CONV, lengthFit.effectiveLengthMm)),
);

// --- 6 CSV de 112 lignes ---
const csvCell = (v: unknown) => { const s = v == null ? "" : String(v); return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
for (const r of results) {
  const head = "class,magnet,approach,bound,at,theta_mT,published_mm,estimated_raw_mm,estimated_mm,error_mm,error_pct,status,notes";
  const lines = r.table.map((row: Pass3Row) =>
    [row.className, row.magnetId, row.approach, row.bound, row.at, row.thetaMT, row.publishedMm, row.estimatedRawMm, row.estimatedMm, row.errorMm, row.errorPct, row.status, row.notes.join(" | ")].map(csvCell).join(","),
  );
  writeFileSync(`${OUT}/tableau_${r.variant.id}.csv`, [head, ...lines].join("\n"));
}

// --- JSON ---
writeFileSync(`${OUT}/resultats_pass3.json`, JSON.stringify({
  version: PASS3_VERSION, profile: { id: PROFILE.id, version: PROFILE.version },
  model: MODEL, convention: CONV, atSource: AT_SOURCE, criterion: PASS3_CRITERION,
  anchors: { datum: DATUM_ANCHOR, d4: D4_ANCHOR },
  retrospective: "Ancres choisies après lecture des données : validation rétrospective, pas un test indépendant nouveau.",
  lengthFitMm: lengthFit.effectiveLengthMm,
  variants: results.map((r) => ({
    id: r.variant.id, mode: r.variant.mode, L: r.effectiveLengthMm, k: r.k,
    datumMm: r.datum.datumMm, datumResidualMm: r.datum.residualMm,
    d4DeltaMm: r.d4?.deltaMm ?? null, d4AnchorRawMm: r.d4?.rawMm ?? null,
    scores: r.scores, af: r.af,
  })),
}, null, 1));

// --- SVG des écarts signés (variantes corrigées) ---
for (const r of results.filter((x) => x.variant.mode === "d4corr"))
  writeFileSync(
    `${OUT}/svg/ecarts_signes_${r.variant.id}.svg`,
    signedErrorsSvg(`Écarts signés — ${r.variant.label}`, pass3ControlRows(r.table), PALETTE),
  );

// --- Rapport Markdown ---
const scoreRow = (label: string, s: Pass3Score) =>
  `| ${label} | ${s.passed}/${s.total} | ${s.unavailable} | ${f(s.ratio == null ? null : s.ratio * 100, 1)} % | ${f(s.medianAbsMm, 3)} | ${f(s.maxAbsMm, 3)} | ${s.pass ? "ATTEINT" : "NON ATTEINT"} |`;
const biasRow = (r: Pass3Result) =>
  r.scores.grouped.biases.map((b) => `| ${r.variant.id} | ${b.approach} | ${b.n} | ${f(b.meanMm, 3)} | ${f(b.medianMm, 3)} |`).join("\n");

md.push(`# Laboratoire de détection reed — passe 3 : repère recalé et correction scalaire D4`, "",
  `Généré par \`bun scripts/detection-lab-pass3-report.ts\` le ${new Date().toISOString().slice(0, 10)}. Préversion interne staff. **Validation rétrospective : les ancres ont été choisies après lecture des données — ce n'est pas un test indépendant nouveau. Paramètres ajustés, pas des dimensions prouvées.**`, "",
  "## Proposition testée et provenance", "",
  "- Proposition reçue : modèle B, L = 16 mm ou L ajusté D1 (lot 2), k issu de fitK D1 C/E, repère axial D3/D5 ajusté sur UNE borne Form C — SmCo — D3 — up (publié 7,5 mm).",
  `- Critère révisé, explicite : par borne |erreur| ≤ max(${PASS3_CRITERION.toleranceMm} mm, ${PASS3_CRITERION.tolerancePct} % du publié) ; ≥ ${PASS3_CRITERION.minPassRatio * 100} % des contrôles ; biais signé par approche (moyen ET médian) ≤ ${PASS3_CRITERION.maxAbsBiasMm} mm. Résultats séparés CE / BD et groupés.`,
  "- Diagnostic alternatif : correction SCALAIRE D4 ajustée sur l'unique borne C — SmCo — D4 — up (seconde ancre, choisie après lecture des données). Retrait scalaire dans le tableau : ce n'est PAS un repère de face commun D1/D4 ni une transformation 3D ; changer un repère documentaire ne déplace ni l'aimant ni la réponse dans le monde.",
  "- Diagnostic B′ = √(|M1·M2|) (mêmes signes, sinon 0) sur D4 seul, L/k/repère inchangés : strictement calculé sur les moyennes renvoyées par `evaluatePose`, aucun second calcul de champ, aucune activation dans l'interface. B′ ≥ B point par point : à seuils égaux, B′ ne peut pas raccourcir D4.",
  `- Transcription Form : \`src/data/detection-lab/brochure-form-rows.json\` (SHA256 \`${sha("src/data/detection-lab/brochure-form-rows.json")}\`), inchangée, aucune correction des données brutes.`,
  `- Classes AT : ${AT_SOURCE.title} — ${AT_SOURCE.url} (vérifiée le ${AT_SOURCE.checkedOn}).`,
  "- Physique inchangée : `evaluatePose` reste l'unique entrée physique ; le profil 1.1 et les modules du lot 2 (API comprises) sont intacts.", "",
  "## Ajustements (ancres exclues du contrôle)", "",
  "| Variante | L (mm) | k (mT/AT) | repère axial (mm) | résidu ancre D3 (mm) | retrait D4 δ (mm) |", "|---|---|---|---|---|---|");
for (const r of results)
  md.push(`| ${r.variant.id} | ${f(r.effectiveLengthMm, 6)} | ${f(r.k, 10)} | ${f(r.datum.datumMm, 6)} | ${f(r.datum.residualMm, 4)} | ${r.d4 ? f(r.d4.deltaMm, 6) : "—"} |`);
md.push("",
  `Le repère axial est ajusté sur la seule ancre ${DATUM_ANCHOR.className}-${DATUM_ANCHOR.magnetId}-${DATUM_ANCHOR.approach}-${DATUM_ANCHOR.bound} (publié ${f(results[0]!.datum.publishedMm)} mm) ; la correction D4 sur la seule ancre ${D4_ANCHOR.className}-${D4_ANCHOR.magnetId}-${D4_ANCHOR.approach}-${D4_ANCHOR.bound} (publié ${f(results.find((r) => r.d4)?.d4?.publishedMm)} mm). Ces bornes sont EXCLUES des contrôles : 46 contrôles pour les variantes axial/bprime, 45 pour d4corr.`, "",
  "## Scores — critère révisé", "",
  "Contrôles = bornes publiées des classes B, C, D, E, approches D3/D4/D5, deux aimants, ancres exclues. D1 exclu (apprentissage C/E ; B/D D1 resté un contrôle isolé du lot 2).", "",
  "| Variante | groupe | réussies | indisponibles | taux | médiane \\|écart\\| (mm) | max \\|écart\\| (mm) | critère |", "|---|---|---|---|---|---|---|---|");
for (const r of results) {
  md.push(scoreRow(`${r.variant.id} — CE`, r.scores.ce));
  md.push(scoreRow(`${r.variant.id} — BD`, r.scores.bd));
  md.push(scoreRow(`${r.variant.id} — groupé`, r.scores.grouped));
}
md.push("", "Biais signés par approche (contrôles groupés) :", "", "| Variante | approche | n | biais moyen (mm) | biais médian (mm) |", "|---|---|---|---|---|");
for (const r of results) md.push(biasRow(r));
md.push("");
for (const r of results) {
  if (!r.scores.grouped.failures.length) continue;
  md.push(`Échecs conservés (${r.variant.id}) — aucune exclusion supplémentaire :`, "");
  for (const fl of r.scores.grouped.failures)
    md.push(`- ${fl.className} — ${fl.magnetId} — ${fl.approach} ${fl.bound} : publié ${fl.publishedMm} mm, estimé ${f(fl.estimatedMm, 3)} mm, écart ${f(fl.errorMm, 3)} mm.`);
  md.push("");
}
md.push("## Classes A et F (hors critère) et classe G", "",
  "A/F ne font pas partie du critère (classes hors apprentissage et hors contrôle principal) ; résumé séparé, toutes approches :", "",
  "| Variante | réussies | indisponibles | taux | médiane \\|écart\\| (mm) |", "|---|---|---|---|---|---|".slice(0, -2) + "|");
for (const r of results)
  md.push(`| ${r.variant.id} | ${r.af.passed}/${r.af.total} | ${r.af.unavailable} | ${f(r.af.ratio == null ? null : r.af.ratio * 100, 1)} % | ${f(r.af.medianAbsMm, 3)} |`);
md.push("", "**G est absente de la source** : lignes « no_source », jamais validées. Les 112 lignes de chaque CSV incluent G et les 8 bornes d'apprentissage : ce ne sont PAS 112 contrôles indépendants.", "",
  "## Figures", "",
  "`svg/ecarts_signes_L16-d4corr.svg` et `svg/ecarts_signes_Lfit-d4corr.svg` : écarts signés (estimation − publié) des contrôles, couleur par aimant, rouge hors tolérance. La bande ±1 mm n'est qu'un repère visuel : la tolérance réelle est max(1 mm, 15 % du publié).", "",
  "## Statut et limites", "",
  "- Statut des tables : **« accord brochure calibré B–E sur 2 aimants sous critère révisé »**. Le critère tolère 15 % d'écart et 10 % d'échecs ; 4 maxima de distance ne valident ni une forme volumique ni des rotations intermédiaires. Statuts « 3D validé » et « ±1 mm » INTERDITS. Le modèle 3D reste pédagogique, non qualifié.",
  "- Estimation brute physique, estimation documentaire corrigée et erreur sont des colonnes distinctes des CSV ; aucune valeur corrigée n'est déversée dans le moteur (`evaluatePose`, profil 1.1 et lot 2 inchangés).",
  "- Validation rétrospective sur données déjà inspectées ; toute confirmation exigerait des données non utilisées pour le choix des ancres.",
  "- Les deux échecs N45 D3 (B-up 17,3 mm, C-to 17,7 mm — ce dernier déjà suspecté au lot 2, jamais corrigé) sont conservés et comptés.",
  "- Expérience interne bornée : pas d'UI, pas de volume 3D, pas de publication, pas de branchement atelier/client.", "",
  "## Temps de calcul (machine de génération)", "", "| Étape | Durée |", "|---|---|", ...timings, "");
writeFileSync(`${OUT}/RAPPORT_PASS3_2026-10-27.md`, md.join("\n"));

console.log(timings.join("\n"));
console.log(`L ajusté = ${lengthFit.effectiveLengthMm.toFixed(6)} mm`);
for (const r of results) {
  const g = r.scores.grouped;
  console.log(
    `${r.variant.id}: L=${r.effectiveLengthMm.toFixed(6)} k=${r.k.toFixed(10)} datum=${r.datum.datumMm.toFixed(6)} δD4=${r.d4 ? r.d4.deltaMm.toFixed(6) : "—"} | CE ${r.scores.ce.passed}/${r.scores.ce.total} BD ${r.scores.bd.passed}/${r.scores.bd.total} groupé ${g.passed}/${g.total} (indisp ${g.unavailable}) med=${f(g.medianAbsMm, 3)} max=${f(g.maxAbsMm, 3)} pass=${g.pass} | AF ${r.af.passed}/${r.af.total} indisp ${r.af.unavailable}`,
  );
  for (const b of g.biases) console.log(`  biais ${b.approach}: moyen ${f(b.meanMm, 3)} médian ${f(b.medianMm, 3)} (n=${b.n})`);
  for (const fl of g.failures) console.log(`  échec ${fl.className} ${fl.magnetId} ${fl.approach} ${fl.bound}: publié ${fl.publishedMm} estimé ${fl.estimatedMm.toFixed(3)} écart ${fl.errorMm.toFixed(3)}`);
}
