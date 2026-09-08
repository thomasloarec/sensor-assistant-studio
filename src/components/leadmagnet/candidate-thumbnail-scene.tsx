/** Rendu 3D réel d'une vignette de candidat.
 *
 * Réutilise EXACTEMENT les mêmes composants et les mêmes cotes que l'atelier
 * (`Body`, `Contacts` de workshop/scene.tsx, catalogue `sensorById`) : une
 * vignette ne peut donc pas montrer une géométrie différente de l'atelier.
 * Chargé paresseusement et monté uniquement quand la vignette est visible.
 */
import { Canvas } from "@react-three/fiber";
import { Line, OrbitControls } from "@react-three/drei";
import { Body, Contacts, ContextGuard } from "@/components/standex/workshop/scene";
import { sensorById } from "@/lib/standex/sensor-catalog";
import type { Vec3 } from "@/lib/standex/magnetic-workshop";

export default function CandidateThumbnailScene({
  sensorId,
  cabled,
  reduced,
  onContextLost,
}: {
  sensorId: string;
  cabled: boolean;
  reduced: boolean;
  onContextLost: () => void;
}) {
  const model = sensorById(sensorId);
  const [l, h, w] = model.body;
  const span = Math.max(l, h, w);
  const dist = span * 1.75 + 6;
  const side = model.cableSide ?? -1;
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
      camera={{
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
      <Body model={model} xray={showContacts} />
      {showContacts ? <Contacts model={model} contact="open" reduced /> : null}
      {cabled
        ? wires.map((points, i) => (
            <Line key={i} points={points} color="#7d8f9b" lineWidth={2.5} />
          ))
        : null}
      <OrbitControls
        makeDefault
        enablePan={false}
        enableZoom={false}
        autoRotate={!reduced}
        autoRotateSpeed={0.8}
        target={[0, 0, 0]}
      />
    </Canvas>
  );
}
