import rawReferences from "@/data/studio-v2/published-references.json";
import rawPhysics from "@/data/studio-v2/physics.json";
import type { Provenance, MagneticBody, Vec3 } from "./types";
import type { Observation } from "./calibration";
import { z } from "zod";
export type PublishedApproach = "D1" | "D2" | "D3" | "D4" | "D5";
export interface PublishedRow {
  id: string;
  sensorFamily: string;
  sensorReference: string;
  sensitivityClass: string;
  contactForm: "1A";
  magnetId: string;
  approachId: PublishedApproach;
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
      r.contactForm !== "1A" ||
      !["D1", "D2", "D3", "D4", "D5"].includes(r.approachId) ||
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
    const pair = [r.sensorFamily, r.sensitivityClass, r.magnetId, r.approachId].join("/");
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
export function publishedReference(
  sensorFamily: string,
  sensitivityClass: string,
  magnetId: string,
  approachId: string,
  registry = PUBLISHED_REGISTRY,
): PublishedRow | null {
  return (
    readPublishedRegistry(registry).rows.find(
      (r) =>
        r.sensorFamily === sensorFamily &&
        r.sensitivityClass === sensitivityClass &&
        r.magnetId === magnetId &&
        r.approachId === approachId,
    ) ?? null
  );
}
export function publishedPair(
  sensitivityClass: string,
  approachId: string,
  registry = PUBLISHED_REGISTRY,
  magnetId = "M02",
): readonly [number, number] | null {
  const row = publishedReference("MK03", sensitivityClass, magnetId, approachId, registry);
  return row ? [row.pullInMm, row.dropOutMm] : null;
}
