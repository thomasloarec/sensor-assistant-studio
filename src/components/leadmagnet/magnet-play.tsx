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
  const [pos, setPos] = useState(86);
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
    <div className="w-full">
      <div
        ref={sceneRef}
        className="relative w-full touch-none overflow-hidden rounded-3xl border bg-card"
        onPointerMove={(e) => {
          if (draggingRef.current) moveTo(e.clientX);
        }}
        onPointerUp={() => {
          draggingRef.current = false;
        }}
        onPointerLeave={() => {
          draggingRef.current = false;
        }}
      >
        <svg
          viewBox="0 0 100 60"
          role="img"
          aria-label="Un aimant que l'on approche d'un capteur reed sous ampoule de verre"
          className="block h-56 w-full sm:h-72"
        >
          <defs>
            <linearGradient id="mp-glass" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.06" />
              <stop offset="50%" stopColor="currentColor" stopOpacity="0.14" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0.06" />
            </linearGradient>
            <linearGradient id="mp-north" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="oklch(0.62 0.19 25)" />
              <stop offset="100%" stopColor="oklch(0.48 0.17 25)" />
            </linearGradient>
            <linearGradient id="mp-south" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="oklch(0.5 0.09 258)" />
              <stop offset="100%" stopColor="oklch(0.34 0.07 258)" />
            </linearGradient>
            <filter id="mp-shadow" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="1" stdDeviation="1.1" floodOpacity="0.25" />
            </filter>
          </defs>

          {/* Halo de proximité, discret */}
          <ellipse
            cx="22"
            cy="30"
            rx={12 + 10 * near}
            ry={9 + 7 * near}
            className="text-success transition-all duration-300 motion-reduce:transition-none"
            fill="currentColor"
            opacity={detected ? 0.16 : 0.05 * near}
          />

          {/* Fils de sortie */}
          <path d="M2 30 H10" className="text-muted-foreground" stroke="currentColor" strokeWidth="0.9" />
          <path d="M34 30 H44" className="text-muted-foreground" stroke="currentColor" strokeWidth="0.9" />

          {/* Ampoule de verre */}
          <rect
            x="10"
            y="21"
            width="24"
            height="18"
            rx="9"
            fill="url(#mp-glass)"
            className="text-foreground"
            stroke="currentColor"
            strokeOpacity="0.35"
            strokeWidth="0.5"
          />

          {/* Deux lamelles ferromagnétiques qui se rapprochent */}
          <path
            d={`M10 30 H20 L23 ${30 - gap} H26`}
            className={
              detected
                ? "text-success transition-all duration-200 motion-reduce:transition-none"
                : "text-foreground transition-all duration-200 motion-reduce:transition-none"
            }
            stroke="currentColor"
            strokeWidth="1.2"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d={`M34 30 H26 L23 ${30 + gap} H20`}
            className={
              detected
                ? "text-success transition-all duration-200 motion-reduce:transition-none"
                : "text-foreground transition-all duration-200 motion-reduce:transition-none"
            }
            stroke="currentColor"
            strokeWidth="1.2"
            fill="none"
            strokeLinecap="round"
          />

          {/* Lignes de champ discrètes entre l'aimant et le capteur */}
          <g
            className="text-primary transition-opacity duration-300 motion-reduce:transition-none"
            stroke="currentColor"
            fill="none"
            strokeWidth="0.4"
            opacity={0.1 + 0.35 * near}
          >
            {[7, 12, 17].map((r) => (
              <path
                key={r}
                d={`M${magnetX - 4} ${30 - r} Q ${(magnetX + 23) / 2} 30 ${magnetX - 4} ${30 + r}`}
              />
            ))}
          </g>

          {/* Aimant bicolore N / S, en volume */}
          <g
            transform={`translate(${magnetX} 30)`}
            filter="url(#mp-shadow)"
            className="transition-transform duration-150 motion-reduce:transition-none"
          >
            <rect x="-4" y="-11" width="8" height="11" rx="1.4" fill="url(#mp-north)" />
            <rect x="-4" y="0" width="8" height="11" rx="1.4" fill="url(#mp-south)" />
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
          aria-label="Position de l'aimant devant le capteur"
          aria-valuemin={MIN}
          aria-valuemax={MAX}
          aria-valuenow={Math.round(pos)}
          aria-valuetext={detected ? "Détecté" : "Hors de portée"}
          className="absolute top-1/2 h-24 w-14 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none rounded-xl border-2 border-transparent bg-transparent focus-visible:border-ring active:cursor-grabbing"
          style={{ left: `${pos}%` }}
          onPointerDown={(e) => {
            draggingRef.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") setPos((p) => clamp(p - 4));
            else if (e.key === "ArrowRight") setPos((p) => clamp(p + 4));
            else return;
            e.preventDefault();
          }}
        >
          <span className="sr-only">Déplacer l'aimant</span>
        </button>

        <p
          aria-live="polite"
          className={`absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full px-5 py-2 text-lg font-semibold ${
            detected ? "bg-success text-primary-foreground" : "bg-muted text-foreground"
          }`}
        >
          {detected ? "Détecté" : "Hors de portée"}
        </p>
      </div>

      <p className="mt-4 text-lg">Rapprochez l'aimant. Observez le capteur.</p>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <span className="text-base">Distance</span>
        <Slider
          className="min-w-[200px] max-w-sm flex-1"
          value={[MAX + MIN - pos]}
          min={MIN}
          max={MAX}
          step={1}
          aria-label="Rapprocher ou éloigner l'aimant du capteur"
          onValueChange={(v) => setPos(clamp(MAX + MIN - (v[0] ?? pos)))}
        />
      </div>
      <p className="mt-3 text-base text-muted-foreground">
        Illustration du principe, pas une mesure : la distance réelle dépend du capteur, de l'aimant
        et du montage.
      </p>
    </div>
  );
}
