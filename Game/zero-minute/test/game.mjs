// Gameplay flow, directional armor, garrison, determinism and a 20-minute soak.
import { Sim } from '../js/sim/simulationTick.js';
import { makeUnit, makeBldg, spawnNear, hitZone } from '../js/sim/entities.js';
import { CELL, PLAYER, ENEMY, NEUTRAL, UNITS, BLDGS } from '../js/sim/defs.js';
let fails = 0; const ok = (c, msg) => { if (!c) { fails++; console.log('  FAIL', msg); } };
const run = (sim, n) => { for (let i = 0; i < n; i++) sim.step(); };

function scriptedGame(ticks, log) {
  const sim = new Sim({});
  const dz = () => sim.ents.find(e => e.type === 'v_dozer' && e.team === PLAYER);
  const plan = [
    [5, s => s.issue({ t: 'build', id: dz().id, type: 'v_power', cx: 44, cz: 212 })],
    [260, s => s.issue({ t: 'build', id: dz().id, type: 'v_supply', cx: 60, cz: 204 })],
    [560, s => s.issue({ t: 'build', id: dz().id, type: 'v_barracks', cx: 48, cz: 186 })],
    [600, s => { const sc = s.ents.find(e => e.type === 'v_supply' && e.team === PLAYER); if (sc) { s.issue({ t: 'train', id: sc.id, type: 'v_chinook' }); s.issue({ t: 'train', id: sc.id, type: 'v_chinook' }); } }],
    [800, s => s.issue({ t: 'build', id: dz().id, type: 'v_factory', cx: 62, cz: 184 })],
    [1200, s => s.issue({ t: 'build', id: dz().id, type: 'v_patriot', cx: 84, cz: 160 })],
    [1500, s => s.issue({ t: 'build', id: dz().id, type: 'v_patriot', cx: 50, cz: 166 })],
  ];
  const trace = [];
  for (let t = 0; t < ticks; t++) {
    for (const [at, f] of plan) if (at === t) f(sim);
    if (t > 1300 && t % 300 === 0) {
      const f = sim.ents.find(e => e.type === 'v_factory' && e.team === PLAYER && e.done), b = sim.ents.find(e => e.type === 'v_barracks' && e.team === PLAYER && e.done);
      if (f) sim.issue({ t: 'train', id: f.id, type: (t / 300) % 2 ? 'v_tank' : 'v_avenger' });
      if (b && t % 600 === 0) sim.issue({ t: 'train', id: b.id, type: 'v_ranger' });
    }
    sim.step();
    if (t % 1000 === 999) trace.push(sim.hash());
    for (const e of sim.ents) if (!(e.x === e.x && e.z === e.z && e.hp === e.hp)) throw new Error('NaN in entity ' + e.type);
  }
  return { sim, trace };
}

