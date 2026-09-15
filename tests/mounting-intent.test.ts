import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { detectMountingIntent, satisfiesMountingIntent } from "@/lib/leadmagnet/mounting-intent";
import { evaluateCandidates } from "@/lib/leadmagnet/candidates";
import { sensorById } from "@/lib/standex/sensor-catalog";
import { emptyDossier } from "@/lib/leadmagnet/dossier";

const source = readFileSync("src/components/leadmagnet/design-space.tsx", "utf8");

const FRIDGE_EN =
  "The sensor will be used for monitoring the open/closed status of glass doors on " +
  "commercial refrigerated display cabinets. screw or adhesive mounting. refrigerated " +
  "environment with humidity and condensation.";
const FRIDGE_FR =
  "Surveiller l'ouverture des portes vitrées d'une vitrine réfrigérée. Montage vissé " +
  "ou collé. Ambiance froide et humide avec condensation.";

const statusOf = (text: string | null, id: string) => {
  const base = emptyDossier();
  return evaluateCandidates({
    mounting: base.mounting,
    envelope: base.envelope,
    mountingText: text,
  }).find((c) => c.id === id)!.status;
};

describe("fixation nommée en texte libre : contrainte dure", () => {
  it("« screw or adhesive » veut dire AU MOINS UN des deux, pas les deux", () => {
    const intent = detectMountingIntent(FRIDGE_EN);
    expect(intent.explicit).toBe(true);
    expect(intent.kinds).toContain("screw");
    expect(intent.kinds).toContain("adhesive");
    expect(satisfiesMountingIntent(sensorById("MK04"), intent)).toBe(true);
  });

  it("les reeds destinés au seul report sur carte sont écartés — anglais", () => {
    for (const id of ["MK15", "MK16", "MK17"]) expect(statusOf(FRIDGE_EN, id)).toBe("excluded");
  });

  it("les reeds destinés au seul report sur carte sont écartés — français", () => {
    for (const id of ["MK15", "MK16", "MK17"]) expect(statusOf(FRIDGE_FR, id)).toBe("excluded");
  });

  it("les boîtiers vissés restent candidats, sans fixation inventée", () => {
    for (const id of ["MK02", "MK04", "MK05", "MK13", "MK21"])
      expect(statusOf(FRIDGE_EN, id)).not.toBe("excluded");
  });

  it("un montage sur carte explicitement demandé n'écarte pas les CMS", () => {
    expect(statusOf("Le capteur sera soldered on the board, montage CMS.", "MK16")).not.toBe(
      "excluded",
    );
  });

  it("une réponse modifiée reprend la nouvelle contrainte", () => {
    expect(statusOf("montage CMS sur carte", "MK16")).not.toBe("excluded");
    expect(statusOf("finalement vissé sur une équerre", "MK16")).toBe("excluded");
  });

  it("une phrase qui ne parle pas de fixation ne crée aucune contrainte", () => {
    expect(detectMountingIntent("porte vitrée d'une vitrine réfrigérée").explicit).toBe(false);
    expect(statusOf("porte vitrée d'une vitrine réfrigérée", "MK16")).not.toBe("excluded");
    expect(detectMountingIntent(null).explicit).toBe(false);
    expect(detectMountingIntent("   ").explicit).toBe(false);
  });

  it("zéro résultat reste zéro résultat : aucune référence n'est repêchée", () => {
    const all = evaluateCandidates({
      mounting: { kind: "pcb_smd" },
      envelope: emptyDossier().envelope,
      mountingText: "vissé sur une équerre",
    });
    expect(all.every((c) => c.status === "excluded")).toBe(true);
  });

  it("l'écran lit la réponse de montage et n'affiche jamais un capteur écarté", () => {
    expect(source).toContain("mountingText");
    expect(source).toContain('r.candidate.status !== "excluded"');
  });
});
