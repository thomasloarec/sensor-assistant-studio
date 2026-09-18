/** Annuaire des données de détection — modèle et contrôles partagés.
 *
 *  Ce module décrit UNE seule chose : de vraies distances de commutation
 *  (activation « pull-in » et relâchement « drop-out ») mesurées ou publiées
 *  par l'ingénierie Standex, pour une combinaison EXACTE.
 *
 *  Ce qu'il ne fait pas, et ne doit jamais faire :
 *   - lire, convertir ou trier les plages « up / to » du guide d'activation :
 *     ce sont des plages documentaires, pas des seuils ;
 *   - remplacer une valeur inconnue par zéro ou par une valeur voisine ;
 *   - transférer une ligne d'une famille, d'une variante ou d'un aimant à un
 *     autre : la clé métier comprend famille, classe ou modèle de contact,
 *     forme de contact, aimant et approche.
 *
 *  Les mêmes contrôles servent à l'écran d'administration et sont rejoués côté
 *  serveur par la migration 1.9 : l'interface ne fait jamais autorité.
 */
import {
  SENSOR_CATALOG,
  CUSTOM_SENSOR_ID,
  type SensorModel,
} from "@/lib/standex/sensor-catalog";
import { BARE_MAGNETS, PACKAGED_MAGNET_IDS } from "@/lib/standex/magnet-catalog";
import type {
  PublishedApproach,
  PublishedClassKind,
  PublishedDatum,
  PublishedRow,
  PublishedThresholdKind,
} from "@/lib/standex/magnetics/registries";

/** Capteur pédagogique de démonstration : hors annuaire, ce n'est pas un produit. */
export const DEMO_SENSOR_ID = "GENERIC";

export const DETECTION_APPROACHES: readonly PublishedApproach[] = [
  "D1",
  "D2",
  "D3",
  "D4",
  "D5",
  "F1",
];
export const DETECTION_CONTACT_FORMS = ["1A", "1B", "1C"] as const;
export const DETECTION_CLASS_KINDS: readonly PublishedClassKind[] = [
  "sensitivity",
  "switch_model",
];
export const DETECTION_THRESHOLD_KINDS: readonly PublishedThresholdKind[] = [
  "typical",
  "min_activation_max_release",
];

/** Le datum dépend de l'approche : frontal pour F1, latéral sinon. */
export function datumForApproach(approach: PublishedApproach): PublishedDatum {
  return approach === "F1" ? "frontal_faces" : "lateral_surface";
}

/** Références réelles du catalogue : ni démonstration, ni « sur mesure », ni
 *  aimant en boîtier présenté comme capteur. */
export function realSensors(): SensorModel[] {
  return SENSOR_CATALOG.filter(
    (s) => s.id !== DEMO_SENSOR_ID && s.id !== CUSTOM_SENSOR_ID && s.magnet !== true,
  );
}
export const isRealSensorId = (id: string) => realSensors().some((s) => s.id === id);

/** Aimants connus : boîtiers documentés puis aimants nus du catalogue. */
export function knownMagnetIds(): string[] {
  return [...PACKAGED_MAGNET_IDS, ...BARE_MAGNETS.map((m) => m.id)];
}
export const isKnownMagnetId = (id: string) => knownMagnetIds().includes(id);

export type DetectionStatus = "draft" | "validated";

