import { describe, expect, test, beforeEach } from "bun:test";
import {
  acquireThumbnailSlot,
  releaseThumbnailSlot,
  resetThumbnailSlots,
  thumbnailSilhouette,
} from "../src/components/leadmagnet/candidate-thumbnail";
import { CUSTOM_SENSOR_ID, SENSOR_CATALOG, sensorById } from "../src/lib/standex/sensor-catalog";

describe("Vignettes 3D des candidats", () => {
  beforeEach(() => resetThumbnailSlots());

  test("le nombre de contextes WebGL simultanés est plafonné et rendu à la libération", () => {
    const noop = () => {};
    const held = [1, 2, 3, 4].map(() => acquireThumbnailSlot(noop));
    expect(held.every(Boolean)).toBe(true);
    let woken = 0;
    const fifth = acquireThumbnailSlot(() => {
      woken += 1;
    });
    expect(fifth).toBe(false); // la 5e vignette reste en repli 2D
    releaseThumbnailSlot(true, noop);
    expect(woken).toBe(1); // la place libérée réveille exactement une vignette
  });

  test("le repli 2D dessine la silhouette du capteur concerné, jamais un capteur par défaut", () => {
    const paths = new Map<string, string>();
    for (const model of SENSOR_CATALOG) paths.set(model.id, thumbnailSilhouette(model));
    for (const [id, d] of paths) {
      expect(d.startsWith("M"), id).toBe(true);
      expect(d.includes("NaN"), id).toBe(false);
    }
    const customPath = thumbnailSilhouette(sensorById(CUSTOM_SENSOR_ID));
    const mk03Path = thumbnailSilhouette(sensorById("MK03-1A66B-500W"));
    expect(customPath).not.toBe(mk03Path);
    // La carte sur mesure n'est pas un rectangle : son contour a un chanfrein
    // et une encoche, donc nettement plus de sommets qu'un boîtier plat.
    expect(customPath.split("L").length).toBeGreaterThan(6);
  });
});
