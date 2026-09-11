import { describe, expect, it } from "bun:test";
import {
  MOUNTING_CONTRACT_VERSION,
  REAL_WORLD_TEST_MESSAGE,
  applySuggestion,
  bodiesCollide,
  computeMounting,
  computedIsStale,
  gapAt,
  lateralOffsetMm,
  magnetWorldPosition,
  mountingFromWorkshop,
  moveCouple,
  parseGuidedMounting,
  profileFor,
  relativePoseAt,
  sensitivityComparison,
  simulateMounting,
  suggestPose,
  surfaceGapMm,
  toLocalPoint,
  toWorldPoint,
  withComputed,
  workshopPatchFromMounting,
  referenceTravelExploration,
} from "@/lib/standex/mounting";
import type { GuidedMounting } from "@/lib/standex/mounting";
import { DEFAULT_WORKSHOP, parseWorkshopConfig } from "@/lib/standex/magnetic-workshop";

const base = () => mountingFromWorkshop({ ...DEFAULT_WORKSHOP });

describe("profils de montage", () => {
  it("n'expose que les couples réellement publiés, sans alias d'identité", () => {
    // 4003004003 (cylindre) et M02 (boîtier) sont deux lignes distinctes du
    // registre : aucun repli de l'un sur l'autre.
    expect(profileFor("MK03", "4003004003", "D1")?.magnetId).toBe("4003004003");
    expect(profileFor("MK03", "M02", "D1")?.magnetId).toBe("M02");
    expect(profileFor("MK03", "M02", "D3")?.approachId).toBe("D3");
    expect(profileFor("MK03", "aimant-inventé", "D1")).toBeNull();
    expect(profileFor("MK24-A-J", "4003004003", "D1")).toBeNull();
    expect(profileFor("MK03", "4003004003", "D2")).toBeNull();
  });
  it("le gabarit reste schématique et les datums non caractérisés", () => {
    const p = profileFor("MK03", "M02", "D1")!;
    expect(p.geometry).toBe("schematic");
    expect(p.datumCharacterised).toBe(false);
    expect(p.evidence).toBe("published_typical");
  });
  it("classe les sensibilités par portée réelle : B porte le plus loin", () => {
    const rows = sensitivityComparison(profileFor("MK03", "M02", "D1")!);
    expect(rows.map((r) => r.sensitivityClass)).toEqual(["B", "C", "D", "E"]);
    expect(rows.map((r) => [r.pullInMm, r.dropOutMm])).toEqual([
      [15, 17.5],
      [13, 16.5],
      [11, 14.5],
      [10, 13.5],
    ]);
    expect(rows.every((r) => r.sourceRef.length > 0)).toBe(true);
    const d3 = sensitivityComparison(profileFor("MK03", "M02", "D3")!);
    expect(d3.map((r) => [r.pullInMm, r.dropOutMm])).toEqual([
      [9.3, 11.4],
      [7.4, 9.9],
      [5.7, 8.5],
      [4.5, 8],
    ]);
    // D3 est plus court que D1 pour la même classe.
    expect(d3[0]!.pullInMm).toBeLessThan(rows[0]!.pullInMm);
  });
});

describe("géométrie du couple", () => {
  it("mesure un entrefer de surface, pas une distance de centres", () => {
    const m = base();
    const axis: [number, number, number] = [0, 0, 1];
    const gap = surfaceGapMm("MK03", "M02", { positionMm: [0, 0, 40], rotationDeg: [0, 0, 0] }, axis);
    expect(gap).toBeLessThan(40);
    expect(gap).toBeGreaterThan(0);
    expect(relativePoseAt(m, profileFor("MK03", "M02", "D1")!, 0).positionMm[2]).toBeGreaterThan(
      m.travel.startGapMm,
    );
  });
  it("détecte l'interpénétration au lieu de suggérer à travers la matière", () => {
    expect(bodiesCollide("MK03", "M02", { positionMm: [0, 0, 0], rotationDeg: [0, 0, 0] })).toBe(true);
    expect(bodiesCollide("MK03", "M02", { positionMm: [0, 0, 60], rotationDeg: [0, 0, 0] })).toBe(
      false,
    );
  });
  it("convertit local ↔ monde sans dérive", () => {
    const anchor = { positionMm: [12, -3, 7] as [number, number, number], rotationDeg: [10, 35, -20] as [number, number, number] };
    const local: [number, number, number] = [4, 5, 6];
    const back = toLocalPoint(anchor, toWorldPoint(anchor, local));
    back.forEach((v, i) => expect(v).toBeCloseTo(local[i]!, 9));
  });
});

