// Batch 5: faction names, six generals and their units, the Forest River map (water, bridges, trees), building kinds.
import { Sim } from '../js/sim/simulationTick.js';
import { makeUnit, makeBldg, kill } from '../js/sim/entities.js';
import { completeBldg } from '../js/sim/econ.js';
import { generateMap, validateMap, FOREST_MAP, OPEN_MAP, DEFAULT_MAP, CIV_KINDS, cloneSpec } from '../js/sim/map.js';
import { CELL, N, PLAYER, ENEMY } from '../js/sim/defs.js';
import { UNITS, BLDGS, POWERS, FACTIONS, GENERALS, generalsOf, trainsOf, upgradesOf, unitCost } from '../js/sim/factionRegistry.js';
import { hasPower, powerError } from '../js/sim/powers.js';
import { slotsOf } from '../js/sim/combat.js';
import { ReplayRecorder, verifyReplay } from '../js/sim/replayManager.js';
let fails = 0, checks = 0; const ok = (c, msg) => { checks++; if (!c) { fails++; console.log('  FAIL', msg); } };
const run = (sim, n, each) => { for (let i = 0; i < n; i++) { sim.step(); if (each) each(sim.events); sim.events.length = 0; } };
const open = (sim) => { sim.fog.exp[0].fill(1); sim.fog.exp[1].fill(1); };
const bare = (o = {}) => { const s = new Sim({ ai: false, empty: true, map: OPEN_MAP, ...o }); open(s); return s; };
const hold = (u) => { u.order = { t: 'hold' }; return u; };

// ---------------------------------------------------------------- A. names and the roster of generals
{
  ok(FACTIONS.vanguard.name === 'United States' && FACTIONS.redhammer.name === 'China' && FACTIONS.sandstorm.name === 'ISIS', 'factions are United States, China and ISIS');
  ok(['vanguard', 'redhammer', 'sandstorm', 'ursa', 'aegis'].every(f => generalsOf(f).length === 2) && Object.keys(GENERALS).length === 10, 'two generals per faction, ten in all');
  const names = Object.values(GENERALS).map(g => g.name);
  ok(['General Drudgereport.com', "Secretary Yuec'an Tsie Mie", 'General Tsao, Chicken', 'EWSAMA BEN ALLADIN', 'Nuclear Nadal'].every(n => names.includes(n)), 'five generals carry the names given, letter for letter');
  const s = new Sim({ ai: false, factions: ['vanguard', 'redhammer'], generals: ['mass', 'airforce'] });
  ok(s.teams[0].general === null && s.teams[1].general === null, "a general from the wrong faction is refused");
  console.log('generals       : ' + Object.entries(GENERALS).map(([k, g]) => `${FACTIONS[g.faction].name}: ${g.name} (${g.title})`).join(' | '));
}

// ---------------------------------------------------------------- B. building kinds
{
  ok(CIV_KINDS.length === 10, 'ten building types to choose from');
  const spec = cloneSpec(OPEN_MAP); spec.civs = [[118, 100, 6], [100, 150, 9], [90, 120, 4]];
  const s = new Sim({ ai: false, map: spec }), civs = s.ents.filter(e => e.type === 'civ');
  ok(civs.length === 6 && civs.map(c => c.variant).sort().join() === '4,4,6,6,9,9', 'a placed building keeps the type chosen for it, and so does its mirror twin');
  const d = new Sim({ ai: false }); ok(d.ents.filter(e => e.type === 'civ').map(c => c.variant).join() === '0,1,2,3', 'Desert Canyon keeps its four original buildings');
  ok(civs.every(c => c.variant >= 0 && c.variant < CIV_KINDS.length), 'every building has a type the renderer knows (unknown types were what drew white boxes)');
}

