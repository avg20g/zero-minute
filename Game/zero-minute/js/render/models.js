// Procedural model library: buildings, infantry and support vehicles.
// Combat vehicle and aircraft silhouettes live in modelFactory.js, which is the entry point the view uses.
// The registry's `model` key picks the builder; hull colours come from the
// faction, accent colour from the team. Convention: model forward is +X, so
// group.rotation.y = -facing.
import { TEAM } from '../ui/teamColors.js';
import THREE from '../lib/three.js';
import { CELL } from '../sim/defs.js';
import { UNITS, BLDGS, FACTIONS } from '../sim/factionRegistry.js';
import { std, makeFacadeTexture } from './gfx.js';

let G = null, M = null;
const ACCENT = TEAM.paint; // [you, enemy, neutral], chosen in the lobby (ui/teamColors.js)
function init() {
  if (G) return;
  G = {
    box: new THREE.BoxGeometry(1, 1, 1),
    cyl: new THREE.CylinderGeometry(1, 1, 1, 14),
    cyl8: new THREE.CylinderGeometry(1, 1, 1, 8),
    sph: new THREE.SphereGeometry(1, 12, 8),
    dome: new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    tower: new THREE.CylinderGeometry(0.72, 1, 1, 16, 1, true),
    cone: new THREE.ConeGeometry(1, 1, 12),
    pyr: new THREE.ConeGeometry(1, 1, 4),
  };
  M = {
    fm: {}, glow: ACCENT.map(c => std(c, 0.6, 0.05, { emissive: c, emissiveIntensity: 0.3 })), // building signal lamps only
    tread: std(0x25262a, 0.92, 0.1), steel: std(0x6a7078, 0.45, 0.75), gun: std(0x33373c, 0.5, 0.7),
    glass: std(0x1d2b38, 0.15, 0.6), concrete: std(0xa39c8f, 0.92, 0), slab: std(0x8c857a, 0.95, 0),
    yellow: std(0xd9a21b, 0.6, 0.3), skin: std(0xc49a6c, 0.8, 0), khaki: std(0x8b7d55, 0.9, 0), olive: std(0x565d43, 0.9, 0),
    wood: std(0x9b7648, 0.9, 0), crateA: std(0x8a6a3c, 0.88, 0), crateB: std(0x4c6a58, 0.8, 0.2), crateC: std(0x9c4a32, 0.8, 0.2),
    rubble: std(0x5d564d, 1, 0), rubber: std(0x1b1b1d, 0.95, 0), white: std(0xe6e1d6, 0.8, 0), sandbag: std(0xa8946a, 1, 0),
    tarmac: std(0x4a4c4f, 0.95, 0), dark: std(0x2a2b2e, 0.9, 0.1), ghillie: std(0x5b6a3a, 1, 0), cloth: std(0xb9a98c, 1, 0), red: std(0x9c2f25, 0.8, 0.1),
    toxin: std(0x5f8f3a, 0.75, 0.1),
    laser: std(0x24424f, 0.14, 0.7), // coated optic, not a light source
    salvage: std(0x6a5c40, 0.85, 0.2),
    grey: std(0x80868c, 0.6, 0.5), jet: std(0x8a9096, 0.5, 0.6),
    civ: null,
  };
  // one wall colour per building kind, in the order of CIV_KINDS (sim/map.js); every kind gets its own window texture
  const pal = ['#cdb48c', '#d9d2c2', '#b98f6a', '#a9b3b0', '#8f9aa3', '#e3dccb', '#7a5a3a', '#8a2f24', '#d8d8d2', '#9aa3a8'];
  M.civ = pal.map((c, i) => std(0xffffff, 0.9, 0, { map: makeFacadeTexture(c, [3, 2, 4, 3, 1, 2, 1, 1, 1, 1][i], [5, 6, 4, 5, 6, 4, 3, 4, 3, 2][i], 11 + i * 7) }));
  M.civRoof = pal.map(c => std(new THREE.Color(c).multiplyScalar(0.8).getHex(), 0.95, 0));
}
// Material set for a faction's hull colours with a team's accent.
function mats(faction, team) {
  const key = faction + team;
  if (M.fm[key]) return M.fm[key];
  const F = FACTIONS[faction], accent = ACCENT[team] ?? ACCENT[2];
  return (M.fm[key] = {
    hull: std(F.hull, 0.88, 0.05), dark: std(F.dark, 0.9, 0.05), accent: std(accent, 0.82, 0.02), // matte service paint
    glow: M.glow[team] || M.glow[2], wall: std(F.hull, 0.85, 0.05), roof: std(F.dark, 0.75, 0.2),
  });
}

function add(parent, geo, mat, sx, sy, sz, x, y, z) {
  const m = new THREE.Mesh(geo, mat);
  m.scale.set(sx, sy, sz); m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  parent.add(m); return m;
}
const box = (p, mat, sx, sy, sz, x, y, z) => add(p, G.box, mat, sx, sy, sz, x, y, z);
function cyl(p, mat, r, len, x, y, z, axis = 'y', geo = G.cyl) {
  const m = add(p, geo, mat, r, len, r, x, y, z);
  if (axis === 'x') m.rotation.z = Math.PI / 2; else if (axis === 'z') m.rotation.x = Math.PI / 2;
  return m;
}
function wheels(p, xs, zHalf, r, w) { for (const x of xs) for (const s of [-1, 1]) cyl(p, M.rubber, r, w, x, r, s * zHalf, 'z'); }
function grp(parent, x = 0, y = 0, z = 0) { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; }
function tracks(b, len, zHalf, h = 0.75) {
  for (const s of [-1, 1]) { box(b, M.tread, len, h, 0.62, 0, h * 0.56, s * zHalf); cyl(b, M.gun, h * 0.5, 0.66, len / 2 - 0.3, h * 0.56, s * zHalf, 'z'); cyl(b, M.gun, h * 0.5, 0.66, -len / 2 + 0.3, h * 0.56, s * zHalf, 'z'); }
}

