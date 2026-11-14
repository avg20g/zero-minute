// Phase 3 verification: the Utility AI plays fair (own Fog of War only, no bonus cash),
// scouts, counters what it sees, and respects its difficulty caps.
import { Sim } from '../js/sim/simulationTick.js';
import { makeUnit, makeBldg, spawnNear, kill } from '../js/sim/entities.js';
import { UNITS, BLDGS, FACTIONS, POWERS, FACTION_IDS } from '../js/sim/factionRegistry.js';
import { DIFFICULTY, EFFECT } from '../js/sim/aiController.js';
import { N, CELL, WORLD, PLAYER, ENEMY, NEUTRAL } from '../js/sim/defs.js';
let fails = 0, checks = 0; const ok = (c, msg) => { checks++; if (!c) { fails++; console.log('  FAIL', msg); } return c; };
const cellOf = (x, z) => Math.floor(z / CELL) * N + Math.floor(x / CELL);
const hold = (u) => { u.order = { t: 'hold' }; return u; };
const disarm = (u) => { if (u.cds) u.cds[0] = u.cds[1] = u.cds[2] = 1e9; };

// Instrument an AI: every order it issues is checked at the moment it is issued.
function watch(sim, a, acc) {
  const act = a.act.bind(a);
  a.act = (cmd) => {
    const okd = act(cmd); if (!okd) return okd;
    acc.ticks.push(sim.tick);
    if (cmd.t === 'power') {
      acc.casts++;
      const inView = sim.fog.vis[a.team][cellOf(cmd.x, cmd.z)] === 1; let seen = 0;
      for (const e of sim.ents) if (e.team === a.foe && !e.dead && !(e.kind === 'unit' && e.inB) && Math.hypot(e.x - cmd.x, e.z - cmd.z) <= POWERS[cmd.id].radius + 3 && sim.fog.canSee(a.team, e)) seen++;
      if (!inView || !seen) { acc.blind++; console.log('   blind cast', cmd.id, 'tick', sim.tick, 'inView', inView, 'seen', seen); }
    }
    if (cmd.t === 'attack') { const t = sim.byId.get(cmd.target); if (!t || !sim.fog.canSee(a.team, t)) acc.blindAttack++; }
    return okd;
  };
}
const newAcc = () => ({ ticks: [], casts: 0, blind: 0, blindAttack: 0 });
function maxPerMinute(ticks) { let best = 0, j = 0; for (let i = 0; i < ticks.length; i++) { while (ticks[i] - ticks[j] >= 1200) j++; best = Math.max(best, i - j + 1); } return best; }

// ---------------------------------------------------------------- A. fair start
{
  const sim = new Sim({ factions: ['vanguard', 'redhammer'] });
  const count = (t, pred) => sim.ents.filter(e => e.team === t && pred(e)).length;
  ok(sim.teams[0].money === sim.teams[1].money, 'equal starting cash');
  ok(count(0, e => e.kind === 'bldg') === 1 && count(1, e => e.kind === 'bldg') === 1, 'one command building each');
  ok(count(0, e => e.kind === 'unit') === 3 && count(1, e => e.kind === 'unit') === 3, 'three starting units each');
  let e0 = 0, e1 = 0; for (let i = 0; i < N * N; i++) { e0 += sim.fog.exp[0][i]; e1 += sim.fog.exp[1][i]; }
  ok(Math.abs(e0 - e1) / e0 < 0.02, `same explored area at start (${e0} vs ${e1} cells)`);
  ok(sim.ais.length === 1 && sim.ais[0].team === ENEMY && sim.ais[0].aiVisionGrid === sim.fog.vis[ENEMY], 'AI reads its own vision grid');
  console.log(`fair start     : $${sim.teams[1].money} each, 1 building + 3 units each, explored ${e0} vs ${e1} cells`);
}

