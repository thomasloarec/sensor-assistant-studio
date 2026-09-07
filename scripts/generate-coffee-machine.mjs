import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { mkdir, writeFile } from "node:fs/promises";
// GLTFExporter requires the browser FileReader interface for blobs.
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((result) => {
      this.result = result;
      this.onloadend?.();
    });
  }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((result) => {
      this.result = "data:" + blob.type + ";base64," + Buffer.from(result).toString("base64");
      this.onloadend?.();
    });
  }
};
const root = new THREE.Group();
root.name = "Machine_Cafe_Demonstration";
const fixed = new THREE.Group();
fixed.name = "Chassis_fixe";
const tray = new THREE.Group();
tray.name = "Bac_mobile";
root.add(fixed, tray);
const mats = {
  navy: new THREE.MeshStandardMaterial({ color: "#294357", roughness: 0.45, metalness: 0.2 }),
  black: new THREE.MeshStandardMaterial({ color: "#18232c", roughness: 0.6 }),
  metal: new THREE.MeshStandardMaterial({ color: "#b9c6cf", metalness: 0.65, roughness: 0.3 }),
  copper: new THREE.MeshStandardMaterial({ color: "#cf936e", metalness: 0.25, roughness: 0.4 }),
  glass: new THREE.MeshStandardMaterial({
    color: "#8dbbc8",
    roughness: 0.3,
    transparent: true,
    opacity: 0.48,
  }),
  light: new THREE.MeshStandardMaterial({
    color: "#81dbca",
    emissive: "#3fa48e",
    emissiveIntensity: 0.45,
  }),
  white: new THREE.MeshStandardMaterial({ color: "#e2e8ec", roughness: 0.25 }),
};
function box(group, name, size, pos, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(...size), mats[mat]);
  m.name = name;
  m.position.set(...pos);
  group.add(m);
  return m;
}
function cyl(group, name, r, h, pos, mat) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 40), mats[mat]);
  m.name = name;
  m.position.set(...pos);
  group.add(m);
  return m;
}
box(fixed, "Socle", [230, 12, 260], [0, 6, 0], "black");
box(fixed, "Panneau_gauche", [10, 90, 245], [-110, 57, -3], "navy");
box(fixed, "Panneau_droit", [10, 90, 245], [110, 57, -3], "navy");
box(fixed, "Fond_du_logement", [210, 90, 8], [0, 57, -120], "navy");
box(fixed, "Corps_superieur", [230, 218, 200], [0, 211, -30], "navy");
box(fixed, "Fascia_avant", [214, 96, 8], [0, 267, 74], "metal");
box(fixed, "Ecran", [74, 37, 3], [0, 280, 80], "black");
box(fixed, "Indicateur", [52, 3, 1], [0, 278, 82], "light");
[-64, 64].forEach((x, i) => {
  const b = cyl(fixed, "Bouton_" + i, 10, 4, [x, 277, 82], "black");
  b.rotation.x = Math.PI / 2;
});
box(fixed, "Groupe_cafe", [100, 68, 55], [0, 169, 78], "black");
[-23, 23].forEach((x, i) => cyl(fixed, "Buse_" + i, 7, 28, [x, 127, 90], "metal"));
box(fixed, "Reservoir", [62, 180, 75], [-76, 233, -65], "glass");
box(fixed, "Couvercle", [232, 10, 202], [0, 325, -30], "black");
// An open drawer, with a separate node so it can be selected and animated after import.
box(tray, "Fond_du_bac", [176, 6, 182], [0, 23, 2], "black");
box(tray, "Face_du_bac", [184, 64, 8], [0, 52, 98], "copper");
box(tray, "Paroi_gauche", [6, 50, 182], [-85, 48, 2], "black");
box(tray, "Paroi_droite", [6, 50, 182], [85, 48, 2], "black");
box(tray, "Paroi_arriere", [176, 50, 6], [0, 48, -86], "black");
box(tray, "Poignee", [75, 10, 18], [0, 59, 110], "metal");
for (let i = 0; i < 9; i++) box(tray, "Grille_" + i, [4, 3, 65], [-48 + i * 12, 81, 44], "metal");
// A small ledge clear of the drawer wall, joined to the fixed right panel.
box(fixed, "Support_capteur", [14, 3, 18], [99, 71.5, 62], "metal");
root.scale.setScalar(0.001); // glTF linear units are metres; authored dimensions above are mm.
root.userData = {
  description:
    "Machine fictive pour apprendre le placement reed / aimant. Aucun produit commercial.",
  units: "metres",
  movingPart: "Bac_mobile",
};
root.updateMatrixWorld(true);
const binary = await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: true });
await mkdir("public/models", { recursive: true });
await writeFile("public/models/machine-cafe-bac-mobile.glb", Buffer.from(binary));
console.log(
  "Generated coffee machine GLB: " + binary.byteLength + " bytes, separate chassis and drawer.",
);
