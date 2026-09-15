import { pairLayout } from "@/lib/standex/pair-layout";
import { pairedMagnetModel } from "@/lib/standex/paired-magnets";
/** Rendu 3D réel d'une vignette de candidat.
 *
 * Réutilise EXACTEMENT les mêmes composants et les mêmes cotes que l'atelier
 * (`Body`, `Contacts` de workshop/scene.tsx, catalogue `sensorById`) : une
 * vignette ne peut donc pas montrer une géométrie différente de l'atelier.
 * Chargé paresseusement et monté uniquement quand la vignette est visible.
 */
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Line, OrbitControls } from "@react-three/drei";
import { Body, Contacts, ContextGuard } from "./scene";
import { electricalDetailsAllowed, formatMm, sensorById } from "@/lib/standex/sensor-catalog";
import { projectedScaleBar, thumbnailZoom } from "@/lib/standex/scale-bar";
import { t } from "@/lib/i18n/core";
import { useEffect, useRef, useState } from "react";
import type { Vec3 } from "@/lib/standex/magnetic-workshop";

/** Capture l'image du rendu réel après quelques frames, le temps que la scène
 * soit stabilisée (matériaux compilés, première orbite jouée). La capture est
 * TENTÉE une seule fois ; si le canevas refuse la lecture (`toDataURL` levé ou
 * image vide), rien n'est publié et la vignette garde son rendu vivant plutôt
 * que d'afficher une image fausse. */
function SnapshotCapture({ onSnapshot }: { onSnapshot: (dataUrl: string) => void }) {
  const gl = useThree((state) => state.gl);
  const frames = useRef(0);
  const done = useRef(false);
  useFrame(() => {
    if (done.current) return;
    frames.current += 1;
    if (frames.current < 12) return;
    done.current = true;
    try {
      const url = gl.domElement.toDataURL("image/png");
      if (url.startsWith("data:image/") && url.length > 1024) onSnapshot(url);
    } catch {
      /* Canevas non lisible : on ne publie pas d'image. */
    }
  });
  return null;
}

export default function CandidateThumbnailScene({
  sensorId,
  hostSensorId,
  cabled,
  pair,
  fitToView = false,
  reduced,
  scaleBar = false,
  snapshotWhenSettled = false,
  onSnapshot,
  onContextLost,
}: {
  sensorId: string;
  /** Capteur du COUPLE quand l'objet dessiné est un aimant : certaines fiches
   *  donnent un boîtier par variante de capteur (M11S en M5 ou en M8). Sans ce
   *  contexte, l'aimant serait dessiné dans la mauvaise variante. */
  hostSensorId?: string;
  cabled: boolean;
  pair?: { magnetId: string; approach: string };
  reduced: boolean;
  fitToView?: boolean;
  /** Règle graduée mesurée dans la projection orthographique. */
  scaleBar?: boolean;
  /** Figer le rendu en image dès qu'il est stabilisé, puis rendre le contexte. */
  snapshotWhenSettled?: boolean;
  onSnapshot?: (dataUrl: string) => void;
  onContextLost: () => void;
}) {
  const model = pairedMagnetModel(sensorId, hostSensorId) ?? sensorById(sensorId);
  const [l, h, w] = model.body;
  const span = Math.max(l, h, w);
  const dist = pair ? 155 : 100; // Fixed camera: every catalogue thumbnail uses the same mm scale.
  /* Zoom = pixels par millimètre dans le plan de vue (caméra orthographique).
     La règle ci-dessous en découle : elle mesure une longueur réelle. */
  const zoom = thumbnailZoom(span, { pair: Boolean(pair), fitToView });
  const host = useRef<HTMLDivElement>(null);
  const [hostWidth, setHostWidth] = useState(0);
  useEffect(() => {
    const node = host.current;
    if (!node) return;
    const read = () => setHostWidth(node.clientWidth);
    read();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(read);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const rule =
    scaleBar && hostWidth > 0 ? projectedScaleBar(span, zoom, hostWidth * 0.42) : null;
  const side = model.cableSide ?? -1;
  const magnet = pair ? pairedMagnetModel(pair.magnetId, model.id) : null;
  const layout = magnet ? pairLayout(model, magnet, pair!.approach) : null;
  const offset: Vec3 = layout?.offset ?? [0, 0, 0];

  // Le contact interne n'est lisible que sur les corps transparents.
  const electrical = electricalDetailsAllowed(model);
  const showContacts = electrical && (model.shape === "glass" || model.shape === "custom_pcb");
  const wireZ = Math.min(1.4, w * 0.16);
  const wires: Vec3[][] = [-1, 1].map((sign) => [
    [(side * l) / 2, 0, sign * wireZ],
    [side * (l / 2 + span * 0.5), 0, sign * wireZ],
    [side * (l / 2 + span * 0.85), h * 0.35, sign * wireZ * 2.2],
    [side * (l / 2 + span * 1.05), h * 0.9, sign * wireZ * 2.6],
  ]);

  return (
    <div className="candidate-thumb-stage" ref={host}>
      <Canvas
      orthographic
      camera={{
        zoom,
        position: [dist * 0.68, dist * 0.55, dist * 0.86],
        fov: 38,
        near: 0.1,
        far: dist * 12,
      }}
      dpr={[1, 1.5]}
      /* `preserveDrawingBuffer` est nécessaire pour lire le rendu : sans lui,
         `toDataURL` renvoie une image vide après la présentation de la frame. */
      gl={{
        antialias: true,
        alpha: true,
        powerPreference: "low-power",
        preserveDrawingBuffer: true,
      }}
      onCreated={({ gl }) => gl.setClearColor("#000000", 0)}
    >
      <ContextGuard onLost={onContextLost} />
      {snapshotWhenSettled && onSnapshot ? <SnapshotCapture onSnapshot={onSnapshot} /> : null}
      <ambientLight intensity={2.1} />
      <directionalLight position={[span * 2, span * 3, span * 1.8]} intensity={2.2} />
      <directionalLight position={[-span * 2, span, -span * 2]} intensity={0.8} />
      <group rotation={[0, layout?.sensorYaw ?? 0, 0]}>
        <Body model={model} xray={showContacts} showCable={false} />
        {showContacts ? <Contacts model={model} contact="open" reduced /> : null}
        {electrical && cabled && !["smd", "glass", "custom_pcb"].includes(model.shape)
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
      {rule ? (
        <div className="candidate-thumb-rule" aria-hidden="true">
          <span className="candidate-thumb-rule-line" style={{ inlineSize: `${rule.lengthPx}px` }} />
          <span className="candidate-thumb-rule-text">{`${formatMm(rule.stepMm)} mm`}</span>
        </div>
      ) : null}
      {rule ? (
        <span className="sr-only">
          {`${t("Échelle")} : ${formatMm(rule.stepMm)} mm`}
        </span>
      ) : null}
    </div>
  );
}
