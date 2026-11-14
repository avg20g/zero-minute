// Model factory. One entry point for every unit and aircraft mesh:
//
//   1. If an external .glb was supplied for a model key (models/manifest.json),
//      that model is used.
//   2. Otherwise a procedural military assembly is built here from real-world
//      proportions: matte olive drab / desert tan / gunmetal PBR paint, turret
//      rings, road wheels, gun barrels. Nothing emissive.
//   3. Everything else (buildings, infantry, support vehicles) still comes
//      from the older procedural library in models.js.
//
// Convention: model forward is +X, up is +Y, ground at y = 0. Each builder
// returns a "rig": { g, body, turret?, turretX?, rotor?, rotorTail?, prop?,
// tiers?, addons?, muzzle, muzzleY } which is all the view animates.
import { TEAM } from '../ui/teamColors.js';
import THREE from '../lib/three.js';
import { FACTIONS, UNITS } from '../sim/factionRegistry.js';
import { std } from './gfx.js';
import { prismPositions, parseGLB } from './meshdata.js';
import { buildModel as legacyModel, buildPlane as legacyPlane, buildCrate, buildBomb, buildGhost } from './models.js';

export { buildCrate, buildBomb, buildGhost };

// ---------------------------------------------------------------- paint and primitives
const ID_PANEL = TEAM.paint; // matte recognition panels in each side's lobby colour
let S = null;
function shared() {
  if (S) return S;
  S = {
    box: new THREE.BoxGeometry(1, 1, 1), cyl: new THREE.CylinderGeometry(1, 1, 1, 16), cyl8: new THREE.CylinderGeometry(1, 1, 1, 8),
    sph: new THREE.SphereGeometry(1, 14, 10), dome: new THREE.SphereGeometry(1, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    paints: {},
    gunmetal: std(0x3b3e42, 0.62, 0.55), steel: std(0x565b60, 0.58, 0.6), track: std(0x202123, 0.95, 0.1), rubber: std(0x18181a, 0.97, 0),
    glass: std(0x121a22, 0.2, 0.5), canvas: std(0x6b6548, 0.98, 0), wood: std(0x7a5c38, 0.95, 0), cloth: std(0x8b7d55, 0.97, 0), skin: std(0xb98d62, 0.9, 0),
    grey: std(0x6e767b, 0.86, 0.06), greyDark: std(0x4d5459, 0.88, 0.06), ordnance: std(0x4a4f3c, 0.9, 0.05),
  };
  return S;
}
// Matte service paint for a faction, plus the owning team's recognition panel colour.
export function paint(faction, team) {
  const s = shared(), key = faction + ':' + team;
  if (s.paints[key]) return s.paints[key];
  const F = FACTIONS[faction];
  return (s.paints[key] = { hull: std(F.hull, 0.9, 0.04), dark: std(F.dark, 0.92, 0.04), id: std(ID_PANEL[team] ?? ID_PANEL[2], 0.85, 0) });
}
function mesh(parent, geometry, mat, name) {
  const m = new THREE.Mesh(geometry, mat);
  m.castShadow = true; m.receiveShadow = true; if (name) m.name = name;
  parent.add(m); return m;
}
function box(p, mat, sx, sy, sz, x, y, z, name) { const m = mesh(p, shared().box, mat, name); m.scale.set(sx, sy, sz); m.position.set(x, y, z); return m; }
function cyl(p, mat, r, len, x, y, z, axis = 'y', name, geo) {
  const m = mesh(p, geo || shared().cyl, mat, name); m.scale.set(r, len, r); m.position.set(x, y, z);
  if (axis === 'x') m.rotation.z = -Math.PI / 2; else if (axis === 'z') m.rotation.x = Math.PI / 2;
  return m;
}
function ball(p, mat, sx, sy, sz, x, y, z, name, geo) { const m = mesh(p, geo || shared().sph, mat, name); m.scale.set(sx, sy, sz); m.position.set(x, y, z); return m; }
// Tapered body of revolution along X: rFront at +X, rBack at -X.
const GEO = new Map(); // every non-primitive geometry is built once and shared by all instances
function cached(key, make) { let g = GEO.get(key); if (!g) GEO.set(key, g = make()); return g; }
function taper(p, mat, rFront, rBack, len, x, y, z, name) {
  const m = mesh(p, cached('taper:' + rFront + ':' + rBack + ':' + len, () => new THREE.CylinderGeometry(rFront, rBack, len, 16)), mat, name);
  m.rotation.z = -Math.PI / 2; m.position.set(x, y, z); return m;
}
// Extruded convex profile: mode 'side' = [x, y] across Z, 'plan' = [x, z] up Y.
function prism(p, mat, pts, depth, mode, x, y, z, name) {
  const g = cached('prism:' + mode + ':' + depth + ':' + pts.join(';'), () => {
    const q = new THREE.BufferGeometry();
    q.setAttribute('position', new THREE.BufferAttribute(prismPositions(pts, depth, mode), 3));
    q.computeVertexNormals(); return q;
  });
  const m = mesh(p, g, mat, name); m.position.set(x, y, z); m.userData.profile = pts; return m;
}
function grp(parent, x = 0, y = 0, z = 0, name) { const g = new THREE.Group(); g.position.set(x, y, z); if (name) g.name = name; parent.add(g); return g; }
function wheel(p, r, w, x, y, z, name = 'wheel') { const s = shared(); cyl(p, s.rubber, r, w, x, y, z, 'z', name); cyl(p, s.steel, r * 0.55, w * 1.08, x, y, z, 'z', 'hub', s.cyl8); }

// Tracked running gear for one side: track belt, N road wheels, rear drive sprocket, front idler.
function runningGear(b, len, z, w, n, r, top) {
  const s = shared(), L = len / 2;
  prism(b, s.track, [[-L, top * 0.62], [-L + 0.28, 0.06], [L - 0.34, 0.06], [L, top * 0.6], [L - 0.1, top], [-L + 0.08, top]], w, 'side', 0, 0, z, 'track');
  const x0 = -L + 0.52, x1 = L - 0.62;
  for (let i = 0; i < n; i++) { const x = x0 + (x1 - x0) * i / (n - 1); cyl(b, s.rubber, r, w * 1.04, x, r + 0.07, z, 'z', 'roadwheel'); cyl(b, s.steel, r * 0.5, w * 1.1, x, r + 0.07, z, 'z', 'hub', s.cyl8); }
  cyl(b, s.steel, r * 0.95, w * 1.06, -L + 0.2, top * 0.6, z, 'z', 'sprocket', s.cyl8);
  cyl(b, s.steel, r * 0.85, w * 1.06, L - 0.24, top * 0.58, z, 'z', 'idler');
}

// ---------------------------------------------------------------- M1A2 Abrams profile (Vanguard MBT)
// Real: hull 7.93 m x 3.66 m, 2.44 m to turret roof, 5.28 m 120 mm smoothbore. Built at 0.59 scale.
function abrams(P) {
  const s = shared(), g = new THREE.Group(), b = grp(g);
  for (const k of [-1, 1]) { runningGear(b, 4.6, k * 0.92, 0.4, 7, 0.19, 0.78); box(b, P.hull, 4.36, 0.3, 0.05, -0.05, 0.74, k * 1.13, 'skirt'); }
  prism(b, P.hull, [[-2.3, 0.3], [2.05, 0.3], [2.32, 0.62], [2.0, 0.8], [-2.3, 0.8]], 1.44, 'side', 0, 0, 0, 'tub');
  prism(b, P.hull, [[-2.35, 0.78], [2.34, 0.78], [2.34, 0.82], [1.0, 1.02], [-2.35, 1.02]], 2.26, 'side', 0, 0, 0, 'hull'); // long shallow glacis
  box(b, P.dark, 1.3, 0.03, 1.7, -1.6, 1.035, 0, 'enginedeck'); box(b, s.gunmetal, 0.05, 0.3, 1.5, -2.37, 0.62, 0, 'grille');
  box(b, P.dark, 0.4, 0.04, 0.5, 1.25, 0.985, 0, 'driverhatch').rotation.z = -0.148;
  for (const k of [-1, 1]) box(b, s.gunmetal, 0.08, 0.08, 0.14, 2.2, 0.88, k * 0.85, 'headlight');
  cyl(b, s.gunmetal, 0.8, 0.06, 0.2, 1.04, 0, 'y', 'turretring');
  const t = grp(b, 0.2, 1.06, 0, 'turret');
  prism(t, P.hull, [[1.3, -0.4], [1.3, 0.4], [0.72, 0.9], [-1.0, 0.9], [-1.0, -0.9], [0.72, -0.9]], 0.46, 'plan', 0, 0.25, 0, 'turretshell'); // wide, low, wedge cheeks
  box(t, P.hull, 0.5, 0.36, 1.7, -1.25, 0.24, 0, 'bustle');
  box(t, s.gunmetal, 0.46, 0.03, 1.84, -1.72, 0.08, 0, 'bustlerack'); box(t, s.gunmetal, 0.03, 0.3, 1.84, -1.94, 0.23, 0, 'bustlerack');
  for (const k of [-1, 1]) box(t, s.gunmetal, 0.46, 0.3, 0.03, -1.72, 0.23, k * 0.92, 'bustlerack');
  box(t, s.canvas, 0.34, 0.2, 0.62, -1.7, 0.2, 0.5, 'stowage'); box(t, s.ordnance, 0.3, 0.22, 0.5, -1.7, 0.21, -0.42, 'stowage'); cyl(t, s.canvas, 0.09, 0.7, -1.72, 0.2, -0.02, 'z', 'stowage');
  box(t, P.dark, 0.34, 0.34, 0.62, 1.42, 0.25, 0, 'mantlet');
  cyl(t, s.gunmetal, 0.068, 3.1, 3.1, 0.25, 0, 'x', 'barrel');      // 120 mm smoothbore
  cyl(t, s.gunmetal, 0.105, 0.52, 3.15, 0.25, 0, 'x', 'evacuator'); // bore evacuator, mid-barrel
  cyl(t, s.gunmetal, 0.082, 0.08, 4.62, 0.25, 0, 'x', 'muzzle');
  cyl(t, s.gunmetal, 0.09, 0.24, 0.45, 0.6, 0.5, 'y', 'citv');
  cyl(t, P.hull, 0.21, 0.12, -0.25, 0.54, -0.42, 'y', 'cupola'); box(t, s.gunmetal, 0.34, 0.07, 0.07, -0.05, 0.68, -0.42, 'aamg'); cyl(t, s.gunmetal, 0.018, 0.55, 0.38, 0.69, -0.42, 'x', 'aamg');
  cyl(t, P.hull, 0.17, 0.05, -0.3, 0.5, 0.42, 'y', 'hatch'); cyl(t, s.gunmetal, 0.014, 0.45, 0.0, 0.6, 0.42, 'x', 'aamg');
  for (const k of [-1, 1]) { box(t, s.gunmetal, 0.2, 0.12, 0.08, 0.55, 0.32, k * 0.93, 'smoke'); cyl(t, s.gunmetal, 0.012, 1.0, -0.95, 0.98, k * 0.8, 'y', 'antenna'); }
  box(t, P.id, 0.5, 0.02, 0.6, -0.55, 0.49, 0, 'idpanel');
  return { g, body: b, turret: t, turretX: 0.2, muzzle: 4.85, muzzleY: 1.31 };
}

// ---------------------------------------------------------------- Soviet-pattern tanks (Red Hammer)
// Steep glacis, rounded cast turret, reactive armour bricks, rear fuel drums, unditching log.
// `dual` gives the heavy its second 125 mm gun; the Battlemaster is the same hull at 0.76 scale.
function sovietTank(P, dual) {
  const s = shared(), g = new THREE.Group(), b = grp(g);
  for (const k of [-1, 1]) {
    runningGear(b, 5.8, k * 1.2, 0.5, 6, 0.3, 0.98);
    box(b, P.hull, 5.9, 0.05, 0.62, 0, 1.0, k * 1.2, 'fender'); box(b, P.dark, 2.6, 0.3, 0.05, 1.2, 0.82, k * 1.47, 'skirt');
    for (let i = 0; i < 4; i++) box(b, P.hull, 0.5, 0.24, 0.07, 0.35 + i * 0.6, 0.84, k * 1.52, 'era');
    cyl(b, P.hull, 0.25, 0.9, -3.12, 1.08, k * 0.55, 'z', 'fueldrum'); box(b, s.gunmetal, 0.06, 0.56, 0.06, -3.12, 1.08, k * 0.55, 'strap');
  }
  prism(b, P.hull, [[-2.9, 0.4], [2.55, 0.4], [2.95, 0.78], [-2.9, 0.78]], 1.9, 'side', 0, 0, 0, 'tub');
  prism(b, P.hull, [[-2.95, 0.76], [2.95, 0.76], [1.35, 1.26], [-2.95, 1.26]], 2.0, 'side', 0, 0, 0, 'hull'); // steep glacis
  for (let r = 0; r < 2; r++) for (let c = 0; c < 5; c++) { const x = 1.72 + r * 0.6; box(b, P.hull, 0.5, 0.07, 0.32, x, 1.26 - (x - 1.35) * 0.3125 + 0.04, (c - 2) * 0.38, 'era').rotation.z = -0.3028; }
  cyl(b, s.wood, 0.11, 2.0, -3.0, 0.6, 0, 'z', 'log'); box(b, P.dark, 1.5, 0.03, 1.7, -2.0, 1.275, 0, 'enginedeck'); box(b, s.gunmetal, 0.5, 0.16, 0.2, -1.6, 1.1, 1.05, 'exhaust');
  box(b, P.dark, 0.4, 0.04, 0.46, 1.0, 1.28, 0, 'driverhatch');
  cyl(b, s.gunmetal, 1.08, 0.06, -0.15, 1.28, 0, 'y', 'turretring');
  const t = grp(b, -0.15, 1.3, 0, 'turret');
  ball(t, P.hull, 1.3, 0.62, 1.25, 0, 0, 0, 'turretshell', s.dome); // rounded cast turret
  for (let k = -3; k <= 3; k++) { const a = k * 0.3, e = box(t, P.hull, 0.1, 0.26, 0.34, Math.cos(a) * 1.2, 0.2, Math.sin(a) * 1.15, 'era'); e.rotation.y = -a; }
  for (const z of (dual ? [-0.36, 0.36] : [0])) {
    box(t, P.dark, 0.36, 0.32, 0.34, 1.2, 0.26, z, 'mantlet');
    cyl(t, s.gunmetal, 0.085, 3.5, 3.05, 0.27, z, 'x', 'barrel'); cyl(t, s.gunmetal, 0.125, 0.5, 2.55, 0.27, z, 'x', 'evacuator'); cyl(t, s.gunmetal, 0.1, 0.1, 4.76, 0.27, z, 'x', 'muzzle');
  }
  box(t, s.gunmetal, 0.26, 0.26, 0.26, 1.02, 0.4, -0.86, 'searchlight'); cyl(t, s.glass, 0.11, 0.03, 1.16, 0.4, -0.86, 'x', 'lens');
  cyl(t, P.hull, 0.26, 0.16, -0.25, 0.62, -0.4, 'y', 'cupola'); box(t, s.gunmetal, 0.4, 0.08, 0.08, -0.05, 0.82, -0.4, 'aamg'); cyl(t, s.gunmetal, 0.02, 0.7, 0.45, 0.83, -0.4, 'x', 'aamg');
  for (const k of [-1, 1]) box(t, P.dark, 0.6, 0.24, 0.34, -1.0, 0.2, k * 0.72, 'stowage');
  cyl(t, P.dark, 0.11, 1.5, -1.34, 0.32, 0, 'z', 'snorkel'); cyl(t, s.gunmetal, 0.012, 1.2, -0.9, 1.0, 0.5, 'y', 'antenna');
  box(t, P.id, 0.5, 0.02, 0.5, -0.4, 0.6, 0.15, 'idpanel');
  // turret-roof and rear-deck hardpoints (shown once fitted)
  const gat = grp(t, -0.6, 0.56, 0.5, 'gatling'); cyl(gat, s.gunmetal, 0.2, 0.3, 0, 0.15, 0, 'y'); box(gat, s.gunmetal, 0.5, 0.26, 0.4, 0.05, 0.42, 0);
  for (const [dy, dz] of [[0.06, 0.06], [0.06, -0.06], [-0.06, 0.06], [-0.06, -0.06]]) cyl(gat, s.gunmetal, 0.028, 1.2, 0.85, 0.42 + dy, dz, 'x', 'barrel');
  const bun = grp(b, -2.05, 1.26, 0, 'bunker'); box(bun, P.dark, 1.3, 0.7, 1.9, 0, 0.35, 0); box(bun, s.gunmetal, 1.32, 0.1, 1.2, 0, 0.42, 0); box(bun, P.hull, 1.4, 0.05, 2.0, 0, 0.72, 0);
  gat.visible = false; bun.visible = false;
  return { g, body: b, turret: t, turretX: -0.15, muzzle: 4.7, muzzleY: 1.58, addons: { gatling: gat, bunker: bun } };
}
function battlemaster(P) { const r = sovietTank(P, false); r.body.scale.setScalar(0.76); r.muzzle *= 0.76; r.muzzleY *= 0.76; delete r.addons; return r; }

// ---------------------------------------------------------------- Technical (Sandstorm)
// Stripped pickup: open flatbed, pintle mount, and three weapon fits for the salvage tiers.
function technical(P) {
  const s = shared(), g = new THREE.Group(), b = grp(g);
  for (const x of [1.08, -1.08]) for (const k of [-1, 1]) wheel(b, 0.31, 0.24, x, 0.31, k * 0.66);
  box(b, s.gunmetal, 3.2, 0.1, 0.9, 0, 0.42, 0, 'chassis');
  prism(b, P.hull, [[0.72, 0.5], [1.68, 0.5], [1.68, 0.82], [0.72, 0.9]], 1.34, 'side', 0, 0, 0, 'bonnet');
  prism(b, P.hull, [[-0.28, 0.5], [0.74, 0.5], [0.74, 0.9], [0.4, 1.34], [-0.28, 1.34]], 1.34, 'side', 0, 0, 0, 'cab');
  box(b, s.glass, 0.03, 0.5, 1.2, 0.585, 1.12, 0, 'windshield').rotation.z = 0.658; box(b, s.glass, 0.5, 0.3, 1.36, 0.02, 1.14, 0, 'window');
  box(b, s.gunmetal, 0.04, 0.2, 1.0, 1.7, 0.66, 0, 'grille'); box(b, s.gunmetal, 0.08, 0.12, 1.4, 1.76, 0.46, 0, 'bumper');
  box(b, P.hull, 1.5, 0.06, 1.34, -1.03, 0.6, 0, 'flatbed'); box(b, P.hull, 0.05, 0.3, 1.34, -0.3, 0.78, 0, 'bedside');
  for (const k of [-1, 1]) { box(b, P.hull, 1.5, 0.3, 0.05, -1.03, 0.78, k * 0.67, 'bedside'); box(b, s.gunmetal, 0.06, 0.62, 0.06, -0.36, 1.2, k * 0.6, 'rollbar'); }
  box(b, s.gunmetal, 0.06, 0.06, 1.26, -0.36, 1.5, 0, 'rollbar');
  cyl(b, s.rubber, 0.3, 0.2, -1.5, 0.74, 0.3, 'y', 'spare'); for (const z of [-0.5, -0.32]) box(b, P.dark, 0.14, 0.34, 0.14, -0.5, 0.8, z, 'jerrycan');
  box(b, P.id, 0.7, 0.02, 0.8, 1.2, 0.875, 0, 'idpanel').rotation.z = -0.083;
  const t = grp(b, -1.0, 0.63, 0, 'turret');
  cyl(t, s.gunmetal, 0.22, 0.04, 0, 0.02, 0, 'y', 'mountplate'); cyl(t, s.gunmetal, 0.045, 0.8, 0, 0.42, 0, 'y', 'pintle');
  box(t, s.cloth, 0.2, 0.62, 0.3, -0.42, 0.33, 0, 'gunner'); box(t, s.cloth, 0.24, 0.5, 0.4, -0.42, 0.88, 0, 'gunner'); ball(t, s.skin, 0.12, 0.13, 0.12, -0.42, 1.26, 0, 'gunner');
  const mg = grp(t, 0, 0.86, 0, 'hmg');   // tier 0: heavy machine gun
  box(mg, s.gunmetal, 0.46, 0.12, 0.1, 0.1, 0, 0, 'receiver'); cyl(mg, s.gunmetal, 0.026, 0.95, 0.8, 0.01, 0, 'x', 'barrel'); cyl(mg, s.gunmetal, 0.045, 0.1, 1.28, 0.01, 0, 'x', 'muzzle');
  box(mg, s.ordnance, 0.2, 0.16, 0.12, 0.05, -0.04, 0.14, 'ammobox'); box(mg, P.dark, 0.03, 0.4, 0.6, 0.34, 0.06, 0, 'gunshield');
  const cn = grp(t, 0, 0.86, 0, 'autocannon'); // tier 1: twin autocannon
  box(cn, s.gunmetal, 0.6, 0.2, 0.36, 0.1, 0, 0, 'receiver'); for (const z of [-0.1, 0.1]) { cyl(cn, s.gunmetal, 0.04, 1.5, 1.1, 0.02, z, 'x', 'barrel'); cyl(cn, s.gunmetal, 0.06, 0.14, 1.82, 0.02, z, 'x', 'muzzle'); }
  box(cn, P.dark, 0.03, 0.46, 0.8, 0.42, 0.08, 0, 'gunshield');
  const rk = grp(t, 0, 0.9, 0, 'rocketpod'); // tier 2: 12-tube rocket pod
  box(rk, P.dark, 1.0, 0.44, 0.78, 0.15, 0.08, 0, 'rocketpod');
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) cyl(rk, s.gunmetal, 0.07, 0.06, 0.67, 0.08 + (r - 1) * 0.13, (c - 1.5) * 0.18, 'x', 'tube');
  rk.rotation.z = 0.2; cn.visible = false; rk.visible = false;
  return { g, body: b, turret: t, turretX: -1.0, muzzle: 1.6, muzzleY: 1.52, tiers: [mg, cn, rk] };
}

