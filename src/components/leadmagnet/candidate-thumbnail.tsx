import { pairLayout } from "@/lib/standex/pair-layout";
import { SensorPlan } from "@/components/standex/workshop/sensor-plan";
import { pairedMagnetModel } from "@/lib/standex/paired-magnets";
import { t } from "@/lib/i18n/core";
/** Vignette d'un candidat : rendu 3D réel, monté à la demande.
 *
 * Contraintes tenues ici :
 * - un contexte WebGL n'est créé QUE lorsque la vignette entre à l'écran ;
 * - le nombre de contextes simultanés est plafonné, les vignettes en attente
 *   affichent le repli 2D jusqu'à ce qu'une place se libère ;
 * - la 3D est démontée (et sa place rendue) dès que la vignette sort de vue ;
 * - dès qu'une autre vignette visible attend une place, le rendu est FIGÉ en
 *   image et le contexte est rendu : les six objets de trois cartes sont donc
 *   tous rendus en 3D, à tour de rôle, sans dépendre du survol ;
 * - aucune rotation automatique sous `prefers-reduced-motion: reduce` ;
 * - sans WebGL, le repli 2D dessine LA silhouette du capteur concerné : il ne
 *   substitue jamais une autre référence.
 */
import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from "react";

import {
  sensorById,
  customLayout,
  electricalDetailsAllowed,
  formatMm,
} from "@/lib/standex/sensor-catalog";
import type { SensorModel } from "@/lib/standex/sensor-catalog";
import { niceScaleStep } from "@/lib/standex/scale-bar";

const ThumbnailScene = lazy(
  () => import("@/components/standex/workshop/candidate-thumbnail-scene"),
);

import {
  acquireThumbnailSlot,
  hasWebGL,
  liveThumbnailContexts,
  queuedThumbnailSlots,
  releaseThumbnailSlot,
  resetThumbnailSlots,
  storeThumbnailSnapshot,
  thumbnailSnapshot,
  useWebglSlot,
} from "@/hooks/use-webgl-slot";

/** L'ordonnanceur de contextes WebGL vit dans `@/hooks/use-webgl-slot` : il est
 * partagé par toutes les vignettes (candidats, couples, connecteurs). Ces
 * ré-exports gardent les appelants historiques valides. */
export {
  acquireThumbnailSlot,
  releaseThumbnailSlot,
  hasWebGL,
  liveThumbnailContexts,
  queuedThumbnailSlots,
  resetThumbnailSlots,
};

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

/* Le pas de graduation vient du module partagé : le repli 2D et le rendu 3D
   mesurent la même longueur réelle, avec le même pas. */
export { niceScaleStep };

