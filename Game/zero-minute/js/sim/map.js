// Deterministic 256x256 desert / urban canyon skirmish map.
// Layout is point-mirrored (x,z) -> (N-x, N-z) so both sides are fair.
import { N, CELL, MESA_H, setMapSize } from './defs.js';

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
//   sites (half)    [x, z, kind]                      capturable sites (4 x 4): kind 'repair' | 'hospital' | 'radar' | 'gun'
//   civs (half)     [x, z]                            civilian buildings (6 x 6)
//   roads (half)    [x0, z0, x1, z1, halfWidth]
//   civs (half)     [x, z, kind]                      kind is an index into CIV_KINDS (see below)
//   water (half)    [x0, z0, x1, z1, halfWidth]       river segments: blocked for everything except amphibious units and aircraft
//   bridges (half)  [x0, z0, x1, z1, halfWidth]       crossings: the river is not cut inside a bridge strip
//   paint (half)    [x, z, radius, kind]              free-hand brush stamps: kind 0 rock, 1 gentle hill (units drive over it), 2 water
//   islands (half)  [cx, cz, radiusX, radiusZ]        sea maps: when present, everything outside these ellipses is water
//   coast           cells                             how far the shoreline of islands and wide water wanders (0 = smooth)
//   rim             false                             no rock wall round the map edge (open sea to the horizon)
//   naval           true                              the map has sea for fleets: the AI builds a shipyard here
//   size            256 | 512 | 1024                  cells per side (2 m each); default 256
//   biome           'desert' | 'woods' | 'urban' | 'snow'   ground textures; woods and snow grow trees (trees: 0..1 density)
//   start           [x, z]                            your Command Center (10 x 10); the enemy gets the mirror
export const DEFAULT_MAP = {
  name: 'Desert Canyon', mesas: MESA_HALF, ramps: RAMP_HALF,
  civsFixed: [[114, 117], [136, 117], [114, 132], [136, 132]], civs: [],
  docks: [{ x: 62, z: 222, amount: 30000 }, { x: 160, z: 200, amount: 30000 }],
  roads: [[127.5, 127.5, 127.5, 162, 5], [104, 127.5, 127.5, 127.5, 4], [127.5, 162, 104, 156, 4], [104, 156, 62, 182, 3.5], [62, 182, 48, 200, 3.5], [46, 162, 46, 196, 3]],
  derricks: [[92, 152]], start: [30, 196], rampTop: [46, 127],
};
export const OPEN_MAP = { name: 'Open Desert', mesas: [], ramps: [], civs: [[118, 100]], docks: [{ x: 62, z: 222, amount: 30000 }, { x: 120, z: 190, amount: 30000 }], roads: [[35, 201, 127.5, 127.5, 4]], derricks: [[92, 152]], start: [30, 196] };
// Civilian building kinds the map builder offers (index = the building's `variant`). Names only: the models live in render/models.js.
export const CIV_KINDS = ['Apartment block', 'Market hall', 'Office tower', 'Mosque', 'Warehouse', 'Farmhouse', 'Log cabin', 'Barn', 'Fuel station', 'Water tower'];
export const WATER_Y = -0.9, WATER_DEPTH = 2.6;   // water surface height, and how far the river bed is cut below the ground
// Woods map: a river runs corner to corner between the bases, with three bridges, rocky hills, cabins and thick forest.
export const FOREST_MAP = {
  name: 'Forest River', biome: 'woods', trees: 0.45,
  mesas: [[62, 120, 10, 8, 5], [182, 216, 12, 7, 5]], ramps: [],
  water: [[8, 38, 90, 100, 5], [90, 100, 128, 128, 5]],
  bridges: [[134, 119.5, 122, 136.5, 4.5], [56.5, 61, 43.5, 79, 4.5]],
  roads: [[40, 200, 100, 160, 3], [100, 160, 123, 135, 3], [58, 182, 49, 82, 3]],
  docks: [{ x: 62, z: 222, amount: 30000 }, { x: 150, z: 204, amount: 30000 }], derricks: [[96, 150]],
  civs: [[112, 172, 6], [72, 152, 7], [128, 150, 5]], start: [30, 196],
};
// City map: paved ground, a street grid, raised city blocks nobody can drive over, and 48 buildings to garrison. No water.
export const URBAN_MAP = {
  name: 'Urban Megacity', biome: 'urban', ramps: [],
  mesas: [[70, 100, 12, 9, 3], [112, 178, 9, 7, 3], [56, 150, 7, 6, 3], [128, 156, 7, 5, 3], [170, 216, 10, 6, 3]],
  roads: [[35, 201, 127.5, 127.5, 5], [20, 164, 236, 164, 3.5], [92, 20, 92, 236, 3.5], [20, 128, 128, 128, 4], [128, 128, 128, 236, 4], [150, 164, 150, 236, 3], [20, 192, 20, 128, 3]],
  docks: [{ x: 62, z: 222, amount: 30000 }, { x: 150, z: 196, amount: 30000 }], derricks: [[100, 150], [38, 132]],
  civs: [[24, 136, 0], [50, 136, 2], [76, 136, 0], [154, 136, 1], [180, 136, 2], [206, 136, 4], [24, 150, 0], [76, 150, 2], [180, 150, 8], [219, 150, 0], [141, 178, 2], [167, 178, 9], [193, 178, 0], [219, 178, 2], [102, 192, 0], [141, 192, 1], [193, 192, 2], [219, 192, 4], [102, 206, 0], [141, 206, 2], [206, 206, 8], [76, 220, 0], [115, 220, 2], [193, 220, 9]], start: [30, 196],
};
// Snow map: an oil field in the middle (ten derricks in all), a frozen inlet in two corners, a ridge with ramps, low hills and sparse pines.
export const ARCTIC_MAP = {
  name: 'Arctic Refinery', biome: 'snow', trees: 0.22,
  mesas: [[60, 112, 26, 7, 6], [176, 222, 14, 6, 5], [118, 190, 6, 9, 4]], ramps: [{ x: 60, z: 119.5, dx: 0, dz: 1, len: 14, hw: 6 }, { x: 60, z: 104.5, dx: 0, dz: -1, len: 14, hw: 6 }],
  water: [[14, 30, 60, 52, 8], [60, 52, 96, 44, 6]], bridges: [],
  paint: [[26, 44, 14, 2], [40, 62, 10, 2], [200, 170, 9, 1], [150, 232, 8, 1]],
  roads: [[35, 201, 100, 160, 3.5], [100, 160, 127.5, 127.5, 4], [100, 160, 160, 196, 3], [60, 134, 100, 160, 3]],
  docks: [{ x: 62, z: 222, amount: 30000 }, { x: 140, z: 206, amount: 30000 }],
  derricks: [[92, 150], [112, 138], [140, 156], [58, 96], [30, 150]],
  civs: [[100, 172, 8], [124, 160, 4], [84, 136, 9], [150, 176, 4], [112, 122, 8], [136, 136, 9], [70, 176, 5]], start: [30, 196],
};
// ---------------------------------------------------------------- the lobby's maps
// The five specs above are the original 512 m layouts (256 cells). They are kept as small, fast fixtures for the test
// suites. The game plays them at twice the width and length: scaleSpec() doubles every position and the size of rock,
// rivers and roads, but not the footprints of buildings, and keeps the first Supply Dock at its old distance from the
// Command Center so the opening economy is unchanged. `extra` then adds what the new room is for (already in big-map
// cells): an expansion dock, flank derricks, villages, more road.
export const SITE_KINDS = ['repair', 'hospital', 'radar', 'gun'];
// A town block: `cols` x `rows` civilian buildings on a street grid, `pitch` cells from one to the next (a building
// is 6 cells, so the default leaves 6 m streets), with a main street each way through the middle. `kinds` is read
// row by row. Returns { civs, roads } in the same half-map form as a spec's own lists.
export function town(x, z, cols, rows, kinds, pitch = 9) {
  const civs = [], w = (cols - 1) * pitch + 6, h = (rows - 1) * pitch + 6, mc = x + Math.floor(cols / 2) * pitch - 1.5, mr = z + Math.floor(rows / 2) * pitch - 1.5;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) civs.push([x + c * pitch, z + r * pitch, kinds[(r * cols + c) % kinds.length]]);
  const roads = []; if (rows > 1) roads.push([x - 4, mr, x + w + 4, mr, 1.5]); if (cols > 1) roads.push([mc, z - 4, mc, z + h + 4, 1.5]);
  return { civs, roads };
}
const towns = (...list) => ({ civs: list.flatMap(t => t.civs), roads: list.flatMap(t => t.roads) });
export function scaleSpec(S, k = 2, extra = {}) {
  const c = (v, half) => (v + half) * k - half;   // scale a footprint by its centre, keeping its size
  const seg = (r, wk) => [r[0] * k, r[1] * k, r[2] * k, r[3] * k, r[4] * wk];
  const st = S.start, o = { ...S, size: (S.size || 256) * k, name: S.name };
  o.start = [c(st[0], 5), c(st[1], 5)];
  o.mesas = (S.mesas || []).map(m => m.map(v => v * k));
  o.ramps = (S.ramps || []).map(r => ({ x: r.x * k, z: r.z * k, dx: r.dx, dz: r.dz, len: r.len * k, hw: r.hw * k }));
  o.water = (S.water || []).map(r => seg(r, k)); o.bridges = (S.bridges || []).map(r => seg(r, 1.4));
  o.paint = (S.paint || []).map(p => [p[0] * k, p[1] * k, p[2] * k, p[3]]);
  o.roads = (S.roads || []).map(r => seg(r, 1.25));
  o.docks = (S.docks || []).map((d, i) => i ? { x: c(d.x, 4), z: c(d.z, 3), amount: d.amount } : { x: o.start[0] + d.x - st[0], z: o.start[1] + d.z - st[1], amount: d.amount });
  o.derricks = (S.derricks || []).map(d => [c(d[0], 2), c(d[1], 2)]);
  o.sites = (S.sites || []).map(d => [c(d[0], 2), c(d[1], 2), d[2]]);
  o.civs = (S.civs || []).map(v => [c(v[0], 3), c(v[1], 3), v[2]]);
  if (S.civsFixed) o.civsFixed = S.civsFixed.map(v => [c(v[0], 3), c(v[1], 3), v[2]]);
  if (S.rampTop) o.rampTop = [S.rampTop[0] * k, S.rampTop[1] * k];
  if (S.islands) o.islands = S.islands.map(q => q.map(v => v * k));
  for (const key of ['docks', 'derricks', 'sites', 'civs', 'roads', 'paint', 'water', 'bridges', 'mesas']) if (extra[key]) o[key] = o[key].concat(extra[key]);
  return o;
}
const D3 = 30000;   // every Supply Dock holds the same
// Civilian buildings stand together as towns (batch 14): a city of sixteen blocks either side of the central avenue on
// Desert Canyon, a downtown and districts on Urban Megacity, villages elsewhere. Each side also has two capturable
// sites: one nearer its own base, one nearer the enemy's (the mirror of the other side's near one).
const bare = (S) => ({ ...S, civs: [], civsFixed: undefined });   // the small maps' scattered buildings are replaced, not scaled
const T_CANYON = towns(town(229, 236, 2, 4, [0, 2, 1, 0, 2, 3, 0, 1]), town(438, 370, 3, 2, [5, 7, 6, 4, 8, 5]));
export const CANYON_BIG = scaleSpec(bare(DEFAULT_MAP), 2, {   // third dock up on the ridge plateau; derricks in the far corner and the south gap; the city in the middle, a farm village in the east basin
  docks: [{ x: 150, z: 248, amount: D3 }], derricks: [[468, 468], [250, 470]], sites: [[330, 420, 'repair'], [250, 180, 'gun']],
  civs: T_CANYON.civs, roads: [[330, 400, 446, 388, 3.75]].concat(T_CANYON.roads),
});
const T_OPEN = towns(town(204, 262, 3, 3, [0, 1, 2, 4, 3, 0, 2, 0, 8]), town(410, 388, 3, 2, [5, 7, 6, 9, 5, 6]));
export const OPEN_BIG = scaleSpec(bare(OPEN_MAP), 2, {        // third dock in the far corner with a village; a town either side of the centre
  docks: [{ x: 400, z: 440, amount: D3 }], derricks: [[60, 250], [300, 470]], sites: [[150, 300, 'hospital'], [256, 150, 'radar']],
  civs: T_OPEN.civs, roads: [[256, 256, 404, 432, 3.75], [100, 430, 300, 466, 3.5]].concat(T_OPEN.roads),
});
const T_FOREST = towns(town(140, 336, 3, 2, [6, 5, 7, 6, 6, 5]), town(220, 330, 2, 2, [6, 7, 5, 6]));
export const FOREST_BIG = scaleSpec(bare(FOREST_MAP), 2, {    // third dock on the west bank; derricks by the river and in the south woods; a logging town and a hamlet
  docks: [{ x: 40, z: 200, amount: D3 }], derricks: [[60, 156], [200, 470]], sites: [[120, 280, 'repair'], [300, 380, 'radar']],
  civs: T_FOREST.civs, roads: [[98, 200, 50, 204, 3.5]].concat(T_FOREST.roads),
});
const T_URBAN = towns(town(140, 300, 4, 3, [0, 2, 0, 1, 2, 0, 3, 2, 0, 2, 1, 0]), town(300, 330, 3, 3, [2, 0, 2, 0, 1, 0, 2, 0, 4]), town(120, 440, 4, 2, [0, 4, 8, 0, 4, 0, 9, 4]), town(440, 390, 2, 3, [0, 2, 4, 0, 8, 4]));
export const URBAN_BIG = scaleSpec(bare(URBAN_MAP), 2, {      // third dock in the south-east; downtown, a second district, an industrial quarter and an east-side block
  docks: [{ x: 450, z: 470, amount: D3 }], derricks: [[474, 330], [228, 484]], sites: [[230, 420, 'hospital'], [360, 250, 'gun']],
  civs: T_URBAN.civs, roads: T_URBAN.roads,
});
const T_ARCTIC = towns(town(216, 290, 3, 3, [4, 8, 9, 4, 9, 8, 4, 5, 9]), town(118, 468, 3, 2, [6, 5, 7, 6, 5, 6]));
export const ARCTIC_BIG = scaleSpec(bare(ARCTIC_MAP), 2, {    // third dock on the west flank; the refinery town by the oil field, a trappers' village in the south
  docks: [{ x: 30, z: 340, amount: D3 }], derricks: [[250, 484]], sites: [[160, 350, 'repair'], [330, 300, 'radar']],
  civs: T_ARCTIC.civs, roads: [[100, 430, 150, 462, 3.5]].concat(T_ARCTIC.roads),
});
// ---- the two sea maps: 2 km x 2 km (1,024 cells). Both keep a land route between the bases; the sea is for fleets.
// Strait of Sand: a channel about 550 m wide runs corner to corner between the bases and stops short of both far corners,
// which leaves a neck of land at each end. Each base has a harbour inlet off the channel.
const T_STRAIT = towns(town(176, 694, 3, 2, [5, 4, 6, 9, 8, 5]), town(64, 176, 3, 2, [5, 7, 6, 4, 5, 6]), town(138, 432, 2, 2, [0, 1, 3, 4]));
export const STRAIT_MAP = {
  name: 'Strait of Sand', size: 1024, biome: 'desert', naval: true, coast: 12,
  water: [[262, 262, 762, 762, 135], [420, 604, 290, 730, 55]], bridges: [],
  mesas: [[205, 470, 26, 16, 9], [84, 330, 20, 14, 8], [70, 940, 34, 14, 8], [470, 860, 28, 14, 8], [330, 990, 30, 10, 7]], ramps: [],
  roads: [[155, 805, 120, 500, 4.5], [120, 500, 96, 300, 4.5], [96, 300, 110, 130, 4.5], [165, 815, 324, 904, 4.5], [324, 904, 624, 934, 4.5], [624, 934, 914, 894, 4.5], [165, 800, 236, 748, 3.5]].concat(T_STRAIT.roads),
  docks: [{ x: 182, z: 826, amount: D3 }, { x: 56, z: 700, amount: D3 }, { x: 330, z: 826, amount: D3 }, { x: 50, z: 372, amount: D3 }],
  derricks: [[116, 640], [250, 866], [56, 520], [150, 384], [430, 936], [650, 962]],
  civs: T_STRAIT.civs, sites: [[230, 780, 'repair'], [120, 560, 'gun']],
  start: [150, 800],
};
// Emerald Isles: each base on its own large island, open sea all round. A central island joins the two by long
// causeways (the land route: narrow, and in reach of ships' guns). Two small wooded islets are scenery and cover.
const T_ISLES = towns(town(258, 718, 3, 2, [6, 5, 7, 6, 5, 6]), town(106, 732, 2, 2, [5, 8, 4, 5]), town(474, 480, 2, 2, [0, 1, 3, 2]));
export const ISLES_MAP = {
  name: 'Emerald Isles', size: 1024, biome: 'woods', trees: 0.4, naval: true, coast: 14, rim: false,
  islands: [[232, 800, 190, 168], [512, 512, 108, 108], [215, 260, 62, 46]], water: [],
  bridges: [[330, 698, 452, 572, 8]],
  mesas: [[306, 846, 16, 11, 6], [130, 706, 14, 10, 6], [214, 258, 20, 12, 6]], ramps: [],
  roads: [[215, 805, 330, 698, 4], [330, 698, 452, 572, 6], [452, 572, 512, 512, 4], [215, 810, 130, 866, 3.5]].concat(T_ISLES.roads),
  docks: [{ x: 237, z: 821, amount: D3 }, { x: 110, z: 858, amount: D3 }, { x: 196, z: 676, amount: D3 }, { x: 462, z: 536, amount: D3 }],
  derricks: [[300, 906], [96, 770], [346, 770], [168, 924], [548, 566]],
  civs: T_ISLES.civs, sites: [[300, 820, 'hospital'], [500, 560, 'radar']],
  start: [205, 795],
};
// The maps the lobby offers, in order. `id` is what the lobby and saved settings use.
export const MAPS = [
  { id: 'canyon', name: 'Desert Canyon', desc: '1 km. Ridges, ramps and a walled base', spec: CANYON_BIG },
  { id: 'open', name: 'Open Desert', desc: '1 km. No rock: wide open ground', spec: OPEN_BIG },
  { id: 'forest', name: 'Forest River', desc: '1 km. Woods, a river and three bridges', spec: FOREST_BIG },
  { id: 'urban', name: 'Urban Megacity', desc: '1 km. Street grid, city blocks, towns to garrison', spec: URBAN_BIG },
  { id: 'arctic', name: 'Arctic Refinery', desc: '1 km. Snow, a frozen inlet, oil fields', spec: ARCTIC_BIG },
  { id: 'strait', name: 'Strait of Sand', desc: '2 km. A sea channel between the bases, harbours, two land necks', spec: STRAIT_MAP },
  { id: 'isles', name: 'Emerald Isles', desc: '2 km. Island bases, open sea, one long causeway road', spec: ISLES_MAP },
];
// Ground types: name for the lobby, flat colours for the minimap and the map builder (open ground, rock), and whether trees grow.
export const BIOMES = {
  desert: { name: 'Desert', rgb: [198, 166, 114], rock: [158, 120, 84], cliff: [104, 76, 56], trees: false },
  woods: { name: 'Woods (grass and trees)', rgb: [104, 132, 78], rock: [128, 112, 92], cliff: [84, 72, 58], trees: true },
  urban: { name: 'City (paved)', rgb: [150, 150, 146], rock: [118, 118, 122], cliff: [78, 78, 84], trees: false },
  snow: { name: 'Snow', rgb: [226, 232, 238], rock: [150, 156, 166], cliff: [96, 102, 114], trees: true },
};
export const FOOT = { dock: [8, 6], derrick: [4, 4], civ: [6, 6], start: [10, 10] };
export const cloneSpec = (s) => JSON.parse(JSON.stringify(s));

