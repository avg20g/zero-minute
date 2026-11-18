// Combat: weapon slots, target acquisition (fog- and stealth-gated), aiming,
// firing, projectiles, point-defense interception. All content comes from the
// faction registry; nothing here knows about specific units.
import { DT, NEUTRAL, GARRISON_RANGE_BONUS, angDiff } from './defs.js';
import { UNITS, BLDGS, WEAPONS, VET, HORDE, armorOf, generalOf } from './factionRegistry.js';
import { applyDamage, splashDamage, splashAll, moveTo, stopUnit, isMoving, kill, rectDist, makeUnit } from './entities.js';
import { addHazard } from './abilities.js';
import { heroHack, phantomCall } from './heroes.js';

const NONE = [];
let _sim = null; // the simulation being stepped (slotsOf needs the team's upgrades)
export function slotsOf(e) {
  if (e.wslots) return e.wslots;
  let out = NONE;
  if (e.kind === 'bldg') { const w = BLDGS[e.type].weapon; if (w) out = [w]; }
  else {
    const d = UNITS[e.type]; out = [];
    if (d.weapon) out.push(d.salvageWeapons ? d.salvageWeapons[e.tier] : d.weapon);
    if (d.weapon2) out.push(d.weapon2);
    if (d.weapon3) out.push(d.weapon3);
    if (d.up && d.up.weapon && e.team < 2 && _sim.teams[e.team].upgrades.has(d.up.id)) out = out.map(w => d.up.weapon[w] || w);   // an upgrade swaps a weapon for a better one (Apache Longbow)
    if (d.upWeapon && e.team < 2) for (const up in d.upWeapon) if (_sim.teams[e.team].upgrades.has(up)) out.push(d.upWeapon[up]); // weapon unlocked by an upgrade (LAV-25 TOW)
    if (e.addon && d.hardpoints[e.addon].weapon) out.push(d.hardpoints[e.addon].weapon);
  }
  return (e.wslots = out);
}
// Force attack aims at a spot on the ground: a stand-in target with no owner. Any weapon that can hurt something on the ground may fire at it.
export const groundTarget = (x, z) => ({ id: 0, ground: true, kind: 'ground', x, z, radius: 0, dead: false, air: false, landed: false, team: -1 });
const groundOK = (w) => !w.garrisonOnly && ((w.vs.inf || 0) + (w.vs.light || 0) + (w.vs.heavy || 0) + (w.vs.tank || 0) + (w.vs.bldg || 0)) > 0;
const GROUND_HIT = 1.8;   // metres: a direct-fire weapon aimed at the ground hurts whatever stands this close to the spot
const canUse = (w, t) => t.ground ? groundOK(w) : (w.garrisonOnly ? t.kind === 'bldg' && t.garrison.length > 0 :
  (w.vs[armorOf(t)] || 0) > 0 && !(t.kind === 'unit' && UNITS[t.type].based && (w.noBased || (w.noJets && !t.landed))));   // noJets: not a strike aircraft in flight. noBased: not one at all
// Can this unit be given a force-attack order at all?
export function canForce(sim, u) { _sim = sim; for (const n of slotsOf(u)) if (groundOK(WEAPONS[n])) return true; return false; }
// Which slot leads against t. A garrison-clearing weapon is used on its own so
// the building shell is not shot up alongside it. Returns -1 if nothing can hit t.
function leadSlot(slots, t) {
  let best = -1, bv = 0;
  for (let i = 0; i < slots.length; i++) {
    const w = WEAPONS[slots[i]]; if (!canUse(w, t)) continue;
    if (w.garrisonOnly) return i + 100;
    const v = t.ground ? 1 : w.vs[armorOf(t)]; if (v > bv) { bv = v; best = i; }
  }
  return best;
}

// Can shooter s damage t with any of its weapons?
export function canAttack(s, t) { return leadSlot(slotsOf(s), t) >= 0; }

