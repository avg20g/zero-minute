// Add-on batch 2: superweapons, No-Superweapons rule, Paratrooper Drop, Cash Hack, Sneak Attack,
// King of the Hill, and the AI's use of all of them (including reverse-move micro).
import { Sim, KOTH } from '../js/sim/simulationTick.js';
import { makeUnit, makeBldg, kill } from '../js/sim/entities.js';
import { completeBldg } from '../js/sim/econ.js';
import { CELL, N, PLAYER, ENEMY } from '../js/sim/defs.js';
import { UNITS, BLDGS, POWERS, FACTIONS } from '../js/sim/factionRegistry.js';
import { powerError, hasPower, superOf, usePower } from '../js/sim/powers.js';
let fails = 0, checks = 0; const ok = (c, msg) => { checks++; if (!c) { fails++; console.log('  FAIL', msg); } };
const run = (sim, n, each) => { for (let i = 0; i < n; i++) { sim.step(); if (each) each(sim.events); sim.events.length = 0; } };
const open = (sim) => { sim.fog.exp[0].fill(1); sim.fog.exp[1].fill(1); };
const cellOf = (x, z) => Math.floor(z / CELL) * N + Math.floor(x / CELL);

// ---------------------------------------------------------------- A. superweapons
{
  const specs = [['vanguard', 'v_particle', 'particle', 'v_power'], ['redhammer', 'r_silo', 'nuke', 'r_power'], ['sandstorm', 's_scud', 'scud', null]];
  for (const [fac, bt, pw, reactor] of specs) {
    const once = () => {
      const sim = new Sim({ ai: false, empty: true, factions: [fac, 'vanguard'] }); open(sim);
      ok(superOf(sim, PLAYER) === pw && FACTIONS[fac].build.includes(bt) && BLDGS[bt].cost === 5000, `${fac}: ${BLDGS[bt].name} is in the build list at $5,000`);
      const b = makeBldg(sim, bt, PLAYER, 40, 40, false); sim.nav.rebuild();
      ok(!hasPower(sim, PLAYER, pw), 'no power while under construction');
      const ev = []; completeBldg(sim, b); ev.push(...sim.events);
      const T = sim.teams[PLAYER];
      ok(ev.some(e => e.t === 'superbuilt' && e.id === pw) && b.seen[ENEMY] && sim.fog.shouldShow(ENEMY, b), 'completion is announced and the building is revealed to the enemy');
      ok(hasPower(sim, PLAYER, pw) && T.powerReady[pw] === sim.tick + POWERS[pw].cd * 20 && b.superReady === T.powerReady[pw] && /recharging/.test(powerError(sim, PLAYER, pw, 400, 400)), 'countdown is exactly 3:30 and the weapon cannot fire early');
      let paused = null;
      if (reactor) { run(sim, 200); paused = T.powerReady[pw] - sim.tick; for (let i = 0; i < 3; i++) makeBldg(sim, reactor, PLAYER, 60 + i * 12, 40); sim.nav.rebuild(); }
      run(sim, 6000);
      ok(!reactor || paused === POWERS[pw].cd * 20, `low power pauses the countdown (${paused} ticks left after 10 s unpowered)`);
      ok(powerError(sim, PLAYER, pw, 400, 400) === null, 'ready after 3:30 of powered time');
      // targets: a building at the aim point, a tank 8 m off, a tank far outside
      const tb = makeBldg(sim, 'r_barracks', ENEMY, 196, 196), near = makeUnit(sim, 'r_tank', ENEMY, 408, 392, 0), far = makeUnit(sim, 'r_tank', ENEMY, 400 + POWERS[pw].radius + 30, 400, 0); near.order = far.order = { t: 'hold' };
      const hp0 = tb.hp, seen = { launch: 0, hits: 0 };
      sim.issue({ t: 'power', id: pw, x: tb.x, z: tb.z });
      run(sim, 400, (evs) => { for (const e of evs) { if (e.t === 'superlaunch') seen.launch++; if (e.t === 'nuke' || e.t === 'scudhit' || e.t === 'pbeam') seen.hits++; } });
      ok(seen.launch === 1 && seen.hits === (pw === 'nuke' ? 1 : pw === 'scud' ? 9 : 50), `launch warning sent once; ${seen.hits} impacts`);
      ok((tb.dead || tb.hp < hp0 * 0.5) && far.hp === far.maxHp, `target building ${tb.dead ? 'destroyed' : 'at ' + Math.round(100 * tb.hp / hp0) + '%'}; a tank outside the radius is untouched`);
      ok(T.powerReady[pw] > sim.tick + POWERS[pw].cd * 20 - 500 && T.powersUsed === 1, 'countdown restarts after firing');
      kill(sim, b); run(sim, 2); ok(!hasPower(sim, PLAYER, pw), 'weapon is gone when its building is destroyed');
      return { hash: sim.hash(), tb: tb.dead ? 0 : tb.hp / hp0, near: near.dead ? 0 : near.hp / near.maxHp, hits: seen.hits };
    };
    const a = once(), b2 = once();
    ok(a.hash === b2.hash, `${pw} is deterministic`);
    console.log(`superweapon    : ${POWERS[pw].name.padEnd(16)} ${a.hits} impact(s) | aim-point building left at ${(a.tb * 100).toFixed(0)}% | tank 8 m away at ${(a.near * 100).toFixed(0)}% | identical across two runs`);
  }
  // any number per side, and the lobby rule
  const sim = new Sim({ ai: false }); const T = sim.teams[PLAYER]; T.money = 20000; open(sim);
  const dz = sim.ents.find(e => e.team === PLAYER && e.kind === 'unit' && UNITS[e.type].builder), F = FACTIONS[T.faction].roles;
  const fb = makeBldg(sim, F.factory, PLAYER, 20, 190); sim.nav.rebuild();
  const count = () => sim.ents.filter(e => e.type === F.super && e.team === PLAYER).length;
  sim.issue({ t: 'build', id: dz.id, type: F.super, cx: 60, cz: 180 }); run(sim, 2); const first = count();
  sim.issue({ t: 'build', id: dz.id, type: F.super, cx: 84, cz: 180 }); run(sim, 2);
  ok(first === 1 && count() === 2 && T.money === 10000, 'a second superweapon can be built and is paid for');
  const ns = new Sim({ ai: false, noSuper: true }); ns.teams[PLAYER].money = 20000; open(ns);
  const d2 = ns.ents.find(e => e.team === PLAYER && e.kind === 'unit' && UNITS[e.type].builder); makeBldg(ns, F.factory, PLAYER, 20, 190); ns.nav.rebuild();
  ns.issue({ t: 'build', id: d2.id, type: F.super, cx: 60, cz: 180 }); run(ns, 2);
  const forced = makeBldg(ns, F.super, PLAYER, 100, 180);
  ok(!ns.ents.some(e => e.type === F.super && e.id !== forced.id) && ns.teams[PLAYER].money === 20000 && !hasPower(ns, PLAYER, superOf(ns, PLAYER)) && ns.setup.noSuper, 'No-Superweapons rule: build refused, nothing charged, power unavailable, rule stored for replays');
  console.log('super rules    : any number per side; No-Superweapons lobby rule blocks building and firing');
}

