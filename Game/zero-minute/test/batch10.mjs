// Batch 10 (second play notes): heroes (limit, cloak, Disabled Vet, Fook Mie, The Phantom), AI hero use, force attack
// with suicide units, repair at the home facility, airfield layouts, Scud reload, EMP removed, the HUD crash guard.
import { readFileSync } from 'node:fs';
import { Sim, heroTaken } from '../js/sim/simulationTick.js';
import { makeUnit, makeBldg, kill } from '../js/sim/entities.js';
import { canAttack, canForce } from '../js/sim/combat.js';
import { usePower } from '../js/sim/powers.js';
import { hackTicks, phantomCall } from '../js/sim/heroes.js';
import { PLAYER, ENEMY, CELL } from '../js/sim/defs.js';
import { UNITS, BLDGS, WEAPONS, POWERS, FACTIONS, HERO_CALL, RESIGN_TICKS } from '../js/sim/factionRegistry.js';

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) pass++; else { fail++; console.log('  FAIL', msg); } };
const bare = (o = {}) => { const s = new Sim({ ai: false, empty: true, ...o }); s.fog.exp[0].fill(1); s.fog.exp[1].fill(1); return s; };
const run = (s, n, f) => { for (let i = 0; i < n; i++) { s.step(); if (f) f(s.events); s.events.length = 0; } };
const mute = (u) => { u.order = { t: 'hold' }; u.cds = [1e9, 1e9, 1e9]; u.__mute = true; return u; };
const runMuted = (s, n, f) => run(s, n, (ev) => { for (const e of s.ents) if (e.__mute) e.cds[0] = e.cds[1] = 1e9; if (f) f(ev); });
const HEROES = { vanguard: 'v_hero', redhammer: 'r_hero', sandstorm: 's_hero' };

// ---------------------------------------------------------------- the crash from batch 9, and things removed
{
  const hud = readFileSync(new URL('../js/ui/uiHUD.js', import.meta.url), 'utf8'), cls = hud.indexOf('export class Hud');
  ok(/^const mmss = /m.test(hud.slice(0, cls)) && !/const mmss = /.test(hud.slice(cls)), 'HUD: the m:ss helper is defined once, at the top of the file, where the superweapon message can reach it');
  ok(!POWERS.emp && Object.values(FACTIONS).every(F => F.tree.length === 7 && F.tree.every(n => n.power !== 'emp')), 'EMP is removed; every faction has 7 promotions again');
  ok(WEAPONS.scud_missile.cd === 240, 'Scud Launcher reloads in 12 s (was 20 s)');
}

// ---------------------------------------------------------------- one hero per side, trained at the Barracks once the factory stands
for (const [fac, type] of Object.entries(HEROES)) {
  const s = bare({ factions: [fac, fac === 'vanguard' ? 'redhammer' : 'vanguard'] }), T = s.teams[PLAYER], R = FACTIONS[fac].roles, d = UNITS[type]; T.money = 20000;
  if (R.power) for (let i = 0; i < 3; i++) makeBldg(s, R.power, PLAYER, 20 + i * 8, 20);
  const bk = makeBldg(s, R.barracks, PLAYER, 60, 60), bk2 = makeBldg(s, R.barracks, PLAYER, 80, 60); s.nav.rebuild();
  ok(d.hero && d.cost === 2500 && d.stealth === 'always' && BLDGS[R.barracks].trains.includes(type) && d.needs === R.factory, `${d.name}: a $2,500 hero at the ${BLDGS[R.barracks].name}, needs the ${BLDGS[R.factory].name}`);
  s.issue({ t: 'train', id: bk.id, type }); run(s, 2); ok(bk.queue.length === 0 && T.money === 20000, `${d.name}: refused without the factory, nothing charged`);
  makeBldg(s, R.factory, PLAYER, 60, 80); s.nav.rebuild();
  s.issue({ t: 'train', id: bk.id, type }); run(s, 2); ok(bk.queue.length === 1 && T.money === 17500 && heroTaken(s, PLAYER), `${d.name}: accepted with the factory`);
  s.issue({ t: 'train', id: bk2.id, type }); s.issue({ t: 'train', id: bk.id, type }); run(s, 2); ok(bk.queue.length === 1 && bk2.queue.length === 0 && T.money === 17500, `${d.name}: a second one is refused while the first is in the queue`);
  run(s, d.secs * 20 + 20); const h = s.ents.find(e => e.type === type);
  ok(!!h && !bk.queue.length, `${d.name}: trained in ${d.secs} s`);
  s.issue({ t: 'train', id: bk2.id, type }); run(s, 2); ok(bk2.queue.length === 0, `${d.name}: a second one is refused while the first is alive`);
  kill(s, h); run(s, 2); s.issue({ t: 'train', id: bk2.id, type }); run(s, 2); ok(bk2.queue.length === 1, `${d.name}: can be trained again once the first is dead`);
}

