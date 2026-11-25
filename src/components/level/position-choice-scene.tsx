import { Component, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Box3, Vector3, type Group } from "three";
import { Body } from "@/components/standex/workshop/scene";
import { sensorById } from "@/lib/standex/sensor-catalog";
import { pairedMagnetModel } from "@/lib/standex/paired-magnets";
import { pairLayout } from "@/lib/standex/pair-layout";
import { t } from "@/lib/i18n/core";
import { SceneLoading, SceneUnavailable } from "./scene-loading";
import { SceneFrameReady } from "./scene-frame-ready";

function PositionPair() {
  const group = useRef<Group>(null);
  const { camera, size, invalidate } = useThree();
  const sensor = sensorById("MK04"), magnet = pairedMagnetModel("M04", sensor.id)!;
  const layout = pairLayout(sensor, magnet, "D1");
  useLayoutEffect(() => {
    if (!group.current || !("isOrthographicCamera" in camera)) return;
    group.current.updateWorldMatrix(true, true);
    const bounds = new Box3().setFromObject(group.current);
    const center = bounds.getCenter(new Vector3());
    camera.position.copy(center).add(new Vector3(85, 100, 140));
    camera.lookAt(center); camera.updateMatrixWorld();
    const corners = [0, 1].flatMap(x => [0, 1].flatMap(y => [0, 1].map(z => new Vector3(
      x ? bounds.max.x : bounds.min.x, y ? bounds.max.y : bounds.min.y, z ? bounds.max.z : bounds.min.z,
    ).applyMatrix4(camera.matrixWorldInverse))));
    const projected = new Box3().setFromPoints(corners).getSize(new Vector3());
    camera.zoom = Math.min(size.width / (projected.x * 1.22), size.height / (projected.y * 1.3));
    camera.updateProjectionMatrix(); invalidate();
  }, [camera, size.width, size.height, invalidate]);
  return <group ref={group}>
    <group rotation={[0, layout.sensorYaw, 0]}><Body model={sensor} xray={false} showCable /></group>
    <group position={layout.offset} rotation={[0, layout.magnetYaw, 0]}><Body model={magnet} xray={false} showCable={false} poleColors /></group>
  </group>;
}
class PreviewBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  override render() { return this.state.failed ? <p className="lv-scene-loading t-body">{t("L’aperçu du produit est indisponible. Les réglages et le récapitulatif restent accessibles.")}</p> : this.props.children; }
}
export default function PositionChoiceScene() {
  const [ready, setReady] = useState(false);
  return <PreviewBoundary><div className="lv-scene-stage" data-ready={ready}>
    <div className="lv-scene-canvas"><Canvas orthographic frameloop="demand" dpr={[1, 2]} camera={{ near: 0.1, far: 2000 }}
      gl={{ antialias: true, alpha: true }} fallback={<SceneUnavailable />}>
      <ambientLight intensity={1.7} /><directionalLight position={[80, 150, 100]} intensity={2.4} />
      <directionalLight position={[-80, 70, -60]} intensity={0.7} />
      <PositionPair /><SceneFrameReady onReady={() => setReady(true)} />
    </Canvas></div>
    {!ready ? <SceneLoading /> : null}
  </div></PreviewBoundary>;
}
