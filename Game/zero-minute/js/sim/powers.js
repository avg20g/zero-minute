// General's off-map support powers. A power becomes a "strike": a sim object
// (aircraft, falling shell, pending spawn) that is stepped at 20 Hz like
// everything else, so powers are deterministic and obey the same Fog of War
// as units. Rules enforced here:
//   1. A power can only be aimed at territory its owner has explored.
//   2. A strike grants no vision.
//   3. Whether the other side sees a strike is decided by strikeVisible().
import { N, CELL, WORLD } from './defs.js';
import { FACTIONS, POWERS, UNITS, BLDGS, generalOf, nodePower } from './factionRegistry.js';
import { splashDamage, kill, makeUnit, makeBldg, freeSpot, canPlace, spawnNear } from './entities.js';
import { addHazard } from './abilities.js';

export function hasPower(sim, team, id) {
  const T = sim.teams[team], P = POWERS[id];
  if (P && P.super) { // superweapon: owned through its building, not through a promotion
    if (sim.noSuper) return false;
    for (const e of sim.ents) if (e.kind === 'bldg' && e.team === team && e.type === P.super && e.done && !e.dead) return true;
    return false;
  }
  return FACTIONS[T.faction].tree.some(n => n.power && nodePower(T, n) === id && T.promos.has(n.id));   // a general may swap a power (A-10 -> B-2)
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
// Attack profile: aircraft dive toward the aim point, bottom out just short of it, then climb away.
export function planeAlt(p) { return p.payload === 'strafe' ? 15 + Math.min(46, Math.abs(p.s + 18) * 0.21) : 34; }

// A-10 rocket salvo. Each rocket has its own aim point on the target line; if the owner can
// currently SEE an enemy vehicle or structure within `seek` metres of that point, the rocket
// guides onto it. Anything in fog is never guided on (unguided rockets just hit the line).
function launchRocket(sim, p, k) {
  const R = POWERS.a10.rockets, along = -20 + k * 8, lat = (k % 2 ? 2.5 : -2.5);
  let tx = p.tx + p.dx * along - p.dz * lat, tz = p.tz + p.dz * along + p.dx * lat, guided = 0, bd = R.seek;
  for (const e of sim.ents) {
    if (e.dead || e.team === p.team || e.team > 1 || (e.kind === 'unit' && (e.inB || e.air || e.cls !== 1))) continue;
    const d = Math.hypot(e.x - tx, e.z - tz);
    if (d < bd && sim.fog.canSee(p.team, e)) { bd = d; guided = e.id; }
  }
  if (guided) { const e = sim.byId.get(guided); tx = e.x; tz = e.z; }
  tx = Math.min(WORLD - 3, Math.max(3, tx)); tz = Math.min(WORLD - 3, Math.max(3, tz));
  const side = k % 2 ? 4 : -4, sx = p.x - p.dz * side, sz = p.z + p.dx * side;
  sim.strikes.push({ id: sim.nextId++, kind: 'rocket', team: p.team, sx, sz, sy: p.y - 1.2, tx, tz, x: sx, z: sz, px: sx, pz: sz, a: Math.atan2(tz - sz, tx - sx), t: R.flight, T: R.flight, guided, dead: false });
  sim.events.push({ t: 'rocketfire', x: sx, z: sz, y: p.y - 1.2, a: p.a, team: p.team });
}

function plane(sim, team, model, payload, x, z, lateral = 0, delay = 0) {
  const [dx, dz] = approach(sim, team, x, z), tx = x - dz * lateral, tz = z + dx * lateral, lead = 250 + delay * 4.4;
  const p = { id: sim.nextId++, kind: 'plane', model, payload, team, tx, tz, dx, dz, a: Math.atan2(dz, dx), s: -lead, next: -24, dropped: false,
    x: tx - dx * lead, z: tz - dz * lead, px: 0, pz: 0, y: 0, py: 0, rk: 0, dead: false };
  p.px = p.x; p.pz = p.z; p.y = p.py = planeAlt(p); sim.strikes.push(p);
}

export function usePower(sim, team, id, x, z) {
  const err = powerError(sim, team, id, x, z);
  if (err) { sim.events.push({ t: 'msg', team, text: err }); return false; }
  const T = sim.teams[team], P = POWERS[id];
  const G = generalOf(T), hk = id === 'cashhack' && G && G.hack ? G.hack : null;
  T.powerReady[id] = sim.tick + (hk ? hk.cd : P.cd) * 20; T.powersUsed++;
  sim.events.push({ t: 'power', id, team, x, z });
  if (P.super) sim.events.push({ t: 'superlaunch', id, team });        // public warning: both sides hear the klaxon, nobody is told where
  switch (id) {
    case 'paradrop': plane(sim, team, 'bomber', 'paradrop', x, z); break;
    case 'b2': plane(sim, team, 'b2', 'carpet', x, z); break;
    case 'cashhack': {
      const b = hackTarget(sim, team, x, z), E = sim.teams[b.team], amt = Math.min(hk ? hk.amount : P.amount, Math.max(0, Math.floor(E.money)));
      E.money -= amt; T.money += amt; T.hacked = (T.hacked || 0) + amt;
      sim.events.push({ t: 'cashhack', x: b.x, z: b.z, team, victim: b.team, amt });
      break;
    }
    case 'sneaktunnel': sim.strikes.push({ id: sim.nextId++, kind: 'sneak', team, x, z, px: x, pz: z, t: P.delay * 20, dead: false }); break;
    case 'nuke': sim.strikes.push({ id: sim.nextId++, kind: 'nuke', team, x, z, px: x, pz: z, t: P.flight, T: P.flight, dead: false }); break;
    case 'scud':
      for (let i = 0; i < P.n; i++) {
        const a = sim.rand() * 6.2831853, r = i ? Math.sqrt(sim.rand()) * (P.radius - 6) : 0;
        sim.strikes.push({ id: sim.nextId++, kind: 'scud', team, x: x + Math.cos(a) * r, z: z + Math.sin(a) * r, px: 0, pz: 0, t: 70 + i * 9, dead: false });
      }
      break;
    case 'particle': { const [dx, dz] = approach(sim, team, x, z); sim.strikes.push({ id: sim.nextId++, kind: 'pbeam', team, x, z, px: x, pz: z, sx: x, sz: z, dx, dz, n: 0, dead: false }); break; }
    case 'a10': plane(sim, team, 'a10', 'strafe', x, z); if (T.flags.a10x2) plane(sim, team, 'a10', 'strafe', x, z, 9, 14); break;
    case 'emp': plane(sim, team, 'a10', 'emp', x, z); break;
    case 'fab': plane(sim, team, 'bomber', 'fab', x, z); break;
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
  return true;
}

function detonate(sim, p, x, z) {
  const src = { team: p.team };
  if (p.payload === 'fab') {
    splashDamage(sim, x, z, POWERS.fab.radius, 420, 'fab', src);
    addHazard(sim, 'thermal', x, z, 15, 7, 30, p.team, true);
    sim.events.push({ t: 'fab', x, z, r: POWERS.fab.radius, team: p.team });
  } else if (p.payload === 'toxin') {
    addHazard(sim, 'toxin', x, z, POWERS.toxinbomb.radius, 20, 22, p.team, true);
    sim.events.push({ t: 'toxin', x, z, r: POWERS.toxinbomb.radius, team: p.team });
  } else if (p.payload === 'emp') {
    const R = POWERS.emp.radius; let n = 0;
    for (const e of sim.ents) {
      if (e.dead || e.team === p.team || e.team > 1) continue;
      if (Math.hypot(e.x - x, e.z - z) - e.radius > R) continue;
      if (e.kind === 'unit') {
        if (e.cls !== 1 || e.inB) continue; // infantry are unaffected
        e.empUntil = sim.tick + 240; n++;
        if (e.air && !e.landed) { e.hp -= e.maxHp * 0.5; e.lastHit = sim.tick; if (e.hp <= 0) kill(sim, e); }
      } else if (BLDGS[e.type].weapon) { e.empUntil = sim.tick + 240; n++; }
    }
    sim.events.push({ t: 'emp', x, z, r: R, team: p.team, n });
  }
}

export function stepPowers(sim) {
  if (!sim.strikes.length) return;
  for (const p of sim.strikes) {
    p.px = p.x; p.pz = p.z;
    if (p.kind === 'plane') {
      p.s += 4.4; p.x = p.tx + p.dx * p.s; p.z = p.tz + p.dz * p.s; p.py = p.y; p.y = planeAlt(p);
      if (p.payload === 'strafe') {
        const A = POWERS.a10;
        // stage 1: 30 mm burst walks down the target line, landing ahead of the aircraft
        while (p.next <= 24 && p.s + 20 >= p.next) {
          const j = (sim.rand() - 0.5) * 3.5, ix = p.tx + p.dx * p.next - p.dz * j, iz = p.tz + p.dz * p.next + p.dx * j;
          if (ix > 2 && iz > 2 && ix < WORLD - 2 && iz < WORLD - 2) { splashDamage(sim, ix, iz, A.gun.r, A.gun.dmg, 'a10gun', { team: p.team }, p.x, p.z); sim.events.push({ t: 'strafe', x: ix, z: iz, team: p.team }); }
          p.next += A.gun.step;
        }
        // stage 2: six underwing rockets, released in pairs during the dive
        while (p.rk < A.rockets.n && p.s >= -78 + (p.rk >> 1) * 13) launchRocket(sim, p, p.rk++);
      } else if (!p.dropped && p.s >= -30) { // bomb release: lands on the aim point 0.6 s later
        p.dropped = true;
        sim.strikes.push({ id: sim.nextId++, kind: p.payload === 'paradrop' ? 'para' : p.payload === 'carpet' ? 'carpet' : 'bomb', dx: p.dx, dz: p.dz, payload: p.payload, team: p.team, x: p.tx, z: p.tz, px: p.tx, pz: p.tz, t: p.payload === 'paradrop' ? 60 : 12, dead: false });
      }
      if (p.s > 260) p.dead = true;
    } else if (p.kind === 'rocket') {
      const u = 1 - (--p.t) / p.T; p.x = p.sx + (p.tx - p.sx) * u; p.z = p.sz + (p.tz - p.sz) * u;
      if (p.t <= 0) {
        p.dead = true; p.x = p.tx; p.z = p.tz;
        const R = POWERS.a10.rockets;
        splashDamage(sim, p.tx, p.tz, R.r, R.dmg, 'a10rocket', { team: p.team }, p.sx, p.sz);
        sim.events.push({ t: 'rockethit', x: p.tx, z: p.tz, team: p.team, guided: p.guided, id: p.id, sx: p.sx, sz: p.sz, sy: p.sy });
      }
    } else if (p.kind === 'pbeam') { // the beam walks along its line, burning whatever it crosses
      const B = POWERS.particle.beam, u = p.n / B.ticks;
      p.x = Math.min(WORLD - 3, Math.max(3, p.sx + p.dx * B.sweep * (u - 0.5))); p.z = Math.min(WORLD - 3, Math.max(3, p.sz + p.dz * B.sweep * (u - 0.5)));
      if (p.n % B.every === 0) { splashDamage(sim, p.x, p.z, B.r, B.dmg, 'particle', { team: p.team }); sim.events.push({ t: 'pbeam', x: p.x, z: p.z, team: p.team, k: p.n }); }
      if (++p.n >= B.ticks) p.dead = true;
    } else if (--p.t <= 0) {
      p.dead = true;
      if (p.kind === 'nuke') {
        const P = POWERS.nuke;
        splashDamage(sim, p.x, p.z, P.radius, P.dmg, 'nuke', { team: p.team });
        addHazard(sim, 'thermal', p.x, p.z, P.fallout.r, P.fallout.secs, P.fallout.dps, p.team, true);
        sim.events.push({ t: 'nuke', x: p.x, z: p.z, r: P.radius, team: p.team });
      } else if (p.kind === 'scud') {
        const P = POWERS.scud;
        splashDamage(sim, p.x, p.z, P.r, P.dmg, 'scud', { team: p.team });
        addHazard(sim, 'toxin', p.x, p.z, P.toxin.r, P.toxin.secs, P.toxin.dps, p.team, true);
        sim.events.push({ t: 'scudhit', x: p.x, z: p.z, r: P.toxin.r, team: p.team });
      } else if (p.kind === 'para') {
        const P = POWERS.paradrop; let made = 0;
        for (let i = 0; i < P.n; i++) { const a = i * 2.399963, u = spawnNear(sim, P.unit, p.team, p.x + Math.cos(a) * (2 + i * 1.2), p.z + Math.sin(a) * (2 + i * 1.2), a); if (u) made++; }
        sim.events.push({ t: 'paradrop', x: p.x, z: p.z, team: p.team, n: made });
      } else if (p.kind === 'sneak') {
        const s = sneakSite(sim, p.team, p.x, p.z);                    // the ground may have been built on during the delay
        if (s) { const b = makeBldg(sim, 's_tunnel', p.team, s[0], s[1], true); sim.nav.dirty = true; sim.events.push({ t: 'sneak', x: b.x, z: b.z, team: p.team, id: b.id }); }
        else sim.events.push({ t: 'msg', team: p.team, text: 'Sneak Attack failed: the ground was blocked' });
      }
      else if (p.kind === 'shell') { splashDamage(sim, p.x, p.z, 7, 95, 'artillery', { team: p.team }); sim.events.push({ t: 'shellhit', x: p.x, z: p.z, team: p.team }); }
      else if (p.kind === 'bomb') detonate(sim, p, p.x, p.z);
      else if (p.kind === 'carpet') { // the stick of bombs walks along the bomber's track
        const B = POWERS.b2; for (let i = 0; i < B.n; i++) { const a = (i / (B.n - 1) - 0.5) * B.line, lat = (i % 2 ? 3 : -3); sim.strikes.push({ id: sim.nextId++, kind: 'bomblet', team: p.team, x: p.x + p.dx * a - p.dz * lat, z: p.z + p.dz * a + p.dx * lat, px: 0, pz: 0, t: 2 + i * 3, dead: false }); }
      }
      else if (p.kind === 'bomblet') { splashDamage(sim, p.x, p.z, POWERS.b2.r, POWERS.b2.dmg, 'artillery', { team: p.team }); sim.events.push({ t: 'shellhit', x: p.x, z: p.z, team: p.team }); }
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