// ---------------------------------------------------------------- C. Forest River map
{
  const v = validateMap(FOREST_MAP), m = v.map; let wet = 0; for (let i = 0; i < N * N; i++) wet += m.water[i];
  ok(v.ok && m.biome === 'woods' && m.hasWater && wet > 2000 && m.bridges.length === 4 && m.trees.length / 3 > 1500, `valid; ${wet} water cells, ${m.bridges.length} bridge spans (3 crossings), ${m.trees.length / 3} trees`);
  let bad = 0; for (let i = 0; i < m.trees.length; i += 3) { const k = Math.floor(m.trees[i + 1] / CELL) * N + Math.floor(m.trees[i] / CELL); if (m.blocked[k] || m.water[k]) bad++; }
  ok(bad === 0, 'no tree stands in water or on a cliff');
  const nb = cloneSpec(FOREST_MAP); nb.bridges = []; ok(!validateMap(nb).ok && validateMap(nb).errors.some(e => /no ground route/.test(e)), 'without bridges the validator refuses the map: no ground route');
  ok(validateMap(DEFAULT_MAP).map.trees.length === 0 && !validateMap(DEFAULT_MAP).map.hasWater, 'the desert maps are unchanged: no water, no trees');
  const g = new Sim({ ai: 'both', difficulty: ['hard', 'medium'], factions: ['vanguard', 'redhammer'], map: FOREST_MAP, money: 10000 });
  const side = (e) => (e.x / CELL - 128) * 0.6 - (e.z / CELL - 128) * 0.8;   // sign tells which bank of the river a point is on
  let crossed = 0, nan = 0; run(g, 12000, () => { if (g.tick % 200 === 0) for (const e of g.ents) if (e.kind === 'unit' && !e.air && e.team === 0 && side(e) > 12) crossed++; });
  for (const e of g.ents) if (!(e.x === e.x)) nan++;
  const T = g.teams; ok(T[0].built > 8 && T[1].built > 8 && T[0].earned > 2000 && T[1].earned > 2000 && nan === 0, `both AIs build and harvest in the woods (built ${T[0].built}/${T[1].built}, harvested $${T[0].earned}/$${T[1].earned})`);
  ok(crossed > 0 && T[0].unitsKilled + T[1].unitsKilled > 0, `armies cross the bridges and fight (${T[0].unitsKilled + T[1].unitsKilled} units destroyed)`);
  let swim = 0; for (const e of g.ents) if (e.kind === 'unit' && !e.air && m.water[Math.floor(e.z / CELL) * N + Math.floor(e.x / CELL)]) swim++;
  ok(swim === 0, 'no ordinary ground unit ends up in the river');
  console.log(`forest map     : ${wet} water cells, 3 crossings, ${m.trees.length / 3} trees | 10 min AI v AI: built ${T[0].built}/${T[1].built}, ${T[0].unitsKilled + T[1].unitsKilled} units destroyed, 0 in the water`);
}