// ---------------------------------------------------------------- B. Paratrooper Drop, Cash Hack, Sneak Attack
{
  // Paratrooper Drop
  const sim = new Sim({ ai: false, empty: true, factions: ['vanguard', 'redhammer'] }); open(sim); sim.teams[PLAYER].promos.add('v_pathfinder').add('v_para');
  ok(hasPower(sim, PLAYER, 'paradrop') && powerError(sim, PLAYER, 'paradrop', 300, 300) === null, 'Paratrooper Drop unlocked by its promotion');
  sim.issue({ t: 'power', id: 'paradrop', x: 300, z: 300 }); let at = -1; const before = sim.ents.length;
  run(sim, 400, (ev) => { for (const e of ev) if (e.t === 'paradrop') at = sim.tick; });
  const dropped = sim.ents.filter(e => e.type === 'v_ranger' && e.team === PLAYER), far = Math.max(...dropped.map(u => Math.hypot(u.x - 300, u.z - 300)));
  ok(dropped.length === 5 && far < 14 && at > 0, `5 Ranger squads landed within ${far.toFixed(1)} m of the target`);
  // Cash Hack
  const h = new Sim({ ai: false, empty: true, factions: ['redhammer', 'vanguard'] }); open(h); h.teams[PLAYER].promos.add('r_artyvet').add('r_hack'); h.teams[ENEMY].money = 900;
  const sup = makeBldg(h, 'v_supply', ENEMY, 150, 150); h.nav.rebuild(); const m0 = h.teams[PLAYER].money;
  ok(/scouted/.test(powerError(h, PLAYER, 'cashhack', sup.x, sup.z) || ''), 'Cash Hack refused on a supply building the caster has never seen');
  sup.seen[PLAYER] = true;
  ok(powerError(h, PLAYER, 'cashhack', sup.x + 6, sup.z) === null && /scouted/.test(powerError(h, PLAYER, 'cashhack', sup.x + 60, sup.z) || ''), 'allowed on a scouted supply building, refused on empty ground');
  h.issue({ t: 'power', id: 'cashhack', x: sup.x, z: sup.z }); run(h, 2);
  ok(h.teams[ENEMY].money === 0 && h.teams[PLAYER].money === m0 + 900, 'takes what the victim has, capped at $1,500 (victim had $900)');
  h.teams[ENEMY].money = 5000; h.teams[PLAYER].powerReady.cashhack = 0; h.issue({ t: 'power', id: 'cashhack', x: sup.x, z: sup.z }); run(h, 2);
  ok(h.teams[ENEMY].money === 3500 && h.teams[PLAYER].money === m0 + 2400 && h.teams[PLAYER].earned === 0, 'second hack moves exactly $1,500; no money is created and none counts as harvested');
  // Sneak Attack
  const s = new Sim({ ai: false, empty: true, factions: ['sandstorm', 'vanguard'] }); s.teams[PLAYER].promos.add('s_saboteur').add('s_sneak');
  ok(/explored/.test(powerError(s, PLAYER, 'sneaktunnel', 300, 300) || ''), 'Sneak Attack refused in unexplored territory');
  open(s); const home = makeBldg(s, 's_tunnel', PLAYER, 30, 30); s.nav.rebuild();
  s.issue({ t: 'power', id: 'sneaktunnel', x: 300, z: 300 }); run(s, 99);
  ok(s.ents.filter(e => e.type === 's_tunnel').length === 1, 'nothing appears before the 5 s delay');
  let ev1 = null; run(s, 6, (ev) => { for (const e of ev) if (e.t === 'sneak') ev1 = e; });
  const exit = s.ents.find(e => e.type === 's_tunnel' && e.id !== home.id);
  ok(exit && exit.done && exit.team === PLAYER && Math.hypot(exit.x - 300, exit.z - 300) < 12 && ev1, 'a finished Tunnel Network exit breaks ground at the target');
  console.log(`new powers     : Paratrooper Drop 5 squads within ${far.toFixed(1)} m | Cash Hack $900 then $1,500, fog-gated | Sneak Attack exit after 5.0 s, ${Math.hypot(exit.x - 300, exit.z - 300).toFixed(1)} m from the aim point`);
}

