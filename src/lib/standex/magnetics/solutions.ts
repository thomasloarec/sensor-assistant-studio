import { SENSOR_CATALOG } from "../sensor-catalog";
import { PUBLISHED_REGISTRY, PHYSICS_REGISTRY } from "./registries";
import type { PublishedRegistry, PhysicsRegistry } from "./registries";
import { evaluateReference, evaluateMargin } from "./margin";
import type { MarginResult, Need } from "./margin";
export interface Solution {
  id: string;
  sensorFamily: string;
  sensitivityClass: string;
  magnetId: string;
  approachId: "D1" | "D3";
  reference: MarginResult;
  physical: MarginResult;
}
export function exploreSolutions(
  need: Need,
  approachId: "D1" | "D3",
  domain: { referencePose: boolean; ferrous: boolean },
  published: PublishedRegistry = PUBLISHED_REGISTRY,
  physics: PhysicsRegistry = PHYSICS_REGISTRY,
): Solution[] {
  return SENSOR_CATALOG.filter((s) => s.sourceFile !== null)
    .flatMap((sensor) => {
      const dataset = physics.datasets.find((d) => d.familyId === sensor.id);
      const classes = [
        ...new Set([
          ...published.rows
            .filter((r) => r.sensorFamily === sensor.id)
            .map((r) => r.sensitivityClass),
          ...(dataset?.classes ?? []),
        ]),
      ];
      const magnets = [
        ...new Set([
          ...published.rows.filter((r) => r.sensorFamily === sensor.id).map((r) => r.magnetId),
          ...(dataset ? physics.magnets.map((m) => m.id) : []),
        ]),
      ];
      return (classes.length ? classes : [""]).flatMap((sensitivityClass) =>
        (magnets.length ? magnets : [""]).map((magnetId) => {
          const key = { sensorFamily: sensor.id, sensitivityClass, magnetId, approachId };
          return {
            ...key,
            id: [sensor.id, sensitivityClass, magnetId, approachId].join("/"),
            reference: evaluateReference(key, need, domain, published),
            physical: evaluateMargin(
              {
                ...key,
                temperatureC: 20,
                ferrousBodies: { declared: domain.ferrous, nearestDistanceMm: null },
              },
              need,
              physics,
            ),
          };
        }),
      );
    })
    .sort(
      (a, b) =>
        (b.reference.closingMm ?? -Infinity) - (a.reference.closingMm ?? -Infinity) ||
        a.id.localeCompare(b.id),
    );
}
export function coverage(solutions: Solution[]) {
  return {
    catalog: new Set(solutions.map((s) => s.sensorFamily)).size,
    published: new Set(
      solutions.filter((s) => s.reference.provenance.length).map((s) => s.sensorFamily),
    ).size,
    calibrated: new Set(
      solutions.filter((s) => s.physical.provenance.length).map((s) => s.sensorFamily),
    ).size,
  };
}
