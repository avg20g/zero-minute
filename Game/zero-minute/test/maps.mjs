// Custom maps and sandbox mode: the spec generator, the validator, the builder's edit tools,
// a full AI match on a hand-built map, replays of custom maps, and the No-enemy option.
globalThis.localStorage = { getItem: () => null, setItem() {} }; globalThis.document = { getElementById: () => null };
const { Sim } = await import('../js/sim/simulationTick.js');
const { generateMap, validateMap, DEFAULT_MAP, OPEN_MAP, cloneSpec } = await import('../js/sim/map.js');
const { applyTool, TOOLS } = await import('../js/ui/mapBuilder.js');
const { ReplayRecorder, verifyReplay } = await import('../js/sim/replayManager.js');
const { N, PLAYER, ENEMY } = await import('../js/sim/defs.js');
const { UNITS, BLDGS } = await import('../js/sim/factionRegistry.js');
let fails = 0, checks = 0; const ok = (c, msg) => { checks++; if (!c) { fails++; console.log('  FAIL', msg); } };
const blank = () => ({ name: 'Custom map', mesas: [], ramps: [], roads: [], docks: [], derricks: [], civs: [], start: [30, 196] });

// ---------------------------------------------------------------- A. built-in maps and the edit tools
{
  ok(validateMap(DEFAULT_MAP).ok && validateMap(OPEN_MAP).ok, 'Desert Canyon and Open Desert both validate');
  ok(TOOLS.length === 13, '13 tools: three free-hand brushes, rock, ramp, road, river, bridge, dock, derrick, building, your base, erase');
  const s = blank();
  ok(applyTool(s, 'rock', [100, 60], [150, 90]) && s.mesas.length === 1 && s.mesas[0][0] === 125 && s.mesas[0][2] === 25, 'rock: a dragged rectangle becomes a plateau');
  ok(!applyTool(s, 'rock', [10, 10], [12, 12]), 'rock: a tiny drag is ignored');
  ok(applyTool(s, 'ramp', [125, 90], [125, 108]) && s.ramps[0].dz === 1 && s.ramps[0].dx === 0 && s.ramps[0].len === 18, 'ramp: direction snaps to the drag axis');
  ok(applyTool(s, 'road', [40, 200], [128, 128]) && applyTool(s, 'dock', [66, 225]) && applyTool(s, 'derrick', [94, 154]) && applyTool(s, 'civ', [110, 130]), 'road, Supply Dock, Oil Derrick and building placed');
  ok(s.docks[0].x === 62 && s.docks[0].z === 222, 'objects are centred on the click');
  const m = generateMap(s);
  ok(m.docks.length === 2 && m.derricks.length === 2 && m.civs.length === 2 && m.ramps.length === 2 && m.custom, 'the generator mirrors every object through the centre');
  ok(m.docks[1].x === N - 62 - 8 && m.docks[1].z === N - 222 - 6 && m.start[1].cc[0] === N - 30 - 10, 'mirror positions are exact');
  const v = validateMap(s); ok(v.ok, 'that hand-built map is playable: ' + v.errors.join(' | '));
  // erase works on the object and on its mirror twin
  const t = cloneSpec(s); ok(applyTool(t, 'erase', [N - 66, N - 225]) && t.docks.length === 0, 'erase: clicking the mirror twin removes the pair');
  ok(applyTool(t, 'erase', [125, 75]) && t.mesas.length === 0 && !applyTool(t, 'erase', [200, 20]), 'erase: removes a plateau; empty ground does nothing');
  ok(applyTool(t, 'start', [60, 60]) && t.start[0] === 55 && t.start[1] === 55, 'your base moves to the click');
}

// ---------------------------------------------------------------- B. the validator refuses unplayable maps
{
  const bad = (name, edit, re) => { const s = cloneSpec(OPEN_MAP); edit(s); const v = validateMap(s); ok(!v.ok && v.errors.some(e => re.test(e)), `${name}: ${v.errors[0] || 'NOT REFUSED'}`); return v.errors[0]; };
  const msgs = [
    bad('wall across the map', (s) => { s.mesas.push([128, 128, 140, 12, 6]); }, /no ground route/),
    bad('no Supply Dock', (s) => { s.docks = []; }, /at least one Supply Dock/),
    bad('dock on rock', (s) => { s.mesas.push([70, 100, 20, 20, 6]); s.docks.push({ x: 86, z: 97, amount: 30000 }); }, /sits on rock/),
    bad('base at the edge', (s) => { s.start = [6, 6]; }, /too close to the map edge/),
    bad('rock on the base', (s) => { s.mesas.push([40, 205, 12, 12, 6]); }, /start area needs open ground/),
    bad('bases too close', (s) => { s.start = [100, 100]; }, /too close together/),
    bad('objects overlap', (s) => { s.derricks.push([64, 224]); }, /overlaps/),
    bad('too many plateaus', (s) => { for (let i = 0; i < 30; i++) s.mesas.push([20, 20, 4, 4, 2]); }, /Too many mesas/),
  ];
  ok(validateMap(null).ok === false && validateMap({}).ok === false, 'missing or empty data is refused, not crashed on');
  console.log(`validator      : ${msgs.length} kinds of unplayable map refused, each with a plain-English reason`);
}

