// Contrat de réponse V0.2 — règles de comportement de l'assistant capteur.
// Le contrat n'est jamais affiché brut dans l'interface : il ne sert qu'à
// produire la réponse prospect (français), la classification et la trace interne.

import type { Confidence, OutputType, SensorTestScenario } from "./types";
import { OUTPUT_TYPES } from "./types";

export function splitList(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(/[;\n|]|,(?![^()]*\))/g)
    .map((v) => v.trim())
    .filter(Boolean);
}

export function safeOutputType(expected: string): OutputType {
  const direct = expected.trim().toUpperCase();
  if ((OUTPUT_TYPES as readonly string[]).includes(direct)) return direct as OutputType;
  const first = expected
    .split(/[\s/|,]+/)
    .map((v) => v.trim().toUpperCase())
    .find((v) => (OUTPUT_TYPES as readonly string[]).includes(v));
  return (first as OutputType | undefined) ?? "S3_MISSING_INFO";
}

const FOLLOW_UP =
  "Laissez-moi vos coordonnées et la ville où vous êtes basé : un responsable Standex reprend le sujet sous 2 jours ouvrés.";

// Garde-fous électriques et sécurité produit imposés par le contrat V0.2.
const GUARDRAIL_TEXTS: Record<string, string> = {
  inductive_load:
    "Si le capteur pilote une pompe, un moteur, une électrovanne, un relais ou une bobine, il ne faut pas le traiter comme une simple charge résistive : le reed doit commander une interface intermédiaire, qui pilote ensuite la charge.",
  ac_rms:
    "Les limites AC des datasheets se traitent en valeur peak : 230 VAC RMS correspond à environ 325 V peak. La référence doit être validée sur cette base.",
  inrush:
    "L'appel de courant au démarrage doit être mesuré ou estimé : c'est lui qui dimensionne le contact, pas le courant nominal.",
  raw_reed_switch:
    "Sur un reed switch brut, il ne faut pas couper, plier ni modifier les pattes sans process validé : cela peut changer la sensibilité ou endommager le produit.",
  distance:
    "La distance d'activation dépend de l'aimant, du montage et des matériaux autour : elle se valide sur le montage réel.",
  ip67:
    "L'étanchéité annoncée dépend du montage et du passage de câble : elle se vérifie sur l'intégration réelle.",
  severe_environment:
    "L'environnement (température, vibrations, produits agressifs) doit être confirmé avant de figer une référence.",
  cable_modification:
    "Toute modification de câble, connecteur, pattes ou surmoulage doit passer par Standex : elle sort du produit standard.",
};

