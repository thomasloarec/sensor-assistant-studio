/** Compatibilité pédagogique du BESOIN avec un capteur reed.
 *
 * Ce module est volontairement SÉPARÉ du verdict géométrique
 * (`candidates.ts`, qui ne juge que fixation, forme et encombrement). Il lit les
 * réponses réellement écrites par la personne et n'en déduit qu'une seule
 * chose : deux contraintes qu'elle a elle-même posées ne peuvent pas être vraies
 * en même temps.
 *
 * Règles non négociables :
 *  - aucune réponse n'est réécrite ici ; ce module ne renvoie que du texte ;
 *  - « inconnu » n'est jamais « incompatible » : sans preuve dans les réponses,
 *    aucun point n'est levé ;
 *  - la mention d'un moteur ou de 230 V ne suffit JAMAIS : il faut l'intention
 *    explicite de faire passer la puissance dans le capteur, et aucune interface
 *    (relais, contacteur, automate) décrite ailleurs ;
 *  - les textes sont canoniques en français et traduits au rendu par `t()`.
 */
import type { Requirement } from "./dossier";
import { ACTIVATION_GUIDE } from "@/lib/standex/activation-guide";

export type FitIssueId =
  | "direct_load_switching"
  | "no_magnetic_source"
  | "continuous_temperature_measurement"
  | "continuous_flow_measurement"
  | "extreme_temperature_review"
  | "extreme_gap_review"
  | "no_meaningful_requirement";

export interface FitStep {
  /** Clé d'exigence à ouvrir dans le questionnaire (jamais modifiée ici). */
  key: string;
  /** Numéro de la question tel qu'il est AFFICHÉ, null hors questionnaire. */
  number: number | null;
  /** Nom de l'étape tel qu'il est affiché dans l'interface. */
  label: string;
}

export interface FitEvidence {
  step: FitStep;
  /** Phrase de la personne, citée telle quelle : jamais traduite, jamais réécrite. */
  quote: string;
}

export interface FitChange {
  step: FitStep;
  /** Modification concrète proposée (canonique FR). */
  text: string;
}

export interface FitIssue {
  id: FitIssueId;
  title: string;
  whatWorks: string;
  whatFails: string;
  /** Trous de saisie de `whatFails`, déjà formatés (références, tensions). */
  whatFailsArgs: string[];
  why: string;
  /** Schéma pédagogique, étape par étape. Vide quand il n'apporte rien. */
  diagram: string[];
  /** Précautions à ne jamais laisser tomber (sécurité machine, etc.). */
  cautions: string[];
  changes: FitChange[];
  evidence: FitEvidence[];
  /** Étapes du questionnaire à revoir, dans l'ordre d'affichage. */
  steps: FitStep[];
}

export interface FitAssessment {
  issues: FitIssue[];
  /** Vrai dès qu'un point bloque : aucun produit n'est proposé dans cet état. */
  blocking: boolean;
}

/* i18n-canonical : libellés d'étapes, identiques à ceux du questionnaire. */
const STEP_TABLE: Record<string, FitStep> = {
  detection_goal: { key: "detection_goal", number: 1, label: "Application" },
  target_object: { key: "target_object", number: 2, label: "Élément à détecter" },
  states_motion: { key: "states_motion", number: 3, label: "Mouvement et détection" },
  mounting: { key: "mounting", number: 4, label: "Montage" },
  // Les dimensions se saisissent SOUS Montage : la même étape est visée.
  envelope: { key: "mounting", number: 4, label: "Montage" },
  electrical: { key: "electrical", number: 5, label: "Électrique" },
  environment: { key: "environment", number: 6, label: "Environnement" },
  // Le contexte projet est une précision EN PLUS des six questions : jamais
  // numéroté, libellé comme le champ réellement affiché dans le questionnaire.
  free_constraints: { key: "free_constraints", number: null, label: "Précision supplémentaire" },
};

const stepFor = (key: string): FitStep =>
  STEP_TABLE[key] ?? { key, number: null, label: "Précision supplémentaire" };

/** Minuscules sans accents, apostrophes ouvertes : « pas d'aimant » → « pas d aimant ». */
const norm = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

interface Fragment {
  step: FitStep;
  quote: string;
  text: string;
}

function fragments(requirements: readonly Requirement[], free: string): Fragment[] {
  const out: Fragment[] = [];
  const push = (key: string, raw: string) => {
    for (const sentence of raw.split(/(?<=[.;!?\n])\s+|\n+/)) {
      const quote = sentence.trim();
      if (quote) out.push({ step: stepFor(key), quote, text: norm(quote) });
    }
  };
  for (const r of requirements) if (r.value?.trim()) push(r.key, r.value);
  if (free.trim()) push("free_constraints", free);
  return out;
}

const anyMatch = (frags: Fragment[], patterns: readonly RegExp[]): Fragment[] =>
  frags.filter((f) => patterns.some((p) => p.test(f.text)));

