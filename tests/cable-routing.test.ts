import { describe, expect, test } from "bun:test";
import {
  EMPTY_CABLING,
  applyRoutingPick,
  estimateCableLength,
  resetRouting,
  routingPoints,
  uncoveredMotionStates,
  undoRoutingPick,
  RANGE_CABLE_LENGTH_NOTES,
  type CablingConfig,
} from "@/lib/leadmagnet/cabling";
import { buildDossierExport, parseDossierExport } from "@/lib/leadmagnet/dossier-io";
import { createDossier } from "@/lib/leadmagnet/dossier";

const base: CablingConfig = {
  ...EMPTY_CABLING,
  declaredMotionStates: [{ id: "s1", label: "Porte ouverte" }],
};

describe("pointage du câble dans la 3D", () => {
  test("les clics successifs construisent le trajet de référence", () => {
    let c = applyRoutingPick(base, { kind: "base" }, "sensor", [0, 0, 0]);
    c = applyRoutingPick(c, { kind: "base" }, "waypoint", [0, 100, 0]);
    c = applyRoutingPick(c, { kind: "base" }, "connection", [0, 100, 200]);
    expect(routingPoints(c, { kind: "base" })).toHaveLength(3);
    expect(estimateCableLength(c).requiredMm).toBe(300);
  });

  test("un point non fini est refusé sans casser l'état", () => {
    const c = applyRoutingPick(base, { kind: "base" }, "sensor", [Number.NaN, 0, 0]);
    expect(c).toEqual(base);
  });

  test("annuler et effacer ne touchent qu'aux points du câble", () => {
    let c = applyRoutingPick({ ...base, serviceReserveMm: 50 }, { kind: "base" }, "sensor", [
      1, 2, 3,
    ]);
    c = applyRoutingPick(c, { kind: "base" }, "waypoint", [4, 5, 6]);
    c = undoRoutingPick(c, { kind: "base" });
    expect(c.waypoints).toHaveLength(0);
    c = resetRouting(c, { kind: "base" });
    expect(c.sensorEndpoint).toBeNull();
    expect(c.serviceReserveMm).toBe(50);
  });

  test("un état déclaré n'est couvert qu'avec un trajet réel, et la pose est enregistrée", () => {
    const target = { kind: "state", stateId: "s1" } as const;
    let c = applyRoutingPick(base, target, "sensor", [0, 0, 0], { cycleT: 0.5, label: "mi-cycle" });
    expect(uncoveredMotionStates(c)).toHaveLength(1);
    c = applyRoutingPick(c, target, "connection", [0, 0, 120], { cycleT: 0.5, label: "mi-cycle" });
    expect(uncoveredMotionStates(c)).toHaveLength(0);
    expect(c.statePaths[0]!.pose?.cycleT).toBe(0.5);
    expect(c.motionCoverageConfirmed).toBe(false);
  });

  test("un trajet relevé sans pose est signalé", () => {
    const target = { kind: "state", stateId: "s1" } as const;
    let c = applyRoutingPick(base, target, "sensor", [0, 0, 0]);
    c = applyRoutingPick(c, target, "connection", [0, 0, 50]);
    expect(estimateCableLength(c).warnings.join(" ")).toContain("sans pose de scène");
  });

  test("le trajet pointé survit à l'export et à la reprise", () => {
    const d = createDossier();
    let c = applyRoutingPick(d.cabling, { kind: "base" }, "sensor", [0, 0, 0]);
    c = applyRoutingPick(c, { kind: "base" }, "connection", [0, 0, 250]);
    const back = parseDossierExport(buildDossierExport({ ...d, cabling: c }));
    expect(back.ok).toBe(true);
    if (back.ok) expect(back.dossier.cabling.connectionEndpoint).toEqual([0, 0, 250]);
  });

  test("la note de longueurs MK03 cite la source fabricant sans inventer de référence", () => {
    const mk03 = RANGE_CABLE_LENGTH_NOTES.find((n) => n.range === "MK03");
    expect(mk03?.source).toContain("standexdetect.com");
    expect(mk03?.lengths).toContain("5000");
  });
});

describe("reprise stricte d'un fichier", () => {
  const wrap = (dossier: unknown, version = 2) => ({
    format: "standex-design-dossier",
    version,
    exportedAt: new Date().toISOString(),
    binariesToReimport: [],
    dossier,
  });

  test("une version d'export non supportée est refusée", () => {
    const ok = buildDossierExport(createDossier());
    const res = parseDossierExport({ ...ok, version: 99 });
    expect(res.ok).toBe(false);
  });

  test("un montage de type inconnu est remis à décider avec un avis", () => {
    const d = buildDossierExport(createDossier());
    const res = parseDossierExport(
      wrap({ ...(d.dossier as object), mounting: { kind: "teleportation" } }),
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.dossier.mounting.kind).toBe("undecided");
      expect(res.notices.join(" ")).toContain("montage mécanique");
    }
  });

  test("un volume annuel primitif est refusé et remis à inconnu", () => {
    const d = buildDossierExport(createDossier());
    const res = parseDossierExport(
      wrap({
        ...(d.dossier as object),
        business: { ...(d.dossier as { business: object }).business, annualVolume: 2000 },
      }),
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.dossier.business.annualVolume).toEqual({ kind: "unknown" });
  });

  test("un encombrement négatif n'est jamais repris tel quel", () => {
    const d = buildDossierExport(createDossier());
    const res = parseDossierExport(
      wrap({
        ...(d.dossier as object),
        envelope: { lengthMm: -10, widthMm: 5, heightMm: 5 },
      }),
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.dossier.envelope.lengthMm).toBeNull();
  });

  test("un atelier invalide n'est pas repris et ne fait pas planter la reprise", () => {
    const d = buildDossierExport(createDossier());
    const res = parseDossierExport(
      wrap({ ...(d.dossier as object), workshop: { version: 99 }, workshopSource: "user_asset" }),
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.dossier.workshop).toBeNull();
      expect(res.dossier.workshopSource).toBe("none");
    }
  });
});