// ---------------------------------------------------------------- D1. Air Force General
{
  const s = bare({ factions: ['vanguard', 'redhammer'], generals: ['airforce', null] }), T = s.teams[0]; T.money = 20000;
  ok(trainsOf(T, 'v_airfield').includes('v_f15') && upgradesOf(T, 'v_airfield').includes('v_stealthrotor') && !trainsOf(s.teams[1], 'r_airfield').includes('v_f15'), 'F-15E and Stealth Comanche appear at the Air Field, for this general only');
  const none = bare({ factions: ['vanguard', 'redhammer'] }); none.teams[0].money = 9000; const af0 = makeBldg(none, 'v_airfield', PLAYER, 40, 60); makeBldg(none, 'v_factory', PLAYER, 70, 60); none.nav.rebuild();
  none.issue({ t: 'train', id: af0.id, type: 'v_f15' }); run(none, 2); ok(af0.queue.length === 0 && none.teams[0].money === 9000, 'without the general the F-15E cannot be ordered');
  const af = makeBldg(s, 'v_airfield', PLAYER, 40, 60); makeBldg(s, 'v_factory', PLAYER, 70, 60); for (let i = 0; i < 3; i++) makeBldg(s, 'v_power', PLAYER, 40 + i * 10, 90); s.nav.rebuild();
  const jet = makeUnit(s, 'v_f15', PLAYER, af.x, af.z, 0), bunker = makeBldg(s, 'r_barracks', ENEMY, 150, 60), hp0 = bunker.hp; makeUnit(s, 'v_drone', PLAYER, bunker.x - 18, bunker.z, 0); s.nav.rebuild(); run(s, 5);
  s.issue({ t: 'attack', ids: [jet.id], target: bunker.id }); let minAmmo = 2; run(s, 700, () => { minAmmo = Math.min(minAmmo, jet.ammo); });
  ok(minAmmo === 0 && (bunker.dead || hp0 - bunker.hp >= 1000), `F-15E drops both bunker busters: ${bunker.dead ? 'building destroyed' : Math.round(hp0 - bunker.hp) + ' damage'} of ${hp0} hp`);
  const foeHeli = makeUnit(s, 'r_hind', ENEMY, af.x + 60, af.z + 10, 0); hold(foeHeli); makeUnit(s, 'v_drone', PLAYER, foeHeli.x - 10, foeHeli.z, 0); run(s, 400);
  s.issue({ t: 'attack', ids: [jet.id], target: foeHeli.id }); run(s, 400); ok(foeHeli.hp === foeHeli.maxHp && jet.as === 'parked', 'it cannot attack aircraft: the order is refused');
  T.promos.add('v_strike'); ok(hasPower(s, PLAYER, 'b2') && !hasPower(s, PLAYER, 'tomahawk') && hasPower(none, PLAYER, 'tomahawk') === false, 'the Tomahawk Strike promotion gives this general the B-2 Fuel-Air Bomb instead');
  let hits = []; s.issue({ t: 'power', id: 'b2', x: 300, z: 300 }); run(s, 500, (ev) => { for (const e of ev) if (e.t === 'fab') hits.push([e.x, e.z, e.r]); });
  ok(hits.length === 1 && Math.hypot(hits[0][0] - 300, hits[0][1] - 300) < 2 && hits[0][2] === POWERS.fab.radius, `the B-2 power drops one fuel-air bomb on the aim point (the carpet bomb belongs to the buildable B-2 now)`);
  const heli = makeUnit(s, 'v_comanche', PLAYER, 200, 200, 0); s.issue({ t: 'train', id: af.id, type: 'up:v_stealthrotor' }); run(s, 500);
  const heli2 = makeUnit(s, 'v_comanche', PLAYER, 210, 200, 0); run(s, 40);
  ok(T.upgrades.has('v_stealthrotor') && heli.stealthMode === 'always' && heli.cloaked && heli2.cloaked, 'Stealth Comanche upgrade hides Comanches already flying and new ones');
  console.log(`air force      : F-15E 2 bombs, ${bunker.dead ? 'kill' : Math.round(hp0 - bunker.hp) + ' dmg'}; no air-to-air | B-2 power: ${hits.length} fuel-air bomb | Comanches cloaked`);
}