// ---------------------------------------------------------------- C. King of the Hill
{
  const sim = new Sim({ ai: false, koth: true }); const k = sim.koth;
  ok(k && Math.hypot(k.x - 256, k.z - 256) < 40 && k.need === 180 && sim.setup.koth, `hill placed at the map centre (${k.x}, ${k.z})`);
  const mine = [0, 1, 2].map(i => makeUnit(sim, 'v_tank', PLAYER, k.x - 6 + i * 6, k.z + 4, 0)); for (const u of mine) u.order = { t: 'hold' };
  run(sim, 600); const solo = k.secs[PLAYER];
  ok(k.owner === PLAYER && solo >= 29 && solo <= 30, `holding alone runs the clock (${solo} s after 30 s)`);
  const foe = makeUnit(sim, 'r_tank', ENEMY, k.x + 4, k.z - 8, 0); foe.order = { t: 'hold' }; foe.cd = 1e9; for (const u of mine) u.cd = 1e9;
  run(sim, 200, () => { foe.cd = 1e9; for (const u of mine) u.cd = 1e9; });
  ok(k.owner === -1 && k.secs[PLAYER] === solo, 'contested hill: the clock stops but is kept');
  for (const u of mine) { u.x += 80; u.px = u.x; }
  run(sim, 100, () => { foe.cd = 1e9; });
  ok(k.owner === ENEMY && k.secs[PLAYER] === 0 && k.secs[ENEMY] > 0, 'the enemy alone on the hill resets your clock');
  kill(sim, foe); for (const u of mine) { u.x -= 80; u.px = u.x; }
  let why = null; run(sim, 3700, (ev) => { for (const e of ev) if (e.t === 'over') why = e.why; });
  ok(sim.winner === PLAYER && why === 'hill', 'three unbroken minutes on the hill wins the match');
  // AI plays the mode
  const g = new Sim({ ai: 'both', difficulty: ['hard', 'medium'], koth: true, factions: ['redhammer', 'vanguard'] }); let flips = 0, endWhy = null;
  for (let t = 0; t < 20000 && g.winner < 0; t++) { g.step(); for (const e of g.events) { if (e.t === 'hill' && e.owner >= 0) flips++; if (e.t === 'over') endWhy = e.why || 'elimination'; } g.events.length = 0; }
  ok(flips > 0, `AI armies take the hill (${flips} captures)`);
  console.log(`king of hill   : clock ${solo} s after 30 s alone, stops when contested, resets when lost, win at ${KOTH.hold} s | AI v AI: ${flips} captures, ended by ${endWhy || 'nothing in 16.7 min'} at ${(g.tick / 1200).toFixed(1)} min (winner ${g.winner})`);
}

