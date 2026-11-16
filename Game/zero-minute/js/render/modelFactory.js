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
    // aircraft finishes: each jet has its own, so they can be told apart at a glance
    f22: std(0x9aa4aa, 0.62, 0.3), f22dark: std(0x6f7a82, 0.62, 0.3), gold: std(0xd9a441, 0.16, 0.9),   // F-22: pale metallic grey with darker patches, gold-tinted canopy
    strike: std(0x3a4046, 0.86, 0.08), strikeDark: std(0x2b3035, 0.88, 0.08),                          // F-15E: dark gunship grey all over
    white: std(0xe8e6df, 0.62, 0.1), red: std(0xb5261e, 0.7, 0.1), blue: std(0x2c5fa8, 0.7, 0.1),   // missile bodies and warning paint
    flanker: std(0x7f97ad, 0.8, 0.08), flankerDark: std(0x566c82, 0.82, 0.08), radome: std(0xd8dbd5, 0.8, 0), // J-11: blue-grey with a pale radome
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
function sovietTank(P, dual, hardpoints = true) {
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
  if (!hardpoints) return { g, body: b, turret: t, turretX: -0.15, muzzle: 4.7, muzzleY: 1.58 };
  // turret-roof and rear-deck hardpoints (shown once fitted)
  const gat = grp(t, -0.6, 0.56, 0.5, 'gatling'); cyl(gat, s.gunmetal, 0.2, 0.3, 0, 0.15, 0, 'y'); box(gat, s.gunmetal, 0.5, 0.26, 0.4, 0.05, 0.42, 0);
  for (const [dy, dz] of [[0.06, 0.06], [0.06, -0.06], [-0.06, 0.06], [-0.06, -0.06]]) cyl(gat, s.gunmetal, 0.028, 1.2, 0.85, 0.42 + dy, dz, 'x', 'barrel');
  const bun = grp(b, -2.05, 1.26, 0, 'bunker'); box(bun, P.dark, 1.3, 0.7, 1.9, 0, 0.35, 0); box(bun, s.gunmetal, 1.32, 0.1, 1.2, 0, 0.42, 0); box(bun, P.hull, 1.4, 0.05, 2.0, 0, 0.72, 0);
  gat.visible = false; bun.visible = false;
  return { g, body: b, turret: t, turretX: -0.15, muzzle: 4.7, muzzleY: 1.58, addons: { gatling: gat, bunker: bun } };
}
// The Battlemaster has no hardpoints, so the Overlord's Gatling turret and Battle Bunker are never built for it. They used to be built and hidden:
// hidden parts used to be merged into the drawn mesh, so every Battlemaster carried both.
function battlemaster(P) { const r = sovietTank(P, false, false); r.body.scale.setScalar(0.76); r.muzzle *= 0.76; r.muzzleY *= 0.76; return r; }

// ---------------------------------------------------------------- Technical (Sandstorm)
// Stripped pickup: open flatbed, pintle mount, and three machine-gun fits for the salvage tiers.
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
  const mg = grp(t, 0, 0.86, 0, 'mg');   // tier 0: machine gun
  box(mg, s.gunmetal, 0.46, 0.12, 0.1, 0.1, 0, 0, 'receiver'); cyl(mg, s.gunmetal, 0.026, 0.95, 0.8, 0.01, 0, 'x', 'barrel'); cyl(mg, s.gunmetal, 0.045, 0.1, 1.28, 0.01, 0, 'x', 'muzzle');
  box(mg, s.ordnance, 0.2, 0.16, 0.12, 0.05, -0.04, 0.14, 'ammobox'); box(mg, P.dark, 0.03, 0.4, 0.6, 0.34, 0.06, 0, 'gunshield');
  const hm = grp(t, 0, 0.86, 0, 'hmg');  // tier 1: heavy machine gun: longer barrel, bigger ammunition box and shield
  box(hm, s.gunmetal, 0.62, 0.16, 0.14, 0.1, 0, 0, 'receiver'); cyl(hm, s.gunmetal, 0.034, 1.3, 0.98, 0.01, 0, 'x', 'barrel'); cyl(hm, s.gunmetal, 0.06, 0.16, 1.66, 0.01, 0, 'x', 'muzzle');
  box(hm, s.ordnance, 0.28, 0.24, 0.18, 0.05, -0.05, 0.19, 'ammobox'); box(hm, P.dark, 0.03, 0.52, 0.84, 0.4, 0.08, 0, 'gunshield');
  const cn = grp(t, 0, 0.86, 0, 'twinmg'); // tier 2: twin heavy machine guns
  box(cn, s.gunmetal, 0.6, 0.2, 0.36, 0.1, 0, 0, 'receiver'); for (const z of [-0.1, 0.1]) { cyl(cn, s.gunmetal, 0.04, 1.5, 1.1, 0.02, z, 'x', 'barrel'); cyl(cn, s.gunmetal, 0.06, 0.14, 1.82, 0.02, z, 'x', 'muzzle'); }
  box(cn, P.dark, 0.03, 0.46, 0.8, 0.42, 0.08, 0, 'gunshield');
  for (const z of [-0.26, 0.26]) box(cn, s.ordnance, 0.3, 0.26, 0.16, 0.0, -0.06, z, 'ammobox');
  hm.visible = false; cn.visible = false;
  return { g, body: b, turret: t, turretX: -1.0, muzzle: 1.6, muzzleY: 1.52, tiers: [mg, hm, cn] };
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
// ---------------------------------------------------------------- twin-engine fighters from real dimensions
// One builder, three aircraft. Every number in a spec is in metres on the real aircraft (`m` = metres aft
// of the nose tip, `hw` = half-width from the centreline); `scale` turns them into game units.
//   F-22A Raptor:      18.9 m long, 13.56 m span. Clipped-diamond wing, fins canted 28 degrees, flat nozzles, chined nose.
//   F-15E Strike Eagle: 19.43 m long, 13.05 m span. 45 degree wing, tall upright fins, round nozzles, two-seat canopy, box intakes.
//   J-11 (Su-27 family): 21.9 m long, 14.7 m span. Wing-root extensions, engines slung wide apart, tail "stinger" between them.
export const RAPTOR = { missiles: 4, skin: 'f22', finMat: 'f22', patch: 'f22dark', glass: 'gold', canopyH: 0.38, scale: 0.413, length: 18.9, span: 13.56, tailSpan: 8.84, sweep: 42, cant: 28, mid: 9.0,
  chine: [[2.2, 0.75], [6.2, 1.35]], shoulder: 6.2, body: [5.6, 2.1, 16.6, 1.95], spine: [[6.2, 0.3], [7.4, 0.5], [11.5, 0.42], [14.5, 0.3]], canopy: [4.55, 1.9],
  wing: [7.0, 2.1, 1.7, 14.3], tail: [14.0, 1.9, 18.9, 18.2], fin: [12.2, 14.7, 16.2, 16.6, 2.7, 1.9], intake: [5.75, 1.62, 0.35], nozzle: ['flat', 17.1, 0.8], gear: [5.4, 11.4, 1.6] };
export const EAGLE = { skin: 'strike', finMat: 'strikeDark', cft: true, scale: 0.402, length: 19.43, span: 13.05, tailSpan: 8.61, sweep: 45, cant: 0, mid: 9.3,
  chine: [[2.6, 0.6], [5.6, 1.05]], shoulder: 5.6, body: [5.2, 1.85, 17.4, 1.7], spine: [[5.6, 0.3], [7.0, 0.55], [12.0, 0.46], [15.5, 0.3]], canopy: [4.9, 2.5],
  wing: [7.4, 1.85, 1.6, 13.9], tail: [15.3, 1.7, 19.43, 18.7], fin: [13.4, 15.4, 16.9, 17.4, 3.1, 1.75], intake: [5.5, 1.4, -0.25], nozzle: ['round', 18.3, 0.85], gear: [5.0, 11.2, 1.4], bombs: 2 };
export const FLANKER = { skin: 'flanker', finMat: 'flankerDark', radome: 1.9, scale: 0.365, length: 21.9, span: 14.7, tailSpan: 9.9, sweep: 42, cant: 0, mid: 10.6,
  chine: [[3.0, 0.7], [6.6, 1.1]], lerx: [[6.6, 1.1], [9.2, 2.3]], shoulder: 9.2, body: [8.6, 2.3, 18.4, 2.2], spine: [[5.6, 0.34], [7.2, 0.62], [12.5, 0.5], [17.0, 0.3]], canopy: [4.9, 1.7],
  wing: [9.0, 2.3, 1.6, 15.6], tail: [16.2, 2.3, 20.2, 19.6], fin: [14.6, 16.4, 17.9, 18.4, 3.4, 2.35], intake: [8.4, 1.25, 0], nozzle: ['round', 19.2, 1.25], gear: [5.6, 12.4, 2.0], stinger: 21.9, nacelles: true, rails: true };
