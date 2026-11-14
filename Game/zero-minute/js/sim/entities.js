// Entity construction and the helpers every sim system shares: damage, XP,
// kills, garrisons, reservations, spawn placement.
import { N, CELL, NEUTRAL, ZONE_MULT, angDiff } from './defs.js';
import { UNITS, BLDGS, WEAPONS, FACTIONS, GENERAL, VET, armorOf, promoNode } from './factionRegistry.js';

export function makeUnit(sim, type, team, x, z, facing = 0) {
  const d = UNITS[type];
  const u = {
    id: sim.nextId++, kind: 'unit', type, team, x, z, px: x, pz: z,
    facing, pfacing: facing, turret: facing, pturret: facing,
    hp: d.hp, maxHp: d.hp, radius: d.radius, cls: d.cls, air: !!d.air, dead: false,
    vx: 0, vz: 0, spd: 0, ms: d.speed, path: null, pi: 0, pathReq: null, queued: false, arrived: false, goal: null,
    order: null, guardX: x, guardZ: z, target: 0, cds: [0, 0, 0], bursts: [0, 0, 0], burstCd: [0, 0, 0], wslots: null,
    stuck: 0, lx: x, lz: z, noPath: 0, inB: 0, working: false, still: false,
    cargo: 0, hs: 'seek', dock: 0, center: 0, slotB: 0, slotI: -1, holdI: -1, exitB: 0, exitI: -1, timer: 0, tries: 0,
    lastHit: -999, lastZone: 0, lastFire: -999,
    // phase 2
    xp: 0, vet: 0, tier: 0, addon: null, addonQ: null, garrison: null,
    stealthMode: d.stealth || null, cloaked: false, detected: false, revealUntil: 0, stillT: 0,
    empUntil: 0, emp: false, deployed: false, cashAcc: 0, horde: false, pdlCd: 0, capT: 0,
    ammo: d.ammo || 0, as: d.based ? 'parked' : null, home: 0, pad: -1, rw: -1, loiterT: 0, loiterO: null, extend: 0, landed: false, reloadT: 0,
    altK: d.air && !d.based ? 1 : 0, paltK: d.air && !d.based ? 1 : 0, // height as a fraction of cruise altitude (see air.js)
  };
  sim.ents.push(u); sim.byId.set(u.id, u);
  if (team < 2) outfit(sim, u, d);
  return u;
}

// Team-wide modifiers applied to a freshly made unit (upgrades, promotions).
function outfit(sim, u, d) {
  const T = sim.teams[team_(u)];
  if (d.nuke && T.upgrades.has('r_nuke')) u.ms = d.speed * 1.15;
  if (d.salvage && T.flags.scrap) { u.tier = 1; }
  for (const id of T.promos) {
    const v = promoNode(T.faction, id).vetBuild; if (!v) continue;
    if ((v === 'tank' && d.tank) || (v === 'infantry' && d.infantry && d.weapon) || v === u.type) { setVet(u, 1); break; }
  }
}
const team_ = (e) => e.team;

export function setVet(u, rank) {
  const base = UNITS[u.type].hp, nm = base * (1 + VET.hp * rank);
  u.hp += nm - u.maxHp; u.maxHp = nm; u.vet = rank;
}