// ---------------------------------------------------------------- B/C/I/J. full matches with every order audited
const totals = { casts: 0, blind: 0, blindAttack: 0, bonus: 0, memBad: 0, memChecks: 0 };
const stat = { easy: [], medium: [], hard: [] };
function match(fa, fb, lv, ticks, extra) {
  const sim = new Sim({ factions: [fa, fb], ai: 'both', difficulty: lv });
  const accs = sim.ais.map(a => { const acc = newAcc(); watch(sim, a, acc); a.log = []; return acc; });
  // perception audit: right after each perceive(), everything stamped "seen now" must be in view,
  // and everything else in memory must be exactly where it was last seen (no tracking through fog)
  const last = sim.ais.map(() => new Map());
  sim.ais.forEach((a, k) => { const per = a.perceive.bind(a); a.perceive = () => { const before = a.seenTick; per(); if (a.seenTick === before) return;
    let vis = 0; for (const e of sim.ents) if (e.team === a.foe && !e.dead && !(e.kind === 'unit' && e.inB) && !(e.kind === 'bldg' && !BLDGS[e.type].faction && e.type !== 'civ') && sim.fog.canSee(a.team, e)) vis++;
    let now = 0;
    for (const m of a.aiMemoryMap.values()) {
      totals.memChecks++;
      if (m.tick === sim.tick) { now++; const e = sim.byId.get(m.id); if (!e || !sim.fog.canSee(a.team, e) || e.x !== m.x || e.z !== m.z) totals.memBad++; }
      else { const p = last[k].get(m.id); if (p && (p.x !== m.x || p.z !== m.z || p.tick !== m.tick)) totals.memBad++; }
      last[k].set(m.id, { x: m.x, z: m.z, tick: m.tick });
    }
    if (now !== vis) totals.memBad++;
  }; });
  const prev = sim.teams.map(t => ({ money: t.money, inc: t.earned + t.passive }));
  for (let t = 0; t < ticks && sim.winner < 0; t++) {
    if (extra) extra(sim, t);
    sim.step(); sim.events.length = 0;
    sim.teams.forEach((T, k) => { const inc = T.earned + T.passive + (T.hacked || 0); /* Cash Hack moves money between sides; it never creates any */ if (T.money - prev[k].money > inc - prev[k].inc + 1e-6) totals.bonus++; prev[k].money = T.money; prev[k].inc = inc; });
  }
  sim.ais.forEach((a, k) => { const lvl = a.level, acc = accs[k]; totals.casts += acc.casts; totals.blind += acc.blind; totals.blindAttack += acc.blindAttack;
    stat[lvl].push({ apm: maxPerMinute(acc.ticks), s: a.stats, react: a.stats.casts.length ? Math.min(...a.stats.casts.map(c => c.seenFor)) : null, f: a.F.id }); });
  return sim;
}
{
  const t0 = performance.now(); const rows = []; let ticks = 0;
  const games = [['vanguard', 'redhammer', ['hard', 'easy']], ['redhammer', 'sandstorm', ['hard', 'easy']], ['sandstorm', 'vanguard', ['hard', 'easy']],
                 ['redhammer', 'vanguard', ['easy', 'hard']], ['vanguard', 'sandstorm', ['medium', 'medium']], ['sandstorm', 'redhammer', ['medium', 'hard']], ['redhammer', 'redhammer', ['hard', 'medium']]];
  let hardWins = 0, hardGames = 0;
  for (const [fa, fb, lv] of games) {
    const s = match(fa, fb, lv, 16800); ticks += s.tick;
    const b = s.ais.map(a => s.ents.filter(e => e.team === a.team && e.kind === 'bldg' && BLDGS[e.type].faction).length);
    rows.push(`${fa.slice(0, 4)}(${lv[0]}) v ${fb.slice(0, 4)}(${lv[1]}): ${s.winner < 0 ? 'undecided at 14 min, buildings ' + b.join(' v ') : 'won by ' + lv[s.winner] + ' ' + s.teams[s.winner].faction.slice(0, 4) + ' at ' + (s.tick / 1200).toFixed(1) + ' min'}`);
    if (lv[0] !== lv[1] && (lv.includes('hard') && lv.includes('easy'))) { hardGames++; const h = lv.indexOf('hard'); if (s.winner === h || (s.winner < 0 && b[h] > b[1 - h])) hardWins++; }
  }
  ok(totals.bonus === 0, 'no AI ever gained money it did not earn: ' + totals.bonus + ' violations');
  ok(totals.memBad === 0, `memory map only changes on real sightings: ${totals.memBad} bad of ${totals.memChecks}`);
  ok(totals.blind === 0 && totals.casts >= 6, `support powers: ${totals.casts} casts, ${totals.blind} at a fogged cell or with no visible enemy in the radius`);
  ok(totals.blindAttack === 0, 'attack orders only name targets in view');
  ok(hardWins >= 3, `Hard beats Easy in ${hardWins}/${hardGames} games`);
  console.log(`audited matches: ${games.length} games, ${ticks} ticks, ${((performance.now() - t0) / ticks).toFixed(3)} ms/tick`);
  for (const r of rows) console.log('                 ' + r);
  console.log(`  no-cheat audit: ${totals.memChecks} memory entries checked, ${totals.memBad} bad; ${totals.casts} power casts, ${totals.blind} blind; ${totals.blindAttack} blind attack orders; ${totals.bonus} unearned-money ticks`);
  // difficulty caps
  for (const lv of ['easy', 'medium', 'hard']) {
    const cfg = DIFFICULTY[lv], L = stat[lv], apm = Math.max(...L.map(k => k.apm)), sum = (f) => L.reduce((n, k) => n + k.s[f], 0);
    const react = L.map(k => k.react).filter(v => v !== null);
    ok(apm <= cfg.apm + cfg.apm / 12 + 1, `${lv}: busiest minute ${apm} actions <= cap ${cfg.apm} (+burst)`);
    ok(!react.length || Math.min(...react) >= cfg.react, `${lv}: fastest power reaction ${react.length ? Math.min(...react) : '-'} ticks >= ${cfg.react}`);
    if (lv === 'easy') ok(sum('flanks') === 0 && sum('retreats') === 0 && sum('focus') === 0 && sum('combos') === 0, 'easy: no flanks, retreats, focus fire or combos');
    if (lv === 'medium') ok(sum('flanks') === 0 && sum('focus') === 0 && sum('combos') === 0, 'medium: no flanks, focus fire or combos');
    if (lv === 'hard') ok(sum('flanks') >= 1 && sum('focus') >= 1 && sum('retreats') >= 1, `hard: flanks ${sum('flanks')}, focus ${sum('focus')}, retreats ${sum('retreats')}`);
    console.log(`  ${lv.padEnd(6)} (${L.length} AIs): busiest minute ${apm}/${cfg.apm} APM, fastest reaction ${react.length ? (Math.min(...react) / 20).toFixed(2) + ' s' : 'n/a'} (min ${(cfg.react / 20).toFixed(2)} s), attacks ${sum('attacks')}, flanks ${sum('flanks')}, focus ${sum('focus')}, retreats ${sum('retreats')}, combos ${sum('combos')}, captures ${sum('captures')}, expands ${sum('expands')}, sweeps ${sum('sweeps')}, orders refused by cap ${sum('denied')}`);
  }
  const a = match('vanguard', 'redhammer', ['hard', 'medium'], 6000), b = match('vanguard', 'redhammer', ['hard', 'medium'], 6000);
  ok(a.hash() === b.hash() && a.ais[1].log.join('|') === b.ais[1].log.join('|'), 'AI is deterministic (same state hash and same order log)');
}

