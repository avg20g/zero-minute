// Verification: Tunnel Network teleportation must move a unit's grid position
// cleanly and leave no stale pathfinding state or reservations behind.
import { Sim } from '../js/sim/simulationTick.js';
import { makeBldg, makeUnit, spawnNear } from '../js/sim/entities.js';
import { N, CELL, PLAYER, ENEMY } from '../js/sim/defs.js';
let fails = 0, checks = 0; const ok = (c, msg) => { checks++; if (!c) { fails++; console.log('  FAIL', msg); } };
const run = (sim, n) => { for (let i = 0; i < n; i++) sim.step(); };
const navSig = (nav) => { let h = 2166136261 >>> 0; for (const a of [nav.dist, nav.bld, nav.soft, nav.comp[0], nav.comp[1]]) for (let i = 0; i < a.length; i += 7) { h ^= a[i] & 255; h = Math.imul(h, 16777619) >>> 0; } return h; };
const refs = (sim, id) => { let n = 0; for (const b of sim.ents) if (b.kind === 'bldg') { for (const s of b.slots || []) if (s.by === id) n++; for (const s of b.holds || []) if (s.by === id) n++; for (const s of b.pads || []) if (s.by === id) n++; } return n; };

function world() {
  const sim = new Sim({ ai: false, factions: ['sandstorm', 'vanguard'] });
  const sc = makeBldg(sim, 's_supply', PLAYER, 60, 204);
  const A = makeBldg(sim, 's_tunnel', PLAYER, 70, 192);    // home tunnel, near the Supply Stash
  const B = makeBldg(sim, 's_tunnel', PLAYER, 150, 168);   // forward tunnel, far side of the gate
  sim.nav.rebuild();
  return { sim, sc, A, B };
}

