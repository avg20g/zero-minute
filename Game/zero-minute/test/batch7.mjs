// Batch 7: garrison capacity and exit, powers light up and wreck their target area, sight from captured buildings, Battlemaster model.
import { Sim } from '../js/sim/simulationTick.js';
import { makeUnit, makeBldg, spawnNear, capacityOf, kill } from '../js/sim/entities.js';
import { CELL, N, PLAYER, ENEMY, NEUTRAL } from '../js/sim/defs.js';
import { UNITS, BLDGS, POWERS, FACTIONS } from '../js/sim/factionRegistry.js';
import { usePower, REVEAL_SECS, REVEAL_PAD } from '../js/sim/powers.js';
import { CIV_KINDS } from '../js/sim/map.js';
import { ReplayRecorder, verifyReplay } from '../js/sim/replayManager.js';
let fails = 0, checks = 0; const ok = (c, msg) => { checks++; if (!c) { fails++; console.log('  FAIL', msg); } };
const run = (sim, n, each) => { for (let i = 0; i < n; i++) { sim.step(); if (each) each(sim); sim.events.length = 0; } };
const open = () => { const s = new Sim({ empty: true, ai: false }); return s; };
const civAt = (s, cx, cz, kind) => { const b = makeBldg(s, 'civ', NEUTRAL, cx, cz); b.variant = kind; s.nav.rebuild(); return b; };