function fighter(P, F, paintIt) {
  const s = shared(), g = new THREE.Group(), b = grp(g), K = F.scale, X = (m) => +((F.mid - m) * K).toFixed(3), W = (m) => +(m * K).toFixed(3);
  const tan = Math.tan(F.sweep * Math.PI / 180), cant = F.cant * Math.PI / 180, skin = paintIt || s[F.skin] || s.grey, finMat = s[F.finMat] || s.greyDark, sh = F.shoulder;
  // forward fuselage: thin wide chine deck (and wing-root extension) over a deeper, narrower body
  prism(b, skin, [[X(0), 0]].concat(F.chine.map(c => [X(c[0]), W(c[1])]), F.chine.slice().reverse().map(c => [X(c[0]), -W(c[1])])), 0.14, 'plan', 0, 0.02, 0, 'chine');
  if (F.lerx) prism(b, skin, [[X(F.lerx[0][0]), W(F.lerx[0][1])], [X(F.lerx[1][0]), W(F.lerx[1][1])], [X(F.lerx[1][0]), -W(F.lerx[1][1])], [X(F.lerx[0][0]), -W(F.lerx[0][1])]], 0.14, 'plan', 0, 0.02, 0, 'lerx');   // leading-edge root extension: flares out to the wing (its own convex piece)
  prism(b, skin, [[X(sh * 0.05), -0.02], [X(sh * 0.42), 0.3], [X(sh), 0.36], [X(sh), -0.4], [X(sh * 0.35), -0.3]], W(1.5), 'side', 0, 0, 0, 'forebody');
  prism(b, skin, [[X(F.body[0]), W(F.body[1])], [X(F.body[2]), W(F.body[3])], [X(F.body[2]), -W(F.body[3])], [X(F.body[0]), -W(F.body[1])]], 0.66, 'plan', 0, -0.03, 0, 'fuselage');
  prism(b, skin, F.spine.map(p => [X(p[0]), p[1]]), W(1.5), 'side', 0, 0, 0, 'spine');
  ball(b, s[F.glass] || s.glass, W(F.canopy[1]), F.canopyH || 0.3, W(F.glass ? 0.7 : 0.62), X(F.canopy[0]), 0.36, 0, 'canopy');
  if (F.radome) taper(b, s.radome, 0.03, W(0.62), W(F.radome), X(F.radome / 2), 0.02, 0, 'radome');                                         // pale nose cone
  if (F.patch) for (const k of [-1, 1]) { // F-22 two-tone scheme: darker diamonds on the wings and a band across the back
    const tipLE = F.wing[0] + (F.span / 2 - F.wing[1]) * tan, mx = (F.wing[0] + F.wing[3]) / 2 + 1.2;
    prism(b, s[F.patch], [[X(mx - 1.6), k * W(F.wing[1] + 0.4)], [X(tipLE + 1.0), k * W(F.span / 2 - 1.6)], [X(mx + 1.9), k * W(F.span / 2 - 2.2)], [X(mx + 2.2), k * W(F.wing[1] + 0.4)]], 0.02, 'plan', 0, 0.075, 0, 'camopatch');
  }
  if (F.patch) box(b, s[F.patch], W(2.6), 0.02, W(3.2), X(F.body[2] - 3.4), 0.31, 0, 'camoband');
  if (F.cft) for (const k of [-1, 1]) box(b, skin, W(6.4), 0.34, W(0.7), X(10.4), 0.02, k * W(F.body[1] + 0.2), 'conformaltank');                    // F-15E conformal fuel tanks along the fuselage sides
  if (F.stinger) box(b, skin, X(F.body[2] - 1) - X(F.stinger), 0.26, W(0.9), (X(F.body[2] - 1) + X(F.stinger)) / 2, 0.1, 0, 'stinger');   // tail boom between the engines
  for (const k of [-1, 1]) {
    const tipLE = F.wing[0] + (F.span / 2 - F.wing[1]) * tan;
    prism(b, skin, [[X(F.wing[0]), k * W(F.wing[1])], [X(tipLE), k * W(F.span / 2)], [X(tipLE + F.wing[2]), k * W(F.span / 2)], [X(F.wing[3]), k * W(F.wing[1])]], 0.09, 'plan', 0, 0.02, 0, 'wing');
    if (F.rails) cyl(b, s.gunmetal, 0.035, W(3.2), X(tipLE + 0.8), 0.02, k * W(F.span / 2), 'x', 'wingtiprail');
    const tailLE = F.tail[0] + (F.tailSpan / 2 - F.tail[1]) * tan;
    prism(b, skin, [[X(F.tail[0]), k * W(F.tail[1])], [X(tailLE), k * W(F.tailSpan / 2)], [X(F.tail[2]), k * W(F.tailSpan / 2)], [X(F.tail[3]), k * W(F.tail[1])]], 0.07, 'plan', 0, -0.02, 0, 'tailplane');
    const fin = prism(b, finMat, [[X(F.fin[0]), 0], [X(F.fin[1]), W(F.fin[4])], [X(F.fin[2]), W(F.fin[4])], [X(F.fin[3]), 0]], 0.06, 'side', 0, 0.28, k * W(F.fin[5]), 'fin'); fin.rotation.x = k * cant;
    box(b, P.id, 0.42, 0.3, 0.07, X((F.fin[1] + F.fin[2]) / 2 - 0.2), 0.28 + W(F.fin[4] * 0.55) * Math.cos(cant), k * (W(F.fin[5]) + W(F.fin[4] * 0.55) * Math.sin(cant)), 'idpanel').rotation.x = k * cant;
    box(b, s.gunmetal, 0.16, 0.5, W(0.85), X(F.intake[0]), F.nacelles ? -0.36 : -0.08, k * W(F.intake[1]), 'intake').rotation.y = k * F.intake[2];
    if (F.nacelles) box(b, skin, X(F.intake[0]) - X(F.nozzle[1]), 0.42, W(1.3), (X(F.intake[0]) + X(F.nozzle[1])) / 2, -0.38, k * W(F.nozzle[2]), 'nacelle');       // engine pod slung under the body
    if (F.nozzle[0] === 'flat') { box(b, s.gunmetal, W(1.3), 0.3, W(1.25), X(F.nozzle[1]), 0.0, k * W(F.nozzle[2]), 'nozzle'); box(b, s.greyDark, W(0.5), 0.1, W(1.25), X(F.nozzle[1] + 0.75), 0.1, k * W(F.nozzle[2]), 'nozzleflap').rotation.z = 0.25; }
    else cyl(b, s.gunmetal, W(0.62), W(1.8), X(F.nozzle[1]), F.nacelles ? -0.3 : -0.02, k * W(F.nozzle[2]), 'x', 'nozzle');
    if (F.bombs) box(b, s.greyDark, 0.5, 0.12, 0.07, X(10.2), -0.4, k * W(2.6), 'pylon');
  }
  // What it carries, one node per round so the view can take each off as it is fired (rig.stores[i] is shown while i < ammo).
  const stores = [];
  if (F.bombs) for (const k of [1, -1]) { const st = grp(b, X(10.2), -0.52, k * W(2.6), 'store'); cyl(st, s.ordnance, 0.1, 1.5, 0, 0, 0, 'x', 'bomb'); taper(st, s.ordnance, 0.02, 0.1, 0.3, 0.9, 0, 0, 'bombnose'); stores.push(st); } // GBU-28 bunker buster
  if (F.missiles) for (let i = 0; i < F.missiles; i++) { // air-to-air missiles under the wing roots, inner pair fired last
    const k = i % 2 ? -1 : 1, row = i >> 1, st = grp(b, X(F.wing[0] + 3.0 + row * 0.5), -0.3, k * W(F.wing[1] + 0.5 + row * 1.5), 'store');
    cyl(st, s.white, 0.05, 1.3, 0, 0, 0, 'x', 'aam'); taper(st, s.gunmetal, 0.01, 0.05, 0.26, 0.78, 0, 0, 'aamnose');
    for (const r of [0, Math.PI / 2]) box(st, s.greyDark, 0.26, 0.3, 0.015, -0.5, 0, 0, 'aamfin').rotation.x = r;
    box(st, s.greyDark, 0.4, 0.1, 0.05, 0, 0.1, 0, 'pylon'); stores.push(st);
  }
  const gear = grp(b, 0, 0, 0, 'gear');                                                                    // tricycle gear, hidden in flight by the view
  for (const [m, z, r] of [[F.gear[0], 0, 0.16], [F.gear[1], W(F.gear[2]), 0.19], [F.gear[1], -W(F.gear[2]), 0.19]]) { cyl(gear, s.steel, 0.045, 0.5, X(m), -0.6, z, 'y', 'strut'); cyl(gear, s.rubber, r, 0.13, X(m), -0.86, z, 'z', 'wheel'); }
  return { g, body: b, gear, stores, ground: 1.4, muzzle: X(1), muzzleY: -0.3 };
}
const raptor = (P) => fighter(P, RAPTOR), f15e = (P) => fighter(P, EAGLE), j11 = (P) => fighter(P, FLANKER);

