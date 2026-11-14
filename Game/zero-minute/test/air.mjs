// Airfield verification: twin runways, taxi / take-off / landing, loiter and guard, helipad.
import { Sim } from '../js/sim/simulationTick.js';
import { makeUnit, makeBldg, kill } from '../js/sim/entities.js';
import { OPEN_MAP } from '../js/sim/map.js';
import { PLAYER, ENEMY } from '../js/sim/defs.js';
import { UNITS, BLDGS } from '../js/sim/factionRegistry.js';
import { runway, ROTATE, SPOOL, LIFT, TAXI, LOITER, ORBIT } from '../js/sim/air.js';
let fails = 0, checks = 0; const ok = (c, msg) => { checks++; if (!c) { fails++; console.log('  FAIL', msg); } };
const GROUND = new Set(['taxi', 'backtaxi', 'lineup', 'roll', 'final', 'rollout', 'taxiin', 'park']);
const field = (type = 'r_airfield', cx = 40, cz = 60, team = PLAYER) => { const sim = new Sim({ ai: false, empty: true, map: OPEN_MAP }); sim.fog.exp[0].fill(1); sim.fog.exp[1].fill(1); const b = makeBldg(sim, type, team, cx, cz); sim.nav.rebuild(); return { sim, b }; };
const run = (sim, n, each) => { for (let i = 0; i < n; i++) { sim.step(); if (each) each(); sim.events.length = 0; } };
const target = (sim, team, cx, cz, hp = 1e6) => { const t = makeBldg(sim, team === PLAYER ? 'v_barracks' : 'r_barracks', team, cx, cz); t.hp = t.maxHp = hp; makeUnit(sim, 'v_drone', 1 - team, t.x - 18, t.z, 0); sim.nav.rebuild(); return t; }; // with a spotter for the other side

// ---------------------------------------------------------------- A. layout
{
  for (const t of ['v_airfield', 'r_airfield']) {
    const d = BLDGS[t]; ok(d.w === 20 && d.h === 14 && d.pads === 4 && d.trains.some(u => UNITS[u].based) && d.trains.some(u => UNITS[u].heli), `${t}: 40 x 28 m, 4 pads, one fixed-wing and one helicopter type`);
  }
  const { b } = field('v_airfield');
  ok(b.rws.length === 2 && b.rws.every(r => r.x1 - r.x0 === 36) && b.rws[0].z < b.z && b.rws[1].z > b.z, 'two 36 m runways, one each side of the apron');
  ok(b.pads.length === 4 && b.pads.every(p => p.z === b.z && Math.abs(p.x - b.x) < 19) && Math.abs(b.heli.x - b.x) < 19 && b.heli.z === b.z, 'pads and helipad sit between the runways, inside the footprint');
}

