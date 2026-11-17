// Economy: power, production queues (units and upgrades), construction/repair,
// supply harvesting. Roles come from the faction registry.
import { CELL, DT, LOAD_TICKS, UNLOAD_TICKS, angDiff } from './defs.js';
import { UNITS, BLDGS, FACTIONS, UPGRADES, POWERS, generalOf } from './factionRegistry.js';
import { rectDist, reqPath, moveTo, stopUnit, releaseSlot, spawnNear, makeUnit } from './entities.js';
import { claimPad } from './air.js';
import { syncSuper, superCd } from './powers.js';

export function stepPower(sim) {
  for (const t of sim.teams) { t.prod = 0; t.use = 0; }
  for (const e of sim.ents) {
    if (e.kind !== 'bldg' || e.dead || !e.done || e.team > 1) continue;
    const p = BLDGS[e.type].power || 0;
    if (p > 0) { if (e.disabledUntil <= sim.tick) sim.teams[e.team].prod += p; } else sim.teams[e.team].use -= p;
  }
  for (const t of sim.teams) t.low = FACTIONS[t.faction].usesPower && t.use > t.prod;
  for (let i = 0; i < 2; i++) { // superweapons: low power pauses every countdown; the team's entry follows its earliest building
    const t = sim.teams[i], sb = FACTIONS[t.faction].roles.super, sp = sb && BLDGS[sb].superPower; if (!sp) continue;
    if (t.low) for (const e of sim.ents) if (e.kind === 'bldg' && e.team === i && e.type === sb && e.done && !e.dead && e.superReady > sim.tick) e.superReady++;
    syncSuper(sim, i, sp);
  }
}

export function completeBldg(sim, b) {
  b.done = true; b.progress = 1;
  sim.events.push({ t: 'done', id: b.id, team: b.team, type: b.type, x: b.x, z: b.z });
  const sp = BLDGS[b.type].superPower;
  if (sp) { // superweapon online: its own countdown starts, and by rule BOTH sides are told where it is
    b.superCd = superCd(sim, b.team, sp); b.superReady = sim.tick + b.superCd; b.seen[0] = b.seen[1] = true;
    syncSuper(sim, b.team, sp);
    sim.events.push({ t: 'superbuilt', id: sp, bid: b.id, team: b.team, x: b.x, z: b.z, secs: Math.round(b.superCd / 20) });
  }
  if (BLDGS[b.type].role === 'supply') { // every Supply Center comes with one free collector
    const tk = FACTIONS[sim.teams[b.team].faction].roles.truck;
    if (UNITS[tk].air) makeUnit(sim, tk, b.team, b.x, b.z, 0); else spawnNear(sim, tk, b.team, b.x + (b.w / 2 + 3) * CELL, b.z, 0);
  }
}

// Queue entries are unit ids, or "up:<id>" for a team-wide upgrade.
export function stepProduction(sim) {
  for (const b of sim.ents) {
    if (b.kind !== 'bldg' || b.dead || !b.done || !b.queue.length || b.offline) continue;
    const item = b.queue[0], T = sim.teams[b.team], rate = T.low ? 0.5 : 1;
    const up = item.startsWith('up:') ? item.slice(3) : null;
    b.prod += DT * rate / (up ? UPGRADES[up].secs : UNITS[item].secs);
    if (b.prod < 1) continue;
    b.prod = 0; b.queue.shift();
    if (up) {
      T.upgrades.add(up);
      for (const u of sim.ents) if (u.kind === 'unit' && u.team === b.team) { u.wslots = null; if (up === 'v_stealthrotor' && u.type === 'v_comanche') u.stealthMode = 'always'; } // new weapons and stealth apply to units already built
      if (up === 'r_nuke') for (const u of sim.ents) if (u.kind === 'unit' && u.team === b.team && UNITS[u.type].nuke) u.ms = UNITS[u.type].speed * 1.15;
      sim.events.push({ t: 'upgrade', id: up, team: b.team });
      continue;
    }
    const d = UNITS[item];
    let u;
    if (d.based) { // strike aircraft roll out onto a pad
      u = makeUnit(sim, item, b.team, b.x, b.z, -Math.PI / 2);
      if (claimPad(sim, u)) { const p = sim.byId.get(u.home).pads[u.pad]; u.x = u.px = p.x; u.z = u.pz = p.z; u.facing = u.pfacing = u.turret = p.f; u.landed = true; }
    } else if (d.heli && b.heli) { // helicopters start on the helipad, spool up and climb (see air.js)
      u = makeUnit(sim, item, b.team, b.heli.x, b.heli.z, Math.PI / 2);
      u.altK = u.paltK = 0; u.landed = true; u.as = 'spool'; u.reloadT = 0;
      u.order = { t: 'move', x: b.rallyX, z: b.rallyZ }; moveTo(sim, u, b.rallyX, b.rallyZ);
    } else if (d.air) {
      u = makeUnit(sim, item, b.team, b.x, b.z, Math.PI / 2);
      u.order = { t: 'move', x: b.rallyX, z: b.rallyZ }; moveTo(sim, u, b.rallyX, b.rallyZ);
    } else if (d.ship && b.launch) { // ships slide off the seaward end of the yard and gather at the rally point (the nearest water to it)
      u = spawnNear(sim, item, b.team, b.launch.x, b.launch.z, [0, Math.PI / 2, Math.PI, -Math.PI / 2][b.face | 0]);
      u.order = { t: 'move', x: b.rallyX, z: b.rallyZ }; reqPath(sim, u, b.rallyX, b.rallyZ);
    } else {
      u = BLDGS[b.type].exitEast ? spawnNear(sim, item, b.team, b.x + (b.w / 2 + 3) * CELL, b.z, 0) : spawnNear(sim, item, b.team, b.x, b.z + (b.h / 2 + 2) * CELL, Math.PI / 2);
      if (!d.harvester) { u.order = { t: 'move', x: b.rallyX, z: b.rallyZ }; reqPath(sim, u, b.rallyX, b.rallyZ); }
    }
    sim.teams[u.team].built++;
    sim.events.push({ t: 'spawn', id: u.id, team: u.team, type: item });
  }
}