// ---------------------------------------------------------------- Scout car (Red Hammer): boat-hulled 4x4 with a small MG turret
function scoutCar(P) {
  const s = shared(), g = new THREE.Group(), b = grp(g);
  for (const x of [1.0, -1.0]) for (const k of [-1, 1]) wheel(b, 0.36, 0.3, x, 0.36, k * 0.72);
  prism(b, P.hull, [[-1.6, 0.42], [1.35, 0.42], [1.72, 0.66], [1.2, 0.98], [0.5, 1.16], [-1.6, 1.08]], 1.36, 'side', 0, 0, 0, 'hull');
  box(b, s.glass, 0.03, 0.14, 0.9, 0.87, 1.08, 0, 'visor').rotation.z = 1.2; box(b, P.dark, 0.9, 0.03, 1.0, -1.05, 1.1, 0, 'enginedeck');
  cyl(b, s.gunmetal, 0.46, 0.05, -0.1, 1.15, 0, 'y', 'turretring');
  const t = grp(b, -0.1, 1.17, 0, 'turret');
  mesh(t, cached('scout-turret', () => new THREE.CylinderGeometry(0.3, 0.44, 0.32, 12)), P.hull, 'turretshell').position.set(0, 0.16, 0);
  cyl(t, s.gunmetal, 0.03, 1.1, 0.8, 0.2, 0, 'x', 'barrel'); box(t, P.id, 0.3, 0.02, 0.3, -0.05, 0.33, 0, 'idpanel');
  return { g, body: b, turret: t, turretX: -0.1, muzzle: 1.4, muzzleY: 1.37 };
}