describe("guidage de position", () => {
  it("propose une pose issue des distances publiées et la prévisualise sans l'appliquer", () => {
    const m = base();
    const result = suggestPose(m);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.suggestion.gapMm).toBe(15);
    expect(result.suggestion.startGapMm).toBe(17.5);
    expect(result.suggestion.schematic).toBe(true);
    expect(lateralOffsetMm(result.suggestion.relative, result.suggestion.axis)).toBeCloseTo(0, 9);
    const applied = applySuggestion(m, result.suggestion);
    expect(applied.ok).toBe(true);
    // L'original n'est pas muté.
    expect(m.travel.startGapMm).toBe(DEFAULT_WORKSHOP.start);
  });
  it("conserve l'ancrage du capteur, les attaches et le besoin en appliquant", () => {
    const m = { ...base(), attachment: { frame: "template" as const, parentNode: "Bac", movingPart: true } };
    const s = suggestPose(m);
    if (!s.ok) throw new Error("suggestion attendue");
    const applied = applySuggestion(m, s.suggestion);
    if (!applied.ok) throw new Error("application attendue");
    expect(applied.mounting.anchor).toEqual(m.anchor);
    expect(applied.mounting.attachment).toEqual(m.attachment);
    expect(applied.mounting.need).toEqual(m.need);
  });
  it("refuse une suggestion sans source publiée", () => {
    const m = base();
    expect(suggestPose({ ...m, couple: { ...m.couple, sensorId: "MK24-A-J" } })).toEqual({
      ok: false,
      reason: "NO_PROFILE",
    });
    expect(suggestPose({ ...m, couple: { ...m.couple, sensitivityClass: "A" } })).toEqual({
      ok: false,
      reason: "CLASS_NOT_PUBLISHED",
    });
  });
  it("déplacer ou tourner le couple ne change pas la pose relative", () => {
    const m = base();
    const moved = moveCouple(m, { translationMm: [10, 4, -6], rotationDeg: [0, 45, 0] });
    expect(moved.relative).toEqual(m.relative);
    expect(moved.anchor.positionMm).toEqual([
      m.anchor.positionMm[0] + 10,
      m.anchor.positionMm[1] + 4,
      m.anchor.positionMm[2] - 6,
    ]);
    const profile = profileFor("MK03", "M02", "D1")!;
    const before = relativePoseAt(m, profile, 0.3),
      after = relativePoseAt(moved, profile, 0.3);
    expect(after.positionMm).toEqual(before.positionMm);
    // La pose monde suit l'ancrage, la pose relative non.
    expect(magnetWorldPosition(moved, after)).not.toEqual(magnetWorldPosition(m, before));
  });
  it("transporte correctement la pose dans le repère d'une pièce mobile", () => {
    const m = { ...base(), anchor: { positionMm: [30, 0, 0] as [number, number, number], rotationDeg: [0, 90, 0] as [number, number, number] } };
    const profile = profileFor("MK03", "M02", "D1")!;
    const world = magnetWorldPosition(m, relativePoseAt(m, profile, 0.5));
    // Ancrage tourné de 90° : l'approche +Z locale sort en X monde.
    expect(Math.abs(world[0]) - 30).toBeGreaterThan(0);
    expect(Math.abs(world[2])).toBeLessThan(1e-6);
  });
});