/* ---------------------------------------------------------------------------
 * Point 1 — la puissance ne traverse pas le contact reed
 * ------------------------------------------------------------------------- */

/** Intention EXPLICITE de faire passer la charge dans le capteur. */
const DIRECT_SWITCH = [
  /(passe|passer|passage|circule|circuler|pass|passing|flow|flows|route|routed)[^.]{0,80}(directement|direct|directly)[^.]{0,80}(capteur|reed|ils|sensor|interrupteur|contact)/,
  /(directement|directly)[^.]{0,40}(par|via|through|dans|in|into)[^.]{0,30}(le |la |the )?(capteur|reed|sensor|contact)/,
  /(capteur|reed|sensor|contact)[^.]{0,60}(coupe|couper|commute|commuter|alimente|alimenter|switch|switches|switching|carry|carries|power|powers)[^.]{0,40}(directement|direct|directly)?[^.]{0,30}(moteur|motor|charge|load|puissance)/,
  /(commuter|commute|couper|switch|switching)[^.]{0,40}(directement|directly)[^.]{0,40}(le |la |the )?(moteur|motor|charge|load)/,
  /(alimenter|alimente|power|powers|powering|energise|energize)[^.]{0,40}(directement|directly)[^.]{0,40}(le |la |the )?(moteur|motor)/,
  /(directement|directly)[^.]{0,40}(alimenter|alimente|power|powering|powers)[^.]{0,40}(le |la |the )?(moteur|motor)/,
];

/** Négation DANS la phrase elle-même : « le capteur ne commute pas directement
 *  le moteur ». L'intention n'est affirmée que si la phrase QUI la porte ne la
 *  nie pas et ne décrit pas elle-même le câblage sûr. Une phrase sûre écrite
 *  AILLEURS n'annule jamais une intention directe restée dans une autre
 *  réponse : la contradiction demeure jusqu'à l'édition de cette réponse. */
const NEGATED_DIRECT = [
  /\b(ne|n)\s[^.]{0,60}\bpas\b/,
  /\b(jamais|never)\b/,
  /\b(non|not|no|does not|do not|doesn t|don t|without|sans|au lieu de|instead of|plutot que)\b[^.]{0,40}(directement|directly|direct)/,
  /(sans (passer|commuter|faire passer)|without (passing|switching|carrying))/,
];

/** Refus explicite de l'interface de puissance. */
const REFUSE_INTERFACE = [
  /\b(sans|pas de|aucun|aucune|eviter|eviter d|eviter de|no|without|avoid|avoiding)\b[^.]{0,50}(relais|relay|contacteur|contactor|interface de puissance|power interface)/,
  /(ne (veux|souhaite|voudrais) pas|do not want|don t want)[^.]{0,60}(relais|relay|contacteur|contactor)/,
];

/** Câblage réellement sûr décrit quelque part : le point n'est pas levé. */
const SAFE_WIRING = [
  /(pas de commutation directe|aucune commutation directe|no direct switching|not directly switch|ne commute pas directement|ne passe pas (par|dans) le capteur|does not pass through the sensor|not through the sensor)/,
  // \b obligatoire : « with » ne doit jamais être lu dans « without ».
  /\b(via|a travers|au travers|through|par|with)\b[^.]{0,40}(un |une |a |an )?(relais|relay|contacteur|contactor|interface de puissance|power interface|module de puissance)/,
  /(pilote|pilotage|commande|commandes|drives|drive|driving|controls|control|controlled|actionne)[^.]{0,50}(relais|relay|contacteur|contactor)/,
  /(relais|relay|contacteur|contactor)[^.]{0,60}(externe|external|separe|separate|dimensionne|rated|approprie|appropriate)/,
  /\b(automate|plc|api|controleur|controller|carte)\b[^.]{0,80}(contacteur|contactor|relais|relay)/,
  /(signal de commande|control signal|signal seul|signal uniquement|signal only|information de position seulement)/,
];

/** Charge réellement hors de portée d'un contact reed. */
function heavyLoad(frags: Fragment[]): { found: boolean; label: string | null } {
  const parts: string[] = [];
  for (const f of frags) {
    for (const m of f.text.matchAll(/(\d+(?:[.,]\d+)?)\s*(a|amp|amps|ampere|amperes)\b/g)) {
      const amps = Number(m[1]!.replace(",", "."));
      if (Number.isFinite(amps) && amps >= 1) parts.push(`${m[1]} A`);
    }
    for (const m of f.text.matchAll(/(\d{2,4})\s*v\s*(ac|alternatif|alternative)?\b/g)) {
      const volts = Number(m[1]);
      const ac = !!m[2];
      if (Number.isFinite(volts) && ((ac && volts >= 60) || volts >= 100))
        parts.push(ac ? `${volts} V AC` : `${volts} V`);
    }
    if (/\bvac\b/.test(f.text) && !parts.some((p) => p.includes("V AC"))) parts.push("VAC");
    if (/(triphase|three phase|three-phase)/.test(f.text)) parts.push("triphasé");
  }
  const unique = [...new Set(parts)];
  return { found: unique.length > 0, label: unique.length ? unique.join(" · ") : null };
}