// ---------------------------------------------------------------- Attack helicopter (Vanguard Comanche)
// Tandem stepped cockpit, faceted fuselage, stub wings with missile pods, 5-blade main rotor,
// shrouded tail rotor under a T-tail, chin gun. Origin is the rotor mast at flight height.
function comanche(P) {
  const s = shared(), g = new THREE.Group(), b = grp(g);
  prism(b, P.hull, [[2.7, -0.05], [2.4, 0.12], [1.5, 0.38], [0.6, 0.62], [-0.3, 0.64], [-1.1, 0.42], [-1.3, -0.2], [-0.6, -0.55], [1.9, -0.5]], 0.9, 'side', 0, 0, 0, 'fuselage');
  box(b, s.glass, 0.78, 0.26, 0.62, 1.78, 0.36, 0, 'canopy').rotation.z = -0.28; // front seat (gunner)
  box(b, s.glass, 0.8, 0.3, 0.64, 0.98, 0.64, 0, 'canopy').rotation.z = -0.24;  // rear seat (pilot), stepped up
  box(b, P.dark, 1.2, 0.26, 0.62, -0.2, 0.74, 0, 'doghouse');
  for (const k of [-1, 1]) box(b, s.gunmetal, 0.5, 0.2, 0.06, -0.75, 0.6, k * 0.34, 'exhaust');
  prism(b, P.hull, [[-1.1, 0.42], [-3.5, 0.32], [-3.5, 0.08], [-1.3, -0.2]], 0.34, 'side', 0, 0, 0, 'tailboom');
  cyl(b, P.hull, 0.44, 0.2, -3.72, 0.2, 0, 'z', 'fenestron'); cyl(b, s.gunmetal, 0.32, 0.22, -3.72, 0.2, 0, 'z', 'fenestron');
  box(b, P.hull, 0.5, 0.74, 0.07, -3.78, 0.98, 0, 'fin').rotation.z = 0.2; box(b, P.hull, 0.5, 0.04, 1.5, -3.92, 1.36, 0, 'stabilizer');
  box(b, P.id, 0.3, 0.2, 0.08, -3.8, 1.0, 0, 'idpanel');
  for (const k of [-1, 1]) {
    box(b, P.dark, 0.7, 0.07, 1.3, 0.1, -0.06, k * 1.05, 'stubwing');
    cyl(b, s.gunmetal, 0.15, 0.95, 0.2, -0.28, k * 1.42, 'x', 'pod'); cyl(b, s.gunmetal, 0.11, 0.04, 0.69, -0.28, k * 1.42, 'x', 'podface');
    for (const dz of [0.72, 0.98]) cyl(b, s.ordnance, 0.05, 0.75, 0.25, -0.22, k * dz, 'x', 'missile');
  }
  cyl(b, s.gunmetal, 0.07, 0.36, 0, 1.0, 0, 'y', 'mast');
  const rotor = grp(b, 0, 1.2, 0, 'rotor'); cyl(rotor, s.gunmetal, 0.17, 0.1, 0, 0, 0, 'y', 'hub');
  for (let i = 0; i < 5; i++) { const arm = grp(rotor); arm.rotation.y = i * Math.PI * 2 / 5; box(arm, s.gunmetal, 3.1, 0.03, 0.2, 1.65, 0, 0, 'blade'); }
  const rotorTail = grp(b, -3.72, 0.2, 0, 'tailrotor');
  for (let i = 0; i < 4; i++) { const arm = grp(rotorTail); arm.rotation.z = i * Math.PI / 4; box(arm, s.steel, 0.58, 0.05, 0.03, 0, 0, 0, 'tailblade'); }
  ball(b, s.gunmetal, 0.13, 0.13, 0.13, 2.62, -0.16, 0, 'sensor');
  const t = grp(b, 1.9, -0.56, 0, 'turret'); cyl(t, s.gunmetal, 0.14, 0.16, 0, 0, 0, 'y', 'gunmount');
  for (const z of [-0.035, 0, 0.035]) cyl(t, s.gunmetal, 0.022, 0.8, 0.5, -0.06 + (z ? 0 : 0.035), z, 'x', 'barrel');
  return { g, body: b, turret: t, turretX: 1.9, rotor, rotorTail, muzzle: 2.85, muzzleY: -0.62 };
}

