/** Reconstructed product envelopes for visual discussion, not manufacturing CAD. */
import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Line, OrbitControls } from "@react-three/drei";
import { Plus, Minus, Scan, Focus } from "lucide-react";
import { BoxGeometry, Float32BufferAttribute, CatmullRomCurve3, DoubleSide, FrontSide, MOUSE, PMREMGenerator, Shape, Vector2, Vector3 } from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { t } from "@/lib/i18n/core";
import { formatCm, formatPercent, formatLevel } from "@/lib/level/dimensions";
import { FLOAT_HEIGHT_MM, floatCentres, horizontalFloatPosition, horizontalMountHeight, verticalMechanics, type Family, type LevelConfiguration } from "@/lib/level/configuration";
import { SceneLoading, SceneUnavailable } from "./scene-loading";
import { SceneFrameReady } from "./scene-frame-ready";
import { LS05_ENVELOPE, markerLayout, sceneFrame, tankDimensions, verticalSensorX, type ProjectedMarker } from "@/lib/level/presentation";

// Physical material colours are confined to the reconstructed scene, as in the existing workshop.
const MAT = { pp: "#ebece3", pa: "#262b30", steel: "#adb6bd", tank: "#70838f", seal: "#22282c", water: "#75bdd8", oil: "#b7954a" };
function StudioLight() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const room = new RoomEnvironment();
    const pmrem = new PMREMGenerator(gl);
    const env = pmrem.fromScene(room, 0.04);
    const previous = scene.environment, previousIntensity = scene.environmentIntensity;
    scene.environment = env.texture;
    scene.environmentIntensity = .55;
    return () => { scene.environment = previous; scene.environmentIntensity = previousIntensity; env.dispose(); room.dispose(); pmrem.dispose(); };
  }, [gl, scene]);
  return <><ambientLight intensity={0.25} /><directionalLight position={[-100, 180, 140]} intensity={2.4} />
    <directionalLight position={[140, 80, -100]} intensity={0.8} /></>;
}
function Framing({ config, family, productOnly, focus, zoom, viewRevision, interactive }: {
  config: LevelConfiguration; family: Family; productOnly: boolean; focus: number | null; zoom: number; viewRevision: number; interactive: boolean;
}) {
  const { camera, size, invalidate } = useThree();
  const controls = useRef<OrbitControlsImpl>(null);
  const previousZoom = useRef(zoom);
  const zoomRef = useRef(zoom); zoomRef.current = zoom;
  const frame = sceneFrame(config, family, focus, productOnly);
  const fit = Math.min(size.height / (frame.height * 1.16), size.width / (frame.width * 1.18));
  const [x, y, z] = frame.target;
  useEffect(() => {
    if (!("isOrthographicCamera" in camera)) return;
    camera.position.set(x + frame.height * .9, y + frame.height * .35, z + frame.height * 2.4);
    camera.lookAt(x, y, z);
    controls.current?.target.set(x, y, z);
    controls.current?.update();
    camera.zoom = fit * zoomRef.current;
    previousZoom.current = zoomRef.current;
    camera.updateProjectionMatrix(); invalidate();
  }, [camera, x, y, z, frame.height, fit, viewRevision, invalidate]);
  useEffect(() => {
    if (!("isOrthographicCamera" in camera)) return;
    camera.zoom = Math.max(fit * .5, Math.min(fit * 40, camera.zoom * zoom / previousZoom.current));
    previousZoom.current = zoom;
    camera.updateProjectionMatrix(); invalidate();
  }, [camera, zoom, fit, invalidate]);
  return interactive ? <OrbitControls ref={controls} enableRotate={false} enablePan enableZoom enableDamping={false}
    mouseButtons={{LEFT:MOUSE.PAN, MIDDLE:MOUSE.DOLLY, RIGHT:MOUSE.PAN}} minZoom={fit * .5} maxZoom={fit * 40} /> : null;
}
function Cylinder({ radius, height, y = 0, color, metal = false, sides = 64 }: {
  radius: number; height: number; y?: number; color: string; metal?: boolean; sides?: number;
}) {
  return <mesh position={[0, y, 0]} castShadow receiveShadow>
    <cylinderGeometry args={[radius, radius, height, sides]} />
    <meshStandardMaterial color={color} roughness={metal ? 0.24 : 0.48} metalness={metal ? 0.88 : 0.02} />
  </mesh>;
}
function FloatBody({ steel, color, grooved = false }: { steel: boolean; color: string; grooved?: boolean }) {
  const half = grooved ? 18.5 / 2 : FLOAT_HEIGHT_MM / 2;
  const points = useMemo(() => steel ? [new Vector2(LS05_ENVELOPE.stemDiameterMm / 2 + .5, -half),
    new Vector2(LS05_ENVELOPE.floatDiameterMm / 2 - 1, -half), new Vector2(LS05_ENVELOPE.floatDiameterMm / 2, -half + 1),
    new Vector2(LS05_ENVELOPE.floatDiameterMm / 2, half - 1), new Vector2(LS05_ENVELOPE.floatDiameterMm / 2 - 1, half),
    new Vector2(LS05_ENVELOPE.stemDiameterMm / 2 + .5, half), new Vector2(LS05_ENVELOPE.stemDiameterMm / 2 + .5, -half)] : grooved ? [new Vector2(4.4, -half), new Vector2(12.6, -half),
    new Vector2(13.5, -half + .9), new Vector2(13.5, half - .9), new Vector2(12.6, half),
    new Vector2(4.4, half), new Vector2(4.4, -half)] : [new Vector2(3.6, -half), new Vector2(10.8, -half),
    new Vector2(11.75, -half + 1), new Vector2(11.75, 5), new Vector2(9, half),
    new Vector2(3.6, half), new Vector2(3.6, -half)], [half, grooved, steel]);
  return <group>
    <mesh castShadow><latheGeometry args={[points, 80]} />
      <meshStandardMaterial color={color} metalness={steel ? 0.92 : 0.02} roughness={steel ? 0.22 : 0.48} side={DoubleSide} />
    </mesh>
    {!grooved ? <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, steel ? 0 : -8.6, 0]}>
      <torusGeometry args={[steel ? LS05_ENVELOPE.floatDiameterMm / 2 : 11.7, steel ? 0.4 : 0.18, 8, 80]} />
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
  return <group name={`level-sensor-${family}`} position={[verticalSensorX(config),0,0]}>
    {config.mounting === "support" && datum < config.tankHeightMm - 1 ? <group name="adjustable-mount-support">
      <mesh position={[-13.5, datum - .5, 0]} receiveShadow><boxGeometry args={[43, 1.5, 16]} />
        <meshStandardMaterial color={MAT.steel} metalness={.7} roughness={.3} /></mesh>
      <mesh position={[-34, datum + 6, 0]}><boxGeometry args={[1.5, 14, 16]} />
        <meshStandardMaterial color={MAT.steel} metalness={.7} roughness={.3} /></mesh>
    </group> : null}
    {family === "LS04" ? <group position={[0, centre + (top ? 4 : -4), 0]}><GroovedStem reach={reach - 8} color={color} /></group> :
      <Cylinder radius={steel ? LS05_ENVELOPE.stemDiameterMm / 2 : 3.25} height={reach} y={centre} color={color} metal={steel} />}
    <Cylinder radius={steel ? 13 : 8.5} height={6} y={datum + (top ? 5 : -5)} color={color} metal={steel} sides={6} />
    <Cylinder radius={steel ? 10.5 : 5} height={13} y={datum + (top ? 10 : -10)} color={color} metal={steel} />
    <Cylinder radius={steel ? 13 : 9} height={1.7} y={datum + (top ? 1 : -1)} color={MAT.seal} />
    {Array.from({ length: 9 }, (_, i) => <mesh key={i} position={[0, datum + (top ? 7 + i : -7 - i), 0]} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[steel ? 10.5 : 5, 0.3, 6, 48]} />
      <meshStandardMaterial color={color} metalness={steel ? 0.9 : 0} roughness={0.3} />
    </mesh>)}
    {family === "LS04" ? <group position={[0, end, 0]} rotation={[0, 0, top ? 0 : Math.PI]}><PlasticEndCap color={color} /></group> :
      <Cylinder radius={steel ? 7.5 : 5.8} height={1.2} y={end} color={steel ? MAT.steel : MAT.pa} metal={steel} />}
    {floats.map((y, i) => <group name={`level-float-${i + 1}`} position={[0, y, 0]} key={i}><FloatBody steel={steel} color={color} grooved={family === "LS04"} /></group>)}
    {mechanics.valid && (family === "LS04" || family === "LS05") ? stops.map((y, i) => family === "LS04"
      ? <ClipCollar key={i} y={y} color={color} /> : <Cylinder key={i} radius={8} height={1.5} y={y} color={MAT.steel} metal />) : null}
    {top ? <Cable origin={[0, datum + 17, 0]} length={38} /> :
      <group rotation={[Math.PI, 0, 0]}><Cable origin={[0, 17, 0]} /></group>}
  </group>;
}
/** LS03 standard plan: total 83, wet side 55.8, float Ø16.5, collar Ø21, M16×2, SW24. */
function HorizontalSensor({ config, level, material, index = 0 }: { config: LevelConfiguration; level: number; material: string; index?: number }) {
  const color = material === "PA" ? MAT.pa : MAT.pp;
  const pivotHeight = horizontalMountHeight(config, index);
  const angle = Math.asin(-.8 * (1 - horizontalFloatPosition(config, level, index)));
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
const tankWidth = (height: number) => tankDimensions(height).width;
/** Faded cut edge indicates continuation, not a closed right-hand tank wall. */
function FadingTankPanel({ width, height, depth, y, z = 0, water = false, oil = false }: { width: number; height: number; depth: number; y: number; z?: number; water?: boolean; oil?: boolean }) {
  const geometry = useMemo(() => {
    const g = new BoxGeometry(width,height,depth,12,1,1), p=g.getAttribute("position"), colors=[];
    for(let i=0;i<p.count;i++) { const u=p.getX(i)/width+.5; colors.push(1,1,1,Math.max(0,Math.min(1,(1-u)/.3))); }
    g.setAttribute("color",new Float32BufferAttribute(colors,4)); return g;
  },[width,height,depth]);
  useEffect(()=>()=>geometry.dispose(),[geometry]);
  return <mesh geometry={geometry} position={[0,y,z]} renderOrder={water?3:0}>
    <meshStandardMaterial color={water ? oil ? MAT.oil : MAT.water : MAT.tank} vertexColors transparent opacity={water ? .20 : 1} metalness={water?0:.15} roughness={water ? .2 : .75} depthWrite={false} side={water ? FrontSide : DoubleSide} />
  </mesh>;
}
function Tank({ height, level, oil }: { height: number; level: number; oil: boolean }) {
  const { width, depth } = tankDimensions(height);
  return <group>
    <FadingTankPanel width={width} height={4} depth={depth} y={-2} />
    <FadingTankPanel width={width} height={height} depth={2} y={height/2} z={-depth/2} />
    <mesh position={[-width/2,height/2,0]}><boxGeometry args={[2,height,depth]} /><meshStandardMaterial color={MAT.tank} metalness={.15} roughness={.75} transparent opacity={.85} depthWrite={false} /></mesh>
    <FadingTankPanel width={width-2} height={Math.max(.1,level)} depth={depth-2} y={Math.max(.1,level)/2} water oil={oil} />
    {Array.from({ length: 11 }, (_, i) => <Line key={i} points={[[-width/2+5,i*height/10,-depth/2+2],[-width/2+(i%5===0?12:8),i*height/10,-depth/2+2]]} color="#4a5861" lineWidth={1} />)}
  </group>;
}
interface Projection { width: number; height: number; markers: ProjectedMarker[] }
function ProjectMarkers({ config, onChange }: { config: LevelConfiguration; onChange: (value: Projection) => void }) {
  const { camera, size } = useThree();
  const last = useRef("");
  useFrame(() => {
    const { width } = tankDimensions(config.tankHeightMm);
    const markers = config.pointsMm.map((point, index) => {
      // Anchor to the sensor's plane, not the front tank wall: a deep tank must
      // not push a label to the bottom when the camera inspects a small sensor.
      const v = new Vector3(config.orientation === "horizontal" ? -width / 2 + 35 : verticalSensorX(config), point, 0).project(camera);
      const sensorX = (v.x + 1) * size.width / 2;
      return { index, x: Math.round(Math.max(sensorX + 24, size.width * .78)), y: Math.round((1 - v.y) * size.height / 2),
        visible: sensorX >= 0 && sensorX <= size.width && v.z >= -1 && v.z <= 1 };
    });
    const next = { width: size.width, height: size.height, markers }, key = JSON.stringify(next);
    if (key !== last.current) { last.current = key; onChange(next); }
  });
  return null;
}
class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  override render() { return this.state.failed ? <p className="notice-info m-6">{t("L’aperçu du produit est indisponible. Les réglages et le récapitulatif restent accessibles.")}</p> : this.props.children; }
}
export default function LevelScene({ configuration, family, levelMm, material, oil = false, productOnly = false, showMarkers = true, interactive = false }: {
  configuration: LevelConfiguration; family: Family; levelMm: number; material: string; oil?: boolean; productOnly?: boolean; showMarkers?: boolean; interactive?: boolean;
}) {
  const [ready, setReady] = useState(false);
  const [viewRevision, setViewRevision] = useState(0);
  const [focus, setFocus] = useState<number | null>(null), [zoom, setZoom] = useState(1);
  const [projection, setProjection] = useState<Projection>({width:0,height:0,markers:[]});
  const [railScroll, setRailScroll] = useState(0);
  // A product portrait is dry: gravity rests every float on its own lower stop.
  // Keep the live liquid level untouched for the configurator when returning.
  const sensorLevel = productOnly ? 0 : levelMm;
  const markers = !productOnly && showMarkers && configuration.mode === "points";
  const layout = markerLayout(projection.markers.filter(m => m.index < configuration.pointsMm.length), projection.height);
  useEffect(() => {
    setFocus(interactive && configuration.tankHeightMm > 400 && (family === "LS01" || family === "LS02" || family === "LS03") ? configuration.pointsMm[0]! : null);
    setZoom(1);
  }, [family, configuration.tankHeightMm, configuration.orientation, interactive]);
  useEffect(() => {
    setFocus(current => current === null ? null : configuration.pointsMm[0] ?? null);
  }, [configuration.pointsMm[0]]);
  const inspect = (height = configuration.pointsMm[0] ?? levelMm) => { setFocus(height); setZoom(1); setViewRevision(v => v + 1); };
  return <SceneBoundary><div className="lv-scene-stage" data-ready={ready} data-family={family}>
    {interactive ? <div className="lv-scene-toolbar" aria-label={t("Commandes de la vue")}>
      <button type="button" aria-pressed={focus === null} onClick={() => { setFocus(null); setZoom(1); setViewRevision(v => v + 1); }} title={t("Vue d’ensemble")}><Scan size={18} /><span>{t("Vue d’ensemble")}</span></button>
      <button type="button" onClick={() => inspect(configuration.mode === "continuous" ? floatCentres(configuration, levelMm, family)[0] ?? levelMm : undefined)}><Focus size={18} /><span>{t("Voir le capteur")}</span></button>
      <button type="button" aria-label={t("Agrandir la vue")} onClick={() => setZoom(z => Math.min(40, z * 1.5))}><Plus size={18} /></button>
      <button type="button" aria-label={t("Réduire la vue")} onClick={() => setZoom(z => Math.max(.5, z / 1.5))}><Minus size={18} /></button>
    </div> : null}
    <div className={`lv-scene-viewport${markers ? " lv-scene-with-rail" : ""}`}>
    <div className="lv-scene-canvas"><Canvas orthographic dpr={[1, 2]} frameloop="demand" gl={{ antialias: true, alpha: true }}
    camera={{ near: 0.1, far: 100000, zoom: 4 }} fallback={<SceneUnavailable />}>
    <StudioLight /><Framing config={configuration} family={family} productOnly={productOnly} focus={focus} zoom={zoom} viewRevision={viewRevision} interactive={interactive} />
    {!productOnly ? <Tank height={configuration.tankHeightMm} level={levelMm} oil={oil} /> : null}
    {markers ? <ProjectMarkers config={configuration} onChange={setProjection} /> : null}
    {family === "LS03" ? configuration.pointsMm.map((_, i) => <HorizontalSensor key={i} index={i} config={configuration} level={sensorLevel} material={material} />) :
      <VerticalSensor config={configuration} family={family} level={sensorLevel} material={material} />}
    <ContactShadows position={[0, -5, 0]} scale={configuration.tankHeightMm * 3} opacity={0.3} blur={2.5} far={configuration.tankHeightMm * 1.4} resolution={256} color="#203343" />
    <SceneFrameReady onReady={() => setReady(true)} />
  </Canvas></div>
  {markers ? <>
    <svg className="lv-marker-leaders" width="100%" height="100%" aria-hidden="true">{layout.markers.filter(m => m.visible && m.y >= 0 && m.y <= projection.height && m.x >= 0 && m.x <= projection.width).map(m =>
      <path key={m.index} d={`M ${m.x} ${m.y} H ${projection.width - 4} L ${projection.width + 7} ${m.labelY - railScroll}`} />)}</svg>
    <div className="lv-marker-rail" aria-label={t("Position des points")} onScroll={e => setRailScroll(e.currentTarget.scrollTop)}>
      <div className="lv-marker-track" style={{height:layout.contentHeight}}>{layout.markers.map(m => <button type="button" key={m.index}
        className="lv-point-marker t-caption t-metric" style={{top:m.labelY-40}} onClick={() => inspect(configuration.pointsMm[m.index])}
        aria-label={`${t("Voir le point")} ${m.index+1} · ${formatLevel(configuration.pointsMm[m.index]!,configuration.tankHeightMm)}`}>
        <span>P{m.index+1} · {formatCm(configuration.pointsMm[m.index]!)} cm</span><span>{formatPercent(configuration.pointsMm[m.index]!,configuration.tankHeightMm)} %</span></button>)}</div>
    </div>
  </> : null}</div>{!ready ? <SceneLoading /> : null}</div></SceneBoundary>;
}
