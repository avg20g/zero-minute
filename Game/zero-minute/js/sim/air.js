// Aircraft. Air units ignore the nav grid and fly straight to a goal.
//  - Strike fighters ("based") live on an airfield. They taxi from a parking pad to the runway, line up,
//    roll, lift off, fly a sortie with limited ammo, then fly an approach, land, roll out and taxi back.
//  - Helicopters ("heli") start on the airfield's helipad: rotors spool up, then they climb straight up.
//  - Drones simply fly.
// u.altK is the height above ground as a fraction of the type's cruise altitude (0 = wheels on the ground).
import { DT, WORLD, angDiff } from './defs.js';
import { UNITS } from './factionRegistry.js';
import { kill } from './entities.js';

export const TAXI = 11;           // m/s on the ground
export const GROUND_TURN = 4.5;   // rad/s while taxiing and lining up
export const ACCEL = 20;          // m/s^2 on the take-off roll
export const BRAKE = 22;          // m/s^2 on the landing roll
export const ROTATE = 0.5;        // fraction of the runway used before the nose comes up
export const CLIMB_TICKS = 30;    // ticks from lift-off to cruise altitude
export const FINAL = 55;          // metres from the approach fix to the runway threshold
export const APPROACH = 0.6;      // approach speed as a fraction of cruise speed
export const SPOOL = 14, LIFT = 30; // helicopter: ticks of rotor spool-up, then ticks to climb
export const HELI_REPAIR = 0.06;    // fraction of full health a helicopter regains per second while sitting on a helipad
export const LOITER = 600;        // ticks an aircraft holds over its destination before going home (30 s)
export const ORBIT = 22;          // metres: radius of the holding circle
export const LOITER_SPEED = 0.5;  // a loitering drone circles at this fraction of its top speed
const ON_RUNWAY = { taxi: 1, backtaxi: 1, lineup: 1, roll: 1, final: 1, rollout: 1, taxiin: 1, park: 1 };
const clampW = (v) => Math.min(WORLD - 6, Math.max(6, v));

