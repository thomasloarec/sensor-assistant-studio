import { housingYawDeg, transverseApproach } from "./housing-pose";
import { BARE_MAGNETS, PACKAGED_MAGNET_IDS } from "./magnet-catalog";
import { pairedMagnetModel } from "./paired-magnets";
import { defaultMagnetFor, normalizedMagnetFor } from "./default-pairs";
import { isShapeIncompatible } from "./shape-compatibility";
/** Magnetic workshop V0.3. Geometry, field illustration and switching are separate.
 * Reference distances are typical published values; education is NOT a product model.
 */
import {
  SENSOR_CATALOG,
  isKnownSensorId,
  sensorById,
  sizeLabel,
  bladeOffsetZ,
  bladeLength,
  MAGNET_REFERENCE,
  CUSTOM_SENSOR_ID,
} from "./sensor-catalog";
import { parseMachine, componentPose, openingAt, rotate } from "./machine-assembly";
import { documentedMagnetAngleDeg } from "./mounting/profiles";
import { workshopGuideRange, GUIDE_SIMULATION_NOTE } from "./workshop-guide";
import { defaultGuideSelection, guideSelectionFor } from "./activation-guide";

import type { MachineAssembly } from "./machine-assembly";
import {
  PUBLISHED_REGISTRY,
  effectivePublishedRegistry,
  publishedPair,
  publishedPairFor,
  publishedClasses,
  publishedApproaches,
  publishedReference,
  publishedSensorReference,
  isPublishedFamilyAlias,
} from "./magnetics/registries";


export type Vec3 = [number, number, number];
export type Contact = "open" | "closed" | "unknown";
/**
 * Colonne de gauche du tableau publié réellement sélectionnée. Selon la source,
 * c'est une classe de sensibilité des tables Academy (« A » à « E ») ou un
 * modèle de contact de fiche produit (« 1A », « 1A66B »…). Les deux ne sont
 * jamais convertis l'un dans l'autre : la valeur est toujours reprise telle
 * qu'elle est publiée.
 */
export type Sensitivity = string;

export interface WorkshopConfig {
  version: 3;
  guideReference?: string | null;
  demoReach: number;
  lateralShift: number;
  magnetTilt: number;
  magnetModel: string;
  machine: MachineAssembly | null;
  sensorId: string;
  mode: "reference" | "education";
  sensitivity: Sensitivity;
  /** Approche publiée : latérales D1/D3, ou frontale F1 (faces en vis-à-vis). */
  geometry: "D1" | "D3" | "F1";

  motion: "approach" | "slide" | "pivot";
  start: number;
  end: number;
  offset: number;
  travel: number;
  span: number;
  sensorAngle: number;
  magnetAngle: number;
  magnetization: "axial" | "diametral" | "thickness";
  polarity: 1 | -1;
  mountAngle: number;
  mountX: number;
  mountZ: number;
  ferromagnetic: boolean;
  temperature: "ambient" | "other";
  initialContact: Contact;
  targetStart: number;
  targetEnd: number;
  /** Longueur de câble choisie par l'utilisateur, en millimètres.
   * `null` = pas encore choisie : jamais une longueur supposée. Absente des
   * fichiers antérieurs, elle y est relue comme `null`. */
  cableLengthMm: number | null;
}
export const DEFAULT_WORKSHOP: WorkshopConfig = {
  version: 3,
  guideReference: null,
  demoReach: 25,
  lateralShift: 0,
  magnetTilt: 0,
  // Première ouverture : un couple réellement documenté (MK04 + M04, approche
  // D1, classe B = 15 / 17,5 mm à la brochure). Les couples explicitement
  // enregistrés dans un dossier ne sont jamais réécrits par ce démarrage.
  magnetModel: "M04",
  machine: null,
  sensorId: "MK04",
  mode: "reference",
  sensitivity: "B",
  geometry: "D1",
  motion: "approach",
  start: 32,
  end: 5,
  offset: 12,
  travel: 35,
  span: 160,
  sensorAngle: 0,
  magnetAngle: 0,
  magnetization: "axial",
  polarity: 1,
  mountAngle: 0,
  mountX: 0,
  mountZ: 0,
  ferromagnetic: false,
  temperature: "ambient",
  initialContact: "unknown",
  targetStart: 35,
  targetEnd: 65,
  cableLengthMm: null,
};
export const DISTANCE_SOURCE =
  "https://standexdetect.com/resources/reed-technology-academy/reed-sensor-activation-distances/";
export const INTERACTION_SOURCE =
  "https://standexdetect.com/resources/reed-technology-academy/magnet-interaction/";