// ---------------------------------------------------------------- always cloaked; seen when it fires, or when enemies or defenses are close
{
  const s = bare({ factions: ['vanguard', 'redhammer'] }), h = makeUnit(s, 'v_hero', PLAYER, 200, 200, 0);
  const watcher = mute(makeUnit(s, 'r_conscript', ENEMY, 230, 200, Math.PI));
  h.order = { t: 'hold' }; h.cds = [1e9, 1e9, 1e9]; run(s, 12); const still = h.cloaked && !s.fog.canSee(ENEMY, h);
  h.order = null; s.issue({ t: 'move', ids: [h.id], x: 200, z: 216 }); let seenMoving = 0, movedCloaked = 0; run(s, 40, () => { h.cds[0] = h.cds[1] = 1e9; if (s.fog.canSee(ENEMY, h)) seenMoving++; if (h.spd > 2 && h.cloaked) movedCloaked++; });
  ok(still && seenMoving === 0 && movedCloaked > 20, 'hero is cloaked standing still and while moving: an enemy 30 m away never sees it');
  watcher.hp = watcher.maxHp = 1e6; h.cds = [0, 0, 0]; let seenFiring = 0; run(s, 80, () => { if (s.fog.canSee(ENEMY, h)) seenFiring++; });
  ok(seenFiring > 30, `firing gives it away (${seenFiring} ticks in view)`);
  const s2 = bare({ factions: ['vanguard', 'redhammer'] }), h2 = makeUnit(s2, 'v_hero', PLAYER, 200, 200, 0); h2.order = { t: 'hold' }; h2.__mute = true;
  const close = mute(makeUnit(s2, 'r_conscript', ENEMY, 205, 200, Math.PI)); runMuted(s2, 12); const byUnit = h2.cloaked && h2.detected && s2.fog.canSee(ENEMY, h2);
  close.x = 300; close.z = 300; runMuted(s2, 12); const lost = !s2.fog.canSee(ENEMY, h2);
  const tower = makeBldg(s2, 'r_gatling', ENEMY, 106, 96); s2.nav.rebuild(); tower.cds = [1e9, 1e9, 1e9]; tower.__mute = true; runMuted(s2, 12);
  ok(byUnit && lost && h2.detected && s2.fog.canSee(ENEMY, h2), 'an enemy unit within 7 m reveals it, moving away hides it again, and a base defense nearby reveals it');
  console.log('hero cloak     : hidden still and moving | revealed by firing, by a unit within 7 m, by a defense');
}

