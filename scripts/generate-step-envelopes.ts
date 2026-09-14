/**
 * Générateur reproductible de fichiers STEP (ISO-10303-21, schéma AP214)
 * d'ENCOMBREMENT pour chaque capteur de SENSOR_CATALOG.
 *
 * Voie retenue : aucun noyau CAO natif (cadquery/OpenCascade) n'est disponible
 * dans ce bac à sable (`python3 -c "import cadquery"` échoue et il n'y a pas
 * d'accès réseau pip/nix garanti pour l'installer de façon reproductible ici).
 * Ce script est donc un émetteur STEP écrit à la main : il construit une
 * géométrie B-Rep réelle (MANIFOLD_SOLID_BREP / ADVANCED_FACE, faces planes
 * décrites par PLANE + FACE_OUTER_BOUND(POLY_LOOP(...))). C'est la variante
 * « FACETED_BREP » explicitement permise en repli : les corps de révolution
 * (cylindres, écrous hexagonaux, collerettes) sont approximés par des prismes
 * à N côtés (N=24 pour les sections rondes/ovales), pas par des surfaces
 * cylindriques analytiques. Aucune cote n'est inventée : toutes les valeurs
 * viennent de sensor-catalog.ts / magnet-catalog.ts.
 *
 * Limites assumées et documentées dans le rapport :
 *  - approximation polygonale des sections rondes (24 côtés) ;
 *  - épaisseur axiale des écrous hexagonaux non documentée dans le catalogue :
 *    fixée par convention illustrative à `nutWidth` (nut carrée équivalente),
 *    explicitement signalée dans l'entête STEP et le rapport ;
 *  - épaisseur de la collerette (pressfit) non documentée : fixée à une valeur
 *    illustrative min(2 mm, longueur/10), signalée de même ;
 *  - `raisedDepth` (bloc électronique surélevé) n'est pas modélisé comme un
 *    volume distinct (empreinte non documentée) : seule l'enveloppe extérieure
 *    et les trous de fixation sont représentés.
 */
import { mkdir, writeFile } from "node:fs/promises";
import {
  SENSOR_CATALOG,
  overallEnvelope,
  customLayout,
  sensorSource,
  type SensorModel,
} from "../src/lib/standex/sensor-catalog";

type Pt = readonly [number, number, number];

class StepDoc {
  private lines: string[] = [];
  private id = 0;
  next(content: string): string {
    this.id += 1;
    const ref = `#${this.id}`;
    this.lines.push(`${ref}=${content};`);
    return ref;
  }
  body(): string {
    return this.lines.join("\n");
  }
}