// ---------------------------------------------------------------- C2. blind swap: hidden state must not change a single AI order
// Both runs hide the same NUMBER of player assets in fog (so entity ids line up), but run B changes
// everything the AI is not allowed to know: where they are, what they are, and the player's hidden
// economy, rank, promotions and upgrades. A non-cheating AI must issue a byte-identical order log.
{
  const run = (variant) => {
    const sim = new Sim({ factions: ['vanguard', 'redhammer'], difficulty: 'hard' }); const a = sim.ais[0]; a.log = [];
    const T = sim.teams[PLAYER], cells = [], B = variant === 'B';
    if (B) { T.money += 50000; T.rank = 5; T.points = 4; T.promos.add('v_a10'); T.upgrades.add('v_pdl'); T.xp = 5000; }
    const b = makeBldg(sim, B ? 'v_barracks' : 'v_power', PLAYER, B ? 14 : 20, B ? 236 : 232); sim.nav.rebuild(); cells.push(cellOf(b.x, b.z));
    for (let i = 0; i < 6; i++) {
      const u = hold(makeUnit(sim, B && i >= 2 ? 'v_truck' : 'v_dozer', PLAYER, // two hidden builders in both runs, so the elimination rule (no Command Center and no builders) reads the same
        ((B ? 24 : 12) + (i % 3) * 3) * CELL, ((B ? 242 : 238) + ((i / 3) | 0) * 3) * CELL, 0));
      cells.push(cellOf(u.x, u.z));
    }
    let leaked = 0;
    for (let t = 0; t < 8400 && sim.winner < 0; t++) { sim.step(); sim.events.length = 0; for (const c of cells) if (sim.fog.vis[ENEMY][c]) leaked++; }
    return { log: a.log, leaked, end: sim.tick };
  };
  const A = run('A'), B = run('B');
  ok(A.leaked === 0 && B.leaked === 0, `scenario valid: the AI never had sight of the hidden assets (${A.leaked}, ${B.leaked})`);
  let same = 0; while (same < A.log.length && same < B.log.length && A.log[same] === B.log[same]) same++;
  const identical = A.log.length === B.log.length && same === A.log.length;
  ok(A.log.length >= 40 && identical, `identical order log across the swap (${A.log.length} vs ${B.log.length} orders, first ${same} match)`);
  ok(A.end === B.end, `matches end on the same tick (${A.end} vs ${B.end})`);
  console.log(`blind swap     : hidden +$50,000, Rank 5, promotion, upgrade, and 7 fogged assets moved and re-typed: ${identical ? 'all ' + A.log.length + ' AI orders identical' : 'ORDERS DIVERGED at #' + same} over ${(A.end / 20).toFixed(0)} s`);
}

