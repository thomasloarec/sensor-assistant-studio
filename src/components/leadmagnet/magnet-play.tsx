import { useId, useRef, useState } from "react";
import type { CSSProperties, PointerEvent } from "react";
import { ArrowRight, Eye, Layers, Move, MoveHorizontal, MoveVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n/core";
import { useLocale } from "@/lib/i18n/react";
import { ACTIVATE, RELEASE, REED_INITIAL, REED_SCENE, mapReedPointer, moveReed, orientReed, reedContours, reedZone } from "@/lib/leadmagnet/reed-discovery";
import type { ReedOrientation, ReedPoint } from "@/lib/leadmagnet/reed-discovery";
import "./reed-discovery.css";

/** Home-only, generic complete cabled sensor. No product, calibration, persistence,
 * field lines or real distance. All contours and state use the same pure model. */
export function MagnetPlay({ onStart }: { onStart?: () => void }) {
  useLocale();
  const id = useId().replace(/:/g, "");
  const svgRef = useRef<SVGSVGElement | null>(null);
  const drag = useRef<{ pointerId: number; offset: ReedPoint } | null>(null);
  const [state, setState] = useState(REED_INITIAL);
  const [zones, setZones] = useState(false);
  const [inside, setInside] = useState(false);
  const zone = reedZone(state.point, state.orientation);
  const status = state.closed ? t("Contact fermé") : t("Contact ouvert");
  const instruction = state.progress === 0 ? t("Déplacez l'aimant pour trouver une zone qui ferme le contact.")
    : state.progress === 1 ? t("Reculez doucement dans la zone de maintien.")
    : state.progress === 2 ? (state.closed ? t("Toujours fermé ! Changez l'orientation de l'aimant.") : t("Déplacez l'aimant pour trouver une zone qui ferme le contact."))
    : state.progress === 3 ? t("Retrouvez une zone qui ferme le contact dans cette orientation.")
    : t("Hystérésis observée. Continuez à explorer librement.");
  const pointFromEvent = (e: PointerEvent<HTMLButtonElement>): ReedPoint | null => {
    const matrix = svgRef.current?.getScreenCTM();
    if (!matrix) return null;
    return mapReedPointer(e.clientX, e.clientY, matrix.inverse());
  };
  const stopDrag = (e: PointerEvent<HTMLButtonElement>) => {
    if (drag.current?.pointerId !== e.pointerId) return;
    drag.current = null;
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };
  const orient = (orientation: ReedOrientation) => setState((current) => orientReed(current, orientation));
  return (
    <div className="reed-discovery" data-testid="reed-discovery" data-zone={zone} data-closed={state.closed} data-progress={state.progress}>
      <div className="reed-heading">
        <h2 className="t-title-s">{t("Explorez le principe Reed")}</h2>
        <span className="reed-status t-body" data-closed={state.closed} role="status" aria-live="polite">
          <svg viewBox="0 0 40 24" width="32" height="24" aria-hidden="true">
            <path d={state.closed ? "M2 16 H10 L30 16 H38" : "M2 16 H10 L28 5 M30 16 H38"} fill="none" stroke="currentColor" strokeWidth="2" />
            <circle cx="10" cy="16" r="2" fill="currentColor" /><circle cx="30" cy="16" r="2" fill="currentColor" />
          </svg>
          {status}
        </span>
      </div>
      <div className="reed-controls">
        <div className="reed-orientation" role="group" aria-label={t("Orientation de l'aimant")}>
          <p className="t-caption">{t("Orientation de l'aimant")}</p>
          <div className="reed-segment" data-perpendicular={state.orientation === "perpendicular"}>
            <span className="reed-segment-thumb" aria-hidden="true" />
            <Button type="button" variant="ghost" className="t-body" aria-pressed={state.orientation === "parallel"} onClick={() => orient("parallel")}><MoveHorizontal />{t("Parallèle")}</Button>
            <Button type="button" variant="ghost" className="t-body" aria-pressed={state.orientation === "perpendicular"} onClick={() => orient("perpendicular")}><MoveVertical />{t("Perpendiculaire")}</Button>
          </div>
        </div>
        <Button type="button" variant={zones ? "secondary" : "ghost"} className="t-caption flex-1" aria-pressed={zones} aria-controls={`${id}-zones`} onClick={() => setZones(!zones)}><Layers />{t("Voir les zones")}</Button>
        <Button type="button" variant={inside ? "secondary" : "ghost"} className="t-caption flex-1" aria-pressed={inside} aria-controls={`${id}-inside`} onClick={() => setInside(!inside)}><Eye />{t("Voir à l'intérieur")}</Button>
      </div>
      <div className="reed-scene">
        <svg ref={svgRef} viewBox={`0 0 ${REED_SCENE.width} ${REED_SCENE.height}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={t("Capteur Reed générique en boîtier avec câble et aimant mobile") }>
          <defs>
            <pattern id={`${id}-hatch`} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><path d="M0 0 V8" stroke="var(--muted-foreground)" strokeWidth="2" opacity="0.5" /></pattern>
            <linearGradient id={`${id}-housing`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="var(--standex-gray)" /><stop offset="1" stopColor="var(--standex-deep)" /></linearGradient>
          </defs>
          <g id={`${id}-zones`} data-testid="reed-zones" visibility={zones ? "visible" : "hidden"}>
            {reedContours(state.orientation, RELEASE).map((outer, i) => {
              const inner = reedContours(state.orientation, ACTIVATE)[i];
              if (!inner) return null;
              const ellipsePath = (l: typeof inner) => `M${l.x - l.rx},${l.y} a${l.rx},${l.ry} 0 1,0 ${2 * l.rx},0 a${l.rx},${l.ry} 0 1,0 ${-2 * l.rx},0`;
              return <g key={i}>
                <path data-testid="reed-hold-contour" d={`${ellipsePath(outer)} ${ellipsePath(inner)}`} fill={`url(#${id}-hatch)`} fillRule="evenodd" />
                <ellipse data-testid="reed-on-contour" cx={inner.x} cy={inner.y} rx={inner.rx} ry={inner.ry} fill="var(--signal)" fillOpacity="0.25" stroke="var(--signal)" strokeWidth="1.5" />
                <ellipse cx={outer.x} cy={outer.y} rx={outer.rx} ry={outer.ry} fill="none" stroke="var(--muted-foreground)" strokeWidth="1" strokeDasharray="3 4" />
              </g>;
            })}
          </g>
          {/* Complete sensor: cable exits the housing; no fictitious integrated LED. */}
          <path d="M174 140 H135 Q110 140 110 163 V199 Q110 220 85 220 H12" fill="none" stroke="var(--standex-gray)" strokeWidth="9" />
          <path d="M174 138 H135 Q112 138 112 163" fill="none" stroke="var(--muted-foreground)" strokeOpacity="0.4" strokeWidth="1.5" />
          <rect x="168" y="130" width="14" height="20" rx="4" fill="var(--standex-gray)" />
          <rect x="178" y="122" width="84" height="36" rx="9" fill={`url(#${id}-housing)`} fillOpacity={inside ? 0.25 : 1} stroke="var(--muted-foreground)" strokeWidth="1.5" />
          <path d="M186 127 H254" stroke="var(--muted-foreground)" strokeOpacity="0.55" strokeWidth="1.5" />
          <g id={`${id}-inside`} data-testid="reed-interior" visibility={inside ? "visible" : "hidden"}>
            <rect x="190" y="129" width="60" height="22" rx="10" fill="var(--surface-tint)" stroke="var(--muted-foreground)" />
            <path data-testid="reed-left-blade" d={state.closed ? "M181 140 H218 L226 140" : "M181 140 H218 L226 136"} stroke="var(--foreground)" strokeWidth="2.5" fill="none" />
            <path data-testid="reed-right-blade" d={state.closed ? "M258 140 H234 L222 140" : "M258 140 H234 L222 144"} stroke="var(--foreground)" strokeWidth="2.5" fill="none" />
          </g>
          <g transform={`translate(${state.point.x} ${state.point.y}) rotate(${state.orientation === "parallel" ? 0 : 90})`}>
            <rect x="-32" y="-18" width="64" height="36" rx="4" fill="var(--standex-blue-50)" stroke="var(--foreground)" strokeWidth="1" />
            <path d="M-28 -17 H0 V17 H-28 Q-32 17 -32 13 V-13 Q-32 -17 -28 -17" fill="var(--standex-blue)" />
            <text x="-16" y="8" textAnchor="middle" fontSize="24" fill="var(--heading)">N</text>
            <text x="16" y="8" textAnchor="middle" fontSize="24" fill="var(--heading)">S</text>
          </g>
        </svg>
        <Button type="button" variant="ghost" className="reed-handle" aria-label={t("Déplacer l'aimant dans le plan")} aria-describedby={`${id}-instruction ${id}-keyboard`} data-testid="reed-handle"
          style={{ left: `${state.point.x / REED_SCENE.width * 100}%`, top: `${state.point.y / REED_SCENE.height * 100}%` } as CSSProperties}
          onPointerDown={(e) => {
            if (!e.isPrimary || (e.pointerType === "mouse" && e.button !== 0)) return;
            const point = pointFromEvent(e);
            if (!point) return;
            drag.current = { pointerId: e.pointerId, offset: { x: state.point.x - point.x, y: state.point.y - point.y } };
            e.currentTarget.setPointerCapture(e.pointerId);
            e.currentTarget.focus();
          }}
          onPointerMove={(e) => {
            const current = drag.current;
            if (!current || current.pointerId !== e.pointerId) return;
            const point = pointFromEvent(e);
            if (point) setState((s) => moveReed(s, { x: point.x + current.offset.x, y: point.y + current.offset.y }));
          }}
          onPointerUp={stopDrag} onPointerCancel={stopDrag} onLostPointerCapture={(e) => { if (drag.current?.pointerId === e.pointerId) drag.current = null; }}
          onKeyDown={(e) => {
            const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
            if (!direction) return;
            e.preventDefault();
            const step = e.shiftKey ? 2 : 8;
            setState((s) => moveReed(s, { x: s.point.x + (direction[0] ?? 0) * step, y: s.point.y + (direction[1] ?? 0) * step }));
          }}><span className="sr-only" id={`${id}-keyboard`}>{t("Utilisez les flèches pour déplacer l'aimant. Majuscule pour affiner.")}</span></Button>
      </div>
      {zones ? <div className="reed-legend t-caption" aria-label={t("Zones de commutation indicatives")}>
        <span><i className="reed-swatch reed-swatch-on" aria-hidden="true" />{t("Ferme le contact")}</span>
        <span><i className="reed-swatch reed-swatch-hold" aria-hidden="true" />{t("Conserve l'état précédent")}</span>
        <span><i className="reed-swatch" aria-hidden="true" />{t("Contact ouvert")}</span>
      </div> : null}
      <p id={`${id}-instruction`} className="reed-prompt t-body" aria-live="polite"><Move className="inline size-4 mr-2" aria-hidden="true" />{instruction}</p>
      <p className="t-caption">{t("Reed normalement ouvert. Illustration du principe, pas une mesure : la distance réelle dépend du capteur, de l'aimant et du montage.")}</p>
      {onStart ? <Button type="button" variant="link" className="reed-cta t-body mt-2" onClick={onStart}>{t("Trouver un capteur pour mon application")}<ArrowRight /></Button> : null}
    </div>
  );
}
