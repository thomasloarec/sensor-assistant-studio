import { Component, Fragment, useEffect, useMemo, useRef, type ReactNode } from "react";
import { createPortal, createRoot, extend, useFrame, type Catalogue, type RootStore } from "@react-three/fiber";
import { OrthographicCamera, Scene } from "three";
import * as THREE from "three";

type View = {
  id: number;
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  camera: OrthographicCamera;
  scene: Scene;
  width: number;
  height: number;
  reduced: boolean;
  children: ReactNode;
  onLost: () => void;
};

/** One WebGL context renders all visible products. Each canvas receives a fresh
 * frame of its own scene, so clipping/scrolling remain ordinary DOM behaviour. */
function RenderView({ view }: { view: View }) {
  useFrame(({ gl }) => {
    const { canvas, context, width, height, scene, camera } = view;
    gl.setSize(width, height, false);
    gl.setViewport(0, 0, width, height);
    gl.setScissorTest(false);
    gl.setRenderTarget(null);
    gl.render(scene, camera);
    const source = gl.domElement;
    if (canvas.width !== source.width || canvas.height !== source.height) {
      canvas.width = source.width;
      canvas.height = source.height;
    }
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(source, 0, 0);
  }, 1);
  return null;
}

class ViewBoundary extends Component<
  { children: ReactNode; onLost: () => void },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch() {
    this.props.onLost();
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

function createPool() {
  // createRoot does not register the Three catalogue like <Canvas> does.
  extend(THREE as unknown as Catalogue);
  const canvas = document.createElement("canvas");
  const root = createRoot(canvas);
  const views = new Map<number, View>();
  let store: RootStore | null = null;
  let disposed = false;
  let failed = false;
  const fail = () => {
    failed = true;
    for (const view of [...views.values()]) view.onLost();
  };
  const refresh = () => {
    if (!store || disposed || failed) return;
    const animate = !document.hidden && [...views.values()].some((view) => !view.reduced);
    store.getState().setFrameloop(document.hidden ? "never" : animate ? "always" : "demand");
    root.render(
      <>
        {[...views.values()].map((view) => (
          <Fragment key={view.id}>
            {createPortal(
              <ViewBoundary onLost={view.onLost}>
                {view.children}
                <RenderView view={view} />
              </ViewBoundary>,
              view.scene,
              {
                camera: view.camera,
                size: { width: view.width, height: view.height, top: 0, left: 0 },
                events: { connected: view.canvas },
              },
            )}
          </Fragment>
        ))}
      </>,
    );
    store.getState().invalidate();
  };
  document.addEventListener("visibilitychange", refresh);
  canvas.addEventListener("webglcontextlost", fail);
  void root
    .configure({
      size: { width: 1, height: 1, top: 0, left: 0 },
      dpr: Math.min(window.devicePixelRatio || 1, 1.5),
      frameloop: "demand",
      gl: { antialias: true, alpha: true, powerPreference: "low-power" },
      onCreated: (state) => state.gl.setClearColor("#000000", 0),
    })
    .then(() => {
      if (disposed) {
        root.unmount();
        return;
      }
      store = root.render(null);
      refresh();
    })
    .catch(fail);
  return {
    update(view: View) {
      views.set(view.id, view);
      if (failed) queueMicrotask(view.onLost);
      else refresh();
    },
    remove(id: number) {
      views.delete(id);
      if (views.size) {
        refresh();
        return;
      }
      disposed = true;
      document.removeEventListener("visibilitychange", refresh);
      canvas.removeEventListener("webglcontextlost", fail);
      if (store) root.unmount();
      if (pool === this) pool = null;
    },
  };
}

let pool: ReturnType<typeof createPool> | null = null;
let nextId = 0;

export function SharedThumbnailCanvas({
  children,
  zoom,
  position,
  far,
  reduced,
  onLost,
}: {
  children: ReactNode;
  zoom: number;
  position: [number, number, number];
  far: number;
  reduced: boolean;
  onLost: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const view = useMemo(
    () => ({
      id: ++nextId,
      scene: new Scene(),
      camera: Object.assign(new OrthographicCamera(-1, 1, 1, -1, 0.1, far), { manual: true }),
    }),
    [],
  );
  const latest = useRef({ children, reduced, onLost, zoom, position, far });
  latest.current = { children, reduced, onLost, zoom, position, far };
  const refresh = useRef<() => void>(() => {});
  useEffect(() => {
    const node = canvas.current!;
    const context = node.getContext("2d");
    if (!context) {
      latest.current.onLost();
      return;
    }
    const owner = pool ?? (pool = createPool());
    view.camera.position.set(...latest.current.position);
    view.camera.lookAt(0, 0, 0);
    refresh.current = () => {
      const width = Math.max(1, node.clientWidth);
      const height = Math.max(1, node.clientHeight);
      Object.assign(view.camera, {
        left: -width / 2,
        right: width / 2,
        top: height / 2,
        bottom: -height / 2,
        zoom: latest.current.zoom,
        far: latest.current.far,
      });
      view.camera.updateProjectionMatrix();
      owner.update({ ...view, canvas: node, context, width, height, ...latest.current });
    };
    refresh.current();
    const observer = new ResizeObserver(() => refresh.current());
    observer.observe(node);
    return () => {
      observer.disconnect();
      refresh.current = () => {};
      owner.remove(view.id);
    };
  }, [view]);
  useEffect(() => refresh.current(), [children, reduced, zoom, far]);
  return (
    <canvas ref={canvas} className="candidate-thumb-shared-canvas" data-shared-thumbnail="true" />
  );
}
