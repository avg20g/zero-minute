// General's off-map support powers. A power becomes a "strike": a sim object
// (aircraft, falling shell, pending spawn) that is stepped at 20 Hz like
// everything else, so powers are deterministic and obey the same Fog of War
// as units. Rules enforced here:
//   1. A power can only be aimed at territory its owner has explored.
//   2. A strike grants no vision.
//   3. Whether the other side sees a strike is decided by strikeVisible().
import { N, CELL, WORLD } from './defs.js';
import { FACTIONS, POWERS, UNITS, BLDGS, WEAPONS, generalOf, nodePower } from './factionRegistry.js';
import { strikeDamage, kill, makeUnit, makeBldg, freeSpot, canPlace, spawnNear } from './entities.js';
import { addHazard } from './abilities.js';
import { stepAirliner } from './heroes.js';

export function hasPower(sim, team, id) {
  const T = sim.teams[team], P = POWERS[id];
  if (P && P.super) { // superweapon: owned through its building, not through a promotion
    if (sim.noSuper) return false;
    for (const e of sim.ents) if (e.kind === 'bldg' && e.team === team && e.type === P.super && e.done && !e.dead) return true;
    return false;
  }
  return FACTIONS[T.faction].tree.some(n => n.power && nodePower(T, n) === id && T.promos.has(n.id));   // a general may swap a power (A-10 -> B-2)
}
// Superweapons can be built in any number. Every building runs its own countdown (b.superReady); the team's
// powerReady entry is kept equal to the earliest of them, so the HUD and the AI read it like any other power.
export function superBldgs(sim, team, id) {
  const out = [], type = POWERS[id].super;
  for (const e of sim.ents) if (e.kind === 'bldg' && e.team === team && e.type === type && e.done && !e.dead) out.push(e);
  return out;
}
export function superCd(sim, team, id) { const G = generalOf(sim.teams[team]); return Math.round(POWERS[id].cd * 20 * (G && G.superCd || 1)); }   // ticks; a general may shorten it
export function syncSuper(sim, team, id) {
  let best = null;
  for (const b of superBldgs(sim, team, id)) if (!best || b.superReady < best.superReady) best = b;
  if (best) sim.teams[team].powerReady[id] = best.superReady;
  return best;
}
// The superweapon power a team's faction can build, and whether it is standing right now.
export function superOf(sim, team) { const b = FACTIONS[sim.teams[team].faction].roles.super; return b ? BLDGS[b].superPower : null; }
// Where a Sneak Attack tunnel exit would go: the target cell, or the nearest clear site within 5 cells.
export function sneakSite(sim, team, x, z) {
  const d = BLDGS.s_tunnel, cx0 = Math.floor(x / CELL - d.w / 2), cz0 = Math.floor(z / CELL - d.h / 2);
  for (let r = 0; r <= 5; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
    if (canPlace(sim, 's_tunnel', cx0 + dx, cz0 + dz, team)) return [cx0 + dx, cz0 + dz];
  }
  return null;
}
// The enemy supply building a Cash Hack aimed at (x, z) would hit. Only buildings the caster has
// seen (in view now, or remembered through the fog) count, so the power cannot be used to probe.
export function hackTarget(sim, team, x, z) {
  let best = null, bd = POWERS.cashhack.radius;
  for (const e of sim.ents) {
    if (e.kind !== 'bldg' || e.dead || e.team === team || e.team > 1 || BLDGS[e.type].role !== 'supply' || !sim.fog.shouldShow(team, e)) continue;
    const d = Math.hypot(e.x - x, e.z - z); if (d < bd) { bd = d; best = e; }
  }
  return best;
}
export function powerError(sim, team, id, x, z) {
  if (sim.tick < sim.treatyUntil) return 'Peace treaty in force';
  const T = sim.teams[team];
  if (!POWERS[id] || !hasPower(sim, team, id)) return 'Power not unlocked';
  if (POWERS[id].super) syncSuper(sim, team, id);
  if ((T.powerReady[id] || 0) > sim.tick) return POWERS[id].name + ' is recharging';
  if (!(x >= 4 && z >= 4 && x <= WORLD - 4 && z <= WORLD - 4)) return 'Target is off the map';
  if (!sim.fog.exp[team][Math.floor(z / CELL) * N + Math.floor(x / CELL)]) return 'Target must be in explored territory';
  if (id === 'cashhack' && !hackTarget(sim, team, x, z)) return 'Aim at an enemy supply building you have scouted';
  if (id === 'sneaktunnel' && !sneakSite(sim, team, x, z)) return 'No clear ground for a tunnel exit there';
  return null;
}
// Should `viewer` be shown this strike object right now?
export function strikeVisible(sim, viewer, s) { return s.team === viewer || sim.fog.visAt(viewer, s.x, s.z); }

