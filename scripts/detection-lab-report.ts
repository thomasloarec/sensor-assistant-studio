/** Régénère le rapport de cohérence du laboratoire de détection reed.
 *   bun scripts/detection-lab-report.ts
 * Sorties : docs/detection-lab/ (Markdown, CSV, JSON, SVG). Tout vient du noyau pur. */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { buildCalibrations, buildPilotTable, summarize, calKey, type Calibrations } from "../src/lib/detection-lab/pilot";
import { CUT_IDS, computeCutById, type Cut } from "../src/lib/detection-lab/classify";
import { PILOT_MAGNETS } from "../src/lib/detection-lab/magnets";
import { PROFILE, MU0, type DistanceConvention, type ResponseModel } from "../src/lib/detection-lab/profile";
import { distanceFor } from "../src/lib/detection-lab/calibration";
import { evaluatePose } from "../src/lib/detection-lab/pose";
import { cylinderField, cylinderAxialMt, dipoleFieldMt } from "../src/lib/detection-lab/field";
import { buildReportJson, paletteFromCss, cutToSvg, cutToCsv, tableToCsv, provenance, CATEGORY_LABEL } from "../src/lib/detection-lab/report";

const OUT = "docs/detection-lab";
mkdirSync(`${OUT}/svg`, { recursive: true });
const sha = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");
const f = (v: number | null | undefined, n = 2) => (v == null ? "—" : v.toFixed(n));
const PALETTE = paletteFromCss(readFileSync("src/styles.css", "utf8")); // jetons de charte
const md: string[] = [];
const timings: string[] = [];
const time = <T,>(label: string, fn: () => T): T => { const t = performance.now(); const r = fn(); timings.push(`| ${label} | ${Math.round(performance.now() - t)} ms |`); return r; };

const combos: [ResponseModel, DistanceConvention][] = [["A", "C1"], ["B", "C1"], ["A", "C2"], ["B", "C2"]];
const cals = new Map<string, Calibrations>();
const tables = new Map<string, ReturnType<typeof buildPilotTable>>();
for (const [m, c] of combos) {
  const cal = time(`Seuils partagés ${m}/${c}`, () => buildCalibrations(m, c));
  cals.set(m + c, cal);
  tables.set(m + c, time(`Tableau pilote ${m}/${c}`, () => buildPilotTable(m, c, cal)));
}
const cuts: Cut[] = [];
for (const model of ["A", "B"] as const)
  for (const mag of PILOT_MAGNETS)
    for (const id of CUT_IDS) {
      const cut = time(`Coupe ${id} ${mag.id} ${model}/C1`, () => computeCutById(id, mag, model, "C1", cals.get(model + "C1")!));
      cuts.push(cut);
      const base = `${OUT}/svg/${id}_${mag.id}_${model}`;
      writeFileSync(`${base}.svg`, cutToSvg(cut, PALETTE));
      writeFileSync(`${base}.csv`, cutToCsv(cut));
    }
for (const [m, c] of combos) {
  writeFileSync(`${OUT}/tableau_${m}_${c}.csv`, tableToCsv(tables.get(m + c)!));
  writeFileSync(`${OUT}/rapport_${m}_${c}.json`, JSON.stringify(buildReportJson(m, c, cals.get(m + c)!, tables.get(m + c)!, []), null, 1));
}

// Contrôles numériques indépendants
const smco = PILOT_MAGNETS[0]!;
const body = { radiusMm: 2.5, lengthMm: 4, jT: smco.jT, center: [0, 0, 0] as [number, number, number], axis: [0, 0, 1] as [number, number, number] };
const axial = Math.abs(cylinderField(body, [0, 0, 5])[2] - cylinderAxialMt(2.5, 4, smco.jT, 5)) / cylinderAxialMt(2.5, 4, smco.jT, 5);
const far = cylinderField(body, [60, 0, 80]), dip = dipoleFieldMt(smco.momentAm2, [0, 0, 1], [60, 0, 80]);
const farErr = Math.hypot(far[0] - dip[0], far[2] - dip[2]) / Math.hypot(dip[0], dip[2]);
const poseTest = { center: [4, 6, 0] as [number, number, number], axis: [0, 1, 0] as [number, number, number] };
const q12 = evaluatePose(smco, poseTest, PROFILE.scenarios[0]!, "A", 12), q24 = evaluatePose(smco, poseTest, PROFILE.scenarios[0]!, "A", 24);
const quadErr = q12.ok && q24.ok ? Math.abs(q12.response - q24.response) / q24.response : NaN;
const thC = cals.get("AC1")![calKey("C", "up")]!.shared!;
const lobe1 = distanceFor(smco, "D4", thC, "C1", "A", 1), lobe05 = distanceFor(smco, "D4", thC, "C1", "A", 0.5);
const d5conv = PILOT_MAGNETS.flatMap((mg) => (["A", "B"] as const).map((mo) => {
  const th = cals.get(mo + "C1")![calKey("C", "up")]!.shared!;
  const a = distanceFor(mg, "D5", th, "C1", mo, 1), b = distanceFor(mg, "D5", th, "C1", mo, 0.5);
  return `| Maximum de lobe D5 : pas t 1 mm vs 0,5 mm (${mg.id}, C, ${mo}) | ${f(a.ok ? a.value : null, 4)} vs ${f(b.ok ? b.value : null, 4)} mm |`;
}));