// Point just outside a footprint on the side facing (x,z).
export function approachPoint(b, x, z, margin) {
  const hx = b.w * CELL * 0.5 + margin, hz = b.h * CELL * 0.5 + margin;
  let dx = x - b.x, dz = z - b.z;
  const s = Math.max(Math.abs(dx) / hx, Math.abs(dz) / hz) || 1;
  return [b.x + dx / s, b.z + dz / s];
}

export function stepConstruction(sim) {
  for (const u of sim.ents) {
    if (u.kind !== 'unit' || u.dead || !UNITS[u.type].builder) continue;
    u.working = false;
    const o = u.order; if (!o || o.t !== 'construct') continue;
    const b = sim.byId.get(o.id);
    if (!b || b.dead || b.team !== u.team || (b.done && b.hp >= b.maxHp)) { u.order = null; stopUnit(u); continue; }
    if (rectDist(b, u.x, u.z) <= 6.5) {
      stopUnit(u); u.working = true;
      const a = Math.atan2(b.z - u.z, b.x - u.x), df = angDiff(a, u.facing);
      u.facing += Math.max(-0.15, Math.min(0.15, df));
      if (!b.done) {
        const step = DT / BLDGS[b.type].secs;
        b.progress += step; b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.9 * step);
        if (b.progress >= 1) completeBldg(sim, b);
      } else b.hp = Math.min(b.maxHp, b.hp + 45 * DT);
    } else if (!u.path && !u.pathReq) {
      if (u.noPath > 3) { u.order = null; continue; }
      const [ax, az] = approachPoint(b, u.x, u.z, 3.2);
      reqPath(sim, u, ax, az);
    }
  }
}

