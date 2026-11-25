/** Reconstructed product envelopes for visual discussion, not manufacturing CAD. */
import { Component, useEffect, useMemo, useState, type ReactNode } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { ContactShadows, Html, Line } from "@react-three/drei";
import { CatmullRomCurve3, DoubleSide, PMREMGenerator, Shape, Vector2, Vector3 } from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { t } from "@/lib/i18n/core";
import { FLOAT_HEIGHT_MM, floatCentres, horizontalFloatPosition, horizontalMountHeight, verticalMechanics, type Family, type LevelConfiguration } from "@/lib/level/configuration";
import { SceneLoading, SceneUnavailable } from "./scene-loading";
import { SceneFrameReady } from "./scene-frame-ready";

// Physical material colours are confined to the reconstructed scene, as in the existing workshop.
const MAT = { pp: "#ebece3", pa: "#262b30", steel: "#adb6bd", seal: "#22282c", water: "#75bdd8", oil: "#b7954a" };
function StudioLight() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const room = new RoomEnvironment();
    const pmrem = new PMREMGenerator(gl);
    const env = pmrem.fromScene(room, 0.04);
    const previous = scene.environment;
    scene.environment = env.texture;
    return () => { scene.environment = previous; env.dispose(); room.dispose(); pmrem.dispose(); };
  }, [gl, scene]);
  return <><ambientLight intensity={0.65} /><directionalLight position={[100, 240, 160]} intensity={3.2} />
    <directionalLight position={[-160, 140, -80]} intensity={1.8} /></>;
}
function Framing({ height, portrait }: { height: number; portrait: boolean }) {
  const { camera, size, invalidate } = useThree();
  useEffect(() => {
    if (!("isOrthographicCamera" in camera)) return;
    camera.position.set(height * 0.9, height * 0.85 + 20, height * 2.4);
    camera.lookAt(0, height * 0.5 + 20, 0);
    camera.zoom = Math.min(size.height / (height * (portrait ? 1.35 : 1.2) + 65), size.width / ((tankWidth(height) + 110) * 1.18));
    camera.updateProjectionMatrix(); invalidate();
  }, [camera, height, size.width, size.height, portrait, invalidate]);
  return null;
}
function Cylinder({ radius, height, y = 0, color, metal = false, sides = 64 }: {
  radius: number; height: number; y?: number; color: string; metal?: boolean; sides?: number;
}) {
  return <mesh position={[0, y, 0]} castShadow receiveShadow>
    <cylinderGeometry args={[radius, radius, height, sides]} />
    <meshStandardMaterial color={color} roughness={metal ? 0.24 : 0.32} metalness={metal ? 0.88 : 0.02} />
  </mesh>;
}
function FloatBody({ steel, color, grooved = false }: { steel: boolean; color: string; grooved?: boolean }) {
  const half = grooved ? 18.5 / 2 : FLOAT_HEIGHT_MM / 2;
  const points = useMemo(() => grooved ? [new Vector2(4.4, -half), new Vector2(12.6, -half),
    new Vector2(13.5, -half + .9), new Vector2(13.5, half - .9), new Vector2(12.6, half),
    new Vector2(4.4, half), new Vector2(4.4, -half)] : [new Vector2(3.6, -half), new Vector2(10.8, -half),
    new Vector2(11.75, -half + 1), new Vector2(11.75, 5), new Vector2(9, half),
    new Vector2(3.6, half), new Vector2(3.6, -half)], [half, grooved]);
  return <group>
    <mesh castShadow><latheGeometry args={[points, 80]} />
      <meshStandardMaterial color={color} metalness={steel ? 0.92 : 0.02} roughness={steel ? 0.22 : 0.3} side={DoubleSide} />
    </mesh>
    {!grooved ? <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, steel ? 0 : -8.6, 0]}>
      <torusGeometry args={[11.7, steel ? 0.5 : 0.18, 8, 80]} />
      <meshStandardMaterial color={color} metalness={steel ? 0.95 : 0.02} roughness={0.4} />
    </mesh> : null}
  </group>;
}
function GroovedStem({ reach, color }: { reach: number; color: string }) {
  // Ø8.5 from LS04 p1. Groove pitch/depth are visual estimates from the drawing.
  const profile = useMemo(() => {
    const points = [new Vector2(0, -reach / 2), new Vector2(4.25, -reach / 2)];
    for (let y = -reach / 2 + 10; y < reach / 2 - 2; y += 10)
      points.push(new Vector2(4.25, y - .55), new Vector2(3.95, y - .3), new Vector2(3.95, y + .3), new Vector2(4.25, y + .55));
    points.push(new Vector2(4.25, reach / 2), new Vector2(0, reach / 2));
    return points;
  }, [reach]);
  return <mesh castShadow><latheGeometry args={[profile, 64]} /><meshStandardMaterial color={color} roughness={.38} /></mesh>;
}
function PlasticEndCap({ color }: { color: string }) {
  // Curved, split retaining cap visible on LS04 p1; uncoted details remain illustrative.
  const profile = useMemo(() => [[0, 0], [1.7, 0], [3.4, 1.5], [5.1, 5.5], [5.1, 8],
    [3.5, 8], [2.7, 2], [0, 1]].map(([r, y]) => new Vector2(r!, y!)), []);
  return <group><Cylinder radius={2.8} height={6} y={3} color={color} />
    {[0,1,2,3].map(i => <mesh key={i} castShadow><latheGeometry args={[profile, 24, i * Math.PI / 2 + .07, Math.PI / 2 - .14]} />
      <meshStandardMaterial color={color} roughness={.38} side={DoubleSide} /></mesh>)}</group>;
}
function ClipCollar({ y, color }: { y: number; color: string }) {
  // Open C-ring clipped into a stem groove; proportions estimated from the supplied photos.
  const ring = useMemo(() => {
    const shape = new Shape(), gap = .32, outer = 9.5, inner = 4.05;
    shape.moveTo(outer * Math.cos(gap), outer * Math.sin(gap));
    shape.absarc(0, 0, outer, gap, Math.PI * 2 - gap, false);
    shape.lineTo(inner * Math.cos(gap), -inner * Math.sin(gap));
    shape.absarc(0, 0, inner, Math.PI * 2 - gap, gap, true); shape.closePath();
    return shape;
  }, []);
  return <mesh name="clipped-float-stop" position={[0, y + .65, 0]} rotation={[Math.PI / 2, 0, .35]} castShadow>
    <extrudeGeometry args={[ring, { depth: 1.3, bevelEnabled: true, bevelSegments: 2, bevelSize: .15, bevelThickness: .1, steps: 1 }]} />
    <meshStandardMaterial color={color} roughness={.4} />
  </mesh>;
}
function Cable({ origin, length = 38 }: { origin: [number, number, number]; length?: number }) {
  const path = useMemo(() => new CatmullRomCurve3([new Vector3(...origin),
    new Vector3(origin[0], origin[1] + 12, origin[2]),
    new Vector3(origin[0] + length * 0.45, origin[1] + 22, origin[2] - 5),
    new Vector3(origin[0] + length, origin[1] + 18, origin[2] - 9)]), [origin[0], origin[1], origin[2], length]);
  return <mesh castShadow><tubeGeometry args={[path, 32, 1.6, 12, false]} />
    <meshStandardMaterial color={MAT.seal} roughness={0.6} /></mesh>;
}
function VerticalSensor({ config, family, level, material }: {
  config: LevelConfiguration; family: Family; level: number; material: string;
}) {
  const steel = family === "LS05";
  const color = steel ? MAT.steel : material === "PA" ? MAT.pa : MAT.pp;
  const mechanics = verticalMechanics(config, family);
  const reach = mechanics.reachMm;
  const top = config.mounting !== "bottom";
  const datum = mechanics.datumMm;
  const end = mechanics.endMm;
  const centre = (datum + end) / 2;
  const floats = floatCentres(config, level, family);
  const stops = mechanics.floats.flatMap(range => [range.lowerMm - FLOAT_HEIGHT_MM / 2 - .75, range.upperMm + FLOAT_HEIGHT_MM / 2 + .75])
    .sort((a, b) => a - b).filter((y, i, all) => i === 0 || y - all[i - 1]! > 2);
  return <group name={`level-sensor-${family}`}>
    {config.mounting === "support" && datum < config.tankHeightMm - 1 ? <group name="adjustable-mount-support">
      <mesh position={[-tankWidth(config.tankHeightMm) / 4 + 4, datum - .5, 0]} receiveShadow><boxGeometry args={[tankWidth(config.tankHeightMm) / 2 + 8, 1.5, 16]} />
        <meshStandardMaterial color={MAT.steel} metalness={.7} roughness={.3} /></mesh>
      <mesh position={[-tankWidth(config.tankHeightMm) / 2 + 1, datum + 6, 0]}><boxGeometry args={[1.5, 14, 16]} />
        <meshStandardMaterial color={MAT.steel} metalness={.7} roughness={.3} /></mesh>
    </group> : null}
    {family === "LS04" ? <group position={[0, centre + (top ? 4 : -4), 0]}><GroovedStem reach={reach - 8} color={color} /></group> :
      <Cylinder radius={steel ? 4 : 3.25} height={reach} y={centre} color={color} metal={steel} />}
    <Cylinder radius={steel ? 13 : 8.5} height={6} y={datum + (top ? 5 : -5)} color={color} metal={steel} sides={6} />
    <Cylinder radius={steel ? 10.5 : 5} height={13} y={datum + (top ? 10 : -10)} color={color} metal={steel} />
    <Cylinder radius={steel ? 13 : 9} height={1.7} y={datum + (top ? 1 : -1)} color={MAT.seal} />
    {Array.from({ length: 9 }, (_, i) => <mesh key={i} position={[0, datum + (top ? 7 + i : -7 - i), 0]} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[steel ? 10.5 : 5, 0.3, 6, 48]} />
      <meshStandardMaterial color={color} metalness={steel ? 0.9 : 0} roughness={0.3} />
    </mesh>)}
    {family === "LS04" ? <group position={[0, end, 0]} rotation={[0, 0, top ? 0 : Math.PI]}><PlasticEndCap color={color} /></group> :
      <Cylinder radius={5.8} height={1.2} y={end} color={steel ? MAT.steel : MAT.pa} metal={steel} />}
    {floats.map((y, i) => <group name={`level-float-${i + 1}`} position={[0, y, 0]} key={i}><FloatBody steel={steel} color={color} grooved={family === "LS04"} /></group>)}
    {mechanics.valid && (family === "LS04" || family === "LS05") ? stops.map((y, i) => family === "LS04"
      ? <ClipCollar key={i} y={y} color={color} /> : <Cylinder key={i} radius={6} height={1.5} y={y} color={MAT.steel} metal />) : null}
    {top ? <Cable origin={[0, datum + 17, 0]} length={config.tankHeightMm * 0.3} /> :
      <group rotation={[Math.PI, 0, 0]}><Cable origin={[0, 17, 0]} /></group>}
  </group>;
}
/** LS03 standard plan: total 83, wet side 55.8, float Ø16.5, collar Ø21, M16×2, SW24. */
function HorizontalSensor({ config, level, material }: { config: LevelConfiguration; level: number; material: string }) {
  const color = material === "PA" ? MAT.pa : MAT.pp;
  const pivotHeight = horizontalMountHeight(config);
  const angle = Math.asin(-.8 * (1 - horizontalFloatPosition(config, level)));
  const fork = useMemo(() => {
    const shape = new Shape();
    shape.moveTo(-2.7, 2.7); shape.quadraticCurveTo(0, 4, 3, 2.7);
    shape.lineTo(13, -3.3); shape.lineTo(25, -3.3); shape.lineTo(25, -8);
    shape.lineTo(6, -8); shape.quadraticCurveTo(1, -6, -2.7, -2); shape.closePath();
    return shape;
  }, []);
  const cable = useMemo(() => new CatmullRomCurve3([new Vector3(-27.2,0,0),new Vector3(-39,0,0),
    new Vector3(-50,-10,0),new Vector3(-51,-30,6),new Vector3(-42,-42,12)]), []);
  const axial = (radius: number, length: number, x: number, sides = 64) => <group position={[x,0,0]} rotation={[0,0,-Math.PI/2]}>
    <Cylinder radius={radius} height={length} color={color} sides={sides} /></group>;
  return <group position={[-tankWidth(config.tankHeightMm) / 2, pivotHeight, 0]} name="level-sensor-LS03">
    <group name="horizontal-fixed-body">
      {axial(5.77,8,-23.2,6)}
      {axial(7.1,16,-11.2)}
      {axial(24/Math.sqrt(3),8,-9.2,6)}
      {axial(10.5,3,1.5)}
      {axial(4.4,27,16.5)}
      {Array.from({length:8},(_,i)=><mesh key={i} position={[-18.2+i*2,0,0]} rotation={[0,Math.PI/2,0]}>
        <torusGeometry args={[7.5,.5,8,48]} /><meshStandardMaterial color={color} roughness={.4} /></mesh>)}
      <mesh position={[-1.4,0,0]} rotation={[0,Math.PI/2,0]}><torusGeometry args={[8.8,1.3,16,64]} />
        <meshStandardMaterial color={MAT.seal} roughness={.6} /></mesh>
      <mesh><tubeGeometry args={[cable,32,1.8,12,false]} /><meshStandardMaterial color="#7d8588" roughness={.6} /></mesh>
    </group>
    <group name="horizontal-pivoting-float" position={[7,0,0]} rotation={[0,0,angle]}>
      {[-1,1].map(side=><mesh key={side} position={[0,0,side>0?4.7:-6.5]} castShadow>
        <extrudeGeometry args={[fork,{depth:1.8,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.3,bevelThickness:.3}]} />
        <meshStandardMaterial color={color} roughness={.45} /></mesh>)}
      <mesh position={[35.8,0,0]} rotation={[0,0,Math.PI/2]} castShadow>
        <cylinderGeometry args={[8.25,8.25,26,64]} /><meshStandardMaterial color={color} roughness={.4} /></mesh>
      <mesh position={[16,-6.6,0]}><boxGeometry args={[20,2.5,11.2]} /><meshStandardMaterial color={color} roughness={.45} /></mesh>
      <mesh rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[2.5,2.5,14,32]} />
        <meshStandardMaterial color={MAT.seal} roughness={.35} /></mesh>
    </group>
  </group>;
}
const tankWidth = (height: number) => Math.max(90, Math.min(240, height * .8));
function Tank({ height, level, oil }: { height: number; level: number; oil: boolean }) {
  const width = tankWidth(height), depth = Math.max(42, Math.min(120, height * .42));
  return <group>
    <mesh position={[0, -2, 0]} receiveShadow><boxGeometry args={[width + 6, 4, depth]} /><meshStandardMaterial color={MAT.steel} metalness={0.7} roughness={0.36} /></mesh>
    <mesh position={[0, height / 2, -depth / 2]} receiveShadow><boxGeometry args={[width, height, 2]} /><meshStandardMaterial color={MAT.steel} metalness={0.62} roughness={0.35} /></mesh>
    {[-1, 1].map(side => <mesh key={side} position={[side * width / 2, height / 2, 0]}>
      <boxGeometry args={[2, height, depth]} /><meshStandardMaterial color={MAT.steel} metalness={0.7} roughness={0.28} transparent opacity={side > 0 ? 0.28 : 0.8} depthWrite={false} /></mesh>)}
    <mesh position={[0, Math.max(0.1, level) / 2, 0]} renderOrder={3}>
      <boxGeometry args={[width - 2, Math.max(0.1, level), depth - 2]} />
      <meshPhysicalMaterial color={oil ? MAT.oil : MAT.water} transparent opacity={0.26} roughness={0.1} metalness={0} depthWrite={false} side={DoubleSide} />
    </mesh>
    <mesh position={[0, level + 0.2, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={4}>
      <planeGeometry args={[width - 2, depth - 2]} /><meshPhysicalMaterial color={oil ? MAT.oil : MAT.water} transparent opacity={0.5} roughness={0.18} metalness={0.15} depthWrite={false} side={DoubleSide} />
    </mesh>
    {Array.from({ length: 11 }, (_, i) => <Line key={i} points={[[width / 2 + 5, i * height / 10, depth / 2], [width / 2 + (i % 5 === 0 ? 12 : 8), i * height / 10, depth / 2]]} color="#4a5861" lineWidth={1} />)}
  </group>;
}
class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  override render() { return this.state.failed ? <p className="notice-info m-6">{t("L’aperçu du produit est indisponible. Les réglages et le récapitulatif restent accessibles.")}</p> : this.props.children; }
}
export default function LevelScene({ configuration, family, levelMm, material, oil = false, productOnly = false, showMarkers = true }: {
  configuration: LevelConfiguration; family: Family; levelMm: number; material: string; oil?: boolean; productOnly?: boolean; showMarkers?: boolean;
}) {
  const [ready, setReady] = useState(false);
  return <SceneBoundary><div className="lv-scene-stage" data-ready={ready} data-family={family}>
    <div className="lv-scene-canvas"><Canvas orthographic dpr={[1, 2]} frameloop="demand" gl={{ antialias: true, alpha: true }}
    camera={{ near: 0.1, far: 10000, zoom: 4 }} fallback={<SceneUnavailable />}>
    <StudioLight /><Framing height={configuration.tankHeightMm} portrait={productOnly} />
    {!productOnly ? <Tank height={configuration.tankHeightMm} level={levelMm} oil={oil} /> : null}
    {!productOnly && showMarkers && configuration.mode === "points" ? configuration.pointsMm.map((point, index) =>
      <Html key={index} position={[tankWidth(configuration.tankHeightMm) / 2 + 8, point, Math.max(42, Math.min(120, configuration.tankHeightMm * .42)) / 2]} center style={{ pointerEvents: "none" }}>
        <span className="lv-point-marker t-caption t-metric">P{index + 1} · {point} mm</span>
      </Html>) : null}
    {family === "LS03" ? <HorizontalSensor config={configuration} level={levelMm} material={material} /> :
      <VerticalSensor config={configuration} family={family} level={levelMm} material={material} />}
    <ContactShadows position={[0, -5, 0]} scale={configuration.tankHeightMm * 3} opacity={0.3} blur={2.5} far={configuration.tankHeightMm * 1.4} resolution={256} color="#203343" />
    <SceneFrameReady onReady={() => setReady(true)} />
  </Canvas></div>{!ready ? <SceneLoading /> : null}</div></SceneBoundary>;
}
