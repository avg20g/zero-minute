// Batch 11: maps of several sizes (the five maps at 1 km, two sea maps at 2 km), faster roads, ships and shipyards,
// the Landing Craft, SEAL Teams, missile defense at sea, the AI's fleet, and the Scud Storm rails.
import { readFileSync } from 'node:fs';
import { Sim } from '../js/sim/simulationTick.js';
import { makeUnit, makeBldg, spawnNear, placeError, shoreFace, navOf, roomFor, kill } from '../js/sim/entities.js';
import { canAttack, canForce, slotsOf } from '../js/sim/combat.js';
import { N, WORLD, PLAYER, ENEMY, CELL, ROAD_SPEED, SWIM_SPEED } from '../js/sim/defs.js';
import { UNITS, BLDGS, WEAPONS, FACTIONS, GENERALS, trainsOf } from '../js/sim/factionRegistry.js';
import { MAPS, DEFAULT_MAP, OPEN_MAP, FOREST_MAP, URBAN_MAP, ARCTIC_MAP, OPEN_BIG, STRAIT_MAP, ISLES_MAP, validateMap, generateMap } from '../js/sim/map.js';
import { NAV_BOAT, NAV_WARSHIP, NAV_BEACH } from '../js/sim/pathfinding.js';

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) pass++; else { fail++; console.log('  FAIL', msg); } };
const bare = (o = {}) => { const s = new Sim({ ai: false, empty: true, ...o }); s.fog.exp[0].fill(1); s.fog.exp[1].fill(1); return s; };
const run = (s, n, f) => { for (let i = 0; i < n; i++) { s.step(); if (f) f(s.events); s.events.length = 0; } };
const hold = (u) => { u.order = { t: 'hold' }; return u; };
const shore = (s, u) => s.nav.distS[s.nav.cellOf(u.x, u.z)];           // cells of water between a ship and the nearest land
const wet = (s, u) => s.nav.isWater(s.nav.cellOf(u.x, u.z));
const src = (f) => readFileSync(new URL('../js/' + f, import.meta.url), 'utf8');
// first spot, scanning outward from a cell, where this shipyard may stand
function yardSite(s, type, ax, az) {
  let best = null, bd = 1e9;
  for (let z = 6; z < N - 16; z += 2) for (let x = 6; x < N - 16; x += 2) { const d = Math.hypot(x - ax, z - az); if (d < bd && !placeError(s.use(), type, x, z, PLAYER)) { bd = d; best = [x, z]; } }
  return best;
}

// ---------------------------------------------------------------- maps come in three sizes, and games of different sizes can run side by side
{
  const a = new Sim({ ai: 'both', seed: 5 }), b = new Sim({ ai: 'both', seed: 5, map: MAPS[0].spec }), c = new Sim({ ai: false, empty: true, map: STRAIT_MAP });
  ok(a.size === 256 && b.size === 512 && c.size === 1024 && a.nav.dist.length === 256 * 256 && b.nav.dist.length === 512 * 512 && c.fog.vis[0].length === 1024 * 1024, 'sizes: the test map is 256 cells, a lobby map 512 (1 km), a sea map 1,024 (2 km)');
  const solo = new Sim({ ai: 'both', seed: 5, map: MAPS[0].spec }); for (let i = 0; i < 1500; i++) solo.step(); const h1 = solo.hash();
  for (let i = 0; i < 1500; i++) { a.step(); b.step(); if (i % 7 === 0) c.step(); }
  ok(b.hash() === h1, 'a 1 km game gives the same result whether it runs alone or interleaved with games of other sizes');
  a.use(); ok(N === 256 && WORLD === 512, 'use(): the current map size follows the game being worked on'); c.use(); ok(N === 1024 && WORLD === 2048, 'and switches back');
}
{
  const ids = MAPS.map(m => m.id).join();
  ok(ids === 'canyon,open,forest,urban,arctic,strait,isles', 'the lobby lists seven maps: ' + ids);
  let allOk = true, sizes = [];
  for (const m of MAPS) { const v = validateMap(m.spec); sizes.push(m.spec.size); if (!v.ok) { allOk = false; console.log('   ', m.id, v.errors.join(' | ')); } }
  ok(allOk, 'every lobby map passes the map checker (bases joined by land, docks reachable, nothing on rock or water)');
  ok(sizes.join() === '512,512,512,512,512,1024,1024', 'five maps are 1 km across and the two sea maps 2 km');
  const small = [DEFAULT_MAP, OPEN_MAP, FOREST_MAP, URBAN_MAP, ARCTIC_MAP];
  let same = true, extra = true;
  small.forEach((S, i) => {
    const B = MAPS[i].spec, d0 = [S.docks[0].x - S.start[0], S.docks[0].z - S.start[1]], d1 = [B.docks[0].x - B.start[0], B.docks[0].z - B.start[1]];
    if (d0[0] !== d1[0] || d0[1] !== d1[1]) same = false;
    if (B.docks.length !== S.docks.length + 1 || B.derricks.length <= S.derricks.length || B.civs.length < (S.civs || []).length + 4) extra = false;
  });
  ok(same, 'doubled maps: the first Supply Dock is exactly as far from the Command Center as before, so the opening economy is unchanged');
  ok(extra, 'doubled maps: each has a third Supply Dock per side, more Oil Derricks and a village');
  const st = generateMap(STRAIT_MAP), wetS = st.water.reduce((a, v) => a + v, 0) / st.water.length, is = generateMap(ISLES_MAP), wetI = is.water.reduce((a, v) => a + v, 0) / is.water.length;
  ok(st.naval && is.naval && wetS > 0.2 && wetS < 0.45 && wetI > 0.55, `sea maps: Strait of Sand is ${(wetS * 100).toFixed(0)}% water, Emerald Isles ${(wetI * 100).toFixed(0)}%`);
  let sym = true; for (let k = 0; k < st.water.length; k += 97) { const x = k % 1024, z = (k / 1024) | 0; if (st.water[k] !== st.water[(1023 - z) * 1024 + (1023 - x)]) { sym = false; break; } }
  ok(sym, 'the coastline is the same for both sides (mirrored through the centre)');
  ok(!generateMap(MAPS[0].spec).naval && !generateMap(OPEN_BIG).hasWater, 'the desert maps are dry and not naval');
}

