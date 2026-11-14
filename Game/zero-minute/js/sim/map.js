// Deterministic 256x256 desert / urban canyon skirmish map.
// Layout is point-mirrored (x,z) -> (N-x, N-z) so both sides are fair.
import { N, CELL, MESA_H } from './defs.js';

function hash2(x, z, s) {
  let h = Math.imul(x, 374761393) + Math.imul(z, 668265263) + Math.imul(s, 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, z, s) {
  const xi = Math.floor(x), zi = Math.floor(z);
  let fx = x - xi, fz = z - zi;
  fx = fx * fx * (3 - 2 * fx); fz = fz * fz * (3 - 2 * fz);
  const a = hash2(xi, zi, s), b = hash2(xi + 1, zi, s), c = hash2(xi, zi + 1, s), d = hash2(xi + 1, zi + 1, s);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}
export function fbm(x, z, s) {
  return vnoise(x, z, s) * 0.55 + vnoise(x * 2.03, z * 2.03, s + 7) * 0.3 + vnoise(x * 4.1, z * 4.1, s + 13) * 0.15;
}
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Rounded-rect mesas [cx, cz, halfW, halfH, cornerR] in cells (one half; mirrored below)
const MESA_HALF = [
  [47, 127, 57, 15, 7],     // west ridge (plateau, crossed by ramps)
  [104, 216.5, 8, 48.5, 6], // wall east of the south-west base
  [142, 182, 6, 5, 4],
  [192, 224, 9, 6, 5],
  [224, 177, 7, 5, 4],
];
// Ramps: top-centre (cells), direction, length, half-width
const RAMP_HALF = [
  { x: 46, z: 142.5, dx: 0, dz: 1, len: 16, hw: 6 },
  { x: 46, z: 111.5, dx: 0, dz: -1, len: 16, hw: 6 },
];
const mirrorRect = (x, z, w, h) => [N - x - w, N - z - h];

// A map is described by a small "spec". Lists marked (half) hold one side only: the generator mirrors
// every entry through the map centre, so both players always get the same ground. The lobby's
// map builder edits a spec; generateMap() turns one into heights, blocked cells and features.
//   mesas (half)    [cx, cz, halfW, halfH, cornerR]   rock plateaus, in cells
//   ramps (half)    { x, z, dx, dz, len, hw }         slopes up onto a mesa
//   docks (half)    { x, z, amount }                  Supply Docks (8 x 6 cells, top-left cell)
//   derricks (half) [x, z]                            Oil Derricks (4 x 4)
//   civs (half)     [x, z]                            civilian buildings (6 x 6)
//   roads (half)    [x0, z0, x1, z1, halfWidth]
//   start           [x, z]                            your Command Center (10 x 10); the enemy gets the mirror
export const DEFAULT_MAP = {
  name: 'Desert Canyon', mesas: MESA_HALF, ramps: RAMP_HALF,
  civsFixed: [[114, 117], [136, 117], [114, 132], [136, 132]], civs: [],
  docks: [{ x: 62, z: 222, amount: 30000 }, { x: 160, z: 200, amount: 30000 }],
  roads: [[127.5, 127.5, 127.5, 162, 5], [104, 127.5, 127.5, 127.5, 4], [127.5, 162, 104, 156, 4], [104, 156, 62, 182, 3.5], [62, 182, 48, 200, 3.5], [46, 162, 46, 196, 3]],
  derricks: [[92, 152]], start: [30, 196], rampTop: [46, 127],
};
export const OPEN_MAP = { name: 'Open Desert', mesas: [], ramps: [], civs: [[118, 100]], docks: [{ x: 62, z: 222, amount: 30000 }, { x: 120, z: 190, amount: 30000 }], roads: [[35, 201, 127.5, 127.5, 4]], derricks: [[92, 152]], start: [30, 196] };
export const FOOT = { dock: [8, 6], derrick: [4, 4], civ: [6, 6], start: [10, 10] };
export const cloneSpec = (s) => JSON.parse(JSON.stringify(s));

export function generateMap(spec) {
  const S = spec || DEFAULT_MAP;
  const mesas = [], ramps = [];
  for (const m of S.mesas || []) { mesas.push(m); mesas.push([N - m[0], N - m[1], m[2], m[3], m[4]]); }
  for (const r of S.ramps || []) { ramps.push(r); ramps.push({ x: N - r.x, z: N - r.z, dx: -r.dx, dz: -r.dz, len: r.len, hw: r.hw }); }

  const V = N + 1;
  const height = new Float32Array(V * V);
  const rock = new Float32Array(V * V); // 0 floor .. 1 mesa (for texturing)

  for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
    const en = (fbm(i * 0.085, j * 0.085, 3) - 0.5) * 5.0; // wobble canyon walls
    let m = sstep(1.3, -1.3, Math.min(i, j, N - i, N - j) - 8 + en);
    for (const q of mesas) {
      const qx = Math.abs(i - q[0]) - (q[2] - q[4]), qz = Math.abs(j - q[1]) - (q[3] - q[4]);
      if (qx > q[4] + 6 || qz > q[4] + 6) continue;       // far outside this mesa: it cannot raise the ground here
      const d = Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - q[4] + en;
      m = Math.max(m, sstep(1.3, -1.3, d));
    }
    let r = 0, carve = 0;
    for (const q of ramps) {
      const ax = i - q.x, az = j - q.z;
      const a = ax * q.dx + az * q.dz, l = Math.abs(ax * q.dz - az * q.dx);
      if (a < -5 || a > q.len + 2) continue;
      const lat = sstep(q.hw + 0.7, q.hw - 0.7, l);
      r = Math.max(r, lat * (1 - Math.min(1, Math.max(0, a / q.len))));
      if (a >= -1) carve = Math.max(carve, lat);
    }
    const e = Math.max(m * (1 - carve), r);
    const dune = (fbm(i * 0.045, j * 0.045, 11) - 0.5) * 1.6;
    height[j * V + i] = MESA_H * e + dune * (1 - 0.7 * e);
    rock[j * V + i] = e;
  }

  const blocked = new Uint8Array(N * N);
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    const a = height[z * V + x], b = height[z * V + x + 1], c = height[(z + 1) * V + x], d = height[(z + 1) * V + x + 1];
    const steep = Math.max(a, b, c, d) - Math.min(a, b, c, d) > 1.5;
    if (steep || x < 3 || z < 3 || x >= N - 3 || z >= N - 3) blocked[z * N + x] = 1;
  }

  // Features (top-left cell of each footprint), mirrored through the centre
  const both = (list, w, h, f) => { const out = []; for (const q of list || []) { out.push(f(q, false)); out.push(f(q, true)); } return out; };
  const civs = (S.civsFixed || []).map(c => c.slice()).concat(both(S.civs, 6, 6, (c, mir) => mir ? mirrorRect(c[0], c[1], 6, 6) : c.slice()));
  const docks = both(S.docks, 8, 6, (d, mir) => { if (!mir) return { x: d.x, z: d.z, amount: d.amount }; const [mx, mz] = mirrorRect(d.x, d.z, 8, 6); return { x: mx, z: mz, amount: d.amount }; });
  const roads = both(S.roads, 0, 0, (r, mir) => mir ? [N - r[0], N - r[1], N - r[2], N - r[3], r[4]] : r.slice());
  const derricks = both(S.derricks, 4, 4, (d, mir) => mir ? mirrorRect(d[0], d[1], 4, 4) : d.slice());
  const st = S.start, sc = [st[0] + 5, st[1] + 5];
  // choke point the AI watches: the top of the first ramp, or (no ramps) a point a third of the way to the centre
  const rt = S.rampTop || (S.ramps && S.ramps[0] ? [S.ramps[0].x, S.ramps[0].z] : [sc[0] + (N / 2 - sc[0]) / 3, sc[1] + (N / 2 - sc[1]) / 3]);
  return {
    N, V, height, rock, blocked, civs, docks, derricks, roads, ramps, mirrorRect, custom: !!spec, name: S.name || 'Custom',
    start: [{ cc: [st[0], st[1]] }, { cc: mirrorRect(st[0], st[1], 10, 10) }],
    rampTop: [{ x: rt[0] * CELL, z: rt[1] * CELL }, { x: (N - rt[0]) * CELL, z: (N - rt[1]) * CELL }],
  };
}