export function targetable(sim, team, t) {
  if (sim.tick < sim.treatyUntil) return false; // peace treaty
  return !!t && !t.dead && !t.ruined && !t.inert && t.team !== team && t.team !== NEUTRAL && !(t.kind === 'unit' && t.inB) &&
    !(t.kind === 'bldg' && BLDGS[t.type].indestructible) && sim.fog.canSee(team, t);
}
const edgeDist = (x, z, t) => Math.hypot(t.x - x, t.z - z) - t.radius;

function acquire(sim, team, x, z, range, slots) {
  let best = null, bs = 1e9;
  for (const t of sim.ents) {
    if (t.team === team || t.team === NEUTRAL || t.dead) continue;
    const d = edgeDist(x, z, t);
    if (d > range || !targetable(sim, team, t)) continue;
    let m = 0;
    for (let i = 0; i < slots.length; i++) { const w = WEAPONS[slots[i]]; if (canUse(w, t)) m = Math.max(m, w.garrisonOnly ? 1 : w.vs[armorOf(t)]); }
    if (!m) continue;
    const threat = (t.kind === 'unit' ? !!UNITS[t.type].weapon : !!BLDGS[t.type].weapon) ? 1 : 0.6;
    const s = (d + 6) / (m * threat);
    if (s < bs) { bs = s; best = t; }
  }
  return best;
}

function rateOf(sim, s) { // fire-rate multiplier: veterancy + horde
  let r = 1 + VET.rate * (s.vet || 0);
  if (s.horde) r += sim.teams[s.team].flags.hordePlus ? HORDE.bonusPromo : HORDE.bonus;
  return r;
}
function dmgOf(sim, s, w) {
  let m = 1;
  if (s.kind === 'unit') {
    const d = UNITS[s.type];
    if (d.salvage && !d.salvageWeapons) m *= 1 + 0.25 * s.tier;
    if (d.nuke && sim.teams[s.team].upgrades.has('r_nuke')) m *= 1.25;
  }
  if (w.kind === 'laser' && s.team < 2) { const G = generalOf(sim.teams[s.team]); if (G && G.laser) m *= G.laser; }   // Laser General
  return w.dmg * m;
}

// Weapon mounts (ships): where a slot's weapon sits and which way it can point. See `mounts` in the registry.
const mountOf = (s, i) => (s.kind === 'unit' && UNITS[s.type].mounts && UNITS[s.type].mounts[i]) || null;
const mountPos = (s, m) => [s.x + Math.cos(s.facing) * m.x, s.z + Math.sin(s.facing) * m.x];
// Bearing of the direction `a` off the mount's own axis (0 = straight along it).
const offAxis = (s, m, a) => angDiff(a, s.facing + (m.dir || 0));
const bears = (s, m, a) => Math.abs(offAxis(s, m, a)) <= m.arc + 0.02;

