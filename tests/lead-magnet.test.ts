import { expect, test } from "bun:test";
import {
  createDossier,
  confirmRequirement,
  proposeRequirement,
  parseAnnualVolume,
  toClientDto,
  dossierHash,
} from "../src/lib/leadmagnet/dossier";
import { evaluateCandidates } from "../src/lib/leadmagnet/candidates";
import {
  EMPTY_CABLING,
  compareStandardLengths,
  estimateCableLength,
  polylineLength,
  directDistance,
  type StandardCableOption,
} from "../src/lib/leadmagnet/cabling";
import { combosForSensor, freeReference } from "../src/lib/leadmagnet/connectors";
import { INITIAL_PRIVACY, canTransfer, grantConsent } from "../src/lib/leadmagnet/privacy";
import { INITIAL_NDA, ndaAllowsConfidentialTransfer, prepareNda } from "../src/lib/leadmagnet/nda";
import { buildSnapshot, checkSubmission, submit } from "../src/lib/leadmagnet/submission";
import { createOffer, invalidationFor, guardRevision, reviewForClient } from "../src/lib/leadmagnet/review";
import { routeSamples, createSampleRequest, findExactPart } from "../src/lib/leadmagnet/samples";

const dossier = () => createDossier("2026-09-08T08:00:00Z");

test("exploration : rien n'est transféré ni confirmé automatiquement", () => {
  const d = dossier();
  expect(d.storage).toBe("memory");
  expect(INITIAL_PRIVACY.consents).toHaveLength(0);
  expect(INITIAL_PRIVACY.remoteAssistantConnected).toBe(false);
  const guessed = proposeRequirement(d, "detection_goal", {
    value: "Détection de porte fermée",
    source: "assistant",
  });
  expect(guessed.requirements[0]!.state).toBe("hypothesis");
  expect(confirmRequirement(guessed, "detection_goal").requirements[0]!.state).toBe("confirmed");
});

test("une exigence vide reste inconnue et ne peut pas être confirmée", () => {
  const d = proposeRequirement(dossier(), "envelope", { value: "  ", source: "user" });
  expect(d.requirements.find((r) => r.key === "envelope")!.state).toBe("unknown");
  expect(confirmRequirement(d, "envelope").requirements.find((r) => r.key === "envelope")!.state).toBe(
    "unknown",
  );
});

test("candidats filtrés par montage explicite, jamais validés", () => {
  const smd = evaluateCandidates({ mounting: { kind: "pcb_smd" }, envelope: dossier().envelope });
  expect(smd.find((c) => c.id === "MK24-A-J")!.status).toBe("kept");
  expect(smd.find((c) => c.id === "MK03")!.status).toBe("excluded");
  const hole = evaluateCandidates({
    mounting: { kind: "press_fit", holeDiameterMm: 8 },
    envelope: dossier().envelope,
  });
  expect(hole.find((c) => c.id === "MK36")!.status).toBe("excluded"); // collerette 10,7 mm > 8 mm
  const wider = evaluateCandidates({
    mounting: { kind: "press_fit", holeDiameterMm: 11 },
    envelope: dossier().envelope,
  });
  expect(wider.find((c) => c.id === "MK38")!.status).toBe("to_verify");
  expect(smd.every((c) => c.familyOnly)).toBe(true);
});

test("encombrement trop petit exclut le candidat", () => {
  const tight = evaluateCandidates({
    mounting: { kind: "screw" },
    envelope: { lengthMm: 10, widthMm: 5, heightMm: 3 },
  });
  expect(tight.find((c) => c.id === "MK27")!.status).toBe("excluded");
});

test("longueur de câble : polyligne réelle, marges explicites, jamais approuvée", () => {
  const config = {
    ...EMPTY_CABLING,
    sensorEndpoint: [0, 0, 0] as [number, number, number],
    connectionEndpoint: [0, 0, 100] as [number, number, number],
    waypoints: [[0, 60, 0] as [number, number, number]],
    serviceReserveMm: 30,
    terminationMm: 10,
    toleranceMm: 5,
    minBendRadiusMm: 12,
    statePaths: [
      {
        stateId: "open",
        label: "Porte ouverte",
        points: [
          [0, 0, 0],
          [0, 60, 0],
          [40, 60, 240],
        ] as [number, number, number][],
      },
    ],
  };
  const e = estimateCableLength(config);
  expect(polylineLength([config.sensorEndpoint, ...config.waypoints, config.connectionEndpoint])).toBeGreaterThan(
    directDistance([config.sensorEndpoint, config.connectionEndpoint]),
  );
  expect(e.longestPathState).toBe("open");
  // Besoin = trajet + réserve + terminaison. La tolérance fournisseur (±5) est une
  // incertitude de fabrication, pas une longueur à ajouter au besoin.
  expect(e.requiredMm).toBeCloseTo((e.longestPathMm ?? 0) + 40, 6);
  expect(e.approved).toBe(false);
  const incomplete = estimateCableLength({ ...EMPTY_CABLING, waypoints: [[0, 0, 0]] });
  expect(incomplete.complete).toBe(false);
  expect(incomplete.warnings.join(" ")).toContain("pas une longueur approuvée");
});

