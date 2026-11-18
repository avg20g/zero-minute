// The deterministic simulation. step() advances exactly one 20 Hz tick.
// Nothing in here touches the DOM, the clock, or Math.random. All three
// factions run through this one loop; their differences are registry data.
import { N, CELL, WORLD, PLAYER, ENEMY, NEUTRAL, setMapSize } from './defs.js';
import { UNITS, BLDGS, FACTIONS, UPGRADES, POWERS, GENERALS, GENERAL, trainsOf, upgradesOf, unitCost, bldgCost } from './factionRegistry.js';
import { generateMap } from './map.js';
import { Nav } from './pathfinding.js';
import { Fog } from './fog.js';
import { makeUnit, makeBldg, spawnNear, kill, reqPath, moveTo, isMoving, stopUnit, releaseSlot, rectDist, canPlace, placeError, hasBldg, ejectGarrison, capacityOf, removeBldg, roomFor, isTransport, canRide, landingCell } from './entities.js';
import { stepMovement, stepPaths, formationSlots } from './move.js';
import { stepAir, padCount } from './air.js';
import { stepCombat, targetable, canAttack, canForce, groundTarget } from './combat.js';
import { stepPower, stepProduction, stepConstruction, stepHarvest, approachPoint } from './econ.js';
import { stepUpkeep, teleport, nearestTunnel, captureTick, sabotage } from './abilities.js';
import { stepPowers, usePower } from './powers.js';
import { AIController } from './aiController.js';

const mkTeam = (faction, money) => ({ faction, money, prod: 0, use: 0, low: false, earned: 0, passive: 0,
  xp: 0, rank: 1, points: 1, promos: new Set(), upgrades: new Set(), flags: {}, powerReady: {}, powersUsed: 0, hacked: 0,
  built: 0, unitsLost: 0, unitsKilled: 0, bldgsLost: 0, bldgsKilled: 0 }); // after-action report counters