function fire(sim, s, i, wname, ox, oz, t) {
  const w = WEAPONS[wname], M = mountOf(s, i), my = M ? M.y : undefined;   // my: height of the mount, for the effects
  s.cds[i] = Math.max(1, Math.round(w.cd / rateOf(sim, s)));
  s.lastFire = sim.tick;
  if (s.kind === 'unit') { s.revealUntil = sim.tick + 40; if (UNITS[s.type].ammo && !w.free) s.ammo--; if (w.rounds) { if (!s.rounds) s.rounds = [-1, -1, -1]; if (s.rounds[i] < 0) s.rounds[i] = w.rounds; s.rounds[i]--; } }   // `rounds`: a weapon with its own small magazine for the sortie   // a `free` weapon (an aircraft's gun) does not use up the sortie's ammunition
  const dmg = dmgOf(sim, s, w), a = Math.atan2(t.z - oz, t.x - ox), vet = s.vet || 0;
  const ff = s.kind === 'unit' && !!s.order && s.order.t === 'fattack';   // force attack: the shot hurts whatever it lands on, friend or foe
  if (w.kind === 'hack') { const cd = heroHack(sim, s, wname, t); if (cd) s.cds[i] = cd; return; }   // Fook Mie's phone
  if (w.kind === 'call') { phantomCall(sim, s, t); return; }                                          // The Phantom's call
  if (w.kind === 'carpet') { // a bomber's single pass: the stick of bombs falls along its heading, centred on the target
    sim.strikes.push({ id: sim.nextId++, kind: 'carpet', team: s.team, x: t.x, z: t.z, px: t.x, pz: t.z, dx: Math.cos(s.facing), dz: Math.sin(s.facing), t: 8, dead: false });
    sim.events.push({ t: 'bombsaway', x: s.x, z: s.z, team: s.team, sid: s.id });
    return;
  }
  if (w.kind === 'launch') { // a one-way drone leaves the launcher: its own unit, already on its way to this target (or this spot)
    const D = UNITS[w.unit], back = s.facing + Math.PI, dr = makeUnit(sim, w.unit, s.team, s.x + Math.cos(back) * 3.5, s.z + Math.sin(back) * 3.5, Math.atan2(t.z - s.z, t.x - s.x));
    dr.temp = true; dr.expires = sim.tick + 1200; dr.altK = dr.paltK = 0.25;
    dr.order = t.ground ? { t: 'fattack', id: 0, x: t.x, z: t.z, g: groundTarget(t.x, t.z) } : { t: 'fattack', id: t.id, x: t.x, z: t.z, g: null };
    sim.events.push({ t: 'launch', x: dr.x, z: dr.z, a: dr.facing, team: s.team, sid: s.id, w: wname });
    return;
  }
  if (w.kind === 'melee') { // a thrust at arm's length: no projectile, nothing to shoot down
    sim.events.push({ t: 'melee', w: wname, x: ox, z: oz, tx: t.x, tz: t.z, sid: s.id, tid: t.id, onBldg: t.kind === 'bldg' });
    if (t.ground) splashAll(sim, t.x, t.z, GROUND_HIT, dmg, wname, s, ox, oz); else applyDamage(sim, t, dmg, wname, ox, oz, s);
    return;
  }
  if (w.kind === 'hitscan' || w.kind === 'laser' || w.kind === 'spray') {
    sim.events.push({ t: w.kind === 'hitscan' ? 'tracer' : w.kind, w: wname, x: ox, z: oz, y: my, tx: t.x, tz: t.z, sid: s.id, tid: t.id, vet, sAir: !!s.air && !s.landed, tAir: !!t.air && !t.landed });
    if (t.ground) splashAll(sim, t.x, t.z, GROUND_HIT, dmg, wname, s, ox, oz); else applyDamage(sim, t, dmg, wname, ox, oz, s);
  } else {
    sim.projs.push({ id: sim.nextId++, kind: w.kind, w: wname, x: ox, z: oz, px: ox, pz: oz, sx: ox, sz: oz, tid: t.id, tx: t.x, tz: t.z,
      speed: w.speed, dmg, team: s.team, srcId: s.id, vet, dead: false, a, ff, sy0: s.air && !s.landed ? UNITS[s.type].alt * (s.altK ?? 1) : my, homing: w.kind !== 'lob', sAir: !!s.air && !s.landed, tAir: !!t.air && !t.landed, thermo: s.kind === 'unit' && !!UNITS[s.type].thermo });
    sim.events.push({ t: 'fire', k: w.kind, w: wname, x: ox, z: oz, y: my, len: M ? M.len : undefined, a, sid: s.id, vet });
  }
}

// Fire every slot that is ready, in range and able to hit t.
function fireSlots(sim, s, slots, ox, oz, t, dist, lead, bonus) {
  const excl = lead >= 100 ? lead - 100 : -1, usesAmmo = s.kind === 'unit' && UNITS[s.type].ammo;
  for (let i = 0; i < slots.length; i++) {
    if (excl >= 0 && i !== excl) continue;
    const w = WEAPONS[slots[i]];
    if (!canUse(w, t) || dist > w.range + bonus || (w.minRange && dist < w.minRange)) continue;
    if (usesAmmo && s.ammo <= 0 && !w.free) continue;
    if (w.rounds && s.rounds && s.rounds[i] === 0) continue;   // this weapon's own ammunition for the sortie is spent (A-10 cannon)
    const M = mountOf(s, i); let mx = ox, mz = oz;
    if (M) { if (!bears(s, M, Math.atan2(t.z - s.z, t.x - s.x))) { s.bursts[i] = 0; continue; } [mx, mz] = mountPos(s, M); }   // the ship's own structure is in the way: this weapon waits
    if (s.bursts[i] > 0) {
      if (--s.burstCd[i] <= 0) { s.bursts[i]--; s.burstCd[i] = w.burstGap; const keep = s.cds[i]; fire(sim, s, i, slots[i], mx, mz, t); s.cds[i] = keep; }
      continue;
    }
    if (s.cds[i] > 0) continue;
    if (w.windup && s.kind === 'unit') { if (isMoving(s)) { s.windup = 0; continue; } if (++s.windup < w.windup) continue; s.windup = 0; }   // erect the launcher first (Scud)
    fire(sim, s, i, slots[i], mx, mz, t);
    if (w.burst) { s.bursts[i] = w.burst - 1; s.burstCd[i] = w.burstGap; }
  }
}
function turn(s, field, a, rate) {
  const diff = angDiff(a, s[field]), ma = rate * DT;
  s[field] += Math.max(-ma, Math.min(ma, diff));
  return Math.abs(diff);
}