// ---------------- ground vehicles ----------------
function avenger(T) {
  const g = new THREE.Group(), b = grp(g);
  tracks(b, 4.0, 1.0);
  box(b, T.hull, 3.9, 0.6, 1.7, 0, 0.95, 0); box(b, T.dark, 2.6, 0.24, 2.5, 0, 1.05, 0); box(b, T.accent, 0.5, 0.3, 1.72, -1.75, 1.05, 0);
  const t = grp(b, -0.1, 1.3, 0);
  box(t, T.hull, 1.5, 0.7, 1.3, 0, 0.35, 0);
  for (const s of [-1, 1]) { box(t, T.dark, 1.9, 0.42, 0.42, 0.5, 0.55, s * 0.82); cyl(t, M.steel, 0.09, 1.6, 1.8, 0.55, s * 0.82, 'x'); add(t, G.sph, M.laser, 0.16, 0.16, 0.16, 2.65, 0.55, s * 0.82); }
  cyl(t, M.steel, 0.07, 0.7, -0.5, 1.0, 0); add(t, G.dome, M.laser, 0.26, 0.26, 0.26, -0.5, 1.35, 0); // point-defense emitter
  return { g, body: b, turret: t, turretX: -0.1, muzzle: 2.7, muzzleY: 1.9 };
}
function inferno(T) {
  const g = new THREE.Group(), b = grp(g);
  tracks(b, 3.8, 0.95);
  box(b, T.hull, 3.6, 0.5, 1.6, 0, 0.9, 0); box(b, T.dark, 1.2, 0.7, 1.5, -1.1, 1.4, 0); box(b, T.accent, 0.5, 0.3, 1.62, -1.6, 1.0, 0);
  const arm = grp(b, -0.2, 1.3, 0); arm.rotation.z = 0.55;
  cyl(arm, M.gun, 0.2, 3.6, 1.7, 0, 0, 'x'); cyl(arm, M.red, 0.27, 0.6, 3.4, 0, 0, 'x'); box(arm, M.steel, 0.8, 0.5, 0.9, 0.1, 0, 0);
  for (const s of [-1, 1]) cyl(b, M.red, 0.28, 1.0, 0.6, 1.25, s * 0.5, 'x');
  return { g, body: b, muzzle: 3.2, muzzleY: 3.1 };
}
function scorpion(T) {
  const g = new THREE.Group(), b = grp(g);
  tracks(b, 3.6, 0.9, 0.65);
  box(b, T.hull, 3.4, 0.5, 1.5, 0, 0.82, 0); box(b, T.dark, 2.2, 0.2, 2.2, -0.1, 0.9, 0);
  const t = grp(b, 0, 1.08, 0);
  box(t, T.hull, 1.5, 0.5, 1.2, 0, 0.25, 0); cyl(t, M.gun, 0.09, 2.0, 1.8, 0.28, 0, 'x'); add(t, G.sph, M.toxin, 0.14, 0.14, 0.14, 2.8, 0.28, 0);
  box(t, T.dark, 1.1, 0.34, 0.4, 0, 0.5, 0.82); for (const k of [-1, 1]) cyl(t, M.white, 0.08, 0.2, 0.62, 0.5 + k * 0.08, 0.82, 'x');
  box(t, T.accent, 0.7, 0.06, 0.5, -0.3, 0.52, -0.2);
  return { g, body: b, turret: t, turretX: 0, muzzle: 2.9, muzzleY: 1.4 };
}
function buggy(T) {
  const g = new THREE.Group(), b = grp(g);
  wheels(b, [1.1, -1.1], 0.95, 0.46, 0.34);
  box(b, T.hull, 3.0, 0.34, 1.5, 0, 0.62, 0); box(b, T.dark, 1.0, 0.36, 1.4, 1.15, 0.8, 0);
  box(b, M.glass, 0.08, 0.4, 1.2, 0.55, 1.05, 0).rotation.z = 0.35;
  for (const s of [-1, 1]) { cyl(b, M.gun, 0.045, 0.95, -0.1, 1.25, s * 0.68); cyl(b, M.gun, 0.045, 0.95, -1.2, 1.25, s * 0.68); cyl(b, M.gun, 0.045, 1.1, -0.65, 1.72, s * 0.68, 'x'); }
  box(b, T.accent, 0.5, 0.2, 1.52, -1.3, 0.72, 0);
  const t = grp(b, -0.75, 1.3, 0); cyl(t, M.gun, 0.12, 0.5, 0, 0.1, 0);
  const rack = grp(t, 0, 0.45, 0); rack.rotation.z = 0.22;
  for (const s of [-1, 1]) { box(rack, T.dark, 1.5, 0.34, 0.5, 0.15, 0, s * 0.36); for (const k of [-1, 1]) cyl(rack, M.white, 0.085, 0.3, 0.95, k * 0.08, s * 0.36 + k * 0.1, 'x'); }
  return { g, body: b, turret: t, turretX: -0.75, muzzle: 1.3, muzzleY: 1.9 };
}
function tractor(T) {
  const g = new THREE.Group(), b = grp(g);
  wheels(b, [-1.0], 0.95, 0.7, 0.4); wheels(b, [1.2], 0.8, 0.4, 0.3);
  box(b, T.hull, 3.0, 0.5, 1.2, 0.1, 1.0, 0); box(b, T.dark, 1.0, 0.9, 1.1, -0.9, 1.7, 0); box(b, M.glass, 1.02, 0.4, 1.12, -0.9, 1.85, 0);
  cyl(b, M.toxin, 0.55, 1.5, 0.8, 1.7, 0, 'x'); box(b, T.accent, 0.2, 0.2, 1.22, -1.5, 1.2, 0);
  const t = grp(b, 1.4, 1.6, 0); cyl(t, M.steel, 0.07, 1.3, 0.6, 0.2, 0, 'x'); add(t, G.cone, M.toxin, 0.16, 0.3, 0.16, 1.3, 0.2, 0).rotation.z = -Math.PI / 2;
  return { g, body: b, turret: t, turretX: 1.4, muzzle: 1.5, muzzleY: 1.8 };
}
function dozer(T) {
  const g = new THREE.Group(), b = grp(g);
  for (const s of [-1, 1]) box(b, M.tread, 2.9, 0.8, 0.55, -0.2, 0.42, s * 0.92);
  box(b, M.yellow, 2.5, 0.75, 1.3, -0.25, 1.0, 0); box(b, M.yellow, 1.1, 0.95, 1.2, -0.75, 1.8, 0);
  box(b, M.glass, 1.12, 0.5, 1.22, -0.75, 1.95, 0); box(b, T.accent, 1.16, 0.12, 1.26, -0.75, 2.32, 0);
  cyl(b, M.gun, 0.07, 0.9, 0.55, 1.75, 0.45);
  const blade = grp(b, 1.3, 0.55, 0);
  box(blade, M.steel, 0.16, 0.95, 2.4, 0.3, 0, 0).rotation.z = -0.18;
  for (const s of [-1, 1]) box(blade, M.gun, 0.9, 0.14, 0.14, -0.2, 0.05, s * 0.75);
  return { g, body: b, blade };
}
function truck(T) {
  const g = new THREE.Group(), b = grp(g);
  wheels(b, [1.15, -0.45, -1.25], 0.82, 0.4, 0.3);
  box(b, M.gun, 3.4, 0.2, 1.4, 0, 0.62, 0);
  box(b, T.hull, 1.0, 1.0, 1.6, 1.15, 1.2, 0); box(b, M.glass, 0.06, 0.42, 1.4, 1.66, 1.42, 0); box(b, T.accent, 1.02, 0.12, 1.62, 1.15, 1.74, 0);
  box(b, T.dark, 2.2, 0.12, 1.7, -0.6, 0.78, 0);
  for (const s of [-1, 1]) box(b, T.dark, 2.2, 0.4, 0.08, -0.6, 1.0, s * 0.82);
  const cargo = grp(b);
  box(cargo, M.crateA, 1.0, 0.8, 1.3, -0.05, 1.25, 0); box(cargo, M.crateB, 0.95, 0.65, 1.3, -1.1, 1.17, 0); box(cargo, M.crateC, 0.8, 0.45, 0.9, -0.5, 1.88, 0.1);
  return { g, body: b, cargo };
}

