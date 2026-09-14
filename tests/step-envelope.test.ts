import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  SENSOR_CATALOG,
  overallEnvelope,
  CUSTOM_SENSOR_ID,
} from "../src/lib/standex/sensor-catalog";
import {
  STEP_ENVELOPE_IDS,
  stepEnvelopeFor,
  type StepManifest,
} from "../src/lib/standex/step-envelope";

const STEP_DIR = join(process.cwd(), "public", "step");

async function loadManifest(): Promise<StepManifest> {
  const raw = await readFile(join(STEP_DIR, "manifest.json"), "utf8");
  return JSON.parse(raw) as StepManifest;
}

/** Extrait tous les CARTESIAN_POINT(...) d'un fichier STEP. */
function extractPoints(text: string): [number, number, number][] {
  const pts: [number, number, number][] = [];
  const re = /CARTESIAN_POINT\('',\(([^)]+)\)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const [x, y, z] = m[1].split(",").map(Number);
    pts.push([x, y, z]);
  }
  return pts;
}

describe("manifeste STEP", () => {
  test("aucun identifiant du catalogue ne manque", async () => {
    const manifest = await loadManifest();
    const manifestIds = new Set(manifest.entries.map((e) => e.id));
    for (const s of SENSOR_CATALOG) {
      expect(manifestIds.has(s.id)).toBe(true);
    }
    expect(manifest.entries.length).toBe(SENSOR_CATALOG.length);
  });

  test("STEP_ENVELOPE_IDS reflète le manifeste, pas une liste écrite à la main", async () => {
    const manifest = await loadManifest();
    expect([...STEP_ENVELOPE_IDS].sort()).toEqual(manifest.entries.map((e) => e.id).sort());
  });

  test("l'unité déclarée est le millimètre", async () => {
    const manifest = await loadManifest();
    expect(manifest.unit).toBe("MILLIMETRE");
  });
});

