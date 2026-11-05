/** Local STEP adapter. OCCT returns positioned meshes in millimetres; the
 * internal GLB uses metres and preserves each solid as a selectable node.
 * No file names, headers, geometry or parser diagnostics leave the browser. */
export interface StepMesh {
  name: string;
  color?: number[];
  attributes: { position: { array: number[] }; normal?: { array: number[] } };
  index: { array: number[] };
  brep_faces?: { first: number; last: number; color?: number[] | null }[];
}
export interface StepNode {
  name: string;
  meshes: number[];
  children: StepNode[];
}
export interface StepResult {
  success: boolean;
  root: StepNode;
  meshes: StepMesh[];
}
export const STEP_PARAMS = {
  linearUnit: "millimeter",
  linearDeflectionType: "absolute_value",
  linearDeflection: 0.05,
  angularDeflection: 0.25,
} as const;
export const MODEL_BYTES_LIMIT = 30 * 1024 * 1024;
export const STEP_ERROR =
  "STEP illisible ou sans géométrie exploitable. Exportez un STEP complet avec ses pièces solides.";
export const STEP_LIMIT =
  "Modèle STEP trop détaillé. Exportez uniquement le mécanisme utile, sans les petits détails.";

export function validateStep(data: ArrayBuffer) {
  if (!data.byteLength || data.byteLength > MODEL_BYTES_LIMIT)
    throw new Error("Choisissez un fichier GLB ou STEP de moins de 30 Mo.");
  const head = new TextDecoder().decode(data.slice(0, 8192)).replace(/^\uFEFF/, "");
  const tail = new TextDecoder().decode(data.slice(-4096));
  // Referenced STEP parts cannot be resolved from a single selected file. Reject
  // explicitly rather than displaying a misleading partial assembly.
  if (
    /\b(?:DOCUMENT_FILE|EXTERNAL_SOURCE)\s*\(\s*(?:IDENTIFIER\s*\(\s*)?'[^']*\.(?:stp|step)'/i.test(
      new TextDecoder().decode(data),
    )
  )
    throw new Error(STEP_ERROR);
  if (
    !/^\s*ISO-10303-21\s*;/i.test(head) ||
    !/HEADER\s*;/i.test(head) ||
    !/END-ISO-10303-21\s*;\s*$/i.test(tail)
  )
    throw new Error(STEP_ERROR);
}

/** A deterministic GLB writer: no timestamps, no browser/DOM exporter and no
 * flattening of solids. The resulting bytes use the existing private asset store. */
