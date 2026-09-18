/** Construction de l'annuaire affiché : jeu compilé, saisies serveur, et
 *  références réelles ENCORE SANS DONNÉE.
 *
 *  Deux natures de données coexistent et ne sont JAMAIS mélangées :
 *   - `distances` : vraies distances de commutation (activation / relâchement) ;
 *   - `guide` : plages documentaires « up / to » de la brochure, qui ne sont pas
 *     des seuils, ne sont jamais triées ni converties.
 *
 *  Une référence du catalogue sans aucune ligne n'est pas cachée : elle apparaît
 *  avec l'état « à compléter », pour que l'ingénierie puisse la renseigner. Une
 *  ligne absente n'est jamais comblée par une valeur voisine.
 */
import { COMPILED_PUBLISHED_REGISTRY } from "@/lib/standex/magnetics/registries";
import { COMPILED_ACTIVATION_GUIDE, guideShapeAllowed } from "@/lib/standex/activation-guide";
import { isShapeIncompatible } from "@/lib/standex/shape-compatibility";
import {
  detectionKey,
  guideRecordKey,
  isRecordSimulatable,
  realSensors,
  recordFromGuideRange,
  recordFromPublished,
  type DetectionOrigin,
  type DetectionRecord,
  type GuideRecord,
} from "./model";

/** Nature de la donnée : la distinction est structurelle, pas cosmétique. */
export type DetectionDataset = "distances" | "guide";

export interface DirectoryEntry {
  key: string;
  dataset: "distances";
  record: DetectionRecord;
  /** `compiled` : jeu livré ; `saved` : saisie serveur ; `missing` : à créer. */
  origin: DetectionOrigin;
  /** Vraies distances de commutation présentes et ordonnées. */
  complete: boolean;
  /** Le moteur ne sait pas simuler cette LIGNE : dit tel quel, jamais masqué. */
  simulatable: boolean;
  /** Ligne réellement servie aux simulations à cet instant. */
  active: boolean;
  /**
   * Couple écarté par la règle de compatibilité de FORME de l'application
   * (capteur tubulaire ↔ aimant tubulaire, sinon bloc). La ligne reste lisible
   * et traçable, sa valeur n'est ni modifiée ni transférée, mais elle n'est
   * jamais active ni simulée.
   */
  excluded: boolean;
  /**
   * Brouillon proposé PAR-DESSUS une ligne livrée toujours active : l'annuaire
   * doit distinguer la valeur de référence en vigueur et la proposition en
   * cours. Un brouillon ne retire jamais la ligne livrée.
   */
  baseline: DetectionRecord | null;
}