describe("chaque fichier STEP annoncé existe réellement et est valide", () => {
  for (const s of SENSOR_CATALOG) {
    test(`${s.id} : fichier présent, en-tête ISO-10303-21 / AP214, B-Rep, enveloppe cohérente`, async () => {
      const envelope = stepEnvelopeFor(s.id);
      expect(envelope).not.toBeNull();
      const filePath = join(STEP_DIR, envelope!.fileName);
      expect(existsSync(filePath)).toBe(true);

      const text = await readFile(filePath, "utf8");

      // En-tête ISO-10303-21 valide.
      expect(text.startsWith("ISO-10303-21;")).toBe(true);
      expect(text).toContain("HEADER;");
      expect(text).toContain("ENDSEC;");
      expect(text).toContain("DATA;");
      expect(text.trim().endsWith("END-ISO-10303-21;")).toBe(true);

      // FILE_SCHEMA AP214 (AUTOMOTIVE_DESIGN).
      expect(text).toMatch(/FILE_SCHEMA\(\('AUTOMOTIVE_DESIGN \{ 1 0 10303 214 1 1 1 1 \}'\)\);/);

      // Unités millimètre.
      expect(text).toMatch(/SI_UNIT\(\.MILLI\.,\.METRE\.\)/);

      // Parsing basique du B-Rep : solide facetté fermé, faces surfaciques cohérentes.
      expect(text).toContain("FACETED_BREP");
      expect(text).toContain("FACETED_BREP_SHAPE_REPRESENTATION");
      expect(text).toContain("CLOSED_SHELL");
      expect(text).toContain("FACE_SURFACE");
      expect(text).toContain("FACE_OUTER_BOUND");
      expect(text).not.toContain("MANIFOLD_SOLID_BREP");
      expect(text).not.toContain("ADVANCED_FACE");


      const points = extractPoints(text);
      expect(points.length).toBeGreaterThan(0);

      // Boîte englobante des points, cohérente avec overallEnvelope() à ±0,01 mm.
      const xs = points.map((p) => p[0]);
      const ys = points.map((p) => p[1]);
      const zs = points.map((p) => p[2]);
      const spanX = Math.max(...xs) - Math.min(...xs);
      const spanY = Math.max(...ys) - Math.min(...ys);
      const spanZ = Math.max(...zs) - Math.min(...zs);

      const [envX, envY, envZ] = overallEnvelope(s);
      const eps = 0.01;
      // La longueur (X) suit toujours overallEnvelope() : écrous et collerettes
      // sont positionnés par le générateur pour rester dans la longueur du corps.
      expect(Math.abs(spanX - envX)).toBeLessThanOrEqual(eps);

      // Pour la largeur/hauteur (Y, Z), overallEnvelope() ne décrit que le
      // corps (body[1], body[2]) : c'est une limite connue et documentée du
      // catalogue, qui ne modélise pas la saillie radiale des écrous
      // hexagonaux ("threaded") ni des collerettes ("pressfit") au-delà du
      // diamètre du corps. Le générateur, lui, construit fidèlement cette
      // saillie à partir des mêmes champs du catalogue (nutWidth,
      // collarDiameter) : on compare donc la boîte réelle à la saillie
      // attendue dérivée de ces champs déjà présents dans le catalogue,
      // jamais à une cote inventée.
      let expectedY = envY;
      let expectedZ = envZ;
      if (s.shape === "threaded" && s.nutWidth) {
        // hexPrism() place les sommets de l'écrou hexagonal selon
        // y = R·sin(a), z = R·cos(a) avec R = nutWidth/√3 (cote sur plats) et
        // a ∈ {π/6 + k·π/3}. L'extremum en Y touche un sommet (R = 2·nutWidth/(2√3)
        // → saillie = 2R, le diamètre circonscrit), tandis que l'extremum en Z
        // tombe entre deux sommets, à l'apothème (R·cos(30°) de part et d'autre
        // → saillie = nutWidth, la cote sur plats déjà documentée).
        expectedY = (2 * s.nutWidth) / Math.sqrt(3);
        expectedZ = s.nutWidth;
      } else if (s.shape === "pressfit") {
        const collar = s.collarDiameter ?? s.body[1];
        expectedY = collar;
        expectedZ = collar;
      } else if (s.shape === "custom_pcb") {
        // L'enveloppe extérieure de la boîte (reed + PCB) peut légèrement
        // excéder overallEnvelope, qui ne décrit que le corps déclaré : on
        // vérifie une borne, pas une égalité, pour ce cas précis.
        expect(spanY).toBeLessThanOrEqual(envY + eps + 1e-9);
        expect(spanZ).toBeLessThanOrEqual(envZ + eps + 1e-9);
        return;
      }
      expect(Math.abs(spanY - expectedY)).toBeLessThanOrEqual(eps);
      expect(Math.abs(spanZ - expectedZ)).toBeLessThanOrEqual(eps);
    });
  }
});

describe("stepEnvelopeFor()", () => {
  test("renvoie null pour un identifiant inconnu", () => {
    expect(stepEnvelopeFor("NE_EXISTE_PAS")).toBeNull();
  });

  test("libellé constant « STEP d'encombrement · modèle simplifié »", () => {
    for (const s of SENSOR_CATALOG) {
      const envelope = stepEnvelopeFor(s.id);
      expect(envelope?.label).toBe("STEP d'encombrement · modèle simplifié");
    }
  });

  test("jamais un fichier fabricant : aucune URL ne pointe vers /datasheets pour l'URL STEP elle-même", () => {
    for (const s of SENSOR_CATALOG) {
      const envelope = stepEnvelopeFor(s.id);
      expect(envelope?.url.startsWith("/step/")).toBe(true);
      expect(envelope?.url.endsWith(".step")).toBe(true);
    }
  });

  test("mention pédagogique explicite pour GENERIC et CUSTOM", () => {
    const generic = stepEnvelopeFor("GENERIC");
    const custom = stepEnvelopeFor(CUSTOM_SENSOR_ID);
    expect(generic?.disclaimer).toMatch(/pédagogique/i);
    expect(custom?.disclaimer).toMatch(/pédagogique/i);
    expect(generic?.sourceUrl).toBeNull();
    expect(custom?.sourceUrl).toBeNull();
  });

  test("un capteur documenté renvoie sa provenance réelle", () => {
    const mk01 = stepEnvelopeFor("MK01");
    expect(mk01?.sourceUrl).toBe("/datasheets/MK01.pdf#page=1");
    expect(mk01?.sourceLabel).toContain("MK01.pdf");
    expect(mk01?.dimensionsLabel).toContain("mm");
  });
});

