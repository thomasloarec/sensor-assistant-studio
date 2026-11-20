/** Montages de démonstration : géométrie et mouvement CONNUS, définis par
 *  l'exemple (fichiers générés par scripts/generate-demo-machines.mjs).
 *  Aucun capteur ni aimant n'est imposé : la sélection courante est conservée,
 *  et les composants restent à installer dans l'étape Installation. */
import { COFFEE_ASSEMBLY } from "./machine-assembly";
import type { MachineAssembly } from "./machine-assembly";
import { EXAMPLE_CREDITS } from "./example-credits";

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
  "builtin:coffee-v1": base({
    ...structuredClone(COFFEE_ASSEMBLY),
    movingNodes: [COFFEE_ASSEMBLY.movingNode],
    motionStatus: "confirmed",
  }),
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

/** Modèles d'exemple PROPOSÉS (lot 2026-11-20) : quatre GLB réels fournis par
 *  Standex, chargés à la demande. Aucun mouvement n'est validé : pièces mobiles,
 *  course et clips restent à configurer par l'utilisateur. Les anciens exemples
 *  ci-dessus ne sont plus proposés ; ils restent lisibles pour les montages
 *  enregistrés et les tests. */
export interface ExampleModel {
  key: string;
  /** Libellé canonique français, traduit au rendu. */
  name: string;
  detail: string;
  title: string;
  author: string;
  authorUrl: string;
  license: string;
  licenseUrl: string;
  source: string;
}
const fresh = (assetKey: string, fileName: string, unitScale: number): MachineAssembly =>
  base({
    assetKey,
    fileName,
    unitScale,
    movingNodes: [],
    movingNode: "",
    travel: [0, 0, 0],
    motion: "translation",
    motionStatus: "unset",
  });
export const EXAMPLE_MODELS: ExampleModel[] = [
  { key: "builtin:blender-v2", name: "Robot de cuisine", detail: "Couvercle fermé avant démarrage.", ...EXAMPLE_CREDITS["builtin:blender-v2"]! },
  { key: "builtin:water-meter-v2", name: "Compteur d’eau", detail: "Comptage des rotations du mécanisme.", ...EXAMPLE_CREDITS["builtin:water-meter-v2"]! },
  { key: "builtin:cnc-v2", name: "Machine CNC", detail: "Détection de fermeture d’un protecteur.", ...EXAMPLE_CREDITS["builtin:cnc-v2"]! },
  { key: "builtin:hospital-bed-v2", name: "Lit médical", detail: "Détection d’une position limite du lit.", ...EXAMPLE_CREDITS["builtin:hospital-bed-v2"]! },
];
/** Échelles ILLUSTRATIVES choisies parmi les unités proposées (compteur en mètres,
 *  les trois autres en centimètres) : aucune dimension n'est lue ni certifiée par
 *  un fabricant, et l'utilisateur peut changer d'unités. Les fichiers sont inchangés. */
export const EXAMPLE_ASSEMBLIES: Record<string, MachineAssembly> = {
  "builtin:blender-v2": fresh("builtin:blender-v2", "blender.glb", 10),
  "builtin:water-meter-v2": fresh("builtin:water-meter-v2", "payton_water_meter_mechanism.glb", 1000),
  "builtin:cnc-v2": fresh("builtin:cnc-v2", "cnc_meachine.glb", 10),
  "builtin:hospital-bed-v2": fresh("builtin:hospital-bed-v2", "hospital_bed.glb", 10),
};
