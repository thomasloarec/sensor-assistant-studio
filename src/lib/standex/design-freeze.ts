import { stableStringify } from "../leadmagnet/dossier";
import { DOSSIER_FIELDS } from "./application-dossier";
import { parseWorkshopConfig } from "./magnetic-workshop";
import type { WorkshopConfig } from "./magnetic-workshop";
import { parseStudioStudy } from "./studio-dossier";
import type { StudioStudy } from "./studio-dossier";
import { evaluateReference, emptyMargin } from "./magnetics/margin";
import { referenceAllowed } from "./magnetic-workshop";
import { solveSwitching } from "./magnetics/solve";
import { ENGINE_VERSION } from "./magnetics/types";
import { PUBLISHED_REGISTRY, PHYSICS_REGISTRY } from "./magnetics/registries";
import { SENSOR_SPECIFICATIONS } from "./sensor-specifications";
export interface FreezeInput {
  dossierId: string;
  revision: number;
  generatedAt: string;
  author: string;
  config: WorkshopConfig;
  study: StudioStudy;
}
export interface FreezeSection {
  id: number;
  title: string;
  entries: { label: string; value: string }[];
}
export interface DesignFreeze {
  schema: 1;
  inputKey: string;
  contextKey: string;
  sections: FreezeSection[];
  hash: string;
  signature: null;
}
/* i18n-canonical: translated at rendering/export. Imported files never restore signature authority. */
export const FREEZE_TITLES = [
  "Identification",
  "Ce qui est détecté",
  "Le montage",
  "Le résultat",
  "Les hypothèses retenues",
  "Ce qui n'est pas modélisé",
  "Ce qui invalide cette conception",
  "Le point électrique",
  "Contre-signature",
  "Empreinte",
];
export const VERDICT_LABELS = {
  held: "TENU",
  tight: "SERRÉ",
  failed: "NON TENU",
  unavailable: "NON ÉVALUABLE",
};
export const STUDIO_NOTICES = {
  invalid: "Saisie invalide : vérifiez les valeurs et leur ordre.",
  verified: "Empreinte cohérente. Cela ne constitue pas une contre-signature.",
  badHash: "Empreinte invalide ou format incompatible.",
};
export const SOLUTION_COLUMNS = [
  "Capteur",
  "Classe",
  "Aimant",
  "Fermeture typique",
  "Ouverture typique",
  "Écart de fermeture",
  "Écart d'ouverture",
  "Verdict",
  "Prédiction physique",
];
export const REFERENCE_REASON_LABELS: Record<string, string> = {
  INVALID_INPUT: "Corrigez les champs signalés avant de comparer.",
  GAPS_REQUIRED:
    "Renseignez les deux distances pour calculer les écarts. Une valeur absente n’est pas zéro.",
  NO_PUBLISHED_REFERENCE: "Aucune paire de distances publiée pour cette combinaison.",
  SOURCE_CONFLICT:
    "Les sources Standex divergent pour cette combinaison. Les valeurs sont suspendues jusqu’à confirmation.",
  FERROUS_BODY_DECLARED:
    "Présence de matière ferromagnétique : les distances publiées ne permettent pas cette comparaison.",
  APPROACH_AMBIGUOUS: "La pose ne correspond pas au trajet de référence publié.",
  NO_SELECTION: "Aucune solution retenue.",
};
export const MISSING_LABELS: Record<string, string> = {
  typical_not_guaranteed: "Valeurs typiques, sans garantie au pire cas",
  sensitivity_spread: "Dispersion du seuil du contact",
  magnet_spread: "Dispersion de l'aimant",
  assembly_tolerance: "Tolérance de montage non déclarée",
  temperature_range: "Plage de température non déclarée",
  reference_temperature_unknown: "Température des mesures publiée : inconnue",
  magnet_temperature_drift: "Dérive de l'aimant en température",
  reed_threshold_temperature_drift: "Dérive du seuil du contact en température",
  magnet_aging: "Vieillissement de l'aimant",
  material_permeability: "Perméabilité du matériau",
  assembly_misalignment: "Défaut d'alignement",
  contact_bounce: "Rebond du contact",
  switching_rate: "Cadence de commutation",
  mechanical_shock: "Chocs et vibrations",
  ferrous_bodies: "Pièces ferromagnétiques voisines",
};
export const INVALIDANT_LABELS: Record<string, string> = {
  CLOSING_LIMIT: "Fermeture : entrefer maximal avant écart négatif",
  OPENING_LIMIT: "Ouverture : entrefer minimal avant écart négatif",
  TEMPERATURE_UNVALIDATED: "Température : seuil de défaillance inconnu",
  FERROUS_CHANGE: "Ajout de matière ferromagnétique : nouvelle caractérisation",
  MAGNET_CHANGE: "Changement d'aimant : nouvelle caractérisation",
  CLASS_CHANGE: "Changement de classe : nouveau calcul",
};
const val = (n: number | null, unit = "mm") =>
  n === null ? "Non renseigné" : `${Number(n.toFixed(4))} ${unit}`;