describe("simulation et hystérésis", () => {
  it("enclenche et relâche à des distances différentes sur l'aller-retour", () => {
    const m = withComputed({ ...base(), travel: { startGapMm: 25, endGapMm: 5 } });
    const sim = simulateMounting(m);
    const closing = sim.transitions.find((x) => x.contact === "closed")!;
    const opening = sim.transitions.find((x) => x.contact === "open" && x.t > closing.t)!;
    expect(closing.gapMm).toBeLessThanOrEqual(15);
    expect(opening.gapMm).toBeGreaterThanOrEqual(17.5 - 0.1);
    expect(opening.gapMm).toBeGreaterThan(closing.gapMm);
  });
  it("part d'un état inconnu quand le départ est entre les deux seuils", () => {
    const sim = simulateMounting(withComputed({ ...base(), travel: { startGapMm: 16, endGapMm: 5 } }));
    expect(sim.samples[0]!.contact).toBe("unknown");
    expect(sim.samples.some((s) => s.contact === "closed")).toBe(true);
  });
  it("est déterministe : le même curseur donne le même état", () => {
    const m = withComputed({ ...base(), travel: { startGapMm: 25, endGapMm: 5 } });
    const a = simulateMounting(m),
      b = simulateMounting(m);
    for (const t of [0, 0.17, 0.5, 0.83, 1]) {
      const i = Math.round(t * (a.samples.length - 1));
      expect(a.samples[i]).toEqual(b.samples[i]!);
      expect(gapAt(m, t)).toBe(gapAt(m, t));
    }
  });
  it("n'affirme aucune détection dans un segment non couvert", () => {
    const m = withComputed({ ...base(), travel: { startGapMm: 25, endGapMm: -2 } });
    const computed = computeMounting(m);
    expect(computed.coverage).toBe("partial");
    expect(computed.uncoveredSegments.length).toBeGreaterThan(0);
    expect(computed.verdict).toBe("undetermined");
    expect(computed.mainMessage).toBe(REAL_WORLD_TEST_MESSAGE);
    const sim = simulateMounting(m);
    expect(sim.samples.filter((s) => !s.covered).every((s) => s.contact === "unknown")).toBe(true);
  });
  it("ne reste pas vert par héritage en quittant le domaine", () => {
    const m = withComputed({
      ...base(),
      travel: { startGapMm: 25, endGapMm: 5 },
      environment: { ferrousNearby: true, temperature: "ambient" },
    });
    const sim = simulateMounting(m);
    expect(sim.samples.every((s) => s.contact === "unknown")).toBe(true);
    expect(computeMounting(m).reasons).toContain("FERROUS_DECLARED");
    expect(computeMounting(m).mainMessage).toBe(REAL_WORLD_TEST_MESSAGE);
  });
  it("sort du gabarit dès que l'orientation n'est plus parallèle", () => {
    const m = withComputed({
      ...base(),
      relative: { positionMm: [0, 0, 0], rotationDeg: [0, 30, 0] },
      travel: { startGapMm: 25, endGapMm: 5 },
    });
    expect(computeMounting(m).reasons).toContain("ORIENTATION_OFF_TEMPLATE");
    expect(computeMounting(m).verdict).toBe("undetermined");
  });
  it("sort du gabarit hors du plan de référence", () => {
    const m = withComputed({
      ...base(),
      relative: { positionMm: [12, 0, 0], rotationDeg: [0, 0, 0] },
      travel: { startGapMm: 25, endGapMm: 5 },
    });
    expect(computeMounting(m).reasons).toContain("LATERAL_OFFSET");
  });
  it("distingue les sensibilités sur le même montage", () => {
    const m = { ...base(), travel: { startGapMm: 20, endGapMm: 12 } };
    const b = computeMounting(withComputed({ ...m, couple: { ...m.couple, sensitivityClass: "B" } }));
    const e = computeMounting(withComputed({ ...m, couple: { ...m.couple, sensitivityClass: "E" } }));
    expect(b.pullInMm).toBe(15);
    expect(e.pullInMm).toBe(10);
    expect(b.verdict).not.toBe(e.verdict);
    expect(e.transitions.length).toBe(0);
  });
});

describe("verdict, couverture et preuve", () => {
  it("ne donne jamais de vert sur un modèle importé non caractérisé", () => {
    const m = withComputed({
      ...base(),
      attachment: { frame: "custom_model", parentNode: "Bac_mobile", movingPart: true },
      travel: { startGapMm: 25, endGapMm: 5 },
    });
    const computed = computeMounting(m);
    expect(computed.verdict).toBe("undetermined");
    expect(computed.coverage).not.toBe("covered");
    expect(computed.evidence).not.toBe("published_typical");
    expect(computed.reasons).toContain("CUSTOM_MODEL_NOT_CHARACTERISED");
    expect(computed.mainMessage).toBe(REAL_WORLD_TEST_MESSAGE);
  });
  it("sépare couverture, preuve et verdict, et liste ses limites", () => {
    const computed = computeMounting(
      withComputed({
        ...base(),
        travel: { startGapMm: 25, endGapMm: 5 },
        need: { closedFromPct: 40, closedToPct: 60 },
      }),
    );
    expect(computed.coverage).toBe("covered");
    expect(computed.evidence).toBe("published_typical");
    expect(computed.verdict).toBe("expected");
    expect(computed.mainMessage).not.toContain("valid");
    expect(computed.limits).toContain("datum_not_characterised");
    expect(computed.limits).toContain("typical_not_guaranteed");
  });
  it("dit que la détection n'est pas prévue quand le besoin n'est pas tenu", () => {
    const computed = computeMounting(
      withComputed({
        ...base(),
        travel: { startGapMm: 25, endGapMm: 5 },
        need: { closedFromPct: 0, closedToPct: 10 },
      }),
    );
    expect(computed.verdict).toBe("not_expected");
  });
});

