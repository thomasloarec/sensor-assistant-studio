/** Exports SVG / CSV / JSON / Markdown. Ne fait AUCUN calcul physique :
 * ne lit que des résultats déjà produits par le noyau (coupes, tableau, seuils). */
import { FORM_SOURCE, FORM_VERSION, KNOWN_EXCEPTIONS, DOC_OFFSETS, summarize, type Calibrations, type PilotRow } from "./pilot";
import type { Category, Cause, Cut } from "./classify";
import { PILOT_MAGNETS } from "./magnets";
import { PROFILE, type DistanceConvention, type ResponseModel } from "./profile";
import guide from "@/data/studio-v2/activation-guide.json";

export const LAB_REPORT_VERSION = "reed-lab-report-1.1.0";
export const ACTIVATION_GUIDE_VERSION = (guide as { version: string }).version;
type Tr = (s: string) => string;
const id: Tr = (s) => s;

export const CATEGORY_LABEL: Record<Category, string> = {
  favorable: "Placement favorable",
  variable: "Détection variable",
  unfavorable: "Placement défavorable",
  unavailable: "Estimation indisponible",
};
export const CAUSE_LABEL: Record<Cause, string> = {
  too_far: "Trop loin",
  orientation: "Orientation défavorable",
  undetermined: "Cause non déterminée (décentrage à examiner)",
};
const cls = (c: Category, cause?: Cause) =>
  c === "unfavorable" ? (cause === "orientation" ? "lab-orient" : cause === "undetermined" ? "lab-undet" : "lab-far") : c === "favorable" ? "lab-fav" : c === "variable" ? "lab-var" : "lab-na";
const fill = (c: Category, cause?: Cause) => {
  const k = cls(c, cause);
  return k === "lab-var" ? "url(#lab-hatch)" : k === "lab-orient" ? "url(#lab-dots)" : k === "lab-undet" ? "url(#lab-lines)" : k === "lab-na" ? "url(#lab-cross)" : "";
};
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Palette d'export DÉRIVÉE des jetons de charte (src/styles.css), jamais de valeurs inventées :
 * l'interface la lit via getComputedStyle, le script de rapport l'extrait du fichier de jetons. */
export const LAB_TOKENS = {
  fav: "--signal", var: "--standex-blue-10", far: "--surface-sunken", orient: "--warning-soft",
  undet: "--standex-gray-25", na: "--surface-tint", ink: "--heading",
} as const;
export type LabPalette = Record<keyof typeof LAB_TOKENS, string>;
/** Extrait la palette du PREMIER bloc de jetons (:root clair) d'un texte CSS. */
export function paletteFromCss(css: string): LabPalette {
  const out = {} as LabPalette;
  for (const [k, tok] of Object.entries(LAB_TOKENS) as [keyof LabPalette, string][]) {
    const m = new RegExp(`${tok}:\\s*([^;]+);`).exec(css);
    if (!m) throw new Error(`jeton ${tok} introuvable`);
    out[k] = m[1]!.trim();
  }
  return out;
}
export function paletteFromElement(el: Element): LabPalette {
  const cs = getComputedStyle(el), out = {} as LabPalette;
  for (const [k, tok] of Object.entries(LAB_TOKENS) as [keyof LabPalette, string][]) out[k] = cs.getPropertyValue(tok).trim() || "currentColor";
  return out;
}
const styleFor = (p: LabPalette) => `
.lab-fav{fill:${p.fav}}.lab-var{fill:${p.var}}.lab-far{fill:${p.far}}.lab-orient{fill:${p.orient}}
.lab-undet{fill:${p.undet}}.lab-na{fill:${p.na}}.lab-ink{fill:${p.ink}}
.lab-stroke{stroke:${p.ink};fill:none}.lab-reed{stroke:${p.ink};stroke-width:3}
.lab-text{font:15px sans-serif;fill:${p.ink}}.lab-pattern{stroke:${p.ink};stroke-width:1;opacity:.45}`;

