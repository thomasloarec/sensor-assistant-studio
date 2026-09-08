/** Vignette d'un candidat : rendu 3D réel, monté à la demande.
 *
 * Contraintes tenues ici :
 * - un contexte WebGL n'est créé QUE lorsque la vignette entre à l'écran ;
 * - le nombre de contextes simultanés est plafonné, les vignettes en attente
 *   affichent le repli 2D jusqu'à ce qu'une place se libère ;
 * - la 3D est démontée (et sa place rendue) dès que la vignette sort de vue ;
 * - aucune rotation automatique sous `prefers-reduced-motion: reduce` ;
 * - sans WebGL, le repli 2D dessine LA silhouette du capteur concerné : il ne
 *   substitue jamais une autre référence.
 */
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { sensorById, sizeLabel, customLayout } from "@/lib/standex/sensor-catalog";
import type { SensorModel } from "@/lib/standex/sensor-catalog";

const ThumbnailScene = lazy(() => import("./candidate-thumbnail-scene"));

/* ------------------------------------------------------------------ */
/* Plafond de contextes WebGL simultanés                               */
/* ------------------------------------------------------------------ */
const MAX_LIVE_CONTEXTS = 4;
let liveContexts = 0;
const waitingForSlot = new Set<() => void>();

export function acquireThumbnailSlot(notify: () => void): boolean {
  if (liveContexts < MAX_LIVE_CONTEXTS) {
    liveContexts += 1;
    return true;
  }
  waitingForSlot.add(notify);
  return false;
}
export function releaseThumbnailSlot(held: boolean, notify: () => void) {
  waitingForSlot.delete(notify);
  if (!held) return;
  liveContexts = Math.max(0, liveContexts - 1);
  const next = waitingForSlot.values().next();
  if (!next.done) {
    waitingForSlot.delete(next.value);
    next.value();
  }
}
/** Uniquement pour les tests : remet le compteur à zéro. */
export function resetThumbnailSlots() {
  liveContexts = 0;
  waitingForSlot.clear();
}

let webglSupport: boolean | null = null;
export function hasWebGL(): boolean {
  if (webglSupport !== null) return webglSupport;
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    webglSupport = Boolean(
      canvas.getContext("webgl2") ?? canvas.getContext("webgl") ?? null,
    );
  } catch {
    webglSupport = false;
  }
  return webglSupport;
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/* ------------------------------------------------------------------ */
/* Repli 2D : une silhouette PAR FORME, jamais un capteur par défaut   */
/* ------------------------------------------------------------------ */
export function thumbnailSilhouette(model: SensorModel): string {
  const [l, , w] = model.body;
  const scale = 92 / Math.max(l, w);
  const L = (l * scale) / 2,
    W = (w * scale) / 2;
  switch (model.shape) {
    case "custom_pcb": {
      const layout = customLayout(model)!;
      const nd = (layout.notchDepth * scale) / 1,
        nw = (layout.notchWidth * scale) / 2,
        c = (layout.pcbWidth * 0.25 * scale) / 1;
      return `M ${-L + c} ${-W} L ${L} ${-W} L ${L} ${-nw} L ${L - nd} ${-nw} L ${L - nd} ${nw} L ${L} ${nw} L ${L} ${W} L ${-L + c} ${W} L ${-L} ${W - c} L ${-L} ${-W + c} Z`;
    }
    case "flange":
    case "block":
      return `M ${-L} ${-W} H ${L} V ${W} H ${-L} Z`;
    case "smd":
      return `M ${-L} ${-W} H ${L} V ${W} H ${-L} Z M ${-L - 6} ${-W / 2} h 6 v ${W} h -6 Z`;
    case "threaded":
      return `M ${-L} ${-W} H ${L} V ${W} H ${-L} Z M ${-L * 0.5} ${-W * 1.6} h ${L * 0.3} v ${W * 3.2} h ${-L * 0.3} Z`;
    case "pressfit":
      return `M ${-L} ${-W} H ${L * 0.86} V ${W} H ${-L} Z M ${L * 0.86} ${-W * 1.5} h ${L * 0.14} v ${W * 3} h ${-L * 0.14} Z`;
    default:
      return `M ${-L + W} ${-W} H ${L - W} A ${W} ${W} 0 0 1 ${L - W} ${W} H ${-L + W} A ${W} ${W} 0 0 1 ${-L + W} ${-W} Z`;
  }
}

function Fallback({
  model,
  reason,
  cabled,
}: {
  model: SensorModel;
  reason: string;
  cabled: boolean;
}) {
  return (
    <div className="candidate-thumb-fallback" role="img" aria-label={`${model.name} — ${reason}`}>
      <svg viewBox="-64 -34 128 68" aria-hidden="true" focusable="false">
        {cabled ? (
          <path
            d={`M ${-56} 0 h 12`}
            fill="none"
            stroke="var(--muted-foreground)"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        ) : null}
        <path
          d={thumbnailSilhouette(model)}
          fill="var(--surface-tint)"
          stroke="var(--standex-blue-50)"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
      <span className="t-caption">{reason}</span>
    </div>
  );
}

export function CandidateThumbnail({
  sensorId,
  cabled = false,
}: {
  sensorId: string;
  cabled?: boolean;
}) {
  const model = sensorById(sensorId);
  const host = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  const [slot, setSlot] = useState(false);
  const [lost, setLost] = useState(false);
  const [reduced, setReduced] = useState(true);
  const supported = hasWebGL();

  useEffect(() => {
    setReduced(prefersReducedMotion());
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!media) return;
    const onChange = () => setReduced(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const node = host.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => setInView(entries.some((e) => e.isIntersecting)),
      { rootMargin: "120px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const claim = useCallback(() => setSlot(true), []);
  useEffect(() => {
    if (!inView || !supported || lost) return;
    const held = acquireThumbnailSlot(claim);
    if (held) setSlot(true);
    return () => {
      releaseThumbnailSlot(held, claim);
      setSlot(false);
    };
  }, [inView, supported, lost, claim]);

  const live = inView && slot && supported && !lost;
  return (
    <div
      ref={host}
      className="candidate-thumb"
      data-live={live ? "3d" : "2d"}
      data-sensor={model.id}
    >
      {live ? (
        <Suspense fallback={<Fallback model={model} reason="Aperçu 3D en cours" cabled={cabled} />}>
          <ThumbnailScene
            sensorId={model.id}
            cabled={cabled}
            reduced={reduced}
            onContextLost={() => setLost(true)}
          />
        </Suspense>
      ) : (
        <Fallback
          model={model}
          reason={
            supported
              ? lost
                ? "Aperçu 3D indisponible"
                : "Aperçu 3D à l'affichage"
              : "3D non disponible sur cet appareil"
          }
          cabled={cabled}
        />
      )}
      <span className="candidate-thumb-size t-metric">{sizeLabel(model)}</span>
    </div>
  );
}
