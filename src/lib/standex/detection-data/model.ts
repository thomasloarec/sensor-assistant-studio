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
import {
  effectiveActivationGuide,
  type GuideRange,
} from "@/lib/standex/activation-guide";
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
  if (
    r.sensorReference.trim().length < 1 ||
    r.sensorReference.length > DETECTION_LIMITS.sensorReference
  )
    e.sensorReference = "Référence imprimée requise";
  if (
    r.sensitivityClass.trim().length < 1 ||
    r.sensitivityClass.length > DETECTION_LIMITS.sensitivityClass
  )
    e.sensitivityClass = "Classe ou modèle requis";
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
  if (r.sourceType.trim().length < 2 || r.sourceType.length > DETECTION_LIMITS.sourceType)
    e.sourceType = "Nature de la source requise";
  if (r.sourceRef.trim().length < 8 || r.sourceRef.length > DETECTION_LIMITS.sourceRef)
    e.sourceRef = "Source précise requise (fiche, page, essai)";
  if (!isRealDate(r.enteredOn)) e.enteredOn = "Date au format AAAA-MM-JJ";
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

/* ==========================================================================
 * Contrôles partagés supplémentaires
 * ======================================================================== */

/** Longueurs maximales, IDENTIQUES à celles de la migration 1.9. */
export const DETECTION_LIMITS = {
  sensorReference: 64,
  sensitivityClass: 32,
  sourceType: 64,
  sourceRef: 300,
  note: 2000,
} as const;

/** Date réellement existante, pas seulement au bon format, et jamais future. */
export function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  if (m < 1 || m > 12 || d < 1) return false;
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d &&
    y >= 1970
  );
}

/** Approches réellement DESSINÉES par le moteur de pose. D2, D4 et D5 restent
 *  documentaires : elles peuvent être saisies et consultées, jamais présentées
 *  comme une scène calculée. */
export const DRAWN_APPROACHES: readonly PublishedApproach[] = ["D1", "D3", "F1"];

/**
 * Une LIGNE est-elle réellement exploitable par le moteur ? On regarde la forme
 * de contact DE LA LIGNE (un même capteur peut être publié en 1A, 1B ou 1C) et
 * la géométrie disponible pour l'approche, pas seulement la fiche catalogue.
 */
export function isRecordSimulatable(r: {
  contactForm: string;
  approachId: PublishedApproach;
}): boolean {
  return r.contactForm === "1A" && DRAWN_APPROACHES.includes(r.approachId);
}

/* ==========================================================================
 * Guide d'activation — jeu DOCUMENTAIRE, natures strictement distinctes
 *
 * Les colonnes « up » et « to » de la brochure ne sont PAS une activation et un
 * relâchement. Elles ne sont ni triées, ni converties, ni comparées à un seuil.
 * Un ordre imprimé atypique (« up » supérieur à « to ») est conservé tel quel et
 * signalé. La validation ci-dessous est donc VOLONTAIREMENT différente de celle
 * des distances de commutation : aucune contrainte d'ordre.
 * ======================================================================== */

export const GUIDE_APPROACHES = ["D1", "D2", "D3", "D4", "D5"] as const;
export type GuideApproachId = (typeof GUIDE_APPROACHES)[number];
export const GUIDE_BOUND_NOTES = ["not_published", "below_zero"] as const;

