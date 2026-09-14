import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { niceScaleStep, projectedScaleBar, thumbnailZoom } from "@/lib/standex/scale-bar";
import { SENSOR_CATALOG, sensorById } from "@/lib/standex/sensor-catalog";

const SCENE = readFileSync(
  "src/components/standex/workshop/candidate-thumbnail-scene.tsx",
  "utf8",
);
const THUMB = readFileSync("src/components/leadmagnet/candidate-thumbnail.tsx", "utf8");

describe("règle graduée du rendu 3D", () => {
  test("la vignette transmet réellement scaleBar à la scène 3D", () => {
    expect(THUMB).toContain("scaleBar={scaleBar}");
    expect(SCENE).toContain("scaleBar = false");
  });

  test("le zoom de la caméra vient du module partagé, pas d'un littéral", () => {
    expect(SCENE).toContain("thumbnailZoom(span,");
    expect(SCENE).toContain("zoom,");
    expect(SCENE).not.toContain("80 / span");
  });

  test("la longueur tracée est le pas en mm multiplié par le zoom réel", () => {
    const { stepMm, lengthPx } = projectedScaleBar(30, 4, 1000);
    expect(stepMm).toBe(10);
    expect(lengthPx).toBeCloseTo(40, 6);
  });

  test("le pas descend d'un cran plutôt que de déborder de la vignette", () => {
    const wide = projectedScaleBar(30, 40, 100);
    expect(wide.lengthPx).toBeLessThanOrEqual(100);
    /* La valeur affichée reste celle réellement tracée. */
    expect(wide.lengthPx).toBeCloseTo(wide.stepMm * 40, 6);
  });

  test("aucune fausse échelle commune : le zoom cadre chaque capteur", () => {
    const small = thumbnailZoom(5, { pair: false, fitToView: true });
    const large = thumbnailZoom(50, { pair: false, fitToView: true });
    expect(small).toBeGreaterThan(large);
    /* Une petite référence occupe une zone comparable à une grande. */
    expect(5 * small).toBeCloseTo(50 * large, 6);
  });

  test("chaque capteur du catalogue obtient un pas fini et positif", () => {
    for (const m of SENSOR_CATALOG) {
      const span = Math.max(...sensorById(m.id).body);
      const zoom = thumbnailZoom(span, { pair: false, fitToView: true });
      const { stepMm, lengthPx } = projectedScaleBar(span, zoom, 200);
      expect(Number.isFinite(stepMm)).toBe(true);
      expect(stepMm).toBeGreaterThan(0);
      expect(lengthPx).toBeGreaterThan(0);
      expect(lengthPx).toBeLessThanOrEqual(200);
      expect(niceScaleStep(span)).toBeGreaterThan(0);
    }
  });

  test("le repli 2D garde sa propre règle", () => {
    expect(THUMB).toContain("candidate-thumb-scale");
  });
});
