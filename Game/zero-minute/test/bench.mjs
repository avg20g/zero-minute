// Simulation benchmark: a heavy Hard-v-Hard match. Prints mean / p95 / worst ms per tick and a state hash
// (the hash must not change when the code is optimised).
import { Sim } from '../js/sim/simulationTick.js';
const sim = new Sim({ ai: 'both', difficulty: ['hard', 'hard'], factions: ['redhammer', 'vanguard'], money: 25000, seed: 77 });
const ms = []; let peak = 0;
for (let t = 0; t < 14000; t++) { const t0 = performance.now(); sim.step(); const d = performance.now() - t0; if (t >= 2000) ms.push(d); sim.events.length = 0; if (sim.ents.length > peak) peak = sim.ents.length; }
ms.sort((a, b) => a - b); const mean = ms.reduce((a, b) => a + b, 0) / ms.length;
console.log(`bench: mean ${mean.toFixed(3)} ms/tick | p95 ${ms[Math.floor(ms.length * 0.95)].toFixed(3)} | p99 ${ms[Math.floor(ms.length * 0.99)].toFixed(3)} | worst ${ms[ms.length - 1].toFixed(2)} | peak entities ${peak} | hash ${sim.hash()}`);
