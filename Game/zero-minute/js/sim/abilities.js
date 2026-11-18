// Faction mechanics that sit on top of the core loop: stealth and detection,
// horde bonus, veterancy self-repair, EMP, hardpoints, deployable hackers,
// salvage crates, lingering hazards, passive income, tunnels, capture, sabotage.
import { CELL, NEUTRAL } from './defs.js';
import { UNITS, BLDGS, WEAPONS, FACTIONS, HORDE, VET, generalOf } from './factionRegistry.js';
import { applyDamage, hurtGarrison, addGeneralXp, rectDist, releaseSlot, stopUnit, freeSpot, vanish } from './entities.js';

// ---------------- hazards (firestorm, thermal, toxin) ----------------
export function addHazard(sim, kind, x, z, r, secs, dps, team, clears) {
  if (kind === 'toxin' && team < 2) { const T = sim.teams[team], G = generalOf(T); dps *= (G && G.toxin || 1) * (T.upgrades.has('s_anthrax') ? 1.5 : 1); } // WMD General and Anthrax Beta
  sim.hazards.push({ id: sim.nextId++, kind, x, z, r, until: sim.tick + Math.round(secs * 20), dps, team, clears, born: sim.tick });
  sim.events.push({ t: 'hazard', kind, x, z, r, secs });
}
function stepHazards(sim) {
  if (!sim.hazards.length) return;
  for (const h of sim.hazards) {
    if ((sim.tick - h.born) % 10 !== 0) continue;
    const src = { team: h.team }, n = sim.ents.length;
    for (let i = 0; i < n; i++) {
      const e = sim.ents[i];
      if (e.dead || (e.team === h.team && !sim.ff)) continue;   // friendly-fire rule: your own gas and fire hurt your own side too
      if (e.kind === 'unit') {
        if (e.inB || e.air || e.team === NEUTRAL) continue;
        if (Math.hypot(e.x - h.x, e.z - h.z) - e.radius > h.r) continue;
        applyDamage(sim, e, h.dps * 0.5, h.kind, h.x, h.z, src);
      } else if (e.garrison.length && BLDGS[e.type].capacity && rectDist(e, h.x, h.z) <= h.r) {
        hurtGarrison(sim, e, h.dps * 0.5, h.kind, h.x, h.z, src); // heat and gas fill the rooms: occupants are hurt exactly as fast as in the open
      } else if (e.team !== NEUTRAL && WEAPONS[h.kind].vs.bldg && rectDist(e, h.x, h.z) <= h.r) {
        applyDamage(sim, e, h.dps * 0.5, h.kind, h.x, h.z, src);
      }
    }
  }
  if (sim.hazards.some(h => h.until <= sim.tick)) sim.hazards = sim.hazards.filter(h => h.until > sim.tick);
}

// ---------------- stealth ----------------
// A cloaked unit is invisible to the other side unless a detector is in range
// or an enemy is within 7 m. Firing breaks the cloak for 2 s.
function stepStealth(sim) {
  for (const u of sim.ents) {
    if (u.kind !== 'unit' || !u.stealthMode || u.dead) continue;
    u.cloaked = !u.inB && sim.tick >= u.revealUntil && (u.stealthMode === 'always' || u.stillT >= 30);
    if (!u.cloaked) { u.detected = false; continue; }
    let det = false;
    for (const o of sim.ents) {
      if (o.team === u.team || o.team === NEUTRAL || o.dead || (o.kind === 'unit' && o.inB)) continue;
      const def = o.kind === 'unit' ? UNITS[o.type] : BLDGS[o.type];
      if (o.kind === 'bldg' && (!o.done || o.offline)) continue;
      const r = Math.max(def.detector || 0, o.detect || 0, o.kind === 'unit' ? 7 : 0); if (!r) continue;
      if (Math.hypot(o.x - u.x, o.z - u.z) <= r) { det = true; break; }
    }
    u.detected = det;
  }
}

