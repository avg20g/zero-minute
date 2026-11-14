// Phase 4 simulation checks: lobby options, elimination rule, peace treaty, reverse-move,
// scatter, match statistics for the After-Action Report, and deterministic replays.
import { Sim } from '../js/sim/simulationTick.js';
import { makeUnit, makeBldg, kill } from '../js/sim/entities.js';
import { CELL, PLAYER, ENEMY, ZONE_MULT, angDiff } from '../js/sim/defs.js';
import { UNITS, BLDGS } from '../js/sim/factionRegistry.js';
import { powerError } from '../js/sim/powers.js';
import { ReplayRecorder, ReplayPlayer, verifyReplay } from '../js/sim/replayManager.js';
let fails = 0, checks = 0; const ok = (c, msg) => { checks++; if (!c) { fails++; console.log('  FAIL', msg); } };
const hold = (u) => { u.order = { t: 'hold' }; return u; };

// ---------------------------------------------------------------- A. lobby options reach the sim
{
  for (const m of [5000, 10000, 25000]) { const s = new Sim({ money: m }); ok(s.teams[PLAYER].money === m && s.teams[ENEMY].money === m, `starting funds $${m} for both sides`); ok(s.setup.money === m, 'funds stored in the replay setup'); }
  ok(ZONE_MULT.join() === '1,1.25,1.5', 'directional armor multipliers are 1.0 / 1.25 / 1.5');
  console.log('lobby options  : $5,000 / $10,000 / $25,000 applied to both sides equally');
}

// ---------------------------------------------------------------- B. elimination: no Command Center AND no builders
{
  const sim = new Sim({ ai: false });
  const cc = sim.ents.find(e => e.kind === 'bldg' && e.team === ENEMY && BLDGS[e.type].role === 'cc');
  const builders = () => sim.ents.filter(e => e.kind === 'unit' && e.team === ENEMY && !e.dead && UNITS[e.type].builder);
  kill(sim, cc, { team: PLAYER }); for (let i = 0; i < 60; i++) sim.step();
  ok(sim.winner < 0 && builders().length > 0, 'Command Center destroyed but a builder lives: match continues');
  for (const b of builders()) kill(sim, b, { team: PLAYER });
  for (let i = 0; i < 60; i++) sim.step();
  ok(sim.winner === PLAYER, 'last builder destroyed: match over');
  const T = sim.teams;
  ok(T[PLAYER].bldgsKilled === 1 && T[ENEMY].bldgsLost === 1 && T[PLAYER].unitsKilled >= 1 && T[ENEMY].unitsLost === T[PLAYER].unitsKilled, 'kill / loss counters agree between the two sides');
  console.log(`elimination    : CC lost -> still playing; last builder lost -> winner ${sim.winner} | counters ${T[PLAYER].unitsKilled} units, ${T[PLAYER].bldgsKilled} building`);
}

// ---------------------------------------------------------------- C. 5-minute peace treaty
{
  const sim = new Sim({ ai: false, empty: true, treaty: 300 });
  const a = makeUnit(sim, 'v_tank', PLAYER, 300, 300, 0), b = makeUnit(sim, 'r_tank', ENEMY, 318, 300, Math.PI);
  sim.issue({ t: 'attack', ids: [a.id], target: b.id });
  let hurtBefore = 0; while (sim.tick < 5999) { sim.step(); sim.events.length = 0; if (a.hp < a.maxHp || b.hp < b.maxHp) hurtBefore++; }
  ok(hurtBefore === 0, 'no damage dealt during the treaty');
  ok(powerError(sim, PLAYER, 'a10', 318, 300) === 'Peace treaty in force', "General's Powers refused during the treaty");
  for (let i = 0; i < 400; i++) sim.step();
  ok(a.hp < a.maxHp || b.hp < b.maxHp || a.dead || b.dead, 'fighting starts when the treaty ends');
  // the AI waits too (treaty length is a lobby rule everybody knows)
  const g = new Sim({ difficulty: 'hard', treaty: 300 }); let first = -1; const ai = g.ais[0];
  for (let t = 0; t < 9000 && first < 0; t++) { g.step(); g.events.length = 0; if (ai.ops && ai.ops.some(o => o.t === 'attack' || o.kind === 'attack')) first = g.tick; if (g.teams[PLAYER].unitsLost + g.teams[PLAYER].bldgsLost > 0 && first < 0) first = g.tick; }
  ok(first < 0 || first >= 6000, `Hard AI's first attack comes after the treaty (tick ${first})`);
  console.log(`peace treaty   : 0 damage ticks in 5:00, powers refused, fighting resumed after; Hard AI first contact at ${first < 0 ? 'none by 7:30' : (first / 20).toFixed(0) + ' s'}`);
}