export const MODEL_VERSION = "magnetic-workshop-0.3.0";
export const EDUCATION_NOTE =
  "Démonstration fictive : dimensions des boîtiers en mm, champ et seuils choisis pour apprendre. Aucune portée réelle du produit n'est prédite.";
export const REFERENCE_NOTE =
  "Distances typiques Standex publiées pour le couple capteur–aimant réellement sélectionné, dans la configuration représentée. Enveloppes cotées ; contacts internes et pôles symboliques. À confirmer par essais dans votre application.";
/** Note propre aux fiches produit qui publient « Min Activation » / « Max Release ». */
export const REFERENCE_NOTE_ACTIVATION =
  "Valeurs « Min Activation » et « Max Release » publiées par la fiche produit pour ce couple. Indicatives et dépendantes de l'environnement : ce n'est pas un seuil nominal mesuré. Distance mesurée entre les faces en vis-à-vis, le long de l'axe des cylindres.";
/** Libellés de colonne réellement présents au registre, plus les classes Academy. */
export const PUBLISHED_CLASS_VALUES: readonly string[] = [
  ...new Set(["A", "B", "C", "D", "E", ...effectivePublishedRegistry().rows.map((r) => r.sensitivityClass)]),
];


// MK03 table, checked 2026-09-07. [pull-in, drop-out], mm; D2 deliberately omitted:
// one distance at a side lobe does not locate the lobe in a full 3D map.
/** @deprecated Compatibility export only; no product values live in this module. */
export const MK03_DISTANCES = Object.fromEntries(
  (["B", "C", "D", "E"] as const).map((cls) => [
    cls,
    Object.fromEntries(
      (["D1", "D3"] as const).map((approach) => [approach, publishedPair(cls, approach)]),
    ),
  ]),
) as Record<Sensitivity, Record<"D1" | "D3", readonly [number, number] | null>>;
export const clamp = (v: number, low: number, high: number) => Math.max(low, Math.min(high, v));
export const axis = (degrees: number): Vec3 => [
  Math.cos((degrees * Math.PI) / 180),
  0,
  Math.sin((degrees * Math.PI) / 180),
];
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const length = (a: Vec3) => Math.hypot(...a);
export const subtract = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

/** Import is fail-closed: no NaN, oversized values, unknown version or implicit default. */
export function parseWorkshopConfig(value: unknown): WorkshopConfig | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const legacy = raw["version"] === 1 || raw["version"] === 2;
  const x: Record<string, unknown> = legacy
    ? {
        ...raw,
        version: 3,
        sensorId:
          raw["version"] === 1
            ? raw["mode"] === "reference"
              ? "MK03"
              : "GENERIC"
            : raw["sensorId"],
        demoReach: 25,
        lateralShift: 0,
        magnetTilt: 0,
        magnetModel: raw["mode"] === "reference" ? "M02" : "generic",
        machine: null,
      }
    : { ...raw };
  if (x["version"] !== 3) return null;
  if (x["guideReference"] === undefined) x["guideReference"] = null;
  if (x["guideReference"] !== null && (typeof x["guideReference"] !== "string" || (x["guideReference"] as string).length > 100)) return null;
  if (x["machine"] !== null) {
    const machine = parseMachine(x["machine"]);
    if (!machine) return null;
    x["machine"] = machine;
  }
  if (typeof x["sensorId"] !== "string" || !isKnownSensorId(x["sensorId"])) return null;
  const choices: Record<string, readonly unknown[]> = {
    mode: ["reference", "education"],
    // La colonne publiée acceptée : classes Academy A–E, plus tout libellé
    // réellement présent au registre (modèles de contact des fiches produit).
    sensitivity: PUBLISHED_CLASS_VALUES,
    geometry: ["D1", "D3", "F1"],

    motion: ["approach", "slide", "pivot"],
    magnetization: ["axial", "diametral", "thickness"],
    magnetModel: [...PACKAGED_MAGNET_IDS, ...BARE_MAGNETS.map((m) => m.id), "generic"],
    polarity: [1, -1],
    temperature: ["ambient", "other"],
    initialContact: ["open", "closed", "unknown"],
    ferromagnetic: [true, false],
  };
  for (const [k, values] of Object.entries(choices)) if (!values.includes(x[k])) return null;
  const bounds: Record<string, readonly [number, number]> = {
    demoReach: [5, 100],
    lateralShift: [-50, 50],
    magnetTilt: [-180, 180],
    start: [1, 60],
    end: [1, 60],
    offset: [6, 30],
    travel: [10, 50],
    span: [30, 300],
    sensorAngle: [-180, 180],
    magnetAngle: [-180, 180],
    mountAngle: [-180, 180],
    mountX: [-25, 25],
    mountZ: [-25, 25],
    targetStart: [0, 100],
    targetEnd: [0, 100],
  };
  for (const [k, [low, high]] of Object.entries(bounds)) {
    const v = x[k];
    if (typeof v !== "number" || !Number.isFinite(v) || v < low || v > high) return null;
  }
  // Longueur de câble : absente des fichiers antérieurs, elle vaut alors `null`.
  // Une valeur fournie doit être un nombre fini et plausible, sinon le fichier est refusé.
  if (x["cableLengthMm"] === undefined) x["cableLengthMm"] = null;
  if (x["cableLengthMm"] !== null) {
    const cl = x["cableLengthMm"];
    if (typeof cl !== "number" || !Number.isFinite(cl) || cl <= 0 || cl > 100000) return null;
  }
  if (
    (x["start"] as number) <= (x["end"] as number) ||
    (x["targetStart"] as number) >= (x["targetEnd"] as number)
  )
    return null;
  /* Couple enregistré AVANT la règle de compatibilité de forme (un ancien
     fichier « mode référence » portait MK03 + M02, aimant bloc sur corps
     tubulaire) : l'aimant est ramené au défaut du capteur. Le fichier n'est pas
     refusé et aucune distance n'est reprise de l'aimant écarté. */
  if (
    typeof x["magnetModel"] === "string" &&
    x["magnetModel"] !== "generic" &&
    isShapeIncompatible(x["sensorId"] as string, x["magnetModel"])
  ) {
    x["magnetModel"] = defaultMagnetFor(x["sensorId"] as string);
    x["guideReference"] = null;
  }
  // Allow only schema keys; ignore potential result/provenance properties on imported objects.
  return Object.fromEntries(
    Object.keys(DEFAULT_WORKSHOP).map((k) => [k, x[k]]),
  ) as unknown as WorkshopConfig;
}