// ---------------------------------------------------------------- D. scouting loop
{
  const rows = [];
  for (const f of FACTION_IDS) {
    const sim = new Sim({ factions: ['vanguard', f], difficulty: 'medium' }); const a = sim.ais[0];
    for (const e of sim.ents) if (e.team === PLAYER && e.kind === 'unit') disarm(e);
    let first = -1, firstSweep = -1, found = -1;
    for (let t = 0; t < 6000; t++) { for (const e of sim.ents) if (e.team === PLAYER) { disarm(e); if (e.kind === 'unit') e.target = 0; } sim.step(); sim.events.length = 0; if (first < 0 && a.stats.scouts) first = t; if (firstSweep < 0 && a.stats.sweeps) firstSweep = t; if (found < 0) for (const m of a.aiMemoryMap.values()) if (m.kind === 'bldg' && m.tick > 0 && m.rect) found = t; }
    ok(first >= 0 && first < 2400, `${f}: scout fielded by ${(first / 20).toFixed(0)} s`);
    const seen = a.pois.filter(p => a.aiExplored[cellOf(p.x, p.z)]).length;
    ok(seen >= a.pois.length - 1, `${f}: sweep explored ${seen}/${a.pois.length} points of interest`);
    ok(a.docks.size >= 3 && a.derricks.size === 2, `${f}: remembers ${a.docks.size} docks and ${a.derricks.size} derricks`);
    ok(found > 0, `${f}: enemy base found by scouting and stored with a timestamp (${(found / 20).toFixed(0)} s)`);
    // force stale intel: a new sweep must start within one decision cycle (75 s rule)
    let guard = 0; while ((a.scout.route || !sim.byId.get(a.scout.id)) && guard++ < 6000) { for (const e of sim.ents) if (e.team === PLAYER) disarm(e); sim.step(); sim.events.length = 0; }
    const before = a.stats.sweeps; a.lastFoeSeen = a.scout.lastSweep = sim.tick - 1498; a.aiMemoryMap.clear();
    const fresh = a.stats.sweeps; for (let t = 0; t < 30; t++) { sim.step(); sim.events.length = 0; }
    const notYet = a.stats.sweeps === fresh || a.lastFoeSeen > sim.tick - 100;
    a.lastFoeSeen = a.scout.lastSweep = sim.tick - 1600; for (let t = 0; t < 90; t++) { a.lastFoeSeen = Math.min(a.lastFoeSeen, sim.tick - 1600); sim.step(); sim.events.length = 0; }
    ok(a.stats.sweeps > before, `${f}: stale intel (>75 s) triggers a new sweep`);
    rows.push(`${f.slice(0, 4)} ${UNITS[a.F.roles.scout].name} at ${(first / 20).toFixed(0)} s, ${seen}/${a.pois.length} POIs, ${a.stats.sweeps} sweeps`);
  }
  console.log('scouting       : ' + rows.join(' | '));
}