// ---------------------------------------------------------------- B. one full sortie on each side of the map
const sortie = (type, fieldType, cx, cz, team) => {
  const { sim, b } = field(fieldType, cx, cz, team);
  const u = makeUnit(sim, type, team, b.x, b.z, 0), d = UNITS[type], tgt = target(sim, 1 - team, cx < 128 ? 150 : 100, cz);
  run(sim, 5); const parkedAt = { x: u.x, z: u.z };
  sim.issue({ t: 'attack', ids: [u.id], target: tgt.id, team });
  const seq = [u.as], L = { liftX: null, liftSpd: 0, offLine: 0, earlyAlt: 0, td: null, finalUp: 0, maxSpdGround: 0, tOrder: sim.tick, tAir: -1, tFix: -1, tDown: -1, tPark: -1, fired: 0, rwOut: -1, rwIn: -1 };
  let prevAlt = 0, R = null;
  for (let t = 0; t < 4000; t++) {
    sim.step();
    for (const e of sim.events) if (e.t === 'touchdown') { L.td = { x: e.x, z: e.z }; L.tDown = sim.tick; }
    sim.events.length = 0;
    if (u.dead) break;
    L.fired = Math.max(L.fired, d.ammo - u.ammo); L.hurt = 1e6 - tgt.hp;
    if (u.as !== seq[seq.length - 1]) { seq.push(u.as); if (u.as === 'final') L.tFix = sim.tick; }
    if (u.rw >= 0) { R = runway(b, u.rw); if (u.as === 'roll') L.rwOut = u.rw; if (u.as === 'final') L.rwIn = u.rw; }
    if (u.as === 'roll') { const r = (u.x - R.ax) * R.dir; L.offLine = Math.max(L.offLine, Math.abs(u.z - R.z)); if (r < R.len * ROTATE - 0.01 && u.altK > 0) L.earlyAlt++; if (u.altK > 0 && L.liftX === null) { L.liftX = r; L.liftSpd = u.spd; L.tAir = sim.tick; } }
    if (GROUND.has(u.as) && u.as !== 'roll' && u.as !== 'final' && u.as !== 'rollout') L.maxSpdGround = Math.max(L.maxSpdGround, u.spd);
    if (u.as === 'final' && u.altK > prevAlt + 1e-9) L.finalUp++;
    prevAlt = u.altK;
    if (u.as === 'parked' && seq.length > 3) { L.tPark = sim.tick; break; }
  }
  run(sim, 140);   // time to re-arm on the pad
  return { u, b, d, seq, L, parkedAt, Rout: L.rwOut >= 0 ? runway(b, L.rwOut) : null, Rin: L.rwIn >= 0 ? runway(b, L.rwIn) : null };
};
for (const [type, fieldType, cx, cz, team, side] of [['v_raptor', 'v_airfield', 40, 60, PLAYER, 'west'], ['r_mig', 'r_airfield', 190, 180, ENEMY, 'east']]) {
  const { u, b, d, seq, L, parkedAt, Rout, Rin } = sortie(type, fieldType, cx, cz, team);
  ok(seq.join() === 'parked,taxi,backtaxi,lineup,roll,out,return,final,rollout,taxiin,park,parked', `${type}: full cycle ${seq.join(' > ')}`);
  ok(Rout && Rout.dir === (side === 'west' ? 1 : -1), `${side} base takes off toward the middle of the map`);
  ok(L.liftX !== null && L.liftX >= Rout.len * ROTATE - 0.01 && L.liftX <= Rout.len && L.earlyAlt === 0, `wheels leave the ground ${L.liftX && L.liftX.toFixed(1)} m down the ${Rout.len} m runway, never before the ${(ROTATE * 100).toFixed(0)}% mark`);
  ok(L.offLine < 0.01 && L.liftSpd > 15, `rolls dead on the centreline and rotates at ${L.liftSpd.toFixed(1)} m/s`);
  ok(L.maxSpdGround <= TAXI + 0.01, `taxi speed never exceeds ${TAXI} m/s (${L.maxSpdGround.toFixed(1)})`);
  ok(L.fired === d.ammo && L.hurt > 0 && u.ammo === d.ammo, `spent its ${L.fired} missile salvos (${Math.round(L.hurt)} damage) and was re-armed on the pad`);
  const tdRun = L.td ? (L.td.x - Rin.ax) * Rin.dir : -1;
  ok(L.td && Math.abs(L.td.z - Rin.z) <= 3.5 && tdRun > Rin.len - 8 && tdRun <= Rin.len, `touches down on its runway: ${L.td && Math.abs(L.td.z - Rin.z).toFixed(2)} m off the centreline, ${(Rin.len - tdRun).toFixed(1)} m past the threshold`);
  ok(L.finalUp === 0, 'height only ever falls on final approach');
  ok(Math.hypot(u.x - parkedAt.x, u.z - parkedAt.z) < 0.01 && u.altK === 0 && u.landed && b.rws.every(r => r.by === 0), 'parks back on its own pad and frees the runway');
  const up = (L.tAir - L.tOrder) / 20, down = (L.tPark - L.tFix) / 20;
  ok(up <= (side === 'west' ? 4 : 7) && down <= 10, `ground handling is quick: ${up.toFixed(1)} s from order to wheels-up, ${down.toFixed(1)} s from approach fix to parked`);
  console.log(`${type.padEnd(9)}: order -> wheels-up ${up.toFixed(1)} s | lift-off at ${L.liftX.toFixed(1)} m / ${L.liftSpd.toFixed(1)} m/s | approach fix -> touchdown ${((L.tDown - L.tFix) / 20).toFixed(1)} s -> parked ${((L.tPark - L.tDown) / 20).toFixed(1)} s | touchdown ${Math.abs(L.td.z - Rin.z).toFixed(2)} m off centreline`);
}