export function generateMap(spec) {
  const S = spec || DEFAULT_MAP;
  setMapSize(S.size || 256);   // every size-dependent array below, and in the Nav and Fog built next, follows from this
  const mesas = [], ramps = [], rivers = [], bridges = [];
  const seg2 = (r, mir) => mir ? [N - r[0], N - r[1], N - r[2], N - r[3], r[4]] : r.slice();
  for (const r of S.water || []) { rivers.push(seg2(r, false)); rivers.push(seg2(r, true)); }
  for (const r of S.bridges || []) { bridges.push(seg2(r, false)); bridges.push(seg2(r, true)); }
  const rocks = [], hills = [];   // brush stamps [x, z, r]; a water stamp is simply a river segment of zero length
  for (const p of S.paint || []) for (const q of [[p[0], p[1], p[2]], [N - p[0], N - p[1], p[2]]]) { if (p[3] === 2) rivers.push([q[0], q[1], q[0], q[1], q[2]]); else (p[3] === 1 ? hills : rocks).push(q); }
  const segD = (px, pz, q) => { const vx = q[2] - q[0], vz = q[3] - q[1], l2 = vx * vx + vz * vz || 1, t = Math.min(1, Math.max(0, ((px - q[0]) * vx + (pz - q[1]) * vz) / l2)); return Math.hypot(px - q[0] - vx * t, pz - q[1] - vz * t); };
  for (const m of S.mesas || []) { mesas.push(m); mesas.push([N - m[0], N - m[1], m[2], m[3], m[4]]); }
  const isles = []; for (const q of S.islands || []) { isles.push(q); isles.push([N - q[0], N - q[1], q[2], q[3]]); }
  const coast = S.coast || 0, rim = S.rim !== false;
  for (const r of S.ramps || []) { ramps.push(r); ramps.push({ x: N - r.x, z: N - r.z, dx: -r.dx, dz: -r.dz, len: r.len, hw: r.hw }); }

  const V = N + 1;
  const wetV = new Float32Array(V * V);   // 0..1: how deep in the river each vertex is
  const height = new Float32Array(V * V);
  const rock = new Float32Array(V * V); // 0 floor .. 1 mesa (for texturing)

  for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
    const en = (fbm(i * 0.085, j * 0.085, 3) - 0.5) * 5.0; // wobble canyon walls
    let m = rim ? sstep(1.3, -1.3, Math.min(i, j, N - i, N - j) - 8 + en) : 0;
    for (const q of mesas) {
      const qx = Math.abs(i - q[0]) - (q[2] - q[4]), qz = Math.abs(j - q[1]) - (q[3] - q[4]);
      if (qx > q[4] + 6 || qz > q[4] + 6) continue;       // far outside this mesa: it cannot raise the ground here
      const d = Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - q[4] + en;
      m = Math.max(m, sstep(1.3, -1.3, d));
    }
    for (const q of rocks) { const dx = i - q[0], dz = j - q[1]; if (Math.abs(dx) > q[2] + 6 || Math.abs(dz) > q[2] + 6) continue; m = Math.max(m, sstep(1.3, -1.3, Math.hypot(dx, dz) - q[2] + en)); }
    let hill = 0;   // gentle mound: at most 0.8 m of rise per cell, so it never counts as a cliff
    for (const q of hills) { const dx = i - q[0], dz = j - q[1]; if (Math.abs(dx) > q[2] || Math.abs(dz) > q[2]) continue; hill = Math.max(hill, Math.min(4, q[2] * 0.4) * sstep(q[2], q[2] * 0.25, Math.hypot(dx, dz))); }
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
    height[j * V + i] = MESA_H * e + dune * (1 - 0.7 * e) + hill * (1 - e);
    rock[j * V + i] = e;
    if (rivers.length || isles.length) { // cut the river bed or sea bed, except under bridges (a bridge is a causeway with a deck on top)
      const wob = coast ? (fbm(i * 0.021, j * 0.021, 21) + fbm((N - i) * 0.021, (N - j) * 0.021, 21) - 1) * 1.4 * coast + (fbm(i * 0.09, j * 0.09, 23) + fbm((N - i) * 0.09, (N - j) * 0.09, 23) - 1) * coast * 0.3 : 0;   // a wandering shoreline, the same for both sides
      let w = 0;
      if (isles.length) { // sea everywhere except on the islands
        let land = -1e9; for (const q of isles) { const e = Math.hypot((i - q[0]) / q[2], (j - q[1]) / q[3]); land = Math.max(land, (1 - e) * Math.min(q[2], q[3])); }   // cells inside the nearest shore (negative: out at sea)
        w = sstep(4.5, -0.5, land + wob);
      }
      for (const q of rivers) { const wb = q[4] > 30 ? wob : 0; const pad = q[4] + 6 + (q[4] > 30 ? coast * 1.4 : 0); if (Math.abs(i - (q[0] + q[2]) / 2) > Math.abs(q[2] - q[0]) / 2 + pad || Math.abs(j - (q[1] + q[3]) / 2) > Math.abs(q[3] - q[1]) / 2 + pad) continue; w = Math.max(w, sstep(q[4] + 4.5, q[4] - 0.5, segD(i, j, q) + wb)); } // gentle banks: steep ones would count as cliffs and wall the river off
      if (w > 0) { for (const q of bridges) w *= 1 - sstep(q[4] + 0.6, q[4] - 0.6, segD(i, j, q)); wetV[j * V + i] = w; height[j * V + i] = (height[j * V + i] * (1 - 0.6 * w)) - WATER_DEPTH * w; }
    }
  }

  const blocked = new Uint8Array(N * N), water = new Uint8Array(N * N), wet = rivers.length > 0 || isles.length > 0;
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    const a = height[z * V + x], b = height[z * V + x + 1], c = height[(z + 1) * V + x], d = height[(z + 1) * V + x + 1];
    const steep = Math.max(a, b, c, d) - Math.min(a, b, c, d) > 1.5;
    if (steep || x < 3 || z < 3 || x >= N - 3 || z >= N - 3) blocked[z * N + x] = 1;
    if (wet && (wetV[z * V + x] + wetV[z * V + x + 1] + wetV[(z + 1) * V + x] + wetV[(z + 1) * V + x + 1]) > 2.2) { water[z * N + x] = 1; if (!steep) blocked[z * N + x] = 2; } // 2 = blocked by water only: amphibious units may cross
  }

  // Features (top-left cell of each footprint), mirrored through the centre
  const both = (list, w, h, f) => { const out = []; for (const q of list || []) { out.push(f(q, false)); out.push(f(q, true)); } return out; };
  const civs = (S.civsFixed || []).map((c, i) => [c[0], c[1], c[2] ?? i % 4]).concat(both(S.civs, 6, 6, (c, mir) => { const p = mir ? mirrorRect(c[0], c[1], 6, 6) : c; return [p[0], p[1], (c[2] | 0) % CIV_KINDS.length]; }));
  const docks = both(S.docks, 8, 6, (d, mir) => { if (!mir) return { x: d.x, z: d.z, amount: d.amount }; const [mx, mz] = mirrorRect(d.x, d.z, 8, 6); return { x: mx, z: mz, amount: d.amount }; });
  const roads = both(S.roads, 0, 0, (r, mir) => mir ? [N - r[0], N - r[1], N - r[2], N - r[3], r[4]] : r.slice());
  const derricks = both(S.derricks, 4, 4, (d, mir) => mir ? mirrorRect(d[0], d[1], 4, 4) : d.slice());
  const sites = both(S.sites, 4, 4, (d, mir) => { const p = mir ? mirrorRect(d[0], d[1], 4, 4) : d; return [p[0], p[1], SITE_KINDS.includes(d[2]) ? d[2] : 'repair']; });
  // Road mask: ground vehicles are faster on a road or a bridge deck (see stepMovement).
  const road = new Uint8Array(N * N);
  for (const r of roads.concat(bridges)) {
    const hw = r[4] * 0.9, x0 = Math.max(0, Math.floor(Math.min(r[0], r[2]) - hw)), x1 = Math.min(N - 1, Math.ceil(Math.max(r[0], r[2]) + hw)), z0 = Math.max(0, Math.floor(Math.min(r[1], r[3]) - hw)), z1 = Math.min(N - 1, Math.ceil(Math.max(r[1], r[3]) + hw));
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if (!blocked[z * N + x] && segD(x + 0.5, z + 0.5, r) <= hw) road[z * N + x] = 1;
  }
  const st = S.start, sc = [st[0] + 5, st[1] + 5];
  // choke point the AI watches: the top of the first ramp, or (no ramps) a point a third of the way to the centre
  const rt = S.rampTop || (S.ramps && S.ramps[0] ? [S.ramps[0].x, S.ramps[0].z] : [sc[0] + (N / 2 - sc[0]) / 3, sc[1] + (N / 2 - sc[1]) / 3]);
  // Trees (woods): clumps from a noise field, never on rock, water, roads, bridges, bases or other objects. Decoration only: they do not block.
  const trees = [];
  if ((BIOMES[S.biome] || BIOMES.desert).trees && (S.trees ?? 0.6) > 0) {
    const dens = S.trees ?? 0.6, keep = new Uint8Array(N * N);
    const mark = (x, z, w, h, pad) => { for (let j = Math.max(0, z - pad); j < Math.min(N, z + h + pad); j++) for (let i = Math.max(0, x - pad); i < Math.min(N, x + w + pad); i++) keep[j * N + i] = 1; };
    mark(st[0], st[1], 10, 10, 20); const es = mirrorRect(st[0], st[1], 10, 10); mark(es[0], es[1], 10, 10, 20);
    for (const d of docks) mark(d.x, d.z, 8, 6, 5); for (const d of derricks) mark(d[0], d[1], 4, 4, 3); for (const d of sites) mark(d[0], d[1], 4, 4, 3); for (const c of civs) mark(c[0], c[1], 6, 6, 2);
    for (let gz = 5; gz < N - 5; gz += 2) for (let gx = 5; gx < N - 5; gx += 2) {
      const k = gz * N + gx; if (blocked[k] || keep[k] || rock[gz * V + gx] > 0.15) continue;
      if (fbm(gx * 0.055, gz * 0.055, 5) < 0.62 - dens * 0.3 || hash2(gx, gz, 77) > 0.3 + dens * 0.5) continue;
      let near = false; for (const r of roads) if (segD(gx, gz, r) < r[4] + 2) { near = true; break; }
      if (!near) for (const r of bridges) if (segD(gx, gz, r) < r[4] + 3) { near = true; break; }
      if (!near) for (const r of rivers) if (segD(gx, gz, r) < r[4] + 3.5) { near = true; break; }
      if (near) continue;
      const tx = gx + hash2(gx, gz, 78) * 1.6, tz = gz + hash2(gx, gz, 79) * 1.6, tk = Math.floor(tz) * N + Math.floor(tx);
      if (blocked[tk] || water[tk] || wetV[Math.floor(tz) * V + Math.floor(tx)] > 0.15) continue;                       // the jittered spot itself must be dry, open ground
      trees.push(tx * CELL, tz * CELL, 0.75 + hash2(gx, gz, 80) * 0.7);
    }
  }
  return {
    N, V, height, rock, blocked, water, road, naval: !!S.naval, hasWater: wet, bridges, trees, biome: S.biome || 'desert', civs, docks, derricks, sites, roads, ramps, mirrorRect, custom: !!spec, name: S.name || 'Custom',
    start: [{ cc: [st[0], st[1]] }, { cc: mirrorRect(st[0], st[1], 10, 10) }],
    rampTop: [{ x: rt[0] * CELL, z: rt[1] * CELL }, { x: (N - rt[0]) * CELL, z: (N - rt[1]) * CELL }],
  };
}

// Checks a spec before a match starts. Errors stop the match; warnings do not.
// Returns { ok, errors, warnings, map } with the generated map so the caller can draw a preview.
export const MAP_LIMITS = { mesas: 24, docks: 8, derricks: 12, sites: 8, civs: 40, roads: 32, water: 24, bridges: 12, paint: 400, islands: 16 };
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
  const items = [].concat(map.docks.map(d => ['Supply Dock', d.x, d.z, 8, 6]), map.derricks.map(d => ['Oil Derrick', d[0], d[1], 4, 4]), map.sites.map(d => ['Capturable site', d[0], d[1], 4, 4]), map.civs.map(c => ['Building', c[0], c[1], 6, 6]));
  const occupied = new Uint8Array(N * N);
  for (const [name, x, z, w, h] of items) {
    if (x < 4 || z < 4 || x + w > N - 4 || z + h > N - 4) { errors.push(`${name} at ${x}, ${z} is off the map.`); continue; }
    let rocky = 0; for (let j = z; j < z + h; j++) for (let i = x; i < x + w; i++) if (B[j * N + i]) rocky++;
    if (rocky) errors.push(`${name} at ${x}, ${z} sits on rock or water.`);
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