// ---------------------------------------------------------------- C. a full AI match on a hand-built map
{
  const s = blank();
  applyTool(s, 'rock', [96, 150], [130, 235]); applyTool(s, 'rock', [20, 110], [90, 135]); applyTool(s, 'ramp', [55, 135], [55, 152]); applyTool(s, 'ramp', [55, 110], [55, 93]);
  applyTool(s, 'dock', [66, 228]); applyTool(s, 'dock', [150, 180]); applyTool(s, 'derrick', [80, 170]); applyTool(s, 'civ', [118, 118]); applyTool(s, 'road', [40, 200], [128, 128]);
  const v = validateMap(s); ok(v.ok, 'ridge-and-ramp custom map validates: ' + v.errors.join(' | '));
  const run = () => {
    const sim = new Sim({ ai: 'both', difficulty: ['hard', 'medium'], factions: ['vanguard', 'sandstorm'], map: s, money: 10000 }), rec = new ReplayRecorder(sim);
    const start = sim.ents.filter(e => e.kind === 'unit').every(u => !sim.map.blocked[Math.floor(u.z / 2) * N + Math.floor(u.x / 2)]);
    let nan = 0; for (let t = 0; t < 12000; t++) { sim.step(); rec.mark(); sim.events.length = 0; }
    for (const e of sim.ents) if (!(e.x === e.x && e.z === e.z)) nan++;
    return { sim, rec, start, nan };
  };
  const a = run(), T = a.sim.teams;
  ok(a.start, 'every starting unit stands on open ground');
  ok(T[0].built > 8 && T[1].built > 8 && T[0].earned > 3000 && T[1].earned > 3000, `both AIs build and harvest on it (built ${T[0].built}/${T[1].built}, harvested $${T[0].earned}/$${T[1].earned})`);
  ok(T[0].unitsKilled + T[1].unitsKilled > 0 && a.nan === 0, `they find each other and fight (${T[0].unitsKilled + T[1].unitsKilled} units destroyed), no bad positions`);
  // replay: a normal player-vs-AI match on the same map, with a few player orders
  const r = new Sim({ factions: ['vanguard', 'sandstorm'], map: s }), rr = new ReplayRecorder(r), dz = r.ents.find(e => e.team === PLAYER && e.kind === 'unit' && UNITS[e.type].builder);
  for (let t = 0; t < 4000; t++) { if (t === 5) r.issue({ t: 'build', id: dz.id, type: 'v_power', cx: 44, cz: 212 }); if (t === 900) r.issue({ t: 'scatter', ids: r.ents.filter(e => e.team === PLAYER && e.kind === 'unit').map(e => e.id) }); r.step(); rr.mark(); r.events.length = 0; }
  const data = JSON.parse(JSON.stringify(rr.export())), vr = verifyReplay(data);
  ok(data.setup.map && data.setup.map.mesas.length === 2 && vr.ok, 'the map travels inside the replay and the replay reproduces the match');
  console.log(`custom map     : 10 min AI v AI | built ${T[0].built}/${T[1].built} | harvested $${T[0].earned}/$${T[1].earned} | ${T[0].unitsKilled + T[1].unitsKilled} units destroyed | replay ${(JSON.stringify(data).length / 1024).toFixed(1)} KB verified`);
  const o = new Sim({ ai: 'both', map: OPEN_MAP }); for (let t = 0; t < 6000; t++) { o.step(); o.events.length = 0; }
  ok(o.teams[0].built > 4 && o.teams[1].built > 4, `Open Desert plays too (built ${o.teams[0].built}/${o.teams[1].built} in 5 min)`);
}

// ---------------------------------------------------------------- D. No-enemy (sandbox) option
{
  const sim = new Sim({ noEnemy: true, money: 25000 });
  ok(sim.ais.length === 0 && !sim.ents.some(e => e.team === ENEMY) && sim.setup.noEnemy, 'no AI controller and nothing on the enemy side');
  const dz = sim.ents.find(e => e.team === PLAYER && e.kind === 'unit' && UNITS[e.type].builder), F = 'v_power';
  sim.issue({ t: 'build', id: dz.id, type: F, cx: 44, cz: 212 }); let over = 0;
  for (let t = 0; t < 6000; t++) { sim.step(); for (const e of sim.events) if (e.t === 'over') over++; sim.events.length = 0; }
  ok(sim.winner < 0 && over === 0, 'five minutes in: no winner, no end screen');
  ok(sim.ents.some(e => e.type === F && e.done), 'you can build as normal');
  const k = new Sim({ noEnemy: true, koth: true }); for (let t = 0; t < 400; t++) { k.step(); k.events.length = 0; }
  ok(k.winner < 0, 'sandbox with other rules switched on still never ends');
  console.log('sandbox        : no AI, no enemy base, no win/lose; building works');
}
console.log(fails ? `MAPS: ${fails} FAILURES of ${checks}` : `MAPS: all ${checks} checks passed`);
process.exit(fails ? 1 : 0);
