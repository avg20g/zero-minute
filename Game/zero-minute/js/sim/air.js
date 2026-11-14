// Aircraft. Air units ignore the nav grid and fly straight to a goal.
//  - Strike fighters ("based") live on an airfield. They taxi from a parking pad to the runway, line up,
//    roll, lift off, fly a sortie with limited ammo, then fly an approach, land, roll out and taxi back.
//  - Helicopters ("heli") start on the airfield's helipad: rotors spool up, then they climb straight up.
//  - Drones simply fly.
// u.altK is the height above ground as a fraction of the type's cruise altitude (0 = wheels on the ground).
import { DT, WORLD, angDiff } from './defs.js';
import { UNITS } from './factionRegistry.js';
import { kill } from './entities.js';

export const TAXI = 7;            // m/s on the ground
export const ROTATE = 0.55;       // fraction of the runway used before the nose comes up
export const CLIMB_TICKS = 44;    // ticks from lift-off to cruise altitude
export const FINAL = 60;          // metres from the approach fix to the runway threshold
export const SPOOL = 30, LIFT = 50; // helicopter: ticks of rotor spool-up, then ticks to climb
const ON_RUNWAY = { taxi: 1, backtaxi: 1, lineup: 1, roll: 1, final: 1, rollout: 1, taxiin: 1, park: 1 };
const clampW = (v) => Math.min(WORLD - 6, Math.max(6, v));

// Runway of an airfield. `cx` is the end nearer the middle of the map: aircraft take off toward it and land
// from it, so climb-out and approach happen over the battlefield and never off the edge of the map.
export function runway(b) {
  const dir = b.x < WORLD / 2 ? 1 : -1, r = b.rw;
  return { z: r.z, dir, ax: dir > 0 ? r.x0 : r.x1, cx: dir > 0 ? r.x1 : r.x0, len: r.x1 - r.x0 };
}
// One aircraft on the runway at a time. A lock held by a dead, re-homed or airborne aircraft is stale.
function lockRunway(sim, b, u) {
  const by = b.rw.by;
  if (by && by !== u.id) { const o = sim.byId.get(by); if (o && !o.dead && o.home === b.id && ON_RUNWAY[o.as]) return false; }
  b.rw.by = u.id; return true;
}
function freeRunway(b, u) { if (b.rw && b.rw.by === u.id) b.rw.by = 0; }

export function claimPad(sim, u) { // find an airfield of our team with a free pad
  for (const b of sim.ents) {
    if (b.kind !== 'bldg' || b.dead || !b.done || b.team !== u.team || !b.pads) continue;
    for (let i = 0; i < b.pads.length; i++) {
      const p = b.pads[i];
      if (p.by && p.by !== u.id) { const o = sim.byId.get(p.by); if (o && !o.dead && o.home === b.id) continue; p.by = 0; }
      p.by = u.id; u.home = b.id; u.pad = i; return true;
    }
  }
  return false;
}
export function padCount(sim, b) { // pads in use, including aircraft still in the queue
  let n = 0;
  for (const p of b.pads) if (p.by) { const o = sim.byId.get(p.by); if (o && !o.dead) n++; }
  for (const q of b.queue) if (UNITS[q] && UNITS[q].based) n++;
  return n;
}

// Ground handling: turn on the spot toward the point, then roll to it. True on arrival.
function drive(u, tx, tz, speed) {
  const dx = tx - u.x, dz = tz - u.z, dist = Math.hypot(dx, dz);
  if (dist < 0.6) { u.x = tx; u.z = tz; u.vx = u.vz = 0; u.spd = 0; return true; }
  const df = angDiff(Math.atan2(dz, dx), u.facing), ma = 2.8 * DT;
  u.facing += Math.max(-ma, Math.min(ma, df));
  const sp = Math.abs(df) > 0.45 ? 0 : Math.min(speed, dist / DT);
  u.spd = sp; u.vx = Math.cos(u.facing) * sp; u.vz = Math.sin(u.facing) * sp; u.x += u.vx * DT; u.z += u.vz * DT;
  return false;
}

