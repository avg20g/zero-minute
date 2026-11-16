// Terrain mesh (257x257 verts) with per-vertex splat weights for environmentFX's shader, and rock scatter.
import THREE from '../lib/three.js';
import { N, CELL, WORLD } from '../sim/defs.js';
import { fbm, heightAt, WATER_Y } from '../sim/map.js';
import { std } from './gfx.js';

const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function roadMask(map) { // 0..1 per vertex
  const V = map.V, out = new Float32Array(V * V);
  for (const [x0, z0, x1, z1, hw] of map.roads) {
    const minX = Math.max(0, Math.floor(Math.min(x0, x1) - hw - 2)), maxX = Math.min(N, Math.ceil(Math.max(x0, x1) + hw + 2));
    const minZ = Math.max(0, Math.floor(Math.min(z0, z1) - hw - 2)), maxZ = Math.min(N, Math.ceil(Math.max(z0, z1) + hw + 2));
    const dx = x1 - x0, dz = z1 - z0, l2 = dx * dx + dz * dz || 1;
    for (let j = minZ; j <= maxZ; j++) for (let i = minX; i <= maxX; i++) {
      const t = Math.min(1, Math.max(0, ((i - x0) * dx + (j - z0) * dz) / l2));
      const d = Math.hypot(i - (x0 + dx * t), j - (z0 + dz * t)) + (fbm(i * 0.4, j * 0.4, 31) - 0.5) * 1.6;
      const v = sstep(hw + 1.2, hw - 0.8, d);
      if (v > out[j * V + i]) out[j * V + i] = v;
    }
  }
  // paved plaza around the town blocks
  if (map.biome !== 'woods') for (const [cx, cz] of map.civs) for (let j = cz - 3; j <= cz + 9; j++) for (let i = cx - 3; i <= cx + 9; i++) {
    const d = Math.max(Math.abs(i - (cx + 3)) - 4, Math.abs(j - (cz + 3)) - 4);
    const v = sstep(2.5, 0.5, d) * 0.85; if (v > out[j * V + i]) out[j * V + i] = v;
  }
  return out;
}

// Per-vertex data for the splat shader: `splat` = weights for (sand, rock, asphalt, dirt) and
// `color` = a gentle large-scale tint so no two dunes look identical.
export function terrainAttributes(map) {
  const V = map.V, H = map.height, road = roadMask(map);
  const pos = new Float32Array(V * V * 3), col = new Float32Array(V * V * 3), splat = new Float32Array(V * V * 4);
  // dark, churned pads around every Supply Dock and Oil Derrick
  const pad = new Float32Array(V * V);
  const stamp = (cx, cz, w, h, reach) => { for (let j = Math.max(0, cz - reach); j <= Math.min(N, cz + h + reach); j++) for (let i = Math.max(0, cx - reach); i <= Math.min(N, cx + w + reach); i++) {
    const d = Math.hypot(Math.max(cx - i, 0, i - cx - w), Math.max(cz - j, 0, j - cz - h)) + (fbm(i * 0.5, j * 0.5, 57) - 0.5) * 3, v = sstep(reach, reach * 0.35, d); if (v > pad[j * V + i]) pad[j * V + i] = v; } };
  for (const d of map.docks) stamp(d.x, d.z, 8, 6, 9);
  for (const d of map.derricks || []) stamp(d[0], d[1], 4, 4, 6);
  for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
    const k = j * V + i;
    pos[k * 3] = i * CELL; pos[k * 3 + 1] = H[k]; pos[k * 3 + 2] = j * CELL;
    const i0 = Math.max(0, i - 1), i1 = Math.min(N, i + 1), j0 = Math.max(0, j - 1), j1 = Math.min(N, j + 1);
    const slope = Math.hypot(H[j * V + i1] - H[j * V + i0], H[j1 * V + i] - H[j0 * V + i]) / (2 * CELL);
    const flat = 1 - sstep(0.2, 0.6, map.rock[k]);                       // roads and pads only on the canyon floor
    let rock = sstep(0.3, 0.8, slope), asphalt = sstep(0.45, 0.9, road[k]) * flat;
    let dirt = Math.max(pad[k] * flat, sstep(0.08, 0.4, road[k]) * (1 - sstep(0.45, 0.9, road[k])) * 0.6 * flat); // pads + dusty road shoulders
    if (map.hasWater) { const wet = sstep(WATER_Y + 0.5, WATER_Y - 0.5, H[k]); rock *= 1 - wet; dirt = Math.max(dirt, wet); asphalt *= 1 - wet; } // muddy river bed and banks
    asphalt *= 1 - pad[k] * 0.6; rock = Math.min(1, rock);
    const rest = 1 - rock; asphalt *= rest; dirt = Math.min(dirt, 1 - asphalt) * rest;
    const sand = Math.max(0, 1 - rock - asphalt - dirt);
    splat[k * 4] = sand; splat[k * 4 + 1] = rock; splat[k * 4 + 2] = asphalt; splat[k * 4 + 3] = dirt;
    const n1 = fbm(i * 0.035, j * 0.035, 41), n2 = fbm(i * 0.31, j * 0.31, 43), top = sstep(0.55, 0.95, map.rock[k]);
    const t = (0.86 + 0.26 * n1) * (0.94 + 0.12 * n2);                    // broad dune-to-dune variation
    col[k * 3] = t * (1 + 0.05 * top); col[k * 3 + 1] = t * (1 - 0.03 * top) * (0.97 + 0.06 * n1); col[k * 3 + 2] = t * (1 - 0.1 * top) * (0.92 + 0.12 * n1);
  }
  return { pos, col, splat };
}
// The 2 km maps are drawn with a vertex every 4 m instead of every 2 m (the game rules still use 2 m cells): a quarter of the triangles.
export const terrainStep = () => (N > 512 ? 2 : 1);
export function buildTerrain(map, material) {
  const V0 = map.V, full = terrainAttributes(map), st = terrainStep(), M = N / st, V = M + 1;
  let { pos, col, splat } = full;
  if (st > 1) { // keep every second vertex
    pos = new Float32Array(V * V * 3); col = new Float32Array(V * V * 3); splat = new Float32Array(V * V * 4);
    for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
      const k = j * V + i, s = (j * st) * V0 + i * st;
      for (let c = 0; c < 3; c++) { pos[k * 3 + c] = full.pos[s * 3 + c]; col[k * 3 + c] = full.col[s * 3 + c]; }
      for (let c = 0; c < 4; c++) splat[k * 4 + c] = full.splat[s * 4 + c];
    }
  }
  const idx = new Uint32Array(M * M * 6);
  let q = 0;
  for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
    const a = j * V + i, b = a + 1, c = a + V, d = c + 1;
    idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = b; idx[q++] = c; idx[q++] = d;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('splat', new THREE.BufferAttribute(splat, 4));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = true; mesh.castShadow = true;
  mesh.matrixAutoUpdate = false;
  return mesh;
}

