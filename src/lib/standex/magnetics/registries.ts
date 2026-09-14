import rawReferences from "@/data/studio-v2/published-references.json";
import rawPhysics from "@/data/studio-v2/physics.json";
import type { Provenance, MagneticBody, Vec3 } from "./types";
import type { Observation } from "./calibration";
import { z } from "zod";
/**
 * Approches publiées. D1 à D5 sont les approches latérales des tables Academy.
 * `F1` est l'approche FRONTALE des fiches MK36/MK37/MK38 : deux collerettes se
 * font face, la distance est mesurée ENTRE LES FACES, le long de l'axe
 * longitudinal des cylindres. Ce n'est ni un D1 latéral ni une distance entre
 * centres : elle n'est jamais reclassée dans une approche existante.
 */
export type PublishedApproach = "D1" | "D2" | "D3" | "D4" | "D5" | "F1";
/**
 * Nature de la colonne de gauche du tableau publié. `sensitivity` : classe A à E
 * des tables Academy. `switch_model` : modèle de contact de la fiche (1A, 1B,
 * 1A66B…), quand la fiche ne publie AUCUNE classe de sensibilité. Aucun de ces
 * deux cas n'est jamais converti dans l'autre.
 */
export type PublishedClassKind = "sensitivity" | "switch_model";
/** Référence de mesure de la distance publiée. */
export type PublishedDatum = "lateral_surface" | "frontal_faces";
/**
 * Nature des seuils publiés. `typical` : distances typiques des tables Academy.
 * `min_activation_max_release` : libellés « Min Activation » / « Max Release »
 * des fiches produit — valeurs indicatives dépendant de l'environnement, jamais
 * un seuil nominal exact mesuré.
 */
export type PublishedThresholdKind = "typical" | "min_activation_max_release";
export interface PublishedRow {
  id: string;
  sensorFamily: string;
  sensorReference: string;
  sensitivityClass: string;
  classKind: PublishedClassKind;
  contactForm: "1A" | "1B" | "1C";
  magnetId: string;
  approachId: PublishedApproach;
  datum: PublishedDatum;
  thresholdKind: PublishedThresholdKind;
  pullInMm: number;
  dropOutMm: number;
  temperatureC: number | null;
  provenance: Provenance;
}

export interface PublishedRegistry {
  version: string;
  sourceSha256: string;
  rows: PublishedRow[];
}
export interface ApproachGeometry {
  id: string;
  originMm: Vec3;
  direction: Vec3;
  rotationDeg: Vec3;
  provenance: Provenance;
}
export interface SourceMagnet {
  id: string;
  body: Omit<MagneticBody, "pose" | "brMt">;
  brMt: number | null;
  brTolerancePct: number | null;
  tempCoeffPctPerK: number | null;
  maxTemperatureC: number | null;
  provenance: Provenance;
  confidence: "high" | "medium" | "low";
  sourceType: "datasheet" | "measured" | "inferred";
}
export interface PhysicsDataset {
  familyId: string;
  calibrationMagnetId: string;
  classes: string[];
  observations: Observation[];
  approaches: [ApproachGeometry, ApproachGeometry];
  deltaBoundsMm: [number, number];
  knownDeltaMm: number | null;
  distanceBoundsMm: [number, number];
  temperatureRangeC: [number, number];
  provenance: Provenance;
  thresholdTolerancePct: number | null;
}
export interface PhysicsRegistry {
  version: string;
  magnets: SourceMagnet[];
  datasets: PhysicsDataset[];
}
export function readPublishedRegistry(raw: unknown): PublishedRegistry {
  const unavailable: PublishedRegistry = { version: "unavailable", sourceSha256: "", rows: [] };
  if (!raw || typeof raw !== "object") return unavailable;
  const data = raw as PublishedRegistry;
  if (
    typeof data.version !== "string" ||
    typeof data.sourceSha256 !== "string" ||
    !Array.isArray(data.rows)
  )
    return unavailable;
  const ids = new Set<string>(),
    pairs = new Set<string>();
  for (const r of data.rows) {
    if (
      !r ||
      !r.id ||
      !r.sensorFamily ||
      !r.magnetId ||
      !r.sensitivityClass ||
      !r.sensorReference ||
      !["1A", "1B", "1C"].includes(r.contactForm) ||
      !["sensitivity", "switch_model"].includes(r.classKind) ||
      !["lateral_surface", "frontal_faces"].includes(r.datum) ||
      !["typical", "min_activation_max_release"].includes(r.thresholdKind) ||
      !["D1", "D2", "D3", "D4", "D5", "F1"].includes(r.approachId) ||
      !Number.isFinite(r.pullInMm) ||
      r.pullInMm <= 0 ||
      !Number.isFinite(r.dropOutMm) ||
      r.dropOutMm <= r.pullInMm ||
      !(r.temperatureC === null || Number.isFinite(r.temperatureC)) ||
      !r.provenance?.sourceRef ||
      !r.provenance.enteredOn ||
      !r.provenance.registryId ||
      !Array.isArray(r.provenance.fields)
    )
      return unavailable;
    // L'unicité inclut le modèle de contact : deux modèles d'une même fiche
    // (MK38 1A66B et 1A85C) sont deux lignes distinctes, jamais fusionnées.
    const pair = [
      r.sensorFamily,
      r.sensitivityClass,
      r.contactForm,
      r.magnetId,
      r.approachId,
    ].join("/");

    if (ids.has(r.id) || pairs.has(pair)) return unavailable;
    ids.add(r.id);
    pairs.add(pair);
  }
  return data;
}
export const PUBLISHED_REGISTRY = readPublishedRegistry(rawReferences);
/** Compiled empty until source-defined active geometry is supplied; never populated with fixtures. */
const finite = z.number().finite(),
  positive = finite.positive();
