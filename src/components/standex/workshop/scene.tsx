import { t } from "@/lib/i18n/core";
import { useMemo, useRef, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, Line, OrbitControls, Grid } from "@react-three/drei";
import { Shape, Path, Quaternion, Vector3 } from "three";
import type { Group } from "three";
import {
  fieldAt,
  length,
  approachOffset,
  magnetSize,
  MK03_DISTANCES,
  unavailableReason,
  momentFor,
} from "@/lib/standex/magnetic-workshop";
import type { WorkshopConfig, CycleSample, Vec3, Contact } from "@/lib/standex/magnetic-workshop";
import {
  sensorById,
  bladeLength,
  bladeOffsetZ,
  bladeOffsetY,
  customLayout,
  formatMm,
} from "@/lib/standex/sensor-catalog";
import type { SensorModel } from "@/lib/standex/sensor-catalog";

const STATUS = { closed: "#009d78", open: "#8497a6", unknown: "#c18b39" };
function Label({
  position,
  children,
  className = "",
}: {
  position: Vec3;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Html position={position} center style={{ pointerEvents: "none" }}>
      <span className={`mw-scene-label ${className}`}>{t(children)}</span>
    </Html>
  );
}
function rounded(path: Shape | Path, x: number, z: number, w: number, h: number, r: number) {
  path.moveTo(x + r, z);
  path.lineTo(x + w - r, z);
  path.quadraticCurveTo(x + w, z, x + w, z + r);
  path.lineTo(x + w, z + h - r);
  path.quadraticCurveTo(x + w, z + h, x + w - r, z + h);
  path.lineTo(x + r, z + h);
  path.quadraticCurveTo(x, z + h, x, z + h - r);
  path.lineTo(x, z + r);
  path.quadraticCurveTo(x, z, x + r, z);
  path.closePath();
}
/** Schéma pédagogique « sur mesure » : reed nu en verre soudé sur un circuit
 * imprimé volontairement NON rectangulaire (encoche de détrompage, coins
 * chanfreinés, pattes de fixation percées). Toutes les cotes viennent de
 * `customLayout`, dérivées du reed : rien n'est saisi à la main ici, et rien
 * de tout cela ne constitue une référence commandable ni une cote validée. */