export interface GuideRecord {
  id: string | null;
  page: number | null;
  sensorFamily: string;
  /** Référence telle qu'IMPRIMÉE dans la brochure (« MK15-B-X »). */
  sensorReference: string;
  magnetId: string;
  approachId: GuideApproachId;
  /** Colonne « up », en mm. `null` = non publiée. */
  upMm: number | null;
  /** Colonne « to », en mm. `null` = non publiée. Peut être inférieure à « up ». */
  toMm: number | null;
  upNote: (typeof GUIDE_BOUND_NOTES)[number] | null;
  toNote: (typeof GUIDE_BOUND_NOTES)[number] | null;
  status: DetectionStatus;
  sourceRef: string;
  enteredOn: string;
  note: string | null;
  rowVersion: number | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

export type GuideFieldErrors = Partial<
  Record<
    | "page"
    | "sensorFamily"
    | "sensorReference"
    | "magnetId"
    | "approachId"
    | "upMm"
    | "toMm"
    | "sourceRef"
    | "enteredOn"
    | "status",
    string
  >
>;

export function guideRecordKey(r: {
  sensorReference: string;
  magnetId: string;
  approachId: string;
}): string {
  return [r.sensorReference, r.magnetId, r.approachId].join("|");
}

/** Familles acceptées pour le guide : celles de la brochure ET celles du
 *  catalogue. La brochure documente des familles absentes du site (MK06-5 à
 *  MK06-8, MK07, MK12) : les écarter serait perdre de la donnée réelle. */
export function guideKnownFamilies(): string[] {
  const guide = effectiveActivationGuide();
  return [
    ...new Set([...guide.rows.map((r) => r.sensorFamily), ...realSensors().map((s) => s.id)]),
  ].sort();
}
export function guideKnownMagnetIds(): string[] {
  return effectiveActivationGuide().magnets.map((m) => m.id);
}

export function recordFromGuideRange(row: GuideRange): GuideRecord {
  return {
    id: guideRecordKey(row),
    page: row.page,
    sensorFamily: row.sensorFamily,
    sensorReference: row.sensorReference,
    magnetId: row.magnetId,
    approachId: row.approachId as GuideApproachId,
    upMm: row.upMm,
    toMm: row.toMm,
    upNote: row.upNote ?? null,
    toNote: row.toNote ?? null,
    status: "validated",
    sourceRef: effectiveActivationGuide().source.title + " p. " + row.page,
    enteredOn: "2025-10-01",
    note: null,
    rowVersion: null,
    updatedAt: null,
    updatedBy: null,
  };
}

/** Un brouillon n'alimente JAMAIS une lecture de guide. */
export function guideRangeFromRecord(r: GuideRecord): GuideRange | null {
  if (r.status !== "validated" || r.page === null) return null;
  if (r.upMm === null && r.toMm === null && r.upNote === null && r.toNote === null) return null;
  return {
    page: r.page,
    sensorFamily: r.sensorFamily,
    sensorReference: r.sensorReference,
    magnetId: r.magnetId,
    approachId: r.approachId,
    upMm: r.upMm,
    toMm: r.toMm,
    ...(r.upNote === null ? {} : { upNote: r.upNote }),
    ...(r.toNote === null ? {} : { toNote: r.toNote }),
    // `orderAtypical` n'est PAS recopié : la lecture défensive le recalcule à
    // partir des bornes réellement enregistrées, sans jamais les réordonner.
  };
}

export function validateGuideRecord(
  r: GuideRecord,
  others: readonly GuideRecord[] = [],
): GuideFieldErrors {
  const e: GuideFieldErrors = {};
  if (r.page === null || !Number.isFinite(r.page) || r.page < 1 || r.page > 400)
    e.page = "Page de la brochure requise";
  if (!guideKnownFamilies().includes(r.sensorFamily)) e.sensorFamily = "Famille inconnue du guide";
  if (
    r.sensorReference.trim().length < 1 ||
    r.sensorReference.length > DETECTION_LIMITS.sensorReference
  )
    e.sensorReference = "Référence imprimée requise";
  if (!guideKnownMagnetIds().includes(r.magnetId)) e.magnetId = "Aimant inconnu du guide";
  if (!(GUIDE_APPROACHES as readonly string[]).includes(r.approachId))
    e.approachId = "Approche du guide inconnue (D1 à D5)";
  // Aucune contrainte d'ORDRE : « up » peut dépasser « to ». Seules les valeurs
  // non finies ou négatives sont refusées, jamais réparées.
  if (r.upMm !== null && !(Number.isFinite(r.upMm) && r.upMm >= 0))
    e.upMm = "Borne finie et non négative, ou vide";
  if (r.toMm !== null && !(Number.isFinite(r.toMm) && r.toMm >= 0))
    e.toMm = "Borne finie et non négative, ou vide";
  if (r.sourceRef.trim().length < 8 || r.sourceRef.length > DETECTION_LIMITS.sourceRef)
    e.sourceRef = "Source précise requise (brochure, page)";
  if (!isRealDate(r.enteredOn)) e.enteredOn = "Date au format AAAA-MM-JJ";
  if (r.status === "validated" && r.upMm === null && r.toMm === null && r.upNote === null && r.toNote === null)
    e.status = "Une ligne validée porte au moins une borne ou une mention « non publié »";
  const key = guideRecordKey(r);
  if (others.some((o) => o !== r && guideRecordKey(o) === key))
    e.sensorReference = "Cette ligne du guide existe déjà";
  return e;
}

export const hasGuideErrors = (e: GuideFieldErrors) => Object.keys(e).length > 0;

export function emptyGuideRecord(): GuideRecord {
  return {
    id: null,
    page: null,
    sensorFamily: "",
    sensorReference: "",
    magnetId: "",
    approachId: "D1",
    upMm: null,
    toMm: null,
    upNote: null,
    toNote: null,
    status: "draft",
    sourceRef: "",
    enteredOn: new Date().toISOString().slice(0, 10),
    note: null,
    rowVersion: null,
    updatedAt: null,
    updatedBy: null,
  };
}