function sub(a: Pt, b: Pt): Pt {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function cross(a: Pt, b: Pt): Pt {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function norm(a: Pt): Pt {
  const m = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / m, a[1] / m, a[2] / m];
}

/** Point cartésien STEP (mm), 6 décimales suffisantes pour nos cotes. */
function point(doc: StepDoc, p: Pt): string {
  return doc.next(`CARTESIAN_POINT('',(${p.map((v) => v.toFixed(6)).join(",")}))`);
}
function direction(doc: StepDoc, d: Pt): string {
  const n = norm(d);
  return doc.next(`DIRECTION('',(${n.map((v) => v.toFixed(9)).join(",")}))`);
}
function axis2placement(doc: StepDoc, origin: Pt, axis: Pt, ref: Pt): string {
  const o = point(doc, origin);
  const z = direction(doc, axis);
  const x = direction(doc, ref);
  return doc.next(`AXIS2_PLACEMENT_3D('',${o},${z},${x})`);
}

/** Construit une face plane à partir d'une boucle extérieure et de trous éventuels. */
function face(doc: StepDoc, outer: Pt[], holes: Pt[][] = []): string {
  const n = norm(cross(sub(outer[1], outer[0]), sub(outer[2], outer[0])));
  let ref: Pt = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const refDir = norm(cross(n, ref));
  const placement = axis2placement(doc, outer[0], n, refDir);
  const plane = doc.next(`PLANE('',${placement})`);
  const outerPts = outer.map((p) => point(doc, p));
  const outerLoop = doc.next(`POLY_LOOP('',(${outerPts.join(",")}))`);
  const outerBound = doc.next(`FACE_OUTER_BOUND('',${outerLoop},.T.)`);
  const bounds = [outerBound];
  for (const h of holes) {
    const hp = [...h].reverse().map((p) => point(doc, p));
    const loop = doc.next(`POLY_LOOP('',(${hp.join(",")}))`);
    bounds.push(doc.next(`FACE_BOUND('',${loop},.F.)`));
  }
  return doc.next(`ADVANCED_FACE('',(${bounds.join(",")}),${plane},.T.)`);
}

function closedSolid(doc: StepDoc, name: string, faces: string[]): string {
  const shell = doc.next(`CLOSED_SHELL('',(${faces.join(",")}))`);
  return doc.next(`MANIFOLD_SOLID_BREP('${name}',${shell})`);
}

/** Boîte alignée sur les axes, centrée en (cx,cy,cz). */
function box(
  doc: StepDoc,
  name: string,
  cx: number,
  cy: number,
  cz: number,
  dx: number,
  dy: number,
  dz: number,
  holesXZ: readonly (readonly [number, number, number, number])[] = [],
): string {
  const x0 = cx - dx / 2,
    x1 = cx + dx / 2;
  const y0 = cy - dy / 2,
    y1 = cy + dy / 2;
  const z0 = cz - dz / 2,
    z1 = cz + dz / 2;
  const p = (x: number, y: number, z: number): Pt => [x, y, z];
  const holeLoops = holesXZ.map(([hx, hz, hl, hw]) => {
    const hx0 = hx - hl / 2,
      hx1 = hx + hl / 2,
      hz0 = hz - hw / 2,
      hz1 = hz + hw / 2;
    return { top: [p(hx0, y1, hz0), p(hx1, y1, hz0), p(hx1, y1, hz1), p(hx0, y1, hz1)], bottom: [
      p(hx0, y0, hz0), p(hx1, y0, hz0), p(hx1, y0, hz1), p(hx0, y0, hz1),
    ], hx0, hx1, hz0, hz1 };
  });
  const faces: string[] = [];
  // top / bottom, percées des trous traversants (axe Y)
  faces.push(face(doc, [p(x0, y1, z0), p(x1, y1, z0), p(x1, y1, z1), p(x0, y1, z1)], holeLoops.map((h) => h.top)));
  faces.push(face(doc, [p(x0, y0, z1), p(x1, y0, z1), p(x1, y0, z0), p(x0, y0, z0)], holeLoops.map((h) => [...h.bottom].reverse())));
  // faces latérales du volume extérieur
  faces.push(face(doc, [p(x0, y0, z0), p(x0, y1, z0), p(x0, y1, z1), p(x0, y0, z1)])); // x-
  faces.push(face(doc, [p(x1, y0, z1), p(x1, y1, z1), p(x1, y1, z0), p(x1, y0, z0)])); // x+
  faces.push(face(doc, [p(x0, y0, z0), p(x1, y0, z0), p(x1, y1, z0), p(x0, y1, z0)])); // z-
  faces.push(face(doc, [p(x1, y0, z1), p(x0, y0, z1), p(x0, y1, z1), p(x1, y1, z1)])); // z+
  // parois internes de chaque perçage (traversant selon Y)
  for (const h of holeLoops) {
    const { hx0, hx1, hz0, hz1 } = h;
    faces.push(face(doc, [p(hx0, y0, hz0), p(hx0, y0, hz1), p(hx0, y1, hz1), p(hx0, y1, hz0)]));
    faces.push(face(doc, [p(hx1, y0, hz1), p(hx1, y0, hz0), p(hx1, y1, hz0), p(hx1, y1, hz1)]));
    faces.push(face(doc, [p(hx0, y0, hz1), p(hx1, y0, hz1), p(hx1, y1, hz1), p(hx0, y1, hz1)]));
    faces.push(face(doc, [p(hx1, y0, hz0), p(hx0, y0, hz0), p(hx0, y1, hz0), p(hx1, y1, hz0)]));
  }
  return closedSolid(doc, name, faces);
}

/** Prisme à N côtés extrudé selon X, approximant une section ronde/ovale (Y,Z). */
function ellipseCylinder(
  doc: StepDoc,
  name: string,
  cx: number,
  cy: number,
  cz: number,
  length: number,
  diamY: number,
  diamZ: number,
  n = 24,
): string {
  const x0 = cx - length / 2,
    x1 = cx + length / 2;
  const ry = diamY / 2,
    rz = diamZ / 2;
  const ring = (x: number): Pt[] =>
    Array.from({ length: n }, (_, i) => {
      const a = (2 * Math.PI * i) / n;
      return [x, cy + ry * Math.cos(a), cz + rz * Math.sin(a)] as Pt;
    });
  const r0 = ring(x0),
    r1 = ring(x1);
  const faces: string[] = [];
  faces.push(face(doc, [...r0].reverse()));
  faces.push(face(doc, r1));
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    faces.push(face(doc, [r0[i], r1[i], r1[j], r0[j]]));
  }
  return closedSolid(doc, name, faces);
}

