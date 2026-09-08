import { useLocale } from "@/lib/i18n/react";
import { t } from "@/lib/i18n/core";
/** Démonstration pédagogique : un aimant déplaçable devant un capteur reed.
 *
 * Le dessin est un SVG natif (ampoule de verre, deux lamelles, fils, aimant
 * bicolore N/S) : rien n'est une image figée. Aucune mesure physique n'est
 * affichée, seulement « Détecté » ou « Hors de portée ».
 * Souris, tactile, clavier et curseur donnent exactement le même contrôle.
 */
import { useCallback, useRef, useState } from "react";
import { Slider } from "@/components/ui/slider";

/** Position de l'aimant, en pourcentage de la largeur de la scène. */
const MIN = 34;
const MAX = 92;
/** Seuil pédagogique : en deçà, l'aimant referme le contact. */
const THRESHOLD = 52;

export function MagnetPlay() {
  useLocale();
  const [pos, setPos] = useState(86);
  const [dragging, setDragging] = useState(false);
  const sceneRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  const clamp = (v: number) => Math.min(MAX, Math.max(MIN, v));
  const detected = pos <= THRESHOLD;
  /** 0 loin → 1 au plus près : sert au rapprochement des lamelles et au halo. */
  const near = Math.min(1, Math.max(0, (MAX - pos) / (MAX - MIN)));

  const moveTo = useCallback((clientX: number) => {
    const box = sceneRef.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    setPos(clamp(((clientX - box.left) / box.width) * 100));
  }, []);

  // Géométrie du SVG (viewBox 0 0 100 60) : le capteur est fixe à gauche.
  const gap = detected ? 0 : 1.6 + 2.4 * (1 - near);
  const magnetX = pos;

  return (
    <div className="w-full overflow-hidden rounded-[var(--r-2xl)]">
      <div
        ref={sceneRef}
        className={`magnet-scene relative w-full touch-none overflow-hidden rounded-t-[var(--r-2xl)] ${
          detected ? "is-detected" : ""
        }`}
        onPointerMove={(e) => {
          if (draggingRef.current) moveTo(e.clientX);
        }}
        onPointerUp={() => {
          draggingRef.current = false;
          setDragging(false);
        }}
        onPointerLeave={() => {
          draggingRef.current = false;
          setDragging(false);
        }}
      >
        <svg
          viewBox="0 0 100 60"
          role="img"
          aria-label={t("Un aimant que l'on approche d'un capteur reed sous ampoule de verre")}
          className="block h-72 w-full sm:h-[22rem]"
        >
          <defs>
            <linearGradient id="mp-glass" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={t("oklch(1 0 0)")} stopOpacity="0.05" />
              <stop offset="50%" stopColor={t("oklch(1 0 0)")} stopOpacity="0.14" />
              <stop offset="100%" stopColor={t("oklch(1 0 0)")} stopOpacity="0.05" />
            </linearGradient>
            <linearGradient id="mp-north" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={t("oklch(0.62 0.19 25)")} />
              <stop offset="100%" stopColor={t("oklch(0.48 0.17 25)")} />
            </linearGradient>
            <linearGradient id="mp-south" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={t("oklch(0.5 0.09 258)")} />
              <stop offset="100%" stopColor={t("oklch(0.34 0.07 258)")} />
            </linearGradient>
            <linearGradient id="mp-bevel" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="white" stopOpacity="0.32" />
              <stop offset="28%" stopColor="white" stopOpacity="0" />
              <stop offset="78%" stopColor="black" stopOpacity="0" />
              <stop offset="100%" stopColor="black" stopOpacity="0.28" />
            </linearGradient>
            <filter id="mp-shadow" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow
                dx="0"
                dy={1.8 - near * 0.8}
                stdDeviation={1.8 - near * 0.7}
                floodOpacity={0.42 - near * 0.12}
              />
            </filter>
            <filter id="mp-signal-glow" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="1.6" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Halo de proximité */}
          <ellipse
            cx="22"
            cy="30"
            rx={12 + 10 * near}
            ry={9 + 7 * near}
            className="text-signal transition-all duration-[var(--d-base)] ease-[var(--ease-spring)] motion-reduce:transition-none"
            fill="currentColor"
            opacity={detected ? 0.34 : 0.04 + 0.12 * near}
          />

          {/* Fils de sortie */}
          <path
            d="M2 30 H10"
            className="text-muted-foreground"
            stroke="currentColor"
            strokeWidth="0.9"
          />
          <path
            d="M34 30 H44"
            className="text-muted-foreground"
            stroke="currentColor"
            strokeWidth="0.9"
          />

          {/* Ampoule de verre */}
          <rect
            x="10"
            y="21"
            width="24"
            height="18"
            rx="9"
            fill="url(#mp-glass)"
            stroke="oklch(1 0 0 / 0.35)"
            strokeWidth="0.5"
          />
          <path
            d="M13 26 Q22 21.5 31 26"
            fill="none"
            stroke="oklch(1 0 0 / 0.45)"
            strokeLinecap="round"
            strokeWidth="0.45"
          />

          {/* Deux lamelles ferromagnétiques qui se rapprochent */}
          <path
            d={`M10 30 H16 L25 ${30 - gap}`}
            className="transition-all duration-[var(--d-base)] ease-[var(--ease-spring)] motion-reduce:transition-none"
            stroke="oklch(0.82 0.01 250)"
            strokeWidth="1.2"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d={`M34 30 H30 L22 ${30 + gap}`}
            className="transition-all duration-[var(--d-base)] ease-[var(--ease-spring)] motion-reduce:transition-none"
            stroke="oklch(0.82 0.01 250)"
            strokeWidth="1.2"
            fill="none"
            strokeLinecap="round"
          />

          {detected ? (
            <path
              d="M22 30 H25"
              fill="none"
              stroke="var(--signal)"
              strokeLinecap="round"
              strokeWidth="1.5"
              filter="url(#mp-signal-glow)"
            />
          ) : null}

          {/* Lignes de champ entre l'aimant et le capteur */}
          <g
            className="text-signal transition-opacity duration-[var(--d-base)] motion-reduce:transition-none"
            fill="none"
            opacity={0.16 + 0.66 * near}
          >
            {[4, 8, 12].flatMap((r, index) => {
              const controlX = 22 + (magnetX - 22) * (0.46 + near * 0.08);
              const bow = 11 + r * (0.65 + near * 0.25);
              const width = 0.45 - index * 0.125;
              return [
                <path
                  key={`upper-${r}`}
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeWidth={width}
                  d={`M${magnetX} 19 Q${controlX} ${30 - bow} 22 ${30 - r}`}
                />,
                <path
                  key={`lower-${r}`}
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeWidth={width}
                  d={`M${magnetX} 41 Q${controlX} ${30 + bow} 22 ${30 + r}`}
                />,
              ];
            })}
          </g>
          <g
            className="text-signal transition-opacity duration-[var(--d-base)] motion-reduce:transition-none"
            fill="none"
            opacity={0.05 + 0.2 * near}
          >
            <path
              className="magnet-flux-line"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="0.35"
              d={`M${magnetX} 19 Q${22 + (magnetX - 22) * (0.46 + near * 0.08)} ${18 - near * 3} 22 24`}
            />
            <path
              className="magnet-flux-line"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="0.35"
              d={`M${magnetX} 41 Q${22 + (magnetX - 22) * (0.46 + near * 0.08)} ${42 + near * 3} 22 36`}
            />
          </g>

          {/* Aimant bicolore N / S, en volume */}
          <g
            transform={`translate(${magnetX} 30) scale(${dragging ? 1.04 : 1})`}
            filter="url(#mp-shadow)"
            className="transition-transform duration-[var(--d-fast)] ease-[var(--ease-spring)] motion-reduce:transition-none"
          >
            <rect x="-4" y="-11" width="8" height="11" rx="1.4" fill="url(#mp-north)" />
            <rect x="-4" y="0" width="8" height="11" rx="1.4" fill="url(#mp-south)" />
            <rect x="-4" y="-11" width="8" height="22" rx="1.4" fill="url(#mp-bevel)" />
            <text x="0" y="-4" textAnchor="middle" fontSize="5" fill="white">
              N
            </text>
            <text x="0" y="8" textAnchor="middle" fontSize="5" fill="white">
              S
            </text>
          </g>
        </svg>

        {/* Poignée réelle superposée à l'aimant : souris, tactile et clavier */}
        <button
          type="button"
          role="slider"
          aria-label={t("Position de l'aimant devant le capteur")}
          aria-valuemin={MIN}
          aria-valuemax={MAX}
          aria-valuenow={Math.round(pos)}
          aria-valuetext={detected ? t("Détecté") : t("Hors de portée")}
          className="magnet-handle absolute top-1/2 h-24 w-14 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none rounded-xl border-2 border-transparent bg-transparent focus-visible:border-ring active:cursor-grabbing"
          style={{ left: `${pos}%` }}
          onPointerDown={(e) => {
            draggingRef.current = true;
            setDragging(true);
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerCancel={() => {
            draggingRef.current = false;
            setDragging(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") setPos((p) => clamp(p - 4));
            else if (e.key === "ArrowRight") setPos((p) => clamp(p + 4));
            else return;
            e.preventDefault();
          }}
        >
          <span className="sr-only">{t("Déplacer l'aimant")}</span>
        </button>

        <p
          aria-live="polite"
          className={`material absolute bottom-4 left-1/2 flex min-h-11 -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-[var(--r-pill)] px-5 py-2 text-base font-semibold shadow-[var(--e-2)] transition-[color,transform,opacity] duration-[var(--d-base)] ease-[var(--ease-spring)] ${
            detected
              ? "scale-100 text-signal opacity-100"
              : "scale-[0.98] text-foreground opacity-90"
          }`}
        >
          {detected ? (
            <span className="magnet-status-dot size-2 rounded-full bg-signal" aria-hidden="true" />
          ) : null}
          {detected ? t("Détecté") : t("Hors de portée")}
        </p>
      </div>

      <div className="px-5 pb-5 pt-5 sm:px-7 sm:pb-7">
        <p className="t-body-l">{t("Rapprochez l'aimant. Observez le capteur.")}</p>
        <div className="mt-4 flex items-center gap-5">
          <span className="t-label shrink-0">{t("Distance")}</span>
          <Slider
            className="min-w-0 flex-1"
            value={[MAX + MIN - pos]}
            min={MIN}
            max={MAX}
            step={1}
            aria-label={t("Rapprocher ou éloigner l'aimant du capteur")}
            onValueChange={(v) => setPos(clamp(MAX + MIN - (v[0] ?? pos)))}
          />
        </div>
        <p className="t-caption mt-4">
          {t("Illustration du principe, pas une mesure : la distance réelle dépend du capteur, de l'aimant et du montage.")}
        </p>
      </div>
    </div>
  );
}