// ---------------------------------------------------------------- C. four jets, two runways
{
  const go = () => {
    const { sim, b } = field(); const jets = [0, 1, 2, 3].map(() => makeUnit(sim, 'r_mig', PLAYER, b.x, b.z, 0));
    const tg = [0, 1, 2].map(i => target(sim, ENEMY, 150 + i * 14, 40 + i * 20)); run(sim, 5);
    let clash = 0, pairTicks = 0, lifts = 0, lands = 0, lost = 0, used = new Set(), twoRoll = 0;
    for (let t = 0; t < 9000; t++) {
      if (t % 900 === 0) sim.issue({ t: 'attack', ids: jets.map(j => j.id), target: tg[(t / 900) % 3].id });
      sim.step(); for (const e of sim.events) if (e.t === 'touchdown') lands++; sim.events.length = 0;
      const on = [0, 0]; for (const j of jets) if (!j.dead && j.rw >= 0 && GROUND.has(j.as)) { on[j.rw]++; used.add(j.rw); }
      if (on[0] > 1 || on[1] > 1) clash++; if (on[0] && on[1]) pairTicks++;
      if (jets.filter(j => j.as === 'roll').length === 2) twoRoll++;
      for (const j of jets) { if (j.as === 'roll' && j.paltK === 0 && j.altK > 0) lifts++; if (j.dead) lost++; }
    }
    return { clash, pairTicks, lifts, lands, lost, used: used.size, twoRoll, pads: new Set(jets.map(j => j.pad)).size, hash: sim.hash() };
  };
  const a = go(), c = go();
  ok(a.clash === 0, `never two aircraft on the same runway (${a.clash} ticks)`);
  ok(a.used === 2 && a.pairTicks > 200 && a.twoRoll > 0, `both runways are used at the same time (${(a.pairTicks / 20).toFixed(0)} s with one aircraft on each, ${a.twoRoll} ticks with two rolling side by side)`);
  ok(a.lifts >= 10 && a.lands >= 10 && a.lost === 0 && a.pads === 4, `${a.lifts} take-offs and ${a.lands} landings in 7.5 min with no losses, each jet on its own pad`);
  ok(a.hash === c.hash, 'runway traffic is deterministic');
  console.log(`twin runways  : ${a.lifts} take-offs, ${a.lands} landings | ${(a.pairTicks / 20).toFixed(0)} s with both runways busy | 0 clashes | identical across two runs`);
}