const point = z.tuple([finite, finite, finite]);
const source = z.object({
  registryId: z.string().trim().min(1),
  sourceType: z.string().trim().min(1),
  sourceRef: z.string().trim().min(1),
  enteredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fields: z.array(z.string().min(1)).min(1),
});
const observation = z
  .object({
    id: z.string().min(1),
    sensitivityClass: z.string().min(1),
    approachId: z.string().min(1),
    pullInMm: positive,
    dropOutMm: positive,
    provenance: source,
  })
  .refine((r) => r.dropOutMm > r.pullInMm);
const approach = z.object({
  id: z.string().min(1),
  originMm: point,
  direction: point.refine((v) => Math.abs(Math.hypot(...v) - 1) < 1e-9),
  rotationDeg: point,
  provenance: source,
});
const bounds = z.tuple([finite, finite]).refine((v) => v[0] < v[1]);
const physicsSchema = z.object({
  version: z.string().min(1),
  magnets: z.array(
    z.object({
      id: z.string().min(1),
      body: z.object({
        shape: z.enum(["block", "cylinder", "ring"]),
        dimensionsMm: point.refine((v) => v.every((x) => x > 0)),
        innerDiameterMm: finite.nonnegative(),
        magnetizationAxis: z.union([z.literal(0), z.literal(1), z.literal(2)]),
        polarity: z.union([z.literal(-1), z.literal(1)]),
      }),
      brMt: positive.nullable(),
      brTolerancePct: finite.min(0).lt(100).nullable(),
      tempCoeffPctPerK: finite.nullable(),
      maxTemperatureC: finite.nullable(),
      confidence: z.enum(["high", "medium", "low"]),
      sourceType: z.enum(["datasheet", "measured", "inferred"]),
      provenance: source,
    }),
  ),
  datasets: z.array(
    z.object({
      familyId: z.string().min(1),
      calibrationMagnetId: z.string().min(1),
      classes: z.array(z.string().min(1)).min(3),
      observations: z.array(observation),
      approaches: z.tuple([approach, approach]),
      deltaBoundsMm: bounds,
      knownDeltaMm: finite.nullable(),
      distanceBoundsMm: bounds.refine((v) => v[0] > 0),
      temperatureRangeC: bounds,
      thresholdTolerancePct: finite.min(0).lt(100).nullable(),
      provenance: source,
    }),
  ),
});
export function readPhysicsRegistry(raw: unknown): PhysicsRegistry {
  const parsed = physicsSchema.safeParse(raw);
  if (!parsed.success) return { version: "unavailable", magnets: [], datasets: [] };
  const d = parsed.data;
  if (
    new Set(d.magnets.map((m) => m.id)).size !== d.magnets.length ||
    new Set(d.datasets.map((s) => s.familyId)).size !== d.datasets.length
  )
    return { version: "unavailable", magnets: [], datasets: [] };
  return d;
}
export const PHYSICS_REGISTRY = readPhysicsRegistry(rawPhysics);
/**
 * Familles d'aimants que la SOURCE désigne comme une seule référence.
 *
 * Brochure « Reed Switch Sensors A5 V04 EN » (standexdetect.com), page 37
 * imprimée : la planche MAGNETS IN HOUSINGS nomme explicitement la famille
 * « M21/P(1,2) » avec un seul jeu de cotes (L 28,6 × W 19 × H 6,35 mm). Page 38,
 * la liste « All distance data above are valid for the magnets below » inclut
 * « 2500000021 / M21 ». La fiche magnet-in-housing V03 liste P1 et P2 dans cette
 * même famille ; les pages produit ne les distinguent que par l'orientation des
 * trous oblongs. Les distances publiées du M21 s'appliquent donc aux deux
 * variantes : c'est une identité de famille documentée, pas une extrapolation
 * depuis une forme. Aucune autre correspondance n'est déclarée ici.
 */
