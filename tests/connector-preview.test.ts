import { describe, expect, test } from "bun:test";
import { DOCUMENTED_HOUSINGS, housingLabel } from "../src/lib/leadmagnet/connector-library";
import { HOUSING_GEOMETRY, geometryByHousingId } from "../src/lib/leadmagnet/connector-geometry";
import { stripThreeSourceTags } from "../vite/strip-three-source-tags";
import { readFileSync } from "node:fs";

describe("cotes des boîtiers connecteurs", () => {
  test("chaque boîtier documenté a une géométrie associée", () => {
    for (const h of DOCUMENTED_HOUSINGS) {
      expect(geometryByHousingId(h.housingMpn)).not.toBeNull();
    }
  });

  test("cotes exactes PH (source fabricant confirmée)", () => {
    const phr2 = geometryByHousingId("PHR-2")!;
    expect(phr2.width.valueMm).toBe(5.8);
    expect(phr2.height.valueMm).toBe(6.85);
    expect(phr2.depth.valueMm).toBe(4.5);
    expect(phr2.dimensionsToVerify).toBe(false);
    expect(phr2.width.sourceUrl).toBe("https://www.jst-mfg.com/product/pdf/eng/ePH.pdf");
    expect(phr2.width.sourcePage).toBe(3);

    const phr3 = geometryByHousingId("PHR-3")!;
    expect(phr3.width.valueMm).toBe(7.8);
    expect(phr3.height.valueMm).toBe(6.85);
    expect(phr3.depth.valueMm).toBe(4.5);
    expect(phr3.dimensionsToVerify).toBe(false);
  });

  test("largeur XH cohérente avec positions × pas, et marquée à vérifier", () => {
    const xhp2 = geometryByHousingId("XHP-2")!;
    const xhp3 = geometryByHousingId("XHP-3")!;
    const housing2 = DOCUMENTED_HOUSINGS.find((h) => h.housingMpn === "XHP-2")!;
    const housing3 = DOCUMENTED_HOUSINGS.find((h) => h.housingMpn === "XHP-3")!;
    expect(xhp2.width.valueMm).toBeCloseTo(housing2.positions * housing2.pitchMm);
    expect(xhp3.width.valueMm).toBeCloseTo(housing3.positions * housing3.pitchMm);
    expect(xhp2.dimensionsToVerify).toBe(true);
    expect(xhp3.dimensionsToVerify).toBe(true);
  });

  test("aucune cote n'est nulle ou négative", () => {
    for (const g of HOUSING_GEOMETRY) {
      expect(g.width.valueMm).toBeGreaterThan(0);
      expect(g.height.valueMm).toBeGreaterThan(0);
      expect(g.depth.valueMm).toBeGreaterThan(0);
    }
  });
});

describe("composant d'aperçu — code source", () => {
  const source = readFileSync(
    new URL("../src/components/leadmagnet/connector-preview.tsx", import.meta.url),
    "utf-8",
  );
  const sceneSource = readFileSync(
    new URL("../src/components/leadmagnet/connector-preview-scene.tsx", import.meta.url),
    "utf-8",
  );

  test("le nombre d'alvéoles suit exactement housing.positions (3D et 2D)", () => {
    expect(sceneSource).toContain("length: housing.positions");
    expect(source).toContain("length: housing.positions");
  });

  test("mention de la source fabricant et de l'avertissement d'illustration", () => {
    expect(source).toContain("Source fabricant");
    expect(source).toContain("Illustration d'encombrement — ni modèle CAO qualifié ni brochage.");
  });

  test("affiche la référence exacte, le nombre de voies et le pas via housingLabel", () => {
    for (const h of DOCUMENTED_HOUSINGS) {
      const label = housingLabel(h);
      expect(label).toContain(h.housingMpn);
      expect(label).toContain(String(h.positions));
      expect(label).toContain(String(h.pitchMm));
    }
    expect(source).toContain("housingLabel(housing)");
  });

  test("aucun brochage ni broche électrique inventés", () => {
    expect(source.toLowerCase()).not.toContain("pinout");
    expect(source.toLowerCase()).not.toContain("brochage:");
    expect(sceneSource.toLowerCase()).not.toContain("pin ");
  });

  test("respecte prefers-reduced-motion pour la rotation automatique", () => {
    expect(sceneSource).toContain("autoRotate={!reduced}");
  });

  test("repli 2D exposé indépendamment du montage 3D (pas de contexte WebGL requis)", () => {
    expect(source).toContain("HousingSilhouette");
    expect(source).toContain("hasWebGL");
  });

  test("réutilise le budget de contextes WebGL des vignettes existantes", () => {
    expect(source).toContain("acquireThumbnailSlot");
    expect(source).toContain("releaseThumbnailSlot");
  });
});

describe("filtre de nettoyage data-tsd-source", () => {
  test("couvre le nouveau module Three de l'aperçu de connecteur", () => {
    const plugin = stripThreeSourceTags() as unknown as {
      transform: (code: string, id: string) => { code: string } | null;
    };
    const id = "/dev-server/src/components/leadmagnet/connector-preview-scene.tsx";
    const code = `jsx("mesh", { "data-tsd-source": "x", position: p })`;
    const out = plugin.transform.call(null as never, code, id);
    expect(out).not.toBeNull();
    expect(out!.code).not.toContain("data-tsd-source");
  });
});