// ---------------------------------------------------------------- D2. Marine Corps General
{
  const mk = (gen) => { const s = new Sim({ ai: false, empty: true, map: FOREST_MAP, factions: ['vanguard', 'redhammer'], generals: [gen, null] }); open(s); return s; };
  const s = mk('marine'), T = s.teams[0];
  const lav = makeUnit(s, 'v_lav', PLAYER, 28, 120, 0), inf = makeUnit(s, 'v_ranger', PLAYER, 30, 124, 0), tank = makeUnit(s, 'v_tank', PLAYER, 26, 116, 0);
  ok(lav.nc === 3 && inf.nc === 2 && tank.nc === 1, 'LAV-25 and infantry are amphibious; the Abrams is not');
  const o = mk(null); ok(makeUnit(o, 'v_ranger', PLAYER, 30, 124, 0).nc === 0, 'other generals get no amphibious infantry');
  const goal = { x: 36, z: 60 }; for (const u of [lav, inf, tank]) s.issue({ t: 'move', ids: [u.id], x: goal.x, z: goal.z });
  let tLav = -1, tInf = -1, tTank = -1, wetLav = 0; const W = s.map.water;
  run(s, 2400, () => { if (W[Math.floor(lav.z / CELL) * N + Math.floor(lav.x / CELL)]) wetLav++; if (tLav < 0 && Math.hypot(lav.x - goal.x, lav.z - goal.z) < 14) tLav = s.tick; if (tInf < 0 && Math.hypot(inf.x - goal.x, inf.z - goal.z) < 14) tInf = s.tick; if (tTank < 0 && Math.hypot(tank.x - goal.x, tank.z - goal.z) < 14) tTank = s.tick; });
  ok(tLav > 0 && wetLav > 20 && tInf > 0, `LAV-25 swims straight across (${(tLav / 20).toFixed(0)} s, ${wetLav} ticks in the water); infantry follow (${(tInf / 20).toFixed(0)} s)`);
  ok(tTank > tLav * 1.5, `the tank must go round by the bridge (${(tTank / 20).toFixed(0)} s)`);
  ok(trainsOf(T, 'v_factory').includes('v_lav') && upgradesOf(T, 'v_factory').includes('v_tow') && slotsOf(lav).join() === 'lav_gun', 'LAV-25 and the TOW upgrade are at the War Factory; no TOW before the upgrade');
  const d = bare({ factions: ['vanguard', 'redhammer'], generals: ['marine', null] }); d.teams[0].money = 9000;
  const fac = makeBldg(d, 'v_factory', PLAYER, 40, 60); for (let i = 0; i < 2; i++) makeBldg(d, 'v_power', PLAYER, 40 + i * 10, 90); d.nav.rebuild(); const l2 = makeUnit(d, 'v_lav', PLAYER, 200, 200, 0), foe = hold(makeUnit(d, 'r_overlord', ENEMY, 226, 200, Math.PI)); run(d, 6); foe.cds = [1e9, 1e9, 1e9];
  d.issue({ t: 'attack', ids: [l2.id], target: foe.id }); run(d, 300, () => { foe.cds[0] = 1e9; }); const before = foe.maxHp - foe.hp;
  d.issue({ t: 'train', id: fac.id, type: 'up:v_tow' }); run(d, 420, () => { foe.cds[0] = 1e9; }); foe.hp = foe.maxHp; run(d, 300, () => { foe.cds[0] = 1e9; }); const after = foe.maxHp - foe.hp;
  ok(slotsOf(l2).includes('tow') && after > before * 4, `TOW upgrade: damage to a heavy tank in 15 s goes from ${Math.round(before)} to ${Math.round(after)}`);
  console.log(`marines        : LAV-25 across the river in ${(tLav / 20).toFixed(0)} s, tank ${(tTank / 20).toFixed(0)} s by bridge | TOW: ${Math.round(before)} -> ${Math.round(after)} damage in 15 s`);
}

