import { describe, expect, it } from "bun:test";
import { DEFAULT_WORKSHOP, applyPairSelection } from "@/lib/standex/magnetic-workshop";
import { defaultMagnetFor } from "@/lib/standex/default-pairs";

describe("« Tester ce couple » applique le duo demandé", () => {
  it("après MK15 + NdFeB, la carte MK02 + M02 ouvre bien MK02 + M02", () => {
    // Essai précédent conservé : l'utilisateur avait choisi NdFeB sur MK15.
    const previous = applyPairSelection(DEFAULT_WORKSHOP, "MK15", "NDFEB-10X5X1.9");
    expect(previous.magnetModel).toBe("NDFEB-10X5X1.9");
    // Clic explicite sur la carte du couple dédié.
    const pair = applyPairSelection(previous, "MK02", "M02");
    expect(pair.sensorId).toBe("MK02");
    expect(pair.magnetModel).toBe("M02");
    // Puis retour sur MK04 + M04 : aucun report de l'aimant précédent.
    const next = applyPairSelection(pair, "MK04", "M04");
    expect(next.magnetModel).toBe("M04");
  });

  it("sans couple demandé, un simple changement de capteur reprend son défaut", () => {
    const from = applyPairSelection(DEFAULT_WORKSHOP, "MK15", "NDFEB-10X5X1.9");
    const only = applyPairSelection(from, "MK14");
    expect(only.magnetModel).toBe(defaultMagnetFor("MK14"));
    expect(only.magnetModel).not.toBe("NDFEB-10X5X1.9");
  });

  it("ne transporte jamais M02 vers un autre capteur", () => {
    const m02 = applyPairSelection(DEFAULT_WORKSHOP, "MK02", "M02");
    expect(applyPairSelection(m02, "MK15").magnetModel).not.toBe("M02");
    expect(applyPairSelection(m02, "MK04").magnetModel).not.toBe("M02");
  });

  it("préserve les dimensions et la course utiles au réglage", () => {
    const base = { ...DEFAULT_WORKSHOP, travelMm: 12.5, gapMm: 3.4 };
    const pair = applyPairSelection(base, "MK02", "M02");
    expect(pair.travelMm).toBe(12.5);
    expect(pair.gapMm).toBe(3.4);
  });
});
