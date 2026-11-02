import { BoxGeometry, MeshBasicMaterial } from "three";
import {
  DEFAULT_WORKSHOP,
  magnetSize,
  type WorkshopConfig,
} from "../../src/lib/standex/magnetic-workshop";
import { COFFEE_ASSEMBLY } from "../../src/lib/standex/machine-assembly";
import { applyAttachments, type Attachment } from "../../src/lib/standex/machine-mounting";
import { sensorById } from "../../src/lib/standex/sensor-catalog";
import type { MachineAsset } from "../../src/lib/standex/machine-assets";
export function fixture(height = 9, width = 80) {
  const c: WorkshopConfig = {
    ...DEFAULT_WORKSHOP,
    sensorId: "MK04",
    magnetModel: "M04",
    sensitivity: "B",
  };
  const attach: Attachment = {
    kind: "surface",
    support: "moving",
    partPath: "0/1",
    point: [0, height, 0],
    normal: [0, -1, 0],
    offsetMm: 0,
    spinDeg: 0,
    flip: false,
    depthRef: "collar",
    axisSource: "face",
  };
  const size = magnetSize(c),
    s = sensorById(c.sensorId);
  c.machine = applyAttachments(
    {
      ...structuredClone(COFFEE_ASSEMBLY),
      movingNode: "0/1",
      sensorPosition: [0, 0, 0],
      sensorRotation: [0, 0, 0],
      magnetAttach: attach,
      travel: [0, 30, 0],
      motionStatus: "confirmed",
    },
    { lengthMm: s.body[0], heightMm: s.body[1] },
    { lengthMm: size[0], heightMm: size[1] },
  );
  const geometry = new BoxGeometry(width, 2, width).translate(0, height + 1, 0);
  const asset = {
    parts: [{ path: "0/1", name: "plate", geometry, material: new MeshBasicMaterial() }],
    nodes: [{ path: "0/1", name: "plate", depth: 1, meshCount: 1 }],
    size: [width, 2, width],
    min: [-width / 2, height, -width / 2],
    center: [0, height + 1, 0],
    animationCount: 0,
    animation: { clips: [], sampler: () => null },
    dispose: () => geometry.dispose(),
  } as MachineAsset;
  return { c, asset, attach };
}