// ---------------------------------------------------------------- Recon drone (Vanguard scout): slender pusher-prop UAV
function drone(P) {
  const s = shared(), g = new THREE.Group(), b = grp(g);
  cyl(b, s.grey, 0.15, 2.0, 0, 0, 0, 'x', 'fuselage'); ball(b, s.grey, 0.34, 0.2, 0.19, 0.95, 0.05, 0, 'nose');
  box(b, s.grey, 0.34, 0.03, 4.4, 0.05, 0.04, 0, 'wing'); ball(b, s.gunmetal, 0.1, 0.1, 0.1, 0.75, -0.17, 0, 'sensor');
  for (const k of [-1, 1]) box(b, s.grey, 0.3, 0.5, 0.03, -0.92, -0.2, k * 0.17, 'vtail').rotation.x = k * 0.6;
  box(b, P.id, 0.2, 0.02, 0.5, 0.05, 0.06, 1.6, 'idpanel');
  const prop = grp(b, -1.06, 0, 0, 'prop'); box(prop, s.gunmetal, 0.03, 0.7, 0.06, 0, 0, 0, 'propblade');
  return { g, body: b, prop, muzzle: 0, muzzleY: 0 };
}

// ---------------------------------------------------------------- A-10 Thunderbolt II
// Real: 16.26 m long, 17.53 m span. Long straight unswept wing, two TF34 turbofans in pods high on
// the rear fuselage, twin fins on the tailplane tips (H-tail), bubble canopy well forward, and the
// GAU-8 seven-barrel cannon protruding from the nose. Built at 0.615 scale: 10.0 m long, 10.8 m span.
function a10(P) {
  const s = shared(), g = new THREE.Group(), b = grp(g);
  cyl(b, s.grey, 0.5, 7.2, 0.2, 0, 0, 'x', 'fuselage');
  taper(b, s.grey, 0.2, 0.5, 1.4, 4.5, -0.02, 0, 'nose'); taper(b, s.grey, 0.5, 0.22, 1.5, -4.15, 0.04, 0, 'tailcone');
  cyl(b, s.gunmetal, 0.095, 0.95, 5.5, -0.2, 0.06, 'x', 'gau8'); cyl(b, s.gunmetal, 0.11, 0.08, 5.94, -0.2, 0.06, 'x', 'gau8muzzle');
  ball(b, s.glass, 0.95, 0.42, 0.42, 2.6, 0.5, 0, 'canopy'); box(b, s.greyDark, 0.5, 0.2, 0.5, 1.75, 0.48, 0, 'canopyframe');
  for (const k of [-1, 1]) {
    box(b, s.grey, 1.9, 0.16, 2.3, 0.4, -0.22, k * 1.55, 'wing');                        // inner panel, zero sweep
    const o = box(b, s.grey, 1.5, 0.12, 2.95, 0.45, -0.04, k * 4.02, 'wing'); o.rotation.x = -k * 0.12; // outer panel, 7 degrees dihedral
    box(b, s.greyDark, 1.2, 0.1, 0.16, 0.45, 0.1, k * 5.44, 'wingtip');
    cyl(b, s.grey, 0.2, 1.7, 0.7, -0.38, k * 1.9, 'x', 'gearpod');
    cyl(b, s.grey, 0.46, 1.9, -2.3, 0.86, k * 0.98, 'x', 'engine');                      // TF34 nacelle, high and aft
    cyl(b, s.gunmetal, 0.4, 0.06, -1.33, 0.86, k * 0.98, 'x', 'intake'); taper(b, s.gunmetal, 0.4, 0.26, 0.5, -3.5, 0.86, k * 0.98, 'exhaust');
    box(b, s.grey, 0.9, 0.36, 0.12, -2.3, 0.5, k * 0.62, 'enginepylon').rotation.x = k * 0.5;
    box(b, s.grey, 1.3, 1.36, 0.07, -4.62, 0.82, k * 1.82, 'fin');                        // twin fins = H-tail
    box(b, P.id, 0.5, 0.26, 0.09, -4.7, 1.2, k * 1.82, 'idpanel');
    for (const z of [2.5, 3.3, 4.1]) { box(b, s.greyDark, 0.5, 0.14, 0.06, 0.5, -0.24, k * z, 'pylon'); cyl(b, s.ordnance, 0.07, 1.1, 0.55, -0.36, k * z, 'x', 'rocket'); }
  }
  box(b, s.grey, 1.3, 0.08, 3.7, -4.6, 0.14, 0, 'tailplane');
  return { g, body: b, gun: [5.95, -0.2, 0.06], pylons: [2.5, 3.3, 4.1], muzzle: 5.95, muzzleY: -0.2 };
}
// ---------------------------------------------------------------- F-22A Raptor
// Proportions from the real aircraft: 18.9 m long, 13.56 m span, 5.08 m high, 8.84 m tailplane span.
// Clipped-diamond wing (42 degree leading edge, trailing edge swept forward 17 degrees), twin fins canted 28 degrees
// outward, big all-moving tailplanes that reach past the nozzles, chined nose, caret intakes beside the
// cockpit, one-piece canopy, flat 2D thrust-vectoring nozzles. `m` are metres aft of the nose tip.
export const RAPTOR = { scale: 0.413, length: 18.9, span: 13.56, tailSpan: 8.84, sweep: 42, cant: 28 };
function raptor(P) {
  const s = shared(), g = new THREE.Group(), b = grp(g), K = RAPTOR.scale, X = (m) => +((9.0 - m) * K).toFixed(3), W = (m) => +(m * K).toFixed(3);
  const t42 = Math.tan(RAPTOR.sweep * Math.PI / 180), cant = RAPTOR.cant * Math.PI / 180;
  // fuselage: thin wide chine deck over a deeper, narrower body
  prism(b, s.grey, [[X(0), 0], [X(2.2), W(0.75)], [X(6.2), W(1.35)], [X(6.2), -W(1.35)], [X(2.2), -W(0.75)]], 0.14, 'plan', 0, 0.02, 0, 'chine');
  prism(b, s.grey, [[X(0.3), -0.02], [X(2.6), 0.3], [X(6.2), 0.36], [X(6.2), -0.4], [X(2.2), -0.3]], W(1.5), 'side', 0, 0, 0, 'forebody');
  prism(b, s.grey, [[X(5.6), W(2.1)], [X(16.6), W(1.95)], [X(16.6), -W(1.95)], [X(5.6), -W(2.1)]], 0.66, 'plan', 0, -0.03, 0, 'fuselage');
  prism(b, s.grey, [[X(6.2), 0.3], [X(7.4), 0.5], [X(11.5), 0.42], [X(14.5), 0.3]], W(1.5), 'side', 0, 0, 0, 'spine');
  ball(b, s.glass, W(1.9), 0.3, W(0.62), X(4.55), 0.36, 0, 'canopy');                                   // one-piece bubble canopy
  for (const k of [-1, 1]) {
    // wing: root leading edge 7.0 m aft at the fuselage side, 42 degree sweep out to the clipped tip
    const tipLE = 7.0 + (RAPTOR.span / 2 - 2.1) * t42;
    prism(b, s.grey, [[X(7.0), k * W(2.1)], [X(tipLE), k * W(RAPTOR.span / 2)], [X(tipLE + 1.7), k * W(RAPTOR.span / 2)], [X(14.3), k * W(2.1)]], 0.09, 'plan', 0, 0.02, 0, 'wing');
    // all-moving tailplane: same sweep, set just outboard of the nozzles, tip reaching the full length of the aircraft
    const tailLE = 14.0 + (RAPTOR.tailSpan / 2 - 1.9) * t42;
    prism(b, s.grey, [[X(14.0), k * W(1.9)], [X(tailLE), k * W(RAPTOR.tailSpan / 2)], [X(18.9), k * W(RAPTOR.tailSpan / 2)], [X(18.2), k * W(1.9)]], 0.07, 'plan', 0, -0.02, 0, 'tailplane');
    // fin: trapezoid, canted outward
    const fin = prism(b, s.greyDark, [[X(12.2), 0], [X(14.7), W(2.7)], [X(16.2), W(2.7)], [X(16.6), 0]], 0.06, 'side', 0, 0.28, k * W(1.9), 'fin'); fin.rotation.x = k * cant;
    box(b, P.id, 0.42, 0.3, 0.07, X(15.2), 0.28 + W(1.5) * Math.cos(cant), k * (W(1.9) + W(1.5) * Math.sin(cant)), 'idpanel').rotation.x = k * cant;
    // caret intake: dark mouth raked back beside the cockpit
    box(b, s.gunmetal, 0.16, 0.5, W(0.85), X(5.75), -0.08, k * W(1.62), 'intake').rotation.y = k * 0.35;
    // flat thrust-vectoring nozzle
    box(b, s.gunmetal, W(1.3), 0.3, W(1.25), X(17.1), 0.0, k * W(0.8), 'nozzle'); box(b, s.greyDark, W(0.5), 0.1, W(1.25), X(17.85), 0.1, k * W(0.8), 'nozzleflap').rotation.z = 0.25;
  }
  const gear = grp(b, 0, 0, 0, 'gear');                                                                    // tricycle gear, hidden in flight by the view
  for (const [m, z, r] of [[5.4, 0, 0.16], [11.4, W(1.6), 0.19], [11.4, -W(1.6), 0.19]]) { cyl(gear, s.steel, 0.045, 0.5, X(m), -0.6, z, 'y', 'strut'); cyl(gear, s.rubber, r, 0.13, X(m), -0.86, z, 'z', 'wheel'); }
  return { g, body: b, gear, ground: 1.4, muzzle: 3.4, muzzleY: -0.3 };
}
// A loose rocket in flight.
export function createRocket() { return fromTemplate('rocket', buildRocket); }
function buildRocket() {
  const s = shared(), g = new THREE.Group(), b = grp(g);
  cyl(b, s.ordnance, 0.09, 1.3, 0, 0, 0, 'x', 'rocket'); taper(b, s.gunmetal, 0.02, 0.09, 0.3, 0.8, 0, 0, 'warhead');
  for (let i = 0; i < 4; i++) { const f = box(b, s.gunmetal, 0.3, 0.26, 0.02, -0.55, 0, 0, 'finlet'); f.rotation.x = i * Math.PI / 4; }
  return { g, body: b };
}

