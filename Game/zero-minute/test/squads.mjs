// Vehicle squad movement: overlap, stuck and arrival checks through choke points.
import { Sim } from '../js/sim/simulationTick.js';
import { spawnNear } from '../js/sim/entities.js';
import { CELL, PLAYER, ENEMY } from '../js/sim/defs.js';

function measure(sim, groups, maxTicks) {
  const all = groups.flat();
  let overlap = 0, deep = 0, stuckMax = 0, doneTick = -1, worstPen = 0;
  for (let t = 0; t < maxTicks; t++) {
    sim.step();
    let moving = 0;
    for (let i = 0; i < all.length; i++) {
      const u = all[i]; if (u.path || u.pathReq || u.order) moving++;
      stuckMax = Math.max(stuckMax, u.stuck);
      for (let j = i + 1; j < all.length; j++) {
        const o = all[j], pen = u.radius + o.radius - Math.hypot(u.x - o.x, u.z - o.z);
        if (pen > 0.2) overlap++; if (pen > 0.8) deep++; worstPen = Math.max(worstPen, pen);
      }
    }
    if (!moving && doneTick < 0) { doneTick = t; break; }
  }
  return { secs: doneTick < 0 ? 'TIMEOUT' : (doneTick / 20).toFixed(1), overlapPairTicks: overlap, deep, worstPen: +worstPen.toFixed(2), stuckMax };
}
function group(sim, team, types, cx, cz) {
  const us = []; types.forEach((t, i) => us.push(spawnNear(sim, t, team, (cx + (i % 4) * 3) * CELL, (cz + ((i / 4) | 0) * 3) * CELL)));
  return us;
}
const far = (us, x, z) => us.filter(u => Math.hypot(u.x - x * CELL, u.z - z * CELL) > 30).length;

{ // 1. base -> through the gate -> south field
  const sim = new Sim({ ai: false });
  const g = group(sim, PLAYER, ['v_tank', 'v_tank', 'v_tank', 'v_tank', 'v_tank', 'v_tank', 's_buggy', 's_buggy', 's_buggy', 's_buggy', 'v_dozer', 'v_dozer'], 60, 190);
  sim.issue({ t: 'move', ids: g.map(u => u.id), x: 150 * CELL, z: 165 * CELL });
  const r = measure(sim, [g], 2400); console.log('gate, 12 vehicles     ', JSON.stringify(r), 'strays', far(g, 150, 165));
}
{ // 2. 10 tanks through the 9-cell west alley of the town
  const sim = new Sim({ ai: false });
  const g = group(sim, PLAYER, Array(10).fill('v_tank'), 104, 150);
  sim.issue({ t: 'move', ids: g.map(u => u.id), x: 109 * CELL, z: 100 * CELL });
  const r = measure(sim, [g], 2400); console.log('alley, 10 tanks       ', JSON.stringify(r), 'strays', far(g, 109, 100));
}
{ // 3. two columns head-on in the avenue
  const sim = new Sim({ ai: false });
  const a = group(sim, PLAYER, Array(8).fill('v_tank'), 122, 150), b = group(sim, PLAYER, Array(8).fill('v_tank'), 122, 98);
  sim.issue({ t: 'move', ids: a.map(u => u.id), x: 127 * CELL, z: 100 * CELL });
  sim.issue({ t: 'move', ids: b.map(u => u.id), x: 127 * CELL, z: 156 * CELL });
  const r = measure(sim, [a, b], 2400); console.log('head-on, 8 v 8 tanks  ', JSON.stringify(r), 'strays', far(a, 127, 100) + far(b, 127, 156));
}
{ // 4. mixed force up the ramp and across the plateau
  const sim = new Sim({ ai: false });
  const g = group(sim, PLAYER, ['v_tank', 'v_tank', 'v_tank', 's_buggy', 's_buggy', 'v_ranger', 'v_ranger', 'v_ranger', 'v_ranger', 'v_tank'], 40, 170);
  sim.issue({ t: 'move', ids: g.map(u => u.id), x: 46 * CELL, z: 90 * CELL });
  const r = measure(sim, [g], 3000); console.log('ramp + plateau, mixed ', JSON.stringify(r), 'strays', far(g, 46, 90));
}
{ // 5. 30 vehicles, one order, cross-map
  const sim = new Sim({ ai: false });
  const g = group(sim, PLAYER, Array(30).fill(0).map((_, i) => i % 3 ? 'v_tank' : 's_buggy'), 50, 170);
  const t0 = performance.now();
  sim.issue({ t: 'move', ids: g.map(u => u.id), x: 128 * CELL, z: 180 * CELL });
  const r = measure(sim, [g], 3000); console.log('30 vehicles, one order', JSON.stringify(r), 'strays', far(g, 128, 180), 'wall ms/tick', ((performance.now() - t0) / sim.tick).toFixed(3));
}