export function cutToSvg(cut: Cut, palette: LabPalette, tr: Tr = id): string {
  const S = 12, L = 56, T = 44;
  const g = cut.grid;
  const W = (g.xMax - g.xMin + g.stepMm) * S, H = (g.yMax - g.yMin + g.stepMm) * S;
  const px = (x: number) => L + (x - g.xMin + g.stepMm / 2) * S;
  const py = (y: number) => T + (g.yMax - y + g.stepMm / 2) * S;
  const parts: string[] = [];
  const timelineH = cut.path ? 56 : 0;
  const total = T + H + 40 + timelineH + 156 + cut.marks.length * 20 + (cut.marks.length ? 8 : 0);
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${L + W + 24} ${total}" width="${L + W + 24}" height="${total}" role="img" aria-label="${esc(tr(cut.title))}">`);
  parts.push(`<style>${styleFor(palette)}</style><defs>
<pattern id="lab-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" class="lab-var"/><line x1="0" y1="0" x2="0" y2="6" class="lab-pattern"/></pattern>
<pattern id="lab-dots" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" class="lab-orient"/><circle cx="3" cy="3" r="1.2" class="lab-ink" opacity=".55"/></pattern>
<pattern id="lab-lines" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" class="lab-undet"/><line x1="0" y1="3" x2="6" y2="3" class="lab-pattern"/></pattern>
<pattern id="lab-cross" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" class="lab-na"/><path d="M0 0L6 6M6 0L0 6" class="lab-pattern"/></pattern>
</defs>`);
  parts.push(`<text x="${L}" y="20" class="lab-text" font-weight="700">${esc(tr(cut.title))} · ${esc(cut.magnetId)} · ${tr("modèle")} ${cut.model} · ${cut.convention}</text>`);
  for (const c of cut.cells) {
    const f = fill(c.category, c.cause);
    parts.push(`<rect x="${px(c.x) - S / 2}" y="${py(c.y) - S / 2}" width="${S}" height="${S}" class="${cls(c.category, c.cause)}"${f ? ` style="fill:${f}"` : ""}/>`);
  }
  // Axes en mm, graduations entières tous les 4 mm (pas de précision au centième).
  parts.push(`<rect x="${L}" y="${T}" width="${W}" height="${H}" class="lab-stroke"/>`);
  for (let x = Math.ceil(g.xMin / 4) * 4; x <= g.xMax; x += 4)
    parts.push(`<text x="${px(x)}" y="${T + H + 16}" class="lab-text" text-anchor="middle">${x}</text>`);
  for (let y = Math.ceil(g.yMin / 4) * 4; y <= g.yMax; y += 4)
    parts.push(`<text x="${L - 8}" y="${py(y) + 4}" class="lab-text" text-anchor="end">${y}</text>`);
  parts.push(`<text x="${L + W / 2}" y="${T + H + 34}" class="lab-text" text-anchor="middle">${esc(tr("x le long des lames (mm)"))}</text>`);
  parts.push(`<text x="14" y="${T + H / 2}" class="lab-text" transform="rotate(-90 14 ${T + H / 2})" text-anchor="middle">${esc(tr("y centre de l'aimant (mm)"))}</text>`);
  const half = PROFILE.reed.effectiveLengthMm / 2;
  parts.push(`<line x1="${px(-half)}" y1="${py(0)}" x2="${px(half)}" y2="${py(0)}" class="lab-reed"/>`);
  parts.push(`<text x="${px(half) + 6}" y="${py(0) - 6}" class="lab-text">${esc(tr("reed (longueur effective)"))}</text>`);
  // Glyphe d'aimant : orientation projetée, pôle N du côté +axe.
  const glyph = (x: number, y: number, label?: string) => {
    const [ax, ay] = cut.axis, n = Math.hypot(ax, ay) || 1, ux = ax / n, uy = -ay / n, len = 18;
    parts.push(`<line x1="${x - ux * len}" y1="${y - uy * len}" x2="${x + ux * len}" y2="${y + uy * len}" class="lab-stroke" stroke-width="5"/>`);
    parts.push(`<text x="${x + ux * (len + 8)}" y="${y + uy * (len + 8) + 4}" class="lab-text" text-anchor="middle" font-weight="700">N</text>`);
    parts.push(`<text x="${x - ux * (len + 8)}" y="${y - uy * (len + 8) + 4}" class="lab-text" text-anchor="middle" font-weight="700">S</text>`);
    if (label) parts.push(`<text x="${x - 34}" y="${y + 4}" class="lab-text" text-anchor="end">${esc(label)}</text>`);
  };
  glyph(L + W - 40, T + 30, tr("aimant"));
  cut.marks.forEach((m, i) => {
    parts.push(`<circle cx="${px(m.pose.center[0])}" cy="${py(m.pose.center[1])}" r="7" class="lab-stroke" stroke-width="3"/>`);
    parts.push(`<text x="${px(m.pose.center[0])}" y="${py(m.pose.center[1]) - 12}" class="lab-text" text-anchor="middle" font-weight="700">${i + 1}</text>`);
  });
  let yy = T + H + 48;
  cut.marks.forEach((m, i) => {
    parts.push(`<text x="${L}" y="${yy + 2}" class="lab-text">${i + 1}. ${esc(tr(m.label))} — ${esc(tr(CATEGORY_LABEL[m.category]))}${m.cause ? " — " + esc(tr(CAUSE_LABEL[m.cause])) : ""}</text>`);
    yy += 20;
  });
  if (cut.marks.length) yy += 8;
  if (cut.path) {
    const pts = cut.path.points;
    parts.push(`<polyline points="${pts.map((p) => `${px(p.x)},${py(p.y)}`).join(" ")}" class="lab-stroke" stroke-width="2" stroke-dasharray="4 3"/>`);
    pts.forEach((p) => parts.push(`<circle cx="${px(p.x)}" cy="${py(p.y)}" r="3" class="${cls(p.category, p.cause)}" stroke="${palette.ink}" stroke-width="1"/>`));
    parts.push(`<text x="${L}" y="${yy + 2}" class="lab-text">${esc(tr("Chronologie des catégories le long du trajet (sans hystérésis)"))}</text>`);
    const step = W / pts.length;
    pts.forEach((p, i) => {
      const f = fill(p.category, p.cause);
      parts.push(`<rect x="${L + i * step}" y="${yy + 10}" width="${step}" height="20" class="${cls(p.category, p.cause)}"${f ? ` style="fill:${f}"` : ""}/>`);
    });
    cut.path.segments.forEach((s) => parts.push(`<line x1="${L + s.from * step}" y1="${yy + 8}" x2="${L + s.from * step}" y2="${yy + 32}" class="lab-stroke"/>`));
    yy += timelineH;
  }
  const legend: [Category, Cause | undefined, string][] = [
    ["favorable", undefined, CATEGORY_LABEL.favorable],
    ["variable", undefined, CATEGORY_LABEL.variable],
    ["unfavorable", "too_far", `${CATEGORY_LABEL.unfavorable} — ${CAUSE_LABEL.too_far}`],
    ["unfavorable", "orientation", `${CATEGORY_LABEL.unfavorable} — ${CAUSE_LABEL.orientation}`],
    ["unfavorable", "undetermined", `${CATEGORY_LABEL.unfavorable} — ${CAUSE_LABEL.undetermined}`],
    ["unavailable", undefined, CATEGORY_LABEL.unavailable],
  ];
  legend.forEach(([c, cause, label], i) => {
    const f = fill(c, cause), ly = yy + i * 20;
    parts.push(`<rect x="${L}" y="${ly}" width="14" height="14" class="${cls(c, cause)}"${f ? ` style="fill:${f}"` : ""}/><rect x="${L}" y="${ly}" width="14" height="14" class="lab-stroke"/>`);
    parts.push(`<text x="${L + 22}" y="${ly + 12}" class="lab-text">${esc(tr(CATEGORY_LABEL[c]) + (cause ? " — " + tr(CAUSE_LABEL[cause]) : ""))}</text>`);
    void label;
  });
  parts.push(`<text x="${L}" y="${yy + 128}" class="lab-text">${esc(tr("Ordres de grandeur pédagogiques, jamais une garantie de commutation."))} ${PROFILE.id} v${PROFILE.version}</text>`);
  parts.push(`</svg>`);
  return parts.join("\n");
}