export { documentedMagnetAngleDeg };
/** Angle normalisé dans (-180, 180]. */
export const normaliseAngle = (a: number) => (((a % 360) + 540) % 360) - 180;
/** Angle de l'aimant imposé par l'approche documentée du couple. */

/** Ligne publiée EXACTE du couple sélectionné, ou `null`. */
export const workshopRow = (c: WorkshopConfig) =>
  publishedReference(c.sensorId, c.sensitivity, c.magnetModel, c.geometry);
/** Distances publiées du couple RÉELLEMENT sélectionné. Aucun repli sur MK03. */
export const workshopPair = (c: WorkshopConfig) =>
  publishedPairFor(c.sensorId, c.sensitivity, c.geometry, c.magnetModel);
/**
 * Le moteur de l'atelier ne simule QUE le contact normalement ouvert (1A).
 * Les modèles 1B et 1C publiés par les fiches restent lisibles comme
 * documentation : ils ne sont ni convertis, ni supprimés, ni simulés.
 */
export const simulatedContactForm = (c: WorkshopConfig): boolean =>
  (workshopRow(c)?.contactForm ?? "1A") === "1A";
/**
 * Provenance à afficher quand les distances sont lues via une identité de
 * famille DOCUMENTÉE (aujourd'hui la seule : « M21/P(1,2) »).
 */
export const PUBLISHED_FAMILY_NOTE_M21 =
  "Distances lues sur la famille documentée « M21/P(1,2) » : brochure Reed Switch Sensors A5 V04 EN, page 37 (planche MAGNETS IN HOUSINGS, cotes uniques) et page 38 (aimant 2500000021 / M21 listé comme valable). Les variantes P/1 et P/2 ne diffèrent que par l'orientation des trous oblongs. Aucune variante de capteur n'est déduite de cette identité.";
export const publishedFamilyNoteFor = (c: WorkshopConfig): string | null =>
  isPublishedFamilyAlias(c.magnetModel) && hasPublishedDistances(c)
    ? PUBLISHED_FAMILY_NOTE_M21
    : null;
/** Note à afficher selon la nature des seuils réellement publiés. */
export const referenceNoteFor = (c: WorkshopConfig): string =>
  workshopRow(c)?.thresholdKind === "min_activation_max_release"
    ? REFERENCE_NOTE_ACTIVATION
    : REFERENCE_NOTE;
/** Le capteur choisi dispose-t-il de distances publiées avec cet aimant ? */
export const hasPublishedDistances = (c: WorkshopConfig) =>
  publishedClasses(c.sensorId, c.magnetModel).length > 0;

/** Approches réellement publiées pour ce couple, dans l'ordre de lecture.
 * F1 est l'approche frontale des fiches MK36/MK37/MK38 : proposée seulement si
 * le registre la publie pour CE couple. */
