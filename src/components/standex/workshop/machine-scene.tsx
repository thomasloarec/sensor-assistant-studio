import { housingYawDeg } from "@/lib/standex/housing-pose";
import { magnetSize } from "@/lib/standex/magnetic-workshop";
import { msg, t } from "@/lib/i18n/core";
import { useRef, useMemo, useEffect } from "react";
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
import type { MachineAssembly, Marker } from "@/lib/standex/machine-assembly";
import {
  movingRotation,
  cycleU,
  scale,
  componentPose,
  isMovingPath,
  markerReading,
  partDelta,
  partGroup,
  pointAt,
  toRest,
  usesClip,
} from "@/lib/standex/machine-assembly";
import type { RigidDelta } from "@/lib/standex/machine-clip-registry";
import type { CycleSample, WorkshopConfig, Vec3 } from "@/lib/standex/magnetic-workshop";
import { sensorById, sizeLabel } from "@/lib/standex/sensor-catalog";
import { Body, Contacts, Magnet, CameraRig, ContextGuard, GhostMagnet } from "./scene";
import type { GhostPose } from "./scene";

export type MachineTool =
  | "navigate"
  | "sensor"
  | "magnet"
  | "measure"
  | "cable"
  /** Sélection des pièces mobiles. */
  | "select"
  /** Relevé d'un point (et de la normale de sa face) pour un axe ou une attache. */
  | "pick";

/** Point relevé sur une pièce, en mm, repère du modèle en position fermée. */
export interface SceneHit {
  point: Vec3;
  normal: Vec3;
  path: string;
  moving: boolean;
  /** Ensemble solidaire de la pièce (deux points d'un même ensemble bougent ensemble). */
  group?: string;
}
/** Aides visuelles du parcours guidé : jamais enregistrées. */
export interface GuideOverlay {
  highlightMoving: boolean;
  isolate: boolean;
  axis: { origin: Vec3; dir: Vec3; length: number } | null;
  points: Vec3[];
  attachMarks: Vec3[];
  onPickPart?: ((path: string) => void) | undefined;
  onPickPoint?: ((hit: SceneHit) => void) | undefined;
  onPlace?: ((which: "sensor" | "magnet", hit: SceneHit) => void) | undefined;
}

/** Tracé de câble : entièrement optionnel. Sans cette prop, la scène est inchangée. */
export interface CableRouting {
  /** Rôle du prochain point cliqué, choisi explicitement par l'utilisateur. */
  slot: "sensor" | "waypoint" | "connection";
  /** Trajet courant, déjà en millimètres. */
  points: [number, number, number][];
  targetLabel: string;
  /** Le point reçu est déjà en millimètres : aucune remise à l'échelle ici. */
  onPick: (point: [number, number, number]) => void;
}

/* i18n-canonical : libellés stockés en français, traduits au rendu par t(). */
const SLOT_TEXT: Record<CableRouting["slot"], string> = {
  sensor: "Sortie capteur",
  waypoint: "Passage",
  connection: "Connexion",
};