// ---------------------------------------------------------------- roads make ground vehicles faster; swimmers are slow
{
  const s = bare({ map: OPEN_BIG, factions: ['vanguard', 'redhammer'] }), m = s.map;
  // the main road runs from the base toward the centre: one tank drives along it, one drives beside it
  const onRoad = (x, z) => m.road[Math.floor(z / CELL) * N + Math.floor(x / CELL)];
  const A = [70 * CELL, 402 * CELL], B = [255.5 * CELL, 255.5 * CELL], dx = B[0] - A[0], dz = B[1] - A[1], L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L;
  const p0 = [A[0] + ux * 60, A[1] + uz * 60], p1 = [A[0] + ux * 330, A[1] + uz * 330], off = 40;
  ok(onRoad(p0[0], p0[1]) && onRoad(p1[0], p1[1]) && !onRoad(p0[0] - uz * off, p0[1] + ux * off), 'the map carries a road mask');
  const t1 = makeUnit(s, 'v_tank', PLAYER, p0[0], p0[1], Math.atan2(uz, ux)), t2 = makeUnit(s, 'v_tank', PLAYER, p0[0] - uz * off, p0[1] + ux * off, Math.atan2(uz, ux));
  s.issue({ t: 'move', ids: [t1.id], x: p1[0], z: p1[1] }); s.issue({ t: 'move', ids: [t2.id], x: p1[0] - uz * off, z: p1[1] + ux * off });
  run(s, 60); const a0 = [t1.x, t1.z], b0 = [t2.x, t2.z]; run(s, 200);
  const va = Math.hypot(t1.x - a0[0], t1.z - a0[1]) / 10, vb = Math.hypot(t2.x - b0[0], t2.z - b0[1]) / 10;
  ok(Math.abs(va / vb - ROAD_SPEED) < 0.06 && Math.abs(vb - UNITS.v_tank.speed) < 0.4, `a tank does ${va.toFixed(1)} m/s on the road and ${vb.toFixed(1)} m/s beside it (+${Math.round((va / vb - 1) * 100)}%)`);
  const inf = makeUnit(s, 'v_ranger', PLAYER, p0[0] + ux * 10, p0[1] + uz * 10, 0); s.issue({ t: 'move', ids: [inf.id], x: p1[0], z: p1[1] }); run(s, 40); const i0 = [inf.x, inf.z]; run(s, 100);
  ok(Math.abs(Math.hypot(inf.x - i0[0], inf.z - i0[1]) / 5 - UNITS.v_ranger.speed) < 0.3, 'infantry walk at the same speed on a road');
}
{
  const s = bare({ map: STRAIT_MAP, factions: ['vanguard', 'redhammer'], generals: ['marine', null] });
  const u = spawnNear(s, 'v_ranger', PLAYER, 470, 1560, 0); s.issue({ t: 'move', ids: [u.id], x: 640, z: 1400 }); let sw = 0, dist = 0, px = u.x, pz = u.z;
  run(s, 900, () => { if (wet(s, u) && u.path) { sw++; dist += Math.hypot(u.x - px, u.z - pz); } px = u.x; pz = u.z; });
  ok(u.nc === 2 && sw > 100 && Math.abs(dist / sw * 20 - UNITS.v_ranger.speed * SWIM_SPEED) < 0.5, `Marine infantry still cross water, at ${(dist / sw * 20).toFixed(1)} m/s (${Math.round(SWIM_SPEED * 100)}% of walking pace)`);
}