/* ---------------------------------------------------------------------------
 * Point 2 — sans champ magnétique, pas de détection reed
 * ------------------------------------------------------------------------- */

/* Le refus doit porter DIRECTEMENT sur l'aimant : pas de virgule ni de
 * point-virgule entre la négation et le mot « aimant ». « Boîtier plastique non
 * magnétique, aimant sur le capot mobile » décrit un matériau, pas un refus, et
 * ne doit donc rien déclencher (`magnet\b` exclut « magnetic »). */
const REFUSE_MAGNET = [
  /(aucun|aucune|pas de|pas d|sans|no|without|non)\s?[^.,;]{0,22}(aimant|aimants|magnet|magnets)\b/,
  /(aucun|aucune|pas de|pas d|sans|no|without)\s?[^.,;]{0,22}(element magnetique|elements magnetiques|magnetic element|magnetic elements)\b/,
  /(aimant|aimants|magnet|magnets)\b[^.]{0,40}(interdit|interdite|interdits|impossible|not allowed|not permitted|forbidden|cannot be added|can not be added|can t be added)/,
  /(impossible|interdit|pas possible|not possible|cannot|can not|can t)[^.]{0,50}(ajouter|fixer|coller|add|adding|attach|fit)[^.]{0,30}(un |une |a |an )?(aimant|magnet)\b/,
];

/** Contexte BÉNIN, reconnu DANS LA PHRASE MÊME qui semble refuser : un aimant
 *  existe déjà et seul un aimant SUPPLÉMENTAIRE est jugé inutile. Une phrase
 *  « un aimant est déjà posé » écrite ailleurs ne suffit pas : une réponse qui
 *  interdit encore tout aimant reste une contradiction. */
const MAGNET_ALREADY_LOCAL = [
  /(aimant|magnet)\b[^.]{0,50}\b(deja|already)\b/,
  /\b(deja|already)\b[^.]{0,50}(un |une |a |an )?(aimant|magnet)\b/,
];

/** « L'aimant n'est PAS déjà posé » ne lève rien du tout. */
const NOT_ALREADY = [
  /\b(n est pas deja|nest pas deja|pas deja|is not already|isn t already|not already|no magnet is already)\b/,
];

const NON_MAGNETIC = [
  /\b(aluminium|aluminum|alu)\b/,
  /\b(inox|stainless|austenitique|austenitic)\b/,
  /\b(plastique|plastic|polymere|polymer|abs|pom)\b/,
  /\b(laiton|brass|cuivre|copper)\b/,
  /\b(verre|glass|ceramique|ceramic)\b/,
  /(non magnetique|non-magnetique|non magnetic|non-magnetic|amagnetique)/,
];

const MATERIAL_LABEL: { pattern: RegExp; label: string }[] = [
  { pattern: /\b(aluminium|aluminum|alu)\b/, label: "aluminium" },
  { pattern: /\b(inox|stainless|austenitique|austenitic)\b/, label: "inox" },
  { pattern: /\b(plastique|plastic|polymere|polymer|abs|pom)\b/, label: "plastique" },
  { pattern: /\b(laiton|brass)\b/, label: "laiton" },
  { pattern: /\b(cuivre|copper)\b/, label: "cuivre" },
  { pattern: /\b(verre|glass)\b/, label: "verre" },
];

const orderedSteps = (evidence: FitEvidence[], required: FitStep[]): FitStep[] => {
  const all = [...required, ...evidence.map((e) => e.step)];
  const seen = new Map<string, FitStep>();
  for (const s of all) if (!seen.has(s.key)) seen.set(s.key, s);
  return [...seen.values()].sort(
    (a, b) => (a.number ?? 99) - (b.number ?? 99) || (a.key < b.key ? -1 : 1),
  );
};

/** Choix structurés hors texte libre : un montage choisi ou une cote saisie
 *  sont de vraies exigences, même sans phrase écrite. */
export interface StructuredIntake {
  mountingChosen: boolean;
  envelopeSet: boolean;
}

const MEANINGFUL = /[\p{L}\p{N}]{2,}/u;

/** Vrai quand AUCUNE exigence réelle n'a été donnée (une question confiée à
 *  Standex sans texte reste une question sans réponse). */
export function intakeIsEmpty(
  requirements: readonly Requirement[],
  freeConstraints: string,
  structured: StructuredIntake,
): boolean {
  if (structured.mountingChosen || structured.envelopeSet) return false;
  if (MEANINGFUL.test(freeConstraints)) return false;
  return !requirements.some((r) => MEANINGFUL.test(r.value ?? ""));
}