// CH-47 Chinook: 15.5 m fuselage, two 18.3 m three-blade rotors in tandem (the aft one sits higher on a tall pylon),
// engines on the aft pylon, long fuel pods down both sides, four fixed wheels, loading ramp at the tail.
export const CHINOOK = { scale: 0.38, fuselage: 15.5, rotor: 18.3 };
function chinook(P) {
  const s = shared(), g = new THREE.Group(), b = grp(g), R = CHINOOK.rotor / 2 * CHINOOK.scale;
  prism(b, P.hull, [[3.0, -0.25], [2.85, 0.35], [2.3, 0.75], [-2.2, 0.75], [-2.95, 0.45], [-2.95, 0.0], [-2.2, -0.6], [2.4, -0.6]], 1.4, 'side', 0, 0, 0, 'fuselage');
  box(b, s.glass, 0.5, 0.36, 1.2, 2.6, 0.4, 0, 'windscreen').rotation.z = -0.55;
  prism(b, P.hull, [[2.3, 0.75], [2.1, 1.25], [1.3, 1.25], [0.9, 0.75]], 0.7, 'side', 0, 0, 0, 'forwardpylon');
  prism(b, P.hull, [[-1.3, 0.75], [-1.9, 1.75], [-2.9, 1.75], [-2.95, 0.45]], 0.7, 'side', 0, 0, 0, 'aftpylon');
  box(b, P.dark, 0.9, 0.06, 1.15, -2.9, -0.25, 0, 'ramp').rotation.z = 0.6;
  for (const k of [-1, 1]) {
    box(b, P.dark, 3.7, 0.42, 0.3, -0.2, -0.32, k * 0.8, 'fuelpod');
    cyl(b, s.gunmetal, 0.2, 0.95, -2.15, 1.0, k * 0.62, 'x', 'engine');
    for (const x of [1.9, -1.6]) { cyl(b, s.steel, 0.04, 0.3, x, -0.68, k * 0.82, 'y', 'strut'); cyl(b, s.rubber, 0.22, 0.16, x, -0.8, k * 0.82, 'z', 'wheel'); }
    for (const x of [1.2, 0.2, -0.8]) cyl(b, s.glass, 0.13, 0.03, x, 0.3, k * 0.7, 'z', 'window');
    box(b, P.id, 0.55, 0.32, 0.03, -1.75, 0.25, k * 0.71, 'idpanel');
  }
  const mk = (x, y, name, turn) => { // one three-blade rotor on its mast
    cyl(b, s.gunmetal, 0.08, 0.3, x, y - 0.15, 0, 'y', 'mast');
    const r = grp(b, x, y, 0, name); r.rotation.y = turn; cyl(r, s.gunmetal, 0.2, 0.1, 0, 0, 0, 'y', 'hub');
    for (let i = 0; i < 3; i++) { const arm = grp(r); arm.rotation.y = i * Math.PI * 2 / 3; box(arm, s.gunmetal, R - 0.1, 0.03, 0.28, (R + 0.1) / 2, 0, 0, 'blade'); }
    return r;
  };
  const rotor = mk(1.7, 1.42, 'rotor', 0), rotor2 = mk(-2.4, 1.92, 'rotor2', Math.PI / 3);
  return { g, body: b, rotor, rotor2, ground: 1.05 };
}

// B-2 Spirit (off-map bomber): a flying wing, 52.4 m span and 21 m long, with the double-W trailing edge. No tail at all.
export const SPIRIT = { span: 52.4, length: 21.0, scale: 0.34 };
function b2(P) {
  const s = shared(), g = new THREE.Group(), b = grp(g), K = SPIRIT.scale, h = SPIRIT.span / 2 * K, L = SPIRIT.length * K, dark = s.greyDark;
  for (const k of [-1, 1]) {
    prism(b, dark, [[L * 0.5, 0], [L * 0.5 - h * 0.62, k * h], [L * 0.5 - h * 0.62 - L * 0.2, k * h], [-L * 0.08, 0]], 0.3, 'plan', 0, 0, 0, 'wing');   // 33 degree leading edge out to the tip
    prism(b, dark, [[-L * 0.08, 0], [-L * 0.08, k * h * 0.42], [-L * 0.36, k * h * 0.2], [-L * 0.5, 0]], 0.28, 'plan', 0, 0, 0, 'beavertail');                            // inner sawtooth of the trailing edge
    box(b, s.gunmetal, 1.6, 0.36, 0.9, L * 0.05, 0.3, k * 1.5, 'intake'); box(b, P.id, 0.6, 0.02, 0.6, -L * 0.1, 0.17, k * h * 0.5, 'idpanel');
  }
  prism(b, dark, [[L * 0.5, -0.05], [L * 0.3, 0.55], [-L * 0.1, 0.6], [-L * 0.42, 0.1], [-L * 0.42, -0.2], [L * 0.3, -0.25]], 1.9, 'side', 0, 0, 0, 'centrebody');
  ball(b, s.glass, 0.9, 0.22, 0.75, L * 0.3, 0.42, 0, 'canopy');
  return { g, body: b, muzzle: L * 0.5, muzzleY: -0.3 };
}

// LAV-25: 8x8 amphibious fighting vehicle, 6.39 m long, 2.5 m wide, 2.69 m high. Boat-shaped nose, trim vane,
// two-man turret with the 25 mm Bushmaster, two propellers at the stern. `tow` adds the twin TOW launcher.
function lav25(P) {
  const s = shared(), g = new THREE.Group(), b = grp(g);
  prism(b, P.hull, [[2.5, 0.75], [1.5, 1.35], [-2.4, 1.35], [-2.5, 0.5], [-2.2, 0.35], [1.7, 0.35]], 1.9, 'side', 0, 0, 0, 'hull');                 // sharp sloped nose, flat deck
  box(b, P.dark, 0.06, 0.5, 1.7, 2.05, 1.1, 0, 'trimvane').rotation.z = -0.55;
  for (const k of [-1, 1]) { for (const x of [1.75, 0.65, -0.65, -1.75]) cyl(b, s.rubber, 0.42, 0.3, x, 0.42, k * 0.98, 'z', 'wheel'); cyl(b, s.gunmetal, 0.16, 0.2, -2.45, 0.55, k * 0.6, 'x', 'propeller'); }
  const t = grp(b, 0.1, 1.35, 0, 'turret');
  prism(t, P.hull, [[0.95, -0.3], [0.95, 0.3], [0.4, 0.62], [-0.8, 0.62], [-0.8, -0.62], [0.4, -0.62]], 0.5, 'plan', 0, 0.25, 0, 'turretshell');
  cyl(t, s.gunmetal, 0.045, 1.9, 1.75, 0.28, 0, 'x', 'barrel'); box(t, s.gunmetal, 0.3, 0.14, 0.14, 0.95, 0.28, 0, 'mantlet'); box(t, P.id, 0.4, 0.02, 0.4, -0.3, 0.51, 0, 'idpanel');
  for (const k of [-1, 1]) box(t, s.gunmetal, 0.5, 0.16, 0.12, 0.1, 0.36, k * 0.7, 'smokelaunchers');
  return { g, body: b, turret: t, turretX: 0.1, muzzle: 2.8, muzzleY: 1.63 };
}

// Scud-B on its MAZ-543 launcher: 13.4 m long, 3 m wide, eight wheels, a split cab either side of the missile's nose.
function scudtel(P) {
  const s = shared(), g = new THREE.Group(), b = grp(g);
  box(b, P.hull, 5.4, 0.7, 1.5, 0, 0.95, 0, 'chassis');
  for (const k of [-1, 1]) { for (const x of [2.0, 0.9, -0.9, -2.0]) cyl(b, s.rubber, 0.5, 0.36, x, 0.5, k * 0.62, 'z', 'wheel'); box(b, P.hull, 1.1, 0.85, 0.55, 2.35, 1.5, k * 0.5, 'cab'); box(b, s.glass, 0.06, 0.4, 0.42, 2.92, 1.6, k * 0.5, 'windscreen'); }
  box(b, P.dark, 3.4, 0.5, 1.3, -0.9, 1.5, 0, 'equipment'); box(b, P.id, 0.5, 0.02, 0.5, -1.6, 1.76, 0.3, 'idpanel');
  const arm = grp(b, -2.5, 1.85, 0, 'erector'); arm.rotation.z = 0.12;                                                                               // the missile rides almost flat, nose forward between the cabs
  const ms = grp(arm, 0, 0, 0, 'round');                                                                                                           // the missile itself: gone after a launch, slid back on during the reload
  cyl(ms, s.ordnance, 0.22, 4.6, 2.5, 0.1, 0, 'x', 'missile'); taper(ms, s.ordnance, 0.012, 0.22, 1.5, 5.55, 0.1, 0, 'warhead');                    // long pointed nose cone
  for (let i = 0; i < 4; i++) { const f = box(ms, s.gunmetal, 0.45, 0.4, 0.03, 0.4, 0.1, 0, 'fin'); f.rotation.x = i * Math.PI / 2; f.position.y += Math.cos(i * Math.PI / 2) * 0.3; f.position.z += Math.sin(i * Math.PI / 2) * 0.3; }
  box(arm, s.steel, 4.4, 0.1, 0.5, 2.3, -0.2, 0, 'cradle');
  return { g, body: b, arm, round: ms, muzzle: 0, muzzleY: 5 };
}
// A loose rocket in flight.
export function createRocket() { return fromTemplate('rocket', buildRocket); }
function buildRocket() {
  const s = shared(), g = new THREE.Group(), b = grp(g);
  cyl(b, s.ordnance, 0.09, 1.3, 0, 0, 0, 'x', 'rocket'); taper(b, s.gunmetal, 0.02, 0.09, 0.3, 0.8, 0, 0, 'warhead');
  for (let i = 0; i < 4; i++) { const f = box(b, s.gunmetal, 0.3, 0.26, 0.02, -0.55, 0, 0, 'finlet'); f.rotation.x = i * Math.PI / 4; }
  return { g, body: b };
}

