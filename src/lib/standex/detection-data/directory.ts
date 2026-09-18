/** Construction de l'annuaire affiché : jeu compilé, saisies serveur, et
 *  références réelles ENCORE SANS DONNÉE.
 *
 *  Une référence du catalogue sans aucune ligne n'est pas cachée : elle apparaît
 *  avec l'état « à compléter », pour que l'ingénierie puisse la renseigner. Une
 *  ligne absente n'est jamais comblée par une valeur voisine.
 */
import { COMPILED_PUBLISHED_REGISTRY } from "@/lib/standex/magnetics/registries";
import {
  detectionKey,
  realSensors,
  recordFromPublished,
  isSimulatable,
  type DetectionOrigin,
  type DetectionRecord,
} from "./model";

export interface DirectoryEntry {
  key: string;
  record: DetectionRecord;
  /** `compiled` : jeu livré ; `saved` : saisie serveur ; `missing` : à créer. */
  origin: DetectionOrigin;
  /** Vraies distances de commutation présentes et ordonnées. */
  complete: boolean;
  /** Le moteur ne sait pas simuler ce contact : dit tel quel, jamais masqué. */
  simulatable: boolean;
}

/** Ligne vide proposée pour une référence sans aucune donnée. */
export function emptyRecordFor(sensorFamily: string, sensorReference: string): DetectionRecord {
  return {
    id: null,
    sensorFamily,
    sensorReference,
    classKind: "sensitivity",
    sensitivityClass: "",
    contactForm: "1A",
    magnetId: "",
    approachId: "D1",
    datum: "lateral_surface",
    thresholdKind: "typical",
    pullInMm: null,
    dropOutMm: null,
    temperatureC: null,
    status: "draft",
    sourceType: "",
    sourceRef: "",
    enteredOn: new Date().toISOString().slice(0, 10),
    note: null,
    rowVersion: null,
    updatedAt: null,
    updatedBy: null,
  };
}

const isComplete = (r: DetectionRecord) =>
  r.pullInMm !== null && r.dropOutMm !== null && r.dropOutMm > r.pullInMm && r.status === "validated";

/**
 * @param saved lignes réellement enregistrées côté serveur (brouillons compris)
 */
export function buildDirectory(saved: readonly DetectionRecord[]): DirectoryEntry[] {
  const entries = new Map<string, DirectoryEntry>();
  for (const row of COMPILED_PUBLISHED_REGISTRY.rows) {
    const record = recordFromPublished(row);
    const key = detectionKey(record);
    entries.set(key, {
      key,
      record,
      origin: "compiled",
      complete: isComplete(record),
      simulatable: isSimulatable(record.sensorFamily),
    });
  }
  for (const record of saved) {
    const key = detectionKey(record);
    entries.set(key, {
      key,
      record,
      origin: "saved",
      complete: isComplete(record),
      simulatable: isSimulatable(record.sensorFamily),
    });
  }
  // Références réelles jamais documentées : visibles, à compléter.
  for (const sensor of realSensors()) {
    const seen = [...entries.values()].some((e) => e.record.sensorFamily === sensor.id);
    if (seen) continue;
    const record = emptyRecordFor(sensor.id, sensor.documentedAs ?? sensor.name);
    entries.set("missing/" + sensor.id, {
      key: "missing/" + sensor.id,
      record,
      origin: "missing",
      complete: false,
      simulatable: isSimulatable(sensor.id),
    });
  }
  return [...entries.values()].sort(
    (a, b) =>
      a.record.sensorFamily.localeCompare(b.record.sensorFamily) ||
      a.record.sensitivityClass.localeCompare(b.record.sensitivityClass) ||
      a.record.magnetId.localeCompare(b.record.magnetId) ||
      a.record.approachId.localeCompare(b.record.approachId),
  );
}

export interface DirectoryFilters {
  search: string;
  family: string;
  magnet: string;
  approach: string;
  origin: string;
  completeness: string;
}

export const EMPTY_FILTERS: DirectoryFilters = {
  search: "",
  family: "all",
  magnet: "all",
  approach: "all",
  origin: "all",
  completeness: "all",
};

export function filterDirectory(
  entries: readonly DirectoryEntry[],
  f: DirectoryFilters,
): DirectoryEntry[] {
  const q = f.search.trim().toLowerCase();
  return entries.filter((e) => {
    const r = e.record;
    if (q !== "") {
      const hay = [r.sensorFamily, r.sensorReference, r.magnetId, r.sensitivityClass]
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (f.family !== "all" && r.sensorFamily !== f.family) return false;
    if (f.magnet !== "all" && r.magnetId !== f.magnet) return false;
    if (f.approach !== "all" && r.approachId !== f.approach) return false;
    if (f.origin !== "all" && e.origin !== f.origin) return false;
    if (f.completeness === "complete" && !e.complete) return false;
    if (f.completeness === "incomplete" && e.complete) return false;
    return true;
  });
}
