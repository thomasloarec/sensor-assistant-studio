import { stableStringify } from "@/lib/leadmagnet/dossier";
import { calibrateFamily, crossing } from "./calibration";
import type { CalibrationResult, CalibrationInput } from "./calibration";
import { fieldAtPoint, remanenceAt } from "./field";
import { PHYSICS_REGISTRY, readPhysicsRegistry } from "./registries";
import type { PhysicsRegistry, PhysicsDataset, SourceMagnet } from "./registries";
import { ENGINE_VERSION, NOT_MODELLED } from "./types";
import type { ReasonCode, SolveResult } from "./types";
const cache = new Map<string, CalibrationResult>();
function normalizedField(
  dataset: PhysicsDataset,
  magnet: SourceMagnet,
  approachId: string,
  distance: number,
  delta: number,
): number | null {
  const approach = dataset.approaches.find((a) => a.id === approachId);
  if (!approach) return null;
  const evaluated = fieldAtPoint(
    {
      ...magnet.body,
      brMt: 1,
      pose: {
        positionMm: approach.originMm.map((x, i) => x + approach.direction[i]! * distance) as [
          number,
          number,
          number,
        ],
        rotationDeg: approach.rotationDeg,
      },
    },
    [delta, 0, 0],
  );
  return evaluated.ok ? Math.abs(evaluated.field.bAlongBladeMt) : null;
}
export function calibrationFor(
  dataset: PhysicsDataset,
  registry: PhysicsRegistry,
): CalibrationResult | null {
  const magnet = registry.magnets.find((m) => m.id === dataset.calibrationMagnetId);
  if (
    !magnet ||
    !magnet.provenance?.sourceRef ||
    !dataset.provenance?.sourceRef ||
    dataset.approaches.some(
      (a) => !a.provenance?.sourceRef || Math.abs(Math.hypot(...a.direction) - 1) > 1e-9,
    )
  )
    return null;
  const fingerprint = stableStringify({ dataset, magnet, version: registry.version });
  const cached = cache.get(fingerprint);
  if (cached) return cached;
  const input: CalibrationInput = {
    familyId: dataset.familyId,
    observations: dataset.observations,
    classes: dataset.classes,
    approaches: [dataset.approaches[0].id, dataset.approaches[1].id],
    deltaBoundsMm: dataset.deltaBoundsMm,
    knownDeltaMm: dataset.knownDeltaMm,
    distanceBoundsMm: dataset.distanceBoundsMm,
    fieldAtDistance: (a, d, delta) => normalizedField(dataset, magnet, a, d, delta),
    geometrySource: dataset.provenance,
    registryFingerprint: fingerprint,
  };
  const result = calibrateFamily(input);
  if (cache.size >= 32) cache.clear();
  cache.set(fingerprint, result);
  return result;
}
export interface SolveInput {
  sensorFamily: string;
  sensitivityClass: string;
  magnetId: string;
  approachId: string;
  temperatureC: number;
  ferrousBodies: { declared: boolean; nearestDistanceMm: number | null };
  fieldFactor?: number;
  thresholdFactor?: number;
}
export function solveSwitching(input: SolveInput, registry = PHYSICS_REGISTRY): SolveResult {
  registry = readPhysicsRegistry(registry);
  const result: SolveResult = {
    status: "uncalibrated",
    reasonCode: "NO_CALIBRATION_FOR_FAMILY",
    field: null,
    switching: null,
    missing: [],
    notModelled: [...NOT_MODELLED],
    provenance: [],
    engineVersion: ENGINE_VERSION,
    registryVersions: { physics: registry.version },
  };
  const refuse = (reason: ReasonCode, missing: string[], out = false) => ({
    ...result,
    status: out ? ("out_of_domain" as const) : ("uncalibrated" as const),
    reasonCode: reason,
    missing,
  });
  if (
    !Number.isFinite(input.temperatureC) ||
    (input.fieldFactor !== undefined &&
      (!Number.isFinite(input.fieldFactor) || input.fieldFactor <= 0)) ||
    (input.thresholdFactor !== undefined &&
      (!Number.isFinite(input.thresholdFactor) || input.thresholdFactor <= 0))
  )
    return refuse("INVALID_INPUT", ["input"]);
  const dataset = registry.datasets.find((d) => d.familyId === input.sensorFamily);
  if (!dataset || !dataset.observations.length)
    return refuse("NO_CALIBRATION_FOR_FAMILY", [
      "independent_measurements",
      "active_geometry",
      "datum",
    ]);
  const magnet = registry.magnets.find((m) => m.id === input.magnetId),
    reference = registry.magnets.find((m) => m.id === dataset.calibrationMagnetId);
  if (!magnet || !reference) return refuse("MAGNET_NOT_IN_REGISTRY", ["magnetId"]);
  if ([magnet, reference].some((m) => m.sourceType === "inferred" || m.confidence === "low"))
    return refuse("MAGNET_SOURCE_INFERRED", ["magnet_source"]);
  if (!dataset.approaches.some((a) => a.id === input.approachId))
    return refuse("APPROACH_AMBIGUOUS", ["approachId"]);
  if (!dataset.classes.includes(input.sensitivityClass))
    return refuse("NO_CALIBRATION_FOR_CLASS", ["sensitivityClass"]);
  if (input.ferrousBodies.declared)
    return refuse("FERROUS_BODY_DECLARED", ["ferrous_influence"], true);
  if (
    input.temperatureC < dataset.temperatureRangeC[0] ||
    input.temperatureC > dataset.temperatureRangeC[1]
  )
    return refuse("TEMPERATURE_OUT_OF_RANGE", ["temperatureC"], true);
  if (magnet.maxTemperatureC !== null && input.temperatureC > magnet.maxTemperatureC)
    return refuse("MAGNET_TEMPERATURE_EXCEEDED", ["temperatureC"], true);
  if (input.temperatureC !== 20 && magnet.tempCoeffPctPerK === null)
    return refuse("MAGNET_BR_UNKNOWN", ["temperature_coefficient"]);
  if (magnet.id !== reference.id && (magnet.brMt === null || reference.brMt === null))
    return refuse("MAGNET_BR_UNKNOWN", ["brMt"]);
  const calibration = calibrationFor(dataset, registry);
  if (!calibration) return refuse("MAGNET_GEOMETRY_UNKNOWN", ["active_geometry", "datum"]);
  if (!calibration.accepted || calibration.deltaMm === null)
    return refuse(calibration.reason, ["independent_validation"]);
  const baseScale = magnet.id === reference.id ? 1 : magnet.brMt! / reference.brMt!;
  const scale =
    baseScale *
    (input.temperatureC === 20 ? 1 : remanenceAt(1, magnet.tempCoeffPctPerK!, input.temperatureC)) *
    (input.fieldFactor ?? 1);
  if (!Number.isFinite(scale) || scale <= 0) return refuse("INVALID_INPUT", ["fieldFactor"]);
  const curve = (d: number) => {
    const f = normalizedField(dataset, magnet, input.approachId, d, calibration.deltaMm!);
    return f === null ? null : f * scale;
  };
  const thresholds = calibration.thresholds[input.sensitivityClass]!;
  const pull = crossing(
    curve,
    thresholds.pull * (input.thresholdFactor ?? 1),
    dataset.distanceBoundsMm,
  );
  const drop = crossing(
    curve,
    thresholds.drop * (input.thresholdFactor ?? 1),
    dataset.distanceBoundsMm,
  );
  if (pull === null || drop === null || drop <= pull)
    return refuse("NO_UNIQUE_CROSSING", ["switching_domain"], true);
  return {
    ...result,
    status: "calibrated",
    reasonCode: "OK",
    switching: { pullInMm: pull, dropOutMm: drop, hysteresisMm: drop - pull },
    provenance: [...calibration.provenance, magnet.provenance].map((p) => ({
      ...p,
      fields: ["pullInMm", "dropOutMm", "hysteresisMm"],
    })),
    notModelled: [...NOT_MODELLED],
    missing: [],
  };
}
