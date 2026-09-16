import type { DesignDossier } from "./dossier";

/** Show the exact written answer and explicit structured choices together.
 * A selected mounting or typed dimension must not be shown as unanswered. */
export function requirementAnswer(d: DesignDossier, key: string, tr = (s: string) => s): string {
  const lines = [d.requirements.find((r) => r.key === key)?.value.trim() ?? ""];
  if (key === "mounting" && d.mounting.kind !== "undecided") {
    // i18n-canonical: labels translated at render/export only.
    const names = {
      screw: "Fixation vissée",
      press_fit: "Emboîtement dans un trou",
      pcb_through_hole: "PCB — traversant",
      pcb_smd: "PCB — report CMS",
      other: "Autre montage",
    };
    lines.push(tr(names[d.mounting.kind]));
    if (d.mounting.kind === "other" && d.mounting.description) lines.push(d.mounting.description);
    if (d.mounting.kind === "press_fit" && d.mounting.holeDiameterMm > 0)
      lines.push(`Ø ${d.mounting.holeDiameterMm} mm`);
  }
  if (key === "envelope") {
    for (const [field, label] of [
      ["lengthMm", "Longueur"],
      ["widthMm", "Largeur"],
      ["heightMm", "Hauteur"],
    ] as const) {
      const n = d.envelope[field];
      if (n !== null) lines.push(`${tr(label)} : ${n} mm`);
    }
  }
  return [...new Set(lines.filter(Boolean))].join("\n");
}
