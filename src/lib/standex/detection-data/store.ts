/** Source UNIQUE des données effectives (distances de commutation ET plages
 *  documentaires du guide), côté application.
 *
 *  Un seul magasin, une seule révision. Toute simulation montée qui dépend de
 *  ces données s'abonne à cette révision : une ligne enregistrée par
 *  l'administration provoque donc un recalcul RÉEL, sans rechargement de page et
 *  sans cache de module figé.
 *
 *  Honnêteté du chargement : tant que le serveur n'a pas répondu, l'état reste
 *  « chargement » et le jeu COMPILÉ est servi tel quel. Si la migration n'est
 *  pas appliquée, l'état devient « non activé » : on ne prétend jamais avoir des
 *  données serveur. Une réponse arrivée après une remise à zéro ou un
 *  rechargement forcé est IGNORÉE : elle serait périmée.
 */
import { useSyncExternalStore } from "react";
import {
  applyEffectivePublishedRows,
  publishedRegistryRevision,
  resetEffectivePublishedRows,
  effectiveRegistrySource,
  effectiveRegistryRevisionLabel,
} from "@/lib/standex/magnetics/registries";
import {
  applyEffectiveGuideRows,
  resetEffectiveGuideRows,
  guideRevision,
  effectiveGuideSource,
} from "@/lib/standex/activation-guide";
import { publishedFromRecord, guideRangeFromRecord } from "./model";
import type { DetectionRecord, GuideRecord } from "./model";
import {
  fetchEffectiveDetectionRows,
  fetchEffectiveGuideRows,
  isMissingDetectionRpc,
} from "./adapter";

export type DetectionLoadState = "idle" | "loading" | "ready" | "unavailable" | "error";

interface StoreState {
  state: DetectionLoadState;
  /** Révision déterministe du serveur réellement appliquée, si applicable. */
  serverVersion: string | null;
  /** Lignes de distances réellement retenues (pas les lignes envoyées). */
  savedRows: number;
  /** Lignes de guide réellement retenues. */
  savedGuideRows: number;
  /** Les données en mémoire peuvent être plus anciennes que le serveur. */
  stale: boolean;
  error: string | null;
}

const IDLE: StoreState = {
  state: "idle",
  serverVersion: null,
  savedRows: 0,
  savedGuideRows: 0,
  stale: false,
  error: null,
};

let state: StoreState = IDLE;
const listeners = new Set<() => void>();
/** Génération : incrémentée à chaque remise à zéro ou chargement forcé. Une
 *  réponse dont la génération ne correspond plus est écartée. */
let generation = 0;
let snapshot = {
  ...state,
  revision: publishedRegistryRevision() + guideRevision(),
  revisionLabel: effectiveRegistryRevisionLabel(),
};