// ---------------------------------------------------------------- D. the AI builds and fires superweapons in view only, and reverses damaged armor
{
  let built = 0, fired = 0, blind = 0, reverses = 0, revBad = 0, hacks = 0, drops = 0;
  for (const [f, seed] of [[['redhammer', 'vanguard'], 7], [['vanguard', 'sandstorm'], 11], [['sandstorm', 'redhammer'], 13]]) {
    const sim = new Sim({ ai: 'both', difficulty: ['hard', 'hard'], factions: f, money: 25000, seed });
    const issue = sim.issue.bind(sim);
    sim.issue = (c) => {
      if (c.t === 'power') {
        const P = POWERS[c.id]; if (P.super) fired++; if (c.id === 'cashhack') hacks++; if (c.id === 'paradrop') drops++;
        if (P.super && sim.fog.vis[c.team][cellOf(c.x, c.z)] !== 1) blind++;
      }
      if (c.t === 'move' && c.reverse) { reverses++; const u = sim.byId.get(c.ids[0]); if (!u || !UNITS[u.type].dirArmor || !sim.ents.some(e => e.team === 1 - c.team && !e.dead && Math.hypot(e.x - u.x, e.z - u.z) < 48 && sim.fog.canSee(c.team, e))) revBad++; }
      issue(c);
    };
    for (let t = 0; t < 22000 && sim.winner < 0; t++) { sim.step(); for (const e of sim.events) if (e.t === 'superbuilt') built++; sim.events.length = 0; }
  }
  ok(built >= 2, `AI builds superweapons when it can afford them (${built} built in 3 matches)`);
  ok(blind === 0, `every AI superweapon strike was aimed at a cell in its own view (${fired} fired, ${blind} into fog)`);
  ok(reverses > 0 && revBad === 0, `Hard AI reverse-moves damaged armor only away from a visible threat (${reverses} orders, ${revBad} without one)`);
  console.log(`AI add-on use  : ${built} superweapons built, ${fired} fired (${blind} into fog) | ${reverses} reverse-move retreats | Cash Hack ${hacks}, Paratrooper Drop ${drops}`);
}
console.log(fails ? `ADDON: ${fails} FAILURES of ${checks}` : `ADDON: all ${checks} checks passed`);
process.exit(fails ? 1 : 0);
