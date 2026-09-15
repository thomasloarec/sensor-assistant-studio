import { beforeEach, describe, expect, it } from "bun:test";
import {
  MAX_LIVE_CONTEXTS,
  acquireThumbnailSlot,
  clearThumbnailSnapshots,
  liveThumbnailContexts,
  queuedThumbnailSlots,
  releaseThumbnailSlot,
  resetThumbnailSlots,
  storeThumbnailSnapshot,
  subscribeThumbnailDemand,
  thumbnailSnapshot,
} from "@/hooks/use-webgl-slot";

const IMAGE = "data:image/png;base64," + "A".repeat(2048);

beforeEach(() => {
  resetThumbnailSlots();
  clearThumbnailSnapshots();
});

describe("instantanés de vignettes", () => {
  it("indexe une image par la géométrie exacte dessinée", () => {
    storeThumbnailSnapshot("MK04||M04|D1|nocable|fit|rule|compact", IMAGE);
    expect(thumbnailSnapshot("MK04||M04|D1|nocable|fit|rule|compact")).toBe(IMAGE);
    // Autre approche, autre couple, autre cadrage : jamais la même image.
    expect(thumbnailSnapshot("MK04||M04|D3|nocable|fit|rule|compact")).toBeNull();
    expect(thumbnailSnapshot("MK04||M13|D1|nocable|fit|rule|compact")).toBeNull();
    expect(thumbnailSnapshot("MK04||M04|D1|nocable|fixed|rule|compact")).toBeNull();
  });

  it("refuse une valeur qui n'est pas une image et une clé vide", () => {
    storeThumbnailSnapshot("k", "https://example.test/image.png");
    storeThumbnailSnapshot("k", "");
    storeThumbnailSnapshot("", IMAGE);
    expect(thumbnailSnapshot("k")).toBeNull();
    expect(thumbnailSnapshot("")).toBeNull();
  });
});

describe("pression sur les places 3D", () => {
  it("prévient les détentrices dès qu'une vignette visible attend", () => {
    let announced = 0;
    const stop = subscribeThumbnailDemand(() => {
      announced += 1;
    });
    const held = Array.from({ length: MAX_LIVE_CONTEXTS }, () => acquireThumbnailSlot(() => {}));
    expect(announced).toBe(0);
    expect(held.every((t) => t.held)).toBe(true);
    const waiting = acquireThumbnailSlot(() => {});
    expect(waiting.waiting).toBe(true);
    expect(announced).toBe(1);
    expect(queuedThumbnailSlots()).toBe(1);
    stop();
    releaseThumbnailSlot(waiting);
  });

  it("six vignettes visibles finissent toutes servies quand les places sont rendues", async () => {
    // Trois cartes de couple = six objets, quatre places : sans restitution,
    // deux objets resteraient définitivement en 2D.
    const served: number[] = [];
    const tokens = Array.from({ length: 6 }, (_, i) =>
      acquireThumbnailSlot(() => served.push(i)),
    );
    tokens.forEach((token, i) => {
      if (token.held) served.push(i);
    });
    expect(served).toEqual([0, 1, 2, 3]);
    expect(liveThumbnailContexts()).toBe(MAX_LIVE_CONTEXTS);
    // Les détentrices figent leur rendu et rendent leur place.
    releaseThumbnailSlot(tokens[0]!);
    releaseThumbnailSlot(tokens[1]!);
    await Promise.resolve();
    await new Promise((resolve) => queueMicrotask(() => resolve(null)));
    expect(served).toEqual([0, 1, 2, 3, 4, 5]);
    // Le plafond n'est jamais dépassé au passage de relais.
    expect(liveThumbnailContexts()).toBe(MAX_LIVE_CONTEXTS);
    expect(queuedThumbnailSlots()).toBe(0);
  });

  it("une vignette figée ne reprend pas de place", () => {
    storeThumbnailSnapshot("frozen", IMAGE);
    const active = (hasSnapshot: boolean) => !hasSnapshot;
    expect(active(thumbnailSnapshot("frozen") !== null)).toBe(false);
    expect(active(thumbnailSnapshot("other") !== null)).toBe(true);
  });
});