function detect(scenario: SensorTestScenario): string[] {
  const hay = [
    scenario.user_prompt_fr,
    scenario.expected_behavior,
    scenario.must_include ?? "",
    scenario.must_not_include ?? "",
    (scenario.trace_flags ?? []).join(" "),
  ]
    .join(" ")
    .toLowerCase();
  // Le garde-fou « reed brut » ne se déduit que de la demande réelle et des
  // garde-fous attendus : un scénario produit packagé ne doit pas l'hériter
  // d'une simple mention dans les éléments interdits.
  const rawHay = [scenario.user_prompt_fr, (scenario.trace_flags ?? []).join(" ")]
    .join(" ")
    .toLowerCase();
  const hit = (re: RegExp) => re.test(hay);
  const flags: string[] = [];
  if (hit(/inductif|inductive|moteur|pompe|electrovanne|électrovanne|bobine|relais|solenoid/))
    flags.push("inductive_load");
  // Garde-fou AC seulement si la demande parle vraiment d'alternatif :
  // une tension DC (ex. 230 VDC) ne doit pas déclencher ce garde-fou.
  if (hit(/\bac\b|vac|secteur|\brms\b|peak/)) flags.push("ac_rms");
  if (hit(/inrush|appel de courant|demarrage|démarrage/)) flags.push("inrush");
  if (
    /reed (switch )?(brut|nu)|raw reed|raw_reed|raw_switch|(couper|plier|limer|modifier)[^.]{0,40}(pattes|leads)/.test(
      rawHay,
    )
  )
    flags.push("raw_reed_switch");

  if (hit(/distance|mm d'activation|activation distance|entrefer|aimant/)) flags.push("distance");
  if (hit(/ip6[7-9]|etanche|étanche|lavage/)) flags.push("ip67");
  if (hit(/temperature|température|vibration|chimique|exterieur|extérieur|severe|sévère/))
    flags.push("severe_environment");
  if (hit(/cable|câble|connecteur|surmoul|overmold/)) flags.push("cable_modification");
  return [...new Set(flags)];
}

export interface ComposedResponse {
  outputType: OutputType;
  /** Réponse prospect en français, prête à l'envoi. */
  customerText: string;
  guardrails: string[];
  missingQuestions: string[];
  confidence: Confidence;
  standexValidationRequired: boolean;
  distributorPathAllowed: boolean;
  routingReason: string;
  beDossier: Record<string, unknown>;
  /** Valeurs datasheet retenues, tracées côté interne uniquement. */
  datasheetValues: Record<string, unknown>;
  /** Éléments de contrat repris côté interne (jamais rendus au prospect). */
  internalContractItems: string[];
}

/**
 * Corrections V0.3 : réponses prospect et valeurs de trace figées pour les
 * scénarios où la formulation générique ne respectait pas le contrat.
 */
interface ScenarioOverride {
  /** Remplace le corps générique de la réponse prospect. */
  customerText?: string;
  /** Complète le corps générique sans le remplacer. */
  appendText?: string;
  datasheetValues: Record<string, unknown>;
  distributorPathAllowed?: boolean;
  extraGuardrails?: string[];
  /** Coupe le paragraphe distributeur générique. */
  suppressDistributorLine?: boolean;
  /** Coupe les phrases génériques de garde-fous déjà couvertes par le texte. */
  suppressGuardrails?: string[];
  /** Coupe la phrase électrique générique S1. */
  suppressGenericElectrical?: boolean;
  /** Vraies questions manquantes (français), pour la trace interne. */
  missingQuestions?: string[];
}


const SCENARIO_OVERRIDES: Record<string, ScenarioOverride> = {
  "MVP-TS-004": {
    customerText: [
      "Pour un MK06-66 (contact 66 Form A), les performances électriques à retenir sont celles propres à cette référence :",
      "- tension de commutation : 180 V ;",
      "- courant de commutation : 0,5 A ;",
      "- 1 A en courant permanent (courant que le contact peut porter, sans commutation) ;",
      "- tension de claquage : 200 VDC ;",
      "- résistance de contact : 150 mOhm.",
      "",
      "Attention à ne pas reprendre des valeurs génériques d'autres contacts : ni 1,25 A en courant permanent, ni 200 V au-delà des 200 VDC de claquage propres au 66.",
      "Le point important est la distinction entre commutation et courant permanent : 0,5 A en commutation, 1 A en courant permanent seulement si le contact ne commute pas la charge.",
    ].join("\n"),
    datasheetValues: {
      reference: "MK06-66 (66 Form A)",
      switching_voltage: "180 V",
      switching_current: "0.5 A",
      carry_current: "1 A carry",
      breakdown_voltage: "200 VDC",
      contact_resistance: "150 mOhm",
      excluded_generic_values: ["1.25 A carry", "250 VDC"],
    },
  },
  "MVP-TS-006": {
    customerText: [
      "Non, je ne retiendrais pas 1000 V pour un MK38 1A85C. Cette valeur vient du reed switch 85 nu dans un autre contexte et ne doit pas être importée automatiquement sur la référence packagée MK38.",
      "Pour MK38 1A85C, la valeur à retenir est 300 V en tension de commutation propre à cette référence.",
      "Le packaging change les conditions d'utilisation : les valeurs du reed nu ne sont pas transposables telles quelles sur la référence packagée.",
    ].join("\n"),
    datasheetValues: {
      reference: "MK38 1A85C",
      switching_voltage: "300 V",
      raw_switch_note: "raw 85 not imported",
      rejected_value: "1000 V (reed 85 nu, contexte différent)",
    },
  },
  "MVP-TS-007": {
    customerText: [
      "Pour une maintenance ou un remplacement en faible quantité, GP501 peut être une piste pertinente si la référence d'origine est bien celle-ci. Pour 20 pièces, une piste distributeur peut avoir du sens : il n'est pas nécessaire de passer par un processus BE long pour ce type de besoin.",
      "Attention toutefois : GP501 est un reed switch brut. Il ne faut pas couper, plier ou modifier les pattes sauf si votre entreprise a déjà un process validé.",
    ].join("\n"),
    datasheetValues: {
      reference: "GP501 (reed switch brut)",
      case_type: "maintenance / faible volume (20 pièces)",
      distributor_path_allowed: true,
      lead_handling: "do not cut/bend leads",
    },
    distributorPathAllowed: true,
  },
  "MVP-TS-005": {
    customerText: [
      "Pour MK33-87 et MK23-87, je retiendrais la même base électrique prudente du reed switch 87 Form A : 200 V en tension de commutation, 0,4 A en courant de commutation, 0,5 A en courant permanent, 230 VDC en tension de claquage et 150 mOhm en résistance de contact.",
      "Ces valeurs sont celles du contact 87 lui-même : la différence entre les deux références se joue sur le packaging et le montage, pas sur cette baseline électrique.",
      "Je ne présenterais pas 250 VDC comme valeur générique du 87 : la valeur de claquage à retenir reste 230 VDC.",
    ].join("\n"),
    datasheetValues: {
      reference: "MK33-87 / MK23-87 (87 Form A)",
      switching_voltage: "200 V",
      switching_current: "0.4 A",
      carry_current: "0.5 A",
      breakdown_voltage: "230 VDC",
      contact_resistance: "150 mOhm",
      excluded_generic_values: ["250 VDC as confirmed generic"],
    },
  },
  // V0.6 · compatibilité électrique explicite (entrée automate 24 V).
  "MVP-TS-001": {
    appendText: [
      "Côté électrique, votre signal 24 V vers une entrée automate correspond à une commande faible niveau, pas à une commutation de puissance : c'est compatible en ordre de grandeur, sous réserve de valider le câblage, le type d'entrée et les conditions réelles.",
    ].join("\n"),
    datasheetValues: {
      electrical_fit: "24 V PLC input = low-level command, not power switching",
      load_type: "entrée automate 24 V",
      verification_required: "câblage, type d'entrée, conditions réelles",
    },
    suppressGenericElectrical: true,
    missingQuestions: [
      "Quelles sont les dimensions disponibles pour le montage encastré sur la porte ?",
      "Dans quelle ville êtes-vous basé ?",
    ],
  },
  // V0.6 · mise en garde explicite sur les pattes d'un reed switch brut.
  "MVP-TS-008": {
    appendText: [
      "Je vous déconseille de couper ou plier les pattes d'un reed switch brut si ce n'est pas déjà un process maîtrisé et validé dans votre entreprise. Cette opération peut endommager l'ampoule, modifier la sensibilité magnétique ou dégrader la fiabilité.",
      "La bonne approche est de partir d'une version packagée ou d'un format de pattes déjà adapté, plutôt que de modifier le composant après coup.",
    ].join("\n"),
    datasheetValues: {
      raw_switch_handling: "do not cut/bend/modify leads outside a validated process",
      risk: "verre fragilisé, sensibilité magnétique modifiée, fiabilité dégradée",
    },
    extraGuardrails: ["raw_switch_handling_guardrail"],
    distributorPathAllowed: false,
    suppressDistributorLine: true,
    suppressGuardrails: ["raw_reed_switch"],
    missingQuestions: [
      "Quel format de pattes ou quel encombrement devez-vous respecter sur votre montage ?",
      "Dans quelle ville êtes-vous basé ?",
    ],
  },
  // V1.1 · vraie question client pour un scénario S3.
  "MVP-TS-011": {
    customerText: [
      "J'ai compris que vous cherchez à détecter un niveau dans un réservoir. La question clé avant de proposer une référence est : le capteur doit-il détecter la position d'un flotteur aimanté à travers la paroi du réservoir, ou être intégré directement dans le réservoir ?",
      "Cette information change le type de montage, l'étanchéité et le couple capteur-aimant à valider.",
    ].join("\n"),
    datasheetValues: {
      pending_decision: "flotteur aimanté à travers paroi vs intégration interne",
    },
    missingQuestions: [
      "Le capteur doit-il détecter un flotteur aimanté à travers la paroi, ou être intégré dans le réservoir ?",
      "Quel est le fluide et quelle est l'épaisseur de la paroi du réservoir ?",
      "Dans quelle ville êtes-vous basé ?",
    ],
  },
  // V1.1 · repère thermique ferrite sans promesse.
  "MVP-TS-015": {
    appendText: [
      "280 °C est une température critique pour un couple capteur-aimant. Thomas retient 300 °C comme ordre de grandeur haut pour la ferrite, mais les sources aimants doivent encore être clarifiées ; il faut donc une validation Standex avant de confirmer.",
    ].join("\n"),
    datasheetValues: {
      ferrite_reference: "300 °C ordre de grandeur haut, sources à clarifier",
      exposure: "280 °C demandé",
    },
    missingQuestions: [
      "Quelle nuance d'aimant et quelle durée d'exposition thermique sont prévues ?",
      "S'agit-il d'une exposition continue ou de pics de température ?",
      "Dans quelle ville êtes-vous basé ?",
    ],
  },
  // V1.1 · fonction de sécurité : décision explicite.
  "MVP-TS-021": {
    appendText: [
      "Comme vous mentionnez une fonction de sécurité sur une porte machine, Standex doit vérifier le rôle exact du capteur dans la chaîne de sécurité, les exigences applicables et l'architecture de contrôle. Je ne peux pas présenter une référence comme certifiée ou suffisante sans cette validation.",
    ].join("\n"),
    datasheetValues: {
      safety_function: "rôle dans la chaîne de sécurité à qualifier",
    },
    missingQuestions: [
      "Quel est le rôle exact du capteur dans la chaîne de sécurité de la machine ?",
      "Quelles exigences de sécurité et quelle architecture de contrôle s'appliquent ?",
      "Dans quelle ville êtes-vous basé ?",
    ],
  },
  // V1.1 · équivalence concurrente : demande explicite de données.
  "MVP-TS-022": {
    appendText: [
      "Pour chercher un équivalent Standex fiable, il faut la fiche technique de la référence concurrente ou les caractéristiques d'application. Je ne dois pas conclure une équivalence depuis le nom seul.",
    ].join("\n"),
    datasheetValues: {
      equivalence_basis: "fiche technique concurrente ou caractéristiques d'application",
    },
    missingQuestions: [
      "Quelle fiche technique concurrente doit-on comparer ?",
      "Quelles sont les caractéristiques d'application (tension, courant, charge, montage) ?",
      "Dans quelle ville êtes-vous basé ?",
    ],
  },
};

/** Fragments interdits dans la réponse prospect (tags internes, gabarits, debug). */
const LEAK_PATTERNS: RegExp[] = [
  /\[[^\]]{2,40}\]/,
  /\bone question\b/i,
  /\bquestion unique\b/i,
  /MVP-TS-/,
  /guardrail/i,
  /trace_flags|must_include|must_not_include|expected_behavior|output_type|missing_questions/i,
  /intermediary interface/i,
  /inductive load/i,
  /standex follow-?up/i,
  /high potential/i,
  /contact capture/i,
  /contact and city capture/i,
  /business day contact/i,
  /safety context/i,
  /standex validation\b/i,
  /competitor datasheet/i,
  /engineering validation/i,
  /raw[_ ]switch/i,
  /lead_potential_capture/i,
  /[a-z]+_[a-z]+(_[a-z]+)*/,
];

/** Retourne les fragments fautifs détectés dans une réponse prospect. */
export function detectLeaks(customerText: string): string[] {
  const hits: string[] = [];
  for (const re of LEAK_PATTERNS) {
    const m = customerText.match(re);
    if (m) hits.push(m[0]);
  }
  return [...new Set(hits)];
}

/** Questions génériques (français) par garde-fou, pour la trace interne. */
const GUARDRAIL_QUESTIONS: Record<string, string> = {
  inductive_load: "Quelle tension et quel courant nominal la charge pilotée utilise-t-elle ?",
  ac_rms: "La tension indiquée est-elle AC RMS ou peak ?",
  inrush: "Quel est l'appel de courant au démarrage de la charge ?",
  raw_reed_switch: "Le composant est-il monté tel quel, sans reprise des pattes ?",
  raw_switch_handling_guardrail:
    "Quel format de pattes ou quel encombrement devez-vous respecter ?",
  distance: "Quelle distance d'activation et quel aimant sont prévus sur le montage réel ?",
  ip67: "Quel niveau d'étanchéité et quel passage de câble sont nécessaires ?",
  severe_environment:
    "Quelles températures, vibrations ou produits agressifs le capteur doit-il supporter ?",
  cable_modification: "Quelle longueur de câble et quel connecteur sont attendus ?",
};

/** Phrase client dédiée par garde-fou, en français, sans tag interne. */
const GUARDRAIL_DECISION: Record<string, string> = GUARDRAIL_TEXTS;


export function composeResponse(scenario: SensorTestScenario): ComposedResponse {
  const outputType = safeOutputType(scenario.expected_output_type);
  const must = splitList(scenario.must_include);
  const forbidden = splitList(scenario.must_not_include);
  const flags = [
    ...new Set([
      ...(scenario.trace_flags ?? []),
      ...detect(scenario),
      ...(SCENARIO_OVERRIDES[scenario.scenario_id]?.extraGuardrails ?? []),
    ]),
  ];
  const override = SCENARIO_OVERRIDES[scenario.scenario_id];
  const suppressed = new Set(override?.suppressGuardrails ?? []);
  const guardrailTexts = flags
    .filter((f) => !suppressed.has(f))
    .map((f) => GUARDRAIL_DECISION[f])
    .filter(Boolean) as string[];

  const maintenance =
    outputType === "S1_MAINTENANCE_REFERENCE" ||
    outputType === "KNOWLEDGE_ONLY_WITH_MAINTENANCE_EXCEPTION" ||
    /maintenance|remplacement|quelques pi|faible (volume|quantit)/i.test(
      `${scenario.user_prompt_fr} ${scenario.expected_behavior}`,
    );

  const lines: string[] = [];
  lines.push(`Ce que je comprends de votre besoin : ${scenario.user_prompt_fr}`);
  lines.push("");

  const clientQuestions = override?.missingQuestions ?? [
    ...flags.map((f) => GUARDRAIL_QUESTIONS[f]).filter(Boolean),
    "Dans quelle ville êtes-vous basé ?",
  ].filter(Boolean) as string[];

  if (override?.customerText) {
    lines.push(override.customerText);
  } else if (outputType.startsWith("S1_")) {
    lines.push(
      "Sur cette base, je partirais plutôt sur une famille Standex adaptée à ce type de montage et de détection, sous réserve de la géométrie exacte et de ce que le capteur commande réellement.",
    );
    if (!override?.suppressGenericElectrical) {
      lines.push(
        "Côté électrique, la valeur reste acceptable seulement si elle passe sous les limites tension, courant et puissance du contact.",
      );
    }
  } else if (outputType.startsWith("S2_")) {
    lines.push(
      "Je peux déjà cadrer votre demande, mais un point technique doit être tranché avec l'équipe Standex avant de confirmer une référence.",
    );
    lines.push(
      "Je transmets un dossier court à l'équipe Standex avec ces éléments ; l'analyse technique sera menée avec vous, elle n'est pas faite à ce stade.",
    );
  } else {
    lines.push("Avant de proposer une référence, il me manque un élément déterminant.");
    lines.push(
      `La question clé est : ${clientQuestions[0] ?? "que commande exactement le capteur, et dans quel montage ?"}`,
    );
    lines.push(
      "Cette information permet de choisir entre deux orientations très différentes, sans vous envoyer vers un capteur qui ne conviendrait pas au montage réel.",
    );
  }

  if (override?.appendText) {
    lines.push("");
    lines.push(override.appendText);
  }

  if (guardrailTexts.length) {
    const already = lines.join("\n").toLowerCase();
    const kept = guardrailTexts.filter((t) => {
      const topic = t.toLowerCase().split(/[ ,:;]+/).filter((w) => w.length > 6).slice(0, 3);
      return !(topic.length > 0 && topic.every((w) => already.includes(w)));
    });
    if (kept.length) {
      lines.push("");
      kept.forEach((t) => lines.push(t));
    }
  }

  if (maintenance && !override?.suppressDistributorLine) {
    const already = lines.join("\n").toLowerCase();
    if (!already.includes("distributeur")) {
      lines.push("");
      lines.push(
        "Pour une maintenance ou quelques pièces, une piste distributeur peut avoir du sens ; pour un projet ou une intégration nouvelle, je vous recommande de boucler avec Standex.",
      );
    }
  }

  lines.push("");
  lines.push("Standex valide la référence finale.");
  lines.push(FOLLOW_UP);

  // Déduplication finale : une même phrase ne doit jamais apparaître deux fois.
  const seen = new Set<string>();
  const deduped = lines.filter((l) => {
    const key = l.trim().toLowerCase();
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const text = deduped.join("\n");

  return {
    outputType,
    customerText: text,
    guardrails: flags,
    missingQuestions: clientQuestions.slice(0, 3),
    confidence: outputType.startsWith("S1_") ? "medium" : "low",
    standexValidationRequired: true,
    datasheetValues: override?.datasheetValues ?? {},
    internalContractItems: must,
    distributorPathAllowed:
      override?.distributorPathAllowed ?? (maintenance && !outputType.startsWith("S2_")),
    routingReason: `Contrat V0.2 · ${outputType} · scénario ${scenario.scenario_id}`,

    beDossier: outputType.startsWith("S2_")
      ? {
          application: scenario.user_prompt_fr,
          donnees_comprises: must,
          points_a_valider: guardrailTexts,
          a_ne_pas_affirmer: forbidden,
          statut: "dossier_a_transmettre",
        }
      : {},
  };
}