test("longueurs standard : référence exacte, suffixes distincts, pas de MPN inventé", () => {
  const catalog: StandardCableOption[] = [
    { mpn: "MK03-1A66-200W", nominalMm: 200, toleranceMm: 10, source: "fiche MK03" },
    { mpn: "MK03-1A66-500W", nominalMm: 500, toleranceMm: 10, source: "fiche MK03" },
  ];
  expect(compareStandardLengths("MK03-1A66", 150, 100, catalog).kind).toBe("no_sourced_option");
  expect(compareStandardLengths("MK03-1A90-200W", 150, 100, catalog).kind).toBe("no_sourced_option");
  const ok = compareStandardLengths("MK03-1A66-200W", 150, 100, catalog);
  expect(ok.kind).toBe("standard_possible");
  const custom = compareStandardLengths("MK03-1A66-500W", 150, 20, catalog);
  expect(custom.kind).toBe("custom_to_review");
});

test("connecteurs : aucune combinaison inventée", () => {
  expect(combosForSensor("MK03")).toHaveLength(0);
  expect(freeReference(" JST PHR-2 ")).toEqual({
    kind: "free_reference",
    text: "JST PHR-2",
    status: "to_verify_by_rnd",
  });
});

test("NDA : un brouillon n'autorise aucun transfert", () => {
  expect(ndaAllowsConfidentialTransfer(INITIAL_NDA)).toBe(false);
  expect(ndaAllowsConfidentialTransfer({ ...INITIAL_NDA, status: "prepared" })).toBe(false);
  expect(ndaAllowsConfidentialTransfer({ ...INITIAL_NDA, status: "in_force" })).toBe(false);
  expect(
    ndaAllowsConfidentialTransfer({
      ...INITIAL_NDA,
      status: "in_force",
      proof: { documentSha256: "a".repeat(64), verifiedAt: "2026-09-08", verifiedBy: "standex" },
    }),
  ).toBe(true);
  const missingTemplate = prepareNda(INITIAL_NDA);
  expect(missingTemplate.ok).toBe(false);
});

const TEST_BINDING = {
  serverDossierId: null,
  revision: 1,
  contentHash: "c".repeat(64),
  fileDigests: [],
};

test("transfert : consentement puis NDA", () => {
  const consented = grantConsent(INITIAL_PRIVACY, {
    kind: "supabase_dossier",
    contentSummary: "dossier",
    recipients: ["Standex"],
    binding: TEST_BINDING,
  });
  expect(canTransfer(INITIAL_PRIVACY, "supabase_dossier", true).allowed).toBe(false);
  expect(canTransfer(consented, "supabase_dossier", false).allowed).toBe(false);
  expect(canTransfer(consented, "supabase_dossier", true).allowed).toBe(true);
});


test("volume annuel : entier ou inconnu, jamais zéro implicite", () => {
  expect(parseAnnualVolume("")).toEqual({ kind: "unknown" });
  expect(parseAnnualVolume("inconnu")).toEqual({ kind: "unknown" });
  expect(parseAnnualVolume("1200")).toEqual({ kind: "known", sensorsPerYear: 1200 });
  expect(parseAnnualVolume("1,2k")).toHaveProperty("error");
});

test("soumission : pas de succès simulé sans backend, instantané immuable et sans notes internes", async () => {
  const base = dossier();
  const d = {
    ...base,
    business: { ...base.business, contactEmail: "client@example.com" },
    internalNotes: [{ id: "n1", author: "standex", createdAt: "2026-09-08", body: "note privée" }],
    attachments: [
      { id: "a1", fileName: "plan.glb", bytes: 10, transferred: false, storagePath: null },
    ],
  };
  const nda = {
    ...INITIAL_NDA,
    status: "in_force" as const,
    proof: { documentSha256: "b".repeat(64), verifiedAt: "2026-09-08", verifiedBy: "standex" },
  };
  const draft = {
    dossier: d,
    nda,
    consents: [],
    reviewAcknowledged: true,
    additionalConstraints: "",
    serverDossierId: null,
    serverRevision: 1,
  };
  const binding = await submissionBinding(draft);
  const consents = grantConsent(INITIAL_PRIVACY, {
    kind: "supabase_dossier",
    contentSummary: "dossier",
    recipients: ["Standex"],
    binding,
  }).consents;
  const input = { ...draft, consents };
  expect((await checkSubmission({ ...input, reviewAcknowledged: false })).ok).toBe(false);
  // Un accord donné sur un AUTRE contenu ne vaut pas pour celui-ci.
  const stale = {
    ...input,
    consents: grantConsent(INITIAL_PRIVACY, {
      kind: "supabase_dossier",
      contentSummary: "dossier",
      recipients: ["Standex"],
      binding: { ...binding, contentHash: "d".repeat(64) },
    }).consents,
  };
  expect((await checkSubmission(stale)).ok).toBe(false);

  const snapshot = await buildSnapshot(input);
  expect(snapshot.transferredFiles).toHaveLength(0);
  expect(JSON.stringify(snapshot)).not.toContain("note privée");
  expect(snapshot.hash).toMatch(/^[a-f0-9]{64}$/);
  const outcome = await submit(input, { available: false });
  expect(outcome.status).toBe("not_submitted");
  const done = await submit(input, {
    available: true,
    submit: async () => ({ id: "sub_1", at: "2026-09-08T09:00:00Z" }),
  });
  expect(done.status).toBe("submitted");
});

