import { describe, expect, test } from "bun:test";
import {
  blockedBy,
  explorationFilters,
  mergeFilters,
  suggestionFilters,
  EXPLORABLE_MOUNTINGS,
  EXPLORABLE_SHAPES,
} from "@/lib/leadmagnet/suggestion-filters";
import { SENSOR_CATALOG, sensorById } from "@/lib/standex/sensor-catalog";
import { createDossier } from "@/lib/leadmagnet/dossier";

const answers = {
  mounting: { kind: "screw" } as const,
  envelope: { lengthMm: null, widthMm: null, heightMm: null },
};

const visible = (filters: ReturnType<typeof suggestionFilters>) =>
  SENSOR_CATALOG.filter(
    (m) => blockedBy(sensorById(m.id), filters, filters.map((f) => f.id), answers).length === 0,
  ).map((m) => m.id);

describe("exploration d'autres critères", () => {
  test("les réponses seules ne montrent que les fixations vissées", () => {
    const ids = visible(suggestionFilters(answers));
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      const m = sensorById(id);
      if (m.id === "CUSTOM") continue;
      expect(["flange", "block", "threaded"]).toContain(m.shape);
    }
  });

  test("une exploration CMS REMPLACE la fixation vissée, sans intersection impossible", () => {
    const merged = mergeFilters(
      suggestionFilters(answers),
      explorationFilters({ mountingKind: "pcb_smd" }),
    );
    /* Un seul critère de fixation subsiste : celui de l'exploration. */
    expect(merged.filter((f) => f.id === "fixation")).toHaveLength(1);
    expect(merged.find((f) => f.id === "fixation")!.source).toBe("exploration");
    const ids = visible(merged);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      const m = sensorById(id);
      if (m.id === "CUSTOM") continue;
      expect(m.shape).toBe("smd");
    }
  });

  test("l'exploration ne touche ni les réponses ni le montage du dossier", () => {
    const d = createDossier();
    const before = JSON.stringify({ r: d.requirements, m: d.mounting, e: d.envelope });
    explorationFilters({ mountingKind: "pcb_smd", shape: "cylinder" });
    expect(JSON.stringify({ r: d.requirements, m: d.mounting, e: d.envelope })).toBe(before);
  });

  test("revenir à ses réponses restitue exactement les critères d'origine", () => {
    const base = suggestionFilters(answers);
    const explored = mergeFilters(base, explorationFilters({ mountingKind: "pcb_smd" }));
    const back = mergeFilters(base, explorationFilters({}));
    expect(back).toEqual(base);
    expect(explored).not.toEqual(base);
  });

  test("une exploration de forme ne retient que cette forme", () => {
    const merged = mergeFilters(suggestionFilters(answers), explorationFilters({ shape: "glass" }));
    const ids = visible(merged);
    for (const id of ids) {
      const m = sensorById(id);
      if (m.id === "CUSTOM") continue;
      expect(m.shape).toBe("glass");
    }
  });

  test("chaque critère explorable correspond à une forme réellement au catalogue", () => {
    for (const s of EXPLORABLE_SHAPES) {
      expect(typeof s.label).toBe("string");
    }
    expect(EXPLORABLE_MOUNTINGS.map((m) => m.kind)).toEqual([
      "screw",
      "press_fit",
      "pcb_through_hole",
      "pcb_smd",
    ]);
  });
});

/** Le client décrit tout son besoin dans une seule réponse : la fixation qu'il
 * NOMME reste une contrainte, et le résumé « Critères utilisés » ne doit pas
 * rester vide. La lecture porte donc sur l'ensemble des réponses écrites. */
describe("fixation nommée dans n'importe quelle réponse écrite", () => {
  const paragraph =
    "The sensor will be used for monitoring the open/closed status of glass doors on " +
    "commercial refrigerated display cabinets. screw or adhesive mounting. refrigerated " +
    "environment with humidity and condensation.";
  test("un critère de fixation est produit et exclut les boîtiers CMS", () => {
    const filters = suggestionFilters({
      mounting: { kind: "other", holeDiameterMm: 0 } as never,
      envelope: {} as never,
      mountingText: paragraph,
    });
    const fixation = filters.find((f) => f.id === "fixation");
    expect(fixation).toBeDefined();
    expect(fixation?.source).toBe("answers");
    expect(fixation?.criteria?.shapes).not.toContain("smd");
    expect(fixation?.criteria?.shapes).toContain("flange");
  });
});