export function assessApplicationFit(
  requirements: readonly Requirement[],
  freeConstraints = "",
  structured?: StructuredIntake,
): FitAssessment {
  const frags = fragments(requirements, freeConstraints);
  const issues: FitIssue[] = [];
  if (structured && intakeIsEmpty(requirements, freeConstraints, structured)) {
    const steps = ["detection_goal", "target_object", "states_motion"].map(stepFor);
    issues.push({
      id: "no_meaningful_requirement",
      title: "Décrivez votre besoin pour voir des capteurs proposés",
      whatWorks:
        "Une seule réponse concrète suffit pour commencer : ce que vous voulez détecter, ou l'élément qui bouge. Vous pouvez aussi confier vos questions aux ingénieurs Standex.",
      whatFails:
        "Proposer des capteurs alors qu'aucune question n'a de réponse : ce serait une suggestion au hasard, pas une recommandation.",
      whatFailsArgs: [],
      why: "Les capteurs proposés sont filtrés d'après vos réponses. Sans aucune réponse, aucun filtre ne peut s'appliquer.",
      diagram: [],
      cautions: [],
      changes: [
        { step: stepFor("detection_goal"), text: "Décrire en une phrase ce que le capteur doit détecter." },
      ],
      evidence: [],
      steps,
    });
    return { issues, blocking: true };
  }

  /* ---- Point 1 ---- */
  // Portée LOCALE : une phrase n'affirme l'intention directe que si elle ne la
  // nie pas et ne décrit pas elle-même le câblage sûr. Un câblage sûr écrit
  // ailleurs ne supprime pas une intention restée dans une autre réponse (par
  // exemple « alimenter directement le moteur » en Application) : la
  // contradiction demeure jusqu'à l'édition de CETTE réponse.
  // Une phrase qui REFUSE elle-même le relais ou le contacteur n'est jamais un
  // câblage sûr, même si elle contient « through … relay » plus loin.
  const localSafe = (f: Fragment) =>
    !REFUSE_INTERFACE.some((p) => p.test(f.text)) && SAFE_WIRING.some((p) => p.test(f.text));
  const direct = anyMatch(frags, DIRECT_SWITCH).filter(
    (f) => !localSafe(f) && !NEGATED_DIRECT.some((p) => p.test(f.text)),
  );
  const refuseInterface = anyMatch(frags, REFUSE_INTERFACE);
  const load = heavyLoad(frags);
  if ((direct.length > 0 || refuseInterface.length > 0) && load.found) {
    const evidence: FitEvidence[] = [...direct, ...refuseInterface].map((f) => ({
      step: f.step,
      quote: f.quote,
    }));
    const changes: FitChange[] = [
      {
        step: stepFor("electrical"),
        text: "Décrire le capteur comme un signal de commande (par exemple 24 V continu vers un automate ou une entrée logique) et garder l'alimentation du moteur sur un circuit séparé.",
      },
      {
        step: stepFor("electrical"),
        text: "Prévoir entre ce signal et le moteur un relais, un contacteur ou une interface de puissance dimensionnés pour la charge réelle du moteur.",
      },
    ];
    if (refuseInterface.length)
      changes.push({
        step: refuseInterface[0]!.step,
        text: "Retirer le refus d'un relais ou d'un contacteur, ou expliquer ce qui l'empêche chez vous : sans interface, aucun capteur reed ne convient.",
      });
    if (direct.some((f) => f.step.key === "detection_goal"))
      changes.push({
        step: stepFor("detection_goal"),
        text: "Reformuler l'application si le capteur doit encore alimenter le moteur lui-même.",
      });
    issues.push({
      id: "direct_load_switching",
      title: "Le capteur ne peut pas couper lui-même l'alimentation du moteur",
      whatWorks:
        "Un capteur reed convient tout à fait pour donner le SIGNAL de position : savoir si le capot est fermé, et transmettre cette information.",
      whatFails: load.label
        ? "Faire passer l'alimentation du moteur ({0}) directement dans le contact du capteur."
        : "Faire passer l'alimentation du moteur directement dans le contact du capteur.",
      whatFailsArgs: load.label ? [load.label] : [],
      why: "La charge du moteur et son courant d'appel au démarrage dépassent largement ce qu'un contact reed peut couper. Les contacts peuvent se souder ou se dégrader, et la machine peut alors démarrer ou rester en marche sans commande.",
      diagram: [
        "Capteur reed (signal de position)",
        "Entrée de commande compatible (automate, carte, entrée logique)",
        "Relais ou contacteur dimensionné pour la charge",
        "Moteur (circuit de puissance séparé)",
      ],
      cautions: [
        "Le circuit de puissance du moteur et le circuit de signal du capteur restent deux circuits distincts.",
        "Un moteur est une charge inductive à fort courant d'appel : l'interface de puissance doit être dimensionnée et protégée en conséquence, avec une protection adaptée au type d'alimentation. Voir les précautions de charge Standex.",
        "Un capteur reed sur un capot donne une information de position. Il ne constitue pas à lui seul un verrouillage de sécurité machine certifié.",
      ],
      changes,
      evidence,
      steps: orderedSteps(evidence, [stepFor("electrical")]),
    });
  }

  /* ---- Point 2 ---- */
  // Portée LOCALE encore : une phrase ne cesse d'être un refus que si ELLE dit
  // qu'un aimant existe déjà et que seul un aimant SUPPLÉMENTAIRE est inutile.
  // « Aucun aimant ne peut être ajouté » en Montage reste une contradiction même
  // si une autre réponse mentionne un aimant déjà posé.
  const refuseMagnet = anyMatch(frags, REFUSE_MAGNET).filter(
    (f) =>
      !(
        MAGNET_ALREADY_LOCAL.some((p) => p.test(f.text)) &&
        !NOT_ALREADY.some((p) => p.test(f.text))
      ),
  );
  if (refuseMagnet.length > 0) {
    const evidence: FitEvidence[] = refuseMagnet.map((f) => ({ step: f.step, quote: f.quote }));
    const materialFrag = anyMatch(frags, NON_MAGNETIC)[0] ?? null;
    const material = materialFrag
      ? (MATERIAL_LABEL.find((m) => m.pattern.test(materialFrag.text))?.label ?? null)
      : null;
    issues.push({
      id: "no_magnetic_source",
      title: "Sans champ magnétique, aucun capteur reed ne peut détecter cette pièce",
      whatWorks:
        "La position peut être détectée si un champ magnétique adapté vient actionner le capteur reed : un aimant sur la pièce mobile ou sur son support suffit, convoyeur compris.",
      whatFails: material
        ? "Un capteur reed réagit à un champ magnétique. Une pièce en {0} non aimantée n'en produit aucun : le contact ne se fermera jamais."
        : "Un capteur reed réagit à un champ magnétique. Une pièce qui n'en produit aucun ne fermera jamais le contact.",
      whatFailsArgs: material ? [material] : [],
      why: "Vos réponses interdisent aujourd'hui d'ajouter un aimant ou un élément magnétique. Ces deux points ne peuvent pas être vrais en même temps.",
      diagram: [],
      cautions: [
        "Une conception sur mesure ne change rien à ce point : elle ne crée pas de champ magnétique là où il n'y en a pas.",
      ],
      changes: [
        {
          step: stepFor("target_object"),
          text: "Autoriser un aimant sur la pièce mobile ou sur son support : c'est la voie la plus simple.",
        },
        {
          step: stepFor("mounting"),
          text: "Revoir aussi la réponse de montage qui interdit tout aimant, sinon la contradiction demeure.",
        },
        {
          step: stepFor("states_motion"),
          text: "Indiquer ensuite la distance réelle entre l'aimant et le capteur, aimant en place.",
        },
        {
          step: stepFor("target_object"),
          text: material === "aluminium"
            ? "Ou conserver la contrainte « aucun aimant » : il faut alors évaluer une autre technologie de détection, par exemple un détecteur inductif prévu pour l'aluminium ou une détection optique, selon la distance réelle et l'environnement. Aucun produit reed ne résout ce cas, et nous ne garantissons pas d'avance la performance d'une autre technologie."
            : "Ou conserver la contrainte « aucun aimant » : il faut alors évaluer une autre technologie de détection, par exemple inductive ou optique, selon la distance réelle et l'environnement. Aucun produit reed ne résout ce cas, et nous ne garantissons pas d'avance la performance d'une autre technologie.",
        },
      ],
      evidence,
      steps: orderedSteps(evidence, [
        stepFor("target_object"),
        stepFor("states_motion"),
        stepFor("mounting"),
      ]),
    });
  }

  issues.push(...assessModalityAndLimits(frags));
  return { issues, blocking: issues.length > 0 };
}