// ---------------------------------------------------------------- shipyards: half on land, half in the water, facing the sea
const YARD = { vanguard: 'v_shipyard', redhammer: 'r_shipyard', sandstorm: 's_shipyard' };
{
  const s = bare({ map: STRAIT_MAP, factions: ['vanguard', 'redhammer'] });
  ok(Object.values(YARD).every(k => BLDGS[k].shore && BLDGS[k].repair && FACTIONS[BLDGS[k].faction].build.includes(k) && FACTIONS[BLDGS[k].faction].roles.shipyard === k), 'each faction has a shipyard in its build list: ' + Object.values(YARD).map(k => BLDGS[k].name).join(', '));
  ok(placeError(s, 'v_shipyard', 150, 800, PLAYER) === 'Needs to sit half on land, half in water', 'on dry land: "Needs to sit half on land, half in water"');
  ok(placeError(s, 'v_shipyard', 330, 330, PLAYER) === 'Needs to sit half on land, half in water', 'out at sea: the same answer');
  ok(placeError(s, 'v_power', 330, 330, PLAYER) === 'Cannot build on water' && !placeError(s, 'v_power', 150, 800, PLAYER), 'ordinary buildings still need dry ground');
  const site = yardSite(s, 'v_shipyard', 155, 805);
  ok(!!site && Math.hypot(site[0] - 155, site[1] - 805) < 140, `a shore site exists ${Math.round(Math.hypot(site[0] - 155, site[1] - 805) * CELL)} m from the Strait of Sand start position`);
  const f = shoreFace(s, 'v_shipyard', site[0], site[1]), fx = [1, 0, -1, 0][f], fz = [0, 1, 0, -1][f];
  let wetFront = 0, wetBack = 0; for (let k = 0; k < 10; k++) for (let j = 0; j < 10; j++) { const x = site[0] + k, z = site[1] + j, w = s.nav.stat[z * N + x] === 2 ? 1 : 0; if ((x - site[0] - 4.5) * fx + (z - site[1] - 4.5) * fz > 0) wetFront += w; else wetBack += w; }
  ok(wetFront > wetBack, 'the yard turns to face the water');
  // ordered the normal way: a dozer builds it from the land side
  const T = s.teams[PLAYER]; T.money = 20000; makeBldg(s, 'v_factory', PLAYER, 140, 780); makeBldg(s, 'v_power', PLAYER, 124, 780); s.nav.rebuild();
  const doz = spawnNear(s, 'v_dozer', PLAYER, (site[0] - 8) * CELL, (site[1] + 5) * CELL, 0), msgs = [];
  s.issue({ t: 'build', id: doz.id, type: 'v_shipyard', cx: 150, cz: 800 }); run(s, 2, (ev) => { for (const e of ev) if (e.t === 'msg') msgs.push(e.text); });
  ok(msgs.includes('Needs to sit half on land, half in water') && T.money === 20000, 'a bad spot is refused with the reason, and costs nothing');
  s.issue({ t: 'build', id: doz.id, type: 'v_shipyard', cx: site[0], cz: site[1] }); run(s, 900);
  const yard = s.ents.find(e => e.type === 'v_shipyard');
  ok(yard && yard.done && !wet(s, doz), 'the dozer builds the Naval Yard standing on dry land');
  ok(yard.face === f && s.nav.isWater(s.nav.cellOf(yard.launch.x, yard.launch.z)) && s.nav.isWater(s.nav.cellOf(yard.rallyX, yard.rallyZ)), 'ships are launched off the seaward end; the gathering point is on the water');
  for (const t of ['v_rhib', 'v_frigate']) s.issue({ t: 'train', id: yard.id, type: t });
  run(s, 20 * 40);
  const rh = s.ents.find(e => e.type === 'v_rhib'), fr = s.ents.find(e => e.type === 'v_frigate');
  ok(rh && fr && rh.nc === NAV_BOAT && fr.nc === NAV_WARSHIP && s.nav.passAt(rh.x, rh.z, rh.nc) && s.nav.passAt(fr.x, fr.z, fr.nc), 'RHIB and Frigate come down the slip and end up in open water');
  ok(!trainsOf(T, 'v_shipyard').includes('v_mkv') && !trainsOf(T, 'v_barracks').includes('v_seal'), 'without the Marine Corps General: no Mk V and no SEAL Team');
  // a ship that finds itself in the shallows may sail out, and cannot come back in
  const sh = s.nav.distS; let cell = -1; for (let i = 0; i < N * N && cell < 0; i++) if (sh[i] === 1 && Math.hypot(i % N - site[0], ((i / N) | 0) - site[1]) > 30) cell = i;
  const b2 = makeUnit(s, 'v_frigate', PLAYER, (cell % N + 0.5) * CELL, (((cell / N) | 0) + 0.5) * CELL, 0);
  ok(!s.nav.passAt(b2.x, b2.z, b2.nc), 'a warship set down in the shallows is somewhere it may not sail'); run(s, 120);
  ok(s.nav.passAt(b2.x, b2.z, b2.nc) && shore(s, b2) >= 5, 'it sails out to deep water on its own');
  // sent ashore, ships go to the nearest water and stay off the beach, the whole way
  let minF = 99, minR = 99; s.issue({ t: 'move', ids: [fr.id, rh.id], x: 150 * CELL, z: 805 * CELL });
  run(s, 1000, () => { minF = Math.min(minF, shore(s, fr)); minR = Math.min(minR, shore(s, rh)); });
  ok(minF >= 5 && minR >= 3 && wet(s, fr) && wet(s, rh) && !fr.path && !rh.path, `sent to a point on land, the Frigate stops ${minF * CELL} m or more off the shore and the RHIB ${minR * CELL} m or more`);
  const tk = spawnNear(s, 'v_tank', PLAYER, 300, 1620, 0); s.issue({ t: 'move', ids: [tk.id], x: 760, z: 1260 }); let tankWet = false; run(s, 1500, () => { if (wet(s, tk)) tankWet = true; });
  ok(!tankWet && !tk.path && Math.hypot(tk.x - 300, tk.z - 1620) > 100, 'a tank sent out to sea drives to the shore and stops there');
  // repairs: ships at the yard, land vehicles at the War Factory, never the other way round
  fr.hp = 400; fr.lastHit = -999; rh.hp = 50; rh.lastHit = -999; tk.hp = 100; tk.lastHit = -999;
  s.issue({ t: 'repairat', ids: [fr.id, rh.id, tk.id], target: yard.id }); run(s, 1200);
  ok(fr.hp === fr.maxHp && rh.hp === rh.maxHp && tk.hp === 100, 'right-clicking the yard brings damaged ships in and repairs them; a tank is not a ship');
}
{
  const s = bare({ map: OPEN_BIG, factions: ['sandstorm', 'vanguard'] }); let any = false;
  for (let z = 10; z < N - 20 && !any; z += 9) for (let x = 10; x < N - 20; x += 9) if (!placeError(s, 's_shipyard', x, z, PLAYER)) { any = true; break; }
  ok(!any, 'a map with no water has no place for a shipyard');
}

