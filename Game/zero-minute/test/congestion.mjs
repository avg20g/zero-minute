// Supply Dock congestion critique: N trucks, one dock, one Supply Center.
import { Sim } from '../js/sim/simulationTick.js';
import { makeBldg, makeUnit, spawnNear } from '../js/sim/entities.js';
import { N, CELL, PLAYER } from '../js/sim/defs.js';

export function run(nTrucks, scx, scz, ticks = 3600, verbose = false) {
  const sim = new Sim({ ai: false }); const CARRY = 200;
  sim.teams[0].money = 0;
  makeBldg(sim, 'v_power', PLAYER, 44, 214);
  const sc = makeBldg(sim, 'v_supply', PLAYER, scx, scz);
  sim.nav.rebuild();
  const dock = sim.ents.find(e => e.type === 'dock' && e.cx === 62);
  dock.supplies = 1e7;
  const trucks = [];
  for (let i = 0; i < nTrucks; i++) trucks.push(spawnNear(sim, 'v_truck', PLAYER, sc.x - 30 - (i % 4) * 6, sc.z - 10 + ((i / 4) | 0) * 6));
  let overlapTicks = 0, deepOverlap = 0, waitTicks = 0, jamTicks = 0, maxHold = 0, crowdArrive = 0, stuckMax = 0;
  const stateTicks = {};
  for (let t = 0; t < ticks; t++) {
    sim.step();
    let hold = 0;
    for (let i = 0; i < trucks.length; i++) {
      const u = trucks[i];
      stateTicks[u.hs] = (stateTicks[u.hs] || 0) + 1;
      if (u.holdI >= 0 && u.slotI < 0) hold++;
      if (u.path && u.spd < 0.5) jamTicks++;
      stuckMax = Math.max(stuckMax, u.stuck);
      for (let j = i + 1; j < trucks.length; j++) {
        const o = trucks[j], d = Math.hypot(u.x - o.x, u.z - o.z), rr = u.radius + o.radius;
        if (d < rr - 0.15) overlapTicks++;
        if (d < rr - 0.8) deepOverlap++;
      }
    }
    maxHold = Math.max(maxHold, hold);
  }
  const mins = ticks / 1200;
  const res = { trucks: nTrucks, incomePerMin: Math.round(sim.teams[0].earned / mins), perTruck: Math.round(sim.teams[0].earned / mins / nTrucks),
    jamPct: +(100 * jamTicks / (ticks * nTrucks)).toFixed(1), overlapPairTicks: overlapTicks, deepOverlap, maxHold, stuckMax,
    paths: sim.stats.paths, expandedPerPath: Math.round(sim.stats.expanded / sim.stats.paths) };
  if (verbose) console.log(stateTicks);
  return res;
}
if (process.argv[1].endsWith('congestion.mjs')) {
  for (const n of [1, 2, 4, 6, 8, 12]) console.log(JSON.stringify(run(n, 60, 206)));
  console.log('-- far centre (30 cells away)');
  for (const n of [4, 8]) console.log(JSON.stringify(run(n, 62, 186)));
}