// ---------------------------------------------------------------- D3. Cyber General and D4. Mass Assault General
{
  const s = new Sim({ ai: false, factions: ['redhammer', 'vanguard'], generals: ['cyber', null] }), T = s.teams[0], E = s.teams[1];
  const ecc = s.ents.find(e => e.kind === 'bldg' && e.team === ENEMY), eb = s.ents.find(e => e.kind === 'unit' && e.team === ENEMY && UNITS[e.type].builder);
  run(s, 8); ok(!s.fog.canSee(PLAYER, ecc), 'at the start the Cyber General sees no more of the enemy base than anyone else');
  const far = makeUnit(s, 'v_tank', ENEMY, ecc.x - 120, ecc.z + 40, 0); run(s, 8); ok(!s.fog.canSee(PLAYER, far), 'but not enemy units away from their buildings');
  const n = new Sim({ ai: false, factions: ['redhammer', 'vanguard'] }); run(n, 8); ok(!n.fog.canSee(PLAYER, n.ents.find(e => e.kind === 'bldg' && e.team === ENEMY)), 'other generals see nothing of the enemy base');
  const sup = makeBldg(s, 'v_supply', ENEMY, ecc.cx - 14, ecc.cz + 2); s.nav.rebuild(); run(s, 8);
  const spy = makeUnit(s, 'r_scout', PLAYER, ecc.x - 30, ecc.z + 30, 0); spy.order = { t: 'hold' }; run(s, 8);   // a scout finds the base, then is lost
  ok(ecc.seen[PLAYER] && sup.seen[PLAYER], 'a scout finds the enemy Command Center and Supply Center'); spy.dead = true; run(s, 8);
  ok(!s.fog.canSee(PLAYER, ecc), 'before 5:00 the watch is not running: with the scout gone the base is out of sight again');
  ok(T.promos.has('r_hack') && hasPower(s, PLAYER, 'cashhack') && powerError(s, PLAYER, 'cashhack', sup.x, sup.z) !== null && Math.abs(T.powerReady.cashhack / 20 - 180) < 1, 'starts with Cash Hack, which begins the match on its 180 s recharge');
  run(s, 180 * 20); E.money = 9000; const m0 = T.money;
  run(s, 125 * 20);
  ok(s.tick >= 300 * 20 && s.fog.canSee(PLAYER, ecc) && s.fog.visAt(PLAYER, ecc.x + 14, ecc.z) && s.fog.canSee(PLAYER, sup), 'from 5:00 on it sees every enemy building it has found, and the ground beside it, with nobody there');
  const hidden = makeBldg(s, 'v_power', ENEMY, ecc.cx + 40, ecc.cz - 30); s.nav.rebuild(); run(s, 8);
  ok(!s.fog.canSee(PLAYER, hidden), 'a building it has never found stays hidden');
  ok(powerError(s, PLAYER, 'cashhack', sup.x, sup.z) === null, 'so it can aim Cash Hack at once: it already sees the enemy supply building');
  s.issue({ t: 'power', id: 'cashhack', x: sup.x, z: sup.z }); run(s, 2);
  ok(T.money === m0 + 2000 && E.money === 7000, 'Cash Hack takes $2,000 (others take $1,500)');
  ok(Math.abs((T.powerReady.cashhack - s.tick) / 20 - 180) < 1, 'and recharges in 180 s (others: 240 s)');
  ok(unitCost(T, 'r_tank') === 800 && unitCost(T, 'r_conscript') === 270 && unitCost(T, 'r_mig') === UNITS.r_mig.cost, 'Cyber pays 14% more for tanks and infantry; aircraft are unchanged');
  const M = new Sim({ ai: false, factions: ['redhammer', 'vanguard'], generals: ['mass', null] }), TM = M.teams[0], TN = n.teams[0];
  ok(unitCost(TM, 'r_tank') === 640 && unitCost(TN, 'r_tank') === 700 && unitCost(TM, 'r_overlord') === 1840 && unitCost(TM, 'r_conscript') < unitCost(TN, 'r_conscript') && unitCost(TM, 'r_mig') === UNITS.r_mig.cost, 'tanks and infantry cost 8% less; aircraft do not');
  const fac = makeBldg(M, 'r_factory', PLAYER, 60, 180); M.nav.rebuild(); TM.money = 5000; M.issue({ t: 'train', id: fac.id, type: 'r_tank' }); run(M, 2);
  ok(TM.money === 4360, 'the discounted price is what is charged'); M.issue({ t: 'cancel', id: fac.id, idx: 0 }); run(M, 2); ok(TM.money === 5000 && fac.queue.length === 0, 'and what is refunded');
  console.log(`cyber / mass   : from 5:00 a permanent watch on enemy buildings it has found; Cash Hack $2,000 / 180 s | tank $${unitCost(TM, 'r_tank')} (normal $${unitCost(TN, 'r_tank')}), Overlord $${unitCost(TM, 'r_overlord')}`);
}

