// Procedural model library: buildings, infantry and support vehicles.
// Combat vehicle and aircraft silhouettes live in modelFactory.js, which is the entry point the view uses.
// The registry's `model` key picks the builder; hull colours come from the
// faction, accent colour from the team. Convention: model forward is +X, so
// group.rotation.y = -facing.
import { TEAM } from '../ui/teamColors.js';
import THREE from '../lib/three.js';
import { CELL } from '../sim/defs.js';
import { UNITS, BLDGS, FACTIONS, HANGAR } from '../sim/factionRegistry.js';
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
    black: std(0x121214, 0.9, 0), dress: std(0xc21f2b, 0.75, 0.05), blue: std(0x1f5fd0, 0.8, 0.05), camo: std(0x4c5a33, 0.95, 0),   // hero clothing
    fur: std(0x5a3d25, 0.98, 0), furDark: std(0x3a2616, 0.98, 0), bronze: std(0xa9793a, 0.45, 0.65), emr: std(0x55633f, 0.95, 0), fleck: std(0x5f6a4c, 0.95, 0), grey: std(0x80868c, 0.6, 0.5),   // bear fur, hoplite bronze, Russian and European field uniforms
    laser: std(0x24424f, 0.14, 0.7), // coated optic, not a light source
    multicam: std(0x8c8566, 0.95, 0), coyote: std(0x7c6a48, 0.95, 0), tan: std(0xa58e66, 0.95, 0), pla: std(0x586d46, 0.95, 0), plaDark: std(0x3c4b31, 0.95, 0), fleckDark: std(0x424b36, 0.95, 0),   // US, Chinese and European field kit
    salvage: std(0x6a5c40, 0.85, 0.2),
    jet: std(0x8a9096, 0.5, 0.6),
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
    faction,
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
// ---------------- infantry ----------------
// One soldier, about 1.55 units tall, facing +X. Proper proportions: boots, shins and thighs, hips and belt, a torso
// with a vest and pouches, shoulders, both arms brought to the weapon, neck, head and headgear, a pack. Each leg is
// its own node hinged at the hip (`m.userData.legs`), so the view can swing them when the squad walks; everything else
// is baked into the man. The owner's colour is on both upper arms, round the helmet and on top of the pack.
//   o.cloth / o.legs  uniform and trousers          o.vest   plate carrier (with three pouches)   o.rig  chest rig only
//   o.helmet          headgear shape (see headgear) o.hat    its material                         o.gun  what he carries
//   o.pose            'rifle' | 'shoulder' | 'down' | 'type'                                       o.pack pack material
const HIP = 0.76;
function leg(m, s, trousers, boots, o) {
  const l = grp(m, 0, HIP, s * 0.1);
  box(l, trousers, 0.16, 0.36, 0.15, 0, -0.18, 0); box(l, trousers, 0.13, 0.32, 0.13, -0.005, -0.5, 0);          // thigh, shin
  if (o.kneepads) box(l, o.kneepads, 0.05, 0.1, 0.12, 0.075, -0.36, 0);
  if (o.greaves) box(l, o.greaves, 0.15, 0.28, 0.15, 0.005, -0.5, 0);
  box(l, boots, 0.14, 0.12, 0.14, 0, -0.68, 0); box(l, boots, 0.25, 0.075, 0.14, 0.05, -0.722, 0);                  // boot: ankle and foot
  return l;
}
// Arms. Shoulders are at y 1.24, z +-0.22; the right hand is the firing hand. Returns nothing: boxes are added to `m`.
function arms(m, T, sleeve, skin, pose, band = true) {
  const up = (s, x, y, z, rz, len = 0.27) => { const a = box(m, sleeve, 0.1, len, 0.1, x, y, s * z); a.rotation.z = rz; if (band) { const t = box(m, T.accent, 0.112, 0.075, 0.112, x - Math.sin(rz) * 0.03, y + 0.03, s * z); t.rotation.z = rz; } };
  const hand = (x, y, z) => box(m, skin, 0.07, 0.07, 0.07, x, y, z);
  if (pose === 'down') { // at his sides
    for (const s of [-1, 1]) { up(s, 0, 1.12, 0.235, 0, 0.26); box(m, sleeve, 0.09, 0.24, 0.09, 0.01, 0.88, s * 0.235); hand(0.02, 0.74, s * 0.235); }
  } else if (pose === 'type') { // forearms level in front, carrying something on them
    for (const s of [-1, 1]) { up(s, 0.02, 1.12, 0.235, 0.12, 0.26); box(m, sleeve, 0.26, 0.085, 0.085, 0.15, 0.98, s * 0.19); hand(0.3, 0.98, s * 0.17); }
  } else if (pose === 'shoulder') { // a launcher on the right shoulder: right hand at the grip under it, left hand steadying the tube
    up(1, 0.07, 1.16, 0.24, 0.75, 0.24); box(m, sleeve, 0.09, 0.2, 0.09, 0.2, 1.17, 0.22); hand(0.2, 1.27, 0.2);
    up(-1, 0.07, 1.15, 0.22, 0.7, 0.25); const f = box(m, sleeve, 0.42, 0.085, 0.085, 0.3, 1.2, -0.04); f.rotation.y = -0.78; hand(0.46, 1.24, 0.12);
  } else { // 'rifle': weapon across the body, butt at the right shoulder
    up(1, 0.05, 1.13, 0.235, 0.42); box(m, sleeve, 0.24, 0.085, 0.085, 0.2, 1.0, 0.2); hand(0.31, 0.985, 0.165);
    up(-1, 0.07, 1.14, 0.225, 0.62); const f = box(m, sleeve, 0.45, 0.085, 0.085, 0.31, 1.025, -0.07); f.rotation.y = -0.72; hand(0.5, 1.03, 0.09);
  }
}
function headgear(m, T, o) {
  const mat = o.hat || M.olive, band = (w, y, d = w * 1.04) => box(m, T.accent, w, 0.034, d, 0, y, 0);
  switch (o.helmet) {
    case 'mich': // US high-cut combat helmet with a mount on the brow
      add(m, G.dome, mat, 0.126, 0.118, 0.132, 0, 1.44, 0); box(m, mat, 0.235, 0.05, 0.25, -0.012, 1.43, 0); box(m, M.dark, 0.04, 0.05, 0.07, 0.118, 1.475, 0); band(0.262, 1.462); break;
    case 'qgf': // Chinese helmet: rounder, with a short brim all round
      add(m, G.dome, mat, 0.13, 0.112, 0.13, 0, 1.445, 0); cyl(m, mat, 0.142, 0.022, 0, 1.44, 0); band(0.27, 1.468); break;
    case 'ssh': // Russian helmet: deep shell that covers the ears
      add(m, G.dome, mat, 0.128, 0.122, 0.134, 0, 1.44, 0); box(m, mat, 0.13, 0.08, 0.272, -0.02, 1.41, 0); band(0.266, 1.466, 0.284); break;
    case 'shemagh': // head wrap, a scarf across the face and a tail down the neck
      add(m, G.sph, mat, 0.116, 0.1, 0.12, -0.008, 1.47, 0); box(m, mat, 0.06, 0.075, 0.17, 0.085, 1.375, 0); box(m, mat, 0.05, 0.17, 0.15, -0.1, 1.31, 0); band(0.24, 1.455, 0.252); break;
    case 'kepi': // the Legion's white kepi with a dark peak
      cyl(m, M.white, 0.104, 0.09, 0, 1.535, 0); box(m, M.dark, 0.1, 0.016, 0.17, 0.125, 1.497, 0); cyl(m, T.accent, 0.108, 0.03, 0, 1.502, 0); break;
    case 'cap': // knitted wool cap
      add(m, G.sph, mat, 0.108, 0.085, 0.11, -0.005, 1.475, 0); cyl(m, T.accent, 0.107, 0.03, -0.004, 1.455, 0); break;
    case 'boonie': // soft hat with a brim all round
      cyl(m, mat, 0.17, 0.016, 0, 1.47, 0); add(m, G.dome, mat, 0.106, 0.075, 0.106, 0, 1.475, 0); cyl(m, T.accent, 0.109, 0.026, 0, 1.49, 0); break;
    case 'hard': // hard hat
      add(m, G.dome, mat, 0.12, 0.1, 0.122, 0, 1.455, 0); cyl(m, mat, 0.135, 0.016, 0.02, 1.455, 0); box(m, T.accent, 0.06, 0.02, 0.2, 0, 1.556, 0); break;
    case 'hood': // hood up
      add(m, G.sph, mat, 0.122, 0.125, 0.122, -0.022, 1.435, 0); box(m, mat, 0.07, 0.12, 0.2, -0.1, 1.3, 0); break;
    default: // bare head: short hair
      add(m, G.sph, o.hair || M.black, 0.105, 0.085, 0.108, -0.012, 1.465, 0);
  }
}
function weapon(m, kind) {
  const g = grp(m, 0.3, 1.0, 0.15), P = (mat, sx, sy, sz, x, y, z = 0, rz = 0) => { const b = box(g, mat, sx, sy, sz, x, y, z); if (rz) b.rotation.z = rz; return b; }, tube = (mat, r, len, x, y, z = 0) => cyl(g, mat, r, len, x, y, z, 'x', G.cyl8);
  switch (kind) {
    case 'm4': // M4 carbine: flat-top receiver with an optic, round handguard, collapsible stock on a tube, straight-ish magazine
      P(M.gun, 0.26, 0.07, 0.045, 0, 0); P(M.gun, 0.2, 0.052, 0.052, 0.22, 0.005); tube(M.gun, 0.012, 0.2, 0.42, 0.005); P(M.gun, 0.02, 0.06, 0.02, 0.36, 0.05);
      P(M.dark, 0.1, 0.04, 0.035, 0.02, 0.055); P(M.gun, 0.05, 0.15, 0.03, 0.05, -0.105, 0, 0.15); P(M.gun, 0.04, 0.09, 0.03, -0.07, -0.075, 0, -0.2); tube(M.gun, 0.014, 0.16, -0.2, 0.005); P(M.gun, 0.05, 0.11, 0.035, -0.28, -0.015); break;
    case 'm4s': // the same carbine with a suppressor
      weapon(m, 'm4'); tube(M.dark, 0.022, 0.2, 0.6, 0.005); break;
    case 'aks': // suppressed assault rifle (AS Val): the AK shape with a fat suppressor for a barrel
      weapon(m, 'ak'); tube(M.dark, 0.026, 0.3, 0.42, 0.0); break;
    case 'm203': // carbine with a grenade launcher under the barrel
      weapon(m, 'm4'); tube(M.gun, 0.028, 0.24, 0.26, -0.045); break;
    case 'qbz': // QBZ-95: a bullpup. Magazine behind the grip, long carrying handle over the top, short barrel
      P(M.gun, 0.44, 0.078, 0.046, -0.06, 0); P(M.gun, 0.26, 0.02, 0.022, -0.02, 0.085); for (const x of [-0.14, 0.1]) P(M.gun, 0.022, 0.05, 0.022, x, 0.058);
      P(M.gun, 0.05, 0.15, 0.03, -0.17, -0.1, 0, 0.3); P(M.gun, 0.04, 0.09, 0.03, 0.0, -0.075, 0, -0.15); P(M.gun, 0.1, 0.014, 0.022, 0.03, -0.115); tube(M.gun, 0.012, 0.16, 0.24, 0.0); tube(M.gun, 0.018, 0.04, 0.33, 0.0); break;
    case 'ak': // Kalashnikov: wooden stock and handguard, gas tube over the barrel, long curved magazine
      P(M.gun, 0.26, 0.064, 0.04, 0, 0); P(M.wood, 0.17, 0.05, 0.046, 0.2, -0.004); tube(M.gun, 0.011, 0.26, 0.4, 0.0); tube(M.gun, 0.009, 0.16, 0.25, 0.032); P(M.gun, 0.02, 0.06, 0.016, 0.5, 0.03);
      P(M.gun, 0.05, 0.1, 0.03, 0.05, -0.08, 0, 0.3); P(M.gun, 0.046, 0.1, 0.03, 0.09, -0.16, 0, 0.62); P(M.wood, 0.04, 0.09, 0.03, -0.08, -0.07, 0, -0.2); P(M.wood, 0.24, 0.07, 0.04, -0.25, -0.022, 0, 0.12); break;
    case 'famas': // FAMAS: a bullpup with the big carrying handle that gives it its nickname, the bugle
      P(M.gun, 0.5, 0.082, 0.05, -0.05, 0); P(M.gun, 0.34, 0.02, 0.022, 0.0, 0.1); for (const x of [-0.16, 0.16]) P(M.gun, 0.022, 0.07, 0.022, x, 0.065);
      P(M.gun, 0.045, 0.13, 0.03, -0.15, -0.1); P(M.gun, 0.04, 0.09, 0.03, 0.02, -0.075, 0, -0.15); tube(M.gun, 0.012, 0.18, 0.28, 0.0); for (const z of [-0.03, 0.03]) tube(M.gun, 0.006, 0.2, 0.1, 0.05, z); break;
    case 'long': // bolt-action sniper rifle: long barrel, telescopic sight, bipod, a cheek-piece stock
      P(M.gun, 0.3, 0.06, 0.045, 0, 0); P(M.olive, 0.3, 0.075, 0.045, -0.28, -0.02, 0, 0.08); P(M.olive, 0.24, 0.05, 0.05, 0.24, -0.008); tube(M.gun, 0.012, 0.5, 0.58, 0.004); tube(M.gun, 0.02, 0.1, 0.86, 0.004);
      tube(M.dark, 0.026, 0.26, 0.02, 0.075); tube(M.dark, 0.034, 0.05, 0.16, 0.075); for (const z of [-1, 1]) { const b = cyl(g, M.gun, 0.008, 0.2, 0.38, -0.1, z * 0.035, 'y', G.cyl8); b.rotation.x = z * 0.3; } break;
    case 'm60': // the Vet's machine gun: heavy receiver with a feed cover, long barrel, bipod, carrying handle, a belt hanging from it
      P(M.gun, 0.46, 0.1, 0.07, 0, 0); P(M.gun, 0.2, 0.03, 0.075, 0.02, 0.065); P(M.dark, 0.3, 0.07, 0.065, 0.34, -0.005); tube(M.gun, 0.018, 0.5, 0.72, 0.01); tube(M.gun, 0.026, 0.08, 0.99, 0.01);
      P(M.gun, 0.12, 0.02, 0.02, 0.3, 0.075); P(M.dark, 0.26, 0.1, 0.05, -0.34, -0.02); P(M.gun, 0.04, 0.1, 0.03, -0.1, -0.09, 0, -0.2); P(M.yellow, 0.05, 0.26, 0.04, 0.03, -0.16, 0.05);
      for (const z of [-1, 1]) { const b = cyl(g, M.gun, 0.009, 0.26, 0.86, -0.1, z * 0.05, 'y', G.cyl8); b.rotation.x = z * 0.3; } break;
  }
  return g;
}
function man(parent, T, x, z, o) {
  const m = grp(parent, x, 0, z), cloth = o.cloth || M.khaki, trousers = o.legs || cloth, boots = o.boots || M.black, skin = o.skin || M.skin, pose = o.pose || (o.gun === 'rpg' ? 'shoulder' : o.gun === 'laptop' || o.gun === 'milan' || o.gun === 'mortar' ? 'type' : o.gun === 'tool' || o.gun === 'satchel' || o.gun === 'none' ? 'down' : 'rifle');
  m.userData.legs = [-1, 1].map(s => leg(m, s, trousers, boots, o));
  box(m, trousers, 0.2, 0.14, 0.3, 0, 0.78, 0); box(m, o.belt || M.dark, 0.215, 0.05, 0.31, 0, 0.865, 0);          // hips, belt
  box(m, cloth, 0.2, 0.4, 0.33, 0, 1.07, 0); box(m, cloth, 0.18, 0.1, 0.44, 0, 1.24, 0);                            // torso, shoulders
  if (o.vest) { box(m, o.vest, 0.25, 0.3, 0.3, 0.004, 1.06, 0); for (const pz of [-0.09, 0, 0.09]) box(m, o.vest, 0.06, 0.11, 0.075, 0.15, 0.97, pz); box(m, o.vest, 0.05, 0.12, 0.12, -0.14, 0.95, 0.06); }   // plate carrier, magazine pouches, a pouch on the back
  if (o.rig) { for (const pz of [-0.1, 0, 0.1]) box(m, o.rig, 0.06, 0.15, 0.085, 0.125, 1.0, pz); for (const s of [-1, 1]) box(m, o.rig, 0.215, 0.36, 0.04, 0, 1.1, s * 0.1); }   // chest rig: three magazine pouches on shoulder straps
  cyl(m, skin, 0.05, 0.08, 0, 1.32, 0); add(m, G.sph, skin, 0.1, 0.115, 0.1, 0.008, 1.42, 0);                         // neck, head
  headgear(m, T, o); arms(m, T, o.sleeve || cloth, skin, pose);
  if (o.pack) { box(m, o.pack, 0.15, 0.32, 0.27, -0.19, 1.08, 0); box(m, o.pack, 0.07, 0.14, 0.2, -0.28, 1.02, 0); box(m, T.accent, 0.12, 0.02, 0.21, -0.19, 1.25, 0); }   // pack, its outer pocket, a recognition panel on top
  else box(m, T.accent, 0.02, 0.13, 0.2, -0.108, 1.14, 0);                                                           // no pack: the panel is on his back
  switch (o.gun) {
    case 'rifle': weapon(m, o.arm || 'm4'); break;
    case 'long': weapon(m, 'long'); break;
    case 'rpg': { // RPG-7 on the right shoulder: tube with a flared rear, the pointed warhead out in front, an optical sight
      cyl(m, M.olive, 0.042, 0.95, 0.12, 1.33, 0.2, 'x', G.cyl8); cyl(m, M.wood, 0.05, 0.3, -0.05, 1.33, 0.2, 'x', G.cyl8); add(m, G.cone, M.olive, 0.075, 0.2, 0.075, -0.45, 1.33, 0.2).rotation.z = -Math.PI / 2;
      add(m, G.cone, M.gun, 0.085, 0.3, 0.085, 0.87, 1.33, 0.2).rotation.z = -Math.PI / 2; cyl(m, M.gun, 0.085, 0.1, 0.67, 1.33, 0.2, 'x', G.cyl8); cyl(m, M.gun, 0.035, 0.12, 0.56, 1.33, 0.2, 'x', G.cyl8);
      box(m, M.dark, 0.1, 0.07, 0.04, 0.25, 1.4, 0.16); box(m, M.gun, 0.03, 0.09, 0.03, 0.2, 1.26, 0.2);
      for (const dz of [-0.07, 0.07]) add(m, G.cone, M.gun, 0.05, 0.22, 0.05, -0.2, 1.33, dz - 0.05);                 // two spare rounds standing in the pack
      break; }
    case 'laptop': box(m, M.dark, 0.3, 0.025, 0.36, 0.36, 1.03, 0); box(m, M.laser, 0.025, 0.24, 0.34, 0.5, 1.15, 0).rotation.z = -0.25; cyl(m, M.gun, 0.008, 0.5, -0.2, 1.45, 0.1); break;   // open laptop on his forearms, aerial on the pack
    case 'tool': box(m, M.red, 0.3, 0.17, 0.14, 0.04, 0.62, 0.235); box(m, M.gun, 0.16, 0.025, 0.03, 0.04, 0.72, 0.235); cyl(m, M.wood, 0.018, 0.9, -0.14, 1.1, 0, 'y', G.cyl8).rotation.x = 0.5; box(m, M.steel, 0.02, 0.2, 0.16, -0.14, 1.52, -0.22).rotation.x = 0.5; break;   // toolbox in hand, shovel across his back
    case 'satchel': box(m, M.olive, 0.16, 0.24, 0.26, 0.03, 0.6, 0.235); box(m, M.olive, 0.03, 0.14, 0.03, 0.03, 0.76, 0.235); box(m, M.olive, 0.16, 0.26, 0.28, -0.19, 1.05, 0); cyl(m, M.gun, 0.012, 0.1, -0.19, 1.22, 0.08); break;   // a satchel charge in hand and another on his back
    case 'mortar': { // 82 mm mortar in front of the gunner: tube on a round baseplate, steadied by a two-legged stand; a shell in his hands
      cyl(m, M.gun, 0.22, 0.04, 0.5, 0.03, 0); const tube = cyl(m, M.olive, 0.055, 1.05, 0.66, 0.5, 0, 'y', G.cyl8); tube.rotation.z = -0.38; cyl(m, M.gun, 0.065, 0.06, 0.85, 0.98, 0, 'y', G.cyl8).rotation.z = -0.38;
      for (const sz of [-1, 1]) { const l = cyl(m, M.gun, 0.016, 0.8, 0.9, 0.38, sz * 0.16, 'y', G.cyl8); l.rotation.x = sz * 0.36; l.rotation.z = 0.2; }
      cyl(m, M.olive, 0.04, 0.2, 0.3, 1.02, 0, 'y', G.cyl8); add(m, G.cone, M.gun, 0.04, 0.1, 0.04, 0.3, 1.17, 0);
      break; }
    case 'milan': { // MILAN on its tripod in front of the gunner: launch tube, the sight unit on its left, three splayed legs
      for (const a of [0, 2.1, 4.2]) { const l = cyl(m, M.gun, 0.02, 0.92, 0.62 + Math.cos(a) * 0.17, 0.44, Math.sin(a) * 0.17, 'y', G.cyl8); l.rotation.z = Math.cos(a) * 0.36; l.rotation.x = -Math.sin(a) * 0.36; }
      cyl(m, M.olive, 0.085, 1.1, 0.66, 0.96, 0, 'x'); cyl(m, M.gun, 0.1, 0.06, 1.22, 0.96, 0, 'x'); box(m, M.dark, 0.22, 0.2, 0.15, 0.48, 1.04, 0.17); cyl(m, M.gun, 0.03, 0.08, 0.6, 1.04, 0.17, 'x', G.cyl8);
      break; }
  }
  return m;
}
const legsOf = (men) => men.flatMap(m => m.userData.legs);
function squad(T, spots, o) {
  const g = new THREE.Group(), b = grp(g), men = spots.map(([x, z], i) => man(b, T, x, z, typeof o === 'function' ? o(i) : o));
  return { g, body: b, men, legs: legsOf(men), muzzle: 0.9, muzzleY: 1.0 };
}
// What each faction's soldiers wear and carry.
function kit(f) {
  switch (f) {
    case 'vanguard': return { cloth: M.multicam, vest: M.coyote, helmet: 'mich', hat: M.multicam, arm: 'm4', boots: M.tan, pack: M.coyote, kneepads: M.coyote };   // US: MultiCam, high-cut helmet, M4
    case 'redhammer': return { cloth: M.pla, vest: M.plaDark, helmet: 'qgf', hat: M.pla, arm: 'qbz', boots: M.black, pack: M.plaDark };                             // China: green digital camouflage, QBZ-95
    case 'ursa': return { cloth: M.emr, vest: M.olive, helmet: 'ssh', hat: M.olive, arm: 'ak', boots: M.black, pack: M.olive };                                     // Russia: EMR, deep helmet, AK
    case 'aegis': return { cloth: M.fleck, vest: M.fleckDark, helmet: 'kepi', arm: 'famas', boots: M.black, pack: M.fleckDark };                                    // Europe: flecked camouflage, white kepi, FAMAS
    default: return { cloth: M.cloth, legs: M.khaki, rig: M.olive, helmet: 'shemagh', hat: M.dark, arm: 'ak', boots: M.dark };                                      // ISIS: loose shirt, chest rig, head wrap, AK
  }
}
// ---------------- heroes ----------------
// One figure each, drawn 1.4 times the size of a soldier so it can be picked out in a crowd. Forward is +X. `build`
// returns the leg nodes that swing when the hero walks (in stride order: alternate legs are half a step apart).
function heroRig(build) { const g = new THREE.Group(), b = grp(g), m = grp(b); m.scale.setScalar(1.4); const legs = build(m) || []; return { g, body: b, men: [m], legs, muzzle: 1.3, muzzleY: 1.45 }; }
// Disabled Vet: long black hair and a red headband, bare chest, camouflage trousers, an M60 in the right hand and an RPG in the left.
function vet(T) {
  return heroRig((m) => {
    const legs = [-1, 1].map(s => { const l = leg(m, s, M.camo, M.black, {}); box(l, M.olive, 0.165, 0.1, 0.155, 0, -0.3, 0); box(l, M.dark, 0.06, 0.16, 0.05, 0.03, -0.2, s * 0.09); return l; });   // trousers with a darker band at the knee, a thigh pocket
    box(m, M.camo, 0.21, 0.14, 0.31, 0, 0.78, 0); box(m, M.black, 0.225, 0.06, 0.32, 0, 0.865, 0); box(m, M.steel, 0.02, 0.05, 0.07, 0.115, 0.865, 0);                      // hips, belt and buckle
    box(m, M.skin, 0.2, 0.2, 0.3, 0, 0.98, 0); box(m, M.skin, 0.23, 0.22, 0.38, 0.005, 1.17, 0); box(m, M.skin, 0.2, 0.09, 0.48, 0, 1.26, 0);                                // bare torso: waist, chest, shoulders
    for (const s of [-1, 1]) box(m, M.skin, 0.03, 0.1, 0.15, 0.115, 1.19, s * 0.085);                                                                                           // chest muscles
    for (const s of [-1, 1]) box(m, M.yellow, 0.245, 0.05, 0.06, 0.004, 1.1, 0).rotation.x = s * 0.8;                                                                           // two ammunition belts crossed over the chest
    cyl(m, M.skin, 0.055, 0.08, 0, 1.33, 0); add(m, G.sph, M.skin, 0.105, 0.12, 0.105, 0.008, 1.43, 0);
    add(m, G.sph, M.black, 0.118, 0.1, 0.122, -0.015, 1.48, 0); box(m, M.black, 0.09, 0.42, 0.26, -0.115, 1.25, 0); for (const s of [-1, 1]) box(m, M.black, 0.1, 0.24, 0.05, -0.03, 1.36, s * 0.115);   // long black hair, down the back and past the ears
    box(m, M.red, 0.232, 0.04, 0.24, 0, 1.47, 0); for (const k of [0, 1]) box(m, M.red, 0.16, 0.03, 0.035, -0.19, 1.43 - k * 0.05, -0.03 + k * 0.07).rotation.z = 0.5 + k * 0.3;   // red headband with its tails
    // right arm down to the machine gun at the hip; left arm bent up, holding the RPG on the shoulder
    box(m, M.skin, 0.115, 0.28, 0.115, 0.04, 1.11, 0.27).rotation.z = 0.3; box(m, M.skin, 0.26, 0.1, 0.1, 0.2, 0.96, 0.27); box(m, M.skin, 0.08, 0.08, 0.08, 0.33, 0.95, 0.27);
    box(m, M.skin, 0.115, 0.26, 0.115, 0.06, 1.14, -0.27).rotation.z = 0.7; box(m, M.skin, 0.1, 0.22, 0.1, 0.19, 1.2, -0.26); box(m, M.skin, 0.08, 0.08, 0.08, 0.19, 1.32, -0.25);
    box(m, T.accent, 0.125, 0.08, 0.125, 0.03, 1.14, 0.27).rotation.z = 0.3; box(m, T.accent, 0.125, 0.08, 0.125, 0.045, 1.16, -0.27).rotation.z = 0.7;                       // armbands in the owner's colour
    const g = weapon(m, 'm60'); g.position.set(0.42, 0.93, 0.27);
    cyl(m, M.olive, 0.045, 1.0, 0.16, 1.38, -0.25, 'x', G.cyl8); cyl(m, M.wood, 0.053, 0.3, 0.0, 1.38, -0.25, 'x', G.cyl8); add(m, G.cone, M.olive, 0.08, 0.2, 0.08, -0.44, 1.38, -0.25).rotation.z = -Math.PI / 2;   // RPG-7 on the left shoulder
    add(m, G.cone, M.gun, 0.09, 0.32, 0.09, 0.95, 1.38, -0.25).rotation.z = -Math.PI / 2; cyl(m, M.gun, 0.09, 0.1, 0.74, 1.38, -0.25, 'x', G.cyl8);
    return legs;
  });
}
// Fook Mie: a woman in a red dress, a phone held up in one hand.
function fookmie(T) {
  return heroRig((m) => {
    const legs = [-1, 1].map(s => { const l = grp(m, 0, 0.7, s * 0.075); box(l, M.skin, 0.085, 0.3, 0.085, 0, -0.2, 0); box(l, M.skin, 0.075, 0.3, 0.075, 0, -0.48, 0); box(l, M.dress, 0.2, 0.05, 0.085, 0.04, -0.675, 0); box(l, M.dress, 0.03, 0.09, 0.03, -0.05, -0.65, 0); return l; });   // legs, red shoes with heels
    add(m, G.cone, M.dress, 0.26, 0.5, 0.26, 0, 0.72, 0); cyl(m, M.dress, 0.26, 0.03, 0, 0.475, 0);                                                                       // skirt flaring from the waist to the knee
    box(m, M.dress, 0.17, 0.2, 0.25, 0, 0.98, 0); box(m, M.dress, 0.19, 0.2, 0.3, 0.008, 1.16, 0); box(m, T.accent, 0.18, 0.045, 0.262, 0, 0.9, 0);                       // fitted bodice; the sash at the waist is in the owner's colour
    box(m, M.skin, 0.15, 0.06, 0.38, 0, 1.275, 0); cyl(m, M.skin, 0.042, 0.08, 0, 1.33, 0); add(m, G.sph, M.skin, 0.098, 0.112, 0.098, 0.008, 1.425, 0);                    // bare shoulders, neck, head
    add(m, G.sph, M.black, 0.115, 0.105, 0.118, -0.02, 1.455, 0); box(m, M.black, 0.07, 0.4, 0.22, -0.105, 1.23, 0); for (const s of [-1, 1]) box(m, M.black, 0.08, 0.26, 0.04, -0.02, 1.33, s * 0.105);   // long black hair
    box(m, M.skin, 0.075, 0.26, 0.075, 0, 1.13, -0.2); box(m, M.skin, 0.07, 0.24, 0.07, 0.01, 0.9, -0.2); box(m, M.dress, 0.05, 0.16, 0.16, 0.02, 0.72, -0.24);            // left arm down, a red handbag in the hand
    box(m, M.skin, 0.075, 0.24, 0.075, 0.03, 1.15, 0.2).rotation.z = 0.25; box(m, M.skin, 0.07, 0.25, 0.07, 0.075, 1.19, 0.185).rotation.z = -2.6; box(m, M.skin, 0.06, 0.06, 0.06, 0.07, 1.36, 0.16);   // right arm bent up to the ear
    box(m, M.dark, 0.03, 0.15, 0.075, 0.09, 1.4, 0.13); box(m, T.glow, 0.012, 0.115, 0.058, 0.108, 1.4, 0.13);                                                               // the phone, its screen lit in the owner's colour
    return legs;
  });
}
// The Phantom: black tracksuit with blue stripes, hood up, nothing in his hands.
function phantom(T) {
  return heroRig((m) => {
    const legs = [-1, 1].map(s => { const l = leg(m, s, M.black, M.white, {}); box(l, M.blue, 0.05, 0.66, 0.02, 0, -0.33, s * 0.078); box(l, M.dark, 0.25, 0.02, 0.145, 0.05, -0.755, 0); return l; });   // trousers with a side stripe, white trainers
    box(m, M.black, 0.21, 0.14, 0.31, 0, 0.78, 0); box(m, M.black, 0.22, 0.42, 0.35, 0, 1.07, 0); box(m, M.black, 0.19, 0.1, 0.46, 0, 1.24, 0); box(m, M.black, 0.235, 0.06, 0.36, 0, 0.88, 0);             // jacket with a ribbed hem
    box(m, M.blue, 0.225, 0.07, 0.355, 0, 1.17, 0); box(m, M.blue, 0.012, 0.36, 0.03, 0.112, 1.05, 0); for (const s of [-1, 1]) box(m, M.black, 0.03, 0.09, 0.1, 0.105, 0.96, s * 0.1);                    // chest band, zip, pockets
    for (const s of [-1, 1]) { box(m, M.black, 0.11, 0.28, 0.11, 0, 1.11, s * 0.245); box(m, M.black, 0.1, 0.26, 0.1, 0.01, 0.86, s * 0.245); box(m, M.blue, 0.03, 0.52, 0.02, 0, 0.99, s * 0.302); box(m, M.skin, 0.07, 0.08, 0.07, 0.02, 0.7, s * 0.245); }   // arms at his sides with a stripe down each, empty hands
    box(m, T.accent, 0.12, 0.075, 0.12, 0, 1.14, 0.245); box(m, T.accent, 0.12, 0.075, 0.12, 0, 1.14, -0.245);                                                               // armbands in the owner's colour
    cyl(m, M.skin, 0.05, 0.08, 0, 1.32, 0); add(m, G.sph, M.skin, 0.098, 0.115, 0.098, 0.014, 1.42, 0);
    add(m, G.sph, M.black, 0.128, 0.132, 0.128, -0.022, 1.44, 0); box(m, M.black, 0.03, 0.035, 0.2, 0.105, 1.51, 0); box(m, M.black, 0.08, 0.14, 0.24, -0.1, 1.3, 0);          // hood up, its rim shading the face
    for (const s of [-1, 1]) box(m, M.white, 0.012, 0.14, 0.012, 0.115, 1.25, s * 0.03);                                                                                       // drawstrings
    return legs;
  });
}
// A plain civilian saloon car (The Phantom's car bomb).
function car(T) {
  const g = new THREE.Group(), b = grp(g);
  wheels(b, [1.15, -1.15], 0.72, 0.32, 0.22);
  box(b, M.white, 3.8, 0.5, 1.55, 0, 0.62, 0); box(b, M.white, 1.9, 0.12, 1.4, -0.2, 1.36, 0); box(b, M.glass, 2.0, 0.46, 1.42, -0.2, 1.08, 0);
  for (const x of [0.75, -1.15]) box(b, M.white, 0.1, 0.46, 1.44, x, 1.08, 0);
  box(b, M.dark, 0.08, 0.16, 1.3, 1.9, 0.6, 0); for (const k of [-1, 1]) { box(b, M.yellow, 0.06, 0.12, 0.24, 1.9, 0.72, k * 0.55); box(b, M.red, 0.06, 0.12, 0.24, -1.9, 0.72, k * 0.55); }
  return { g, body: b, muzzle: 0, muzzleY: 0 };
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
function airfield(T, d) {
  const g = new THREE.Group(), L = d.layout, SW = d.w * CELL - 0.4, SD = d.h * CELL - 0.4, RH = L.runwayHalf || 18, HG = L.hangar || HANGAR;   // the Strategic Airfield is the same building at a larger size
  slab(g, SW, SD, M.tarmac, 0.4);
  for (const rz of L.runways) {
    for (const z of [rz - 3.0, rz + 3.0]) box(g, M.white, RH * 2, 0.05, 0.16, 0, 0.38, z);                          // runway edge lines
    for (let x = -RH + 2.4; x <= RH - 2.4 + 1e-6; x += 2.6) box(g, M.white, 1.5, 0.05, 0.22, x, 0.38, rz);          // centreline dashes
    for (const x of [-RH + 0.8, RH - 0.8]) for (let k = -3; k <= 3; k++) box(g, M.white, 1.5, 0.05, 0.3, x, 0.38, rz + k * 0.78); // threshold bars
  }
  // One hangar per aircraft, big enough for the largest that parks there. The door faces south ('s') or east ('e') and
  // stands open: the aircraft parks inside with its nose at the door.
  const W = HG.w, D = HG.d, H = HG.h, rise = W > 12 ? 1.5 : 1.0;
  for (const [x, z, face] of L.hangars) {
    const h = grp(g, x, 0.35, z); if (face === 'e') h.rotation.y = Math.PI / 2;                                     // built facing south (+z), turned for an east door
    box(h, T.wall, W, H, 0.3, 0, H / 2, -D / 2 + 0.15); for (const s of [-1, 1]) box(h, T.wall, 0.3, H, D, s * (W / 2 - 0.15), H / 2, 0);   // back and side walls
    const roof = cyl(h, T.roof, 1, D, 0, H, 0, 'z', G.cyl8); roof.scale.set(W / 2 + 0.15, D, rise);                      // shallow arched roof
    box(h, T.accent, W + 0.1, 0.3, 0.14, 0, H + 0.1, D / 2); box(h, M.dark, W - 0.7, H - 0.3, 0.1, 0, H / 2 - 0.1, -D / 2 + 0.36);   // door lintel in team colour, dark back wall
    box(h, M.slab, W - 0.6, 0.04, D - 0.4, 0, 0.03, 0); for (const s of [-1, 1]) box(h, M.yellow, 0.12, 0.05, D - 1, s * (W / 2 - 1.0), 0.06, 0.2);   // hangar floor and wingtip lines
  }
  for (let i = 0; i < L.aprons.length; i++) { // taxi line: out of the door to the apron, then down to the runway
    const [ax, az] = L.aprons[i], [sx, sz] = L.spots[i], len = Math.hypot(ax - sx, az - sz);
    const l = box(g, M.yellow, len, 0.05, 0.14, (ax + sx) / 2, 0.38, (az + sz) / 2); l.rotation.y = -Math.atan2(az - sz, ax - sx);
    box(g, M.yellow, 0.14, 0.05, Math.max(0.1, L.runways[0] - 3 - az), ax, 0.38, (az + L.runways[0] - 3) / 2);
  }
  const [hx, hz] = L.helipad;
  cyl(g, M.yellow, 3.0, 0.05, hx, 0.38, hz); cyl(g, M.tarmac, 2.7, 0.06, hx, 0.39, hz);                             // helipad ring
  for (const s of [-1, 1]) box(g, M.white, 0.3, 0.05, 2.0, hx + s * 0.7, 0.42, hz); box(g, M.white, 1.4, 0.05, 0.3, hx, 0.42, hz); // "H"
  const [tx, tz] = L.tower;
  box(g, T.wall, 2.0, 2.4, 2.4, tx, 1.5, tz); cyl(g, T.wall, 0.75, 5, tx, 4.4, tz); cyl(g, M.glass, 1.25, 1.1, tx, 7.2, tz); cyl(g, T.roof, 1.45, 0.25, tx, 7.9, tz); // control tower
  box(g, T.accent, 2.05, 0.3, 2.45, tx, 2.5, tz);
  const spin = grp(g, tx, 8.1, tz); box(spin, M.steel, 2.2, 0.5, 0.12, 0, 0.5, 0); cyl(spin, M.steel, 0.07, 0.5, 0, 0.2, 0);
  cyl(g, M.steel, 0.06, 2.4, SW / 2 - 1.4, 1.5, -1.2); box(g, M.red, 1.0, 0.45, 0.05, SW / 2 - 0.8, 2.5, -1.2);     // windsock
  return { g, spin, top: Math.max(9, H + rise + 2) };
}
// ---------------- defense sites: each is the real system, emplaced ----------------
// The part that turns to face a target is `turret`; `spin` is a search radar that turns all the time.
// Patriot (US): the M903 launching station: four missile canisters in a square, raised about 38 degrees on a trailer
// with outriggers; beside it the flat-faced phased-array radar on its own trailer, and a generator.
function patriot(T) {
  const g = new THREE.Group();
  cyl(g, M.slab, 3.8, 0.3, 0, 0.1, 0, 'y', G.cyl8);
  const tr = grp(g, 0.2, 0, 0.2); box(tr, M.dark, 4.4, 0.3, 2.0, 0, 0.55, 0); wheels(tr, [-1.2, -0.3], 1.0, 0.36, 0.3);                    // launcher trailer
  for (const [x, z] of [[2.1, 1.5], [2.1, -1.1], [-1.7, 1.5], [-1.7, -1.1]]) { box(g, M.steel, 0.14, 0.14, 0.9, x, 0.5, z + (z > 0 ? -0.2 : 0.2)); cyl(g, M.steel, 0.2, 0.3, x, 0.3, z); }   // outriggers and jacks
  const t = grp(g, 0.2, 0.75, 0.2); cyl(t, M.steel, 0.9, 0.18, 0, 0.05, 0);
  const arm = grp(t, -0.6, 0.35, 0); arm.rotation.z = 0.66;
  box(arm, M.gun, 3.4, 0.14, 1.9, 1.5, 0, 0);                                                                                           // launcher frame
  for (const y of [0.5, 1.42]) for (const z of [-0.47, 0.47]) { box(arm, T.hull, 3.5, 0.86, 0.88, 1.55, y, z); box(arm, M.dark, 0.05, 0.7, 0.72, 3.31, y, z); box(arm, M.dark, 0.06, 0.9, 0.92, 0.6, y, z); box(arm, M.dark, 0.06, 0.9, 0.92, 2.5, y, z); }   // four canisters with their end caps and bands
  box(arm, T.accent, 0.5, 1.82, 0.05, 1.5, 0.96, 0.94); box(arm, T.accent, 0.5, 1.82, 0.05, 1.5, 0.96, -0.94);
  box(t, M.gun, 0.8, 0.9, 1.2, -1.3, 0.55, 0);                                                                                           // power and electronics unit behind the canisters
  const r = grp(g, -2.3, 0.3, -2.4); r.rotation.y = 0.5;                                                                                 // radar set
  box(r, M.dark, 2.4, 0.3, 1.5, 0, 0.35, 0); wheels(r, [-0.6, 0.3], 0.75, 0.3, 0.25); box(r, T.hull, 1.2, 0.9, 1.4, -0.5, 0.95, 0);
  const face = box(r, T.hull, 0.22, 2.0, 1.7, 0.55, 1.5, 0); face.rotation.z = -0.3; box(r, M.dark, 0.05, 1.5, 1.3, 0.7, 1.55, 0).rotation.z = -0.3; cyl(r, M.dark, 0.2, 0.06, 0.62, 0.72, 0.5, 'x'); cyl(r, M.dark, 0.2, 0.06, 0.62, 0.72, -0.5, 'x');
  box(g, T.dark, 1.5, 1.1, 1.0, 2.5, 0.85, -2.6); box(g, M.gun, 0.3, 0.5, 0.3, 2.5, 1.6, -2.6); cyl(g, M.gun, 0.04, 3.0, 3.0, 1.8, -2.2);       // generator and its mast
  return { g, turret: t, muzzle: 2.6, muzzleY: 3.3 };
}
// Gatling Tower (China): the LD-2000 close-in gun: a seven-barrel 30 mm rotary cannon in an enclosed mount with
// its ammunition drums, a tracking dish and an optical head on top, set on a concrete base; the search radar turns
// on its own mast beside it.
function gatling(T) {
  const g = new THREE.Group();
  cyl(g, M.slab, 3.6, 0.5, 0, 0.2, 0, 'y', G.cyl8); cyl(g, M.concrete, 2.3, 2.6, 0, 1.7, 0, 'y', G.cyl8); cyl(g, T.roof, 2.45, 0.2, 0, 3.05, 0, 'y', G.cyl8); box(g, T.accent, 3.3, 0.3, 3.3, 0, 2.6, 0);
  for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; add(g, G.sph, M.sandbag, 0.8, 0.4, 0.45, Math.cos(a) * 3.0, 0.62, Math.sin(a) * 3.0).rotation.y = -a + 1.57; }
  const t = grp(g, 0, 3.15, 0); cyl(t, M.steel, 1.1, 0.2, 0, 0.1, 0);
  box(t, T.hull, 1.5, 1.3, 1.2, -0.2, 0.9, 0); box(t, T.dark, 1.1, 0.5, 1.22, -0.3, 1.7, 0);                                              // gun house
  for (const s of [-1, 1]) { cyl(t, T.dark, 0.5, 0.5, -0.1, 0.8, s * 0.85, 'z'); box(t, M.gun, 0.5, 0.1, 0.3, 0.3, 1.05, s * 0.75); }       // ammunition drums and feed chutes
  const gun = grp(t, 0.55, 1.0, 0); cyl(gun, M.gun, 0.26, 0.5, 0, 0, 0, 'x');
  for (let i = 0; i < 7; i++) { const a = i * Math.PI * 2 / 7; cyl(gun, M.gun, 0.045, 2.5, 1.35, Math.cos(a) * 0.13, Math.sin(a) * 0.13, 'x', G.cyl8); }
  for (const x of [1.0, 1.8, 2.55]) cyl(gun, M.steel, 0.2, 0.06, x, 0, 0, 'x');                                                           // barrel clamps
  cyl(t, M.steel, 0.07, 0.5, -0.5, 2.1, 0.3); const dish = add(t, G.dome, M.white, 0.55, 0.3, 0.55, -0.42, 2.45, 0.3); dish.rotation.z = -1.57; // tracking dish
  add(t, G.sph, M.laser, 0.2, 0.2, 0.2, -0.3, 2.15, -0.35); box(t, M.gun, 0.3, 0.3, 0.3, -0.5, 2.1, -0.35);                                 // optical head
  cyl(g, M.steel, 0.1, 3.4, -2.6, 2.0, -2.6); const spin = grp(g, -2.6, 3.8, -2.6); box(spin, M.steel, 1.9, 0.5, 0.12, 0, 0.3, 0); cyl(spin, M.steel, 0.07, 0.3, 0, 0, 0);
  return { g, turret: t, spin, muzzle: 3.2, muzzleY: 4.15, top: 6.4 };
}
// Stinger Site (ISIS): a sandbagged pit under a camouflage net. Two fighters stand in it, each with a Stinger tube
// on his shoulder; spare tubes are racked against the wall beside an ammunition crate.
function stinger(T) {
  const g = new THREE.Group();
  cyl(g, M.slab, 3.6, 0.3, 0, 0.1, 0, 'y', G.cyl8);
  for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5; add(g, G.sph, M.sandbag, 0.85, 0.42, 0.5, Math.cos(a) * 3.0, 0.55, Math.sin(a) * 3.0).rotation.y = -a + 1.57; if (i % 2) add(g, G.sph, M.sandbag, 0.8, 0.38, 0.48, Math.cos(a + 0.3) * 3.0, 1.1, Math.sin(a + 0.3) * 3.0).rotation.y = -a + 1.27; }
  box(g, M.ghillie, 3.0, 0.06, 3.0, -1.2, 2.9, -1.2).rotation.z = 0.08; for (const [x, z] of [[-2.6, -2.6], [0.2, -2.6], [-2.6, 0.2], [0.2, 0.2]]) cyl(g, M.wood, 0.06, 2.7, x, 1.5, z);   // camouflage net on four poles
  for (let i = 0; i < 3; i++) { const tube = cyl(g, M.olive, 0.09, 1.5, -2.1, 1.0, -1.6 + i * 0.3); tube.rotation.x = 0.2; } box(g, M.crateB, 1.0, 0.6, 0.7, -1.9, 0.6, 0.6); box(g, M.crateA, 0.8, 0.5, 0.6, -1.0, 0.55, -2.0);
  const t = grp(g, 0.7, 0.3, 0.7), o = { ...kit('sandstorm'), gun: 'none', pose: 'shoulder' };
  for (const z of [-0.45, 0.45]) { const m = man(t, T, z < 0 ? 0.15 : -0.15, z, o); m.scale.setScalar(1.25);
    cyl(m, M.olive, 0.05, 1.3, 0.15, 1.34, 0.2, 'x', G.cyl8); box(m, M.gun, 0.16, 0.2, 0.05, 0.62, 1.42, 0.2); cyl(m, M.gun, 0.06, 0.12, 0.84, 1.34, 0.2, 'x', G.cyl8); cyl(m, M.gun, 0.035, 0.16, 0.3, 1.24, 0.2); box(m, M.gun, 0.05, 0.12, 0.04, 0.2, 1.24, 0.2); }   // the tube, its folding aerial, the seeker cover, the battery unit and grip
  return { g, turret: t, muzzle: 1.4, muzzleY: 2.0 };
}
// Pantsir Site (Russia): a Pantsir-S1 on its 8x8 truck, jacked up on a pad: twelve missile tubes in two blocks of
// six, a twin 30 mm gun on each side, the flat tracking radar on the front and the search radar turning on top.
function pantsir(T) {
  const g = new THREE.Group();
  cyl(g, M.slab, 3.8, 0.3, 0, 0.1, 0, 'y', G.cyl8);
  box(g, M.dark, 6.0, 0.35, 1.7, 0, 0.95, 0); wheels(g, [2.3, 1.2, -1.2, -2.3], 0.95, 0.5, 0.36);                                       // KamAZ chassis
  box(g, T.hull, 1.5, 1.2, 1.9, 2.4, 1.7, 0); box(g, M.glass, 0.06, 0.5, 1.6, 3.16, 1.9, 0); box(g, T.dark, 3.6, 0.9, 1.9, -0.9, 1.55, 0);     // cab, equipment body
  for (const [x, z] of [[0.4, 1.4], [0.4, -1.4], [-2.6, 1.4], [-2.6, -1.4]]) { box(g, M.steel, 0.14, 0.14, 0.6, x, 0.9, z * 0.8); cyl(g, M.steel, 0.17, 0.7, x, 0.55, z); }
  const t = grp(g, -0.9, 2.0, 0); cyl(t, M.steel, 0.95, 0.2, 0, 0.1, 0);
  box(t, T.hull, 1.5, 1.3, 1.3, 0, 0.85, 0); box(t, T.accent, 1.52, 0.2, 1.32, 0, 0.4, 0);                                                 // turret body
  box(t, M.dark, 0.1, 0.9, 0.9, 0.82, 1.0, 0).rotation.z = -0.15;                                                                          // tracking radar face
  for (const s of [-1, 1]) {
    const blk = grp(t, 0.1, 1.15, s * 1.05); blk.rotation.z = 0.5;
    for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) cyl(blk, T.dark, 0.11, 2.2, 0.5, r * 0.26, (c - 1) * 0.25 * 1, 'x', G.cyl8);     // six tubes a side
    box(blk, M.gun, 0.3, 0.6, 0.85, -0.3, 0.13, 0);
    for (const dz of [-0.07, 0.07]) cyl(t, M.gun, 0.035, 2.0, 1.1, 0.62, s * (0.72 + dz), 'x', G.cyl8); box(t, M.gun, 0.6, 0.26, 0.26, 0.2, 0.62, s * 0.72);   // twin 30 mm
  }
  const spin = grp(t, -0.3, 1.6, 0); cyl(spin, M.steel, 0.08, 0.5, 0, 0.25, 0); box(spin, M.steel, 0.14, 0.6, 1.6, 0, 0.75, 0);                 // search radar
  return { g, turret: t, spin, muzzle: 2.3, muzzleY: 3.3, top: 5.6 };
}
// IRIS-T Battery (Europe): the IRIS-T SLM launcher on its 8x8 truck: eight missile canisters in two rows of four,
// raised steeply at the back; the radar on its mast stands beside it and turns all the time.
function irist(T) {
  const g = new THREE.Group();
  cyl(g, M.slab, 3.8, 0.3, 0, 0.1, 0, 'y', G.cyl8);
  const tr = grp(g, 0, 0, 0.6);                                                                                                         // MAN truck, parked off-centre
  box(tr, M.dark, 6.2, 0.35, 1.7, 0.3, 0.95, 0); wheels(tr, [2.6, 1.5, -0.9, -2.0], 0.95, 0.5, 0.36);
  box(tr, T.hull, 1.6, 1.3, 1.9, 2.7, 1.75, 0); box(tr, M.glass, 0.06, 0.55, 1.6, 3.52, 1.95, 0); box(tr, T.dark, 1.4, 0.9, 1.8, 1.0, 1.55, 0);
  const t = grp(g, -1.1, 1.15, 0.6); cyl(t, M.steel, 0.95, 0.16, 0, 0.08, 0);
  const arm = grp(t, -0.2, 0.3, 0); arm.rotation.z = 1.2;
  box(arm, M.gun, 3.2, 0.12, 1.9, 1.5, -0.1, 0);
  for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) { box(arm, T.hull, 3.2, 0.42, 0.42, 1.55, 0.2 + r * 0.46, (c - 1.5) * 0.46); box(arm, M.dark, 0.05, 0.36, 0.36, 3.16, 0.2 + r * 0.46, (c - 1.5) * 0.46); }   // eight canisters
  box(arm, T.accent, 0.4, 0.94, 0.05, 1.5, 0.43, 0.95); box(arm, T.accent, 0.4, 0.94, 0.05, 1.5, 0.43, -0.95);
  box(g, T.dark, 1.6, 1.2, 1.4, -2.3, 0.9, -2.3); cyl(g, M.steel, 0.12, 4.2, -2.3, 3.4, -2.3);                                              // radar cabin and mast
  const spin = grp(g, -2.3, 5.5, -2.3); box(spin, T.hull, 0.3, 1.1, 2.1, 0, 0.55, 0); box(spin, M.dark, 0.05, 0.9, 1.9, 0.17, 0.55, 0);           // TRML-4D antenna
  return { g, turret: t, spin, muzzle: 1.6, muzzleY: 4.2, top: 7 };
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