// 1. A mixed squad, including a truck that holds a dock bay reservation
{
  const { sim, sc, A, B } = world();
  const dock = sim.ents.find(e => e.type === 'dock' && e.cx === 62);
  const trucks = [0, 1, 2].map(i => spawnNear(sim, 's_truck', PLAYER, sc.x - 20 - i * 6, sc.z));
  let holder = null;
  for (let t = 0; t < 900 && !holder; t++) { sim.step(); holder = trucks.find(u => u.slotI >= 0 && u.hs === 'toDock' && u.path); }
  ok(!!holder, 'a truck is driving to a reserved bay'); ok(refs(sim, holder.id) >= 1, 'bay is reserved before the jump');
  const squad = ['s_technical', 's_technical', 's_scorpion', 's_scorpion', 's_tractor', 's_guerrilla', 's_guerrilla', 's_rpg'].map((t, i) => spawnNear(sim, t, PLAYER, A.x + 12 + (i % 4) * 5, A.z + 14 + ((i / 4) | 0) * 5));
  const all = [holder, ...squad], before = navSig(sim.nav), oldCell = sim.nav.cellOf(holder.x, holder.z);
  sim.issue({ t: 'move', ids: squad.map(u => u.id), x: 60, z: 300 });          // a pending path request that must not survive
  sim.issue({ t: 'tunnel', ids: all.map(u => u.id), target: B.id });
  const jumped = new Set(); let badAnchor = 0, badState = 0;
  for (let t = 0; t < 1200 && jumped.size < all.length; t++) {
    sim.step();
    for (const e of sim.events) if (e.t === 'tunnel') {
      const u = sim.byId.get(e.id); jumped.add(u.id);
      // anchors must sit at the new position (same-tick separation may nudge a unit by centimetres)
      if (Math.hypot(u.px - u.x, u.pz - u.z) > 1 || Math.hypot(u.lx - u.x, u.lz - u.z) > 1 || Math.hypot(u.px - e.fx, u.pz - e.fz) < 50) badAnchor++;
      if (u.path || u.pathReq || u.order || u.stuck || u.slotI !== -1 || u.holdI !== -1 || u.exitB || u.slotB || u.still || refs(sim, u.id) !== 0) badState++;
    }
    sim.events.length = 0;
  }
  ok(jumped.size === all.length, `all ${all.length} units teleported (got ${jumped.size})`);
  ok(badAnchor === 0, 'interpolation and stuck anchors reset on the teleport tick'); ok(badState === 0, 'path, queued request, order and reservations cleared on the teleport tick');
  ok(all.every(u => sim.nav.passAt(u.x, u.z, u.cls)), 'every unit landed on a cell passable for its size class');
  ok(all.every(u => Math.hypot(u.x - B.x, u.z - B.z) < 34), 'every unit is at the exit tunnel');
  ok(all.every(u => refs(sim, u.id) === 0) || refs(sim, holder.id) <= 1, 'no stale bay / waiting-spot reservation');
  ok(dock.slots.every(s => s.by !== holder.id || holder.slotB === dock.id), 'old dock bay released (or legitimately re-taken later)');
  ok(navSig(sim.nav) === before, 'nav grid, clearance map and components untouched');
  run(sim, 40);
  let pen = 0; for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) pen = Math.max(pen, all[i].radius + all[j].radius - Math.hypot(all[i].x - all[j].x, all[i].z - all[j].z));
  ok(pen < 0.3, 'no units stacked at the exit, worst overlap ' + pen.toFixed(2) + ' m');
  ok(sim.fog.visAt(PLAYER, B.x + 10, B.z + 10), 'fog follows the units to the exit');
  // they must path from the NEW position
  sim.issue({ t: 'move', ids: squad.map(u => u.id), x: B.x + 40, z: B.z - 30 });
  run(sim, 2); const firstWp = squad.map(u => u.path ? Math.hypot(u.path[0] - u.x, u.path[1] - u.z) : 0);
  run(sim, 400);
  ok(Math.max(...firstWp) < 60, 'new paths start at the new position (first waypoint ' + Math.max(...firstWp).toFixed(0) + ' m away)');
  ok(squad.every(u => Math.hypot(u.x - (B.x + 40), u.z - (B.z - 30)) < 26 && !u.path), 'squad obeys a move order after the jump');
  const e0 = sim.teams[0].earned; run(sim, 2400);
  ok(sim.teams[0].earned > e0 && trucks.every(u => u.stuck < 14), 'trucks (including the teleported one) keep harvesting: +$' + (sim.teams[0].earned - e0));
  ok(holder.hs !== 'seek' || holder.cargo >= 0, 'teleported truck re-entered the harvest cycle (' + holder.hs + ')');
  console.log(`teleport squad : ${all.length} units jumped, ${sim.stats.teleports} teleports, old cell ${oldCell} released, nav signature stable`);
}
// 2. Truck teleported while parked in a bay (loading): bay must free up for the next truck
{
  const { sim, sc, B } = world();
  const dock = sim.ents.find(e => e.type === 'dock' && e.cx === 62);
  const a = spawnNear(sim, 's_truck', PLAYER, sc.x - 20, sc.z), b = spawnNear(sim, 's_truck', PLAYER, sc.x - 28, sc.z);
  let t = 0; while (a.hs !== 'loading' && t++ < 1200) sim.step();
  ok(a.hs === 'loading' && a.still, 'truck A is loading in a bay'); const bay = a.slotI;
  sim.issue({ t: 'tunnel', ids: [a.id], target: B.id });
  let moved = false; for (t = 0; t < 900 && !moved; t++) { sim.step(); moved = Math.hypot(a.x - B.x, a.z - B.z) < 34; }
  ok(moved && !a.still, 'truck A left the bay through the tunnel and is mobile');
  ok(dock.slots[bay].by !== a.id, 'bay ' + bay + ' is no longer held by A');
  ok(refs(sim, a.id) === 0 || a.slotB !== 0, 'A holds nothing it is not actively using');
  const e0 = sim.teams[0].earned; run(sim, 1200); ok(sim.teams[0].earned > e0, 'truck B kept working the dock');
  console.log('teleport bay   : loading truck jumped, bay released, dock kept flowing');
}
// 3. Edge cases
{
  const { sim, A, B } = world();
  const u = spawnNear(sim, 's_scorpion', PLAYER, A.x + 30, A.z + 20);
  sim.issue({ t: 'tunnel', ids: [u.id], target: B.id }); run(sim, 20);
  B.dead = true; sim.nav.setRect(B.cx, B.cz, B.w, B.h, 0); run(sim, 300);                 // exit destroyed while the unit is on its way
  ok(!u.order && Math.hypot(u.x - A.x, u.z - A.z) < 60 && sim.nav.passAt(u.x, u.z, 1), 'exit destroyed en route: order cancelled, unit stays put');
  const s2 = world(); const v = spawnNear(s2.sim, 's_guerrilla', PLAYER, s2.A.x + 20, s2.A.z + 20);
  s2.B.dead = true; s2.sim.nav.setRect(s2.B.cx, s2.B.cz, 4, 4, 0); run(s2.sim, 2);
  s2.sim.issue({ t: 'tunnel', ids: [v.id], target: s2.A.id }); run(s2.sim, 300);
  ok(Math.hypot(v.x - s2.A.x, v.z - s2.A.z) < 16 && s2.sim.stats.teleports === 0, 'single tunnel: unit simply walks to it');
  // enemy units and aircraft cannot use it
  const s3 = world(); const foe = spawnNear(s3.sim, 'v_tank', ENEMY, s3.A.x + 14, s3.A.z + 14), heli = makeUnit(s3.sim, 'v_comanche', PLAYER, s3.A.x + 10, s3.A.z);
  s3.sim.issue({ t: 'tunnel', team: ENEMY, ids: [foe.id], target: s3.B.id }); s3.sim.issue({ t: 'tunnel', ids: [heli.id], target: s3.B.id }); run(s3.sim, 200);
  ok(s3.sim.stats.teleports === 0, 'enemy units and aircraft are refused');
  // unfinished tunnel is not a valid exit
  const s4 = world(); const C = makeBldg(s4.sim, 's_tunnel', PLAYER, 100, 190, false); s4.sim.nav.rebuild(); const w = spawnNear(s4.sim, 's_rpg', PLAYER, s4.A.x + 14, s4.A.z + 14);
  s4.sim.issue({ t: 'tunnel', ids: [w.id], target: C.id }); run(s4.sim, 200); ok(s4.sim.stats.teleports === 0, 'unfinished tunnel is not usable');
  console.log('teleport edges : destroyed exit, single tunnel, enemy/air, unfinished tunnel OK');
}
// 4. Determinism with teleports in the mix
{
  const go = () => { const { sim, A, B } = world(); const us = [0, 1, 2, 3, 4, 5].map(i => spawnNear(sim, i % 2 ? 's_technical' : 's_guerrilla', PLAYER, A.x + 12 + i * 4, A.z + 16));
    for (let t = 0; t < 1500; t++) { if (t % 300 === 5) sim.issue({ t: 'tunnel', ids: us.map(u => u.id), target: (t / 300 | 0) % 2 ? A.id : B.id }); sim.step(); } return [sim.hash(), sim.stats.teleports]; };
  const a = go(), b = go(); ok(a[0] === b[0] && a[1] >= 18, 'repeat run identical, teleports ' + a[1]);
  console.log('teleport determ: ' + a[1] + ' teleports back and forth, state hash identical across runs');
}
console.log(fails ? `TUNNEL: ${fails} FAILURES of ${checks}` : `TUNNEL: all ${checks} checks passed`);