// ---------------------------------------------------------------- D5. Stealth General and D6. WMD General
{
  const s = bare({ factions: ['sandstorm', 'vanguard'], generals: ['stealth', null] }), T = s.teams[0];
  ok(trainsOf(T, 's_barracks').includes('s_bomber') && trainsOf(T, 's_barracks').includes('s_fpv'), 'Suicide Bomber and FPV Attack Drone at the Barracks');
  const g = makeUnit(s, 's_guerrilla', PLAYER, 200, 200, 0), tech = makeUnit(s, 's_technical', PLAYER, 206, 200, 0); run(s, 45);
  ok(g.cloaked && tech.cloaked, 'infantry and light vehicles are hidden once they stand still'); s.issue({ t: 'move', ids: [g.id], x: 230, z: 200 }); run(s, 20); ok(!g.cloaked, 'and seen again when they move');
  const pl = bare({ factions: ['sandstorm', 'vanguard'] }); const g2 = makeUnit(pl, 's_guerrilla', PLAYER, 200, 200, 0); run(pl, 45); ok(!g2.cloaked, 'other generals do not get this');
  const tank = hold(makeUnit(s, 'v_tank', ENEMY, 260, 240, 0)); tank.cds = [1e9, 1e9, 1e9]; makeUnit(s, 's_buggy', PLAYER, 236, 232, 0);
  const b = makeUnit(s, 's_bomber', PLAYER, 215, 232, 0); run(s, 6); s.issue({ t: 'attack', ids: [b.id], target: tank.id }); let boom = 0; run(s, 200, (ev) => { tank.cds[0] = 1e9; for (const e of ev) if (e.t === 'suicide') boom++; });
  ok(boom === 1 && b.dead && tank.hp < tank.maxHp - 100, `Suicide Bomber runs in and detonates: ${Math.round(tank.maxHp - tank.hp)} damage to a tank, bomber gone`);
  const t2 = hold(makeUnit(s, 'v_tank', ENEMY, 300, 300, 0)); t2.cds = [1e9, 1e9, 1e9]; makeUnit(s, 's_buggy', PLAYER, 280, 296, 0);
  const f = makeUnit(s, 's_fpv', PLAYER, 215, 232, 0); run(s, 6); s.issue({ t: 'attack', ids: [f.id], target: t2.id }); boom = 0; run(s, 200, (ev) => { t2.cds[0] = 1e9; for (const e of ev) if (e.t === 'suicide') boom++; });
  ok(boom === 1 && f.dead && t2.hp < t2.maxHp - 80, `FPV drone flies in and detonates: ${Math.round(t2.maxHp - t2.hp)} damage`);
  const w = bare({ factions: ['sandstorm', 'vanguard'], generals: ['wmd', null] }), TW = w.teams[0]; TW.money = 9000;
  ok(trainsOf(TW, 's_factory').includes('s_scudtruck') && upgradesOf(TW, 's_market').includes('s_anthrax'), 'Scud Launcher at the Arms Dealer, Anthrax Beta at the Black Market');
  const sc = makeUnit(w, 's_scudtruck', PLAYER, 200, 200, 0), tgt = makeBldg(w, 'v_barracks', ENEMY, 152, 100); makeUnit(w, 's_buggy', PLAYER, tgt.x - 20, tgt.z, 0); w.nav.rebuild(); run(w, 6);
  const dist = Math.hypot(tgt.x - sc.x, tgt.z - sc.z); w.issue({ t: 'attack', ids: [sc.id], target: tgt.id }); let haz = 0; run(w, 300, (ev) => { for (const e of ev) if (e.t === 'hazard') haz++; });
  ok(dist > 100 && tgt.hp < tgt.maxHp && Math.hypot(sc.x - 200, sc.z - 200) < 2 && haz > 0, `Scud Launcher hits a building ${dist.toFixed(0)} m away without moving and leaves a toxin cloud`);
  const dps = (sim) => { const h = sim.hazards[sim.hazards.length - 1]; return h ? h.dps : 0; };
  const base = bare({ factions: ['sandstorm', 'vanguard'] }); const A = await import('../js/sim/abilities.js'); A.addHazard(base, 'toxin', 100, 100, 5, 5, 10, PLAYER, false); A.addHazard(w, 'toxin', 100, 100, 5, 5, 10, PLAYER, false); const d1 = dps(w);
  TW.upgrades.add('s_anthrax'); A.addHazard(w, 'toxin', 100, 100, 5, 5, 10, PLAYER, false);
  ok(dps(base) === 10 && Math.abs(d1 - 12.5) < 1e-9 && Math.abs(dps(w) - 18.75) < 1e-9, `toxin clouds: 10 damage/s normally, ${d1} for this general, ${dps(w)} with Anthrax Beta`);
  const sb = makeBldg(w, 's_scud', PLAYER, 60, 60, false); completeBldg(w, sb); ok(Math.abs((TW.powerReady.scud - w.tick) / 20 - POWERS.scud.cd * 0.8) < 1 && POWERS.scud.cd === 210, 'Scud Storm is ready in 2:48 instead of 3:30');
  console.log(`stealth / wmd  : hidden when still | bomber and FPV detonate | Scud at ${dist.toFixed(0)} m | toxin x1.25, x1.875 with Anthrax | Scud Storm 2:48`);
}