// ---------------------------------------------------------------- the ships
{
  const s = bare({ map: STRAIT_MAP, factions: ['vanguard', 'redhammer'], generals: ['marine', null] }), T = s.teams[PLAYER];
  const U = (t) => UNITS[t], ships = ['v_rhib', 'v_frigate', 'v_mkv', 'r_lcraft', 'r_corvette', 's_mboat', 's_dboat'];
  ok(ships.every(t => U(t).ship && U(t).cls === 1 && !U(t).air) && navOf(U('v_frigate')) === NAV_WARSHIP && navOf(U('r_corvette')) === NAV_WARSHIP && navOf(U('r_lcraft')) === NAV_BEACH && navOf(U('v_rhib')) === NAV_BOAT, 'seven ships: two warships, one beaching craft, four boats');
  ok(['v_rhib', 'v_mkv', 'r_lcraft', 's_mboat', 's_dboat'].every(t => U(t).armor === 'light') && U('v_frigate').armor === 'heavy' && U('r_corvette').armor === 'heavy', 'small craft are light armor, warships heavy');
  ok(trainsOf(T, 'v_shipyard').join() === 'v_rhib,v_frigate,v_mkv' && trainsOf(T, 'v_barracks').includes('v_seal') && BLDGS.r_shipyard.trains.join() === 'r_lcraft,r_corvette' && BLDGS.s_shipyard.trains.join() === 's_dboat,s_mboat', 'who builds what: US RHIB + Frigate (+ Mk V and SEALs under the Marine General), China Landing Craft + Corvette, ISIS Drone Boat + Missile Boat');
  const mk = (t, x, z, team = PLAYER) => spawnNear(s, t, team, x, z, 0);
  const fr = mk('v_frigate', 560, 1480), mkv = mk('v_mkv', 580, 1470), seal = spawnNear(s, 'v_seal', PLAYER, 300, 1620, 0), lc = mk('r_lcraft', 600, 1460), cv = mk('r_corvette', 610, 1440), mb = mk('s_mboat', 620, 1420);
  const eShip = hold(mk('r_corvette', 700, 1340, ENEMY)), eJet = makeUnit(s, 'r_hind', ENEMY, 700, 1300, 0), eTank = makeUnit(s, 'r_tank', ENEMY, 300, 1700, 0), eB = makeBldg(s, 'r_power', ENEMY, 120, 860), eMig = makeUnit(s, 'r_mig', ENEMY, 720, 1300, 0); eMig.landed = false; eMig.as = 'out';
  ok(slotsOf(fr).join() === 'naval_gun,naval_laser' && canAttack(fr, eShip) && canAttack(fr, eTank) && canAttack(fr, eB) && canAttack(fr, eJet) && canAttack(fr, eMig), 'Frigate: deck gun for ships, the coast and buildings; laser for helicopters and jets');
  ok(!WEAPONS.naval_laser.vs.heavy && !WEAPONS.naval_laser.vs.bldg && WEAPONS.naval_laser.vs.air > 1, 'the Frigate laser is for aircraft only');
  ok(slotsOf(cv).join() === 'corvette_gun,ciws' && canAttack(cv, eJet) && canAttack(cv, eMig) && canAttack(cv, eShip), 'Corvette: deck cannon, and a minigun that reaches aircraft');
  ok(slotsOf(mkv).join() === 'minigun2,mk19,hellfire' && canAttack(mkv, eTank) && canAttack(mkv, eJet), 'Mk V: miniguns, grenade launchers and a Hellfire (three weapons)');
  ok(slotsOf(seal).join() === 'seal_rifle,seal_sniper,seal_gl' && seal.nc === 2 && UNITS.v_seal.canGarrison && UNITS.v_seal.canCapture, 'SEAL Team: rapid-fire rifles, a sniper and a grenade launcher; they swim');
  ok(!slotsOf(lc).length && !canForce(s, lc) && canForce(s, fr) && canForce(s, mb) && canForce(s, mkv), 'the Landing Craft is unarmed; every armed ship takes a force-attack order');
  ok(WEAPONS.boat_rockets.burst === 8 && WEAPONS.boat_rockets.range >= 60 && WEAPONS.boat_rockets.cd >= 200 && !canAttack(mb, eJet), 'Missile Boat: eight rockets at long range, then a long reload; nothing against aircraft');
  // all three of a unit's weapons really fire
  const seen = new Set(), near = hold(mk('s_mboat', mkv.x + 18, mkv.z - 18, ENEMY)); near.hp = 1e6;
  mkv.order = { t: 'fattack', id: near.id, x: near.x, z: near.z, g: null };
  run(s, 400, (ev) => { for (const e of ev) if ((e.t === 'tracer' || e.t === 'fire') && e.sid === mkv.id) seen.add(e.w); });
  ok(seen.has('minigun2') && seen.has('mk19') && seen.has('hellfire') && shore(s, mkv) >= 3, 'the Mk V fires all three at a boat close by, without leaving deep water: ' + [...seen].join(', '));
}