// --- build / economy flow ---
{
  const { sim } = scriptedGame(2400);
  const mine = t => sim.ents.filter(e => e.team === PLAYER && e.type === t);
  ok(mine('v_power')[0]?.done, 'power plant built'); ok(mine('v_supply')[0]?.done, 'supply centre built');
  ok(mine('v_barracks')[0]?.done, 'barracks built'); ok(mine('v_factory')[0]?.done, 'war factory built'); ok(mine('v_patriot').length >= 1, 'patriot placed');
  ok(mine('v_chinook').length === 3, '1 free + 2 trained Chinooks, got ' + mine('v_chinook').length); ok(sim.teams[0].earned > 2000, 'income flowing: ' + sim.teams[0].earned);
  console.log('build flow     : power', sim.teams[0].prod + '/' + sim.teams[0].use, 'earned $' + sim.teams[0].earned, 'money $' + sim.teams[0].money, 'units', sim.ents.filter(e => e.team === PLAYER && e.kind === 'unit').map(e => e.type).join(','));
}
// --- directional armor ---
{
  const res = {};
  for (const [name, facing] of [['front', 0], ['side', Math.PI / 2], ['rear', Math.PI]]) {
    const sim = new Sim({ ai: false, empty: true });
    const tank = makeUnit(sim, 'v_tank', ENEMY, 300, 300, facing); tank.order = { t: 'hold' };
    const z = hitZone(tank, 330, 300);
    const buggy = makeUnit(sim, 's_buggy', PLAYER, 330, 300, Math.PI); spawnNear(sim, 'v_ranger', PLAYER, 326, 310);
    sim.issue({ t: 'attack', ids: [buggy.id], target: tank.id });
    let t = 0; tank.cd = 1e9; while (!tank.dead && t < 4000) { tank.cd = 1e9; sim.step(); t++; }
    res[name] = { zone: z, ticksToKill: t };
  }
  console.log('directional    :', JSON.stringify(res));
  ok(res.front.zone === 0 && res.side.zone === 1 && res.rear.zone === 2, 'zones'); ok(res.rear.ticksToKill < res.side.ticksToKill && res.side.ticksToKill < res.front.ticksToKill, 'rear dies fastest');
}
// --- garrison ---
{
  const sim = new Sim({ ai: false });
  const civ = sim.ents.find(e => e.type === 'civ');
  civ.variant = 6;   // log cabin: the smallest building, holds 3 squads (batch 7 raised every building from 2)
  const sq0 = spawnNear(sim, 'v_ranger', PLAYER, civ.x - 16, civ.z + 30); sim.issue({ t: 'garrison', ids: [sq0.id], target: civ.id }); run(sim, 300);
  const sq = spawnNear(sim, 'v_ranger', PLAYER, civ.x - 20, civ.z + 30), sq2 = spawnNear(sim, 'v_ranger', PLAYER, civ.x - 24, civ.z + 30), sq3 = spawnNear(sim, 'v_ranger', PLAYER, civ.x - 28, civ.z + 30);
  sim.issue({ t: 'garrison', ids: [sq.id, sq2.id, sq3.id], target: civ.id }); run(sim, 300);
  ok(civ.garrison.length === 3 && civ.team === PLAYER, 'three squads inside (capacity 3), got ' + civ.garrison.length); ok([sq, sq2, sq3].filter(u => !u.inB && !u.order).length === 1, 'fourth squad turned away');
  const foe = makeUnit(sim, 's_buggy', ENEMY, civ.x + 34, civ.z, Math.PI); foe.order = { t: 'hold' };
  const hp0 = foe.hp; run(sim, 100); ok(foe.hp < hp0 || foe.dead, 'garrison fires out');
  sim.issue({ t: 'evacuate', id: civ.id }); run(sim, 5);
  ok(civ.garrison.length === 0 && civ.team === NEUTRAL && !sq.inB && !sq2.inB && !sq3.inB, 'evacuated');
  console.log('garrison       : enter (cap 2), fire from cover, evacuate OK');
}
// --- depleting dock ---
{
  const sim = new Sim({ ai: false });
  makeBldg(sim, 'v_power', PLAYER, 46, 200); const sc = makeBldg(sim, 'v_supply', PLAYER, 60, 204); sim.nav.rebuild();
  const dock = sim.ents.find(e => e.type === 'dock' && e.cx === 62); dock.supplies = 900;
  for (let i = 0; i < 3; i++) spawnNear(sim, 'v_truck', PLAYER, sc.x - 20 - i * 6, sc.z);
  run(sim, 1500);
  const second = sim.ents.find(e => e.type === 'dock' && e.cx === 160);
  ok(dock.supplies === 0, 'dock drained'); ok(sim.teams[0].earned >= 900, 'all supplies banked: ' + sim.teams[0].earned);
  console.log('depleting dock : drained to 0, banked $' + sim.teams[0].earned + ', trucks then ' + sim.ents.filter(e => e.type === 'v_truck' && e.team === 0).map(u => u.hs + (u.dock === second.id ? '(far dock)' : '')).join('/'));
}
// --- determinism + soak ---
{
  const t0 = performance.now();
  const a = scriptedGame(24000), ms = performance.now() - t0, b = scriptedGame(24000);
  const same = a.trace.every((h, i) => h === b.trace[i]);
  ok(same, 'two identical runs must produce identical state hashes');
  const s = a.sim;
  console.log('determinism    :', same ? `${a.trace.length} checkpoints identical over 20 min` : 'DIVERGED', '| final hash', a.trace.at(-1).toString(16));
  console.log('soak 20 min    :', (ms / 24000).toFixed(3), 'ms/tick avg | AI attacks', s.ais[0].stats.attacks, '| winner', s.winner, '| ents', s.ents.length, '| paths', s.stats.paths, 'avg nodes', Math.round(s.stats.expanded / s.stats.paths),
    '| player bldgs', s.ents.filter(e => e.team === 0 && e.kind === 'bldg').length, 'enemy units', s.ents.filter(e => e.team === 1 && e.kind === 'unit').length);
}
console.log(fails ? `GAME: ${fails} FAILURES` : 'GAME: all checks passed');
