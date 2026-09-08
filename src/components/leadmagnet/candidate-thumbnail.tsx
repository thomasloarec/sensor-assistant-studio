import { t } from "@/lib/i18n/core";
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
import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { sensorById, customLayout } from "@/lib/standex/sensor-catalog";
import type { SensorModel } from "@/lib/standex/sensor-catalog";

const ThumbnailScene = lazy(() => import("@/components/standex/workshop/candidate-thumbnail-scene"));

/* ------------------------------------------------------------------ */
/* Plafond de contextes WebGL simultanés                               */
/* ------------------------------------------------------------------ */
/** Jeton d'appartenance : c'est LUI qui dit si une vignette détient une place,
 * jamais un booléen figé au moment de la demande. Une place transmise à une
 * vignette en attente reste comptée, et la vignette servie la rend vraiment. */
export type ThumbnailSlot = { held: boolean; waiting: boolean };

const MAX_LIVE_CONTEXTS = 4;
let liveContexts = 0;
const queue: { token: ThumbnailSlot; notify: () => void }[] = [];

/** Demande une place. Le jeton renvoyé est mis à jour lors d'un passage de
 * relais : il ne faut donc jamais recopier `held` dans une variable locale. */
export function acquireThumbnailSlot(notify: () => void): ThumbnailSlot {
  const token: ThumbnailSlot = { held: false, waiting: false };
  if (liveContexts < MAX_LIVE_CONTEXTS) {
    liveContexts += 1;
    token.held = true;
    return token;
  }
  token.waiting = true;
  queue.push({ token, notify });
  return token;
}

/** Rendu idempotent : une attente annulée sort de la file, une place détenue
 * est transmise atomiquement à la vignette suivante (le compteur ne redescend
 * pas), et un second appel ne libère rien de plus. */
export function releaseThumbnailSlot(token: ThumbnailSlot) {
  if (token.waiting) {
    token.waiting = false;
    const index = queue.findIndex((entry) => entry.token === token);
    if (index >= 0) queue.splice(index, 1);
    return;
  }
  if (!token.held) return;
  token.held = false;
  const next = queue.shift();
  if (next) {
    next.token.waiting = false;
    next.token.held = true; // la place change de mains, elle n'est pas rendue
    next.notify();
    return;
  }
  liveContexts = Math.max(0, liveContexts - 1);
}

/** Uniquement pour les tests : remet le compteur à zéro. */
export function resetThumbnailSlots() {
  liveContexts = 0;
  queue.length = 0;
}
/** Uniquement pour les tests : nombre de contextes réellement comptés. */
export function liveThumbnailContexts() {
  return liveContexts;
}


/** Three 0.185 rend EXCLUSIVEMENT en WebGL2 : sonder « webgl » ferait croire à
 * un rendu possible sur un appareil qui n'a que WebGL1. La sonde libère son
 * propre contexte, sinon elle occuperait une place au détriment des vignettes. */
let webglSupport: boolean | null = null;
export function hasWebGL(): boolean {
  if (webglSupport !== null) return webglSupport;
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2");
    webglSupport = Boolean(gl);
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    webglSupport = false;
  }
  return webglSupport;
}


function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(t("(prefers-reduced-motion: reduce)")).matches;
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

/** Barrière d'erreur : une création de renderer refusée (WebGL2 absent du
 * pilote, mémoire graphique saturée) lève au rendu et doit donner le repli 2D
 * au lieu d'un trou dans la liste des candidats. */
class ThumbnailBoundary extends Component<
  { onFailed: () => void; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch() {
    this.props.onFailed();
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
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
    const media = window.matchMedia?.(t("(prefers-reduced-motion: reduce)"));
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
    const token = acquireThumbnailSlot(claim);
    if (token.held) setSlot(true);
    return () => {
      // On rend le JETON, pas une valeur figée : si une place nous a été
      // transmise entre-temps, elle est bien restituée.
      releaseThumbnailSlot(token);
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
        // Un renderer qui refuse de se créer doit retomber sur le dessin 2D,
        // au même titre qu'un contexte perdu en cours de route.
        <ThumbnailBoundary onFailed={() => setLost(true)}>
          <Suspense fallback={<Fallback model={model} reason={t("Aperçu 3D en cours")} cabled={cabled} />}>
            <ThumbnailScene
              sensorId={model.id}
              cabled={cabled}
              reduced={reduced}
              onContextLost={() => setLost(true)}
            />
          </Suspense>
        </ThumbnailBoundary>
      ) : (

        <Fallback
          model={model}
          reason={
            supported
              ? lost
                ? t("Aperçu 3D indisponible")
                : t("Aperçu 3D à l'affichage")
              : t("3D non disponible sur cet appareil")
          }
          cabled={cabled}
        />
      )}
    </div>
  );
}