// ---------------------------------------------------------------- missile defense at sea
for (const [type, gun] of [['v_frigate', false], ['r_corvette', true]]) {
  const fac = UNITS[type].faction, s = bare({ map: STRAIT_MAP, factions: [fac, 'sandstorm'] });
  const ship = hold(spawnNear(s, type, PLAYER, 600, 1440, 0)), mb = spawnNear(s, 's_mboat', ENEMY, 660, 1390, 0), hp0 = ship.hp;
  mb.order = { t: 'fattack', id: ship.id, x: ship.x, z: ship.z, g: null };
  let fired = 0, shot = 0, guns = 0; run(s, 500, (ev) => { for (const e of ev) { if (e.t === 'fire' && e.w === 'boat_rockets') fired++; if (e.t === 'pdl' && e.sid === ship.id) { shot++; if (e.gun) guns++; } } });
  ok(fired >= 8 && shot >= 2 && shot < fired && (gun ? guns === shot : guns === 0), `${UNITS[type].name}: shot down ${shot} of ${fired} incoming rockets` + (gun ? ' with its minigun' : ' with its laser'));
  const s2 = bare({ map: STRAIT_MAP, factions: [fac, 'sandstorm'] }), plain = hold(spawnNear(s2, 'v_mkv', PLAYER, 600, 1440, 0)), mb2 = spawnNear(s2, 's_mboat', ENEMY, 660, 1390, 0);
  mb2.order = { t: 'fattack', id: plain.id, x: plain.x, z: plain.z, g: null }; let shot2 = 0; run(s2, 300, (ev) => { for (const e of ev) if (e.t === 'pdl') shot2++; });
  if (!gun) ok(shot2 === 0 && plain.hp < plain.maxHp, 'a boat without the defense stops nothing');
  ok(hp0 - ship.hp < fired * WEAPONS.boat_rockets.dmg * WEAPONS.boat_rockets.vs.heavy, `${UNITS[type].name}: took less than a full barrage`);
}
ok(!WEAPONS.scud_missile.intercept && WEAPONS.rpg.intercept && WEAPONS.hellfire.intercept, 'what can be shot down: rockets and guided missiles, not Scuds');