export function approachChoicesFor(
  sensorId: string,
  magnetModel: string,
): WorkshopConfig["geometry"][] {
  const published = publishedApproaches(sensorId, magnetModel);
  return (["D1", "D3", "F1"] as const).filter((a) => published.includes(a));
}

/** Un modèle explicitement fictif : jamais un vrai capteur du catalogue. */
export const isFictitiousSensor = (sensorId: string) =>
  sensorId === "GENERIC" || sensorId === CUSTOM_SENSOR_ID;

/**
 * Sélection réelle d'un capteur, logique CENTRALE et unique : le couple par
 * défaut s'applique, la classe et l'approche retombent sur des valeurs
 * réellement publiées, l'orientation reprend celle que la source documente, et
 * un vrai capteur ne bascule jamais d'office dans le modèle fictif.
 *
 * Machine, câble et cinématique du montage sont conservés tels quels : cette
 * fonction ne s'applique qu'à un changement EXPLICITE de capteur, jamais au
 * simple chargement d'un dossier enregistré.
 */
export function applySensorSelection(c: WorkshopConfig, sensorId: string): WorkshopConfig {
  return applyPairSelection(c, sensorId);
}
/** Sélection d'un COUPLE demandé explicitement (carte « Tester ce couple ») :
 * le capteur ET l'aimant de la carte sont appliqués, puis classes, approche et
 * angles sont réalignés sur ce duo. Sans `magnetId`, on retombe sur le défaut
 * du capteur : un simple changement de capteur ne fabrique aucun duo. */
export function applyPairSelection(
  c: WorkshopConfig,
  sensorId: string,
  magnetId?: string,
): WorkshopConfig {
  const fake = isFictitiousSensor(sensorId);
  /* Règle de compatibilité de FORME : un aimant demandé dont la forme contredit
     celle du capteur est ramené au défaut du capteur. Rien n'est converti, aucune
     distance n'est reprise de l'aimant écarté. */
  const magnetModel = fake ? "generic" : normalizedMagnetFor(sensorId, magnetId);
  const classes = publishedClasses(sensorId, magnetModel);
  const approaches = approachChoicesFor(sensorId, magnetModel);
  let geometry =
    approaches.length && !approaches.includes(c.geometry) ? approaches[0]! : c.geometry;
  /* Variante du guide RÉSOLUE ICI, une seule fois, et enregistrée dans le
     projet : atelier, essai, résultat, export et réouverture lisent ensuite la
     même ligne. Le choix déjà fait sur le même couple est conservé. */
  const sameCouple = c.sensorId === sensorId && c.magnetModel === magnetModel;
  let guideReference: string | null = null;
  if (!fake) {
    let selection = guideSelectionFor(
      sensorId,
      magnetModel,
      geometry,
      sameCouple ? c.guideReference : null,
    );
    if (!selection && approaches.length === 0) {
      const fallback = defaultGuideSelection(sensorId, magnetModel);
      if (fallback && (fallback.approachId === "D1" || fallback.approachId === "D3")) {
        geometry = fallback.approachId;
        selection = fallback;
      }
    }
    guideReference = selection?.reference ?? null;
  }
  return {
    ...c,
    sensorId,
    magnetModel,
    guideReference,
    sensitivity: classes.length && !classes.includes(c.sensitivity) ? classes[0]! : c.sensitivity,
    geometry,
    mode: fake ? "education" : "reference",
    sensorAngle: 0,
    magnetAngle: documentedMagnetAngleDeg(geometry, sensorId),
  };

}
/** A new pair starts on its published template. Imported assemblies keep their own motion. */
export function pairDemonstration(c: WorkshopConfig, sensorId: string, magnetId: string): WorkshopConfig {
  const next = applyPairSelection(c, sensorId, magnetId);
  if (c.machine) return next;
  const geometry = approachChoicesFor(sensorId, magnetId).find(a => a === "D1") ?? approachChoicesFor(sensorId, magnetId)[0] ?? next.geometry;
  // La variante du guide suit l'approche réellement dessinée, sans retomber
  // implicitement sur la première ligne imprimée d'une autre approche.
  const guideReference =
    guideSelectionFor(sensorId, magnetId, geometry, next.guideReference)?.reference ?? null;
  const aligned = { ...next, geometry, guideReference, motion: "approach" as const, lateralShift: 0, magnetTilt: 0,
    sensorAngle: 0, magnetAngle: documentedMagnetAngleDeg(geometry, sensorId), polarity: 1 as const,
    magnetization: "axial" as const };
  const thresholds = workshopPair(aligned);
  return thresholds ? { ...aligned, start: Math.min(60, Math.max(thresholds[1] * 1.4, thresholds[1] + 5)), end: Math.max(1, thresholds[0] * 0.5) } : aligned;
}