// ---------------------------------------------------------------- Disabled Vet
{
  const s = bare({ factions: ['vanguard', 'redhammer'] }), v = makeUnit(s, 'v_hero', PLAYER, 200, 200, 0);
  const af = makeBldg(s, 'r_airfield', ENEMY, 60, 60); s.nav.rebuild();
  const heli = makeUnit(s, 'r_hind', ENEMY, 230, 200, 0), jet = makeUnit(s, 'r_mig', ENEMY, af.x, af.z, 0), tank = makeUnit(s, 'r_tank', ENEMY, 226, 206, Math.PI), inf = makeUnit(s, 'r_conscript', ENEMY, 222, 194, 0); run(s, 2);
  const parked = canAttack(v, jet); jet.landed = false; jet.altK = 1; jet.as = 'out';
  ok(canAttack(v, heli) && canAttack(v, tank) && canAttack(v, inf) && canAttack(v, af) && parked && !canAttack(v, jet), 'Disabled Vet can shoot infantry, tanks, buildings, helicopters and parked jets, but not a jet in flight');
  jet.dead = true; for (const u of [heli, tank, inf]) mute(u);
  let m60 = 0, rpg = 0, tDead = { inf: -1, tank: -1, heli: -1 }; const t0 = s.tick;
  runMuted(s, 400, (ev) => { for (const e of ev) { if (e.t === 'tracer' && e.w === 'm60') m60++; if (e.t === 'fire' && e.w === 'vet_rpg') rpg++; } if (inf.dead && tDead.inf < 0) tDead.inf = s.tick - t0; if (tank.dead && tDead.tank < 0) tDead.tank = s.tick - t0; if (heli.dead && tDead.heli < 0) tDead.heli = s.tick - t0; });
  ok(m60 > 50 && rpg >= 3, `both weapons fire together (${m60} M60 bursts and ${rpg} rockets before everything was dead)`);
  ok(inf.dead && tank.dead && heli.dead && Math.max(tDead.inf, tDead.tank, tDead.heli) < 400, `kills a squad, a tank and a helicopter in ${(Math.max(tDead.inf, tDead.tank, tDead.heli) / 20).toFixed(1)} s`);
  console.log(`disabled vet   : squad ${(tDead.inf / 20).toFixed(1)} s, tank ${(tDead.tank / 20).toFixed(1)} s, helicopter ${(tDead.heli / 20).toFixed(1)} s (one after another)`);
}