export const ASSEMBLY = { abrams, battlemaster, overlord: (P) => sovietTank(P, true), technical, scoutcar: scoutCar, comanche, drone, raptor };
export const AIRCRAFT = { a10 };

// ---------------------------------------------------------------- external .glb models
// models/manifest.json maps a model key to a file: { "abrams": "abrams.glb" } or
// { "abrams": { "file": "abrams.glb", "length": 4.7, "rotY": 90, "y": 0 } }.
// Keys are the registry `model` names (abrams, battlemaster, overlord, technical, comanche, ...)
// plus "a10". Models are auto-scaled to the unit's length and turned to face +X.
// Nodes named *turret*, *rotor*, *tail*rotor* and *prop* are animated.
const GLB = new Map();
export const externalModels = () => [...GLB.keys()];
function nominalLength(key) {
  if (key === 'a10') return 10;
  for (const id in UNITS) if (UNITS[id].model === key) return UNITS[id].radius * 2.3;
  return 4;
}
function glbMaterial(m) {
  const mat = std(0xffffff, m.roughness, m.metalness);
  mat.color.setRGB(m.color[0], m.color[1], m.color[2]); // glTF factors are linear, like Three's working space
  if (m.doubleSided) mat.side = THREE.DoubleSide;
  if (m.image && typeof Image !== 'undefined') {
    const img = new Image(), tex = new THREE.Texture(img);
    tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace;
    img.onload = () => { tex.needsUpdate = true; mat.map = tex; mat.needsUpdate = true; URL.revokeObjectURL(img.src); };
    img.src = URL.createObjectURL(new Blob([m.image.bytes], { type: m.image.mime }));
  }
  return mat;
}
export function prepareGLB(data, key, opts = {}) {
  const mats = data.materials.map(glbMaterial), fallback = std(0x8a8a80, 0.9, 0.05);
  const build = (n, parent) => {
    const o = new THREE.Group(); o.name = n.name;
    o.matrix.fromArray(n.matrix); o.matrix.decompose(o.position, o.quaternion, o.scale);
    for (const p of n.prims) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(p.position, 3));
      if (p.normal) geo.setAttribute('normal', new THREE.BufferAttribute(p.normal, 3));
      if (p.uv) geo.setAttribute('uv', new THREE.BufferAttribute(p.uv, 2));
      if (p.index) geo.setIndex(new THREE.BufferAttribute(p.index, 1));
      if (!p.normal) geo.computeVertexNormals();
      mesh(o, geo, mats[p.material] || fallback, n.name);
    }
    for (const c of n.children) build(c, o);
    parent.add(o); return o;
  };
  const { min, max } = data.bounds, sx = max[0] - min[0], sz = max[2] - min[2];
  const air = key === 'a10' || Object.values(UNITS).some(d => d.model === key && d.air);
  const rotY = opts.rotY !== undefined ? opts.rotY * Math.PI / 180 : (sz >= sx ? Math.PI / 2 : 0); // glTF front is +Z; ours is +X
  const scale = opts.scale || (opts.length || nominalLength(key)) / Math.max(sx, sz, 1e-6);
  const fit = new THREE.Group(), centre = new THREE.Group();
  centre.position.set(-(min[0] + max[0]) / 2, air ? -(min[1] + max[1]) / 2 : -min[1], -(min[2] + max[2]) / 2);
  for (const r of data.roots) build(r, centre);
  fit.add(centre); fit.rotation.y = rotY; fit.scale.setScalar(scale); fit.position.y = opts.y || 0;
  return { template: fit, length: Math.max(sx, sz) * scale, height: (max[1] - min[1]) * scale, triangles: data.triangles };
}
export async function loadExternalModels(base = 'models/') {
  const report = { loaded: [], failed: [] };
  let manifest;
  try { const r = await fetch(base + 'manifest.json', { cache: 'no-cache' }); if (!r.ok) return report; manifest = await r.json(); } catch (e) { return report; }
  for (const [key, v] of Object.entries(manifest || {})) {
    if (key.startsWith('_')) continue;
    const o = typeof v === 'string' ? { file: v } : v;
    try {
      const r = await fetch(base + o.file); if (!r.ok) throw new Error('HTTP ' + r.status);
      GLB.set(key, prepareGLB(parseGLB(await r.arrayBuffer()), key, o)); report.loaded.push(key);
    } catch (err) { report.failed.push(key + ': ' + (err.message || err)); }
  }
  return report;
}
function fromGLB(ext, fallbackRig) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body); body.add(ext.template.clone(true));
  const rig = { g, body, muzzle: fallbackRig ? fallbackRig.muzzle : ext.length / 2, muzzleY: fallbackRig ? fallbackRig.muzzleY : ext.height * 0.7, noRecoil: true };
  body.traverse((o) => {
    const n = (o.name || '').toLowerCase(); if (!n || o.isMesh) return;
    if (n.includes('rotor') && n.includes('tail')) rig.rotorTail = rig.rotorTail || o;
    else if (n.includes('rotor')) rig.rotor = rig.rotor || o;
    else if (n.includes('turret')) rig.turret = rig.turret || o;
    else if (n.includes('prop')) rig.prop = rig.prop || o;
  });
  if (rig.turret) rig.turretX = rig.turret.position.x;
  return rig;
}

