/**
 * Accès aux fichiers STEP d'encombrement générés par
 * `scripts/generate-step-envelopes.ts` (voir ce fichier pour les limites
 * assumées : approximation polygonale, épaisseurs illustratives, etc.).
 *
 * Ce module ne fabrique JAMAIS de lien vers un fichier fabricant : chaque
 * capteur ici renvoie un modèle géométrique simplifié, dérivé uniquement des
 * dimensions déjà présentes dans SENSOR_CATALOG, et la liste des identifiants
 * disponibles provient exclusivement de `public/step/manifest.json`, écrit
 * par le générateur — jamais d'une liste recopiée à la main qui pourrait
 * mentir sur ce qui existe réellement sur le disque.
 */
import manifest from "../../../public/step/manifest.json" with { type: "json" };
import { CUSTOM_SENSOR_ID } from "./sensor-catalog";

export interface StepManifestEntry {
  id: string;
  fileName: string;
  bytes: number;
  pedagogical: boolean;
  sourceLabel: string;
  sourceUrl: string | null;
  dimensionsLabel: string;
}

export interface StepManifest {
  generatedBy: string;
  unit: string;
  facetedApproximationSides: number;
  entries: StepManifestEntry[];
}

const STEP_MANIFEST = manifest as StepManifest;

const ENTRIES_BY_ID: ReadonlyMap<string, StepManifestEntry> = new Map(
  STEP_MANIFEST.entries.map((e) => [e.id, e]),
);

/** Identifiants pour lesquels un fichier STEP a réellement été généré. */
export const STEP_ENVELOPE_IDS: readonly string[] = STEP_MANIFEST.entries.map((e) => e.id);

export interface StepEnvelope {
  url: string;
  fileName: string;
  label: string;
  disclaimer: string;
  sourceLabel: string;
  sourceUrl: string | null;
  dimensionsLabel: string;
}

const BASE_LABEL = "STEP d'encombrement · modèle simplifié";

const DISCLAIMER =
  "Modèle géométrique simplifié généré à partir des cotes du catalogue " +
  "(approximation polygonale des sections rondes, épaisseurs non documentées " +
  "fixées par convention illustrative). Ce n'est ni un fichier fabricant ni " +
  "une CAO de fabrication.";

const PEDAGOGICAL_DISCLAIMER =
  DISCLAIMER +
  " Ce capteur n'a pas de fiche source : le modèle est purement pédagogique, " +
  "sans référence commandable.";

/**
 * Renvoie les informations de téléchargement du STEP d'encombrement d'un
 * capteur, ou `null` si aucun fichier n'a été généré pour cet identifiant
 * (par exemple un identifiant qui n'existe pas dans le catalogue).
 */
export function stepEnvelopeFor(sensorId: string): StepEnvelope | null {
  const entry = ENTRIES_BY_ID.get(sensorId);
  if (!entry) return null;
  const pedagogical = entry.pedagogical || sensorId === CUSTOM_SENSOR_ID;
  return {
    url: `/step/${entry.fileName}`,
    fileName: entry.fileName,
    label: BASE_LABEL,
    disclaimer: pedagogical ? PEDAGOGICAL_DISCLAIMER : DISCLAIMER,
    sourceLabel: entry.sourceLabel,
    sourceUrl: entry.sourceUrl,
    dimensionsLabel: entry.dimensionsLabel,
  };
}
