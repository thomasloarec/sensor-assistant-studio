import { t } from "@/lib/i18n/core";
import { useRef, useState, useMemo, useEffect } from "react";
import type { ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { Grid, Html, Line, OrbitControls, TransformControls } from "@react-three/drei";
import {
  DoubleSide,
  Euler,
  Group,
  Matrix3,
  Quaternion,
  Vector3,
  MeshStandardMaterial,
} from "three";
import type { TransformControls as TransformImpl } from "three-stdlib";
import type { MachineAsset } from "@/lib/standex/machine-assets";
import type { MachineAssembly } from "@/lib/standex/machine-assembly";
import { movingRotation, openingAt, scale, componentPose } from "@/lib/standex/machine-assembly";
import type { CycleSample, WorkshopConfig, Vec3 } from "@/lib/standex/magnetic-workshop";
import { sensorById, sizeLabel } from "@/lib/standex/sensor-catalog";
import { Body, Contacts, Magnet, CameraRig, ContextGuard } from "./scene";

export type MachineTool = "navigate" | "sensor" | "magnet" | "measure";
function Motion({
  machine,
  u,
  children,
}: {
  machine: MachineAssembly;
  u: number;
  children: ReactNode;
}) {
  if (machine.motion === "translation")
    return <group position={scale(machine.travel, u)}>{t(children)}</group>;
  return (
    <group position={machine.pivot}>
      <group rotation={movingRotation(machine, u).map((n) => (n * Math.PI) / 180) as Vec3}>
        <group position={scale(machine.pivot, -1)}>{t(children)}</group>
      </group>
    </group>
  );
}
function MovingIf({
  moving,
  machine,
  u,
  children,
}: {
  moving: boolean;
  machine: MachineAssembly;
  u: number;
  children: ReactNode;
}) {
  return moving ? (
    <Motion machine={machine} u={u}>
      {t(children)}
    </Motion>
  ) : (
    <>{t(children)}</>
  );
}
function Assembly({
  asset,
  config,
  sample,
  tool,
  transformMode,
  showMachine,
  showSpace,
  xray,
  reduced,
  onChange,
  onMeasure,
  onPlaced,
}: {
  asset: MachineAsset;
  config: WorkshopConfig;
  sample: CycleSample;
  tool: MachineTool;
  transformMode: "translate" | "rotate";
  showMachine: boolean;
  showSpace: boolean;
  xray: boolean;
  reduced: boolean;
  onChange: (patch: Partial<MachineAssembly>) => void;
  onMeasure: (distance: number | null) => void;
  onPlaced: () => void;
}) {
  const machine = config.machine!,
    model = sensorById(config.sensorId),
    u = openingAt(sample.t);
  const sensorRef = useRef<Group>(null),
    magnetRef = useRef<Group>(null),
    control = useRef<TransformImpl>(null);
  const [points, setPoints] = useState<Vec3[]>([]);
  const ghosts = useMemo(
    () =>
      ["#8babbf", "#cf936e"].map(
        (color) =>
          new MeshStandardMaterial({
            color,
            transparent: true,
            opacity: 0.1,
            depthWrite: false,
            side: DoubleSide,
          }),
      ),
    [],
  );
  useEffect(() => () => ghosts.forEach((material) => material.dispose()), [ghosts]);
  const editable = (tool === "sensor" || tool === "magnet") && sample.t === 0;
  const selected = tool === "sensor" ? sensorRef : magnetRef;
  const place = (event: ThreeEvent<MouseEvent>, moving: boolean) => {
    if (tool === "navigate") return;
    event.stopPropagation();
    if (tool === "measure") {
      const p = event.point.toArray() as Vec3,
        next = points.length === 1 ? [points[0]!, p] : [p];
      setPoints(next);
      onMeasure(next.length === 2 ? new Vector3(...next[0]!).distanceTo(new Vector3(...p)) : null);
      return;
    }
    if (!editable || !event.face) return;
    const normal = event.face.normal
      .clone()
      .applyMatrix3(new Matrix3().getNormalMatrix(event.object.matrixWorld))
      .normalize();
    const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), normal),
      e = new Euler().setFromQuaternion(q);
    const height = tool === "sensor" ? model.body[1] : 4;
    const p = event.point
      .clone()
      .addScaledVector(normal, height / 2 + 0.25)
      .toArray() as Vec3;
    const rotation = [e.x, e.y, e.z].map((n) => (n * 180) / Math.PI) as Vec3;
    onChange(
      tool === "sensor"
        ? { sensorPosition: p, sensorRotation: rotation, sensorMount: moving ? "moving" : "fixed" }
        : { magnetPosition: p, magnetRotation: rotation, magnetMount: moving ? "moving" : "fixed" },
    );
    onPlaced();
  };
  const draw = (moving: boolean) =>
    asset.parts
      .filter(
        (p) =>
          (p.path === machine.movingNode || p.path.startsWith(machine.movingNode + "/")) === moving,
      )
      .map((p) => (
        <mesh
          key={p.path}
          geometry={p.geometry}
          material={showMachine ? p.material : ghosts[moving ? 1 : 0]!}
          onClick={(event) => place(event, moving)}
          dispose={null}
        />
      ));
  return (
    <>
      <group>{t(draw(false))}</group>
      <Motion machine={machine} u={u}>
        {t(draw(true))}
      </Motion>
      <MovingIf moving={machine.sensorMount === "moving"} machine={machine} u={u}>
        <group
          ref={sensorRef}
          position={machine.sensorPosition}
          rotation={machine.sensorRotation.map((n) => (n * Math.PI) / 180) as Vec3}
          onClick={(e) => e.stopPropagation()}
        >
          <Body model={model} xray={xray} />
          {xray && <Contacts model={model} contact={sample.contact} reduced={reduced} />}
          {showSpace && (
            <mesh>
              <boxGeometry args={machine.space} />
              <meshBasicMaterial
                color={model.body.every((v, i) => v <= machine.space[i]!) ? "#159776" : "#d07544"}
                wireframe
                transparent
                opacity={0.8}
              />
            </mesh>
          )}
          <Html position={[0, model.body[1] / 2 + 7, 0]} center style={{ pointerEvents: "none" }}>
            <span className="mw-scene-label">
              {t(model.name)} · {t(sizeLabel(model))}
            </span>
          </Html>
        </group>
      </MovingIf>
      <MovingIf moving={machine.magnetMount === "moving"} machine={machine} u={u}>
        <group
          ref={magnetRef}
          position={machine.magnetPosition}
          rotation={machine.magnetRotation.map((n) => (n * Math.PI) / 180) as Vec3}
          onClick={(e) => e.stopPropagation()}
        >
          <Magnet
            config={{ ...config, magnetModel: "generic", magnetTilt: 0 }}
            sample={{ ...sample, position: [0, 0, 0], angle: 0 }}
          />
        </group>
      </MovingIf>
      {editable && (
        <TransformControls
          ref={control}
          object={selected as React.RefObject<Group>}
          mode={transformMode}
          space="world"
          size={0.75}
          translationSnap={0.5}
          rotationSnap={Math.PI / 12}
          onMouseUp={() => {
            const object = selected.current;
            if (!object) return;
            const position = object.position.toArray() as Vec3,
              rotation = [object.rotation.x, object.rotation.y, object.rotation.z].map(
                (n) => (n * 180) / Math.PI,
              ) as Vec3;
            onChange(
              tool === "sensor"
                ? { sensorPosition: position, sensorRotation: rotation }
                : { magnetPosition: position, magnetRotation: rotation },
            );
          }}
        />
      )}
      {points.length === 2 && (
        <>
          <Line points={points} color="#ae5b31" lineWidth={2} />
          <Html position={points[1]!}>
            <span className="mw-scene-label">
              {t("Mesure :")}
              {t(" ")}
              {t(new Vector3(...points[0]!).distanceTo(new Vector3(...points[1]!)).toFixed(1))} mm
            </span>
          </Html>
        </>
      )}
    </>
  );
}
export default function MachineScene({
  asset,
  config,
  sample,
  view,
  focus,
  resetEpoch,
  tool,
  transformMode,
  showMachine,
  showSpace,
  xray,
  reduced,
  onChange,
  onMeasure,
  onPlaced,
  onContextLost,
}: {
  asset: MachineAsset;
  config: WorkshopConfig;
  sample: CycleSample;
  view: "3d" | "top";
  focus: "assembly" | "sensor";
  resetEpoch: number;
  tool: MachineTool;
  transformMode: "translate" | "rotate";
  showMachine: boolean;
  showSpace: boolean;
  xray: boolean;
  reduced: boolean;
  onChange: (patch: Partial<MachineAssembly>) => void;
  onMeasure: (distance: number | null) => void;
  onPlaced: () => void;
  onContextLost: () => void;
}) {
  const m = config.machine!,
    extent = Math.max(...asset.size),
    sensor = sensorById(config.sensorId);
  const target: Vec3 =
    focus === "sensor" ? componentPose(m, "sensor", openingAt(sample.t)).position : asset.center;
  const distance = focus === "sensor" ? Math.max(45, sensor.body[0] * 2.5) : extent * 1.35;
  return (
    <Canvas
      camera={{ position: [440, 360, 530], near: 0.1, far: 100000, fov: 43 }}
      dpr={[1, 1.5]}
      onCreated={({ gl }) => {
        gl.setClearColor("#f0f4f7");
      }}
    >
      <ContextGuard onLost={onContextLost} />
      <ambientLight intensity={2} />
      <directionalLight position={[300, 600, 500]} intensity={2.2} />
      <directionalLight position={[-200, 250, -300]} intensity={1} />
      <Grid
        position={[asset.center[0], asset.min[1] - 0.5, asset.center[2]]}
        args={[extent * 5, extent * 5]}
        cellSize={10}
        sectionSize={50}
        cellColor="#d4dfe7"
        sectionColor="#b0c4d1"
        fadeDistance={extent * 5}
      />
      <Assembly
        asset={asset}
        config={config}
        sample={sample}
        tool={tool}
        transformMode={transformMode}
        showMachine={showMachine}
        showSpace={showSpace}
        xray={xray}
        reduced={reduced}
        onChange={onChange}
        onMeasure={onMeasure}
        onPlaced={onPlaced}
      />
      <OrbitControls
        makeDefault
        enableRotate={view === "3d"}
        target={target}
        minDistance={8}
        maxDistance={extent * 8}
      />
      <CameraRig
        target={target}
        distance={distance}
        view={view}
        resetKey={[m.assetKey, m.unitScale, config.sensorId, focus, view, resetEpoch].join(":")}
      />
    </Canvas>
  );
}