// Should `viewer` be shown an effect (impact, explosion, cloud) at event e's position?
export function fxVisible(sim, viewer, e) { return e.team === viewer || sim.fog.visAt(viewer, e.x, e.z); }

function approach(sim, team, x, z) { // unit vector from the owner's base toward the target
  let bx = team === 0 ? 70 : WORLD - 70, bz = team === 0 ? WORLD - 110 : 110;
  for (const e of sim.ents) if (e.kind === 'bldg' && e.team === team && BLDGS[e.type].role === 'cc') { bx = e.x; bz = e.z; break; }
  let dx = x - bx, dz = z - bz; const l = Math.hypot(dx, dz);
  if (l < 20) { dx = team === 0 ? 1 : -1; dz = team === 0 ? -1 : 1; }
  const m = Math.hypot(dx, dz); return [dx / m, dz / m];
}
// Off-map aircraft (bombers and transports) fly level over the aim point.
export function planeAlt(p) { return 34; }

function plane(sim, team, model, payload, x, z, lateral = 0, delay = 0) {
  const [dx, dz] = approach(sim, team, x, z), tx = x - dz * lateral, tz = z + dx * lateral, lead = 250 + delay * 4.4;
  const p = { id: sim.nextId++, kind: 'plane', model, payload, team, tx, tz, dx, dz, a: Math.atan2(dz, dx), s: -lead, next: -24, dropped: false,
    x: tx - dx * lead, z: tz - dz * lead, px: 0, pz: 0, y: 0, py: 0, rk: 0, dead: false };
  p.px = p.x; p.pz = p.z; p.y = p.py = planeAlt(p); sim.strikes.push(p);
}

export const SCUD_GAP = 5;                        // ticks between one Scud Storm rail firing and the next
export const REVEAL_PAD = 10, REVEAL_SECS = 16;   // metres past the power's own radius, and how long the area stays lit
export function usePower(sim, team, id, x, z) {
  const err = powerError(sim, team, id, x, z);
  if (err) { sim.events.push({ t: 'msg', team, text: err }); return false; }
  const T = sim.teams[team], P = POWERS[id];
  const G = generalOf(T), hk = id === 'cashhack' && G && G.hack ? G.hack : null;
  let from = null;   // the superweapon building that fires: the one that has been ready longest
  if (P.super) { from = syncSuper(sim, team, id); from.superCd = superCd(sim, team, id); from.superReady = sim.tick + from.superCd; from.superShot = sim.tick; syncSuper(sim, team, id); }
  else T.powerReady[id] = sim.tick + (hk ? hk.cd : P.cd) * 20;
  T.powersUsed++;
  sim.events.push({ t: 'power', id, team, x, z });
  // Using a power lights up its target area for that team: you see what you hit (and what you missed).
  sim.reveals.push({ team, x, z, r: Math.max(P.radius, (P.line || 0) / 2, P.beam ? P.beam.sweep : 0) + REVEAL_PAD, until: sim.tick + (P.reveal || REVEAL_SECS) * 20 });
  if (P.super) sim.events.push({ t: 'superlaunch', id, team, bid: from.id, bx: from.x, bz: from.z });   // public warning: both sides hear the klaxon, nobody is told where it will land
  const n0 = sim.strikes.length;
  switch (P.as || id) {   // a newer faction's power may reuse the strike of an older one (`as`), with its own numbers
    case 'paradrop': plane(sim, team, 'c130', 'paradrop', x, z); break;
    case 'b2': plane(sim, team, P.plane || 'b2', 'carpet', x, z); break;
    case 'cashhack': {
      const b = hackTarget(sim, team, x, z), E = sim.teams[b.team], amt = Math.min(hk ? hk.amount : P.amount, Math.max(0, Math.floor(E.money)));
      E.money -= amt; T.money += amt; T.hacked = (T.hacked || 0) + amt;
      sim.events.push({ t: 'cashhack', x: b.x, z: b.z, team, victim: b.team, amt });
      break;
    }
    case 'sneaktunnel': sim.strikes.push({ id: sim.nextId++, kind: 'sneak', team, x, z, px: x, pz: z, t: P.delay * 20, dead: false }); break;
    case 'nuke': sim.strikes.push({ id: sim.nextId++, kind: 'nuke', team, x, z, px: x, pz: z, sx: from.x, sz: from.z, t: P.flight, T: P.flight, dead: false }); break;   // sx, sz: the silo it rises from
    case 'scud':
      for (let i = 0; i < P.n; i++) {
        const a = sim.rand() * 6.2831853, r = i ? Math.sqrt(sim.rand()) * (P.radius - 6) : 0;
        sim.strikes.push({ id: sim.nextId++, kind: 'scud', team, x: x + Math.cos(a) * r, z: z + Math.sin(a) * r, px: 0, pz: 0, t: 70 + i * 9, T: 70 + i * 9, dead: false,
          sx: from.x + (i % 3 - 1) * 2.6, sz: from.z + (((i / 3) | 0) - 1) * 2.6, i, lift: i * SCUD_GAP });   // rail i of the launcher, and the tick after firing at which it leaves
      }
      break;
    case 'particle': { const [dx, dz] = approach(sim, team, x, z); sim.strikes.push({ id: sim.nextId++, kind: 'pbeam', team, x, z, px: x, pz: z, sx: x, sz: z, dx, dz, n: 0, bx: from.x, bz: from.z, dead: false }); break; }
    case 'tomahawk': sim.strikes.push({ id: sim.nextId++, kind: 'cruise', team, x, z, px: x, pz: z, t: P.flight, T: P.flight, dead: false }); break;   // one cruise missile: it arrives after its flight time
    case 'fab': plane(sim, team, P.plane || 'h6', 'fab', x, z); break;   // China's Fuel-Air Bomb comes from an H-6 bomber
    case 'toxinbomb': plane(sim, team, 'bomber', 'toxin', x, z); break;
    case 'barrage': {
      const n = T.flags.barrage2 ? 20 : 12;
      for (let i = 0; i < n; i++) {
        const a = sim.rand() * 6.2831853, r = Math.sqrt(sim.rand()) * P.radius;
        sim.strikes.push({ id: sim.nextId++, kind: 'shell', team, x: x + Math.cos(a) * r, z: z + Math.sin(a) * r, px: 0, pz: 0, t: 36 + i * 5 + Math.floor(sim.rand() * 4), dead: false });
      }
      break;
    }
    case 'ambush': sim.strikes.push({ id: sim.nextId++, kind: 'ambush', team, x, z, px: x, pz: z, t: 16, n: T.flags.ambush2 ? 10 : 6, dead: false }); break;
  }
  for (let i = n0; i < sim.strikes.length; i++) sim.strikes[i].pid = id;   // which power this strike belongs to: its numbers are read from there
  return true;
}

