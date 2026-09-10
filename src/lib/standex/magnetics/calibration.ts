import type { Provenance, ReasonCode } from "./types";
export interface Observation {
  id: string;
  sensitivityClass: string;
  approachId: string;
  pullInMm: number;
  dropOutMm: number;
  provenance: Provenance;
}
export interface CalibrationInput {
  familyId: string;
  observations: Observation[];
  classes: string[];
  approaches: [string, string];
  deltaBoundsMm: [number, number];
  knownDeltaMm: number | null;
  distanceBoundsMm: [number, number];
  /** Field along the reed per unit remanence, using SOURCE-DEFINED geometry only. */
  fieldAtDistance: (approach: string, distanceMm: number, deltaMm: number) => number | null;
  geometrySource: Provenance;
  registryFingerprint: string;
}
export interface Residual {
  observationId: string;
  event: "pullInMm" | "dropOutMm";
  observedMm: number;
  predictedMm: number | null;
  errorPct: number | null;
  trainingIds: string[];
  deltaMm: number;
}
export interface CalibrationResult {
  accepted: boolean;
  reason: ReasonCode;
  deltaMm: number | null;
  dropDeltaMm: number | null;
  thresholds: Record<string, { pull: number; drop: number }>;
  residuals: Residual[];
  fingerprint: string;
  provenance: Provenance[];
  report: string;
}
export const CALIBRATION_LIMITS = { maxErrorPct: 15, meanErrorPct: 8, deltaDifferenceMm: 1.5 };
export function crossing(
  fn: (d: number) => number | null,
  threshold: number,
  bounds: [number, number],
): number | null {
  if (
    !Number.isFinite(threshold) ||
    !bounds.every(Number.isFinite) ||
    threshold <= 0 ||
    bounds[0] <= 0 ||
    bounds[1] <= bounds[0]
  )
    return null;
  const brackets: [number, number][] = [];
  let previousD = bounds[0],
    previous = fn(previousD);
  if (previous === null || !Number.isFinite(previous)) return null;
  for (let i = 1; i <= 256; i++) {
    const d = bounds[0] + ((bounds[1] - bounds[0]) * i) / 256,
      value = fn(d);
    if (value === null || !Number.isFinite(value)) return null;
    if (previous >= threshold && value < threshold) brackets.push([previousD, d]);
    // A rising crossing means the search domain spans multiple lobes.
    if (previous < threshold && value >= threshold) return null;
    previousD = d;
    previous = value;
  }
  if (brackets.length !== 1) return null;
  let [lo, hi] = brackets[0]!;
  for (let n = 0; n < 60 && hi - lo > 1e-8; n++) {
    const mid = (lo + hi) / 2,
      value = fn(mid);
    if (value === null || !Number.isFinite(value)) return null;
    if (value >= threshold) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
function fit(
  input: CalibrationInput,
  rows: Observation[],
  event: "pullInMm" | "dropOutMm",
): { delta: number; thresholds: Record<string, number> } | null {
  const objective = (delta: number) => {
    const groups = new Map<string, number[]>();
    for (const row of rows) {
      const value = input.fieldAtDistance(row.approachId, row[event], delta);
      if (value === null || !Number.isFinite(value) || value <= 0)
        return { loss: Infinity, thresholds: {} as Record<string, number> };
      groups.set(row.sensitivityClass, [...(groups.get(row.sensitivityClass) ?? []), value]);
    }
    let loss = 0;
    const thresholds: Record<string, number> = {};
    for (const [key, values] of groups) {
      const mean = values.reduce((s, x) => s + x, 0) / values.length;
      thresholds[key] = mean;
      loss += values.reduce((s, x) => s + Math.log(x / mean) ** 2, 0);
    }
    return { loss, thresholds };
  };
  const [min, max] = input.deltaBoundsMm;
  if (input.knownDeltaMm !== null) {
    if (input.knownDeltaMm < min || input.knownDeltaMm > max) return null;
    const o = objective(input.knownDeltaMm);
    return Number.isFinite(o.loss) ? { delta: input.knownDeltaMm, thresholds: o.thresholds } : null;
  }
  const samples = Array.from({ length: 129 }, (_, i) => {
    const delta = min + ((max - min) * i) / 128;
    return { delta, loss: objective(delta).loss };
  });
  const best = samples.reduce((a, b) => (a.loss <= b.loss ? a : b));
  if (
    !Number.isFinite(best.loss) ||
    Math.max(...samples.filter((s) => Number.isFinite(s.loss)).map((s) => s.loss)) - best.loss <
      1e-10
  )
    return null;
  // Refuse a nonunique minimum separated from the best grid neighbourhood.
  if (
    samples.some(
      (s) =>
        Math.abs(s.delta - best.delta) > (max - min) / 8 && Math.abs(s.loss - best.loss) < 1e-12,
    )
  )
    return null;
  let lo = Math.max(min, best.delta - (max - min) / 128),
    hi = Math.min(max, best.delta + (max - min) / 128);
  for (let n = 0; n < 80; n++) {
    const a = lo + (hi - lo) / 3,
      b = hi - (hi - lo) / 3;
    if (objective(a).loss <= objective(b).loss) hi = b;
    else lo = a;
  }
  const delta = (lo + hi) / 2;
  if (delta - min < 1e-7 || max - delta < 1e-7) return null;
  return { delta, thresholds: objective(delta).thresholds };
}
export function calibrateFamily(input: CalibrationInput): CalibrationResult {
  const result: CalibrationResult = {
    accepted: false,
    reason: "CROSS_VALIDATION_FAILED",
    deltaMm: null,
    dropDeltaMm: null,
    thresholds: {},
    residuals: [],
    fingerprint: input.registryFingerprint,
    provenance: [input.geometrySource, ...input.observations.map((r) => r.provenance)],
    report: "",
  };
  const fail = (reason: ReasonCode) => {
    result.reason = reason;
    result.report = [
      "Calibration : REFUSÉE",
      "Motif : " + reason,
      "Hypothèses à examiner : définition des approches ; datum/centre magnétique ; géométrie active de l'aimant.",
      ...result.residuals.map((r) =>
        [r.observationId, r.event, r.observedMm, r.predictedMm, r.errorPct].join(" ; "),
      ),
    ].join("\n");
    return result;
  };
  if (!input.observations.length) return fail("NO_CALIBRATION_FOR_FAMILY");
  if (
    input.classes.length < 3 ||
    new Set(input.classes).size !== input.classes.length ||
    !input.geometrySource?.sourceRef ||
    ![...input.deltaBoundsMm, ...input.distanceBoundsMm].every(Number.isFinite) ||
    (input.knownDeltaMm !== null && !Number.isFinite(input.knownDeltaMm)) ||
    input.distanceBoundsMm[0] <= 0 ||
    input.distanceBoundsMm[1] <= input.distanceBoundsMm[0] ||
    input.deltaBoundsMm[0] >= input.deltaBoundsMm[1] ||
    input.approaches[0] === input.approaches[1]
  )
    return fail("INVALID_INPUT");
  for (const cls of input.classes)
    for (const approach of input.approaches) {
      const rows = input.observations.filter(
        (r) => r.sensitivityClass === cls && r.approachId === approach,
      );
      if (
        rows.length !== 1 ||
        rows.some(
          (r) =>
            !Number.isFinite(r.pullInMm) ||
            r.pullInMm <= 0 ||
            !Number.isFinite(r.dropOutMm) ||
            r.dropOutMm <= r.pullInMm ||
            !r.provenance.sourceRef,
        )
      )
        return fail("CROSS_VALIDATION_FAILED");
    }
  if (
    input.observations.length !== input.classes.length * 2 ||
    new Set(input.observations.map((r) => r.id)).size !== input.observations.length
  )
    return fail("INVALID_INPUT");
  const pull = fit(input, input.observations, "pullInMm"),
    drop = fit(input, input.observations, "dropOutMm");
  if (!pull || !drop) return fail("NON_IDENTIFIABLE");
  result.deltaMm = pull.delta;
  result.dropDeltaMm = drop.delta;
  if (Math.abs(pull.delta - drop.delta) > CALIBRATION_LIMITS.deltaDifferenceMm)
    return fail("CROSS_VALIDATION_FAILED");
  // One physical centre in the final model. Independently fitted drop delta is diagnostic only.
  for (const cls of input.classes) {
    const rows = input.observations.filter((r) => r.sensitivityClass === cls);
    const dropValues = rows.map((r) =>
      input.fieldAtDistance(r.approachId, r.dropOutMm, pull.delta),
    );
    if (dropValues.some((v) => v === null || !Number.isFinite(v)))
      return fail("CROSS_VALIDATION_FAILED");
    result.thresholds[cls] = {
      pull: pull.thresholds[cls]!,
      drop: dropValues.reduce<number>((s, v) => s + v!, 0) / rows.length,
    };
  }
  if (
    input.classes.some(
      (cls, i) =>
        result.thresholds[cls]!.drop >= result.thresholds[cls]!.pull ||
        (i > 0 && result.thresholds[cls]!.pull <= result.thresholds[input.classes[i - 1]!]!.pull),
    )
  )
    return fail("CROSS_VALIDATION_FAILED");
  for (const target of input.observations)
    for (const event of ["pullInMm", "dropOutMm"] as const) {
      const geometryRows = input.observations.filter(
        (r) => r.sensitivityClass !== target.sensitivityClass,
      );
      const training = fit(input, geometryRows, event);
      if (!training) return fail("NON_IDENTIFIABLE");
      const anchor = input.observations.find(
        (r) => r.sensitivityClass === target.sensitivityClass && r.approachId !== target.approachId,
      )!;
      const threshold = input.fieldAtDistance(anchor.approachId, anchor[event], training.delta);
      const prediction =
        threshold === null
          ? null
          : crossing(
              (d) => input.fieldAtDistance(target.approachId, d, training.delta),
              threshold,
              input.distanceBoundsMm,
            );
      result.residuals.push({
        observationId: target.id,
        event,
        observedMm: target[event],
        predictedMm: prediction,
        errorPct:
          prediction === null ? null : (Math.abs(prediction - target[event]) / target[event]) * 100,
        trainingIds: [...geometryRows.map((r) => r.id), anchor.id],
        deltaMm: training.delta,
      });
    }
  for (const event of ["pullInMm", "dropOutMm"])
    for (const approach of input.approaches) {
      const ids = input.observations.filter((r) => r.approachId === approach).map((r) => r.id);
      const errors = result.residuals
        .filter((r) => r.event === event && ids.includes(r.observationId))
        .map((r) => r.errorPct);
      if (
        errors.some((x) => x === null) ||
        Math.max(...(errors as number[])) > CALIBRATION_LIMITS.maxErrorPct ||
        (errors as number[]).reduce((s, x) => s + x, 0) / errors.length >
          CALIBRATION_LIMITS.meanErrorPct
      )
        return fail("CROSS_VALIDATION_FAILED");
    }
  result.accepted = true;
  result.reason = "OK";
  result.report = [
    "Calibration : ACCEPTÉE sur les données fournies",
    "Centre ajusté (mm) : " + result.deltaMm,
    "Empreinte des sources : " + result.fingerprint,
    ...result.residuals.map((r) =>
      [r.observationId, r.event, r.observedMm, r.predictedMm, r.errorPct].join(" ; "),
    ),
  ].join("\n");
  return result;
}