// ---------------- salvage ----------------
function stepCrates(sim) {
  if (!sim.crates.length) return;
  for (const c of sim.crates) {
    if (c.until <= sim.tick) { c.dead = true; continue; }
    for (const u of sim.ents) {
      if (u.kind !== 'unit' || u.dead || u.team !== c.team || u.inB || !UNITS[u.type].salvage) continue;
      if (Math.hypot(u.x - c.x, u.z - c.z) > u.radius + 1.8) continue;
      c.dead = true;
      if (u.tier < 2) { u.tier++; u.wslots = null; sim.events.push({ t: 'salvage', id: u.id, team: u.team, x: u.x, z: u.z, tier: u.tier }); }
      else { sim.teams[u.team].money += 150; sim.teams[u.team].passive += 150; sim.events.push({ t: 'cash', x: u.x, z: u.z, amt: 150, team: u.team }); }
      break;
    }
  }
  sim.crates = sim.crates.filter(c => !c.dead);
}

// ---------------- per-tick upkeep ----------------
export function stepUpkeep(sim) {
  const tick = sim.tick;
  for (const e of sim.ents) {
    if (e.dead) continue;
    if (e.kind === 'bldg') {
      e.offline = e.disabledUntil > tick;
      const d = BLDGS[e.type];
      if (d.income && e.done && e.team < 2 && !e.offline && (tick + e.id) % d.income.every === 0) {
        const T = sim.teams[e.team];
        const amt = Math.round(d.income.amt * (e.type === 'derrick' && FACTIONS[T.faction].oil || 1));   // Russia's Oil Derricks pay more
        if (!(d.power < 0 && T.low)) { T.money += amt; T.passive += amt; sim.events.push({ t: 'cash', x: e.x, z: e.z, amt, team: e.team, quiet: true }); }
      }
      continue;
    }
    if (e.expires && tick >= e.expires) { vanish(sim, e); continue; }   // a called-in unit's time is up, or a resigned unit leaves
    const d = UNITS[e.type], T = sim.teams[e.team];
    e.stillT = (e.spd < 0.2 && !e.path && !e.goal) ? e.stillT + 1 : 0;
    if (e.addonQ) { // hardpoint being fitted
      if (++e.addonQ.t >= d.hardpoints[e.addonQ.type].secs * 20) {
        e.addon = e.addonQ.type; e.addonQ = null; e.wslots = null;
        if (d.hardpoints[e.addon].capacity) e.garrison = [];
        sim.events.push({ t: 'addon', id: e.id, team: e.team, type: e.addon });
      }
    }
    if (e.deployed && (tick + e.id) % d.deploy.every === 0) {
      T.money += d.deploy.income; T.passive += d.deploy.income; e.cashAcc += d.deploy.income;
      if (e.cashAcc >= 30) { sim.events.push({ t: 'cash', x: e.x, z: e.z, amt: e.cashAcc, team: e.team, quiet: true }); e.cashAcc = 0; }
    }
    if ((tick + e.id) % 10 === 0) {
      // Elite and Heroic units repair themselves once out of combat for 5 s
      if (e.vet >= 2 && e.hp < e.maxHp && tick - e.lastHit > 100 && tick - e.lastFire > 100) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * VET.regen[e.vet] * 0.5);
      // repair bays: War Factories and Tunnel Networks patch up vehicles that have been out of combat for 3 s
      if (e.cls === 1 && !e.air && e.hp < e.maxHp && tick - e.lastHit > 60) {
        for (const b of sim.ents) {
          if (b.kind !== 'bldg' || b.team !== e.team || !b.done || b.offline) continue;
          const rr = BLDGS[b.type].repair;
          if (rr && !!BLDGS[b.type].shore === !!d.ship && rectDist(b, e.x, e.z) <= rr) { e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.02); e.repairing = tick; break; }
        }
      }
      // Field Hospital (a capturable site): the owner's infantry nearby heal once they have been out of combat for 3 s
      if (d.infantry && e.hp < e.maxHp && tick - e.lastHit > 60) for (const b of sim.ents) { if (b.kind !== 'bldg' || b.team !== e.team) continue; const hr = BLDGS[b.type].heal; if (hr && rectDist(b, e.x, e.z) <= hr) { e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.025); break; } }
      if (FACTIONS[T.faction].horde && d.weapon) {
        let n = 0;
        for (const o of sim.ents) {
          if (o === e || o.kind !== 'unit' || o.team !== e.team || o.dead || o.inB || o.air || !UNITS[o.type].weapon) continue;
          if (Math.abs(o.x - e.x) <= HORDE.radius && Math.hypot(o.x - e.x, o.z - e.z) <= HORDE.radius && ++n >= HORDE.need) break;
        }
        e.horde = n >= HORDE.need && !e.air;
      }
    }
  }
  if (tick % 4 === 0) { stepStealth(sim); stepCrates(sim); }
  stepHazards(sim);
}