// FPV attack drone: a racing quadcopter frame (about 0.35 m across, drawn 5x so it can be seen) carrying an RPG warhead.
function fpv(P) {
  const s = shared(), g = new THREE.Group(), b = grp(g);
  box(b, s.gunmetal, 0.9, 0.12, 0.34, 0, 0, 0, 'frame'); box(b, P.id, 0.3, 0.02, 0.2, -0.2, 0.07, 0, 'idpanel'); box(b, s.steel, 0.3, 0.16, 0.26, -0.15, 0.14, 0, 'battery');
  for (const [x, z] of [[0.55, 0.55], [0.55, -0.55], [-0.55, 0.55], [-0.55, -0.55]]) { const arm = box(b, s.gunmetal, 0.8, 0.05, 0.08, x / 2, 0, z / 2, 'arm'); arm.rotation.y = -Math.atan2(z, x); cyl(b, s.steel, 0.07, 0.12, x, 0.08, z, 'y', 'motor'); cyl(b, s.glass, 0.3, 0.015, x, 0.16, z, 'y', 'propdisc'); }
  cyl(b, s.ordnance, 0.07, 0.7, 0.25, -0.16, 0, 'x', 'warhead'); taper(b, s.ordnance, 0.02, 0.11, 0.3, 0.72, -0.16, 0, 'warheadnose');
  ball(b, s.glass, 0.07, 0.07, 0.07, 0.5, 0.05, 0, 'camera');
  return { g, body: b, muzzle: 0, muzzleY: 0 };
}
// ---------------------------------------------------------------- ships
// y = 0 is the waterline and the bow points along +X. Lengths follow the real vessels at the game's scale for big
// machines (SHIPS: real metres and the scale used). A hull is a plan-view outline (pointed bow, slightly narrower
// stern) extruded from the keel up to the deck; a darker boot-topping band sits at the waterline.
export const SHIPS = {
  rhib: { real: 11, length: 5.4, beam: 1.9 },        // 11 m Naval Special Warfare RHIB
  mkv: { real: 25, length: 10, beam: 2.4 },          // Mk V Special Operations Craft
  frigate: { real: 151, length: 30, beam: 4.2 },     // Constellation-class frigate
  corvette: { real: 90, length: 24, beam: 3.6 },     // Type 056 corvette
  lcraft: { real: 23, length: 10, beam: 3.4 },       // mechanised landing craft
  mboat: { real: 38, length: 11, beam: 2.7 },        // Osa-size fast attack craft, here an armed fishing boat hull
  dboat: { real: 5.5, length: 4.2, beam: 1.3 },      // uncrewed explosive boat
};
function shipHull(p, mat, L, B, free, draft, bow = 0.3, name = 'hull') {
  const h = B / 2, x0 = -L / 2, xb = L / 2 - L * bow;
  prism(p, shared().track, [[x0, -h * 0.8], [xb, -h * 0.98], [L / 2 - 0.02, 0], [xb, h * 0.98], [x0, h * 0.8]], 0.3, 'plan', 0, 0.02, 0, 'boottop');
  return prism(p, mat, [[x0, -h * 0.82], [xb, -h], [L / 2, 0], [xb, h], [x0, h * 0.82]], free + draft, 'plan', 0, (free - draft) / 2 + 0.16, 0, name);
}
// A small gun on a pintle with a crew shield: twin or single barrel. Returns the group so it can be the turret.
function deckGun(p, x, y, z, barrels, len, name = 'turret') {
  const s = shared(), t = grp(p, x, y, z, name);
  cyl(t, s.gunmetal, 0.05, 0.6, 0, 0.3, 0, 'y', 'pintle'); box(t, s.gunmetal, 0.4, 0.15, 0.12 + barrels * 0.1, 0.05, 0.66, 0, 'receiver');
  for (let i = 0; i < barrels; i++) cyl(t, s.gunmetal, 0.03, len, 0.2 + len / 2, 0.67, (i - (barrels - 1) / 2) * 0.16, 'x', 'barrel');
  box(t, s.greyDark, 0.03, 0.4, 0.5 + barrels * 0.1, 0.22, 0.7, 0, 'gunshield');
  return t;
}
function rotaryGun(p, x, y, z, len, name = 'minigun') {
  const s = shared(), q = grp(p, x, y, z, name);
  for (const [dy, dz] of [[0.05, 0.05], [0.05, -0.05], [-0.05, 0.05], [-0.05, -0.05]]) cyl(q, s.gunmetal, 0.022, len, len / 2, dy, dz, 'x', 'barrel');
  cyl(q, s.gunmetal, 0.09, 0.3, -0.05, 0, 0, 'x', 'motor'); return q;
}
// RHIB: grey inflatable collar round a deep-V hull, centre console, twin machine guns on the bow, two outboards.
function rhib(P) {
  const s = shared(), g = new THREE.Group(), b = grp(g), D = SHIPS.rhib;
  shipHull(b, s.greyDark, D.length - 0.4, 1.4, 0.3, 0.3, 0.34);
  for (const k of [-1, 1]) { cyl(b, s.rubber, 0.28, 3.7, -0.75, 0.5, k * 0.74, 'x', 'collar'); cyl(b, s.rubber, 0.28, 1.75, 1.83, 0.5, k * 0.37, 'x', 'collar').rotation.y = -k * 0.45; }
  ball(b, s.rubber, 0.3, 0.28, 0.3, 2.62, 0.5, 0, 'collar');
  box(b, s.grey, 3.6, 0.06, 1.2, -0.7, 0.38, 0, 'deck');
  box(b, P.hull, 0.8, 0.85, 0.8, -0.5, 0.82, 0, 'console'); box(b, s.glass, 0.04, 0.3, 0.72, -0.08, 1.38, 0, 'windscreen').rotation.z = 0.3;
  box(b, P.id, 0.7, 0.03, 0.7, -0.5, 1.26, 0, 'idpanel');
  for (const k of [-1, 1]) { box(b, s.cloth, 0.2, 0.5, 0.26, -1.15, 0.9, k * 0.3, 'crew'); ball(b, s.skin, 0.11, 0.12, 0.11, -1.15, 1.26, k * 0.3, 'crew'); }
  for (const k of [-1, 1]) { box(b, s.gunmetal, 0.4, 0.62, 0.26, -2.62, 0.62, k * 0.3, 'outboard'); box(b, s.gunmetal, 0.14, 0.5, 0.1, -2.72, 0.1, k * 0.3, 'outboard'); }
  cyl(b, s.gunmetal, 0.03, 0.9, -1.9, 1.1, 0, 'y', 'mast'); box(b, s.grey, 0.3, 0.06, 0.5, -1.9, 1.56, 0, 'radar');
  const t = deckGun(b, 1.25, 0.4, 0, 2, 0.9);
  return { g, body: b, turret: t, turretX: 1.25, muzzle: 2.3, muzzleY: 1.05, noRecoil: true, ship: true };
}
// Mk V Special Operations Craft: long low aluminium hull, angular cabin with a raked windscreen, radar arch, and an
// open after deck with the weapons: twin miniguns, two grenade launchers and a Hellfire launcher on the cabin roof.
function mkv(P) {
  const s = shared(), g = new THREE.Group(), b = grp(g), D = SHIPS.mkv;
  shipHull(b, s.greyDark, D.length, D.beam, 0.62, 0.4, 0.36);
  box(b, s.grey, 5.4, 0.05, 2.0, -2.0, 0.8, 0, 'deck');
  prism(b, s.grey, [[-0.9, 0.78], [2.2, 0.78], [1.5, 1.7], [-0.9, 1.7]], 1.9, 'side', 0, 0, 0, 'cabin');
  box(b, s.glass, 0.04, 0.52, 1.7, 1.83, 1.38, 0, 'windscreen').rotation.z = 0.65; for (const k of [-1, 1]) box(b, s.glass, 1.4, 0.3, 0.03, 0.4, 1.42, k * 0.96, 'window');
  box(b, P.id, 1.3, 0.03, 1.3, 0.1, 1.72, 0, 'idpanel');
  for (const k of [-1, 1]) box(b, s.gunmetal, 0.07, 0.9, 0.07, -1.0, 2.1, k * 0.85, 'arch'); box(b, s.gunmetal, 0.07, 0.07, 1.78, -1.0, 2.55, 0, 'arch');
  box(b, s.grey, 0.5, 0.08, 0.9, -1.0, 2.64, 0, 'radar'); cyl(b, s.gunmetal, 0.02, 1.1, -1.0, 3.1, 0.5, 'y', 'antenna');
  const hf = grp(b, 0.9, 1.74, -0.5, 'hellfire'); box(hf, s.gunmetal, 0.9, 0.3, 0.34, 0, 0.2, 0, 'launcher'); cyl(hf, s.ordnance, 0.07, 0.9, 0.05, 0.22, 0, 'x', 'missile');
  for (const k of [-1, 1]) { const q = grp(b, -3.9, 0.84, k * 0.8, 'mk19'); cyl(q, s.gunmetal, 0.04, 0.5, 0, 0.25, 0, 'y'); box(q, s.gunmetal, 0.44, 0.2, 0.24, 0.05, 0.56, 0); cyl(q, s.gunmetal, 0.035, 0.36, 0.42, 0.56, 0, 'x', 'barrel'); }
  for (const k of [-1, 1]) { box(b, s.steel, 0.5, 0.3, 0.5, -4.75, 0.2, k * 0.6, 'waterjet'); }
  const t = grp(b, -2.6, 0.84, 0, 'turret');
  cyl(t, s.gunmetal, 0.32, 0.06, 0, 0.03, 0, 'y', 'ring'); cyl(t, s.gunmetal, 0.05, 0.6, 0, 0.3, 0, 'y', 'pintle');
  for (const k of [-1, 1]) rotaryGun(t, 0.1, 0.68, k * 0.22, 0.9); box(t, s.greyDark, 0.03, 0.45, 0.9, 0.2, 0.7, 0, 'gunshield');
  box(t, s.cloth, 0.2, 0.55, 0.3, -0.35, 0.3, 0, 'gunner'); ball(t, s.skin, 0.11, 0.12, 0.11, -0.35, 0.7, 0, 'gunner');
  return { g, body: b, turret: t, turretX: -2.6, muzzle: 1.1, muzzleY: 1.55, noRecoil: true, ship: true };
}
// Frigate: flared bow, deck gun forward, missile cells, a slab-sided bridge with an enclosed mast, funnel, a laser
// turret on the hangar roof and a helicopter deck aft.
function frigate(P) {
  const s = shared(), g = new THREE.Group(), b = grp(g), D = SHIPS.frigate, L = D.length, B = D.beam;
  shipHull(b, s.grey, L, B, 1.5, 0.9, 0.26);
  box(b, s.greyDark, L * 0.96, 0.05, B * 0.8, -0.4, 1.68, 0, 'deck');
  box(b, s.greyDark, 1.6, 0.3, 1.8, 8.0, 1.8, 0, 'vls'); for (const x of [7.5, 8.0, 8.5]) for (const z of [-0.5, 0, 0.5]) box(b, s.gunmetal, 0.36, 0.04, 0.36, x, 1.97, z, 'cell');
  prism(b, s.grey, [[1.2, 1.66], [6.6, 1.66], [5.8, 4.3], [1.2, 4.3]], 3.5, 'side', 0, 0, 0, 'bridge');
  box(b, s.glass, 0.05, 0.4, 3.0, 6.05, 3.7, 0, 'bridgewindows').rotation.z = 0.3;
  prism(b, s.grey, [[2.2, 4.3], [4.4, 4.3], [3.9, 7.4], [2.7, 7.4]], 1.5, 'side', 0, 0, 0, 'mast'); box(b, s.greyDark, 1.3, 0.9, 1.9, 3.3, 6.3, 0, 'radarface');
  cyl(b, s.gunmetal, 0.04, 1.6, 3.3, 8.2, 0, 'y', 'pole'); box(b, s.grey, 0.2, 0.3, 1.6, 3.3, 8.0, 0, 'yard');
  box(b, s.grey, 9.0, 1.9, 3.4, -3.4, 2.62, 0, 'superstructure');
  prism(b, s.greyDark, [[-3.4, 3.56], [-0.6, 3.56], [-1.0, 5.3], [-3.0, 5.3]], 1.7, 'side', 0, 0, 0, 'funnel'); box(b, s.track, 1.6, 0.12, 1.3, -2.0, 5.34, 0, 'funnelcap');
  box(b, s.grey, 3.6, 2.3, 3.5, -6.8, 2.82, 0, 'hangar'); box(b, s.gunmetal, 0.06, 1.8, 2.6, -8.62, 2.6, 0, 'hangardoor');
  const lz = grp(b, -6.4, 3.98, 0, 'laser'); cyl(lz, s.greyDark, 0.6, 0.5, 0, 0.25, 0, 'y'); ball(lz, s.white, 0.55, 0.55, 0.55, 0, 0.8, 0, 'dome', s.dome); box(lz, s.glass, 0.1, 0.34, 0.34, 0.5, 0.86, 0, 'lens');
  box(b, s.greyDark, 5.4, 0.06, B * 0.78, -11.6, 1.7, 0, 'helideck'); box(b, s.white, 2.0, 0.02, 0.2, -11.6, 1.74, 0, 'marking'); box(b, s.white, 0.2, 0.02, 1.6, -11.6, 1.74, 0, 'marking');
  box(b, P.id, 1.6, 0.03, 1.6, -13.4, 1.74, 0, 'idpanel');
  for (const k of [-1, 1]) for (const x of [-9, -4, 1, 6, 10]) box(b, s.gunmetal, 0.04, 0.4, 0.04, x, 1.88, k * (B / 2 - 0.25) * (x > 8 ? 0.6 : 1), 'stanchion');
  const t = grp(b, 10.6, 1.7, 0, 'turret');
  cyl(t, s.greyDark, 0.9, 0.2, 0, 0.1, 0, 'y', 'ring'); prism(t, s.grey, [[-0.9, 0.2], [1.0, 0.2], [0.5, 1.3], [-0.9, 1.3]], 1.5, 'side', 0, 0, 0, 'gunhouse');
  cyl(t, s.gunmetal, 0.1, 2.9, 2.0, 0.85, 0, 'x', 'barrel'); cyl(t, s.gunmetal, 0.14, 0.4, 3.3, 0.85, 0, 'x', 'muzzle');
  return { g, body: b, turret: t, turretX: 10.6, muzzle: 14, muzzleY: 2.6, ship: true };
}
// Type 056 corvette: sloped stealth sides, 76 mm gun forward, one block of superstructure with an integrated mast,
// a rotary close-in gun aft of the funnel, flight deck at the stern. Red boot-topping, as on the real ships.
function corvette(P) {
  const s = shared(), g = new THREE.Group(), b = grp(g), D = SHIPS.corvette, L = D.length, B = D.beam;
  shipHull(b, s.radome, L, B, 1.3, 0.8, 0.28);
  box(b, s.red, L * 0.9, 0.12, B * 0.84, -0.6, 0.12, 0, 'waterline');
  box(b, s.greyDark, L * 0.95, 0.05, B * 0.8, -0.3, 1.48, 0, 'deck');
  prism(b, s.radome, [[-5.0, 1.46], [4.6, 1.46], [3.6, 3.7], [-4.4, 3.7]], 3.0, 'side', 0, 0, 0, 'superstructure');
  box(b, s.glass, 0.05, 0.36, 2.5, 3.85, 3.2, 0, 'bridgewindows').rotation.z = 0.42;
  prism(b, s.radome, [[0.2, 3.7], [2.4, 3.7], [1.8, 6.6], [0.8, 6.6]], 1.3, 'side', 0, 0, 0, 'mast'); ball(b, s.white, 0.5, 0.5, 0.5, 1.3, 7.0, 0, 'radome');
  prism(b, s.greyDark, [[-3.8, 3.7], [-1.6, 3.7], [-2.0, 4.9], [-3.4, 4.9]], 1.5, 'side', 0, 0, 0, 'funnel');
  const cw = grp(b, -5.6, 2.2, 0, 'ciws'); cyl(cw, s.white, 0.36, 1.0, 0, 0.5, 0, 'y', 'drum'); ball(cw, s.white, 0.36, 0.4, 0.36, 0, 1.0, 0, 'dome', s.dome); rotaryGun(cw, 0.2, 0.55, 0, 0.9);
  box(b, s.greyDark, 5.2, 0.06, B * 0.76, -9.0, 1.5, 0, 'helideck'); box(b, s.white, 1.8, 0.02, 0.18, -9.0, 1.54, 0, 'marking'); box(b, s.white, 0.18, 0.02, 1.4, -9.0, 1.54, 0, 'marking');
  box(b, P.id, 1.4, 0.03, 1.4, -10.8, 1.54, 0, 'idpanel');
  for (const k of [-1, 1]) { const c = grp(b, -0.4, 3.72, k * 0.9, 'canisters'); for (const z of [-0.2, 0.2]) cyl(c, s.greyDark, 0.18, 1.8, 0, 0.3, z, 'x', 'canister').rotation.y = k * 0.6; }
  const t = grp(b, 7.6, 1.5, 0, 'turret');
  cyl(t, s.greyDark, 0.75, 0.16, 0, 0.08, 0, 'y', 'ring'); ball(t, s.radome, 0.8, 0.95, 0.8, 0, 0.16, 0, 'gunhouse', s.dome);
  cyl(t, s.gunmetal, 0.08, 2.2, 1.5, 0.62, 0, 'x', 'barrel');
  return { g, body: b, turret: t, turretX: 7.6, muzzle: 10.4, muzzleY: 2.1, ship: true };
}
// Landing craft: a blunt steel barge with an open well deck, a bow ramp held up while under way, and a pilot house
// at the stern. `hold` (a tarpaulin-covered load) shows when something is aboard.
function lcraft(P) {
  const s = shared(), g = new THREE.Group(), b = grp(g), D = SHIPS.lcraft, L = D.length, B = D.beam;
  shipHull(b, P.dark, L, B, 0.5, 0.45, 0.07);
  box(b, s.greyDark, 7.0, 0.05, B - 0.5, 0.6, 0.42, 0, 'welldeck');
  for (const k of [-1, 1]) box(b, P.hull, 7.6, 1.0, 0.24, 0.5, 0.92, k * (B / 2 - 0.12), 'bulwark');
  const ramp = box(b, P.hull, 0.14, 1.5, B - 0.5, 4.5, 1.0, 0, 'ramp'); ramp.rotation.z = -0.35;
  for (const k of [-1, 1]) cyl(b, s.gunmetal, 0.02, 1.8, 3.7, 1.5, k * (B / 2 - 0.2), 'x', 'rampcable').rotation.y = 0;
  box(b, P.hull, 2.0, 1.5, B * 0.55, -4.0, 1.3, -0.5, 'pilothouse'); box(b, s.glass, 0.04, 0.4, B * 0.5, -2.98, 1.7, -0.5, 'window');
  box(b, P.id, 1.6, 0.03, 1.4, -4.0, 2.07, -0.5, 'idpanel'); cyl(b, s.gunmetal, 0.03, 1.2, -4.6, 2.6, -0.9, 'y', 'mast');
  box(b, s.gunmetal, 0.6, 0.5, 0.6, -4.3, 0.8, 1.1, 'vent'); cyl(b, s.track, 0.12, 0.9, -4.6, 1.2, 1.1, 'y', 'exhaust');
  const hold = grp(b, 0.8, 0.45, 0, 'hold'); box(hold, s.canvas, 4.4, 0.9, B - 1.0, 0, 0.45, 0, 'tarp'); box(hold, s.canvas, 3.6, 0.3, B - 1.5, 0, 1.0, 0, 'tarp'); for (const x of [-1.6, 0, 1.6]) box(hold, s.track, 0.06, 0.94, B - 0.96, x, 0.46, 0, 'strap');
  hold.visible = false;
  return { g, body: b, hold, muzzle: 0, muzzleY: 1, ship: true };
}
// Missile boat: a wooden coastal trader given a rocket rack. High bow, wheelhouse aft, eight launch tubes amidships
// that train and fire as one.
function mboat(P) {
  const s = shared(), g = new THREE.Group(), b = grp(g), D = SHIPS.mboat, L = D.length, B = D.beam;
  shipHull(b, P.hull, L, B, 0.8, 0.5, 0.34);
  box(b, s.wood, L * 0.9, 0.05, B * 0.8, -0.3, 0.98, 0, 'deck');
  prism(b, P.dark, [[2.4, 0.96], [5.4, 0.96], [5.5, 1.75], [2.4, 1.3]], B * 0.5, 'side', 0, 0, 0, 'bowbulwark');
  box(b, P.hull, 2.2, 1.6, B * 0.72, -3.6, 1.8, 0, 'wheelhouse'); box(b, s.glass, 0.04, 0.4, B * 0.6, -2.48, 2.1, 0, 'window'); box(b, s.wood, 2.5, 0.08, B * 0.8, -3.6, 2.64, 0, 'roof');
  box(b, P.id, 1.4, 0.03, 1.2, -3.6, 2.7, 0, 'idpanel'); cyl(b, s.wood, 0.05, 2.4, -3.0, 3.9, 0, 'y', 'mast'); box(b, s.track, 0.03, 0.5, 0.8, -3.0, 4.8, 0.42, 'flag');
  for (const z of [-0.7, 0.7]) cyl(b, s.rubber, 0.3, 0.2, -1.4, 0.9, z * 1.75, 'z', 'tyrefender');
  for (const x of [1.6, 2.2]) cyl(b, s.ordnance, 0.24, 0.6, x, 1.3, -0.6, 'y', 'drum');
  const t = grp(b, 0.2, 1.0, 0, 'turret');
  cyl(t, s.gunmetal, 0.7, 0.1, 0, 0.05, 0, 'y', 'ring'); box(t, s.gunmetal, 0.3, 0.7, 1.2, -0.3, 0.45, 0, 'cradle');
  const rack = grp(t, 0, 0.9, 0, 'rack'); rack.rotation.z = 0.42;
  for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) { cyl(rack, s.ordnance, 0.13, 2.2, 0.4, r * 0.3, (c - 1.5) * 0.3, 'x', 'tube'); cyl(rack, s.red, 0.1, 0.1, 1.52, r * 0.3, (c - 1.5) * 0.3, 'x', 'warhead'); }
  box(rack, s.gunmetal, 0.1, 0.72, 1.34, -0.5, 0.15, 0, 'frame'); box(rack, s.gunmetal, 0.1, 0.72, 1.34, 1.1, 0.15, 0, 'frame');
  return { g, body: b, turret: t, turretX: 0.2, muzzle: 2.0, muzzleY: 2.6, noRecoil: true, ship: true };
}
// Drone boat: a low, dark, uncrewed hull with a satellite dish and camera mast, contact fuzes on the bow and a
// charge filling the hull.
function dboat(P) {
  const s = shared(), g = new THREE.Group(), b = grp(g), D = SHIPS.dboat, L = D.length, B = D.beam;
  shipHull(b, s.strikeDark, L, B, 0.34, 0.28, 0.42);
  prism(b, s.strike, [[-1.6, 0.48], [0.9, 0.48], [0.2, 0.86], [-1.6, 0.86]], B * 0.6, 'side', 0, 0, 0, 'cover');
  box(b, P.id, 0.9, 0.03, 0.6, -0.9, 0.88, 0, 'idpanel');
  for (const k of [-1, 0, 1]) cyl(b, s.red, 0.035, 0.5, 1.9 - Math.abs(k) * 0.35, 0.42, k * 0.26, 'x', 'fuze');
  cyl(b, s.gunmetal, 0.025, 0.7, -0.5, 1.2, 0, 'y', 'mast'); ball(b, s.glass, 0.09, 0.09, 0.09, -0.5, 1.6, 0, 'camera');
  const dish = cyl(b, s.white, 0.26, 0.04, -1.2, 1.0, 0, 'y', 'dish'); dish.rotation.z = 0.3;
  box(b, s.gunmetal, 0.4, 0.4, 0.4, -2.0, 0.3, 0, 'waterjet');
  return { g, body: b, muzzle: 0, muzzleY: 0.5, ship: true };
}
export const ASSEMBLY = { abrams, battlemaster, overlord: (P) => sovietTank(P, true), technical, scoutcar: scoutCar, comanche, drone, raptor, f15e, j11, lav25, scudtel, fpv, chinook, z10,
  rhib, mkv, frigate, corvette, lcraft, mboat, dboat };