/** Nature des distances affichées. Un vrai capteur sélectionné ne bascule jamais
 * automatiquement dans un modèle fictif : sans données publiées, l'atelier
 * affiche « Distances non renseignées ». */
export function distanceBasis(c: WorkshopConfig): "standex" | "unavailable" | "fictitious" {
  if (isFictitiousSensor(c.sensorId)) return "fictitious";
  return hasPublishedDistances(c) ? "standex" : "unavailable";
}
export function referenceAllowed(c: WorkshopConfig): boolean {
  return (
    c.mode === "reference" &&
    workshopPair(c) !== null &&
    simulatedContactForm(c) &&
    c.machine === null &&
    c.magnetTilt === 0 &&
    c.lateralShift === 0 &&
    c.motion === "approach" &&
    c.sensorAngle === 0 &&
    // L'angle attendu vient de l'approche DOCUMENTÉE : 0 en latéral D1/D3,
    // 180° en frontal F1 où les deux collerettes se font face.
    normaliseAngle(c.magnetAngle - documentedMagnetAngleDeg(c.geometry, c.sensorId)) === 0 &&
    c.magnetization === "axial" &&
    c.polarity === 1 &&
    !c.ferromagnetic &&
    c.temperature === "ambient"
  );
}

export function unavailableReason(c: WorkshopConfig): string | null {
  if (c.mode === "education") return null;
  if (sensorById(c.sensorId).contact === "unsupported")
    return "Le MK02 détecte du métal ferreux avec un aimant intégré. Son activation n'est pas modélisée dans cet atelier à aimant externe.";
  // Le schéma sur mesure n'a aucune distance de commutation documentée : hors
  // démonstration pédagogique, elle reste inconnue et n'est jamais calculée.
  if (sensorById(c.sensorId).shape === "custom_pcb")
    return "Conception sur mesure : aucune distance de commutation n'est documentée pour ce schéma. Elle reste inconnue tant que la R&D Standex n'a pas caractérisé la solution.";
  if (c.ferromagnetic)
    return "Présence de matière ferromagnétique : ce modèle ne calcule pas son effet.";
  if (c.temperature !== "ambient")
    return "Température différente des conditions de référence : caractérisation nécessaire.";
  if (!hasPublishedDistances(c))
    return "Distances non renseignées pour ce couple capteur–aimant. Aucun seuil n'est emprunté à un autre capteur ni à un autre aimant : le comportement du capteur nécessite des tests en environnement réel.";
  if (!workshopPair(c))
    return "Cette classe de sensibilité ou cette approche n'est pas publiée pour ce couple. Le contact reste indéterminé.";
  if (!simulatedContactForm(c))
    return "Ce modèle de contact n'est pas normalement ouvert : ses distances publiées sont affichées, mais ce simulateur ne modélise que le contact normalement ouvert. Le comportement du capteur nécessite des tests en environnement réel.";

  if (!referenceAllowed(c))
    return "Cette orientation ou ce mouvement sort de la configuration documentée.";
  return null;
}