/* ---------------------------------------------------------------------------
 * Points 3 à 6 — modalité de mesure incompatible, limites hors documentation
 * Deux natures DISTINCTES :
 *  - modalité inadaptée : un reed + aimant donne un état tout-ou-rien, il ne
 *    mesure pas une grandeur continue (température, débit) ;
 *  - aucune correspondance standard documentée : la demande peut relever d'une
 *    étude d'ingénierie Standex, rien n'est déclaré impossible.
 * Chaque point exige une preuve écrite explicite ; l'inconnu ne bloque jamais.
 * ------------------------------------------------------------------------- */

const ANALOG_CONTINUOUS = [
  /\b4\s*(?:-|–|to|a)\s*20\s*ma\b/,
  /\b0\s*(?:-|–|to|a)\s*10\s*v\b/,
  /\b(analog|analogue|analogique|proportionnel|proportionnelle|proportional|proportionally|continuous|continuously|continue|continu|en continu)\b/,
];
const TEMPERATURE_MEASURE = [
  /\b(mesur\w*|measur\w*|monitor\w*|suivre|suivi)\b[^.]{0,40}\b(temperature|temperatures)\b/,
  /\b(temperature|temperatures)\b[^.]{0,20}\b(measurement|measuring|mesure|monitoring)\b/,
];
const FLOW_MEASURE = [
  /\b(mesur\w*|measur\w*|monitor\w*)\b[^.]{0,50}\b(debit|flow|flow rate|flowrate)\b/,
  /\b(debit|flow rate|volumetric flow|water flow|fluid flow|flow measurement)\b/,
  /\bl\s?\/\s?min\b/,
];
const FORBID_MOVING = [
  /\b(sans|without|no|pas de|pas d|aucun|aucune)\b[^.,;]{0,40}\b(turbine|rotor|flotteur|float|piece mobile|pieces mobiles|moving part|moving parts|moving element|moving elements|element mobile|elements mobiles|palette|paddle|aimant|magnet)\b/,
];
/** Une partie mobile ou un aimant décrits positivement : la mesure n'est plus
 *  une pure grandeur continue, on ne bloque pas (flotteur magnétique, rotor). */