// Returns true when this function moved the aircraft itself (ground handling, take-off roll, final approach).
function fighter(sim, u, d) {
  let home = sim.byId.get(u.home);
  if (!home || home.dead) {
    const caught = u.home !== 0 && u.altK <= 0;                 // on the ground when its airfield was destroyed
    u.home = 0; u.pad = -1;
    if (caught || !claimPad(sim, u)) { kill(sim, u); return true; } // nowhere to land
    home = sim.byId.get(u.home);
    u.as = u.altK > 0 ? 'return' : 'parked';
  }
  const pad = home.pads[u.pad], R = runway(home), out = R.dir > 0 ? 0 : Math.PI; // take-off heading
  switch (u.as) {
    case 'parked': {
      u.landed = true; u.altK = 0; u.goal = null; u.spd = 0; u.vx = u.vz = 0; u.x = pad.x; u.z = pad.z;
      if (u.ammo < d.ammo && ++u.reloadT >= d.reload) { u.ammo = d.ammo; u.reloadT = 0; }
      const o = u.order;
      if (o && (o.t === 'attack' || o.t === 'move' || o.t === 'amove')) { if (u.ammo > 0 && lockRunway(sim, home, u)) u.as = 'taxi'; } // holds on the pad while the runway is busy
      else if (o) u.order = null;
      return true;
    }
    case 'taxi': u.landed = true; if (drive(u, pad.x, R.z, TAXI)) u.as = 'backtaxi'; return true;                 // pad -> runway centreline
    case 'backtaxi': if (drive(u, R.ax + R.dir * 2.5, R.z, TAXI)) u.as = 'lineup'; return true;                     // down to the far end
    case 'lineup': {
      const df = angDiff(out, u.facing), ma = 2.8 * DT; u.facing += Math.max(-ma, Math.min(ma, df)); u.spd = 0; u.vx = u.vz = 0;
      if (Math.abs(df) < 0.03) { u.facing = out; u.as = 'roll'; }
      return true;
    }
    case 'roll': { // full power down the centreline; rotate past the ROTATE mark; climb straight ahead
      u.facing = out; u.spd = Math.min(u.ms, u.spd + 13 * DT); u.vx = R.dir * u.spd; u.vz = 0;
      u.x = clampW(u.x + u.vx * DT); u.z = R.z;
      const run = (u.x - R.ax) * R.dir;
      if (run > R.len * ROTATE) { u.altK = Math.min(1, u.altK + 1 / CLIMB_TICKS); u.landed = false; }
      if (u.altK >= 1) { freeRunway(home, u); u.as = u.order && u.ammo > 0 ? 'out' : 'return'; } // locked until here: nobody starts an approach into a climb-out
      return true;
    }
    case 'out': {
      const o = u.order;
      if (!o || u.ammo <= 0) { u.as = 'return'; u.order = null; u.target = 0; break; }
      const t = sim.byId.get(o.t === 'attack' ? o.id : u.target);
      if (t && !t.dead) u.goal = { x: t.x, z: t.z };
      else if (o.t === 'attack') { u.as = 'return'; u.order = null; }
      else { u.goal = { x: o.x, z: o.z }; if (Math.hypot(o.x - u.x, o.z - u.z) < 10) { u.as = 'return'; u.order = null; u.target = 0; } }
      break;
    }
    case 'return': { // fly to the approach fix on the extended centreline; orbit there while the runway is busy
      if (u.order) { if (u.ammo > 0) { u.as = 'out'; break; } u.order = null; }
      const fx = clampW(R.cx + R.dir * FINAL);
      u.goal = { x: fx, z: R.z };
      if (Math.hypot(fx - u.x, R.z - u.z) < 14 && lockRunway(sim, home, u)) u.as = 'final';
      break;
    }
    case 'final': { // capture the centreline, slow down, and descend on a straight glide slope to the threshold
      const td = R.cx - R.dir * 3, togo = (u.x - td) * R.dir;
      const df = angDiff(Math.atan2(R.z - u.z, -R.dir * 16), u.facing), ma = d.turn * DT;
      u.facing += Math.max(-ma, Math.min(ma, df));
      u.spd += Math.max(-9 * DT, Math.min(9 * DT, u.ms * 0.5 - u.spd));
      u.vx = Math.cos(u.facing) * u.spd; u.vz = Math.sin(u.facing) * u.spd; u.x = clampW(u.x + u.vx * DT); u.z = clampW(u.z + u.vz * DT);
      u.altK = Math.max(0, Math.min(u.altK, togo / FINAL));
      if (togo < 14 && Math.abs(u.z - R.z) > 3.5) { freeRunway(home, u); u.as = 'return'; break; }    // not lined up: go around
      if (togo <= 0) { u.altK = 0; u.landed = true; u.as = 'rollout'; sim.events.push({ t: 'touchdown', x: u.x, z: u.z, id: u.id }); }
      return true;
    }
    case 'rollout': { // brake along the centreline toward the far end, then turn off for the pad
      const land = R.dir > 0 ? Math.PI : 0, df = angDiff(land, u.facing); u.facing += Math.max(-0.2, Math.min(0.2, df));
      u.spd = Math.max(TAXI, u.spd - 16 * DT); u.vx = -R.dir * u.spd; u.vz = 0; u.x += u.vx * DT; u.z += (R.z - u.z) * 0.25;
      const passed = (u.x - pad.x) * R.dir <= 0.5, end = (u.x - R.ax) * R.dir < 3;
      if (end || (passed && u.spd <= TAXI + 0.01)) u.as = 'taxiin';
      return true;
    }
    case 'taxiin': if (drive(u, pad.x, R.z, TAXI)) u.as = 'park'; return true;
    case 'park': {
      if (Math.abs(u.z - R.z) > 3.5) freeRunway(home, u);
      if (drive(u, pad.x, pad.z, TAXI)) { freeRunway(home, u); u.as = 'parked'; u.target = 0; }
      return true;
    }
  }
  return false;
}