md.push(`# Laboratoire de détection reed — rapport de cohérence (pilote)`, "",
  `Généré par \`bun scripts/detection-lab-report.ts\` le ${new Date().toISOString().slice(0, 10)} à partir du noyau \`src/lib/detection-lab/\`. Préversion interne staff. **Ordres de grandeur pédagogiques : aucune garantie de commutation au millimètre, aucun résultat qualifié.**`, "",
  "## Provenance", "",
  `- Transcription Form : \`src/data/detection-lab/brochure-form-rows.json\` (version ${provenance().form.version}, SHA256 fichier \`${sha("src/data/detection-lab/brochure-form-rows.json")}\`) — 96 lignes = 384 plages (768 bornes), pas 384 mesures indépendantes. Aucune correction.`,
  `- PDF : ${provenance().form.pdf.url} — SHA256 ${provenance().form.pdf.sha256}.`,
  `- Tableaux commerciaux : \`src/data/studio-v2/activation-guide.json\` (${provenance().commercial.version}, 3 004 entrées, inchangées, non toutes fiables).`,
  `- Classes AT : ${provenance().atClasses}. Disponibilité des lettres non universalisée.`,
  `- ${provenance().brochureBounds}`, `- ${provenance().pullInDropOutPage} Source : ${provenance().pullInDropOut}`, "",
  "Exceptions connues :", ...provenance().exceptions.map((e) => `- ${e}`), "",
  "## Conversion du moment", "",
  "Valeur q en 10⁻⁶ V·s·cm → q·10⁻⁸ Wb·m → m = q·10⁻⁸/μ0 (A·m²), μ0 = 4π·10⁻⁷. V = πr²h (m³), J_eff = μ0·m/V. Aimantation supposée uniforme et rigide (pas de démagnétisation partielle, de perméabilité du reed ni de pièce ferreuse).", "",
  "| Aimant | q | m (A·m²) | V (m³) | J_eff (T) |", "|---|---|---|---|---|",
  ...PILOT_MAGNETS.map((m) => `| ${m.label} | ${m.q} | ${m.momentAm2.toFixed(7)} | ${m.volumeM3.toExponential(4)} | ${m.jT.toFixed(4)} |`), "",
  `μ0 = ${MU0.toExponential(9)}.`, "",
  "## Moteur", "",
  "Cylindre fini à aimantation axiale, solution analytique exacte (nappe de courant équivalente, Derby & Olbert 2010, intégrale elliptique de Bulirsch). Intérieur de l'aimant et collision avec l'enveloppe de verre exclus. Réponse calculée par quadrature de Gauss-Legendre sur chaque lame.", "",
  "| Contrôle | Résultat |", "|---|---|",
  `| Axe : formule fermée vs analytique (z = 5 mm) | écart relatif ${axial.toExponential(2)} |`,
  `| Limite lointaine vs dipôle (r = 100 mm) | écart relatif ${farErr.toExponential(2)} |`,
  `| Quadrature 12 vs 24 points/lame (pose test) | écart relatif ${quadErr.toExponential(2)} |`,
  `| Maximum de lobe D4 : pas x 1 mm vs 0,5 mm (SmCo, C, A) | ${f(lobe1.ok ? lobe1.value : null, 4)} vs ${f(lobe05.ok ? lobe05.value : null, 4)} mm |`,
  ...d5conv,
  `| Bissection des racines | tolérance ${PROFILE.search.bisectTolMm} mm ; section dorée ${PROFILE.search.goldenTolMm} mm |`, "",
  "## Profil d'hypothèses", "", `\`${PROFILE.id}\` v${PROFILE.version} figé le ${PROFILE.frozenOn}.`, "",
  `- H-L1 longueur effective nominale ${PROFILE.reed.effectiveLengthMm} mm (hypothèse, non publiée). Exclusion géométrique conservative distincte = encombrement publié KSK-1A66 14,0 mm max × Ø 2,2 mm (rayon ${PROFILE.reed.envelopeRadiusMm} mm, demi-longueur ${PROFILE.reed.envelopeHalfLengthMm} mm), source ${PROFILE.reed.envelopeSource}. Boîtiers et montages non qualifiés.`,
  `- Scénarios déterministes (un facteur à la fois + nominal, ${PROFILE.scenarios.length} au total, identiques sur tout un parcours) : ${PROFILE.scenarios.map((s) => s.id).join(", ")}. Position interne : déplacements ±1 mm selon x (axe des lames) et ±1 mm selon y (normale d'approche) — l'ensemble effectivement échantillonné n'est PAS le pavé continu.`,
  `- Retrait de frontière : favorable si tous les scénarios ≥ θ_up·(1+${PROFILE.classification.boundaryMargin}) ; défavorable si tous ≤ θ_to·(1−${PROFILE.classification.boundaryMargin}) ; sinon variable. Aucun pourcentage de confiance.`,
  `- Les seuils sont calibrés sur le seul scénario nominal ; les scénarios font varier la physique à seuil fixe.`, "",
  "Conventions :", `- C1 (retenue) : ${PROFILE.conventions.C1}`, `- C2 (variante d'audit) : ${PROFILE.conventions.C2}`, "",
  "Approches :", ...Object.entries(PROFILE.approaches).map(([k, v]) => `- ${k} : ${v}`), "",
  "Modèles :", `- ${PROFILE.models.A}`, `- ${PROFILE.models.B}`, "");