function CustomBoard({ model, xray }: { model: SensorModel; xray: boolean }) {
  const layout = customLayout(model)!;
  const { reedLength, reedDiameter, pcbLength, pcbWidth, pcbThickness } = layout;
  const [, height] = model.body;
  const L = pcbLength / 2,
    W = pcbWidth / 2,
    r = Math.min(2, pcbWidth * 0.1),
    chamfer = pcbWidth * 0.25,
    nd = layout.notchDepth,
    nw = layout.notchWidth / 2;
  const boardTop = -height / 2 + pcbThickness;
  const reedY = boardTop + reedDiameter / 2;
  const padX = reedLength / 2 + reedDiameter * 0.9;

  const outline = useMemo(() => {
    const s = new Shape();
    s.moveTo(-L + chamfer, -W);
    s.lineTo(L - r, -W);
    s.quadraticCurveTo(L, -W, L, -W + r);
    s.lineTo(L, -nw);
    s.lineTo(L - nd, -nw);
    s.lineTo(L - nd, nw);
    s.lineTo(L, nw);
    s.lineTo(L, W - r);
    s.quadraticCurveTo(L, W, L - r, W);
    s.lineTo(-L + chamfer, W);
    s.lineTo(-L, W - chamfer);
    s.lineTo(-L, -W + chamfer);
    s.closePath();
    for (const sign of [-1, 1]) {
      const hole = new Path();
      hole.absarc(
        -L + chamfer + layout.tabRadius * 1.6,
        sign * (W - layout.tabRadius * 1.9),
        layout.tabRadius,
        0,
        Math.PI * 2,
        false,
      );
      s.holes.push(hole);
    }
    return s;
  }, [L, W, r, chamfer, nd, nw, layout.tabRadius]);

  const opacity = xray ? 0.3 : 1;
  return (
    <group>
      {/* Circuit imprimé */}
      <mesh position={[0, -height / 2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <extrudeGeometry args={[outline, { depth: pcbThickness, bevelEnabled: false }]} />
        <meshStandardMaterial
          color={model.color}
          transparent={xray}
          opacity={opacity}
          depthWrite={!xray}
          roughness={0.72}
          metalness={0.05}
        />
      </mesh>
      {/* Pistes cuivre : du pad de soudure vers la zone de raccordement */}
      {([-1, 1] as const).map((sign) => (
        <mesh
          key={`trace${sign}`}
          position={[(-L + padX * sign) / 2, boardTop + 0.06, sign * 2.2]}
        >
          <boxGeometry args={[Math.abs(padX * sign + L), 0.12, reedDiameter * 0.3]} />
          <meshStandardMaterial color="#b87333" metalness={0.75} roughness={0.32} />
        </mesh>
      ))}
      {/* Pastilles + soudures */}
      {([-1, 1] as const).map((sign) => (
        <group key={`pad${sign}`} position={[sign * padX, boardTop, sign * 2.2]}>
          <mesh position={[0, 0.07, 0]}>
            <cylinderGeometry args={[reedDiameter * 0.42, reedDiameter * 0.42, 0.14, 24]} />
            <meshStandardMaterial color="#b87333" metalness={0.75} roughness={0.3} />
          </mesh>
          <mesh position={[0, reedDiameter * 0.18, 0]} scale={[1, 0.62, 1]}>
            <sphereGeometry args={[reedDiameter * 0.34, 18, 14]} />
            <meshStandardMaterial color="#9aa5ad" metalness={0.85} roughness={0.24} />
          </mesh>
        </group>
      ))}
      {/* Ampoule de verre du reed nu, transparente : les lames restent visibles */}
      <mesh position={[0, reedY, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[reedDiameter / 2, reedDiameter / 2, reedLength, 32]} />
        <meshStandardMaterial
          color="#cfe6ec"
          transparent
          opacity={0.3}
          depthWrite={false}
          roughness={0.1}
          metalness={0.05}
        />
      </mesh>
      {/* Fils de sortie du reed, cintrés jusqu'aux pastilles */}
      {([-1, 1] as const).map((sign) => (
        <Line
          key={`lead${sign}`}
          points={[
            [(sign * reedLength) / 2, reedY, 0],
            [sign * (reedLength / 2 + reedDiameter * 0.5), reedY, 0],
            [sign * padX, reedY, sign * 2.2],
            [sign * padX, boardTop + 0.2, sign * 2.2],
          ]}
          color="#c9d3d9"
          lineWidth={2}
        />
      ))}
      {/* Fils de liaison vers l'extérieur */}
      {([-1, 1] as const).map((sign) => (
        <Line
          key={`wire${sign}`}
          points={[
            [-L, boardTop + 0.12, sign * 2.2],
            [-L - reedDiameter * 2, boardTop + 0.12, sign * 2.2],
            [-L - reedDiameter * 3.2, boardTop + 0.12, sign * 3.4],
          ]}
          color="#60727d"
          lineWidth={2}
        />
      ))}
    </group>
  );
}
export function Body({ model, xray }: { model: SensorModel; xray: boolean }) {
  if (model.shape === "custom_pcb" && customLayout(model))
    return <CustomBoard model={model} xray={xray} />;
  return <StandardBody model={model} xray={xray} />;
}
function StandardBody({ model, xray }: { model: SensorModel; xray: boolean }) {
  const [l, h, w] = model.body,
    opacity = xray ? 0.25 : 1;
  const baseShape = useMemo(() => {
    const s = new Shape();
    rounded(s, -l / 2, -w / 2, l, w, Math.min(0.6, w * 0.1));
    model.holes?.forEach(([x, z, hl, hw]) => {
      const hole = new Path();
      rounded(hole, x - hl / 2, -z - hw / 2, hl, hw, Math.min(hl, hw) / 2);
      s.holes.push(hole);
    });
    return s;
  }, [model, l, w]);
  const material = (
    <meshStandardMaterial
      color={model.color}
      transparent={xray}
      opacity={opacity}
      depthWrite={!xray}
      metalness={model.shape === "threaded" ? 0.4 : 0.12}
      roughness={0.4}
    />
  );
  const cylindrical = ["cylinder", "threaded", "pressfit", "glass"].includes(model.shape);
  return (
    <group>
      {cylindrical ? (
        <mesh rotation={[0, 0, Math.PI / 2]} scale={[h / 2, 1, w / 2]}>
          <cylinderGeometry args={[1, 1, l, 48]} />
          {t(material)}
        </mesh>
      ) : (
        <mesh position={[0, -h / 2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <extrudeGeometry
            args={[
              baseShape,
              {
                depth: model.shape === "flange" ? (model.baseThickness ?? h) : h,
                bevelEnabled: false,
                curveSegments: 8,
              },
            ]}
          />
          {t(material)}
        </mesh>
      )}
      {model.shape === "flange" && (
        <mesh position={[0, (model.baseThickness ?? h) / 2, -w / 2 + (model.raisedDepth ?? w) / 2]}>
          <boxGeometry args={[l, h - (model.baseThickness ?? h), model.raisedDepth ?? w]} />
          {t(material)}
        </mesh>
      )}
      {model.shape === "threaded" && (
        <>
          {Array.from({ length: Math.floor(l / 1.6) }, (_, i) => (
            <mesh key={i} position={[-l / 2 + i * 1.6 + 0.5, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
              <torusGeometry args={[w / 2, 0.11, 4, 32]} />
              <meshStandardMaterial color={model.color} transparent opacity={xray ? 0.25 : 0.8} />
            </mesh>
          ))}
          {[-0.24, 0.24].map((x) => (
            <mesh key={x} position={[l * x, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry
                args={[
                  (model.nutWidth ?? w) / Math.sqrt(3),
                  (model.nutWidth ?? w) / Math.sqrt(3),
                  Math.max(2, w * 0.4),
                  6,
                ]}
              />
              {t(material)}
            </mesh>
          ))}
        </>
      )}
      {model.shape === "pressfit" && (
        <mesh position={[l / 2 - 0.5, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry
            args={[(model.collarDiameter ?? w) / 2, (model.collarDiameter ?? w) / 2, 1, 48]}
          />
          {t(material)}
        </mesh>
      )}
      {model.shape === "smd"
        ? [-1, 1].map((sign) => (
            <mesh key={sign} position={[sign * (l / 2 - 0.1), -h / 2 + 0.18, 0]}>
              <boxGeometry args={[((model.terminalSpan ?? l) - l) / 2 + 0.45, 0.28, w * 0.65]} />
              <meshStandardMaterial color="#a7b5bd" metalness={0.8} roughness={0.25} />
            </mesh>
          ))
        : [-1, 1].map((sign) => {
            const side = model.cableSide ?? -1,
              z = bladeOffsetZ(model) + sign * Math.min(0.65, w * 0.15);
            return (
              <Line
                key={sign}
                points={[
                  [(side * l) / 2, 0, z],
                  [side * (l / 2 + 8), 0, z],
                  [side * (l / 2 + 10), 0, z],
                ]}
                color="#60727d"
                lineWidth={2}
              />
            );
          })}
    </group>
  );
}
function ContactFlow({ span, reduced }: { span: number; reduced: boolean }) {
  const ref = useRef<Group>(null);
  useFrame(({ clock }) => {
    ref.current?.children.forEach((p, i) => {
      p.position.x = ((((reduced ? 0 : clock.elapsedTime * 0.48) + i / 4) % 1) - 0.5) * span;
    });
  });
  return (
    <group ref={ref}>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} position={[0, 0.35, 0]}>
          <sphereGeometry args={[Math.max(0.1, Math.min(0.48, span * 0.025)), 10, 10]} />
          <meshBasicMaterial color="#fff3ac" />
        </mesh>
      ))}
    </group>
  );
}
/** Cotes des lames de contact.
 *
 * Pour un reed nu, les lames vivent DANS l'ampoule de verre : leur épaisseur et
 * leur écartement se déduisent du rayon intérieur de cette ampoule, jamais de la
 * largeur du boîtier — sur le schéma sur mesure, la carte fait 20 mm de large
 * alors que le verre ne fait que 4 mm de diamètre. Les capteurs encapsulés
 * gardent exactement leurs cotes d'origine. */
export function contactGeometry(model: SensorModel, closed: boolean) {
  const wide = Math.max(0.09, Math.min(0.55, model.body[1] * 0.1));
  const openGap = Math.max(0.17, model.body[2] * 0.1);
  if (!model.reed) return { thickness: wide, gap: closed ? 0 : openGap, inner: Infinity };
  // Rayon utile sous la paroi de verre.
  const inner = (model.reed[1] / 2) * 0.82;
  const thickness = Math.max(0.05, Math.min(wide, inner * 0.5));
  const maxGap = Math.max(0, inner * 0.92 - thickness / 2);
  return { thickness, gap: closed ? 0 : Math.min(openGap, maxGap), inner };
}

export function Contacts({
  model,
  contact,
  reduced,
}: {
  model: SensorModel;
  contact: Contact;
  reduced: boolean;
}) {
  const span = bladeLength(model);
  const closed = contact === "closed";
  const { thickness, gap } = contactGeometry(model, closed);
  return (
    <group position={[0, bladeOffsetY(model), bladeOffsetZ(model)]}>

      <mesh position={[-span * 0.23, 0, -gap]}>
        <boxGeometry args={[span * 0.56, thickness, thickness]} />
        <meshStandardMaterial
          color={STATUS[contact]}
          emissive={STATUS[contact]}
          emissiveIntensity={closed ? 0.75 : 0.15}
        />
      </mesh>
      <mesh position={[span * 0.23, 0, gap]}>
        <boxGeometry args={[span * 0.56, thickness, thickness]} />
        <meshStandardMaterial
          color={STATUS[contact]}
          emissive={STATUS[contact]}
          emissiveIntensity={closed ? 0.75 : 0.15}
        />
      </mesh>
      {closed && <ContactFlow span={span} reduced={reduced} />}
    </group>
  );
}
export function Magnet({ config, sample }: { config: WorkshopConfig; sample: CycleSample }) {
  const [l, h, w] = magnetSize(config),
    axial = config.magnetization === "axial",
    thick = config.magnetization === "thickness";
  return (
    <group
      position={sample.position}
      rotation={[0, (-sample.angle * Math.PI) / 180, (config.magnetTilt * Math.PI) / 180]}
    >
      {([-1, 1] as const).map((sign) => {
        const north = sign * config.polarity === 1;
        return (
          <group
            key={sign}
            position={
              axial
                ? [(sign * l) / 4, 0, 0]
                : thick
                  ? [0, (sign * h) / 4, 0]
                  : [0, 0, (sign * w) / 4]
            }
          >
            <mesh>
              <boxGeometry args={axial ? [l / 2, h, w] : thick ? [l, h / 2, w] : [l, h, w / 2]} />
              <meshStandardMaterial color={north ? "#e14242" : "#237dd0"} roughness={0.4} />
            </mesh>
            <Label
              position={thick ? [0, sign * (h / 4 + 0.8), 0] : [0, h / 2 + 0.8, 0]}
              className={north ? "mw-pole north" : "mw-pole south"}
            >
              {t(north ? "N" : "S")}
            </Label>
          </group>
        );
      })}
    </group>
  );
}
function FieldLines({ config, sample }: { config: WorkshopConfig; sample: CycleSample }) {
  const lines = useMemo(
    () =>
      Array.from({ length: 6 }, (_, j) => {
        const theta = (j / 6) * Math.PI * 2;
        let p: Vec3 = [6, 3 * Math.cos(theta), 3 * Math.sin(theta)];
        const points: Vec3[] = [p];
        for (let i = 0; i < 160; i++) {
          const b = fieldAt(p, [0, 0, 0], [1, 0, 0]);
          if (!b || length(p) > 65) break;
          const n = length(b);
          if (n < 1e-8) break;
          p = [p[0] + (b[0] / n) * 1.1, p[1] + (b[1] / n) * 1.1, p[2] + (b[2] / n) * 1.1];
          points.push(p);
        }
        return points;
      }),
    [],
  );
  const direction = momentFor(config, sample.angle);
  const q = new Quaternion().setFromUnitVectors(
    new Vector3(1, 0, 0),
    new Vector3(...direction).normalize(),
  );
  return (
    <group position={sample.position} quaternion={q}>
      {lines.map((p, i) => (
        <Line key={i} points={p} color="#8b9fae" transparent opacity={0.38} lineWidth={1} />
      ))}
    </group>
  );
}
function Trajectory({
  samples,
  returning,
  colored,
}: {
  samples: CycleSample[];
  returning: boolean;
  colored: boolean;
}) {
  const runs = useMemo(() => {
    const part = samples.filter((s) => (returning ? s.t >= 0.5 : s.t <= 0.5));
    const result: { contact: Contact; points: Vec3[] }[] = [];
    for (let i = 0; i < part.length; i++) {
      const s = part[i]!,
        last = result.at(-1),
        point: Vec3 = [s.position[0], -0.4, s.position[2]];
      if (!last || last.contact !== s.contact)
        result.push({ contact: s.contact, points: i ? [part[i - 1]!.position, point] : [point] });
      else last.points.push(point);
    }
    return result.filter((r) => r.points.length > 1);
  }, [samples, returning]);
  return (
    <group>
      {runs.map((r, i) => (
        <Line
          key={i}
          points={r.points}
          color={colored ? STATUS[r.contact] : "#90a3b1"}
          lineWidth={colored ? 4 : 1.5}
          transparent
          opacity={0.85}
          dashed={!colored || r.contact === "unknown"}
          dashSize={1}
          gapSize={0.6}
        />
      ))}
    </group>
  );
}
function Dimensions({ model }: { model: SensorModel }) {
  const [l, , w] = model.body,
    z = -w / 2 - 5;
  return (
    <group>
      <Line
        points={[
          [-l / 2, 0, z],
          [-l / 2, 0, z - 1],
          [l / 2, 0, z - 1],
          [l / 2, 0, z],
        ]}
        color="#577287"
        lineWidth={1}
      />
      <Label position={[0, 0, z - 4]} className="mw-dimension">
        {t(formatMm(l))}
        {t("mm · corps")}
      </Label>
      <Line
        points={[
          [-5, -4, 42],
          [5, -4, 42],
        ]}
        color="#577287"
        lineWidth={2}
      />
      {[-5, 0, 5].map((x) => (
        <Line
          key={x}
          points={[
            [x, -4, 41],
            [x, -4, 43],
          ]}
          color="#577287"
          lineWidth={1}
        />
      ))}
      <Label position={[0, -3, 46]} className="mw-dimension">
        {t("10 mm")}
      </Label>
    </group>
  );
}
function ReferenceMarkers({ config }: { config: WorkshopConfig }) {
  const [pull, drop] = MK03_DISTANCES[config.sensitivity][config.geometry],
    d1 = config.geometry === "D1";
  return (
    <group>
      {[pull, drop].map((d, i) => {
        const p = d + approachOffset(config);
        return (
          <group key={i}>
            <Line
              points={
                d1
                  ? [
                      [-19, -0.6, p],
                      [19, -0.6, p],
                    ]
                  : [
                      [p, -0.6, -12],
                      [p, -0.6, 12],
                    ]
              }
              color={i === 0 ? "#009d78" : "#c18b39"}
              lineWidth={1.5}
              dashed
              dashSize={1.1}
              gapSize={0.8}
            />
            <Label position={d1 ? [i === 0 ? -24 : 24, 1, p] : [p, 1, i === 0 ? -17 : 17]}>
              {t(i === 0 ? "Ferme" : "Ouvre")} · {t(d)} mm
            </Label>
          </group>
        );
      })}
    </group>
  );
}
export function ContextGuard({ onLost }: { onLost: () => void }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const canvas = gl.domElement;
    canvas.addEventListener("webglcontextlost", onLost);
    // R3F deliberately loses the old context on unmount. Do not flag the new scene.
    return () => canvas.removeEventListener("webglcontextlost", onLost);
  }, [gl, onLost]);
  return null;
}
export function CameraRig({
  target,
  distance,
  view = "3d",
  resetKey,
}: {
  target: Vec3;
  distance: number;
  view?: "3d" | "top";
  resetKey: string;
}) {
  const { camera, controls } = useThree();
  useEffect(() => {
    const c = controls as unknown as { target: Vector3; update: () => void } | undefined;
    camera.position.set(
      target[0] + (view === "top" ? 0 : distance * 0.7),
      target[1] + distance * 0.75,
      target[2] + (view === "top" ? 0.001 : distance),
    );
    if (view === "top") camera.position.y = target[1] + distance;
    camera.up.set(0, view === "top" ? 0 : 1, view === "top" ? -1 : 0);
    camera.lookAt(...target);
    camera.updateProjectionMatrix();
    c?.target.set(...target);
    c?.update();
    // Deliberately reset only on explicit view/setup changes, not every animation frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey, camera, controls]);
  return null;
}
export default function WorkshopScene({
  config,
  sample,
  samples,
  zones,
  field,
  xray = true,
  dimensions = true,
  focus = "assembly",
  reduced = false,
  resetEpoch = 0,
  onContextLost,
}: {
  config: WorkshopConfig;
  sample: CycleSample;
  samples: CycleSample[];
  view?: "3d" | "top";
  zones: boolean;
  field: boolean;
  xray?: boolean;
  dimensions?: boolean;
  focus?: "assembly" | "sensor";
  reduced?: boolean;
  resetEpoch?: number;
  onContextLost?: () => void;
}) {
  const model = sensorById(config.sensorId),
    reference = config.mode === "reference",
    available = !unavailableReason(config);
  const dist = Math.max(14, model.body[0] * 1.6),
    target: Vec3 = focus === "sensor" ? [config.mountX, 0, config.mountZ] : [6, 0, 18];
  return (
    <Canvas
      camera={{
        position:
          focus === "sensor"
            ? [target[0] + dist * 0.6, dist * 0.7, target[2] + dist]
            : [80, 70, 105],
        fov: 43,
        near: 0.1,
        far: 600,
      }}
      dpr={[1, 1.5]}
      gl={{ antialias: true, alpha: false }}
      onCreated={({ gl }) => {
        gl.setClearColor("#132439");
      }}
    >
      <ambientLight intensity={2} />
      <directionalLight position={[30, 60, 20]} intensity={2.2} />
      <Grid
        position={[0, -7, 0]}
        args={[220, 220]}
        cellSize={5}
        cellThickness={0.5}
        cellColor="#355069"
        sectionSize={25}
        sectionColor="#54728b"
        sectionThickness={0.8}
        fadeDistance={250}
      />
      <group
        position={[config.mountX, 0, config.mountZ]}
        rotation={[0, (-config.mountAngle * Math.PI) / 180, 0]}
      >
        <group rotation={[0, (-config.sensorAngle * Math.PI) / 180, 0]}>
          <Body model={model} xray={xray} />
          {xray && <Contacts model={model} contact={sample.contact} reduced={reduced} />}
          <Label position={[0, model.body[1] / 2 + 3, model.body[2] / 2 + 5]}>
            {t(model.name)}
          </Label>
          {dimensions && <Dimensions model={model} />}
        </group>
        <Magnet config={config} sample={sample} />
        <Trajectory samples={samples} returning={sample.t > 0.5} colored={zones} />
        {reference && available && zones && <ReferenceMarkers config={config} />}
        {!reference && available && field && <FieldLines config={config} sample={sample} />}
      </group>
      {onContextLost && <ContextGuard onLost={onContextLost} />}
      <OrbitControls makeDefault target={target} minDistance={5} maxDistance={400} />
      <CameraRig
        target={target}
        distance={focus === "sensor" ? dist : 110}
        resetKey={[config.sensorId, config.mode, config.geometry, focus, resetEpoch].join(":")}
      />
    </Canvas>
  );
}