const MAGNETIC_MOVER = /\b(aimant|magnet|magnetique|magnetic|flotteur|float|rotor|turbine|porte|door|capot|lid|position)\b/;
const LEVEL_THRESHOLD = /\b(niveau|level|seuil|threshold|trop plein|overflow)\b/;

const negatedMover = (text: string) => FORBID_MOVING.some((p) => p.test(text));

/** Températures explicites en °C dans une phrase. */
function temperaturesC(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/([+-]?\d{2,3}(?:[.,]\d+)?)\s*(?:°|º|deg|degres|degrees)\s*c?\b|([+-]?\d{2,3}(?:[.,]\d+)?)\s*c\b/g)) {
    const n = Number((m[1] ?? m[2])!.replace(",", "."));
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}
const THERMAL_OPERATING =
  /\b(continu|continue|continuous|continuously|permanent|permanente|en permanence|ambient|ambiante|ambiant|fonctionn\w*|operat\w*|withstand|resist\w*|tenir|remain|rester|reste|doit|must|expose|exposed|peak|pointe|pic|stay|survive)\b/;
const THERMAL_COMPARISON =
  /\b(unlike|contrairement|compared|comparison|comparaison|par rapport|far below|bien en dessous|bien inferieur|next door|voisin|voisine|whereas|alors que|not exposed|pas expose|jamais expose|never exposed|isole|isolated|away from|loin de)\b/;
/** Au-delà, aucune limite de fonctionnement de gamme n'est vérifiée dans l'outil. */
const EXTREME_TEMPERATURE_C = 150;

/** Plus grande distance publiée au guide : au-delà, rien n'est documenté. */
const MAX_DOCUMENTED_GAP_MM = (() => {
  let max = 0;
  for (const r of ACTIVATION_GUIDE.rows)
    for (const v of [r.upMm, r.toMm]) if (typeof v === "number" && Number.isFinite(v)) max = Math.max(max, v);
  return max;
})();
const GAP_CONTEXT = /\b(aimant|magnet|sensing|detect\w*|capteur|sensor|ecart|gap|entrefer|distance|away|loin|portee|range)\b/;
const CABLE_CONTEXT = /\b(cable|cables|cord|wire|wires|fil|fils|longueur de cable|cable length)\b/;

function explicitGapsMm(text: string): number[] {
  if (!GAP_CONTEXT.test(text) || CABLE_CONTEXT.test(text)) return [];
  const out: number[] = [];
  const unit = (n: number, u: string) => (u === "m" ? n * 1000 : u === "cm" ? n * 10 : n);
  for (const m of text.matchAll(/\b(?:at|a|distance|gap|ecart|entrefer|range|portee|from|jusqu a|up to)\s+(?:of |de |d )?(\d+(?:[.,]\d+)?)\s*(mm|cm|m)\b/g))
    out.push(unit(Number(m[1]!.replace(",", ".")), m[2]!));
  for (const m of text.matchAll(/(\d+(?:[.,]\d+)?)\s*(mm|cm|m)\s+(?:away|de distance|d ecart|of distance|gap|loin)\b/g))
    out.push(unit(Number(m[1]!.replace(",", ".")), m[2]!));
  return out.filter(Number.isFinite);
}