// ---------------------------------------------------------------- C-130 Hercules / AC-130 gunship
// Real aircraft (metres): 29.8 long, 40.4 span, 11.7 to the top of the fin; fuselage 4.3 across; four turboprops at
// 4.95 m and 10.1 m from the centreline, each with a 4.1 m four-blade propeller; tailplane span 16.0. Every number in
// HERCULES is a real measurement: `m` values are metres aft of the nose tip; `scale` turns them into game units.
// Shape: blunt radome, stepped cockpit glazing, round fuselage whose underside sweeps up to the tail, high straight
// wing with tapered outer panels, nacelles slung under the wing ahead of the leading edge, main-gear fairings low on
// the sides, a tall fin with a long sloping leading edge and a low tailplane. The AC-130 adds a 105 mm howitzer and a
// rotary cannon out of the port side and a sensor ball under the nose, and is painted dark gunship grey.
export const HERCULES = { scale: 0.5, length: 29.8, span: 40.4, height: 11.7, body: 4.3, engines: [4.95, 10.1], prop: 4.1, tailSpan: 16.0,
  wing: { root: [9.8, 14.7], tip: [10.4, 12.9] }, fin: [19.5, 25.4, 28.3, 29.6], tail: [25.2, 26.5, 28.2, 29.3], upsweep: 17.2 };
