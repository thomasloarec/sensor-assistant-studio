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
  id: "besoin" | "sources" | "capteur" | "montage" | "cable" | "connecteur" | "contexte";
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
export const DELEGATED_MOUNTING = "mounting";
export const DELEGATED_CONTEXT = "context";

/** Une question guidée explicitement laissée de côté par « Je ne sais pas
 * encore ». La décision est TRAITÉE dans le parcours ; elle ne fabrique aucune
 * valeur technique et n'alimente aucun filtre. */
export const DELEGATED_QUESTION_PREFIX = "question:";
export const delegatedQuestion = (key: string) => `${DELEGATED_QUESTION_PREFIX}${key}`;

export const isDelegated = (d: DesignDossier, key: string) =>
  (d.delegatedDecisions ?? []).includes(key);

export const delegatedQuestionKeys = (d: DesignDossier): string[] =>
  (d.delegatedDecisions ?? [])
    .filter((k) => k.startsWith(DELEGATED_QUESTION_PREFIX))
    .map((k) => k.slice(DELEGATED_QUESTION_PREFIX.length));

const ANSWERED = new Set(["confirmed", "hypothesis"]);

/** Les six questions guidées : la liste de référence, indépendante du nombre de
 * lignes déjà écrites dans le dossier. */
export const GUIDED_QUESTION_KEYS = [
  "detection_goal",
  "states_motion",
  "mounting",
  "envelope",
  "electrical",
  "environment",
] as const;

