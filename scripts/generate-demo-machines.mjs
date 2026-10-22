// Modèles de démonstration autonomes et reproductibles de l'atelier 3D.
// Cotes écrites en millimètres puis exportées en mètres (standard glTF).
// Aucun produit commercial ; aucun capteur ni aimant n'est inclus dans les fichiers.
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { mkdir, writeFile } from "node:fs/promises";

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
const mat = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.1 });
const M = { frame: mat("#5d6f7e"), moving: mat("#c9a26b"), metal: mat("#9aa6ae") };
function box(parent, name, size, position, m) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), m);
  mesh.name = name;
  mesh.position.set(...position);
  parent.add(mesh);
  return mesh;
}
async function save(root, file) {
  root.scale.setScalar(0.001);
  root.updateMatrixWorld(true);
  const binary = await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: true });
  await writeFile("public/models/" + file, Buffer.from(binary));
  console.log(file, binary.byteLength, "bytes");
}
await mkdir("public/models", { recursive: true });

// 1. Tiroir : caisson fixe, DEUX pièces mobiles (façade avec poignée, caisse).
{
  const root = new THREE.Group();
  root.name = "Demo_Tiroir";
  const fixed = new THREE.Group();
  fixed.name = "Caisson_fixe";
  box(fixed, "Fond", [200, 4, 180], [0, 0, 0], M.frame);
  box(fixed, "Flanc_gauche", [4, 80, 180], [-102, 40, 0], M.frame);
  box(fixed, "Flanc_droit", [4, 80, 180], [102, 40, 0], M.frame);
  box(fixed, "Dessus", [200, 4, 180], [0, 82, 0], M.frame);
  box(fixed, "Arriere", [200, 80, 4], [0, 40, -92], M.frame);
  const front = new THREE.Group();
  front.name = "Facade_tiroir";
  box(front, "Panneau_facade", [196, 76, 6], [0, 40, 93], M.moving);
  box(front, "Poignee", [80, 8, 10], [0, 40, 101], M.metal);
  const body = new THREE.Group();
  body.name = "Caisse_tiroir";
  box(body, "Fond_caisse", [190, 3, 170], [0, 6, 5], M.moving);
  box(body, "Cote_caisse_droit", [3, 50, 170], [95, 30, 5], M.moving);
  root.add(fixed, front, body);
  await save(root, "demo-tiroir-deux-pieces.glb");
}

// 2. Porte sur axe incliné de 15° dans le plan XY, charnière passant par l'origine.
{
  const root = new THREE.Group();
  root.name = "Demo_Porte_inclinee";
  const fixed = new THREE.Group();
  fixed.name = "Cadre_fixe";
  box(fixed, "Socle", [260, 6, 60], [80, -3, 0], M.frame);
  const post = new THREE.Group();
  post.rotation.z = (-15 * Math.PI) / 180;
  box(post, "Montant_charniere", [8, 300, 20], [-8, 150, 0], M.frame);
  fixed.add(post);
  const door = new THREE.Group();
  door.name = "Porte_inclinee";
  door.rotation.z = (-15 * Math.PI) / 180;
  box(door, "Panneau_porte", [200, 290, 8], [102, 150, 0], M.moving);
  root.add(fixed, door);
  await save(root, "demo-porte-axe-incline.glb");
}

// 3. Paroi de 6 mm avec un alésage Ø 8 mm (centre X0 Y60, axe Z) et un volet coulissant.
{
  const root = new THREE.Group();
  root.name = "Demo_Paroi_alesage";
  const shape = new THREE.Shape();
  shape.moveTo(-80, 0);
  shape.lineTo(80, 0);
  shape.lineTo(80, 120);
  shape.lineTo(-80, 120);
  shape.lineTo(-80, 0);
  const hole = new THREE.Path();
  hole.absarc(0, 60, 4, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const wall = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, { depth: 6, bevelEnabled: false, curveSegments: 48 }),
    M.frame,
  );
  wall.name = "Paroi_alesage";
  const slider = new THREE.Group();
  slider.name = "Volet_mobile";
  box(slider, "Plaque_volet", [60, 40, 4], [0, 60, 20], M.moving);
  root.add(wall, slider);
  await save(root, "demo-paroi-alesage.glb");
}

// 4. Bras animé (lot 2) : PARENT « Portique » avec position et rotation non
// triviales, deux sous-pièces animées DIFFÉREMMENT (chariot en translation,
// bras porté par le chariot en rotation, donc translation + rotation
// combinées), deux pièces fixes au même nom « Vis ». Trois clips :
//  - Cycle_complet (4 s) : aller puis retour inclus dans le clip ;
//  - Ouverture_seule (2 s) : aller seulement ;
//  - Etirement (2 s) : changement d'échelle, REFUSÉ par l'atelier.
// Les poses sont exprimées dans le repère local de chaque nœud (glTF).
{
  const root = new THREE.Group();
  root.name = "Demo_Bras_anime";
  const base = new THREE.Group();
  base.name = "Socle_fixe";
  box(base, "Plateau", [320, 8, 160], [80, -4, 0], M.frame);
  box(base, "Vis", [10, 10, 10], [-60, 5, 60], M.metal);
  box(base, "Vis", [10, 10, 10], [-60, 5, -60], M.metal);
  const gantry = new THREE.Group();
  gantry.name = "Portique";
  gantry.position.set(20, 30, -15);
  gantry.rotation.set((8 * Math.PI) / 180, (25 * Math.PI) / 180, 0);
  box(gantry, "Rail", [240, 10, 20], [60, 0, 0], M.frame);
  const carriage = new THREE.Group();
  carriage.name = "Chariot";
  carriage.position.set(0, 12, 0);
  box(carriage, "Plaque_chariot", [40, 14, 36], [0, 0, 0], M.moving);
  const arm = new THREE.Group();
  arm.name = "Bras";
  arm.position.set(0, 10, 0);
  box(arm, "Levier", [12, 80, 12], [0, 40, 0], M.moving);
  box(arm, "Tete", [30, 10, 24], [0, 82, 0], M.metal);
  carriage.add(arm);
  gantry.add(carriage);
  root.add(base, gantry);
  const z = (deg) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), (deg * Math.PI) / 180).toArray();
  const pos = (x) => [x, 12, 0];
  const full = new THREE.AnimationClip("Cycle_complet", 4, [
    new THREE.VectorKeyframeTrack("Chariot.position", [0, 2, 4], [...pos(0), ...pos(120), ...pos(0)]),
    new THREE.QuaternionKeyframeTrack("Bras.quaternion", [0, 1, 2, 3, 4], [...z(0), ...z(30), ...z(60), ...z(30), ...z(0)]),
  ]);
  const open = new THREE.AnimationClip("Ouverture_seule", 2, [
    new THREE.VectorKeyframeTrack("Chariot.position", [0, 2], [...pos(0), ...pos(120)]),
    new THREE.QuaternionKeyframeTrack("Bras.quaternion", [0, 2], [...z(0), ...z(45)]),
  ]);
  const stretch = new THREE.AnimationClip("Etirement", 2, [
    new THREE.VectorKeyframeTrack("Bras.scale", [0, 2], [1, 1, 1, 1, 1.6, 1]),
  ]);
  root.scale.setScalar(0.001);
  root.updateMatrixWorld(true);
  const binary = await new GLTFExporter().parseAsync(root, {
    binary: true,
    onlyVisible: true,
    trs: true,
    animations: [full, open, stretch],
  });
  await writeFile("public/models/demo-bras-anime.glb", Buffer.from(binary));
  console.log("demo-bras-anime.glb", binary.byteLength, "bytes");
}