export function makeBldg(sim, type, team, cx, cz, done = true) {
  const d = BLDGS[type];
  const b = {
    id: sim.nextId++, kind: 'bldg', type, team, cx, cz, w: d.w, h: d.h,
    x: (cx + d.w / 2) * CELL, z: (cz + d.h / 2) * CELL, px: 0, pz: 0,
    facing: 0, pfacing: 0, turret: Math.PI / 2, pturret: Math.PI / 2,
    hp: done ? d.hp : d.hp * 0.1, maxHp: d.hp, radius: Math.min(d.w, d.h) * CELL * 0.5, dead: false,
    done, progress: done ? 1 : 0, queue: [], prod: 0, rallyX: 0, rallyZ: 0,
    garrison: [], supplies: 0, maxSupplies: 0, ruined: false, seen: [false, false],
    target: 0, cds: [0, 0, 0], bursts: [0, 0, 0], burstCd: [0, 0, 0], wslots: null, slots: null, holds: null, variant: 0,
    lastHit: -999, lastZone: 0, lastFire: -999, vet: 0, horde: false,
    disabledUntil: 0, empUntil: 0, offline: false, capBy: 0, capT: 0, capXp: [false, false], pads: null,
  };
  b.px = b.x; b.pz = b.z;
  b.rallyX = b.x; b.rallyZ = b.z + (d.h / 2 + 6) * CELL;
  if (type === 'dock' || d.role === 'supply') {
    b.slots = []; b.holds = [];
    // Loading bays on both long sides. Each has an entry point one lane out,
    // so trucks back in perpendicular instead of driving along the bay row.
    const xs = [1, 4, 7];
    for (const k of xs) b.slots.push({ x: (cx + k) * CELL, z: (cz + d.h + 1.5) * CELL, ex: (cx + k) * CELL, ez: (cz + d.h + 4) * CELL, by: 0 });
    for (const k of xs) b.slots.push({ x: (cx + k) * CELL, z: (cz - 1.5) * CELL, ex: (cx + k) * CELL, ez: (cz - 4) * CELL, by: 0 });
    markBays(sim, b, 1);
    const R = Math.hypot(d.w, d.h) * CELL * 0.5 + 9;
    for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6 + 0.26; b.holds.push({ x: b.x + Math.cos(a) * R, z: b.z + Math.sin(a) * R, by: 0 }); }
  }
  if (d.pads) { // airfield layout (metres from the centre): parking pads in a row down the middle, helipad at the east end, one runway north and one south
    b.pads = []; for (let i = 0; i < d.pads; i++) b.pads.push({ x: b.x - 14 + i * 7, z: b.z, by: 0 });
    b.rws = [-10, 10].map(oz => ({ x0: b.x - 18, x1: b.x + 18, z: b.z + oz, by: 0 })); b.heli = { x: b.x + 15.5, z: b.z };
  }
  sim.nav.setRect(cx, cz, d.w, d.h, 1);
  sim.ents.push(b); sim.byId.set(b.id, b);
  return b;
}

function markBays(sim, b, v) {
  const s = sim.nav.soft;
  for (const z of [b.cz + b.h + 1, b.cz + b.h + 2, b.cz - 2, b.cz - 3]) {
    if (z < 0 || z >= N) continue;
    for (let x = Math.max(0, b.cx - 1); x <= Math.min(N - 1, b.cx + b.w); x++) s[z * N + x] = v;
  }
}

// Distance from a point to an entity's edge (footprint for buildings, circle for units).
export function rectDist(b, x, z) {
  if (b.kind === 'unit') return Math.max(0, Math.hypot(x - b.x, z - b.z) - b.radius);
  const dx = Math.max(Math.abs(x - b.x) - b.w * CELL * 0.5, 0), dz = Math.max(Math.abs(z - b.z) - b.h * CELL * 0.5, 0);
  return Math.hypot(dx, dz);
}

// ---------------- movement requests ----------------
export function reqPath(sim, u, x, z, thenX, thenZ) {
  u.pathReq = { x, z, thenX, thenZ };
  if (!u.queued) { u.queued = true; sim.pathQ.push(u.id); }
}
// Ground units path on the nav grid; aircraft fly straight to a goal.
export function moveTo(sim, u, x, z) { if (u.air) u.goal = { x, z }; else reqPath(sim, u, x, z); }
export const isMoving = (u) => !!(u.path || u.pathReq || u.goal);
export function stopUnit(u) { u.path = null; u.pathReq = null; u.goal = null; u.stuck = 0; }

