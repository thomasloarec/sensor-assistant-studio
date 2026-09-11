import { describe, expect, it } from "bun:test";
import {
  MOUNTING_CONTRACT_VERSION,
  simulateMounting,
  moveCouple,
  parseGuidedMounting,
  computeMounting,
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
import { COFFEE_ASSEMBLY } from "@/lib/standex/machine-assembly";
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

describe("pont avec un montage importé réel", () => {
  /** Montage volontairement difficile : rotation trois axes, attaches différentes,
   * pivot non nul et lecture à un point de cycle non nul. */
  const assembly = () => ({
    ...COFFEE_ASSEMBLY,
    sensorPosition: [40, 12, -7] as [number, number, number],
    sensorRotation: [12, -25, 8] as [number, number, number],
    magnetPosition: [55, 18, 3] as [number, number, number],
    magnetRotation: [-5, 40, 17] as [number, number, number],
    sensorMount: "moving" as const,
    magnetMount: "fixed" as const,
    motion: "rotation" as const,
    pivot: [10, 0, 5] as [number, number, number],
    rotationAxis: "y" as const,
    openingAngle: 65,
  });
  const near = (a: number[], b: number[]) =>
    a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 6));

  it("relit la pose réelle du modèle, capteur et aimant, à un point de cycle non nul", () => {
    const machine = assembly();
    const config = { ...DEFAULT_WORKSHOP, machine };
    const m = mountingFromWorkshop(config, 0.37);
    // La pose relative correspond exactement à la géométrie du modèle, pas au gabarit.
    const back = workshopPatchFromMounting(m, config, 0.37);
    expect(back.machine).toBeDefined();
    near(back.machine!.magnetPosition, machine.magnetPosition);
    near(back.machine!.magnetRotation, machine.magnetRotation);
    // Le modèle, ses attaches et sa course sont conservés à l'identique.
    expect(back.machine!.assetKey).toBe(machine.assetKey);
    expect(back.machine!.movingNode).toBe(machine.movingNode);
    // Le capteur est réellement reposé depuis le contrat : au résidu flottant près,
    // il retrouve exactement sa pose d'origine.
    near(back.machine!.sensorPosition, machine.sensorPosition);
    near(back.machine!.sensorRotation, machine.sensorRotation);
    expect(back.machine!.travel).toEqual(machine.travel);
    expect(back.machine!.pivot).toEqual(machine.pivot);
  });

  it("applique réellement la pose suggérée dans le modèle importé", () => {
    const machine = { ...assembly(), magnetMount: "moving" as const };
    const config = { ...DEFAULT_WORKSHOP, machine };
    const m = mountingFromWorkshop(config, 0.22);
    const s = suggestPose(m);
    if (!s.ok) throw new Error("suggestion attendue");
    const applied = applySuggestion(m, s.suggestion);
    if (!applied.ok) throw new Error("application attendue");
    const patch = workshopPatchFromMounting(applied.mounting, config, 0.22);
    // La pose de l'aimant CHANGE réellement dans le montage importé…
    expect(patch.machine!.magnetPosition).not.toEqual(machine.magnetPosition);
    // …et la relecture retrouve exactement la pose relative demandée.
    const relu = mountingFromWorkshop({ ...config, ...patch }, 0.22);
    near(relu.relative.positionMm, applied.mounting.relative.positionMm);
    near(relu.relative.rotationDeg, applied.mounting.relative.rotationDeg);
  });

  it("déplacer le couple entier ne change pas la pose relative dans le modèle", () => {
    const machine = { ...assembly(), magnetMount: "moving" as const };
    const config = { ...DEFAULT_WORKSHOP, machine };
    const m = mountingFromWorkshop(config, 0.4);
    const moved = moveCouple(m, { translationMm: [3, -2, 6], rotationDeg: [0, 20, 0] });
    near(moved.relative.positionMm, m.relative.positionMm);
    near(moved.relative.rotationDeg, m.relative.rotationDeg);
  });

  it("un montage importé ne donne jamais un vert : il n'est pas caractérisé", () => {
    const config = { ...DEFAULT_WORKSHOP, machine: assembly() };
    const m = mountingFromWorkshop(config, 0.1);
    expect(m.computed!.reasons).toContain("CUSTOM_MODEL_NOT_CHARACTERISED");
    expect(m.computed!.verdict).toBe("undetermined");
    expect(m.computed!.mainMessage).toBe(REAL_WORLD_TEST_MESSAGE);
  });
});

