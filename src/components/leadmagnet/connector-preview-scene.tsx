/** Scène 3D réelle de l'aperçu d'un boîtier connecteur.
 *
 * Reprend le même budget de contextes WebGL et le même comportement de
 * rotation que les vignettes de candidats (`candidate-thumbnail.tsx`) :
 * chargé paresseusement, une seule instance par emplacement visible, rotation
 * automatique désactivée sous `prefers-reduced-motion`. Aucune broche
 * électrique n'est modélisée : seules les alvéoles (creux) du boîtier
 * femelle sont représentées, au nombre exact de positions.
 */
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { DocumentedHousing } from "@/lib/leadmagnet/connector-library";
import type { HousingGeometry } from "@/lib/leadmagnet/connector-geometry";
import { ContextGuard } from "@/components/standex/workshop/scene";

export default function ConnectorPreviewScene({
  housing,
  geometry,
  reduced,
  onContextLost,
}: {
  housing: DocumentedHousing;
  geometry: HousingGeometry;
  reduced: boolean;
  onContextLost: () => void;
}) {
  const width = geometry.width.valueMm;
  const height = geometry.height.valueMm;
  const depth = geometry.depth.valueMm;
  const span = Math.max(width, height, depth);
  const cavityWidth = Math.min(1.4, housing.pitchMm * 0.5);
  const cavityDepth = depth * 0.55;
  const startX = -((housing.positions - 1) * housing.pitchMm) / 2;
  const chamferSize = Math.min(width, height) * 0.18;

  return (
    <Canvas
      orthographic
      camera={{
        zoom: 60 / span,
        position: [span * 1.1, span * 0.9, span * 1.3],
        near: 0.1,
        far: span * 12,
      }}
      dpr={[1, 1.5]}
      gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
      onCreated={({ gl }) => gl.setClearColor("#000000", 0)}
    >
      <ContextGuard onLost={onContextLost} />
      <ambientLight intensity={2.1} />
      <directionalLight position={[span * 2, span * 3, span * 1.8]} intensity={2.2} />
      <directionalLight position={[-span * 2, span, -span * 2]} intensity={0.8} />
      <group>
        {/* Corps prismatique du boîtier femelle. */}
        <mesh>
          <boxGeometry args={[width, height, depth]} />
          <meshStandardMaterial color="#3c4853" roughness={0.55} metalness={0.05} />
        </mesh>
        {/* Chanfrein/détrompeur : coin abattu visible sur une arête haute. */}
        <mesh
          position={[width / 2 - chamferSize / 2, height / 2 - chamferSize / 2, 0]}
          rotation={[0, 0, Math.PI / 4]}
        >
          <boxGeometry args={[chamferSize, chamferSize, depth + 0.02]} />
          <meshStandardMaterial color="#22282e" roughness={0.6} />
        </mesh>
        {/* Saillie inférieure documentée séparément sur le plan (jamais fondue
            dans la hauteur du corps). */}
        {geometry.lowerProtrusion ? (
          <mesh position={[0, -(height + geometry.lowerProtrusion.valueMm) / 2, 0]}>
            <boxGeometry
              args={[width * 0.6, geometry.lowerProtrusion.valueMm, depth * 0.6]}
            />
            <meshStandardMaterial color="#3c4853" roughness={0.55} metalness={0.05} />
          </mesh>
        ) : null}
        {/* Alvéoles : exactement `positions` creux, un par voie documentée. */}
        {Array.from({ length: housing.positions }, (_, i) => (
          <mesh
            key={i}
            position={[startX + i * housing.pitchMm, 0, depth / 2 - cavityDepth / 2 + 0.01]}
          >
            <boxGeometry args={[cavityWidth, height * 0.45, cavityDepth]} />
            <meshStandardMaterial color="#0f1317" roughness={0.9} />
          </mesh>
        ))}
      </group>
      <OrbitControls
        makeDefault
        enablePan={false}
        enableZoom={false}
        autoRotate={!reduced}
        autoRotateSpeed={0.8}
      />
    </Canvas>
  );
}