/** Une ligne de l'annuaire, telle que le serveur la renvoie. */
export interface DetectionRecord {
  id: string | null;
  sensorFamily: string;
  sensorReference: string;
  classKind: PublishedClassKind;
  sensitivityClass: string;
  contactForm: (typeof DETECTION_CONTACT_FORMS)[number];
  magnetId: string;
  approachId: PublishedApproach;
  datum: PublishedDatum;
  thresholdKind: PublishedThresholdKind;
  /** Millimètres. `null` = inconnu. Jamais zéro par défaut. */
  pullInMm: number | null;
  dropOutMm: number | null;
  temperatureC: number | null;
  status: DetectionStatus;
  sourceType: string;
  sourceRef: string;
  enteredOn: string;
  note: string | null;
  rowVersion: number | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

/** Origine d'une ligne affichée dans l'annuaire. */
export type DetectionOrigin = "compiled" | "saved" | "missing";

export function detectionKey(r: {
  sensorFamily: string;
  sensitivityClass: string;
  contactForm: string;
  magnetId: string;
  approachId: string;
}): string {
  return [r.sensorFamily, r.sensitivityClass, r.contactForm, r.magnetId, r.approachId].join("/");
}

/** Une ligne compilée du registre, relue comme entrée d'annuaire. */
export function recordFromPublished(row: PublishedRow): DetectionRecord {
  return {
    id: row.id,
    sensorFamily: row.sensorFamily,
    sensorReference: row.sensorReference,
    classKind: row.classKind,
    sensitivityClass: row.sensitivityClass,
    contactForm: row.contactForm,
    magnetId: row.magnetId,
    approachId: row.approachId,
    datum: row.datum,
    thresholdKind: row.thresholdKind,
    pullInMm: row.pullInMm,
    dropOutMm: row.dropOutMm,
    temperatureC: row.temperatureC,
    status: "validated",
    sourceType: row.provenance.sourceType,
    sourceRef: row.provenance.sourceRef,
    enteredOn: row.provenance.enteredOn,
    note: null,
    rowVersion: null,
    updatedAt: null,
    updatedBy: null,
  };
}

/** Une ligne validée de l'annuaire, relue comme ligne de registre. */
export function publishedFromRecord(r: DetectionRecord): PublishedRow | null {
  if (r.status !== "validated" || r.pullInMm === null || r.dropOutMm === null) return null;
  return {
    id: r.id ?? detectionKey(r),
    sensorFamily: r.sensorFamily,
    sensorReference: r.sensorReference,
    sensitivityClass: r.sensitivityClass,
    classKind: r.classKind,
    contactForm: r.contactForm,
    magnetId: r.magnetId,
    approachId: r.approachId,
    datum: r.datum,
    thresholdKind: r.thresholdKind,
    pullInMm: r.pullInMm,
    dropOutMm: r.dropOutMm,
    temperatureC: r.temperatureC,
    provenance: {
      registryId: "detection_directory_1.9",
      sourceType: r.sourceType,
      sourceRef: r.sourceRef,
      enteredOn: r.enteredOn,
      fields: ["pullInMm", "dropOutMm"],
    },
  };
}

/** Virgule décimale acceptée ; une valeur vide reste INCONNUE, pas zéro. */
export function parseDecimal(raw: string): number | null | "invalid" {
  const s = raw.trim().replace(",", ".");
  if (s === "") return null;
  if (!/^-?\d+(\.\d+)?$/.test(s)) return "invalid";
  const n = Number(s);
  return Number.isFinite(n) ? n : "invalid";
}

export type DetectionFieldErrors = Partial<
  Record<
    | "sensorFamily"
    | "sensorReference"
    | "sensitivityClass"
    | "magnetId"
    | "approachId"
    | "datum"
    | "pullInMm"
    | "dropOutMm"
    | "temperatureC"
    | "sourceType"
    | "sourceRef"
    | "enteredOn"
    | "status",
    string
  >
>;

/** Contrôles identiques à ceux du serveur. Un brouillon a le droit d'être
 *  incomplet ; il n'est alors jamais servi aux simulations. */
export function validateDetectionRecord(
  r: DetectionRecord,
  others: readonly DetectionRecord[] = [],
): DetectionFieldErrors {
  const e: DetectionFieldErrors = {};
  if (!isRealSensorId(r.sensorFamily)) e.sensorFamily = "Référence catalogue inconnue";
  if (r.sensorReference.trim().length < 1) e.sensorReference = "Référence imprimée requise";
  if (r.sensitivityClass.trim().length < 1) e.sensitivityClass = "Classe ou modèle requis";
  if (!isKnownMagnetId(r.magnetId)) e.magnetId = "Aimant inconnu du catalogue";
  if (!DETECTION_APPROACHES.includes(r.approachId)) e.approachId = "Approche inconnue";
  if (r.datum !== datumForApproach(r.approachId)) e.datum = "Datum incompatible avec l'approche";
  if (r.pullInMm !== null && !(Number.isFinite(r.pullInMm) && r.pullInMm > 0))
    e.pullInMm = "Distance finie et strictement positive";
  if (r.dropOutMm !== null && !(Number.isFinite(r.dropOutMm) && r.dropOutMm > 0))
    e.dropOutMm = "Distance finie et strictement positive";
  if (
    r.pullInMm !== null &&
    r.dropOutMm !== null &&
    Number.isFinite(r.pullInMm) &&
    Number.isFinite(r.dropOutMm) &&
    r.dropOutMm <= r.pullInMm
  )
    e.dropOutMm = "Le relâchement est plus loin que l'activation";
  if (r.temperatureC !== null && !Number.isFinite(r.temperatureC))
    e.temperatureC = "Température non finie";
  if (r.sourceType.trim().length < 2) e.sourceType = "Nature de la source requise";
  if (r.sourceRef.trim().length < 8) e.sourceRef = "Source précise requise (fiche, page, essai)";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.enteredOn)) e.enteredOn = "Date au format AAAA-MM-JJ";
  if (r.status === "validated" && (r.pullInMm === null || r.dropOutMm === null))
    e.status = "Une ligne validée porte deux distances";
  const key = detectionKey(r);
  if (others.some((o) => o !== r && detectionKey(o) === key))
    e.sensitivityClass = "Cette combinaison existe déjà";
  return e;
}

export const hasErrors = (e: DetectionFieldErrors) => Object.keys(e).length > 0;

/** Combinaison non modélisable : le contact du capteur n'est pas supporté par
 *  le moteur. On le dit, on ne le maquille pas. */
export function isSimulatable(sensorId: string): boolean {
  const s = realSensors().find((x) => x.id === sensorId);
  return s?.contact === "A";
}