function unitCombat(sim, u, d, slots) {
  const o = u.order;
  let t = null, maxR = 0;
  for (let i = 0; i < slots.length; i++) { const w = WEAPONS[slots[i]]; if (!w.garrisonOnly) maxR = Math.max(maxR, w.range); }
  const forced = o && (o.t === 'attack' || o.t === 'fattack');
  if (o && o.t === 'fattack') { // force attack: a spot on the ground, or any unit or building whoever owns it
    t = o.id ? sim.byId.get(o.id) : o.g;
    const gone = !t || t.dead || t.ruined || (t.kind === 'unit' && t.inB) || sim.tick < sim.treatyUntil;
    if (gone || leadSlot(slots, t) < 0 || (d.ammo && u.ammo <= 0 && !d.based)) { u.order = null; u.target = 0; stopUnit(u); u.guardX = u.x; u.guardZ = u.z; return; }
    u.target = 0;
  } else if (forced) {
    t = sim.byId.get(o.id);
    if (!targetable(sim, u.team, t) || leadSlot(slots, t) < 0) { u.order = null; u.target = 0; stopUnit(u); u.guardX = u.x; u.guardZ = u.z; return; }
    u.target = t.id;
  } else {
    const canAuto = !o || o.t === 'amove' || (o.t === 'move' && d.fireMoving && !d.suicide);   // a suicide unit told to move just moves
    const acqR = (!o || o.t === 'amove') ? Math.max(maxR, d.sight) : maxR;
    if (d.berserk && !o) { u.guardX = u.x; u.guardZ = u.z; }   // no post to go back to: he fights where he stands and goes after whatever he sees
    t = u.target ? sim.byId.get(u.target) : null;
    if (t && (!canAuto || !targetable(sim, u.team, t) || edgeDist(u.x, u.z, t) > acqR + 4 || leadSlot(slots, t) < 0)) { t = null; u.target = 0; }
    if (!t && canAuto && (sim.tick + u.id) % 5 === 0) { t = acquire(sim, u.team, u.x, u.z, acqR, slots); u.target = t ? t.id : 0; }
  }
  if (!t) {
    u.bursts[0] = u.bursts[1] = u.bursts[2] = 0; u.windup = 0;
    if (d.suicide) standDown(u, d);
    if (d.turret) turn(u, 'turret', u.facing, d.turret);
    // return to post after a chase
    if (!o && !d.based && !isMoving(u) && Math.hypot(u.x - u.guardX, u.z - u.guardZ) > 6) moveTo(sim, u, u.guardX, u.guardZ);
    return;
  }
  const lead = leadSlot(slots, t), W = WEAPONS[slots[lead >= 100 ? lead - 100 : lead]];
  const dist = W.kind === 'melee' && t.kind === 'bldg' ? rectDist(t, u.x, u.z) : edgeDist(u.x, u.z, t), a = Math.atan2(t.z - u.z, t.x - u.x);   // a spear has to reach the wall itself
  if (d.suicide && (suicideRun(sim, u, d, t, dist, W) || u.dive)) return;   // gone, or committed to its dive
  if (dist <= W.range) {
    const holdGround = forced || !o || o.t === 'amove';
    if (holdGround && !d.based && isMoving(u) && dist <= W.range * 0.92) stopUnit(u);
    let aimed;
    const LM = mountOf(u, lead >= 100 ? lead - 100 : lead);
    if (d.based && d.mounts) aimed = true;   // a gunship's side-firing guns: each fires only while the target is inside its own arc (see fireSlots)
    else if (LM && !d.turret) { aimed = !u.path && turn(u, 'facing', a - (LM.dir || 0), d.turn) < 0.12; u.turret = u.facing; }   // a fixed launcher (Shahed truck): the whole vehicle turns until its mount points at the target
    else if (LM && LM.arc < Math.PI) { // a deck gun with a blind arc: the turret trains as far as it can; a ship that is not under way turns the rest
      const off = offAxis(u, LM, a), lim = Math.max(-LM.arc, Math.min(LM.arc, off));
      aimed = turn(u, 'turret', u.facing + (LM.dir || 0) + lim, d.turret) < 0.2;
      if (Math.abs(off) > LM.arc && !u.path && !u.pathReq) turn(u, 'facing', u.facing + Math.sign(off) * (Math.abs(off) - LM.arc * 0.9), d.turn);
    }
    else if (d.turret) aimed = turn(u, 'turret', a, d.turret) < 0.2;
    else if (d.based) aimed = Math.abs(angDiff(a, u.facing)) < 0.35; // strike aircraft aim by flying at the target
    else if (!u.path) { aimed = turn(u, 'facing', a, d.turn) < 0.2; u.turret = u.facing; }
    else aimed = false;
    if (aimed) fireSlots(sim, u, slots, u.x, u.z, t, dist, lead, 0);
  } else {
    if (d.turret) turn(u, 'turret', a, d.turret);
    if (o && o.t === 'move') return;
    // chase; idle units are leashed to their guard position
    if (!o && Math.hypot(u.x - u.guardX, u.z - u.guardZ) > 26) { u.target = 0; return; }
    if (d.based) return; // flight logic steers strike aircraft
    if (!u.pathReq && (!isMoving(u) || (sim.tick + u.id) % 12 === 0)) moveTo(sim, u, t.x, t.z);
  }
}

