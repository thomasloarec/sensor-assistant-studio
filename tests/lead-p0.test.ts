import { expect, test } from "bun:test";
import {
  EMPTY_CABLING,
  compareStandardLengths,
  estimateCableLength,
  uncoveredMotionStates,
  validateCabling,
} from "@/lib/leadmagnet/cabling";
import { EMPTY_CONNECTOR_DRAFT, terminationFromDraft } from "@/lib/leadmagnet/connectors";
import { createDossier } from "@/lib/leadmagnet/dossier";
import { buildDossierExport, parseDossierExport } from "@/lib/leadmagnet/dossier-io";
import { buildSnapshot } from "@/lib/leadmagnet/submission";
import { INITIAL_NDA } from "@/lib/leadmagnet/nda";
import { createSampleRequest, routeSamples } from "@/lib/leadmagnet/samples";

test("câble : valeurs négatives, NaN et infinies sont refusées", () => {
  const bad = validateCabling({
    ...EMPTY_CABLING,
    sensorEndpoint: [Number.NaN, 0, 0],
    connectionEndpoint: [0, Number.POSITIVE_INFINITY, 0],
    serviceReserveMm: -10,
    minBendRadiusMm: 0,
  });
  expect(bad.length).toBeGreaterThan(0);
  const estimate = estimateCableLength({
    ...EMPTY_CABLING,
    sensorEndpoint: [Number.NaN, 0, 0],
  });
  expect(estimate.requiredMm).toBeNull();
  expect(estimate.longestPathMm).toBeNull();
});

test("câble : un trajet incomplet reste inconnu et n'est jamais jugé suffisant", () => {
  const estimate = estimateCableLength({ ...EMPTY_CABLING, waypoints: [[0, 0, 0]] });
  expect(estimate.requiredMm).toBeNull();
  const verdict = compareStandardLengths("MK03-1A66-200W", estimate.requiredMm, 100, [
    { mpn: "MK03-1A66-200W", nominalMm: 200, toleranceMm: 10, source: "fiche" },
  ]);
  expect(verdict.kind).toBe("unknown_requirement");
});

test("câble : chaque état de mouvement déclaré doit avoir son trajet", () => {
  const config = {
    ...EMPTY_CABLING,
    declaredMotionStates: [
      { id: "ouvert", label: "Ouvert" },
      { id: "ferme", label: "Fermé" },
    ],
    statePaths: [
      {
        stateId: "ouvert",
        label: "Ouvert",
        points: [
          [0, 0, 0],
          [10, 0, 0],
        ] as [number, number, number][],
      },
    ],
  };
  expect(uncoveredMotionStates(config).map((s) => s.id)).toEqual(["ferme"]);
});

test("câble : la tolérance fournisseur n'est pas la capacité de logement du surplus", () => {
  const catalog = [{ mpn: "MK03-1A66-500W", nominalMm: 500, toleranceMm: 20, source: "fiche" }];
  // Surplus logeable étroit : le nominal MAX déborde.
  expect(compareStandardLengths("MK03-1A66-500W", 400, 50, catalog).kind).toBe("custom_to_review");
  // Même longueur, logement suffisant.
  expect(compareStandardLengths("MK03-1A66-500W", 400, 200, catalog).kind).toBe("standard_possible");
});

test("connecteur : fabricant et référence exacte obligatoires, jamais qualifié", () => {
  expect(terminationFromDraft(EMPTY_CONNECTOR_DRAFT).ok).toBe(false);
  const result = terminationFromDraft({
    ...EMPTY_CONNECTOR_DRAFT,
    manufacturer: "JST",
    mpn: "PHR-2",
    mating: "B2B-PH-K-S",
    positions: "2",
  });
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.termination.kind).toBe("unqualified_connector");
    if (result.termination.kind === "unqualified_connector")
      expect(result.termination.status).toBe("to_verify_by_rnd");
  }
});

test("export/reprise : câble et connecteur suivent, les autorités ne reviennent jamais", () => {
  const d = createDossier();
  d.cabling = { ...EMPTY_CABLING, serviceReserveMm: 42, lengthChoice: "custom_to_confirm" };
  const connector = terminationFromDraft({
    ...EMPTY_CONNECTOR_DRAFT,
    manufacturer: "JST",
    mpn: "PHR-2",
  });
  if (connector.ok) d.termination = connector.termination;
  d.internalNotes = [{ author: "rnd", text: "note interne", at: new Date().toISOString() }] as never;

  const exported = JSON.parse(JSON.stringify(buildDossierExport(d)));
  expect(JSON.stringify(exported)).not.toContain("note interne");

  // Un fichier trafiqué tente de rétablir des autorités.
  exported.dossier.ndaStatus = "in_force";
  exported.dossier.role = "admin";
  exported.dossier.serverDossierId = "faux";
  exported.dossier.internalNotes = [{ text: "fuite" }];

  const back = parseDossierExport(exported);
  expect(back.ok).toBe(true);
  if (back.ok) {
    expect(back.dossier.cabling.serviceReserveMm).toBe(42);
    expect(back.dossier.cabling.lengthChoice).toBe("custom_to_confirm");
    expect(back.dossier.termination.kind).toBe("unqualified_connector");
    expect(back.dossier.internalNotes).toEqual([]);
    expect(back.dossier.attachments).toEqual([]);
    expect(JSON.stringify(back.dossier)).not.toContain("faux");
    expect(JSON.stringify(back.dossier)).not.toContain("fuite");
  }
});

test("reprise : aucun identifiant de fichier 3D sans le binaire", () => {
  const d = createDossier();
  d.workshopSource = "user_asset";
  d.workshopAsset = { assetKey: "cle-locale", fileName: "machine.glb", storage: "memory" };
  const exported = buildDossierExport(d);
  expect(exported.binariesToReimport).toHaveLength(1);
  const back = parseDossierExport(JSON.parse(JSON.stringify(exported)));
  expect(back.ok).toBe(true);
  if (back.ok) expect(back.dossier.workshopAsset).toBeNull();
});

test("instantané : indépendant des modifications ultérieures du dossier", async () => {
  const d = createDossier();
  d.cabling = { ...EMPTY_CABLING, serviceReserveMm: 10 };
  const snapshot = await buildSnapshot({
    dossier: d,
    nda: INITIAL_NDA,
    consents: [],
    reviewAcknowledged: true,
    additionalConstraints: "",
  });
  d.title = "modifié après coup";
  expect(snapshot.dto.cabling.serviceReserveMm).toBe(10);
  expect(snapshot.dto.title).not.toBe("modifié après coup");
  expect(JSON.stringify(snapshot.dto)).not.toContain("modifié après coup");
});

test("échantillons : rien avant revue validée et référence exacte", () => {
  const route = routeSamples({ volume: 200, isCustom: false });
  const refused = createSampleRequest("MK24", 20, route);
  expect(refused.ok).toBe(false);
  const refusedGamme = createSampleRequest("MK24", 20, route, {
    reviewValidated: true,
    exactPartConfirmed: false,
  });
  expect(refusedGamme.ok).toBe(false);
  const accepted = createSampleRequest("MK24-A-J", 20, route, {
    reviewValidated: true,
    exactPartConfirmed: true,
  });
  expect(accepted.ok).toBe(true);
});