// ---------------- aircraft ----------------
function jet(T, big) { // MiG and off-map aircraft
  const g = new THREE.Group(), b = grp(g), s = big ? 1.5 : 1;
  cyl(b, T.hull, 0.48 * s, 5.2 * s, 0, 0, 0, 'x'); add(b, G.cone, T.hull, 0.48 * s, 1.6 * s, 0.48 * s, 3.4 * s, 0, 0).rotation.z = -Math.PI / 2;
  box(b, M.glass, 1.0 * s, 0.3 * s, 0.5 * s, 1.5 * s, 0.42 * s, 0);
  for (const k of [-1, 1]) { const w = box(b, T.dark, 2.2 * s, 0.1, 3.0 * s, -0.5 * s, -0.05, k * 1.7 * s); w.rotation.y = k * (big ? 0.1 : 0.45); cyl(b, M.gun, 0.12 * s, 1.4 * s, -0.3 * s, -0.3, k * 1.5 * s, 'x'); }
  box(b, T.dark, 1.1 * s, 1.3 * s, 0.1, -2.2 * s, 0.7 * s, 0); box(b, T.accent, 0.5 * s, 0.3 * s, 0.12, -2.4 * s, 1.2 * s, 0);
  for (const k of [-1, 1]) box(b, T.dark, 0.9 * s, 0.08, 1.1 * s, -2.3 * s, 0.05, k * 0.7 * s);
  if (big) for (const k of [-1, 1]) cyl(b, M.grey, 0.4, 1.6, -1.0, 0.75, k * 0.95, 'x');
  const gear = big ? null : landingGear(b, -0.7, 0.75, 2.2, 0.45);
  return { g, body: b, gear, ground: 1.45, muzzle: 3.5, muzzleY: -0.3 };
}
// Tricycle landing gear: two main legs and a nose leg. Returned as a group so the view can retract it in flight.
function landingGear(b, mainX, mainZ, noseX, belly) {
  const w = grp(b);
  for (const k of [-1, 1]) { cyl(w, M.steel, 0.05, 0.6, mainX, -belly - 0.25, k * mainZ); cyl(w, M.rubber, 0.2, 0.14, mainX, -belly - 0.6, k * mainZ, 'z'); }
  cyl(w, M.steel, 0.05, 0.6, noseX, -belly - 0.25, 0); cyl(w, M.rubber, 0.17, 0.12, noseX, -belly - 0.62, 0, 'z');
  return w;
}
// Hind: armoured gunship with stepped "double bubble" canopies, troop cabin, drooped stub wings with
// rocket pods, 5-blade main rotor, 3-blade tail rotor, chin gun, fixed wheels.
function hind(T) {
  const g = new THREE.Group(), b = grp(g);
  box(b, T.hull, 4.2, 1.3, 1.3, 0.1, 0, 0); add(b, G.cone, T.hull, 0.6, 1.4, 0.6, 2.9, -0.15, 0).rotation.z = -Math.PI / 2;
  add(b, G.sph, M.glass, 0.52, 0.42, 0.5, 2.2, 0.38, 0); add(b, G.sph, M.glass, 0.56, 0.48, 0.54, 1.3, 0.72, 0);      // gunner in front, pilot stepped up behind
  box(b, T.dark, 2.0, 0.5, 1.0, -0.1, 0.85, 0); for (const k of [-1, 1]) cyl(b, M.gun, 0.2, 0.7, -1.2, 0.85, k * 0.3, 'x'); // engines and exhausts
  box(b, T.hull, 3.6, 0.45, 0.4, -3.6, 0.35, 0).rotation.z = 0.08; box(b, T.hull, 0.7, 1.5, 0.1, -5.2, 1.1, 0).rotation.z = 0.5; // tail boom and fin
  box(b, T.accent, 0.5, 0.3, 0.12, -5.0, 1.2, 0); box(b, T.dark, 0.6, 0.06, 1.6, -4.7, 0.5, 0);
  for (const k of [-1, 1]) {
    box(b, T.dark, 1.0, 0.1, 1.9, 0, -0.1, k * 1.5).rotation.x = k * 0.2;                                          // drooped stub wing
    cyl(b, M.gun, 0.2, 1.2, 0.1, -0.45, k * 1.5, 'x'); cyl(b, M.gun, 0.16, 1.0, 0.1, -0.55, k * 2.2, 'x');           // rocket pods
    cyl(b, M.steel, 0.05, 0.5, 0.3, -0.85, k * 0.7); cyl(b, M.rubber, 0.2, 0.14, 0.3, -1.12, k * 0.7, 'z');
  }
  cyl(b, M.steel, 0.05, 0.5, 2.3, -0.85, 0); cyl(b, M.rubber, 0.17, 0.12, 2.3, -1.12, 0, 'z');
  cyl(b, M.gun, 0.08, 0.4, 0, 1.3, 0);
  const rotor = grp(b, 0, 1.55, 0); cyl(rotor, M.gun, 0.2, 0.12, 0, 0, 0);
  for (let i = 0; i < 5; i++) { const arm = grp(rotor); arm.rotation.y = i * Math.PI * 2 / 5; box(arm, M.gun, 3.4, 0.04, 0.24, 1.8, 0, 0); }
  const rotorTail = grp(b, -5.4, 1.5, 0.12);
  for (let i = 0; i < 3; i++) { const arm = grp(rotorTail); arm.rotation.z = i * Math.PI * 2 / 3; box(arm, M.steel, 1.3, 0.07, 0.03, 0.6, 0, 0); }
  const t = grp(b, 2.6, -0.7, 0); cyl(t, M.gun, 0.16, 0.18, 0, 0, 0); cyl(t, M.gun, 0.04, 0.9, 0.5, -0.05, 0, 'x');
  return { g, body: b, turret: t, turretX: 2.6, rotor, rotorTail, ground: 1.5, muzzle: 3.2, muzzleY: -0.75 };
}

// ---------------- infantry ----------------
function man(parent, T, x, z, o) {
  const m = grp(parent, x, 0, z), cloth = o.cloth || M.khaki, legs = o.legs || M.olive;
  for (const s of [-1, 1]) box(m, legs, 0.16, 0.6, 0.16, 0, 0.3, s * 0.11);
  box(m, cloth, 0.26, 0.56, 0.42, 0, 0.88, 0); box(m, T.accent, 0.27, 0.12, 0.43, 0, 1.08, 0);
  add(m, G.sph, M.skin, 0.13, 0.14, 0.13, 0, 1.3, 0); add(m, G.sph, o.hat || M.olive, 0.155, 0.11, 0.155, 0, 1.38, 0);
  if (o.gun === 'rifle') box(m, M.gun, 0.62, 0.06, 0.06, 0.25, 0.95, 0.24);
  else if (o.gun === 'long') { box(m, M.gun, 1.1, 0.06, 0.06, 0.4, 0.98, 0.24); cyl(m, M.glass, 0.04, 0.2, 0.3, 1.06, 0.24, 'x'); }
  else if (o.gun === 'rpg') { cyl(m, M.olive, 0.07, 1.1, 0.1, 1.22, 0.26, 'x'); add(m, G.cone, M.gun, 0.11, 0.3, 0.11, 0.78, 1.22, 0.26).rotation.z = -Math.PI / 2; }
  else if (o.gun === 'laptop') { box(m, M.dark, 0.3, 0.03, 0.4, 0.35, 0.8, 0); box(m, M.laser, 0.03, 0.26, 0.38, 0.5, 0.94, 0); }
  else if (o.gun === 'tool') box(m, M.red, 0.3, 0.2, 0.16, 0.2, 0.55, 0.28);
  else if (o.gun === 'satchel') box(m, M.dark, 0.2, 0.3, 0.3, -0.2, 0.9, 0);
  return m;
}
function squad(T, spots, o) {
  const g = new THREE.Group(), b = grp(g), men = spots.map(([x, z]) => man(b, T, x, z, o));
  return { g, body: b, men, muzzle: 0.9, muzzleY: 1.0 };
}
const FOUR = [[0.5, 0], [-0.1, 0.55], [-0.1, -0.55], [-0.65, 0]], TWO = [[0.1, 0.35], [-0.1, -0.35]], ONE = [[0, 0]];