// ---------------------------------------------------------------- D. reverse-move keeps the front armor toward the threat
{
  const run = (reverse) => {
    const sim = new Sim({ ai: false, empty: true });
    const tank = makeUnit(sim, 'v_tank', PLAYER, 300, 300, 0);            // facing +x, toward the enemy
    const foes = [294, 300, 306].map(z => makeUnit(sim, 's_buggy', ENEMY, 322, z, Math.PI)), foe = foes[1];  // three rocket buggies firing from the east
    tank.hp = tank.maxHp = 4000;                                              // enough hull to survive the whole retreat, so both runs take every hit
    hold(tank); tank.cd = 1e9; for (let i = 0; i < 3; i++) sim.step();          // let the fog pass run once so the enemy can see its target
    sim.issue({ t: 'attack', ids: foes.map(f => f.id), target: tank.id, team: ENEMY });
    const x0 = tank.x; tank.cd = 1e9;
    sim.issue({ t: 'move', ids: [tank.id], x: 264, z: 300, reverse });
    const zones = [0, 0, 0]; let worst = 0, ticks = 0, lastHp = tank.hp, lastHit = -1, arrived = -1;
    for (let t = 0; t < 400 && !tank.dead; t++) {
      tank.cd = 1e9; sim.step(); sim.events.length = 0;
      if (tank.lastHit !== lastHit && tank.hp < lastHp) { zones[tank.lastZone]++; lastHit = tank.lastHit; lastHp = tank.hp; }
      if (arrived < 0) { ticks++; worst = Math.max(worst, Math.abs(angDiff(Math.atan2(foe.z - tank.z, foe.x - tank.x), tank.facing))); if (Math.hypot(tank.x - 264, tank.z - 300) < 3) arrived = t; }
    }
    return { zones, worst, moved: x0 - tank.x, arrived, hp: Math.max(0, tank.hp), dead: tank.dead, rev: sim.byId.get(tank.id) ? 1 : 0 };
  };
  const R = run(true), F = run(false);
  ok(R.moved > 30, `reversing tank reached its destination (${R.moved.toFixed(1)} m back)`);
  ok(R.zones[1] === 0 && R.zones[2] === 0 && R.zones[0] > 0, `every hit while reversing landed on FRONT armor (front ${R.zones[0]}, side ${R.zones[1]}, rear ${R.zones[2]})`);
  ok(R.worst < 1.0471976, `hull never turned more than 60 degrees off the threat (worst ${(R.worst * 57.2958).toFixed(0)} deg)`);
  ok(F.zones[2] > 0, `control: a normal move turns its back and takes REAR hits (front ${F.zones[0]}, side ${F.zones[1]}, rear ${F.zones[2]})`);
  ok(R.arrived > F.arrived, `reverse is slower than turning round and driving forward (${R.arrived} vs ${F.arrived} ticks)`);
  ok((4000 - R.hp) / (R.zones[0] || 1) < (4000 - F.hp) / (F.zones[0] + F.zones[1] + F.zones[2] || 1), `less damage per hit while reversing (${((4000 - R.hp) / R.zones[0]).toFixed(0)} vs ${((4000 - F.hp) / (F.zones[0] + F.zones[1] + F.zones[2])).toFixed(0)})`);
  // infantry and attack-move ignore the flag
  const s2 = new Sim({ ai: false, empty: true }); const inf = makeUnit(s2, 'v_ranger', PLAYER, 300, 300, 0), tk = makeUnit(s2, 'v_tank', PLAYER, 300, 310, 0);
  s2.issue({ t: 'move', ids: [inf.id], x: 260, z: 300, reverse: true }); s2.issue({ t: 'move', ids: [tk.id], x: 260, z: 310, reverse: true, attack: true }); s2.step();
  ok(!inf.order.rev && !tk.order.rev, 'reverse applies to vehicles on a plain move only');
  console.log(`reverse-move   : hits front/side/rear ${R.zones.join('/')} reversing vs ${F.zones.join('/')} driving away | worst hull angle ${(R.worst * 57.2958).toFixed(0)} deg | ${R.arrived} vs ${F.arrived} ticks | damage per hit ${((4000 - R.hp) / R.zones[0]).toFixed(0)} vs ${((4000 - F.hp) / (F.zones[0] + F.zones[1] + F.zones[2])).toFixed(0)}`);
}

// ---------------------------------------------------------------- E. scatter
{
  const run = () => {
    const sim = new Sim({ ai: false, empty: true }); const us = [];
    for (let i = 0; i < 8; i++) us.push(makeUnit(sim, i < 4 ? 'v_tank' : 'v_ranger', PLAYER, 300 + (i % 4) * 4, 300 + ((i / 4) | 0) * 4, 0));
    const spread = () => { let s = 0, n = 0; for (let i = 0; i < 8; i++) for (let j = i + 1; j < 8; j++) { s += Math.hypot(us[i].x - us[j].x, us[i].z - us[j].z); n++; } return s / n; };
    const before = spread(); sim.issue({ t: 'scatter', ids: us.map(u => u.id) });
    for (let t = 0; t < 240; t++) { sim.step(); sim.events.length = 0; }
    return { before, after: spread(), hash: sim.hash() };
  };
  const a = run(), b = run();
  ok(a.after > a.before * 1.5, `units spread out (${a.before.toFixed(1)} m -> ${a.after.toFixed(1)} m mean spacing)`);
  ok(a.hash === b.hash, 'scatter is deterministic (uses the sim RNG)');
  console.log(`scatter        : mean spacing ${a.before.toFixed(1)} m -> ${a.after.toFixed(1)} m, identical across two runs`);
}