// IT'S HIM! (Russia): a bare-chested man in camouflage trousers and a grey fur ushanka, riding a big brown bear and
// firing a minigun from the hip. The bear's eyes are red: that is where its lasers come from.
function bearrider(T) {
  const r = heroRig((m) => {
    const bear = grp(m, 0, 0, 0);
    box(bear, M.fur, 1.1, 0.66, 0.7, -0.1, 0.84, 0); box(bear, M.fur, 0.6, 0.78, 0.78, 0.5, 0.92, 0); box(bear, M.fur, 0.5, 0.66, 0.74, -0.62, 0.8, 0);         // barrel, the hump over the shoulders, haunches
    box(bear, M.furDark, 0.9, 0.1, 0.5, -0.05, 0.5, 0);                                                                                                          // darker belly
    box(bear, M.fur, 0.4, 0.5, 0.5, 0.86, 1.0, 0).rotation.z = -0.35; box(bear, M.fur, 0.46, 0.46, 0.52, 1.12, 1.06, 0);                                         // thick neck, head
    box(bear, M.furDark, 0.3, 0.2, 0.26, 1.44, 0.98, 0); box(bear, M.fur, 0.2, 0.1, 0.3, 1.3, 1.25, 0).rotation.z = -0.5; box(bear, M.black, 0.07, 0.09, 0.13, 1.6, 1.02, 0);   // muzzle, brow, nose
    box(bear, M.black, 0.2, 0.03, 0.2, 1.46, 0.875, 0); for (const s of [-1, 1]) box(bear, M.white, 0.03, 0.06, 0.03, 1.54, 0.855, s * 0.08);                      // open jaw line and two teeth
    for (const s of [-1, 1]) { add(bear, G.sph, M.fur, 0.1, 0.1, 0.06, 1.0, 1.36, s * 0.22); add(bear, G.sph, M.furDark, 0.06, 0.06, 0.03, 1.02, 1.36, s * 0.24); box(bear, M.red, 0.04, 0.07, 0.08, 1.36, 1.15, s * 0.15); }   // ears, red eyes
    add(bear, G.sph, M.fur, 0.13, 0.13, 0.13, -0.9, 0.98, 0);                                                                                                    // tail
    box(bear, T.accent, 0.62, 0.03, 0.74, -0.1, 1.185, 0); for (const s of [-1, 1]) box(bear, T.accent, 0.62, 0.26, 0.03, -0.1, 1.06, s * 0.365);                   // saddle blanket in the owner's colour
    // four legs, each hinged at the shoulder or hip: upper leg, lower leg, paw, claws. Stride order: front-left, front-right, rear-right, rear-left.
    const legs = [[0.52, 1], [0.52, -1], [-0.6, -1], [-0.6, 1]].map(([x, s]) => { const l = grp(bear, x, 0.62, s * 0.26); box(l, M.fur, 0.3, 0.36, 0.28, 0, -0.14, 0); box(l, M.fur, 0.24, 0.3, 0.24, 0.01, -0.42, 0); box(l, M.furDark, 0.32, 0.1, 0.28, 0.04, -0.57, 0); for (const c of [-0.08, 0, 0.08]) box(l, M.black, 0.06, 0.04, 0.03, 0.22, -0.595, c); return l; });
    const man = grp(m, -0.1, 1.2, 0);                                                                                                                            // the rider, astride
    for (const s of [-1, 1]) { box(man, M.camo, 0.2, 0.2, 0.42, 0.05, 0.05, s * 0.27).rotation.x = s * 0.55; box(man, M.camo, 0.16, 0.3, 0.14, 0.1, -0.17, s * 0.42); box(man, M.black, 0.24, 0.1, 0.16, 0.14, -0.34, s * 0.43); }   // thighs down the bear's sides, shins, boots
    box(man, M.camo, 0.22, 0.12, 0.3, 0, 0.12, 0); box(man, M.black, 0.235, 0.06, 0.32, 0, 0.2, 0);                                                              // hips, belt
    box(man, M.skin, 0.2, 0.2, 0.3, 0, 0.32, 0); box(man, M.skin, 0.23, 0.22, 0.38, 0.005, 0.51, 0); box(man, M.skin, 0.2, 0.09, 0.48, 0, 0.6, 0); for (const s of [-1, 1]) box(man, M.skin, 0.03, 0.1, 0.15, 0.115, 0.53, s * 0.085);   // bare torso
    cyl(man, M.skin, 0.055, 0.08, 0, 0.67, 0); add(man, G.sph, M.skin, 0.105, 0.12, 0.105, 0.008, 0.77, 0);
    box(man, M.grey, 0.25, 0.13, 0.26, 0, 0.87, 0); box(man, M.grey, 0.04, 0.1, 0.22, 0.125, 0.86, 0); for (const s of [-1, 1]) box(man, M.grey, 0.16, 0.2, 0.045, -0.02, 0.76, s * 0.125); box(man, M.red, 0.02, 0.06, 0.06, 0.148, 0.87, 0);   // ushanka: crown, turned-up front, ear flaps, red star
    box(man, M.skin, 0.115, 0.28, 0.115, 0.04, 0.45, 0.27).rotation.z = 0.3; box(man, M.skin, 0.26, 0.1, 0.1, 0.2, 0.3, 0.27);                                   // right arm down to the gun
    box(man, M.skin, 0.115, 0.26, 0.115, 0.08, 0.46, -0.27).rotation.z = 0.6; const f = box(man, M.skin, 0.44, 0.1, 0.1, 0.32, 0.36, -0.08); f.rotation.y = -0.75;   // left arm across to the fore grip
    box(man, T.accent, 0.125, 0.08, 0.125, 0.03, 0.48, 0.27).rotation.z = 0.3; box(man, T.accent, 0.125, 0.08, 0.125, 0.06, 0.49, -0.27).rotation.z = 0.6;       // armbands
    const gun = grp(man, 0.5, 0.3, 0.2); box(gun, M.gun, 0.4, 0.2, 0.2, -0.05, 0, 0); cyl(gun, M.gun, 0.11, 0.2, 0.2, 0, 0, 'x'); for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; cyl(gun, M.gun, 0.022, 0.8, 0.68, Math.cos(a) * 0.065, Math.sin(a) * 0.065, 'x', G.cyl8); }
    for (const x of [0.6, 1.02]) cyl(gun, M.gun, 0.095, 0.04, x, 0, 0, 'x'); box(gun, M.gun, 0.05, 0.14, 0.04, 0.3, 0.14, 0); box(gun, M.gun, 0.3, 0.03, 0.03, 0.2, 0.2, 0);   // minigun: motor, six barrels, clamps, a top handle
    box(gun, M.yellow, 0.07, 0.34, 0.07, -0.12, -0.22, 0.1); box(man, M.olive, 0.22, 0.36, 0.3, -0.22, 0.42, 0);                                                 // belt down to the ammunition pack on his back
    return legs;
  });
  r.muzzle = 2.0; r.muzzleY = 1.7; return r;
}
// Leonidas (Europe): a Spartan hoplite. Bare chest, bronze trunks and greaves, a long red cape, a bronze Corinthian
// helmet with a red horsehair crest, a round bronze shield on the left arm and a spear levelled in the right hand.
function leonidas(T) {
  const r = heroRig((m) => {
    const legs = [-1, 1].map(s => { const l = grp(m, 0, HIP, s * 0.11); box(l, M.skin, 0.17, 0.36, 0.16, 0, -0.18, 0); box(l, M.skin, 0.14, 0.32, 0.14, -0.005, -0.5, 0); box(l, M.bronze, 0.155, 0.3, 0.155, 0.012, -0.5, 0); box(l, M.bronze, 0.05, 0.08, 0.12, 0.08, -0.35, 0); box(l, M.wood, 0.25, 0.04, 0.14, 0.05, -0.74, 0); box(l, M.wood, 0.03, 0.1, 0.15, 0.02, -0.67, 0); return l; });   // bare legs, bronze greaves with knee caps, sandals
    box(m, M.bronze, 0.22, 0.17, 0.32, 0, 0.8, 0); for (let i = -2; i <= 2; i++) box(m, M.wood, 0.03, 0.16, 0.055, 0.115, 0.7, i * 0.065); box(m, M.wood, 0.235, 0.05, 0.33, 0, 0.885, 0);   // bronze trunks, a skirt of leather strips, belt
    box(m, M.skin, 0.2, 0.2, 0.3, 0, 1.0, 0); box(m, M.skin, 0.235, 0.22, 0.39, 0.005, 1.18, 0); box(m, M.skin, 0.2, 0.09, 0.5, 0, 1.27, 0); for (const s of [-1, 1]) box(m, M.skin, 0.03, 0.1, 0.16, 0.118, 1.2, s * 0.088);   // bare torso
    const cape = box(m, M.dress, 0.05, 1.05, 0.58, -0.22, 0.76, 0); cape.rotation.z = 0.17; box(m, M.dress, 0.16, 0.07, 0.5, -0.07, 1.3, 0); for (const s of [-1, 1]) cyl(m, M.bronze, 0.035, 0.02, 0.03, 1.31, s * 0.2, 'x', G.cyl8);   // red cape from the shoulders, pinned with two bronze discs
    cyl(m, M.skin, 0.055, 0.08, 0, 1.34, 0); add(m, G.sph, M.skin, 0.1, 0.115, 0.1, 0.008, 1.43, 0);
    add(m, G.sph, M.bronze, 0.13, 0.14, 0.132, -0.006, 1.46, 0); box(m, M.bronze, 0.03, 0.17, 0.035, 0.125, 1.39, 0); for (const s of [-1, 1]) { box(m, M.bronze, 0.1, 0.17, 0.03, 0.085, 1.36, s * 0.1); box(m, M.black, 0.02, 0.035, 0.06, 0.128, 1.44, s * 0.05); }   // Corinthian helmet: nose guard, long cheek plates, eye slits
    box(m, M.bronze, 0.05, 0.16, 0.2, -0.11, 1.34, 0);                                                                                                                 // neck guard
    for (let i = 0; i < 7; i++) { const a = -1.0 + i * 0.36; box(m, M.red, 0.1, 0.17, 0.04, -0.012 + Math.sin(a) * 0.17, 1.47 + Math.cos(a) * 0.16, 0).rotation.z = -a; }   // the crest, front to back
    box(m, M.red, 0.04, 0.3, 0.04, -0.2, 1.36, 0);                                                                                                                      // its tail down the back
    box(m, T.accent, 0.24, 0.03, 0.06, -0.012, 1.595, 0); box(m, T.accent, 0.125, 0.07, 0.125, 0.03, 1.17, 0.28).rotation.z = 0.5;                                      // the crest holder and an arm ring in the owner's colour
    box(m, M.skin, 0.115, 0.26, 0.115, 0.04, 1.14, 0.28).rotation.z = 0.5; box(m, M.skin, 0.25, 0.1, 0.1, 0.2, 1.06, 0.3); box(m, M.bronze, 0.1, 0.11, 0.11, 0.26, 1.06, 0.3);   // spear arm with a bronze bracer
    cyl(m, M.wood, 0.026, 2.5, 0.75, 1.1, 0.37, 'x', G.cyl8); add(m, G.cone, M.bronze, 0.055, 0.36, 0.055, 2.17, 1.1, 0.37).rotation.z = -Math.PI / 2; cyl(m, M.bronze, 0.035, 0.14, -0.55, 1.1, 0.37, 'x', G.cyl8);   // spear: shaft, leaf point, butt spike
    box(m, M.skin, 0.115, 0.24, 0.115, 0.05, 1.14, -0.28).rotation.z = 0.5; box(m, M.skin, 0.22, 0.1, 0.1, 0.18, 1.02, -0.32);                                         // shield arm
    cyl(m, M.bronze, 0.47, 0.05, 0.26, 0.98, -0.43, 'z'); cyl(m, M.bronze, 0.49, 0.025, 0.26, 0.98, -0.415, 'z'); cyl(m, T.accent, 0.38, 0.055, 0.26, 0.98, -0.435, 'z');   // the round shield: bronze rim, its face in the owner's colour
    for (const k of [-1, 1]) box(m, M.bronze, 0.05, 0.5, 0.02, 0.26 + k * 0.1, 0.98, -0.468).rotation.z = k * 0.4;                                                       // the lambda of Sparta
    return legs;
  });
  r.muzzle = 2.4; r.muzzleY = 1.55; return r;
}
const UNIT = {
  avenger, inferno, scorpion, buggy, tractor, dozer, truck, // tanks, technical, helicopter and scouts are built in modelFactory.js
  mig: (T) => jet(T, false), // the Raptor and the Z-10 are built in modelFactory.js
  vet, fookmie, phantom, car, bearrider, leonidas,
  rifle: (T) => squad(T, FOUR, { ...kit(T.faction), gun: 'rifle' }),
  // Russia: motor rifle infantry in green EMR camouflage with deep helmets and packs; a two-man RPG-7 team; convicts in mismatched dark kit and wool caps
  motorrifle: (T) => squad(T, FOUR, { ...kit('ursa'), gun: 'rifle' }),
  rpg7: (T) => squad(T, TWO, { ...kit('ursa'), gun: 'rpg' }),
  convict: (T) => squad(T, FOUR, (i) => ({ cloth: i % 2 ? M.dark : M.grey, legs: i % 2 ? M.khaki : M.dark, rig: M.olive, helmet: 'cap', hat: M.black, gun: 'rifle', arm: 'ak', boots: M.black })),
  // Europe: Legion infantry in flecked camouflage and white kepis with FAMAS rifles; a two-man MILAN missile team behind its tripod
  legion: (T) => squad(T, FOUR, { ...kit('aegis'), gun: 'rifle' }),
  milanteam: (T) => { const r = squad(T, TWO, (i) => ({ ...kit('aegis'), gun: i ? 'rifle' : 'milan' })); r.muzzle = 1.2; r.muzzleY = 0.96; return r; },
  // SEAL Team: four operators in black with suppressed carbines; one is a marksman with a long rifle, one a grenadier
  seal: (T) => squad(T, FOUR, (i) => ({ cloth: M.black, vest: M.dark, helmet: 'mich', hat: M.dark, skin: M.black, boots: M.black, pack: M.dark, kneepads: M.dark, gun: i === 2 ? 'long' : 'rifle', arm: i === 3 ? 'm203' : 'm4s' })),
  // Suicide Bomber: plain clothes, an explosive vest with a row of charges and a detonator in his hand; no rifle
  // Spetsnaz: four men in dark camouflage and black kit, two masked, with suppressed rifles
  spetsnaz: (T) => squad(T, FOUR, (i) => ({ cloth: M.camo, vest: M.black, helmet: i % 2 ? 'cap' : 'ssh', hat: M.black, skin: i % 2 ? M.black : M.skin, boots: M.black, pack: M.black, kneepads: M.black, gun: 'rifle', arm: 'aks' })),
  // Mortar Team: the gunner behind his 82 mm mortar, a loader with a rifle and a box of shells
  mortar: (T) => { const r = squad(T, TWO, (i) => ({ ...kit('sandstorm'), gun: i ? 'rifle' : 'mortar' })); box(r.men[1], M.crateB, 0.36, 0.22, 0.26, -0.3, 0.14, 0.3); r.muzzle = 0.85; r.muzzleY = 1.0; return r; },
  bomber: (T) => { const r = squad(T, ONE, { cloth: M.cloth, legs: M.khaki, helmet: 'shemagh', hat: M.dark, gun: 'none', boots: M.dark }), m = r.men[0];
    box(m, M.crateC, 0.27, 0.26, 0.36, 0.004, 1.06, 0); for (const z of [-0.12, -0.04, 0.04, 0.12]) cyl(m, M.yellow, 0.03, 0.2, 0.14, 1.06, z, 'y', G.cyl8); box(m, M.red, 0.012, 0.02, 0.3, 0.165, 1.17, 0); box(m, M.dark, 0.04, 0.1, 0.04, 0.03, 0.72, 0.235); return r; },
  rpg: (T) => squad(T, TWO, { ...kit('sandstorm'), hat: M.red, gun: 'rpg' }),
  // Pathfinder Sniper: ghillie suit and a soft hat, a long scoped rifle
  sniper: (T) => { const r = squad(T, ONE, { cloth: M.ghillie, helmet: 'boonie', hat: M.ghillie, gun: 'long', boots: M.tan }), m = r.men[0];
    for (const [x, y, z] of [[-0.13, 1.24, 0.12], [-0.13, 1.1, -0.1], [-0.12, 0.96, 0.08], [0.0, 1.31, -0.2], [0.0, 1.31, 0.2], [-0.06, 1.5, 0.1], [-0.08, 1.49, -0.08]]) box(m, M.camo, 0.08, 0.12, 0.1, x, y, z).rotation.z = 0.4; return r; },   // ragged strips of the suit
  hacker: (T) => squad(T, TWO, { cloth: M.dark, legs: M.grey, helmet: 'hood', hat: M.dark, gun: 'laptop', pack: M.black, boots: M.white }),
  worker: (T) => squad(T, ONE, { cloth: M.cloth, legs: M.khaki, helmet: 'hard', hat: M.yellow, gun: 'tool', boots: M.dark, belt: M.wood }),
  saboteur: (T) => squad(T, ONE, { cloth: M.dark, legs: M.black, helmet: 'hood', hat: M.black, gun: 'satchel', boots: M.black }),
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
// Scud Storm: nine vertical launch rails on an improvised sandbagged platform.
function scud(T) {
  const g = new THREE.Group(); slab(g, 15.4, 15.4, M.sandbag, 0.7);
  box(g, M.wood, 11, 0.5, 11, 0, 0.95, 0); box(g, M.dark, 9, 1.2, 9, 0, 1.6, 0); box(g, T.accent, 9.1, 0.3, 9.1, 0, 2.2, 0);
  const rack = grp(g, 0, 2.3, 0); rack.rotation.z = 0;
  const missiles = [];   // one node per rail: the view removes each as it launches and puts them back one by one during the reload
  for (let i = 0; i < 9; i++) {
    const x = (i % 3 - 1) * 2.6, z = (((i / 3) | 0) - 1) * 2.6; box(rack, M.gun, 0.2, 2.6, 0.2, x + 0.7, 1.3, z); box(rack, M.steel, 0.3, 5.0, 0.3, x + 0.62, 2.7, z);
    const m = grp(rack, x, 2.9, z);   // rails stand vertical: the missiles go straight up
    cyl(m, M.olive, 0.5, 5.0, 0, 0, 0); add(m, G.cone, M.olive, 0.5, 2.6, 0.5, 0, 3.8, 0); cyl(m, M.gun, 0.52, 0.3, 0, -1.8, 0);   // long pointed nose
    for (const a of [0, 1.5708]) box(m, M.gun, 1.5, 0.8, 0.06, 0, -2.1, 0).rotation.y = a;
    missiles.push(m);
  }
  for (let i = 0; i < 8; i++) add(g, G.sph, M.sandbag, 0.9, 0.45, 0.6, -6.3 + i * 1.8, 0.95, 6.6);
  cyl(g, M.wood, 0.07, 3.4, 6.4, 2.4, -6.4); box(g, M.cloth, 1.6, 0.9, 0.05, 5.6, 3.6, -6.4);
  return { g, top: 9, missiles };
}
// Shipyard (20 m x 20 m). Model +X is the sea: the view turns it to face the water. The landward half is a quay with a
// workshop and stores; the seaward half is a slipway between two piers, with a gantry crane over it. The quay wall and
// the piles go well below the waterline, so the building sits right on any shore.
function shipyard(T) {
  const g = new THREE.Group();
  box(g, M.slab, 11.5, 5.0, 19.6, -4.2, -2.3, 0);                                                 // quay block (top at +0.2)
  box(g, T.wall, 6.4, 4.2, 9.0, -6.0, 2.3, -4.4); for (const s of [-1, 1]) box(g, T.roof, 6.8, 0.3, 5.0, -6.0, 4.75, -4.4 + s * 2.3).rotation.x = s * 0.2;   // workshop
  box(g, M.dark, 0.12, 3.2, 5.2, -2.76, 1.8, -4.4); box(g, T.accent, 6.5, 0.4, 9.1, -6.0, 3.6, -4.4);   // big door facing the slip, team band
  box(g, T.wall, 4.6, 2.6, 5.0, -6.6, 1.5, 6.2); box(g, T.roof, 5.0, 0.25, 5.4, -6.6, 2.95, 6.2);        // stores
  for (const [x, z, m] of [[-2.2, 4.0, M.crateA], [-2.2, 5.4, M.crateB], [-3.4, 8.4, M.crateC], [-1.6, 8.2, M.crateA]]) box(g, m, 1.1, 1.0, 1.1, x, 0.7, z);
  for (const s of [-1, 1]) { // two piers on piles
    box(g, M.wood, 9.6, 0.3, 2.6, 5.4, 0.05, s * 8.2);
    for (const x of [1.4, 4.2, 7.0, 9.8]) for (const k of [-1, 1]) cyl(g, M.wood, 0.2, 5.6, x, -2.6, s * 8.2 + k * 1.05);
    for (const x of [2.5, 6.0, 9.4]) cyl(g, M.steel, 0.16, 0.7, x, 0.55, s * 7.2);                 // bollards
  }
  const slip = box(g, M.concrete, 12.4, 0.5, 9.2, 4.6, -1.2, 0); slip.rotation.z = -0.2;           // slipway running down into the water
  for (const z of [-2.2, 2.2]) { const r = box(g, M.steel, 12.4, 0.16, 0.22, 4.6, -0.88, z); r.rotation.z = -0.2; }
  box(g, M.wood, 3.6, 0.5, 3.0, 2.0, 0.1, 0); box(g, T.dark, 3.2, 0.9, 1.6, 2.0, 0.8, 0);          // a hull on the cradle
  for (const s of [-1, 1]) { cyl(g, M.yellow, 0.3, 8.0, 0.4, 4.2, s * 6.2); cyl(g, M.yellow, 0.3, 8.0, 6.4, 4.2, s * 6.2); box(g, M.yellow, 6.6, 0.5, 0.5, 3.4, 8.2, s * 6.2); }   // gantry legs and rails
  box(g, M.yellow, 0.7, 0.7, 13.0, 3.4, 8.7, 0); box(g, M.gun, 1.0, 0.7, 1.2, 3.4, 8.1, 1.5); cyl(g, M.gun, 0.04, 3.0, 3.4, 6.3, 1.5); box(g, M.gun, 0.5, 0.4, 0.5, 3.4, 4.7, 1.5);   // bridge, trolley, hook
  cyl(g, M.steel, 0.12, 6.0, -9.0, 3.2, 9.0); add(g, G.sph, T.glow, 0.3, 0.3, 0.3, -9.0, 6.3, 9.0);  // signal mast
  return { g };
}
// Kinzhal Shelter (Russia's superweapon): a hardened aircraft shelter, an arch of concrete banked with earth, its
// blast doors rolled aside and a MiG-31 standing on alert inside with the missile under its belly (`jet`: gone while
// the next one is being readied). A taxi strip leads out; a fuel bowser and a revetment wall stand beside it.
function kinzhal(T) {
  const g = new THREE.Group(); slab(g, 15.4, 15.4, M.tarmac, 0.4);
  const arch = cyl(g, M.concrete, 1, 10.5, -1.6, 0.35, 0, 'x', G.cyl); arch.scale.set(4.2, 10.5, 5.6);                                  // the shelter: half a barrel on its side
  for (const s of [-1, 1]) { const bank = box(g, M.sandbag, 10.5, 2.6, 2.2, -1.6, 1.3, s * 5.6); bank.rotation.x = -s * 0.5; }               // earth banked against its sides
  box(g, M.dark, 0.3, 3.6, 8.4, 3.62, 2.1, 0); for (const s of [-1, 1]) { box(g, M.steel, 0.3, 4.0, 3.6, 3.9, 2.3, s * 6.3); box(g, T.accent, 0.32, 0.5, 3.6, 3.9, 3.9, s * 6.3); }   // the dark mouth; the two blast doors rolled aside
  box(g, T.accent, 0.4, 0.5, 9.0, 3.72, 4.25, 0); box(g, M.concrete, 2.2, 0.5, 9.4, 3.2, 4.4, 0);
  box(g, M.yellow, 5.0, 0.05, 0.16, 5.2, 0.38, 0); for (const s of [-1, 1]) box(g, M.white, 5.0, 0.05, 0.12, 5.2, 0.38, s * 3.4);              // taxi line and edge lines
  box(g, M.concrete, 0.5, 2.2, 6.0, -6.9, 1.4, -4.2); box(g, T.dark, 2.2, 1.2, 1.2, 5.4, 1.0, 5.9); cyl(g, T.dark, 0.6, 2.4, 5.2, 1.5, 5.9, 'x'); wheels(grp(g, 5.4, 0.3, 5.9), [0.9, -0.9], 0.6, 0.34, 0.24);   // revetment wall, fuel bowser
  const jet = grp(g, 2.2, 1.55, 0); const J = mats('ursa', 0);                                                                            // the MiG-31: long nose out of the shelter, twin fins inside
  cyl(jet, M.jet, 0.55, 6.4, -1.6, 0, 0, 'x'); add(jet, G.cone, M.jet, 0.55, 2.4, 0.55, 2.8, 0, 0).rotation.z = -Math.PI / 2; box(jet, M.glass, 1.4, 0.34, 0.5, 0.9, 0.5, 0);
  for (const s of [-1, 1]) { box(jet, M.jet, 3.0, 0.12, 2.6, -2.2, 0.1, s * 1.7).rotation.y = s * 0.3; box(jet, M.jet, 1.6, 1.6, 0.1, -4.2, 0.9, s * 0.8); box(jet, M.jet, 3.6, 0.7, 0.7, -1.4, -0.1, s * 0.75); }
  cyl(jet, M.white, 0.2, 3.4, -0.6, -0.72, 0, 'x'); add(jet, G.cone, M.dark, 0.2, 0.8, 0.2, 1.5, -0.72, 0).rotation.z = -Math.PI / 2;        // the Kinzhal itself, slung on the centreline
  for (const [x, z] of [[2.2, 0], [-2.4, 1.2], [-2.4, -1.2]]) { cyl(jet, M.steel, 0.06, 0.9, x, -0.75, z); cyl(jet, M.rubber, 0.26, 0.2, x, -1.1, z, 'z'); }
  cyl(g, M.steel, 0.08, 5.0, -6.6, 2.9, 5.6); add(g, G.sph, T.glow, 0.3, 0.3, 0.3, -6.6, 5.5, 5.6);
  return { g, jet, top: 7 };
}
// Sky Shield Battery (Europe's superweapon): a SAMP/T battery. Three launcher trucks, each with eight missile
// canisters raised upright, stand round the multifunction radar, whose flat face turns on its tower; a command cabin
// and a generator complete it.
function skyshield(T) {
  const g = new THREE.Group(); slab(g, 15.4, 15.4, M.concrete, 0.35);
  for (const [x, z, ry] of [[-4.6, -4.4, 0.5], [4.6, -4.4, 2.6], [0.2, 5.2, -1.57]]) {
    const tr = grp(g, x, 0.3, z); tr.rotation.y = ry;
    box(tr, M.dark, 6.0, 0.35, 1.7, 0, 0.7, 0); wheels(tr, [2.3, 1.2, -1.0, -2.1], 0.95, 0.5, 0.36); box(tr, T.hull, 1.5, 1.3, 1.9, 2.3, 1.5, 0); box(tr, M.glass, 0.06, 0.55, 1.6, 3.07, 1.7, 0);
    for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) { box(tr, T.hull, 0.46, 3.4, 0.46, -1.9 + r * 0.5, 2.6, (c - 1.5) * 0.48); box(tr, M.dark, 0.4, 0.05, 0.4, -1.9 + r * 0.5, 4.32, (c - 1.5) * 0.48); }   // eight canisters, upright
    box(tr, T.accent, 1.0, 0.3, 2.0, -1.65, 1.2, 0); box(tr, M.gun, 1.2, 0.5, 1.9, -1.65, 0.95, 0);
  }
  cyl(g, T.wall, 1.3, 3.0, 0, 1.8, -0.6, 'y', G.cyl8); box(g, T.accent, 2.7, 0.3, 2.7, 0, 3.0, -0.6); cyl(g, M.steel, 0.3, 1.4, 0, 4.0, -0.6);          // radar tower
  const spin = grp(g, 0, 4.7, -0.6); box(spin, T.hull, 0.5, 2.6, 2.4, 0, 1.3, 0); box(spin, M.dark, 0.06, 2.2, 2.0, 0.28, 1.3, 0); box(spin, M.gun, 0.8, 0.3, 0.8, -0.3, 0.15, 0);   // the rotating array
  box(g, T.wall, 3.0, 2.0, 2.2, -5.4, 1.3, 3.6); box(g, T.roof, 3.2, 0.2, 2.4, -5.4, 2.4, 3.6); cyl(g, M.gun, 0.04, 2.6, -6.4, 3.7, 4.2); box(g, T.dark, 1.6, 1.1, 1.1, 5.6, 0.9, 3.4);   // command cabin with its aerial; generator
  add(g, G.sph, T.glow, 0.3, 0.3, 0.3, 0, 7.5, -0.6);
  return { g, spin, top: 8.5 };
}
const BLDG = { kinzhal, skyshield, cc, power, supply, barracks, factory, airfield, patriot, gatling, stinger, pantsir, irist, uplink, tunnel, market, particle, silo, scud, shipyard };

export function buildModel(e) {
  init();
  let v;
  if (e.kind === 'unit') { const d = UNITS[e.type]; v = (UNIT[d.model] || UNIT.scorpion)(mats(d.faction, e.team)); }
  else {
    const d = BLDGS[e.type];
    if (d.model === 'civ') v = civ(e.variant); else if (d.model === 'dock') v = dock(); else if (d.model === 'derrick') v = derrick();
    else v = (BLDG[d.model] || BLDG.power)(mats(d.faction, e.team), d);
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
