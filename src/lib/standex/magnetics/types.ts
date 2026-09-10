export type Vec3 = [number, number, number];
/** Degrees, intrinsic XYZ rotations: R = Rx Ry Rz, column vectors. */
export interface Pose {
  positionMm: Vec3;
  rotationDeg: Vec3;
}
export interface Provenance {
  registryId: string;
  sourceType: string;
  sourceRef: string;
  enteredOn: string;
  fields: string[];
}
export const ENGINE_VERSION = "studio-v2-1.0.0";
export const NOT_MODELLED = [
  "ferrous_bodies",
  "magnet_temperature_drift",
  "reed_threshold_temperature_drift",
  "magnet_aging",
  "sensitivity_spread",
  "contact_bounce",
  "switching_rate",
  "mechanical_shock",
  "material_permeability",
  "assembly_misalignment",
] as const;
export type ReasonCode =
  | "OK"
  | "NO_CALIBRATION_FOR_FAMILY"
  | "NO_CALIBRATION_FOR_CLASS"
  | "MAGNET_NOT_IN_REGISTRY"
  | "MAGNET_BR_UNKNOWN"
  | "MAGNET_SOURCE_INFERRED"
  | "MAGNET_GEOMETRY_UNKNOWN"
  | "DATUM_UNKNOWN"
  | "APPROACH_AMBIGUOUS"
  | "TEMPERATURE_OUT_OF_RANGE"
  | "MAGNET_TEMPERATURE_EXCEEDED"
  | "FERROUS_BODY_DECLARED"
  | "GEOMETRY_OVERLAP"
  | "CYLINDER_OFF_AXIS_APPROXIMATION"
  | "MRP_OUTSIDE_HOUSING"
  | "CROSS_VALIDATION_FAILED"
  | "INVALID_INPUT"
  | "NON_IDENTIFIABLE"
  | "NO_UNIQUE_CROSSING";
export interface FieldResult {
  bVectorMt: Vec3;
  bAlongBladeMt: number;
  bMagnitudeMt: number;
  approximation: "none";
  approximationErrorPct: 0;
}
export type FieldEvaluation = { ok: true; field: FieldResult } | { ok: false; reason: ReasonCode };
export interface MagneticBody {
  shape: "block" | "cylinder" | "ring";
  dimensionsMm: Vec3;
  innerDiameterMm: number;
  magnetizationAxis: 0 | 1 | 2;
  brMt: number;
  polarity: 1 | -1;
  pose: Pose;
}
export interface SolveResult {
  status: "calibrated" | "uncalibrated" | "out_of_domain";
  reasonCode: ReasonCode;
  field: FieldResult | null;
  switching: { pullInMm: number; dropOutMm: number; hysteresisMm: number } | null;
  missing: string[];
  notModelled: string[];
  provenance: Provenance[];
  engineVersion: string;
  registryVersions: Record<string, string>;
}
