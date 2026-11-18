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
    heloBlack: std(0x141517, 0.8, 0.12), heloBlackDark: std(0x0a0b0c, 0.85, 0.1),                        // Z-10: deep black all over
    white: std(0xe8e6df, 0.62, 0.1), red: std(0xb5261e, 0.7, 0.1), blue: std(0x2c5fa8, 0.7, 0.1),   // missile bodies and warning paint
    flanker: std(0x7f97ad, 0.8, 0.08), flankerDark: std(0x566c82, 0.82, 0.08), radome: std(0xd8dbd5, 0.8, 0), // J-11: blue-grey with a pale radome
    su27: std(0x9bb3c6, 0.8, 0.08), su27Dark: std(0x5f7f9c, 0.82, 0.08),                                  // Su-27: pale and mid blue
    su57: std(0x77828b, 0.78, 0.12), su57Dark: std(0x4b545c, 0.8, 0.12),                                  // Su-57: grey "pixel" scheme
    typhoon: std(0xa9afb4, 0.78, 0.1), typhoonDark: std(0x80888e, 0.8, 0.1),                              // Eurofighter: air-superiority grey
    tigerGreen: std(0x4a5440, 0.9, 0.05), tigerDark: std(0x2f3628, 0.92, 0.05),                           // Tiger: dark green and black
    ka52: std(0x565c50, 0.88, 0.06), ka52Dark: std(0x33382f, 0.9, 0.06),                                  // Ka-52: grey-green
    apache: std(0x434a3c, 0.9, 0.05), apacheDark: std(0x2c3128, 0.92, 0.05),                              // AH-64: Army aircraft green
    viper: std(0x848c92, 0.84, 0.08), viperDark: std(0x5a6268, 0.86, 0.08),                               // AH-1Z: Marine Corps grey
    shahed: std(0xcbc5ad, 0.86, 0.04),                                                                    // Shahed-136: pale sand
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
  const m = mesh(p, g, mat, name); m.position.set(x, y, z); m.userData.profile = pts; m.userData.depth = depth; m.userData.mode = mode; return m;
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
function sovietTank(P, dual, hardpoints = true, era = true) {   // era: reactive armour bricks (an old T-55 has none)
  const s = shared(), g = new THREE.Group(), b = grp(g);
  for (const k of [-1, 1]) {
    runningGear(b, 5.8, k * 1.2, 0.5, 6, 0.3, 0.98);
    box(b, P.hull, 5.9, 0.05, 0.62, 0, 1.0, k * 1.2, 'fender'); box(b, P.dark, 2.6, 0.3, 0.05, 1.2, 0.82, k * 1.47, 'skirt');
    if (era) for (let i = 0; i < 4; i++) box(b, P.hull, 0.5, 0.24, 0.07, 0.35 + i * 0.6, 0.84, k * 1.52, 'era');
    cyl(b, P.hull, 0.25, 0.9, -3.12, 1.08, k * 0.55, 'z', 'fueldrum'); box(b, s.gunmetal, 0.06, 0.56, 0.06, -3.12, 1.08, k * 0.55, 'strap');
  }
  prism(b, P.hull, [[-2.9, 0.4], [2.55, 0.4], [2.95, 0.78], [-2.9, 0.78]], 1.9, 'side', 0, 0, 0, 'tub');
  prism(b, P.hull, [[-2.95, 0.76], [2.95, 0.76], [1.35, 1.26], [-2.95, 1.26]], 2.0, 'side', 0, 0, 0, 'hull'); // steep glacis
  if (era) for (let r = 0; r < 2; r++) for (let c = 0; c < 5; c++) { const x = 1.72 + r * 0.6; box(b, P.hull, 0.5, 0.07, 0.32, x, 1.26 - (x - 1.35) * 0.3125 + 0.04, (c - 2) * 0.38, 'era').rotation.z = -0.3028; }
  cyl(b, s.wood, 0.11, 2.0, -3.0, 0.6, 0, 'z', 'log'); box(b, P.dark, 1.5, 0.03, 1.7, -2.0, 1.275, 0, 'enginedeck'); box(b, s.gunmetal, 0.5, 0.16, 0.2, -1.6, 1.1, 1.05, 'exhaust');
  box(b, P.dark, 0.4, 0.04, 0.46, 1.0, 1.28, 0, 'driverhatch');
  cyl(b, s.gunmetal, 1.08, 0.06, -0.15, 1.28, 0, 'y', 'turretring');
  const t = grp(b, -0.15, 1.3, 0, 'turret');
  ball(t, P.hull, 1.3, 0.62, 1.25, 0, 0, 0, 'turretshell', s.dome); // rounded cast turret
  if (era) for (let k = -3; k <= 3; k++) { const a = k * 0.3, e = box(t, P.hull, 0.1, 0.26, 0.34, Math.cos(a) * 1.2, 0.2, Math.sin(a) * 1.15, 'era'); e.rotation.y = -a; }
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
  P = { ...P, hull: s.strike, dark: s.strikeDark };   // dark gunship grey whoever flies it; the team panel keeps its colour
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
    for (const z of [2.5, 3.3, 4.1]) box(b, s.greyDark, 0.5, 0.14, 0.06, 0.5, -0.24, k * z, 'pylon');
    cyl(b, s.ordnance, 0.13, 1.0, 0.55, -0.42, k * 4.1, 'x', 'rocketpod'); cyl(b, s.gunmetal, 0.1, 0.04, 1.06, -0.42, k * 4.1, 'x', 'podface');   // outer pylon: a rocket pod
  }
  box(b, s.grey, 1.3, 0.08, 3.7, -4.6, 0.14, 0, 'tailplane');
  // Four AGM-65 Mavericks on the inner pylons, one node each so the view can take them off as they are fired (outer pair first).
  const stores = [];
  for (const z of [2.5, 3.3]) for (const k of [1, -1]) { const st = grp(b, 0.55, -0.4, k * z, 'store'); cyl(st, s.white, 0.085, 1.1, 0, 0, 0, 'x', 'maverick'); ball(st, s.glass, 0.085, 0.085, 0.085, 0.55, 0, 0, 'seeker'); for (const r of [0, Math.PI / 2]) box(st, s.greyDark, 0.4, 0.34, 0.015, -0.3, 0, 0, 'maverickfin').rotation.x = r; stores.push(st); }
  const gear = grp(b, 0, 0, 0, 'gear');                                                                     // nose leg offset to the right of the gun, main legs under the wing pods
  cyl(gear, s.steel, 0.045, 0.6, 3.3, -0.72, 0.16, 'y', 'strut'); cyl(gear, s.rubber, 0.17, 0.12, 3.3, -1.04, 0.16, 'z', 'wheel');
  for (const k of [-1, 1]) { cyl(gear, s.steel, 0.05, 0.5, 0.9, -0.76, k * 1.9, 'y', 'strut'); cyl(gear, s.rubber, 0.22, 0.15, 0.9, -1.0, k * 1.9, 'z', 'wheel'); }
  return { g, body: b, gear, stores, ground: 1.22, gun: [5.95, -0.2, 0.06], pylons: [2.5, 3.3, 4.1], muzzle: 5.95, muzzleY: -0.2 };
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
export const FLANKER = { skin: 'flanker', finMat: 'flankerDark', radome: 4.6, noseR: 0.6, droop: 0.07, chineFrom: 3.2, foreFrom: 3.4, scale: 0.365, length: 21.9, span: 14.7, tailSpan: 9.9, sweep: 42, cant: 0, mid: 10.6,
  chine: [[4.6, 0.62], [6.6, 1.1]], lerx: [[6.6, 1.1], [9.2, 2.3]], shoulder: 9.2, body: [8.6, 2.3, 18.4, 2.2], spine: [[5.6, 0.34], [7.2, 0.62], [12.5, 0.5], [17.0, 0.3]], canopy: [5.3, 1.7],
  wing: [9.0, 2.3, 1.6, 15.6], tail: [16.2, 2.3, 20.2, 19.6], fin: [14.6, 16.4, 17.9, 18.4, 3.4, 2.35], intake: [8.4, 1.25, 0], nozzle: ['round', 19.2, 1.25], gear: [5.6, 12.4, 2.0], stinger: 21.9, nacelles: true, rails: true };
