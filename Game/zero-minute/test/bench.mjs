// Simulation benchmark: a heavy Hard-v-Hard match on each map size. Prints mean / p95 / worst ms per tick and a
// state hash (the hash must not change when the code is optimised).
//   node test/bench.mjs            the small test map, a 1 km map and a 2 km sea map
//   node test/bench.mjs small      just the small test map (the figure quoted in older notes)
import { Sim } from '../js/sim/simulationTick.js';
import { MAPS } from '../js/sim/map.js';
const only = process.argv[2];
const cases = [['small', '0.5 km test map', undefined], ['canyon', '1 km Desert Canyon', MAPS[0].spec], ['strait', '2 km Strait of Sand', MAPS[5].spec]].filter(c => !only || c[0] === only);
let base = 0;
for (const [id, label, map] of cases) {
  const sim = new Sim({ ai: 'both', difficulty: ['hard', 'hard'], factions: ['redhammer', 'vanguard'], money: 25000, seed: 77, map });
  const ms = []; let peak = 0;
  for (let t = 0; t < 14000; t++) { const t0 = performance.now(); sim.step(); const d = performance.now() - t0; if (t >= 2000) ms.push(d); sim.events.length = 0; if (sim.ents.length > peak) peak = sim.ents.length; }
  ms.sort((a, b) => a - b); const mean = ms.reduce((a, b) => a + b, 0) / ms.length; if (id === 'small') base = mean;
  console.log(`bench ${label}: mean ${mean.toFixed(3)} ms/tick | p95 ${ms[Math.floor(ms.length * 0.95)].toFixed(3)} | p99 ${ms[Math.floor(ms.length * 0.99)].toFixed(3)} | worst ${ms[ms.length - 1].toFixed(2)} | peak entities ${peak} | hash ${sim.hash()}` + (base && id !== 'small' ? ` | ${(mean / base).toFixed(1)}x the small map` : ''));
}