describe("persistance et invalidation", () => {
  it("périme le résultat dès qu'une entrée change", () => {
    const m = withComputed({ ...base(), travel: { startGapMm: 25, endGapMm: 5 } });
    expect(computedIsStale(m)).toBe(false);
    for (const changed of [
      { ...m, couple: { ...m.couple, sensitivityClass: "E" } },
      { ...m, couple: { ...m.couple, magnetId: "M04" } },
      { ...m, relative: { ...m.relative, rotationDeg: [0, 15, 0] as [number, number, number] } },
      { ...m, travel: { startGapMm: 30, endGapMm: 5 } },
      { ...m, environment: { ferrousNearby: true, temperature: "ambient" as const } },
      { ...m, profileId: "autre/profil" },
    ] satisfies GuidedMounting[])
      expect(computedIsStale(changed)).toBe(true);
  });
  it("ne fait jamais confiance à un verdict importé", () => {
    const m = withComputed({ ...base(), travel: { startGapMm: 25, endGapMm: 5 } });
    const forged = {
      ...JSON.parse(JSON.stringify(m)),
      computed: { ...m.computed, verdict: "expected", coverage: "covered", inputsHash: "0" },
      environment: { ferrousNearby: true, temperature: "ambient" },
    };
    const parsed = parseGuidedMounting(forged)!;
    expect(parsed.computed).toBeNull();
    const recomputed = computeMounting(parsed);
    expect(recomputed.verdict).toBe("undetermined");
  });
  it("refuse un contrat invalide et accepte un aller-retour complet", () => {
    const m = withComputed({ ...base(), travel: { startGapMm: 25, endGapMm: 5 } });
    const round = parseGuidedMounting(JSON.parse(JSON.stringify(m)))!;
    expect(round.version).toBe(MOUNTING_CONTRACT_VERSION);
    expect(round.travel).toEqual(m.travel);
    expect(parseGuidedMounting({ ...m, version: 2 })).toBeNull();
    expect(parseGuidedMounting({ ...m, travel: { startGapMm: 5, endGapMm: 25 } })).toBeNull();
    expect(parseGuidedMounting({ ...m, need: { closedFromPct: 80, closedToPct: 20 } })).toBeNull();
    expect(parseGuidedMounting(null)).toBeNull();
  });
  it("garde le câble relevé dans le contrat", () => {
    const m = withComputed({
      ...base(),
      cable: { points: [[0, 0, 0], [10, 0, 0]], lengthMm: 10 },
    });
    const parsed = parseGuidedMounting(JSON.parse(JSON.stringify(m)))!;
    expect(parsed.cable?.points.length).toBe(2);
    expect(parsed.cable?.lengthMm).toBe(10);
    expect(parseGuidedMounting({ ...m, cable: { points: [[0, 0, Number.NaN]], lengthMm: 1 } })).toBeNull();
  });
});

describe("pont avec l'atelier existant", () => {
  it("traduit une configuration d'atelier sans la déformer", () => {
    const m = mountingFromWorkshop({ ...DEFAULT_WORKSHOP });
    expect(m.couple).toEqual({
      sensorId: "MK03",
      magnetId: "4003004003",
      sensitivityClass: "B",
      approachId: "D1",
      magnetization: DEFAULT_WORKSHOP.magnetization,
      polarity: DEFAULT_WORKSHOP.polarity,
    });
    expect(m.travel).toEqual({ startGapMm: DEFAULT_WORKSHOP.start, endGapMm: DEFAULT_WORKSHOP.end });
    expect(m.attachment.frame).toBe("template");
  });
  it("renvoie un correctif d'atelier toujours valide", () => {
    const m = base();
    const s = suggestPose(m);
    if (!s.ok) throw new Error("suggestion attendue");
    const applied = applySuggestion(m, s.suggestion);
    if (!applied.ok) throw new Error("application attendue");
    const patch = workshopPatchFromMounting(applied.mounting, DEFAULT_WORKSHOP);
    const next = parseWorkshopConfig({ ...DEFAULT_WORKSHOP, ...patch });
    expect(next).not.toBeNull();
    // La course déclarée est PRÉSERVÉE : appliquer une pose ne fabrique pas un cycle.
    expect(next!.start).toBe(DEFAULT_WORKSHOP.start);
    expect(next!.end).toBe(DEFAULT_WORKSHOP.end);
    expect(next!.magnetTilt).toBe(0);
  });
  it("ne reprend la course du gabarit que par une action séparée et explicite", () => {
    const m = base();
    const s = suggestPose(m);
    if (!s.ok) throw new Error("suggestion attendue");
    const explored = referenceTravelExploration(m, s.suggestion);
    expect(explored.travel).toEqual({
      startGapMm: s.suggestion.startGapMm,
      endGapMm: s.suggestion.endGapMm,
    });
    // Besoin, environnement et mouvement restent ceux de l'utilisateur.
    expect(explored.need).toEqual(m.need);
    expect(explored.environment).toEqual(m.environment);
    expect(explored.motion).toEqual(m.motion);
  });
});