export const PUBLISHED_MAGNET_FAMILY: Readonly<Record<string, string>> = {
  "M21P/1": "M21",
  "M21P/2": "M21",
};
/** Référence d'aimant réellement présente au registre pour cette variante. */
export function publishedMagnetFamily(magnetId: string): string {
  return PUBLISHED_MAGNET_FAMILY[magnetId] ?? magnetId;
}
/** La variante demandée est-elle lue via l'identité de famille documentée ? */
export function isPublishedFamilyAlias(magnetId: string): boolean {
  return magnetId in PUBLISHED_MAGNET_FAMILY;
}
export function publishedReference(
  sensorFamily: string,
  sensitivityClass: string,
  magnetId: string,
  approachId: string,
  registry = PUBLISHED_REGISTRY,
): PublishedRow | null {
  const magnet = publishedMagnetFamily(magnetId);
  return (
    readPublishedRegistry(registry).rows.find(
      (r) =>
        r.sensorFamily === sensorFamily &&
        r.sensitivityClass === sensitivityClass &&
        r.magnetId === magnet &&
        r.approachId === approachId,
    ) ?? null
  );
}
/**
 * Couple publié pour un capteur donné. La famille est explicite : aucun seuil
 * n'est emprunté à une autre famille ni à un autre aimant.
 */
export function publishedPairFor(
  sensorFamily: string,
  sensitivityClass: string,
  approachId: string,
  magnetId: string,
  registry = PUBLISHED_REGISTRY,
): readonly [number, number] | null {
  const row = publishedReference(sensorFamily, sensitivityClass, magnetId, approachId, registry);
  return row ? [row.pullInMm, row.dropOutMm] : null;
}
/**
 * Toutes les lignes publiées d'un couple capteur–aimant, telles qu'elles sont
 * saisies. Lecture DOCUMENTAIRE : elle inclut les modèles de contact que le
 * moteur normalement ouvert ne simule pas (1B, 1C), pour qu'ils soient affichés
 * séparément au lieu d'être supprimés ou convertis.
 */
export function publishedRowsForCouple(
  sensorFamily: string,
  magnetId: string,
  registry = PUBLISHED_REGISTRY,
): PublishedRow[] {
  const magnet = publishedMagnetFamily(magnetId);
  return registry.rows
    .filter((r) => r.sensorFamily === sensorFamily && r.magnetId === magnet)
    .slice()
    .sort((a, b) => a.sensitivityClass.localeCompare(b.sensitivityClass));
}
/**
 * Nature de la colonne publiée pour ce couple : classes de sensibilité A–E des
 * tables Academy, ou modèles de contact des fiches produit. Jamais les deux :
 * une fiche sans classe publiée n'en reçoit aucune.
 */
export function publishedClassKind(
  sensorFamily: string,
  magnetId: string,
  registry = PUBLISHED_REGISTRY,
): PublishedClassKind | null {
  return publishedRowsForCouple(sensorFamily, magnetId, registry)[0]?.classKind ?? null;
}
/** Classes de sensibilité réellement publiées pour ce couple, dans l'ordre du registre. */

export function publishedClasses(
  sensorFamily: string,
  magnetId: string,
  registry = PUBLISHED_REGISTRY,
): string[] {
  return [
    ...new Set(
      registry.rows
        .filter((r) => r.sensorFamily === sensorFamily && r.magnetId === magnetId)
        .map((r) => r.sensitivityClass),
    ),
  ].sort();
}
/** Approches publiées pour ce couple : D1 à D5, telles qu'elles sont saisies. */
export function publishedApproaches(
  sensorFamily: string,
  magnetId: string,
  registry = PUBLISHED_REGISTRY,
): string[] {
  return [
    ...new Set(
      registry.rows
        .filter((r) => r.sensorFamily === sensorFamily && r.magnetId === magnetId)
        .map((r) => r.approachId),
    ),
  ].sort();
}
/** Référence de variante réellement saisie au registre. Jamais recomposée. */
export function publishedSensorReference(
  sensorFamily: string,
  sensitivityClass: string,
  magnetId: string,
  registry = PUBLISHED_REGISTRY,
): string | null {
  return (
    registry.rows.find(
      (r) =>
        r.sensorFamily === sensorFamily &&
        r.sensitivityClass === sensitivityClass &&
        r.magnetId === magnetId,
    )?.sensorReference ?? null
  );
}
/** Compatibilité MK03 : conservée pour les lectures historiques. */
export function publishedPair(
  sensitivityClass: string,
  approachId: string,
  registry = PUBLISHED_REGISTRY,
  magnetId = "M02",
): readonly [number, number] | null {
  return publishedPairFor("MK03", sensitivityClass, approachId, magnetId, registry);
}

