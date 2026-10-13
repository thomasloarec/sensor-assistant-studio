/** Filtrage de candidats par choix mécaniques explicites et encombrement documenté.
 * Une gamme n'est pas une référence commandable et rien n'est « validé » avant revue R&D.
 */
import { SENSOR_CATALOG, sizeLabel, type SensorModel } from "@/lib/standex/sensor-catalog";
import type { DesignDossier, EnvelopeMm, MountingChoice } from "./dossier";
import {
  MOUNTING_INTENT_LABEL,
  detectMountingIntent,
  satisfiesMountingIntent,
  type MountingIntent,
} from "./mounting-intent";

export type CandidateStatus = "kept" | "to_verify" | "excluded";

export interface CandidateResult {
  id: string;
  name: string;
  familyOnly: true;
  size: string;
  status: CandidateStatus;
  reasons: string[];
  /** Emboîtement : retenue DOCUMENTÉE dans ce trou, ou corps qui entre
   *  seulement physiquement (douille / adaptateur à prévoir). */
  retention?: "documented" | "adapter_required" | null;
}

/** Trou de montage documenté des capteurs encastrés MK36/MK37/MK38 : 3/8 po
 *  nominal, « au moins 9,53 mm » (fiches V00 du 17 janvier 2025). */
export const DOCUMENTED_PRESSFIT_HOLE_MM: Readonly<Record<string, number>> = { MK36: 9.53, MK37: 9.53, MK38: 9.53 };
/** Écart au-delà duquel le trou n'est plus le trou documenté. Ce n'est PAS une
 *  tolérance de serrage : aucune n'est publiée. */
const DOCUMENTED_HOLE_WINDOW_MM = 0.3;
/** Diamètre nominal du filetage lu dans la référence (« MK11-M8 » → 8). */
export function threadOf(sensorId: string): number | null {
  const m = /-M(\d+(?:\.\d+)?)$/.exec(sensorId);
  return m ? Number(m[1]) : null;
}

const SCREW_SHAPES = new Set(["flange", "block", "threaded"]);

function mountingVerdict(
  sensor: SensorModel,
  mounting: MountingChoice,
): { status: CandidateStatus; reason: string; retention?: "documented" | "adapter_required" } {
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
      if (mounting.style === "threaded_body") {
        if (sensor.shape !== "threaded")
          return { status: "excluded", reason: "Pas de corps fileté documenté pour ce boîtier." };
        const own = threadOf(sensor.id);
        if (mounting.threadMm && own !== null && Math.abs(own - mounting.threadMm) > 0.001)
          return { status: "excluded", reason: `Filetage M${own} documenté, filetage M${mounting.threadMm} demandé.` };
        return mounting.threadMm
          ? { status: "kept", reason: `Corps fileté M${own ?? mounting.threadMm} : se visse dans un trou taraudé du même filetage.` }
          : { status: "kept", reason: "Corps fileté : le capteur se visse dans un trou taraudé ou se fixe par écrous." };
      }
      if (mounting.style === "screw_fixed")
        return sensor.shape === "flange" || sensor.shape === "block"
          ? { status: "kept", reason: "Boîtier à fixation par vis." }
          : { status: "excluded", reason: "Pas de collerette ni de boîtier à fixer par vis documenté." };
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
      if (!["pressfit", "cylinder"].includes(sensor.shape))
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
      const documentedHole = DOCUMENTED_PRESSFIT_HOLE_MM[sensor.id];
      if (
        documentedHole !== undefined &&
        mounting.holeDiameterMm + 0.001 >= documentedHole &&
        mounting.holeDiameterMm <= documentedHole + DOCUMENTED_HOLE_WINDOW_MM
      )
        return {
          status: "to_verify",
          retention: "documented",
          reason:
            `Montage encastré documenté pour un trou de ${documentedHole} mm (3/8 po) avec nervures de maintien ; trou déclaré ${mounting.holeDiameterMm} mm : ajustement réel à confirmer, aucun serrage n'est garanti.` +
            collarNote,
        };
      return {
        status: "to_verify",
        retention: "adapter_required",
        reason:
          `Portion insérée ${insertion} mm dans un trou ${mounting.holeDiameterMm} mm : le corps entre, mais aucun maintien direct n'est documenté dans ce trou. Douille, adaptateur ou fixation complémentaire à étudier avec la R&D Standex.` +
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

/**
 * Fixation décrite en texte libre. C'est une CONTRAINTE DURE : « screw or
 * adhesive mounting » veut dire au moins une de ces deux fixations, donc un
 * boîtier dont la seule fixation documentée est le report sur circuit imprimé
 * (MK15, MK16, MK17…) est écarté, même si le client n'a coché aucune case.
 */
function intentVerdict(
  sensor: SensorModel,
  intent: MountingIntent,
): { status: CandidateStatus; reason: string } | null {
  if (!intent.explicit || sensor.shape === "custom_pcb") return null;
  const named = intent.kinds.map((k) => MOUNTING_INTENT_LABEL[k]).join(" ou ");
  if (satisfiesMountingIntent(sensor, intent))
    return {
      status: "to_verify",
      reason: `Fixation décrite (${named}) compatible de ce boîtier ; la fixation réelle (vis, appui, adhésif) reste à qualifier par les ingénieurs Standex.`,
    };
  return {
    status: "excluded",
    reason: `Fixation décrite (${named}) : ce boîtier n'a pas de fixation documentée de ce type. Aucun adhésif ni support n'est supposé à sa place.`,
  };
}

export function evaluateCandidates(
  dossier: Pick<DesignDossier, "mounting" | "envelope"> & {
    /** Réponse en texte libre sur le montage, telle qu'elle a été écrite. */
    mountingText?: string | null;
  },
  catalog: readonly SensorModel[] = SENSOR_CATALOG,
): CandidateResult[] {
  const intent = detectMountingIntent(dossier.mountingText ?? null);
  return catalog.map((sensor) => {
    const custom = sensor.shape === "custom_pcb";
    const reasons: string[] = [];
    const mount = mountingVerdict(sensor, dossier.mounting);
    reasons.push(mount.reason);
    let status = mount.status;
    const retention = mount.retention ?? null;
    const named = intentVerdict(sensor, intent);
    if (named) {
      reasons.push(named.reason);
      status = worst(status, named.status);
    }
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
      ...(retention ? { retention } : {}),
    };
  });
}

export const CANDIDATE_DISCLAIMER =
  "Aucun candidat n'est validé ici : la sélection définitive et la référence commandable sont établies par la revue R&D Standex.";