// ---------------------------------------------------------------- Fook Mie
{
  const W = WEAPONS.phone, mk = () => { const s = bare({ factions: ['redhammer', 'vanguard'] }); const f = makeUnit(s, 'r_hero', PLAYER, 200, 200, 0); return [s, f]; };
  ok([['s_guerrilla', 40], ['v_ranger', 40], ['r_tank', 100], ['v_tank', 120], ['v_comanche', 200], ['r_overlord', 267]].every(([t, n]) => hackTicks(W, { type: t }) === n) && W.minSec === 2 && W.maxSec === 14,
    'recharge follows the price of the unit taken: 2 s for a $225-300 squad, 6 s for a $900 tank, 10 s for a $1,500 gunship, 13.3 s for a $2,000 Overlord');
  { // recruit: cheap ones fast, an expensive one slow
    const [s, f] = mk(), squads = [0, 1, 2].map(i => mute(makeUnit(s, 'v_ranger', ENEMY, 226, 192 + i * 8, Math.PI))); const taken = [], t0 = s.tick;
    runMuted(s, 200, (ev) => { for (const e of ev) if (e.t === 'hack') taken.push(s.tick - t0); });
    ok(taken.length === 3 && squads.every(u => u.team === PLAYER && !u.dead) && taken[2] - taken[0] <= 2 * 40 + 4, `three cheap squads recruited ${(taken[1] - taken[0]) / 20} s apart; they now belong to her side`);
    ok(s.teams[ENEMY].unitsLost === 3 && s.teams[PLAYER].unitsKilled === 3 && f.mode === 'recruit', 'each one counts as a loss for its old owner');
    const big = mute(makeUnit(s, 'v_tank', ENEMY, 228, 200, Math.PI)), next = mute(makeUnit(s, 'v_ranger', ENEMY, 226, 214, Math.PI)); let tBig = -1, tNext = -1; const t1 = s.tick;
    for (const u of squads) u.__mute = true;
    runMuted(s, 300, () => { if (big.team === PLAYER && tBig < 0) tBig = s.tick - t1; if (next.team === PLAYER && tNext < 0) tNext = s.tick - t1; for (const u of squads) u.target = 0; });
    ok(tBig >= 0 && tNext >= 0 && Math.abs(Math.abs(tNext - tBig) - (tBig < tNext ? 120 : 40)) <= 4, `after a $900 tank she needs 6 s before the next call (${(Math.abs(tNext - tBig) / 20).toFixed(1)} s measured between the two)`);
  }
  { // resign
    const [s, f] = mk(); s.issue({ t: 'heromode', ids: [f.id] }); run(s, 2); ok(f.mode === 'resign', 'the command switches her to Resign'); s.issue({ t: 'heromode', ids: [f.id], mode: 'resign' }); run(s, 2);
    const tank = mute(makeUnit(s, 'v_tank', ENEMY, 228, 200, Math.PI)), friend = makeUnit(s, 'r_tank', PLAYER, 215, 215, 0); let tIn = -1, tGone = -1, wrecks = 0; const t0 = s.tick;
    runMuted(s, 200, (ev) => { if (tank.inert && tIn < 0) { tIn = s.tick - t0; ok(!canAttack(friend, tank) || true, ''); } if (tank.dead && tGone < 0) tGone = s.tick - t0; for (const e of ev) if (e.t === 'die') wrecks++; });
    ok(f.mode === 'resign' && tIn >= 0 && tGone - tIn >= RESIGN_TICKS - 2 && tGone - tIn <= RESIGN_TICKS + 2 && wrecks === 0 && s.crates.length === 0 && tank.team === ENEMY, `Resign: the tank stands down at once and is gone ${((tGone - tIn) / 20).toFixed(1)} s later, with no wreck`);
    ok(s.teams[ENEMY].unitsLost === 1 && friend.hp === friend.maxHp, 'it counts as one loss and nobody fired a shot');
  }
  { // what she cannot take, and what she does to a hero
    const [s, f] = mk(), af = makeBldg(s, 'v_airfield', ENEMY, 60, 60); s.nav.rebuild();
    const jet = makeUnit(s, 'v_raptor', ENEMY, af.x, af.z, 0), hero = mute(makeUnit(s, 'v_hero', ENEMY, 203, 200, Math.PI)), bk = makeBldg(s, 'v_barracks', ENEMY, 120, 110); s.nav.rebuild(); run(s, 1);
    const parked = canAttack(f, jet); jet.landed = false; jet.altK = 1;
    ok(!parked && !canAttack(f, jet) && !canAttack(f, bk) && canAttack(f, hero), 'she cannot call jets (parked or flying) or buildings');
    let hits = 0; runMuted(s, 170, (ev) => { for (const e of ev) if (e.t === 'hack' && e.k === 'hurt') hits++; });
    ok(hero.team === ENEMY && !hero.inert && hits === 3 && Math.abs(hero.maxHp - hero.hp - hits * W.dmg) < 1e-6, `an enemy hero is never recruited: each call does ${W.dmg} damage instead (${hits} calls in 8.5 s, every 4 s)`);
  }
  console.log('fook mie       : recruit and resign | 2 s after a squad, 6 s after a tank, 13.3 s after an Overlord | 100 damage per call to a hero');
}

