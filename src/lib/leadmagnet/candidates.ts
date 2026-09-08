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
  // Une conception sur mesure n'est jamais écartée par un filtre mécanique :
  // c'est justement la géométrie qui serait définie avec la R&D.
  if (sensor.shape === "custom_pcb")
    return {
      status: "to_verify",
      reason:
        "Conception sur mesure : la forme de la carte, l'encoche et les fixations seraient définies avec la R&D Standex.",
    };
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
      if (!Number.isFinite(mounting.holeDiameterMm) || mounting.holeDiameterMm <= 0)
        return { status: "to_verify", reason: "Diamètre du trou non renseigné." };
      // La portion INSÉRÉE est le corps. La collerette est une butée : plus large que
      // le trou, c'est son rôle, ce n'est jamais un motif d'exclusion à elle seule.
      const insertion = Math.max(sensor.body[1], sensor.body[2]);
      const collar = sensor.collarDiameter ?? null;
      if (mounting.holeDiameterMm + 0.001 < insertion)
        return {
          status: "excluded",
          reason: `Portion insérée ${insertion} mm supérieure au trou ${mounting.holeDiameterMm} mm : le corps n'entre pas.`,
        };
      const collarNote =
        collar === null
          ? ""
          : collar > mounting.holeDiameterMm
            ? ` Collerette ${collar} mm : elle sert de butée en appui autour du trou ; prévoir cette surface d'appui et le volume qu'elle occupe côté visible.`
            : ` Collerette ${collar} mm : plus étroite que le trou, l'appui en butée n'est pas assuré, à vérifier.`;
      return {
        status: "to_verify",
        reason:
          `Portion insérée ${insertion} mm dans un trou ${mounting.holeDiameterMm} mm : ajustement (serrage, jeu, maintien) à vérifier par la R&D.` +
          collarNote,
      };
    }
    case "other":
      return {
        status: "to_verify",
        reason: "Montage libre décrit par le client : compatibilité à vérifier par R&D.",
      };
  }
}

/** Encombrement réellement occupé : corps + portée des terminaisons quand elle est documentée. */
function footprint(sensor: SensorModel): { dims: number[]; note: string | null } {
  const dims = [...sensor.body];
  const notes: string[] = [];
  if (sensor.terminalSpan !== undefined && sensor.terminalSpan > dims[0]!) {
    notes.push(
      `Encombrement compté avec la portée des terminaisons (${sensor.terminalSpan} mm), pas seulement le corps (${sensor.body[0]} mm).`,
    );
    dims[0] = sensor.terminalSpan;
  }
  if (sensor.nutWidth !== undefined)
    notes.push(
      `Écrous et pièces de fixation (${sensor.nutWidth} mm sur plats) à loger en plus du corps.`,
    );
  if (sensor.collarDiameter !== undefined)
    notes.push(`Collerette ${sensor.collarDiameter} mm à loger côté appui, hors du trou.`);
  return { dims, note: notes.length ? notes.join(" ") : null };
}

function envelopeVerdict(
  sensor: SensorModel,
  envelope: EnvelopeMm,
): { status: CandidateStatus; reason: string } | null {
  const limits = [envelope.lengthMm, envelope.widthMm, envelope.heightMm];
  if (limits.every((v) => v === null)) return null;
  if (limits.some((v) => v === null))
    return { status: "to_verify", reason: "Encombrement partiellement renseigné." };
  const { dims, note } = footprint(sensor);
  const need = dims.slice().sort((a, b) => a - b);
  const have = (limits as number[]).slice().sort((a, b) => a - b);
  // Le tri compare la meilleure orientation possible : l'orientation retenue reste à décider.
  const fits = need.every((n, i) => n <= have[i]! + 0.001);
  const orientation =
    " Comparaison faite dans l'orientation la plus favorable ; l'orientation réelle reste à confirmer.";
  return fits
    ? {
        status: "to_verify",
        reason:
          `Encombrement ${sizeLabel(sensor)} compatible du volume déclaré.` +
          (note ? ` ${note}` : "") +
          orientation,
      }
    : {
        status: "excluded",
        reason:
          `Encombrement ${need.join(" × ")} mm supérieur au volume déclaré.` +
          (note ? ` ${note}` : ""),
      };
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
    const custom = sensor.shape === "custom_pcb";
    const reasons: string[] = [];
    const mount = mountingVerdict(sensor, dossier.mounting);
    reasons.push(mount.reason);
    let status = mount.status;
    // Les cotes du schéma sur mesure sont proportionnelles et pédagogiques :
    // les comparer à un volume déclaré laisserait croire à une cote figée.
    const env = custom ? null : envelopeVerdict(sensor, dossier.envelope);
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
    if (custom) {
      reasons.push(
        "Schéma pédagogique proportionnel : les cotes affichées illustrent les rapports (carte 3 × la longueur du reed, 5 × son diamètre), elles ne sont pas des cotes validées.",
      );
      reasons.push(
        "Aucune référence commandable et aucune distance de commutation documentée : elles restent inconnues tant que la R&D Standex n'a pas caractérisé la solution.",
      );
    } else {
      reasons.push("Gamme documentée ; la référence exacte est fixée après revue R&D.");
    }
    return {
      id: sensor.id,
      name: sensor.name,
      familyOnly: true as const,
      size: custom ? `${sizeLabel(sensor)} · cotes pédagogiques` : sizeLabel(sensor),
      status,
      reasons,
    };
  });
}

export const CANDIDATE_DISCLAIMER =
  "Aucun candidat n'est validé ici : la sélection définitive et la référence commandable sont établies par la revue R&D Standex.";
