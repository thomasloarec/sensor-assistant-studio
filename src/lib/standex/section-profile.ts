import type { SensorModel } from "./sensor-catalog";

/** Rendu de corps partagé par l'atelier ET les vignettes (même composant Body). */
export type BodyKind = "one_flat" | "cylinder" | "extrude";

export function bodyKind(model: SensorModel): BodyKind {
  if (model.section === "one_flat") return "one_flat";
  return ["cylinder", "threaded", "pressfit", "glass"].includes(model.shape) ? "cylinder" : "extrude";
}

/** Contour d'un cylindre à UN méplat : cercle de diamètre `diameter`, coupé par
 * une corde verticale à `flatAcross` du bord opposé. Profil ILLUSTRATIF : la
 * fiche donne les deux cotes, pas l'orientation exacte ni les rayons de raccord.
 * Retourne des points [x, y] centrés sur la boîte englobante
 * (x ∈ ±flatAcross/2, y ∈ ±diameter/2). */
export function oneFlatProfile(diameter: number, flatAcross: number, segments = 32): [number, number][] {
  const r = diameter / 2;
  const f = Math.min(Math.max(flatAcross, 0.01), diameter);
  const chordX = f - r; // position de la corde dans le repère du cercle
  const a = Math.acos(Math.max(-1, Math.min(1, chordX / r)));
  const shift = (chordX - r) / 2; // centre de la boîte englobante en x
  const pts: [number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    const t = a + ((2 * Math.PI - 2 * a) * i) / segments;
    pts.push([r * Math.cos(t) - shift, r * Math.sin(t)]);
  }
  return pts;
}