// ---------------------------------------------------------------- Drone Boat: the suicide-unit rules, afloat
{
  const mkS = () => bare({ map: STRAIT_MAP, factions: ['sandstorm', 'vanguard'], friendlyFire: true });
  const D = UNITS.s_dboat;
  ok(D.ship && D.suicide && D.suicide.charge && D.suicide.dmg >= 300, 'the Drone Boat is a suicide unit with a charge and a large blast');
  { // a plain move order: it sails past and does nothing
    const s = mkS(), b = spawnNear(s, 's_dboat', PLAYER, 560, 1480, 0), foe = hold(spawnNear(s, 'v_frigate', ENEMY, 600, 1440, 0));
    s.issue({ t: 'move', ids: [b.id], x: 650, z: 1440 }); let nearest = 1e9; run(s, 70, () => { nearest = Math.min(nearest, Math.hypot(b.x - foe.x, b.z - foe.z)); });
    ok(!b.dead && foe.hp === foe.maxHp && nearest < 30 && b.order && b.order.t === 'move', `told to move, it sails past the Frigate at ${Math.round(nearest)} m and does nothing: no attack, no blast`);
    // an attack order: it charges the last stretch, rams and dies in its own blast
    let charged = false, boom = false; s.issue({ t: 'attack', ids: [b.id], target: foe.id });
    run(s, 300, (ev) => { for (const e of ev) { if (e.t === 'charge') charged = true; if (e.t === 'suicide') boom = true; } });
    ok(b.dead && boom && charged && foe.hp < foe.maxHp - 300 && !s.crates.length, `it rams the Frigate (${Math.round(foe.maxHp - foe.hp)} damage), dies in the blast and leaves no wreck`);
  }
  { // idle near an enemy ship: it goes for it by itself, like the other suicide units
    const s = mkS(), b = spawnNear(s, 's_dboat', PLAYER, 580, 1460, 0), foe = hold(spawnNear(s, 'v_rhib', ENEMY, 600, 1440, 0)); run(s, 200);
    ok(b.dead && foe.dead, 'left idle next to an enemy boat, it attacks on its own');
  }
  { // force attack: a spot on the water, and something ashore (it goes off as close as it can get)
    const s = mkS(), b = spawnNear(s, 's_dboat', PLAYER, 560, 1480, 0), own = hold(spawnNear(s, 's_mboat', PLAYER, 610, 1430, 0));
    s.issue({ t: 'force', ids: [b.id], x: 606, z: 1434 }); run(s, 300);
    ok(b.dead && own.hp < own.maxHp, 'force attack on a spot of water: it sails there and blows up, hurting whatever is next to it (even your own boat)');
    const b2 = spawnNear(s, 's_dboat', PLAYER, 560, 1480, 0); let site = null, bd = 1e9;
    for (let z = 700; z < 800; z++) for (let x = 200; x < 300; x++) { if (s.nav.stat[z * N + x] || s.nav.distS[z * N + x]) continue; let near = false; for (let k = -3; k <= 3 && !near; k++) for (let j = -3; j <= 3; j++) if (s.nav.distS[(z + k) * N + x + j] >= 1) { near = true; break; } if (near) { const d = Math.hypot(x * 2 - 560, z * 2 - 1480); if (d < bd) { bd = d; site = [x, z]; } } }
    const men = hold(makeUnit(s, 'v_ranger', ENEMY, site[0] * CELL + 1, site[1] * CELL + 1, 0));
    s.issue({ t: 'force', ids: [b2.id], x: men.x, z: men.z, target: men.id }); let minS = 99; run(s, 600, () => { if (!b2.dead) minS = Math.min(minS, shore(s, b2)); });
    ok(b2.dead && men.hp < men.maxHp && minS >= 3, `sent at a squad standing on the waterline, which it cannot ram, it goes off as close as the water lets it (${Math.round(men.maxHp - men.hp)} damage) and never leaves deep water`);
    const b3 = spawnNear(s, 's_dboat', PLAYER, 560, 1480, 0), inland = hold(makeUnit(s, 'v_tank', ENEMY, 300, 1620, 0));
    s.issue({ t: 'force', ids: [b3.id], x: inland.x, z: inland.z, target: inland.id }); run(s, 900);
    ok(!b3.dead && !b3.order && inland.hp === inland.maxHp && wet(s, b3), 'sent at a tank well inland, it sails as near as it can, then gives up without wasting itself');
  }
  { // under the Stealth General light boats hide when they stand still
    const s = bare({ map: STRAIT_MAP, factions: ['sandstorm', 'vanguard'], generals: ['stealth', null] }), b = spawnNear(s, 's_dboat', PLAYER, 560, 1480, 0); run(s, 60);
    ok(b.stealthMode === 'still' && b.cloaked, 'Stealth General: a Drone Boat lying still is cloaked');
  }
}

