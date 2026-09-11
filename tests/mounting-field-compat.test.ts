import { describe, expect, it } from "bun:test";
import { createDossier, currentMounting, toClientDto } from "@/lib/leadmagnet/dossier";
import { exportDossier, parseDossierExport, parseServerSnapshot } from "@/lib/leadmagnet/dossier-io";
import { mountingHash, parseGuidedMounting } from "@/lib/standex/mounting/contract";
import { DEFAULT_WORKSHOP } from "@/lib/standex/magnetic-workshop";
import { mountingFromWorkshop, withComputed } from "@/lib/standex/mounting";

const dossierWithWorkshop = () => {
  const d = createDossier(new Date("2026-09-11T00:00:00.000Z").toISOString());
  return {
    ...d,
    // Choix mécanique EXISTANT : press_fit, avec sa contrainte de perçage.
    mounting: { kind: "press_fit", holeDiameterMm: 8 } as const,
    workshop: { ...DEFAULT_WORKSHOP },
    workshopSource: "builtin" as const,
  };
};

describe("le champ de montage mécanique existant et le montage guidé sont deux champs distincts", () => {
  it("mounting reste le choix mécanique, guidedMounting est additif", () => {
    const d = dossierWithWorkshop();
    const dto = toClientDto(d);
    expect(dto.mounting).toEqual({ kind: "press_fit", holeDiameterMm: 8 });
    expect(dto.guidedMounting).not.toBeNull();
    // Aucun écrasement croisé : le montage guidé n'est pas un MountingChoice.
    expect((dto.guidedMounting as { couple?: unknown }).couple).toBeDefined();
    expect((dto.mounting as { couple?: unknown }).couple).toBeUndefined();
  });

  it("le choix mécanique survit à l'aller-retour export/reprise et au snapshot serveur", () => {
    const d = dossierWithWorkshop();
    const file = exportDossier(d);
    const back = parseDossierExport(JSON.parse(JSON.stringify(file)));
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.dossier.mounting).toEqual({ kind: "press_fit", holeDiameterMm: 8 });
    expect(back.dossier.guidedMounting).not.toBeNull();

    const snap = parseServerSnapshot(JSON.parse(JSON.stringify(file.dossier)));
    expect(snap.ok).toBe(true);
    if (!snap.ok) return;
    expect(snap.dossier.mounting).toEqual({ kind: "press_fit", holeDiameterMm: 8 });
    expect(snap.dossier.guidedMounting).not.toBeNull();
  });

  it("une ancienne reprise sans montage guidé garde son choix mécanique", () => {
    const d = dossierWithWorkshop();
    const file = exportDossier(d) as { dossier: Record<string, unknown> };
    const legacy = JSON.parse(JSON.stringify(file)) as { dossier: Record<string, unknown> };
    delete legacy.dossier["guidedMounting"];
    const back = parseDossierExport(legacy);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.dossier.mounting).toEqual({ kind: "press_fit", holeDiameterMm: 8 });
  });
});

describe("un résultat importé n'est jamais accepté sur la foi de son empreinte", () => {
  it("une empreinte VALIDE ne suffit pas : le résultat est recalculé", () => {
    const truthful = withComputed(mountingFromWorkshop({ ...DEFAULT_WORKSHOP }));
    // Empreinte réellement cohérente avec les entrées, mais verdict falsifié.
    const forged = {
      ...truthful,
      computed: {
        ...truthful.computed!,
        inputsHash: mountingHash(truthful),
        verdict: "detected",
        coverage: "covered",
        coveredFraction: 1,
        reasons: [],
        limits: [],
      },
    };
    expect(forged.computed.inputsHash).toBe(mountingHash(truthful));
    // Lecture stricte : le calculé importé est jeté, pas conservé.
    expect(parseGuidedMounting(forged)?.computed).toBeNull();

    const d = { ...dossierWithWorkshop(), guidedMounting: forged } as never;
    const recomputed = currentMounting(d)!;
    expect(recomputed.computed).not.toBeNull();
    expect(recomputed.computed).toEqual(truthful.computed!);
    expect(toClientDto(d).guidedMounting!.computed).toEqual(truthful.computed!);
  });

  it("un fichier importé avec un verdict falsifié et une empreinte valide ne le conserve pas", () => {
    const d = dossierWithWorkshop();
    const file = exportDossier(d) as { dossier: Record<string, unknown> };
    const tampered = JSON.parse(JSON.stringify(file)) as { dossier: Record<string, unknown> };
    const gm = tampered.dossier["guidedMounting"] as Record<string, unknown>;
    const computed = gm["computed"] as Record<string, unknown>;
    gm["computed"] = { ...computed, verdict: "detected", coverage: "covered", reasons: [] };
    const back = parseDossierExport(tampered);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    const honest = currentMounting(d)!.computed!;
    expect(back.dossier.guidedMounting!.computed).toEqual(honest);
  });
});