// Drop every reservation a unit holds (dock bay, waiting spot, exit bay, air pad).
export function releaseSlot(sim, u) {
  if (u.slotB) {
    const b = sim.byId.get(u.slotB);
    if (b && b.slots) {
      if (u.slotI >= 0 && b.slots[u.slotI].by === u.id) b.slots[u.slotI].by = 0;
      if (u.holdI >= 0 && b.holds[u.holdI].by === u.id) b.holds[u.holdI].by = 0;
    }
  }
  u.slotB = 0; u.slotI = -1; u.holdI = -1;
  if (u.exitB) { const b = sim.byId.get(u.exitB); if (b && b.slots && b.slots[u.exitI].by === u.id) b.slots[u.exitI].by = 0; u.exitB = 0; u.exitI = -1; }
}

// ---------------- spawn placement ----------------
export function spawnNear(sim, type, team, wx, wz, facing = 0) {
  const d = UNITS[type], nav = sim.nav;
  if (d.air) return makeUnit(sim, type, team, wx, wz, facing);
  if (nav.dirty) nav.rebuild();
  const c = nav.nearest(Math.floor(wx / CELL), Math.floor(wz / CELL), d.cls, -1, 20);
  const x = c >= 0 ? ((c % N) + 0.5) * CELL : wx, z = c >= 0 ? (((c / N) | 0) + 0.5) * CELL : wz;
  return makeUnit(sim, type, team, x, z, facing);
}

// Nearest walkable cell centre to (wx,wz) that no ground unit is standing on.
export function freeSpot(sim, wx, wz, cls, radius, maxR = 14, ignoreId = 0) {
  const nav = sim.nav; if (nav.dirty) nav.rebuild();
  const cx = Math.floor(wx / CELL), cz = Math.floor(wz / CELL);
  let best = null, bd = 1e9;
  for (let dz = -maxR; dz <= maxR; dz++) for (let dx = -maxR; dx <= maxR; dx++) {
    const q = dx * dx + dz * dz; if (q >= bd) continue;
    const x = cx + dx, z = cz + dz; if (x < 0 || z < 0 || x >= N || z >= N) continue;
    if (!nav.pass(z * N + x, cls)) continue;
    const px = (x + 0.5) * CELL, pz = (z + 0.5) * CELL;
    let free = true;
    for (const o of sim.ents) {
      if (o.kind !== 'unit' || o.dead || o.inB || o.air || o.id === ignoreId) continue;
      if (Math.abs(o.x - px) < radius + o.radius + 0.3 && Math.abs(o.z - pz) < radius + o.radius + 0.3 && Math.hypot(o.x - px, o.z - pz) < radius + o.radius + 0.3) { free = false; break; }
    }
    if (free) { best = [px, pz]; bd = q; }
  }
  return best;
}

// ---------------- garrisons / containers ----------------
// A container is a civilian building or a unit with a Battle Bunker hardpoint.
export function capacityOf(c) {
  if (c.kind === 'bldg') return BLDGS[c.type].capacity || 0;
  return c.addon && UNITS[c.type].hardpoints[c.addon].capacity || 0;
}
export function ejectGarrison(sim, c, hpFactor = 1) {
  if (!c.garrison || !c.garrison.length) return;
  const hw = c.kind === 'bldg' ? c.w * CELL * 0.5 : c.radius, hh = c.kind === 'bldg' ? c.h * CELL * 0.5 : c.radius;
  let k = 0;
  for (const id of c.garrison) {
    const u = sim.byId.get(id); if (!u || u.dead) continue;
    const a = k++ * 2.4, s = freeSpot(sim, c.x + Math.cos(a) * (hw + 2.5), c.z + Math.sin(a) * (hh + 2.5), 0, u.radius, 10, u.id);
    if (s) { u.x = s[0]; u.z = s[1]; }
    u.px = u.x; u.pz = u.z; u.lx = u.x; u.lz = u.z; u.inB = 0; u.order = null; u.target = 0; u.guardX = u.x; u.guardZ = u.z; u.stillT = 0;
    u.hp = Math.max(1, u.hp * hpFactor);
  }
  c.garrison.length = 0;
  if (c.type === 'civ') c.team = NEUTRAL;
}
// Flush a garrison: occupants take damage and are thrown out; the shell is untouched.
export function clearGarrison(sim, c, dmg, src) {
  if (!c.garrison || !c.garrison.length) return 0;
  const ids = c.garrison.slice();
  ejectGarrison(sim, c, 1);
  for (const id of ids) {
    const u = sim.byId.get(id); if (!u || u.dead) continue;
    const dealt = Math.min(u.hp, dmg);
    u.hp -= dmg; u.lastHit = sim.tick;
    credit(sim, src, u, dealt, u.hp <= 0);
    if (u.hp <= 0) kill(sim, u);
  }
  sim.events.push({ t: 'cleared', id: c.id, x: c.x, z: c.z, n: ids.length });
  return ids.length;
}