// ---------------------------------------------------------------- E. utility scoring counters what was spotted
{
  const base = (f, lv) => {
    const sim = new Sim({ factions: ['redhammer', f], difficulty: lv }); const R = FACTIONS[f].roles; sim.teams[1].money = 30000;
    if (R.power) { makeBldg(sim, R.power, ENEMY, 232, 34); makeBldg(sim, R.power, ENEMY, 236, 46); makeBldg(sim, R.power, ENEMY, 244, 58); }
    makeBldg(sim, R.supply, ENEMY, 186, 48); makeBldg(sim, R.barracks, ENEMY, 198, 66); makeBldg(sim, R.factory, ENEMY, 228, 70); if (R.airfield) makeBldg(sim, R.airfield, ENEMY, 198, 30);
    sim.nav.rebuild(); return sim;
  };
  const probe = (f, lv, foes) => {
    const sim = base(f, lv), a = sim.ais[0];
    foes.forEach((t, i) => { const u = hold(spawnNear(sim, t, PLAYER, 414 + (i % 4) * 5, 146 + ((i / 4) | 0) * 5)); disarm(u); });
    for (let t = 0; t < 50; t++) { for (const e of sim.ents) if (e.team === PLAYER) disarm(e); sim.step(); }
    const units = a.lastScores.filter(s => a.combat.includes(s.name) && s.ok);
    return { a, top: units[0].name, units, def: (a.lastScores.find(s => s.name === 'defense') || {}).score || 0, sh: a.shares() };
  };
  // best counters among the units this AI can actually train right now (promotion-gated units count once unlocked)
  const rank = (a, arm) => a.combat.filter(t => !UNITS[t].promo || a.sim.teams[a.team].promos.has(UNITS[t].promo)).sort((x, y) => EFFECT[y][arm] - EFFECT[x][arm]);
  const rows = [];
  for (const f of FACTION_IDS) {
    const H = probe(f, 'medium', ['r_overlord', 'r_overlord', 'r_overlord', 'r_tank']);
    ok(rank(H.a, 'heavy').slice(0, 2).includes(H.top) && H.sh.heavy > 0.9, `${f}: heavy armor spotted -> ${H.top}`);
    const I = probe(f, 'medium', Array(10).fill('r_conscript'));
    ok(rank(I.a, 'inf').slice(0, 2).includes(I.top) && I.sh.inf > 0.9, `${f}: massed infantry spotted -> ${I.top}`);
    const A = probe(f, 'medium', ['v_comanche', 'v_comanche', 'v_comanche']);
    ok(EFFECT[A.top].air >= 0.5 && A.def === 82, `${f}: aircraft spotted -> ${A.top}, anti-air site score ${A.def}`);
    ok(H.top !== I.top, `${f}: different sightings produce different builds`);
    const E1 = probe(f, 'easy', ['r_overlord', 'r_overlord', 'r_overlord', 'r_tank']), E2 = probe(f, 'easy', Array(10).fill('r_conscript'));
    ok(E1.top === E2.top && E1.sh.heavy > 0.9, `${f} easy: sees the armor but does not counter-build`);
    rows.push(`${f.slice(0, 4)}: armor->${UNITS[H.top].name}, infantry->${UNITS[I.top].name}, air->${UNITS[A.top].name} + ${BLDGS[FACTIONS[f].roles.defense].name}`);
  }
  console.log('counter-build  : ' + rows.join(' | '));
}

