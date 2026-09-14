/** Résumé de projet partagé entre « Mon montage » et « Avec Standex ».
 *
 * Trois états seulement, et ils ne se confondent jamais :
 * - `chosen` : l'utilisateur a réellement décidé quelque chose ;
 * - `delegated` : il a explicitement demandé « à définir avec Standex ». C'est
 *   une décision prise dans le parcours, ce n'est NI une valeur technique
 *   connue NI une validation R&D ;
 * - `todo` : rien n'a été décidé. L'existence d'un objet par défaut (couple
 *   d'ouverture de l'atelier, câblage vide, terminaison par défaut) ne coche
 *   jamais une étape : un dossier neuf n'est jamais « complet ».
 */
import type { DesignDossier } from "./dossier";

export type ChecklistState = "chosen" | "delegated" | "todo";

export interface ChecklistItem {
  id: "besoin" | "capteur" | "montage" | "cable";
  label: string;
  state: ChecklistState;
  /** Une phrase lisible, sans jargon. */
  detail: string;
  /** Onglet visé par le lien « Modifier ». */
  tab: string;
  /** Ancre de section, quand la modification vit dans la page. */
  section?: string;
}

export const DELEGATED_SENSOR = "sensor";
export const DELEGATED_CABLE = "cable";
export const DELEGATED_CONNECTOR = "connector";

export const isDelegated = (d: DesignDossier, key: string) =>
  (d.delegatedDecisions ?? []).includes(key);

const ANSWERED = new Set(["confirmed", "hypothesis"]);

export function projectChecklist(d: DesignDossier): ChecklistItem[] {
  const answered = d.requirements.filter(
    (r) => ANSWERED.has(r.state) && r.value.trim() !== "",
  ).length;
  const besoin: ChecklistItem = {
    id: "besoin",
    label: "Ce que vous voulez détecter",
    state: answered === 0 ? "todo" : "chosen",
    detail:
      answered === 0
        ? "Aucune réponse enregistrée pour l'instant."
        : `${answered} réponse(s) enregistrée(s) sur ${d.requirements.length || 6}.`,
    tab: "besoin",
  };

  const capteur: ChecklistItem = d.selectedSensorId
    ? {
        id: "capteur",
        label: "Capteur et aimant",
        state: "chosen",
        detail: `Gamme retenue : ${d.selectedSensorId}. Ce n'est pas encore une référence commandable.`,
        tab: "montage",
        section: "section-candidats",
      }
    : isDelegated(d, DELEGATED_SENSOR)
      ? {
          id: "capteur",
          label: "Capteur et aimant",
          state: "delegated",
          detail: "À définir avec Standex : aucune gamme n'est présélectionnée.",
          tab: "montage",
          section: "section-candidats",
        }
      : {
          id: "capteur",
          label: "Capteur et aimant",
          state: "todo",
          detail: "Aucun capteur choisi, et aucun choix confié à Standex.",
          tab: "montage",
          section: "section-candidats",
        };

  /** Le montage compte comme traité si un montage mécanique a été déclaré ou si
   * un modèle 3D de l'utilisateur a réellement été rattaché. Le couple ouvert
   * par défaut dans l'atelier ne suffit pas. */
  const mountingDeclared = d.mounting.kind !== "undecided";
  const modelAttached = d.workshopSource === "user_asset" && d.workshopAsset !== null;
  const montage: ChecklistItem = {
    id: "montage",
    label: "Où le capteur se place",
    state: mountingDeclared || modelAttached ? "chosen" : "todo",
    detail: modelAttached
      ? "Un modèle 3D de votre machine est rattaché à ce projet."
      : mountingDeclared
        ? "Montage mécanique déclaré."
        : "Ni montage déclaré, ni modèle 3D rattaché.",
    tab: "montage",
  };

  const lengthDecided = d.cabling.lengthChoice !== "undecided";
  const connectorChosen = d.termination.kind === "unqualified_connector";
  const cableDelegated = isDelegated(d, DELEGATED_CABLE);
  const connectorDelegated = isDelegated(d, DELEGATED_CONNECTOR);
  const cable: ChecklistItem = {
    id: "cable",
    label: "Câble et connecteur",
    state:
      lengthDecided || connectorChosen
        ? "chosen"
        : cableDelegated || connectorDelegated
          ? "delegated"
          : "todo",
    detail:
      lengthDecided || connectorChosen
        ? [
            lengthDecided ? "Longueur : choix enregistré, à confirmer en revue." : null,
            connectorChosen ? "Connecteur : préférence enregistrée, à vérifier par la R&D." : null,
          ]
            .filter(Boolean)
            .join(" ")
        : cableDelegated || connectorDelegated
          ? "À définir avec Standex."
          : "Rien de décidé : ce n'est pas obligatoire à ce stade.",
    tab: "montage",
    section: "section-cablage",
  };

  return [besoin, capteur, montage, cable];
}

/** Aucun pourcentage automatique : seules les étapes réellement traitées comptent,
 * et une délégation est comptée comme traitée SANS être une validation technique. */
export function checklistProgress(items: readonly ChecklistItem[]) {
  const handled = items.filter((i) => i.state !== "todo").length;
  return { handled, total: items.length };
}