// ---------------- XP ----------------
export function addGeneralXp(sim, teamIdx, amt) {
  const T = sim.teams[teamIdx]; if (!T) return;
  T.xp += amt;
  while (T.rank < GENERAL.rankXp.length && T.xp >= GENERAL.rankXp[T.rank]) { T.rank++; T.points++; sim.events.push({ t: 'rank', team: teamIdx, rank: T.rank }); }
}
const worth = (t) => Math.max(100, t.kind === 'unit' ? UNITS[t.type].cost : (BLDGS[t.type].cost || 600) * 0.5);
function credit(sim, src, t, dealt, killed) {
  if (!src || src.team > 1 || src.team === t.team || t.team > 1) return;
  let xp = dealt * GENERAL.dmgXp;
  if (killed) {
    const v = worth(t); xp += v * GENERAL.killXp;
    const T = sim.teams[src.team];
    if (T.flags.bounty && t.kind === 'unit') { const cash = Math.round(UNITS[t.type].cost * 0.2); T.money += cash; T.passive += cash; }
    if (src.kind === 'unit' && !src.dead) {
      src.xp += v;
      const base = Math.max(300, UNITS[src.type].cost);
      while (src.vet < 3 && src.xp >= base * VET.xpMult[src.vet]) { setVet(src, src.vet + 1); sim.events.push({ t: 'vet', id: src.id, team: src.team, rank: src.vet, x: src.x, z: src.z }); }
    }
  }
  addGeneralXp(sim, src.team, xp);
}

// ---------------- damage / death ----------------
export function kill(sim, e) {
  if (e.dead) return;
  if (e.kind === 'bldg' && e.type === 'civ') { // collapses to rubble, stays as an obstacle
    if (e.ruined) return;
    e.ruined = true; e.hp = 0;
    sim.events.push({ t: 'die', kind: 'bldg', type: e.type, x: e.x, z: e.z, r: e.radius, team: e.team, id: e.id });
    ejectGarrison(sim, e, 0.5);
    return;
  }
  e.dead = true; e.hp = 0;
  if (e.team < 2) { // after-action report counters
    const mine = sim.teams[e.team], foe = sim.teams[1 - e.team];
    if (e.kind === 'unit') { mine.unitsLost++; foe.unitsKilled++; } else if (BLDGS[e.type].faction) { mine.bldgsLost++; foe.bldgsKilled++; }
  }
  sim.events.push({ t: 'die', kind: e.kind, type: e.type, x: e.x, z: e.z, r: e.radius, team: e.team, id: e.id, air: !!e.air && !e.landed, f: e.facing, tf: e.turret, inf: e.kind === 'unit' && !!UNITS[e.type].infantry });
  if (e.kind === 'unit') {
    releaseSlot(sim, e);
    if (e.garrison) ejectGarrison(sim, e, 0.5);
    if (e.inB) { const b = sim.byId.get(e.inB); if (b) { b.garrison = b.garrison.filter(i => i !== e.id); if (!b.garrison.length && b.type === 'civ') b.team = NEUTRAL; } }
    if (e.home) { const b = sim.byId.get(e.home); if (b && b.pads && b.pads[e.pad] && b.pads[e.pad].by === e.id) b.pads[e.pad].by = 0; if (b && b.rws) for (const r of b.rws) if (r.by === e.id) r.by = 0; }
    // wrecks of ground vehicles become salvage when the other side can use it
    if (e.cls === 1 && !e.air && e.team < 2 && FACTIONS[sim.teams[1 - e.team].faction].salvage)
      sim.crates.push({ id: sim.nextId++, x: e.x, z: e.z, until: sim.tick + 1800, team: 1 - e.team });
  } else {
    sim.nav.setRect(e.cx, e.cz, e.w, e.h, 0);
    if (e.slots) { for (const s of e.slots) s.by = 0; markBays(sim, e, 0); }
  }
}