// ---------------------------------------------------------------- D. loiter (30 s) and guard (until out of missiles)
{
  const station = (u, o) => Math.hypot(u.x - o.x, u.z - o.z);
  // plain move: fly out, hold for 30 s, come home
  { const { sim, b } = field('v_airfield'); const u = makeUnit(sim, 'v_raptor', PLAYER, b.x, b.z, 0), P = { x: b.x + 170, z: b.z + 40 }; run(sim, 5);
    sim.issue({ t: 'move', ids: [u.id], x: P.x, z: P.z }); let tOn = -1, tOff = -1, far = 0;
    run(sim, 3000, () => { const d = station(u, P); if (u.as === 'out' && tOn < 0 && d <= ORBIT + 14) tOn = sim.tick; if (tOn >= 0 && tOff < 0) { if (u.as !== 'out') tOff = sim.tick; else far = Math.max(far, d); } });
    ok(tOn > 0 && Math.abs((tOff - tOn) - LOITER) <= 2, `move order: holds over the point for ${((tOff - tOn) / 20).toFixed(1)} s, then heads home`);
    ok(far < ORBIT + 20 && u.as === 'parked' && u.order === null, `stays within ${far.toFixed(0)} m of the point while holding; lands and stands down`);
    console.log(`loiter        : on station ${((tOff - tOn) / 20).toFixed(1)} s (target 30.0), max ${far.toFixed(0)} m from the point, then landed`); }
  // loitering aircraft engage what turns up
  { const { sim, b } = field('v_airfield'); const u = makeUnit(sim, 'v_raptor', PLAYER, b.x, b.z, 0), P = { x: b.x + 170, z: b.z + 40 }; run(sim, 5);
    sim.issue({ t: 'move', ids: [u.id], x: P.x, z: P.z }); run(sim, 500); const foe = makeUnit(sim, 'r_tank', ENEMY, P.x + 10, P.z, 0); foe.order = { t: 'hold' }; makeUnit(sim, 'v_drone', PLAYER, P.x - 20, P.z, 0);
    run(sim, 500); ok(foe.dead || foe.hp < foe.maxHp, 'a loitering aircraft attacks an enemy that appears under it'); }
  // attack order: target destroyed with missiles left -> hold over the spot for 30 s
  { const { sim, b } = field('v_airfield'); const u = makeUnit(sim, 'v_raptor', PLAYER, b.x, b.z, 0), t = target(sim, ENEMY, 130, 60); run(sim, 5);
    sim.issue({ t: 'attack', ids: [u.id], target: t.id }); let tDead = -1, tOff = -1, ammoAtKill = -1;
    run(sim, 3000, () => { if (u.as === 'out' && !t.dead && tDead < 0) kill(sim, t);   // something else destroys the target while the jet is on its way
      if (t.dead && tDead < 0) { tDead = sim.tick; ammoAtKill = u.ammo; } if (tDead >= 0 && tOff < 0 && u.as !== 'out') tOff = sim.tick; });
    ok(tDead > 0 && ammoAtKill > 0 && tOff - tDead >= LOITER - 60 && tOff - tDead <= LOITER + 120, `attack order: after the kill (missiles left: ${ammoAtKill}) it holds ${((tOff - tDead) / 20).toFixed(1)} s over the spot before going home`); }
  // guard: holds until the missiles are gone, re-arms, and comes back
  { const { sim, b } = field('v_airfield'); const u = makeUnit(sim, 'v_raptor', PLAYER, b.x, b.z, 0), P = { x: b.x + 170, z: b.z + 40 }, d = UNITS.v_raptor; run(sim, 5);
    sim.issue({ t: 'move', ids: [u.id], x: P.x, z: P.z, attack: true, guard: true });
    run(sim, 3000); const held = u.as === 'out' && station(u, P) < ORBIT + 20 && u.ammo === d.ammo;
    ok(held, `guard order: still on station after 150 s with no enemy (plain orders leave after 30 s)`);
    const foe = target(sim, ENEMY, Math.round(P.x / 2) + 4, Math.round(P.z / 2)); makeUnit(sim, 'v_drone', PLAYER, foe.x - 18, foe.z, 0);
    let tEmpty = -1, landed = false, back = -1; run(sim, 4000, () => { if (u.ammo === 0 && tEmpty < 0) tEmpty = sim.tick; if (tEmpty >= 0 && u.as === 'parked') landed = true; if (landed && back < 0 && u.as === 'out' && station(u, P) < ORBIT + 20) back = sim.tick; });
    ok(tEmpty > 0 && landed, 'when an enemy appears it fires until its missiles are gone, then returns to the airfield');
    ok(back > 0 && u.order && u.order.guard, `re-armed, it takes off again and resumes the guard (back on station ${((back - tEmpty) / 20).toFixed(0)} s after running dry)`);
    sim.issue({ t: 'stop', ids: [u.id] }); run(sim, 2500); ok(u.as === 'parked' && !u.order, 'Stop ends the guard: it lands and stays down');
    console.log(`guard         : held 150 s with no enemy | fired dry, landed, re-armed, back on station in ${((back - tEmpty) / 20).toFixed(0)} s | Stop ends it`); }
}