// Boulders along cliff feet and scattered across the dunes (visual only; all on blocked cells or tiny).
export function buildRocks(map) {
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const mat = std(0x8a6348, 0.95, 0, { flatShading: true });
  const spots = [];
  let s = 9173;
  const rnd = () => (s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296;
  for (let tries = 0; tries < 60000 && spots.length < 520; tries++) {
    const x = 4 + Math.floor(rnd() * (N - 8)), z = 4 + Math.floor(rnd() * (N - 8));
    if (!map.blocked[z * N + x]) continue;
    const e = map.rock[z * map.V + x];
    if (e < 0.04 || e > 0.55) continue; // lower part of a cliff face
    spots.push([(x + rnd()) * CELL, (z + rnd()) * CELL, 0.7 + rnd() * rnd() * 2.6]);
  }
  const mesh = new THREE.InstancedMesh(geo, mat, spots.length);
  const m = new THREE.Matrix4(), p = new THREE.Vector3(), qt = new THREE.Quaternion(), sc = new THREE.Vector3(), eu = new THREE.Euler();
  spots.forEach((sp, i) => {
    p.set(sp[0], heightAt(map, sp[0], sp[1]) + sp[2] * 0.15, sp[1]);
    eu.set(rnd() * 6.28, rnd() * 6.28, rnd() * 6.28); qt.setFromEuler(eu);
    sc.set(sp[2] * (0.8 + rnd() * 0.6), sp[2] * (0.55 + rnd() * 0.5), sp[2] * (0.8 + rnd() * 0.6));
    m.compose(p, qt, sc); mesh.setMatrixAt(i, m);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  return mesh;
}
export { WORLD };

// ---------------------------------------------------------------- water, bridges, trees (woods maps)
// One flat, slightly see-through sheet at the water level: the terrain is only below it inside river and sea beds.
// Its colour comes from a texture with one texel per cell: deep water is dark, and the strip along the shore where
// ships cannot go (`shore`: the ship clearance field, 0 on land up to 6 well out) is paler. A small tiled bump
// texture drifts across it for the shimmer (see View.render).
export function buildWater(map, shore) {
  const snow = map.biome === 'snow', deep = snow ? [143, 182, 201] : [36, 96, 124], pale = snow ? [186, 214, 226] : [96, 170, 178];
  const data = new Uint8Array(N * N * 4);
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    const k = ((N - 1 - z) * N + x) * 4, d = shore ? shore[z * N + x] : 6, t = map.water[z * N + x] ? Math.min(1, Math.max(0, (d - 1) / 5)) : 0, u = t * t * (3 - 2 * t);
    data[k] = pale[0] + (deep[0] - pale[0]) * u; data[k + 1] = pale[1] + (deep[1] - pale[1]) * u; data[k + 2] = pale[2] + (deep[2] - pale[2]) * u; data[k + 3] = 255;
  }
  const tint = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.UnsignedByteType); tint.magFilter = tint.minFilter = THREE.LinearFilter; tint.colorSpace = THREE.SRGBColorSpace; tint.needsUpdate = true;
  const B = 64, bd = new Uint8Array(B * B * 4);
  for (let j = 0; j < B; j++) for (let i = 0; i < B; i++) { // ripples that tile: sums of whole-number waves
    const a = i / B * 6.2831853, b = j / B * 6.2831853, v = 0.5 + 0.2 * Math.sin(a * 3 + b * 2) + 0.16 * Math.sin(a * 5 - b * 4 + 1.3) + 0.12 * Math.sin(a * 2 + b * 7 + 0.4), k = (j * B + i) * 4;
    bd[k] = bd[k + 1] = bd[k + 2] = Math.max(0, Math.min(255, v * 255)); bd[k + 3] = 255;
  }
  const bump = new THREE.DataTexture(bd, B, B, THREE.RGBAFormat, THREE.UnsignedByteType); bump.wrapS = bump.wrapT = THREE.RepeatWrapping; bump.magFilter = bump.minFilter = THREE.LinearFilter; bump.repeat.set(WORLD / 26, WORLD / 26); bump.needsUpdate = true;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(WORLD, WORLD), std(0xffffff, snow ? 0.25 : 0.12, 0.25, { transparent: true, opacity: snow ? 0.9 : 0.8, map: tint, bumpMap: bump, bumpScale: snow ? 0.15 : 0.5 }));   // snow maps: pale, nearly opaque ice-water
  m.rotation.x = -Math.PI / 2; m.position.set(WORLD / 2, WATER_Y, WORLD / 2); m.receiveShadow = true; m.renderOrder = 1;
  m.userData.bump = bump;
  return m;
}
// A bridge is a causeway (the river bed is not cut under it) with a plank deck, kerbs and end posts.
export function buildBridges(map) {
  const g = new THREE.Group(), box = new THREE.BoxGeometry(1, 1, 1), deck = std(0x6f6253, 0.92, 0), rail = std(0x4a4138, 0.9, 0.1);
  for (const [x0, z0, x1, z1, hw] of map.bridges) {
    const b = new THREE.Group(), len = Math.hypot(x1 - x0, z1 - z0) * CELL + 6, wid = hw * 2 * CELL - 2, mx = (x0 + x1) / 2 * CELL, mz = (z0 + z1) / 2 * CELL;
    b.position.set(mx, heightAt(map, mx, mz) + 0.12, mz); b.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
    const add = (mat, sx, sy, sz, x, y, z) => { const m = new THREE.Mesh(box, mat); m.scale.set(sx, sy, sz); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; b.add(m); };
    add(deck, len, 0.3, wid, 0, 0, 0);
    for (const k of [-1, 1]) { add(rail, len, 0.7, 0.3, 0, 0.5, k * (wid / 2 + 0.1)); for (const e of [-1, 1]) add(rail, 0.6, 1.5, 0.6, e * (len / 2 - 0.3), 0.75, k * (wid / 2 + 0.1)); }
    g.add(b);
  }
  return g;
}
// Every tree is one instance of a shared trunk and a shared crown: two draw calls for the whole forest.
export function buildTrees(map) {
  const g = new THREE.Group(), n = map.trees.length / 3; if (!n) return g;
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.32, 1, 6), std(0x4b3826, 0.95, 0), n);
  const crown = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 7), std(map.biome === 'snow' ? 0x9db8aa : 0x2f5a2c, 0.95, 0, { flatShading: true }), n);   // pines carry snow on snow maps
  const M = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const x = map.trees[i * 3], z = map.trees[i * 3 + 1], s = map.trees[i * 3 + 2], y = heightAt(map, x, z), h = 5.5 * s;
    p.set(x, y + h * 0.2, z); sc.set(s, h * 0.4, s); M.compose(p, q, sc); trunk.setMatrixAt(i, M);
    p.set(x, y + h * 0.68, z); sc.set(1.9 * s, h * 0.75, 1.9 * s); M.compose(p, q, sc); crown.setMatrixAt(i, M);
  }
  for (const m of [trunk, crown]) { m.instanceMatrix.needsUpdate = true; m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; g.add(m); }
  return g;
}