// Hit zone for directional armor: 0 front, 1 side, 2 rear.
export function hitZone(t, sx, sz) {
  const a = Math.atan2(sz - t.z, sx - t.x), d = Math.abs(angDiff(a, t.facing));
  return d > 2.0943951 ? 2 : d > 1.0471976 ? 1 : 0;
}

// src: the attacking entity, or { team } for off-map strikes and hazards.
export function applyDamage(sim, t, dmg, wname, sx, sz, src) {
  if (t.dead || t.ruined) return 0;
  const W = WEAPONS[wname];
  if (t.kind === 'bldg') {
    if (W.clearsGarrison && t.garrison.length && BLDGS[t.type].capacity) { clearGarrison(sim, t, dmg * (W.vs.inf || 0), src); return 0; }
    if (BLDGS[t.type].indestructible) return 0;
  }
  let m = W.vs[armorOf(t)] || 0, zone = 0;
  if (!m) return 0;
  if (t.kind === 'unit' && UNITS[t.type].dirArmor) { zone = hitZone(t, sx, sz); m *= ZONE_MULT[zone]; }
  const dealt = Math.min(t.hp, dmg * m);
  t.hp -= dmg * m; t.lastHit = sim.tick; t.lastZone = zone;
  if (zone > 0 && dmg * m >= 8) sim.events.push({ t: 'hit', id: t.id, zone, x: t.x, z: t.z, team: t.team });
  credit(sim, src, t, dealt, t.hp <= 0);
  if (t.hp <= 0) kill(sim, t);
  return dealt;
}

// Area damage to everything hostile to src. Garrison-clearing weapons empty
// buildings in the radius instead of damaging them (handled by applyDamage).
export function splashDamage(sim, x, z, r, dmg, wname, src, sx = x, sz = z) {
  const n = sim.ents.length;
  for (let i = 0; i < n; i++) {
    const e = sim.ents[i];
    if (e.dead || e.team === src.team || e.team === NEUTRAL) continue;
    if (e.kind === 'unit' && e.inB) continue;
    const d = e.kind === 'unit' ? Math.max(0, Math.hypot(e.x - x, e.z - z) - e.radius) : rectDist(e, x, z);
    if (d > r) continue;
    applyDamage(sim, e, dmg * (1 - 0.6 * d / r), wname, sx, sz, src);
  }
}

// Placement rule shared by the sim (authoritative) and the UI ghost.
export function canPlace(sim, type, cx, cz, team) {
  const d = BLDGS[type], nav = sim.nav;
  if (cx < 4 || cz < 4 || cx + d.w > N - 4 || cz + d.h > N - 4) return false;
  for (let z = cz - 1; z <= cz + d.h; z++) for (let x = cx - 1; x <= cx + d.w; x++) {
    const i = z * N + x;
    if (nav.stat[i] || nav.bld[i]) return false;
    if (team >= 0 && team < 2 && !sim.fog.exp[team][i]) return false;
  }
  const x0 = cx * CELL, z0 = cz * CELL, x1 = (cx + d.w) * CELL, z1 = (cz + d.h) * CELL;
  for (const e of sim.ents) {
    if (e.kind !== 'unit' || e.dead || e.inB || e.air || UNITS[e.type].builder) continue;
    if (e.x > x0 - e.radius && e.x < x1 + e.radius && e.z > z0 - e.radius && e.z < z1 + e.radius) return false;
  }
  return true;
}

export function hasBldg(sim, team, type) {
  for (const e of sim.ents) if (e.kind === 'bldg' && e.team === team && e.type === type && e.done && !e.dead) return true;
  return false;
}