export async function sha256(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(stableStringify(value));
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)))
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
export function freezeInputKey(input: FreezeInput): string {
  return stableStringify(input);
}
export function freezeContextKey(
  config: WorkshopConfig | null,
  study: StudioStudy | null | undefined,
): string {
  const allowed = new Set(
    DOSSIER_FIELDS.filter((f) => f.section !== "commercial").map((f) => f.id),
  );
  return stableStringify({
    config,
    study: study
      ? {
          ...study,
          fields: Object.fromEntries(
            Object.entries(study.fields).filter(([id]) => allowed.has(id)),
          ),
        }
      : null,
    engine: ENGINE_VERSION,
    published: PUBLISHED_REGISTRY,
    physics: PHYSICS_REGISTRY,
  });
}
export async function createDesignFreeze(input: FreezeInput): Promise<DesignFreeze> {
  if (
    !parseWorkshopConfig(input.config) ||
    !parseStudioStudy(input.study) ||
    !Number.isSafeInteger(input.revision) ||
    input.revision < 1 ||
    !input.dossierId ||
    !Number.isFinite(Date.parse(input.generatedAt))
  )
    throw new Error("INVALID_INPUT");
  const { config: c, study: s } = input;
  const chosen = PUBLISHED_REGISTRY.rows.find(
    (r) =>
      [r.sensorFamily, r.sensitivityClass, r.magnetId, r.approachId].join("/") ===
        s.selectedSolutionId && r.approachId === (s.comparisonApproach ?? "D1"),
  );
  const result = chosen
    ? evaluateReference(chosen, s.need, { referencePose: true, ferrous: c.ferromagnetic })
    : emptyMargin("published_typical", "NO_SELECTION");
  const physical = solveSwitching({
    sensorFamily: chosen?.sensorFamily ?? "",
    sensitivityClass: chosen?.sensitivityClass ?? "",
    magnetId: chosen?.magnetId ?? "",
    approachId: chosen?.approachId ?? "",
    temperatureC: 20,
    ferrousBodies: { declared: c.ferromagnetic, nearestDistanceMm: null },
  });
  // Whitelist the technical sections; no contact, commercial owner, price, stage, cost or margin.
  const technical = DOSSIER_FIELDS.filter((f) => f.section !== "commercial");
  const fieldEntries = technical
    .filter((f) => s.fields[f.id])
    .map((f) => ({ label: f.labelFr, value: s.fields[f.id]!.value }));
  const spec =
    chosen?.sensorFamily === "MK03" && c.sensorId === "MK03"
      ? SENSOR_SPECIFICATIONS[c.sensorId]
      : null;
  const electrical = spec?.electrical.find((e) => e.model === "66");
  const entries: FreezeSection["entries"][] = [
    [
      { label: "Dossier", value: input.dossierId },
      { label: "Révision", value: String(input.revision) },
      { label: "Date", value: input.generatedAt },
      { label: "Auteur", value: input.author || "Non renseigné" },
      { label: "Version du moteur", value: ENGINE_VERSION },
      {
        label: "Versions des registres",
        value: PUBLISHED_REGISTRY.version + " / " + PHYSICS_REGISTRY.version,
      },
      { label: "Provenance", value: s.example ? "Données d'exemple" : "Déclarations utilisateur" },
    ],
    fieldEntries.length ? fieldEntries : [{ label: "Application", value: "Non renseigné" }],
    [
      { label: "Capteur", value: chosen?.sensorFamily ?? "Non renseigné" },
      { label: "Classe", value: chosen?.sensitivityClass ?? "Non renseigné" },
      { label: "Aimant", value: chosen?.magnetId ?? "Non renseigné" },
      { label: "Approche", value: s.comparisonApproach ?? "D1" },
      { label: "Entrefer fermé", value: val(s.need.gapClosedMm) },
      { label: "Entrefer ouvert", value: val(s.need.gapOpenMm) },
      { label: "Tolérance de montage", value: val(s.need.gapToleranceMm) },
      { label: "Température minimale", value: val(s.need.temperatureMinC, "°C") },
      { label: "Température maximale", value: val(s.need.temperatureMaxC, "°C") },
    ],
    [
      { label: "Comparaison aux valeurs typiques", value: VERDICT_LABELS[result.verdict] },
      { label: "Fermeture typique", value: val(result.pullMm) },
      { label: "Ouverture typique", value: val(result.dropMm) },
      { label: "Écart de fermeture", value: val(result.closingMm) },
      { label: "Écart d'ouverture", value: val(result.openingMm) },
      {
        label: "Prédiction physique",
        value:
          physical.reasonCode === "NO_CALIBRATION_FOR_FAMILY"
            ? "Données manquantes pour la prédiction physique : géométrie active, repères et validation indépendante."
            : physical.reasonCode,
      },
      { label: "Pire cas garanti", value: "NON ÉVALUABLE" },
      ...result.provenance.map((p) => ({
        label: "Source",
        value: p.registryId + " ; " + p.sourceRef,
      })),
    ],
    [
      ...technical
        .filter((f) => s.fields[f.id]?.state === "hypothesis")
        .map((f) => ({
          label: f.labelFr,
          value: s.fields[f.id]!.value + " ; " + s.fields[f.id]!.source,
        })),
      ...technical
        .filter((f) => s.fields[f.id]?.proposal)
        .map((f) => ({
          label: "Le montage propose une autre valeur",
          value: f.labelFr + " : " + s.fields[f.id]!.value + " / " + s.fields[f.id]!.proposal,
        })),
    ],
    [...new Set([...result.unknown, ...physical.notModelled])].map((code) => ({
      label: MISSING_LABELS[code] ?? code,
      value: "À caractériser",
    })),
    result.invalidants.map((i) => ({
      label: INVALIDANT_LABELS[i.code]!,
      value: i.value === null ? "À caractériser" : val(i.value),
    })),
    [
      {
        label: "Limites électriques",
        value: electrical
          ? `${c.sensorId} · 1A66${c.sensitivity}-500W ; ${electrical.power} W ; ${electrical.voltage} V ; ${electrical.switching} A ; ${spec!.revision}`
          : "Référence assemblée à confirmer",
      },
      {
        label: "Contrainte jointe",
        value:
          "Les maxima de tension, courant et puissance ne sont pas simultanés. Continu, efficace ou crête et charge à préciser. Aucun dimensionnement électrique validé.",
      },
    ],
    [
      { label: "Statut", value: "Non contre-signée" },
      {
        label: "Revue R&D",
        value: "Contre-signature réservée à une revue publiée par la R&D sur cette révision.",
      },
    ],
    [
      { label: "Version du moteur", value: ENGINE_VERSION },
      {
        label: "Versions des registres",
        value: PUBLISHED_REGISTRY.version + " / " + PHYSICS_REGISTRY.version,
      },
    ],
  ];
  const sections = entries.map((e, index) => ({
    id: index + 1,
    title: FREEZE_TITLES[index]!,
    entries: e.length ? e : [{ label: "Donnée manquante", value: "À préciser" }],
  }));
  // Bind only whitelisted content; entire client dossier never appears in the fiche.
  const content = {
    schema: 1 as const,
    sections,
    inputKey: await sha256(input),
    contextKey: freezeContextKey(c, s),
  };
  return { ...content, hash: await sha256(content), signature: null };
}
export async function verifyFreeze(raw: unknown): Promise<boolean> {
  if (!raw || typeof raw !== "object") return false;
  const f = raw as DesignFreeze;
  if (
    f.schema !== 1 ||
    f.signature !== null ||
    !Array.isArray(f.sections) ||
    f.sections.length !== 10 ||
    !/^[a-f0-9]{64}$/.test(f.hash)
  )
    return false;
  if (
    f.sections.some(
      (s, i) =>
        s.id !== i + 1 ||
        s.title !== FREEZE_TITLES[i] ||
        !Array.isArray(s.entries) ||
        !s.entries.length ||
        s.entries.some((e) => typeof e.label !== "string" || typeof e.value !== "string"),
    )
  )
    return false;
  if (typeof f.contextKey !== "string" || !/^[a-f0-9]{64}$/.test(f.inputKey)) return false;
  return (
    f.hash ===
    (await sha256({
      schema: f.schema,
      sections: f.sections,
      inputKey: f.inputKey,
      contextKey: f.contextKey,
    }))
  );
}
export function freezeMarkdown(
  f: DesignFreeze,
  translate: (s: string) => string = (x) => x,
): string {
  const safe = (s: string) => s.replace(/([\\`*_{}[\]<>])/g, "\\$1").replace(/\r?\n/g, " ");
  return [
    `# ${translate("Fiche de revue de conception")}`,
    `**${translate("Non contre-signée")}**`,
    ...f.sections.flatMap((s) => [
      `\n## ${s.id}. ${translate(s.title)}`,
      ...s.entries.map(
        (e) =>
          `- ${translate(e.label)} : ${safe(translate(e.value))}${translate(e.value) !== e.value ? " (FR : " + safe(e.value) + ")" : ""}`,
      ),
    ]),
    `\nSHA-256 : ${f.hash}`,
  ].join("\n");
}