// ---------------------------------------------------------------- F. expansion and Oil Derricks
{
  const rows = [];
  for (const [f, lv] of [['sandstorm', 'medium'], ['vanguard', 'hard']]) {
    const sim = new Sim({ factions: ['redhammer', f], difficulty: lv }); const a = sim.ais[0];
    const homeDock = sim.ents.filter(e => e.type === 'dock').sort((p, q) => Math.hypot(p.x - a.homeW.x, p.z - a.homeW.z) - Math.hypot(q.x - a.homeW.x, q.z - a.homeW.z))[0];
    let drained = -1, capAt = -1, expAt = -1;
    for (let t = 0; t < 12000; t++) {
      for (const e of sim.ents) if (e.team === PLAYER) { disarm(e); if (e.kind === 'unit') e.target = 0; }
      if (t === 4800) { homeDock.supplies = homeDock.maxSupplies * 0.25; drained = t; }
      sim.step(); sim.events.length = 0;
      if (capAt < 0 && sim.ents.some(e => e.type === 'derrick' && e.team === ENEMY)) capAt = t;
      if (expAt < 0 && a.stats.expands) expAt = t;
    }
    const depots = sim.ents.filter(e => e.team === ENEMY && e.kind === 'bldg' && BLDGS[e.type].role === 'supply');
    const far = depots.filter(d => Math.hypot(d.x - homeDock.x, d.z - homeDock.z) > 60);
    ok(expAt > drained && far.length >= 1, `${f}: second depot ordered ${((expAt - drained) / 20).toFixed(0)} s after the home dock fell below 30%`);
    ok(far.every(d => sim.ents.some(k => k.type === 'dock' && k !== homeDock && Math.hypot(k.x - d.x, k.z - d.z) < 60)), `${f}: the new depot stands beside another Supply Dock`);
    ok(capAt >= DIFFICULTY[lv].derrickAfter * 20 && capAt < 9000, `${f} ${lv}: Oil Derrick captured at ${(capAt / 20).toFixed(0)} s`);
    rows.push(`${f.slice(0, 4)} ${lv}: derrick at ${(capAt / 20).toFixed(0)} s, expansion ordered ${((expAt - drained) / 20).toFixed(0)} s after dock hit 25%`);
  }
  // before the dock runs low the AI must not expand
  const s2 = new Sim({ factions: ['redhammer', 'sandstorm'], difficulty: 'medium' }); for (let t = 0; t < 4800; t++) { for (const e of s2.ents) if (e.team === PLAYER) disarm(e); s2.step(); s2.events.length = 0; }
  ok(s2.ais[0].stats.expands === 0, 'no expansion while the home dock is above 30%');
  console.log('map control    : ' + rows.join(' | '));
}

// ---------------------------------------------------------------- G. tactical micro per difficulty
{
  const rows = [];
  for (const lv of ['easy', 'medium', 'hard']) {
    // retreat: a tank dropped to 30% under fire should pull back to the War Factory and get repaired
    const sim = new Sim({ factions: ['vanguard', 'redhammer'], difficulty: lv }); const a = sim.ais[0];
    makeBldg(sim, 'r_power', ENEMY, 232, 34); const fac = makeBldg(sim, 'r_factory', ENEMY, 228, 70); sim.nav.rebuild();
    const tank = spawnNear(sim, 'r_tank', ENEMY, 380, 210); tank.hp = tank.maxHp * 0.3; tank.lastHit = sim.tick;
    let ordered = -1, healed = false, near = false;
    for (let t = 0; t < 1400; t++) { for (const e of sim.ents) if (e.team === PLAYER) disarm(e); if (t < 3) tank.lastHit = sim.tick; sim.step(); sim.events.length = 0;
      if (ordered < 0 && a.retreating.has(tank.id)) ordered = t; if (Math.hypot(tank.x - fac.x, tank.z - fac.z) < 30) near = true; if (tank.hp >= tank.maxHp * 0.7) healed = true; }
    if (lv === 'easy') ok(ordered < 0 && a.stats.retreats === 0, 'easy: damaged tank is not pulled back');
    else ok(ordered >= 0 && near && healed, `${lv}: tank at 30% retreats (order after ${ordered} ticks), reaches the War Factory and is repaired to ${(100 * tank.hp / tank.maxHp).toFixed(0)}%`);
    // focus fire: four tanks engaged against two tanks and an Inferno Cannon
    const s2 = new Sim({ factions: ['redhammer', 'redhammer'], difficulty: lv }); const b = s2.ais[0];
    const mine = [0, 1, 2, 3].map(i => spawnNear(s2, 'r_tank', ENEMY, 300 + i * 6, 250));
    const foes = [hold(spawnNear(s2, 'r_tank', PLAYER, 296, 276)), hold(spawnNear(s2, 'r_tank', PLAYER, 310, 276)), hold(spawnNear(s2, 'r_inferno', PLAYER, 320, 282))];
    for (const f of foes) { f.hp = f.maxHp = 5000; }
    let onArty = 0;
    for (let t = 0; t < 120; t++) { for (const f of foes) disarm(f); s2.step(); s2.events.length = 0; onArty = Math.max(onArty, mine.filter(u => u.order && u.order.t === 'attack' && u.order.id === foes[2].id).length); }
    if (lv === 'hard') ok(onArty >= 2 && b.stats.focus >= 1, `hard: ${onArty} of 4 tanks switched to the Inferno Cannon`);
    else ok(onArty === 0 && b.stats.focus === 0, `${lv}: no focus-fire orders`);
    rows.push(`${lv}: retreat ${ordered >= 0 ? 'yes (repaired to ' + (100 * tank.hp / tank.maxHp).toFixed(0) + '%)' : 'no'}, focus ${onArty}/4 tanks`);
  }
  console.log('tactics        : ' + rows.join(' | '));
}