export function stepToGlb(result: StepResult): ArrayBuffer {
  if (!result.success || !result.root || !result.meshes?.length) throw new Error(STEP_ERROR);
  const chunks: Uint8Array[] = [];
  const bufferViews: { buffer: number; byteOffset: number; byteLength: number }[] = [];
  const accessors: object[] = [];
  let byteLength = 0,
    vertices = 0;
  const add = (a: Float32Array | Uint32Array, type: string, min?: number[], max?: number[]) => {
    if (byteLength + a.byteLength > MODEL_BYTES_LIMIT) throw new Error(STEP_LIMIT);
    const view = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: a.byteLength });
    chunks.push(new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
    byteLength += a.byteLength;
    accessors.push({
      bufferView: view,
      componentType: a instanceof Float32Array ? 5126 : 5125,
      count: a.length / (type === "VEC3" ? 3 : 1),
      type,
      ...(min ? { min, max } : {}),
    });
    return accessors.length - 1;
  };
  const color = (c?: number[] | null) =>
    c?.length === 3 && c.every((n) => Number.isFinite(n) && n >= 0 && n <= 1)
      ? c
      : [0.55, 0.58, 0.62];
  const meshes = result.meshes.map((m) => {
    const p = m.attributes?.position?.array,
      idx = m.index?.array;
    if (!p?.length || p.length % 3 || !idx?.length || idx.length % 3) throw new Error(STEP_ERROR);
    vertices += p.length / 3;
    if (vertices > 1500000 || idx.length > 9000000) throw new Error(STEP_LIMIT);
    const pos = new Float32Array(p.length),
      min = [Infinity, Infinity, Infinity],
      max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < p.length; i++) {
      const v = p[i]! / 1000;
      if (!Number.isFinite(v) || Math.abs(v) > 1e6) throw new Error(STEP_ERROR);
      pos[i] = v;
      min[i % 3] = Math.min(min[i % 3]!, pos[i]!);
      max[i % 3] = Math.max(max[i % 3]!, pos[i]!);
    }
    if (!idx.every((i) => Number.isInteger(i) && i >= 0 && i < p.length / 3))
      throw new Error(STEP_ERROR);
    const attributes: Record<string, number> = { POSITION: add(pos, "VEC3", min, max) };
    const n = m.attributes.normal?.array;
    if (n?.length === p.length && n.every(Number.isFinite))
      attributes["NORMAL"] = add(new Float32Array(n), "VEC3");
    const colors = new Float32Array(p.length),
      base = color(m.color);
    for (let i = 0; i < colors.length; i++) colors[i] = base[i % 3]!;
    for (const face of m.brep_faces ?? []) {
      if (!face.color) continue;
      if (
        !Number.isInteger(face.first) ||
        !Number.isInteger(face.last) ||
        face.first < 0 ||
        face.last * 3 + 2 >= idx.length
      )
        throw new Error(STEP_ERROR);
      const c = color(face.color);
      for (let i = face.first * 3; i <= face.last * 3 + 2; i++) colors.set(c, idx[i]! * 3);
    }
    attributes["COLOR_0"] = add(colors, "VEC3");
    return {
      name: m.name,
      primitives: [{ attributes, indices: add(new Uint32Array(idx), "SCALAR"), material: 0 }],
    };
  });
  const nodes: { name: string; mesh?: number; children?: number[] }[] = [];
  const used = new Set<number>();
  const visit = (n: StepNode, depth: number): number => {
    if (depth > 100 || nodes.length > 10000) throw new Error(STEP_LIMIT);
    const id = nodes.length,
      node: (typeof nodes)[number] = { name: n.name || "Assemblage" };
    nodes.push(node);
    const children: number[] = [];
    for (const m of n.meshes ?? []) {
      if (!Number.isInteger(m) || !meshes[m] || used.has(m)) throw new Error(STEP_ERROR);
      used.add(m);
      children.push(nodes.length);
      nodes.push({ name: meshes[m]!.name || n.name || `Pièce ${m + 1}`, mesh: m });
    }
    for (const child of n.children ?? []) children.push(visit(child, depth + 1));
    if (children.length) node.children = children;
    return id;
  };
  visit(result.root, 0);
  // Never silently discard an unreferenced part of the imported assembly.
  if (used.size !== meshes.length) throw new Error(STEP_ERROR);
  const json = new TextEncoder().encode(
    JSON.stringify({
      asset: { version: "2.0", generator: "SensorStudio_STEP_1_OCCT_0.0.23" },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes,
      meshes,
      accessors,
      bufferViews,
      buffers: [{ byteLength }],
      materials: [
        { doubleSided: true, pbrMetallicRoughness: { metallicFactor: 0, roughnessFactor: 0.75 } },
      ],
    }),
  );
  const jsonLength = Math.ceil(json.length / 4) * 4,
    total = 28 + jsonLength + byteLength;
  if (total > MODEL_BYTES_LIMIT) throw new Error(STEP_LIMIT);
  const bytes = new Uint8Array(total),
    view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.fill(32, 20, 20 + jsonLength);
  bytes.set(json, 20);
  view.setUint32(20 + jsonLength, byteLength, true);
  view.setUint32(24 + jsonLength, 0x004e4942, true);
  let offset = 28 + jsonLength;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes.buffer;
}
