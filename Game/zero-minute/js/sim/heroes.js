// Hero abilities. One hero per side (see the `train` command), always cloaked; the cloak rules are the ordinary
// stealth rules in abilities.js. What is special is what their weapons do, and that is here:
//   'hack'  Fook Mie's phone: recruit an enemy unit, or make it resign; damage instead against a hero
//   'call'  The Phantom: a hijacked airliner, a short-lived ambush or a car bomb, picked by the simulation's RNG
import { WORLD } from './defs.js';
import { UNITS, WEAPONS, GENERAL, HERO_CALL, RESIGN_TICKS } from './factionRegistry.js';
import { applyDamage, makeUnit, freeSpot, stopUnit, changeTeam, addGeneralXp, strikeDamage } from './entities.js';
import { addHazard } from './abilities.js';

const worth = (t) => Math.max(100, UNITS[t.type].cost || 0);
const clampW = (v) => Math.min(WORLD - 4, Math.max(4, v));

// Recharge after taking a unit: cheap units are quick, expensive ones take much longer. Returns ticks.
export function hackTicks(w, t) { return Math.round(Math.max(w.minSec, Math.min(w.maxSec, (UNITS[t.type].cost || 0) / w.perSec)) * 20); }

// Returns the cooldown (ticks) this use costs, or 0 to keep the weapon's normal one.
export function heroHack(sim, s, wname, t) {
  const w = WEAPONS[wname];
  if (t.ground || t.kind !== 'unit' || t.team === s.team || t.inert) return 0;
  if (UNITS[t.type].hero) { // a hero cannot be talked round: the call just hurts
    sim.events.push({ t: 'hack', k: 'hurt', x: s.x, z: s.z, tx: t.x, tz: t.z, team: s.team, id: t.id });
    applyDamage(sim, t, w.dmg, wname, s.x, s.z, s);
    return 0;
  }
  const mode = s.mode || 'recruit', victim = t.team, cd = hackTicks(w, t);
  if (victim < 2) { sim.teams[victim].unitsLost++; sim.teams[s.team].unitsKilled++; }
  addGeneralXp(sim, s.team, worth(t) * GENERAL.killXp);
  if (mode === 'resign') { // walks off the job: inert at once, gone after a moment, no wreck
    stopUnit(t); t.order = null; t.target = 0; t.inert = true; t.expires = sim.tick + RESIGN_TICKS; t.cloaked = false; t.revealUntil = t.expires;
  } else changeTeam(sim, t, s.team);
  sim.events.push({ t: 'hack', k: mode, x: s.x, z: s.z, tx: t.x, tz: t.z, team: s.team, victim, id: t.id, type: t.type });
  return cd;
}

export function phantomCall(sim, s, t) {
  const pick = Math.floor(sim.rand() * 3), tx = t.x, tz = t.z, C = HERO_CALL;
  const id = t.ground || !sim.fog.canSee(s.team, t) ? 0 : t.id;   // a target his side cannot see right now (a force attack into fog) is treated as a spot on the ground
  let dx = tx - s.x, dz = tz - s.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
  const attack = (u) => { if (id) { u.order = { t: 'attack', id }; u.target = id; } else u.order = { t: 'amove', x: tx, z: tz }; };
  let k = ['airliner', 'ambush', 'car'][pick];
  if (k === 'car') { // drives in from behind the Phantom's side of the target
    const d = UNITS[C.car.unit], sp = freeSpot(sim, clampW(tx - dx * C.car.from), clampW(tz - dz * C.car.from), d.cls, d.radius, 10);
    if (!sp) k = 'airliner';   // nowhere to put a car (water, cliffs): send the aircraft instead
    else {
      const u = makeUnit(sim, C.car.unit, s.team, sp[0], sp[1], Math.atan2(dz, dx)); u.temp = true; u.expires = sim.tick + C.car.secs * 20;
      u.order = id ? { t: 'attack', id } : { t: 'fattack', id: 0, x: tx, z: tz, g: { id: 0, ground: true, kind: 'ground', x: tx, z: tz, radius: 0, dead: false, air: false, landed: false, team: -1 } };
      u.target = id;
    }
  }
  if (k === 'ambush') {
    let made = 0;
    for (let i = 0; i < C.ambush.units.length; i++) {
      const type = C.ambush.units[i], d = UNITS[type], a = i * 1.5708 + 0.6, sp = freeSpot(sim, clampW(tx + Math.cos(a) * 9), clampW(tz + Math.sin(a) * 9), d.cls, d.radius, 10);
      if (!sp) continue;
      const u = makeUnit(sim, type, s.team, sp[0], sp[1], Math.atan2(tz - sp[1], tx - sp[0])); u.temp = true; u.expires = sim.tick + C.ambush.secs * 20; attack(u); made++;
    }
    if (!made) k = 'airliner';
  }
  if (k === 'airliner') { // comes in low along the line from the Phantom to the target and follows the target if it moves
    const A = C.airliner, sx = tx - dx * A.lead, sz = tz - dz * A.lead;
    sim.strikes.push({ id: sim.nextId++, kind: 'airliner', model: 'b737', team: s.team, tid: t.ground ? 0 : t.id, tx, tz, x: sx, z: sz, px: sx, pz: sz, y: A.alt, py: A.alt, a: Math.atan2(dz, dx), far: A.lead, dead: false });
  }
  sim.events.push({ t: 'phantom', k, x: s.x, z: s.z, tx, tz, team: s.team });
}

// One tick of the hijacked airliner (a strike object, see powers.js).
export function stepAirliner(sim, p) {
  const A = HERO_CALL.airliner, t = p.tid ? sim.byId.get(p.tid) : null;
  if (t && !t.dead && !(t.kind === 'unit' && t.inB)) { p.tx = t.x; p.tz = t.z; }
  const dx = p.tx - p.x, dz = p.tz - p.z, d = Math.hypot(dx, dz);
  p.py = p.y;
  if (d <= A.speed) {
    p.x = p.tx; p.z = p.tz; p.y = 0; p.dead = true;
    strikeDamage(sim, p.x, p.z, A.r, A.dmg, 'airliner', { team: p.team });
    addHazard(sim, 'fire', p.x, p.z, A.fire.r, A.fire.secs, A.fire.dps, p.team, false);
    sim.events.push({ t: 'airliner', x: p.x, z: p.z, r: A.r, team: p.team });
    return;
  }
  p.x += dx / d * A.speed; p.z += dz / d * A.speed; p.a = Math.atan2(dz, dx);
  p.y = 1.5 + (A.alt - 1.5) * Math.min(1, (d - A.speed) / p.far) ** 1.2;   // a steady dive that flattens out onto the target
}