function Fallback({
  model,
  reason,
  cabled,
  pair,
  fitToView = false,
  scaleBar = false,
  caption = true,
}: {
  model: SensorModel;
  reason: string;
  cabled: boolean;
  pair?: { magnetId: string; approach: string };
  fitToView?: boolean;
  /** Règle graduée dessinée DANS le repère millimétrique du dessin : elle est
   * donc exacte pour ce cadrage précis. La vue 3D a sa propre règle, mesurée
   * dans la projection orthographique. */
  scaleBar?: boolean;
  /** À `false`, la raison n'est plus écrite dans la vignette : elle reste lue
   * par les lecteurs d'écran (aria-label) et proposée en infobulle. */
  caption?: boolean;
}) {
  const magnet = pair ? pairedMagnetModel(pair.magnetId, model.id) : null;
  const span = Math.max(...model.body, model.terminalSpan ?? 0);
  const layout = magnet ? pairLayout(model, magnet, pair!.approach) : null;
  const step = niceScaleStep(span);
  return (
    <div className="candidate-thumb-fallback" role="img" aria-label={`${model.name} — ${reason}`}>
      <svg
        viewBox={fitToView ? `${-span} ${-span * 0.6} ${span * 2} ${span * 1.2}` : "-64 -34 128 68"}
        aria-hidden="true"
        focusable="false"
      >
        <g
          transform={
            layout ? `translate(${-layout.offset[0] / 2} ${-layout.offset[2] / 2})` : undefined
          }
        >
          <g transform={layout ? `rotate(${(-layout.sensorYaw * 180) / Math.PI})` : undefined}>
            <SensorPlan
              model={model}
              xray={false}
              showCable={electricalDetailsAllowed(model) && cabled}
            />
          </g>
          {magnet && layout && (
            <g
              transform={`translate(${layout.offset[0]} ${layout.offset[2]}) rotate(${(-layout.magnetYaw * 180) / Math.PI})`}
            >
              <SensorPlan model={magnet} xray={false} showCable={false} />
            </g>
          )}
        </g>
        {fitToView && scaleBar ? (
          <g
            className="candidate-thumb-scale"
            transform={`translate(${-span * 0.94} ${span * 0.44})`}
          >
            <line x1={0} y1={0} x2={step} y2={0} strokeWidth={span * 0.014} />
            <line x1={0} y1={-span * 0.05} x2={0} y2={span * 0.05} strokeWidth={span * 0.014} />
            <line
              x1={step}
              y1={-span * 0.05}
              x2={step}
              y2={span * 0.05}
              strokeWidth={span * 0.014}
            />
            <text x={step + span * 0.06} y={span * 0.05} fontSize={span * 0.11}>
              {formatMm(step)} mm
            </text>
          </g>
        ) : null}
      </svg>
      {caption ? <span className="t-caption">{reason}</span> : null}
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
  hostSensorId,
  livePreview = true,
  cabled = false,
  pair,
  fitToView = false,
  size = "compact",
  scaleBar = false,
  legend,
  quiet = false,
}: {
  sensorId: string;
  /** Capteur du COUPLE quand l'objet dessiné est un aimant. La fiche produit
   *  peut donner un boîtier par variante de capteur (M11S en M5 ou en M8) :
   *  sans ce contexte, l'aimant serait dessiné dans la mauvaise variante, en
   *  2D comme en 3D. */
  hostSensorId?: string;
  livePreview?: boolean;
  cabled?: boolean;
  pair?: { magnetId: string; approach: string };
  fitToView?: boolean;
  /** Hauteur de la vignette. Le cadrage reste propre à chaque capteur. */
  size?: "compact" | "large";
  scaleBar?: boolean;
  /** Rôle de l'objet dessiné : « Capteur » ou « Aimant ». Écrit SOUS l'image,
   *  jamais par-dessus, et repris dans le libellé accessible. */
  legend?: "sensor" | "magnet";
  /** Vignette silencieuse : aucun texte dans l'image. L'état de l'aperçu passe
   *  en infobulle (`title`) et reste annoncé aux lecteurs d'écran. */
  quiet?: boolean;
}) {
  const model = pairedMagnetModel(sensorId, hostSensorId) ?? sensorById(sensorId);
  const [lost, setLost] = useState(false);
  const supported = hasWebGL();
  /* Clé d'instantané : elle décrit EXACTEMENT ce qui est dessiné. Une image
     figée ne peut donc pas être réaffichée pour une autre géométrie, un autre
     couple, une autre approche ou un autre cadrage. */
  const snapshotKey = [
    model.id,
    hostSensorId ?? "",
    pair?.magnetId ?? "",
    pair?.approach ?? "",
    cabled ? "cable" : "nocable",
    fitToView ? "fit" : "fixed",
    scaleBar ? "rule" : "norule",
    size,
  ].join("|");
  const [snapshot, setSnapshot] = useState<string | null>(() => thumbnailSnapshot(snapshotKey));
  useEffect(() => {
    setSnapshot(thumbnailSnapshot(snapshotKey));
  }, [snapshotKey]);
  // La 3D est demandée pour TOUTE vignette réellement visible : l'attribution
  // dépend de la visibilité, plus du survol. Une carte sans place disponible
  // garde son dessin coté et le dit.
  // Une vignette déjà figée ne redemande PAS de contexte : sa place revient
  // immédiatement aux vignettes visibles encore en attente.
  const { host, hasSlot, reduced, crowded } = useWebglSlot(
    livePreview && supported && !lost && snapshot === null,
  );

  const live = hasSlot;
  const reason = !livePreview
    ? t("Vue plane")
    : !supported
      ? t("3D non disponible sur cet appareil")
      : lost
        ? t("Aperçu 3D indisponible : dessin coté à la place")
        : live
          ? t("Aperçu 3D")
          : snapshot
            ? t("Aperçu 3D figé")
            : t("Dessin coté : aperçu 3D en attente d'une place");
  const roleLabel = legend === "magnet" ? t("Aimant") : legend === "sensor" ? t("Capteur") : null;
  return (
    <div
      ref={host as React.RefObject<HTMLDivElement>}
      className={size === "large" ? "candidate-thumb candidate-thumb-large" : "candidate-thumb"}
      data-live={live ? "3d" : snapshot ? "snapshot" : "2d"}
      data-role={legend}
      data-sensor={model.id}
      {...(quiet ? { title: `${model.name} — ${reason}` } : {})}
    >
      {!live && snapshot ? (
        // Image du rendu 3D réel de CETTE vignette : le contexte a été rendu
        // pour qu'une autre carte visible puisse être rendue à son tour.
        <img className="candidate-thumb-snapshot" src={snapshot} alt={`${model.name} — ${reason}`} />
      ) : live ? (
        // Un renderer qui refuse de se créer doit retomber sur le dessin 2D,
        // au même titre qu'un contexte perdu en cours de route.
        <ThumbnailBoundary onFailed={() => setLost(true)}>
          <Suspense
            fallback={
              <Fallback
                model={model}
                reason={t("Aperçu 3D en cours")}
                cabled={cabled}
                fitToView={fitToView}
                scaleBar={scaleBar}
                caption={!quiet}
                {...(pair ? { pair } : {})}
              />
            }
          >
            <ThumbnailScene
              sensorId={model.id}
              {...(hostSensorId ? { hostSensorId } : {})}
              cabled={cabled}
              fitToView={fitToView}
              scaleBar={scaleBar}
              {...(pair ? { pair } : {})}
              reduced={reduced}
              /* Figer dès qu'une autre vignette visible attend, ou d'emblée
                 quand l'animation est désactivée par préférence système. */
              snapshotWhenSettled={crowded || reduced}
              onSnapshot={(dataUrl) => {
                storeThumbnailSnapshot(snapshotKey, dataUrl);
                setSnapshot(dataUrl);
              }}
              onContextLost={() => setLost(true)}
            />
          </Suspense>
        </ThumbnailBoundary>
      ) : (
        <Fallback
          model={model}
          reason={reason}
          cabled={cabled}
          fitToView={fitToView}
          scaleBar={scaleBar}
          caption={!quiet}
          {...(pair ? { pair } : {})}
        />
      )}
      {roleLabel ? (
        <span className="candidate-thumb-legend t-label">
          {legend === "magnet" ? (
            <svg
              className="candidate-thumb-legend-icon"
              viewBox="-12 -6 24 12"
              aria-hidden="true"
              focusable="false"
            >
              <rect className="magnet-pole-north" x={-10} y={-5} width={10} height={10} rx={1} />
              <rect className="magnet-pole-south" x={0} y={-5} width={10} height={10} rx={1} />
            </svg>
          ) : null}
          {roleLabel}
        </span>
      ) : null}
    </div>
  );
}
