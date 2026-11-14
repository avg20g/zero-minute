// Pure mesh data helpers used by modelFactory.js. No Three.js and no DOM in
// here, so both can be unit-tested in Node:
//   prismPositions  convex profile -> extruded solid (flat-shaded triangles)
//   parseGLB        binary glTF 2.0 -> plain node / primitive / material data

// ---------------------------------------------------------------- prisms
// Extrude a CONVEX polygon. `mode` says which plane the profile lives in:
//   'side'  pts are [x, y] (a side elevation), extruded across Z by `depth`
//   'plan'  pts are [x, z] (a top view),       extruded up Y by `depth`
// Returns non-indexed triangle positions with every face wound outward.
export function prismPositions(pts, depth, mode = 'side') {
  const n = pts.length, h = depth / 2, tris = [];
  const P = (i, w) => mode === 'side' ? [pts[i][0], pts[i][1], w] : [pts[i][0], w, pts[i][1]];
  for (let i = 1; i < n - 1; i++) { tris.push([P(0, h), P(i, h), P(i + 1, h)]); tris.push([P(0, -h), P(i + 1, -h), P(i, -h)]); }
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; tris.push([P(i, -h), P(j, -h), P(j, h)]); tris.push([P(i, -h), P(j, h), P(i, h)]); }
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < n; i++) { const p = P(i, 0); cx += p[0] / n; cy += p[1] / n; cz += p[2] / n; }
  const out = new Float32Array(tris.length * 9);
  tris.forEach((t, k) => {
    const [a, b, c] = t;
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const mx = (a[0] + b[0] + c[0]) / 3 - cx, my = (a[1] + b[1] + c[1]) / 3 - cy, mz = (a[2] + b[2] + c[2]) / 3 - cz;
    const v = nx * mx + ny * my + nz * mz < 0 ? [a, c, b] : [a, b, c]; // face away from the centroid
    for (let i = 0; i < 3; i++) out.set(v[i], k * 9 + i * 3);
  });
  return out;
}
export function isConvex(pts) {
  let sign = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n], c = pts[(i + 2) % n];
    const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(cr) < 1e-9) continue;
    if (sign && Math.sign(cr) !== sign) return false;
    sign = Math.sign(cr);
  }
  return true;
}