// ---------------- buildings ----------------
function slab(g, w, d, mat = M.slab, h = 0.5) { return box(g, mat, w, h, d, 0, h / 2 - 0.05, 0); }
function cc(T) {
  const g = new THREE.Group(); slab(g, 19.2, 19.2);
  box(g, T.wall, 11, 5, 9, -2.5, 2.95, -1); box(g, T.roof, 11.4, 0.4, 9.4, -2.5, 5.6, -1); box(g, T.accent, 11.1, 0.5, 9.1, -2.5, 4.6, -1);
  box(g, T.wall, 6, 3, 7, 5.6, 1.95, -3.5); box(g, T.roof, 6.3, 0.3, 7.3, 5.6, 3.55, -3.5);
  box(g, M.glass, 8, 1.1, 0.2, -2.5, 3.3, 3.55); box(g, M.gun, 2.4, 2.6, 0.3, -2.5, 1.75, 3.55);
  cyl(g, T.wall, 1.5, 8.5, -6.5, 4.7, -6); cyl(g, M.glass, 1.75, 1.1, -6.5, 8.6, -6); cyl(g, T.roof, 1.9, 0.3, -6.5, 9.3, -6);
  const spin = grp(g, -6.5, 9.5, -6);
  cyl(spin, M.steel, 0.12, 1.2, 0, 0.6, 0); add(spin, G.dome, M.white, 1.5, 0.6, 1.5, 0.4, 1.5, 0).rotation.z = -1.9;
  cyl(g, M.tread, 3.6, 0.1, 5, 0.5, 5); cyl(g, M.yellow, 2.6, 0.12, 5, 0.5, 5); cyl(g, M.tread, 2.3, 0.14, 5, 0.5, 5);
  cyl(g, M.gun, 0.05, 4, 1.5, 7.8, -4); box(g, T.glow, 0.6, 0.6, 0.6, 1.5, 9.9, -4);
  for (const x of [-7, 2]) box(g, M.concrete, 1.2, 1.4, 1.2, x, 1.15, 6.5);
  return { g, spin, top: 11 };
}
function power(T) {
  const g = new THREE.Group(); slab(g, 11.4, 11.4);
  box(g, T.wall, 5.4, 3.4, 5.6, -2.2, 2.15, 0.5); box(g, T.roof, 5.7, 0.3, 5.9, -2.2, 4.0, 0.5); box(g, T.accent, 5.45, 0.4, 5.65, -2.2, 3.3, 0.5);
  for (const z of [-2.6, 2.6]) { add(g, G.tower, M.concrete, 2.0, 5.6, 2.0, 3, 3.25, z); cyl(g, T.glow, 1.3, 0.12, 3, 5.4, z); }
  cyl(g, M.steel, 0.28, 4.4, 0.6, 1.4, -2.6, 'x'); cyl(g, M.steel, 0.28, 4.4, 0.6, 1.4, 2.6, 'x'); cyl(g, M.steel, 0.28, 5.2, 0.9, 1.4, 0, 'z');
  box(g, M.yellow, 1.4, 1.5, 1.0, -3.6, 1.2, -4);
  return { g };
}
function supply(T) {
  const g = new THREE.Group(); slab(g, 15.4, 11.4);
  box(g, T.wall, 9.5, 4, 6.4, -2, 2.45, 0);
  for (const s of [-1, 1]) box(g, T.roof, 9.9, 0.3, 3.6, -2, 4.9, s * 1.65).rotation.x = s * 0.22;
  box(g, T.accent, 9.55, 0.45, 6.45, -2, 3.7, 0); box(g, M.gun, 0.2, 2.8, 3.4, 2.8, 1.85, 0);
  box(g, M.concrete, 4, 0.5, 6, 5.2, 0.7, 0);
  box(g, M.crateA, 1.3, 1.1, 1.6, 4.4, 1.5, -1.6); box(g, M.crateB, 1.3, 1.1, 1.6, 6, 1.5, -1.5); box(g, M.crateC, 1.4, 1.0, 1.4, 5.2, 1.45, 1.4); box(g, M.crateA, 1.2, 0.9, 1.3, 5.2, 2.5, -1.6);
  cyl(g, M.steel, 0.1, 5, 6.6, 3, 2.6); box(g, M.yellow, 3, 0.25, 0.25, 5.2, 5.3, 2.6);
  return { g };
}
function barracks(T) {
  const g = new THREE.Group(); slab(g, 11.4, 11.4);
  cyl(g, T.wall, 3.1, 8.6, -0.8, 0.45, -1, 'x').scale.set(3.1, 8.6, 3.6);
  for (const x of [-5.1, 3.5]) box(g, T.roof, 0.3, 3.2, 6.6, x, 1.6, -1);
  box(g, M.gun, 0.2, 2.0, 1.4, 3.62, 1.25, -1); box(g, T.accent, 8.7, 0.3, 0.6, -0.8, 3.5, -1);
  for (let i = 0; i < 5; i++) add(g, G.sph, M.sandbag, 0.75, 0.4, 0.45, -3.6 + i * 1.5, 0.7, 4.2);
  for (let i = 0; i < 4; i++) add(g, G.sph, M.sandbag, 0.75, 0.38, 0.45, -2.85 + i * 1.5, 1.2, 4.2);
  cyl(g, M.steel, 0.07, 5.5, 4.4, 3.1, 3.6); const flag = box(g, T.accent, 1.6, 0.95, 0.06, 5.25, 5.3, 3.6);
  return { g, flag };
}
function factory(T) {
  const g = new THREE.Group(); slab(g, 15.4, 15.4);
  box(g, T.wall, 11.5, 6, 10.5, -1.2, 3.45, -1.2); box(g, T.roof, 11.9, 0.4, 10.9, -1.2, 6.6, -1.2);
  for (let i = 0; i < 4; i++) box(g, T.dark, 0.5, 0.5, 10.6, -5.4 + i * 2.8, 6.95, -1.2);
  box(g, T.accent, 11.55, 0.55, 10.55, -1.2, 5.3, -1.2);
  box(g, M.gun, 6, 4.2, 0.3, -1.2, 2.55, 4.1); box(g, M.yellow, 6.4, 0.35, 0.4, -1.2, 4.8, 4.15);
  box(g, T.wall, 3.2, 3.6, 8, 6, 2.25, -2); box(g, T.roof, 3.5, 0.3, 8.3, 6, 4.15, -2);
  for (const z of [-4.5, -2]) { cyl(g, M.steel, 0.42, 3.4, 6.3, 5.9, z); cyl(g, M.tread, 0.5, 0.3, 6.3, 7.6, z); }
  box(g, M.concrete, 7, 0.3, 3.5, -1.2, 0.55, 5.8);
  return { g, top: 8.5 };
}
// Airfield (40 m x 28 m). Must match the layout in sim/entities.js: runway centrelines at z = -10 and z = +10,
// four parking pads at x = -14 + 7 i on the centre line, helipad at (15.5, 0).
function airfield(T) {
  const g = new THREE.Group(); slab(g, 39.6, 27.6, M.tarmac, 0.4);
  for (const rz of [-10, 10]) {
    for (const z of [rz - 3.1, rz + 3.1]) box(g, M.white, 36, 0.05, 0.16, 0, 0.38, z);                              // runway edge lines
    for (let i = -6; i <= 6; i++) box(g, M.white, 1.5, 0.05, 0.22, i * 2.6, 0.38, rz);                              // centreline dashes
    for (const x of [-17.2, 17.2]) for (let k = -3; k <= 3; k++) box(g, M.white, 1.5, 0.05, 0.3, x, 0.38, rz + k * 0.78); // threshold bars
  }
  for (let i = 0; i < 4; i++) {
    const x = -14 + i * 7;
    box(g, M.yellow, 0.14, 0.05, 13.6, x, 0.38, 0);                                                                 // taxi line to both runways
    for (const s of [-1, 1]) { box(g, T.wall, 0.4, 1.5, 5.2, x + s * 3.1, 1.1, 0); box(g, T.accent, 0.42, 0.2, 5.2, x + s * 3.1, 1.9, 0); } // blast walls either side, open to both runways
  }
  cyl(g, M.yellow, 3.0, 0.05, 15.5, 0.38, 0); cyl(g, M.tarmac, 2.7, 0.06, 15.5, 0.39, 0);                           // helipad ring
  for (const s of [-1, 1]) box(g, M.white, 0.3, 0.05, 2.0, 15.5 + s * 0.7, 0.42, 0); box(g, M.white, 1.4, 0.05, 0.3, 15.5, 0.42, 0); // "H"
  box(g, T.wall, 2.0, 2.4, 2.4, -18.6, 1.5, 0); cyl(g, T.wall, 0.75, 5, -18.6, 4.4, 0); cyl(g, M.glass, 1.25, 1.1, -18.6, 7.2, 0); cyl(g, T.roof, 1.45, 0.25, -18.6, 7.9, 0); // control tower at the west end of the apron
  box(g, T.accent, 2.05, 0.3, 2.45, -18.6, 2.5, 0);
  const spin = grp(g, -18.6, 8.1, 0); box(spin, M.steel, 2.2, 0.5, 0.12, 0, 0.5, 0); cyl(spin, M.steel, 0.07, 0.5, 0, 0.2, 0);
  cyl(g, M.steel, 0.06, 2.4, 11.4, 1.5, 5.2); box(g, M.red, 1.0, 0.45, 0.05, 12.0, 2.5, 5.2);                       // windsock
  return { g, spin, top: 9 };
}
function patriot(T) {
  const g = new THREE.Group();
  cyl(g, M.slab, 3.7, 0.5, 0, 0.2, 0, 'y', G.cyl8); cyl(g, T.wall, 1.5, 1.3, 0, 1.05, 0, 'y', G.cyl8);
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.78; add(g, G.sph, M.sandbag, 0.9, 0.42, 0.5, Math.cos(a) * 2.8, 0.75, Math.sin(a) * 2.8).rotation.y = -a + 1.57; }
  const t = grp(g, 0, 1.75, 0);
  cyl(t, M.steel, 0.9, 0.3, 0, 0.1, 0);
  const arm = grp(t, 0, 0.9, 0); arm.rotation.z = 0.45;
  box(arm, T.hull, 3.0, 1.25, 2.3, 0.2, 0, 0); box(arm, T.accent, 3.02, 0.2, 2.32, 0.2, 0.66, 0);
  for (const y of [-0.3, 0.3]) for (const z of [-0.58, 0.58]) cyl(arm, M.gun, 0.24, 0.12, 1.74, y, z, 'x');
  box(t, M.gun, 0.5, 0.9, 0.5, -1.1, 0.5, 0); add(t, G.dome, M.white, 0.5, 0.5, 0.5, -1.1, 1.0, 0);
  return { g, turret: t, muzzle: 2.2, muzzleY: 3.4 };
}
function gatling(T) {
  const g = new THREE.Group();
  cyl(g, M.slab, 3.6, 0.5, 0, 0.2, 0, 'y', G.cyl8); add(g, G.tower, T.wall, 1.9, 4.2, 1.9, 0, 2.5, 0); cyl(g, T.roof, 1.6, 0.3, 0, 4.7, 0); box(g, T.accent, 2.9, 0.3, 2.9, 0, 3.9, 0);
  const t = grp(g, 0, 4.9, 0); box(t, T.dark, 1.6, 0.9, 1.6, 0, 0.45, 0);
  for (const s of [-1, 1]) { cyl(t, M.gun, 0.2, 2.4, 1.6, 0.5, s * 0.45, 'x'); cyl(t, M.steel, 0.25, 0.3, 2.7, 0.5, s * 0.45, 'x'); }
  return { g, turret: t, muzzle: 2.9, muzzleY: 5.4, top: 7 };
}
function stinger(T) {
  const g = new THREE.Group();
  cyl(g, M.slab, 3.6, 0.3, 0, 0.1, 0, 'y', G.cyl8);
  for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5; add(g, G.sph, M.sandbag, 0.85, 0.42, 0.5, Math.cos(a) * 3.0, 0.55, Math.sin(a) * 3.0).rotation.y = -a + 1.57; if (i % 2) add(g, G.sph, M.sandbag, 0.8, 0.38, 0.48, Math.cos(a + 0.3) * 3.0, 1.1, Math.sin(a + 0.3) * 3.0).rotation.y = -a + 1.27; }
  box(g, M.cloth, 2.6, 0.08, 2.6, -0.6, 2.6, -0.6); for (const [x, z] of [[-1.8, -1.8], [0.6, -1.8], [-1.8, 0.6], [0.6, 0.6]]) cyl(g, M.wood, 0.06, 2.4, x, 1.4, z);
  const t = grp(g, 0.6, 0.4, 0.6); cyl(t, M.steel, 0.1, 1.4, 0, 0.7, 0);
  const arm = grp(t, 0, 1.5, 0); arm.rotation.z = 0.4; box(arm, T.dark, 1.8, 0.5, 0.9, 0.2, 0, 0); for (const z of [-0.25, 0.25]) cyl(arm, M.olive, 0.14, 0.2, 1.2, 0, z, 'x'); box(arm, T.accent, 0.3, 0.52, 0.92, -0.6, 0, 0);
  return { g, turret: t, muzzle: 1.6, muzzleY: 2.4 };
}
function uplink(T) {
  const g = new THREE.Group(); slab(g, 11.4, 11.4);
  box(g, T.wall, 6, 3, 5, -2, 1.95, 2); box(g, T.roof, 6.3, 0.3, 5.3, -2, 3.55, 2); box(g, T.accent, 6.05, 0.35, 5.05, -2, 2.9, 2); box(g, M.laser, 2.5, 0.4, 0.1, -2, 2.2, 4.55);
  cyl(g, M.steel, 0.5, 3.6, 2.6, 2.2, -2.2);
  const spin = grp(g, 2.6, 4.2, -2.2); const dish = add(spin, G.dome, M.white, 3.0, 1.1, 3.0, 0, 1.2, 0); dish.rotation.x = Math.PI; dish.rotation.z = 0.5;
  cyl(spin, M.gun, 0.06, 2.2, 0.5, 1.6, 0).rotation.z = -0.5; add(spin, G.sph, M.laser, 0.22, 0.22, 0.22, 1.0, 2.5, 0);
  return { g, spin, top: 8 };
}
function tunnel(T) {
  const g = new THREE.Group();
  add(g, G.dome, M.sandbag, 3.8, 2.4, 3.8, 0, 0, 0); box(g, M.dark, 2.2, 1.9, 1.4, 0, 0.95, 2.9); box(g, M.wood, 2.6, 0.25, 1.6, 0, 2.0, 2.9);
  for (const x of [-1.2, 1.2]) box(g, M.wood, 0.25, 2.0, 1.6, x, 1.0, 2.9);
  box(g, M.cloth, 3.2, 0.06, 2.2, 0, 2.6, 2.0).rotation.x = 0.25; box(g, T.accent, 0.9, 0.5, 0.05, 1.9, 2.9, 3.0); cyl(g, M.wood, 0.05, 1.6, 1.4, 2.4, 3.0);
  for (let i = 0; i < 4; i++) add(g, G.sph, M.sandbag, 0.7, 0.36, 0.45, -2.2 + i * 1.45, 0.3, 3.9);
  return { g };
}
function market(T) {
  const g = new THREE.Group(); slab(g, 11.4, 11.4, M.sandbag, 0.25);
  box(g, T.wall, 5, 2.8, 4.4, -2.4, 1.6, -2.6); box(g, T.roof, 5.4, 0.25, 4.8, -2.4, 3.1, -2.6); box(g, M.gun, 1.4, 2.0, 0.2, -2.4, 1.2, -0.35);
  const tent = (x, z, mat) => { const m = add(g, G.pyr, mat, 2.1, 1.4, 2.1, x, 2.9, z); m.rotation.y = Math.PI / 4; for (const [a, b2] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) cyl(g, M.wood, 0.05, 2.2, x + a * 1.3, 1.2, z + b2 * 1.3); box(g, M.wood, 2.2, 0.8, 1.0, x, 0.6, z); };
  tent(3, -3, M.red); tent(3, 2.6, M.cloth); tent(-2.6, 3, T.accent);
  box(g, M.crateA, 1.2, 1, 1.2, 0.2, 0.7, 0.6); box(g, M.crateC, 1.1, 0.9, 1.1, 0.3, 1.6, 0.7); box(g, M.salvage, 0.9, 0.7, 0.9, -0.9, 0.55, 0.9);
  return { g };
}
function derrick() {
  const g = new THREE.Group(); slab(g, 7.6, 7.6, M.concrete, 0.35);
  for (const [a, b2] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const leg = cyl(g, M.steel, 0.1, 8.2, a * 1.05, 4.3, b2 * 1.05); leg.rotation.z = a * 0.19; leg.rotation.x = -b2 * 0.19; }
  for (const y of [2.2, 4.4, 6.4]) { const s = 1.9 - y * 0.2; box(g, M.steel, s * 2, 0.08, 0.08, 0, y, s); box(g, M.steel, s * 2, 0.08, 0.08, 0, y, -s); box(g, M.steel, 0.08, 0.08, s * 2, s, y, 0); box(g, M.steel, 0.08, 0.08, s * 2, -s, y, 0); }
  box(g, M.dark, 0.9, 0.5, 0.9, 0, 8.5, 0); cyl(g, M.dark, 0.35, 1.2, 2.6, 0.95, 2.2); cyl(g, M.red, 0.7, 1.6, -2.4, 1.1, -2.2);
  const pump = grp(g, 2.2, 2.2, -1.5); box(pump, M.yellow, 3.0, 0.22, 0.22, 0, 0, 0); box(pump, M.yellow, 0.5, 0.7, 0.3, 1.5, -0.2, 0);
  cyl(g, M.steel, 0.12, 2.0, 2.2, 1.3, -1.5);
  const pole = grp(g, -2.9, 0.3, 2.9); cyl(pole, M.steel, 0.06, 4, 0, 2, 0);
  const flags = [0, 1].map(t => { const f = box(pole, M.glow[t], 1.6, 0.95, 0.06, 0.85, 3.4, 0); f.visible = false; return f; });
  return { g, pump, flags, top: 10 };
}
function civ(kind) {
  const variant = ((kind | 0) % M.civ.length + M.civ.length) % M.civ.length;   // never an unknown kind: that is what left custom buildings white
  const g = new THREE.Group(), main = grp(g), rub = grp(g);
  const W = M.civ[variant], R = M.civRoof[variant];
  slab(main, 12, 12, M.concrete, 0.3);
  const block = (w, h, d, x, z) => { box(main, W, w, h, d, x, h / 2 + 0.2, z); box(main, R, w + 0.4, 0.35, d + 0.4, x, h + 0.35, z); };
  const walls = (w, h, d, x, z) => box(main, W, w, h, d, x, h / 2 + 0.2, z);
  const gable = (w, d, y, x, z, mat = R, pitch = 0.62) => { for (const k of [-1, 1]) box(main, mat, w + 0.5, 0.22, d * 0.5 / Math.cos(pitch) + 0.3, x, y + d * 0.25 * Math.tan(pitch), z + k * d * 0.25).rotation.x = k * pitch; };
  let top = 9;
  if (variant === 0) { block(9.6, 9, 9.6, 0, 0); box(main, M.concrete, 2, 1.4, 2, 2.5, 10.2, -2); cyl(main, M.steel, 0.9, 1.2, -2.5, 10.1, 2.5); top = 9.6; }                         // apartment block
  else if (variant === 1) { block(10.6, 6, 8.6, 0, -0.8); box(main, M.wood, 10.6, 0.15, 2.2, 0, 3.1, 4.4).rotation.x = 0.18; for (const x of [-4.8, 4.8]) cyl(main, M.wood, 0.1, 3, x, 1.6, 5.3); top = 6.6; } // market hall
  else if (variant === 2) { block(7, 12, 7, -1.6, -1.6); block(5, 4.5, 9.6, 3.2, 0.6); cyl(main, M.gun, 0.06, 3.5, -1.6, 14.2, -1.6); top = 12.6; }                                      // office tower
  else if (variant === 3) { block(9.6, 7, 9.6, 0, 0); add(main, G.dome, M.white, 3.2, 3.2, 3.2, 0, 7.5, 0); cyl(main, M.white, 0.7, 10, 4.2, 5.2, -4.2); add(main, G.cone, M.civRoof[2], 0.9, 1.6, 0.9, 4.2, 11, -4.2); top = 10.8; } // mosque
  else if (variant === 4) { walls(10.6, 5, 9, 0, 0); gable(10.6, 9, 5.2, 0, 0, M.steel, 0.32); box(main, M.dark, 3.4, 3.4, 0.12, -2.4, 1.9, 4.56); box(main, M.dark, 3.4, 3.4, 0.12, 2.4, 1.9, 4.56); top = 7; }      // warehouse: low steel roof, two roller doors
  else if (variant === 5) { walls(7, 4.4, 6, -1.4, -0.6); gable(7, 6, 4.6, -1.4, -0.6); box(main, M.rubble, 0.8, 2.2, 0.8, -3.8, 6.4, -1.6); block(3.2, 2.6, 4, 3.6, 1.6); top = 7.4; }                         // farmhouse with chimney and shed
  else if (variant === 6) { walls(6.4, 2.9, 5.4, 0, -0.4); gable(6.4, 5.4, 3.1, 0, -0.4, M.wood, 0.78); box(main, M.wood, 6.4, 0.15, 1.8, 0, 2.7, 3.2).rotation.x = 0.2; for (const x of [-2.9, 2.9]) cyl(main, M.wood, 0.12, 2.6, x, 1.5, 3.9); box(main, M.rubble, 0.9, 5.2, 0.9, 2.2, 2.8, -2.6); top = 6; } // log cabin: steep roof, porch, stone chimney
  else if (variant === 7) { walls(7.6, 5, 10, 0, 0); gable(7.6, 10, 5.2, 0, 0, M.civRoof[2], 0.5); box(main, M.white, 2.6, 3.4, 0.12, 0, 1.9, 5.06); box(main, M.white, 0.2, 5, 0.2, -3.8, 2.7, 5.02); box(main, M.white, 0.2, 5, 0.2, 3.8, 2.7, 5.02); top = 8; } // red barn, white door and trim
  else if (variant === 8) { block(4.2, 3, 3.6, -2.6, -3.4); box(main, R, 9.4, 0.4, 6.2, 1, 4.4, 1.6); for (const [x, z] of [[-3, -1], [5, -1], [-3, 4.2], [5, 4.2]]) cyl(main, M.steel, 0.16, 4.2, x, 2.3, z); for (const x of [-0.6, 2.6]) box(main, M.red, 0.6, 1.5, 0.9, x, 0.95, 1.6); top = 4.8; } // fuel station: canopy, kiosk, pumps
  else { for (const [x, z] of [[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]]) cyl(main, M.steel, 0.16, 7, x, 3.7, z); cyl(main, W, 2.7, 3.2, 0, 8.6, 0); add(main, G.cone, R, 2.9, 1.4, 2.9, 0, 10.9, 0); box(main, M.steel, 0.08, 7, 0.5, 1.8, 3.7, 0); top = 11.4; } // water tower
  let s = 77 + variant * 13; const rnd = () => (s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296;
  for (let i = 0; i < 16; i++) { const m = box(rub, i % 3 ? M.rubble : W, 1.5 + rnd() * 3.5, 0.6 + rnd() * 2.2, 1.5 + rnd() * 3, (rnd() - 0.5) * 9.5, 0.4 + rnd() * 1.2, (rnd() - 0.5) * 9.5); m.rotation.set(rnd() * 0.9, rnd() * 3, rnd() * 0.9); }
  rub.visible = false;
  const pole = grp(main, -3.4, top, 3.4); cyl(pole, M.steel, 0.06, 3, 0, 1.5, 0);
  const flags = [0, 1].map(t => { const f = box(pole, M.glow[t], 1.5, 0.9, 0.06, 0.8, 2.5, 0); f.visible = false; return f; });
  return { g, main, rub, flags, top: top + 3 };
}
function dock() {
  const g = new THREE.Group(); slab(g, 15.6, 11.6, M.concrete, 0.7);
  for (const x of [-7.2, 7.2]) box(g, M.yellow, 0.4, 0.12, 11.6, x, 0.72, 0);
  const crates = [], cm = [M.crateA, M.crateB, M.crateC];
  let k = 0;
  for (let y = 0; y < 3; y++) for (let x = 0; x < 5; x++) for (let z = 0; z < 3; z++) {
    const jx = ((k * 37) % 7) * 0.03, m = box(g, cm[(k * 5 + y) % 3], 2.1, 1.25, 2.6, -5.4 + x * 2.45 + jx, 1.3 + y * 1.3, -3.2 + z * 3.0);
    crates.push({ m, order: y * 100 + ((x * 7 + z * 3 + k) % 15) }); k++;
  }
  crates.sort((a, b) => b.order - a.order); // top layers disappear first
  for (const s of [-1, 1]) cyl(g, M.steel, 0.16, 7, 6.6, 3.9, s * 5.2);
  box(g, M.yellow, 0.4, 0.4, 10.8, 6.6, 7.4, 0); box(g, M.gun, 0.5, 0.6, 0.8, 6.6, 6.9, 1.5);
  return { g, crates: crates.map(c => c.m) };
}

const UNIT = {
  avenger, inferno, scorpion, buggy, tractor, dozer, truck, // tanks, technical, helicopter and scouts are built in modelFactory.js
  mig: (T) => jet(T, false), hind, // the Raptor is built in modelFactory.js
  rifle: (T) => squad(T, FOUR, { gun: 'rifle' }),
  bomber: (T) => { const r = squad(T, ONE, { gun: 'rifle', cloth: M.cloth, hat: M.dark }); box(r.body, M.crateC, 0.46, 0.34, 0.5, 0, 1.12, 0); for (const z of [-0.2, 0, 0.2]) cyl(r.body, M.gun, 0.05, 0.3, 0.26, 1.12, z); return r; }, // explosive vest over plain clothes
  rpg: (T) => squad(T, TWO, { gun: 'rpg', cloth: M.cloth, hat: M.red }),
  sniper: (T) => squad(T, ONE, { gun: 'long', cloth: M.ghillie, legs: M.ghillie, hat: M.ghillie }),
  hacker: (T) => squad(T, TWO, { gun: 'laptop', cloth: M.dark, hat: M.dark }),
  worker: (T) => squad(T, ONE, { gun: 'tool', cloth: M.cloth, hat: M.yellow }),
  saboteur: (T) => squad(T, ONE, { gun: 'satchel', cloth: M.dark, legs: M.dark, hat: M.dark }),
};
// Particle Cannon: ring of capacitor banks around a tall emitter mast that tracks the sky.
function particle(T) {
  const g = new THREE.Group(); slab(g, 15.4, 15.4);
  box(g, T.wall, 9, 2.6, 9, 0, 1.75, 0); box(g, T.roof, 9.4, 0.3, 9.4, 0, 3.2, 0); box(g, T.accent, 9.1, 0.35, 9.1, 0, 2.6, 0);
  for (const [x, z] of [[-5.6, -5.6], [5.6, -5.6], [-5.6, 5.6], [5.6, 5.6]]) { cyl(g, M.steel, 1.0, 3.4, x, 2.1, z); add(g, G.dome, M.white, 2.0, 0.8, 2.0, x, 3.8, z); box(g, M.dark, 0.3, 0.3, 5.0, x * 0.55, 3.0, z * 0.55).rotation.y = Math.atan2(x, z); }
  cyl(g, M.steel, 1.5, 4.5, 0, 5.5, 0); cyl(g, M.gun, 0.9, 5.0, 0, 10.2, 0);
  const spin = grp(g, 0, 12.7, 0); for (let i = 0; i < 4; i++) { const a = i * 1.5708; box(spin, T.hull, 0.35, 3.2, 1.3, Math.cos(a) * 1.5, 0.6, Math.sin(a) * 1.5).rotation.y = -a; }
  add(spin, G.sph, M.laser, 0.9, 0.9, 0.9, 0, 1.3, 0);
  return { g, spin, top: 15 };
}
// Nuclear Missile Silo: blast-door bunker with the missile standing in the open shaft.
function silo(T) {
  const g = new THREE.Group(); slab(g, 15.4, 15.4);
  box(g, T.wall, 12, 2.2, 12, 0, 1.55, 0); box(g, T.roof, 12.4, 0.35, 12.4, 0, 2.8, 0); box(g, T.accent, 12.1, 0.4, 12.1, 0, 2.1, 0);
  cyl(g, M.dark, 3.1, 0.5, 0, 3.1, 0); cyl(g, M.steel, 3.4, 0.3, 0, 2.95, 0);
  for (const s of [-1, 1]) { const d = box(g, M.steel, 3.2, 0.3, 6.6, s * 4.9, 3.2, 0); d.rotation.z = -s * 0.5; box(g, M.red, 0.35, 0.32, 6.6, s * 3.6, 3.75, 0).rotation.z = -s * 0.5; }
  // The missile is its own node: the view lowers it into the shaft after a launch and raises it again as the countdown runs out.
  const missile = grp(g, 0, 0, 0);
  cyl(missile, M.white, 1.05, 6.6, 0, 6.2, 0); cyl(missile, M.white, 0.82, 2.2, 0, 10.6, 0); add(missile, G.cone, M.red, 0.82, 2.8, 0.82, 0, 13.1, 0);
  for (const y of [4.4, 8.2, 9.8]) cyl(missile, M.dark, 1.08, 0.4, 0, y, 0);
  for (let i = 0; i < 4; i++) { const a = i * 1.5708 + 0.785; box(missile, M.red, 0.12, 1.8, 1.4, Math.cos(a) * 1.4, 3.9, Math.sin(a) * 1.4).rotation.y = -a; }
  cyl(g, M.dark, 1.1, 0.5, 0, 3.2, 0);
  for (let i = 0; i < 12; i++) { const a = i * 0.5236; box(g, i % 2 ? M.yellow : M.dark, 0.9, 0.12, 1.75, Math.cos(a) * 3.9, 3.02, Math.sin(a) * 3.9).rotation.y = -a; }   // hazard ring round the shaft
  box(g, M.red, 0.5, 11, 0.5, 4.3, 8.3, 4.3); box(g, M.white, 0.52, 1.6, 0.52, 4.3, 6.4, 4.3); box(g, M.white, 0.52, 1.6, 0.52, 4.3, 10.4, 4.3);                      // red and white service tower
  for (const y of [6.0, 9.6, 12.6]) box(g, M.steel, 3.4, 0.18, 0.3, 2.9, y, 2.9).rotation.y = 0.785; add(g, G.sph, T.glow, 0.35, 0.35, 0.35, 4.3, 14.1, 4.3);
  box(g, T.wall, 3, 2.4, 2.4, -5.2, 4.1, -5.2); const spin = grp(g, -5.2, 5.4, -5.2); box(spin, M.steel, 1.8, 0.12, 0.5, 0, 0.3, 0); cyl(spin, M.steel, 0.06, 0.5, 0, 0.05, 0);
  return { g, spin, missile, top: 15 };
}
// Scud Storm: nine launch rails raked skyward on an improvised sandbagged platform.
function scud(T) {
  const g = new THREE.Group(); slab(g, 15.4, 15.4, M.sandbag, 0.7);
  box(g, M.wood, 11, 0.5, 11, 0, 0.95, 0); box(g, M.dark, 9, 1.2, 9, 0, 1.6, 0); box(g, T.accent, 9.1, 0.3, 9.1, 0, 2.2, 0);
  const rack = grp(g, 0, 2.3, 0); rack.rotation.z = 0;
  const missiles = [];   // one node per rail: the view removes each as it launches and puts them back one by one during the reload
  for (let i = 0; i < 9; i++) {
    const x = (i % 3 - 1) * 2.6, z = (((i / 3) | 0) - 1) * 2.6; box(rack, M.gun, 0.2, 2.6, 0.2, x + 0.7, 1.3, z); box(rack, M.steel, 0.3, 5.0, 0.3, x + 0.55, 2.7, z).rotation.z = 0.32;
    const m = grp(rack, x, 2.9, z); m.rotation.z = 0.32; cyl(m, M.olive, 0.5, 5.0, 0, 0, 0); add(m, G.cone, M.olive, 0.5, 2.6, 0.5, 0, 3.8, 0); cyl(m, M.gun, 0.52, 0.3, 0, -1.8, 0);   // long pointed nose
    for (const a of [0, 1.5708]) box(m, M.gun, 1.5, 0.8, 0.06, 0, -2.1, 0).rotation.y = a;
    missiles.push(m);
  }
  for (let i = 0; i < 8; i++) add(g, G.sph, M.sandbag, 0.9, 0.45, 0.6, -6.3 + i * 1.8, 0.95, 6.6);
  cyl(g, M.wood, 0.07, 3.4, 6.4, 2.4, -6.4); box(g, M.cloth, 1.6, 0.9, 0.05, 5.6, 3.6, -6.4);
  return { g, top: 9, missiles };
}
const BLDG = { cc, power, supply, barracks, factory, airfield, patriot, gatling, stinger, uplink, tunnel, market, particle, silo, scud };

export function buildModel(e) {
  init();
  let v;
  if (e.kind === 'unit') { const d = UNITS[e.type]; v = (UNIT[d.model] || UNIT.scorpion)(mats(d.faction, e.team)); }
  else {
    const d = BLDGS[e.type];
    if (d.model === 'civ') v = civ(e.variant); else if (d.model === 'dock') v = dock(); else if (d.model === 'derrick') v = derrick();
    else v = (BLDG[d.model] || BLDG.power)(mats(d.faction, e.team));
  }
  v.kind = e.kind; v.type = e.type;
  return v;
}
// Off-map aircraft for support powers.
export function buildPlane(model, faction, team) { init(); return jet(mats(faction, team), model === 'bomber').g; }
export function buildCrate() {
  init(); const g = new THREE.Group();
  box(g, M.salvage, 1.3, 1.0, 1.3, 0, 0.5, 0); box(g, M.dark, 1.34, 0.12, 1.34, 0, 0.5, 0); box(g, M.dark, 0.12, 1.04, 1.34, 0, 0.5, 0);
  return g;
}
export function buildBomb() { init(); const g = new THREE.Group(); add(g, G.sph, M.dark, 0.5, 1.1, 0.5, 0, 0, 0); box(g, M.red, 0.9, 0.3, 0.08, 0, 0.9, 0); box(g, M.red, 0.08, 0.3, 0.9, 0, 0.9, 0); return g; }

// Translucent footprint used while placing a structure.
export function buildGhost() {
  init();
  const mat = new THREE.MeshBasicMaterial({ color: 0x55ff88, transparent: true, opacity: 0.38, depthWrite: false });
  const m = new THREE.Mesh(G.box, mat); m.visible = false; m.renderOrder = 5;
  return m;
}
export function footprint(type) { const d = BLDGS[type]; return [d.w * CELL, d.h * CELL]; }
