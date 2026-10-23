import { useEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { Vector3 } from "three";
import type { Vec3 } from "@/lib/standex/magnetic-workshop";
import { fitDistance } from "./scene";

/** Reframe only on a camera command; follow pose without undoing manual zoom. */
export function MachineCamera({ target, radius, view, command }: { target: Vec3; radius: number; view: "3d" | "top"; command: string }) {
  const { camera, controls, size } = useThree();
  const previous = useRef<Vec3>(target);
  useEffect(() => {
    if (size.width < 80 || size.height < 80) return;
    const orbit = controls as unknown as { target: Vector3; update: () => void } | undefined;
    const d = fitDistance(radius, (camera as unknown as { fov?: number }).fov ?? 43, size.width / size.height);
    const dir = new Vector3(...(view === "top" ? [0, 1, 0.001] as Vec3 : [0.62, 0.55, 0.82] as Vec3)).normalize();
    camera.position.copy(new Vector3(...target).addScaledVector(dir, d));
    camera.up.set(0, view === "top" ? 0 : 1, view === "top" ? -1 : 0);
    camera.lookAt(...target);
    orbit?.target.set(...target);
    orbit?.update();
    previous.current = target;
    // The current pose is captured by an explicit command, not every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [command, camera, controls, size.width, size.height, view]);
  useEffect(() => {
    const orbit = controls as unknown as { target: Vector3; update: () => void } | undefined;
    const delta = new Vector3(...target).sub(new Vector3(...previous.current));
    camera.position.add(delta);
    orbit?.target.add(delta);
    orbit?.update();
    previous.current = target;
  }, [target[0], target[1], target[2], camera, controls]);
  return null;
}