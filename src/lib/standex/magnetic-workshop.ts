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
} from "./sensor-catalog";
import { parseMachine, componentPose, openingAt, rotate } from "./machine-assembly";
import type { MachineAssembly } from "./machine-assembly";
export type Vec3 = [number, number, number];
export type Contact = "open" | "closed" | "unknown";
export type Sensitivity = "B" | "C" | "D" | "E";
export interface WorkshopConfig {
  version: 3;
  demoReach: number;
  lateralShift: number;
  magnetTilt: number;
  magnetModel: "M02" | "generic";
  machine: MachineAssembly | null;
  sensorId: string;
  mode: "reference" | "education";
  sensitivity: Sensitivity;
  geometry: "D1" | "D3";
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
}
export const DEFAULT_WORKSHOP: WorkshopConfig = {
  version: 3,
  demoReach: 25,
  lateralShift: 0,
  magnetTilt: 0,
  magnetModel: "M02",
  machine: null,
  sensorId: "MK03",
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
};
export const DISTANCE_SOURCE =
  "https://standexdetect.com/resources/reed-technology-academy/reed-sensor-activation-distances/";
export const INTERACTION_SOURCE =
  "https://standexdetect.com/resources/reed-technology-academy/magnet-interaction/";
export const MODEL_VERSION = "magnetic-workshop-0.3.0";
export const EDUCATION_NOTE =
  "Démonstration fictive : dimensions des boîtiers en mm, champ et seuils choisis pour apprendre. Aucune portée réelle du produit n'est prédite.";
export const REFERENCE_NOTE =
  "Distances typiques Standex pour le MK03 + M02 dans la configuration représentée. Enveloppes cotées ; contacts internes et pôles symboliques. À confirmer par essais dans votre application.";

// MK03 table, checked 2026-09-07. [pull-in, drop-out], mm; D2 deliberately omitted:
// one distance at a side lobe does not locate the lobe in a full 3D map.
export const MK03_DISTANCES: Record<Sensitivity, Record<"D1" | "D3", readonly [number, number]>> = {
  B: { D1: [15, 17.5], D3: [9.3, 11.4] },
  C: { D1: [13, 16.5], D3: [7.4, 9.9] },
  D: { D1: [11, 14.5], D3: [5.7, 8.5] },
  E: { D1: [10, 13.5], D3: [4.5, 8] },
};
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
  if (x["machine"] !== null) {
    const machine = parseMachine(x["machine"]);
    if (!machine) return null;
    x["machine"] = machine;
  }
  if (x["machine"] !== null && x["mode"] !== "education") return null;
  if (typeof x["sensorId"] !== "string" || !isKnownSensorId(x["sensorId"])) return null;
  const choices: Record<string, readonly unknown[]> = {
    mode: ["reference", "education"],
    sensitivity: ["B", "C", "D", "E"],
    geometry: ["D1", "D3"],
    motion: ["approach", "slide", "pivot"],
    magnetization: ["axial", "diametral", "thickness"],
    magnetModel: ["M02", "generic"],
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
  if (
    (x["start"] as number) <= (x["end"] as number) ||
    (x["targetStart"] as number) >= (x["targetEnd"] as number)
  )
    return null;
  // Allow only schema keys; ignore potential result/provenance properties on imported objects.
  return Object.fromEntries(
    Object.keys(DEFAULT_WORKSHOP).map((k) => [k, x[k]]),
  ) as unknown as WorkshopConfig;
}

export function referenceAllowed(c: WorkshopConfig): boolean {
  return (
    c.mode === "reference" &&
    c.sensorId === "MK03" &&
    c.machine === null &&
    c.magnetModel === "M02" &&
    c.magnetTilt === 0 &&
    c.lateralShift === 0 &&
    c.motion === "approach" &&
    c.sensorAngle === 0 &&
    c.magnetAngle === 0 &&
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
  if (c.mode === "reference" && !referenceAllowed(c))
    return "Cette orientation ou ce mouvement sort de la configuration documentée.";
  return null;
}

export function magnetSize(c: WorkshopConfig): Vec3 {
  return c.magnetModel === "M02"
    ? [MAGNET_REFERENCE.length, MAGNET_REFERENCE.height, MAGNET_REFERENCE.width]
    : [12, 4, 6];
}
/** Offset from surface gap to centres, in mm, with projected extents for rotated objects. */
export function approachOffset(c: WorkshopConfig): number {
  const [l, , w] = sensorById(c.sensorId).body,
    [ml, , mw] = magnetSize(c);
  const direction: Vec3 = c.geometry === "D3" ? [1, 0, 0] : [0, 0, 1];
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
        c.geometry === "D1"
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
    const local = sensor.transform([(i * bladeLength(model)) / 6, 0, bladeOffsetZ(model)]);
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
    [pull, drop] = MK03_DISTANCES[c.sensitivity][c.geometry];
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
    const next = switchContact(
      contact,
      signal,
      c.mode === "reference" ? pull : 1,
      c.mode === "reference" ? drop : 0.72,
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
  const result = simulateCycle(c),
    [pull, drop] = MK03_DISTANCES[c.sensitivity][c.geometry];
  const setup =
    c.mode === "reference"
      ? `MK03-1A66${c.sensitivity}-500W + M02 ; approche ${c.geometry}, axes parallèles.`
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
    result.reason
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
