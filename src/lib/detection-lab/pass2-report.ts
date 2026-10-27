/** Exports SVG / CSV des coupes raffinées du lot 2. AUCUN calcul physique :
 * ne lit que des FineCut déjà produits. Cellules dessinées à leur dimension
 * RÉELLE (0,25 mm ou 1 mm), corps réels repérés (enveloppe du reed, aimant aux
 * repères). Module pur : chaînes de caractères seulement, aucun DOM. */
import { CATEGORY_LABEL, CAUSE_LABEL, paletteFromCss, wrapSvgText, type LabPalette } from "./report";
import type { PilotMagnet } from "./magnets";
import { PROFILE } from "./profile";
import { PASS2_VERSION } from "./pass2";
import type { FineCut, Reading } from "./pass2-cuts";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const READING_LABEL: Record<Reading, string> = {
  favorable: CATEGORY_LABEL.favorable,
  variable: CATEGORY_LABEL.variable,
  unfavorable: CATEGORY_LABEL.unfavorable,
  unavailable: "Estimation indisponible (hors collision)",
  collision: "Collision avec l'enveloppe de verre (invalidité géométrique)",
  reponse_nulle: "Réponse nominale nulle (zone centrale, modèle B)",
};

const cls = (c: string, cause?: string) =>
  c === "unfavorable" ? (cause === "orientation" ? "lab-orient" : cause === "undetermined" ? "lab-undet" : "lab-far")
  : c === "favorable" ? "lab-fav" : c === "variable" ? "lab-var" : c === "collision" ? "lab-undet" : c === "reponse_nulle" ? "lab-na" : "lab-na";
const fillFor = (c: string, cause?: string) => {
  const k = cls(c, cause);
  return k === "lab-var" ? "url(#lab-hatch)" : k === "lab-orient" ? "url(#lab-dots)" : k === "lab-undet" ? "url(#lab-lines)" : k === "lab-na" ? "url(#lab-cross)" : "";
};
const styleFor = (p: LabPalette) => `
.lab-fav{fill:${p.fav}}.lab-var{fill:${p.var}}.lab-far{fill:${p.far}}.lab-orient{fill:${p.orient}}
.lab-undet{fill:${p.undet}}.lab-na{fill:${p.na}}.lab-ink{fill:${p.ink}}
.lab-stroke{stroke:${p.ink};fill:none}.lab-reed{stroke:${p.ink};stroke-width:2;fill:none}
.lab-text{font:15px sans-serif;fill:${p.ink}}.lab-pattern{stroke:${p.ink};stroke-width:1;opacity:.45}`;

const LINE = 20;