// ---------- Supply harvesting ----------
function nearestOf(sim, u, pred) {
  let best = null, bd = 1e18;
  for (const e of sim.ents) {
    if (e.kind !== 'bldg' || e.dead || !pred(e)) continue;
    const d = (e.x - u.x) ** 2 + (e.z - u.z) ** 2;
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}
function takeSpot(sim, u, arr, field, partner) {
  let bi = -1, bd = 1e18;
  let north = 0, south = 0;
  if (field === 'slotI') for (let i = 0; i < arr.length; i++) if (arr[i].by && arr[i].by !== u.id) { if (i < 3) south++; else north++; }
  for (let i = 0; i < arr.length; i++) {
    const s = arr[i];
    if (s.by && s.by !== u.id) { const o = sim.byId.get(s.by); if (o && !o.dead && (o.slotB === u.slotB || o.exitB === u.slotB)) continue; s.by = 0; }
    if (!sim.nav.passAt(s.x, s.z, 1) || (s.ex !== undefined && !sim.nav.passAt(s.ex, s.ez, 1)) || (s.ex === undefined && sim.nav.soft[sim.nav.cellOf(s.x, s.z)])) continue;
    let d = Math.hypot(s.x - u.x, s.z - u.z);
    if (field === 'slotI') { // prefer bays on the way to the next stop, and spread across both sides
      d = Math.hypot(s.ex - u.x, s.ez - u.z) + (i < 3 ? south : north) * 7;
      if (partner) d += 0.6 * Math.hypot(s.ex - partner.x, s.ez - partner.z);
    }
    if (d < bd) { bd = d; bi = i; }
  }
  if (bi >= 0) { arr[bi].by = u.id; u[field] = bi; }
  return bi;
}

function stepTruck(sim, u) {
  const o = u.order;
  if (o && o.t !== 'harvest') { if (u.slotB) releaseSlot(sim, u); u.still = false; u.hs = 'seek'; return; }
  if (!o) { u.order = { t: 'harvest' }; u.hs = 'seek'; }
  if (u.exitB) { // keep our bay reserved until we have pulled clear of it
    const eb = sim.byId.get(u.exitB), es = eb && eb.slots && eb.slots[u.exitI];
    if (!es || es.by !== u.id || Math.hypot(es.x - u.x, es.z - u.z) > 5.5) { if (es && es.by === u.id) es.by = 0; u.exitB = 0; u.exitI = -1; }
  }
  const team = sim.teams[u.team];
  switch (u.hs) {
    case 'seek': {
      u.still = false; if (u.slotB) { const keepB = u.exitB, keepI = u.exitI; u.exitB = 0; releaseSlot(sim, u); u.exitB = keepB; u.exitI = keepI; } u.tries = 0;
      if ((sim.tick + u.id) % 10 !== 0 && u.timer !== -1) break; // poll at 2 Hz while idle
      u.timer = 0;
      if (u.cargo > 0) {
        const c = nearestOf(sim, u, e => BLDGS[e.type].role === 'supply' && e.team === u.team && e.done);
        if (!c) break;
        u.center = c.id; u.slotB = c.id; u.hs = 'toCenter';
      } else {
        let dk = u.dock ? sim.byId.get(u.dock) : null;
        if (!dk || dk.supplies <= 0) dk = nearestOf(sim, u, e => e.type === 'dock' && e.supplies > 0 && sim.fog.exp[u.team][sim.nav.cellOf(e.x, e.z)]);
        if (!dk || !nearestOf(sim, u, e => BLDGS[e.type].role === 'supply' && e.team === u.team && e.done)) break;
        u.dock = dk.id; u.slotB = dk.id; u.hs = 'toDock';
      }
      const b = sim.byId.get(u.slotB), [ax, az] = approachPoint(b, u.x, u.z, 14);
      reqPath(sim, u, ax, az);
      break;
    }
    case 'toDock': case 'toCenter': {
      const b = sim.byId.get(u.slotB), isDock = u.hs === 'toDock';
      if (!b || b.dead || (isDock ? b.supplies <= 0 : !b.done)) { stopUnit(u); u.hs = 'seek'; u.timer = -1; if (isDock) u.dock = 0; break; }
      if (u.slotI < 0) {
        const near = rectDist(b, u.x, u.z) < 26;
        if (near || (!u.path && !u.pathReq)) {
          if (near && (sim.tick + u.id) % 4 === 0 && takeSpot(sim, u, b.slots, 'slotI', sim.byId.get(isDock ? u.center : u.dock)) >= 0) {
            if (u.holdI >= 0) { b.holds[u.holdI].by = 0; u.holdI = -1; }
            u.tries = 0; const s = b.slots[u.slotI]; reqPath(sim, u, s.ex, s.ez, s.x, s.z);
          } else if (near && u.holdI < 0 && (sim.tick + u.id) % 4 === 0) {
            if (takeSpot(sim, u, b.holds, 'holdI') >= 0) reqPath(sim, u, b.holds[u.holdI].x, b.holds[u.holdI].z);
          } else if (!near && !u.path && !u.pathReq) {
            if (u.noPath > 4) { u.hs = 'seek'; u.timer = -1; u.dock = 0; break; }
            const [ax, az] = approachPoint(b, u.x, u.z, 14); reqPath(sim, u, ax, az);
          }
        }
      } else {
        const s = b.slots[u.slotI], d = Math.hypot(s.x - u.x, s.z - u.z);
        if (!u.path && !u.pathReq) {
          if (d < 1.7 || (u.tries > 4 && d < 5)) { u.hs = isDock ? 'loading' : 'unloading'; u.timer = isDock ? LOAD_TICKS : UNLOAD_TICKS; u.still = true; u.spd = 0; }
          else { u.tries++; if (Math.hypot(s.ex - u.x, s.ez - u.z) < 3) reqPath(sim, u, s.x, s.z); else reqPath(sim, u, s.ex, s.ez, s.x, s.z); }
        }
      }
      break;
    }
    case 'loading': {
      const b = sim.byId.get(u.slotB);
      if (!b || b.supplies <= 0) { u.hs = 'seek'; u.timer = -1; u.dock = 0; break; }
      if (--u.timer > 0) break;
      const take = Math.min(UNITS[u.type].carry, b.supplies);
      b.supplies -= take; u.cargo = take;
      if (b.supplies <= 0) sim.events.push({ t: 'dockEmpty', id: b.id, x: b.x, z: b.z });
      u.exitB = u.slotB; u.exitI = u.slotI; u.slotB = 0; u.slotI = -1;
      u.hs = 'seek'; u.timer = -1;
      break;
    }
    case 'unloading': {
      const b = sim.byId.get(u.slotB);
      if (!b || b.dead) { u.hs = 'seek'; u.timer = -1; break; }
      if (--u.timer > 0) break;
      team.money += u.cargo; team.earned += u.cargo;
      sim.events.push({ t: 'cash', x: b.x, z: b.z, amt: u.cargo, team: u.team });
      u.cargo = 0; u.exitB = u.slotB; u.exitI = u.slotI; u.slotB = 0; u.slotI = -1; u.hs = 'seek'; u.timer = -1;
      break;
    }
  }
}

// Supply helicopter (Chinook): flies straight between a dock and a Supply Center, drops low over each to load and unload.
// It needs no loading bay and no road, so it never queues, but anti-air can shoot it down.
const CH_LOW = 0.32, CH_LOAD = 80, CH_UNLOAD = 32;
function stepChopper(sim, u) {
  const o = u.order;
  if (o && o.t !== 'harvest') { u.hoverLow = false; u.hs = 'seek'; u.timer = -1; return; }
  if (u.as) return;                                   // on a helipad, or lifting off it
  if (!o) { u.order = { t: 'harvest' }; u.hs = 'seek'; u.timer = -1; }
  const team = sim.teams[u.team], isCenter = e => BLDGS[e.type].role === 'supply' && e.team === u.team && e.done;
  switch (u.hs) {
    case 'seek': {
      u.hoverLow = false;
      if ((sim.tick + u.id) % 10 !== 0 && u.timer !== -1) break;
      u.timer = 0;
      let b;
      if (u.cargo > 0) { b = nearestOf(sim, u, isCenter); if (!b) break; u.center = b.id; u.hs = 'toCenter'; }
      else {
        let dk = u.dock ? sim.byId.get(u.dock) : null;
        if (!dk || dk.dead || dk.supplies <= 0) dk = nearestOf(sim, u, e => e.type === 'dock' && e.supplies > 0 && sim.fog.exp[u.team][sim.nav.cellOf(e.x, e.z)]);
        if (!dk || !nearestOf(sim, u, isCenter)) break;
        u.dock = dk.id; b = dk; u.hs = 'toDock';
      }
      const a = u.id * 2.399; u.hb = b.id; u.goal = { x: b.x + Math.cos(a) * 4, z: b.z + Math.sin(a) * 4 };   // each helicopter has its own spot over the building
      break;
    }
    case 'toDock': case 'toCenter': {
      const b = sim.byId.get(u.hb), isDock = u.hs === 'toDock';
      if (!b || b.dead || (isDock ? b.supplies <= 0 : !b.done || b.team !== u.team)) { u.goal = null; u.hs = 'seek'; u.timer = -1; if (isDock) u.dock = 0; break; }
      if (!u.goal || Math.hypot(u.goal.x - u.x, u.goal.z - u.z) < 3) { u.goal = null; u.hs = isDock ? 'loading' : 'unloading'; u.timer = isDock ? CH_LOAD : CH_UNLOAD; u.hoverLow = true; }
      break;
    }
    case 'loading': case 'unloading': {
      const b = sim.byId.get(u.hb), load = u.hs === 'loading';
      if (!b || b.dead || (load && b.supplies <= 0)) { u.hoverLow = false; u.hs = 'seek'; u.timer = -1; if (load) u.dock = 0; break; }
      u.goal = null; u.altK = Math.max(CH_LOW, u.altK - 0.06);
      if (u.altK > CH_LOW + 0.01 || --u.timer > 0) break;
      if (load) {
        const take = Math.min(UNITS[u.type].carry, b.supplies); b.supplies -= take; u.cargo = take;
        if (b.supplies <= 0) sim.events.push({ t: 'dockEmpty', id: b.id, x: b.x, z: b.z });
      } else {
        team.money += u.cargo; team.earned += u.cargo;
        sim.events.push({ t: 'cash', x: b.x, z: b.z, amt: u.cargo, team: u.team }); u.cargo = 0;
      }
      u.hoverLow = false; u.hs = 'seek'; u.timer = -1;
      break;
    }
  }
}

export function stepHarvest(sim) {
  for (const u of sim.ents) if (u.kind === 'unit' && !u.dead && UNITS[u.type].harvester) { if (u.air) stepChopper(sim, u); else stepTruck(sim, u); }
}
