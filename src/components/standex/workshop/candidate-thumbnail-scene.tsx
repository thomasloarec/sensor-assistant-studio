import { pairLayout } from "@/lib/standex/pair-layout";
import { pairedMagnetModel } from "@/lib/standex/paired-magnets";
/** Rendu 3D réel d'une vignette de candidat.
 *
 * Réutilise EXACTEMENT les mêmes composants et les mêmes cotes que l'atelier
 * (`Body`, `Contacts` de workshop/scene.tsx, catalogue `sensorById`) : une
 * vignette ne peut donc pas montrer une géométrie différente de l'atelier.
 * Chargé paresseusement et monté uniquement quand la vignette est visible.
 */
import { Canvas } from "@react-three/fiber";
import { Line, OrbitControls } from "@react-three/drei";
import { Body, Contacts, ContextGuard } from "./scene";
import { sensorById } from "@/lib/standex/sensor-catalog";
import type { Vec3 } from "@/lib/standex/magnetic-workshop";

export default function CandidateThumbnailScene({
  sensorId,
  cabled,
  pair,
  fitToView = false,
  reduced,
  onContextLost,
}: {
  sensorId: string;
  cabled: boolean;
  pair?: { magnetId: string; approach: string };
  reduced: boolean;
  fitToView?: boolean;
  onContextLost: () => void;
}) {
  const model = pairedMagnetModel(sensorId) ?? sensorById(sensorId);
  const [l, h, w] = model.body;
  const span = Math.max(l, h, w);
  const dist = pair ? 155 : 100; // Fixed camera: every catalogue thumbnail uses the same mm scale.
  const side = model.cableSide ?? -1;
  const magnet = pair ? pairedMagnetModel(pair.magnetId) : null;
  const layout = magnet ? pairLayout(model, magnet, pair!.approach) : null;
  const offset: Vec3 = layout?.offset ?? [0, 0, 0];

  // Le contact interne n'est lisible que sur les corps transparents.
  const showContacts = model.shape === "glass" || model.shape === "custom_pcb";
  const wireZ = Math.min(1.4, w * 0.16);
  const wires: Vec3[][] = [-1, 1].map((sign) => [
    [(side * l) / 2, 0, sign * wireZ],
    [side * (l / 2 + span * 0.5), 0, sign * wireZ],
    [side * (l / 2 + span * 0.85), h * 0.35, sign * wireZ * 2.2],
    [side * (l / 2 + span * 1.05), h * 0.9, sign * wireZ * 2.6],
  ]);

  return (
    <Canvas
      orthographic
      camera={{
        zoom: pair ? 1.4 : fitToView ? 80 / span : 2,
        position: [dist * 0.68, dist * 0.55, dist * 0.86],
        fov: 38,
        near: 0.1,
        far: dist * 12,
      }}
      dpr={[1, 1.5]}
      gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
      onCreated={({ gl }) => gl.setClearColor("#000000", 0)}
    >
      <ContextGuard onLost={onContextLost} />
      <ambientLight intensity={2.1} />
      <directionalLight position={[span * 2, span * 3, span * 1.8]} intensity={2.2} />
      <directionalLight position={[-span * 2, span, -span * 2]} intensity={0.8} />
      <group rotation={[0, layout?.sensorYaw ?? 0, 0]}>
        <Body model={model} xray={showContacts} showCable={false} />
        {showContacts ? <Contacts model={model} contact="open" reduced /> : null}
        {cabled && !["smd", "glass", "custom_pcb"].includes(model.shape)
          ? wires.map((points, i) => (
              <Line
                key={i}
                points={points}
                color={i === 0 ? "#3c4853" : "#a55038"}
                lineWidth={2.5}
              />
            ))
          : null}
      </group>
      {pair && magnet && (
        <group position={offset} rotation={[0, layout?.magnetYaw ?? 0, 0]}>
          {magnet ? (
            <Body model={magnet} xray={false} showCable={false} />
          ) : (
            [-1, 1].map((sign) => (
              <mesh key={sign} position={[sign * 5, 0, 0]}>
                <boxGeometry args={[10, 5, 5]} />
                <meshStandardMaterial color={sign === 1 ? "#d34f43" : "#347db8"} />
              </mesh>
            ))
          )}
        </group>
      )}
      <OrbitControls
        makeDefault
        enablePan={false}
        enableZoom={false}
        autoRotate={!reduced}
        autoRotateSpeed={0.8}
        target={pair ? [offset[0] / 2, 0, offset[2] / 2] : [0, 0, 0]}
      />
    </Canvas>
  );
}