export function magnetSize(c: WorkshopConfig): Vec3 {
  const model = pairedMagnetModel(c.magnetModel, c.sensorId);
  return model ? [...model.body] : [12, 4, 6];
}
/** Offset from surface gap to centres, in mm, with projected extents for rotated objects. */
export function approachOffset(c: WorkshopConfig): number {
  const [l, , w] = sensorById(c.sensorId).body,
    [ml, , mw] = magnetSize(c);
  // D1 approche par la face latérale (axe Z) ; D3 et l'approche frontale F1
  // suivent l'axe longitudinal (X). Pour F1 la distance publiée est un écart
  // ENTRE FACES : l'offset ajoute les demi-longueurs, il ne les retranche pas.
  const direction: Vec3 = transverseApproach(c.geometry, c.sensorId) ? [0, 0, 1] : [1, 0, 0];

  const projected = (size: Vec3, rotation: Vec3) =>
    size.reduce((sum, n, i) => {
      const e: Vec3 = [0, 0, 0];
      e[i] = 1;
      return sum + (Math.abs(dot(rotate(e, rotation), direction)) * n) / 2;
    }, 0);
  return (
    projected([l, sensorById(c.sensorId).body[1], w], [0, -c.sensorAngle, 0]) +
    projected([ml, magnetSize(c)[1], mw], [0, -c.magnetAngle, c.magnetTilt])
  );
}
/** Conservative X/Z oriented envelope intersection; all parts share the same Y plane. */
export function bodiesOverlap(c: WorkshopConfig, position: Vec3, angle: number): boolean {
  const [l, , w] = sensorById(c.sensorId).body,
    [ml, , mw] = magnetSize(c);
  const sa = axis(c.sensorAngle),
    sz = axis(c.sensorAngle + 90),
    ma = axis(angle),
    mz = axis(angle + 90);
  return [sa, sz, ma, mz].every(
    (n) =>
      Math.abs(dot(position, n)) <
      (Math.abs(dot(sa, n)) * l) / 2 +
        (Math.abs(dot(sz, n)) * w) / 2 +
        (Math.abs(dot(ma, n)) * ml) / 2 +
        (Math.abs(dot(mz, n)) * mw) / 2 -
        0.001,
  );
}
/** t covers a full out-and-back cycle. Positions and surface gaps are geometric mm. */
export function poseAt(
  c: WorkshopConfig,
  t: number,
): { position: Vec3; angle: number; distance: number; outward: boolean } {
  const phase = clamp(t, 0, 1),
    u = phase <= 0.5 ? phase * 2 : (1 - phase) * 2;
  const distance = c.start + (c.end - c.start) * u;
  if (c.machine) {
    const m = componentPose(c.machine, "magnet", openingAt(phase)),
      sensor = componentPose(c.machine, "sensor", openingAt(phase));
    return {
      position: m.position,
      angle: 0,
      distance: length(subtract(m.position, sensor.position)),
      outward: phase > 0.5,
    };
  }
  if (c.motion === "approach")
    return {
      position:
        transverseApproach(c.geometry, c.sensorId)
          ? [c.lateralShift, 0, distance + approachOffset(c)]
          : [distance + approachOffset(c), 0, c.lateralShift],
      angle: c.magnetAngle,
      distance,
      outward: phase > 0.5,
    };
  if (c.motion === "slide")
    return {
      position: [-c.travel + 2 * c.travel * u, 0, c.offset],
      angle: c.magnetAngle,
      distance: c.offset,
      outward: phase > 0.5,
    };
  if (c.motion === "pivot") {
    const a = ((-c.span / 2 + c.span * u) * Math.PI) / 180;
    return {
      position: [Math.sin(a) * c.offset, 0, Math.cos(a) * c.offset],
      angle: c.magnetAngle + c.span * u - c.span / 2,
      distance: c.offset,
      outward: phase > 0.5,
    };
  }
  return {
    position: [0, 0, distance + approachOffset(c)],
    angle: c.magnetAngle,
    distance,
    outward: phase > 0.5,
  };
}

/** Ideal dipole in empty space, arbitrary strength/units. Never report these as mT.
 * Near-source values are undefined and deliberately omitted rather than saturated.
 */
export function fieldAt(point: Vec3, magnet: Vec3, momentAxis: Vec3): Vec3 | null {
  const r = subtract(point, magnet),
    rlen = length(r);
  if (rlen < 5) return null;
  const k = 3500 / rlen ** 3,
    projection = (3 * dot(momentAxis, r)) / (rlen * rlen);
  return [
    k * (projection * r[0] - momentAxis[0]),
    k * (projection * r[1] - momentAxis[1]),
    k * (projection * r[2] - momentAxis[2]),
  ];
}
export const poleAxis = (c: WorkshopConfig): Vec3 =>
  c.magnetization === "thickness"
    ? [0, 1, 0]
    : c.magnetization === "diametral"
      ? [0, 0, 1]
      : [1, 0, 0];
export function momentFor(c: WorkshopConfig, angle: number): Vec3 {
  return rotate(poleAxis(c), [0, -angle, c.magnetTilt]).map((v) => v * c.polarity) as Vec3;
}
/** Softened, finite illustrative dipole. Strength is chosen by demoReach, never fitted to a product.
 * Its longitudinal projection retains directional nulls and off-axis lobes. */
export function demoField(point: Vec3, magnet: Vec3, moment: Vec3, reach: number): Vec3 {
  const r = subtract(point, magnet),
    d2 = dot(r, r) + 16,
    k = reach ** 3 / d2 ** 1.5,
    projection = (3 * dot(moment, r)) / d2;
  return r.map((v, i) => k * (projection * v - moment[i]!)) as Vec3;
}
export function educationSignal(c: WorkshopConfig, position: Vec3, angle: number, t = 0): number {
  const model = sensorById(c.sensorId),
    u = openingAt(t);
  const sensor = c.machine
    ? componentPose(c.machine, "sensor", u)
    : { position: [0, 0, 0] as Vec3, transform: (v: Vec3) => rotate(v, [0, -c.sensorAngle, 0]) };
  const magnet = c.machine ? componentPose(c.machine, "magnet", u) : null;
  const a = sensor.transform([1, 0, 0]),
    m = magnet
      ? (magnet.transform(poleAxis(c)).map((v) => v * c.polarity) as Vec3)
      : momentFor(c, angle);
  let sum = 0;
  for (let i = -3; i <= 3; i++) {
    const local = sensor.transform(rotate([(i * bladeLength(model)) / 6, 0, bladeOffsetZ(model)], [0, housingYawDeg(c.sensorId), 0]));
    const p = local.map((v, j) => v + sensor.position[j]!) as Vec3;
    sum += dot(demoField(p, position, m, c.demoReach), a);
  }
  return Math.abs(sum / 7);
}