// ---------------------------------------------------------------- F. deterministic replay of a full 20-minute match
{
  const sim = new Sim({ factions: ['vanguard', 'sandstorm'], difficulty: 'medium', money: 10000 });
  const rec = new ReplayRecorder(sim);
  const dz = () => sim.ents.find(e => e.type === 'v_dozer' && e.team === PLAYER && !e.dead);
  const mine = (type) => sim.ents.find(e => e.type === type && e.team === PLAYER && e.done && !e.dead);
  const plan = { 5: ['v_power', 44, 212], 260: ['v_supply', 60, 204], 560: ['v_barracks', 48, 186], 800: ['v_factory', 62, 184], 1200: ['v_patriot', 84, 160], 1500: ['v_patriot', 50, 166] };
  let t = 0;
  let overAt = -1;
  for (; t < 24000; t++) {            // a full 20 minutes: the sim keeps running after the result is decided
    if (sim.winner >= 0 && overAt < 0) overAt = sim.tick;
    const d = dz();
    if (plan[t] && d) sim.issue({ t: 'build', id: d.id, type: plan[t][0], cx: plan[t][1], cz: plan[t][2] });
    if (t === 600) { const sc = mine('v_supply'); if (sc) { sim.issue({ t: 'train', id: sc.id, type: 'v_chinook' }); sim.issue({ t: 'train', id: sc.id, type: 'v_chinook' }); } }
    if (t > 1300 && t % 300 === 0) { const f = mine('v_factory'), b = mine('v_barracks'); if (f) sim.issue({ t: 'train', id: f.id, type: (t / 300) % 2 ? 'v_tank' : 'v_avenger' }); if (b && t % 600 === 0) sim.issue({ t: 'train', id: b.id, type: 'v_ranger' }); }
    if (t > 2000 && t % 700 === 0) { const army = sim.ents.filter(e => e.kind === 'unit' && e.team === PLAYER && !e.dead && UNITS[e.type].weapon).map(e => e.id); if (army.length) { sim.issue({ t: 'scatter', ids: army }); sim.issue({ t: 'move', ids: army.slice(0, 3), x: 70 * CELL, z: 190 * CELL, reverse: true }); } }
    sim.step(); rec.mark(); sim.events.length = 0;
  }
  const data = JSON.parse(JSON.stringify(rec.export()));       // exactly what the page stores and reloads
  const bytes = JSON.stringify(data).length, t0 = Date.now(), v = verifyReplay(data), ms = Date.now() - t0;
  ok(data.cmds.length > 40 && data.end === 24000 && data.marks.length >= Math.floor(data.end / 200) - 1, `recording holds ${data.cmds.length} player commands and ${data.marks.length} checkpoints`);
  ok(v.ok && v.ticks === data.end, `replay reproduces the match: ${v.checkpoints} checkpoints and the final state hash match`);
  // observer cannot give orders: a player command issued during playback is dropped
  const p = new ReplayPlayer(data); for (let i = 0; i < 400; i++) p.step(); const u = p.sim.ents.find(e => e.kind === 'unit' && e.team === PLAYER);
  p.sim.issue({ t: 'move', ids: [u.id], x: 500, z: 500 }); while (p.step()) p.sim.events.length = 0;
  ok(p.diverged < 0 && p.sim.hash() === data.hash, 'orders from the observer are ignored during playback');
  // tamper detection: drop one early command and the hashes must disagree
  const bad = JSON.parse(JSON.stringify(data)); bad.cmds.splice(1, 1); const vb = verifyReplay(bad);
  ok(!vb.ok && vb.diverged > 0, `a recording with one command removed is detected (diverges at tick ${vb.diverged})`);
  const T = sim.teams;
  ok(T[PLAYER].built > 5 && T[ENEMY].built > 5 && T[PLAYER].earned > 0 && T[ENEMY].earned > 0, 'After-Action Report counters are populated for both sides');
  console.log(`replay         : ${(data.end / 1200).toFixed(1)} min recorded (result decided at ${overAt < 0 ? 'no point' : (overAt / 1200).toFixed(1) + ' min'}), ${data.cmds.length} commands, ${data.marks.length} checkpoints, ${(bytes / 1024).toFixed(1)} KB | replayed in ${ms} ms, final hash ${v.finalHash.toString(16)} matches | tampered copy diverged at tick ${vb.diverged}`);
  console.log(`report data    : you built ${T[PLAYER].built}, destroyed ${T[PLAYER].unitsKilled} units, harvested $${T[PLAYER].earned}, powers ${T[PLAYER].powersUsed} | enemy built ${T[ENEMY].built}, destroyed ${T[ENEMY].unitsKilled}, harvested $${T[ENEMY].earned}, powers ${T[ENEMY].powersUsed}`);
}
console.log(fails ? `PHASE4: ${fails} FAILURES of ${checks}` : `PHASE4: all ${checks} checks passed`);
process.exit(fails ? 1 : 0);