function CableOverlay({ routing }: { routing: CableRouting }) {
  const points = routing.points;
  return (
    <group>
      {points.length >= 2 && <Line points={points} color="#1d6fa5" lineWidth={3} />}
      {points.map((p, i) => {
        const first = i === 0,
          last = i === points.length - 1 && points.length > 1;
        return (
          <group key={`${i}-${p.join(",")}`} position={p}>
            <mesh>
              <sphereGeometry args={[1.6, 12, 12]} />
              <meshBasicMaterial color={first ? "#159776" : last ? "#ae5b31" : "#1d6fa5"} />
            </mesh>
            <Html position={[0, 5, 0]} center style={{ pointerEvents: "none" }}>
              <span className="mw-scene-label">
                {t(first ? "Capteur" : last ? "Connexion" : `Passage ${i}`)}
              </span>
            </Html>
          </group>
        );
      })}
    </group>
  );
}

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
/** Transformation rigide d'une pièce animée (p' = q·p + t), appliquée UNE fois. */
function DeltaGroup({ delta, children }: { delta: RigidDelta | null; children: ReactNode }) {
  if (!delta) return <>{t(children)}</>;
  return (
    <group position={delta.position} quaternion={delta.quaternion}>
      {t(children)}
    </group>
  );
}
/** Support d'un composant : pièce attachée (clip) ou sélection mobile (saisi). */
function SupportFrame({
  machine,
  which,
  u,
  children,
}: {
  machine: MachineAssembly;
  which: "sensor" | "magnet";
  u: number;
  children: ReactNode;
}) {
  if (usesClip(machine)) {
    const a = which === "sensor" ? machine.sensorAttach : machine.magnetAttach;
    return <DeltaGroup delta={a ? partDelta(machine, a.partPath, u) : null}>{t(children)}</DeltaGroup>;
  }
  return (
    <MovingIf
      moving={(which === "sensor" ? machine.sensorMount : machine.magnetMount) === "moving"}
      machine={machine}
      u={u}
    >
      {t(children)}
    </MovingIf>
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
  showNames,
  showMagnetName,
  reduced,
  onChange,
  onMarkers,
  onPlaced,
  routing,
  ghost,
  guide,
}: {
  guide?: GuideOverlay | undefined;
  asset: MachineAsset;
  config: WorkshopConfig;
  sample: CycleSample;
  tool: MachineTool;
  transformMode: "translate" | "rotate";
  showMachine: boolean;
  showSpace: boolean;
  xray: boolean;
  /** Affichage du nom du capteur : option d'affichage seule, jamais la géométrie. */
  showNames: boolean;
  showMagnetName: boolean;
  reduced: boolean;
  onChange: (patch: Partial<MachineAssembly>) => void;
  onMarkers: (markers: Marker[]) => void;
  onPlaced: () => void;
  routing?: CableRouting | undefined;
  /** Prévisualisation seule, exprimée dans le repère du modèle importé. */
  ghost?: GhostPose | null | undefined;
}) {
  const machine = config.machine!,
    model = sensorById(config.sensorId),
    u = cycleU(machine, sample.t);
  const sensorRef = useRef<Group>(null),
    magnetRef = useRef<Group>(null),
    control = useRef<TransformImpl>(null);
  // Repères de mesure : enregistrés en pose statique, ils suivent leur support.
  const reading = markerReading(machine, u);
  const markerPoints = (machine.markers ?? []).map((k) => pointAt(machine, k.partPath, k.point, u));
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
  const highlight = useMemo(
    () => new MeshStandardMaterial({ color: "#f0b429", emissive: "#7a4f00", roughness: 0.5 }),
    [],
  );
  useEffect(() => () => highlight.dispose(), [highlight]);
  const editable = (tool === "sensor" || tool === "magnet") && sample.t === 0;
  const selected = tool === "sensor" ? sensorRef : magnetRef;
  const hitOf = (event: ThreeEvent<MouseEvent>, path: string, moving: boolean): SceneHit | null => {
    if (!event.face) return null;
    const normal = event.face.normal
      .clone()
      .applyMatrix3(new Matrix3().getNormalMatrix(event.object.matrixWorld))
      .normalize();
    // Le point affiché est ramené à la pose statique du fichier : base commune
    // des attaches et repères, quel que soit l'instant du clip.
    const rest = toRest(machine, path, event.point.toArray() as Vec3, normal.toArray() as Vec3, u);
    return {
      point: rest.point,
      normal: rest.normal,
      path,
      moving,
      group: partGroup(machine, path),
    };
  };
  const place = (event: ThreeEvent<MouseEvent>, moving: boolean, path = "") => {
    if (tool === "navigate") return;
    // Un glisser de navigation n'est jamais un clic : il ne sélectionne ni ne place rien.
    if (event.delta > 4) return;
    event.stopPropagation();
    if (tool === "select") {
      if (path && sample.t === 0) guide?.onPickPart?.(path);
      return;
    }
    if (tool === "pick") {
      const hit = sample.t === 0 ? hitOf(event, path, moving) : null;
      if (hit) guide?.onPickPoint?.(hit);
      return;
    }
    if (tool === "cable") {
      // event.point est déjà en millimètres après unitScale : aucune remise à l'échelle.
      if (routing) routing.onPick(event.point.toArray() as [number, number, number]);
      return;
    }
    if (tool === "measure") {
      // Un repère est mémorisé sur SA pièce, à tout instant du cycle.
      if (!path) return;
      const rest = toRest(machine, path, event.point.toArray() as Vec3, [0, 1, 0], u);
      const marker: Marker = { partPath: path, point: rest.point };
      const current = machine.markers ?? [];
      onMarkers(current.length === 1 ? [current[0]!, marker] : [marker]);
      return;
    }

    if (!editable || !event.face) return;
    if (guide?.onPlace) {
      const hit = hitOf(event, path, moving);
      if (hit) guide.onPlace(tool === "sensor" ? "sensor" : "magnet", hit);
      onPlaced();
      return;
    }
    const normal = event.face.normal
      .clone()
      .applyMatrix3(new Matrix3().getNormalMatrix(event.object.matrixWorld))
      .normalize();
    const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), normal),
      e = new Euler().setFromQuaternion(q);
    const height = tool === "sensor" ? model.body[1] : magnetSize(config)[1];
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
  // Chaque pièce est dessinée une seule fois, dans le groupe fixe OU mobile :
  // un groupe sélectionné n'applique jamais deux fois la transformation.
  const clip = usesClip(machine);
  const draw = (moving: boolean, parts = asset.parts) =>
    parts
      .filter((p) => (clip ? moving : isMovingPath(machine, p.path) === moving))
      .map((p) => (
        <mesh
          key={p.path}
          geometry={p.geometry}
          material={
            guide?.isolate && !moving
              ? ghosts[0]!
              : moving && guide?.highlightMoving
                ? highlight
                : showMachine
                  ? p.material
                  : ghosts[moving ? 1 : 0]!
          }
          onClick={(event) => place(event, moving, p.path)}
          dispose={null}
        />
      ));
  // Animation du fichier : chaque ensemble solidaire reçoit SA transformation,
  // une seule fois (les pièces sont figées en pose statique, sans parent).
  const groups = new Map<string, typeof asset.parts>();
  if (clip)
    for (const p of asset.parts) {
      const g = partGroup(machine, p.path);
      groups.set(g, [...(groups.get(g) ?? []), p]);
    }
  return (
    <>
      {clip ? (
        [...groups].map(([g, parts]) => {
          const d = parts[0] ? partDelta(machine, parts[0].path, u) : null;
          return (
            <DeltaGroup key={g} delta={d}>
              {t(draw(!!d, parts))}
            </DeltaGroup>
          );
        })
      ) : (
        <>
          <group>{t(draw(false))}</group>
          <Motion machine={machine} u={u}>
            {t(draw(true))}
          </Motion>
        </>
      )}
      <SupportFrame which="sensor" machine={machine} u={u}>
        <group
          ref={sensorRef}
          position={machine.sensorPosition}
          rotation={machine.sensorRotation.map((n) => (n * Math.PI) / 180) as Vec3}
          onClick={(e) =>
            tool === "cable" ? place(e, machine.sensorMount === "moving") : e.stopPropagation()
          }
        >
          <group rotation={[0, housingYawDeg(model.id) * Math.PI / 180, 0]}><Body model={model} xray={xray} showCable={!routing?.points.length} />
          {xray && <Contacts model={model} contact={sample.contact} reduced={reduced} />}</group>
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
          {showNames && (
            <Html position={[0, model.body[1] / 2 + 7, 0]} center style={{ pointerEvents: "none" }}>
              <span className="mw-scene-label">
                {t(model.name)} · {t(sizeLabel(model))}
              </span>
            </Html>
          )}
        </group>
      </SupportFrame>
      <SupportFrame which="magnet" machine={machine} u={u}>
        <group
          ref={magnetRef}
          position={machine.magnetPosition}
          rotation={machine.magnetRotation.map((n) => (n * Math.PI) / 180) as Vec3}
          // Le routage électrique appartient exclusivement au capteur : cliquer
          // l'aimant ne doit jamais créer une « sortie capteur » trompeuse.
          onClick={(e) => e.stopPropagation()}
        >
          <Magnet
            showName={showMagnetName}
            config={{ ...config, magnetTilt: 0 }}
            sample={{ ...sample, position: [0, 0, 0], angle: 0 }}
          />
        </group>
      </SupportFrame>
      {editable && (
        <TransformControls
          ref={control}
          object={selected as React.RefObject<Group>}
          mode={transformMode}
          space="world"
          size={0.75}
          translationSnap={0.1}
          rotationSnap={Math.PI / 180}
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
      {markerPoints.map((p, i) => (
        <mesh key={"marker" + i} position={p}>
          <sphereGeometry args={[1.8, 12, 12]} />
          <meshBasicMaterial color="#ae5b31" />
        </mesh>
      ))}
      {reading && (
        <>
          <Line points={reading.points} color="#ae5b31" lineWidth={2} />
          <Html
            position={reading.points.map((v, i) => (v + reading.points[1][i]!) / 2) as Vec3}
            center
            style={{ pointerEvents: "none" }}
          >
            <span className="mw-scene-label t-metric" data-testid="scene-marker-distance">
              {msg("Distance entre les repères : {0} mm", [reading.distance.toFixed(1)])}
            </span>
          </Html>
        </>
      )}
      {ghost && <GhostMagnet ghost={ghost} />}
      {guide?.axis && (
        <Line
          points={[
            guide.axis.origin.map((v, i) => v - guide.axis!.dir[i]! * guide.axis!.length) as Vec3,
            guide.axis.origin.map((v, i) => v + guide.axis!.dir[i]! * guide.axis!.length) as Vec3,
          ]}
          color="#d9480f"
          lineWidth={3}
          dashed
          dashSize={4}
          gapSize={2}
        />
      )}
      {guide?.axis && (
        <mesh
          position={guide.axis.origin.map((v, i) => v + guide.axis!.dir[i]! * guide.axis!.length) as Vec3}
        >
          <sphereGeometry args={[2.2, 12, 12]} />
          <meshBasicMaterial color="#d9480f" />
        </mesh>
      )}
      {[...(guide?.points ?? []), ...(guide?.attachMarks ?? [])].map((p, i) => (
        <mesh key={i + ":" + p.join(",")} position={p}>
          <sphereGeometry args={[1.4, 10, 10]} />
          <meshBasicMaterial color={i < (guide?.points.length ?? 0) ? "#d9480f" : "#159776"} />
        </mesh>
      ))}
      {routing && routing.points.length > 0 && <CableOverlay routing={routing} />}
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
  showNames = true,
  showMagnetName = true,
  reduced,
  onChange,
  onMarkers,
  onPlaced,
  onContextLost,
  routing,
  ghost,
  guide,
}: {
  guide?: GuideOverlay | undefined;
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
  /** Affichage du nom du capteur : option d'affichage seule, jamais la géométrie. */
  showNames?: boolean;
  showMagnetName?: boolean;
  reduced: boolean;
  onChange: (patch: Partial<MachineAssembly>) => void;
  onMarkers: (markers: Marker[]) => void;
  onPlaced: () => void;
  onContextLost: () => void;
  /** Absent = comportement d'origine, aucun tracé de câble. */
  routing?: CableRouting | undefined;
  /** Prévisualisation seule : jamais enregistrée dans le montage. */
  ghost?: GhostPose | null | undefined;
}) {
  const m = config.machine!,
    extent = Math.max(...asset.size),
    sensor = sensorById(config.sensorId);
  const target: Vec3 =
    focus === "sensor" ? componentPose(m, "sensor", cycleU(m, sample.t)).position : asset.center;
  const distance = focus === "sensor" ? Math.max(45, sensor.body[0] * 2.5) : extent * 1.35;
  return (
    <Canvas
      camera={{ position: [440, 360, 530], near: 0.1, far: 100000, fov: 43 }}
      dpr={[1, 1.5]}
      onCreated={({ gl }) => {
        gl.setClearColor("#e2edf8");
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
        cellColor="#9db6cc"
        sectionColor="#6d90ad"
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
        showNames={showNames}
        showMagnetName={showMagnetName}
        reduced={reduced}
        onChange={onChange}
        onMarkers={onMarkers}
        onPlaced={onPlaced}
        routing={routing}
        ghost={ghost}
        guide={guide}
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