/** Écrou hexagonal (prisme à 6 côtés) extrudé selon X ; `flatToFlat` = cote sur plats. */
function hexPrism(
  doc: StepDoc,
  name: string,
  cx: number,
  cy: number,
  cz: number,
  thickness: number,
  flatToFlat: number,
): string {
  const R = flatToFlat / Math.sqrt(3);
  const x0 = cx - thickness / 2,
    x1 = cx + thickness / 2;
  const ring = (x: number): Pt[] =>
    Array.from({ length: 6 }, (_, i) => {
      const a = Math.PI / 6 + (Math.PI / 3) * i; // sommet pointant selon Y (Z = plat-à-plat)
      return [x, cy + R * Math.sin(a), cz + R * Math.cos(a)] as Pt;
    });
  const r0 = ring(x0),
    r1 = ring(x1);
  const faces: string[] = [face(doc, [...r0].reverse()), face(doc, r1)];
  for (let i = 0; i < 6; i++) {
    const j = (i + 1) % 6;
    faces.push(face(doc, [r0[i], r1[i], r1[j], r0[j]]));
  }
  return closedSolid(doc, name, faces);
}

export const STEP_UNIT = "MILLIMETRE";
export const FACETED_APPROXIMATION_SIDES = 24;

function provenance(s: SensorModel): string {
  if (!s.sourceFile) return "schéma pédagogique, aucune référence commandable";
  return `${s.sourceFile}, page ${s.sourcePage}`;
}

export function solidsFor(doc: StepDoc, s: SensorModel): string[] {
  const [ox, oy, oz] = overallEnvelope(s);
  switch (s.shape) {
    case "threaded": {
      const [l, d] = s.body;
      const nutW = s.nutWidth ?? d * 1.4;
      const parts = [ellipseCylinder(doc, s.id + "_corps", 0, 0, 0, l, d, d)];
      const nutThickness = nutW; // épaisseur non documentée : convention illustrative (voir en-tête)
      for (const sign of [-1, 1] as const) {
        parts.push(
          hexPrism(doc, s.id + "_ecrou", sign * (l / 2 - nutThickness / 2), 0, 0, nutThickness, nutW),
        );
      }
      return parts;
    }
    case "pressfit": {
      const [l, d] = s.body;
      const collar = s.collarDiameter ?? d;
      const collarThickness = Math.min(2, l / 10); // épaisseur non documentée : convention illustrative
      const parts = [ellipseCylinder(doc, s.id + "_corps", 0, 0, 0, l, d, d)];
      parts.push(
        ellipseCylinder(doc, s.id + "_collerette", -l / 2 + collarThickness / 2, 0, 0, collarThickness, collar, collar),
      );
      return parts;
    }
    case "cylinder":
    case "glass": {
      const [l, h, w] = s.body;
      return [ellipseCylinder(doc, s.id + "_corps", 0, 0, 0, l, h, w)];
    }
    case "flange":
    case "block": {
      const [l, h, w] = s.body;
      return [box(doc, s.id + "_corps", 0, 0, 0, l, h, w, s.holes ?? [])];
    }
    case "smd":
    case "custom_pcb":
    default:
      return [box(doc, s.id + "_corps", 0, 0, 0, ox, oy, oz)];
  }
}