// ---------------- tunnels ----------------
// Move a unit to another tunnel in one tick. Everything that refers to the old
// position is reset here, in one place: path, queued request, dock reservations,
// stuck tracking, interpolation anchors and combat target.
export function teleport(sim, u, exit) {
  const fx = u.x, fz = u.z;
  releaseSlot(sim, u);
  stopUnit(u);
  const dx = exit.rallyX - exit.x, dz = exit.rallyZ - exit.z, l = Math.hypot(dx, dz) || 1;
  const s = freeSpot(sim, exit.x + dx / l * (exit.h * CELL * 0.5 + 3), exit.z + dz / l * (exit.h * CELL * 0.5 + 3), u.nc, u.radius, 16, u.id);
  if (!s) return false; // exit is boxed in: stay put, order is cancelled by the caller
  u.x = s[0]; u.z = s[1];
  u.px = u.x; u.pz = u.z; u.lx = u.x; u.lz = u.z; u.pfacing = u.facing; u.pturret = u.turret;
  u.vx = u.vz = u.spd = 0; u.stuck = 0; u.noPath = 0; u.arrived = false; u.still = false; u.working = false;
  u.target = 0; u.order = null; u.guardX = u.x; u.guardZ = u.z; u.stillT = 0; u.capT = 0;
  if (UNITS[u.type].harvester) { u.hs = 'seek'; u.timer = -1; }
  sim.events.push({ t: 'tunnel', id: u.id, team: u.team, fx, fz, x: u.x, z: u.z });
  return true;
}
// Nearest completed tunnel of the unit's team other than `exit`.
export function nearestTunnel(sim, u, exit) {
  let best = null, bd = 1e18;
  for (const b of sim.ents) {
    if (b.kind !== 'bldg' || b.dead || !b.done || b.team !== u.team || b === exit || !BLDGS[b.type].tunnel) continue;
    const d = (b.x - u.x) ** 2 + (b.z - u.z) ** 2;
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}

// ---------------- capture / sabotage ----------------
export function captureTick(sim, u, b) { // returns true when the order is finished
  const d = BLDGS[b.type];
  if (++u.capT < d.captureTicks) return false;
  u.capT = 0;
  const first = !b.capXp[u.team];
  b.team = u.team; b.capXp[u.team] = true; b.seen[u.team] = true;
  if (first) addGeneralXp(sim, u.team, d.captureXp);
  sim.events.push({ t: 'capture', id: b.id, team: u.team, x: b.x, z: b.z, type: b.type });
  return true;
}
export function sabotage(sim, u, b) {
  const d = BLDGS[b.type], victim = sim.teams[b.team];
  let text = d.name + ' disabled for 30 s';
  if (d.role === 'supply') { const take = Math.min(1000, victim.money); victim.money -= take; sim.teams[u.team].money += take; sim.teams[u.team].passive += take; text = 'Stole $' + take; }
  else b.disabledUntil = sim.tick + 600;
  if (d.role === 'cc') for (const k in victim.powerReady) victim.powerReady[k] = Math.max(victim.powerReady[k], sim.tick + 1200);
  addGeneralXp(sim, u.team, 100);
  sim.events.push({ t: 'sabotage', id: b.id, team: u.team, victim: b.team, x: b.x, z: b.z, text });
  u.dead = true; u.hp = 0; // the saboteur does not come back
}