export class Sim {
  constructor(opts = {}) {
    this.rng = (opts.seed ?? 20031) >>> 0;
    this.map = generateMap(opts.map || undefined);  // opts.map: a map spec (lobby map or the map builder); it also sets the map size
    this.size = this.map.N;
    this.noEnemy = !!opts.noEnemy;                  // sandbox: no opposing base, no AI, no win or lose
    this.nav = new Nav(this.map.blocked, this.map.road);
    this.fog = new Fog();
    this.ents = []; this.byId = new Map(); this.nextId = 1;
    this.projs = []; this.events = []; this.cmds = []; this.pathQ = [];
    this.strikes = []; this.hazards = []; this.crates = []; this.pdlUnits = []; this.reveals = []; this.lastSuper = [-1e9, -1e9];
    const f = opts.factions || ['vanguard', 'redhammer'];
    const money = opts.money ?? 8000;
    this.teams = [mkTeam(f[0], money), mkTeam(f[1], money)]; // equal starting cash; the AI never receives a bonus
    const gens = (opts.generals || []).map((g, i) => (g && GENERALS[g] && GENERALS[g].faction === f[i]) ? g : null);
    this.teams.forEach((T, i) => { T.general = gens[i] || null; const G = T.general && GENERALS[T.general];
      if (G && G.grant) for (const id of G.grant) { // a power a general starts with begins the match on its full recharge
        T.promos.add(id); const n = FACTIONS[f[i]].tree.find(x => x.id === id);
        if (n && n.power) T.powerReady[n.power] = Math.round((n.power === 'cashhack' && G.hack ? G.hack.cd : POWERS[n.power].cd) * 20);
      } });
    if (opts.noEnemy) { // sandbox: the player starts at full rank with every General's promotion and power unlocked
      const T = this.teams[PLAYER]; T.rank = GENERAL.rankXp.length; T.xp = GENERAL.rankXp[GENERAL.rankXp.length - 1]; T.points = 0;
      for (const n of FACTIONS[T.faction].tree) { T.promos.add(n.id); if (n.flag) T.flags[n.flag] = true; if (n.power) T.powerReady[n.power] = 0; }
    }
    this.tick = 0; this.winner = -1;
    this.aiNotes = opts.aiNotes || null;            // the Hard AI's notebook from earlier matches (kept by the page, stored with the replay); null in tests and balance sweeps
    this.setup = { aiNotes: this.aiNotes, factions: f.slice(), money, difficulty: opts.difficulty || 'medium', seed: this.rng, treaty: opts.treaty || 0, noSuper: !!opts.noSuper, koth: !!opts.koth, noEnemy: !!opts.noEnemy, noShroud: !!opts.noShroud, friendlyFire: !!opts.friendlyFire, map: opts.map || null, generals: [gens[0] || null, gens[1] || null] }; // everything a replay needs
    this.noSuper = !!opts.noSuper;               // lobby rule: superweapons cannot be built
    this.ff = !!opts.friendlyFire;               // lobby rule: explosions, gas and fire also hurt the side that made them
    this.koth = null;                            // King of the Hill state, set in setupSkirmish when the mode is on
    this.treatyUntil = (opts.treaty || 0) * 20; // peace treaty: nobody can be targeted before this tick
    this.stats = { paths: 0, expanded: 0, teleports: 0 };
    this.ais = [];
    if (!opts.empty) setupSkirmish(this);
    this.nav.rebuild();
    if (opts.koth) { // the hill is the open ground nearest the map centre; its position is public
      const c = this.nav.nearest(N >> 1, N >> 1, 1, -1, 60), hx = c < 0 ? WORLD / 2 : ((c % N) + 0.5) * CELL, hz = c < 0 ? WORLD / 2 : (((c / N) | 0) + 0.5) * CELL;
      this.koth = { x: hx, z: hz, r: KOTH.radius, need: KOTH.hold, secs: [0, 0], owner: -1 };
    }
    stepPower(this);
    this.fog.update(this);
    if (opts.noShroud) this.fog.exp[PLAYER].fill(1);   // lobby default: the player starts with the whole map charted (terrain only: the enemy stays hidden until seen)
    // AI opponents: opts.ai false = none, 'both' = AI on both sides (tests), otherwise the enemy side
    if (opts.ai !== false && !opts.empty && !opts.noEnemy) {
      const lv = opts.difficulty || 'medium';
      for (const t of opts.ai === 'both' ? [PLAYER, ENEMY] : [ENEMY]) this.ais.push(new AIController(this, t, Array.isArray(lv) ? lv[t] : lv));
    }
  }
  rand() { // mulberry32
    let t = (this.rng = (this.rng + 0x6D2B79F5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  issue(cmd) { this.cmds.push(cmd); } // applied at the start of the next tick

  use() { if (N !== this.size) setMapSize(this.size); return this; }   // make this game's map size the current one (several games can exist at once)

  step() {
    if (N !== this.size) setMapSize(this.size);
    if (this.cmds.length) { const c = this.cmds; this.cmds = []; for (const cmd of c) applyCommand(this, cmd); }
    if (this.nav.dirty) this.nav.rebuild();
    for (const a of this.ais) a.step();
    stepPower(this);
    stepUpkeep(this);
    stepProduction(this);
    stepConstruction(this);
    stepHarvest(this);
    stepOrders(this);
    if (this.nav.dirty) this.nav.rebuild();
    stepPaths(this);
    stepMovement(this);
    stepAir(this);
    stepCombat(this);
    stepPowers(this);
    // remove the dead
    let any = false;
    for (const e of this.ents) if (e.dead) { any = true; this.byId.delete(e.id); }
    if (any) this.ents = this.ents.filter(e => !e.dead);
    if (this.tick % 4 === 0) this.fog.update(this);
    if (this.tick % 20 === 0 && this.winner < 0 && !this.noEnemy) { if (this.koth) stepHill(this); checkVictory(this); }
    this.tick++;
  }

  hash() { // state fingerprint for determinism checks
    let h = 2166136261 >>> 0;
    const mix = v => { h ^= v | 0; h = Math.imul(h, 16777619) >>> 0; };
    for (const e of this.ents) { mix(e.id); mix(Math.round(e.x * 1000)); mix(Math.round(e.z * 1000)); mix(Math.round(e.hp * 100)); mix(Math.round(e.facing * 1000)); mix(e.team); }
    for (const t of this.teams) { mix(t.money); mix(Math.round(t.xp * 100)); mix(t.rank); }
    mix(this.crates.length); mix(this.strikes.length); mix(this.hazards.length); mix(this.rng); mix(this.tick);
    return h;
  }
}

// King of the Hill: hold the centre alone to run your clock; if the enemy holds it alone, your clock resets.
export const KOTH = { radius: 26, hold: 180 };                   // metres, seconds
function stepHill(sim) {
  const k = sim.koth, here = [0, 0];
  if (sim.tick < sim.treatyUntil) return;
  for (const e of sim.ents) {
    if (e.kind !== 'unit' || e.dead || e.team > 1 || e.inB || e.air) continue;
    const d = UNITS[e.type]; if (!d.weapon || d.harvester || d.builder) continue;
    if (Math.hypot(e.x - k.x, e.z - k.z) <= k.r) here[e.team]++;
  }
  const owner = here[0] && !here[1] ? 0 : here[1] && !here[0] ? 1 : -1;
  if (owner !== k.owner) { k.owner = owner; sim.events.push({ t: 'hill', owner, x: k.x, z: k.z }); }
  if (owner >= 0) { k.secs[owner]++; k.secs[1 - owner] = 0; if (k.secs[owner] >= k.need && sim.winner < 0) { sim.winner = owner; sim.events.push({ t: 'over', winner: owner, why: 'hill' }); } }
}

function checkVictory(sim) {
  if (sim.winner >= 0) return;
  // A side is eliminated once it has no Command Center and no builder left to raise a new one.
  const alive = [0, 0];
  for (const e of sim.ents) {
    if (e.dead || e.team > 1) continue;
    if (e.kind === 'bldg' ? BLDGS[e.type].role === 'cc' : !!UNITS[e.type].builder && !e.inert) alive[e.team]++;
  }
  if (!alive[ENEMY]) sim.winner = PLAYER; else if (!alive[PLAYER]) sim.winner = ENEMY;
  if (sim.winner >= 0) sim.events.push({ t: 'over', winner: sim.winner });
}

// ---------------- Scenario ----------------
function setupSkirmish(sim) {
  const m = sim.map;
  for (let i = 0; i < m.civs.length; i++) { const b = makeBldg(sim, 'civ', NEUTRAL, m.civs[i][0], m.civs[i][1]); b.variant = m.civs[i][2] | 0; } // variant = building kind (CIV_KINDS)
  for (const d of m.docks) { const b = makeBldg(sim, 'dock', NEUTRAL, d.x, d.z); b.supplies = b.maxSupplies = d.amount; }
  for (const d of m.derricks) makeBldg(sim, 'derrick', NEUTRAL, d[0], d[1]);
  for (const d of m.sites || []) makeBldg(sim, 'site_' + d[2], NEUTRAL, d[0], d[1]);   // capturable sites: repair, hospital, radar, gun
  sim.nav.rebuild();

  // Player: Command Center, one builder, two squads
  const P = FACTIONS[sim.teams[PLAYER].faction].roles, [px, pz] = m.start[0].cc;
  const pcc = makeBldg(sim, P.cc, PLAYER, px, pz);
  sim.nav.rebuild();
  const put = m.custom ? spawnNear : makeUnit;   // on a custom map the exact opening spots may be uneven: take the nearest free ground
  put(sim, P.builder, PLAYER, pcc.x + 6, pcc.z + 26, 0);
  put(sim, P.squad, PLAYER, pcc.x + 26, pcc.z - 6, 0);
  put(sim, P.squad, PLAYER, pcc.x + 26, pcc.z + 2, 0);
  if (sim.noEnemy) return;                        // sandbox: nobody on the other side

  // Opponent: exactly the same opening on the mirrored side. No pre-built base,
  // no extra money: the AI has to build, scout and fight under the same rules.
  const E = FACTIONS[sim.teams[ENEMY].faction].roles, [ex, ez] = m.start[1].cc;
  const ecc = makeBldg(sim, E.cc, ENEMY, ex, ez);
  sim.nav.rebuild();
  put(sim, E.builder, ENEMY, ecc.x - 6, ecc.z - 26, Math.PI);
  put(sim, E.squad, ENEMY, ecc.x - 26, ecc.z + 6, Math.PI);
  put(sim, E.squad, ENEMY, ecc.x - 26, ecc.z - 2, Math.PI);

  // Both sides start knowing their own corner of the map.
  sim.fog.stamp(PLAYER, pcc.x, pcc.z, 84);
  sim.fog.stamp(ENEMY, ecc.x, ecc.z, 84);
}

// ---------------- Commands ----------------
function own(sim, id, team) { const e = sim.byId.get(id); return e && !e.dead && e.team === team ? e : null; }
function freeUnit(sim, u) { // clear any state tied to the previous order
  if (u.slotB || u.exitB) releaseSlot(sim, u);
  u.still = false; u.working = false; u.target = 0; u.noPath = 0; u.capT = 0; u.deployed = false; u.wps = null;   // a new order also drops any queued move markers
  u.bursts[0] = u.bursts[1] = u.bursts[2] = 0;
}
const msg = (sim, team, text) => sim.events.push({ t: 'msg', team, text });
// One hero per side: true while this team has a hero alive or in a production queue.
export function heroTaken(sim, team) {
  for (const e of sim.ents) {
    if (e.dead || e.team !== team) continue;
    if (e.kind === 'unit' ? UNITS[e.type].hero && !e.inert : e.queue.some(q => UNITS[q] && UNITS[q].hero)) return true;
  }
  return false;
}
function upgradeTaken(sim, team, id) {
  if (sim.teams[team].upgrades.has(id)) return true;
  for (const e of sim.ents) if (e.kind === 'bldg' && e.team === team && e.queue.includes('up:' + id)) return true;
  return false;
}

function applyCommand(sim, c) {
  const team = c.team ?? PLAYER, T = sim.teams[team], F = FACTIONS[T.faction];
  const units = (pred) => { const out = []; for (const id of c.ids || []) { const u = own(sim, id, team); if (u && u.kind === 'unit' && !u.inB && !u.inert && (!pred || pred(u, UNITS[u.type]))) out.push(u); } return out; };   // a unit that has resigned takes no orders
  switch (c.t) {
    case 'move': {
      let all = units();
      if (c.queue) { // move marker: units already on a move add this point after the ones they have; the rest treat it as a plain move
        if (sim.nav.dirty) sim.nav.rebuild();
        const busy = all.filter(u => !UNITS[u.type].based && u.order && (u.order.t === 'move' || u.order.t === 'amove'));
        const gq = busy.filter(u => !u.air), slots = gq.length ? formationSlots(sim, gq, c.x, c.z) : [];
        gq.forEach((u, i) => { (u.wps || (u.wps = [])).length < MAX_WPS && u.wps.push({ x: slots[i][0], z: slots[i][1], a: !!c.attack }); });
        busy.filter(u => u.air).forEach((u, i) => { (u.wps || (u.wps = [])).length < MAX_WPS && u.wps.push({ x: c.x + ((i % 3) - 1) * 7, z: c.z + ((i / 3) | 0) * 7, a: !!c.attack }); });
        all = all.filter(u => !busy.includes(u));
      }
      const us = all.filter(u => !u.air), air = all.filter(u => u.air);
      if (us.length) {
        if (sim.nav.dirty) sim.nav.rebuild();
        // keep relative left/right ordering so paths cross less
        let cx = 0, cz = 0; for (const u of us) { cx += u.x; cz += u.z; } cx /= us.length; cz /= us.length;
        let fx = c.x - cx, fz = c.z - cz; const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
        us.sort((a, b) => (-(a.x - cx) * fz + (a.z - cz) * fx) - (-(b.x - cx) * fz + (b.z - cz) * fx) || a.id - b.id);
        const slots = formationSlots(sim, us, c.x, c.z);
        for (let i = 0; i < us.length; i++) {
          const u = us[i]; freeUnit(sim, u);
          u.order = { t: c.attack ? 'amove' : 'move', x: slots[i][0], z: slots[i][1], rev: !!c.reverse && u.cls === 1 && !c.attack };
          reqPath(sim, u, slots[i][0], slots[i][1]);
        }
      }
      for (let i = 0; i < air.length; i++) {
        const u = air[i], ox = ((i % 3) - (Math.min(air.length, 3) - 1) / 2) * 7, oz = ((i / 3) | 0) * 7;
        freeUnit(sim, u); u.order = { t: c.attack ? 'amove' : 'move', x: c.x + ox, z: c.z + oz, guard: !!c.guard }; // guard: strike aircraft hold over the point until out of missiles (air.js)
        if (!UNITS[u.type].based) moveTo(sim, u, c.x + ox, c.z + oz);
      }
      break;
    }
    case 'force': { // force attack: a point on the ground, or any unit or building (yours, the enemy's or neutral)
      if (sim.tick < sim.treatyUntil) { msg(sim, team, 'Peace treaty: weapons are locked'); break; }
      const t = c.target ? sim.byId.get(c.target) : null, ent = !!t && !t.dead && !t.ruined && !(t.kind === 'unit' && t.inB);
      if (!ent && !(c.x >= 0 && c.z >= 0)) break;
      for (const u of units((u) => canForce(sim, u))) {
        if (ent && t === u) continue;
        freeUnit(sim, u); stopUnit(u); u.target = 0;
        u.order = ent ? { t: 'fattack', id: t.id, x: t.x, z: t.z, g: null } : { t: 'fattack', id: 0, x: c.x, z: c.z, g: groundTarget(c.x, c.z) };
      }
      break;
    }
    case 'cancelbuild': { // cancel an unfinished building: the full price comes back
      const b = own(sim, c.id, team); if (!b || b.kind !== 'bldg' || b.done) break;
      const back = bldgCost(T, b.type) | 0; T.money += back; removeBldg(sim, b);
      sim.events.push({ t: 'cancelbuild', id: b.id, x: b.x, z: b.z, team, amt: back });
      break;
    }
    case 'landrepair': { // helicopters fly to the nearest friendly helipad, land and are repaired there
      const want = c.target ? own(sim, c.target, team) : null;       // a helipad the player pointed at
      for (const u of units((u, d) => d.heli)) {
        let best = want && want.heli && want.done ? want : null, bd = 1e18;
        if (!best)
        for (const b of sim.ents) { if (b.kind !== 'bldg' || b.dead || !b.done || b.team !== team || !b.heli) continue; const dd = (b.x - u.x) ** 2 + (b.z - u.z) ** 2; if (dd < bd) { bd = dd; best = b; } }
        if (!best) { msg(sim, team, 'Requires an Airfield (helipad)'); break; }
        if (u.as === 'pad') continue;                                     // already down
        freeUnit(sim, u); stopUnit(u); u.order = { t: 'repair', id: best.id };
      }
      break;
    }
    case 'rtb': // strike aircraft break off, fly home and land (where they are re-armed and repaired)
      for (const u of units((u, d) => d.based)) { freeUnit(sim, u); u.order = null; u.target = 0; u.loiterT = 0; }
      break;
    case 'repairat': { // vehicles drive to the repair bay of one of your buildings (War Factory, Tunnel Network)
      const b = own(sim, c.target, team); if (!b || b.kind !== 'bldg' || !b.done || !BLDGS[b.type].repair) break;
      const yard = !!BLDGS[b.type].shore;                              // a shipyard takes ships, the others take land vehicles
      const us = units((u, d) => u.cls === 1 && !u.air && !!d.ship === yard); if (!us.length) break;
      if (sim.nav.dirty) sim.nav.rebuild();
      let cx = 0, cz = 0; for (const u of us) { cx += u.x; cz += u.z; } const [ax, az] = yard ? [b.launch.x, b.launch.z] : approachPoint(b, cx / us.length, cz / us.length, 5), slots = formationSlots(sim, us, ax, az);
      us.forEach((u, i) => { freeUnit(sim, u); u.order = { t: 'move', x: slots[i][0], z: slots[i][1], rev: false }; reqPath(sim, u, slots[i][0], slots[i][1]); });
      break;
    }
    case 'heromode': // switch a hero's ability (Fook Mie: recruit or resign)
      for (const u of units((u, d) => d.modes)) { const m = UNITS[u.type].modes; u.mode = m.includes(c.mode) ? c.mode : m[(m.indexOf(u.mode) + 1) % m.length]; }
      break;
    case 'attack': {
      const t = sim.byId.get(c.target); if (!targetable(sim, team, t)) break;
      for (const u of units((u) => canAttack(u, t))) { freeUnit(sim, u); u.order = { t: 'attack', id: t.id }; u.target = t.id; }
      break;
    }
    case 'scatter': // break up a clump: every unit dashes to its own nearby spot (uses the sim RNG, so replays match)
      if (sim.nav.dirty) sim.nav.rebuild();
      for (const u of units()) {
        if (u.air) continue;
        const a = sim.rand() * 6.2831853, d = 9 + sim.rand() * 9, c0 = sim.nav.nearest(Math.floor((u.x + Math.cos(a) * d) / CELL), Math.floor((u.z + Math.sin(a) * d) / CELL), u.nc, -1, 8);
        if (c0 < 0) continue;
        freeUnit(sim, u); const x = ((c0 % N) + 0.5) * CELL, z = (((c0 / N) | 0) + 0.5) * CELL;
        u.order = { t: 'move', x, z }; reqPath(sim, u, x, z);
      }
      break;
    case 'stop':
      for (const u of units()) { freeUnit(sim, u); stopUnit(u); u.order = UNITS[u.type].harvester ? { t: 'hold' } : null; u.guardX = u.x; u.guardZ = u.z; }
      break;
    case 'build': {
      const u = own(sim, c.id, team), d = BLDGS[c.type];
      if (!u || !UNITS[u.type].builder || !d || !F.build.includes(c.type) || (d.general && d.general !== T.general)) break;   // some buildings belong to one general
      const price = bldgCost(T, c.type);
      if (T.money < price) { msg(sim, team, 'Insufficient funds'); break; }
      if (d.needs && !hasBldg(sim, team, d.needs)) { msg(sim, team, `Requires ${BLDGS[d.needs].name}`); break; }
      if (d.superPower && sim.noSuper) { msg(sim, team, 'Superweapons are disabled for this match'); break; }
      { const why = placeError(sim, c.type, c.cx, c.cz, team); if (why) { msg(sim, team, why); break; } }
      T.money -= price;
      const b = makeBldg(sim, c.type, team, c.cx, c.cz, false);
      sim.events.push({ t: 'place', id: b.id, team });
      freeUnit(sim, u); stopUnit(u); u.order = { t: 'construct', id: b.id };
      break;
    }
    case 'construct': {
      const b = own(sim, c.target, team); if (!b || b.kind !== 'bldg') break;
      for (const u of units((u, d) => d.builder)) { freeUnit(sim, u); stopUnit(u); u.order = { t: 'construct', id: b.id }; }
      break;
    }
    case 'train': {
      const b = own(sim, c.id, team); if (!b || b.kind !== 'bldg' || !b.done || b.queue.length >= 6) break;
      const bd = BLDGS[b.type];
      if (c.type.startsWith('up:')) {
        const id = c.type.slice(3), up = UPGRADES[id];
        if (!up || !upgradesOf(T, b.type).includes(id) || upgradeTaken(sim, team, id)) break;
        if (T.money < up.cost) { msg(sim, team, 'Insufficient funds'); break; }
        T.money -= up.cost; b.queue.push(c.type); break;
      }
      const d = UNITS[c.type];
      if (!d || !trainsOf(T, b.type).includes(c.type)) break;
      if (d.promo && !T.promos.has(d.promo)) { msg(sim, team, 'Requires a General’s promotion'); break; }
      if (d.based && padCount(sim, b) >= b.pads.length) { msg(sim, team, 'Airfield is full'); break; }
      if (d.needs && !hasBldg(sim, team, d.needs)) { msg(sim, team, `Requires ${BLDGS[d.needs].name}`); break; }
      if (d.hero && heroTaken(sim, team)) { msg(sim, team, 'Only one hero at a time'); break; }
      const price = unitCost(T, c.type);                 // a general may make some units cheaper
      if (T.money < price) { msg(sim, team, 'Insufficient funds'); break; }
      T.money -= price; b.queue.push(c.type);
      break;
    }
    case 'cancel': {
      const b = own(sim, c.id, team); if (!b || !(c.idx >= 0) || c.idx >= b.queue.length) break;   // a malformed index is ignored, never a crash
      const q = b.queue[c.idx];
      T.money += q.startsWith('up:') ? UPGRADES[q.slice(3)].cost : unitCost(T, q);
      b.queue.splice(c.idx, 1); if (c.idx === 0) b.prod = 0;
      break;
    }
    case 'rally': { const b = own(sim, c.id, team); if (b && b.kind === 'bldg') { b.rallyX = c.x; b.rallyZ = c.z; } break; }
    case 'garrison': {
      const b = sim.byId.get(c.target); if (!b || b.ruined || !capacityOf(b)) break;
      const boat = isTransport(b); if (boat && b.team !== team) break;     // a Landing Craft takes infantry squads or one vehicle; buildings and bunkers take squads that can garrison
      for (const u of units((u, d) => (boat ? canRide(u) : d.canGarrison) && u !== b)) { freeUnit(sim, u); stopUnit(u); u.order = { t: 'garrison', id: b.id }; }
      break;
    }
    case 'evacuate': { // empty a garrison: all squads, or `count` of them; with x,z they walk to that point once outside
      const b = sim.byId.get(c.id); if (!b || b.team !== team || !b.garrison || !b.garrison.length) break;
      if (isTransport(b) && landingCell(sim, b, 0) < 0) { msg(sim, team, UNITS[b.type].ship ? 'Move to the shore to unload' : 'No ground to unload onto here'); break; }
      const out = ejectGarrison(sim, b, 1, c.count > 0 ? c.count | 0 : 1e9);
      if (out.length && c.x >= 0 && c.z >= 0) {
        if (sim.nav.dirty) sim.nav.rebuild();
        const slots = formationSlots(sim, out, c.x, c.z);
        out.forEach((u, i) => { u.order = { t: 'move', x: slots[i][0], z: slots[i][1], rev: false }; moveTo(sim, u, slots[i][0], slots[i][1]); });
      }
      sim.events.push({ t: 'evacuate', id: b.id, team, x: b.x, z: b.z, n: out.length });
      break;
    }
    case 'harvest': {
      const b = sim.byId.get(c.target); if (!b) break;
      for (const u of units((u, d) => d.harvester)) {
        freeUnit(sim, u); stopUnit(u);
        if (b.type === 'dock') u.dock = b.id;
        u.order = { t: 'harvest' }; u.hs = 'seek'; u.timer = -1;
      }
      break;
    }
    // ---- phase 2
    case 'power': usePower(sim, team, c.id, c.x, c.z); break;
    case 'promote': {
      const n = F.tree.find(k => k.id === c.node);
      if (!n || T.promos.has(n.id) || T.points < 1 || T.rank < n.tier || (n.req && !T.promos.has(n.req))) break;
      T.points--; T.promos.add(n.id);
      if (n.flag) T.flags[n.flag] = true;
      if (n.power) T.powerReady[n.power] = sim.tick;
      sim.events.push({ t: 'promo', team, node: n.id });
      break;
    }
    case 'addon': {
      const u = own(sim, c.id, team); if (!u || u.kind !== 'unit') break;
      const hp = (UNITS[u.type].hardpoints || {})[c.type];
      if (!hp || u.addon || u.addonQ) break;
      if (T.money < hp.cost) { msg(sim, team, 'Insufficient funds'); break; }
      T.money -= hp.cost; u.addonQ = { type: c.type, t: 0 };
      break;
    }
    case 'deploy':
      for (const u of units((u, d) => d.deploy)) {
        if (u.deployed) { u.deployed = false; continue; }
        freeUnit(sim, u); stopUnit(u); u.order = null; u.deployed = true; u.guardX = u.x; u.guardZ = u.z;
        sim.events.push({ t: 'deploy', id: u.id, team });
      }
      break;
    case 'tunnel': {
      const ex = own(sim, c.target, team); if (!ex || !BLDGS[ex.type] || !BLDGS[ex.type].tunnel || !ex.done) break;
      for (const u of units((u, d) => !u.air && !d.ship)) { freeUnit(sim, u); stopUnit(u); u.order = { t: 'tunnel', to: ex.id, via: 0 }; }
      break;
    }
    case 'capture': {
      const b = sim.byId.get(c.target); if (!b || b.kind !== 'bldg' || !BLDGS[b.type].capturable || b.team === team) break;
      for (const u of units((u, d) => d.canCapture)) { freeUnit(sim, u); stopUnit(u); u.order = { t: 'capture', id: b.id }; }
      break;
    }
    case 'infiltrate': {
      const b = sim.byId.get(c.target); if (!b || b.kind !== 'bldg' || b.team === team || b.team > 1 || !BLDGS[b.type].faction) break;
      for (const u of units((u, d) => d.infiltrator)) { freeUnit(sim, u); stopUnit(u); u.order = { t: 'infiltrate', id: b.id }; }
      break;
    }
  }
}

// ---------------- Order upkeep ----------------
function done(u) { u.order = null; u.guardX = u.x; u.guardZ = u.z; }
export const BOARD_RANGE = 11;   // metres from a Landing Craft's side at which troops on the beach can get aboard
export const MAX_WPS = 12;   // move markers one unit can have queued
// Head for the next queued move marker, if there is one.
function nextMarker(sim, u) {
  const w = u.wps && u.wps.shift();
  if (!w) { u.wps = null; return false; }
  if (!u.wps.length) u.wps = null;
  u.order = { t: w.a ? 'amove' : 'move', x: w.x, z: w.z, rev: false }; u.noPath = 0; u.arrived = false;
  moveTo(sim, u, w.x, w.z);
  return true;
}
function stepOrders(sim) {
  for (const u of sim.ents) {
    if (u.kind !== 'unit' || u.dead || u.inB || u.inert) continue;
    const o = u.order; if (!o) continue;
    switch (o.t) {
      case 'move':
        if (UNITS[u.type].based) break; // flight logic owns strike aircraft
        if (u.arrived || !isMoving(u)) { if (!nextMarker(sim, u)) done(u); }
        break;
      case 'amove':
        if (UNITS[u.type].based) break;
        if (u.arrived && !u.target) { if (!nextMarker(sim, u)) done(u); }
        else if (!u.target && !isMoving(u)) {
          if (Math.hypot(o.x - u.x, o.z - u.z) < 5 || u.noPath > 2) { if (!nextMarker(sim, u)) done(u); }
          else moveTo(sim, u, o.x, o.z);
        }
        break;
      case 'garrison': {
        const b = sim.byId.get(o.id), cap = b && !b.dead && !b.ruined ? capacityOf(b) : 0;
        const allowed = cap && roomFor(sim, b, u) && (b.kind === 'unit' ? b.team === u.team : (b.team === NEUTRAL || b.team === u.team));
        if (!allowed) { stopUnit(u); done(u); break; }
        if (rectDist(b, u.x, u.z) <= (isTransport(b) ? BOARD_RANGE : 4.2)) {
          stopUnit(u); u.inB = b.id; u.order = null; u.target = 0; u.vx = u.vz = u.spd = 0; u.cloaked = false;
          b.garrison.push(u.id); if (b.kind === 'bldg') b.team = u.team;
          sim.events.push({ t: 'garrison', id: b.id, team: u.team, x: b.x, z: b.z });
        } else if (!u.pathReq && (!u.path || (b.kind === 'unit' && (sim.tick + u.id) % 12 === 0))) {
          if (u.noPath > 3) { done(u); break; }
          if (b.kind === 'unit') reqPath(sim, u, b.x, b.z);
          else { const [ax, az] = approachPoint(b, u.x, u.z, 1.2); reqPath(sim, u, ax, az); }
        }
        break;
      }
      case 'capture': {
        const b = sim.byId.get(o.id);
        if (!b || b.team === u.team || !BLDGS[b.type].capturable) { u.capT = 0; done(u); break; }
        if (rectDist(b, u.x, u.z) <= 3.6) { stopUnit(u); if (captureTick(sim, u, b)) done(u); }
        else { u.capT = 0; if (!isMoving(u)) { if (u.noPath > 3) { done(u); break; } const [ax, az] = approachPoint(b, u.x, u.z, 1.2); reqPath(sim, u, ax, az); } }
        break;
      }
      case 'infiltrate': {
        const b = sim.byId.get(o.id);
        if (!b || b.dead || b.team === u.team || b.team > 1) { done(u); break; }
        if (rectDist(b, u.x, u.z) <= 3.6) sabotage(sim, u, b);
        else if (!isMoving(u)) { if (u.noPath > 3) { done(u); break; } const [ax, az] = approachPoint(b, u.x, u.z, 1.2); reqPath(sim, u, ax, az); }
        break;
      }
      case 'tunnel': {
        const ex = sim.byId.get(o.to);
        if (!ex || ex.dead || !ex.done || ex.team !== u.team) { stopUnit(u); done(u); break; }
        let via = o.via ? sim.byId.get(o.via) : null;
        if (!via || via.dead || !via.done || via.team !== u.team) { via = nearestTunnel(sim, u, ex); o.via = via ? via.id : 0; stopUnit(u); }
        if (!via) { // only one tunnel exists: just walk to it
          const [ax, az] = approachPoint(ex, u.x, u.z, 4); u.order = { t: 'move', x: ax, z: az }; reqPath(sim, u, ax, az); break;
        }
        if (rectDist(via, u.x, u.z) <= 6.2) {
          if (teleport(sim, u, ex)) sim.stats.teleports++;
          else { stopUnit(u); done(u); sim.events.push({ t: 'msg', team: u.team, text: 'Tunnel exit is blocked' }); }
        } else if (!isMoving(u)) {
          if (u.noPath > 3) { done(u); break; }
          const [ax, az] = approachPoint(via, u.x, u.z, 2.4); reqPath(sim, u, ax, az);
        }
        break;
      }
      case 'hold': break;
    }
  }
}

export { applyCommand, canPlace, hasBldg, kill };