md.push("## Seuils implicites, désaccord, seuil partagé et prédictions croisées", "",
  "Un seuil par reed 66 + classe + modèle + convention et par borne, PARTAGÉ entre les deux aimants (et les boîtiers via l'adaptation documentaire). Ajustement conjoint identifié : moindres carrés sur les distances D1 Form des deux aimants. Aucun facteur par aimant ni par D.", "",
  "| Modèle | Conv. | Classe | Borne | θ SmCo (mT) | θ N45 (mT) | désaccord | θ partagé | D1 SmCo ajusté / publié | D1 N45 ajusté / publié | SmCo→N45 | N45→SmCo |", "|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const [m, c] of combos)
  for (const s of Object.values(cals.get(m + c)!)) {
    const pubS = s.cross.find((x) => x.toMagnet === "SMCO5-5X4")!.publishedMm, pubN = s.cross.find((x) => x.toMagnet === "N45-4X19")!.publishedMm;
    const sn = s.cross.find((x) => x.fromMagnet === "SMCO5-5X4")!, ns = s.cross.find((x) => x.fromMagnet === "N45-4X19")!;
    md.push(`| ${m} | ${c} | ${s.className} | ${s.bound} | ${f(s.implied["SMCO5-5X4"], 3)} | ${f(s.implied["N45-4X19"], 3)} | ×${f(s.disagreement)} | ${f(s.shared, 3)} | ${f(s.fitted["SMCO5-5X4"])} / ${pubS} | ${f(s.fitted["N45-4X19"])} / ${pubN} | ${f(sn.predictedMm)} / ${sn.publishedMm} | ${f(ns.predictedMm)} / ${ns.publishedMm} |`);
  }
md.push("", "Lecture : un désaccord ×1,4 à ×1,6 (C1) ou ×2,1 à ×2,7 (C2) entre les seuils implicites des deux aimants signifie que le modèle ne reproduit pas, avec un seul seuil, le rapport des distances publiées. Il est affiché, pas compensé.", "");

const GL: Record<string, string> = { training: "apprentissage D1 Form", form_control: "contrôles hors apprentissage D3/D4/D5 Form", doc_adaptation: "adaptations documentaires MK03/MK13 (copies décalées, non indépendantes)", quarantine: "quarantaine MK04" };
md.push("## Bilan par groupe, modèle et convention", "", "Seuls les contrôles D3/D4/D5 Form sont hors apprentissage. Les adaptations MK03/MK13 (dont leurs D1, dérivés du D1 d'apprentissage) ne sont PAS des validations physiques indépendantes : elles sont listées à part et n'entrent pas dans la comparaison A/B. Les prédictions croisées (tableau précédent) sont des contrôles séparés.", "",
  "| Modèle | Conv. | groupe | lignes | publiées | absentes | estimées | indisponibles | écart abs. moyen (mm) | médiane écart abs. % | > 20 % / estimées |", "|---|---|---|---|---|---|---|---|---|---|---|");
for (const [m, c] of combos) {
  const s = summarize(tables.get(m + c)!);
  for (const [g, x] of Object.entries(s.groups)) md.push(`| ${m} | ${c} | ${GL[g]} | ${x.rows} | ${x.published} | ${x.missing} | ${x.estimated} | ${x.unavailable} | ${f(x.meanAbsMm)} | ${f(x.medianAbsPct)} | ${x.over20} / ${x.estimated} |`);
}
md.push("", "A et B restent **candidats non départagés** ; la comparaison ne porte que sur les contrôles D3/D4/D5 Form et les prédictions croisées, avec leurs dénominateurs. Aucune correction n'a été appliquée pour franchir un seuil de 20 %. A et B donnent le même D1 centré par symétrie.", "");

for (const [m, c] of combos) {
  md.push(`## Tableau complet — modèle ${m}, convention ${c}`, "", "| source | page | référence | aimant | cl. | D | borne | publié | estimé | écart mm | écart % | groupe | statut | anomalies | θ partagé |", "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const r of tables.get(m + c)!)
    md.push(`| ${r.source} | ${r.page} | ${r.reference} | ${r.magnet} | ${r.className} | ${r.approach} | ${r.bound} | ${r.published ?? "—"} | ${f(r.estimated, 3)} | ${f(r.errorMm, 3)} | ${f(r.errorPct, 1)} | ${r.group} | ${r.status} | ${r.anomalies.join(" ; ") || "—"} | ${f(r.sharedThreshold, 3)} |`);
  md.push("");
}

md.push("## Six coupes (générées par le noyau)", "", "Grille 1 mm, x ∈ [−24, 24], y ∈ [0, 24] (centre de l'aimant, plan z = 0). Mêmes axes et échelle pour toutes les coupes ; coupe 5 directement comparable à la coupe 1.", "");
for (const cut of cuts.filter((c) => c.model === "B" || c.model === "A")) {
  const cnt: Record<string, number> = {};
  cut.cells.forEach((x) => { const k = x.category + (x.cause ? `/${x.cause}` : ""); cnt[k] = (cnt[k] ?? 0) + 1; });
  md.push(`### ${cut.id} — ${cut.magnetId} — modèle ${cut.model}`, "", `![${cut.title}](svg/${cut.id}_${cut.magnetId}_${cut.model}.svg)`, "",
    `Cellules : ${Object.entries(cnt).map(([k, v]) => `${k} ${v}`).join(", ")}. ${cut.marks.map((mk) => `Repère « ${mk.label} » : ${CATEGORY_LABEL[mk.category]}${mk.cause ? ` (${mk.cause})` : ""}.`).join(" ")}${cut.path ? ` Trajet y = ${cut.path.points[0]!.y} mm : ${cut.path.segments.map((s) => `[${cut.path!.points[s.from]!.x}…${cut.path!.points[s.to]!.x}] ${s.category}`).join(", ")}.` : ""} Calcul : ${cut.computeMs} ms.`, "");
}
md.push("## Temps de calcul (machine de génération)", "", "| Étape | Durée |", "|---|---|", ...timings, "",
  "## Limites", "",
  "- Datums D1/D3 ambigus dans la source ; D4 (H-D4) est une hypothèse ; D5 suit le schéma source tourné rigidement (aimant ⟂ lames, approche par l'extrémité, maximum de lobe sur t ≥ 0).",
  "- Longueur effective et réponse de lame sont des hypothèses ; l'exclusion suit l'encombrement publié KSK-1A66 ; aucun paramètre de lame n'est qualifié.",
  "- Les produits MK03/MK13 sont estimés par adaptation documentaire (décalages empiriques par borne) : ce ne sont pas des contrôles indépendants.",
  "- Le diagnostic « trop loin » / « orientation » est contrefactuel et limité aux essais autorisés (rotation ±90° autour de z, rapprochement en y sans collision) ; sinon la cause reste non déterminée.",
  "- MK04 D3 en quarantaine : aucune estimation n'est produite.",
  "- Pas de volume 3D dans ce lot. Pas d'intégration atelier ni client.", "");
writeFileSync(`${OUT}/RAPPORT_COHERENCE_2026-10-26.md`, md.join("\n"));
console.log(timings.join("\n"));