describe("rotation globale du couple contre orientation propre du capteur", () => {
  it("tourner tout le montage ne sort pas du gabarit", () => {
    const m = mountingFromWorkshop({ ...DEFAULT_WORKSHOP, mountAngle: 45 });
    expect(computeMounting(m).reasons).not.toContain("SENSOR_ANGLE_OFF_TEMPLATE");
    expect(simulateMounting(m).coverage).toBe("covered");
  });
  it("tourner le capteur seul par rapport à l'axe du mouvement en sort", () => {
    const m = mountingFromWorkshop({ ...DEFAULT_WORKSHOP, sensorAngle: 45, magnetAngle: 45 });
    const c = computeMounting(m);
    expect(c.reasons).toContain("SENSOR_ANGLE_OFF_TEMPLATE");
    expect(c.coverage).toBe("outside");
    expect(simulateMounting(m).coverage).toBe("outside");
  });
  it("un contrat antérieur sans angle propre reste lisible et vaut zéro", () => {
    const raw = JSON.parse(JSON.stringify(mountingFromWorkshop(DEFAULT_WORKSHOP))) as {
      motion: Record<string, unknown>;
    };
    delete raw.motion.sensorYawDeg;
    const parsed = parseGuidedMounting(raw);
    expect(parsed).not.toBeNull();
    expect(parsed!.motion.sensorYawDeg).toBe(0);
  });
});

describe("le pont applique réellement la pose aux deux composants", () => {
  const base = () => ({ ...DEFAULT_WORKSHOP, machine: structuredClone(COFFEE_ASSEMBLY) });
  it("une translation du couple déplace capteur ET aimant dans le modèle", () => {
    const c = { ...base(), mode: "education" as const };
    const m = moveCouple(mountingFromWorkshop(c), { translationMm: [5, 0, 0] });
    const n = { ...c, ...workshopPatchFromMounting(m, c) };
    expect(n.machine!.sensorPosition[0]).toBeCloseTo(COFFEE_ASSEMBLY.sensorPosition[0] + 5, 9);
    expect(n.machine!.magnetPosition[0]).toBeCloseTo(COFFEE_ASSEMBLY.magnetPosition[0] + 5, 9);
    // La course, le nœud mobile et les attaches ne bougent pas.
    expect(n.machine!.travel).toEqual(COFFEE_ASSEMBLY.travel);
    expect(n.machine!.movingNode).toBe(COFFEE_ASSEMBLY.movingNode);
    expect(n.machine!.sensorMount).toBe(COFFEE_ASSEMBLY.sensorMount);
  });
  it("translation et rotation, pièces fixes et mobiles, à u = 0.37, font un aller-retour exact", () => {
    for (const mounts of [
      { sensorMount: "fixed", magnetMount: "moving" },
      { sensorMount: "moving", magnetMount: "fixed" },
      { sensorMount: "moving", magnetMount: "moving" },
    ] as const) {
      const c = { ...base(), machine: { ...base().machine!, ...mounts } };
      const m = moveCouple(mountingFromWorkshop(c, 0.37), {
        translationMm: [4, -3, 2],
        rotationDeg: [0, 15, 0],
      });
      const n = { ...c, ...workshopPatchFromMounting(m, c, 0.37) };
      const relu = mountingFromWorkshop(n, 0.37);
      m.anchor.positionMm.forEach((v, i) => expect(relu.anchor.positionMm[i]).toBeCloseTo(v, 6));
      m.anchor.rotationDeg.forEach((v, i) => expect(relu.anchor.rotationDeg[i]).toBeCloseTo(v, 6));
      m.relative.positionMm.forEach((v, i) =>
        expect(relu.relative.positionMm[i]).toBeCloseTo(v, 6),
      );
      m.relative.rotationDeg.forEach((v, i) =>
        expect(relu.relative.rotationDeg[i]).toBeCloseTo(v, 6),
      );
      expect(n.machine!.travel).toEqual(COFFEE_ASSEMBLY.travel);
    }
  });
  it("lit l'entrefer aux deux extrémités réelles du cycle, pas à la moitié", () => {
    const c = base();
    const wide = {
      ...c,
      machine: { ...c.machine!, travel: [0, 0, 40] as [number, number, number], motion: "translation" as const },
    };
    const half = { ...wide, machine: { ...wide.machine, travel: [0, 0, 20] as [number, number, number] } };
    expect(mountingFromWorkshop(wide).travel).not.toEqual(mountingFromWorkshop(half).travel);
  });
});

describe("longueur de câble retenue", () => {
  it("un fichier antérieur sans longueur reste lisible et vaut « non choisie »", () => {
    const raw = JSON.parse(JSON.stringify(DEFAULT_WORKSHOP)) as Record<string, unknown>;
    delete raw["cableLengthMm"];
    const parsed = parseWorkshopConfig(raw);
    expect(parsed).not.toBeNull();
    expect(parsed!.cableLengthMm).toBeNull();
  });
  it("une longueur non finie ou négative fait refuser le fichier", () => {
    for (const bad of [0, -50, Number.NaN, "500", 1e9]) {
      expect(parseWorkshopConfig({ ...DEFAULT_WORKSHOP, cableLengthMm: bad })).toBeNull();
    }
  });
  it("une longueur choisie survit à l'aller-retour d'enregistrement", () => {
    const parsed = parseWorkshopConfig({ ...DEFAULT_WORKSHOP, cableLengthMm: 1500 });
    expect(parsed!.cableLengthMm).toBe(1500);
  });
});