export function fineCutToSvg(cut: FineCut, magnet: PilotMagnet, palette: LabPalette): string {
  const S = 12, L = 56;
  const g = cut.spec;
  const W = (g.xMax - g.xMin + g.coarseStepMm) * S, H = (g.yMax - g.yMin + g.coarseStepMm) * S;
  const px = (x: number) => L + (x - g.xMin + g.coarseStepMm / 2) * S;
  const py = (y: number) => T + (g.yMax - y + g.coarseStepMm / 2) * S;
  const parts: string[] = [""];
  const textW = W + 24 - L - 8;
  const titleLines = wrapSvgText(`${cut.title} · ${cut.magnetId} · modèle B · C1 · audit géométrique (profil 1.1)`, textW);
  const T = 24 + titleLines.length * LINE;
  parts.push(`<style>${styleFor(palette)}</style><defs>
<pattern id="lab-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" class="lab-var"/><line x1="0" y1="0" x2="0" y2="6" class="lab-pattern"/></pattern>
<pattern id="lab-dots" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" class="lab-orient"/><circle cx="3" cy="3" r="1.2" class="lab-ink" opacity=".55"/></pattern>
<pattern id="lab-lines" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" class="lab-undet"/><line x1="0" y1="3" x2="6" y2="3" class="lab-pattern"/></pattern>
<pattern id="lab-cross" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" class="lab-na"/><path d="M0 0L6 6M6 0L0 6" class="lab-pattern"/></pattern>
</defs>`);
  titleLines.forEach((l, i) => parts.push(`<text x="${L}" y="${20 + i * LINE}" class="lab-text" font-weight="700">${esc(l)}</text>`));
  // Cellules à dimension RÉELLE : 0,25 mm → 3 px, 1 mm → 12 px.
  for (const c of cut.cells) {
    const s = c.sizeMm * S;
    const f = fillFor(c.reading === "collision" || c.reading === "reponse_nulle" ? c.reading : c.category, c.cause);
    parts.push(`<rect x="${px(c.x) - s / 2}" y="${py(c.y) - s / 2}" width="${s}" height="${s}" class="${cls(c.reading === "collision" || c.reading === "reponse_nulle" ? c.reading : c.category, c.cause)}"${f ? ` style="fill:${f}"` : ""}/>`);
  }
  parts.push(`<rect x="${L}" y="${T}" width="${W}" height="${H}" class="lab-stroke"/>`);
  for (let x = Math.ceil(g.xMin / 4) * 4; x <= g.xMax; x += 4)
    parts.push(`<text x="${px(x)}" y="${T + H + 16}" class="lab-text" text-anchor="middle">${x}</text>`);
  for (let y = Math.ceil(g.yMin / 4) * 4; y <= g.yMax; y += 4)
    parts.push(`<text x="${L - 8}" y="${py(y) + 4}" class="lab-text" text-anchor="end">${y}</text>`);
  parts.push(`<text x="${L + W / 2}" y="${T + H + 34}" class="lab-text" text-anchor="middle">x le long des lames (mm)</text>`);
  parts.push(`<text x="14" y="${T + H / 2}" class="lab-text" transform="rotate(-90 14 ${T + H / 2})" text-anchor="middle">y centre de l'aimant (mm)</text>`);
  // Corps réel du reed : enveloppe de verre PUBLIÉE (capsule ±7 mm, Ø 2,2 mm), distincte
  // de la longueur effective hypothétique (trait plein ±4 mm du profil 1.1).
  const env = PROFILE.reed;
  parts.push(`<rect x="${px(-env.envelopeHalfLengthMm)}" y="${py(env.envelopeRadiusMm)}" width="${2 * env.envelopeHalfLengthMm * S}" height="${2 * env.envelopeRadiusMm * S}" rx="${env.envelopeRadiusMm * S}" class="lab-reed" stroke-dasharray="5 3"/>`);
  const half = env.effectiveLengthMm / 2;
  parts.push(`<line x1="${px(-half)}" y1="${py(0)}" x2="${px(half)}" y2="${py(0)}" class="lab-reed" stroke-width="3"/>`);
  const reedLines = wrapSvgText("reed : trait = longueur effective (hypothèse), capsule pointillée = encombrement publié", textW);
  reedLines.forEach((l, i) => parts.push(`<text x="${L}" y="${T - 8 - (reedLines.length - 1 - i) * LINE}" class="lab-text">${esc(l)}</text>`));
  // Corps réel de l'aimant aux repères : section dans le plan = rectangle Ø × longueur,
  // pôle N du côté +axe (ici +y, loin du reed).
  cut.marks.forEach((m, i) => {
    const w = magnet.diameterMm * S, h = magnet.lengthMm * S;
    const cx = px(m.center[0]), cy = py(m.center[1]);
    parts.push(`<rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" class="lab-reed"/>`);
    parts.push(`<text x="${cx}" y="${cy - h / 2 - 4}" class="lab-text" text-anchor="middle" font-weight="700">N</text>`);
    parts.push(`<text x="${cx}" y="${cy + h / 2 + 14}" class="lab-text" text-anchor="middle" font-weight="700">S</text>`);
    parts.push(`<text x="${cx + w / 2 + 6}" y="${cy + 4}" class="lab-text" font-weight="700">${i + 1}</text>`);
  });
  let yy = T + H + 48;
  cut.marks.forEach((m, i) => {
    const lines = wrapSvgText(`${i + 1}. ${m.label} — ${CATEGORY_LABEL[m.category]}${m.cause ? " — " + CAUSE_LABEL[m.cause] : ""} (aimant dessiné à taille réelle)`, textW);
    lines.forEach((l, j) => parts.push(`<text x="${L}" y="${yy + 2 + j * LINE}" class="lab-text">${esc(l)}</text>`));
    yy += lines.length * LINE;
  });
  if (cut.marks.length) yy += 8;
  const legend: [string, string | undefined, string][] = [
    ["favorable", undefined, READING_LABEL.favorable],
    ["variable", undefined, READING_LABEL.variable],
    ["unfavorable", "too_far", `${READING_LABEL.unfavorable} — ${CAUSE_LABEL.too_far}`],
    ["unfavorable", "orientation", `${READING_LABEL.unfavorable} — ${CAUSE_LABEL.orientation}`],
    ["unfavorable", "undetermined", `${READING_LABEL.unfavorable} — ${CAUSE_LABEL.undetermined}`],
    ["reponse_nulle", undefined, READING_LABEL.reponse_nulle],
    ["collision", undefined, READING_LABEL.collision],
    ["unavailable", undefined, READING_LABEL.unavailable],
  ];
  legend.forEach(([c, cause, label]) => {
    const f = fillFor(c, cause);
    parts.push(`<rect x="${L}" y="${yy}" width="14" height="14" class="${cls(c, cause)}"${f ? ` style="fill:${f}"` : ""}/><rect x="${L}" y="${yy}" width="14" height="14" class="lab-stroke"/>`);
    const lines = wrapSvgText(label, textW - 22);
    lines.forEach((l, i) => parts.push(`<text x="${L + 22}" y="${yy + 12 + i * LINE}" class="lab-text">${esc(l)}</text>`));
    yy += lines.length * LINE;
  });
  yy += 12;
  for (const l of [
    ...wrapSvgText(`Cellules à dimension réelle : 0,25 mm dans la zone locale |x| ≤ 5 mm et y ≤ 5 mm, 1 mm ailleurs, sans recouvrement.`, textW),
    ...wrapSvgText("Ordres de grandeur pédagogiques, jamais une garantie de commutation. Les largeurs de zone ne sont pas des probabilités.", textW),
    `${PROFILE.id} v${PROFILE.version} · ${PASS2_VERSION}`,
  ]) {
    parts.push(`<text x="${L}" y="${yy + 12}" class="lab-text">${esc(l)}</text>`);
    yy += LINE;
  }
  const total = yy + 12;
  parts[0] = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${L + W + 24} ${total}" width="${L + W + 24}" height="${total}" role="img" aria-label="${esc(cut.title)}">`;
  parts.push(`</svg>`);
  return parts.join("\n");
}

export function fineCutToCsv(cut: FineCut): string {
  const head = `# ${cut.id};${cut.magnetId};model B;C1;class C;${PROFILE.id} v${PROFILE.version};${PASS2_VERSION};cellules à dimension réelle`;
  const rows = cut.cells.map((c) => [c.x, c.y, c.sizeMm, c.category, c.cause ?? "", c.reading, c.ratio == null ? "" : c.ratio.toFixed(4)].join(","));
  return [head, "x_mm,y_mm,cell_size_mm,category,cause,reading,nominal_response_over_up_threshold", ...rows].join("\n");
}

export { paletteFromCss };
