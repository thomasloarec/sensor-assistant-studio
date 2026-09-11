import type { WorkshopConfig } from "../magnetic-workshop";
import { componentPose, movingRotation, add as addV, scale as scaleV } from "../machine-assembly";
import type { MachineAssembly } from "../machine-assembly";
import { MOUNTING_CONTRACT_VERSION } from "./contract";
import type { GuidedMounting, MotionKind } from "./contract";
import { profileFor } from "./profiles";
import type { MountingProfile } from "./profiles";
import type { Pose, Vec3 } from "./geometry";
import {
  applyMat,
  composeRotations,
  matFromEuler,
  matMul,
  matTranspose,
  relativeRotation,
  sub,
  surfaceGapMm,
  toLocalPoint,
  toWorldPoint,
} from "./geometry";
import { withComputed } from "./simulate";

const lateralAxis = (approachId: string): Vec3 => (approachId === "D3" ? [0, 0, 1] : [1, 0, 0]);
const approachAxis = (approachId: string): Vec3 => (approachId === "D3" ? [1, 0, 0] : [0, 0, 1]);
/** Point du cycle utilisé pour lire la pose d'un montage importé. 0 = repos. */
export const REFERENCE_CYCLE_POINT = 0;

/** Pose monde (repère du modèle) d'un composant du montage importé, au point `u`. */
export function machineComponentPose(
  machine: MachineAssembly,
  which: "sensor" | "magnet",
  u: number,
): Pose {
  const { position } = componentPose(machine, which, u);
  const own = which === "sensor" ? machine.sensorRotation : machine.magnetRotation;
  const moving = (which === "sensor" ? machine.sensorMount : machine.magnetMount) === "moving";
  return {
    positionMm: [...position] as Vec3,
    rotationDeg: moving ? composeRotations(movingRotation(machine, u), own) : ([...own] as Vec3),
  };
}
/** Inverse exact de `machineComponentPose` : repose la pose de base d'un composant,
 * fixe ou mobile, en défaisant réellement la transformation du mouvement au point `u`. */
export function componentBaseFromWorldPose(
  machine: MachineAssembly,
  which: "sensor" | "magnet",
  world: Pose,
  u: number,
): { position: Vec3; rotation: Vec3 } {
  const moving = (which === "sensor" ? machine.sensorMount : machine.magnetMount) === "moving";
  if (!moving)
    return {
      position: [...world.positionMm] as Vec3,
      rotation: [...world.rotationDeg] as Vec3,
    };
  const mov = movingRotation(machine, u);
  const rotation = relativeRotation(mov, world.rotationDeg);
  if (machine.motion === "translation")
    return { position: addV(world.positionMm as Vec3, scaleV(machine.travel, -u)), rotation };
  const inverse = matTranspose(matFromEuler(mov));
  const local = applyMat(inverse, sub(world.positionMm, machine.pivot as Vec3));
  return { position: addV(machine.pivot, local), rotation };
}
/** Compatibilité : même inverse, restreint à l'aimant. */
export function magnetBaseFromWorldPose(
  machine: MachineAssembly,
  world: Pose,
  u: number,
): { magnetPosition: Vec3; magnetRotation: Vec3 } {
  if (machine.magnetMount !== "moving")
    return {
      magnetPosition: [...world.positionMm] as Vec3,
      magnetRotation: [...world.rotationDeg] as Vec3,
    };
  const mov = movingRotation(machine, u);
  const inverse = matTranspose(matFromEuler(mov));
  const magnetRotation = relativeRotation(mov, world.rotationDeg);
  if (machine.motion === "translation")
    return {
      magnetPosition: addV(world.positionMm as Vec3, scaleV(machine.travel, -u)),
      magnetRotation,
    };
  const local = applyMat(inverse, sub(world.positionMm, machine.pivot as Vec3));
  return { magnetPosition: addV(machine.pivot, local), magnetRotation };
}
const motionKindOf = (c: WorkshopConfig): MotionKind => {
  if (!c.machine) return c.motion;
  return c.machine.motion === "rotation" ? "pivot" : "slide";
};

/** Vue « montage guidé » d'une configuration d'atelier. Aucune donnée n'est inventée :
 * le contrat ne fait que nommer explicitement ce que l'atelier manipule déjà. */