function fighter(P, F, paintIt) {
  const s = shared(), g = new THREE.Group(), b = grp(g), K = F.scale, X = (m) => +((F.mid - m) * K).toFixed(3), W = (m) => +(m * K).toFixed(3);
  const tan = Math.tan(F.sweep * Math.PI / 180), cant = F.cant * Math.PI / 180, skin = paintIt || s[F.skin] || s.grey, finMat = s[F.finMat] || s.greyDark, sh = F.shoulder;
  // forward fuselage: thin wide chine deck (and wing-root extension) over a deeper, narrower body
  prism(b, skin, [[X(F.chineFrom || 0), 0]].concat(F.chine.map(c => [X(c[0]), W(c[1])]), F.chine.slice().reverse().map(c => [X(c[0]), -W(c[1])])), 0.14, 'plan', 0, 0.02, 0, 'chine');   // `chineFrom`: where the flat deck starts (behind a long radome)
  if (F.lerx) prism(b, skin, [[X(F.lerx[0][0]), W(F.lerx[0][1])], [X(F.lerx[1][0]), W(F.lerx[1][1])], [X(F.lerx[1][0]), -W(F.lerx[1][1])], [X(F.lerx[0][0]), -W(F.lerx[0][1])]], 0.14, 'plan', 0, 0.02, 0, 'lerx');   // leading-edge root extension: flares out to the wing (its own convex piece)
  const f0 = F.foreFrom ?? sh * 0.05;
  prism(b, skin, [[X(f0), -0.02], [X(f0 + (sh - f0) * 0.4), 0.3], [X(sh), 0.36], [X(sh), -0.4], [X(f0 + (sh - f0) * 0.32), -0.3]], W(1.5), 'side', 0, 0, 0, 'forebody');
  prism(b, skin, [[X(F.body[0]), W(F.body[1])], [X(F.body[2]), W(F.body[3])], [X(F.body[2]), -W(F.body[3])], [X(F.body[0]), -W(F.body[1])]], 0.66, 'plan', 0, -0.03, 0, 'fuselage');
  prism(b, skin, F.spine.map(p => [X(p[0]), p[1]]), W(1.5), 'side', 0, 0, 0, 'spine');
  ball(b, s[F.glass] || s.glass, W(F.canopy[1]), F.canopyH || 0.3, W(F.glass ? 0.7 : 0.62), X(F.canopy[0]), 0.36, 0, 'canopy');
  if (F.radome) { const nr = W(F.noseR || 0.62), nl = W(F.radome), dr = F.droop || 0, m = taper(b, s.radome, F.droop ? 0.012 : 0.03, nr, nl, X(F.radome / 2), 0.02 - Math.sin(dr) * nl * 0.18, 0, 'radome'); m.rotation.z -= dr; m.userData.nose = [nl, nr]; }   // pale nose cone; a Flanker's is long, needle-sharp and droops a little
  if (F.patch) for (const k of [-1, 1]) { // F-22 two-tone scheme: darker diamonds on the wings and a band across the back
    const tipLE = F.wing[0] + (F.span / 2 - F.wing[1]) * tan, mx = (F.wing[0] + F.wing[3]) / 2 + 1.2;
    prism(b, s[F.patch], [[X(mx - 1.6), k * W(F.wing[1] + 0.4)], [X(tipLE + 1.0), k * W(F.span / 2 - 1.6)], [X(mx + 1.9), k * W(F.span / 2 - 2.2)], [X(mx + 2.2), k * W(F.wing[1] + 0.4)]], 0.02, 'plan', 0, 0.075, 0, 'camopatch');
  }
  if (F.patch) box(b, s[F.patch], W(2.6), 0.02, W(3.2), X(F.body[2] - 3.4), 0.31, 0, 'camoband');
  if (F.cft) for (const k of [-1, 1]) box(b, skin, W(6.4), 0.34, W(0.7), X(10.4), 0.02, k * W(F.body[1] + 0.2), 'conformaltank');                    // F-15E conformal fuel tanks along the fuselage sides
  if (F.stinger) box(b, skin, X(F.body[2] - 1) - X(F.stinger), 0.26, W(0.9), (X(F.body[2] - 1) + X(F.stinger)) / 2, 0.1, 0, 'stinger');   // tail boom between the engines
  if (F.chin) { box(b, skin, W(3.4), 0.34, W(1.5), X(F.chin + 1.5), -0.5, 0, 'chinintake'); box(b, s.gunmetal, 0.08, 0.3, W(1.4), X(F.chin - 0.2), -0.5, 0, 'intake'); }   // one wide intake under the cockpit (Eurofighter)
  for (const k of [-1, 1]) {
    const tipLE = F.wing[0] + (F.span / 2 - F.wing[1]) * tan;
    prism(b, skin, [[X(F.wing[0]), k * W(F.wing[1])], [X(tipLE), k * W(F.span / 2)], [X(tipLE + F.wing[2]), k * W(F.span / 2)], [X(F.wing[3]), k * W(F.wing[1])]], 0.09, 'plan', 0, 0.02, 0, 'wing');
    if (F.canard) { const [cx, cz, cs, cc] = F.canard, ct = Math.tan(50 * Math.PI / 180); prism(b, skin, [[X(cx), k * W(cz)], [X(cx + (cs - cz) * ct), k * W(cs)], [X(cx + (cs - cz) * ct + 0.35), k * W(cs)], [X(cx + cc), k * W(cz)]], 0.06, 'plan', 0, 0.16, 0, 'canard'); }   // foreplane beside the cockpit
    if (F.rails) cyl(b, s.gunmetal, 0.035, W(3.2), X(tipLE + 0.8), 0.02, k * W(F.span / 2), 'x', 'wingtiprail');
    if (F.tail) { const tailLE = F.tail[0] + (F.tailSpan / 2 - F.tail[1]) * tan;
    prism(b, skin, [[X(F.tail[0]), k * W(F.tail[1])], [X(tailLE), k * W(F.tailSpan / 2)], [X(F.tail[2]), k * W(F.tailSpan / 2)], [X(F.tail[3]), k * W(F.tail[1])]], 0.07, 'plan', 0, -0.02, 0, 'tailplane'); }   // a delta has no tailplane
    if (!(F.single && k < 0)) { const fin = prism(b, finMat, [[X(F.fin[0]), 0], [X(F.fin[1]), W(F.fin[4])], [X(F.fin[2]), W(F.fin[4])], [X(F.fin[3]), 0]], 0.06, 'side', 0, 0.28, k * W(F.fin[5]), 'fin'); fin.rotation.x = k * cant; }   // `single`: one fin on the centreline
    box(b, P.id, 0.42, 0.3, 0.07, X((F.fin[1] + F.fin[2]) / 2 - 0.2), 0.28 + W(F.fin[4] * 0.55) * Math.cos(cant), k * (W(F.fin[5]) + W(F.fin[4] * 0.55) * Math.sin(cant)), 'idpanel').rotation.x = k * cant;
    if (!F.chin) box(b, s.gunmetal, 0.16, 0.5, W(0.85), X(F.intake[0]), F.nacelles ? -0.36 : -0.08, k * W(F.intake[1]), 'intake').rotation.y = k * F.intake[2];
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

// B-2 Spirit: a flying wing, 52.4 m span and 21.0 m long. Every edge in plan runs parallel to one of the two leading
// edges (swept 33 degrees), which gives the double-W trailing edge: SPIRIT.plan is half of the real outline in metres
// (x = metres aft of the nose, y = metres out from the centreline): nose, wingtip, the clipped tip's inner corner (the
// rearmost point), the outer notch, the inner point, the inner notch, the centre tail. The wing is built from four
// convex pieces a side; the blended centre body carries the cockpit, and each engine pair sits in a hump with a
// scalloped intake on top and a flat exhaust trough ahead of the trailing edge. Dark grey all over; no tail at all.
export const SPIRIT = { span: 52.4, length: 21.0, sweep: 33, scale: 0.34,
  plan: [[0, 0], [17.0, 26.2], [21.0, 20.0], [14.8, 10.5], [18.0, 5.6], [16.3, 3.0], [18.25, 0]], engines: 4.6 };
function b2(P) {
  const s = shared(), g = new THREE.Group(), b = grp(g), S = SPIRIT, K = S.scale, L = S.length * K, dark = s.greyDark, t = Math.tan(S.sweep * Math.PI / 180);
  const X = (m) => +((S.length / 2 - m) * K).toFixed(3), Y = (m) => +(m * K).toFixed(3), le = (y) => y * t, [, tip, t2, A, B, C, ctr] = S.plan;
  for (const k of [-1, 1]) { // outer panel, mid panel, inner panel: each bounded by the leading edge and one leg of the W
    const pc = (pts, th, y) => prism(b, dark, pts.map(q => [X(q[0]), k * Y(q[1])]), th, 'plan', 0, y, 0, 'wing');
    pc([[le(A[1]), A[1]], tip, t2, A], 0.16, 0.02); pc([[le(B[1]), B[1]], [le(A[1]), A[1]], A, B], 0.24, 0.02); pc([[le(C[1]), C[1]], [le(B[1]), B[1]], B, C], 0.34, 0.02);
    // engine hump: intake lip on top of the wing, the exhaust trough let into the upper surface behind it
    const ez = k * Y(S.engines);
    prism(b, dark, [[X(4.6), 0.1], [X(6.0), 0.52], [X(11.5), 0.5], [X(15.4), 0.14]], Y(3.0), 'side', 0, 0, ez, 'enginehump');
    box(b, s.track, 0.06, 0.26, Y(2.5), X(5.3), 0.36, ez, 'intake').rotation.z = 0.55; for (const dz of [-0.2, 0.2]) box(b, dark, 0.3, 0.05, 0.05, X(5.0), 0.5, ez + dz * 2, 'intakelip');
    box(b, s.track, Y(3.6), 0.03, Y(2.2), X(15.6), 0.2, ez, 'exhaust');
    box(b, P.id, 0.6, 0.02, 0.6, X(13.2), 0.12, k * Y(17.5), 'idpanel');
  }
  prism(b, dark, [[X(0), 0], [X(le(C[1])), Y(C[1])], [X(C[0]), Y(C[1])], [X(ctr[0]), 0], [X(C[0]), -Y(C[1])], [X(le(C[1])), -Y(C[1])]], 0.4, 'plan', 0, 0.02, 0, 'centrewing');
  prism(b, dark, [[X(0), -0.02], [X(2.2), 0.42], [X(5.4), 0.78], [X(9.5), 0.74], [X(15.0), 0.3], [X(17.6), 0.06], [X(14.0), -0.3], [X(2.5), -0.3]], Y(5.2), 'side', 0, 0, 0, 'centrebody');   // the blended hump from the nose to the tail
  for (const k of [-1, 1]) { box(b, s.glass, 0.5, 0.2, 0.34, X(2.75), 0.5, k * 0.2, 'windscreen').rotation.z = -0.55; box(b, s.glass, 0.4, 0.16, 0.05, X(3.5), 0.56, k * 0.44, 'sidewindow'); }
  box(b, s.track, Y(5.0), 0.02, Y(1.7), X(11.0), -0.31, 0, 'bombbay');
  const gear = grp(b, 0, 0, 0, 'gear'); gear.visible = false;                                                // down only on the ground (the buildable B-2); the off-map bomber never shows it
  cyl(gear, s.steel, 0.06, 0.7, X(4.2), -0.62, 0, 'y', 'strut'); cyl(gear, s.rubber, 0.2, 0.26, X(4.2), -1.0, 0, 'z', 'wheel');
  for (const k of [-1, 1]) { cyl(gear, s.steel, 0.07, 0.7, X(12.0), -0.58, k * Y(6.1), 'y', 'strut'); cyl(gear, s.rubber, 0.24, 0.5, X(12.0), -0.96, k * Y(6.1), 'z', 'wheel'); }
  return { g, body: b, gear, ground: 1.22, muzzle: L * 0.5, muzzleY: -0.3 };
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
  stereg: { real: 104.5, length: 25, beam: 3.7 },    // Steregushchiy-class corvette (Russia)
  fremm: { real: 142, length: 29, beam: 4.1 },       // FREMM frigate (Europe)
};
// `boot`: the paint of the band at the waterline (black unless the navy uses another colour); it follows the hull's
// own outline, a touch wider, so it never sticks out past the bow. The bow curves in to the stem in two steps.
function shipOutline(L, B, bow, k = 1) {
  const h = B / 2 * k, x0 = -L / 2, xb = L / 2 - L * bow, xm = L / 2 - L * bow * 0.36;
  return [[x0, -h * 0.82], [xb, -h], [xm, -h * 0.52], [L / 2, 0], [xm, h * 0.52], [xb, h], [x0, h * 0.82]];
}
function shipHull(p, mat, L, B, free, draft, bow = 0.3, name = 'hull', boot = null, bootH = 0.3) {
  prism(p, boot || shared().track, shipOutline(L - 0.02, B, bow, 1.012), bootH, 'plan', 0, 0.02, 0, 'boottop');
  return prism(p, mat, shipOutline(L, B, bow), free + draft, 'plan', 0, (free - draft) / 2 + 0.16, 0, name);
}
// The weather deck: the hull's own outline, a little smaller, so its edge never shows through the sides at the bow
// (a plain rectangle did, under the forward gun).
function shipDeck(p, mat, L, B, bow, y, name = 'deck') { return prism(p, mat, shipOutline(L * 0.985, B * 0.9, bow), 0.05, 'plan', 0, y, 0, name); }
// A raked stem: the deck edge reaches further forward than the waterline, as on a real warship's flared bow.
function rakedStem(p, mat, L, B, deckY, reach = 0.7) { const h = B / 2; return prism(p, mat, [[L / 2 - 2.6, -h * 0.6], [L / 2 + reach, 0], [L / 2 - 2.6, h * 0.6]], 0.55, 'plan', 0, deckY - 0.28, 0, 'stem'); }
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
  for (const k of [-1, 1]) { cyl(b, s.rubber, 0.28, 3.7, -0.75, 0.5, k * 0.74, 'x', 'collar'); cyl(b, s.rubber, 0.28, 1.75, 1.83, 0.5, k * 0.37, 'x', 'collar').rotation.y = k * 0.45; }   // the two bow tubes meet at the stem
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
  shipHull(b, s.grey, L, B, 1.5, 0.9, 0.26); rakedStem(b, s.grey, L, B, 1.66);
  shipDeck(b, s.greyDark, L, B, 0.26, 1.68);
  box(b, s.greyDark, 1.6, 0.3, 1.8, 8.0, 1.8, 0, 'vls'); for (const x of [7.5, 8.0, 8.5]) for (const z of [-0.5, 0, 0.5]) box(b, s.gunmetal, 0.36, 0.04, 0.36, x, 1.97, z, 'cell');
  prism(b, s.grey, [[1.2, 1.66], [6.6, 1.66], [5.8, 4.3], [1.2, 4.3]], 3.5, 'side', 0, 0, 0, 'bridge');
  box(b, s.glass, 0.05, 0.4, 3.0, 6.05, 3.7, 0, 'bridgewindows').rotation.z = 0.3;
  prism(b, s.grey, [[2.2, 4.3], [4.4, 4.3], [3.9, 7.4], [2.7, 7.4]], 1.5, 'side', 0, 0, 0, 'mast'); box(b, s.greyDark, 1.3, 0.9, 1.9, 3.3, 6.3, 0, 'radarface');
  box(b, s.grey, 0.2, 0.3, 1.6, 3.9, 7.0, 0, 'yard');
  box(b, s.grey, 9.0, 1.9, 3.4, -3.4, 2.62, 0, 'superstructure');
  prism(b, s.greyDark, [[-3.4, 3.56], [-0.6, 3.56], [-1.0, 5.3], [-3.0, 5.3]], 1.7, 'side', 0, 0, 0, 'funnel'); box(b, s.track, 1.6, 0.12, 1.3, -2.0, 5.34, 0, 'funnelcap');
  box(b, s.grey, 3.6, 2.3, 3.5, -6.8, 2.82, 0, 'hangar'); box(b, s.gunmetal, 0.06, 1.8, 2.6, -8.62, 2.6, 0, 'hangardoor');
  const lz = grp(b, 3.3, 7.4, 0, 'laser'); cyl(lz, s.greyDark, 0.5, 0.36, 0, 0.18, 0, 'y'); ball(lz, s.white, 0.5, 0.55, 0.5, 0, 0.5, 0, 'dome', s.dome); box(lz, s.glass, 0.1, 0.3, 0.3, 0.46, 0.62, 0, 'lens');   // the laser director crowns the mast: nothing blocks it
  ball(b, s.white, 0.5, 0.5, 0.5, -6.4, 3.98, 0, 'satdome', s.dome);
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
  shipHull(b, s.radome, L, B, 1.3, 0.8, 0.28, 'hull', s.red, 0.42); rakedStem(b, s.radome, L, B, 1.46);   // red boot-topping that follows the hull, and a flared bow
  shipDeck(b, s.greyDark, L, B, 0.28, 1.48);
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
// ================================================================ Russia
// Ground vehicles of the two newer factions share one scale: ARMOR.K turns the real hull's metres into game units.
// Every entry is the real machine's hull length, width over the tracks and height to the turret roof.
export const ARMOR = {
  K: 0.62,
  t90: { length: 6.86, width: 3.78, height: 2.23 }, t14: { length: 8.7, width: 3.5, height: 3.3 }, bmp3: { length: 7.14, width: 3.2, height: 2.4 },
  tunguska: { length: 7.93, width: 3.24, height: 3.36 }, tos1: { length: 6.86, width: 3.46, height: 2.22, tubes: 24 },
  leopard2: { length: 7.7, width: 3.7, height: 3.0, gun: 6.6 }, kf51: { length: 7.7, width: 3.7, height: 2.9, gun: 6.8 }, puma: { length: 7.4, width: 3.7, height: 3.1 },
  gepard: { length: 6.85, width: 3.27, height: 3.29 }, pzh2000: { length: 7.9, width: 3.58, height: 3.06, gun: 8.06 }, laserleo: { length: 7.7, width: 3.7, height: 3.0 },
};
// Tracked hull: running gear and fenders both sides, a lower tub and an upper hull with a sloped nose (`glacis` long).
function trackedHull(b, P, L, W, deck, o = {}) {
  const hw = W / 2, tz = hw - 0.27, x0 = -L / 2, x1 = L / 2, gl = o.glacis ?? 1.3, nose = o.nose ?? 0.74;
  for (const k of [-1, 1]) {
    runningGear(b, L - 0.1, k * tz, 0.5, o.wheels || 6, o.wheelR || 0.27, deck - 0.26);
    box(b, P.hull, L, 0.05, 0.6, 0, deck - 0.22, k * tz, 'fender');
    if (o.skirt) box(b, P.dark, L * (o.skirtLen || 0.9), o.skirt, 0.06, o.skirtX || 0, deck - 0.24 - o.skirt / 2, k * (hw + 0.01), 'skirt');
  }
  prism(b, P.hull, [[x0 + 0.05, 0.38], [x1 - 0.4, 0.38], [x1 - 0.05, nose], [x0 + 0.05, nose]], W - 1.1, 'side', 0, 0, 0, 'tub');
  prism(b, P.hull, [[x0, nose - 0.02], [x1, nose - 0.02], [x1 - gl, deck], [x0, deck]], W - 0.98, 'side', 0, 0, 0, 'hull');
}
// T-90: low rounded turret behind wedge-shaped reactive armor, the two red "Shtora" dazzlers beside the gun, long
// 125 mm barrel with its fume extractor, fuel drums and an unditching log on the tail.
function t90(P) {
  const s = shared(), g = new THREE.Group(), b = grp(g), A = ARMOR.t90, L = A.length * ARMOR.K, W = A.width * ARMOR.K, deck = 1.08;
  trackedHull(b, P, L, W, deck, { wheels: 6, skirt: 0.3, glacis: 1.35 });
  for (let c = 0; c < 5; c++) box(b, P.dark, 0.46, 0.07, 0.3, L / 2 - 0.72, deck - 0.17, (c - 2) * 0.36, 'era').rotation.z = -0.25;
  for (const k of [-1, 1]) { cyl(b, P.hull, 0.22, 0.8, -L / 2 - 0.2, deck - 0.05, k * 0.5, 'z', 'fueldrum'); for (let i = 0; i < 3; i++) box(b, P.dark, 0.5, 0.26, 0.07, 0.25 + i * 0.58, deck - 0.4, k * (W / 2 + 0.05), 'era'); }
  cyl(b, s.wood, 0.1, 1.8, -L / 2 - 0.05, 0.55, 0, 'z', 'log'); box(b, P.dark, 1.3, 0.03, W - 1.2, -L / 2 + 0.9, deck + 0.012, 0, 'enginedeck');
  cyl(b, s.gunmetal, 0.98, 0.06, 0, deck + 0.03, 0, 'y', 'turretring');
  const t = grp(b, 0, deck + 0.05, 0, 'turret');
  ball(t, P.hull, 1.18, 0.5, 1.12, 0, 0, 0, 'turretshell', s.dome);
  for (const k of [-1, 1]) { box(t, P.dark, 0.95, 0.34, 0.2, 0.72, 0.2, k * 0.52, 'eracheek').rotation.y = -k * 0.62; box(t, s.gunmetal, 0.22, 0.2, 0.3, 0.98, 0.36, k * 0.76, 'shtora'); box(t, s.red, 0.03, 0.14, 0.22, 1.1, 0.36, k * 0.76, 'shtoralens'); }
  box(t, P.dark, 0.3, 0.3, 0.32, 1.08, 0.22, 0, 'mantlet'); cyl(t, s.gunmetal, 0.075, 3.3, 2.85, 0.24, 0, 'x', 'barrel'); cyl(t, s.gunmetal, 0.11, 0.5, 2.3, 0.24, 0, 'x', 'evacuator'); cyl(t, s.gunmetal, 0.088, 0.1, 4.46, 0.24, 0, 'x', 'muzzle');
  cyl(t, P.hull, 0.24, 0.14, -0.2, 0.5, -0.38, 'y', 'cupola'); box(t, s.gunmetal, 0.36, 0.08, 0.08, 0, 0.68, -0.38, 'aamg'); cyl(t, s.gunmetal, 0.02, 0.7, 0.5, 0.69, -0.38, 'x', 'aamg');
  for (const k of [-1, 1]) box(t, P.dark, 0.6, 0.22, 0.3, -0.95, 0.16, k * 0.62, 'stowage'); cyl(t, P.dark, 0.1, 1.3, -1.22, 0.28, 0, 'z', 'snorkel');
  box(t, P.id, 0.46, 0.02, 0.46, -0.35, 0.5, 0.2, 'idpanel');
  return { g, body: b, turret: t, turretX: 0, muzzle: 4.5, muzzleY: deck + 0.3 };
}
// T-14 Armata: a long seven-wheel hull with the three crew side by side in the nose, deep side skirts ending in slat
// armor, and a small unmanned turret of flat faceted plates set well back, with active-protection tubes under its cheeks.
function t14(P) {
  const s = shared(), g = new THREE.Group(), b = grp(g), A = ARMOR.t14, L = A.length * ARMOR.K, W = Math.max(2.3, A.width * ARMOR.K), deck = 1.16, hw = W / 2;
  trackedHull(b, P, L, W, deck, { wheels: 7, glacis: 2.1, nose: 0.7 });
  // the crew of three sit side by side in an armoured capsule at the front, under three hatches with vision blocks
  for (const z of [-0.52, 0, 0.52]) { box(b, P.dark, 0.44, 0.05, 0.4, L / 2 - 2.5, deck + 0.025, z, 'crewhatch'); box(b, s.glass, 0.05, 0.05, 0.22, L / 2 - 2.24, deck + 0.06, z, 'visionblock'); }
  for (const z of [-0.5, 0.5]) box(b, P.hull, 1.5, 0.05, 0.8, L / 2 - 1.25, deck - 0.2, z, 'glacisarmor').rotation.z = -Math.atan2(deck - 0.68, 2.1);   // reactive armour plates on the long glacis
  for (const k of [-1, 1]) {
    box(b, P.hull, L * 0.6, 0.5, 0.12, L * 0.17, deck - 0.44, k * (hw + 0.04), 'sidearmor');                      // thick armour modules over the front two thirds
    for (let i = 0; i < 9; i++) box(b, s.gunmetal, 0.035, 0.46, 0.04, -L / 2 + 0.16 + i * 0.2, deck - 0.44, k * (hw + 0.1), 'slat');   // bar armour round the engine at the back
    for (const y of [deck - 0.24, deck - 0.62]) box(b, s.gunmetal, 1.8, 0.03, 0.04, -L / 2 + 0.96, y, k * (hw + 0.1), 'slatrail');
    box(b, s.gunmetal, 0.5, 0.16, 0.16, -L / 2 + 0.5, deck - 0.02, k * (hw - 0.3), 'exhaust');
  }
  box(b, P.dark, 1.7, 0.03, W - 1.2, -L / 2 + 1.05, deck + 0.012, 0, 'enginedeck'); for (const z of [-0.3, 0.3]) cyl(b, P.hull, 0.2, 0.9, -L / 2 - 0.05, deck - 0.16, z, 'z', 'fueldrum');
  // the unmanned turret: a narrow faceted casing with a pointed front and a long overhanging bustle, set well back
  cyl(b, s.gunmetal, 0.82, 0.05, -0.75, deck + 0.025, 0, 'y', 'turretring');
  const t = grp(b, -0.75, deck + 0.04, 0, 'turret');
  prism(t, P.hull, [[1.5, 0], [0.75, -0.6], [-1.0, -0.64], [-2.0, -0.5], [-2.0, 0.5], [-1.0, 0.64], [0.75, 0.6]], 0.44, 'plan', 0, 0.22, 0, 'turretshell');
  prism(t, P.hull, [[1.05, 0.44], [-1.9, 0.44], [-1.9, 0.62], [-0.2, 0.74], [0.6, 0.66]], 0.84, 'side', 0, 0, 0, 'turretroof');   // sloped upper casing
  box(t, P.dark, 0.36, 0.3, 0.36, 1.2, 0.3, 0, 'mantlet');
  cyl(t, s.gunmetal, 0.07, 4.3, 3.35, 0.3, 0, 'x', 'barrel'); cyl(t, s.gunmetal, 0.105, 1.9, 2.6, 0.3, 0, 'x', 'thermalsleeve'); cyl(t, s.gunmetal, 0.085, 0.14, 5.45, 0.3, 0, 'x', 'muzzle');   // 125 mm 2A82: long, sleeved, no bore evacuator
  for (const k of [-1, 1]) {
    for (let i = 0; i < 5; i++) { const a = cyl(t, s.gunmetal, 0.06, 0.34, 0.45 - i * 0.24, 0.05, k * 0.7, 'x', 'apstube'); a.rotation.y = -k * 0.5; }   // Afghanit launch tubes under the turret sides
    box(t, s.track, 0.04, 0.22, 0.3, 0.86, 0.36, k * 0.5, 'radarpanel').rotation.y = k * 0.65; box(t, s.track, 0.04, 0.22, 0.3, -1.6, 0.4, k * 0.56, 'radarpanel').rotation.y = -k * 0.3;   // four flat radar faces
    box(t, s.gunmetal, 0.3, 0.1, 0.16, -0.5, 0.74, k * 0.3, 'smoke');
  }
  cyl(t, s.gunmetal, 0.15, 0.36, 0.25, 0.9, -0.2, 'y', 'panoramicsight'); box(t, s.glass, 0.04, 0.16, 0.2, 0.4, 0.94, -0.2, 'lens');
  box(t, s.gunmetal, 0.3, 0.16, 0.18, 0.22, 1.16, -0.2, 'rws'); cyl(t, s.gunmetal, 0.016, 0.6, 0.62, 1.17, -0.2, 'x', 'rwsbarrel');   // the machine gun rides on top of the sight
  cyl(t, s.gunmetal, 0.012, 0.9, -1.7, 1.08, 0.36, 'y', 'antenna'); cyl(t, s.gunmetal, 0.04, 0.3, -1.5, 0.82, -0.36, 'y', 'weathermast');
  box(t, P.id, 0.5, 0.02, 0.5, -1.25, 0.64, 0, 'idpanel');
  return { g, body: b, turret: t, turretX: -0.75, muzzle: 4.8, muzzleY: deck + 0.36 };
}
// BMP-3: boat-shaped hull that swims (trim vane on the nose, two water jets at the back), a low round turret with
// the thick 100 mm gun and a thin 30 mm cannon beside it.
function bmp3(P) {
  const s = shared(), g = new THREE.Group(), b = grp(g), A = ARMOR.bmp3, L = A.length * ARMOR.K, W = Math.max(2.1, A.width * ARMOR.K);
  prism(b, P.hull, [[L / 2, 0.74], [L / 2 - 1.0, 1.24], [-L / 2, 1.24], [-L / 2, 0.46], [L / 2 - 0.3, 0.46]], W - 0.56, 'side', 0, 0, 0, 'hull');
  for (const k of [-1, 1]) { runningGear(b, L - 0.3, k * (W / 2 - 0.2), 0.4, 6, 0.23, 0.8); box(b, P.hull, L - 0.2, 0.05, 0.46, 0, 0.84, k * (W / 2 - 0.2), 'fender'); cyl(b, s.gunmetal, 0.17, 0.24, -L / 2 - 0.08, 0.7, k * 0.5, 'x', 'waterjet'); }
  box(b, P.dark, 0.06, 0.5, W - 0.8, L / 2 - 0.45, 1.02, 0, 'trimvane').rotation.z = -0.47; box(b, s.gunmetal, 0.5, 0.14, 0.2, -L / 2 + 0.8, 1.3, 0.7, 'exhaust');
  for (const x of [-1.6, -1.1]) for (const k of [-1, 1]) box(b, P.dark, 0.3, 0.03, 0.3, x, 1.255, k * 0.45, 'hatch');
  cyl(b, s.gunmetal, 0.82, 0.05, 0.25, 1.26, 0, 'y', 'turretring');
  const t = grp(b, 0.25, 1.27, 0, 'turret');
  cyl(t, P.hull, 0.78, 0.34, 0, 0.17, 0, 'y', 'turretshell'); box(t, P.dark, 0.5, 0.26, 0.6, 0.6, 0.2, 0, 'mantlet');
  cyl(t, s.gunmetal, 0.07, 2.0, 1.7, 0.22, -0.05, 'x', 'barrel'); cyl(t, s.gunmetal, 0.03, 1.9, 1.65, 0.24, 0.16, 'x', 'autocannon');
  box(t, s.gunmetal, 0.22, 0.2, 0.24, 0.1, 0.44, -0.4, 'sight'); for (const k of [-1, 1]) box(t, s.gunmetal, 0.4, 0.12, 0.1, -0.2, 0.2, k * 0.8, 'smokelaunchers');
  box(t, P.id, 0.4, 0.02, 0.4, -0.3, 0.352, 0.15, 'idpanel');
  return { g, body: b, turret: t, turretX: 0.25, muzzle: 2.7, muzzleY: 1.5 };
}
// 2K22 Tunguska: a tall turret carrying, on each side, twin 30 mm guns over a block of four missile tubes; a tracking
// radar dish on the turret front and a search radar antenna standing up at the back.
function tunguska(P) {
  const s = shared(), g = new THREE.Group(), b = grp(g), A = ARMOR.tunguska, L = A.length * ARMOR.K, W = Math.max(2.15, A.width * ARMOR.K), deck = 1.0;
  trackedHull(b, P, L, W, deck, { wheels: 6, glacis: 1.2 });
  const t = grp(b, 0.1, deck + 0.02, 0, 'turret');
  cyl(t, s.gunmetal, 0.95, 0.08, 0, 0.04, 0, 'y', 'turretring'); box(t, P.hull, 2.1, 0.95, 1.3, 0, 0.55, 0, 'turretshell');
  for (const k of [-1, 1]) {
    box(t, P.dark, 1.5, 0.36, 0.3, 0.2, 0.82, k * 0.82, 'gunpod');
    for (const dy of [-0.09, 0.09]) { cyl(t, s.gunmetal, 0.035, 2.1, 1.7, 0.82 + dy, k * 0.82, 'x', 'gunbarrel'); cyl(t, s.gunmetal, 0.05, 0.14, 2.72, 0.82 + dy, k * 0.82, 'x', 'muzzle'); }
    for (const dy of [0, 0.24]) for (const dz of [0, 0.24]) cyl(t, P.hull, 0.11, 1.5, 0.1, 0.24 + dy, k * (0.82 + dz), 'x', 'missiletube');
  }
  cyl(t, s.greyDark, 0.42, 0.1, 1.1, 0.7, 0, 'x', 'trackradar'); cyl(t, s.gunmetal, 0.07, 0.5, -0.85, 1.25, 0, 'y', 'radarmast');
  box(t, s.greyDark, 0.08, 0.5, 1.5, -0.85, 1.7, 0, 'searchradar').rotation.z = 0.22; box(t, P.id, 0.5, 0.02, 0.5, 0.1, 1.035, 0, 'idpanel');
  return { g, body: b, turret: t, turretX: 0.1, muzzle: 2.8, muzzleY: deck + 0.84, noRecoil: true };
}
// TOS-1A: a T-72 hull carrying, in place of a turret, a box of 24 rocket tubes (three rows of eight) held at an angle.
function tos1(P) {
  const s = shared(), g = new THREE.Group(), b = grp(g), A = ARMOR.tos1, L = A.length * ARMOR.K, W = A.width * ARMOR.K, deck = 1.08;
  trackedHull(b, P, L, W, deck, { wheels: 6, skirt: 0.3, glacis: 1.35 });
  for (let c = 0; c < 5; c++) box(b, P.dark, 0.46, 0.07, 0.3, L / 2 - 0.72, deck - 0.17, (c - 2) * 0.36, 'era').rotation.z = -0.25;
  cyl(b, s.gunmetal, 0.9, 0.1, -0.1, deck + 0.05, 0, 'y', 'turntable');
  for (const k of [-1, 1]) box(b, P.dark, 1.3, 0.7, 0.14, -0.1, deck + 0.42, k * 0.98, 'cradlearm');
  const pk = grp(b, -0.1, deck + 0.5, 0, 'launcher'); pk.rotation.z = 0.3;
  box(pk, P.hull, 2.3, 0.86, 1.86, 0.15, 0.3, 0, 'rocketpack'); box(pk, P.dark, 2.34, 0.06, 1.9, 0.15, 0.76, 0, 'packroof');
  for (let r = 0; r < 3; r++) for (let c = 0; c < 8; c++) cyl(pk, s.track, 0.088, 0.05, 1.31, 0.04 + r * 0.26, (c - 3.5) * 0.225, 'x', 'tube');
  box(b, P.dark, 0.5, 0.36, 0.7, 1.05, deck + 0.18, 0, 'sightbox'); box(b, P.id, 0.5, 0.02, 0.5, -L / 2 + 0.7, deck + 0.03, 0, 'idpanel');
  return { g, body: b, launcher: pk, muzzle: 1.4, muzzleY: deck + 1.3 };
}
// Su-27 and Su-57 use the same builder as the other fighters; only the measurements and the paint differ.
export const SU27 = { ...FLANKER, skin: 'su27', finMat: 'su27Dark', missiles: 2 };
export const SU57 = { missiles: 4, skin: 'su57', finMat: 'su57Dark', patch: 'su57Dark', canopyH: 0.34, scale: 0.4, length: 20.1, span: 14.1, tailSpan: 10.8, sweep: 48, cant: 26, mid: 9.8,
  chine: [[2.4, 0.7], [6.0, 1.2]], lerx: [[6.0, 1.2], [9.0, 2.6]], shoulder: 9.0, body: [8.4, 2.6, 17.6, 2.5], spine: [[5.4, 0.3], [6.8, 0.52], [12.0, 0.42], [16.0, 0.28]], canopy: [4.6, 1.8],
  wing: [8.6, 2.6, 1.3, 16.0], tail: [16.0, 2.5, 19.8, 19.4], fin: [14.4, 16.0, 17.2, 17.6, 2.3, 2.5], intake: [8.2, 1.5, 0], nozzle: ['round', 18.6, 1.4], gear: [5.4, 12.0, 2.0], stinger: 20.1, nacelles: true };
const su27 = (P) => fighter(P, SU27), su57 = (P) => fighter(P, SU57);
// Ka-52 "Alligator": two three-blade rotors stacked on one tall mast turning opposite ways, and so no tail rotor;
// a wide cockpit with the crew side by side; a short tail with a tailplane and end-plate fins; cannon on the
// starboard side; stub wings with rocket pods and missiles.
export const KA52 = { scale: 0.5, fuselage: 13.5, rotor: 14.5, blades: 3 };
function ka52(P) {
  const s = shared(), g = new THREE.Group(), b = grp(g), R = KA52.rotor / 2 * KA52.scale;
  P = { ...P, hull: s.ka52, dark: s.ka52Dark };
  prism(b, P.hull, [[3.2, -0.1], [2.9, 0.2], [2.0, 0.62], [0.9, 0.86], [-0.6, 0.86], [-1.6, 0.55], [-1.8, -0.1], [-1.0, -0.55], [2.3, -0.55]], 1.16, 'side', 0, 0, 0, 'fuselage');
  box(b, s.glass, 1.0, 0.36, 1.02, 1.72, 0.62, 0, 'canopy').rotation.z = -0.4; box(b, P.dark, 0.06, 0.4, 0.06, 1.72, 0.66, 0, 'canopyframe').rotation.z = -0.4;
  for (const k of [-1, 1]) { cyl(b, P.dark, 0.27, 1.6, -0.4, 0.84, k * 0.62, 'x', 'engine'); box(b, s.gunmetal, 0.4, 0.2, 0.3, -1.3, 0.9, k * 0.74, 'exhaust').rotation.y = k * 0.5; box(b, s.gunmetal, 0.08, 0.34, 0.4, 0.42, 0.84, k * 0.62, 'intake'); }
  prism(b, P.hull, [[-1.6, 0.55], [-5.0, 0.5], [-5.0, 0.18], [-1.8, -0.1]], 0.34, 'side', 0, 0, 0, 'tailboom');
  prism(b, P.hull, [[-4.2, 0.45], [-5.0, 1.5], [-5.4, 1.5], [-5.1, 0.2]], 0.1, 'side', 0, 0, 0, 'fin'); box(b, P.hull, 0.6, 0.05, 2.7, -4.3, 0.42, 0, 'tailplane');
  for (const k of [-1, 1]) { box(b, P.hull, 0.8, 0.9, 0.06, -4.35, 0.5, k * 1.35, 'endplate'); box(b, P.id, 0.4, 0.3, 0.07, -4.35, 0.62, k * 1.36, 'idpanel'); }
  for (const k of [-1, 1]) {
    box(b, P.dark, 0.9, 0.08, 1.6, 0.1, 0.0, k * 1.3, 'stubwing');
    cyl(b, s.gunmetal, 0.18, 1.1, 0.2, -0.28, k * 1.25, 'x', 'rocketpod'); cyl(b, s.gunmetal, 0.13, 0.04, 0.77, -0.28, k * 1.25, 'x', 'podface');
    box(b, s.gunmetal, 0.3, 0.24, 0.3, 0.2, -0.3, k * 1.9, 'missilerack'); for (const dz of [-0.1, 0.1]) for (const dy of [-0.08, 0.08]) cyl(b, s.ordnance, 0.045, 0.9, 0.3, -0.3 + dy, k * 1.9 + dz, 'x', 'missile');
    cyl(b, s.steel, 0.045, 0.6, -0.3, -0.82, k * 0.75, 'y', 'gearstrut'); cyl(b, s.rubber, 0.2, 0.15, -0.3, -1.12, k * 0.8, 'z', 'wheel');
  }
  cyl(b, s.steel, 0.04, 0.5, 2.2, -0.8, 0, 'y', 'nosestrut'); for (const k of [-1, 1]) cyl(b, s.rubber, 0.14, 0.1, 2.2, -1.08, k * 0.1, 'z', 'nosewheel');
  cyl(b, s.gunmetal, 0.1, 1.5, -0.1, 1.55, 0, 'y', 'mast');
  const mk = (y, name, phase) => { const r = grp(b, -0.1, y, 0, name); cyl(r, s.gunmetal, 0.2, 0.1, 0, 0, 0, 'y', 'hub'); for (let i = 0; i < KA52.blades; i++) { const arm = grp(r); arm.rotation.y = phase + i * Math.PI * 2 / KA52.blades; box(arm, s.gunmetal, R - 0.15, 0.03, 0.2, (R + 0.15) / 2, 0, 0, 'blade'); } return r; };
  const rotor = mk(1.5, 'rotor', 0), rotor2 = mk(2.2, 'rotor2', 1.0);
  ball(b, s.gunmetal, 0.22, 0.22, 0.22, 2.2, -0.66, 0, 'sensor');
  const t = grp(b, 1.1, -0.3, 0.64, 'turret'); box(t, s.gunmetal, 0.5, 0.2, 0.16, 0, 0, 0, 'gunmount'); cyl(t, s.gunmetal, 0.04, 1.3, 0.8, 0, 0, 'x', 'cannon');
  return { g, body: b, turret: t, turretX: 1.1, rotor, rotor2, ground: 1.3, muzzle: 2.6, muzzleY: -0.4, noRecoil: true };
}
// Steregushchiy-class corvette: slab-sided stealth superstructure that carries straight up into an enclosed mast,
// a faceted 100 mm gun house on the forecastle, missile canisters amidships, a rotary gun aft and a helicopter deck.
function stereg(P) {
  const s = shared(), g = new THREE.Group(), b = grp(g), D = SHIPS.stereg, L = D.length, B = D.beam;
  shipHull(b, s.grey, L, B, 1.35, 0.8, 0.27); rakedStem(b, s.grey, L, B, 1.51);
  shipDeck(b, s.greyDark, L, B, 0.27, 1.53);
  prism(b, s.grey, [[-4.6, 1.5], [5.6, 1.5], [4.4, 3.9], [-4.0, 3.9]], B * 0.82, 'side', 0, 0, 0, 'superstructure');
  box(b, s.glass, 0.05, 0.34, B * 0.66, 4.72, 3.35, 0, 'bridgewindows').rotation.z = 0.46;
  prism(b, s.grey, [[0.6, 3.9], [3.2, 3.9], [2.5, 7.6], [1.3, 7.6]], 1.5, 'side', 0, 0, 0, 'mast'); box(b, s.greyDark, 1.0, 1.0, 1.56, 1.9, 6.3, 0, 'radarface'); ball(b, s.white, 0.42, 0.42, 0.42, 1.9, 7.95, 0, 'radome');
  for (const k of [-1, 1]) { const c = grp(b, -1.6, 3.92, k * 0.9, 'canisters'); c.rotation.y = k * 0.5; for (const z of [-0.22, 0.22]) cyl(c, s.greyDark, 0.2, 2.0, 0, 0.36, z, 'x', 'canister'); }
  const cw = grp(b, -3.4, 3.9, 0, 'ciws'); cyl(cw, s.greyDark, 0.4, 0.6, 0, 0.3, 0, 'y', 'drum'); rotaryGun(cw, 0.15, 0.5, 0, 0.9);
  box(b, s.greyDark, 5.6, 0.06, B * 0.76, -9.3, 1.55, 0, 'helideck'); box(b, s.white, 1.8, 0.02, 0.18, -9.3, 1.59, 0, 'marking'); box(b, s.white, 0.18, 0.02, 1.4, -9.3, 1.59, 0, 'marking');
  box(b, P.id, 1.4, 0.03, 1.4, -11.2, 1.59, 0, 'idpanel');
  const t = grp(b, 8.2, 1.55, 0, 'turret');
  cyl(t, s.greyDark, 0.8, 0.16, 0, 0.08, 0, 'y', 'ring'); prism(t, s.grey, [[-0.9, 0.16], [1.1, 0.16], [0.4, 1.1], [-0.9, 1.1]], 1.3, 'side', 0, 0, 0, 'gunhouse');
  cyl(t, s.gunmetal, 0.09, 2.4, 1.9, 0.62, 0, 'x', 'barrel');
  return { g, body: b, turret: t, turretX: 8.2, muzzle: 11, muzzleY: 2.2, ship: true };
}
// ================================================================ Europe
// Leopard 2A6: a flat, wide hull on seven road wheels under heavy skirts, and a long turret whose front is the
// "arrowhead" wedge of add-on armor, with the very long 120 mm L/55 gun.
function leoHull(b, P, A, deck) { const L = A.length * ARMOR.K, W = A.width * ARMOR.K; trackedHull(b, P, L, W, deck, { wheels: 7, skirt: 0.36, glacis: 1.5 }); box(b, P.dark, 1.5, 0.03, W - 1.2, -L / 2 + 0.95, deck + 0.012, 0, 'enginedeck'); for (const k of [-1, 1]) cyl(b, shared().gunmetal, 0.2, 0.06, -L / 2 - 0.02, deck - 0.2, k * 0.62, 'x', 'exhaustgrille'); return [L, W]; }
function leopard2(P) {
  const s = shared(), g = new THREE.Group(), b = grp(g), A = ARMOR.leopard2, deck = 1.1; leoHull(b, P, A, deck);
  cyl(b, s.gunmetal, 1.05, 0.06, -0.1, deck + 0.03, 0, 'y', 'turretring');
  const t = grp(b, -0.1, deck + 0.05, 0, 'turret');
  prism(t, P.hull, [[2.05, 0], [0.9, -1.0], [-1.6, -1.0], [-1.6, 1.0], [0.9, 1.0]], 0.62, 'plan', 0, 0.31, 0, 'turretshell');   // the arrowhead: flat sides running to a point at the gun
  box(t, P.dark, 0.9, 0.5, 1.7, -1.9, 0.3, 0, 'bustle');
  box(t, P.dark, 0.34, 0.34, 0.4, 1.55, 0.3, 0, 'mantlet'); const gl = A.gun * ARMOR.K;
  cyl(t, s.gunmetal, 0.075, gl, 1.6 + gl / 2, 0.3, 0, 'x', 'barrel'); cyl(t, s.gunmetal, 0.11, 0.6, 1.6 + gl * 0.55, 0.3, 0, 'x', 'evacuator'); cyl(t, s.gunmetal, 0.09, 0.1, 1.6 + gl, 0.3, 0, 'x', 'muzzle');
  cyl(t, s.gunmetal, 0.14, 0.36, -0.3, 0.8, -0.45, 'y', 'periscope'); box(t, s.glass, 0.04, 0.14, 0.18, -0.15, 0.88, -0.45, 'lens');
  box(t, s.gunmetal, 0.4, 0.08, 0.08, -0.4, 0.72, 0.5, 'mg3'); cyl(t, s.gunmetal, 0.018, 0.6, 0.0, 0.73, 0.5, 'x', 'mg3');
  for (const k of [-1, 1]) for (let i = 0; i < 4; i++) cyl(t, s.gunmetal, 0.05, 0.22, -1.0 - i * 0.14, 0.42, k * 1.06, 'x', 'smokelauncher').rotation.y = k * 0.5;
  box(t, P.id, 0.5, 0.02, 0.5, -0.9, 0.632, 0, 'idpanel');
  return { g, body: b, turret: t, turretX: -0.1, muzzle: 1.6 + gl, muzzleY: deck + 0.36 };
}
// KF51 Panther: the Leopard 2 hull under a new, larger turret of flat angular plates with a thicker 130 mm gun,
// a remote weapon station on the roof and a loitering-munition launcher at the back.
function kf51(P) {
  const s = shared(), g = new THREE.Group(), b = grp(g), A = ARMOR.kf51, deck = 1.1; leoHull(b, P, A, deck);
  cyl(b, s.gunmetal, 1.1, 0.06, -0.1, deck + 0.03, 0, 'y', 'turretring');
  const t = grp(b, -0.1, deck + 0.05, 0, 'turret');
  prism(t, P.hull, [[1.75, -0.5], [1.75, 0.5], [1.05, 1.08], [-1.8, 1.08], [-1.8, -1.08], [1.05, -1.08]], 0.74, 'plan', 0, 0.37, 0, 'turretshell');
  for (const k of [-1, 1]) prism(t, P.dark, [[-1.7, 0.06], [1.0, 0.06], [0.75, 0.64], [-1.7, 0.64]], 0.1, 'side', 0, 0, k * 1.13, 'sidearmor');
  box(t, P.dark, 0.36, 0.42, 0.56, 1.85, 0.36, 0, 'mantlet'); const gl = A.gun * ARMOR.K;
  cyl(t, s.gunmetal, 0.095, gl, 1.95 + gl / 2, 0.36, 0, 'x', 'barrel'); cyl(t, P.dark, 0.13, gl * 0.45, 1.95 + gl * 0.32, 0.36, 0, 'x', 'thermalsleeve'); cyl(t, s.gunmetal, 0.12, 0.2, 1.95 + gl, 0.36, 0, 'x', 'muzzle');
  box(t, s.gunmetal, 0.34, 0.26, 0.3, -1.1, 0.9, 0.55, 'rws'); cyl(t, s.gunmetal, 0.02, 0.7, -0.65, 0.92, 0.55, 'x', 'rwsbarrel');
  cyl(t, s.gunmetal, 0.15, 0.3, 0.5, 0.9, -0.5, 'y', 'sight'); box(t, s.glass, 0.04, 0.14, 0.2, 0.66, 0.95, -0.5, 'lens');
  box(t, P.dark, 0.9, 0.34, 0.6, -1.25, 0.9, -0.5, 'dronelauncher'); for (const z of [-0.65, -0.35]) cyl(t, s.track, 0.09, 0.04, -0.79, 0.9, z, 'x', 'dronetube');
  box(t, P.id, 0.5, 0.02, 0.5, 0.1, 0.752, 0.3, 'idpanel');
  return { g, body: b, turret: t, turretX: -0.1, muzzle: 1.95 + gl, muzzleY: deck + 0.42 };
}
// Laser Leopard: the same hull carrying a high-energy laser module in place of a gun turret: a boxy housing, a
// beam director like a short telescope with a glass front, a sensor head and cooling grilles.
function laserleo(P) {
  const s = shared(), g = new THREE.Group(), b = grp(g), A = ARMOR.laserleo, deck = 1.1; leoHull(b, P, A, deck);
  cyl(b, s.gunmetal, 1.0, 0.06, -0.1, deck + 0.03, 0, 'y', 'turretring');
  const t = grp(b, -0.1, deck + 0.05, 0, 'turret');
  box(t, P.hull, 2.2, 0.74, 1.7, -0.3, 0.37, 0, 'lasermodule'); box(t, P.dark, 0.9, 0.5, 1.72, -1.2, 0.4, 0, 'coolinggrille');
  cyl(t, s.white, 0.34, 1.1, 0.75, 0.82, 0, 'x', 'beamdirector'); cyl(t, s.glass, 0.3, 0.04, 1.32, 0.82, 0, 'x', 'lens'); box(t, s.gunmetal, 0.4, 0.3, 0.5, 0.3, 0.6, 0, 'directormount');
  cyl(t, s.gunmetal, 0.05, 0.6, -0.9, 1.0, 0.6, 'y', 'sensormast'); ball(t, s.gunmetal, 0.16, 0.16, 0.16, -0.9, 1.36, 0.6, 'sensorhead');
  box(t, P.id, 0.5, 0.02, 0.5, -0.6, 0.752, -0.4, 'idpanel');
  return { g, body: b, turret: t, turretX: -0.1, muzzle: 1.4, muzzleY: deck + 0.88, noRecoil: true };
}
// Puma: a tall, slab-sided hull with thick bolt-on side armor over six road wheels, and a small unmanned turret
// set to the left with a 30 mm cannon and a missile box on its side.
function puma(P) {
  const s = shared(), g = new THREE.Group(), b = grp(g), A = ARMOR.puma, L = A.length * ARMOR.K, W = A.width * ARMOR.K;
  prism(b, P.hull, [[L / 2, 0.82], [L / 2 - 1.1, 1.5], [-L / 2, 1.5], [-L / 2, 0.44], [L / 2 - 0.3, 0.44]], W - 0.6, 'side', 0, 0, 0, 'hull');
  for (const k of [-1, 1]) { runningGear(b, L - 0.3, k * (W / 2 - 0.22), 0.42, 6, 0.25, 0.86); for (let i = 0; i < 4; i++) box(b, P.dark, L * 0.21, 0.6, 0.12, -L / 2 + 0.65 + i * L * 0.225, 1.1, k * (W / 2 - 0.06), 'sidearmor'); }
  box(b, P.dark, 1.2, 0.03, W - 1.0, L / 2 - 1.9, 1.512, 0.3, 'enginedeck'); box(b, P.dark, 0.5, 0.04, 0.5, L / 2 - 1.7, 1.52, -0.5, 'driverhatch');
  box(b, P.dark, 0.08, 1.0, W - 0.9, -L / 2 - 0.02, 0.98, 0, 'rearramp');
  cyl(b, s.gunmetal, 0.7, 0.05, -0.3, 1.52, -0.3, 'y', 'turretring');
  const t = grp(b, -0.3, 1.54, -0.3, 'turret');   // off-centre, as on the real vehicle
  prism(t, P.hull, [[-0.85, 0], [0.9, 0], [0.6, 0.5], [-0.85, 0.5]], 1.0, 'side', 0, 0, 0, 'turretshell');
  cyl(t, s.gunmetal, 0.045, 2.0, 1.75, 0.26, 0.1, 'x', 'barrel'); cyl(t, s.gunmetal, 0.06, 0.2, 2.72, 0.26, 0.1, 'x', 'muzzlebrake');
  box(t, P.dark, 0.9, 0.34, 0.3, -0.1, 0.3, -0.66, 'missilebox'); for (const dy of [-0.07, 0.09]) cyl(t, s.track, 0.07, 0.04, 0.37, 0.3 + dy, -0.66, 'x', 'missiletube');
  box(t, s.gunmetal, 0.3, 0.3, 0.3, -0.1, 0.66, 0.2, 'sight'); box(t, s.glass, 0.04, 0.16, 0.2, 0.06, 0.68, 0.2, 'lens');
  box(t, P.id, 0.4, 0.02, 0.4, -0.5, 0.512, 0.1, 'idpanel');
  return { g, body: b, turret: t, turretX: -0.3, muzzle: 2.8, muzzleY: 1.82, noRecoil: true };
}
// Flakpanzer Gepard: a Leopard 1 hull under a tall box of a turret with one 35 mm gun in a cradle on each side,
// the tracking radar dish on the turret front and the search radar antenna standing at the back.
function gepard(P) {
  const s = shared(), g = new THREE.Group(), b = grp(g), A = ARMOR.gepard, L = A.length * ARMOR.K, W = A.width * ARMOR.K, deck = 1.02;
  trackedHull(b, P, L, W, deck, { wheels: 7, skirt: 0.22, glacis: 1.3 });
  cyl(b, s.gunmetal, 1.0, 0.06, 0, deck + 0.03, 0, 'y', 'turretring');
  const t = grp(b, 0, deck + 0.05, 0, 'turret');
  box(t, P.hull, 2.0, 0.95, 1.5, -0.05, 0.48, 0, 'turretshell');
  for (const k of [-1, 1]) { box(t, P.dark, 1.2, 0.42, 0.28, 0.1, 0.62, k * 0.9, 'guncradle'); cyl(t, s.gunmetal, 0.04, 2.5, 1.85, 0.62, k * 0.9, 'x', 'gunbarrel'); cyl(t, s.gunmetal, 0.07, 0.3, 3.0, 0.62, k * 0.9, 'x', 'muzzle'); }
  cyl(t, s.greyDark, 0.4, 0.12, 1.02, 0.6, 0, 'x', 'trackradar'); box(t, s.gunmetal, 0.2, 0.3, 0.3, 0.9, 0.6, 0, 'radarmount');
  cyl(t, s.gunmetal, 0.07, 0.4, -0.9, 1.15, 0, 'y', 'radarmast'); box(t, s.greyDark, 0.1, 0.46, 1.5, -0.9, 1.55, 0, 'searchradar').rotation.z = 0.2;
  box(t, P.id, 0.5, 0.02, 0.5, 0, 0.962, 0, 'idpanel');
  return { g, body: b, turret: t, turretX: 0, muzzle: 3.0, muzzleY: deck + 0.68, noRecoil: true };
}
// PzH 2000: the engine in the front of the hull and a huge slab-sided turret over the back half, with the very long
// 155 mm L/52 gun resting in a travel lock on the nose.
function pzh2000(P) {
  const s = shared(), g = new THREE.Group(), b = grp(g), A = ARMOR.pzh2000, L = A.length * ARMOR.K, W = A.width * ARMOR.K, deck = 1.1;
  trackedHull(b, P, L, W, deck, { wheels: 7, skirt: 0.24, glacis: 1.1 });
  box(b, P.dark, 1.6, 0.03, W - 1.2, L / 2 - 1.7, deck + 0.012, 0, 'enginedeck'); box(b, s.gunmetal, 0.14, 0.5, 0.3, L / 2 - 0.45, deck + 0.22, 0, 'travellock');
  const t = grp(b, -0.75, deck + 0.02, 0, 'turret');
  box(t, P.hull, 3.0, 1.2, W - 0.26, -0.1, 0.6, 0, 'turretshell'); prism(t, P.hull, [[1.4, 0.05], [1.95, 0.25], [1.95, 0.95], [1.4, 1.2]], W - 0.8, 'side', 0, 0, 0, 'turretfront');
  const gl = A.gun * ARMOR.K, brl = grp(t, 1.9, 0.62, 0, 'gun'); brl.rotation.z = 0.07;
  cyl(brl, s.gunmetal, 0.085, gl, gl / 2, 0, 0, 'x', 'barrel'); cyl(brl, s.gunmetal, 0.14, 0.44, gl - 0.1, 0, 0, 'x', 'muzzlebrake'); cyl(brl, s.gunmetal, 0.13, 0.7, 0.5, 0, 0, 'x', 'recuperator');
  box(t, s.gunmetal, 0.4, 0.08, 0.08, -0.3, 1.3, 0.6, 'mg3'); cyl(t, P.dark, 0.3, 0.1, -0.8, 1.24, -0.5, 'y', 'hatch');
  for (const k of [-1, 1]) box(t, P.dark, 1.6, 0.6, 0.08, -0.5, 0.6, k * (W / 2 - 0.1), 'stowage');
  box(t, P.id, 0.6, 0.02, 0.6, 0.3, 1.212, 0, 'idpanel');
  return { g, body: b, turret: t, turretX: -0.75, muzzle: 1.9 + gl, muzzleY: deck + 0.95 };
}
// Eurofighter Typhoon: delta wing, canard foreplanes beside the cockpit, one tall fin, and one wide intake under the
// forward fuselage. Built by the shared fighter builder with those options switched on.
export const TYPHOON = { missiles: 2, skin: 'typhoon', finMat: 'typhoonDark', radome: 1.6, scale: 0.44, length: 15.96, span: 10.95, tailSpan: 0, sweep: 53, cant: 0, mid: 7.9,
  chine: [[1.8, 0.45], [4.6, 0.8]], shoulder: 4.6, body: [4.4, 1.2, 14.6, 1.25], spine: [[4.6, 0.3], [6.0, 0.55], [10.5, 0.45], [13.5, 0.3]], canopy: [3.9, 1.7],
  wing: [6.0, 1.2, 0.5, 14.3], tail: null, fin: [10.6, 13.3, 14.5, 14.9, 3.1, 0], single: true, canard: [3.4, 0.8, 2.0, 1.2], chin: 4.6,
  intake: [5.0, 0, 0], nozzle: ['round', 15.0, 0.6], gear: [4.2, 9.2, 1.3] };
const typhoon = (P) => fighter(P, TYPHOON);
// Tiger: a slim fuselage with the two crew in tandem under stepped flat-paned canopies, stub wings, a four-blade
// rotor with the sight ball on top of the mast, and a three-blade tail rotor.
export const TIGER = { scale: 0.5, fuselage: 14.08, rotor: 13.0, blades: 4 };
function tiger(P) {
  const s = shared(), g = new THREE.Group(), b = grp(g), R = TIGER.rotor / 2 * TIGER.scale;
  P = { ...P, hull: s.tigerGreen, dark: s.tigerDark };
  prism(b, P.hull, [[3.2, -0.2], [3.0, 0.1], [2.2, 0.45], [1.3, 0.78], [-0.1, 0.9], [-1.5, 0.6], [-1.7, -0.1], [-1.0, -0.6], [2.4, -0.6]], 0.8, 'side', 0, 0, 0, 'fuselage');
  box(b, s.glass, 0.8, 0.3, 0.56, 2.05, 0.5, 0, 'canopy').rotation.z = -0.4; box(b, s.glass, 0.85, 0.32, 0.58, 1.15, 0.88, 0, 'canopy').rotation.z = -0.32;
  for (const k of [-1, 1]) { cyl(b, P.dark, 0.25, 1.4, -0.5, 0.8, k * 0.5, 'x', 'engine'); box(b, s.gunmetal, 0.36, 0.2, 0.28, -1.15, 1.0, k * 0.54, 'exhaust').rotation.z = 0.5; }
  prism(b, P.hull, [[-1.5, 0.6], [-5.6, 0.5], [-5.6, 0.22], [-1.7, -0.1]], 0.28, 'side', 0, 0, 0, 'tailboom');
  prism(b, P.hull, [[-5.0, 0.4], [-6.2, 1.9], [-6.65, 1.9], [-6.0, 0.22]], 0.1, 'side', 0, 0, 0, 'fin'); box(b, P.hull, 0.5, 0.04, 2.0, -5.2, 0.4, 0, 'tailplane');
  for (const k of [-1, 1]) box(b, P.hull, 0.5, 0.5, 0.04, -5.2, 0.5, k * 1.0, 'endplate');
  box(b, P.id, 0.34, 0.24, 0.12, -5.9, 1.1, 0, 'idpanel');
  for (const k of [-1, 1]) {
    box(b, P.dark, 0.75, 0.08, 1.45, 0.2, 0.05, k * 1.1, 'stubwing').rotation.x = -k * 0.12;
    cyl(b, s.gunmetal, 0.17, 1.0, 0.25, -0.2, k * 1.0, 'x', 'rocketpod'); cyl(b, s.gunmetal, 0.12, 0.04, 0.77, -0.2, k * 1.0, 'x', 'podface');
    for (const dy of [-0.08, 0.08]) cyl(b, s.ordnance, 0.045, 0.85, 0.3, -0.12 + dy, k * 1.7, 'x', 'missile');
    cyl(b, s.steel, 0.045, 0.62, 1.4, -0.84, k * 0.6, 'y', 'gearstrut').rotation.x = k * 0.3; cyl(b, s.rubber, 0.2, 0.15, 1.4, -1.16, k * 0.72, 'z', 'wheel');
  }
  cyl(b, s.steel, 0.04, 0.4, -5.2, 0.02, 0, 'y', 'tailstrut'); cyl(b, s.rubber, 0.13, 0.1, -5.2, -0.2, 0, 'z', 'tailwheel');
  cyl(b, s.gunmetal, 0.08, 0.5, -0.2, 1.12, 0, 'y', 'mast');
  const rotor = grp(b, -0.2, 1.38, 0, 'rotor'); cyl(rotor, s.gunmetal, 0.19, 0.1, 0, 0, 0, 'y', 'hub');
  for (let i = 0; i < TIGER.blades; i++) { const arm = grp(rotor); arm.rotation.y = i * Math.PI * 2 / TIGER.blades; box(arm, s.gunmetal, R - 0.15, 0.03, 0.2, (R + 0.15) / 2, 0, 0, 'blade'); }
  cyl(b, s.gunmetal, 0.05, 0.3, -0.2, 1.58, 0, 'y', 'sightpost'); ball(b, s.gunmetal, 0.2, 0.2, 0.2, -0.2, 1.82, 0, 'mastsight');
  const rotorTail = grp(b, -6.35, 1.3, 0.1, 'tailrotor');
  for (let i = 0; i < 3; i++) { const arm = grp(rotorTail); arm.rotation.z = i * Math.PI * 2 / 3; box(arm, s.steel, 0.62, 0.06, 0.03, 0.31, 0, 0, 'tailblade'); }
  const t = grp(b, 2.4, -0.68, 0, 'turret'); cyl(t, s.gunmetal, 0.15, 0.16, 0, 0, 0, 'y', 'gunmount'); cyl(t, s.gunmetal, 0.04, 1.0, 0.55, -0.05, 0, 'x', 'cannon');
  return { g, body: b, turret: t, turretX: 2.4, rotor, rotorTail, ground: 1.35, muzzle: 3.1, muzzleY: -0.75 };
}
// FREMM frigate: smooth sides sloped inward, a 76 mm gun and missile cells on the forecastle, a pyramid mast with a
// radar ball on top, a single funnel block, a hangar and a helicopter deck.
function fremm(P) {
  const s = shared(), g = new THREE.Group(), b = grp(g), D = SHIPS.fremm, L = D.length, B = D.beam;
  shipHull(b, s.typhoon, L, B, 1.5, 0.9, 0.26); rakedStem(b, s.typhoon, L, B, 1.66);
  shipDeck(b, s.greyDark, L, B, 0.26, 1.68);
  box(b, s.greyDark, 1.5, 0.26, 1.7, 7.4, 1.8, 0, 'vls'); for (const x of [7.0, 7.5, 8.0]) for (const z of [-0.45, 0, 0.45]) box(b, s.gunmetal, 0.34, 0.04, 0.34, x, 1.95, z, 'cell');
  prism(b, s.typhoon, [[0.2, 1.66], [6.2, 1.66], [5.2, 4.2], [0.8, 4.2]], B * 0.84, 'side', 0, 0, 0, 'bridge');
  box(b, s.glass, 0.05, 0.36, B * 0.7, 5.52, 3.6, 0, 'bridgewindows').rotation.z = 0.4;
  prism(b, s.typhoon, [[1.2, 4.2], [4.2, 4.2], [3.1, 7.2], [2.3, 7.2]], 1.6, 'side', 0, 0, 0, 'mast'); ball(b, s.white, 0.6, 0.6, 0.6, 2.7, 7.7, 0, 'radome');
  box(b, s.typhoon, 7.4, 1.8, B * 0.8, -3.6, 2.56, 0, 'superstructure');
  prism(b, s.greyDark, [[-3.6, 3.46], [-0.9, 3.46], [-1.4, 5.0], [-3.1, 5.0]], 1.7, 'side', 0, 0, 0, 'funnel');
  box(b, s.typhoon, 3.4, 2.2, B * 0.82, -6.6, 2.76, 0, 'hangar'); box(b, s.gunmetal, 0.06, 1.7, B * 0.6, -8.32, 2.5, 0, 'hangardoor');
  box(b, s.greyDark, 5.2, 0.06, B * 0.78, -11.2, 1.7, 0, 'helideck'); box(b, s.white, 2.0, 0.02, 0.2, -11.2, 1.74, 0, 'marking'); box(b, s.white, 0.2, 0.02, 1.6, -11.2, 1.74, 0, 'marking');
  box(b, P.id, 1.6, 0.03, 1.6, -13.0, 1.74, 0, 'idpanel');
  const t = grp(b, 10.4, 1.7, 0, 'turret');
  cyl(t, s.greyDark, 0.8, 0.18, 0, 0.09, 0, 'y', 'ring'); ball(t, s.typhoon, 0.85, 1.0, 0.85, 0, 0.18, 0, 'gunhouse', s.dome); cyl(t, s.gunmetal, 0.08, 2.4, 1.6, 0.7, 0, 'x', 'barrel');
  return { g, body: b, turret: t, turretX: 10.4, muzzle: 13.2, muzzleY: 2.4, ship: true };
}
// ---------------------------------------------------------------- batch 13: US gunships
// AH-64 Apache: 14.68 m fuselage, 14.63 m four-blade main rotor, four-blade tail rotor set like scissors on the left
// of a swept fin. Flat-paned tandem cockpit (gunner in front, pilot stepped up behind), the TADS/PNVS sensor turret
// on the nose, engine pods high on the fuselage sides, avionics bays along the lower sides, stub wings with a
// Hellfire rack and a rocket pod each, the 30 mm chain gun under the belly between two fixed main wheels, and a
// tailwheel. `longbow` is the mast-mounted radar dome: its own node, shown once the Longbow upgrade is bought.
export const APACHE = { scale: 0.5, fuselage: 14.68, rotor: 14.63, blades: 4, tailBlades: 4 };
function apache(P) {
  const s = shared(), g = new THREE.Group(), b = grp(g), R = APACHE.rotor / 2 * APACHE.scale;
  P = { ...P, hull: s.apache, dark: s.apacheDark };   // Army aircraft green whoever flies it; the team marks keep their colour
  prism(b, P.hull, [[3.0, -0.3], [2.95, 0.05], [2.3, 0.42], [1.4, 0.86], [0.0, 1.0], [-1.6, 0.7], [-1.9, -0.1], [-1.2, -0.62], [2.3, -0.62]], 0.84, 'side', 0, 0, 0, 'fuselage');
  box(b, s.glass, 0.85, 0.32, 0.62, 2.0, 0.54, 0, 'canopy').rotation.z = -0.42; box(b, s.glass, 0.9, 0.34, 0.64, 1.05, 0.94, 0, 'canopy').rotation.z = -0.3;   // gunner in front, pilot stepped up behind
  box(b, P.dark, 0.1, 0.4, 0.66, 1.53, 0.74, 0, 'canopyframe').rotation.z = -0.36;
  cyl(b, s.gunmetal, 0.2, 0.46, 3.1, -0.12, 0, 'z', 'tads'); box(b, s.gunmetal, 0.2, 0.18, 0.22, 3.02, 0.18, 0, 'pnvs');   // target sight drum on the nose, night-vision turret above it
  for (const k of [-1, 1]) {
    cyl(b, P.dark, 0.3, 1.7, -0.6, 0.74, k * 0.7, 'x', 'engine'); box(b, s.gunmetal, 0.08, 0.4, 0.44, 0.27, 0.74, k * 0.7, 'intake');
    box(b, s.gunmetal, 0.46, 0.24, 0.34, -1.5, 0.8, k * 0.82, 'exhaust').rotation.y = k * 0.5;
    box(b, P.hull, 2.7, 0.38, 0.2, 1.15, -0.3, k * 0.5, 'avionicsbay');
    box(b, P.dark, 0.85, 0.08, 1.5, 0.1, 0.0, k * 1.15, 'stubwing');
    box(b, s.gunmetal, 0.3, 0.26, 0.34, 0.2, -0.26, k * 0.98, 'missilerack'); for (const dz of [-0.1, 0.1]) for (const dy of [-0.08, 0.08]) cyl(b, s.ordnance, 0.045, 0.82, 0.3, -0.26 + dy, k * 0.98 + dz, 'x', 'missile');   // four Hellfires a side
    cyl(b, s.gunmetal, 0.17, 1.0, 0.2, -0.26, k * 1.68, 'x', 'rocketpod'); cyl(b, s.gunmetal, 0.12, 0.04, 0.72, -0.26, k * 1.68, 'x', 'podface');
    cyl(b, s.steel, 0.045, 0.72, 1.55, -0.9, k * 0.62, 'y', 'gearstrut').rotation.x = k * 0.32; cyl(b, s.rubber, 0.22, 0.16, 1.5, -1.23, k * 0.76, 'z', 'wheel');
  }
  prism(b, P.hull, [[-1.6, 0.7], [-5.9, 0.62], [-5.9, 0.36], [-1.9, -0.1]], 0.3, 'side', 0, 0, 0, 'tailboom');
  prism(b, P.hull, [[-5.3, 0.5], [-6.5, 2.0], [-6.95, 2.0], [-6.3, 0.3]], 0.1, 'side', 0, 0, 0, 'fin'); box(b, P.hull, 0.6, 0.04, 1.7, -6.25, 0.32, 0, 'stabilator');
  box(b, P.id, 0.34, 0.26, 0.12, -6.2, 1.2, 0, 'idpanel');
  cyl(b, s.steel, 0.04, 0.5, -5.8, 0.1, 0, 'y', 'tailstrut'); cyl(b, s.rubber, 0.13, 0.1, -5.8, -0.18, 0, 'z', 'tailwheel');
  cyl(b, s.gunmetal, 0.08, 0.42, -0.3, 1.2, 0, 'y', 'mast');
  const rotor = grp(b, -0.3, 1.44, 0, 'rotor'); cyl(rotor, s.gunmetal, 0.2, 0.1, 0, 0, 0, 'y', 'hub');
  for (let i = 0; i < APACHE.blades; i++) { const arm = grp(rotor); arm.rotation.y = i * Math.PI * 2 / APACHE.blades; box(arm, s.gunmetal, R - 0.15, 0.03, 0.22, (R + 0.15) / 2, 0, 0, 'blade'); }
  const longbow = grp(b, -0.3, 1.5, 0, 'longbow'); cyl(longbow, s.gunmetal, 0.07, 0.3, 0, 0.14, 0, 'y', 'radarpost'); ball(longbow, s.greyDark, 0.46, 0.2, 0.46, 0, 0.42, 0, 'radome'); cyl(longbow, s.gunmetal, 0.3, 0.06, 0, 0.3, 0, 'y', 'radarbase');
  longbow.visible = false;   // the Longbow fire-control radar: a flattened dome above the rotor
  const rotorTail = grp(b, -6.72, 1.6, 0.13, 'tailrotor');
  for (let i = 0; i < 2; i++) { const arm = grp(rotorTail); arm.rotation.z = i * 0.96; box(arm, s.steel, 1.3, 0.07, 0.03, 0, 0, 0, 'tailblade'); }   // two crossed pairs at 55 degrees = four blades
  const t = grp(b, 1.0, -0.7, 0, 'turret'); cyl(t, s.gunmetal, 0.16, 0.18, 0, 0, 0, 'y', 'gunmount'); box(t, s.gunmetal, 0.4, 0.14, 0.12, 0.1, -0.08, 0, 'receiver'); cyl(t, s.gunmetal, 0.04, 1.05, 0.75, -0.08, 0, 'x', 'cannon');
  return { g, body: b, turret: t, turretX: 1.0, rotor, rotorTail, longbow, ground: 1.46, muzzle: 2.3, muzzleY: -0.8 };
}
// AH-1Z Viper: 13.87 m fuselage that is under a metre wide, 14.63 m four-blade rotor, four-blade tail rotor. One
// long tandem canopy, two engines side by side behind the mast, stub wings with missile rails at the tips, skids
// instead of wheels, a three-barrel 20 mm gun in a chin turret and a sensor ball on the nose.
export const VIPER = { scale: 0.5, fuselage: 13.87, rotor: 14.63, blades: 4, tailBlades: 4, width: 0.99 };
function viper(P) {
  const s = shared(), g = new THREE.Group(), b = grp(g), R = VIPER.rotor / 2 * VIPER.scale, wide = +(VIPER.width * VIPER.scale + 0.06).toFixed(3);
  P = { ...P, hull: s.viper, dark: s.viperDark };   // Marine Corps grey
  prism(b, P.hull, [[3.1, -0.1], [2.9, 0.14], [2.1, 0.42], [1.2, 0.74], [-0.1, 0.84], [-1.5, 0.56], [-1.7, -0.1], [-1.0, -0.5], [2.3, -0.5]], wide, 'side', 0, 0, 0, 'fuselage');
  box(b, s.glass, 0.85, 0.28, 0.46, 2.0, 0.5, 0, 'canopy').rotation.z = -0.36; box(b, s.glass, 0.9, 0.3, 0.48, 1.1, 0.8, 0, 'canopy').rotation.z = -0.3;
  ball(b, s.gunmetal, 0.19, 0.19, 0.19, 3.14, 0.0, 0, 'sensor');
  for (const k of [-1, 1]) {
    cyl(b, P.dark, 0.22, 1.5, -0.7, 0.8, k * 0.3, 'x', 'engine'); box(b, s.gunmetal, 0.4, 0.2, 0.26, -1.5, 0.84, k * 0.42, 'exhaust').rotation.y = k * 0.6;
    box(b, P.dark, 0.8, 0.07, 1.75, 0.15, 0.02, k * 1.15, 'stubwing');
    cyl(b, s.gunmetal, 0.16, 0.95, 0.25, -0.24, k * 0.85, 'x', 'rocketpod'); cyl(b, s.gunmetal, 0.11, 0.04, 0.74, -0.24, k * 0.85, 'x', 'podface');
    box(b, s.gunmetal, 0.3, 0.24, 0.3, 0.25, -0.24, k * 1.45, 'missilerack'); for (const dz of [-0.09, 0.09]) for (const dy of [-0.07, 0.07]) cyl(b, s.ordnance, 0.04, 0.8, 0.34, -0.24 + dy, k * 1.45 + dz, 'x', 'missile');
    cyl(b, s.gunmetal, 0.03, 1.1, 0.2, 0.06, k * 2.04, 'x', 'wingtiprail'); cyl(b, s.white, 0.045, 1.25, 0.25, 0.14, k * 2.04, 'x', 'sidewinder');
    cyl(b, s.steel, 0.045, 3.3, 0.7, -1.08, k * 0.72, 'x', 'skid');
    for (const x of [1.5, -0.2]) cyl(b, s.steel, 0.035, 0.66, x, -0.78, k * 0.56, 'y', 'skidstrut').rotation.x = k * 0.5;
    box(b, P.hull, 0.45, 0.42, 0.04, -4.3, 0.44, k * 0.85, 'endplate');
  }
  prism(b, P.hull, [[-1.5, 0.56], [-5.4, 0.5], [-5.4, 0.26], [-1.7, -0.1]], 0.26, 'side', 0, 0, 0, 'tailboom');
  prism(b, P.hull, [[-4.9, 0.4], [-6.0, 1.75], [-6.42, 1.75], [-5.8, 0.26]], 0.09, 'side', 0, 0, 0, 'fin'); box(b, P.hull, 0.5, 0.04, 1.7, -4.3, 0.42, 0, 'tailplane');
  box(b, P.id, 0.32, 0.24, 0.11, -5.7, 1.05, 0, 'idpanel');
  cyl(b, s.gunmetal, 0.07, 0.42, -0.2, 1.02, 0, 'y', 'mast');
  const rotor = grp(b, -0.2, 1.26, 0, 'rotor'); cyl(rotor, s.gunmetal, 0.18, 0.1, 0, 0, 0, 'y', 'hub');
  for (let i = 0; i < VIPER.blades; i++) { const arm = grp(rotor); arm.rotation.y = i * Math.PI * 2 / VIPER.blades; box(arm, s.gunmetal, R - 0.15, 0.03, 0.26, (R + 0.15) / 2, 0, 0, 'blade'); }
  const rotorTail = grp(b, -6.2, 1.4, -0.12, 'tailrotor');
  for (let i = 0; i < 2; i++) { const arm = grp(rotorTail); arm.rotation.z = i * Math.PI / 2; box(arm, s.steel, 1.2, 0.07, 0.03, 0, 0, 0, 'tailblade'); }
  const t = grp(b, 2.4, -0.58, 0, 'turret'); cyl(t, s.gunmetal, 0.14, 0.16, 0, 0, 0, 'y', 'gunmount');
  for (const z of [-0.035, 0, 0.035]) cyl(t, s.gunmetal, 0.02, 0.9, 0.55, -0.07 + (z ? 0 : 0.035), z, 'x', 'barrel');
  return { g, body: b, turret: t, turretX: 2.4, rotor, rotorTail, ground: 1.14, muzzle: 3.3, muzzleY: -0.65 };
}

// ---------------------------------------------------------------- batch 13: ISIS trucks and the Shahed
// Quad Cannon: the four-barrel 23 mm turret of a ZSU-23-4 on the bed of a pickup. The turret is a wide flat box
// with the guns in a square cluster between two cheeks and the folded "Gun Dish" radar on the roof at the back.
function zu23(P) {
  const s = shared(), g = new THREE.Group(), b = grp(g);
  for (const x of [1.08, -1.08]) for (const k of [-1, 1]) wheel(b, 0.31, 0.24, x, 0.31, k * 0.66);
  box(b, s.gunmetal, 3.2, 0.1, 0.9, 0, 0.42, 0, 'chassis');
  prism(b, P.hull, [[0.72, 0.5], [1.68, 0.5], [1.68, 0.82], [0.72, 0.9]], 1.34, 'side', 0, 0, 0, 'bonnet');
  prism(b, P.hull, [[-0.28, 0.5], [0.74, 0.5], [0.74, 0.9], [0.4, 1.34], [-0.28, 1.34]], 1.34, 'side', 0, 0, 0, 'cab');
  box(b, s.glass, 0.03, 0.5, 1.2, 0.585, 1.12, 0, 'windshield').rotation.z = 0.658; box(b, s.glass, 0.5, 0.3, 1.36, 0.02, 1.14, 0, 'window');
  box(b, s.gunmetal, 0.04, 0.2, 1.0, 1.7, 0.66, 0, 'grille'); box(b, s.gunmetal, 0.08, 0.12, 1.4, 1.76, 0.46, 0, 'bumper');
  box(b, P.hull, 1.5, 0.06, 1.34, -1.03, 0.6, 0, 'flatbed'); for (const k of [-1, 1]) box(b, P.hull, 1.5, 0.22, 0.05, -1.03, 0.74, k * 0.67, 'bedside');
  box(b, P.id, 0.7, 0.02, 0.8, 1.2, 0.875, 0, 'idpanel').rotation.z = -0.083;
  const t = grp(b, -1.0, 0.63, 0, 'turret');
  cyl(t, s.gunmetal, 0.34, 0.5, 0, 0.25, 0, 'y', 'pedestal');
  prism(t, P.dark, [[0.62, -0.42], [0.62, 0.42], [0.3, 0.66], [-0.66, 0.66], [-0.66, -0.66], [0.3, -0.66]], 0.5, 'plan', 0, 0.76, 0, 'turretshell');   // wide and flat, like the Shilka's
  for (const k of [-1, 1]) box(t, P.dark, 0.5, 0.36, 0.2, 0.55, 0.9, k * 0.34, 'cheek');
  for (const dy of [-0.075, 0.075]) for (const dz of [-0.09, 0.09]) { cyl(t, s.gunmetal, 0.035, 1.5, 1.3, 0.92 + dy, dz, 'x', 'barrel'); cyl(t, s.gunmetal, 0.05, 0.14, 2.06, 0.92 + dy, dz, 'x', 'flashhider'); }
  box(t, s.gunmetal, 0.3, 0.3, 0.34, 0.5, 0.92, 0, 'breech');
  cyl(t, s.gunmetal, 0.04, 0.3, -0.45, 1.16, 0, 'y', 'radarpost'); const dish = ball(t, s.steel, 0.3, 0.1, 0.3, -0.45, 1.34, 0, 'radar', s.dome); dish.rotation.z = -0.5;
  box(t, P.id, 0.5, 0.02, 0.7, -0.05, 1.02, 0, 'idpanel');
  return { g, body: b, turret: t, turretX: -1.0, muzzle: 2.2, muzzleY: 1.55 };
}
// Shahed-136: 3.5 m long, 2.5 m span. A cropped delta wing blended into a round body, a fin above and below each
// wingtip, a small piston engine and a two-blade pusher propeller at the back. Built once and used twice: flying
// (the drone unit) and sitting on the launch rack in the truck.
export const SHAHED = { length: 3.5, span: 2.5, scale: 0.9 };
function shahedShape(b, P, K, withProp) {
  const s = shared(), L = +(SHAHED.length * K).toFixed(3), h = +(SHAHED.span / 2 * K).toFixed(3), r = +(0.2 * K).toFixed(3);
  prism(b, s.shahed, [[L * 0.22, 0], [-L * 0.42, h], [-L * 0.5, h], [-L * 0.5, -h], [-L * 0.42, -h]], +(0.08 * K).toFixed(3), 'plan', 0, 0, 0, 'wing');
  cyl(b, s.shahed, r, +(L * 0.6).toFixed(3), -L * 0.02, 0.02 * K, 0, 'x', 'fuselage'); taper(b, s.shahed, +(0.04 * K).toFixed(3), r, +(L * 0.22).toFixed(3), +(L * 0.39).toFixed(3), 0.02 * K, 0, 'nose');
  for (const k of [-1, 1]) box(b, s.shahed, L * 0.17, 0.56 * K, 0.04 * K, -L * 0.41, 0, k * h, 'tipfin');
  box(b, s.gunmetal, 0.3 * K, 0.26 * K, 0.3 * K, -L * 0.36, 0.05 * K, 0, 'engine');
  box(b, P.id, 0.5 * K, 0.02 * K, 0.6 * K, -L * 0.3, 0.05 * K, h * 0.55, 'idpanel'); box(b, P.id, 0.5 * K, 0.02 * K, 0.6 * K, -L * 0.3, 0.05 * K, -h * 0.55, 'idpanel');
  if (!withProp) return null;
  const prop = grp(b, -L * 0.5 - 0.06, 0.05 * K, 0, 'prop'); box(prop, s.wood, 0.03, 0.9 * K, 0.09, 0, 0, 0, 'propblade');
  return prop;
}
function shahed(P) {
  const g = new THREE.Group(), b = grp(g), prop = shahedShape(b, P, SHAHED.scale, true);
  return { g, body: b, prop, muzzle: 0, muzzleY: 0 };
}
// Shahed Launcher: a three-axle truck carrying a shipping container that hides a launch rack. To fire, the container
// tips up at the front on a hinge at its back end (`bed`, raised by the view), its two roof leaves swing open
// (`roof`), and the drones leave from the top, up and backward over the tail: so the truck has to stand with its
// tail to the target. Three drones sit nose-up on their rails, one behind the other (`rack`: one node each, taken
// off as they fly, rearmost first).
function shahedtruck(P) {
  const s = shared(), g = new THREE.Group(), b = grp(g);
  for (const x of [2.3, -1.0, -2.1]) for (const k of [-1, 1]) wheel(b, 0.46, 0.34, x, 0.46, k * 0.86);
  box(b, s.gunmetal, 6.5, 0.2, 1.3, 0, 0.78, 0, 'chassis');
  prism(b, P.hull, [[1.55, 0.86], [3.2, 0.86], [3.2, 1.6], [2.9, 2.3], [1.55, 2.3]], 2.0, 'side', 0, 0, 0, 'cab');
  box(b, s.glass, 0.04, 0.62, 1.8, 3.07, 1.95, 0, 'windshield').rotation.z = 0.4; for (const k of [-1, 1]) box(b, s.glass, 0.7, 0.5, 0.03, 2.3, 1.9, k * 1.0, 'window');
  box(b, s.gunmetal, 0.1, 0.3, 2.0, 3.24, 0.8, 0, 'bumper'); box(b, s.gunmetal, 0.05, 0.5, 1.3, 3.22, 1.25, 0, 'grille');
  const C = { x0: -3.25, x1: 1.35, y0: 0.9, h: 2.1, w: 2.04 }, len = C.x1 - C.x0, mid = len / 2;
  for (const k of [-1, 1]) cyl(b, s.steel, 0.07, 1.5, C.x1 - 1.3, C.y0 - 0.02, k * 0.5, 'x', 'liftram');       // the hydraulic rams that raise it
  const bed = grp(b, C.x0, C.y0, 0, 'bed');                                                                  // hinged at the tail: x runs forward from the hinge
  box(bed, P.dark, len, 0.1, C.w, mid, 0, 0, 'containerfloor'); box(bed, P.hull, 0.08, C.h, C.w, len - 0.04, C.h / 2, 0, 'containerfront'); box(bed, P.hull, 0.08, C.h, C.w, 0.04, C.h / 2, 0, 'containerback');
  for (const k of [-1, 1]) { box(bed, P.hull, len, C.h, 0.08, mid, C.h / 2, k * (C.w / 2 - 0.04), 'containerside'); for (let i = 0; i < 7; i++) box(bed, P.dark, 0.08, C.h - 0.2, 0.04, 0.4 + i * 0.63, C.h / 2, k * (C.w / 2 + 0.01), 'rib'); }
  const roof = [-1, 1].map(k => { const r = grp(bed, mid, C.h, k * (C.w / 2 - 0.04), 'roofleaf'); box(r, P.hull, len, 0.07, C.w / 2 - 0.03, 0, 0.035, -k * (C.w / 4), 'containerroof'); box(r, P.id, 1.3, 0.03, 0.42, 0, 0.085, -k * 0.3, 'idpanel'); return r; });
  const rack = [0, 1, 2].map((i) => { const x = 0.75 + i * 1.3, d = grp(bed, x, 0.62, 0, 'rackdrone'); d.rotation.y = Math.PI; d.rotation.z = -0.6;   // nose toward the tail and up
    box(bed, s.steel, 1.9, 0.06, 0.06, x, 0.34, 0.5, 'rail').rotation.z = 0.6; box(bed, s.steel, 1.9, 0.06, 0.06, x, 0.34, -0.5, 'rail').rotation.z = 0.6; shahedShape(d, P, 0.62, false); return d; });
  return { g, body: b, bed, roof, rack, muzzle: -3.4, muzzleY: 3.0 };
}

// ---------------------------------------------------------------- team marks
// Every unit carries one more element in its owner's colour, sized to stay modest: ground vehicles fly a pennant
// from a whip aerial (and their roof panels are a little larger), fixed-wing aircraft have a band at each wingtip,
// helicopters a band round the tail boom, ships a funnel band and a masthead pennant. The marks are placed from the
// model's own measurements, so nothing has to be kept in step by hand. Mesh name: 'teammark'.
function partBox(o) { // half-sizes of one mesh in its parent's frame (rotations other than a cylinder's axis are ignored: close enough to place a mark)
  const g = o.geometry, sc = o.scale, S = shared();
  if (o.userData.profile) { const p = o.userData.profile, xs = p.map(q => q[0]), ys = p.map(q => q[1]), cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2, hx = (Math.max(...xs) - Math.min(...xs)) / 2, hy = (Math.max(...ys) - Math.min(...ys)) / 2, hd = o.userData.depth / 2;
    return o.userData.mode === 'side' ? { ox: cx, oy: cy, oz: 0, hx, hy, hz: hd } : { ox: cx, oy: 0, oz: cy, hx, hy: hd, hz: hy }; }
  if (g === S.box) return { ox: 0, oy: 0, oz: 0, hx: sc.x / 2, hy: sc.y / 2, hz: sc.z / 2 };
  if (g === S.cyl || g === S.cyl8) { const r = sc.x, l = sc.y / 2; return Math.abs(o.rotation.z) > 1 ? { ox: 0, oy: 0, oz: 0, hx: l, hy: r, hz: r } : Math.abs(o.rotation.x) > 1 ? { ox: 0, oy: 0, oz: 0, hx: r, hy: r, hz: l } : { ox: 0, oy: 0, oz: 0, hx: r, hy: l, hz: r }; }
  if (g === S.sph || g === S.dome) return { ox: 0, oy: g === S.dome ? sc.y / 2 : 0, oz: 0, hx: sc.x, hy: g === S.dome ? sc.y / 2 : sc.y, hz: sc.z };
  const q = g.parameters ? [g.parameters.radiusTop, g.parameters.radiusBottom, g.parameters.height] : g.params;   // a taper, lying along X
  if (q && q.length >= 3) { const r = Math.max(q[0], q[1]); return { ox: 0, oy: 0, oz: 0, hx: q[2] / 2, hy: r, hz: r }; }
  return { ox: 0, oy: 0, oz: 0, hx: 0, hy: 0, hz: 0 };
}
function measure(root, skip) { // every mesh under `root`, as a box in root's frame
  const out = [];
  const walk = (o, x, y, z, k) => {
    for (const c of o.children) {
      if (skip.has(c) || !c.visible) continue;
      const px = x + c.position.x * k, py = y + c.position.y * k, pz = z + c.position.z * k;
      if (c.isMesh) { const e = partBox(c); out.push({ o: c, name: c.name, x: px + e.ox * k, y: py + e.oy * k, z: pz + e.oz * k, hx: e.hx * k, hy: e.hy * k, hz: e.hz * k, px, py, pz }); }
      else walk(c, px, py, pz, k * c.scale.x);
    }
  };
  walk(root, 0, 0, 0, 1); return out;
}
function sliceAt(pts, v, axis) { // extent of a convex outline along the other axis where it crosses `v` on `axis`
  let lo = Infinity, hi = -Infinity; const o = 1 - axis;
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; if ((a[axis] - v) * (b[axis] - v) > 0 || a[axis] === b[axis]) continue; const t = (v - a[axis]) / (b[axis] - a[axis]), w = a[o] + (b[o] - a[o]) * t; lo = Math.min(lo, w); hi = Math.max(hi, w); }
  return hi >= lo ? [lo, hi] : null;
}
function pennant(p, P, x, y, z, k = 1) { prism(p, P.id, [[0, 0.17 * k], [0, -0.17 * k], [-0.74 * k, 0]], 0.04, 'side', x, y, z, 'teammark'); }
export function teamMarks(rig, P, d) {
  if (!rig.body || d.infantry || d.radius < 1.2) return rig;
  const s = shared(), b = rig.body, skip = new Set();
  for (const k of ['rotor', 'rotor2', 'rotorTail', 'prop', 'props', 'gear', 'stores', 'tiers', 'addons', 'doors', 'roof', 'rack', 'longbow', 'arm', 'round']) eachRef(rig[k], (o) => skip.add(o));
  const parts = measure(b, skip); if (!parts.length) return rig;
  const top = Math.max(...parts.map(p => p.y + p.hy)), x0 = Math.min(...parts.map(p => p.x - p.hx)), x1 = Math.max(...parts.map(p => p.x + p.hx));
  if (d.ship) {
    const mast = parts.reduce((a, p) => (p.y + p.hy > a.y + a.hy ? p : a));                              // the highest point: fly the pennant from it
    cyl(b, s.gunmetal, 0.03, 1.0, mast.x, top + 0.5, mast.z, 'y', 'pennantstaff'); pennant(b, P, mast.x, top + 0.8, mast.z, 1.7);
    const f = parts.find(p => p.name === 'funnel');
    if (f) { const pr = f.o.userData.profile, y = f.y + f.hy * 0.45, sl = pr && sliceAt(pr, y - f.py, 1), fx0 = sl ? f.px + sl[0] : f.x - f.hx, fx1 = sl ? f.px + sl[1] : f.x + f.hx; box(b, P.id, fx1 - fx0 + 0.08, 0.34, f.hz * 2 + 0.08, (fx0 + fx1) / 2, y, f.z, 'teammark'); }
  } else if (rig.rotor) {
    const tb = parts.find(p => p.name === 'tailboom' && p.o.userData.profile);
    if (tb) { const xm = tb.px + (tb.x - tb.px) - tb.hx * 0.1, sl = sliceAt(tb.o.userData.profile, xm - tb.px, 0); if (sl) box(b, P.id, 0.36, sl[1] - sl[0] + 0.05, tb.hz * 2 + 0.05, xm, tb.py + (sl[0] + sl[1]) / 2, tb.pz, 'teammark'); }
  } else if (d.air) {
    for (const k of [-1, 1]) { // a band over each wingtip
      const tip = parts.reduce((a, p) => (k * p.z + p.hz > k * a.z + a.hz ? p : a)), zt = k * tip.z + tip.hz, pr = tip.o.userData.profile;
      let xa = tip.x - tip.hx, xb = tip.x + tip.hx;
      if (pr && tip.o.userData.mode === 'plan') { const at = pr.filter(q => k * (tip.pz + q[1]) >= zt - 0.03), xs = at.map(q => q[0] + tip.px); if (xs.length) { xa = Math.min(...xs); xb = Math.max(...xs); } }
      const len = Math.max(0.6, xb - xa) + 0.08, w = Math.min(0.5, zt * 0.12);
      box(b, P.id, len, tip.hy * 2 + 0.05, w, (xa + xb) / 2, tip.y, k * (zt - w / 2 - 0.04), 'teammark');
    }
  } else {
    const host = rig.turret || b, an = (rig.turret ? measure(rig.turret, skip) : parts).find(p => p.name === 'antenna');   // a tank's aerial is on its turret
    if (an) pennant(host, P, an.x, an.y + an.hy - 0.2, an.z);
    else { const zs = Math.max(...parts.map(p => Math.abs(p.z) + p.hz)), ax = x0 + (x1 - x0) * 0.2, az = zs * 0.5; cyl(b, s.gunmetal, 0.015, top * 0.6 + 0.85, ax, top * 0.7 + 0.425, az, 'y', 'antenna'); pennant(b, P, ax, top + 0.65, az); }
    b.traverse((o) => { if (o.isMesh && o.name === 'idpanel' && o.geometry === s.box && o.scale.y < o.scale.x && o.scale.y < o.scale.z) { o.scale.x *= 1.3; o.scale.z *= 1.3; } });   // roof panels a little larger
  }
  return rig;
}

// ---------------------------------------------------------------- batch 14: new ground vehicles
// Real sizes in metres (length, width, height to the hull roof) at the ARMOR.K scale the batch 12 vehicles use.
export const ARMOR14 = {
  btr82: { length: 7.65, width: 2.9, height: 2.3, wheels: 8 }, boxer: { length: 7.93, width: 2.99, height: 2.4, wheels: 8 },
  bradley: { length: 6.55, width: 3.28, height: 2.1 }, msta: { length: 7.15, width: 3.38, height: 2.99, gun: 8.0 },
  himars: { length: 7.0, width: 2.4, height: 3.2, rockets: 6 }, t55: { length: 6.45, width: 3.37, height: 2.4 },
};
// An 8x8 carrier. `nose`: side profile of the hull (boat-nosed BTR, wedge-nosed Boxer). The squad rides in the back.
function wheeled8(b, P, A, nose, o = {}) {
  const s = shared(), L = +(A.length * ARMOR.K).toFixed(3), W = +(A.width * ARMOR.K).toFixed(3), top = +(A.height * ARMOR.K).toFixed(3), r = o.wheelR || 0.36;
  prism(b, P.hull, nose(L, top), W - 0.5, 'side', 0, 0, 0, 'hull');
  for (const k of [-1, 1]) { for (let i = 0; i < 4; i++) wheel(b, r, 0.3, L / 2 - 0.75 - i * (L - 1.5) / 3, r, k * (W / 2 - 0.15)); box(b, P.dark, L - 0.5, 0.06, 0.34, 0, r * 2 + 0.06, k * (W / 2 - 0.17), 'fender'); }
  box(b, P.dark, 0.05, top - 0.75, W - 1.0, -L / 2 - 0.01, top * 0.6, 0, 'reardoor');
  return { L, W, top };
}
// BTR-82A: boat-shaped nose, a low flat roof, a small turret well forward with the long 30 mm 2A72, a trim vane, a
// water jet at the back, firing ports down the sides.
function btr82(P) {
  const s = shared(), g = new THREE.Group(), b = grp(g);
  const { L, W, top } = wheeled8(b, P, ARMOR14.btr82, (L, top) => [[L / 2, 0.8], [L / 2 - 0.9, top], [-L / 2, top], [-L / 2, 0.5], [L / 2 - 0.5, 0.42]]);
  box(b, P.dark, 0.05, 0.45, W - 0.8, L / 2 - 0.45, top - 0.24, 0, 'trimvane').rotation.z = -0.6; cyl(b, s.gunmetal, 0.2, 0.22, -L / 2 - 0.06, 0.62, 0, 'x', 'waterjet');
  for (const k of [-1, 1]) { for (const x of [-0.2, -0.9, -1.6]) box(b, s.gunmetal, 0.12, 0.08, 0.03, x, top - 0.3, k * (W / 2 - 0.24), 'firingport'); box(b, s.glass, 0.04, 0.12, 0.3, L / 2 - 0.92, top - 0.1, k * 0.4, 'visionblock'); }
  cyl(b, s.gunmetal, 0.5, 0.05, 0.6, top + 0.02, 0, 'y', 'turretring');
  const t = grp(b, 0.6, top + 0.04, 0, 'turret');
  mesh(t, cached('btr-turret', () => new THREE.CylinderGeometry(0.36, 0.5, 0.36, 12)), P.hull, 'turretshell').position.set(0, 0.18, 0);
  cyl(t, s.gunmetal, 0.03, 1.9, 1.15, 0.22, 0.12, 'x', 'autocannon'); cyl(t, s.gunmetal, 0.02, 0.9, 0.65, 0.2, -0.12, 'x', 'coax'); box(t, s.gunmetal, 0.16, 0.14, 0.16, 0.1, 0.42, -0.2, 'sight');
  box(t, P.id, 0.3, 0.02, 0.3, -0.12, 0.37, 0.05, 'idpanel'); box(b, P.id, 0.7, 0.02, 0.8, -1.3, top + 0.012, 0, 'idpanel');
  return { g, body: b, turret: t, turretX: 0.6, muzzle: 2.2, muzzleY: top + 0.26 };
}
// Boxer: a tall slab-sided hull with a sharply angled nose, a mission module at the back and a remote 30 mm turret.
function boxer(P) {
  const s = shared(), g = new THREE.Group(), b = grp(g);
  const { L, W, top } = wheeled8(b, P, ARMOR14.boxer, (L, top) => [[L / 2, 0.95], [L / 2 - 1.5, top], [-L / 2, top], [-L / 2, 0.55], [L / 2 - 0.4, 0.5]], { wheelR: 0.4 });
  box(b, P.hull, 2.5, 0.16, W - 0.56, -L / 2 + 1.3, top + 0.08, 0, 'missionmodule'); box(b, s.glass, 0.05, 0.14, 0.5, L / 2 - 1.25, top - 0.08, -0.35, 'visionblock').rotation.z = 0.6;
  for (const k of [-1, 1]) box(b, P.dark, 3.2, 0.5, 0.05, -0.4, 0.95, k * (W / 2 - 0.24), 'sidearmor');
  const t = grp(b, 0.0, top + 0.17, 0, 'turret'); cyl(t, s.gunmetal, 0.5, 0.06, 0, 0.03, 0, 'y', 'turretring');
  prism(t, P.hull, [[0.8, 0], [0.5, 0.44], [-0.7, 0.44], [-0.7, 0]], 0.9, 'side', 0, 0.05, 0, 'turretshell');
  cyl(t, s.gunmetal, 0.035, 1.8, 1.5, 0.3, 0, 'x', 'autocannon'); cyl(t, s.gunmetal, 0.06, 0.2, 2.35, 0.3, 0, 'x', 'muzzle'); box(t, s.gunmetal, 0.2, 0.2, 0.2, -0.2, 0.6, 0.25, 'sight');
  for (const k of [-1, 1]) box(t, s.gunmetal, 0.3, 0.12, 0.08, -0.4, 0.3, k * 0.5, 'smoke');
  box(t, P.id, 0.4, 0.02, 0.4, -0.25, 0.5, -0.15, 'idpanel');
  return { g, body: b, turret: t, turretX: 0, muzzle: 2.45, muzzleY: top + 0.5 };
}
// M2A3 Bradley: a tall tracked hull with a sloped front, six road wheels, a two-man turret offset to the right with
// the 25 mm Bushmaster, the twin TOW launcher box on the turret's left side, and a ramp at the back.
function bradley(P) {
  const s = shared(), g = new THREE.Group(), b = grp(g), A = ARMOR14.bradley, L = A.length * ARMOR.K, W = A.width * ARMOR.K, deck = +(A.height * ARMOR.K).toFixed(3);
  trackedHull(b, P, L, W, deck, { wheels: 6, skirt: 0.4, glacis: 1.5, nose: 0.8 });
  box(b, P.dark, 0.06, deck - 0.55, W - 1.0, -L / 2 - 0.01, deck * 0.62, 0, 'ramp'); box(b, P.dark, 0.9, 0.03, 0.8, L / 2 - 1.2, deck - 0.14, -0.4, 'driverhatch').rotation.z = -0.36;
  for (const k of [-1, 1]) for (let i = 0; i < 4; i++) box(b, P.hull, 0.9, 0.36, 0.05, -L / 2 + 0.6 + i * 0.95, deck - 0.36, k * (W / 2 + 0.04), 'armortile');
  cyl(b, s.gunmetal, 0.72, 0.05, -0.1, deck + 0.025, 0.1, 'y', 'turretring');
  const t = grp(b, -0.1, deck + 0.04, 0.1, 'turret');
  prism(t, P.hull, [[0.95, -0.4], [0.95, 0.4], [0.5, 0.7], [-0.8, 0.7], [-0.8, -0.7], [0.5, -0.7]], 0.56, 'plan', 0, 0.28, 0, 'turretshell');
  cyl(t, s.gunmetal, 0.04, 1.7, 1.75, 0.3, 0.05, 'x', 'autocannon'); cyl(t, s.gunmetal, 0.06, 0.24, 2.6, 0.3, 0.05, 'x', 'muzzle'); box(t, s.gunmetal, 0.3, 0.2, 0.2, 0.9, 0.3, 0.05, 'mantlet');
  box(t, P.dark, 1.1, 0.4, 0.3, 0.05, 0.42, -0.86, 'towlauncher'); for (const dy of [-0.09, 0.09]) cyl(t, s.gunmetal, 0.07, 0.06, 0.62, 0.42 + dy, -0.86, 'x', 'towtube');
  box(t, s.gunmetal, 0.3, 0.3, 0.26, -0.3, 0.7, 0.3, 'commandersight'); cyl(t, s.gunmetal, 0.012, 0.9, -0.7, 1.0, -0.5, 'y', 'antenna');
  box(t, P.id, 0.45, 0.02, 0.45, 0.1, 0.572, -0.1, 'idpanel');
  return { g, body: b, turret: t, turretX: -0.1, muzzle: 2.7, muzzleY: deck + 0.34 };
}
// 2S19 Msta-S: a T-80 hull under a very large, tall turret with the long 152 mm gun (double-baffle muzzle brake) and
// the anti-aircraft machine gun on the roof.
function msta(P) {
  const s = shared(), g = new THREE.Group(), b = grp(g), A = ARMOR14.msta, L = A.length * ARMOR.K, W = A.width * ARMOR.K, deck = 1.02;
  trackedHull(b, P, L, W, deck, { wheels: 6, skirt: 0.2, glacis: 1.2 });
  box(b, P.dark, 1.4, 0.03, W - 1.2, -L / 2 + 0.9, deck + 0.012, 0, 'enginedeck'); box(b, s.gunmetal, 0.12, 0.5, 0.26, L / 2 - 0.5, deck + 0.24, 0, 'travellock');
  const t = grp(b, -0.2, deck + 0.02, 0, 'turret');
  prism(t, P.hull, [[1.5, 0.1], [1.2, 1.15], [-1.7, 1.25], [-1.7, 0]], W - 0.36, 'side', 0, 0, 0, 'turretshell');
  const gl = A.gun * ARMOR.K, brl = grp(t, 1.4, 0.66, 0, 'gun'); brl.rotation.z = 0.08;
  cyl(brl, s.gunmetal, 0.08, gl, gl / 2, 0, 0, 'x', 'barrel'); for (const x of [gl - 0.12, gl - 0.42]) cyl(brl, s.gunmetal, 0.14, 0.2, x, 0, 0, 'x', 'muzzlebrake'); cyl(brl, s.gunmetal, 0.12, 0.8, 0.5, 0, 0, 'x', 'recuperator'); cyl(brl, s.gunmetal, 0.11, 0.5, gl * 0.55, 0, 0, 'x', 'evacuator');
  cyl(t, P.dark, 0.3, 0.14, -0.6, 1.3, -0.5, 'y', 'cupola'); box(t, s.gunmetal, 0.4, 0.08, 0.08, -0.5, 1.46, -0.5, 'aamg'); cyl(t, s.gunmetal, 0.018, 0.7, 0.0, 1.47, -0.5, 'x', 'aamg');
  for (const k of [-1, 1]) box(t, P.dark, 1.5, 0.5, 0.06, -0.7, 0.6, k * (W / 2 - 0.16), 'stowage'); box(t, P.dark, 0.3, 0.6, W - 0.8, -1.8, 0.6, 0, 'ammohatch');
  box(t, P.id, 0.6, 0.02, 0.6, 0.2, 1.23, 0.2, 'idpanel');
  return { g, body: b, turret: t, turretX: -0.2, muzzle: 1.4 + gl, muzzleY: deck + 1.1 };
}
// M142 HIMARS: a three-axle truck with an armoured, slatted cab and one six-rocket pod on a launcher that lifts at
// the back (`arm`, raised by the view while it sets up; `round`: the rockets in the pod, gone until it is reloaded).
function himars(P) {
  const s = shared(), g = new THREE.Group(), b = grp(g), A = ARMOR14.himars, L = +(A.length * ARMOR.K).toFixed(3), W = +(A.width * ARMOR.K).toFixed(3);
  for (const x of [L / 2 - 0.75, -L / 2 + 1.45, -L / 2 + 0.6]) for (const k of [-1, 1]) wheel(b, 0.4, 0.3, x, 0.4, k * (W / 2 - 0.12));
  box(b, s.gunmetal, L, 0.18, W - 0.6, 0, 0.74, 0, 'chassis');
  prism(b, P.hull, [[L / 2 - 1.5, 0.82], [L / 2, 0.82], [L / 2, 1.3], [L / 2 - 0.35, 1.85], [L / 2 - 1.5, 1.85]], W - 0.1, 'side', 0, 0, 0, 'cab');
  box(b, s.glass, 0.04, 0.4, W - 0.4, L / 2 - 0.2, 1.6, 0, 'windshield').rotation.z = 0.56; for (let i = 0; i < 4; i++) box(b, s.gunmetal, 0.04, 0.03, W - 0.36, L / 2 - 0.12 - i * 0.06, 1.42 + i * 0.1, 0, 'windowslat');
  cyl(b, s.rubber, 0.36, 0.22, L / 2 - 1.7, 1.2, 0, 'x', 'spare');
  const arm = grp(b, -L / 2 + 0.3, 1.0, 0, 'launcher'); arm.rotation.z = 0.12;
  box(arm, P.dark, 2.5, 0.16, W - 0.2, 1.25, 0, 0, 'cradle'); box(arm, P.hull, 2.4, 0.74, W - 0.3, 1.25, 0.46, 0, 'pod'); box(arm, P.id, 0.8, 0.02, 0.8, 1.2, 0.84, 0, 'idpanel');
  const round = grp(arm, 0, 0, 0, 'round'); for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) cyl(round, s.white, 0.1, 0.1, 2.48, 0.28 + r * 0.34, (c - 1) * 0.36, 'x', 'rocket');   // six rocket noses in the pod's face
  return { g, body: b, arm, round, muzzle: -0.6, muzzleY: 2.2 };
}
// Captured T-55: the same family as the Battlemaster (a Type 59 is a T-54 built in China): low hull, round cast
// turret, 100 mm gun with its fume extractor at the muzzle. No reactive armour; a stowage box and a tarpaulin.
function t55(P) {
  const r = sovietTank(P, false, false, false); r.body.scale.setScalar(0.8); r.muzzle *= 0.8; r.muzzleY *= 0.8;
  box(r.turret, shared().canvas, 0.7, 0.2, 0.9, -1.05, 0.5, 0, 'tarpaulin');
  return r;
}
// PGZ-09: twin 35 mm guns either side of a boxy turret, tracking radar on the front, search radar at the back: the
// same layout as the Gepard it answers.
function pgz09(P) { const r = gepard(P); box(r.turret, P.dark, 0.5, 0.5, 1.2, -1.1, 0.5, 0, 'bustle'); for (const k of [-1, 1]) box(r.turret, shared().gunmetal, 0.5, 0.2, 0.2, -0.3, 1.05, k * 0.5, 'smoke'); return r; }
// ZBD-04A: the BMP-3's turret (100 mm gun with a 30 mm cannon beside it) on a Chinese hull with add-on side armour.
function zbd04(P) { const r = bmp3(P), s = shared(); for (const k of [-1, 1]) { box(r.body, P.dark, 3.2, 0.42, 0.06, 0.1, 0.98, k * 1.02, 'sidearmor'); box(r.turret, s.gunmetal, 0.3, 0.2, 0.3, -0.5, 0.42, k * 0.55, 'smoke'); } box(r.turret, P.dark, 0.5, 0.3, 0.9, -0.85, 0.2, 0, 'bustle'); return r; }

