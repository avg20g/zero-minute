// Airfield verification: runway take-off and landing, runway sharing, helipad lift-off.
import { Sim } from '../js/sim/simulationTick.js';
import { makeUnit, makeBldg, kill } from '../js/sim/entities.js';
import { OPEN_MAP } from '../js/sim/map.js';
import { CELL, WORLD, PLAYER, ENEMY, angDiff } from '../js/sim/defs.js';
import { UNITS, BLDGS } from '../js/sim/factionRegistry.js';
import { runway, ROTATE, SPOOL, LIFT } from '../js/sim/air.js';
let fails = 0, checks = 0; const ok = (c, msg) => { checks++; if (!c) { fails++; console.log('  FAIL', msg); } };
const GROUND = new Set(['taxi', 'backtaxi', 'lineup', 'roll', 'final', 'rollout', 'taxiin', 'park']);

// ---------------------------------------------------------------- A. layout
{
  for (const t of ['v_airfield', 'r_airfield']) {
    const d = BLDGS[t]; ok(d.w === 18 && d.h === 10 && d.pads === 4 && d.trains.length === 2 && d.trains.some(u => UNITS[u].based) && d.trains.some(u => UNITS[u].heli), `${t}: 36 x 20 m, 4 pads, one fixed-wing and one helicopter type`);
  }
  const sim = new Sim({ ai: false, empty: true, map: OPEN_MAP }), b = makeBldg(sim, 'v_airfield', PLAYER, 40, 60);
  ok(b.rw.x1 - b.rw.x0 === 32 && b.pads.length === 4 && b.heli && b.pads.every(p => Math.abs(p.x - b.x) < 17 && p.z < b.rw.z - 6) && Math.abs(b.heli.x - b.x) < 17, 'runway 32 m, pads and helipad inside the footprint, apron north of the runway');
}

// ---------------------------------------------------------------- B. one full sortie on each side of the map
const sortie = (type, field, cx, cz, team) => {
  const sim = new Sim({ ai: false, empty: true, map: OPEN_MAP }); sim.fog.exp[0].fill(1); sim.fog.exp[1].fill(1);
  const b = makeBldg(sim, field, team, cx, cz); sim.nav.rebuild();
  const u = makeUnit(sim, type, team, b.x, b.z, 0), R = runway(b), d = UNITS[type];
  const tgt = makeBldg(sim, 'r_barracks', 1 - team, cx < 128 ? 150 : 100, cz); tgt.hp = tgt.maxHp = 1e6; sim.nav.rebuild();
  const spot = makeUnit(sim, 'v_drone', team, tgt.x - 20, tgt.z, 0);   // a spotter: aircraft may only attack what their side can see
  for (let i = 0; i < 5; i++) sim.step();
  const parkedAt = { x: u.x, z: u.z };
  sim.issue({ t: 'attack', ids: [u.id], target: tgt.id, team });
  const seq = [u.as], L = { liftX: null, liftSpd: 0, offLine: 0, earlyAlt: 0, td: null, finalUp: 0, maxSpdGround: 0, tOrder: sim.tick, tAir: -1, tDown: -1, tPark: -1, fired: 0 };
  let prevAlt = 0;
  for (let t = 0; t < 2400; t++) {
    sim.step();
    for (const e of sim.events) { if (e.t === 'touchdown') { L.td = { x: e.x, z: e.z }; L.tDown = sim.tick; } }
    sim.events.length = 0;
    if (u.dead) break;
    L.fired = Math.max(L.fired, d.ammo - u.ammo); L.hurt = 1e6 - tgt.hp;
    if (u.as !== seq[seq.length - 1]) seq.push(u.as);
    const run = (u.x - R.ax) * R.dir;
    if (u.as === 'roll') { L.offLine = Math.max(L.offLine, Math.abs(u.z - R.z)); if (run < R.len * ROTATE - 0.01 && u.altK > 0) L.earlyAlt++; if (u.altK > 0 && L.liftX === null) { L.liftX = run; L.liftSpd = u.spd; L.tAir = sim.tick; } }
    if (GROUND.has(u.as) && u.as !== 'roll' && u.as !== 'final' && u.as !== 'rollout') L.maxSpdGround = Math.max(L.maxSpdGround, u.spd);
    if (u.as === 'final' && u.altK > prevAlt + 1e-9) L.finalUp++;
    prevAlt = u.altK;
    if (u.as === 'parked' && seq.length > 3) { L.tPark = sim.tick; break; }
  }
  for (let i = 0; i < 140; i++) { sim.step(); sim.events.length = 0; }   // time to re-arm on the pad
  return { u, b, R, d, seq, L, parkedAt, sim };
};
for (const [type, field, cx, cz, team, side] of [['v_raptor', 'v_airfield', 40, 60, PLAYER, 'west'], ['r_mig', 'r_airfield', 190, 180, ENEMY, 'east']]) {
  const { u, b, R, d, seq, L, parkedAt, sim } = sortie(type, field, cx, cz, team);
  const want = 'parked,taxi,backtaxi,lineup,roll,out,return,final,rollout,taxiin,park,parked';
  ok(seq.join() === want, `${type}: full cycle ${seq.join(' > ')}`);
  ok(R.dir === (side === 'west' ? 1 : -1), `${side} base takes off toward the middle of the map`);
  ok(L.liftX !== null && L.liftX >= R.len * ROTATE - 0.01 && L.liftX <= R.len && L.earlyAlt === 0, `wheels leave the ground ${L.liftX && L.liftX.toFixed(1)} m down the ${R.len} m runway, never before the ${(ROTATE * 100).toFixed(0)}% mark`);
  ok(L.offLine < 0.01 && L.liftSpd > 15, `rolls dead on the centreline and rotates at ${L.liftSpd.toFixed(1)} m/s`);
  ok(L.maxSpdGround <= 7.01, `taxi speed never exceeds 7 m/s (${L.maxSpdGround.toFixed(1)})`);
  ok(L.fired === d.ammo && L.hurt > 0 && u.ammo === d.ammo, `spent its ${L.fired} missile salvos (${Math.round(L.hurt)} damage) and was re-armed on the pad`);
  const tdRun = L.td ? (L.td.x - R.ax) * R.dir : -1;
  ok(L.td && Math.abs(L.td.z - R.z) <= 3.5 && tdRun > R.len - 8 && tdRun <= R.len, `touches down on the runway: ${L.td && Math.abs(L.td.z - R.z).toFixed(2)} m off the centreline, ${(R.len - tdRun).toFixed(1)} m past the threshold`);
  ok(L.finalUp === 0, 'height only ever falls on final approach');
  ok(Math.hypot(u.x - parkedAt.x, u.z - parkedAt.z) < 0.01 && u.altK === 0 && u.landed && b.rw.by === 0, 'parks back on its own pad and frees the runway');
  console.log(`${type.padEnd(9)}: order -> airborne ${((L.tAir - L.tOrder) / 20).toFixed(1)} s | lift-off at ${L.liftX.toFixed(1)} m / ${L.liftSpd.toFixed(1)} m/s | touchdown ${Math.abs(L.td.z - R.z).toFixed(2)} m off centreline | parked ${((L.tPark - L.tDown) / 20).toFixed(1)} s after touchdown`);
}

