/** Magnetic workshop V0.1. Geometry, field illustration and switching are separate.
 * Reference distances are typical published values; education is NOT a product model.
 */
export type Vec3 = [number, number, number];
export type Contact = "open" | "closed" | "unknown";
export type Sensitivity = "B" | "C" | "D" | "E";
export interface WorkshopConfig {
  version: 1;
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
  magnetization: "axial" | "diametral";
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
  version: 1,
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
export const MODEL_VERSION = "magnetic-workshop-0.1.0";
export const EDUCATION_NOTE =
  "Modèle pédagogique non calibré. Les dimensions sont des unités de scène ; aucune distance d'activation d'un produit réel n'est prédite.";
export const REFERENCE_NOTE =
  "Distances typiques Standex pour la configuration représentée. Boîtiers schématiques, non cotés. À confirmer par essais dans votre application.";

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
  const x = value as Record<string, unknown>;
  if (x["version"] !== 1) return null;
  const choices: Record<string, readonly unknown[]> = {
    mode: ["reference", "education"],
    sensitivity: ["B", "C", "D", "E"],
    geometry: ["D1", "D3"],
    motion: ["approach", "slide", "pivot"],
    magnetization: ["axial", "diametral"],
    polarity: [1, -1],
    temperature: ["ambient", "other"],
    initialContact: ["open", "closed", "unknown"],
    ferromagnetic: [true, false],
  };
  for (const [k, values] of Object.entries(choices)) if (!values.includes(x[k])) return null;
  const bounds: Record<string, readonly [number, number]> = {
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
  if (c.ferromagnetic)
    return "Présence de matière ferromagnétique : ce modèle ne calcule pas son effet.";
  if (c.temperature !== "ambient")
    return "Température différente des conditions de référence : caractérisation nécessaire.";
  if (c.mode === "reference" && !referenceAllowed(c))
    return "Cette orientation ou ce mouvement sort de la configuration documentée.";
  return null;
}

/** t covers a complete out-and-back cycle. Positions are in the sensor's local frame.
 * Reference geometry uses illustrative bodies: their surface gap, not centre separation,
 * corresponds to the distance parameter. Neither body size is a product dimension.
 */
export function poseAt(
  c: WorkshopConfig,
  t: number,
): { position: Vec3; angle: number; distance: number; outward: boolean } {
  const phase = clamp(t, 0, 1),
    u = phase <= 0.5 ? phase * 2 : (1 - phase) * 2;
  const distance = c.start + (c.end - c.start) * u;
  if (c.mode === "reference")
    return {
      position: c.geometry === "D1" ? [0, 0, distance + 6] : [distance + 20, 0, 0],
      angle: 0,
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
  return { position: [0, 0, distance + 6], angle: c.magnetAngle, distance, outward: phase > 0.5 };
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
export function momentFor(c: WorkshopConfig, angle: number): Vec3 {
  return axis(angle + (c.magnetization === "diametral" ? 90 : 0)).map(
    (v) => v * c.polarity,
  ) as Vec3;
}
/** Pedagogical response proxy: average longitudinal field, seven samples along a generic
 * reed. It does not model the ferromagnetic blades, their force or calibrated sensitivity.
 */
export function educationSignal(c: WorkshopConfig, position: Vec3, angle: number): number | null {
  const a = axis(c.sensorAngle),
    m = momentFor(c, angle);
  let sum = 0;
  for (let i = -3; i <= 3; i++) {
    const b = fieldAt([a[0] * i * 2, 0, a[2] * i * 2], position, m);
    if (!b) return null;
    sum += dot(b, a);
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
  let contact = c.initialContact,
    closures = 0,
    releases = 0;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps,
      pose = poseAt(c, t);
    const signal = reason
      ? null
      : c.mode === "reference"
        ? pose.distance
        : educationSignal(c, pose.position, pose.angle);
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
      : `Reed générique ; ${c.motion === "slide" ? "passage latéral" : c.motion === "pivot" ? "pivot" : "approche"} ; axe reed ${c.sensorAngle}°, aimant ${c.magnetAngle}°, aimantation ${c.magnetization === "axial" ? "axiale" : "diamétrale"}, polarité ${c.polarity === 1 ? "N/S" : "S/N"}.`;
  return [
    "Montage de l'atelier magnétique",
    setup,
    `Repère machine : rotation ${c.mountAngle}°, position (${c.mountX}, ${c.mountZ}) en unités de scène.`,
    c.mode === "reference"
      ? `Entrefer de ${c.start} à ${c.end} mm, puis retour. Seuils typiques : fermeture ${pull} mm, ouverture ${drop} mm.`
      : `Course de ${c.start} à ${c.end}, décalage/rayon ${c.offset}, demi-course latérale ${c.travel}, angle de pivot ${c.span}° (unités de scène).`,
    `Contact souhaité fermé entre ${c.targetStart} et ${c.targetEnd} % du cycle.`,
    `État initial : ${c.initialContact === "unknown" ? "inconnu" : c.initialContact === "closed" ? "fermé" : "ouvert"}. Matière ferromagnétique : ${c.ferromagnetic ? "oui" : "non déclarée"}. Température : ${c.temperature === "ambient" ? "ambiante" : "autre"}.`,
    result.reason
      ? `Calcul indisponible : ${result.reason}`
      : `Cycle indicatif : ${result.closures} enclenchement(s), ${result.releases} relâchement(s).${result.unknown ? " Une partie du parcours est indéterminée." : ""}`,
    c.mode === "reference" ? REFERENCE_NOTE : EDUCATION_NOTE,
    `Modèle : ${MODEL_VERSION}. Source : ${c.mode === "reference" ? DISTANCE_SOURCE : INTERACTION_SOURCE}`,
  ].join("\n");
}
const NOTE_MARKER = "\n\n[STANDEX_MAGNETIC_WORKSHOP_V1]\n";
export function serializeWorkshop(c: WorkshopConfig): string {
  if (!parseWorkshopConfig(c)) throw new Error("Montage invalide");
  return summarizeWorkshop(c) + NOTE_MARKER + JSON.stringify(c);
}
export function parseWorkshopNote(text: string): WorkshopConfig | null {
  const marker = text.lastIndexOf(NOTE_MARKER);
  if (marker < 0 || text.length > 20000) return null;
  try {
    return parseWorkshopConfig(JSON.parse(text.slice(marker + NOTE_MARKER.length)));
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