// ---------------------------------------------------------------- H. support powers never land on fogged targets
{
  const rows = []; let n = 0;
  for (const [f, lv, nodes, spotter] of [['vanguard', 'medium', ['v_a10'], 'v_drone'], ['vanguard', 'hard', ['v_a10', 'v_emp'], 'v_drone'], ['redhammer', 'medium', ['r_barrage'], 'r_scout'],
                                         ['redhammer', 'hard', ['r_barrage', 'r_fab'], 'r_conscript'], ['sandstorm', 'easy', ['s_ambush'], 's_guerrilla'], ['sandstorm', 'hard', ['s_ambush', 's_toxin'], 's_technical']]) {
    const sim = new Sim({ factions: ['redhammer', f], difficulty: lv }); const a = sim.ais[0], acc = newAcc(); watch(sim, a, acc);
    const T = sim.teams[ENEMY]; for (const k of nodes) { T.promos.add(k); T.powerReady[FACTIONS[f].tree.find(q => q.id === k).power] = 0; } T.points = 0;
    a.strategy = () => {};                                    // isolate the tactics layer: no economy, no army orders
    const X = 300, Z = 330;
    const group = [0, 1, 2, 3, 4, 5].map(i => hold(spawnNear(sim, 'r_tank', PLAYER, X + (i % 3) * 7, Z + ((i / 3) | 0) * 7)));
    sim.fog.stamp(ENEMY, X, Z, 50);                           // the AI has explored this ground earlier, but has nobody there now
    const tickAll = (k) => { for (let t = 0; t < k; t++) { for (const g of group) disarm(g); sim.step(); sim.events.length = 0; } };
    tickAll(600);
    const c1 = acc.casts; ok(c1 === 0, `${f} ${lv}: no cast at a never-seen force in explored fog`);
    // let the AI see the force once, then lose sight: it now REMEMBERS exactly where they are
    for (const k in T.powerReady) T.powerReady[k] = 1e9;
    const eye = hold(makeUnit(sim, spotter, ENEMY, X - 10, Z - 10, 0)); disarm(eye);
    for (let t = 0; t < 10; t++) { for (const g of group) disarm(g); sim.step(); sim.events.length = 0; }
    const remembered = [...a.aiMemoryMap.values()].filter(m => m.kind === 'unit').length;
    kill(sim, eye); tickAll(6);                               // the fog grid refreshes every 4 ticks; after that the area is dark again
    for (const k in T.powerReady) T.powerReady[k] = 0;
    tickAll(600);
    ok(remembered >= 4 && acc.casts === 0, `${f} ${lv}: remembers ${remembered} units but will not fire into fog (casts ${acc.casts})`);
    // sight regained: now it may fire, after its reaction delay
    const eye2 = hold(makeUnit(sim, spotter, ENEMY, X - 10, Z - 10, 0)); const t0 = sim.tick, c0 = acc.casts; let at = -1;
    for (let t = 0; t < 400 && at < 0; t++) { for (const g of group) disarm(g); disarm(eye2); sim.step(); sim.events.length = 0; if (acc.casts > c0) at = sim.tick - t0; }
    tickAll(4);
    ok(at >= DIFFICULTY[lv].react && acc.blind === 0, `${f} ${lv}: fires ${at} ticks after regaining sight (reaction floor ${DIFFICULTY[lv].react}), ${acc.blind} blind`);
    if (lv === 'hard') ok(acc.casts === 2 && a.stats.combos === 1, `${f} hard: both powers stacked on the same target (${acc.casts} casts)`);
    rows.push(`${f.slice(0, 4)} ${lv} via ${UNITS[spotter].name}: 0 casts in fog (unseen), 0 in fog (remembered ${remembered}), ${acc.casts} after ${(at / 20).toFixed(2)} s of sight`); n += acc.casts;
  }
  for (const r of rows) console.log((r === rows[0] ? 'powers vs fog  : ' : '                 ') + r);
}
console.log(fails ? `AI: ${fails} FAILURES of ${checks}` : `AI: all ${checks} checks passed`);