// ---------------------------------------------------------------- draw-call batching
// A procedural rig is dozens of small meshes (a tank is ~75). Drawn as-is, 100 units would cost
// thousands of draw calls a frame. bakeRig() merges every static mesh under each animated node
// into at most three vertex-coloured meshes (paint / metal / glass), so a tank becomes ~6 draws.
// The baked rig is kept as a template per unit type and team; each new unit is a clone that
// SHARES the template's geometry and materials, so units allocate no GPU memory when they spawn
// and leak none when they die.
const BAKE = !THREE.__mock && !THREE.__stub; // the test stand-ins have no matrix maths
const TEMPLATES = new Map();
let BUCKET = null;
function buckets() {
  return BUCKET || (BUCKET = { paint: std(0xffffff, 0.9, 0.04, { vertexColors: true }), metal: std(0xffffff, 0.6, 0.55, { vertexColors: true }), glass: std(0xffffff, 0.2, 0.5, { vertexColors: true }) });
}
const isObj = (v) => v && v.isObject3D;
function eachRef(v, f) { if (isObj(v)) f(v); else if (Array.isArray(v)) v.forEach(x => eachRef(x, f)); else if (v && typeof v === 'object' && v.constructor === Object) for (const k in v) eachRef(v[k], f); }
function mergeable(m) {
  const mat = m.material;
  if (!m.visible || !mat || !mat.isMeshStandardMaterial || mat.map || mat.normalMap || mat.transparent || mat.vertexColors || mat.flatShading || mat.side !== THREE.FrontSide) return null;
  if (mat.emissiveIntensity > 0 && (mat.emissive.r + mat.emissive.g + mat.emissive.b) > 0) return null;
  if (!m.geometry.attributes.position || !m.geometry.attributes.normal) return null;
  return mat.roughness <= 0.3 ? 'glass' : (mat.metalness > 0.3 || mat.roughness < 0.7) ? 'metal' : 'paint';
}
export function bakeRig(rig) {
  const keep = new Set(), onPath = new Set();
  for (const k in rig) eachRef(rig[k], (o) => keep.add(o));
  for (const o of keep) for (let p = o; p; p = p.parent) onPath.add(p);
  const v = new THREE.Vector3(), nm = new THREE.Matrix3(), B = buckets();
  let before = 0, after = 0;
  rig.g.traverse((o) => { if (o.isMesh) before++; });
  const process = (node) => {
    const acc = {}, loose = [], next = [];
    const gather = (o, toNode) => {
      for (const c of o.children.slice()) {
        if (onPath.has(c)) { next.push(c); continue; }             // animated node (or leads to one): stays a node
        c.updateMatrix(); const m = toNode.clone().multiply(c.matrix);
        if (c.isMesh) {
          const b = mergeable(c);
          if (b) {
            const g = c.geometry, P = g.attributes.position, Nn = g.attributes.normal, idx = g.index, n = idx ? idx.count : P.count, col = c.material.color;
            const a = acc[b] || (acc[b] = { p: [], n: [], c: [] }); nm.getNormalMatrix(m);
            for (let i = 0; i < n; i++) {
              const k = idx ? idx.getX(i) : i;
              v.fromBufferAttribute(P, k).applyMatrix4(m); a.p.push(v.x, v.y, v.z);
              v.fromBufferAttribute(Nn, k).applyMatrix3(nm).normalize(); a.n.push(v.x, v.y, v.z);
              a.c.push(col.r, col.g, col.b);
            }
          } else if (c.visible) loose.push([c, m]);                 // textured / emissive / see-through: keep as its own mesh
        }
        if (c.children.length) gather(c, m);
      }
    };
    gather(node, new THREE.Matrix4());
    for (const c of node.children.slice()) if (!onPath.has(c)) node.remove(c);
    for (const b in acc) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(acc[b].p), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(acc[b].n), 3));
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(acc[b].c), 3));
      const m = new THREE.Mesh(g, B[b]); m.castShadow = true; m.receiveShadow = true; m.name = 'baked-' + b; node.add(m);
    }
    for (const [c, m] of loose) { for (const k of c.children.slice()) c.remove(k); m.decompose(c.position, c.quaternion, c.scale); node.add(c); }
    for (const c of next) if (!c.isMesh) process(c);
  };
  process(rig.g);
  rig.g.traverse((o) => { if (o.isMesh) after++; });
  rig.meshes = [before, after];
  return rig;
}
// Instantiate from a baked template: clone the node tree, share geometry and materials, and
// re-point every rig field (turret, rotor, tiers[], addons{}, ...) at the clone's own nodes.
function fromTemplate(key, build) {
  if (!BAKE) return build();
  let t = TEMPLATES.get(key);
  if (!t) TEMPLATES.set(key, t = bakeRig(build()));
  const g = t.g.clone(true);
  const remap = (val) => {
    if (isObj(val)) { const path = []; for (let o = val; o !== t.g; o = o.parent) path.unshift(o.parent.children.indexOf(o)); let o = g; for (const i of path) o = o.children[i]; return o; }
    if (Array.isArray(val)) return val.map(remap);
    if (val && typeof val === 'object' && val.constructor === Object) { const out = {}; for (const k in val) out[k] = remap(val[k]); return out; }
    return val;
  };
  const rig = {}; for (const k in t) rig[k] = remap(t[k]);
  return rig;
}
export const bakeStats = () => ({ templates: TEMPLATES.size, sharedGeometries: GEO.size, baking: BAKE });