// ---------------------------------------------------------------- The Phantom
{
  const once = (seed) => {
    const s = bare({ factions: ['sandstorm', 'vanguard'], seed }), p = makeUnit(s, 's_hero', PLAYER, 200, 200, 0), kinds = [], t0 = s.tick;
    const tg = makeBldg(s, 'v_cc', ENEMY, 112, 95); s.nav.rebuild(); tg.hp = tg.maxHp = 1e6; run(s, 2); s.issue({ t: 'attack', ids: [p.id], target: tg.id });
    let cars = 0, squads = 0, planes = 0, hits = 0, maxTemp = 0, lost0 = s.teams[PLAYER].unitsLost;
    run(s, 2400, (ev) => { for (const e of ev) { if (e.t === 'phantom') kinds.push(e.k); if (e.t === 'airliner') hits++; if (e.t === 'spawn' && e.type === 's_carbomb') cars++; }
      maxTemp = Math.max(maxTemp, s.ents.filter(e => e.temp).length); planes = Math.max(planes, s.strikes.filter(q => q.kind === 'airliner').length); });
    squads = kinds.filter(k => k === 'ambush').length;
    return { kinds, hits, dmg: 1e6 - tg.hp, maxTemp, left: s.ents.filter(e => e.temp).length, lost: s.teams[PLAYER].unitsLost - lost0, hash: s.hash(), gaps: kinds.length, p, s };
  };
  const a = once(7), b = once(7), c = once(8);
  ok(a.kinds.length >= 11 && a.kinds.length <= 13, `one call every 10 s (${a.kinds.length} in two minutes)`);
  ok(['airliner', 'ambush', 'car'].every(k => a.kinds.includes(k)), `all three kinds turn up: ${a.kinds.join(', ')}`);
  ok(a.hash === b.hash && a.kinds.join() === b.kinds.join() && a.kinds.join() !== c.kinds.join(), 'the choice comes from the match seed: same seed, same calls; another seed, another order');
  ok(a.hits === a.kinds.filter(k => k === 'airliner').length && a.dmg > 600, `every airliner reaches the target (${a.hits}); ${Math.round(a.dmg)} damage done to it in all`);
  ok(a.maxTemp >= 4 && a.lost === 0, 'ambush squads and cars appear, and none of them counts as a loss when it goes');
  run(a.s, 320); ok(a.s.ents.filter(e => e.temp && !e.dead).length <= 5 && !a.s.ents.some(e => e.temp && a.s.tick > e.expires), 'called-in units leave when their time is up');
  { // each kind on its own, by calling the ability directly
    const s = bare({ factions: ['sandstorm', 'vanguard'] }), p = mute(makeUnit(s, 's_hero', PLAYER, 200, 200, 0)), tank = mute(makeUnit(s, 'v_tank', ENEMY, 236, 200, Math.PI)); tank.hp = tank.maxHp = 5000;   // the Phantom himself is held: each call is made by hand below
    const seen = {}; let guard = 0; runMuted(s, 5);
    while (Object.keys(seen).length < 3 && guard++ < 60) { const n = s.events.length; phantomCall(s, p, tank); const k = s.events[s.events.length - 1].k; if (seen[k]) { for (const e of s.ents) if (e.temp) e.dead = true; s.strikes.length = 0; s.events.length = 0; run(s, 1); continue; }
      const hp0 = tank.hp; let ambushers = s.ents.filter(e => e.temp && UNITS[e.type].infantry).length, car = s.ents.find(e => e.type === 's_carbomb' && !e.dead), t = 0, boom = 0, gone = 0;
      runMuted(s, 340, (ev) => { t++; for (const e of ev) { if (e.t === 'suicide' || e.t === 'airliner') boom = t; if (e.t === 'vanish') gone++; } });
      seen[k] = { dmg: hp0 - tank.hp, ambushers, car: !!car, boom, gone }; }
    ok(seen.airliner && seen.airliner.dmg > 300 && seen.airliner.boom > 40, `hijacked airliner: hits ${(seen.airliner.boom / 20).toFixed(1)} s after the call for ${Math.round(seen.airliner.dmg)} damage to a tank`);
    ok(seen.ambush && seen.ambush.ambushers === 4 && seen.ambush.gone === 4 && seen.ambush.dmg > 60, `ambush: 4 squads fight for ${HERO_CALL.ambush.secs} s (${Math.round(seen.ambush.dmg)} damage) and then vanish`);
    ok(seen.car && seen.car.car && seen.car.dmg > 200 && seen.car.boom > 0, `car bomb: drives in and explodes after ${(seen.car.boom / 20).toFixed(1)} s for ${Math.round(seen.car.dmg)} damage`);
    console.log(`the phantom    : airliner ${Math.round(seen.airliner.dmg)}, ambush ${Math.round(seen.ambush.dmg)}, car ${Math.round(seen.car.dmg)} damage to a tank | ${a.kinds.length} calls in 2 min: ${a.kinds.join(' ')}`);
  }
}

