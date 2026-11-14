// A-10 attack pass: two-stage (30 mm burst, then six rockets) along the flight vector.
import { Sim } from '../js/sim/simulationTick.js';
import { makeUnit } from '../js/sim/entities.js';
import { usePower, strikeVisible, fxVisible } from '../js/sim/powers.js';
import { POWERS } from '../js/sim/factionRegistry.js';
import { CELL, PLAYER, ENEMY } from '../js/sim/defs.js';
let fails = 0, checks = 0; const ok = (c, msg) => { checks++; if (!c) { fails++; console.log('  FAIL', msg); } };
const grant = (s, t, ...n) => { for (const k of n) { s.teams[t].promos.add(k); } s.teams[t].powerReady.a10 = 0; };

function pass({ spot = true, targets = [], facing = null, flags = {} }) {
  const sim = new Sim({ ai: false, empty: true, factions: ['vanguard', 'redhammer'] });
  grant(sim, PLAYER, 'v_a10'); Object.assign(sim.teams[0].flags, flags);
  const X = 300, Z = 300;
  if (spot) { const s = makeUnit(sim, 'v_pathfinder', PLAYER, X - 30, Z + 26, 0); s.order = { t: 'hold' }; }
  sim.fog.stamp(PLAYER, X, Z, 60); // explored either way
  const made = targets.map(([type, dx, dz]) => { const u = makeUnit(sim, type, ENEMY, X + dx, Z + dz, facing ?? 0); u.order = { t: 'hold' }; u.cds && (u.cds[0] = u.cds[1] = u.cds[2] = 1e9); return u; });
  for (let i = 0; i < 8; i++) sim.step();
  ok(usePower(sim, PLAYER, 'a10', X, Z), 'power accepted');
  const plane = sim.strikes.find(p => p.kind === 'plane'), d = [plane.dx, plane.dz];
  const log = { strafe: [], fire: [], hit: [], rocketTicks: 0, rocketSeen: new Set(), minAlt: 1e9, altAtGun: 0, order: [], trailPts: 0, hpAt: {} };
  for (let t = 0; t < 160; t++) {
    for (const u of made) if (u.cds) u.cds[0] = u.cds[1] = u.cds[2] = 1e9;
    sim.step();
    for (const p of sim.strikes) { if (p.kind === 'rocket') { log.rocketTicks++; log.rocketSeen.add(p.id); if (strikeVisible(sim, PLAYER, p)) log.trailPts++; } if (p.kind === 'plane') log.minAlt = Math.min(log.minAlt, p.y); }
    for (const e of sim.events) {
      if (e.t === 'strafe') { log.strafe.push(e); if (log.order.at(-1) !== 'gun') log.order.push('gun'); }
      if (e.t === 'rocketfire') { log.fire.push(e); if (log.order.at(-1) !== 'launch') log.order.push('launch'); }
      if (e.t === 'rockethit') { log.hit.push(e); if (log.order.at(-1) !== 'impact') log.order.push('impact'); }
    }
    sim.events.length = 0;
  }
  const along = (e) => (e.x - X) * d[0] + (e.z - Z) * d[1], lat = (e) => Math.abs(-(e.x - X) * d[1] + (e.z - Z) * d[0]);
  return { sim, made, log, along, lat, d };
}