// ---------------------------------------------------------------- batch 14: new aircraft
// Su-25 Frogfoot: 15.5 m long, 14.4 m span. A shoulder wing with almost no sweep and a pod at each tip, two engines
// in long nacelles against the fuselage sides, a single tall fin, a blunt nose with the laser window, ten pylons.
export const FROGFOOT = { length: 15.53, span: 14.36, scale: 0.6, pylons: 10 };
function su25(P) {
  const s = shared(), g = new THREE.Group(), b = grp(g), F = FROGFOOT, K = F.scale, L = +(F.length * K).toFixed(3), h = +(F.span / 2 * K).toFixed(3), skin = s.su27Dark;
  cyl(b, skin, 0.5, L * 0.68, 0.1, 0, 0, 'x', 'fuselage'); taper(b, skin, 0.24, 0.5, 1.5, L * 0.34 + 0.85, -0.04, 0, 'nose'); taper(b, skin, 0.5, 0.2, 1.4, -L * 0.34 - 0.5, 0.06, 0, 'tailcone');
  box(b, s.glass, 0.1, 0.16, 0.2, L * 0.34 + 1.62, -0.06, 0, 'laserwindow'); ball(b, s.glass, 0.7, 0.36, 0.36, L * 0.2, 0.44, 0, 'canopy');
  for (const k of [-1, 1]) {
    prism(b, skin, [[1.1, k * 0.45], [0.3, k * h], [-0.9, k * h], [-1.5, k * 0.45]], 0.14, 'plan', 0, 0.3, 0, 'wing');
    cyl(b, skin, 0.15, 1.5, -0.3, 0.3, k * (h + 0.1), 'x', 'tippod');
    cyl(b, skin, 0.38, L * 0.46, -0.6, -0.1, k * 0.62, 'x', 'engine'); cyl(b, s.track, 0.3, 0.06, -0.6 + L * 0.23, -0.1, k * 0.62, 'x', 'intake'); cyl(b, s.gunmetal, 0.28, 0.3, -0.6 - L * 0.23 - 0.1, -0.1, k * 0.62, 'x', 'nozzle');
    prism(b, skin, [[-L * 0.34 - 0.2, k * 0.2], [-L * 0.34 - 0.7, k * 1.7], [-L * 0.34 - 1.3, k * 1.7], [-L * 0.34 - 1.1, k * 0.2]], 0.08, 'plan', 0, 0.3, 0, 'tailplane');
    for (let i = 0; i < 5; i++) box(b, s.greyDark, 0.5, 0.12, 0.06, -0.3, 0.2, k * (1.0 + i * 0.72), 'pylon');
  }
  prism(b, skin, [[-L * 0.34 + 0.6, 0.4], [-L * 0.34 - 0.9, 1.9], [-L * 0.34 - 1.4, 1.9], [-L * 0.34 - 1.2, 0.3]], 0.1, 'side', 0, 0, 0, 'fin'); box(b, P.id, 0.5, 0.3, 0.12, -L * 0.34 - 0.75, 1.3, 0, 'idpanel');
  const stores = [];   // sixteen rockets in four pods: one pod comes off the view for every four fired
  for (const z of [1.72, 2.44]) for (const k of [1, -1]) { const st = grp(b, -0.3, 0.04, k * z, 'store'); cyl(st, s.ordnance, 0.14, 1.2, 0, 0, 0, 'x', 'rocketpod'); cyl(st, s.gunmetal, 0.1, 0.04, 0.62, 0, 0, 'x', 'podface'); stores.push(st, st, st, st); }
  const gear = grp(b, 0, 0, 0, 'gear'); cyl(gear, s.steel, 0.045, 0.6, L * 0.28, -0.72, 0, 'y', 'strut'); cyl(gear, s.rubber, 0.17, 0.12, L * 0.28, -1.04, 0, 'z', 'wheel');
  for (const k of [-1, 1]) { cyl(gear, s.steel, 0.05, 0.56, -0.5, -0.72, k * 0.95, 'y', 'strut'); cyl(gear, s.rubber, 0.22, 0.15, -0.5, -1.0, k * 0.95, 'z', 'wheel'); }
  return { g, body: b, gear, stores, ground: 1.22, muzzle: L * 0.5, muzzleY: -0.2 };
}
// Transport helicopters: a wide cabin under one main rotor, a tail boom with a tail rotor, fixed wheels.
//   Mi-8: 18.2 m fuselage, 21.3 m five-blade rotor, a round glazed nose, twin engines above the cabin, clamshell
//         doors at the back, an outrigger each side carrying rocket pods.
//   NH90: 16.1 m fuselage, 16.3 m four-blade rotor, a smooth pointed nose, sponsons low on the sides, a ramp.
export const MI8 = { scale: 0.4, fuselage: 18.2, rotor: 21.3, blades: 5 }, NH90 = { scale: 0.42, fuselage: 16.1, rotor: 16.3, blades: 4 };
function transportHeli(P, H, o) {
  const s = shared(), g = new THREE.Group(), b = grp(g), K = H.scale, L = +(H.fuselage * K).toFixed(3), R = +(H.rotor / 2 * K).toFixed(3), cab = L * 0.55, x1 = L * 0.34, skin = o.skin || P.hull;
  prism(b, skin, o.nose ? [[x1 + 0.9, -0.2], [x1 + 0.2, 0.62], [x1 - cab, 0.72], [x1 - cab - 0.6, 0.2], [x1 - cab, -0.62], [x1 + 0.3, -0.62]] : [[x1 + 0.55, -0.3], [x1 + 0.4, 0.3], [x1 - 0.1, 0.72], [x1 - cab, 0.72], [x1 - cab - 0.5, 0.1], [x1 - cab, -0.62], [x1 + 0.2, -0.62]], o.width, 'side', 0, 0, 0, 'cabin');
  ball(b, s.glass, 0.5, 0.42, o.width / 2 - 0.04, x1 + 0.3, 0.1, 0, 'cockpit'); for (const k of [-1, 1]) for (let i = 0; i < 3; i++) cyl(b, s.glass, 0.14, 0.03, x1 - 1.0 - i * 0.9, 0.22, k * (o.width / 2), 'z', 'window');
  for (const k of [-1, 1]) { cyl(b, P.dark, 0.24, 1.6, x1 - 1.2, 0.9, k * 0.3, 'x', 'engine'); box(b, s.gunmetal, 0.3, 0.2, 0.2, x1 - 2.1, 0.92, k * 0.34, 'exhaust'); }
  const bx = x1 - cab - 0.3, tail = -L * 0.66;
  prism(b, skin, [[bx, 0.62], [tail, 0.5], [tail, 0.28], [bx, -0.1]], 0.3, 'side', 0, 0, 0, 'tailboom');
  prism(b, skin, [[tail + 0.5, 0.4], [tail - 0.5, 1.6], [tail - 0.9, 1.6], [tail - 0.3, 0.28]], 0.1, 'side', 0, 0, 0, 'fin'); box(b, skin, 0.5, 0.04, 1.6, tail + 0.4, 0.4, 0, 'stabilizer');
  box(b, P.id, 0.34, 0.24, 0.12, tail - 0.35, 1.0, 0, 'idpanel');
  for (const k of [-1, 1]) {
    if (o.outriggers) { box(b, s.gunmetal, 0.2, 0.06, 1.2, x1 - 1.6, -0.2, k * (o.width / 2 + 0.5), 'outrigger'); cyl(b, s.ordnance, 0.16, 1.0, x1 - 1.6, -0.34, k * (o.width / 2 + 0.9), 'x', 'rocketpod'); }
    else box(b, skin, 1.8, 0.34, 0.3, x1 - 1.8, -0.5, k * (o.width / 2 + 0.05), 'sponson');
    cyl(b, s.steel, 0.04, 0.5, x1 - 1.7, -0.8, k * (o.width / 2 + (o.outriggers ? 0.2 : 0.05)), 'y', 'gearstrut'); cyl(b, s.rubber, 0.2, 0.15, x1 - 1.7, -1.05, k * (o.width / 2 + (o.outriggers ? 0.2 : 0.05)), 'z', 'wheel');
  }
  cyl(b, s.steel, 0.04, 0.5, x1 + 0.1, -0.8, 0, 'y', 'nosestrut'); cyl(b, s.rubber, 0.17, 0.14, x1 + 0.1, -1.05, 0, 'z', 'nosewheel');
  box(b, P.dark, 0.05, 0.9, o.width - 0.2, x1 - cab - 0.28, -0.05, 0, o.outriggers ? 'clamshell' : 'ramp').rotation.z = 0.5;
  cyl(b, s.gunmetal, 0.08, 0.4, x1 - 1.3, 1.1, 0, 'y', 'mast');
  const rotor = grp(b, x1 - 1.3, 1.32, 0, 'rotor'); cyl(rotor, s.gunmetal, 0.2, 0.1, 0, 0, 0, 'y', 'hub');
  for (let i = 0; i < H.blades; i++) { const arm = grp(rotor); arm.rotation.y = i * Math.PI * 2 / H.blades; box(arm, s.gunmetal, R - 0.15, 0.03, 0.24, (R + 0.15) / 2, 0, 0, 'blade'); }
  const rotorTail = grp(b, tail - 0.7, 1.4, 0.12, 'tailrotor'); for (let i = 0; i < 2; i++) { const arm = grp(rotorTail); arm.rotation.z = i * Math.PI / 2; box(arm, s.steel, 1.3, 0.07, 0.03, 0, 0, 0, 'tailblade'); }
  return { g, body: b, rotor, rotorTail, ground: 1.25, muzzle: x1 + 0.6, muzzleY: -0.4 };
}
const mi8 = (P) => transportHeli(P, MI8, { width: 1.0, outriggers: true, skin: shared().ka52 }), nh90 = (P) => transportHeli(P, NH90, { width: 0.95, nose: true, skin: shared().tigerGreen });

