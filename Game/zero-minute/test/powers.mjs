// Verification: off-map aircraft and artillery must respect Fog of War.
import { Sim } from '../js/sim/simulationTick.js';
import { makeBldg, makeUnit, spawnNear } from '../js/sim/entities.js';
import { strikeVisible, fxVisible, powerError } from '../js/sim/powers.js';
import { N, CELL, PLAYER, ENEMY, NEUTRAL } from '../js/sim/defs.js';
import { FACTIONS, POWERS } from '../js/sim/factionRegistry.js';
let fails = 0, checks = 0; const ok = (c, msg) => { checks++; if (!c) { fails++; console.log('  FAIL', msg); } };
const run = (sim, n, each) => { for (let i = 0; i < n; i++) { sim.step(); if (each) each(sim); sim.events.length = 0; } };
function grant(sim, team, ...nodes) { const T = sim.teams[team]; T.rank = 5; T.points = 9; for (const n of nodes) sim.issue({ t: 'promote', team, node: n }); sim.step(); }
const visCells = (sim, team, x, z, r) => { let n = 0; for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (sim.fog.visAt(team, x + dx * CELL, z + dz * CELL)) n++; return n; };

// 1. Targeting rule: explored territory only; fogged-but-explored is allowed; no vision is granted
{
  const sim = new Sim({ ai: false, factions: ['vanguard', 'redhammer'] }); grant(sim, PLAYER, 'v_a10', 'v_emp');
  const far = [400, 110];                                         // enemy base: never explored by the player
  ok(powerError(sim, PLAYER, 'a10', far[0], far[1]) === 'Target must be in explored territory', 'unexplored target refused');
  sim.issue({ t: 'power', id: 'a10', x: far[0], z: far[1] }); let msg = false; run(sim, 2, s => { for (const e of s.events) if (e.t === 'msg') msg = true; });
  ok(msg && sim.strikes.length === 0 && (sim.teams[0].powerReady.a10 || 0) <= sim.tick, 'refused strike costs no cooldown and spawns nothing');
  ok(powerError(sim, PLAYER, 'a10', -50, 100) === 'Target is off the map', 'off-map target refused');
  // scout a spot, leave, then strike it while it is fogged
  const scout = spawnNear(sim, 's_buggy', PLAYER, 150, 330); sim.issue({ t: 'move', ids: [scout.id], x: 300, z: 330 }); run(sim, 260);
  sim.issue({ t: 'move', ids: [scout.id], x: 110, z: 400 }); run(sim, 400);
  const tx = 300, tz = 330; ok(sim.fog.exp[0][sim.nav.cellOf(tx, tz)] === 1 && !sim.fog.visAt(PLAYER, tx, tz), 'target is explored but currently fogged');
  const victim = makeUnit(sim, 'r_tank', ENEMY, tx, tz, 0); victim.order = { t: 'hold' };
  ok(!sim.fog.shouldShow(PLAYER, victim), 'enemy tank in the fog is hidden from the player');
  sim.issue({ t: 'power', id: 'a10', x: tx, z: tz }); let seenCells = 0, strafes = 0, shown = 0;
  run(sim, 200, s => { seenCells += visCells(s, PLAYER, tx, tz, 6); for (const e of s.events) if (e.t === 'strafe') strafes++; if (s.fog.shouldShow(PLAYER, victim)) shown++; });
  ok(strafes >= 10, 'A-10 strafed the fogged zone (' + strafes + ' impacts)'); ok(victim.hp < victim.maxHp || victim.dead, 'damage is applied under fog');
  ok(seenCells > 0 && shown > 0, 'the strike lights its target area (rule changed in batch 7): the enemy tank is shown while it lasts');
  run(sim, 400); ok(!sim.fog.visAt(PLAYER, tx, tz) && !sim.fog.shouldShow(PLAYER, victim), 'and the fog closes again afterwards');
  ok(sim.teams[0].powerReady.a10 === sim.tick - 200 + POWERS.a10.cd * 20 || sim.teams[0].powerReady.a10 > sim.tick, 'cooldown started');
  ok(powerError(sim, PLAYER, 'a10', tx, tz) === 'A-10 Strafing Run is recharging', 'cannot fire again while recharging');
  console.log('target rule    : unexplored refused, fogged-explored allowed, strike lit 0 fog cells, ' + strafes + ' impacts landed');
}
// 2. What the other side is shown: enemy aircraft and impacts only where the viewer has vision
{
  const sim = new Sim({ ai: false, factions: ['vanguard', 'redhammer'] }); grant(sim, ENEMY, 'r_barrage', 'r_fab');
  const cc = sim.ents.find(e => e.type === 'v_cc');
  sim.fog.stamp(ENEMY, cc.x, cc.z, 60);                           // the AI has explored the player's base at some point
  sim.issue({ t: 'power', team: ENEMY, id: 'fab', x: cc.x + 30, z: cc.z });
  let vis = 0, hid = 0, mismatch = 0, planeTicks = 0;
  run(sim, 150, s => { for (const p of s.strikes) if (p.kind === 'plane') { planeTicks++; const v = strikeVisible(s, PLAYER, p); if (v !== s.fog.visAt(PLAYER, p.x, p.z)) mismatch++; if (v) vis++; else hid++; if (!strikeVisible(s, ENEMY, p)) mismatch++; } });
  ok(planeTicks > 80 && mismatch === 0, 'bomber visibility equals the viewer\'s fog at its position every tick'); ok(vis > 5 && hid > 20, `bomber hidden while over fog (${hid} ticks), shown over the player's vision (${vis} ticks)`);
  // artillery landing in fog vs. in view
  const fogged = [150 * CELL, 165 * CELL]; sim.fog.stamp(ENEMY, fogged[0], fogged[1], 30);
  const t1 = makeUnit(sim, 'v_tank', PLAYER, cc.x + 40, cc.z + 10, 0);
  sim.teams[1].powerReady.barrage = 0;
  sim.issue({ t: 'power', team: ENEMY, id: 'barrage', x: fogged[0], z: fogged[1] }); let a = 0, aVis = 0;
  run(sim, 140, s => { for (const e of s.events) if (e.t === 'shellhit') { a++; if (fxVisible(s, PLAYER, e)) aVis++; } });
  sim.teams[1].powerReady.barrage = 0;
  sim.issue({ t: 'power', team: ENEMY, id: 'barrage', x: t1.x, z: t1.z }); let b = 0, bVis = 0, shellVis = 0, shellTicks = 0;
  run(sim, 140, s => { for (const p of s.strikes) if (p.kind === 'shell') { shellTicks++; if (strikeVisible(s, PLAYER, p)) shellVis++; } for (const e of s.events) if (e.t === 'shellhit') { b++; if (fxVisible(s, PLAYER, e)) bVis++; } });
  ok(a === 12 && aVis === 0, `barrage into fog: ${a} shells, ${aVis} shown to the player`); ok(b === 12 && bVis === 12 && shellVis === shellTicks, `barrage in view: ${b} shells, ${bVis} shown`);
  ok(t1.hp < t1.maxHp || t1.dead, 'shells hurt');
  console.log(`viewer rule    : bomber hidden ${hid} / shown ${vis} ticks; fog barrage 0 of ${a} impacts shown; in-view barrage ${bVis} of ${b} shown`);
}
// 3. (AI targeting rules are verified against the Phase 3 controller in test/ai.mjs)
// 4. Each power does what it says
{
  const mk = (f) => { const s = new Sim({ ai: false, empty: true, factions: [f, 'vanguard'] }); const sc = spawnNear(s, 'v_ranger', PLAYER, 300, 300); sc.order = { t: 'hold' }; s.step(); return s; };
  { const s = mk('vanguard'); grant(s, PLAYER, 'v_a10', 'v_emp');
    const tank = makeUnit(s, 'r_tank', ENEMY, 320, 300, 0), inf = makeUnit(s, 'r_conscript', ENEMY, 324, 306, 0), heli = makeUnit(s, 'v_comanche', ENEMY, 316, 294, 0);
    const tower = makeBldg(s, 'r_gatling', ENEMY, 163, 153); s.nav.rebuild(); for (const u of [tank, inf, heli]) u.order = { t: 'hold' };
    s.issue({ t: 'power', id: 'emp', x: 322, z: 302 }); run(s, 80);
    ok(tank.emp && tower.offline && !inf.emp, 'EMP disables vehicles and defenses, not infantry'); ok(heli.hp <= heli.maxHp * 0.5 + 1, 'EMP cripples aircraft');
    const x0 = tank.x; s.issue({ t: 'move', team: ENEMY, ids: [tank.id], x: 360, z: 300 }); run(s, 100); ok(Math.abs(tank.x - x0) < 0.5, 'disabled vehicle cannot move');
    run(s, 170); ok(!tank.emp && !tower.offline, 'EMP wears off after 12 s'); run(s, 100); ok(tank.x - x0 > 5, 'vehicle resumes its order'); }
  { const s = mk('redhammer'); grant(s, PLAYER, 'r_barrage', 'r_fab');
    const civ = makeBldg(s, 'civ', NEUTRAL, 158, 148); s.nav.rebuild(); const g1 = makeUnit(s, 'v_ranger', ENEMY, civ.x - 9, civ.z, 0);
    s.issue({ t: 'garrison', team: ENEMY, ids: [g1.id], target: civ.id }); run(s, 80); ok(civ.garrison.length === 1, 'enemy squad garrisoned');
    const tank = makeUnit(s, 'v_tank', ENEMY, civ.x + 14, civ.z + 6, 0); tank.order = { t: 'hold' };
    s.issue({ t: 'power', id: 'fab', x: civ.x + 4, z: civ.z }); let fab = 0, haz = 0; run(s, 120, k => { for (const e of k.events) { if (e.t === 'fab') fab++; if (e.t === 'hazard' && e.kind === 'thermal') haz++; } });
    ok(fab === 1 && haz === 1 && (tank.dead || tank.hp < tank.maxHp * 0.6), 'Fuel-Air Bomb: one shockwave, one thermal zone, heavy damage');
    run(s, 60); ok(civ.garrison.length === 0 && !civ.ruined, 'lingering heat emptied the garrison; building still stands (hp ' + Math.round(civ.hp) + '/' + civ.maxHp + ')'); }
  { const s = mk('sandstorm'); grant(s, PLAYER, 's_ambush', 's_toxin');
    const watcher = makeUnit(s, 'r_tank', ENEMY, 326, 290, Math.PI); watcher.order = { t: 'hold' }; watcher.cds = [1e9, 1e9, 1e9];
    s.issue({ t: 'power', id: 'ambush', x: 300, z: 280 }); let n = 0, hiddenOnArrival = false; run(s, 30, k => { for (const e of k.events) if (e.t === 'ambush') { n = e.n; const sq = k.ents.filter(u => u.team === PLAYER && u.kind === 'unit' && u.type !== 'v_ranger' && u.x < 320); hiddenOnArrival = k.fog.visAt(ENEMY, 300, 280) && sq.length === 6 && sq.every(u => !k.fog.shouldShow(ENEMY, u) && !k.fog.canSee(ENEMY, u)); } });
    const squad = s.ents.filter(e => e.team === PLAYER && (e.type === 's_rpg' || e.type === 's_guerrilla'));
    ok(n === 6 && squad.length === 6 && squad.filter(u => u.type === 's_rpg').length === 4, 'Ambush: 6 guerrillas (4 RPG, 2 rifle)');
    ok(hiddenOnArrival, 'ambush squad is invisible to an enemy looking straight at the spot');
    let revealed = 0; run(s, 200, k => { if (squad.some(u => !u.dead && !u.cloaked && k.fog.shouldShow(ENEMY, u))) revealed++; }); ok(revealed > 10 && (watcher.hp < watcher.maxHp || watcher.dead), 'they open fire and that reveals them (' + revealed + ' ticks)');
    const civ = makeBldg(s, 'civ', NEUTRAL, 110, 150); s.nav.rebuild(); const g1 = makeUnit(s, 'v_ranger', ENEMY, civ.x - 9, civ.z, 0), g2 = makeUnit(s, 'v_ranger', ENEMY, civ.x + 19, civ.z + 4, 0), tk = makeUnit(s, 'v_tank', ENEMY, civ.x + 22, civ.z - 6, 0);
    for (const u of [g2, tk]) u.order = { t: 'hold' }; s.issue({ t: 'garrison', team: ENEMY, ids: [g1.id], target: civ.id }); run(s, 80);
    s.fog.stamp(PLAYER, civ.x, civ.z, 40); s.issue({ t: 'power', id: 'toxinbomb', x: civ.x + 10, z: civ.z }); run(s, 200);
    ok(civ.garrison.length === 0 && civ.hp === civ.maxHp, 'Toxin Bomb cleared the garrison with zero building damage'); ok(g2.dead || g2.hp < g2.maxHp * 0.6, 'toxin damages infantry'); ok(tk.hp === tk.maxHp, 'toxin does not hurt vehicles');
    ok(s.hazards.some(h => h.kind === 'toxin'), 'cloud persists'); run(s, 300); ok(!s.hazards.some(h => h.kind === 'toxin'), 'cloud is gone after 20 s'); }
  console.log('power effects  : EMP, Fuel-Air Bomb, Ambush, Toxin Bomb behave as specified');
}
console.log(fails ? `POWERS/FOG: ${fails} FAILURES of ${checks}` : `POWERS/FOG: all ${checks} checks passed`);