function assessModalityAndLimits(frags: Fragment[]): FitIssue[] {
  const issues: FitIssue[] = [];
  const analog = anyMatch(frags, ANALOG_CONTINUOUS);
  // Une partie mobile ou un aimant décrits POSITIVEMENT quelque part (non niés
  // dans leur phrase) : la détection reed reste plausible, on ne bloque pas.
  const positiveMover = frags.some((f) => MAGNETIC_MOVER.test(f.text) && !negatedMover(f.text));
  const level = frags.some((f) => LEVEL_THRESHOLD.test(f.text));
  const ask = [stepFor("detection_goal"), stepFor("states_motion"), stepFor("electrical")];

  /* ---- Température mesurée en continu ---- */
  const tempMeasure = anyMatch(frags, TEMPERATURE_MEASURE);
  const tempModality = tempMeasure.length > 0 && analog.length > 0 && !positiveMover && !level;
  if (tempModality) {
    const evidence = [...tempMeasure, ...analog.filter((f) => !tempMeasure.includes(f))].map((f) => ({ step: f.step, quote: f.quote }));
    issues.push({
      id: "continuous_temperature_measurement",
      title: "Un capteur reed ne mesure pas une température en continu",
      whatWorks:
        "Un capteur reed associé à un aimant donne un état tout-ou-rien : présence, position, fin de course ou seuil d'un élément mobile.",
      whatFails:
        "Fournir une mesure proportionnelle et continue de température (signal analogique) : ce n'est pas le principe d'un contact reed.",
      whatFailsArgs: [],
      why: "Le contact reed s'ouvre ou se ferme sous l'effet d'un champ magnétique. Il ne produit pas de valeur proportionnelle à la température.",
      diagram: [],
      cautions: [
        "Une mesure de température continue relève d'une autre technologie (sonde de température, thermocouple, RTD) : nous ne garantissons pas d'avance sa performance.",
      ],
      changes: [
        { step: stepFor("detection_goal"), text: "Si votre besoin est en réalité un état (seuil atteint, position d'un élément mobile), décrivez cet état et l'élément qui bouge." },
        { step: stepFor("electrical"), text: "Indiquer si un signal tout-ou-rien convient à la place d'un signal analogique." },
      ],
      evidence,
      steps: orderedSteps(evidence, ask),
    });
  }

  /* ---- Débit mesuré en continu sans élément mobile ---- */
  const flowMeasure = anyMatch(frags, FLOW_MEASURE);
  const forbidMoving = anyMatch(frags, FORBID_MOVING);
  const flowMover = frags.some(
    (f) => /\b(rotor|turbine|flotteur|float|palette|paddle)\b/.test(f.text) && !negatedMover(f.text),
  );
  if (flowMeasure.length > 0 && analog.length > 0 && forbidMoving.length > 0 && !flowMover && !level) {
    const seen = new Set<Fragment>();
    const evidence = [...flowMeasure, ...forbidMoving, ...analog]
      .filter((f) => (seen.has(f) ? false : (seen.add(f), true)))
      .map((f) => ({ step: f.step, quote: f.quote }));
    issues.push({
      id: "continuous_flow_measurement",
      title: "Un capteur reed ne mesure pas un débit en continu sans élément mobile aimanté",
      whatWorks:
        "Un capteur reed peut signaler un passage ou un seuil quand un élément aimanté bouge avec le fluide (rotor, palette ou flotteur instrumenté).",
      whatFails:
        "Mesurer un débit de façon proportionnelle et continue dans une conduite sans aucun aimant ni élément mobile : le contact n'a rien qui l'actionne.",
      whatFailsArgs: [],
      why: "Vos réponses interdisent tout élément mobile ou aimant dans la conduite et demandent un signal analogique. Un contact reed ne fournit qu'un état tout-ou-rien déclenché par un champ magnétique.",
      diagram: [],
      cautions: [
        "Une mesure de débit sans pièce mobile relève d'une autre technologie (électromagnétique, ultrasons, thermique) : nous ne garantissons pas d'avance sa performance.",
      ],
      changes: [
        { step: stepFor("target_object"), text: "Indiquer si un élément mobile aimanté (rotor, palette, flotteur) peut être intégré à la conduite." },
        { step: stepFor("electrical"), text: "Indiquer si un signal d'impulsions ou de seuil convient à la place d'un signal analogique." },
      ],
      evidence,
      steps: orderedSteps(evidence, [stepFor("target_object"), stepFor("electrical")]),
    });
  }

  /* ---- Température de fonctionnement au-delà de toute limite vérifiée ---- */
  if (!tempModality) {
    const hot = frags.filter((f) => {
      const temps = temperaturesC(f.text);
      return (
        temps.some((n) => n >= EXTREME_TEMPERATURE_C) &&
        THERMAL_OPERATING.test(f.text) &&
        !THERMAL_COMPARISON.test(f.text)
      );
    });
    if (hot.length > 0) {
      const max = Math.max(...hot.flatMap((f) => temperaturesC(f.text)));
      const evidence = hot.map((f) => ({ step: f.step, quote: f.quote }));
      issues.push({
        id: "extreme_temperature_review",
        title: "Aucune correspondance standard documentée à cette température",
        whatWorks:
          "Votre projet peut être étudié par l'ingénierie Standex : une solution adaptée à cette température n'est pas exclue.",
        whatFails:
          "Proposer ici un capteur standard pour {0} °C au point de montage : aucune limite de fonctionnement vérifiée dans cet outil ne couvre cette température.",
        whatFailsArgs: [String(max)],
        why: "Proposer une gamme standard sans limite de température vérifiée laisserait croire qu'elle convient. La tenue du capteur, de l'aimant et du câble doit être évaluée par la R&D Standex.",
        diagram: [],
        cautions: [
          "Ce n'est ni un refus ni une impossibilité : c'est une revue d'ingénierie Standex obligatoire avant toute proposition.",
        ],
        changes: [
          { step: stepFor("environment"), text: "Préciser la température réelle au point de montage du capteur et de l'aimant, en continu et en pointe." },
          { step: stepFor("environment"), text: "Si cette température concerne une autre zone de la machine, l'indiquer : le capteur peut être placé à l'écart de la source de chaleur." },
        ],
        evidence,
        steps: orderedSteps(evidence, [stepFor("environment")]),
      });
    }
  }

  /* ---- Distance de détection au-delà de toute distance publiée ---- */
  const far = frags.filter((f) => explicitGapsMm(f.text).some((mm) => mm > MAX_DOCUMENTED_GAP_MM));
  if (far.length > 0) {
    const max = Math.max(...far.flatMap((f) => explicitGapsMm(f.text)));
    const evidence = far.map((f) => ({ step: f.step, quote: f.quote }));
    issues.push({
      id: "extreme_gap_review",
      title: "Aucune distance de détection documentée à cet écart",
      whatWorks:
        "Votre besoin peut faire l'objet d'une étude de faisabilité par l'ingénierie Standex, sans engagement de résultat.",
      whatFails:
        "Annoncer un capteur standard à {0} mm de l'aimant : c'est au-delà de toutes les distances d'activation publiées par Standex.",
      whatFailsArgs: [String(max)],
      why: "La distance d'activation dépend de l'aimant, de son orientation et du capteur. Aucune distance n'est extrapolée au-delà des valeurs publiées, et aucune précision de position n'est garantie sans essai.",
      diagram: [],
      cautions: [
        "Un aimant plus gros, un écart réduit ou un autre emplacement peuvent changer la conclusion : rien n'est déclaré impossible ici.",
      ],
      changes: [
        { step: stepFor("states_motion"), text: "Indiquer si l'aimant peut être rapproché du capteur, et la distance réelle possible." },
        { step: stepFor("target_object"), text: "Indiquer si un aimant plus grand peut être utilisé." },
      ],
      evidence,
      steps: orderedSteps(evidence, [stepFor("states_motion"), stepFor("target_object")]),
    });
  }
  return issues;
}

