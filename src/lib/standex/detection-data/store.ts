/** Source UNIQUE des données de détection effectives, côté application.
 *
 *  Un seul magasin, une seule révision. Toute simulation montée qui dépend du
 *  registre s'abonne à cette révision : une ligne enregistrée par
 *  l'administration provoque donc un recalcul RÉEL, sans rechargement de page
 *  et sans cache de module figé.
 *
 *  Honnêteté du chargement : tant que le serveur n'a pas répondu, l'état reste
 *  « chargement » et le jeu COMPILÉ est servi tel quel. Si la migration n'est
 *  pas appliquée, l'état devient « non activé » : on ne prétend jamais avoir
 *  des données serveur.
 */
import { useSyncExternalStore } from "react";
import {
  applyEffectivePublishedRows,
  publishedRegistryRevision,
  resetEffectivePublishedRows,
  effectiveRegistrySource,
} from "@/lib/standex/magnetics/registries";
import { publishedFromRecord, type DetectionRecord } from "./model";
import { fetchEffectiveDetectionRows, isMissingDetectionRpc } from "./adapter";

export type DetectionLoadState = "idle" | "loading" | "ready" | "unavailable" | "error";

interface StoreState {
  state: DetectionLoadState;
  /** Version du jeu serveur réellement appliqué, si applicable. */
  serverVersion: string | null;
  savedRows: number;
  error: string | null;
}

let state: StoreState = { state: "idle", serverVersion: null, savedRows: 0, error: null };
const listeners = new Set<() => void>();
let snapshot = { ...state, revision: publishedRegistryRevision() };

function emit() {
  snapshot = { ...state, revision: publishedRegistryRevision() };
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
 *  qui lit le registre. */
export function useDetectionDataRevision(): number {
  return useSyncExternalStore(subscribe, () => snapshot.revision, () => snapshot.revision);
}

export function useDetectionDataStatus() {
  return useSyncExternalStore(subscribe, detectionDataSnapshot, detectionDataSnapshot);
}

let inFlight: Promise<void> | null = null;

/** Applique un jeu de lignes déjà lues (serveur, ou test). Refus entier si une
 *  ligne est invalide : mieux vaut le jeu compilé qu'un jeu douteux. */
export function applyDetectionRecords(rows: readonly DetectionRecord[]): boolean {
  const published = rows
    .map(publishedFromRecord)
    .filter((r): r is NonNullable<ReturnType<typeof publishedFromRecord>> => r !== null);
  const result = applyEffectivePublishedRows(published);
  if (!result.ok) {
    state = { ...state, state: "error", error: result.error };
    emit();
    return false;
  }
  state = { state: "ready", serverVersion: state.serverVersion, savedRows: published.length, error: null };
  emit();
  return true;
}

/** Charge les données effectives une seule fois par session (ou sur demande). */
export function loadDetectionData(force = false): Promise<void> {
  if (inFlight && !force) return inFlight;
  if (!force && state.state === "ready") return Promise.resolve();
  state = { ...state, state: "loading", error: null };
  emit();
  inFlight = fetchEffectiveDetectionRows()
    .then((payload) => {
      state = { ...state, serverVersion: payload.version };
      applyDetectionRecords(payload.rows);
    })
    .catch((error: unknown) => {
      state = {
        state: isMissingDetectionRpc(error) ? "unavailable" : "error",
        serverVersion: null,
        savedRows: 0,
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
  resetEffectivePublishedRows();
  state = { state: "idle", serverVersion: null, savedRows: 0, error: null };
  emit();
}

export const detectionDataSource = effectiveRegistrySource;