// Suicide units. A Suicide Bomber sprints the last stretch and blows up on contact. An FPV drone that gets inside
// its weapon range tips over and dives onto the target (or climbs to a helicopter), then blows up. Either way the
// blast kills the unit itself. Returns true when the unit is gone.
function standDown(u, d) { if (u.charging || u.dive) { u.charging = false; u.dive = 0; u.hoverLow = false; u.ms = d.speed; } }
function suicideRun(sim, u, d, t, dist, W) {
  const S = d.suicide, tAir = !!t.air && !t.landed;
  if (S.charge && !u.charging && dist <= S.charge.r) { u.charging = true; u.ms = d.speed * S.charge.mult; sim.events.push({ t: 'charge', id: u.id, x: u.x, z: u.z, team: u.team }); }
  let boom = false;
  if (S.dive) {
    if (!u.dive && dist > W.range) return false;
    const want = tAir ? UNITS[t.type].alt * t.altK / d.alt : 0.15;                     // the height to hit at, as a fraction of the drone's own cruise height
    if (!u.dive) { u.ms = d.speed * 1.5; sim.events.push({ t: 'dive', id: u.id, x: u.x, z: u.z, team: u.team }); }
    u.dive++; u.hoverLow = true; u.goal = { x: t.x, z: t.z };
    u.altK += Math.max(-0.085, Math.min(0.085, want - u.altK));
    boom = (dist <= 1.6 && Math.abs(want - u.altK) < 0.12) || u.dive > 60;
  } else {
    boom = dist <= W.range;
    // A boat cannot ram something ashore. It closes in as far as the water lets it; once it has stopped gaining it
    // goes off if the target is inside the blast, and otherwise drops the target (returns true: nothing more to do).
    if (!boom && d.ship && !(t.kind === 'unit' && UNITS[t.type].ship) && !(t.ground && sim.nav.isWater(sim.nav.cellOf(t.x, t.z)))) {
      const key = t.id || -1;
      if (u.ramId !== key) { u.ramId = key; u.ramBest = 1e9; u.ramT = 0; u.ramSkip = false; }
      if (u.ramSkip) return true;
      if (dist < u.ramBest - 0.4) { u.ramBest = dist; u.ramT = 0; }
      else if (++u.ramT > 40) {
        if (dist <= S.r * 0.85) boom = true;
        else { u.ramSkip = true; standDown(u, d); stopUnit(u); if (u.order && (u.order.t === 'attack' || u.order.t === 'fattack')) { u.order = null; u.guardX = u.x; u.guardZ = u.z; } u.target = 0; return true; }
      }
    }
  }
  if (!boom) return false;
  const y = u.air ? d.alt * u.altK : 0;
  if (u.order && u.order.t === 'fattack') splashAll(sim, u.x, u.z, S.r, S.dmg, S.w || 'fab', u);       // force attack: the blast hurts whatever is there, friend or foe
  else splashDamage(sim, u.x, u.z, S.r, S.dmg, S.w || 'fab', { team: u.team }, u.x, u.z, S.dive ? (tAir ? 'air' : 'ground') : null);
  sim.events.push({ t: 'suicide', x: u.x, z: u.z, y, r: S.r, team: u.team, air: !!u.air });
  kill(sim, u);
  return true;
}