// ---------------------------------------------------------------- C. four jets share one runway
{
  const run = () => {
    const sim = new Sim({ ai: false, empty: true, map: OPEN_MAP }); sim.fog.exp[0].fill(1);
    const b = makeBldg(sim, 'r_airfield', PLAYER, 40, 60); sim.nav.rebuild();
    const jets = [0, 1, 2, 3].map(() => makeUnit(sim, 'r_mig', PLAYER, b.x, b.z, 0));
    const tg = [0, 1, 2].map(i => { const b2 = makeBldg(sim, 'v_barracks', ENEMY, 150 + i * 14, 40 + i * 20); b2.hp = b2.maxHp = 1e6; makeUnit(sim, 'v_drone', PLAYER, b2.x - 18, b2.z, 0); return b2; }); sim.nav.rebuild();
    for (let i = 0; i < 5; i++) sim.step();
    let both = 0, lifts = 0, lands = 0, maxOn = 0, lost = 0;
    for (let t = 0; t < 9000; t++) {
      if (t % 700 === 0) sim.issue({ t: 'attack', ids: jets.map(j => j.id), target: tg[(t / 700) % 3].id });
      sim.step(); for (const e of sim.events) if (e.t === 'touchdown') lands++; sim.events.length = 0;
      const on = jets.filter(j => !j.dead && (j.as === 'final' || (GROUND.has(j.as) && Math.abs(j.z - b.rw.z) < 3.2))).length; maxOn = Math.max(maxOn, on); if (on > 1) both++; // counted: on the strip, or committed to land on it
      for (const j of jets) { if (j.as === 'roll' && j.paltK === 0 && j.altK > 0) lifts++; if (j.dead) lost++; }
    }
    return { both, lifts, lands, maxOn, lost, pads: new Set(jets.map(j => j.pad)).size, hash: sim.hash() };
  };
  const a = run(), c = run();
  ok(a.maxOn === 1 && a.both === 0, `never more than one aircraft on the runway (${a.both} ticks with two)`);
  ok(a.lifts >= 12 && a.lands >= 12 && a.lost === 0 && a.pads === 4, `${a.lifts} take-offs and ${a.lands} landings in 7.5 min with no losses, each jet on its own pad`);
  ok(a.hash === c.hash, 'runway traffic is deterministic');
  console.log(`runway sharing: ${a.lifts} take-offs, ${a.lands} landings, max ${a.maxOn} aircraft on the runway at once, identical across two runs`);
}

