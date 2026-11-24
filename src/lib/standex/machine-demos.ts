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

/** Modèles proposés (2026-11-24) : quatre GLB pédagogiques, chargés à la demande. Aucun mouvement n'est validé : pièces mobiles,
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
  adapted?: boolean;
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
/* i18n-canonical : noms et descriptions traduits au rendu. */
export const EXAMPLE_MODELS: ExampleModel[] = [
  { key: "builtin:window-v3", name: "Fenêtre ouvrante", detail: "Détecter l’ouverture d’une fenêtre.", adapted: true, ...EXAMPLE_CREDITS["builtin:window-v3"]! },
  { key: "builtin:wall-flap-v3", name: "Volet et paroi percée", detail: "Installer un capteur cylindrique dans un passage de 8 mm.", ...EXAMPLE_CREDITS["builtin:wall-flap-v3"]! },
  { key: "builtin:rotary-counter-v3", name: "Compteur à roues dentées", detail: "Compter les rotations de deux roues indépendantes.", adapted: true, ...EXAMPLE_CREDITS["builtin:rotary-counter-v3"]! },
  { key: "builtin:pneumatic-cylinder-v3", name: "Vérin à piston", detail: "Détecter la position du piston dans un corps transparent.", adapted: true, ...EXAMPLE_CREDITS["builtin:pneumatic-cylinder-v3"]! },
];
/** Fichiers en mètres, sans mouvement ni montage imposé. Les clips réparés du
 * compteur et du vérin restent disponibles dans « Animation du fichier ». */
export const EXAMPLE_ASSEMBLIES: Record<string, MachineAssembly> = {
  "builtin:window-v3": fresh("builtin:window-v3", "window-opening-v3.glb", 1000),
  "builtin:wall-flap-v3": fresh("builtin:wall-flap-v3", "wall-flap-v3.glb", 1000),
  "builtin:rotary-counter-v3": fresh("builtin:rotary-counter-v3", "rotary-counter-v3.glb", 1000),
  "builtin:pneumatic-cylinder-v3": fresh("builtin:pneumatic-cylinder-v3", "pneumatic-cylinder-v3.glb", 1000),
};