export function stepAir(sim) {
  let airs = null;
  for (const u of sim.ents) if (u.kind === 'unit' && u.air && !u.dead) (airs || (airs = [])).push(u);
  if (!airs) return;
  for (const u of airs) {
    const d = UNITS[u.type];
    u.px = u.x; u.pz = u.z; u.pfacing = u.facing; u.pturret = u.turret; u.paltK = u.altK; u.arrived = false;
    if (u.emp) { u.vx = u.vz = 0; u.spd = 0; continue; }
    if (d.based) { if (fighter(sim, u, d) || u.dead) continue; }
    else if (d.heli && u.as) { // on the helipad: spool the rotors up, then climb straight up
      u.vx = u.vz = 0; u.spd = 0;
      if (u.as === 'spool') { if (++u.reloadT >= SPOOL) { u.as = 'lift'; u.landed = false; } }
      else { u.altK = Math.min(1, u.altK + 1 / LIFT); if (u.altK >= 1) { u.as = null; u.reloadT = 0; } }
      continue;
    }
    if (u.altK < 1) u.altK = Math.min(1, u.altK + 1 / CLIMB_TICKS);  // e.g. climbing away from a go-around
    let dvx = 0, dvz = 0;
    const g = u.goal;
    if (g) {
      const dx = g.x - u.x, dz = g.z - u.z, dist = Math.hypot(dx, dz);
      if (!d.based && dist < 1.5) { u.goal = null; u.arrived = true; }
      else { const sp = d.based ? u.ms : Math.min(u.ms, Math.max(2, dist * 1.5)); dvx = dx / (dist || 1) * sp; dvz = dz / (dist || 1) * sp; }
    }
    for (const o of airs) { // keep aircraft from stacking
      if (o === u || o.landed || o.altK < 1) continue;
      const rx = u.x - o.x, rz = u.z - o.z, dd = Math.hypot(rx, rz), rr = u.radius + o.radius + 2;
      if (dd < rr) { const k = (rr - dd) / rr * 8; if (dd > 0.01) { dvx += rx / dd * k; dvz += rz / dd * k; } else { dvx += Math.cos(u.id) * k; dvz += Math.sin(u.id) * k; } }
    }
    if (d.based) { // always moving: turn toward the goal, fly along the nose
      if (dvx || dvz) { const df = angDiff(Math.atan2(dvz, dvx), u.facing), ma = d.turn * DT; u.facing += Math.max(-ma, Math.min(ma, df)); }
      u.spd += Math.max(-10 * DT, Math.min(20 * DT, u.ms - u.spd));
      u.vx = Math.cos(u.facing) * u.spd; u.vz = Math.sin(u.facing) * u.spd;
    } else {
      u.vx += (dvx - u.vx) * 0.18; u.vz += (dvz - u.vz) * 0.18; u.spd = Math.hypot(u.vx, u.vz);
      if (u.spd > 1.2) { const df = angDiff(Math.atan2(u.vz, u.vx), u.facing), ma = d.turn * DT; u.facing += Math.max(-ma, Math.min(ma, df)); }
    }
    u.x = Math.min(WORLD - 4, Math.max(4, u.x + u.vx * DT)); u.z = Math.min(WORLD - 4, Math.max(4, u.z + u.vz * DT));
  }
}