// Runway i of an airfield (each field has two, one either side of the apron). `cx` is the end nearer the
// middle of the map: aircraft take off toward it and land from it, so climb-out and approach happen over
// the battlefield and never off the edge of the map.
export function runway(b, i) {
  const dir = b.x < WORLD / 2 ? 1 : -1, r = b.rws[i];
  return { z: r.z, dir, ax: dir > 0 ? r.x0 : r.x1, cx: dir > 0 ? r.x1 : r.x0, len: r.x1 - r.x0 };
}
// One aircraft per runway at a time, so two can move at once. A lock held by a dead, re-homed or airborne
// aircraft is stale. Tries the runway on the aircraft's side of the apron first.
function lockRunway(sim, b, u) {
  const first = u.rw >= 0 ? u.rw : u.pad % b.rws.length;
  for (let k = 0; k < b.rws.length; k++) {
    const i = (first + k) % b.rws.length, by = b.rws[i].by;
    if (by && by !== u.id) { const o = sim.byId.get(by); if (o && !o.dead && o.home === b.id && o.rw === i && ON_RUNWAY[o.as]) continue; }
    b.rws[i].by = u.id; u.rw = i; return true;
  }
  return false;
}
function freeRunway(b, u) { if (b.rws) for (const r of b.rws) if (r.by === u.id) r.by = 0; u.rw = -1; }

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
  const df = angDiff(Math.atan2(dz, dx), u.facing), ma = GROUND_TURN * DT;
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
    u.home = 0; u.pad = -1; u.rw = -1;
    if (caught || !claimPad(sim, u)) { kill(sim, u); return true; } // nowhere to land
    home = sim.byId.get(u.home);
    u.as = u.altK > 0 ? 'return' : 'parked'; u.appr = 0;
  }
  const pad = home.pads[u.pad], R = runway(home, u.rw >= 0 ? u.rw : 0), out = R.dir > 0 ? 0 : Math.PI; // its runway (once locked) and the take-off heading
  switch (u.as) {
    case 'parked': {
      u.landed = true; u.altK = 0; u.goal = null; u.spd = 0; u.vx = u.vz = 0; u.x = pad.x; u.z = pad.z;
      if (u.ammo < d.ammo && ++u.reloadT >= d.reload) { u.ammo = d.ammo; u.reloadT = 0; }
      const o = u.order;
      if (o && (o.t === 'attack' || o.t === 'fattack' || o.t === 'move' || o.t === 'amove')) { if (u.ammo > 0 && lockRunway(sim, home, u)) u.as = 'taxi'; } // holds on the pad while the runway is busy
      else if (o) u.order = null;
      return true;
    }
    case 'taxi': u.landed = true; if (drive(u, pad.x, R.z, TAXI)) u.as = 'backtaxi'; return true;                 // pad -> runway centreline
    case 'backtaxi': if (drive(u, R.ax + R.dir * 2.5, R.z, TAXI)) u.as = 'lineup'; return true;                     // down to the far end
    case 'lineup': {
      const df = angDiff(out, u.facing), ma = GROUND_TURN * DT; u.facing += Math.max(-ma, Math.min(ma, df)); u.spd = 0; u.vx = u.vz = 0;
      if (Math.abs(df) < 0.03) { u.facing = out; u.as = 'roll'; }
      return true;
    }
    case 'roll': { // full power down the centreline; rotate past the ROTATE mark; climb straight ahead
      u.facing = out; u.spd = Math.min(u.ms, u.spd + ACCEL * DT); u.vx = R.dir * u.spd; u.vz = 0;
      u.x = clampW(u.x + u.vx * DT); u.z = R.z;
      const run = (u.x - R.ax) * R.dir;
      if (run > R.len * ROTATE) { u.altK = Math.min(1, u.altK + 1 / CLIMB_TICKS); u.landed = false; }
      if (u.altK >= 1) { freeRunway(home, u); u.appr = 0; u.as = u.order && u.ammo > 0 ? 'out' : 'return'; } // locked until here: nobody starts an approach into a climb-out
      return true;
    }
    case 'out': {
      const o = u.order;
      if (!o || u.ammo <= 0) { u.as = 'return'; u.appr = 0; if (!(o && o.guard)) u.order = null; u.target = 0; u.loiterT = 0; break; } // a guard order survives the trip home to re-arm
      if (u.loiterO !== o) { u.loiterO = o; u.loiterT = 0; }
      const t = o.t === 'fattack' ? (o.id ? sim.byId.get(o.id) : o.g) : sim.byId.get(o.t === 'attack' ? o.id : u.target);   // force attack may aim at a spot on the ground
      if (t && !t.dead) { // attack run. A jet cannot turn inside its own turning circle: if the target is close and
        // off the nose, it flies straight out for a moment, then turns back in with room to line up.
        const dx = t.x - u.x, dz = t.z - u.z;
        if (u.extend > 0) u.extend--;
        else if (Math.hypot(dx, dz) < 30 && Math.abs(angDiff(Math.atan2(dz, dx), u.facing)) > 0.6) { u.extend = 30; u.goal = { x: clampW(u.x + Math.cos(u.facing) * 70), z: clampW(u.z + Math.sin(u.facing) * 70) }; }
        else u.goal = { x: t.x, z: t.z };
        break;
      }
      u.extend = 0;
      if (o.t === 'attack' || o.t === 'fattack') { const g = u.goal || u; u.order = { t: 'amove', x: g.x, z: g.z }; break; } // target gone, missiles left: hold over the spot
      // On station: fly a holding circle and engage whatever comes into range. A plain order holds for
      // LOITER ticks; a guard order holds until the missiles are gone.
      const dx = u.x - o.x, dz = u.z - o.z;
      if (Math.hypot(dx, dz) > ORBIT + 14) { u.goal = { x: o.x, z: o.z }; break; }               // still on the way
      o.t = 'amove';
      const a = Math.atan2(dz, dx) + 0.55; u.goal = { x: clampW(o.x + Math.cos(a) * ORBIT), z: clampW(o.z + Math.sin(a) * ORBIT) };
      if (!o.guard && ++u.loiterT >= LOITER) { u.as = 'return'; u.appr = 0; u.order = null; u.target = 0; u.loiterT = 0; }
      break;
    }
    case 'return': { // fly to the approach fix off the end of the field; orbit there while both runways are busy
      if (u.order) { if (u.ammo > 0) { u.as = 'out'; break; } if (!u.order.guard) u.order = null; }
      // Two fixes on the extended centreline: fly to the outer one first, then inbound to the inner one, so the
      // aircraft always reaches the inner fix already pointing at the runway (whatever direction it came home from).
      const fx = clampW(R.cx + R.dir * FINAL), ox = clampW(R.cx + R.dir * (FINAL + 70));
      if (!u.appr) { u.goal = { x: ox, z: home.z }; if (Math.hypot(ox - u.x, home.z - u.z) < 26) u.appr = 1; break; }
      u.goal = { x: fx, z: home.z };
      if (Math.hypot(fx - u.x, home.z - u.z) < 16) { if (lockRunway(sim, home, u)) u.as = 'final'; else u.appr = 0; } // runways busy: back out and come round again
      break;
    }
    case 'final': { // capture the centreline, slow down, and descend on a straight glide slope to the threshold
      const td = R.cx - R.dir * 3, togo = (u.x - td) * R.dir;
      const df = angDiff(Math.atan2(R.z - u.z, -R.dir * Math.max(18, u.spd * 1.3)), u.facing), ma = d.turn * DT; // aim further ahead when faster, so it settles on the line instead of weaving
      u.facing += Math.max(-ma, Math.min(ma, df));
      u.spd += Math.max(-9 * DT, Math.min(9 * DT, u.ms * APPROACH - u.spd));
      u.vx = Math.cos(u.facing) * u.spd; u.vz = Math.sin(u.facing) * u.spd; u.x = clampW(u.x + u.vx * DT); u.z = clampW(u.z + u.vz * DT);
      u.altK = Math.max(0, Math.min(u.altK, togo / FINAL));
      if (togo < 14 && Math.abs(u.z - R.z) > 3.5) { freeRunway(home, u); u.as = 'return'; u.appr = 0; break; }    // not lined up: go around
      if (togo <= 0) { u.altK = 0; u.landed = true; u.as = 'rollout'; sim.events.push({ t: 'touchdown', x: u.x, z: u.z, id: u.id }); }
      return true;
    }
    case 'rollout': { // brake along the centreline toward the far end, then turn off for the pad
      const land = R.dir > 0 ? Math.PI : 0, df = angDiff(land, u.facing); u.facing += Math.max(-0.2, Math.min(0.2, df));
      u.spd = Math.max(TAXI, u.spd - BRAKE * DT); u.vx = -R.dir * u.spd; u.vz = 0; u.x += u.vx * DT; u.z += (R.z - u.z) * 0.25;
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

// Helicopters. Returns true when this function moved (or held) the helicopter itself.
//   spool -> lift            start-up on the helipad
//   order 'repair'           fly to the helipad, wait nearby if another helicopter is on it, descend ('land'), sit ('pad')
//   pad                      repaired at HELI_REPAIR per second; any new order starts the rotors again
function heli(sim, u) {
  const o = u.order;
  const still = () => { u.vx = u.vz = 0; u.spd = 0; };   // the goal is kept: a helicopter ordered away flies there once it is up
  if (u.as === 'spool') { still(); if (++u.reloadT >= SPOOL) { u.as = 'lift'; u.landed = false; } return true; }
  if (u.as === 'lift') { u.vx = u.vz = 0; u.spd = 0; u.altK = Math.min(1, u.altK + 1 / LIFT); if (u.altK >= 1) { u.as = null; u.reloadT = 0; } return true; }
  const b = o && o.t === 'repair' ? sim.byId.get(o.id) : null, pad = b && !b.dead && b.team === u.team ? b.heli : null;
  if (u.as === 'pad') {
    still(); u.landed = true; u.altK = 0;
    if (u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * HELI_REPAIR * DT);
    const leave = o && o.t !== 'repair' && o.t !== 'hold';
    if (leave || (o && o.t === 'repair' && !pad)) { // ordered away (or the airfield is gone): start up and climb out
      for (const f of sim.ents) if (f.heli && f.heli.by === u.id) f.heli.by = 0;
      if (!leave) u.order = null;
      u.as = 'spool'; u.reloadT = 0;
    }
    return true;
  }
  if (!o || o.t !== 'repair') { if (u.as === 'land') { u.as = null; for (const f of sim.ents) if (f.heli && f.heli.by === u.id) f.heli.by = 0; } return false; }
  if (!pad) { u.order = null; u.as = null; return false; }
  if (u.as === 'land') { // straight down onto the pad
    still(); u.x = pad.x; u.z = pad.z; u.altK = Math.max(0, u.altK - 1 / LIFT);
    if (u.altK <= 0) { u.as = 'pad'; u.landed = true; sim.events.push({ t: 'helipad', id: u.id, x: u.x, z: u.z, team: u.team }); }
    return true;
  }
  if (pad.by && pad.by !== u.id) { const h = sim.byId.get(pad.by); if (!h || h.dead || !h.order || h.order.t !== 'repair' || h.order.id !== b.id) { if (!h || h.dead || h.as !== 'pad') pad.by = 0; } }
  if (!pad.by || pad.by === u.id) {
    pad.by = u.id; u.goal = { x: pad.x, z: pad.z };
    if (Math.hypot(pad.x - u.x, pad.z - u.z) < 1.6) { u.as = 'land'; u.goal = null; }
  } else { const a = u.id * 2.399; u.goal = { x: pad.x + Math.cos(a) * 13, z: pad.z + Math.sin(a) * 13 }; }   // pad busy: hold nearby
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
    else if (d.heli) { if (heli(sim, u)) continue; }
    if (u.altK < 1 && !u.hoverLow) u.altK = Math.min(1, u.altK + 1 / CLIMB_TICKS);  // e.g. climbing away from a go-around
    let dvx = 0, dvz = 0;
    const g = u.goal;
    if (g) {
      const dx = g.x - u.x, dz = g.z - u.z, dist = Math.hypot(dx, dz);
      if (!d.based && dist < 1.5) { u.goal = null; u.arrived = true; }
      else { const sp = d.based ? u.ms : Math.min(u.ms, Math.max(2, dist * 1.5)); dvx = dx / (dist || 1) * sp; dvz = dz / (dist || 1) * sp; }
    } else if (d.loiter && !u.order) { // nothing to do: fly a slow circle around its station instead of hanging in the air (u.goal stays empty, so it still counts as idle)
      const a = Math.atan2(u.z - u.guardZ, u.x - u.guardX) + 0.8, tx = u.guardX + Math.cos(a) * d.loiter, tz = u.guardZ + Math.sin(a) * d.loiter, dist = Math.hypot(tx - u.x, tz - u.z) || 1;
      dvx = (tx - u.x) / dist * u.ms * LOITER_SPEED; dvz = (tz - u.z) / dist * u.ms * LOITER_SPEED;
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
