import { isPcbSensor } from "./product-presentation";
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
  id: "besoin" | "capteur" | "montage" | "cable" | "connecteur" | "contexte";
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

/** Demande d'essai réel adressée à Standex. Champ ADDITIF : c'est une clé de
 * `delegatedDecisions`, déjà sérialisée et relue par les dossiers existants —
 * aucune migration, aucune colonne nouvelle. Cocher cette case demande une
 * mesure ; ce n'est ni une mesure, ni une validation R&D, ni un engagement. */
export const TRIAL_REQUEST = "trial_request";

/** Choix explicite de fils nus. La terminaison par défaut du dossier EST
 * `bare_leads` : sans ce marqueur, elle ne coche donc rien. */
export const CHOSEN_BARE_LEADS = "chosen:bare_leads";

/** Forme minimale d'un e-mail de retour (alignée sur l'exigence d'envoi). */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  const answeredRows = d.requirements.filter((r) => ANSWERED.has(r.state) && r.value.trim() !== "");
  const answeredKeys = new Set(answeredRows.map((r) => r.key));
  const answered = answeredRows.length;
  const setAside = delegatedQuestionKeys(d);
  const setAsideSet = new Set(setAside);
  /** Choix STRUCTURÉS saisis dans les questions : une fixation cliquée ou une
   * dimension mesurée est une réponse traitée, même sans texte libre. Sinon le
   * résumé redemanderait indéfiniment ces deux questions. */
  const envelopeGiven = [d.envelope.lengthMm, d.envelope.widthMm, d.envelope.heightMm].some(
    (v) => typeof v === "number" && Number.isFinite(v) && v > 0,
  );
  const structured = new Set<string>();
  if (d.mounting.kind !== "undecided") structured.add("mounting");
  if (envelopeGiven) structured.add("envelope");
  /** Une question n'est traitée que si elle est répondue (texte libre OU choix
   * structuré) OU explicitement mise de côté. Une seule réponse sur six ne coche
   * donc rien. */
  const handledQuestions = GUIDED_QUESTION_KEYS.filter(
    (k) => answeredKeys.has(k) || structured.has(k) || setAsideSet.has(k),
  ).length;
  /** Réponses réellement données par l'utilisateur, texte libre et choix
   * structurés confondus — jamais une valeur par défaut du dossier. */
  const givenByUser =
    answered + GUIDED_QUESTION_KEYS.filter((k) => structured.has(k) && !answeredKeys.has(k)).length;
  const allQuestionsHandled = handledQuestions === GUIDED_QUESTION_KEYS.length;
  const besoin: ChecklistItem = {
    id: "besoin",
    label: "Ce que vous voulez détecter",
    state: allQuestionsHandled ? (givenByUser > 0 ? "chosen" : "delegated") : "todo",
    detail: allQuestionsHandled
      ? givenByUser > 0
        ? `Les ${GUIDED_QUESTION_KEYS.length} questions sont traitées, dont ${givenByUser} avec une réponse de votre part.`
        : "Toutes les questions sont laissées à définir avec Standex : aucune valeur technique n'en est déduite."
      : `${handledQuestions} question(s) traitée(s) sur ${GUIDED_QUESTION_KEYS.length}. Répondez, ou dites « je ne sais pas encore » pour les autres.`,
    tab: "besoin",
  };

  /* La provenance des exigences (hypothèse, import, proposition à confirmer)
     reste visible dans le détail des exigences : ce n'est pas une étape du
     parcours, et elle ne bloque jamais la complétude du résumé. */

  const capteur: ChecklistItem = d.selectedSensorId
    ? {
        id: "capteur",
        label: "Capteur et aimant",
        state: "chosen",
        detail: `${
          d.workshop && d.workshop.sensorId === d.selectedSensorId
            ? `Couple retenu : ${d.selectedSensorId} + ${d.workshop.magnetModel}`
            : `Gamme retenue : ${d.selectedSensorId}`
        }. Ce n'est pas encore une référence commandable.`,
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
    state: mountingDeclared || modelAttached ? "chosen" : mountingSetAside ? "delegated" : "todo",
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
  const cableDelegated = isDelegated(d, DELEGATED_CABLE);
  const connectorDelegated = isDelegated(d, DELEGATED_CONNECTOR);
  /** Longueur chiffrée réellement retenue dans l'atelier, s'il y en a une. */
  const lengthMm = d.workshop?.cableLengthMm ?? null;
  const lengthDecided = d.cabling.lengthChoice !== "undecided" || lengthMm !== null;
  const lengthText =
    lengthMm !== null
      ? `Longueur retenue : ${lengthMm} mm (à confirmer en revue).`
      : d.cabling.lengthChoice === "standard_to_confirm"
        ? "Longueur de gamme, valeur exacte à confirmer en revue."
        : "Longueur sur mesure, valeur exacte à confirmer en revue.";
  const cable: ChecklistItem = {
    id: "cable",
    label: "Longueur de câble",
    // Une délégation explicite prime : une préférence ancienne conservée dans le
    // dossier ne « décoche » pas ce qui a ensuite été confié à Standex.
    state: cableDelegated ? "delegated" : lengthDecided ? "chosen" : "todo",
    detail: cableDelegated
      ? "Longueur à définir avec Standex."
      : lengthDecided
        ? lengthText
        : "Longueur non définie : ce n'est pas obligatoire à ce stade.",
    tab: "revue",
    section: "section-cablage",
  };

  /** Valeur du connecteur réellement choisi. La terminaison par défaut
   * (`bare_leads` d'un dossier neuf) ne compte pas : il faut un choix explicite. */
  const t = d.termination;
  const connectorValue =
    t.kind === "unqualified_connector"
      ? `${t.spec.manufacturer} ${t.spec.mpn}`.trim()
      : t.kind === "qualified_connector"
        ? `${t.combo.connector.manufacturer} ${t.combo.connector.mpn}`.trim()
        : t.kind === "free_reference" && t.text.trim() !== ""
          ? t.text.trim()
          : t.kind === "bare_leads" && isDelegated(d, CHOSEN_BARE_LEADS)
            ? "Fils nus, sans connecteur"
            : null;
  const connecteur: ChecklistItem = {
    id: "connecteur",
    label: "Connecteur",
    state: connectorDelegated ? "delegated" : connectorValue !== null ? "chosen" : "todo",
    detail: connectorDelegated
      ? "Choix du connecteur confié à Standex."
      : connectorValue !== null
        ? `Connecteur retenu : ${connectorValue} — à vérifier par la R&D.`
        : "Aucune préférence de connecteur exprimée.",
    tab: "revue",
    section: "section-cablage",
  };

  /* Dernière étape : contexte du projet et interlocuteur. Aucun objet par
   * défaut ne coche cette ligne — il faut une valeur réellement saisie. */
  /* La phase « exploration » est la valeur par défaut d'un dossier neuf :
   * elle ne compte pas comme un contexte réellement saisi. */
  const contextFilled =
    (d.business.projectPhase !== "unknown" && d.business.projectPhase !== "exploration") ||
    d.business.annualVolume.kind !== "unknown" ||
    d.business.seriesStartDate !== null ||
    d.business.samplesNeededBy !== null;
  /* Un e-mail de retour valide est indispensable : l'envoi l'exige. Un nom
   * ou une société seuls ne suffisent pas, et déléguer le contexte ne
   * délègue PAS l'identité du prospect. */
  const emailFilled = EMAIL_PATTERN.test((d.business.contactEmail ?? "").trim());
  const contextDelegated = isDelegated(d, DELEGATED_CONTEXT) || (d.business.undefinedFields?.length ?? 0) > 0;
  const contexte: ChecklistItem = {
    id: "contexte",
    label: "Contexte du projet et contact",
    state: !emailFilled
      ? "todo"
      : contextFilled
        ? "chosen"
        : contextDelegated
          ? "delegated"
          : "todo",
    detail: !emailFilled
      ? contextDelegated
        ? "Contexte à préciser avec Standex ; ajoutez votre e-mail pour recevoir notre retour."
        : contextFilled
          ? "Contexte renseigné ; ajoutez votre e-mail pour recevoir notre retour."
          : "À renseigner à la dernière étape, avec votre e-mail, avant d'échanger avec Standex."
      : contextFilled
        ? "Contexte et interlocuteur renseignés."
        : contextDelegated
          ? "Contexte à préciser avec Standex."
          : "E-mail renseigné, contexte du projet encore vide.",
    tab: "revue",
  };

  return [besoin, capteur, montage, ...(isPcbSensor(d.selectedSensorId) ? [] : [cable, connecteur]), contexte];
}

/** Aucun pourcentage automatique : seules les étapes réellement traitées comptent,
 * et une délégation est comptée comme traitée SANS être une validation technique. */
export function checklistProgress(items: readonly ChecklistItem[]) {
  const handled = items.filter((i) => i.state !== "todo").length;
  return { handled, total: items.length };
}