{ // ---- capacity
  ok(BLDGS.civ.caps.length === CIV_KINDS.length && BLDGS.civ.caps.every(c => c >= 3), 'every building type holds at least 3 squads (it was 2): ' + CIV_KINDS.map((n, i) => n + ' ' + BLDGS.civ.caps[i]).join(', '));
  const s = open(), apt = civAt(s, 150, 150, 0), tower = civAt(s, 180, 150, 2);
  ok(capacityOf(apt) === 6 && capacityOf(tower) === 8, 'an apartment block holds 6 and an office tower 8');
  const sq = []; for (let i = 0; i < 8; i++) sq.push(spawnNear(s, 'v_ranger', PLAYER, apt.x - 20, apt.z + (i - 4) * 3));
  run(s, 2); s.issue({ t: 'garrison', ids: sq.map(u => u.id), target: apt.id }); run(s, 500);
  ok(apt.garrison.length === 6 && apt.team === PLAYER && sq.filter(u => !u.inB).length === 2, 'six squads fit; the seventh and eighth stay outside (' + apt.garrison.length + ' in)');
  // ---- taking them out
  const last = s.byId.get(apt.garrison[5]); s.issue({ t: 'evacuate', id: apt.id, count: 1 }); run(s, 3);
  ok(apt.garrison.length === 5 && !last.inB && apt.team === PLAYER, '"Take out one squad" removes only the last one in; the building stays yours');
  s.issue({ t: 'evacuate', team: ENEMY, id: apt.id }); run(s, 2); ok(apt.garrison.length === 5, 'the enemy cannot order your garrison out');
  const ids = apt.garrison.slice(), dest = [apt.x + 30, apt.z + 24]; s.issue({ t: 'evacuate', id: apt.id, x: dest[0], z: dest[1] }); run(s, 3);
  ok(apt.garrison.length === 0 && apt.team === NEUTRAL && ids.every(id => !s.byId.get(id).inB && s.byId.get(id).order && s.byId.get(id).order.t === 'move'), 'evacuate to a point: all five come out, the building is neutral again, and they are walking');
  run(s, 400); ok(ids.every(id => { const u = s.byId.get(id); return Math.hypot(u.x - dest[0], u.z - dest[1]) < 12; }), 'and they arrive at the point you clicked');
  s.issue({ t: 'garrison', ids: [ids[0], ids[1]], target: tower.id }); run(s, 400); s.issue({ t: 'evacuate', id: tower.id }); run(s, 3);
  ok(tower.garrison.length === 0 && !s.byId.get(ids[0]).inB && !s.byId.get(ids[0]).order, 'plain Evacuate: everyone out, standing by the door');
  console.log('garrison       : 6 of 8 squads fit an apartment | one out | all out to a point | all out');
}
{ // ---- powers light up the target, then it goes dark again
  const s = new Sim({ ai: false, noShroud: true, factions: ['vanguard', 'redhammer'] }); const T = s.teams[0];   // as in the game: the map is charted, but not watched
  const tx = 256, tz = 256; const foe = makeUnit(s, 'r_tank', ENEMY, tx + 6, tz, 0); run(s, 3);
  ok(!s.fog.visAt(PLAYER, tx, tz) && !s.fog.canSee(PLAYER, foe), 'before: the target area is fogged and the enemy tank in it is hidden');
  T.promos.add('v_strike'); T.powerReady.tomahawk = 0; ok(usePower(s, PLAYER, 'tomahawk', tx, tz), 'Tomahawk Strike ordered on fogged ground'); run(s, 2);
  const R = Math.max(POWERS.tomahawk.radius, 0) + REVEAL_PAD;
  ok(s.fog.visAt(PLAYER, tx, tz) && s.fog.visAt(PLAYER, tx + R - 3, tz) && !s.fog.visAt(PLAYER, tx + R + 6, tz) && s.fog.canSee(PLAYER, foe), 'at once the area is visible out to ' + R + ' m and the tank can be seen');
  ok(!s.fog.visAt(ENEMY, tx - 33, tz), 'only the team that used the power gets the view');
  run(s, REVEAL_SECS * 20 - 40); ok(s.fog.visAt(PLAYER, tx, tz), 'it stays lit for ' + REVEAL_SECS + ' s');
  run(s, 80); ok(!s.fog.visAt(PLAYER, tx, tz) && s.reveals.length === 0, 'then the fog closes again');
  for (const id of ['paradrop', 'particle']) { T.powerReady[id] = 0; }
  console.log(`power reveal   : ${R} m around the target for ${REVEAL_SECS} s, own team only`);
}
{ // ---- powers wreck civilian buildings: empty, enemy-held; yours are spared
  const s = new Sim({ ai: false, noShroud: true, factions: ['redhammer', 'vanguard'] }); const T = s.teams[0];
  const cx = 128, cz = 128, empty = civAt(s, cx - 10, cz - 3, 0), held = civAt(s, cx + 4, cz - 3, 4), mine = civAt(s, cx - 3, cz + 8, 5);
  const e1 = spawnNear(s, 'v_ranger', ENEMY, held.x, held.z + 10), m1 = spawnNear(s, 'r_conscript', PLAYER, mine.x, mine.z + 10); run(s, 2);
  s.issue({ t: 'garrison', team: ENEMY, ids: [e1.id], target: held.id }); s.issue({ t: 'garrison', ids: [m1.id], target: mine.id }); run(s, 200);
  ok(held.team === ENEMY && mine.team === PLAYER && empty.team === NEUTRAL, 'set-up: one empty building, one the enemy holds, one you hold');
  // a tank shell's splash does not touch an empty building (unchanged)
  const tk = makeUnit(s, 'r_tank', PLAYER, empty.x - 30, empty.z, 0), dummy = makeUnit(s, 'v_tank', ENEMY, empty.x - 9, empty.z, 0); run(s, 200);
  ok(empty.hp === empty.maxHp, 'ordinary unit fire next to an empty building still leaves it alone'); kill(s, dummy); kill(s, tk);
  T.promos.add('r_barrage'); const pid = FACTIONS.redhammer.tree.find(n => n.power === 'barrage'); T.powerReady.barrage = 0;
  ok(usePower(s, PLAYER, 'barrage', cx * CELL, cz * CELL), 'artillery barrage on the block'); run(s, 200);
  ok(empty.hp < empty.maxHp && held.hp < held.maxHp, 'the barrage damages the empty building (' + Math.round(empty.hp) + '/' + empty.maxHp + ') and the enemy-held one (' + Math.round(held.hp) + ')');
  { const q = new Sim({ ai: false, noShroud: true, factions: ['redhammer', 'vanguard'] }), own = civAt(q, cx, cz, 5), g = spawnNear(q, 'r_conscript', PLAYER, own.x, own.z + 10); run(q, 2); q.issue({ t: 'garrison', ids: [g.id], target: own.id }); run(q, 200);
    q.teams[0].promos.add('r_barrage'); q.teams[0].powerReady.barrage = 0; usePower(q, PLAYER, 'barrage', own.x, own.z); run(q, 200);
    ok(own.team === PLAYER && own.hp === own.maxHp && g.inB === own.id, 'a building you hold is spared by your own barrage, like the rest of your side'); }
  s.teams[0].powerReady.nuke = 0; const silo = makeBldg(s, 'r_silo', PLAYER, 30, 30); s.nav.rebuild(); run(s, 2); T.powerReady.nuke = 0;
  ok(usePower(s, PLAYER, 'nuke', cx * CELL, cz * CELL), 'nuclear missile on the same block'); run(s, 400);
  ok(empty.ruined && held.ruined && !e1.inB, 'the nuke levels both buildings; the enemy squad is thrown out of the ruin' + (e1.dead ? ' and dies' : ''));
  console.log('power damage   : barrage and nuke wreck empty and enemy-held buildings | own-held spared | unit fire unchanged');
}
{ // ---- captured Oil Derrick keeps watch
  const s = new Sim({ ai: false }); const dk = s.ents.filter(e => e.type === 'derrick').sort((a, b) => Math.hypot(a.x - 60, a.z - 392) - Math.hypot(b.x - 60, b.z - 392))[1];
  const sq = spawnNear(s, 'v_ranger', PLAYER, dk.x + 8, dk.z); run(s, 2); s.issue({ t: 'capture', ids: [sq.id], target: dk.id }); run(s, 400);
  ok(dk.team === PLAYER, 'derrick captured'); s.issue({ t: 'move', ids: [sq.id], x: dk.x + 140, z: dk.z }); run(s, 700);
  const far = Math.hypot(sq.x - dk.x, sq.z - dk.z);
  ok(far > 80 && s.fog.visAt(PLAYER, dk.x + 24, dk.z) && !s.fog.visAt(PLAYER, dk.x + 36, dk.z - 2), 'with the squad ' + Math.round(far) + ' m away, the derrick alone still shows the ground within about ' + Math.round(BLDGS.derrick.sight + 2 * CELL * 0.35 * 2) + ' m of it');
  const spy = makeUnit(s, 'r_tank', ENEMY, dk.x - 18, dk.z, 0); run(s, 3); ok(s.fog.canSee(PLAYER, spy), 'an enemy tank driving up to it is seen');
  console.log('derrick sight  : captured derrick watches ~' + Math.round(BLDGS.derrick.sight + 2.8) + ' m with nobody near');
}
{ // ---- replay
  const sim = new Sim({ factions: ['redhammer', 'vanguard'], difficulty: 'medium' }), rec = new ReplayRecorder(sim); sim.teams[0].promos.add('r_barrage'); 
  const civ = sim.ents.find(e => e.type === 'civ');
  for (let t = 0; t < 2000; t++) {
    if (t === 60) sim.issue({ t: 'garrison', ids: sim.ents.filter(e => e.team === PLAYER && e.kind === 'unit' && UNITS[e.type].canGarrison).map(e => e.id), target: civ.id });
    if (t === 1500) sim.issue({ t: 'evacuate', id: civ.id, x: civ.x + 30, z: civ.z, count: 1 });
    sim.step(); rec.mark(); sim.events.length = 0;
  }
  ok(verifyReplay(JSON.parse(JSON.stringify(rec.export()))).ok, 'a replay with garrison and evacuate orders reproduces the match');
}
{ // ---- Battlemaster model (shape checks live in test/models.mjs)
  const src = (await import('node:fs')).readFileSync(new URL('../js/render/modelFactory.js', import.meta.url), 'utf8');
  ok(/if \(!c\.visible\) continue;/.test(src), 'the mesh baker skips hidden parts');
}
console.log(fails ? `BATCH7: ${fails} FAILURES of ${checks}` : `BATCH7: all ${checks} checks passed`);
process.exit(fails ? 1 : 0);
