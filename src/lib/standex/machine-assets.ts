import { Box3, Group, LoadingManager, Mesh, Vector3 } from "three";
import type { BufferGeometry, Material, Object3D } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { COFFEE_ASSET } from "./machine-assembly";
import type { Vec3 } from "./magnetic-workshop";

export interface MachinePart {
  path: string;
  name: string;
  geometry: BufferGeometry;
  material: Material | Material[];
}
export interface MachineNode {
  path: string;
  name: string;
}
export interface MachineAsset {
  parts: MachinePart[];
  nodes: MachineNode[];
  size: Vec3;
  center: Vec3;
  min: Vec3;
  dispose: () => void;
}
const DB = "standex-machine-assets-v1";
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("files");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
/** Mode mémoire : rien n'est écrit sur l'appareil, le GLB vit dans l'onglet seulement. */
const memoryFiles = new Map<string, ArrayBuffer>();
async function keyFor(data: ArrayBuffer): Promise<string> {
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", data)))
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
  return "sha256:" + hash;
}
export async function storeMachineFileInMemory(file: File): Promise<string> {
  if (file.size > 30 * 1024 * 1024)
    throw new Error("Choisissez un GLB autonome de moins de 30 Mo.");
  const data = await file.arrayBuffer();
  validateGlb(data);
  const key = await keyFor(data);
  memoryFiles.set(key, data);
  return key;
}
export function clearMemoryMachineFiles() {
  memoryFiles.clear();
}
export async function storeMachineFile(file: File): Promise<string> {

  if (file.size > 30 * 1024 * 1024)
    throw new Error("Choisissez un GLB autonome de moins de 30 Mo.");
  const data = await file.arrayBuffer();
  validateGlb(data);
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", data)))
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
  const key = "sha256:" + hash,
    db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("files", "readwrite");
      tx.objectStore("files").put(data, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
  return key;
}
export function validateGlb(data: ArrayBuffer) {
  if (data.byteLength < 20 || data.byteLength > 30 * 1024 * 1024)
    throw new Error("Choisissez un GLB autonome de moins de 30 Mo.");
  const view = new DataView(data);
  if (
    view.getUint32(0, true) !== 0x46546c67 ||
    view.getUint32(4, true) !== 2 ||
    view.getUint32(8, true) !== data.byteLength
  )
    throw new Error("Ce fichier n'est pas un GLB version 2 valide.");
  const len = view.getUint32(12, true);
  if (view.getUint32(16, true) !== 0x4e4f534a || 20 + len > data.byteLength)
    throw new Error("En-tête GLB illisible.");
  const json = JSON.parse(new TextDecoder().decode(data.slice(20, 20 + len)));
  for (const item of [...(json.buffers ?? []), ...(json.images ?? [])])
    if (item.uri && !String(item.uri).startsWith("data:"))
      throw new Error(
        "Le GLB doit contenir ses ressources : les liens externes ne sont pas chargés.",
      );
  if (
    json.extensionsRequired?.some((s: string) =>
      ["KHR_draco_mesh_compression", "EXT_meshopt_compression", "KHR_texture_basisu"].includes(s),
    )
  )
    throw new Error("Exportez un GLB sans compression Draco, Meshopt ou KTX2.");
}
async function readFile(key: string): Promise<ArrayBuffer> {
  if (key === COFFEE_ASSET) {
    const r = await fetch("/models/machine-cafe-bac-mobile.glb");
    if (!r.ok) throw new Error("Exemple 3D indisponible.");
    return r.arrayBuffer();
  }
  const inMemory = memoryFiles.get(key);
  if (inMemory) return inMemory;
  const db = await database();

  try {
    return await new Promise<ArrayBuffer>((resolve, reject) => {
      const r = db.transaction("files").objectStore("files").get(key);
      r.onsuccess = () =>
        r.result
          ? resolve(r.result)
          : reject(
              new Error(
                "Le fichier 3D n'est pas présent dans ce navigateur. Réimportez le même GLB pour retrouver le montage.",
              ),
            );
      r.onerror = () => reject(r.error);
    });
  } finally {
    db.close();
  }
}
export async function loadMachineAsset(key: string, unitScale: number): Promise<MachineAsset> {
  const data = await readFile(key);
  validateGlb(data);
  const manager = new LoadingManager();
  manager.setURLModifier((url) => {
    if (url.startsWith("blob:") || url.startsWith("data:")) return url;
    throw new Error("Ressource externe non chargée.");
  });
  const gltf = await new GLTFLoader(manager).parseAsync(data, "");
  const root = gltf.scene;
  root.scale.multiplyScalar(unitScale);
  root.updateMatrixWorld(true);
  const parts: MachinePart[] = [],
    nodes: MachineNode[] = [];
  let vertices = 0;
  const collect = (o: Object3D, path: string) => {
    const containsMesh = o instanceof Mesh || o.children.length > 0;
    if (containsMesh) nodes.push({ path, name: o.name || "Pièce " + path });
    if (o instanceof Mesh) {
      vertices += o.geometry.getAttribute("position")?.count ?? 0;
      const geometry = o.geometry.clone().applyMatrix4(o.matrixWorld);
      parts.push({
        path,
        name: o.name || "Pièce " + path,
        geometry,
        material: Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone(),
      });
    }
    o.children.forEach((child, i) => collect(child, path + "/" + i));
  };
  root.children.forEach((o, i) => collect(o, String(i)));
  const view = new Group();
  parts.forEach((p) => view.add(new Mesh(p.geometry, p.material)));
  const bounds = new Box3().setFromObject(view),
    size = bounds.getSize(new Vector3()).toArray() as Vec3;
  const dispose = () => {
    for (const p of parts) {
      p.geometry.dispose();
      for (const m of Array.isArray(p.material) ? p.material : [p.material]) m.dispose();
    }
    root.traverse((o) => {
      if (o instanceof Mesh) {
        o.geometry.dispose();
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          for (const value of Object.values(m)) {
            if (value && typeof value === "object" && "isTexture" in value) {
              const t = value as unknown as { dispose: () => void; image?: { close?: () => void } };
              t.dispose();
              t.image?.close?.();
            }
          }
          m.dispose();
        }
      }
    });
  };
  if (
    !parts.length ||
    vertices > 1500000 ||
    !size.every((n) => Number.isFinite(n)) ||
    Math.max(...size) > 20000 ||
    Math.max(...size) < 0.1
  ) {
    dispose();
    throw new Error(
      "Géométrie vide, trop détaillée ou hors échelle. Vérifiez les unités et limitez le modèle à 1,5 million de sommets / 20 m.",
    );
  }
  return {
    parts,
    nodes,
    size,
    center: bounds.getCenter(new Vector3()).toArray() as Vec3,
    min: bounds.min.toArray() as Vec3,
    dispose,
  };
}