// ---------------------------------------------------------------- E. AI plays every general; replays carry them
{
  let special = 0, errors = 0; const seen = {};
  for (const [f, gens] of [[['vanguard', 'redhammer'], ['airforce', 'mass']], [['vanguard', 'sandstorm'], ['marine', 'stealth']], [['redhammer', 'sandstorm'], ['cyber', 'wmd']]]) {
    const sim = new Sim({ ai: 'both', difficulty: ['hard', 'hard'], factions: f, generals: gens, money: 25000, map: f[0] === 'vanguard' && gens[0] === 'marine' ? FOREST_MAP : undefined });
    try { run(sim, 9000, (ev) => { for (const e of ev) if (e.t === 'suicide') seen.suicide = 1; }); } catch (err) { errors++; console.log('   ', err.message); }
    for (const e of sim.ents) if (e.kind === 'unit' && ['v_f15', 'v_lav', 's_bomber', 's_fpv', 's_scudtruck'].includes(e.type)) { special++; seen[e.type] = 1; }
  }
  ok(errors === 0, 'three 7.5-minute AI matches covering all six generals run without errors');
  ok(special > 0, `the AI builds its general's own units (${Object.keys(seen).join(', ') || 'none'})`);
  const r = new Sim({ factions: ['vanguard', 'sandstorm'], generals: ['marine', 'wmd'], map: FOREST_MAP }), rec = new ReplayRecorder(r); run(r, 3000, () => rec.mark());
  const data = JSON.parse(JSON.stringify(rec.export())); ok(data.setup.generals.join() === 'marine,wmd' && verifyReplay(data).ok, 'a replay stores both generals and the map, and reproduces the match');
  console.log(`AI + replay    : all six generals played by the AI (special units seen: ${Object.keys(seen).join(', ')}) | replay with generals verified`);
}
{ // ---- the drawn buildings: every type (and an unknown type number) gets real, coloured or textured materials on every part
  const { THREE: T0 } = await import('./stub-three.mjs');
  const blob = () => { const own = {}; const p = new Proxy(function () {}, { get: (t, k) => k in own ? own[k] : typeof k === 'symbol' || k === 'then' ? undefined : (own[k] = blob()), set: (t, k, v) => { own[k] = v; return true; }, apply: () => p, construct: () => blob() }); return p; }; // stands in for anything the small Node stub lacks (textures, extra geometry types)
  for (const [k, f] of Object.entries({ multiplyScalar() { return this; }, getHex() { return this.hex; }, clone() { return new T0.Color(this.hex); }, lerp() { return this; }, offsetHSL() { return this; } })) if (!T0.Color.prototype[k]) T0.Color.prototype[k] = f;
  globalThis.THREE = new Proxy(T0, { get: (t, k) => k in t ? t[k] : typeof k === 'symbol' ? undefined : (t[k] = blob()) });
  const ctx = new Proxy({}, { get: (t, k) => k === 'canvas' ? {} : (...a) => (k === 'getImageData' || k === 'createImageData' ? { data: new Uint8ClampedArray((a[2] || a[0] || 1) * (a[3] || a[1] || 1) * 4) } : k === 'measureText' ? { width: 10 } : ctx), set: () => true });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
  const MD = await import('../js/render/models.js'); const rows = [];
  for (const k of [...CIV_KINDS.keys(), 13]) {
    const r = MD.buildModel({ kind: 'bldg', type: 'civ', variant: k, team: 2, id: 1, garrison: [] }); let n = 0, none = 0, white = 0; const walls = new Set();
    const walk = (o) => { if (o.isMesh) { n++; const m = o.material; if (!m || !m.color) none++; else { if (m.color.hex === 0xffffff && !m.map) white++; walls.add(m); } } (o.children || []).forEach(walk); }; walk(r.g);
    rows.push([k, n, none, white, walls.size]);
  }
  ok(rows.every(r => r[1] >= 4 && r[2] === 0), 'every building type draws with a material on every part: ' + rows.map(r => r[0] + ':' + r[1] + '/' + r[2]).join(' '));
  ok(rows.every(r => r[3] <= 2), 'no building is plain untextured white (a mosque dome or water tank may be white on purpose): ' + rows.map(r => r[0] + ':' + r[3]).join(' '));
  console.log(`buildings drawn: ${CIV_KINDS.length} types + an unknown type number | parts ${rows.map(r => r[1]).join(' ')} | parts with no material ${rows.reduce((a, r) => a + r[2], 0)} | plain white parts ${rows.map(r => r[3]).join(' ')}`);
}
console.log(fails ? `BATCH5: ${fails} FAILURES of ${checks}` : `BATCH5: all ${checks} checks passed`);
process.exit(fails ? 1 : 0);