// 1. geometry and reliability of both stages on open ground (nothing to guide on)
{
  const { log, along, lat } = pass({});
  const R = POWERS.a10.rockets;
  ok(log.strafe.length === 14, '14 cannon impacts, got ' + log.strafe.length);
  ok(log.strafe.every(e => lat(e) <= 1.76 && Math.abs(along(e)) <= 24.5), 'cannon impacts stay on the 48 m line');
  ok(log.strafe.every((e, i) => i === 0 || along(e) > along(log.strafe[i - 1])), 'burst walks forward along the flight vector');
  ok(log.fire.length === R.n && log.hit.length === R.n, `6 rockets launched and 6 impacted, got ${log.fire.length}/${log.hit.length}`);
  ok(log.rocketSeen.size === R.n && log.rocketTicks === R.n * (R.flight - 1), 'every rocket is a tracked strike object for its whole flight (smoke-trail source): ' + log.rocketTicks);
  ok(log.trailPts === log.rocketTicks, 'owner sees every rocket trail point');
  ok(log.hit.every(e => lat(e) <= 2.6 && Math.abs(along(e)) <= 20.5), 'rocket impacts within 2.5 m of the flight vector');
  const al = log.hit.map(along).sort((a, b) => a - b);
  ok(al.every((a, i) => Math.abs(a - (-20 + i * 8)) < 0.01), 'rockets evenly spaced every 8 m: ' + al.map(a => a.toFixed(0)).join(','));
  ok(log.order.join('>').startsWith('launch>gun') && log.order.includes('impact'), 'sequence: ' + log.order.join('>'));
  ok(log.minAlt >= 14.9 && log.minAlt <= 16.5, 'dive bottoms out at ~15 m, got ' + log.minAlt.toFixed(1));
  console.log(`open ground    : 14 cannon impacts on the line, 6/6 rockets hit at ${al.map(a => a.toFixed(0)).join(', ')} m along track, sequence ${log.order.join(' > ')}, dive floor ${log.minAlt.toFixed(1)} m`);
}
// 2. medium tanks anywhere on the line are destroyed (front armor facing the jet)
{
  let killed = 0, n = 0; const left = [];
  for (const off of [-20, -14, -8, -4, 0, 4, 9, 16, 20]) {
    const r = pass({ targets: [['r_tank', 0, 0]], facing: 0 });
    // re-run with the tank shifted along the actual flight vector and facing the aircraft
    const s2 = pass({ targets: [['r_tank', r.d[0] * off, r.d[1] * off]], facing: Math.atan2(-r.d[1], -r.d[0]) });
    n++; if (s2.made[0].dead) killed++; else left.push(off + ':' + Math.round(s2.made[0].hp));
  }
  ok(killed === n, `medium tank destroyed at every point on the line: ${killed}/${n} ${left.join(' ')}`);
  console.log(`medium tanks   : Battlemaster (440 HP, front armor to the jet) destroyed at ${killed}/${n} positions along the line`);
}
// 3. heavy armor is crippled, not deleted, from the front; splash reaches neighbours
{
  const r0 = pass({});
  const f = Math.atan2(-r0.d[1], -r0.d[0]);
  const r = pass({ targets: [['r_overlord', 0, 0], ['r_conscript', r0.d[0] * 12 + 3, r0.d[1] * 12], ['r_tank', -r0.d[1] * 6, r0.d[0] * 6]], facing: f });
  const [ov, inf, side] = r.made;
  ok(!ov.dead && ov.hp / ov.maxHp < 0.5 && ov.hp / ov.maxHp > 0.05, 'Overlord crippled (<50%) but alive: ' + (100 * ov.hp / ov.maxHp).toFixed(0) + '%');
  ok(inf.dead || inf.hp < inf.maxHp * 0.5, 'infantry beside the line takes splash');
  ok(side.hp < side.maxHp && !side.dead, 'tank 6 m off the line is splashed but survives: ' + Math.round(side.hp) + '/' + side.maxHp);
  ok(r.log.hit.filter(e => e.guided === ov.id).length >= 2, 'rockets guided onto the visible Overlord');
  console.log(`heavy armor    : Overlord left at ${(100 * ov.hp / ov.maxHp).toFixed(0)}% (${r.log.hit.filter(e => e.guided === ov.id).length} rockets guided onto it); tank 6 m off-line splashed to ${Math.round(side.hp)}/${side.maxHp}`);
}
// 4. Fog of War: no guidance on unseen targets, and the pass grants no vision
{
  const r0 = pass({ spot: false });
  const r = pass({ spot: false, targets: [['r_overlord', r0.d[0] * 0 - r0.d[1] * 5, r0.d[1] * 0 + r0.d[0] * 5]], facing: 0 });
  ok(r.log.hit.every(e => !e.guided), 'no rocket guides onto a target the owner cannot see');
  ok(r.log.hit.every(e => r.lat(e) <= 2.6), 'unguided rockets still fall on the line');
  let lit = 0; for (const p of r.log.hit) if (r.sim.fog.visAt(PLAYER, p.x, p.z)) lit++;
  ok(lit === 0, 'strike lit no fog');
  ok(r.log.hit.every(e => fxVisible(r.sim, PLAYER, e)) && r.log.hit.every(e => !fxVisible(r.sim, ENEMY, e) || r.sim.fog.visAt(ENEMY, e.x, e.z)), 'effect visibility follows fog for the other side');
  console.log('fog            : unseen Overlord 5 m off the line drew 0 guided rockets; pass revealed 0 cells');
}
// 5. wingman doubles both stages; determinism
{
  const r = pass({ flags: { a10x2: true } });
  ok(r.log.strafe.length === 28 && r.log.hit.length === 12, `wingman: 28 cannon / 12 rockets, got ${r.log.strafe.length}/${r.log.hit.length}`);
  const a = pass({ targets: [['r_tank', 3, 2]] }), b = pass({ targets: [['r_tank', 3, 2]] });
  ok(a.sim.hash() === b.sim.hash(), 'deterministic');
  console.log('wingman        : 28 cannon impacts, 12 rockets; repeat run identical');
}
console.log(fails ? `A10: ${fails} FAILURES of ${checks}` : `A10: all ${checks} checks passed`);