test("le DTO client ne contient jamais les notes internes", async () => {
  const d = { ...dossier(), internalNotes: [{ id: "n", author: "s", createdAt: "x", body: "secret" }] };
  const dto = toClientDto(d);
  expect(JSON.stringify(dto)).not.toContain("secret");
  expect(await dossierHash(dto)).toMatch(/^[a-f0-9]{64}$/);
});

test("prix : refusé avant revue validée et hors rôle commercial", () => {
  const draft = {
    id: "o1",
    dossierId: "d1",
    revision: 2,
    reviewId: "r1",
    authorId: "u1",
    createdAt: "2026-09-08",
    currency: "EUR",
    tiers: [{ quantity: 1000, unitPrice: 1.2 }],
    moq: 500,
    nreToolingCost: 3000,
    incoterm: "EXW",
    leadTimeWeeks: 10,
    validUntil: "2026-12-31",
  };
  const review = {
    id: "r1",
    dossierId: "d1",
    revision: 2,
    authorId: "rnd",
    createdAt: "2026-09-08",
    scope: "capteur + câble",
    conditions: "essais client",
    verdict: "validated" as const,
    published: true,
    clientMessage: "ok",
    internalNotes: "interne",
    supersededBy: null,
  };
  expect(createOffer(draft, review, { userId: "u1", role: "rnd" }).ok).toBe(false);
  expect(createOffer(draft, null, { userId: "u1", role: "sales" }).ok).toBe(false);
  expect(
    createOffer(draft, { ...review, verdict: "more_info" }, { userId: "u1", role: "sales" }).ok,
  ).toBe(false);
  expect(createOffer(draft, review, { userId: "u1", role: "sales" }).ok).toBe(true);
  expect(reviewForClient({ ...review, published: false })).toBeNull();
  expect(JSON.stringify(reviewForClient(review))).not.toContain("interne");
});

test("invalidation par version et concurrence", () => {
  expect(invalidationFor("technical")).toMatchObject({
    reviewInvalidated: true,
    offerInvalidated: true,
    samplingInvalidated: true,
    newRevisionRequired: true,
  });
  expect(invalidationFor("business_volume_or_dates")).toMatchObject({
    reviewInvalidated: false,
    offerInvalidated: true,
  });
  expect(guardRevision(2, 3, () => "écrit").ok).toBe(false);
  expect(guardRevision(3, 3, () => "écrit")).toEqual({ ok: true, value: "écrit" });
});

test("échantillons : seuils 999 / 1000 / inconnu / spécifique", () => {
  expect(routeSamples({ volume: { kind: "known", sensorsPerYear: 999 }, isCustom: false }).kind).toBe(
    "distributors",
  );
  expect(routeSamples({ volume: { kind: "known", sensorsPerYear: 1000 }, isCustom: false }).kind).toBe(
    "standex_direct",
  );
  expect(routeSamples({ volume: { kind: "unknown" }, isCustom: false }).kind).toBe("manual_review");
  expect(routeSamples({ volume: { kind: "known", sensorsPerYear: 200 }, isCustom: true }).kind).toBe(
    "manual_review",
  );
  const route = routeSamples({ volume: { kind: "unknown" }, isCustom: false });
  expect(createSampleRequest("MK03-1A66-500W", 0, route).ok).toBe(false);
  const ok = createSampleRequest("MK03-1A66-500W", 5, route);
  expect(ok.ok && ok.request.transmitted).toBe(false);
  expect(findExactPart("mk03-1a66-500w", ["MK03-1A66-500W"]).match).toBeNull();
  expect(findExactPart("MK03-1A66-500W", ["MK03-1A66-500W"]).match).toBe("MK03-1A66-500W");
});
