import type { SensorModel } from "./sensor-catalog";
/** Illustrative positions only. A 6 mm drawing clearance is not a switching distance. */
export function pairLayout(sensor: SensorModel, magnet: SensorModel, approach: string) {
  const perpendicular = approach === "D4" || approach === "D5";
  const endOn = approach === "D3" || approach === "D5";
  const magnetYaw = perpendicular ? Math.PI / 2 : 0;
  const magnetX = perpendicular ? magnet.body[2] : magnet.body[0];
  const magnetZ = perpendicular ? magnet.body[0] : magnet.body[2];
  const offset: [number, number, number] = endOn
    ? [sensor.body[0] / 2 + magnetX / 2 + 6, 0, 0]
    : [
        approach === "D2" || approach === "D4" ? sensor.body[0] / 2 : 0,
        0,
        sensor.body[2] / 2 + magnetZ / 2 + 6,
      ];
  // A flanged sensor has its raised body on -Z. Turn it toward the magnet on +Z.
  return { offset, sensorYaw: !endOn && sensor.shape === "flange" ? Math.PI : 0, magnetYaw };
}