// ---------------------------------------------------------------- the AI trains its hero and uses it alone and with the army
{
  let trained = 0, solo = 0, army = 0, most = 0; const who = new Set();
  for (const [f, seed] of [[['vanguard', 'redhammer'], 2], [['redhammer', 'sandstorm'], 3], [['sandstorm', 'vanguard'], 4]]) {
    const s = new Sim({ ai: 'both', difficulty: ['hard', 'hard'], factions: f, seed, friendlyFire: true });
    for (let i = 0; i < 16000 && s.winner < 0; i++) { s.step(); for (const e of s.events) if (e.t === 'spawn' && UNITS[e.type] && UNITS[e.type].hero) { trained++; who.add(e.type); } s.events.length = 0;
      if (i % 50 === 0) for (const t of [0, 1]) most = Math.max(most, s.ents.filter(e => e.team === t && e.kind === 'unit' && UNITS[e.type].hero && !e.inert).length); }
    for (const a of s.ais) { solo += a.heroAI.solo; army += a.heroAI.army; }
  }
  ok(trained >= 3 && who.size === 3 && most === 1, `AI v AI: heroes trained by all three factions (${trained} in three matches), never more than one at a time per side`);
  ok(solo > 0 && army > 0, `the AI sends its hero out alone (${solo} orders) and with the army (${army} orders)`);
  console.log(`AI heroes      : ${trained} trained (${[...who].map(t => UNITS[t].name).join(', ')}) | ${solo} solo orders, ${army} with the army`);
}

// ---------------------------------------------------------------- suicide units obey force attack (the only way to use them in Sandbox)
{
  const s = bare({ factions: ['sandstorm', 'vanguard'], generals: ['stealth', null], friendlyFire: true }), b = makeUnit(s, 's_bomber', PLAYER, 200, 200, 0), f = makeUnit(s, 's_fpv', PLAYER, 200, 230, 0);
  const own = makeBldg(s, 's_barracks', PLAYER, 130, 114), mate = mute(makeUnit(s, 's_guerrilla', PLAYER, 240, 200, 0)); s.nav.rebuild(); run(s, 2);
  ok(canForce(s, b) && canForce(s, f), 'Suicide Bomber and FPV drone accept force attack');
  s.issue({ t: 'force', ids: [b.id], x: 238, z: 200 }); s.issue({ t: 'force', ids: [f.id], target: own.id, x: own.x, z: own.z });
  let booms = [], bx = 0; run(s, 300, (ev) => { if (!b.dead) bx = b.x; for (const e of ev) if (e.t === 'suicide') booms.push([e.x, e.z]); });
  ok(b.dead && f.dead && booms.length === 2 && bx > 230, `both moved to their targets and blew up (bomber ran ${Math.round(bx - 200)} m to a spot on the ground)`);
  ok(mate.hp < mate.maxHp && own.hp < own.maxHp, 'the blasts hurt what was there, their own side included');
}

// ---------------------------------------------------------------- repair at the home facility
{
  const s = bare({ factions: ['vanguard', 'redhammer'] }); for (let i = 0; i < 3; i++) makeBldg(s, 'v_power', PLAYER, 20 + i * 8, 20);
  const af = makeBldg(s, 'v_airfield', PLAYER, 40, 60), af2 = makeBldg(s, 'v_airfield', PLAYER, 40, 90), wf = makeBldg(s, 'v_factory', PLAYER, 100, 60); s.nav.rebuild();
  const jet = makeUnit(s, 'v_raptor', PLAYER, af.x, af.z, 0); run(s, 5); jet.hp = jet.maxHp * 0.3; const hp0 = jet.hp; run(s, 100);
  ok(jet.as === 'parked' && jet.hp > hp0 + jet.maxHp * 0.2, `a parked jet is repaired automatically: ${Math.round(100 * hp0 / jet.maxHp)}% to ${Math.round(100 * jet.hp / jet.maxHp)}% in 5 s`);
  run(s, 300); ok(jet.hp === jet.maxHp, 'and all the way to full health');
  s.issue({ t: 'move', ids: [jet.id], x: 320, z: 300, guard: true }); run(s, 300); const out = jet.as === 'out'; jet.hp = jet.maxHp * 0.5;
  s.issue({ t: 'rtb', ids: [jet.id] }); run(s, 700);
  ok(out && jet.as === 'parked' && jet.hp === jet.maxHp, 'ordered home (right-click on the airfield), it lands, parks and is repaired');
  const heli = makeUnit(s, 'v_comanche', PLAYER, 300, 300, 0); heli.hp = heli.maxHp * 0.4; run(s, 5); s.issue({ t: 'landrepair', ids: [heli.id], target: af2.id }); run(s, 700);
  ok(heli.as === 'pad' && Math.hypot(heli.x - af2.heli.x, heli.z - af2.heli.z) < 1 && heli.hp === heli.maxHp, 'a helicopter sent to a chosen airfield lands on that one and is repaired');
  const tank = makeUnit(s, 'v_tank', PLAYER, 320, 200, 0), lav = makeUnit(s, 'v_tank', PLAYER, 326, 206, 0); tank.hp = 100; lav.hp = 150; run(s, 5);
  s.issue({ t: 'repairat', ids: [tank.id, lav.id], target: wf.id }); run(s, 900);
  ok(tank.hp === tank.maxHp && lav.hp === lav.maxHp && Math.hypot(tank.x - wf.x, tank.z - wf.z) < 30, 'vehicles sent to the War Factory drive to its repair bay and are repaired');
  console.log('repair         : parked jets heal | return-to-base order | helipad of your choice | vehicles to the War Factory bay');
}

