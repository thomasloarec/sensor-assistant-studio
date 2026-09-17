import { cableConstruction } from "@/lib/leadmagnet/product-presentation";
import { housingYawDeg, transverseApproach } from "@/lib/standex/housing-pose";
import { pairedMagnetModel } from "@/lib/standex/paired-magnets";
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
  unavailableReason,
  momentFor,
  workshopPair,
  simulatedContactForm,
} from "@/lib/standex/magnetic-workshop";
import type { WorkshopConfig, CycleSample, Vec3, Contact } from "@/lib/standex/magnetic-workshop";
import {
  sensorById,
  bladeLength,
  bladeOffsetZ,
  bladeOffsetY,
  customLayout,
  electricalDetailsAllowed,
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
        <mesh key={`trace${sign}`} position={[(-L + padX * sign) / 2, boardTop + 0.06, sign * 2.2]}>
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
    </group>
  );
}
export function Body({
  model,
  xray,
  showCable = true,
  poleColors = false,
}: {
  model: SensorModel;
  xray: boolean;
  showCable?: boolean;
  poleColors?: boolean;
}) {
  const electrical = electricalDetailsAllowed(model);
  if (electrical && model.shape === "custom_pcb" && customLayout(model))
    return <CustomBoard model={model} xray={xray} />;
  if (electrical && model.shape === "glass") return <BareReedBody model={model} />;
  return <StandardBody model={model} xray={electrical && xray} showCable={showCable} poleColors={poleColors} />;
}
function BareReedBody({ model }: { model: SensorModel }) {
  const [l, d] = model.body;
  return (
    <group>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <capsuleGeometry args={[d / 2, l - d, 8, 32]} />
        <meshPhysicalMaterial
          color="#c5e0d8"
          transparent
          opacity={0.3}
          roughness={0.12}
          metalness={0}
          depthWrite={false}
        />
      </mesh>
      {[-1, 1].map((sign) => (
        <group key={sign}>
          <mesh position={[(sign * l) / 2, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[d * 0.28, d * 0.4, d * 0.6, 20]} />
            <meshStandardMaterial color="#749c91" transparent opacity={0.55} />
          </mesh>
          <mesh position={[sign * (l / 2 + 4), 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.18, 0.18, 8, 12]} />
            <meshStandardMaterial color="#9ca7a9" metalness={0.8} roughness={0.3} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
function mk18Profile() {
  const s = new Shape(), r = 2.5, flat = 2.3, a = Math.acos(flat / r);
  s.absarc(0, 0, r, a, Math.PI - a, false);
  s.lineTo(-flat, -Math.sqrt(r * r - flat * flat));
  s.absarc(0, 0, r, Math.PI + a, 2 * Math.PI - a, false);
  s.closePath(); return s;
}
function StandardBody({
  model,
  xray,
  showCable,
  poleColors,
}: {
  model: SensorModel;
  xray: boolean;
  showCable: boolean;
  poleColors: boolean;
}) {
  const [l, h, w] = model.body,
    opacity = xray ? 0.25 : 1;
  const electrical = electricalDetailsAllowed(model);
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
  // i18n-canonical: GLSL shader source below is code, never user-facing prose.
  const material = (
    <meshStandardMaterial
      color={poleColors ? "#ffffff" : model.color}
      onBeforeCompile={(shader) => {
        if (!poleColors) return;
        const axis = ["cylinder", "threaded", "pressfit", "glass"].includes(model.shape) ? "y" : "x";
        shader.vertexShader = "varying float polePosition;\n" + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>\npolePosition = position.${axis};`);
        shader.fragmentShader = "varying float polePosition;\n" + shader.fragmentShader;
        shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb = polePosition < 0.0 ? vec3(0.035, 0.205, 0.63) : vec3(0.67, 0.065, 0.055);");
      }}
      customProgramCacheKey={() => poleColors ? `poles-${model.shape}` : "body"}
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
      {model.id === "MK18" ? <mesh position={[-l / 2, 0, 0]} rotation={[0, Math.PI / 2, 0]}><extrudeGeometry args={[mk18Profile(), { depth: l, bevelEnabled: false, curveSegments: 24 }]} />{material}</mesh> : cylindrical ? (
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
      {electrical && model.id === "MK06-4"
        ? [-1, 1].map((sign) => (
            <mesh key={sign} position={[sign * 5.08, -h / 2 - 1.65, 0]}>
              <boxGeometry args={[0.5, 3.3, 0.5]} />
              <meshStandardMaterial color="#a7b5bd" metalness={0.8} roughness={0.25} />
            </mesh>
          ))
        : electrical && model.shape === "smd"
          ? [-1, 1].map((sign) => (
              <mesh
                key={sign}
                position={[
                  sign * (l / 2 + ((model.terminalSpan ?? l) - l) / 4 - 0.2),
                  -h / 2 + 0.18,
                  0,
                ]}
              >
                <boxGeometry args={[((model.terminalSpan ?? l) - l) / 2 + 0.4, 0.28, w * 0.65]} />
                <meshStandardMaterial color="#a7b5bd" metalness={0.8} roughness={0.25} />
              </mesh>
            ))
          : electrical && showCable ? <SensorCable model={model} /> : null}

    </group>
  );
}
function SensorCable({ model }: { model: SensorModel }) {
  const kind = cableConstruction(model);
  if (kind === "none") return null;
  const side = model.cableSide ?? -1;
  const start = side * model.body[0] / 2;
  const z = bladeOffsetZ(model), y = bladeOffsetY(model);
  const jacket = kind !== "wires";
  const split = jacket ? 7 : 0;
  return <group>
    {jacket ? <mesh position={[start + side * 3.5, y, z]} rotation={[0, 0, Math.PI / 2]}>
      <cylinderGeometry args={[0.9, 0.9, 7, 16]} />
      <meshStandardMaterial color={kind === "metal" ? "#a7b5bd" : "#60727d"} metalness={kind === "metal" ? 0.8 : 0.1} roughness={0.5} />
    </mesh> : null}
    {[-1, 1].map(sign => <group key={sign}>
      <Line points={[[start + side * split, y, z + sign * 0.4], [start + side * 10, y, z + sign * 0.65]]} color="#60727d" lineWidth={2} />
      <Line points={[[start + side * 10, y, z + sign * 0.65], [start + side * 12, y, z + sign * 0.65]]} color="#b4bcc4" lineWidth={1.5} />
    </group>)}
  </group>;
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
  if (!electricalDetailsAllowed(model)) return null;
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
  const actualModel = pairedMagnetModel(config.magnetModel, config.sensorId);
  const [l, h, w] = magnetSize(config),
    axial = config.magnetization === "axial",
    thick = config.magnetization === "thickness";
  return (
    <group
      position={sample.position}
      rotation={[0, (-sample.angle * Math.PI) / 180, (config.magnetTilt * Math.PI) / 180]}
    >
      {actualModel ? (
        /* Le boîtier de l'aimant reprend la géométrie du capteur, sans câble ni
           contacts. Un repère propre (bande + étiquette « Aimant ») le distingue
           du capteur même lorsque les noms sont masqués. */
        <>
          <Body model={actualModel} xray={false} showCable={false} poleColors />
          {/* Le nom du modèle rend l'aimant identifiable sans lire la colonne
              de gauche. L'étiquette reste AU-DESSUS du boîtier. */}
          <Label position={[0, h / 2 + 3.2, 0]} className="mw-magnet-tag">
            {`${t("Aimant")} ${config.magnetModel}`}
          </Label>
        </>
      ) : (
        ([-1, 1] as const).map((sign) => {
          const north = sign === 1;
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
        })
      )}
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
/** Cote d'entrefer : EXACTEMENT la grandeur lue par le moteur et affichée par
 *  les curseurs (`CycleSample.distance`, entrefer de surfaces). La scène ne
 *  mesure plus une distance entre centres : les deux nombres seraient différents
 *  au même instant. Aucun seuil, aucune conversion inventée ici. */
function GapDimension({ sample }: { sample: CycleSample }) {
  const gap = sample.distance;
  const mid: Vec3 = [sample.position[0] / 2, 2.4, sample.position[2] / 2];
  return (
    <group>
      <Line
        points={[
          [0, 0, 0],
          sample.position,
        ]}
        color="#577287"
        lineWidth={1.2}
        dashed
        dashSize={1.1}
        gapSize={0.8}
      />
      <Label position={mid} className="mw-dimension">
        {`${Math.round(gap * 10) / 10} mm`}
      </Label>
    </group>
  );
}
function ReferenceMarkers({ config }: { config: WorkshopConfig }) {
  // Distances du couple RÉELLEMENT sélectionné (capteur, aimant, approche,
  // classe), jamais celles d'un couple de référence : la ligne publiée est lue
  // par `workshopPair`, qui normalise seulement l'identité de famille d'aimant.
  const pair = simulatedContactForm(config) ? workshopPair(config) : null;
  if (!pair) return null;
  const [pull, drop] = pair,
    d1 = transverseApproach(config.geometry, config.sensorId);
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
            {/* Les valeurs « ferme / ouvre » sont portées par le bandeau de
                verdict, au-dessus de la scène : les répéter ici superposait
                deux étiquettes 3D sur le même millimètre. */}
          </group>
        );
      })}
    </group>
  );
}
/** Pose fantôme proposée : jamais la pose réelle, uniquement une prévisualisation. */
export interface GhostPose {
  /** Position dans le repère de la scène affichée, en millimètres. */
  positionMm: Vec3;
  rotationDeg: Vec3;
  /** Axe de référence du gabarit, unitaire, dans le même repère. */
  axis: Vec3;
  sizeMm: Vec3;
  /** Cote lisible affichée à côté du fantôme. */
  gapMm: number;
  /** Origine de l'axe de référence : le capteur. */
  originMm: Vec3;
}
/** Aimant fantôme, axe de référence et cote. Aucun effet sur la configuration. */
export function GhostMagnet({ ghost }: { ghost: GhostPose }) {
  // Les deux points sont déjà exprimés dans le repère monde : on relie
  // directement l'origine à la pose fantôme, sans reconstruire un axe qui
  // n'est pas tourné par l'ancrage en mode importé.
  return (
    <group>
      <Line
        points={[ghost.originMm, ghost.positionMm]}
        color="#7a5cc4"
        lineWidth={2}
        dashed
        dashSize={1.2}
        gapSize={0.9}
      />
      <group
        position={ghost.positionMm}
        rotation={[
          (ghost.rotationDeg[0] * Math.PI) / 180,
          (ghost.rotationDeg[1] * Math.PI) / 180,
          (ghost.rotationDeg[2] * Math.PI) / 180,
        ]}
      >
        <mesh>
          <boxGeometry args={ghost.sizeMm} />
          <meshStandardMaterial color="#7a5cc4" transparent opacity={0.35} depthWrite={false} />
        </mesh>
        <Label position={[0, ghost.sizeMm[1] / 2 + 3, 0]} className="mw-ghost-label">
          {t("Distance entre centres")} · {t(String(Math.round(ghost.gapMm * 10) / 10))} mm
        </Label>
      </group>
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
/** Recul nécessaire pour qu'une sphère de rayon `radius` tienne ENTIÈREMENT dans
 *  le cadre, avec `margin` de marge de chaque côté, en prenant le maximum des
 *  deux contraintes (verticale par le fov réel, horizontale par le fov dérivé du
 *  rapport largeur/hauteur). Fonction géométrique pure : elle ne touche ni les
 *  cotes, ni les seuils, ni la simulation. */
export function fitDistance(
  radius: number,
  fovDeg: number,
  aspect: number,
  margin = 0.12,
): number {
  const vFov = (fovDeg * Math.PI) / 180;
  const a = aspect > 0 && Number.isFinite(aspect) ? aspect : 1;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * a);
  const need = Math.max(radius / Math.sin(vFov / 2), radius / Math.sin(hFov / 2));
  return need / (1 - margin);
}
export function CameraRig({
  target,
  distance,
  fitRadius,
  view = "3d",
  resetKey,
}: {
  target: Vec3;
  distance: number;
  /** Rayon de la boîte englobante à cadrer (couple + course). Prioritaire. */
  fitRadius?: number | undefined;
  view?: "3d" | "top";
  resetKey: string;
}) {
  const { camera, controls, size } = useThree();
  const aspect = size.height > 0 ? size.width / size.height : 1;
  useEffect(() => {
    // Pendant une transition de mise en page, la hauteur passe par zéro : ne pas
    // recadrer sur un cadre dégénéré, la caméra partirait à l'infini.
    if (size.height < 80 || size.width < 80) return;
    const c = controls as unknown as { target: Vector3; update: () => void } | undefined;
    const perspective = camera as unknown as { fov?: number };
    const d =
      fitRadius && fitRadius > 0
        ? fitDistance(fitRadius, perspective.fov ?? 43, aspect)
        : aspect < 1
          ? distance / 0.7
          : distance;
    /* Direction de vue normalisée : le recul calculé est donc la vraie distance
       caméra-cible, pas la somme de trois composantes arbitraires. */
    const dir =
      view === "top" ? [0, 1, 0.001] : [0.62, 0.55, 0.82].map((n) => n / 1.166);
    camera.position.set(
      target[0] + dir[0]! * d,
      target[1] + dir[1]! * d,
      target[2] + dir[2]! * d,
    );
    camera.up.set(0, view === "top" ? 0 : 1, view === "top" ? -1 : 0);
    camera.lookAt(...target);
    camera.updateProjectionMatrix();
    c?.target.set(...target);
    c?.update();
    // Deliberately reset only on explicit view/setup changes, not every animation frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey, camera, controls, aspect, fitRadius, view]);
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
  showNames = true,
  focus = "assembly",
  reduced = false,
  resetEpoch = 0,
  onContextLost,
  ghost,
}: {
  config: WorkshopConfig;
  sample: CycleSample;
  samples: CycleSample[];
  view?: "3d" | "top";
  zones: boolean;
  field: boolean;
  xray?: boolean;
  dimensions?: boolean;
  /** Affichage du nom du capteur : option d'affichage seule, jamais la géométrie. */
  showNames?: boolean;
  focus?: "assembly" | "sensor";
  reduced?: boolean;
  resetEpoch?: number;
  onContextLost?: () => void;
  /** Prévisualisation seule : le fantôme n'écrit rien dans la configuration. */
  ghost?: GhostPose | null | undefined;
}) {
  const model = sensorById(config.sensorId),
    reference = config.mode === "reference",
    available = !unavailableReason(config);
  /* Cadrage du couple : il est MESURÉ sur les corps réellement dessinés et sur
     les positions que le moteur produit (`samples`), jamais posé à une distance
     fixe. Ce calcul ne touche ni les cotes, ni les seuils, ni la simulation.

     Boîte englobante = capteur + aimant à la position OUVERTE + aimant à la
     position FERMÉE. La caméra vise le milieu du segment capteur–aimant en
     position ouverte, et `CameraRig` calcule le recul qui fait tenir cette boîte
     entièrement dans le cadre avec 12 % de marge, quel que soit le rapport
     largeur/hauteur. « Recadrer » rejoue exactement le même calcul. */
  const cycle = samples.length > 0 ? samples : [sample];
  const openPose = cycle[0]!;
  const closedPose = cycle.reduce((a, b) => (b.distance < a.distance ? b : a), openPose);
  const magnetHalf = magnetSize(config).map((v) => v / 2) as Vec3;
  const sensorHalf = model.body.map((v) => v / 2) as Vec3;
  const boxMin: Vec3 = [0, 0, 0];
  const boxMax: Vec3 = [0, 0, 0];
  for (let axis = 0; axis < 3; axis += 1) {
    const lows = [-sensorHalf[axis]!];
    const highs = [sensorHalf[axis]!];
    for (const pose of [openPose, closedPose]) {
      lows.push(pose.position[axis]! - magnetHalf[axis]!);
      highs.push(pose.position[axis]! + magnetHalf[axis]!);
    }
    boxMin[axis] = Math.min(...lows);
    boxMax[axis] = Math.max(...highs);
  }
  const boxSize = boxMax.map((v, i) => v - boxMin[i]!) as Vec3;
  /* Rayon de la sphère englobante : le cadrage tient donc quel que soit l'angle
     de vue, sans dépendre de l'orientation courante de la caméra. */
  const fitRadius = Math.max(
    6,
    0.5 * Math.hypot(boxSize[0]!, boxSize[1]!, boxSize[2]!),
  );
  /* Milieu du segment capteur (origine locale) – aimant en position ouverte. */
  const mid: Vec3 = [
    openPose.position[0]! / 2,
    openPose.position[1]! / 2,
    openPose.position[2]! / 2,
  ];
  const dist = Math.max(14, model.body[0] * 1.6),
    coupleDist = fitRadius * 2.2,
    target: Vec3 =
      focus === "sensor"
        ? [config.mountX, 0, config.mountZ]
        : [config.mountX + mid[0], mid[1], config.mountZ + mid[2]];

  return (
    <Canvas
      camera={{
        position:
          focus === "sensor"
            ? [target[0] + dist * 0.6, dist * 0.7, target[2] + dist]
            : [
                target[0] + coupleDist * 0.62,
                coupleDist * 0.55,
                target[2] + coupleDist * 0.82,
              ],
        fov: 43,
        near: 0.1,
        far: 600,
      }}
      dpr={[1, 1.5]}
      gl={{ antialias: true, alpha: false }}
      onCreated={({ gl }) => {
        gl.setClearColor("#e2edf8");
      }}
    >
      <ambientLight intensity={2} />
      <directionalLight position={[30, 60, 20]} intensity={2.2} />
      <Grid
        position={[0, -7, 0]}
        args={[220, 220]}
        cellSize={5}
        cellThickness={0.5}
        cellColor="#9db6cc"
        sectionSize={25}
        sectionColor="#6d90ad"
        sectionThickness={0.8}
        fadeDistance={250}
      />
      <group
        position={[config.mountX, 0, config.mountZ]}
        rotation={[0, (-config.mountAngle * Math.PI) / 180, 0]}
      >
        <group rotation={[0, ((housingYawDeg(config.sensorId) - config.sensorAngle) * Math.PI) / 180, 0]}>
          <Body model={model} xray={xray} />
          {/* Le reed nu est déjà transparent : ses lames restent visibles sans
              passer l'atelier en radiographie, la carte imprimée reste opaque. */}
          {(xray || model.shape === "custom_pcb") && (
            <Contacts model={model} contact={sample.contact} reduced={reduced} />
          )}

          {showNames && (
            <Label position={[0, model.body[1] / 2 + 3, model.body[2] / 2 + 5]}>
              {t(model.name)}
            </Label>
          )}
          {dimensions && <Dimensions model={model} />}
        </group>
        <Magnet config={config} sample={sample} />
        <GapDimension sample={sample} />
        {ghost && <GhostMagnet ghost={ghost} />}
        <Trajectory samples={samples} returning={sample.t > 0.5} colored={zones} />
        {reference && available && zones && <ReferenceMarkers config={config} />}
        {!reference && available && field && <FieldLines config={config} sample={sample} />}
      </group>
      {onContextLost && <ContextGuard onLost={onContextLost} />}
      <OrbitControls makeDefault target={target} minDistance={5} maxDistance={400} />
      <CameraRig
        target={target}
        distance={focus === "sensor" ? dist : coupleDist}
        fitRadius={focus === "sensor" ? undefined : fitRadius}
        resetKey={[
          config.sensorId,
          config.magnetModel,
          config.mode,
          config.geometry,
          focus,
          resetEpoch,
          target.map((n) => Math.round(n * 10)).join(","),
        ].join(":")}
      />
    </Canvas>
  );
}