/* i18n-canonical : textes de l'encart pédagogique, traduits au rendu. */
export const FIT_PANEL = {
  titleOne: "Un point à revoir avant de proposer des produits",
  titleMany: "Points à revoir avant de proposer des produits",
  intro:
    "Votre objectif peut être étudié avec une architecture adaptée. Tel qu'il est décrit aujourd'hui, il ne peut pas fonctionner : voici ce qui fonctionne, ce qui ne fonctionne pas, et les adaptations possibles.",
  works: "Ce qui fonctionne",
  fails: "Ce qui ne fonctionne pas",
  why: "Pourquoi",
  diagram: "Le câblage habituel",
  changes: "Adaptations possibles",
  changeAction: "Modifier cette réponse",
  review: "Revoir vos réponses",
  yourWords: "Voir ce que vous avez écrit",
  noRewrite:
    "Vos réponses ne sont jamais modifiées à votre place. Ces boutons ouvrent la question concernée : vous décidez de ce qui change.",
  noProducts:
    "Aucun produit n'est proposé tant que ces points subsistent. Si vous ne souhaitez pas modifier ces contraintes, c'est une limite réelle de la technologie reed, pas un refus de notre part.",
  resolved:
    "Vos réponses ne présentent plus de contradiction : les couples proposés sont de nouveau affichés.",
  demoNotApplication:
    "Les distances d'une démonstration ne valent pas vérification de votre application : ce point de compatibilité reste à traiter.",
  historicalDemo:
    "Démonstration magnétique antérieure, conservée telle quelle : elle ne vaut pas validation de l'application décrite aujourd'hui.",
  /** Lien nommé : l'URL brute n'est jamais affichée dans le texte pédagogique. */
  sourceLabel: "Précautions de manipulation et de charge — Standex",
  sourceUrl:
    "https://standexdetect.com/resources/reed-technology-academy/handling-and-load-precautions/",
  resultOverline: "Point de compatibilité à traiter",
  resultHeadline: "Cette démonstration ne répond pas encore à votre besoin",
} as const;