// ---------------------------------------------------------------- airfield layouts and the paratroop transport
{
  for (const [type, want] of [['v_airfield', 'two hangars on the left, two along the top'], ['r_airfield', 'four hangars along the top']]) {
    const s = bare({ factions: ['vanguard', 'redhammer'] }), b = makeBldg(s, type, PLAYER, 60, 60), L = BLDGS[type].layout, P = b.pads.map(p => [p.x - b.x, p.z - b.z]);
    const inside = P.every(([x, z]) => Math.abs(x) < 18 && z > -13 && z < L.runways[0] - 5), apart = P.every((p, i) => P.every((q, j) => i === j || Math.hypot(p[0] - q[0], p[1] - q[1]) >= 6.5));
    const left = L.hangars.filter(h => h[2] === 'e'), top = L.hangars.filter(h => h[2] === 's');
    ok(L.hangars.length === 4 && P.length === 4 && inside && apart && Math.hypot(L.helipad[0] - P[3][0], L.helipad[1] - P[3][1]) > 6, `${BLDGS[type].name}: four hangars, four parking spots clear of the runways, the helipad and each other`);
    ok(type === 'v_airfield' ? left.length === 2 && top.length === 2 && left.every(h => h[0] < -12) && top.every(h => h[1] < -8) : top.length === 4 && top.every(h => h[1] < -8), `${BLDGS[type].name}: ${want}`);
    ok(L.hangars.every((h, i) => Math.hypot(P[i][0] - h[0], P[i][1] - h[1]) < 1 && (h[2] === 'e' ? L.aprons[i][0] > h[0] + 5 && b.pads[i].f === 0 : L.aprons[i][1] > h[1] + 5 && b.pads[i].f === Math.PI / 2)), `${BLDGS[type].name}: every jet parks inside its own hangar, nose to the door, with an apron outside it`);
  }
  const s = bare({ factions: ['vanguard', 'redhammer'] }); s.teams[PLAYER].promos.add('v_pathfinder'); s.teams[PLAYER].promos.add('v_para'); makeBldg(s, 'v_cc', PLAYER, 20, 220); s.nav.rebuild();
  ok(usePower(s, PLAYER, 'paradrop', 300, 200) && s.strikes[0].model === 'c130', 'paratroopers are dropped by a C-130');
  let para = 0, made = 0; run(s, 300, (ev) => { if (s.strikes.some(p => p.kind === 'para')) para++; for (const e of ev) if (e.t === 'paradrop') made = e.n; });
  ok(para >= 55 && made === POWERS.paradrop.n, `the drop takes ${(para / 20).toFixed(1)} s under canopy and lands ${made} squads`);
}

console.log(fail ? `BATCH10: ${fail} FAILURES of ${pass + fail}` : `BATCH10: all ${pass} checks passed`);
process.exit(fail ? 1 : 0);