const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export function cutToCsv(cut: Cut): string {
  const head = `# ${cut.id};${cut.magnetId};model ${cut.model};${cut.convention};class ${cut.className};${PROFILE.id} v${PROFILE.version}`;
  const rows = cut.cells.map((c) => [c.x, c.y, c.category, c.cause ?? "", c.ratio == null ? "" : c.ratio.toFixed(4)].join(","));
  const path = cut.path ? ["", "path_x,path_y,category,cause", ...cut.path.points.map((p) => [p.x, p.y, p.category, p.cause ?? ""].join(","))] : [];
  return [head, "x_mm,y_mm,category,cause,nominal_response_over_up_threshold", ...rows, ...path].join("\n");
}
export function cutToJson(cut: Cut): string {
  return JSON.stringify({ reportVersion: LAB_REPORT_VERSION, profile: PROFILE, cut }, null, 1);
}

export const TABLE_COLUMNS = ["source", "page", "reference", "magnet", "class", "D", "bound", "raw", "published_mm", "estimated_mm", "error_mm", "error_pct", "group", "status", "anomalies", "convention", "model", "shared_threshold_mT"] as const;
export function tableToCsv(rows: PilotRow[]): string {
  return [TABLE_COLUMNS.join(","), ...rows.map((r) => [r.source, r.page, r.reference, r.magnet, r.className, r.approach, r.bound, r.raw, r.published, r.estimated, r.errorMm, r.errorPct, r.group, r.status, r.anomalies.join(" | "), r.convention, r.model, r.sharedThreshold].map(csvCell).join(","))].join("\n");
}