export function projectChecklist(d: DesignDossier): ChecklistItem[] {
  const answeredRows = d.requirements.filter(
    (r) => ANSWERED.has(r.state) && r.value.trim() !== "",
  );
  const answeredKeys = new Set(answeredRows.map((r) => r.key));
  const answered = answeredRows.length;
  const setAside = delegatedQuestionKeys(d);
  const setAsideSet = new Set(setAside);
  /** Une question n'est traitée que si elle est répondue OU explicitement mise
   * de côté. Une seule réponse sur six ne coche donc rien. */
  const handledQuestions = GUIDED_QUESTION_KEYS.filter(
    (k) => answeredKeys.has(k) || setAsideSet.has(k),
  ).length;
  const allQuestionsHandled = handledQuestions === GUIDED_QUESTION_KEYS.length;
  const besoin: ChecklistItem = {
    id: "besoin",
    label: "Ce que vous voulez détecter",
    state: allQuestionsHandled ? (answered > 0 ? "chosen" : "delegated") : "todo",
    detail: allQuestionsHandled
      ? answered > 0
        ? `Les ${GUIDED_QUESTION_KEYS.length} questions sont traitées, dont ${answered} avec une réponse de votre part.`
        : "Toutes les questions sont laissées à définir avec Standex : aucune valeur technique n'en est déduite."
      : `${handledQuestions} question(s) traitée(s) sur ${GUIDED_QUESTION_KEYS.length}. Répondez, ou dites « je ne sais pas encore » pour les autres.`,
    tab: "besoin",
  };

  /** Provenance des exigences : une valeur importée ou proposée par l'assistant
   * n'est jamais réputée confirmée par vous tant qu'elle n'est pas relue. */
  const unconfirmed = d.requirements.filter(
    (r) => r.value.trim() !== "" && (r.state !== "confirmed" || r.source !== "user"),
  );
  const sources: ChecklistItem = {
    id: "sources",
    label: "Provenance de vos informations",
    state:
      answered === 0
        ? "todo"
        : unconfirmed.length === 0
          ? "chosen"
          : "delegated",
    detail:
      answered === 0
        ? "Aucune information à vérifier pour l'instant."
        : unconfirmed.length === 0
          ? "Toutes les informations enregistrées viennent de vous et sont confirmées."
          : `${unconfirmed.length} information(s) restent à confirmer (hypothèse, import ou proposition) : Standex les reprendra avec vous.`,
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
  /** Délégation du placement : soit explicite (bouton « confier à Standex »),
   * soit par une question de montage/encombrement mise de côté. */
  const mountingSetAside =
    isDelegated(d, DELEGATED_MOUNTING) ||
    setAside.includes("mounting") ||
    setAside.includes("envelope");
  const montage: ChecklistItem = {
    id: "montage",
    label: "Où le capteur se place",
    state:
      mountingDeclared || modelAttached ? "chosen" : mountingSetAside ? "delegated" : "todo",
    detail: modelAttached
      ? "Un modèle 3D de votre machine est rattaché à ce projet."
      : mountingDeclared
        ? "Montage mécanique déclaré."
        : mountingSetAside
          ? "Placement à définir avec Standex."
          : "Ni montage déclaré, ni modèle 3D rattaché.",
    tab: "montage",
  };

  /* Le câble et le connecteur sont deux décisions séparées : choisir une
   * longueur ne dit rien du connecteur, et inversement. */
  const lengthDecided = d.cabling.lengthChoice !== "undecided";
  const connectorChosen = d.termination.kind === "unqualified_connector";
  const cableDelegated = isDelegated(d, DELEGATED_CABLE);
  const connectorDelegated = isDelegated(d, DELEGATED_CONNECTOR);
  const cable: ChecklistItem = {
    id: "cable",
    label: "Longueur de câble",
    state: lengthDecided ? "chosen" : cableDelegated ? "delegated" : "todo",
    detail: lengthDecided
      ? "Longueur : choix enregistré, à confirmer en revue."
      : cableDelegated
        ? "Longueur à définir avec Standex."
        : "Longueur non définie : ce n'est pas obligatoire à ce stade.",
    tab: "montage",
    section: "section-cablage",
  };
  const connecteur: ChecklistItem = {
    id: "connecteur",
    label: "Connecteur",
    state: connectorChosen ? "chosen" : connectorDelegated ? "delegated" : "todo",
    detail: connectorChosen
      ? "Connecteur : préférence enregistrée, à vérifier par la R&D."
      : connectorDelegated
        ? "Choix du connecteur confié à Standex."
        : "Aucune préférence de connecteur exprimée.",
    tab: "montage",
    section: "section-cablage",
  };

  /* Dernière étape : contexte du projet et interlocuteur. Aucun objet par
   * défaut ne coche cette ligne — il faut une valeur réellement saisie. */
  const contextFilled =
    d.business.projectPhase !== "unknown" ||
    d.business.annualVolume.kind !== "unknown" ||
    d.business.seriesStartDate !== null ||
    d.business.samplesNeededBy !== null;
  const contactFilled =
    (d.business.contactName ?? "").trim() !== "" ||
    (d.business.contactEmail ?? "").trim() !== "" ||
    (d.business.contactCompany ?? "").trim() !== "";
  const contexte: ChecklistItem = {
    id: "contexte",
    label: "Contexte du projet et contact",
    state:
      contextFilled && contactFilled
        ? "chosen"
        : isDelegated(d, DELEGATED_CONTEXT)
          ? "delegated"
          : "todo",
    detail:
      contextFilled && contactFilled
        ? "Contexte et interlocuteur renseignés."
        : isDelegated(d, DELEGATED_CONTEXT)
          ? "Contexte à préciser avec Standex."
          : contactFilled
            ? "Contact renseigné, contexte du projet encore vide."
            : contextFilled
              ? "Contexte renseigné, il manque encore votre contact."
              : "À renseigner à la dernière étape, avant d'échanger avec Standex.",
    tab: "revue",
  };

  return [besoin, sources, capteur, montage, cable, connecteur, contexte];
}

/** Aucun pourcentage automatique : seules les étapes réellement traitées comptent,
 * et une délégation est comptée comme traitée SANS être une validation technique. */
export function checklistProgress(items: readonly ChecklistItem[]) {
  const handled = items.filter((i) => i.state !== "todo").length;
  return { handled, total: items.length };
}