// ---------------------------------------------------------------- 4x4 maths (column-major, like glTF)
const IDENT = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
export function composeTRS(t = [0, 0, 0], q = [0, 0, 0, 1], s = [1, 1, 1]) {
  const [x, y, z, w] = q, x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
  return [(1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0, (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
    (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0, t[0], t[1], t[2], 1];
}
export function mulMat(a, b) {
  const o = new Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  return o;
}

// ---------------------------------------------------------------- GLB
const COMP = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const NORM = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 };
const SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

// Supported subset: embedded-buffer .glb, triangle meshes (POSITION / NORMAL /
// TEXCOORD_0 / indices), node hierarchy, PBR base colour, metallic, roughness
// and an embedded base-colour image. Not supported: Draco / meshopt
// compression, KTX2 textures, skins, morph targets, animations, external .bin.
export function parseGLB(buffer) {
  const dv = new DataView(buffer);
  if (dv.byteLength < 20 || dv.getUint32(0, true) !== 0x46546C67) throw new Error('not a GLB file');
  if (dv.getUint32(4, true) !== 2) throw new Error('only glTF 2.0 is supported');
  let off = 12, json = null, bin = null;
  while (off + 8 <= dv.byteLength) {
    const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true), start = off + 8;
    if (type === 0x4E4F534A) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, start, len)));
    else if (type === 0x004E4942) bin = new Uint8Array(buffer, start, len);
    off = start + len;
  }
  if (!json) throw new Error('GLB has no JSON chunk');
  for (const ext of json.extensionsRequired || []) throw new Error('unsupported glTF extension: ' + ext);
  if ((json.buffers || []).some((b, i) => i > 0 || b.uri)) throw new Error('external buffers are not supported');

  const view = (i) => { const v = json.bufferViews[i]; return { off: v.byteOffset || 0, len: v.byteLength, stride: v.byteStride || 0 }; };
  const accessor = (i) => {
    const a = json.accessors[i], Ctor = COMP[a.componentType], size = SIZE[a.type];
    if (!Ctor || !size || a.sparse || a.bufferView === undefined) throw new Error('unsupported accessor');
    const v = view(a.bufferView), bpe = Ctor.BYTES_PER_ELEMENT, start = bin.byteOffset + v.off + (a.byteOffset || 0);
    const out = new Ctor(a.count * size), src = new DataView(bin.buffer, start), step = v.stride || bpe * size;
    const get = { 5120: 'getInt8', 5121: 'getUint8', 5122: 'getInt16', 5123: 'getUint16', 5125: 'getUint32', 5126: 'getFloat32' }[a.componentType];
    for (let k = 0; k < a.count; k++) for (let c = 0; c < size; c++) out[k * size + c] = src[get](k * step + c * bpe, true);
    if (a.normalized && NORM[a.componentType]) { const f = new Float32Array(out.length), m = NORM[a.componentType]; for (let k = 0; k < out.length; k++) f[k] = Math.max(-1, out[k] / m); return f; }
    return out;
  };
  const materials = (json.materials || []).map((m) => {
    const p = m.pbrMetallicRoughness || {}, tex = p.baseColorTexture ? (json.textures || [])[p.baseColorTexture.index] : null;
    const img = tex && tex.source !== undefined ? json.images[tex.source] : null;
    let image = null;
    if (img && img.bufferView !== undefined) { const v = view(img.bufferView); image = { bytes: bin.slice(v.off, v.off + v.len), mime: img.mimeType || 'image/png' }; }
    return { name: m.name || '', color: p.baseColorFactor || [1, 1, 1, 1], metalness: p.metallicFactor ?? 1, roughness: p.roughnessFactor ?? 1, doubleSided: !!m.doubleSided, image };
  });
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  let triangles = 0;
  const node = (i, parent) => {
    const n = json.nodes[i], local = n.matrix ? n.matrix.slice() : composeTRS(n.translation, n.rotation, n.scale), world = mulMat(parent, local);
    const prims = [];
    if (n.mesh !== undefined) for (const p of json.meshes[n.mesh].primitives) {
      if ((p.mode ?? 4) !== 4 || p.attributes.POSITION === undefined) continue; // triangles only
      if (p.extensions && p.extensions.KHR_draco_mesh_compression) throw new Error('Draco-compressed meshes are not supported');
      const position = accessor(p.attributes.POSITION);
      const prim = { position, normal: p.attributes.NORMAL !== undefined ? accessor(p.attributes.NORMAL) : null, uv: p.attributes.TEXCOORD_0 !== undefined ? accessor(p.attributes.TEXCOORD_0) : null,
        index: p.indices !== undefined ? accessor(p.indices) : null, material: p.material ?? -1 };
      for (let k = 0; k < position.length; k += 3) {
        const x = position[k], y = position[k + 1], z = position[k + 2];
        const w = [world[0] * x + world[4] * y + world[8] * z + world[12], world[1] * x + world[5] * y + world[9] * z + world[13], world[2] * x + world[6] * y + world[10] * z + world[14]];
        for (let c = 0; c < 3; c++) { if (w[c] < min[c]) min[c] = w[c]; if (w[c] > max[c]) max[c] = w[c]; }
      }
      triangles += (prim.index ? prim.index.length : position.length / 3) / 3;
      prims.push(prim);
    }
    return { name: n.name || '', matrix: local, prims, children: (n.children || []).map(c => node(c, world)) };
  };
  const scene = json.scenes ? json.scenes[json.scene || 0] : { nodes: json.nodes.map((_, i) => i) };
  const roots = scene.nodes.map(i => node(i, IDENT));
  if (!triangles) throw new Error('GLB contains no triangle meshes');
  return { roots, materials, bounds: { min, max }, triangles };
}
