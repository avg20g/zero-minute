// Utility AI opponent. It plays by the player's rules:
//   * same opening (command building, one builder, two squads) and same starting cash;
//   * every order goes through sim.issue(), exactly like a mouse click;
//   * it never reads the other team's money, power, upgrades or promotions;
//   * enemy entities are read in ONE place, perceive(), and only when the AI's own
//     Fog-of-War grid (aiVisionGrid) says they are in view. Everything else works
//     from aiMemoryMap: last known positions with timestamps.
// Difficulty changes behaviour caps only (actions per minute, reaction delay,
// which tactics are allowed), never resources or vision.
import { N, CELL, WORLD } from './defs.js';
import { UNITS, BLDGS, FACTIONS, POWERS, UPGRADES, WEAPONS, trainsOf, upgradesOf, unitCost, nodePower } from './factionRegistry.js';
import { hasBldg } from './entities.js';
import { powerError, hasPower, superOf } from './powers.js';
import { padCount } from './air.js';

export const DIFFICULTY = {
  easy:   { label: 'Easy',   apm: 25,  react: 50, counters: false, retreat: false, focus: false, flank: false, combo: false, reverse: false, superweapon: false, derrickAfter: 420, armyCap: 14, attackAt: 3400, firstAttack: 5400, castAt: 3.5 },
  medium: { label: 'Medium', apm: 60,  react: 20, counters: true,  retreat: true,  focus: false, flank: false, combo: false, reverse: false, superweapon: true,  derrickAfter: 180, armyCap: 20, attackAt: 3200, firstAttack: 4200, castAt: 2.5 },
  hard:   { label: 'Hard',   apm: 120, react: 6,  counters: true,  retreat: true,  focus: true,  flank: true,  combo: true,  reverse: true,  superweapon: true,  derrickAfter: 40,  armyCap: 26, attackAt: 3000, firstAttack: 3000, castAt: 2.5 },
};
const ARM = ['inf', 'light', 'heavy', 'air'];
const SCOUT_STALE = 75 * 20;