export function mountingFromWorkshop(
  c: WorkshopConfig,
  u: number = REFERENCE_CYCLE_POINT,
): GuidedMounting {
  const profile = profileFor(c.sensorId, c.magnetModel, c.geometry);
  const lateral = lateralAxis(c.geometry);
  const machine = c.machine;
  const anchor: Pose = machine
    ? machineComponentPose(machine, "sensor", u)
    : { positionMm: [c.mountX, 0, c.mountZ], rotationDeg: [0, -c.mountAngle, 0] };
  const relative: Pose = machine
    ? relativePoseInMachine(machine, u)
    : {
        positionMm: lateral.map((v) => v * c.lateralShift) as Vec3,
        rotationDeg: [0, -(c.magnetAngle - c.sensorAngle), c.magnetTilt],
      };
  const travel = machine
    ? machineTravelGaps(c, machine, profile)
    : { startGapMm: c.start, endGapMm: c.end };
  return withComputed({
    version: MOUNTING_CONTRACT_VERSION,
    mode: c.mode,
    motion: {
      kind: motionKindOf(c),
      initialContact: c.initialContact,
      // Espace vide : `mountAngle` tourne tout le montage (couple + trajectoire),
      // `sensorAngle` tourne le capteur seul par rapport à l'axe du mouvement.
      // Montage importé : l'axe réel n'est pas caractérisé, la limite dédiée
      // `CUSTOM_MODEL_NOT_CHARACTERISED` couvre déjà ce cas.
      sensorYawDeg: c.machine ? 0 : c.sensorAngle,
    },
    profileId: profile?.id ?? null,
    profileRevision: profile?.revision ?? null,
    profileSource: profile?.provenance.sourceRef ?? null,
    couple: {
      sensorId: c.sensorId,
      magnetId: c.magnetModel,
      sensitivityClass: c.sensitivity,
      approachId: c.geometry,
      magnetization: c.magnetization,
      polarity: c.polarity,
    },
    anchor,
    attachment: {
      frame: machine ? "custom_model" : "template",
      parentNode: machine?.movingNode || null,
      movingPart: machine ? machine.magnetMount === "moving" || machine.sensorMount === "moving" : false,
    },
    relative,
    travel,
    environment: { ferrousNearby: c.ferromagnetic, temperature: c.temperature },
    need: { closedFromPct: c.targetStart, closedToPct: c.targetEnd },
    cable: null,
    computed: null,
  });
}
/** Pose de l'aimant dans le repère du capteur, repères local et monde convertis. */
export function relativePoseInMachine(machine: MachineAssembly, u: number): Pose {
  const sensor = machineComponentPose(machine, "sensor", u);
  const magnet = machineComponentPose(machine, "magnet", u);
  return {
    positionMm: toLocalPoint(sensor, magnet.positionMm),
    rotationDeg: relativeRotation(sensor.rotationDeg, magnet.rotationDeg),
  };
}
/** Entrefers de surface aux deux extrêmes du cycle du montage importé. */
function machineTravelGaps(
  c: WorkshopConfig,
  machine: MachineAssembly,
  profile: MountingProfile | null,
): { startGapMm: number; endGapMm: number } {
  const axis = profile?.axis ?? approachAxis(c.geometry);
  const gapAtCycle = (u: number) =>
    surfaceGapMm(c.sensorId, c.magnetModel, relativePoseInMachine(machine, u), axis);
  // Le cycle du montage importé va de 0 (repos) à 1 (ouverture totale) :
  // lire 0.5 ne donnait qu'une demi-course.
  const rest = gapAtCycle(0),
    open = gapAtCycle(1);
  return rest >= open ? { startGapMm: rest, endGapMm: open } : { startGapMm: open, endGapMm: rest };
}

/**
 * Trajectoire du modèle importé emportée par un déplacement RIGIDE du montage.
 *
 * Le déplacement est lu sur la pose monde du capteur : rotation `R` entre son
 * orientation actuelle et la nouvelle, point d'appui déplacé de `c` vers `c'`.
 * Une translation pure ne change rien à la trajectoire. Une rotation tourne le
 * vecteur de course, et déplace réellement le pivot d'un mouvement rotatif.
 *
 * Un axe de rotation machine ne peut s'écrire que sur x, y ou z : si la
 * rotation ne renvoie pas l'axe sur lui-même, la trajectoire n'est pas
 * représentable dans ce modèle et elle est laissée INCHANGÉE plutôt que
 * réécrite approximativement.
 */