// ---------------------------------------------------------------- Landing Craft: four squads or one vehicle, beach to beach
{
  const s = bare({ map: STRAIT_MAP, factions: ['redhammer', 'vanguard'] }), T = UNITS.r_lcraft.transport;
  ok(T.squads === 4 && T.vehicles === 1 && UNITS.r_lcraft.beach, 'the Landing Craft holds four squads or one vehicle and may touch the shore');
  const lc = spawnNear(s, 'r_lcraft', PLAYER, 540, 1500, 0), sq = []; for (let i = 0; i < 5; i++) sq.push(spawnNear(s, 'r_conscript', PLAYER, 430 + i * 3, 1540, 0));
  const tk = spawnNear(s, 'r_tank', PLAYER, 420, 1560, 0), jet = makeUnit(s, 'r_hind', PLAYER, 430, 1550, 0), boat = spawnNear(s, 'r_corvette', PLAYER, 600, 1440, 0);
  ok(roomFor(s, lc, sq[0]) && roomFor(s, lc, tk) && !roomFor(s, lc, jet) && !roomFor(s, lc, boat), 'empty: a squad or a tank may board; a helicopter or another ship may not');
  s.issue({ t: 'move', ids: [lc.id], x: 440, z: 1530 }); run(s, 500);
  ok(wet(s, lc) && shore(s, lc) <= 2, 'the craft runs right up to the beach');
  s.issue({ t: 'garrison', ids: sq.map(u => u.id).concat([tk.id]), target: lc.id }); run(s, 700);
  ok(lc.garrison.length === 4 && sq.filter(u => u.inB === lc.id).length === 4 && !tk.inB, 'four squads go aboard; the fifth squad and the tank are left on the beach');
  // passengers do not fight from the hold, and an order to unload out at sea is refused
  const foe = hold(spawnNear(s, 'v_rhib', ENEMY, 640, 1380, 0)); foe.hp = 1e6; const hp = foe.hp;
  s.issue({ t: 'move', ids: [lc.id], x: 620, z: 1400 }); run(s, 400);
  const msgs = []; s.issue({ t: 'evacuate', id: lc.id }); run(s, 3, (ev) => { for (const e of ev) if (e.t === 'msg') msgs.push(e.text); });
  ok(lc.garrison.length === 4 && msgs.includes('Move to the shore to unload') && foe.hp === hp, 'out at sea: nobody gets out ("Move to the shore to unload") and nobody shoots from the hold');
  // across the strait and onto the far beach
  kill(s, foe); let far = -1, bd = 1e9; for (let z = 250; z < 500; z++) for (let x = 520; x < 760; x++) { const i = z * N + x; if (s.nav.distS[i] !== 1) continue; const d = Math.hypot(x * 2 - lc.x, z * 2 - lc.z); if (d < bd) { bd = d; far = i; } }
  s.issue({ t: 'move', ids: [lc.id], x: (far % N + 0.5) * CELL, z: (((far / N) | 0) + 0.5) * CELL }); run(s, 1400);
  s.issue({ t: 'evacuate', id: lc.id }); run(s, 5);
  const out = sq.filter(u => !u.inB && !u.dead && u.z < 1200);
  ok(lc.garrison.length === 0 && out.length === 4 && out.every(u => !wet(s, u) && s.nav.passAt(u.x, u.z, u.nc)), `it crosses ${Math.round(bd)} m of water and puts all four squads on dry ground on the far shore`);
  // one vehicle, then nobody else
  s.issue({ t: 'move', ids: [lc.id], x: 440, z: 1530 }); run(s, 1500);
  s.issue({ t: 'garrison', ids: [tk.id], target: lc.id }); run(s, 900);
  s.issue({ t: 'garrison', ids: [sq.find(u => !u.inB && u.z > 1200).id], target: lc.id }); run(s, 400);
  ok(tk.inB === lc.id && lc.garrison.length === 1, 'a tank goes aboard alone; a squad cannot join it');
  const lost = s.teams[PLAYER].unitsLost; kill(s, lc);
  ok(tk.dead && s.teams[PLAYER].unitsLost === lost + 2, 'if the craft sinks, what is aboard goes down with it');
}

// ---------------------------------------------------------------- path search on the big maps
{
  const s = bare({ map: STRAIT_MAP, factions: ['vanguard', 'redhammer'] }), nav = s.nav;
  const t0 = performance.now(), r = nav.findPath(155 * CELL, 805 * CELL, 869 * CELL, 219 * CELL, 1), ms = performance.now() - t0;
  let len = 0; for (let i = 2; i < r.path.length; i += 2) len += Math.hypot(r.path[i] - r.path[i - 2], r.path[i + 1] - r.path[i - 1]);
  ok(r.path && r.expanded < 60000 && len > 2400 && len < 3600, `base to base by land round the strait: ${Math.round(len)} m, ${r.expanded} cells searched, ${ms.toFixed(1)} ms`);
  const i2 = bare({ map: ISLES_MAP, factions: ['vanguard', 'redhammer'] }), q = i2.nav.findPath(898, 1200, 860, 1185, NAV_BOAT);
  ok(q.path && q.expanded < 60000, `a boat's way round an island to the far side of the causeway: ${q.expanded} cells searched (it used to flood the whole sea)`);
  const big = performance.now(); makeBldg(i2, 'v_power', PLAYER, 215, 780); i2.nav.rebuild(); const one = performance.now() - big;
  ok(one < 120, `placing a building on a 2 km map updates the navigation in ${one.toFixed(0)} ms`);
}