export function switchContact(
  previous: Contact,
  value: number | null,
  pull: number,
  drop: number,
  increasing: boolean,
): Contact {
  if (value === null || !Number.isFinite(value)) return "unknown";
  if (increasing) {
    if (value >= pull) return "closed";
    if (value <= drop) return "open";
  } else {
    if (value <= pull) return "closed";
    if (value >= drop) return "open";
  }
  return previous;
}
export interface CycleSample {
  t: number;
  contact: Contact;
  position: Vec3;
  angle: number;
  distance: number;
  signal: number | null;
}
export interface CycleResult {
  samples: CycleSample[];
  closures: number;
  releases: number;
  unknown: boolean;
  reason: string | null;
  transitions: { t: number; contact: Contact; distance: number }[];
}
export function simulateCycle(c: WorkshopConfig, steps = 600): CycleResult {
  if (!parseWorkshopConfig(c)) throw new Error("Montage invalide");
  if (!Number.isInteger(steps) || steps < 10 || steps > 10000)
    throw new Error("Résolution invalide");
  const reason = unavailableReason(c),
    pair = workshopPair(c);

  const samples: CycleSample[] = [],
    transitions: CycleResult["transitions"] = [];
  let contact =
      c.mode === "education" && c.initialContact === "unknown"
        ? ("open" as Contact)
        : c.initialContact,
    closures = 0,
    releases = 0;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps,
      pose = poseAt(c, t);
    const signal = reason
      ? null
      : c.mode === "reference"
        ? pose.distance
        : educationSignal(c, pose.position, pose.angle, t);
    const next =
      c.mode === "reference" && !pair
        ? "unknown"
        : switchContact(
            contact,
            signal,
            c.mode === "reference" ? pair![0] : 1,
            c.mode === "reference" ? pair![1] : 0.72,
            c.mode === "education",
          );
    if (next !== contact && i > 0) {
      transitions.push({ t, contact: next, distance: pose.distance });
      if (contact === "open" && next === "closed") closures++;
      if (contact === "closed" && next === "open") releases++;
    }
    contact = next;
    samples.push({
      t,
      contact,
      position: pose.position,
      angle: pose.angle,
      distance: pose.distance,
      signal,
    });
  }
  return {
    samples,
    closures,
    releases,
    unknown: samples.some((s) => s.contact === "unknown"),
    reason,
    transitions,
  };
}