function emit() {
  snapshot = {
    ...state,
    revision: publishedRegistryRevision() + guideRevision(),
    revisionLabel: effectiveRegistryRevisionLabel(),
  };
  for (const l of [...listeners]) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function detectionDataSnapshot() {
  return snapshot;
}

/** Révision effective : à mettre dans les dépendances de tout calcul mémoïsé
 *  qui lit le registre ou le guide. */
export function useDetectionDataRevision(): number {
  return useSyncExternalStore(
    subscribe,
    () => snapshot.revision,
    () => snapshot.revision,
  );
}

export function useDetectionDataStatus() {
  return useSyncExternalStore(subscribe, detectionDataSnapshot, detectionDataSnapshot);
}

let inFlight: Promise<void> | null = null;

/**
 * Applique un jeu déjà lu (serveur, ou test). Refus entier si une ligne est
 * invalide : mieux vaut le jeu compilé qu'un jeu douteux. `savedRows` reflète
 * ce qui est RÉELLEMENT retenu — zéro en cas de refus.
 */
export function applyDetectionRecords(
  rows: readonly DetectionRecord[],
  guideRows: readonly GuideRecord[] = [],
  dataRevision?: string | null,
): boolean {
  const published = rows
    .map(publishedFromRecord)
    .filter((r): r is NonNullable<ReturnType<typeof publishedFromRecord>> => r !== null);
  const guide = guideRows
    .map(guideRangeFromRecord)
    .filter((r): r is NonNullable<ReturnType<typeof guideRangeFromRecord>> => r !== null);
  const result = applyEffectivePublishedRows(published, dataRevision ?? null);
  if (!result.ok) {
    state = { ...state, state: "error", savedRows: 0, stale: true, error: result.error };
    emit();
    return false;
  }
  const guideResult = applyEffectiveGuideRows(guide, dataRevision ?? null);
  if (!guideResult.ok) {
    // Les deux jeux vont ensemble : un guide refusé annule aussi les distances,
    // pour ne jamais afficher un demi-jeu serveur.
    resetEffectivePublishedRows();
    state = { ...state, state: "error", savedRows: 0, savedGuideRows: 0, stale: true, error: guideResult.error };
    emit();
    return false;
  }
  state = {
    state: "ready",
    serverVersion: dataRevision ?? state.serverVersion,
    savedRows: published.length,
    savedGuideRows: guide.length,
    stale: false,
    error: null,
  };
  emit();
  return true;
}

/** Charge les données effectives une seule fois par session (ou sur demande). */
export function loadDetectionData(force = false): Promise<void> {
  if (inFlight && !force) return inFlight;
  if (!force && state.state === "ready") return Promise.resolve();
  if (force) generation += 1;
  const mine = generation;
  state = { ...state, state: "loading", error: null };
  emit();
  inFlight = Promise.all([fetchEffectiveDetectionRows(), fetchEffectiveGuideRows()])
    .then(([distances, guide]) => {
      if (mine !== generation) return; // réponse périmée : ignorée
      // Révision serveur réelle des DEUX jeux : une écriture côté guide change la
      // provenance exportée autant qu'une écriture côté distances.
      const revision =
        distances.dataRevision || guide.dataRevision
          ? `${distances.dataRevision ?? "0"}/${guide.dataRevision ?? "0"}`
          : null;
      applyDetectionRecords(distances.rows, guide.rows, revision);
    })
    .catch((error: unknown) => {
      if (mine !== generation) return;
      // Les valeurs déjà appliquées RESTENT en place : on annonce l'échec de la
      // relecture, on ne prétend pas avoir perdu ni rafraîchi les données.
      state = {
        ...state,
        state: isMissingDetectionRpc(error) ? "unavailable" : "error",
        stale: true,
        error: String((error as { message?: string })?.message ?? error),
      };
      emit();
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/** Remise à l'état compilé : changement de compte, déconnexion, tests. */
export function resetDetectionData(): void {
  generation += 1;
  resetEffectivePublishedRows();
  resetEffectiveGuideRows();
  state = { ...IDLE };
  emit();
}

/**
 * Rafraîchissement GARDÉ au retour de l'onglet : un autre administrateur peut
 * avoir enregistré une ligne entre-temps, et une session restée ouverte ne doit
 * pas simuler indéfiniment sur des données périmées. Jamais de scrutation
 * continue : seulement au retour de focus ou de visibilité, et pas plus d'une
 * fois par minute.
 */
const REFRESH_INTERVAL_MS = 60_000;
let lastRefresh = 0;
let watching = false;

export function watchDetectionDataFreshness(): () => void {
  if (typeof window === "undefined" || watching) return () => {};
  watching = true;
  const refresh = () => {
    if (document.visibilityState === "hidden") return;
    if (state.state === "unavailable") return;
    const now = Date.now();
    if (now - lastRefresh < REFRESH_INTERVAL_MS) return;
    lastRefresh = now;
    void loadDetectionData(true);
  };
  window.addEventListener("focus", refresh);
  document.addEventListener("visibilitychange", refresh);
  return () => {
    watching = false;
    window.removeEventListener("focus", refresh);
    document.removeEventListener("visibilitychange", refresh);
  };
}

/** Utilisé par les tests pour reprendre un rafraîchissement immédiatement. */
export function resetDetectionFreshnessClock(): void {
  lastRefresh = 0;
}

export const detectionDataSource = effectiveRegistrySource;
export const guideDataSource = effectiveGuideSource;