export interface GuideDirectoryEntry {
  key: string;
  dataset: "guide";
  record: GuideRecord;
  origin: DetectionOrigin;
  /** Au moins une borne imprimée ou une mention « non publié ». */
  complete: boolean;
  /** Ordre imprimé atypique : conservé tel quel, signalé, jamais trié. */
  atypical: boolean;
  active: boolean;
  /** Couple écarté par la règle de forme : plage lisible, jamais démonstrable. */
  excluded: boolean;
  baseline: GuideRecord | null;
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
  r.pullInMm !== null &&
  r.dropOutMm !== null &&
  r.dropOutMm > r.pullInMm &&
  r.status === "validated";

/**
 * @param saved lignes réellement enregistrées côté serveur (brouillons compris)
 */
export function buildDirectory(saved: readonly DetectionRecord[]): DirectoryEntry[] {
  const entries = new Map<string, DirectoryEntry>();
  const compiled = new Map<string, DetectionRecord>();
  for (const row of COMPILED_PUBLISHED_REGISTRY.rows) {
    const record = recordFromPublished(row);
    const key = detectionKey(record);
    const excluded = isShapeIncompatible(record.sensorFamily, record.magnetId);
    compiled.set(key, record);
    entries.set(key, {
      key,
      dataset: "distances",
      record,
      origin: "compiled",
      complete: isComplete(record),
      simulatable: isRecordSimulatable(record),
      // Une ligne livrée dont les formes se contredisent n'est plus servie aux
      // moteurs : elle reste affichée, avec sa valeur d'origine, marquée exclue.
      active: !excluded,
      excluded,
      baseline: null,
    });
  }
  for (const record of saved) {
    const key = detectionKey(record);
    const base = compiled.get(key) ?? null;
    const complete = isComplete(record);
    const excluded = isShapeIncompatible(record.sensorFamily, record.magnetId);
    entries.set(key, {
      key,
      dataset: "distances",
      record,
      origin: "saved",
      complete,
      simulatable: isRecordSimulatable(record),
      // Une saisie complète et validée est servie ; un brouillon ne l'est pas,
      // et alors la ligne livrée de la MÊME combinaison reste en vigueur —
      // sauf si cette ligne livrée est elle-même exclue par la règle de forme :
      // dans ce cas aucune valeur n'est active et il ne faut rien présenter
      // comme « reste en vigueur ».
      active: complete && !excluded,
      excluded,
      baseline:
        complete && !excluded
          ? null
          : base && !isShapeIncompatible(base.sensorFamily, base.magnetId)
            ? base
            : null,
    });
  }
  // Références réelles jamais documentées : visibles, à compléter.
  for (const sensor of realSensors()) {
    const seen = [...entries.values()].some((e) => e.record.sensorFamily === sensor.id);
    if (seen) continue;
    const record = emptyRecordFor(sensor.id, sensor.documentedAs ?? sensor.name);
    entries.set("missing/" + sensor.id, {
      key: "missing/" + sensor.id,
      dataset: "distances",
      record,
      origin: "missing",
      complete: false,
      simulatable: isRecordSimulatable(record),
      active: false,
      excluded: false,
      baseline: null,
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

const guideComplete = (r: GuideRecord) =>
  r.status === "validated" &&
  (r.upMm !== null || r.toMm !== null || r.upNote !== null || r.toNote !== null);
const guideAtypical = (r: GuideRecord) => r.upMm !== null && r.toMm !== null && r.upMm > r.toMm;

/** Annuaire du guide : lignes imprimées de la brochure, puis corrections. */
export function buildGuideDirectory(saved: readonly GuideRecord[]): GuideDirectoryEntry[] {
  const entries = new Map<string, GuideDirectoryEntry>();
  const compiled = new Map<string, GuideRecord>();
  for (const row of COMPILED_ACTIVATION_GUIDE.rows) {
    const record = recordFromGuideRange(row);
    const key = guideRecordKey(record);
    compiled.set(key, record);
    entries.set(key, {
      key,
      dataset: "guide",
      record,
      origin: "compiled",
      complete: guideComplete(record),
      atypical: guideAtypical(record),
      active: true,
      /* La plage imprimée reste DOCUMENTAIRE et visible même quand les formes se
         contredisent : seule la démonstration illustrative lui est interdite. */
      excluded: !guideShapeAllowed(record.sensorFamily, record.magnetId),
      baseline: null,
    });
  }
  for (const record of saved) {
    const key = guideRecordKey(record);
    const base = compiled.get(key) ?? null;
    const complete = guideComplete(record);
    entries.set(key, {
      key,
      dataset: "guide",
      record,
      origin: "saved",
      complete,
      atypical: guideAtypical(record),
      excluded: !guideShapeAllowed(record.sensorFamily, record.magnetId),
      active: complete,
      // Même honnêteté que pour les distances : une plage livrée dont les
      // formes sont incompatibles n'est jamais présentée comme « en vigueur ».
      baseline:
        complete
          ? null
          : base && guideShapeAllowed(base.sensorFamily, base.magnetId)
            ? base
            : null,
    });
  }
  return [...entries.values()].sort(
    (a, b) =>
      a.record.sensorFamily.localeCompare(b.record.sensorFamily) ||
      a.record.sensorReference.localeCompare(b.record.sensorReference) ||
      a.record.magnetId.localeCompare(b.record.magnetId) ||
      a.record.approachId.localeCompare(b.record.approachId),
  );
}

export interface DirectoryFilters {
  search: string;
  /** Nature de la donnée affichée. */
  dataset: DetectionDataset;
  family: string;
  magnet: string;
  approach: string;
  origin: string;
  completeness: string;
}

export const EMPTY_FILTERS: DirectoryFilters = {
  search: "",
  dataset: "distances",
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
    // Couples écartés par la règle de forme : consultables à part, jamais actifs.
    if (f.completeness === "excluded" && !e.excluded) return false;
    return true;
  });
}

export function filterGuideDirectory(
  entries: readonly GuideDirectoryEntry[],
  f: DirectoryFilters,
): GuideDirectoryEntry[] {
  const q = f.search.trim().toLowerCase();
  return entries.filter((e) => {
    const r = e.record;
    if (q !== "") {
      const hay = [r.sensorFamily, r.sensorReference, r.magnetId].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (f.family !== "all" && r.sensorFamily !== f.family) return false;
    if (f.magnet !== "all" && r.magnetId !== f.magnet) return false;
    if (f.approach !== "all" && r.approachId !== f.approach) return false;
    if (f.origin !== "all" && e.origin !== f.origin) return false;
    if (f.completeness === "complete" && !e.complete) return false;
    if (f.completeness === "incomplete" && e.complete) return false;
    // Couples écartés par la règle de forme : consultables à part, jamais actifs.
    if (f.completeness === "excluded" && !e.excluded) return false;
    return true;
  });
}
