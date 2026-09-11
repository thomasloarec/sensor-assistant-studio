import type { WorkshopConfig } from "../magnetic-workshop";
import { MOUNTING_CONTRACT_VERSION } from "./contract";
import type { GuidedMounting } from "./contract";
import { profileFor } from "./profiles";
import type { Vec3 } from "./geometry";
import { withComputed } from "./simulate";

const lateralAxis = (approachId: string): Vec3 => (approachId === "D3" ? [0, 0, 1] : [1, 0, 0]);

/** Vue « montage guidé » d'une configuration d'atelier. Aucune donnée n'est inventée :
 * le contrat ne fait que nommer explicitement ce que l'atelier manipule déjà. */
export function mountingFromWorkshop(c: WorkshopConfig): GuidedMounting {
  const profile = profileFor(c.sensorId, c.magnetModel, c.geometry);
  const lateral = lateralAxis(c.geometry);
  return withComputed({
    version: MOUNTING_CONTRACT_VERSION,
    profileId: profile?.id ?? null,
    profileRevision: profile?.revision ?? null,
    profileSource: profile?.provenance.sourceRef ?? null,
    couple: {
      sensorId: c.sensorId,
      magnetId: c.magnetModel,
      sensitivityClass: c.sensitivity,
      approachId: c.geometry,
    },
    anchor: { positionMm: [c.mountX, 0, c.mountZ], rotationDeg: [0, -c.mountAngle, 0] },
    attachment: {
      frame: c.machine ? "custom_model" : "template",
      parentNode: c.machine?.movingNode || null,
      movingPart: Boolean(c.machine),
    },
    relative: {
      positionMm: lateral.map((v) => v * c.lateralShift) as Vec3,
      rotationDeg: [0, -(c.magnetAngle - c.sensorAngle), c.magnetTilt],
    },
    travel: { startGapMm: c.start, endGapMm: c.end },
    environment: { ferrousNearby: c.ferromagnetic, temperature: c.temperature },
    need: { closedFromPct: c.targetStart, closedToPct: c.targetEnd },
    cable: null,
    computed: null,
  });
}
const clamp = (v: number, low: number, high: number) => Math.max(low, Math.min(high, v));
/** Retour vers l'atelier : uniquement les champs que le montage guidé pilote. */
export function workshopPatchFromMounting(
  m: GuidedMounting,
  current: WorkshopConfig,
): Partial<WorkshopConfig> {
  const lateral = lateralAxis(m.couple.approachId);
  const shift = m.relative.positionMm.reduce((sum, v, i) => sum + v * lateral[i]!, 0);
  return {
    sensorId: m.couple.sensorId,
    magnetModel: m.couple.magnetId,
    sensitivity: m.couple.sensitivityClass as WorkshopConfig["sensitivity"],
    geometry: m.couple.approachId as WorkshopConfig["geometry"],
    motion: "approach",
    start: clamp(Math.round(m.travel.startGapMm * 2) / 2, 2, 60),
    end: clamp(Math.round(m.travel.endGapMm * 2) / 2, 1, 59),
    lateralShift: clamp(shift, -50, 50),
    magnetAngle: clamp(current.sensorAngle - m.relative.rotationDeg[1], -180, 180),
    magnetTilt: clamp(m.relative.rotationDeg[2], -180, 180),
    mountX: clamp(m.anchor.positionMm[0], -25, 25),
    mountZ: clamp(m.anchor.positionMm[2], -25, 25),
    mountAngle: clamp(-m.anchor.rotationDeg[1], -180, 180),
    ferromagnetic: m.environment.ferrousNearby,
    temperature: m.environment.temperature,
    targetStart: m.need ? clamp(m.need.closedFromPct, 0, 99) : current.targetStart,
    targetEnd: m.need ? clamp(m.need.closedToPct, 1, 100) : current.targetEnd,
  };
}