// ---------------------------------------------------------------- D. helicopters lift off from the helipad
for (const [fac, field, heli] of [['vanguard', 'v_airfield', 'v_comanche'], ['redhammer', 'r_airfield', 'r_hind']]) {
  const sim = new Sim({ ai: false, empty: true, map: OPEN_MAP, factions: [fac, 'vanguard'] }); sim.teams[PLAYER].money = 9000;
  const b = makeBldg(sim, field, PLAYER, 40, 60); makeBldg(sim, BLDGS[field].needs, PLAYER, 70, 60); sim.nav.rebuild();
  sim.issue({ t: 'rally', id: b.id, x: b.x + 70, z: b.z + 40 }); sim.issue({ t: 'train', id: b.id, type: heli });
  let u = null, t0 = -1, moved = 0, spool = 0, lift = 0, tUp = -1;
  for (let t = 0; t < 900; t++) {
    sim.step(); sim.events.length = 0;
    if (!u) { u = sim.ents.find(e => e.type === heli); if (u) { t0 = sim.tick; ok(Math.hypot(u.x - b.heli.x, u.z - b.heli.z) < 0.01 && u.altK === 0 && u.landed && u.as === 'spool', `${heli} appears on the helipad with its wheels down`); } continue; }
    if (u.as === 'spool') { spool++; if (u.altK !== 0) moved++; }
    if (u.as === 'lift') lift++;
    if (u.as) moved += Math.hypot(u.x - b.heli.x, u.z - b.heli.z) > 0.01 ? 1 : 0;
    else if (tUp < 0) tUp = sim.tick;
  }
  ok(u && spool >= SPOOL - 2 && lift >= LIFT - 2 && moved === 0, `rotors spool for ${(spool / 20).toFixed(1)} s, then it climbs straight up for ${(lift / 20).toFixed(1)} s without drifting`);
  ok(u && u.altK === 1 && !u.landed && Math.hypot(u.x - (b.x + 70), u.z - (b.z + 40)) < 6, 'then flies to the rally point at cruise height');
  console.log(`${heli.padEnd(11)}: helipad -> cruise height in ${((tUp - t0) / 20).toFixed(1)} s, arrived at rally point`);
}

// ---------------------------------------------------------------- E. losing the airfield
{
  const sim = new Sim({ ai: false, empty: true, map: OPEN_MAP }); sim.fog.exp[0].fill(1);
  const b = makeBldg(sim, 'r_airfield', PLAYER, 40, 60), b2 = makeBldg(sim, 'r_airfield', PLAYER, 40, 100); sim.nav.rebuild();
  const j = [0, 1].map(() => makeUnit(sim, 'r_mig', PLAYER, b.x, b.z, 0)); const tg = makeBldg(sim, 'v_barracks', ENEMY, 170, 60); tg.hp = tg.maxHp = 1e6; makeUnit(sim, 'v_drone', PLAYER, tg.x - 18, tg.z, 0); sim.nav.rebuild();
  for (let i = 0; i < 5; i++) sim.step();
  ok(j[0].home === b.id && j[1].home === b.id, 'both jets based at the first field');
  sim.issue({ t: 'attack', ids: [j[0].id], target: tg.id });
  while (j[0].as !== 'out' && sim.tick < 600) { sim.step(); sim.events.length = 0; }
  kill(sim, b); for (let i = 0; i < 1500 && j[0].as !== 'parked'; i++) { sim.step(); sim.events.length = 0; }
  ok(j[1].dead, 'a jet parked on a destroyed airfield is lost with it');
  ok(!j[0].dead && j[0].home === b2.id && j[0].as === 'parked', 'the airborne jet diverts to the other airfield and lands there');
  console.log('airfield lost : parked jet destroyed, airborne jet diverted and landed at the second field');
}

// ---------------------------------------------------------------- F. the AI builds the big airfield and flies from it
{
  let fields = 0, lands = 0, helis = 0;
  for (const f of [['redhammer', 'vanguard'], ['vanguard', 'redhammer']]) {
    const sim = new Sim({ ai: 'both', difficulty: ['hard', 'hard'], factions: f, money: 25000 });
    for (let t = 0; t < 16000 && sim.winner < 0; t++) { sim.step(); for (const e of sim.events) if (e.t === 'touchdown') lands++; sim.events.length = 0; }
    fields += sim.ents.filter(e => e.kind === 'bldg' && BLDGS[e.type].role === 'airfield').length;
    helis += sim.teams[0].built + sim.teams[1].built > 0 ? sim.ents.filter(e => e.kind === 'unit' && UNITS[e.type].heli).length : 0;
  }
  ok(fields >= 1, `AI finds room for the 36 x 20 m airfield (${fields} standing at the end of 2 matches)`);
  console.log(`AI            : ${fields} airfields standing, ${lands} runway landings, ${helis} helicopters alive at the end`);
}
console.log(fails ? `AIR: ${fails} FAILURES of ${checks}` : `AIR: all ${checks} checks passed`);
process.exit(fails ? 1 : 0);
