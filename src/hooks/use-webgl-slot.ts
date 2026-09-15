/** Ordonnanceur partagé de contextes WebGL pour les vignettes de candidats.
 *
 * Pourquoi un ordonnanceur et pas un simple survol : le navigateur limite le
 * nombre de contextes WebGL vivants (environ 4 utiles en pratique). Avec un
 * octroi « au survol », l'ordre d'attribution dépendait de la souris, pas de
 * ce qui est réellement affiché : une carte visible pouvait rester en 2D
 * pendant qu'une carte hors écran gardait sa place. Ici, seules les vignettes
 * RÉELLEMENT VISIBLES (IntersectionObserver) demandent une place, dans l'ordre
 * où elles apparaissent ; une place se libère et se transmet dès qu'une
 * vignette sort de l'écran — comportement déterministe, jamais dépendant du
 * survol.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export type ThumbnailSlot = { held: boolean; waiting: boolean };

export const MAX_LIVE_CONTEXTS = 4;

let liveContexts = 0;
const queue: { token: ThumbnailSlot; notify: () => void }[] = [];

/* ------------------------------------------------------------------ */
/* Pression : qui attend une place, et qui doit donc en libérer une     */
/* ------------------------------------------------------------------ */
/** Avec 4 places et 6 objets visibles, plafonner ne suffit pas : les vignettes
 * déjà servies doivent RENDRE leur place. Les détentrices s'abonnent ici,
 * capturent un instantané de leur rendu puis libèrent le contexte : les
 * vignettes en attente passent à leur tour, et l'instantané reste affiché. */
const demandListeners = new Set<() => void>();
export function subscribeThumbnailDemand(listener: () => void) {
  demandListeners.add(listener);
  return () => {
    demandListeners.delete(listener);
  };
}
function announceDemand() {
  for (const listener of [...demandListeners]) listener();
}

/* ------------------------------------------------------------------ */
/* Cache d'instantanés                                                 */
/* ------------------------------------------------------------------ */
/** Un instantané est une IMAGE du rendu réel de CETTE vignette, indexée par sa
 * clé exacte (référence, capteur de contexte, couple, approche, cadrage). Deux
 * vignettes différentes ne partagent donc jamais une image, et un instantané
 * n'est jamais réutilisé pour une géométrie qu'il ne montre pas. */
const snapshots = new Map<string, string>();
const SNAPSHOT_LIMIT = 64;
export function thumbnailSnapshot(key: string): string | null {
  return snapshots.get(key) ?? null;
}
export function storeThumbnailSnapshot(key: string, dataUrl: string) {
  if (!key || !dataUrl.startsWith("data:image/")) return;
  if (snapshots.size >= SNAPSHOT_LIMIT) snapshots.clear();
  snapshots.set(key, dataUrl);
}
export function clearThumbnailSnapshots() {
  snapshots.clear();
}

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
  announceDemand();
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
    // Réveil différé : on ne met jamais à jour une autre vignette pendant le
    // nettoyage d'effet de celle qui libère sa place.
    queueMicrotask(() => {
      if (next.token.held) next.notify();
    });
    return;
  }
  liveContexts = Math.max(0, liveContexts - 1);
}

/** Uniquement pour les tests : remet le compteur à zéro. */
export function resetThumbnailSlots() {
  liveContexts = 0;
  queue.length = 0;
  snapshots.clear();
}
/** Uniquement pour les tests : nombre de contextes réellement comptés. */
export function liveThumbnailContexts() {
  return liveContexts;
}
/** Uniquement pour les tests : nombre de vignettes en file d'attente. */
export function queuedThumbnailSlots() {
  return queue.length;
}

/** Three rend EXCLUSIVEMENT en WebGL2 : sonder « webgl » ferait croire à un
 * rendu possible sur un appareil qui n'a que WebGL1. La sonde libère son
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

/** Uniquement pour les tests : force le résultat de la sonde WebGL. */
export function setWebGLSupportForTests(value: boolean | null) {
  webglSupport = value;
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Attribue (ou non) un créneau 3D à une vignette selon sa visibilité réelle.
 *
 * - `active` doit être `false` quand l'appelant ne veut de toute façon aucune
 *   3D (mode « vue plane », WebGL absent, contexte déjà perdu) : la vignette
 *   ne demande alors ni observation ni place.
 * - Le créneau se libère dès que la vignette sort de l'écran, et se
 *   redemande si elle revient : la place va toujours à ce qui est visible.
 */
export function useWebglSlot(active: boolean) {
  const host = useRef<HTMLElement | null>(null);
  const [inView, setInView] = useState(false);
  const [slot, setSlot] = useState(false);
  const [reduced, setReduced] = useState(true);

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
    if (!active || !inView) return;
    const token = acquireThumbnailSlot(claim);
    if (token.held) setSlot(true);
    return () => {
      // On rend le JETON, pas une valeur figée : si une place nous a été
      // transmise entre-temps, elle est bien restituée.
      releaseThumbnailSlot(token);
      setSlot(false);
    };
  }, [active, inView, claim]);

  // Pression : d'autres vignettes visibles attendent une place. La détentrice
  // s'en sert pour figer son rendu et rendre son contexte, au lieu de garder
  // une place pendant qu'une carte visible reste en 2D.
  const [crowded, setCrowded] = useState(false);
  useEffect(() => {
    const read = () => setCrowded(queuedThumbnailSlots() > 0);
    read();
    return subscribeThumbnailDemand(read);
  }, []);

  return { host, inView, hasSlot: active && inView && slot, reduced, crowded };
}
