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

export type FitIssueId = "direct_load_switching" | "no_magnetic_source";

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
  /(sans|pas de|aucun|aucune|eviter|eviter d|eviter de|no|without|avoid|avoiding)[^.]{0,50}(relais|relay|contacteur|contactor|interface de puissance|power interface)/,
  /(ne (veux|souhaite|voudrais) pas|do not want|don t want)[^.]{0,60}(relais|relay|contacteur|contactor)/,
];

/** Câblage réellement sûr décrit quelque part : le point n'est pas levé. */
const SAFE_WIRING = [
  /(pas de commutation directe|aucune commutation directe|no direct switching|not directly switch|ne commute pas directement|ne passe pas (par|dans) le capteur|does not pass through the sensor|not through the sensor)/,
  /(via|a travers|au travers|through|par|with)[^.]{0,40}(un |une |a |an )?(relais|relay|contacteur|contactor|interface de puissance|power interface|module de puissance)/,
  /(pilote|pilotage|commande|commandes|drives|drive|driving|controls|control|controlled|actionne)[^.]{0,50}(relais|relay|contacteur|contactor)/,
  /(relais|relay|contacteur|contactor)[^.]{0,60}(externe|external|separe|separate|dimensionne|rated|approprie|appropriate)/,
  /(automate|plc|api|controleur|controller|carte)[^.]{0,80}(contacteur|contactor|relais|relay)/,
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

export function assessApplicationFit(
  requirements: readonly Requirement[],
  freeConstraints = "",
): FitAssessment {
  const frags = fragments(requirements, freeConstraints);
  const issues: FitIssue[] = [];

  /* ---- Point 1 ---- */
  // Portée LOCALE : une phrase n'affirme l'intention directe que si elle ne la
  // nie pas et ne décrit pas elle-même le câblage sûr. Un câblage sûr écrit
  // ailleurs ne supprime pas une intention restée dans une autre réponse (par
  // exemple « alimenter directement le moteur » en Application) : la
  // contradiction demeure jusqu'à l'édition de CETTE réponse.
  const localSafe = (f: Fragment) => SAFE_WIRING.some((p) => p.test(f.text));
  const direct = anyMatch(frags, DIRECT_SWITCH).filter(
    (f) => !localSafe(f) && !NEGATED_DIRECT.some((p) => p.test(f.text)),
  );
  const refuseInterface = anyMatch(frags, REFUSE_INTERFACE).filter((f) => !localSafe(f));
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

  return { issues, blocking: issues.length > 0 };
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
  resultOverline: "Point de compatibilité à traiter",
  resultHeadline: "Cette démonstration ne répond pas encore à votre besoin",
} as const;