// ---------------------------------------------------------------- E. helicopters lift off from the helipad
for (const [fac, fieldType, heli] of [['vanguard', 'v_airfield', 'v_comanche'], ['redhammer', 'r_airfield', 'r_hind']]) {
  const sim = new Sim({ ai: false, empty: true, map: OPEN_MAP, factions: [fac, 'vanguard'] }); sim.teams[PLAYER].money = 9000;
  const b = makeBldg(sim, fieldType, PLAYER, 40, 60); makeBldg(sim, BLDGS[fieldType].needs, PLAYER, 70, 60); sim.nav.rebuild();
  sim.issue({ t: 'rally', id: b.id, x: b.x + 70, z: b.z + 40 }); sim.issue({ t: 'train', id: b.id, type: heli });
  let u = null, t0 = -1, moved = 0, spool = 0, lift = 0, tUp = -1;
  for (let t = 0; t < 1100; t++) {
    sim.step(); sim.events.length = 0;
    if (!u) { u = sim.ents.find(e => e.type === heli); if (u) { t0 = sim.tick; ok(Math.hypot(u.x - b.heli.x, u.z - b.heli.z) < 0.01 && u.altK === 0 && u.landed && u.as === 'spool', `${heli} appears on the helipad with its wheels down`); } continue; }
    if (u.as === 'spool') { spool++; if (u.altK !== 0) moved++; }
    if (u.as === 'lift') lift++;
    if (u.as) moved += Math.hypot(u.x - b.heli.x, u.z - b.heli.z) > 0.01 ? 1 : 0; else if (tUp < 0) tUp = sim.tick;
  }
  ok(u && spool >= SPOOL - 2 && lift >= LIFT - 2 && moved === 0, `rotors spool for ${(spool / 20).toFixed(1)} s, then it climbs straight up for ${(lift / 20).toFixed(1)} s without drifting`);
  ok(u && u.altK === 1 && !u.landed && Math.hypot(u.x - (b.x + 70), u.z - (b.z + 40)) < 6, 'then flies to the rally point at cruise height');
  console.log(`${heli.padEnd(11)}: helipad -> cruise height in ${((tUp - t0) / 20).toFixed(1)} s, arrived at rally point`);
}

// ---------------------------------------------------------------- F. losing the airfield
{
  const { sim, b } = field(); const b2 = makeBldg(sim, 'r_airfield', PLAYER, 40, 100); sim.nav.rebuild();
  const j = [0, 1].map(() => makeUnit(sim, 'r_mig', PLAYER, b.x, b.z, 0)); const tg = target(sim, ENEMY, 170, 60); run(sim, 5);
  ok(j[0].home === b.id && j[1].home === b.id, 'both jets based at the first field');
  sim.issue({ t: 'attack', ids: [j[0].id], target: tg.id });
  while (j[0].as !== 'out' && sim.tick < 900) run(sim, 1);
  kill(sim, b); for (let i = 0; i < 2500 && j[0].as !== 'parked'; i++) run(sim, 1);
  ok(j[1].dead, 'a jet parked on a destroyed airfield is lost with it');
  ok(!j[0].dead && j[0].home === b2.id && j[0].as === 'parked', 'the airborne jet diverts to the other airfield and lands there');
  console.log('airfield lost : parked jet destroyed, airborne jet diverted and landed at the second field');
}

// ---------------------------------------------------------------- G. the AI builds the bigger airfield and flies from it
{
  let fields = 0, lands = 0, helis = 0;
  for (const f of [['redhammer', 'vanguard'], ['vanguard', 'redhammer']]) {
    const sim = new Sim({ ai: 'both', difficulty: ['hard', 'hard'], factions: f, money: 25000 });
    for (let t = 0; t < 16000 && sim.winner < 0; t++) { sim.step(); for (const e of sim.events) if (e.t === 'touchdown') lands++; sim.events.length = 0; }
    fields += sim.ents.filter(e => e.kind === 'bldg' && BLDGS[e.type].role === 'airfield').length;
    helis += sim.ents.filter(e => e.kind === 'unit' && UNITS[e.type].heli).length;
  }
  ok(fields >= 1, `AI finds room for the 40 x 28 m airfield (${fields} standing at the end of 2 matches)`);
  console.log(`AI            : ${fields} airfields standing, ${lands} runway landings, ${helis} helicopters alive at the end`);
}
console.log(fails ? `AIR: ${fails} FAILURES of ${checks}` : `AIR: all ${checks} checks passed`);
process.exit(fails ? 1 : 0);
