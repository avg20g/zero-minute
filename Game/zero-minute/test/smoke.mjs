import { Sim } from '../js/sim/simulationTick.js';
import { N, CELL, BLDGS } from '../js/sim/defs.js';
const t0 = performance.now();
const sim = new Sim({ ai: false });
console.log('init ms', (performance.now() - t0).toFixed(1));
const m = sim.map, nav = sim.nav;
// ascii overview (every 4th cell)
let out = '';
for (let z = 0; z < N; z += 4) { for (let x = 0; x < N; x += 4) { const i = z * N + x; out += nav.bld[i] ? '#' : m.blocked[i] ? (m.rock[z * m.V + x] > 0.5 ? '^' : '/') : (m.rock[z * m.V + x] > 0.9 ? '=' : m.rock[z*m.V+x] > 0.08 ? '~' : '.'); } out += '\n'; }
console.log(out);
// static placement check
for (const e of sim.ents) if (e.kind === 'bldg') { let bad = 0; for (let z = e.cz - 1; z <= e.cz + e.h; z++) for (let x = e.cx - 1; x <= e.cx + e.w; x++) if (m.blocked[z * N + x]) bad++; if (bad) console.log('BAD SITE', e.type, e.cx, e.cz, bad); }
for (const e of sim.ents) if (e.kind === 'unit' && !nav.passAt(e.x, e.z, e.cls)) console.log('BAD UNIT POS', e.type, e.x, e.z);
// connectivity
const a = sim.ents.find(e => e.type.endsWith('_cc') && e.team === 0), b = sim.ents.find(e => e.type.endsWith('_cc') && e.team === 1);
for (const cls of [0, 1]) {
  const t = performance.now();
  const r = nav.findPath(a.x + 30, a.z, b.x - 30, b.z, cls);
  console.log('cls', cls, 'path', r.path ? r.path.length / 2 + ' wps' : 'NONE', 'expanded', r.expanded, 'ms', (performance.now() - t).toFixed(2));
}
const comps = new Set(); for (let i = 0; i < N * N; i++) if (nav.comp[1][i] >= 0) comps.add(nav.comp[1][i]);
console.log('vehicle components', comps.size, 'main comp of player', nav.comp[1][nav.cellOf(a.x + 30, a.z)], 'enemy', nav.comp[1][nav.cellOf(b.x - 30, b.z)]);
const rt = m.rampTop[0]; console.log('ramp top comp', nav.comp[1][nav.cellOf(rt.x, rt.z)], 'height', m.height[127 * m.V + 46].toFixed(2));
const t1 = performance.now(); for (let i = 0; i < 2000; i++) sim.step(); console.log('2000 ticks ms', (performance.now() - t1).toFixed(0), 'ents', sim.ents.length);
