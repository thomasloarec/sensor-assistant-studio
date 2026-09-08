import { describe, expect, test, beforeEach } from "bun:test";
import {
  acquireThumbnailSlot,
  liveThumbnailContexts,
  releaseThumbnailSlot,
  resetThumbnailSlots,
  thumbnailSilhouette,
} from "../src/components/leadmagnet/candidate-thumbnail";
import { CUSTOM_SENSOR_ID, SENSOR_CATALOG, sensorById } from "../src/lib/standex/sensor-catalog";
import { contactGeometry } from "../src/components/standex/workshop/scene";

describe("Vignettes 3D des candidats", () => {
  beforeEach(() => resetThumbnailSlots());

  test("une place transmise reste comptée et le plafond tient", async () => {
    const noop = () => {};
    const four = [1, 2, 3, 4].map(() => acquireThumbnailSlot(noop));
    expect(four.every((t) => t.held)).toBe(true);
    expect(liveThumbnailContexts()).toBe(4);

    let woken = 0;
    const fifth = acquireThumbnailSlot(() => {
      woken += 1;
    });
    expect(fifth.held).toBe(false);

    releaseThumbnailSlot(four[0]!); // la place passe à la cinquième vignette
    await Promise.resolve(); // le réveil est différé d'une micro-tâche
    expect(woken).toBe(1);
    expect(fifth.held).toBe(true);
    expect(liveThumbnailContexts()).toBe(4);

    // Une sixième arrivée ne peut pas dépasser le plafond.
    const sixth = acquireThumbnailSlot(noop);
    expect(sixth.held).toBe(false);
    expect(liveThumbnailContexts()).toBe(4);

    // Le nettoyage tardif de la cinquième rend réellement sa place.
    releaseThumbnailSlot(fifth);
    await Promise.resolve();
    expect(sixth.held).toBe(true);
    expect(liveThumbnailContexts()).toBe(4);
    releaseThumbnailSlot(sixth);
    expect(liveThumbnailContexts()).toBe(3);
  });

  test("un nettoyage est idempotent et une attente annulée ne vole pas de place", () => {
    const noop = () => {};
    const held = [1, 2, 3, 4].map(() => acquireThumbnailSlot(noop));
    const waiting = acquireThumbnailSlot(noop);
    releaseThumbnailSlot(waiting); // attente annulée avant d'être servie
    releaseThumbnailSlot(waiting); // second appel sans effet
    releaseThumbnailSlot(held[0]!);
    releaseThumbnailSlot(held[0]!);
    expect(liveThumbnailContexts()).toBe(3);
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

  test("les lames du reed nu restent à l'intérieur de l'ampoule de verre", () => {
    const custom = sensorById(CUSTOM_SENSOR_ID);
    const inner = (custom.reed![1] / 2) * 0.82;
    for (const closed of [false, true]) {
      const g = contactGeometry(custom, closed);
      expect(g.gap + g.thickness / 2).toBeLessThan(inner);
      expect(g.thickness).toBeGreaterThan(0);
    }
    // Un capteur encapsulé garde exactement ses cotes d'origine.
    const mk03 = sensorById("MK03-1A66B-500W");
    const std = contactGeometry(mk03, false);
    expect(std.thickness).toBe(Math.max(0.09, Math.min(0.55, mk03.body[1] * 0.1)));
    expect(std.gap).toBe(Math.max(0.17, mk03.body[2] * 0.1));
  });

});