export function summarizeWorkshop(c: WorkshopConfig): string {
  const guide = workshopGuideRange(c);
  const result = simulateCycle(c),
    pair = workshopPair(c),
    pull = pair?.[0] ?? "?",
    drop = pair?.[1] ?? "?";
  // La référence de variante vient du registre, jamais recomposée : on ne titre
  // jamais un résultat MK04 avec une référence MK03.
  const reference =
    publishedSensorReference(c.sensorId, c.sensitivity, c.magnetModel) ?? sensorById(c.sensorId).name;
  const setup =
    c.mode === "reference"
      ? `${reference} + ${c.magnetModel} ; approche ${c.geometry}, ${c.geometry === "F1" ? `faces en vis-à-vis (aimant à ${c.magnetAngle}°)` : "axes parallèles"}.`
      : c.machine
        ? `${sensorById(c.sensorId).name} · Démonstration fictive dans ${c.machine.fileName} ; axe Nord–Sud local ${c.magnetization === "axial" ? "X" : c.magnetization === "thickness" ? "Y" : "Z"}, polarité ${c.polarity === 1 ? "N/S" : "S/N"}.`
        : `${sensorById(c.sensorId).name} · Démonstration fictive ; ${c.machine ? "intégration dans une machine" : c.motion === "slide" ? "passage latéral" : c.motion === "pivot" ? "pivot" : "approche " + c.geometry} ; axe reed ${c.sensorAngle}°, aimant ${c.magnetAngle}°, aimantation ${c.magnetization === "axial" ? "axiale" : c.magnetization === "thickness" ? "épaisseur" : "transversale"}, polarité ${c.polarity === 1 ? "N/S" : "S/N"}.`;

  return [
    "Montage de l'atelier magnétique",
    setup,
    ...(c.mode === "education"
      ? [
          `Échelle de champ fictive : ${c.demoReach} mm${c.machine ? "" : ` ; inclinaison ${c.magnetTilt}° ; décalage ${c.lateralShift} mm`}. Environnement et matériaux non simulés.`,
        ]
      : []),
    ...(c.machine
      ? [
          `Fichier 3D : ${c.machine.fileName} (${c.machine.assetKey}). Géométrie importée conservée dans le navigateur ; à réimporter sur un autre poste. Pièce mobile : ${c.machine.movingNode}.`,
          `Capteur : ${c.machine.sensorPosition.join(", ")} mm ; rotation ${c.machine.sensorRotation.join(", ")}°. Aimant : ${c.machine.magnetPosition.join(", ")} mm ; rotation ${c.machine.magnetRotation.join(", ")}°.`,
          `Mouvement : ${c.machine.motion}, déplacement ${c.machine.travel.join(", ")} mm, pivot ${c.machine.pivot.join(", ")} mm, axe ${c.machine.rotationAxis}, angle ${c.machine.openingAngle}°.`,
        ]
      : []),
    `Boîtier : ${sizeLabel(sensorById(c.sensorId))}. Contacts internes schématiques, position non caractérisée.`,
    ...(c.machine
      ? []
      : [`Repère du plan : rotation ${c.mountAngle}°, position (${c.mountX}, ${c.mountZ}) mm.`]),
    c.machine
      ? `Supports : capteur ${c.machine.sensorMount}, aimant ${c.machine.magnetMount}. Échelle import : ×${c.machine.unitScale} vers mm. Gabarit déclaré : ${c.machine.space.join(" × ")} mm.`
      : c.mode === "reference"
        ? `Entrefer de ${c.start} à ${c.end} mm, puis retour. Seuils typiques : fermeture ${pull} mm, ouverture ${drop} mm.`
        : `Course de ${c.start} à ${c.end}, décalage/rayon ${c.offset}, demi-course latérale ${c.travel} mm, angle de pivot ${c.span}°. Dimensions géométriques, pas de portée validée.`,
    ...(c.machine
      ? []
      : [`Contact souhaité fermé entre ${c.targetStart} et ${c.targetEnd} % du cycle.`]),
    `État initial : ${c.initialContact === "unknown" ? (c.mode === "education" ? "ouvert par convention pédagogique, puis recalculé" : "inconnu") : c.initialContact === "closed" ? "fermé" : "ouvert"}. Matière ferromagnétique : ${c.ferromagnetic ? "oui" : "non déclarée"}. Température : ${c.temperature === "ambient" ? "ambiante" : "autre"}.`,
    guide && !pair
      ? `${guide.sensorReference} · ${guide.approachId} · up ${guide.upMm ?? "—"} mm / to ${guide.toMm ?? "—"} mm · p. ${guide.page}. ${GUIDE_SIMULATION_NOTE}`
      : result.reason
      ? `Calcul indisponible : ${result.reason}`
      : `Cycle indicatif : ${result.closures} enclenchement(s), ${result.releases} relâchement(s).${result.unknown ? " Une partie du parcours est indéterminée." : ""}`,
    c.mode === "reference" ? REFERENCE_NOTE : EDUCATION_NOTE,
    `Modèle : ${MODEL_VERSION}. Source : ${c.mode === "reference" ? DISTANCE_SOURCE : INTERACTION_SOURCE}`,
  ].join("\n");
}
const NOTE_MARKERS = [1, 2, 3].map((v) => `\n\n[STANDEX_MAGNETIC_WORKSHOP_V${v}]\n`);
export function serializeWorkshop(c: WorkshopConfig): string {
  if (!parseWorkshopConfig(c)) throw new Error("Montage invalide");
  return summarizeWorkshop(c) + NOTE_MARKERS[2] + JSON.stringify(c);
}
export function parseWorkshopNote(text: string): WorkshopConfig | null {
  const token = NOTE_MARKERS.reduce((a, b) => (text.lastIndexOf(a) > text.lastIndexOf(b) ? a : b));
  const marker = text.lastIndexOf(token);
  if (marker < 0 || text.length > 20000) return null;
  try {
    return parseWorkshopConfig(JSON.parse(text.slice(marker + token.length)));
  } catch {
    return null;
  }
}
export function lastWorkshop(messages: { role: string; content: string }[]): WorkshopConfig | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg?.role !== "internal") continue;
    const c = parseWorkshopNote(msg.content);
    if (c) return c;
  }
  return null;
}
export function displayWorkshopMessage(text: string): string {
  const c = parseWorkshopNote(text);
  return c ? summarizeWorkshop(c) : text;
}
