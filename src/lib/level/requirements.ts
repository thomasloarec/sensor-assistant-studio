import { assessConfiguration, configurationIssues, finiteInput, type LevelConfiguration, type LevelContext } from "./configuration";
import { assessApplicationFit, isSubstantive } from "../leadmagnet/application-fit";

const norm = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[’']/g, " ");
const clauses = (value: string) => norm(value).split(/[;.!?\n,]|\b(?:mais|but|et|and)\s+(?=(?:aucune?|no|not)\b)/);
const positive = (value: string, pattern: RegExp) => clauses(value).some(s => pattern.test(s) && !/\b(?:aucun|aucune|pas de|no|not|without)\b/.test(s));

/** A narrow, explainable reading of explicit intent. Raw answers are never rewritten. */
export function statedLevelGoal(context: LevelContext): "low" | "high" | null {
  const low = positive(context.purpose, /niveau bas|low (?:liquid )?level|marche a sec|dry.running/);
  const high = positive(context.purpose, /niveau haut|high (?:liquid )?level|debordement|overflow/);
  return low === high ? null : low ? "low" : "high";
}

export const LEVEL_REQUIREMENT_MESSAGES = {
  empty: "Décrivez le niveau à détecter ou choisissez un objectif. Standex peut vous aider à préciser le besoin ; aucune famille n’est sélectionnée au hasard.",
  scope: "Cette demande ne décrit pas un projet de détection. Précisez le besoin de capteur pour poursuivre avec Standex.",
  solid: "Le texte décrit un produit solide, tandis que ce parcours étudie un flotteur dans un liquide. Clarifiez le milieu ; Standex peut étudier une autre architecture de détection.",
  goal: "Le texte et le niveau choisi se contredisent. Confirmez le ou les niveaux à détecter ; vos réponses sont conservées.",
  inferred: "Le sens haut ou bas de cette illustration provient de votre description. Les dimensions inconnues restent des hypothèses à confirmer.",
  access: "Le texte et l’accès choisi se contredisent. Confirmez l’ouverture disponible avant de retenir un montage.",
  magnetic: "Le flotteur actionne un contact grâce à un aimant. Précisez où le champ est interdit : un aimant et un capteur déportés, un support ou une liaison mécanique peuvent être étudiés avec Standex, sans garantir leur faisabilité.",
  movement: "Cette architecture utilise un flotteur mobile. Si son mouvement est interdit dans le liquide, Standex peut étudier une chambre déportée ou une autre implantation. Aucune solution à flotteur n’est validée en l’état.",
  accessClosed: "Un flotteur interne nécessite un accès au liquide. Sans perçage ni accès intérieur, étudions un indicateur existant, une chambre externe ou une autre implantation avec Standex.",
  certification: "Les exigences ATEX, SIL ou OSSD demandent une étude de la construction et du système complet. Aucune certification ni fonction de sécurité n’est garantie par cette illustration.",
  hygiene: "Contact alimentaire et nettoyage : préciser les matériaux, joints, agents, températures et cycles CIP/SIP. La conformité hygiénique reste à valider par Standex.",
  viscosity: "Préciser la viscosité et la densité aux températures d’utilisation, les dépôts et le risque de collage. La flottabilité et le mouvement du flotteur restent à vérifier avec Standex.",
  freezing: "Confirmez que le milieu reste liquide aux températures déclarées : gel, chauffage, pression ou additif peuvent changer les conditions. Un flotteur immobilisé par la glace ne détecte plus le niveau.",
  load: "Le contact doit fournir un signal de commande. Séparez la puissance du moteur avec un relais, un contacteur ou une interface adaptés à la tension, au courant et aux transitoires ; Standex doit valider le circuit.",
  precision: "Précisez la précision, la résolution et la sortie électrique attendues. Le dessin ne garantit ni 0,01 mm ni une sortie 4–20 mA ; la chaîne de mesure doit être étudiée avec Standex.",
} as const;
export type LevelRequirementId = keyof typeof LEVEL_REQUIREMENT_MESSAGES;
export function levelRequirements(context: LevelContext) {
  const issues: { id: LevelRequirementId; message: string; study: boolean }[] = [];
  const add = (id: LevelRequirementId, study = true) => issues.push({id, message: LEVEL_REQUIREMENT_MESSAGES[id], study});
  const text = norm([context.purpose, context.constraints, context.fluidName].join(". "));
  const purpose = norm(context.purpose), constraints = norm(context.constraints);
  const fit = assessApplicationFit([{key:"detection_goal",label:"Application",value:context.purpose,state:"confirmed",source:"user",unit:null}], context.constraints);
  const unrelated = fit.issues.some(issue => issue.id === "outside_sensor_scope") || /(?:meteo|weather|pizza|poeme|poem)/.test(purpose) && /aucun (?:capteur|besoin de detection)|ne cherche (?:pas|aucun)|no (?:sensor|detection)|not looking for/.test(purpose);
  if (unrelated) add("scope");
  else if (!isSubstantive(context.purpose) && !isSubstantive(context.constraints) && context.detectionGoal === "unknown") add("empty");
  if (/farine seche|poudre seche|dry (?:powder|flour)|aucun liquide|no liquid/.test(text)) add("solid");
  const stated = statedLevelGoal(context);
  if (stated && context.detectionGoal === "unknown") add("inferred", false);
  // Explicit exclusivity is a conflict; changing a structured goal alone can be intentional.
  if (stated && context.detectionGoal !== stated && ["low", "high"].includes(context.detectionGoal) && /uniquement|seulement|\bonly\b|aucune alarme|no .*alarm/.test(purpose)) add("goal");
  if ((context.mountingAccess === "top" && /(?:acces|montage|installation) (?:uniquement |seulement )?lateral|(?:haut|top).{0,20}(?:impossible|interdit)|side (?:access )?only/.test(constraints)) ||
      (context.mountingAccess === "side" && /(?:acces|montage) (?:uniquement |seulement )(?:en haut|par le haut)|top (?:access )?only/.test(constraints))) add("access");
  if (clauses(text).some(part => /\b(?:aucun|sans|interdit|no|without|forbidden)\b[^.;]{0,55}(?:champ magnetique|aimant|magnet)|(?:champ magnetique|aimant|magnetic field|magnet)[^.;]{0,35}(?:interdit|forbidden|not allowed)/.test(part)
    && !/(?:aucune|no) (?:restriction|interdiction)|pas interdit|not forbidden|sans restriction/.test(part))) add("magnetic");
  if (/(?:aucun|sans|no|without)\s+(?:flotteur|float)|(?:aucune|no)\s+(?:piece mobile|moving part)/.test(text)) add("movement");
  if (/aucun percage|sans percage|no drilling|aucun acces a l interieur|external detection only|detection exterieure uniquement/.test(text)) add("accessClosed");
  if (/\batex\b|\bsil\s*[1-4]\b|\bossd\b/.test(text)) add("certification", false);
  if (/alimentaire|hygieni|\bcip\b|\bsip\b|food.contact|food.grade/.test(text)) add("hygiene", false);
  if (/viscos|densit|miel|honey|collage|susceptible de coller/.test(text)) add("viscosity", false);
  if ((context.fluid === "water" && (finiteInput(context.temperatureMin) ?? 1) <= 0) || /(?:eau|water).{0,35}(?:gele|frozen|ice)/.test(text))
    add("freezing", /(?:eau|water).{0,35}(?:gele|frozen|ice)/.test(text) || (context.fluid === "water" && (finiteInput(context.temperatureMax) ?? 1) < 0 && !/glycol|antigel|antifreeze/.test(text)));
  if (fit.issues.some(issue => issue.id === "direct_load_switching")) add("load");
  if (/precision|accuracy|resolution|4\s*[-–]\s*20\s*ma/.test(text)) add("precision", false);
  return issues;
}

/** One decision for the UI, dossier and exports; geometry alone never qualifies a project. */
export function assessLevelProject(context: LevelContext, config: LevelConfiguration) {
  const base = assessConfiguration(context, config);
  const requirements = levelRequirements(context);
  const geometry = configurationIssues(config, base.selected?.family);
  const study = requirements.some(issue => issue.study) || geometry.length > 0;
  const warnings = [...new Set([...requirements.map(issue => issue.message), ...geometry, ...(base.selected?.reasons ?? [])])];
  return {...base, selected: study ? null : base.selected, specific: base.specific || study,
    requirements, warnings};
}