function detonate(sim, p, x, z) {
  const src = { team: p.team };
  if (p.payload === 'fab') {
    strikeDamage(sim, x, z, (POWERS[p.pid] || POWERS.fab).radius, 420, 'fab', src);
    addHazard(sim, 'thermal', x, z, 15, 7, 40, p.team, true);
    sim.events.push({ t: 'fab', x, z, r: POWERS.fab.radius, team: p.team });
  } else if (p.payload === 'toxin') {
    addHazard(sim, 'toxin', x, z, POWERS.toxinbomb.radius, 20, 22, p.team, true);
    sim.events.push({ t: 'toxin', x, z, r: POWERS.toxinbomb.radius, team: p.team });
  }
}

export function stepPowers(sim) {
  if (!sim.strikes.length) return;
  for (const p of sim.strikes) {
    p.px = p.x; p.pz = p.z;
    if (p.kind === 'plane') {
      p.s += 4.4; p.x = p.tx + p.dx * p.s; p.z = p.tz + p.dz * p.s; p.py = p.y; p.y = planeAlt(p);
      if (!p.dropped && p.s >= -30) { // bomb release: lands on the aim point 0.6 s later
        p.dropped = true;
        sim.strikes.push({ id: sim.nextId++, kind: p.payload === 'paradrop' ? 'para' : p.payload === 'carpet' ? 'carpet' : 'bomb', pid: p.pid, dx: p.dx, dz: p.dz, payload: p.payload, team: p.team, x: p.tx, z: p.tz, px: p.tx, pz: p.tz, t: p.payload === 'paradrop' ? 60 : 12, dead: false });
      }
      if (p.s > 260) p.dead = true;
    } else if (p.kind === 'airliner') { stepAirliner(sim, p);
    } else if (p.kind === 'pbeam') { // the beam walks along its line, burning whatever it crosses
      const B = (POWERS[p.pid] || POWERS.particle).beam, u = p.n / B.ticks;
      p.x = Math.min(WORLD - 3, Math.max(3, p.sx + p.dx * B.sweep * (u - 0.5))); p.z = Math.min(WORLD - 3, Math.max(3, p.sz + p.dz * B.sweep * (u - 0.5)));
      if (p.n % B.every === 0) { strikeDamage(sim, p.x, p.z, B.r, B.dmg, 'particle', { team: p.team }); sim.events.push({ t: 'pbeam', x: p.x, z: p.z, team: p.team, k: p.n, bx: p.bx, bz: p.bz }); }
      if (++p.n >= B.ticks) p.dead = true;
    } else if (--p.t <= 0) {
      p.dead = true;
      if (p.kind === 'cruise') { const P = POWERS[p.pid] || POWERS.tomahawk; strikeDamage(sim, p.x, p.z, P.radius, P.dmg, 'cruise', { team: p.team }); sim.events.push({ t: 'scudhit', x: p.x, z: p.z, r: P.radius, team: p.team, fire: true, big: true }); }
      else if (p.kind === 'nuke') {
        const P = POWERS.nuke;
        strikeDamage(sim, p.x, p.z, P.radius, P.dmg, 'nuke', { team: p.team });
        addHazard(sim, 'thermal', p.x, p.z, P.fallout.r, P.fallout.secs, P.fallout.dps, p.team, true);
        sim.events.push({ t: 'nuke', x: p.x, z: p.z, r: P.radius, team: p.team });
      } else if (p.kind === 'scud') {
        const P = POWERS[p.pid] || POWERS.scud, H = P.toxin || P.fire;   // Scud Storm leaves toxin; the Iskander strike leaves fire
        strikeDamage(sim, p.x, p.z, P.r, P.dmg, 'scud', { team: p.team });
        addHazard(sim, P.toxin ? 'toxin' : 'fire', p.x, p.z, H.r, H.secs, H.dps, p.team, true);
        sim.events.push({ t: 'scudhit', x: p.x, z: p.z, r: H.r, team: p.team, fire: !P.toxin });
      } else if (p.kind === 'para') {
        const P = POWERS[p.pid] || POWERS.paradrop; let made = 0;
        for (let i = 0; i < P.n; i++) { const a = i * 2.399963, u = spawnNear(sim, P.unit, p.team, p.x + Math.cos(a) * (2 + i * 1.2), p.z + Math.sin(a) * (2 + i * 1.2), a); if (u) made++; }
        sim.events.push({ t: 'paradrop', x: p.x, z: p.z, team: p.team, n: made });
      } else if (p.kind === 'sneak') {
        const s = sneakSite(sim, p.team, p.x, p.z);                    // the ground may have been built on during the delay
        if (s) { const b = makeBldg(sim, 's_tunnel', p.team, s[0], s[1], true); sim.nav.dirty = true; sim.events.push({ t: 'sneak', x: b.x, z: b.z, team: p.team, id: b.id }); }
        else sim.events.push({ t: 'msg', team: p.team, text: 'Sneak Attack failed: the ground was blocked' });
      }
      else if (p.kind === 'shell') { strikeDamage(sim, p.x, p.z, 7, 95, 'artillery', { team: p.team }); sim.events.push({ t: 'shellhit', x: p.x, z: p.z, team: p.team }); }
      else if (p.kind === 'bomb') detonate(sim, p, p.x, p.z);
      else if (p.kind === 'carpet') { // the stick of bombs walks along the bomber's track
        const B = POWERS[p.pid] && POWERS[p.pid].n ? POWERS[p.pid] : WEAPONS.b2_bombs; for (let i = 0; i < B.n; i++) { const a = (i / (B.n - 1) - 0.5) * B.line, lat = (i % 2 ? 3 : -3); sim.strikes.push({ id: sim.nextId++, kind: 'bomblet', pid: p.pid, team: p.team, x: p.x + p.dx * a - p.dz * lat, z: p.z + p.dz * a + p.dx * lat, px: 0, pz: 0, t: 2 + i * 3, dead: false }); }
      }
      else if (p.kind === 'bomblet') { const B = POWERS[p.pid] && POWERS[p.pid].n ? POWERS[p.pid] : WEAPONS.b2_bombs; strikeDamage(sim, p.x, p.z, B.r, B.dmg, 'artillery', { team: p.team }); sim.events.push({ t: 'shellhit', x: p.x, z: p.z, team: p.team }); }
      else if (p.kind === 'ambush') {
        const roster = FACTIONS[sim.teams[p.team].faction].ambush || ['s_rpg', 's_rpg', 's_guerrilla'];
        let made = 0;
        for (let i = 0; i < p.n; i++) {
          const type = roster[i % roster.length], d = UNITS[type], a = i * 2.399963;
          const s = freeSpot(sim, p.x + Math.cos(a) * (2 + i * 0.7), p.z + Math.sin(a) * (2 + i * 0.7), d.cls, d.radius, 12);
          if (!s) continue;
          const u = makeUnit(sim, type, p.team, s[0], s[1], a);
          u.stealthMode = 'still'; u.stillT = 30; u.cloaked = true; made++; // arrive already hidden
        }
        sim.events.push({ t: 'ambush', x: p.x, z: p.z, team: p.team, n: made });
      }
    }
  }
  sim.strikes = sim.strikes.filter(p => !p.dead);
}
