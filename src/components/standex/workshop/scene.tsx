import { useEffect, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { Html, Line, OrbitControls, Grid } from "@react-three/drei";
import { BufferAttribute, BufferGeometry } from "three";
import {
  educationSignal,
  fieldAt,
  length,
  MK03_DISTANCES,
  unavailableReason,
} from "@/lib/standex/magnetic-workshop";
import type { WorkshopConfig, CycleSample, Vec3 } from "@/lib/standex/magnetic-workshop";

function Label({ position, children }: { position: Vec3; children: React.ReactNode }) {
  return (
    <Html position={position} center style={{ pointerEvents: "none" }}>
      <span className="mw-scene-label">{children}</span>
    </Html>
  );
}
function Reed({ closed, reference }: { closed: boolean; reference: boolean }) {
  return (
    <group>
      <mesh>
        <boxGeometry args={[20, 4, 6]} />
        <meshStandardMaterial
          color={reference ? "#254061" : "#bcd6dd"}
          transparent
          opacity={reference ? 0.86 : 0.26}
          roughness={0.35}
        />
      </mesh>
      <mesh position={[-4.5, 0, closed ? 0 : -0.5]}>
        <boxGeometry args={[11, 0.6, 0.7]} />
        <meshStandardMaterial
          color={closed ? "#31bb9c" : "#aab3bb"}
          metalness={0.6}
          roughness={0.3}
        />
      </mesh>
      <mesh position={[4.5, 0, closed ? 0 : 0.5]}>
        <boxGeometry args={[11, 0.6, 0.7]} />
        <meshStandardMaterial
          color={closed ? "#31bb9c" : "#aab3bb"}
          metalness={0.6}
          roughness={0.3}
        />
      </mesh>
      <Line
        points={[
          [-16, 0, 0],
          [-10, 0, 0],
        ]}
        color="#535759"
        lineWidth={3}
      />
      <Line
        points={[
          [10, 0, 0],
          [16, 0, 0],
        ]}
        color="#535759"
        lineWidth={3}
      />
      <mesh position={[0, 2.3, 0]}>
        <sphereGeometry args={[0.8, 16, 16]} />
        <meshBasicMaterial color={closed ? "#008667" : "#8d9aa6"} />
      </mesh>
      <Label position={[0, 5, -5]}>{reference ? "Capteur MK03 · schéma" : "Reed générique"}</Label>
    </group>
  );
}
function Magnet({ config, sample }: { config: WorkshopConfig; sample: CycleSample }) {
  const reference = config.mode === "reference";
  const magnetizationAngle = config.magnetization === "axial" ? 0 : Math.PI / 2;
  return (
    <group position={sample.position} rotation={[0, (-sample.angle * Math.PI) / 180, 0]}>
      <mesh>
        <boxGeometry args={reference ? [20, 4, 6] : [12, 4, 6]} />
        <meshStandardMaterial color="#738bb0" roughness={0.45} />
      </mesh>
      {!reference && (
        <group rotation={[0, -magnetizationAngle, 0]}>
          {([-1, 1] as const).map((sign) => (
            <group
              key={sign}
              position={[sign * (config.magnetization === "axial" ? 6.4 : 3.4), 0, 0]}
            >
              <mesh>
                <sphereGeometry args={[1.3, 16, 16]} />
                <meshBasicMaterial color={sign * config.polarity === 1 ? "#d46f56" : "#356fac"} />
              </mesh>
              <Label position={[0, 4, 0]}>{sign * config.polarity === 1 ? "N" : "S"}</Label>
            </group>
          ))}
        </group>
      )}
      <Label position={[0, 5, reference ? 5 : 9]}>
        {reference ? "Aimant M02 · schéma" : "Aimant générique"}
      </Label>
    </group>
  );
}
function FieldLines({ config, sample }: { config: WorkshopConfig; sample: CycleSample }) {
  const lines = useMemo(
    () =>
      Array.from({ length: 10 }, (_, j) => {
        const theta = (j / 10) * Math.PI * 2;
        let p: Vec3 = [6, 3 * Math.cos(theta), 3 * Math.sin(theta)];
        const points: Vec3[] = [p];
        for (let i = 0; i < 180; i++) {
          const b = fieldAt(p, [0, 0, 0], [1, 0, 0]);
          if (!b || length(p) > 70) break;
          const n = length(b);
          if (n < 1e-8) break;
          p = [p[0] + (b[0] / n) * 1.1, p[1] + (b[1] / n) * 1.1, p[2] + (b[2] / n) * 1.1];
          points.push(p);
        }
        return points;
      }),
    [],
  );
  const angle =
    sample.angle +
    (config.magnetization === "diametral" ? 90 : 0) +
    (config.polarity === -1 ? 180 : 0);
  return (
    <group position={sample.position} rotation={[0, (-angle * Math.PI) / 180, 0]}>
      {lines.map((points, i) => (
        <Line key={i} points={points} color="#6982a7" transparent opacity={0.48} lineWidth={1} />
      ))}
    </group>
  );
}
function Zones({ config, angle }: { config: WorkshopConfig; angle: number }) {
  const geometries = useMemo(() => {
    const close: number[] = [],
      hold: number[] = [];
    for (let x = -36; x <= 36; x += 3)
      for (let y = -18; y <= 18; y += 3)
        for (let z = -36; z <= 36; z += 3) {
          const s = educationSignal(config, [x, y, z], angle);
          if (s === null) continue;
          if (s >= 1) close.push(x, y, z);
          else if (s >= 0.67 && s <= 0.77) hold.push(x, y, z);
        }
    return [close, hold].map((p) => {
      const g = new BufferGeometry();
      g.setAttribute("position", new BufferAttribute(new Float32Array(p), 3));
      return g;
    });
  }, [config, angle]);
  useEffect(() => () => geometries.forEach((geometry) => geometry.dispose()), [geometries]);
  return (
    <group>
      {geometries.map((geometry, i) => (
        <points key={geometry.uuid} geometry={geometry}>
          <pointsMaterial
            color={i === 0 ? "#309c84" : "#d4a35d"}
            size={1.2}
            transparent
            opacity={0.65}
            depthWrite={false}
          />
        </points>
      ))}
    </group>
  );
}
function ReferenceMarkers({ config }: { config: WorkshopConfig }) {
  const [pull, drop] = MK03_DISTANCES[config.sensitivity][config.geometry];
  const d1 = config.geometry === "D1";
  return (
    <group>
      {([pull, drop] as const).map((d, i) => {
        const p = d + (d1 ? 6 : 20);
        return (
          <group key={i}>
            <Line
              points={
                d1
                  ? [
                      [-17, 0, p],
                      [17, 0, p],
                    ]
                  : [
                      [p, 0, -12],
                      [p, 0, 12],
                    ]
              }
              color={i === 0 ? "#008667" : "#c38a36"}
              lineWidth={2}
              dashed
              dashSize={1.1}
              gapSize={0.7}
            />
            <Label position={d1 ? [i === 0 ? -22 : 22, 1, p] : [p, 1, i === 0 ? -18 : 18]}>
              {i === 0 ? "Ferme" : "Ouvre"} · {d} mm
            </Label>
          </group>
        );
      })}
    </group>
  );
}
export default function WorkshopScene({
  config,
  sample,
  samples,
  view,
  zones,
  field,
}: {
  config: WorkshopConfig;
  sample: CycleSample;
  samples: CycleSample[];
  view: "3d" | "top";
  zones: boolean;
  field: boolean;
}) {
  const reference = config.mode === "reference",
    available = !unavailableReason(config);
  const path = useMemo(
    () =>
      samples
        .filter((_, i) => i % 10 === 0)
        .slice(0, 31)
        .map((s) => s.position),
    [samples],
  );
  return (
    <Canvas
      key={view}
      orthographic={view === "top"}
      camera={
        view === "top"
          ? { position: [0, 110, 0.01], zoom: 5.1, near: 0.1, far: 500 }
          : { position: [64, 66, 89], fov: 43, near: 0.1, far: 500 }
      }
      dpr={[1, 1.5]}
      gl={{ antialias: true, alpha: false }}
      onCreated={({ gl }) => gl.setClearColor("#f0f4f7")}
    >
      <ambientLight intensity={1.9} />
      <directionalLight position={[30, 60, 20]} intensity={2.4} />
      <Grid
        position={[0, -3, 0]}
        args={[180, 180]}
        cellSize={5}
        cellThickness={0.5}
        cellColor="#d1dbe3"
        sectionSize={25}
        sectionColor="#bbcbd7"
        sectionThickness={0.8}
        fadeDistance={220}
        fadeStrength={1.5}
      />
      <group
        position={[config.mountX, 0, config.mountZ]}
        rotation={[0, (-config.mountAngle * Math.PI) / 180, 0]}
      >
        <group rotation={[0, (-(reference ? 0 : config.sensorAngle) * Math.PI) / 180, 0]}>
          <Reed closed={sample.contact === "closed"} reference={reference} />
        </group>
        <Magnet config={config} sample={sample} />
        <Line points={path} color="#667e96" lineWidth={1.5} dashed dashSize={1} gapSize={1} />
        {reference && available && zones && <ReferenceMarkers config={config} />}
        {!reference && available && zones && <Zones config={config} angle={sample.angle} />}
        {!reference && available && field && <FieldLines config={config} sample={sample} />}
        <Line
          points={[
            [0, -2, 0],
            [24, -2, 0],
          ]}
          color="#a6b5c0"
          lineWidth={1}
        />
        <Label position={[26, -1, 0]}>x</Label>
        <Line
          points={[
            [0, -2, 0],
            [0, -2, 24],
          ]}
          color="#a6b5c0"
          lineWidth={1}
        />
        <Label position={[0, -1, 26]}>z</Label>
      </group>
      <OrbitControls
        makeDefault
        enableRotate={view === "3d"}
        target={[5, 0, 12]}
        minDistance={45}
        maxDistance={240}
        minZoom={2}
        maxZoom={12}
      />
    </Canvas>
  );
}