// Checks a spec before a match starts. Errors stop the match; warnings do not.
// Returns { ok, errors, warnings, map } with the generated map so the caller can draw a preview.
export const MAP_LIMITS = { mesas: 24, docks: 6, derricks: 8, civs: 12, roads: 16 };
export function validateMap(spec) {
  const errors = [], warnings = [];
  const S = spec; let map = null;
  const num = (v) => typeof v === 'number' && isFinite(v);
  if (!S || !Array.isArray(S.start) || !num(S.start[0]) || !num(S.start[1])) return { ok: false, errors: ['The map has no start position.'], warnings, map };
  for (const k in MAP_LIMITS) if ((S[k] || []).length > MAP_LIMITS[k]) errors.push(`Too many ${k}: at most ${MAP_LIMITS[k]} per side.`);
  if (errors.length) return { ok: false, errors, warnings, map };
  map = generateMap(S);
  const B = map.blocked, [sx, sz] = S.start;
  if (sx < 18 || sz < 18 || sx + 10 > N - 18 || sz + 10 > N - 18) errors.push('Your Command Center is too close to the map edge.');
  else {
    let bad = 0, n = 0; for (let z = sz - 14; z < sz + 24; z++) for (let x = sx - 14; x < sx + 24; x++) { n++; if (B[z * N + x]) bad++; }
    if (bad / n > 0.04) errors.push('The start area needs open ground: keep rock at least 14 cells away from the Command Center.');
  }
  if (Math.hypot(sx + 5 - N / 2, sz + 5 - N / 2) < 60) errors.push('The two bases are too close together. Move the start further from the centre.');
  // footprints: in bounds, on open ground, not overlapping each other or a base
  const rects = [{ n: 'your base', r: [sx - 3, sz - 3, 16, 16] }, { n: 'the enemy base', r: [map.start[1].cc[0] - 3, map.start[1].cc[1] - 3, 16, 16] }];
  const items = [].concat(map.docks.map(d => ['Supply Dock', d.x, d.z, 8, 6]), map.derricks.map(d => ['Oil Derrick', d[0], d[1], 4, 4]), map.civs.map(c => ['Building', c[0], c[1], 6, 6]));
  const occupied = new Uint8Array(N * N);
  for (const [name, x, z, w, h] of items) {
    if (x < 4 || z < 4 || x + w > N - 4 || z + h > N - 4) { errors.push(`${name} at ${x}, ${z} is off the map.`); continue; }
    let rocky = 0; for (let j = z; j < z + h; j++) for (let i = x; i < x + w; i++) if (B[j * N + i]) rocky++;
    if (rocky) errors.push(`${name} at ${x}, ${z} sits on rock.`);
    for (const o of rects) if (x < o.r[0] + o.r[2] && x + w > o.r[0] && z < o.r[1] + o.r[3] && z + h > o.r[1]) { errors.push(`${name} at ${x}, ${z} overlaps ${o.n}.`); break; }
    rects.push({ n: `another object at ${x}, ${z}`, r: [x, z, w, h] });
    for (let j = z; j < z + h; j++) for (let i = x; i < x + w; i++) occupied[j * N + i] = 1;
  }
  if (!map.docks.length) errors.push('Add at least one Supply Dock: without one nobody can earn money.');
  // one flood fill from the builder's spawn cell tells us what each side can reach by ground
  if (!errors.length) {
    const seen = new Uint8Array(N * N), q = new Int32Array(N * N); let qh = 0, qt = 0;
    const s0 = (sz + 18) * N + (sx + 8); seen[s0] = 1; q[qt++] = s0;
    while (qh < qt) {
      const c = q[qh++], cx = c % N, cz = (c / N) | 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = cx + dx, z = cz + dz; if (x < 0 || z < 0 || x >= N || z >= N) continue; const k = z * N + x; if (seen[k] || B[k] || occupied[k]) continue; seen[k] = 1; q[qt++] = k; }
    }
    const [ex, ez] = map.start[1].cc;
    if (!seen[(ez - 9) * N + (ex + 1)]) errors.push('There is no ground route between the two bases. Open a gap in the rock or add a ramp.');
    const touches = (x, z, w, h) => { for (let i = x - 1; i <= x + w; i++) if (seen[(z - 1) * N + i] || seen[(z + h) * N + i]) return true; for (let j = z; j < z + h; j++) if (seen[j * N + x - 1] || seen[j * N + x + w]) return true; return false; };
    let reach = 0; for (const d of map.docks) if (touches(d.x, d.z, 8, 6)) reach++;
    if (!reach) errors.push('No Supply Dock can be reached from your base.'); else if (reach < map.docks.length) warnings.push(`${map.docks.length - reach} Supply Dock(s) cannot be reached by ground.`);
    let open = 0; for (let k = 0; k < N * N; k++) if (seen[k]) open++;
    if (open / (N * N) < 0.25) warnings.push('Less than a quarter of the map is reachable ground: armies will have little room.');
  }
  return { ok: !errors.length, errors, warnings, map };
}

// Bilinear terrain height at world coords
export function heightAt(map, wx, wz) {
  const V = map.V;
  let fx = wx / CELL, fz = wz / CELL;
  fx = Math.min(N - 0.001, Math.max(0, fx)); fz = Math.min(N - 0.001, Math.max(0, fz));
  const xi = fx | 0, zi = fz | 0, tx = fx - xi, tz = fz - zi, h = map.height, o = zi * V + xi;
  return (h[o] * (1 - tx) + h[o + 1] * tx) * (1 - tz) + (h[o + V] * (1 - tx) + h[o + V + 1] * tx) * tz;
}
