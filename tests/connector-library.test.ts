import { test, expect } from "bun:test";
import {
  DOCUMENTED_HOUSINGS,
  draftFromHousing,
  housingById,
  terminationFromHousing,
} from "../src/lib/leadmagnet/connector-library";
import { EMPTY_CONNECTOR_DRAFT, connectorSummaryLines } from "../src/lib/leadmagnet/connectors";
import { createDossier } from "../src/lib/leadmagnet/dossier";
import { buildSnapshot } from "../src/lib/leadmagnet/submission";
import { INITIAL_NDA } from "../src/lib/leadmagnet/nda";
import { schemaVersionSatisfies, REQUIRED_LEAD_SCHEMA_VERSION } from "../src/lib/leadmagnet/rpc";

test("la bibliothèque ne prétend pas couvrir le marché et reste à qualifier", () => {
  expect(DOCUMENTED_HOUSINGS).toHaveLength(4);
  for (const h of DOCUMENTED_HOUSINGS) {
    expect(h.qualification).toBe("to_verify_by_rnd");
    expect(h.pinout).toBeNull();
    expect(h.actualWireGauge).toBeNull();
    expect(h.availability).toBe("unknown");
    expect(h.contactMpn).not.toBe(h.housingMpn);
    expect(h.matingHeaderModel).not.toBe(h.housingMpn);
    expect(h.sourceUrl.startsWith("https://")).toBe(true);
  }
});

test("le préremplissage n'invente ni brochage ni section de fil", () => {
  const draft = draftFromHousing(housingById("XHP-3")!, EMPTY_CONNECTOR_DRAFT);
  expect(draft.mpn).toBe("XHP-3");
  expect(draft.mating).toBe("B3B-XH-A");
  expect(draft.pinout).toBe("");
  expect(draft.wireGauge).toBe("");
});

test("un boîtier choisi survit au résumé et à l'instantané de soumission", async () => {
  const termination = terminationFromHousing(housingById("PHR-2")!);
  expect(connectorSummaryLines(termination).join(" ")).toContain("PHR-2");
  const dossier = { ...createDossier(), termination };
  const snapshot = await buildSnapshot({
    dossier,
    nda: INITIAL_NDA,
    consents: [],
    reviewAcknowledged: true,
    additionalConstraints: "",
  });
  const kept = JSON.stringify(snapshot.dto.termination);
  expect(kept).toContain("PHR-2");
  expect(kept).toContain("SPH-002T-P0.5S");
  expect(kept).toContain("ePH.pdf");
  expect(kept).toContain("to_verify_by_rnd");
});

test("une version de schéma inférieure n'active pas le parcours serveur", () => {
  // La vérification serveur des fichiers, la provenance d'échantillon et les
  // formes fermées n'existent qu'à partir de 1.4 : une base plus ancienne
  // resterait acceptée à tort si ce seuil baissait.
  expect(REQUIRED_LEAD_SCHEMA_VERSION).toBe("1.4");
  expect(schemaVersionSatisfies("1.1", REQUIRED_LEAD_SCHEMA_VERSION)).toBe(false);
  expect(schemaVersionSatisfies(null, REQUIRED_LEAD_SCHEMA_VERSION)).toBe(false);
  expect(schemaVersionSatisfies("1.2", REQUIRED_LEAD_SCHEMA_VERSION)).toBe(false);
  expect(schemaVersionSatisfies("1.4", REQUIRED_LEAD_SCHEMA_VERSION)).toBe(true);
  expect(schemaVersionSatisfies("1.10", REQUIRED_LEAD_SCHEMA_VERSION)).toBe(true);
  expect(schemaVersionSatisfies("2.0", REQUIRED_LEAD_SCHEMA_VERSION)).toBe(true);
});
