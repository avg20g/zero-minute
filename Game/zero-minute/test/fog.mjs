// Fog of War verification: an enemy is shown/targetable iff it is inside the
// sight radius of at least one friendly observer (tolerance = half a fog cell diagonal).
import { Sim } from '../js/sim/simulationTick.js';
import { makeUnit, makeBldg, spawnNear } from '../js/sim/entities.js';
import { sightOf } from '../js/sim/fog.js';
import { N, CELL, PLAYER, ENEMY, UNITS } from '../js/sim/defs.js';
const TOL = 1.5;
let fails = 0; const ok = (c, msg) => { if (!c) { fails++; console.log('  FAIL', msg); } };

function truth(sim, team, e) { // brute-force ground truth; returns margin (>0 inside sight)
  let best = -1e9;
  for (const o of sim.ents) {
    if (o.team !== team || o.dead || (o.kind === 'unit' && o.inB)) continue;
    const R = o.kind === 'unit' ? UNITS[o.type].sight : sightOf(o);
    best = Math.max(best, R - Math.hypot(e.x - o.x, e.z - o.z));
  }
  return best;
}
function audit(sim, label) {
  let checked = 0, skipped = 0, bad = 0, shown = 0;
  for (const e of sim.ents) {
    if (e.team !== ENEMY || e.kind !== 'unit' || e.dead || e.inB) continue;
    const m = truth(sim, PLAYER, e), vis = sim.fog.shouldShow(PLAYER, e);
    if (Math.abs(m) < TOL || (e.cloaked && !e.detected)) { skipped++; continue; }   // a cloaked unit (a hero, say) is hidden by the stealth rules, not by fog
    checked++; if (vis) shown++;
    if (vis !== (m > 0)) { bad++; if (bad < 4) console.log('  mismatch', label, e.type, 'margin', m.toFixed(2), 'shown', vis); }
  }
  return { checked, skipped, bad, shown };
}

// 1. static scatter: 600 enemy units all over the map
{
  const sim = new Sim({ ai: false });
  let r = 12345; const rnd = () => (r = (Math.imul(r, 1103515245) + 12345) >>> 0) / 4294967296;
  spawnNear(sim, 'v_tank', PLAYER, 300, 330); spawnNear(sim, 's_buggy', PLAYER, 256, 256); spawnNear(sim, 'v_ranger', PLAYER, 180, 180);
  for (let i = 0; i < 600; i++) makeUnit(sim, 'v_dozer', ENEMY, 12 + rnd() * 488, 12 + rnd() * 488);
  sim.fog.update(sim);
  const a = audit(sim, 'static');
  console.log('static scatter :', JSON.stringify(a)); ok(a.bad === 0 && a.shown > 5 && a.checked - a.shown > 300, 'static audit');
}
// 2. dynamic: real skirmish with AI, audited after every fog update for 6 minutes
{
  const sim = new Sim({});
  const mine = sim.ents.filter(e => e.team === PLAYER && e.kind === 'unit');
  sim.issue({ t: 'move', ids: mine.map(u => u.id), x: 127 * CELL, z: 150 * CELL, attack: true });
  for (let i = 0; i < 6; i++) spawnNear(sim, i % 2 ? 'v_tank' : 's_buggy', PLAYER, 200 + i * 8, 420);
  let tot = { checked: 0, skipped: 0, bad: 0, shown: 0 };
  for (let t = 0; t < 7200; t++) {
    if (t === 600) sim.issue({ t: 'move', ids: sim.ents.filter(e => e.team === PLAYER && e.kind === 'unit' && e.type !== 'v_dozer').map(u => u.id), x: 300, z: 190, attack: true });
    sim.step();
    if ((sim.tick - 1) % 4 === 0) { const a = audit(sim, 'dyn@' + t); for (const k in tot) tot[k] += a[k]; }
  }
  console.log('dynamic 6 min  :', JSON.stringify(tot)); ok(tot.bad === 0 && tot.shown > 0, 'dynamic audit');
}
// 3. targeting is fog-gated: Patriot outranges nothing it cannot see
{
  const sim = new Sim({ ai: false, empty: true });
  const b = spawnNear(sim, 's_buggy', PLAYER, 200, 300);   // sight 40, rocket range 46
  const e = makeUnit(sim, 'v_dozer', ENEMY, 243.5, 300);   // 43.5 m: in weapon range, out of sight
  for (let t = 0; t < 200; t++) sim.step();
  ok(!sim.fog.shouldShow(PLAYER, e), 'dozer at 43.5 m should be hidden'); ok(b.target === 0 && e.hp === e.maxHp, 'buggy must not engage unseen target');
  const spotter = spawnNear(sim, 'v_ranger', PLAYER, 215, 290);
  for (let t = 0; t < 200; t++) sim.step();
  ok(sim.fog.shouldShow(PLAYER, e) || e.dead, 'spotter reveals it'); ok(e.hp < e.maxHp || e.dead, 'buggy engages once spotted');
  console.log('target gating  : buggy held fire while unseen, fired after spotter arrived ->', e.dead ? 'target destroyed' : 'hp ' + e.hp.toFixed(0));
}
// 4. explored memory: structures persist as last-known, units do not
{
  const sim = new Sim({ ai: false, empty: true });
  const eb = makeBldg(sim, 'r_barracks', ENEMY, 150, 150); const eu = makeUnit(sim, 'v_dozer', ENEMY, 320, 300); sim.nav.rebuild();
  const s = spawnNear(sim, 's_buggy', PLAYER, 200, 312);
  sim.fog.update(sim);
  ok(!sim.fog.shouldShow(PLAYER, eb) && !sim.fog.shouldShow(PLAYER, eu), 'unseen at start');
  sim.issue({ t: 'move', ids: [s.id], x: 285, z: 300 }); for (let t = 0; t < 200; t++) sim.step();
  ok(sim.fog.shouldShow(PLAYER, eb) && sim.fog.shouldShow(PLAYER, eu), 'seen when scout arrives');
  sim.issue({ t: 'move', ids: [s.id], x: 120, z: 420 }); for (let t = 0; t < 400; t++) sim.step();
  ok(sim.fog.shouldShow(PLAYER, eb), 'structure stays as last-known'); ok(!sim.fog.shouldShow(PLAYER, eu), 'unit hidden again once scout leaves');
  ok(sim.fog.exp[0][sim.nav.cellOf(eb.x, eb.z)] === 1 && sim.fog.vis[0][sim.nav.cellOf(eb.x, eb.z)] === 0, 'explored but not visible');
  console.log('explored memory: structure kept as last-known, unit re-hidden');
}
console.log(fails ? `FOG: ${fails} FAILURES` : 'FOG: all checks passed');