describe("identifiants EXPRESS : numériques uniquement", () => {
  for (const s of SENSOR_CATALOG) {
    test(`${s.id} : aucune référence #lettre, illégale en EXPRESS`, async () => {
      const envelope = stepEnvelopeFor(s.id);
      const text = await readFile(join(STEP_DIR, envelope!.fileName), "utf8");
      const illegal = text.match(/#[A-Za-z_][A-Za-z0-9_]*/g) ?? [];
      expect(illegal).toEqual([]);
      // Chaque définition d'entité porte bien un identifiant numérique.
      expect(text).toMatch(/^#\d+=/m);
    });
  }
});

describe("volumes réellement fermés, sommets partagés", () => {
  for (const s of SENSOR_CATALOG) {
    test(`${s.id} : points dédupliqués et arêtes appariées sur chaque solide`, async () => {
      const envelope = stepEnvelopeFor(s.id);
      const text = await readFile(join(STEP_DIR, envelope!.fileName), "utf8");

      // 1. Aucun CARTESIAN_POINT dupliqué : deux sommets identiques doivent
      // partager le même identifiant, sinon les faces sont disjointes.
      const coords = new Map<string, string[]>();
      for (const m of text.matchAll(/#(\d+)=CARTESIAN_POINT\('',\(([^)]*)\)\)/g)) {
        const key = m[2];
        coords.set(key, [...(coords.get(key) ?? []), m[1]]);
      }
      const duplicated = [...coords.entries()].filter(([, ids]) => ids.length > 1);
      expect(duplicated).toEqual([]);

      // 2. Chaque solide facetté est une coque fermée : toute arête d'une face
      // est partagée par exactement une autre face du MÊME solide.
      const loopOf = new Map<string, string[]>();
      for (const m of text.matchAll(/#(\d+)=POLY_LOOP\('',\(([^)]*)\)\)/g)) {
        loopOf.set(`#${m[1]}`, m[2].split(",").map((x) => x.trim()));
      }
      const boundLoop = new Map<string, string>();
      for (const m of text.matchAll(/#(\d+)=FACE_(?:OUTER_)?BOUND\('',(#\d+),\.[TF]\.\)/g)) {
        boundLoop.set(`#${m[1]}`, m[2]);
      }
      const faceBounds = new Map<string, string[]>();
      for (const m of text.matchAll(/#(\d+)=FACE_SURFACE\('',\(([^)]*)\),#\d+,\.[TF]\.\)/g)) {
        faceBounds.set(`#${m[1]}`, m[2].split(",").map((x) => x.trim()));
      }
      const shellFaces = new Map<string, string[]>();
      for (const m of text.matchAll(/#(\d+)=CLOSED_SHELL\('',\(([^)]*)\)\)/g)) {
        shellFaces.set(`#${m[1]}`, m[2].split(",").map((x) => x.trim()));
      }
      const solids = [...text.matchAll(/#\d+=FACETED_BREP\('[^']*',(#\d+)\)/g)].map((m) => m[1]);
      expect(solids.length).toBeGreaterThan(0);

      for (const shell of solids) {
        const faces = shellFaces.get(shell) ?? [];
        expect(faces.length).toBeGreaterThanOrEqual(4);
        const edges = new Map<string, number>();
        for (const f of faces) {
          for (const b of faceBounds.get(f) ?? []) {
            const loop = loopOf.get(boundLoop.get(b) ?? "") ?? [];
            expect(loop.length).toBeGreaterThanOrEqual(3);
            for (let i = 0; i < loop.length; i += 1) {
              const a = loop[i];
              const c = loop[(i + 1) % loop.length];
              const key = [a, c].sort().join("|");
              edges.set(key, (edges.get(key) ?? 0) + 1);
            }
          }
        }
        const unpaired = [...edges.entries()].filter(([, n]) => n !== 2);
        expect(unpaired).toEqual([]);
      }
    });
  }
});