// ---------------------------------------------------------------- entry points
export function createModel(e) {
  let rig = null;
  if (e.kind === 'unit') {
    const d = UNITS[e.type], ext = GLB.get(d.model), make = ASSEMBLY[d.model];
    if (ext) { rig = fromGLB(ext, null); rig.source = 'glb'; }
    else if (make) { rig = fromTemplate('a:' + e.type + ':' + e.team, () => make(paint(d.faction, e.team))); rig.source = 'assembly'; }
  }
  if (!rig) { rig = fromTemplate('l:' + e.kind + ':' + e.type + ':' + e.team + ':' + (e.variant || 0), () => legacyModel(e)); rig.source = 'library'; }
  rig.kind = e.kind; rig.type = e.type;
  return rig;
}
// Off-map strike aircraft. Returns { g, body, gun? }; body pitches for the dive.
export function createPlane(model, faction, team) {
  const ext = GLB.get(model);
  if (ext) return fromGLB(ext, null);
  if (AIRCRAFT[model]) return fromTemplate('p:' + model + ':' + faction + ':' + team, () => AIRCRAFT[model](paint(faction, team)));
  return fromTemplate('p:' + model + ':' + faction + ':' + team, () => {
    const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
    const old = legacyPlane(model, faction, team); old.scale.setScalar(1.5); body.add(old);
    return { g, body };
  });
}