export const ASSEMBLY = { abrams, battlemaster, overlord: (P) => sovietTank(P, true), technical, scoutcar: scoutCar, comanche, drone, raptor, f15e, j11, lav25, scudtel, fpv, chinook, z10,
  rhib, mkv, frigate, corvette, lcraft, mboat, dboat,
  t90, t14, bmp3, tunguska, tos1, su27, su57, ka52, stereg,
  leopard2, kf51, laserleo, puma, gepard, pzh2000, typhoon, tiger, fremm,
  a10: (P) => a10(P), ac130: (P) => ac130(P), b2: (P) => b2(P), apache, viper, zu23, shahedtruck, shahed,
  btr82, boxer, bradley, msta, himars, t55, pgz09, zbd04, su25, mi8, nh90 };   // the US strike aircraft are units now (their builders are further down: hence the arrows)
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
  const gear = grp(b, 0, 0, 0, 'gear'); gear.visible = false;                                                // down only on the ground (the buildable AC-130)
  cyl(gear, s.steel, 0.06, 0.5, X(4.6), -R - 0.2, 0, 'y', 'strut'); for (const k of [-1, 1]) cyl(gear, s.rubber, 0.24, 0.14, X(4.6), -R - 0.34, k * 0.16, 'z', 'wheel');
  for (const k of [-1, 1]) for (const m of [12.6, 15.0]) cyl(gear, s.rubber, 0.32, 0.3, X(m), -R - 0.26, k * (R - 0.05), 'z', 'wheel');
  return { g, body: b, props, guns, gear, ground: +(R + 0.6).toFixed(3) };
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
  P = { ...P, hull: s.heloBlack, dark: s.heloBlackDark };   // deep black; the team panel keeps its colour
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
// ---------------------------------------------------------------- Xian H-6K (China's Fuel-Air Bomb carrier)
// Real aircraft (metres): 34.8 long, 33.0 span, 10.4 to the top of the fin, fuselage 2.5 across, wings swept 35
// degrees. Shape: solid radome nose, a long tube of a fuselage, the two engines buried in the wing roots with big
// intakes hard against the fuselage sides, swept wings with fences and the main-gear pods on the trailing edge,
// swept tailplane, tall swept fin. `m` values are metres aft of the nose tip; `scale` turns them into game units.
export const H6 = { scale: 0.42, length: 34.8, span: 33.0, height: 10.4, sweep: 35, body: 2.5, tailSpan: 11.8 };
function h6(P) {
  const s = shared(), g = new THREE.Group(), b = grp(g), A = H6, K = A.scale, X = (m) => +((A.length / 2 - m) * K).toFixed(3), R = A.body / 2 * K, half = A.span / 2 * K, tan = Math.tan(A.sweep * Math.PI / 180);
  cyl(b, s.grey, R, (27 - 4) * K, X(15.5), 0, 0, 'x', 'fuselage'); taper(b, s.radome, 0.12, R, 4 * K, X(2), -0.04, 0, 'radome');
  const tl = (A.length - 27) * K, cone = taper(b, s.grey, R, 0.16, tl, X((27 + A.length) / 2), (R - 0.16) / 2, 0, 'afterbody'); cone.rotation.z = -Math.PI / 2 - Math.atan2(R - 0.16, tl);
  box(b, s.glass, 0.7, 0.2, 0.74, X(4.7), R * 0.72, 0, 'windscreen').rotation.z = -0.42;
  box(b, P.id, 2.2, 0.03, 0.8, X(17), R + 0.005, 0, 'idpanel');
  for (const k of [-1, 1]) {
    const ez = k * (R + 0.34);
    cyl(b, s.greyDark, 0.44, 8.6 * K, X(13.7), -0.06, ez, 'x', 'engine'); cyl(b, s.track, 0.37, 0.08, X(9.35), -0.06, ez, 'x', 'intake'); cyl(b, s.gunmetal, 0.3, 0.3, X(18.2), -0.06, ez, 'x', 'jetpipe');
    const le = 11.0, root = R + 0.7, tipLE = le + (A.span / 2 - root / K) * tan;
    prism(b, s.grey, [[X(le), k * root], [X(tipLE), k * half], [X(tipLE + 1.9), k * half], [X(le + 7.4), k * root]], 0.16, 'plan', 0, -0.1, 0, 'wing');
    for (const f of [0.38, 0.68]) { const z = root + (half - root) * f, x = le + (z - root) / K * tan; box(b, s.greyDark, 1.5, 0.2, 0.04, X(x + 1.6), 0.06, k * z, 'fence'); }
    cyl(b, s.grey, 0.24, 2.5, X(19.2), -0.2, k * 3.5 * K * 1.15, 'x', 'gearpod'); taper(b, s.grey, 0.24, 0.05, 0.8, X(19.2) - 1.65, -0.2, k * 3.5 * K * 1.15, 'gearpodtail');
    for (const pz of [0.5, 0.78]) { const z = root + (half - root) * pz, x = le + (z - root) / K * tan; box(b, s.gunmetal, 0.7, 0.2, 0.08, X(x + 2.6), -0.28, k * z, 'pylon'); cyl(b, s.ordnance, 0.13, 2.1, X(x + 2.6), -0.46, k * z, 'x', 'missile'); }
    const tLE = 29.4, th = A.tailSpan / 2 * K;
    prism(b, s.grey, [[X(tLE), k * 0.2], [X(tLE + 3.6), k * th], [X(tLE + 4.8), k * th], [X(tLE + 4.4), k * 0.2]], 0.1, 'plan', 0, 0.28, 0, 'tailplane');
  }
  const top = R + (A.height - 3.2) * K;
  prism(b, s.grey, [[X(26.6), R - 0.1], [X(32.2), top], [X(33.8), top], [X(34.5), R - 0.1]], 0.14, 'side', 0, 0, 0, 'fin'); box(b, s.red, 0.9, 0.5, 0.15, X(32.6), top - 0.5, 0, 'finflash');
  cyl(b, s.ordnance, 0.36, 2.9, X(15.5), -R - 0.24, 0, 'x', 'bomb'); taper(b, s.ordnance, 0.05, 0.36, 0.7, X(15.5) + 1.8, -R - 0.24, 0, 'bombnose');
  return { g, body: b };
}
// The MiG-31 that carries the Kinzhal: drawn with the Flanker builder in plain grey (twin fins, big side-by-side engines), enough for the three seconds it is seen climbing away.
export const MIG31 = { ...FLANKER, skin: 'grey', finMat: 'greyDark', missiles: 0 };
export const AIRCRAFT = { a10, b2, ac130, c130, b737, h6, mig31: (P) => fighter(P, MIG31) };

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
    else if (make) { rig = fromTemplate('a:' + e.type + ':' + e.team, () => { const P = paint(d.faction, e.team); return teamMarks(make(P), P, d); }); rig.source = 'assembly'; }
  }
  if (!rig) { rig = fromTemplate('l:' + e.kind + ':' + e.type + ':' + e.team + ':' + (e.variant || 0), () => legacyModel(e)); rig.source = 'library'; }
  if (rig.legs) for (const l of rig.legs) l.traverse((o) => { if (o.isMesh) o.castShadow = false; });   // a leg's own shadow is not worth a second draw
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