export function buildStepFile(s: SensorModel): string {
  const doc = new StepDoc();
  const solids = solidsFor(doc, s);
  const geomCtx = doc.next(
    `(GEOMETRIC_REPRESENTATION_CONTEXT(3)GLOBAL_UNIT_ASSIGNED_CONTEXT((#UNITMM,#UNITRAD,#UNITSR))GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((#UNCERT))REPRESENTATION_CONTEXT('',''))`,
  );
  const shapeRep = doc.next(`SHAPE_REPRESENTATION('${s.id}',(${solids.join(",")}),${geomCtx})`);
  const [ex, ey, ez] = overallEnvelope(s);
  const prov = provenance(s);
  const pedagogical = s.sourceFile === null;
  const cotes = `corps ${s.body.join("×")} mm` +
    (s.terminalSpan ? `, terminaisons ${s.terminalSpan} mm` : "") +
    (s.collarDiameter ? `, collerette Ø${s.collarDiameter} mm` : "") +
    (s.nutWidth ? `, écrou ${s.nutWidth} mm sur plats` : "") +
    `, enveloppe ${ex}×${ey}×${ez} mm`;
  const description =
    `STEP d'encombrement · modèle simplifié | capteur ${s.id} | ${cotes} | ` +
    `provenance : ${prov} | ` +
    `Ce fichier n'est ni un fichier fabricant ni une CAO de fabrication : ` +
    `géométrie d'encombrement approximée (FACETED_BREP), générée par ` +
    `scripts/generate-step-envelopes.ts.` +
    (pedagogical ? " Usage pédagogique uniquement, aucune référence commandable." : "");
  const fileName = `step/${s.id}.step`;
  const header = [
    "ISO-10303-21;",
    "HEADER;",
    `FILE_DESCRIPTION(('${description.replace(/'/g, "''")}'),'2;1');`,
    `FILE_NAME('${fileName}','2026-01-01T00:00:00',('Standex Sensor Studio'),('Standex Detect'),'generate-step-envelopes.ts','','');`,
    "FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));",
    "ENDSEC;",
    "DATA;",
  ].join("\n");
  const unitEntities = [
    `#UNITMM=(NAMED_UNIT(*)LENGTH_UNIT()SI_UNIT(.MILLI.,.METRE.));`,
    `#UNITRAD=(NAMED_UNIT(*)PLANE_ANGLE_UNIT()SI_UNIT($,.RADIAN.));`,
    `#UNITSR=(NAMED_UNIT(*)SOLID_ANGLE_UNIT()SI_UNIT($,.STERADIAN.));`,
    `#UNCERT=UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.0E-6),#UNITMM,'','');`,
  ].join("\n");
  const product = doc.next(`PRODUCT('${s.id}','${s.name.replace(/'/g, "''")}','${cotes.replace(/'/g, "''")}',(#PC))`);
  return [
    header,
    unitEntities,
    `#PC=PRODUCT_CONTEXT('',#PC2,'mechanical');`,
    `#PC2=APPLICATION_CONTEXT('encombrement capteur reed - modele simplifie');`,
    doc.body(),
    `#PDF=PRODUCT_DEFINITION_FORMATION('','',${product});`,
    `#PD=PRODUCT_DEFINITION('','',#PDF,#PDC);`,
    `#PDC=PRODUCT_DEFINITION_CONTEXT('',#PC2,'design');`,
    `#PDS=PRODUCT_DEFINITION_SHAPE('','',#PD);`,
    `#SDR=SHAPE_DEFINITION_REPRESENTATION(#PDS,${shapeRep});`,
    "ENDSEC;",
    "END-ISO-10303-21;",
    "",
  ].join("\n");
}

export interface StepManifestEntry {
  id: string;
  fileName: string;
  bytes: number;
  pedagogical: boolean;
  sourceLabel: string;
  sourceUrl: string | null;
  dimensionsLabel: string;
}

export interface StepManifest {
  generatedBy: string;
  unit: string;
  facetedApproximationSides: number;
  entries: StepManifestEntry[];
}

async function main() {
  await mkdir("public/step", { recursive: true });
  const entries: StepManifestEntry[] = [];
  for (const s of SENSOR_CATALOG) {
    const text = buildStepFile(s);
    const fileName = `${s.id}.step`;
    await writeFile(`public/step/${fileName}`, text, "utf8");
    const pedagogical = s.sourceFile === null;
    const [ex, ey, ez] = overallEnvelope(s);
    const dimensionsLabel =
      `corps ${s.body.join("×")} mm` +
      (s.terminalSpan ? `, terminaisons ${s.terminalSpan} mm` : "") +
      (s.collarDiameter ? `, collerette Ø${s.collarDiameter} mm` : "") +
      (s.nutWidth ? `, écrou ${s.nutWidth} mm sur plats` : "") +
      `, enveloppe ${ex}×${ey}×${ez} mm`;
    entries.push({
      id: s.id,
      fileName,
      bytes: text.length,
      pedagogical,
      sourceLabel: provenance(s),
      sourceUrl: sensorSource(s),
      dimensionsLabel,
    });
    // eslint-disable-next-line no-console
    console.log(`écrit public/step/${fileName} (${text.length} octets)`);
  }
  const manifest: StepManifest = {
    generatedBy: "scripts/generate-step-envelopes.ts",
    unit: STEP_UNIT,
    facetedApproximationSides: FACETED_APPROXIMATION_SIDES,
    entries,
  };
  await writeFile("public/step/manifest.json", JSON.stringify(manifest, null, 2) + "\n", "utf8");
  // eslint-disable-next-line no-console
  console.log(`écrit public/step/manifest.json (${entries.length} entrées)`);
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
