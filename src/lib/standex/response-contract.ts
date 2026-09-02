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
  if (hit(/\bac\b|vac|230 ?v|secteur|rms|peak/)) flags.push("ac_rms");
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
}

export function composeResponse(scenario: SensorTestScenario): ComposedResponse {
  const outputType = safeOutputType(scenario.expected_output_type);
  const must = splitList(scenario.must_include);
  const forbidden = splitList(scenario.must_not_include);
  const flags = [...new Set([...(scenario.trace_flags ?? []), ...detect(scenario)])];
  const guardrailTexts = flags.map((f) => GUARDRAIL_TEXTS[f]).filter(Boolean) as string[];

  const maintenance =
    outputType === "S1_MAINTENANCE_REFERENCE" ||
    outputType === "KNOWLEDGE_ONLY_WITH_MAINTENANCE_EXCEPTION" ||
    scenario.volume_band === "maintenance" ||
    scenario.volume_band === "very_low";

  const lines: string[] = [];
  lines.push(`Ce que je comprends de votre besoin : ${scenario.user_prompt_fr}`);
  lines.push("");

  if (outputType.startsWith("S1_")) {
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
    standexValidationRequired: !maintenance || outputType.startsWith("S2_") ? true : true,
    distributorPathAllowed: maintenance && !outputType.startsWith("S2_"),
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