// ---------------------------------------------------------------- the AI and its fleet
{
  const match = (map, f) => { const s = new Sim({ ai: 'both', difficulty: ['hard', 'hard'], factions: f, map, seed: 4, friendlyFire: true }); s.yardsPlaced = [0, 0];   // a shipyard may be sunk again before the end: count the ones laid down
    for (let i = 0; i < 12000 && s.winner < 0; i++) { s.step(); for (const e of s.events) if (e.t === 'place') { const b = s.byId.get(e.id); if (b && BLDGS[b.type].shore) s.yardsPlaced[e.team]++; } s.events.length = 0; } return s; };
  const count = (s, t) => ({ yards: s.ents.filter(e => e.team === t && e.kind === 'bldg' && BLDGS[e.type].shore).length, ships: s.ents.filter(e => e.team === t && e.kind === 'unit' && UNITS[e.type].ship).length });
  const a = match(STRAIT_MAP, ['vanguard', 'sandstorm']), a0 = count(a, 0), a1 = count(a, 1);
  ok(a.yardsPlaced[0] >= 1 && a.yardsPlaced[1] >= 1 && a0.yards <= 1 && a1.yards <= 1 && a0.ships + a.ais[0].fleet.shots > 0 && a1.ships + a.ais[1].fleet.shots > 0, `Strait of Sand, Hard v Hard: both sides build a shipyard (never two at once) and a fleet (US ${a0.ships} ships afloat, ISIS ${a1.ships}; ${a.ais[0].fleet.shots + a.ais[1].fleet.shots} fleet attack orders, ${a.ais[0].fleet.raids + a.ais[1].fleet.raids} sweeps)`);
  ok(!a.ents.some(e => e.kind === 'unit' && UNITS[e.type].transport) && a.ents.filter(e => e.kind === 'unit' && UNITS[e.type].ship).every(e => a.nav.isWater(a.nav.cellOf(e.x, e.z))), 'the AI builds no Landing Craft, and every ship is on the water');
  const again = match(STRAIT_MAP, ['vanguard', 'sandstorm']);
  ok(again.hash() === a.hash(), 'a match on a sea map plays out identically from the same seed');
  const c = match(MAPS[0].spec, ['redhammer', 'vanguard']), c0 = count(c, 0), c1 = count(c, 1);
  ok(!c0.yards && !c1.yards && !c0.ships && !c1.ships && c.teams[0].built > 20 && c.teams[1].built > 20, 'on a dry map nobody builds a shipyard, and the land war goes on as before');
  ok(a.ais[0].combat.every(t => !UNITS[t].ship) && a.ais[0].navy.join() === 'v_rhib,v_frigate,v_frigate', 'ships are kept out of the land army list');
}

// ---------------------------------------------------------------- source guards (things only the browser draws)
{
  const models = src('render/models.js'), fx = src('render/vfxManager.js');
  const scud = models.slice(models.indexOf('function scud(T)'), models.indexOf('function shipyard(T)'));
  ok(/^\s*cyl\(m, M\.olive/m.test(scud), 'Scud Storm: the missile bodies on the rails are drawn (the line was once swallowed by a comment)');
  const swallowed = [models, src('render/modelFactory.js')].join('\n').split('\n').filter(l => /\/\/[^\n]*;\s*(cyl|box|add|ball|prism|taper)\([a-z]\w*, (M|G|T|s|P)\./.test(l) && !/^\s*\/\//.test(l));
  ok(!swallowed.length, 'no model code is hidden behind a comment on the same line' + (swallowed.length ? ': ' + swallowed[0].slice(0, 90) : ''));
  ok(!/Math\.min\(511,/.test(fx), 'effects find the ground height on maps of any size');
  ok(/shipyard/.test(models) && ['rhib', 'mkv', 'frigate', 'corvette', 'lcraft', 'mboat', 'dboat'].every(k => new RegExp('function ' + k + '\\(P\\)').test(src('render/modelFactory.js'))), 'every ship and the shipyard has a model');
}

console.log(fail ? `BATCH11: ${fail} FAILURES of ${pass + fail}` : `BATCH11: all ${pass} checks passed`);
process.exit(fail ? 1 : 0);
