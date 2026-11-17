// Batch 6: force attack, move markers, cancel construction, free placement, sandbox rank, Chinook supply runs, helipad repair.
import { Sim } from '../js/sim/simulationTick.js';
import { makeUnit, makeBldg, canPlace } from '../js/sim/entities.js';
import { completeBldg } from '../js/sim/econ.js';
import { CELL, N, PLAYER, ENEMY, NEUTRAL } from '../js/sim/defs.js';
import { UNITS, BLDGS, FACTIONS, GENERAL, trainsOf } from '../js/sim/factionRegistry.js';
import { hasPower } from '../js/sim/powers.js';
import { ReplayRecorder, verifyReplay } from '../js/sim/replayManager.js';
let fails = 0, checks = 0; const ok = (c, msg) => { checks++; if (!c) { fails++; console.log('  FAIL', msg); } };
const run = (sim, n, each) => { for (let i = 0; i < n; i++) { sim.step(); if (each) each(sim); sim.events.length = 0; } };
const open = () => { const s = new Sim({ empty: true, ai: false }); s.fog.exp[0].fill(1); s.fog.exp[1].fill(1); return s; };

{ // ---- force attack
  const s = open(); const tank = makeUnit(s, 'v_tank', PLAYER, 300, 300, 0), friend = makeUnit(s, 'v_tank', PLAYER, 330, 300, 0), far = makeUnit(s, 'v_tank', PLAYER, 300, 360, 0);
  run(s, 2);
  s.issue({ t: 'attack', ids: [tank.id], target: friend.id }); run(s, 60);
  ok(friend.hp === friend.maxHp, 'a normal attack order never hits your own unit');
  s.issue({ t: 'force', ids: [tank.id], target: friend.id }); run(s, 200);
  ok(friend.hp < friend.maxHp, 'force attack damages a friendly unit (hp ' + Math.round(friend.hp) + '/' + friend.maxHp + ')');
  const xp0 = s.teams[0].xp; run(s, 900); ok(friend.dead && s.teams[0].xp === xp0 && !tank.order, 'it can destroy it, earns no experience for that, and the order then ends');
  // ground: an empty spot, then a spot with a neutral-free, friendly unit standing on it
  const hp0 = far.hp; let shots = 0;
  s.issue({ t: 'force', ids: [tank.id], x: 300, z: 330 }); run(s, 200, (m) => { for (const e of m.events) if (e.t === 'fire' && e.sid === tank.id) shots++; });
  ok(shots >= 3 && tank.order && tank.order.t === 'fattack' && far.hp === hp0, 'force attack on open ground keeps firing at the spot (' + shots + ' shots) and hurts nothing that is not there');
  s.issue({ t: 'force', ids: [tank.id], x: far.x, z: far.z }); run(s, 240);
  ok(far.hp < hp0, 'shells aimed at the ground hurt whatever stands on that ground, friend or foe');
  s.issue({ t: 'stop', ids: [tank.id] }); run(s, 2); ok(!tank.order, 'Stop ends a force attack');
  // rifles (direct fire) at the ground, a building, and an out-of-range spot they must walk to
  const sq = makeUnit(s, 'v_ranger', PLAYER, 200, 200, 0), civ = makeBldg(s, 'civ', NEUTRAL, 110, 96); s.nav.rebuild();
  s.issue({ t: 'force', ids: [sq.id], target: civ.id }); run(s, 1500);
  ok(civ.hp < civ.maxHp || civ.ruined, 'infantry walk into range and shoot a neutral building on a force-attack order');
  const en = makeUnit(s, 'r_tank', ENEMY, 420, 420, 0), t2 = makeUnit(s, 'v_tank', PLAYER, 400, 420, 0); run(s, 2);
  s.issue({ t: 'force', ids: [t2.id], target: en.id }); run(s, 300); ok(en.hp < en.maxHp, 'force attack also works on an enemy');
  const doz = makeUnit(s, 'v_dozer', PLAYER, 380, 380, 0); s.issue({ t: 'force', ids: [doz.id], x: 300, z: 300 }); run(s, 2); ok(!doz.order, 'unarmed units ignore a force-attack order');
  const tr = new Sim({ empty: true, ai: false, treaty: 60 }); const a = makeUnit(tr, 'v_tank', PLAYER, 300, 300, 0); tr.issue({ t: 'force', ids: [a.id], x: 320, z: 300 }); run(tr, 3); ok(!a.order, 'a peace treaty also locks force attack');
  console.log(`force attack   : friendly unit destroyed on order | ${shots} shots at open ground | ground fire hurts what stands there | buildings, enemies | treaty respected`);
}
{ // ---- aircraft: a jet force-attacks a point on the ground
  const s = open(); for (const [x, z] of [[40, 150], [40, 160]]) makeBldg(s, 'v_power', PLAYER, x, z);
  const f = makeBldg(s, 'v_airfield', PLAYER, 48, 182); s.nav.rebuild(); const jet = makeUnit(s, 'v_f15', PLAYER, f.x, f.z, 0); run(s, 5);
  const victim = makeUnit(s, 'v_tank', PLAYER, 300, 300, 0); run(s, 2);
  s.issue({ t: 'force', ids: [jet.id], x: 300, z: 300 }); let left = false, least = 9; run(s, 1500, () => { if (jet.as === 'out') left = true; least = Math.min(least, jet.ammo); });
  ok(left && least === 0 && victim.hp < victim.maxHp, 'an F-15E takes off, drops both bombs on the marked spot and hits what is on it (tank hp ' + Math.round(victim.hp) + '/' + victim.maxHp + ')');
  ok(jet.as === 'parked' && jet.ammo === 2, 'and comes home and re-arms afterwards (' + jet.as + ')');
  console.log('force attack   : F-15E bombed a ground point and landed');
}
{ // ---- move markers
  const s = open(); const u = makeUnit(s, 'v_tank', PLAYER, 300, 300, 0), v = makeUnit(s, 'v_tank', PLAYER, 300, 312, 0); run(s, 2);
  const pts = [[360, 300], [360, 360], [300, 360]];
  s.issue({ t: 'move', ids: [u.id, v.id], x: pts[0][0], z: pts[0][1], queue: true }); run(s, 2);
  ok(u.order && u.order.t === 'move' && !u.wps, 'the first marker of an idle unit is a normal move');
  s.issue({ t: 'move', ids: [u.id, v.id], x: pts[1][0], z: pts[1][1], queue: true }); s.issue({ t: 'move', ids: [u.id, v.id], x: pts[2][0], z: pts[2][1], queue: true }); run(s, 2);
  ok(u.wps && u.wps.length === 2 && v.wps.length === 2 && Math.hypot(u.order.x - pts[0][0], u.order.z - pts[0][1]) < 12, 'two more markers queue up behind it without changing the current leg');
  const visited = [false, false, false]; run(s, 1400, () => pts.forEach((p, i) => { if (Math.hypot(u.x - p[0], u.z - p[1]) < 12) visited[i] = true; }));
  ok(visited.every(Boolean) && !u.order && !u.wps && Math.hypot(u.x - pts[2][0], u.z - pts[2][1]) < 12, 'the unit visits every marker in order and stops at the last (' + visited + ')');
  ok(Math.hypot(u.x - v.x, u.z - v.z) > 3, 'units that travel together keep separate spots at each marker');
  s.issue({ t: 'move', ids: [u.id], x: 360, z: 300, queue: true }); s.issue({ t: 'move', ids: [u.id], x: 360, z: 360, queue: true }); run(s, 2);
  s.issue({ t: 'move', ids: [u.id], x: 280, z: 280 }); run(s, 2); ok(!u.wps, 'a plain order clears the queued markers');
  for (let i = 0; i < 20; i++) s.issue({ t: 'move', ids: [u.id], x: 300 + i * 3, z: 300, queue: true }); run(s, 2); ok(u.wps.length <= 12, 'at most 12 markers are kept');
  const h = makeUnit(s, 'v_comanche', PLAYER, 200, 200, 0); run(s, 2);
  s.issue({ t: 'move', ids: [h.id], x: 240, z: 200, queue: true }); s.issue({ t: 'move', ids: [h.id], x: 240, z: 250, queue: true }); run(s, 400);
  ok(Math.hypot(h.x - 240, h.z - 250) < 9 && !h.wps, 'helicopters follow markers too');
  console.log('move markers   : 3 markers visited in order by a pair of tanks | cleared by a plain order | capped at 12 | helicopters');
}
{ // ---- cancel construction, free placement
  const s = new Sim({ ai: false }); const T = s.teams[0], doz = s.ents.find(e => e.team === PLAYER && e.kind === 'unit' && UNITS[e.type].builder);
  const far = [N - 70, 60];
  ok(!s.fog.exp[0][far[1] * N + far[0]] && canPlace(s, 'v_power', far[0], far[1], PLAYER), 'a building can be placed on ground you have never seen');
  ok(!canPlace(s, 'v_power', 0, 0, PLAYER) && !canPlace(s, 'v_power', s.map.start[0].cc[0], s.map.start[0].cc[1], PLAYER), 'but still not off the map or on top of another building');
  const m0 = T.money; s.issue({ t: 'build', id: doz.id, type: 'v_power', cx: far[0], cz: far[1] }); run(s, 3);
  const site = s.ents.find(e => e.type === 'v_power' && e.team === PLAYER);
  ok(!!site && !site.done && T.money === m0 - BLDGS.v_power.cost, 'the site is placed and paid for');
  const lost0 = T.bldgsLost; s.issue({ t: 'cancelbuild', id: site.id }); run(s, 3);
  ok(T.money === m0 && !s.byId.get(site.id) && T.bldgsLost === lost0 && !doz.order, 'cancelling returns the full price, removes the site, counts no loss, and frees the builder');
  ok(canPlace(s, 'v_power', far[0], far[1], PLAYER), 'the ground is free again');
  const cc = s.ents.find(e => e.team === PLAYER && e.kind === 'bldg'); const m1 = T.money; s.issue({ t: 'cancelbuild', id: cc.id }); run(s, 2);
  ok(!cc.dead && T.money === m1, 'a finished building cannot be cancelled for a refund');
  const foe = s.ents.find(e => e.team === ENEMY && e.kind === 'bldg'); s.issue({ t: 'cancelbuild', id: foe.id }); run(s, 2); ok(!foe.dead, 'nor can the enemy\'s');
  console.log('construction   : placed in unseen ground | cancelled for a full refund of $' + BLDGS.v_power.cost);
}
{ // ---- sandbox: full rank
  for (const [fac, gen] of [['vanguard', 'airforce'], ['redhammer', 'cyber'], ['sandstorm', 'wmd']]) {
    const s = new Sim({ noEnemy: true, factions: [fac, 'vanguard'], generals: [gen, null] }), T = s.teams[0], tree = FACTIONS[fac].tree;
    ok(T.rank === GENERAL.rankXp.length && tree.every(n => T.promos.has(n.id)), fac + ': sandbox starts at rank ' + T.rank + ' with all ' + tree.length + ' promotions');
    const powers = tree.filter(n => n.power).map(n => n.power);
    ok(tree.filter(n => n.power).every(n => T.powerReady[n.power] === 0) && powers.some(p => hasPower(s, 0, p) || (gen === 'airforce' && p === 'tomahawk')), fac + ': every power is ready at once');
    if (gen === 'airforce') ok(hasPower(s, 0, 'b2') && !hasPower(s, 0, 'tomahawk'), 'the Air Force general gets the B-2 Fuel-Air Bomb in place of the Tomahawk Strike');
  }
  const n = new Sim({ ai: false }); ok(n.teams[0].rank < GENERAL.rankXp.length && n.teams[0].promos.size === 0, 'a normal match still starts at the bottom');
  console.log('sandbox        : full rank, all promotions and powers for all three factions');
}
{ // ---- Chinook supply runs
  const s = new Sim({ ai: false, factions: ['vanguard', 'redhammer'] }); const T = s.teams[0];
  ok(FACTIONS.vanguard.roles.truck === 'v_chinook' && ['airforce', 'marine', null].every(g => { const t = new Sim({ ai: false, generals: [g, null] }).teams[0]; return trainsOf(t, 'v_supply').includes('v_chinook'); }), 'every United States general trains Chinooks at the Supply Center');
  const cc = s.ents.find(e => e.team === PLAYER && e.kind === 'bldg'); makeBldg(s, 'v_power', PLAYER, cc.cx + 14, cc.cz);
  const sc = makeBldg(s, 'v_supply', PLAYER, cc.cx + 14, cc.cz + 10, false); s.nav.rebuild(); completeBldg(s, sc);
  const ch = s.ents.filter(e => e.type === 'v_chinook'); ok(ch.length === 1 && ch[0].air, 'a finished Supply Center comes with one Chinook');
  const m0 = T.money; let low = 1, cash = 0; run(s, 1800, (m) => { low = Math.min(low, ch[0].altK); for (const e of m.events) if (e.t === 'cash') cash++; });
  ok(T.earned >= 900 && cash >= 3, 'it banks supplies with no orders: $' + T.earned + ' in 90 s over ' + cash + ' deliveries');
  ok(low < 0.4 && low > 0.2, 'it drops low over the dock and the Supply Center to load and unload (lowest ' + low.toFixed(2) + ' of cruise height)');
  s.issue({ t: 'train', id: sc.id, type: 'v_chinook' }); s.issue({ t: 'train', id: sc.id, type: 'v_truck' }); run(s, 400);
  ok(s.ents.filter(e => e.type === 'v_chinook').length === 2 && !s.ents.some(e => e.type === 'v_truck' && e.team === PLAYER), 'more Chinooks can be trained; trucks cannot');
  // a river in the way costs a Chinook nothing
  const e0 = T.earned; s.issue({ t: 'move', ids: [ch[0].id], x: 300, z: 300 }); run(s, 300); const e1 = T.earned; run(s, 1200);
  ok(T.earned > e1 + 300, 'after a move order it goes back to work on its own (+$' + (T.earned - e1) + ')');
  // AI: United States economy still runs
  const a = new Sim({ ai: 'both', factions: ['vanguard', 'vanguard'], difficulty: 'hard' }); run(a, 4800);
  const chin = a.ents.filter(e => e.type === 'v_chinook' && e.team === ENEMY).length;
  ok(chin >= 2 && a.teams[1].earned > 3000, 'the AI as the United States builds Chinooks and earns with them (' + chin + ' Chinooks, $' + a.teams[1].earned + ' in 4 min)');
  console.log(`chinook        : free with the Supply Center | $${T.earned} banked | AI flies ${chin}, earned $${a.teams[1].earned} in 4 min`);
}
{ // ---- helicopters land and repair
  const s = open(); for (const [x, z] of [[40, 150], [40, 160]]) makeBldg(s, 'v_power', PLAYER, x, z);
  const f = makeBldg(s, 'v_airfield', PLAYER, 48, 182); s.nav.rebuild();
  const h = makeUnit(s, 'v_comanche', PLAYER, 300, 300, 0), h2 = makeUnit(s, 'v_comanche', PLAYER, 320, 300, 0); h.hp = 60; h2.hp = 100; run(s, 2);
  s.issue({ t: 'landrepair', ids: [h.id, h2.id] }); let both = 0; const seen = new Set();
  run(s, 700, () => { seen.add(h.as); if (h.as === 'pad' && h2.as === 'pad') both++; });
  ok(h.as === 'pad' && h.landed && h.altK === 0 && Math.hypot(h.x - f.heli.x, h.z - f.heli.z) < 0.1 && seen.has('land'), 'the first helicopter flies to the helipad and lands on it (' + [...seen] + ')');
  ok(h.hp === h.maxHp, 'it is repaired to full health on the pad (' + Math.round(h.hp) + '/' + h.maxHp + ')');
  ok(both === 0 && h2.as !== 'pad' && h2.altK === 1 && Math.hypot(h2.x - f.heli.x, h2.z - f.heli.z) < 20, 'the second one waits in the air nearby: one helicopter on the pad at a time');
  s.issue({ t: 'move', ids: [h.id], x: 200, z: 200 }); run(s, 600);
  ok(!h.landed && h.altK === 1 && Math.hypot(h.x - 200, h.z - 200) < 6, 'a move order starts it up and it flies off');
  ok(h2.as === 'pad' && h2.hp === h2.maxHp, 'then the waiting helicopter takes the pad and is repaired');
  const lone = new Sim({ empty: true, ai: false }); const x = makeUnit(lone, 'v_comanche', PLAYER, 300, 300, 0); let said = false; lone.issue({ t: 'landrepair', ids: [x.id] }); run(lone, 2, (m) => { if (m.events.some(e => e.t === 'msg')) said = true; });
  ok(!x.order && said, 'with no Airfield the order is refused with a message');
  const c = makeUnit(s, 'v_chinook', PLAYER, 260, 260, 0); c.hp = 50; run(s, 2); s.issue({ t: 'move', ids: [h2.id], x: 380, z: 380 }); s.issue({ t: 'landrepair', ids: [c.id] }); run(s, 900);
  ok(c.as === 'pad' && c.hp === c.maxHp, 'a Chinook can land and repair as well');
  f.hp = 1; const { kill } = await import('../js/sim/entities.js'); kill(s, f); run(s, 120); ok(!c.dead && c.as !== 'pad', 'if the Airfield is destroyed the helicopter lifts off again');
  console.log('land + repair  : lands on the helipad, repaired to full, one at a time, takes off on a new order');
}
{ // ---- replay with the new orders
  const sim = new Sim({ factions: ['vanguard', 'redhammer'], difficulty: 'medium' }), rec = new ReplayRecorder(sim);   // enemy AI only: a replay stores the player's own orders
  const mine = (pred) => sim.ents.filter(e => e.team === PLAYER && e.kind === 'unit' && pred(e));
  for (let t = 0; t < 2400; t++) {
    if (t === 100) { const ids = mine(e => !UNITS[e.type].builder).map(e => e.id); sim.issue({ t: 'move', ids, x: 200, z: 300, queue: true }); sim.issue({ t: 'move', ids, x: 260, z: 300, queue: true }); }
    if (t === 600) sim.issue({ t: 'force', ids: mine(e => UNITS[e.type].weapon).map(e => e.id), x: 250, z: 320 });
    sim.step(); rec.mark(); sim.events.length = 0;
  }
  const data = JSON.parse(JSON.stringify(rec.export())); ok(verifyReplay(data).ok, 'a replay with move markers and a force attack reproduces the match');
  console.log('replay         : verified with the new orders');
}
{ // ---- new maps and the free-hand brushes
  const { generateMap, validateMap, heightAt, URBAN_MAP, ARCTIC_MAP, OPEN_MAP, MAPS, BIOMES, MAP_LIMITS, cloneSpec } = await import('../js/sim/map.js');
  const { applyTool, TOOLS } = await import('../js/ui/mapBuilder.js');
  const { BIOME_SURFACES, SURFACES } = await import('../js/render/environmentFX.js').catch(() => ({}));
  ok(MAPS.map(m => m.id).join() === 'canyon,open,forest,urban,arctic,strait,isles' && MAPS.every(m => m.spec && validateMap(m.spec).ok), 'the lobby offers seven maps (five at 1 km, two sea maps at 2 km) and every one passes the map checker');
  const U = validateMap(URBAN_MAP), A = validateMap(ARCTIC_MAP), count = (m, f) => { let n = 0; for (let i = 0; i < N * N; i++) if (f(i, m)) n++; return n; };
  ok(U.ok && U.map.biome === 'urban' && U.map.civs.length === 48 && !U.map.hasWater && U.map.trees.length === 0 && U.map.roads.length >= 12, 'Urban Megacity: paved, 48 buildings, a street grid, no water and no trees');
  ok(new Set(U.map.civs.map(c => c[2])).size >= 6, 'with at least six different building types');
  ok(A.ok && A.map.biome === 'snow' && A.map.derricks.length === 10 && A.map.hasWater && A.map.trees.length / 3 > 800 && count(A.map, (i, m) => m.water[i]) > 3000, 'Arctic Refinery: snow, ten oil derricks, a frozen inlet, ' + A.map.trees.length / 3 + ' pines');
  ok(Object.keys(BIOMES).join() === 'desert,woods,urban,snow', 'four ground types');
  if (BIOME_SURFACES) ok(['urban', 'snow'].every(b => BIOME_SURFACES[b].every(n => typeof SURFACES[n] === 'function')) && SURFACES.snow(0.3, 0.7)[3] > 200 && Math.abs(SURFACES.concrete(0.31, 0.72)[1] - SURFACES.concrete(0.31, 0.72)[3]) < 12, 'city and snow have their own ground textures (snow is white, paving is grey)');
  // brushes
  const s = cloneSpec(OPEN_MAP); s.civs = []; const base = generateMap(s);
  ok(TOOLS.slice(0, 3).map(t => t[0]).join() === 'paintrock,painthill,paintwater', 'the builder lists the three brushes first');
  const stroke = (x0, z0, x1, z1, n) => Array.from({ length: n }, (_, i) => [x0 + (x1 - x0) * i / (n - 1), z0 + (z1 - z0) * i / (n - 1) + Math.sin(i) * 3]);
  ok(applyTool(s, 'paintrock', null, null, { pts: stroke(90, 90, 130, 100, 8), size: 6 }) && s.paint.length === 8, 'a rock stroke becomes one stamp per point');
  ok(applyTool(s, 'painthill', null, null, { pts: stroke(60, 160, 80, 170, 4), size: 10 }) && applyTool(s, 'paintwater', null, null, { pts: stroke(150, 170, 200, 200, 9), size: 6 }), 'hill and water strokes are accepted');
  const m = generateMap(s);
  const rockNew = count(m, (i, mm) => mm.blocked[i] === 1) - count(base, (i, mm) => mm.blocked[i] === 1), wat = count(m, (i, mm) => mm.water[i]);
  ok(rockNew > 200 && m.rock[94 * m.V + 108] > 0.9 && m.rock[(N - 94) * m.V + (N - 108)] > 0.9, 'painted rock is a real plateau with cliffs, and it is mirrored for the other side (' + rockNew + ' cliff cells)');
  ok(wat > 1200 && m.blocked[183 * N + 172] === 2 && m.hasWater, 'painted water blocks ground units like a river (' + wat + ' cells)');
  const hx = 66 * 2, hz = 163 * 2; ok(heightAt(m, hx, hz) > heightAt(base, hx, hz) + 2.5 && !m.blocked[163 * N + 66] && !m.blocked[158 * N + 60], 'a painted hill is ' + (heightAt(m, hx, hz) - heightAt(base, hx, hz)).toFixed(1) + ' m high and stays drivable');
  const r = validateMap(s); ok(r.ok, 'the painted map passes the checker: ' + r.errors.join(' '));
  const n0 = s.paint.length; ok(applyTool(s, 'erase', [150, 170]) && s.paint.length < n0, 'Erase removes the brush work under the click'); ok(applyTool(s, 'erase', [N - 100, N - 92]) && s.paint.length < n0 - 1, 'and works from the mirror side too');
  const big = cloneSpec(OPEN_MAP); for (let i = 0; i < 60; i++) applyTool(big, 'painthill', null, null, { pts: stroke(40, 40, 200, 60, 10), size: 4 }); ok(big.paint.length === MAP_LIMITS.paint, 'brush stamps are capped at ' + MAP_LIMITS.paint + ' per side');
  // a wall painted right across the map is still refused
  const wall = cloneSpec(OPEN_MAP); wall.civs = []; applyTool(wall, 'paintrock', null, null, { pts: stroke(0, 128, 256, 128, 60), size: 7 }); wall.paint.forEach(p => { p[1] = 128; });
  ok(!validateMap(wall).ok, 'a brush wall that cuts the bases apart is refused');
  // both new maps play: AI against AI for five minutes
  const rows = [];
  for (const [name, spec, facs] of [['Urban Megacity', URBAN_MAP, ['vanguard', 'redhammer']], ['Arctic Refinery', ARCTIC_MAP, ['sandstorm', 'vanguard']]]) {
    const g = new Sim({ ai: 'both', factions: facs, difficulty: 'hard', map: spec }); const t0 = performance.now(); const bl = [0, 0]; run(g, 6000, (mm) => { if (mm.tick % 200 === 0) for (const t of [0, 1]) bl[t] = Math.max(bl[t], mm.ents.filter(e => e.team === t && e.kind === 'bldg').length); });   // peak count: a five-minute match between hard AIs can already be decided
    const der = g.ents.filter(e => e.type === 'derrick' && e.team < 2).length;
    ok(bl[0] >= 6 && bl[1] >= 6 && g.teams[0].earned > 6000 && g.teams[1].earned > 6000, name + ': both AIs build a base and earn (' + bl + ' buildings at their peak, $' + g.teams[0].earned + ' / $' + g.teams[1].earned + ')');
    rows.push(`${name}: ${bl.join('+')} buildings at peak, ${der} derricks captured, $${g.teams[0].earned}/$${g.teams[1].earned}, ${((performance.now() - t0) / 6000).toFixed(2)} ms/tick`);
  }
  console.log('maps           : ' + rows.join(' | '));
  console.log(`brushes        : rock +${rockNew} cliff cells | water ${wat} cells | hill drivable | erase | cap ${MAP_LIMITS.paint}`);
}
console.log(fails ? `BATCH6: ${fails} FAILURES of ${checks}` : `BATCH6: all ${checks} checks passed`);
process.exit(fails ? 1 : 0);