// Occupants fire from the wall (or hull) of their container, with a range bonus.
function garrisonCombat(sim, e, d, slots) {
  const b = sim.byId.get(e.inB); if (!b || (b.kind === 'unit' && UNITS[b.type].transport)) return;   // passengers in a transport do not fight
  const w0 = WEAPONS[slots[0]], range = w0.range + GARRISON_RANGE_BONUS + b.radius;
  let t = e.target ? sim.byId.get(e.target) : null;
  if (t && (!targetable(sim, e.team, t) || edgeDist(b.x, b.z, t) > range || !canUse(w0, t))) { t = null; e.target = 0; }
  if (!t && (sim.tick + e.id) % 5 === 0) { t = acquire(sim, e.team, b.x, b.z, range, slots.slice(0, 1)); e.target = t ? t.id : 0; }
  if (t && e.cds[0] <= 0) {
    const a = Math.atan2(t.z - b.z, t.x - b.x);
    fire(sim, e, 0, slots[0], b.x + Math.cos(a) * b.radius, b.z + Math.sin(a) * b.radius, t);
  }
}

function tryIntercept(sim, p, t) {
  for (const u of sim.pdlUnits) {
    if (u.team === p.team || u.dead || u.inB || u.pdlCd > 0) continue;
    const D = UNITS[u.type], reach = D.pdlR || 13;              // a ship's defenses reach further than a tank's
    if (Math.hypot(u.x - p.x, u.z - p.z) > reach) continue;
    if (t && Math.hypot(u.x - t.x, u.z - t.z) > reach + 3) continue; // only covers itself and close neighbours
    const base = D.pdl || 70;
    u.pdlCd = Math.round(base * (sim.teams[u.team].flags.fastPdl ? 0.6 : 1));
    const PM = D.mounts && D.mounts[D.pdlAt], [px, pz] = PM ? mountPos(u, PM) : [u.x, u.z];
    sim.events.push({ t: 'pdl', x: px, z: pz, y: PM ? PM.y : undefined, tx: p.x, tz: p.z, sid: u.id, tAir: p.tAir, gun: !!D.pdlGun });
    return true;
  }
  return false;
}

