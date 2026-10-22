/** Montages de démonstration : géométrie et mouvement CONNUS, définis par
 *  l'exemple (fichiers générés par scripts/generate-demo-machines.mjs).
 *  Aucun capteur ni aimant n'est imposé : la sélection courante est conservée,
 *  et les composants restent à installer dans l'étape Installation. */
import { COFFEE_ASSEMBLY } from "./machine-assembly";
import type { MachineAssembly } from "./machine-assembly";

const tilt = (15 * Math.PI) / 180;
const base = (patch: Partial<MachineAssembly>): MachineAssembly => ({
  ...structuredClone(COFFEE_ASSEMBLY),
  space: [12, 8, 12],
  sensorMount: "fixed",
  magnetMount: "fixed",
  sensorRotation: [0, 0, 0],
  magnetRotation: [0, 0, 0],
  pivot: [0, 0, 0],
  motionStatus: "confirmed",
  ...patch,
});
export const DEMO_ASSEMBLIES: Record<string, MachineAssembly> = {
  "builtin:drawer-v1": base({
    assetKey: "builtin:drawer-v1",
    fileName: "demo-tiroir-deux-pieces.glb",
    movingNodes: ["0/1", "0/2"],
    movingNode: "0/1",
    motion: "translation",
    travel: [0, 0, 120],
    axisVector: [0, 0, 1],
    sensorPosition: [125, 40, 80],
    magnetPosition: [110, 40, 80],
  }),
  "builtin:door-v1": base({
    assetKey: "builtin:door-v1",
    fileName: "demo-porte-axe-incline.glb",
    movingNodes: ["0/1"],
    movingNode: "0/1",
    motion: "rotation",
    travel: [0, 0, 0],
    axisVector: [Math.sin(tilt), Math.cos(tilt), 0],
    openingAngle: 90,
    sensorPosition: [230, 150, 30],
    magnetPosition: [200, 150, 30],
  }),
  "builtin:wall-v1": base({
    assetKey: "builtin:wall-v1",
    fileName: "demo-paroi-alesage.glb",
    movingNodes: ["0/1"],
    movingNode: "0/1",
    motion: "translation",
    travel: [40, 0, 0],
    axisVector: [1, 0, 0],
    sensorPosition: [0, 60, -20],
    magnetPosition: [0, 60, 25],
  }),
  // Lot 2 : mouvement lu dans le fichier (clip « Cycle_complet », aller et
  // retour inclus). Le mouvement saisi reste « à définir » : rien n'est supposé.
  "builtin:arm-v1": base({
    assetKey: "builtin:arm-v1",
    fileName: "demo-bras-anime.glb",
    movingNodes: [],
    movingNode: "",
    motion: "translation",
    travel: [0, 0, 0],
    motionStatus: "unset",
    motionSource: "clip",
    clip: { index: 0, name: "Cycle_complet", duration: 4 },
    sensorPosition: [-40, 20, 90],
    magnetPosition: [-60, 20, 90],
  }),
};
