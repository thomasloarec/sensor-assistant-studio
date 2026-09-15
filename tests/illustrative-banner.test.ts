/** Repère PERMANENT du mode illustratif : il ne suffit pas que le moteur
 *  commute, il faut que la mention arrive à l'écran et dans l'essai conservé.
 *
 *  Le défaut corrigé ici : `computeMounting` ne recopiait pas `illustrative`
 *  dans son retour, donc l'atelier lisait toujours `false` et n'affichait ni le
 *  bandeau ni la marque sur l'essai enregistré.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { DEFAULT_WORKSHOP, type WorkshopConfig } from "../src/lib/standex/magnetic-workshop";
import { mountingFromWorkshop } from "../src/lib/standex/mounting/bridge";
import {
  ILLUSTRATIVE_DROP_OUT_MM,
  ILLUSTRATIVE_PULL_IN_MM,
  computeMounting,
  simulateMounting,
} from "../src/lib/standex/mounting/simulate";

const WORKSHOP = readFileSync("src/components/standex/workshop/workshop.tsx", "utf8");

const config = (patch: Partial<WorkshopConfig> = {}): WorkshopConfig => ({
  ...DEFAULT_WORKSHOP,
  ...patch,
});

/** Couple sans distance publiée exploitable. */
const uncharacterised = config({ sensorId: "MK27", geometry: "D1", start: 40, end: 4 });

describe("le mode illustratif remonte jusqu'à l'écran", () => {
  test("computeMounting recopie le drapeau du simulateur", () => {
    const mounting = mountingFromWorkshop(uncharacterised);
    const sim = simulateMounting(mounting);
    const computed = computeMounting(mounting);
    expect(sim.illustrative).toBe(true);
    expect(computed.illustrative).toBe(true);
  });

  test("les repères illustratifs sont nommés comme tels, jamais comme des seuils", () => {
    const computed = computeMounting(mountingFromWorkshop(uncharacterised));
    expect(computed.illustrativePullInMm).toBe(ILLUSTRATIVE_PULL_IN_MM);
    expect(computed.illustrativeDropOutMm).toBe(ILLUSTRATIVE_DROP_OUT_MM);
    expect(computed.pullInMm).toBeNull();
    expect(computed.dropOutMm).toBeNull();
  });

  test("la qualification reste indéterminée et non caractérisée", () => {
    const computed = computeMounting(mountingFromWorkshop(uncharacterised));
    expect(computed.verdict).toBe("undetermined");
    expect(computed.evidence).toBe("uncharacterised");
  });

  test("un couple documenté ne porte AUCUNE marque illustrative", () => {
    const computed = computeMounting(mountingFromWorkshop(config()));
    expect(computed.illustrative).toBeUndefined();
    expect(computed.illustrativePullInMm).toBeUndefined();
  });

  test("le bandeau se lit sur la simulation de la scène, pas seulement sur computed", () => {
    expect(WORKSHOP).toContain(
      'guidedSim.illustrative === true || computed?.illustrative === true',
    );
    expect(WORKSHOP).toContain('data-testid="illustrative-note"');
  });

  test("le pied de page ne prétend pas publier des distances absentes", () => {
    expect(WORKSHOP).toContain("reference && !illustrative ?");
    expect(WORKSHOP).toContain(
      "Aucune distance publiée pour ce couple : la commutation montrée est illustrative",
    );
  });
});
