/** Démonstration pédagogique : un aimant déplaçable devant un capteur reed.
 *
 * Aucune mesure physique n'est affichée : seulement « Détecté » ou
 * « Hors de portée », pour faire comprendre le principe de la distance.
 * Souris, tactile, clavier et curseur donnent le même contrôle.
 */
import { useCallback, useRef, useState } from "react";
import { Slider } from "@/components/ui/slider";

/** Position de l'aimant, en pourcentage de la largeur de la scène. */
const MIN = 4;
const MAX = 96;
/** Seuil pédagogique : au-delà, l'aimant n'agit plus sur le capteur. */
const THRESHOLD = 34;

export function MagnetPlay() {
  const [pos, setPos] = useState(78);
  const sceneRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  const clamp = (v: number) => Math.min(MAX, Math.max(MIN, v));
  const detected = pos <= THRESHOLD;

  const moveTo = useCallback((clientX: number) => {
    const box = sceneRef.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    setPos(clamp(((clientX - box.left) / box.width) * 100));
  }, []);

  return (
    <div className="w-full">
      <div
        ref={sceneRef}
        className="relative h-64 w-full touch-none overflow-hidden rounded-3xl border bg-card sm:h-80"
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
        {/* Capteur, fixe à gauche */}
        <div className="absolute left-6 top-1/2 -translate-y-1/2 text-center sm:left-12">
          <div
            className={`grid h-28 w-16 place-items-center rounded-2xl border-2 transition-colors motion-reduce:transition-none ${
              detected ? "border-success bg-success/10" : "border-border bg-muted"
            }`}
            aria-hidden="true"
          >
            <span
              className={`h-5 w-5 rounded-full ${detected ? "bg-success" : "bg-muted-foreground/40"}`}
            />
          </div>
          <p className="mt-2 text-base font-medium">Capteur</p>
        </div>

        {/* Aimant déplaçable */}
        <button
          type="button"
          role="slider"
          aria-label="Position de l'aimant devant le capteur"
          aria-valuemin={MIN}
          aria-valuemax={MAX}
          aria-valuenow={Math.round(pos)}
          aria-valuetext={detected ? "Détecté" : "Hors de portée"}
          className="absolute top-1/2 h-28 w-20 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none rounded-2xl border-2 border-primary bg-primary text-primary-foreground shadow-lg active:cursor-grabbing"
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
          <span className="text-base font-semibold">Aimant</span>
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

      <div className="mt-5 flex flex-wrap items-center gap-4">
        <span className="text-base">Rapprocher l'aimant</span>
        <Slider
          className="min-w-[220px] max-w-sm flex-1"
          value={[MAX + MIN - pos]}
          min={MIN}
          max={MAX}
          step={1}
          aria-label="Rapprocher ou éloigner l'aimant du capteur"
          onValueChange={(v) => setPos(clamp(MAX + MIN - (v[0] ?? pos)))}
        />
      </div>
      <p className="mt-3 text-base text-muted-foreground">
        Illustration du principe : le capteur réagit quand l'aimant est assez proche. Ce n'est pas
        une mesure ; la distance réelle dépend du capteur, de l'aimant et du montage.
      </p>
    </div>
  );
}