function stepProjectiles(sim) {
  for (const p of sim.projs) {
    p.px = p.x; p.pz = p.z;
    const W = WEAPONS[p.w];
    let t = sim.byId.get(p.tid);
    const valid = !!t && !t.dead && !t.ruined && !(t.kind === 'unit' && t.inB);
    if (!valid) t = null;
    if (p.homing && t) { p.tx = t.x; p.tz = t.z; }
    if (W.intercept && sim.pdlUnits.length && tryIntercept(sim, p, t)) { p.dead = true; continue; }
    const dx = p.tx - p.x, dz = p.tz - p.z, d = Math.hypot(dx, dz), step = p.speed * DT;
    if (d > step) { p.x += dx / d * step; p.z += dz / d * step; p.a = Math.atan2(dz, dx); continue; }
    p.x = p.tx; p.z = p.tz; p.dead = true;
    const src = sim.byId.get(p.srcId) || { team: p.team };
    let hit = false;
    // An agile helicopter may slip a rocket, missile or shell aimed at it (never a bullet or a beam: those are not projectiles).
    if (t && t.kind === 'unit' && UNITS[t.type].dodge && !t.landed && sim.rand() < UNITS[t.type].dodge) { sim.events.push({ t: 'dodge', x: t.x, z: t.z, id: t.id, team: t.team }); sim.events.push({ t: 'impact', k: p.kind, w: p.w, x: p.x + Math.cos(p.a || 0) * 6, z: p.z + Math.sin(p.a || 0) * 6, hit: false, onBldg: false, air: true, splash: 0 }); continue; }
    if (W.splash) { (p.ff ? splashAll : splashDamage)(sim, p.x, p.z, W.splash, p.dmg, p.w, src, p.sx, p.sz); hit = true; }
    else if (p.ff && !p.tid) { splashAll(sim, p.x, p.z, GROUND_HIT, p.dmg, p.w, src, p.sx, p.sz); hit = true; }
    else if (t && Math.hypot(t.x - p.x, t.z - p.z) <= t.radius + 2) { applyDamage(sim, t, p.dmg, p.w, p.sx, p.sz, src); hit = true; }
    if (W.hazard) {
      const big = p.thermo && sim.teams[p.team].upgrades.has('r_thermo');
      addHazard(sim, W.hazard.kind, p.x, p.z, W.hazard.r * (big ? 1.4 : 1), W.hazard.secs * (big ? 1.5 : 1), W.hazard.dps, p.team, !!W.clearsGarrison);
    }
    sim.events.push({ t: 'impact', k: p.kind, w: p.w, x: p.x, z: p.z, hit, onBldg: !!t && t.kind === 'bldg', air: !!t && !!t.air && !t.landed, splash: W.splash || 0 });
  }
  if (sim.projs.length) sim.projs = sim.projs.filter(p => !p.dead);
}

export function stepCombat(sim) {
  _sim = sim;
  const pdl = sim.pdlUnits; pdl.length = 0;
  for (const e of sim.ents) {
    if (e.dead) continue;
    const slots = slotsOf(e);
    if (e.kind === 'unit') {
      const d = UNITS[e.type];
      if (d.pdl || (d.pdlUpgrade && e.team < 2 && sim.teams[e.team].upgrades.has(d.pdlUpgrade))) { if (e.pdlCd > 0) e.pdlCd--; pdl.push(e); }
      if (!slots.length) continue;
      for (let i = 0; i < slots.length; i++) if (e.cds[i] > 0) e.cds[i]--;
      if (e.inert || e.landed && e.as !== 'out') continue;
      if (e.inB) garrisonCombat(sim, e, d, slots); else unitCombat(sim, e, d, slots);
    } else if (slots.length && e.done && e.team < 2) {   // (an armed site nobody holds does nothing)
      const d = BLDGS[e.type], w = WEAPONS[slots[0]];
      e.pturret = e.turret;
      if (e.cds[0] > 0) e.cds[0]--;
      if (e.offline || (d.power < 0 && sim.teams[e.team].low)) { e.target = 0; continue; } // no power, no radar
      let t = e.target ? sim.byId.get(e.target) : null;
      if (t && (!targetable(sim, e.team, t) || edgeDist(e.x, e.z, t) > w.range || !canUse(w, t))) { t = null; e.target = 0; }
      if (!t && (sim.tick + e.id) % 5 === 0) { t = acquire(sim, e.team, e.x, e.z, w.range, slots); e.target = t ? t.id : 0; }
      if (t) { const a = Math.atan2(t.z - e.z, t.x - e.x); if (turn(e, 'turret', a, d.turret) < 0.2) fireSlots(sim, e, slots, e.x, e.z, t, edgeDist(e.x, e.z, t), 0, 0); }
    }
  }
  stepProjectiles(sim);
}