export function rigidlyMovedMotion(
  machine: MachineAssembly,
  u: number,
  sensorWorld: Pose,
): Partial<MachineAssembly> {
  const before = machineComponentPose(machine, "sensor", u);
  const rot = matMul(
    matFromEuler(sensorWorld.rotationDeg),
    matTranspose(matFromEuler(before.rotationDeg)),
  );
  const identity: number[] = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  if ((rot as number[]).every((v, i) => Math.abs(v - identity[i]!) <= ROTATION_EPSILON)) return {};
  if (machine.motion === "translation") return { travel: applyMat(rot, machine.travel as Vec3) };
  const index = { x: 0, y: 1, z: 2 }[machine.rotationAxis];
  const axis: Vec3 = [0, 0, 0];
  axis[index] = 1;
  const turned = applyMat(rot, axis);
  const parallel = turned.every((v, i) => Math.abs(Math.abs(v) - (i === index ? 1 : 0)) <= ROTATION_EPSILON);
  if (!parallel) return {};
  const pivot = addV(
    sensorWorld.positionMm as Vec3,
    applyMat(rot, sub(machine.pivot as Vec3, before.positionMm)),
  );
  return { pivot };
}
const ROTATION_EPSILON = 1e-9;

/**
 * Retour vers l'atelier. La suggestion aligne UNIQUEMENT la pose : la course,
 * le besoin, le mouvement, l'environnement, le modèle importé et ses attaches
 * ne sont jamais réécrits, et aucune distance n'est arrondie.
 */
export function workshopPatchFromMounting(
  m: GuidedMounting,
  current: WorkshopConfig,
  u: number = REFERENCE_CYCLE_POINT,
): Partial<WorkshopConfig> {
  const couple: Partial<WorkshopConfig> = {
    sensorId: m.couple.sensorId,
    magnetModel: m.couple.magnetId,
    sensitivity: m.couple.sensitivityClass as WorkshopConfig["sensitivity"],
    geometry: m.couple.approachId as WorkshopConfig["geometry"],
    magnetization: m.couple.magnetization,
    polarity: m.couple.polarity,
  };
  if (current.machine) {
    // Montage importé : les DEUX composants suivent réellement le contrat.
    // `anchor` fixe la pose monde du capteur, `relative` celle de l'aimant dans
    // le repère capteur. Le modèle, ses attaches, sa course et son nœud mobile
    // sont conservés à l'identique.
    const sensorWorld: Pose = {
      positionMm: [...m.anchor.positionMm] as Vec3,
      rotationDeg: [...m.anchor.rotationDeg] as Vec3,
    };
    const magnetWorld: Pose = {
      positionMm: toWorldPoint(sensorWorld, m.relative.positionMm),
      rotationDeg: composeRotations(sensorWorld.rotationDeg, m.relative.rotationDeg),
    };
    // Un déplacement RIGIDE du montage emmène aussi sa trajectoire : sans cela,
    // faire pivoter le couple de 45° dans un modèle importé changeait les
    // entrefers de course et faisait basculer un montage couvert en « hors
    // domaine » alors que la géométrie relative était inchangée.
    const moved = rigidlyMovedMotion(current.machine, u, sensorWorld);
    const machine = { ...current.machine, ...moved };
    const s = componentBaseFromWorldPose(machine, "sensor", sensorWorld, u);
    const g = componentBaseFromWorldPose(machine, "magnet", magnetWorld, u);
    return {
      ...couple,
      machine: {
        ...machine,
        sensorPosition: s.position,
        sensorRotation: s.rotation,
        magnetPosition: g.position,
        magnetRotation: g.rotation,
      },
    };
  }
  const lateral = lateralAxis(m.couple.approachId);
  const shift = m.relative.positionMm.reduce((sum, v, i) => sum + v * lateral[i]!, 0);
  return {
    ...couple,
    lateralShift: shift,
    // Fidèle au contrat : la course déclarée est recopiée telle quelle, jamais arrondie.
    start: m.travel.startGapMm,
    end: m.travel.endGapMm,
    magnetAngle: current.sensorAngle - m.relative.rotationDeg[1],
    magnetTilt: m.relative.rotationDeg[2],
    mountX: m.anchor.positionMm[0],
    mountZ: m.anchor.positionMm[2],
    mountAngle: -m.anchor.rotationDeg[1],
  };
}
