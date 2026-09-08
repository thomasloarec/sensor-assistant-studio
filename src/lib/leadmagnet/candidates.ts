/** Filtrage de candidats par choix mécaniques explicites et encombrement documenté.
 * Une gamme n'est pas une référence commandable et rien n'est « validé » avant revue R&D.
 */
import { SENSOR_CATALOG, sizeLabel, type SensorModel } from "@/lib/standex/sensor-catalog";
import type { DesignDossier, EnvelopeMm, MountingChoice } from "./dossier";

export type CandidateStatus = "kept" | "to_verify" | "excluded";

export interface CandidateResult {
  id: string;
  name: string;
  familyOnly: true;
  size: string;
  status: CandidateStatus;
  reasons: string[];
}

const SCREW_SHAPES = new Set(["flange", "block", "threaded"]);

function mountingVerdict(
  sensor: SensorModel,
  mounting: MountingChoice,
): { status: CandidateStatus; reason: string } {
  switch (mounting.kind) {
    case "undecided":
      return {
        status: "to_verify",
        reason: "Aucun montage mécanique choisi : le filtrage mécanique reste ouvert.",
      };
    case "pcb_smd":
      return sensor.shape === "smd"
        ? { status: "kept", reason: "Boîtier CMS compatible d'un report sur PCB." }
        : { status: "excluded", reason: "Boîtier non CMS : incompatible d'un report CMS." };
    case "pcb_through_hole":
      return sensor.shape === "glass"
        ? {
            status: "to_verify",
            reason:
              "Contact nu traversant : manipulation des pattes à valider par R&D (ne pas couper ni plier).",
          }
        : { status: "excluded", reason: "Pas de version traversante documentée ici." };
    case "screw":
      return SCREW_SHAPES.has(sensor.shape)
        ? {
            status: "kept",
            reason:
              sensor.shape === "threaded"
                ? "Corps fileté monté par écrous."
                : "Boîtier à fixation par vis.",
          }
        : { status: "excluded", reason: "Pas de fixation vissée documentée pour ce boîtier." };
    case "press_fit": {
      if (sensor.shape !== "pressfit")
        return { status: "excluded", reason: "Pas d'emboîtement dans un trou documenté." };
      const collar = sensor.collarDiameter ?? sensor.body[1];
      if (!Number.isFinite(mounting.holeDiameterMm) || mounting.holeDiameterMm <= 0)
        return { status: "to_verify", reason: "Diamètre du trou non renseigné." };
      if (mounting.holeDiameterMm + 0.001 < collar)
        return {
          status: "excluded",
          reason: `Collerette ${collar} mm supérieure au trou ${mounting.holeDiameterMm} mm.`,
        };
      return {
        status: "to_verify",
        reason: `Collerette ${collar} mm dans un trou ${mounting.holeDiameterMm} mm : ajustement et maintien à vérifier.`,
      };
    }
    case "other":
      return {
        status: "to_verify",
        reason: "Montage libre décrit par le client : compatibilité à vérifier par R&D.",
      };
  }
}

function envelopeVerdict(
  sensor: SensorModel,
  envelope: EnvelopeMm,
): { status: CandidateStatus; reason: string } | null {
  const limits = [envelope.lengthMm, envelope.widthMm, envelope.heightMm];
  if (limits.every((v) => v === null)) return null;
  if (limits.some((v) => v === null))
    return { status: "to_verify", reason: "Encombrement partiellement renseigné." };
  const need = [...sensor.body].sort((a, b) => a - b);
  const have = (limits as number[]).slice().sort((a, b) => a - b);
  const fits = need.every((n, i) => n <= have[i]! + 0.001);
  return fits
    ? { status: "kept", reason: `Enveloppe ${sizeLabel(sensor)} compatible du volume déclaré.` }
    : { status: "excluded", reason: `Enveloppe ${sizeLabel(sensor)} supérieure au volume déclaré.` };
}

const worst = (a: CandidateStatus, b: CandidateStatus): CandidateStatus =>
  a === "excluded" || b === "excluded"
    ? "excluded"
    : a === "to_verify" || b === "to_verify"
      ? "to_verify"
      : "kept";

export function evaluateCandidates(
  dossier: Pick<DesignDossier, "mounting" | "envelope">,
  catalog: readonly SensorModel[] = SENSOR_CATALOG,
): CandidateResult[] {
  return catalog.map((sensor) => {
    const reasons: string[] = [];
    const mount = mountingVerdict(sensor, dossier.mounting);
    reasons.push(mount.reason);
    let status = mount.status;
    const env = envelopeVerdict(sensor, dossier.envelope);
    if (env) {
      reasons.push(env.reason);
      status = worst(status, env.status);
    }
    if (sensor.contact === "unsupported") {
      reasons.push(
        "Principe de détection différent d'un reed + aimant externe : à confirmer par R&D.",
      );
      status = worst(status, "to_verify");
    }
    if (sensor.category === "Pédagogique") {
      reasons.push("Modèle pédagogique : aucune référence commandable.");
      status = "excluded";
    }
    reasons.push("Gamme documentée ; la référence exacte est fixée après revue R&D.");
    return {
      id: sensor.id,
      name: sensor.name,
      familyOnly: true as const,
      size: sizeLabel(sensor),
      status,
      reasons,
    };
  });
}

export const CANDIDATE_DISCLAIMER =
  "Aucun candidat n'est validé ici : la sélection définitive et la référence commandable sont établies par la revue R&D Standex.";