export function provenance() {
  return {
    reportVersion: LAB_REPORT_VERSION,
    profile: { id: PROFILE.id, version: PROFILE.version, frozenOn: PROFILE.frozenOn },
    form: { file: "src/data/detection-lab/brochure-form-rows.json", version: FORM_VERSION, pdf: FORM_SOURCE },
    commercial: { file: "src/data/studio-v2/activation-guide.json", version: ACTIVATION_GUIDE_VERSION },
    atClasses: "https://standexdetect.com/wp-content/uploads/sites/2/2025/09/datasheet-reed-sensor-series-mk04.pdf p2 (A5-10 … G35-40 AT, MK04 uniquement)",
    brochureBounds: "Brochure : plage d'activation associée à la classe de sensibilité (up = moins sensible, to = plus sensible). Ce n'est pas une hystérésis et cela ne fournit ni distribution gaussienne ni probabilité.",
    pullInDropOutPage: "Page web : pull-in et drop-out sont des transitions distinctes, distances typiques pour des aimants appairés spécifiques, sans transposition automatique vers un autre aimant.",
    pullInDropOut: "https://standexdetect.com/resources/reed-technology-academy/reed-sensor-activation-distances/",
    docOffsets: DOC_OFFSETS,
    exceptions: KNOWN_EXCEPTIONS,
    magnets: PILOT_MAGNETS,
  };
}

export function buildReportJson(model: ResponseModel, conv: DistanceConvention, cal: Calibrations, rows: PilotRow[], cuts: Cut[] = []) {
  return { ...provenance(), model, convention: conv, profileFull: PROFILE, calibrations: cal, summary: summarize(rows), table: rows, cuts };
}
