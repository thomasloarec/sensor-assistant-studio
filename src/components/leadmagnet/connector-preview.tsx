/** Aperçu d'un boîtier connecteur : rendu 3D à la demande, repli 2D sinon.
 *
 * Reprend le motif de `candidate-thumbnail.tsx` : un contexte WebGL n'est créé
 * que pour un aperçu visible et dans la limite du même plafond de contextes
 * simultanés ; la rotation automatique est coupée sous
 * `prefers-reduced-motion: reduce` ; un contexte perdu ou un renderer refusé
 * retombe sur un dessin SVG. Ce composant ne montre AUCUN brochage : seules la
 * forme du boîtier et ses alvéoles (une par voie documentée) sont illustrées.
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
import { t } from "@/lib/i18n/core";
import type { DocumentedHousing } from "@/lib/leadmagnet/connector-library";
import { housingLabel } from "@/lib/leadmagnet/connector-library";
import {
  envelopeHeightMm,
  geometryByHousingId,
  type HousingGeometry,
} from "@/lib/leadmagnet/connector-geometry";
import {
  acquireThumbnailSlot,
  releaseThumbnailSlot,
  hasWebGL,
} from "@/components/leadmagnet/candidate-thumbnail";

const PreviewScene = lazy(() => import("./connector-preview-scene"));

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Silhouette 2D du boîtier, vue de face, avec ses alvéoles. */
function HousingSilhouette({
  housing,
  geometry,
}: {
  housing: DocumentedHousing;
  geometry: HousingGeometry;
}) {
  const width = geometry.width.valueMm;
  const height = geometry.height.valueMm;
  const scale = 92 / Math.max(width, height);
  const w = (width * scale) / 2;
  const h = (height * scale) / 2;
  const chamfer = Math.min(width, height) * scale * 0.18;
  const cavityWidth = Math.min(1.4, housing.pitchMm * 0.5) * scale;
  const cavityHeight = height * scale * 0.45;
  const startX = (-((housing.positions - 1) * housing.pitchMm) * scale) / 2;
  return (
    <svg viewBox="-64 -40 128 80" role="img" aria-label={housingLabel(housing)} focusable="false">
      <path
        d={`M ${-w + chamfer} ${-h} H ${w} V ${h} H ${-w} V ${-h + chamfer} Z`}
        fill="#3c4853"
        stroke="#22282e"
        strokeWidth="0.6"
      />
      {Array.from({ length: housing.positions }, (_, i) => (
        <rect
          key={i}
          x={startX + i * housing.pitchMm * scale - cavityWidth / 2}
          y={-cavityHeight / 2}
          width={cavityWidth}
          height={cavityHeight}
          fill="#0f1317"
        />
      ))}
    </svg>
  );
}

class PreviewBoundary extends Component<
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

/** Bandeau de cotes + source, toujours visible quel que soit le mode de rendu. */
function PreviewCaption({
  housing,
  geometry,
}: {
  housing: DocumentedHousing;
  geometry: HousingGeometry;
}) {
  return (
    <div className="connector-preview-caption">
      <p className="t-label">{housingLabel(housing)}</p>
      <p className="t-caption">
        {t("Encombrement (mm) — largeur")} {geometry.width.valueMm} × {t("hauteur")}{" "}
        {geometry.height.valueMm} × {t("profondeur")} {geometry.depth.valueMm}
        {geometry.lowerProtrusion && (
          <>
            {" — "}
            {t("saillie inférieure")} {geometry.lowerProtrusion.valueMm} {t("mm, soit une hauteur d'enveloppe de")}{" "}
            {envelopeHeightMm(geometry)} {t("mm")}
          </>
        )}
        {geometry.dimensionsToVerify && (
          <>
            {" — "}
            <strong>{t("cotes non vérifiées, à confirmer par la R&D")}</strong>
          </>
        )}
      </p>
      <p className="t-caption">
        <a
          href={`${geometry.width.sourceUrl}#page=${geometry.width.sourcePage}`}
          target="_blank"
          rel="noreferrer"
        >
          {t("Source fabricant")}
        </a>
      </p>
      <p className="t-caption">
        {t("Illustration d'encombrement — ni modèle CAO qualifié ni brochage.")}
      </p>
    </div>
  );
}

export function ConnectorPreview({
  housing,
  livePreview = true,
}: {
  housing: DocumentedHousing;
  livePreview?: boolean;
}) {
  const geometry = geometryByHousingId(housing.housingMpn);
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
    if (!inView || !supported || lost || !livePreview || !geometry) return;
    const token = acquireThumbnailSlot(claim);
    if (token.held) setSlot(true);
    return () => {
      releaseThumbnailSlot(token);
      setSlot(false);
    };
  }, [inView, supported, lost, claim, livePreview, geometry]);

  if (!geometry) return null;

  const live = livePreview && inView && slot && supported && !lost;

  return (
    <div
      ref={host}
      className="connector-preview"
      data-live={live ? "3d" : "2d"}
      data-housing={housing.housingMpn}
    >
      <div className="connector-preview-canvas">
        {live ? (
          <PreviewBoundary onFailed={() => setLost(true)}>
            <Suspense fallback={<HousingSilhouette housing={housing} geometry={geometry} />}>
              <PreviewScene
                housing={housing}
                geometry={geometry}
                reduced={reduced}
                onContextLost={() => setLost(true)}
              />
            </Suspense>
          </PreviewBoundary>
        ) : (
          <HousingSilhouette housing={housing} geometry={geometry} />
        )}
      </div>
      <PreviewCaption housing={housing} geometry={geometry} />
    </div>
  );
}

export default ConnectorPreview;