// ---- registry-derived tables (public game rules, not match state) ----
// EFFECT[type][armor]: how well a unit kills that armor class per credit, 0..1 within its faction.
export const EFFECT = {}, REACH = {}, TAG = {};
for (const fid in FACTIONS) {
  const raw = {}, max = { inf: 1e-9, light: 1e-9, heavy: 1e-9, air: 1e-9 };
  for (const type in UNITS) {
    const d = UNITS[type]; if (d.faction !== fid) continue;
    const e = { inf: 0, light: 0, heavy: 0, air: 0 }; let reach = 0, arty = false;
    for (const wn of [d.weapon, d.weapon2]) {
      const w = wn && WEAPONS[wn]; if (!w || w.garrisonOnly) continue;
      // sustained damage per second; pad-based aircraft are limited by their rearm cycle
      const cycle = d.based ? d.reload + 240 : w.cd, shots = d.based ? d.ammo : (w.burst || 1);
      const dps = w.dmg * shots * 20 / cycle, hz = w.hazard ? w.hazard.dps * w.hazard.secs * 20 / cycle : 0;
      // area weapons (splash, lingering hazards, sprays) hit several soft targets at once
      const area = (w.splash || w.kind === 'spray') ? 3 : 1;
      for (const a of ARM) e[a] += (dps * (a === 'inf' || a === 'light' ? area : 1) * (w.vs[a] || 0) + (a === 'inf' ? hz * 3 : 0)) / Math.pow(d.cost, 0.7);
      reach = Math.max(reach, w.range); if (w.kind === 'lob' && w.range >= 60) arty = true;
    }
    raw[type] = e; REACH[type] = reach; TAG[type] = { arty, hero: d.cost >= 1800, builder: !!d.builder, harvester: !!d.harvester };
    for (const a of ARM) max[a] = Math.max(max[a], e[a]);
  }
  for (const type in raw) { EFFECT[type] = {}; for (const a of ARM) EFFECT[type][a] = raw[type][a] / max[a]; }
}
const cellOf = (x, z) => Math.min(N - 1, Math.max(0, Math.floor(z / CELL))) * N + Math.min(N - 1, Math.max(0, Math.floor(x / CELL)));
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export class AIController {
  constructor(sim, team, level = 'medium') {
    this.sim = sim; this.team = team; this.foe = 1 - team;
    this.level = DIFFICULTY[level] ? level : 'medium'; this.cfg = DIFFICULTY[this.level];
    this.T = sim.teams[team]; this.F = FACTIONS[this.T.faction];        // own team record only
    this.aiVisionGrid = sim.fog.vis[team];                              // 1 = cell in view right now
    this.aiExplored = sim.fog.exp[team];
    this.aiMemoryMap = new Map();                                       // id -> last known sighting
    this.docks = new Map(); this.derricks = new Map();                  // map features as last seen
    this.visible = []; this.seenTick = -1; this.lastFoeSeen = -1e9;
    this.budget = 2; this.actions = 0; this.log = null;
    const st = sim.map.start[team].cc; this.home = { x: st[0] + 5, z: st[1] + 5 };          // cells
    this.homeW = { x: this.home.x * CELL, z: this.home.z * CELL };
    const c = N / 2, dl = Math.hypot(c - this.home.x, c - this.home.z) || 1;
    this.front = { x: (c - this.home.x) / dl, z: (c - this.home.z) / dl };
    this.rally = this.snap((this.home.x + this.front.x * 24) * CELL, (this.home.z + this.front.z * 24) * CELL);
    // Points of interest come from the map itself (public knowledge, like reading the minimap terrain).
    const m = sim.map; this.pois = [];
    for (const d of m.docks) this.pois.push({ x: (d.x + 4) * CELL, z: (d.z + 3) * CELL, k: 'dock' });
    for (const d of m.derricks) this.pois.push({ x: (d[0] + 2) * CELL, z: (d[1] + 2) * CELL, k: 'derrick' });
    for (const r of m.rampTop) this.pois.push({ x: r.x, z: r.z, k: 'choke' });
    this.pois.push({ x: WORLD / 2, z: WORLD / 2, k: 'choke' });
    this.pois.push({ x: WORLD - this.homeW.x, z: WORLD - this.homeW.z, k: 'start' });           // the other start position
    const es = this.pois[this.pois.length - 1]; this.hunt = this.pois.slice().sort((a, b) => dist(a, es) - dist(b, es));
    this.homeDock = m.docks.map(d => ({ x: d.x + 4, z: d.z + 3 })).sort((a, b) => Math.hypot(a.x - this.home.x, a.z - this.home.z) - Math.hypot(b.x - this.home.x, b.z - this.home.z))[0];
    const Tm = sim.teams[team], can = new Set(this.F.build.flatMap(b => trainsOf(Tm, b)));   // what this side's general lets it build
    this.roster = Object.keys(UNITS).filter(k => UNITS[k].faction === this.F.id && can.has(k));
    this.combat = this.roster.filter(k => UNITS[k].weapon && !UNITS[k].harvester && !UNITS[k].builder && !UNITS[k].scout);
    this.scout = { id: 0, route: null, i: 0, leg: 0, lastSweep: -1e9, asked: -1e9, lost: -1e9, sweeps: 0 };
    this.op = { mode: 'gather', ids: [], groups: null, wps: null, target: null, since: 0, strength0: 0, wave: 0, lastPush: 0, hunt: 0 };
    this.retreating = new Map(); this.reversing = new Map(); this.focus = null; this.capId = 0; this.buildHold = 0; this.lastBuild = null; this.badSites = new Set();
    this.capHold = 0; this.rallied = new Set(); this.rot = 0; this.attackedAt = -1e9; this.lastDefend = -1e9; this.needIntel = false;
    this.stats = { builds: 0, trained: 0, scouts: 0, sweeps: 0, attacks: 0, flanks: 0, retreats: 0, reverses: 0, focus: 0, captures: 0, expands: 0, combos: 0, defended: 0, denied: 0, casts: [] };
    this.lastScores = [];
  }

  // ------------------------------------------------------------ plumbing
  snap(x, z) {
    const nav = this.sim.nav, c = nav.nearest(Math.floor(x / CELL), Math.floor(z / CELL), 1, -1, 30);
    return c < 0 ? { x, z } : { x: ((c % N) + 0.5) * CELL, z: (((c / N) | 0) + 0.5) * CELL };
  }
  // One action = one order, counted against the APM cap.
  act(cmd) {
    if (this.budget < 1) { this.stats.denied++; return false; }
    this.budget -= 1; this.actions++; cmd.team = this.team; this.sim.issue(cmd);
    if (this.log) this.log.push(this.sim.tick + ' ' + JSON.stringify(cmd));
    return true;
  }
  step() {
    const cfg = this.cfg, ph = this.sim.tick + this.team * 2;
    this.budget = Math.min(cfg.apm / 12, this.budget + cfg.apm / 1200);
    if (ph % 4 === 1) this.perceive();
    if (ph % 10 === 3) this.tactics();
    if (ph % 40 === 7) this.strategy();          // utility scoring every 2 s
  }

  // ------------------------------------------------------------ perception (the only reader of enemy state)
  perceive() {
    const sim = this.sim, fog = sim.fog, team = this.team, tick = sim.tick, mem = this.aiMemoryMap;
    if (this.seenTick === tick) return;
    const seen = this.visible = []; this.seenTick = tick;
    for (const e of sim.ents) {
      if (e.dead) continue;
      if (e.kind === 'bldg' && !BLDGS[e.type].faction) {                 // map features: only their state needs sight
        if (e.type === 'dock' && fog.canSee(team, e)) this.docks.set(e.id, { id: e.id, x: e.cx + 4, z: e.cz + 3, frac: e.maxSupplies ? e.supplies / e.maxSupplies : 0, tick });
        else if (e.type === 'derrick' && fog.canSee(team, e)) this.derricks.set(e.id, { id: e.id, x: e.x, z: e.z, owner: e.team, tick });
        if (e.type !== 'civ') continue;
      }
      if (e.team !== this.foe) continue;
      if (e.kind === 'unit' && e.inB) continue;
      if (!fog.canSee(team, e)) continue;                                // <- Fog-of-War firewall
      let m = mem.get(e.id);
      if (!m) {
        const d = e.kind === 'unit' ? UNITS[e.type] : BLDGS[e.type];
        m = { id: e.id, kind: e.kind, type: e.type, team: e.team, first: tick, tick: 0, x: 0, z: 0, hp: 1, vet: 0, cost: d.cost || 600,
          armor: e.kind === 'unit' ? d.armor : 'bldg', weapon: !!d.weapon, rect: e.kind === 'bldg' ? [e.cx, e.cz, e.w, e.h] : null };
        mem.set(e.id, m);
      } else if (tick - m.tick > 100) m.first = tick;                    // lost and re-acquired: reaction delay applies again
      m.x = e.x; m.z = e.z; m.tick = tick; m.hp = Math.max(0, e.hp / e.maxHp); m.vet = e.vet || 0;
      seen.push(m);
    }
    // Match rule, not scouting: a finished superweapon is announced to both sides with its position.
    for (const e of sim.ents) if (e.kind === 'bldg' && e.team === this.foe && !e.dead && e.done && BLDGS[e.type].superPower && !mem.has(e.id))
      mem.set(e.id, { id: e.id, kind: 'bldg', type: e.type, team: e.team, first: tick, tick: tick - 1, x: e.x, z: e.z, hp: 1, vet: 0, cost: BLDGS[e.type].cost, armor: 'bldg', weapon: false, rect: [e.cx, e.cz, e.w, e.h], announced: true });
    if (seen.length) this.lastFoeSeen = tick;
    // Forget what is provably gone: its last known spot is in view and it is not there. Unit sightings also age out.
    const grid = this.aiVisionGrid;
    for (const m of mem.values()) if (m.tick !== tick && (grid[cellOf(m.x, m.z)] === 1 || (m.kind === 'unit' && tick - m.tick > 3600))) mem.delete(m.id);
  }
  // Share of the spotted enemy force by armor class, weighted by cost and freshness. null = no intel.
  shares() {
    const tick = this.sim.tick, s = { inf: 0, light: 0, heavy: 0, air: 0 }; let tot = 0;
    for (const m of this.aiMemoryMap.values()) {
      if (m.kind !== 'unit' || !m.weapon || tick - m.tick > 3000 || !(m.armor in s)) continue;      // only fighting units shape the counter mix
      const w = m.cost * (tick - m.tick > SCOUT_STALE ? 0.5 : 1); s[m.armor] += w; tot += w;
    }
    if (!tot) return null;
    s.airValue = s.air;
    for (const a of ARM) s[a] /= tot;
    return s;
  }
  unitScore(type, sh, c) {
    const E = EFFECT[type], n = c.army.length || 1;
    let s;
    if (sh) {
      let w = 0; for (const a of ARM) w += sh[a] * E[a];
      if (sh.air > 0.15 && !E.air) w *= 0.6;
      s = 38 + 42 * w;
    } else s = 40 + (this.F.aiArmy[this.rot % this.F.aiArmy.length] === type ? 12 : 0);
    return s - 20 * (c.types[type] || 0) / n;                              // keep some variety
  }

  // ------------------------------------------------------------ own forces (full knowledge of own side is fair)
  census() {
    const sim = this.sim, team = this.team, tick = sim.tick, S = this.scout, R = this.F.roles;
    const c = { builders: [], trucks: 0, army: [], types: {}, bl: {}, prod: [], undone: [], queued: {}, deployers: [], scout: null, strength: 0, mine: [] };
    const live = sim.byId.get(S.id); const haveScout = live && !live.dead && live.team === team;
    if (!haveScout) { if (S.id) S.lost = tick; S.id = 0; }
    const cap = sim.byId.get(this.capId);
    for (const e of sim.ents) {
      if (e.team !== team || e.dead) continue;
      if (e.kind === 'bldg') {
        const d = BLDGS[e.type]; if (!d.faction) continue;
        (c.bl[d.role] || (c.bl[d.role] = [])).push(e); c.mine.push(e);
        if (!e.done) c.undone.push(e); else if (d.trains && !e.offline) c.prod.push(e);
        for (const q of e.queue) c.queued[q] = (c.queued[q] || 0) + 1;
        if (tick - e.lastHit < 40) this.attackedAt = tick;
        continue;
      }
      if (e.inB) continue;
      const d = UNITS[e.type];
      if (d.builder) c.builders.push(e);
      else if (d.harvester) c.trucks++;
      else if (e.id === S.id) c.scout = e;
      else if (!S.id && e.type === R.scout && tick - S.lost >= 600) { S.id = e.id; c.scout = e; this.stats.scouts++; }   // a lost scout is replaced after 30 s
      else if (e === cap && e.order && e.order.t === 'capture') continue;
      else if (d.deploy) c.deployers.push(e);
      else if (d.weapon) { c.army.push(e); c.types[e.type] = (c.types[e.type] || 0) + 1; c.strength += d.cost; }
    }
    return c;
  }
  trainer(c, type) {
    const d = UNITS[type]; if (d.promo && !this.T.promos.has(d.promo)) return null;
    let best = null;
    for (const b of c.prod) {
      if (!trainsOf(this.sim.teams[this.team], b.type).includes(type) || b.queue.length >= 2) continue;
      if (d.based && padCount(this.sim, b) >= b.pads.length) continue;
      if (!best || b.queue.length < best.queue.length) best = b;
    }
    return best;
  }

  // ------------------------------------------------------------ building placement (explored ground + known structures only)
  site(type, ax, az, r0, r1, pad, builder) {
    const sim = this.sim, d = BLDGS[type], nav = sim.nav, exp = this.aiExplored, m = sim.map;
    const rects = [];
    for (const e of sim.ents) if (e.kind === 'bldg' && e.team === this.team && !e.dead) rects.push([e.cx, e.cz, e.w, e.h]);
    for (const k of this.aiMemoryMap.values()) if (k.rect) rects.push(k.rect);
    for (const k of m.docks) rects.push([k.x, k.z, 8, 6]);
    for (const k of m.derricks) rects.push([k[0], k[1], 4, 4]);
    for (const k of m.civs) rects.push([k[0], k[1], 6, 6]);
    const bc = builder ? nav.comp[builder.cls][nav.cellOf(builder.x, builder.z)] : -1;
    let best = null, bs = 1e9;
    for (let r = r0; r <= r1; r += 2) {
      const n = Math.max(8, Math.round(r * 1.2));
      for (let k = 0; k < n; k++) {
        const a = k * 6.2831853 / n + r * 0.37;
        const cx = Math.round(ax + Math.cos(a) * r - d.w / 2), cz = Math.round(az + Math.sin(a) * r - d.h / 2);
        if (cx < 6 || cz < 6 || cx + d.w > N - 6 || cz + d.h > N - 6 || this.badSites.has(type + cx + ',' + cz)) continue;
        let ok = true;
        for (let z = cz - 1; z <= cz + d.h && ok; z++) for (let x = cx - 1; x <= cx + d.w; x++) { const i = z * N + x; if (nav.stat[i] || !exp[i]) { ok = false; break; } }
        if (!ok) continue;
        for (const q of rects) if (cx - pad < q[0] + q[2] && cx + d.w + pad > q[0] && cz - pad < q[1] + q[3] && cz + d.h + pad > q[1]) { ok = false; break; }
        if (!ok) continue;
        const mid = (cz + (d.h >> 1)) * N + cx + (d.w >> 1);
        if (bc >= 0 && builder && nav.comp[builder.cls][mid] !== bc) continue;       // builder must be able to walk there
        const s = r + 0.4 * Math.hypot(cx + d.w / 2 - this.home.x, cz + d.h / 2 - this.home.z);
        if (s < bs) { bs = s; best = [cx, cz]; }
      }
      if (best && r >= r0 + 6) break;
    }
    return best;
  }
  build(b, type, anchor) {
    const tick = this.sim.tick;
    let ax = this.home.x, az = this.home.z, r0 = 13, r1 = 38, pad = 4;
    if (anchor === 'dock') { ax = this.homeDock.x; az = this.homeDock.z; r0 = 11; r1 = 24; pad = 5; }
    else if (anchor === 'front') { ax += this.front.x * 20; az += this.front.z * 20; r0 = 0; r1 = 18; pad = 3; }
    else if (anchor && anchor.id) { ax = anchor.x; az = anchor.z; r0 = 11; r1 = 24; pad = 5; }
    const s = this.site(type, ax, az, r0, r1, pad, b);
    if (!s) { this.buildHold = tick + 200; return false; }
    if (!this.act({ t: 'build', id: b.id, type, cx: s[0], cz: s[1] })) return false;
    this.lastBuild = { key: type + s[0] + ',' + s[1], tick, id: b.id }; this.buildHold = tick + 60; this.stats.builds++;
    if (anchor && anchor.id) this.stats.expands++;
    return true;
  }

  // ------------------------------------------------------------ strategy: score every candidate action, take the best affordable ones
  strategy() {
    const sim = this.sim, tick = sim.tick, T = this.T, F = this.F, R = F.roles, cfg = this.cfg, team = this.team;
    const c = this.census(), cand = [];
    // a build order that never became a construction site was refused (something unseen was in the way): try elsewhere
    if (this.lastBuild && tick - this.lastBuild.tick >= 40) {
      const b = sim.byId.get(this.lastBuild.id);
      if (b && !(b.order && b.order.t === 'construct') && !c.undone.length) this.badSites.add(this.lastBuild.key);
      this.lastBuild = null;
    }
    this.spendPoints();
    const n = (r) => (c.bl[r] || []).length, nd = (r) => (c.bl[r] || []).filter(b => b.done).length, q = (t) => c.queued[t] || 0;
    const builder = c.builders.find(b => !b.order || b.order.t !== 'construct');
    const add = (name, score, cost, run, ok = true, build = false) => { if (score > 0) cand.push({ name, score, cost, run, ok, build }); };
    const bld = (name, type, score, anchor) => {
      if (!type || score <= 0) return;
      const pre = !BLDGS[type].needs || hasBldg(sim, team, BLDGS[type].needs);
      add(name, score, BLDGS[type].cost, () => this.build(builder, type, anchor), !!builder && pre && tick >= this.buildHold && !c.undone.some(b => b.type === type), true);
    };
    const train = (name, type, score) => { const b = this.trainer(c, type); add(name, score, unitCost(T, type), () => { if (this.act({ t: 'train', id: b.id, type })) { this.stats.trained++; if (F.aiArmy[this.rot % F.aiArmy.length] === type) this.rot++; return true; } return false; }, !!b); };

    // --- housekeeping orders (cost actions, not money)
    for (const b of c.undone) if (builder && !c.builders.some(k => k.order && k.order.t === 'construct' && k.order.id === b.id)) { this.act({ t: 'construct', ids: [builder.id], target: b.id }); break; }
    for (const b of c.prod) if (!this.rallied.has(b.id) && BLDGS[b.type].role !== 'supply' && BLDGS[b.type].role !== 'cc') { if (this.act({ t: 'rally', id: b.id, x: this.rally.x, z: this.rally.z })) this.rallied.add(b.id); break; }
    for (const u of c.deployers) if (!u.deployed && !u.order && dist(u, this.rally) < 40) { this.act({ t: 'deploy', ids: [u.id] }); break; }

    // --- economy
    if (!c.builders.length && !q(R.builder)) train('builder', R.builder, 100);
    if (F.usesPower) { const margin = T.prod - T.use; bld('power', R.power, !n('power') ? 99 : margin <= 0 ? 96 : margin <= 2 && n('supply') ? 64 : 0, 'base'); }
    bld('supply', R.supply, n('supply') ? 0 : 97, 'dock');
    bld('barracks', R.barracks, n('barracks') ? 0 : 90, 'base');
    bld('factory', R.factory, n('factory') ? 0 : 84, 'base');
    const trucks = c.trucks + q(R.truck);
    if (nd('supply') && trucks < 3 + 2 * (nd('supply') - 1)) train('truck', R.truck, 88 - 6 * Math.min(trucks, 3));
    // expand to another dock once the home dock is seen to be running dry
    let home = null; for (const k of this.docks.values()) if (Math.hypot(k.x - this.homeDock.x, k.z - this.homeDock.z) < 3) home = k;
    if (home && home.frac < 0.3 && nd('supply')) {
      let alt = null, ad = 1e9;
      for (const k of this.docks.values()) {
        if (k === home || k.frac <= 0.3) continue;
        if ((c.bl.supply || []).some(b => Math.hypot(b.cx + 4 - k.x, b.cz + 3 - k.z) < 26)) { alt = null; ad = -1; break; }   // already expanded
        const dd = Math.hypot(k.x - this.home.x, k.z - this.home.z); if (dd < ad) { ad = dd; alt = k; }
      }
      if (alt) bld('expand', R.supply, 92, alt); else if (ad > 0) this.needIntel = true;                                         // no other dock known yet: go look
    }
    // --- scouting and map control
    if (!c.scout && R.scout && !q(R.scout) && tick - this.scout.asked > 600 && tick - this.scout.lost >= 600 && !c.types[R.scout]) { const b = this.trainer(c, R.scout); add('scout', 80, UNITS[R.scout].cost, () => { if (this.act({ t: 'train', id: b.id, type: R.scout })) { this.scout.asked = tick; return true; } return false; }, !!b); }
    if (tick >= cfg.derrickAfter * 20) {
      const busy = sim.byId.get(this.capId), going = busy && !busy.dead && busy.order && busy.order.t === 'capture';
      if (!going && tick >= this.capHold) {
        let dk = null, dd = 1e9; for (const k of this.derricks.values()) { if (k.owner === team) continue; const x = dist(k, this.homeW); if (x < dd) { dd = x; dk = k; } }
        const u = dk && c.army.find(k => UNITS[k.type].canCapture && !this.op.ids.includes(k.id) && !this.retreating.has(k.id));
        if (u) add('capture', this.level === 'hard' ? 79 : 58, 0, () => { if (this.act({ t: 'capture', ids: [u.id], target: dk.id })) { this.capId = u.id; this.capHold = tick + (this.level === 'hard' ? 900 : 1800); this.stats.captures++; return true; } return false; });
      }
    }
    // --- defenses and tech, weighted by what has been spotted
    const sh = cfg.counters ? this.shares() : null, defs = n('defense'), attacked = tick - this.attackedAt < 600;
    const core = n('supply') && n('barracks') && n('factory');
    let ds = 0;
    if (attacked && defs < 2 && n('barracks')) ds = 72;
    if (sh && sh.airValue >= 900 && defs < 3 && n('supply')) ds = Math.max(ds, 82);    // combat aircraft spotted: anti-air site first
    if (!ds && core && defs < 1 && c.strength >= 2500) ds = 36;
    if (!ds && core && defs < 4 && T.money > 5000) ds = 30;
    bld('defense', R.defense, ds, 'front');
    let bestType = null, bestS = 0; const scores = {};
    for (const type of this.combat) { const s = this.unitScore(type, sh, c); scores[type] = s; if (s > bestS && !(UNITS[type].promo && !T.promos.has(UNITS[type].promo))) { bestS = s; bestType = type; } }
    const wantsAir = bestType && R.airfield && BLDGS[R.airfield].trains.includes(bestType);
    if (R.airfield && !n('airfield') && nd('factory')) bld('airfield', R.airfield, wantsAir ? 66 : c.strength >= 3000 ? 44 : 0, 'base');
    if (R.income && n('income') < 1 && nd('factory') && c.strength >= 3000) bld('income', R.income, 46, 'base');
    if (R.super && cfg.superweapon && !sim.noSuper && n('super') < 1 && nd('factory') && c.strength >= 3500) bld('super', R.super, 45, 'base');
    if (R.tunnel && cfg.retreat && n('tunnel') < 1 && nd('barracks') && c.strength >= 1500) bld('tunnel', R.tunnel, 42, 'front');
    for (const b of c.prod) for (const id of upgradesOf(T, b.type)) if (!T.upgrades.has(id) && !q('up:' + id) && b.queue.length < 2 && c.strength >= 3000) add('upgrade ' + id, 32, UPGRADES[id].cost + 1500, () => this.act({ t: 'train', id: b.id, type: 'up:' + id }));
    for (const type of this.roster) if (UNITS[type].deploy && c.deployers.length + q(type) < 2 && c.strength >= 2000) train(type, type, 31);
    // --- army: counter what has been seen
    let queuedArmy = 0; for (const type of this.combat) queuedArmy += q(type);
    if (c.army.length + queuedArmy < cfg.armyCap) {
      const noInf = !c.army.some(u => UNITS[u.type].canCapture) && !q(R.squad);
      for (const type of this.combat) train(type, type, scores[type] + (noInf && type === R.squad ? 14 : 0));
    }

    cand.sort((a, b) => b.score - a.score || (a.name < b.name ? -1 : 1));
    this.lastScores = cand.map(k => ({ name: k.name, score: +k.score.toFixed(1), ok: k.ok }));
    let money = T.money, reserve = 0, ran = 0;
    for (const k of cand) {
      if (ran >= 3 || this.budget < 1) break;
      if (!k.ok) { if (k.build && k.score >= 80) reserve += k.cost; continue; }    // a core building is waiting on a prerequisite: keep the money for it
      if (money - (k.score >= 80 ? 0 : reserve) < k.cost) { if (k.score >= 70) break; continue; }   // save up for something important
      if (k.run()) { money -= k.cost; ran++; }
    }
    this.scouting(c);
    this.operations(c);
  }
  spendPoints() {
    const T = this.T; if (T.points < 1) return;
    const open = this.F.tree.filter(k => !T.promos.has(k.id) && T.rank >= k.tier && (!k.req || T.promos.has(k.req)));
    const pick = (this.level !== 'easy' && open.find(k => k.power)) || open[0];
    if (pick) this.act({ t: 'promote', node: pick.id });
  }

  // ------------------------------------------------------------ scouting loop
  scouting(c) {
    const S = this.scout, tick = this.sim.tick; let sc = c.scout;
    if (!sc && tick > 2400 && tick - S.asked > 1200) {                             // no scout unit available: a squad goes on foot
      sc = c.army.find(u => u.type === this.F.roles.squad && !this.op.ids.includes(u.id));
      if (sc) { S.id = sc.id; this.stats.scouts++; }
    }
    if (!sc) { S.route = null; return; }
    if (!S.route) {
      const stale = tick - Math.max(this.lastFoeSeen, S.lastSweep) > SCOUT_STALE;
      if (S.sweeps && !stale && !this.needIntel) return;
      const left = this.pois.slice(), route = []; let p = sc;                      // nearest-neighbour tour of the points of interest
      while (left.length) { let bi = 0; for (let i = 1; i < left.length; i++) if (dist(left[i], p) < dist(left[bi], p)) bi = i; p = left.splice(bi, 1)[0]; route.push(p); }
      if (!this.act({ t: 'move', ids: [sc.id], x: route[0].x, z: route[0].z })) return;
      S.route = route; S.i = 0; S.leg = tick; S.sweeps++; this.stats.sweeps++; this.needIntel = false;
      return;
    }
    if (dist(sc, S.route[S.i]) < 18 || tick - S.leg > 700 || (!sc.order && tick - S.leg > 80)) {
      const nx = S.i + 1 < S.route.length ? S.route[S.i + 1] : this.rally;
      if (!this.act({ t: 'move', ids: [sc.id], x: nx.x, z: nx.z })) return;
      S.i++; S.leg = tick;
      if (S.i >= S.route.length) { S.route = null; S.lastSweep = tick; }
    }
  }

  // ------------------------------------------------------------ army operations: defend, gather, attack, flank
  pickTarget() {
    const tick = this.sim.tick, k = this.sim.koth; let best = null, bs = 1e9;
    if (k && k.owner !== this.team) return { id: -1, x: k.x, z: k.z, hill: true };   // King of the Hill: the hill's position is a public match rule
    for (const m of this.aiMemoryMap.values()) if (m.kind === 'bldg') { const s = dist(m, this.rally) - (m.weapon ? 0 : 20) - (BLDGS[m.type] && BLDGS[m.type].superPower ? 150 : 0); if (s < bs) { bs = s; best = m; } }
    if (!best) for (const m of this.aiMemoryMap.values()) if (tick - m.tick < 900 && (!best || m.tick > best.tick)) best = m;
    return best && { id: best.id, x: best.x, z: best.z };
  }
  flankPoints(tg) {
    const nav = this.sim.nav; let dx = tg.x - this.rally.x, dz = tg.z - this.rally.z; const l = Math.hypot(dx, dz); if (l < 120) return null;
    dx /= l; dz /= l; const comp = nav.comp[1][nav.cellOf(this.rally.x, this.rally.z)], out = [];
    for (const s of [1, -1]) {
      const x = Math.min(WORLD - 20, Math.max(20, tg.x - dx * 55 - dz * 75 * s)), z = Math.min(WORLD - 20, Math.max(20, tg.z - dz * 55 + dx * 75 * s));
      const c = nav.nearest(Math.floor(x / CELL), Math.floor(z / CELL), 1, comp, 28); if (c < 0) return null;
      out.push({ x: ((c % N) + 0.5) * CELL, z: (((c / N) | 0) + 0.5) * CELL });
    }
    return dist(out[0], out[1]) >= 60 ? out : null;
  }
  operations(c) {
    const sim = this.sim, tick = sim.tick, cfg = this.cfg, op = this.op, cost = (us) => us.reduce((s, u) => s + UNITS[u.type].cost, 0);
    const pool = c.army.filter(u => !this.retreating.has(u.id));
    const homeGroup = pool.filter(u => !op.ids.includes(u.id) && !(UNITS[u.type].based && u.ammo < UNITS[u.type].ammo));
    // defend: intruders the AI can see near its base (after its reaction delay)
    const threat = this.visible.find(m => m.kind === 'unit' && tick - m.tick <= 40 && tick - m.first >= cfg.react && dist(m, this.homeW) < 120);
    if (threat && tick - this.lastDefend >= 100) {
      const ids = homeGroup.filter(u => !u.order && !u.target).map(u => u.id);
      if (ids.length && this.act({ t: 'move', ids, x: threat.x, z: threat.z, attack: true })) { this.lastDefend = tick; this.stats.defended++; }
    }
    if (op.mode === 'gather') {
      if (threat) return;
      if (op.wave === 0 && tick < Math.max(cfg.firstAttack, this.sim.treatyUntil)) return; // treaty length is a public match rule, not scouted information
      const need = Math.min(9000, cfg.attackAt + 900 * op.wave), str = cost(homeGroup);
      if (homeGroup.length < 4 || str < need) return;
      const tg = this.pickTarget();
      if (!tg) {                                                                      // nothing known to attack: scout, and after a while sweep the map in force
        this.needIntel = true;
        if (tick - this.lastFoeSeen > 900 && tick - op.lastPush >= 500) { const p = this.hunt[op.hunt++ % this.hunt.length]; if (this.act({ t: 'move', ids: homeGroup.map(u => u.id), x: p.x, z: p.z, attack: true })) op.lastPush = tick; }
        return;
      }
      const ids = homeGroup.map(u => u.id);
      const wps = cfg.flank && ids.length >= 6 ? this.flankPoints(tg) : null;
      if (wps) {
        const A = [], B = []; homeGroup.forEach((u, i) => (u.air || i % 2 === 0 ? A : B).push(u.id));
        if (this.budget < 2 || !B.length) return;
        this.act({ t: 'move', ids: A, x: wps[0].x, z: wps[0].z, attack: true }); this.act({ t: 'move', ids: B, x: wps[1].x, z: wps[1].z, attack: true });
        op.mode = 'flank'; op.groups = [A, B]; op.wps = wps; this.stats.flanks++;
      } else { if (!this.act({ t: 'move', ids, x: tg.x, z: tg.z, attack: true })) return; op.mode = 'attack'; }
      op.ids = ids; op.target = tg; op.since = op.lastPush = tick; op.strength0 = str; op.wave++; this.stats.attacks++;
      return;
    }
    const alive = op.ids.map(id => sim.byId.get(id)).filter(u => u && !u.dead && u.team === this.team && !u.inB && !this.retreating.has(u.id));
    op.ids = alive.map(u => u.id);
    const fallBack = () => { if (alive.length) this.act({ t: 'move', ids: op.ids, x: this.rally.x, z: this.rally.z }); op.mode = 'gather'; op.ids = []; };
    if (!alive.length || (cfg.retreat && cost(alive) < 0.3 * op.strength0)) { fallBack(); return; }
    if (op.target.hill ? !this.sim.koth || (this.sim.koth.owner === this.team && tick - op.lastPush > 600 && !!this.pickTarget()) : !this.aiMemoryMap.has(op.target.id)) { // target confirmed gone (or the hill is ours and a base is known): next known target, or go home and scout
      const tg = this.pickTarget();
      if (!tg) { fallBack(); this.needIntel = true; return; }
      op.target = tg; op.mode = 'attack'; op.lastPush = -1e9;
    }
    if (op.mode === 'flank') {
      const at = (g, wp) => { let k = 0, n = 0; for (const id of g) { const u = sim.byId.get(id); if (!u || u.dead) continue; n++; if (u.air || dist(u, wp) < 38) k++; } return !n || k / n >= 0.6; };
      if ((at(op.groups[0], op.wps[0]) && at(op.groups[1], op.wps[1])) || tick - op.since > 900) { if (this.act({ t: 'move', ids: op.ids, x: op.target.x, z: op.target.z, attack: true })) { op.mode = 'attack'; op.lastPush = tick; } }
      return;
    }
    if (tick - op.lastPush >= 240) {                                                  // units that finished their order press on
      const idle = alive.filter(u => !u.order && !u.target).map(u => u.id);
      if (!idle.length || this.act({ t: 'move', ids: idle, x: op.target.x, z: op.target.z, attack: true })) op.lastPush = tick;
    }
    const fresh = homeGroup.filter(u => !u.order && !u.target);                       // reinforcements follow in groups
    if (fresh.length >= 3 && cost(fresh) >= 1500 && this.act({ t: 'move', ids: fresh.map(u => u.id), x: op.target.x, z: op.target.z, attack: true })) for (const u of fresh) op.ids.push(u.id);
  }

  // ------------------------------------------------------------ tactics: retreat, focus fire, support powers
  tactics() {
    const sim = this.sim, tick = sim.tick, cfg = this.cfg, team = this.team;
    for (const id of this.retreating.keys()) { const u = sim.byId.get(id); if (!u || u.dead || u.hp >= u.maxHp * 0.75) { this.retreating.delete(id); this.reversing.delete(id); } }
    for (const [id, r] of this.reversing) if (tick - r.tick >= 70) { if (this.act({ t: 'move', ids: [id], x: r.x, z: r.z })) this.reversing.delete(id); } // backed off: now turn and drive to the repair point
    const mine = [];
    if (cfg.retreat || cfg.focus) for (const e of sim.ents) {
      if (e.team !== team || e.kind !== 'unit' || e.dead || e.inB) continue;
      const d = UNITS[e.type]; if (d.weapon && !d.harvester && !d.builder) mine.push(e);
    }
    if (cfg.retreat) {
      const hurt = mine.filter(e => e.cls === 1 && !e.air && e.hp < e.maxHp * 0.35 && tick - e.lastHit < 100 && !this.retreating.has(e.id));
      if (hurt.length) {
        let best = null, bd = 1e9;                                                    // nearest repair bay or tunnel, else the rally point
        for (const b of sim.ents) if (b.kind === 'bldg' && b.team === team && b.done && !b.dead && BLDGS[b.type].repair) { const d = dist(b, hurt[0]); if (d < bd) { bd = d; best = b; } }
        const p = best ? { x: best.x, z: best.z + (best.h / 2 + 3) * CELL } : this.rally;
        // Reverse-move micro: a vehicle with directional armor that is still under the guns of an enemy in view
        // backs straight away from it for a few seconds (front armor stays on the threat), and only then turns for home.
        let rest = hurt;
        if (cfg.reverse) {
          this.perceive(); rest = [];
          for (const e of hurt) {
            let near = null, nd = 46;
            if (UNITS[e.type].dirArmor) for (const m of this.visible) { if (m.tick !== tick || !m.weapon) continue; const d = dist(m, e); if (d < nd) { nd = d; near = m; } }
            if (near && nd > 1 && this.act({ t: 'move', ids: [e.id], x: Math.min(WORLD - 6, Math.max(6, e.x + (e.x - near.x) / nd * 24)), z: Math.min(WORLD - 6, Math.max(6, e.z + (e.z - near.z) / nd * 24)), reverse: true })) {
              this.retreating.set(e.id, tick); this.reversing.set(e.id, { tick, x: p.x, z: p.z }); this.stats.retreats++; this.stats.reverses++;
            } else rest.push(e);
          }
        }
        if (rest.length && this.act({ t: 'move', ids: rest.map(e => e.id), x: p.x, z: p.z })) { for (const e of rest) this.retreating.set(e.id, tick); this.stats.retreats += rest.length; }
      }
    }
    if (cfg.focus) this.focusFire(mine.filter(e => !this.retreating.has(e.id)));
    this.usePowers();
  }
  focusFire(mine) {
    const tick = this.sim.tick, cfg = this.cfg, op = this.op;
    if (this.focus) {
      const m = this.aiMemoryMap.get(this.focus.id);
      if (!m || tick - m.tick > 20) {                                                 // focus target dead or out of sight: resume the advance
        const ids = this.focus.ids.filter(id => { const u = this.sim.byId.get(id); return u && !u.dead && !u.order; });
        if (ids.length && op.mode !== 'gather' && op.target) this.act({ t: 'move', ids, x: op.target.x, z: op.target.z, attack: true });
        this.focus = null;
      }
    }
    const engaged = mine.filter(u => u.target);
    if (engaged.length < 2) return;
    this.perceive();                                                                  // order attacks only on what is in view this tick
    let best = null, bp = 0.5, bn = null;
    for (const m of this.visible) {
      if (m.tick !== tick || tick - m.first < cfg.react || (m.kind !== 'unit' && !m.weapon)) continue;
      const t = m.kind === 'unit' ? TAG[m.type] : null;
      const p = (1 - m.hp) * 1.2 + (t ? (t.arty ? 1 : 0) + (t.hero || m.vet >= 3 ? 0.8 : 0) + (t.builder ? 0.9 : 0) + (t.harvester ? 0.3 : 0) : 0.2);
      if (p <= bp) continue;
      const near = engaged.filter(u => dist(u, m) <= REACH[u.type] + 6 && (m.armor === 'bldg' ? 0.2 : EFFECT[u.type][m.armor]) > 0);
      if (near.length >= 2) { best = m; bp = p; bn = near; }
    }
    if (!best || (this.focus && this.focus.id === best.id)) return;
    const ids = bn.filter(u => !(u.order && u.order.t === 'attack' && u.order.id === best.id)).map(u => u.id);
    if (ids.length >= 2 && this.act({ t: 'attack', ids, target: best.id })) { this.focus = { id: best.id, ids, tick }; this.stats.focus++; }
  }
  // Support powers are aimed only at enemies in view at this very tick, on a cell the vision grid marks visible.
  usePowers() {
    const sim = this.sim, tick = sim.tick, T = this.T, cfg = this.cfg, ready = [], soon = [];
    for (const n of this.F.tree) if (n.power && T.promos.has(n.id)) { const pw = nodePower(T, n), left = (T.powerReady[pw] || 0) - tick; if (left <= 0) ready.push(pw); else if (left < 300) soon.push(pw); }
    const sp = superOf(sim, this.team), superReady = sp && hasPower(sim, this.team, sp) && (T.powerReady[sp] || 0) <= tick;
    if (!ready.length && !superReady) return;
    this.perceive();
    const now = this.visible.filter(m => m.tick === tick && tick - m.first >= cfg.react);
    if (!now.length) return;
    const value = (m) => (m.kind === 'bldg' || m.cost >= 900 ? 1.5 : 1);
    const pick = (id) => { const R = POWERS[id].radius, aim = POWERS[id].aim; let best = null, bs = 0; for (const m of now) { if (aim === 'supply' && !(m.kind === 'bldg' && BLDGS[m.type].role === 'supply')) continue; if (aim === 'supply') { best = m; bs = 99; break; } let s = 0; for (const o of now) if (dist(o, m) <= R) s += value(o); if (s > bs) { bs = s; best = m; } } return { m: best, s: bs }; };
    const cast = (id, a) => {
      if (this.aiVisionGrid[cellOf(a.m.x, a.m.z)] !== 1 || powerError(sim, this.team, id, a.m.x, a.m.z)) return false;
      if (!this.act({ t: 'power', id, x: a.m.x, z: a.m.z })) return false;
      this.stats.casts.push({ tick, id, x: a.m.x, z: a.m.z, score: a.s, target: a.m.id, seenFor: tick - a.m.first }); return true;
    };
    if (superReady) { const a = pick(sp); if (a.s >= 5 && cast(sp, a)) { this.stats.supers = (this.stats.supers || 0) + 1; return; } } // superweapon: only at a real concentration, and only at what is in view
    if (cfg.combo && ready.length + soon.length >= 2) {                               // hold one power until its partner is ready, then stack them
      if (ready.length < 2 || this.budget < 2) return;
      const a = pick(ready[0]);
      if (a.s >= 4 && cast(ready[0], a) && cast(ready[1], a)) this.stats.combos++;
      return;
    }
    for (const id of ready) { const a = pick(id); if (a.s >= cfg.castAt && cast(id, a)) break; }
  }
}