function herc(P, gunship) {
  const s = shared(), g = new THREE.Group(), b = grp(g), H = HERCULES, K = H.scale, skin = gunship ? s.greyDark : s.grey;
  const X = (m) => +((H.length / 2 - m) * K).toFixed(3), R = H.body / 2 * K, half = H.span / 2 * K, top = H.height * K - R - 0.45;   // top of the fin above the fuselage centreline
  // fuselage: radome, tapered nose, constant barrel, then a cone tilted so its top stays level while the underside sweeps up
  ball(b, gunship ? s.gunmetal : s.track, 0.42, 0.42, 0.42, X(0.9), -0.2, 0, 'radome');
  taper(b, skin, 0.42, R, (3.9 - 0.9) * K, X(2.4), -0.1, 0, 'nose');
  cyl(b, skin, R, (H.upsweep - 3.9) * K, X((H.upsweep + 3.9) / 2), 0, 0, 'x', 'fuselage');
  const tl = (H.length - H.upsweep) * K, rt = 0.34, cone = taper(b, skin, R, rt, tl, X((H.upsweep + H.length) / 2), (R - rt) / 2, 0, 'afterbody'); cone.rotation.z = -Math.PI / 2 - Math.atan2(R - rt, tl);
  box(b, s.glass, 0.5, 0.34, 1.5, X(2.6), 0.62, 0, 'windscreen').rotation.z = -0.5; box(b, s.glass, 0.7, 0.3, 1.9, X(3.4), 0.7, 0, 'cockpitglazing');
  box(b, P.dark, 2.6, 0.05, 1.3, X(24.2), 0.1, 0, 'ramp').rotation.z = -0.19;                                              // loading ramp under the upswept tail
  // wing: centre section between the outer engines, tapered outer panels, a fairing where it sits on the fuselage
  const W = H.wing, y = R + 0.02, z1 = H.engines[1] * K;
  box(b, skin, (W.root[1] - W.root[0]) * K, 0.2, z1 * 2, X((W.root[0] + W.root[1]) / 2), y, 0, 'wingcentre');
  for (const k of [-1, 1]) prism(b, skin, [[X(W.root[0]), k * z1], [X(W.tip[0]), k * half], [X(W.tip[1]), k * half], [X(W.root[1]), k * z1]], 0.16, 'plan', 0, y, 0, 'wingouter');
  box(b, skin, 3.2, 0.36, 1.7, X(12.2), R - 0.1, 0, 'wingfairing');
  const props = [];
  for (const k of [-1, 1]) for (const e of H.engines) { // nacelle under the wing, spinner, four-blade propeller
    const z = k * e * K, ny = y - 0.28;
    cyl(b, skin, 0.3, 2.5, X(9.4), ny, z, 'x', 'nacelle'); taper(b, s.gunmetal, 0.07, 0.26, 0.5, X(6.4), ny, z, 'spinner'); box(b, s.gunmetal, 0.5, 0.14, 0.34, X(11.4), ny - 0.1, z, 'exhaust');
    const pr = grp(b, X(6.5), ny, z, 'prop'); for (const a of [0, Math.PI / 2]) box(pr, s.gunmetal, 0.04, H.prop * K, 0.17, 0, 0, 0, 'propblade').rotation.x = a;
    props.push(pr);
  }
  for (const k of [-1, 1]) { // main-gear fairings low on the sides
    prism(b, skin, [[X(10.6), -R + 0.5], [X(11.4), -R - 0.02], [X(16.2), -R - 0.02], [X(17.2), -R + 0.5]], 0.5, 'side', 0, 0, k * (R - 0.05), 'gearfairing');
    box(b, P.id, 1.2, 0.5, 0.03, X(20.2), 0.25, k * (R * 0.82), 'idpanel');
  }
  // tail: tall fin with a long sloping leading edge, tailplane low on the after body
  const F = H.fin, T = H.tail, ts = H.tailSpan / 2 * K;
  prism(b, skin, [[X(F[0]), R - 0.1], [X(F[1]), top], [X(F[2]), top], [X(F[3]), R - 0.1]], 0.16, 'side', 0, 0, 0, 'fin');
  for (const k of [-1, 1]) prism(b, skin, [[X(T[0]), 0], [X(T[1]), k * ts], [X(T[2]), k * ts], [X(T[3]), 0]], 0.12, 'plan', 0, R - 0.02, 0, 'tailplane');
  const guns = [];
  if (gunship) { // everything points out of the port (-Z) side
    cyl(b, s.gunmetal, 0.09, 1.3, X(18.4), -0.25, -(R + 0.45), 'z', 'howitzer'); box(b, s.gunmetal, 0.5, 0.45, 0.3, X(18.4), -0.25, -(R - 0.05), 'gunport');
    cyl(b, s.gunmetal, 0.05, 0.9, X(7.2), -0.3, -(R + 0.3), 'z', 'rotarycannon'); box(b, s.gunmetal, 0.4, 0.36, 0.25, X(7.2), -0.3, -(R - 0.05), 'gunport');
    ball(b, s.gunmetal, 0.24, 0.24, 0.24, X(4.6), -R - 0.05, -0.3, 'sensorball');
    guns.push([X(7.2), -0.3, -(R + 0.75)], [X(18.4), -0.25, -(R + 1.1)]);
  }
  return { g, body: b, props, guns };
}
const ac130 = (P) => herc(P, true), c130 = (P) => herc(P, false);
// ---------------------------------------------------------------- hijacked airliner (The Phantom)
// A generic twin-jet narrow-body in plain white with a blue line: 39.5 m long, 35.8 m span, 25 degree wing sweep,
// engines under the wings, low tailplane. No airline's livery. Built at 0.42 scale.
export const AIRLINER = { scale: 0.42, length: 39.5, span: 35.8, sweep: 25 };
function b737(P) {
  const s = shared(), g = new THREE.Group(), b = grp(g), A = AIRLINER, K = A.scale, X = (m) => +((A.length / 2 - m) * K).toFixed(3), R = 0.79, half = A.span / 2 * K, tan = Math.tan(A.sweep * Math.PI / 180);
  cyl(b, s.white, R, (30 - 5) * K, X(17.5), 0, 0, 'x', 'fuselage'); taper(b, s.white, 0.2, R, 5 * K, X(2.5), -0.1, 0, 'nose');
  const tl = (A.length - 30) * K, cone = taper(b, s.white, R, 0.2, tl, X((30 + A.length) / 2), (R - 0.2) / 2, 0, 'afterbody'); cone.rotation.z = -Math.PI / 2 - Math.atan2(R - 0.2, tl);
  box(b, s.glass, 0.6, 0.26, 1.2, X(2.9), 0.42, 0, 'windscreen').rotation.z = -0.5;
  for (const k of [-1, 1]) {
    box(b, s.blue, (30 - 5) * K, 0.1, 0.03, X(17.5), 0.12, k * (R - 0.02), 'cheatline'); box(b, s.glass, (27 - 6) * K, 0.1, 0.03, X(16.5), 0.3, k * (R - 0.05), 'windows');
    const le = 14.5, tipLE = le + (A.span / 2 - 1.9) * tan;
    prism(b, s.white, [[X(le), k * 0.6], [X(tipLE), k * half], [X(tipLE + 1.6), k * half], [X(le + 7.2), k * 0.6]], 0.16, 'plan', 0, -0.35, 0, 'wing');
    cyl(b, s.steel, 0.42, 1.9, X(16.2), -0.78, k * 4.9 * K, 'x', 'engine'); cyl(b, s.gunmetal, 0.36, 0.06, X(16.2) + 0.96, -0.78, k * 4.9 * K, 'x', 'intake');
    const tLE = 33.5; prism(b, s.white, [[X(tLE), k * 0.2], [X(tLE + 3.2), k * 6.0 * K * 1.1], [X(tLE + 4.6), k * 6.0 * K * 1.1], [X(tLE + 5.4), k * 0.2]], 0.1, 'plan', 0, 0.3, 0, 'tailplane');
  }
  prism(b, s.blue, [[X(30.5), R - 0.1], [X(36.2), R + 3.0], [X(38.0), R + 3.0], [X(39.2), R - 0.1]], 0.14, 'side', 0, 0, 0, 'fin');
  return { g, body: b };
}
// A paratrooper under an open canopy (Paratrooper Drop).
export function createChute() { return fromTemplate('chute', buildChute); }
function buildChute() {
  const s = shared(), g = new THREE.Group(), b = grp(g);
  ball(b, s.canvas, 1.5, 0.95, 1.5, 0, 3.6, 0, 'canopy', s.dome);
  for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { const l = box(b, s.gunmetal, 0.03, 2.5, 0.03, x * 0.55, 2.45, z * 0.55, 'line'); l.rotation.z = -x * 0.38; l.rotation.x = z * 0.38; }
  box(b, s.ordnance, 0.26, 0.56, 0.4, 0, 0.9, 0, 'trooper'); for (const k of [-1, 1]) box(b, s.ordnance, 0.16, 0.6, 0.16, 0, 0.3, k * 0.11, 'leg'); ball(b, s.skin, 0.13, 0.14, 0.13, 0, 1.3, 0, 'head'); box(b, s.gunmetal, 0.16, 0.4, 0.3, -0.2, 0.95, 0, 'pack');
  return { g, body: b };
}
// ---------------------------------------------------------------- Z-10 attack helicopter (China)
// Real: fuselage 14.2 m, main rotor 13.0 m across with five blades, 3.85 m high. A slim, slab-sided fuselage with two
// stepped cockpits in tandem (gunner in front), a chin cannon under the nose and a sensor turret on its tip, engines
// either side of the rotor mast, stub wings with two pylons each, a four-blade tail rotor on the fin, a tailplane
// part-way along the boom, and fixed gear: two main wheels under the cockpits and a tailwheel. Built at 0.5 scale.
export const Z10 = { scale: 0.5, fuselage: 14.2, rotor: 13.0, blades: 5 };
function z10(P) {
  const s = shared(), g = new THREE.Group(), b = grp(g), R = Z10.rotor / 2 * Z10.scale;
  prism(b, P.hull, [[3.3, -0.15], [3.05, 0.1], [2.2, 0.42], [1.2, 0.72], [-0.2, 0.86], [-1.5, 0.6], [-1.7, -0.1], [-1.0, -0.55], [2.4, -0.55]], 0.86, 'side', 0, 0, 0, 'fuselage');
  box(b, s.glass, 0.85, 0.3, 0.6, 2.0, 0.5, 0, 'canopy').rotation.z = -0.36; box(b, s.glass, 0.9, 0.32, 0.62, 1.05, 0.86, 0, 'canopy').rotation.z = -0.3;   // gunner in front, pilot stepped up behind
  box(b, P.dark, 0.5, 0.2, 0.7, 0.42, 0.98, 0, 'canopyframe');
  for (const k of [-1, 1]) { cyl(b, P.dark, 0.26, 1.5, -0.55, 0.78, k * 0.52, 'x', 'engine'); box(b, s.gunmetal, 0.4, 0.2, 0.3, -1.15, 0.98, k * 0.56, 'exhaust').rotation.z = 0.5; box(b, s.gunmetal, 0.08, 0.34, 0.4, 0.22, 0.78, k * 0.52, 'intake'); }
  prism(b, P.hull, [[-1.5, 0.6], [-5.6, 0.5], [-5.6, 0.2], [-1.7, -0.1]], 0.3, 'side', 0, 0, 0, 'tailboom');
  prism(b, P.hull, [[-5.0, 0.4], [-6.3, 1.8], [-6.75, 1.8], [-6.05, 0.2]], 0.1, 'side', 0, 0, 0, 'fin'); box(b, P.hull, 0.55, 0.04, 1.9, -4.5, 0.36, 0, 'tailplane');
  box(b, P.id, 0.34, 0.24, 0.12, -5.95, 1.05, 0, 'idpanel');
  for (const k of [-1, 1]) {
    box(b, P.dark, 0.8, 0.08, 1.35, 0.25, 0.02, k * 1.05, 'stubwing').rotation.x = k * 0.09;
    cyl(b, s.gunmetal, 0.17, 1.0, 0.3, -0.26, k * 0.95, 'x', 'rocketpod'); cyl(b, s.gunmetal, 0.12, 0.04, 0.82, -0.26, k * 0.95, 'x', 'podface');
    box(b, s.gunmetal, 0.3, 0.26, 0.32, 0.3, -0.3, k * 1.5, 'missilerack'); for (const dz of [-0.1, 0.1]) for (const dy of [-0.08, 0.08]) cyl(b, s.ordnance, 0.045, 0.85, 0.42, -0.3 + dy, k * 1.5 + dz, 'x', 'missile');
    cyl(b, s.steel, 0.045, 0.62, 1.5, -0.8, k * 0.6, 'y', 'gearstrut').rotation.x = k * 0.3; cyl(b, s.rubber, 0.2, 0.15, 1.5, -1.12, k * 0.72, 'z', 'wheel');
  }
  cyl(b, s.steel, 0.04, 0.4, -5.3, 0.02, 0, 'y', 'tailstrut'); cyl(b, s.rubber, 0.13, 0.1, -5.3, -0.2, 0, 'z', 'tailwheel');
  cyl(b, s.gunmetal, 0.08, 0.4, -0.2, 1.06, 0, 'y', 'mast');
  const rotor = grp(b, -0.2, 1.3, 0, 'rotor'); cyl(rotor, s.gunmetal, 0.19, 0.1, 0, 0, 0, 'y', 'hub');
  for (let i = 0; i < Z10.blades; i++) { const arm = grp(rotor); arm.rotation.y = i * Math.PI * 2 / Z10.blades; box(arm, s.gunmetal, R - 0.15, 0.03, 0.2, (R + 0.15) / 2, 0, 0, 'blade'); }
  const rotorTail = grp(b, -6.4, 1.2, 0.12, 'tailrotor');
  for (let i = 0; i < 2; i++) { const arm = grp(rotorTail); arm.rotation.z = i * 1.05; box(arm, s.steel, 1.25, 0.06, 0.03, 0, 0, 0, 'tailblade'); }   // two crossed pairs = four blades, set like scissors
  ball(b, s.gunmetal, 0.17, 0.17, 0.17, 3.28, -0.02, 0, 'sensor');
  const t = grp(b, 2.5, -0.62, 0, 'turret'); cyl(t, s.gunmetal, 0.15, 0.16, 0, 0, 0, 'y', 'gunmount'); cyl(t, s.gunmetal, 0.04, 1.0, 0.55, -0.05, 0, 'x', 'cannon');
  return { g, body: b, turret: t, turretX: 2.5, rotor, rotorTail, ground: 1.3, muzzle: 3.2, muzzleY: -0.7 };
}
// Missiles in flight (Scud Storm, Scud Launcher, Nuclear Missile). Nose is +X.
export function createMissile(kind) { return fromTemplate('m:' + kind, kind === 'nuke' ? buildNuke : buildScud); }
function buildScud() { // Scud: olive tube with a long, sharply pointed nose cone and four tail fins
  const s = shared(), g = new THREE.Group(), b = grp(g);
  cyl(b, s.ordnance, 0.3, 4.4, 0, 0, 0, 'x', 'body'); taper(b, s.ordnance, 0.012, 0.3, 2.2, 3.3, 0, 0, 'nose'); cyl(b, s.gunmetal, 0.31, 0.25, -1.6, 0, 0, 'x', 'band');
  for (let i = 0; i < 4; i++) { const f = box(b, s.gunmetal, 0.75, 0.55, 0.04, -1.85, 0, 0, 'fin'); f.rotation.x = i * Math.PI / 2; f.position.y = Math.cos(i * Math.PI / 2) * 0.5; f.position.z = Math.sin(i * Math.PI / 2) * 0.5; }
  return { g, body: b };
}
function buildNuke() { // Nuclear Missile: a big white two-stage rocket with black bands, red fins and a red warhead: nothing else in the game looks like it
  const s = shared(), g = new THREE.Group(), b = grp(g);
  cyl(b, s.white, 0.8, 6.4, 0, 0, 0, 'x', 'firststage'); cyl(b, s.white, 0.62, 2.6, 4.5, 0, 0, 'x', 'secondstage'); taper(b, s.white, 0.62, 0.8, 0.5, 3.2, 0, 0, 'interstage');
  for (const x of [-2.2, 1.6, 3.6]) cyl(b, s.track, 0.82, 0.35, x, 0, 0, 'x', 'band');
  taper(b, s.red, 0.015, 0.62, 2.4, 7.0, 0, 0, 'warhead'); taper(b, s.gunmetal, 0.45, 0.7, 0.7, -3.55, 0, 0, 'nozzle');
  for (let i = 0; i < 4; i++) { const f = box(b, s.red, 1.5, 1.2, 0.07, -2.5, 0, 0, 'fin'); f.rotation.x = i * Math.PI / 2; f.position.y = Math.cos(i * Math.PI / 2) * 1.2; f.position.z = Math.sin(i * Math.PI / 2) * 1.2; }
  return { g, body: b };
}
export const AIRCRAFT = { a10, b2, ac130, c130, b737 };

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
        if (!c.visible) continue;                                   // a hidden part nothing can switch on again: never draw it
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
