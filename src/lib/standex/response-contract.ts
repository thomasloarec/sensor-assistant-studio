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
  const hit = (re: RegExp) => re.test(hay);
  const flags: string[] = [];
  if (hit(/inductif|inductive|moteur|pompe|electrovanne|électrovanne|bobine|relais|solenoid/))
    flags.push("inductive_load");
  // Garde-fou AC seulement si la demande parle vraiment d'alternatif :
  // une tension DC (ex. 230 VDC) ne doit pas déclencher ce garde-fou.
  if (hit(/\bac\b|vac|secteur|\brms\b|peak/)) flags.push("ac_rms");
  if (hit(/inrush|appel de courant|demarrage|démarrage/)) flags.push("inrush");
  if (hit(/reed (switch )?(brut|nu)|raw reed|pattes|leads/)) flags.push("raw_reed_switch");
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
      "Côté électrique, votre signal 24 V vers une entrée automate ressemble à une entrée de commande faible niveau, pas à une commutation de puissance. C'est donc compatible en ordre de grandeur (electrical fit), sous réserve de valider le câblage, le type d'entrée et les conditions réelles.",
    ].join("\n"),
    datasheetValues: {
      electrical_fit: "24 V PLC input = low-level command, not power switching",
      load_type: "entrée automate 24 V",
      verification_required: "câblage, type d'entrée, conditions réelles",
    },
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
  },
};

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
  const guardrailTexts = flags.map((f) => GUARDRAIL_TEXTS[f]).filter(Boolean) as string[];

  const maintenance =
    outputType === "S1_MAINTENANCE_REFERENCE" ||
    outputType === "KNOWLEDGE_ONLY_WITH_MAINTENANCE_EXCEPTION" ||
    /maintenance|remplacement|quelques pi|faible (volume|quantit)/i.test(
      `${scenario.user_prompt_fr} ${scenario.expected_behavior}`,
    );

  const override = SCENARIO_OVERRIDES[scenario.scenario_id];

  const lines: string[] = [];
  lines.push(`Ce que je comprends de votre besoin : ${scenario.user_prompt_fr}`);
  lines.push("");

  if (override?.customerText) {
    lines.push(override.customerText);
  } else if (outputType.startsWith("S1_")) {
    lines.push(
      "Sur cette base, je partirais plutôt sur une famille Standex adaptée à ce type de montage et de détection, sous réserve de la géométrie exacte et de ce que le capteur commande réellement.",
    );
    lines.push(
      "Côté électrique, la valeur reste acceptable seulement si elle passe sous les limites tension, courant et puissance du contact.",
    );
  } else if (outputType.startsWith("S2_")) {
    lines.push("Les points déjà compris me permettent de cadrer la demande :");
    (must.length ? must : ["application et contraintes principales"]).forEach((m) =>
      lines.push(`- ${m}`),
    );
    lines.push("");
    lines.push(
      "Le point qui doit passer en validation Standex est le risque technique identifié ci-dessous : je ne veux pas confirmer une référence sans l'avoir vérifié.",
    );
    lines.push(
      "Je peux transmettre un dossier court à l'équipe Standex avec ces éléments ; l'analyse technique sera menée avec vous, elle n'est pas faite à ce stade.",
    );
  } else {
    lines.push(
      "Avant de proposer une référence, il me manque un élément déterminant.",
    );
    lines.push(
      `La question clé est : ${must[0] ?? "que commande exactement le capteur, et dans quel montage ?"}`,
    );
    lines.push(
      "Cette information permet de choisir entre deux orientations très différentes, sans vous envoyer vers un capteur qui ne conviendrait pas au montage réel.",
    );
  }

  if (guardrailTexts.length) {
    lines.push("");
    guardrailTexts.forEach((t) => lines.push(t));
  }

  if (maintenance) {
    lines.push("");
    lines.push(
      "Pour une maintenance ou quelques pièces, une piste distributeur peut avoir du sens ; pour un projet ou une intégration nouvelle, je vous recommande de boucler avec Standex.",
    );
  }

  lines.push("");
  lines.push("Standex valide la référence finale.");
  lines.push(FOLLOW_UP);

  const text = lines.join("\n");

  return {
    outputType,
    customerText: text,
    guardrails: flags,
    missingQuestions:
      outputType === "S3_MISSING_INFO"
        ? [must[0] ?? "information manquante à préciser"]
        : must.slice(0, 3),
    confidence: outputType.startsWith("S1_") ? "medium" : "low",
    standexValidationRequired: true,
    datasheetValues: override?.datasheetValues ?? {},
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
