/** Lecture et commutations illustratives de l'atelier, en logique pure.
 *
 *  - La lecture avance au TEMPS ÉCOULÉ, rapportée à la durée réelle du cycle :
 *    durée du clip CHARGÉ (jamais celle du JSON enregistré), ou durée fixe d'un
 *    aller-retour manuel. Aucun plafond de pas : un clip de 0,2 s ou de 400 s
 *    garde sa durée. La dernière image est exacte (progression bornée à 1).
 *  - Les commutations sont lues sur les MÊMES échantillons que la scène et la
 *    chronologie ; seules ouvert→fermé et fermé→ouvert comptent. */
import {
  activeClip,
  cycleU,
  markerReading,
  usesClip,
  type MachineAssembly,
} from "./machine-assembly";
import { openingReading } from "./machine-mounting";

/** Durée d'un aller-retour manuel à vitesse normale (120 pas × 50 ms). */
export const MANUAL_CYCLE_SECONDS = 6;
/** Facteur de ralenti (lecture lente = deux fois plus longue). */
export const SLOW_FACTOR = 2;
/** Un onglet en arrière-plan ne fait pas sauter la lecture : pas maximal. */
export const MAX_FRAME_MS = 250;

/** Durée réelle d'un cycle de lecture, en secondes ; null si rien n'est lisible. */
export function cycleSeconds(m: MachineAssembly | null | undefined): number | null {
  if (m && usesClip(m)) {
    const s = activeClip(m);
    return s && Number.isFinite(s.duration) && s.duration > 0 ? s.duration : null;
  }
  return MANUAL_CYCLE_SECONDS;
}

/** Progression suivante après `elapsedMs` de temps écoulé. */
export function playbackStep(
  progress: number,
  elapsedMs: number,
  seconds: number | null,
  slow: boolean,
): number {
  if (!seconds || !(seconds > 0) || !Number.isFinite(elapsedMs) || elapsedMs <= 0) return progress;
  const dt = Math.min(MAX_FRAME_MS, elapsedMs) / 1000;
  return Math.min(1, progress + dt / (seconds * (slow ? SLOW_FACTOR : 1)));
}

export interface SwitchEvent {
  /** Position dans le cycle (0..1) : se placer sur l'événement. */
  t: number;
  kind: "close" | "open";
  /** Mouvement manuel : ouverture et phase. */
  opening?: { value: number; unit: "mm" | "°"; phase: "aller" | "retour" | "ouvert" | "fermé" };
  /** Clip : temps dans l'animation (s). */
  clipSeconds?: number;
  /** Distance entre les repères choisis, s'ils existent (mm). */
  markerMm?: number;
}

/** Commutations des échantillons affichés. Une entrée depuis « indéterminé »
 *  (collision, données manquantes) n'est JAMAIS comptée comme enclenchement. */
export function switchEvents(
  m: MachineAssembly | null,
  samples: readonly { t: number; contact: "open" | "closed" | "unknown" }[],
): SwitchEvent[] {
  const out: SwitchEvent[] = [];
  const clip = m && usesClip(m) ? activeClip(m) : null;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]!.contact,
      b = samples[i]!.contact;
    const kind = a === "open" && b === "closed" ? "close" : a === "closed" && b === "open" ? "open" : null;
    if (!kind) continue;
    const t = samples[i]!.t;
    const e: SwitchEvent = { t, kind };
    if (m) {
      const u = cycleU(m, t);
      if (usesClip(m)) {
        if (clip) e.clipSeconds = u * clip.duration;
      } else {
        const r = openingReading(m, t);
        e.opening = {
          value: r.value,
          unit: r.unit,
          phase: ({ opening: "aller", return: "retour", open: "ouvert", closed: "fermé" } as const)[r.phase],
        };
      }
      const mk = markerReading(m, u);
      if (mk) e.markerMm = mk.distance;
    }
    out.push(e);
  }
  return out;
}

/** Pas d'échantillonnage, pour afficher des valeurs approchées honnêtes. */
export function eventResolution(
  m: MachineAssembly | null,
  sampleCount: number,
): { value: number; unit: "mm" | "°" | "s" } | null {
  if (!m || sampleCount < 2) return null;
  const n = sampleCount - 1;
  if (usesClip(m)) {
    const s = activeClip(m);
    return s ? { value: s.duration / n, unit: "s" } : null;
  }
  const full = m.motion === "translation" ? Math.hypot(...m.travel) : Math.abs(m.openingAngle);
  return { value: (2 * full) / n, unit: m.motion === "translation" ? "mm" : "°" };
}
