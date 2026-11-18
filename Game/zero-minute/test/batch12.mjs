// Batch 12: Russia and Europe (units, generals, heroes), the batch 11 play notes (minimap, speed buttons, ship gun
// mounts and arcs, hangars, AC-130, grenades, H-6, cloak rules), power aliases, and the ISIS AI's tunnels.
import { readFileSync } from 'node:fs';
import { Sim, heroTaken } from '../js/sim/simulationTick.js';
import { makeUnit, makeBldg, spawnNear, kill } from '../js/sim/entities.js';
import { canAttack, slotsOf } from '../js/sim/combat.js';
import { usePower } from '../js/sim/powers.js';
import { N, PLAYER, ENEMY, CELL, angDiff } from '../js/sim/defs.js';
import { UNITS, BLDGS, WEAPONS, POWERS, FACTIONS, GENERALS, FACTION_IDS, HANGAR, trainsOf, upgradesOf, unitCost, bldgCost, generalsOf } from '../js/sim/factionRegistry.js';
import { MAPS, STRAIT_MAP } from '../js/sim/map.js';

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) pass++; else { fail++; console.log('  FAIL', msg); } };
const bare = (o = {}) => { const s = new Sim({ ai: false, empty: true, ...o }); s.fog.exp[0].fill(1); s.fog.exp[1].fill(1); return s; };
const run = (s, n, f) => { for (let i = 0; i < n; i++) { s.step(); if (f) f(s.events); s.events.length = 0; } };
const hold = (u) => { u.order = { t: 'hold' }; return u; };
const src = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

// ---------------------------------------------------------------- play notes: things only the browser draws (source guards)
{
  const hud = src('js/ui/uiHUD.js'), game = src('js/game.js'), view = src('js/render/view.js'), html = src('index.html'), play = src('play.html'), mf = src('js/render/modelFactory.js');
  ok(/const k = this\.mini\.width \/ N, u = N \/ 256; g\.setTransform\(k, 0, 0, k, 0, 0\)/.test(hud) && /this\.mini\.width = this\.mini\.height = 512/.test(hud), 'minimap: drawn in map cells and scaled by canvas size / map size, so a 1 km or 2 km map fits');
  ok(/const speed = ui\.speed,/.test(game) && !/player \? ui\.speed : 1/.test(game) && /replay-bar'\)\.hidden = false/.test(hud), 'speed buttons: the 1x / 2x / 4x bar is shown in every game and the game loop always uses it');
  ok([html, play].every(h => /data-speed="2"/.test(h) && /data-speed="4"/.test(h) && /id="mb-mapsize"/.test(h)), 'index.html and play.html carry the same speed bar and map-size control');
  ok(!/setGhost|ghostOf/.test(view), 'batch 13 took the see-through cloak out again: cloaked units are drawn solid');
  ok(/rotation\.y = k \* 0\.45; \}   \/\/ the two bow tubes meet at the stem/.test(mf), 'RHIB: the bow tubes of the collar close to a point');
  ok(/shipHull\(b, s\.radome, L, B, 1\.3, 0\.8, 0\.28, 'hull', s\.red, 0\.42\)/.test(mf) && !/box\(b, s\.red, L \* 0\.9/.test(mf), 'Corvette: the red band follows the hull outline (no box sticking out past the bow)');
  ok(/P = \{ \.\.\.P, hull: s\.strike, dark: s\.strikeDark \}/.test(mf) && /P = \{ \.\.\.P, hull: s\.heloBlack, dark: s\.heloBlackDark \}/.test(mf), 'Comanche is dark grey and the Z-10 deep black whatever the faction paint');
  ok(/export const H6 = \{ scale: 0\.42, length: 34\.8, span: 33\.0/.test(mf) && /function bearrider\(T\)/.test(src('js/render/models.js')) && /function leonidas\(T\)/.test(src('js/render/models.js')), 'models exist for the H-6 bomber and both new heroes');
}

// ---------------------------------------------------------------- play notes: rules
{
  ok(WEAPONS.mk19.grenade && WEAPONS.seal_gl.grenade && !WEAPONS.rocket.grenade, 'grenade launchers are flagged so their shots are drawn as grenades, not rockets');
  ok(WEAPONS.ac_gun.cd <= 2 && WEAPONS.ac_gun.free && WEAPONS.ac_gun.kind === 'hitscan', 'AC-130 rotary cannon (a unit weapon since batch 13): fires ten times a second, dead on, and does not use up the sortie');
  const s = bare({ factions: ['redhammer', 'vanguard'] }); s.teams[0].promos.add('r_barrage'); s.teams[0].promos.add('r_fab'); s.teams[0].powerReady.fab = 0; makeBldg(s, 'r_cc', PLAYER, 20, 220); s.nav.rebuild();
  ok(usePower(s, PLAYER, 'fab', 300, 200) && s.strikes[0].model === 'h6' && s.strikes[0].pid === 'fab', 'China’s Fuel-Air Bomb is delivered by an H-6 bomber');
  for (const type of ['v_airfield', 'r_airfield', 'u_airfield', 'e_airfield']) {
    const q = bare({ factions: [BLDGS[type].faction, 'vanguard'] }), b = makeBldg(q, type, PLAYER, 60, 60), L = BLDGS[type].layout;
    ok(b.pads.every((p, i) => { const h = L.hangars[i], dx = Math.abs(p.x - b.x - h[0]), dz = Math.abs(p.z - b.z - h[1]); return (h[2] === 'e' ? dx < HANGAR.d / 2 && dz < HANGAR.w / 2 : dx < HANGAR.w / 2 && dz < HANGAR.d / 2) && Math.hypot(p.ax - p.x, p.az - p.z) > 5; }), `${BLDGS[type].name} (${FACTIONS[BLDGS[type].faction].name}): every jet parks inside its hangar, with an apron outside the door`);
  }
  // a jet leaves its hangar by the door: first to the apron, then to the runway
  const a = bare({ factions: ['vanguard', 'redhammer'] }), T = a.teams[0]; T.money = 9000; for (let i = 0; i < 3; i++) makeBldg(a, 'v_power', PLAYER, 20 + i * 8, 20); makeBldg(a, 'v_factory', PLAYER, 20, 40);
  const af = makeBldg(a, 'v_airfield', PLAYER, 60, 60); a.nav.rebuild(); a.issue({ t: 'train', id: af.id, type: 'v_raptor' }); run(a, 20 * 14);
  const jet = a.ents.find(e => e.type === 'v_raptor'), pad = af.pads[jet.pad];
  ok(jet && jet.as === 'parked' && Math.hypot(jet.x - pad.x, jet.z - pad.z) < 0.1 && Math.abs(angDiff(jet.facing, pad.f)) < 0.05, 'a new jet stands inside its hangar with its nose to the door');
  let viaApron = false; a.issue({ t: 'move', ids: [jet.id], x: 400, z: 300 }); run(a, 200, () => { if (Math.hypot(jet.x - pad.ax, jet.z - pad.az) < 0.6) viaApron = true; });
  ok(viaApron && !jet.landed, 'ordered out, it rolls through the door onto the apron before it takes off');
}
{ // cloak rules
  const s = bare({ map: STRAIT_MAP, factions: ['sandstorm', 'vanguard'], generals: ['stealth', null] });
  const mb = spawnNear(s, 's_mboat', PLAYER, 560, 1480, 0), db = spawnNear(s, 's_dboat', PLAYER, 600, 1440, 0); run(s, 80);
  ok(UNITS.s_mboat.noCloak && !mb.stealthMode && !mb.cloaked && db.cloaked, 'Stealth General: the Missile Boat never cloaks (the Drone Boat still does when it lies still)');
}

// ---------------------------------------------------------------- ships: shots come from the gun, and a gun cannot fire through its own ship
for (const [type, fac] of [['v_frigate', 'vanguard'], ['r_corvette', 'redhammer'], ['u_corvette', 'ursa'], ['e_fremm', 'aegis']]) {
  const D = UNITS[type], M = D.mounts[0], gun = D.weapon;
  const s = bare({ map: STRAIT_MAP, factions: [fac, 'sandstorm'] }), sh = spawnNear(s, type, PLAYER, 600, 1440, 0); sh.facing = sh.pfacing = sh.turret = 0;
  const foe = hold(spawnNear(s, 's_mboat', ENEMY, 556, 1440, 0)); foe.hp = 1e6; foe.cds = [1e9, 1e9, 1e9];
  sh.order = { t: 'fattack', id: foe.id, x: foe.x, z: foe.z, g: null };
  let shots = 0, bad = 0, off = 0, f0 = sh.facing;
  run(s, 300, (ev) => { foe.cds[0] = 1e9; for (const e of ev) if (e.t === 'fire' && e.w === gun && e.sid === sh.id) { shots++; const rel = Math.abs(angDiff(Math.atan2(foe.z - sh.z, foe.x - sh.x), sh.facing)); if (rel > M.arc + 0.03) bad++; if (Math.abs(Math.hypot(e.x - sh.x, e.z - sh.z) - Math.abs(M.x)) > 0.2 || e.y !== M.y) off++; } });
  ok(M.arc < Math.PI && shots >= 3 && !bad && !off && Math.abs(angDiff(sh.facing, f0)) > 0.4, `${D.name}: with the target dead astern it turns ${Math.round(Math.abs(angDiff(sh.facing, f0)) * 57)} degrees, then fires ${shots} rounds, every one from the gun mount and inside its arc`);
}
{
  const s = bare({ map: STRAIT_MAP, factions: ['vanguard', 'sandstorm'] }), fr = spawnNear(s, 'v_frigate', PLAYER, 600, 1440, 0); fr.facing = fr.pfacing = 0;
  const foe = hold(spawnNear(s, 's_mboat', ENEMY, 556, 1440, 0)); foe.hp = 1e6;
  s.issue({ t: 'move', ids: [fr.id], x: 760, z: 1440 }); let blind = 0; run(s, 100, (ev) => { foe.cds[0] = 1e9; for (const e of ev) if (e.t === 'fire' && e.w === 'naval_gun') { if (Math.abs(angDiff(Math.atan2(foe.z - fr.z, foe.x - fr.x), fr.facing)) > UNITS.v_frigate.mounts[0].arc + 0.03) blind++; } });
  ok(!blind, 'under way, the deck gun holds its fire while the target is in its blind arc');
  const L = UNITS.v_frigate.mounts[1];
  ok(WEAPONS.naval_laser.dmg === 18 && WEAPONS.naval_laser.range === 56 && UNITS.v_frigate.pdl === 10 && L.arc === Math.PI && L.y > 8 && UNITS.v_frigate.name === 'Frigate', 'Frigate laser: 18 damage at 56 m (was 13 at 48 m), fired from the mast top with an all-round arc; faster missile defense; still called the Frigate');
  const heli = hold(makeUnit(s, 'r_hind', ENEMY, fr.x + 10, fr.z - 34, 0)); heli.hp = 1e6; let ly = [];
  fr.order = { t: 'fattack', id: heli.id, x: heli.x, z: heli.z, g: null }; run(s, 120, (ev) => { for (const e of ev) if (e.t === 'laser') ly.push(e.y); });
  ok(ly.length > 5 && ly.every(y => y === L.y), 'its laser beams start at the mast top');
}

// ---------------------------------------------------------------- five factions, ten generals
{
  ok(FACTION_IDS.join() === 'vanguard,redhammer,sandstorm,ursa,aegis' && FACTIONS.ursa.name === 'Russia' && FACTIONS.aegis.name === 'Europe', 'five factions: United States, China, ISIS, Russia, Europe');
  ok(generalsOf('ursa').join() === 'wagner,vacation' && generalsOf('aegis').join() === 'lasergen,panzer' && GENERALS.wagner.name === 'Wagner Group' && GENERALS.vacation.name === 'Vacation Command Group', 'Russia: Wagner Group and Vacation Command Group; Europe: a Laser general and a Panzer general');
  for (const f of ['ursa', 'aegis']) {
    const F = FACTIONS[f], R = F.roles, units = Object.keys(UNITS).filter(k => UNITS[k].faction === f), bl = Object.keys(BLDGS).filter(k => BLDGS[k].faction === f);
    ok(F.build.every(b => BLDGS[b] && BLDGS[b].faction === f) && ['cc', 'power', 'supply', 'barracks', 'factory', 'airfield', 'shipyard', 'defense', 'super', 'builder', 'truck', 'squad'].every(r => R[r] && (BLDGS[R[r]] || UNITS[R[r]])) && bl.length === 9, `${F.name}: a full base of nine buildings, every role filled`);
    ok(F.tree.length === 7 && F.tree.every(n => (!n.req || F.tree.some(k => k.id === n.req)) && (!n.power || POWERS[n.power]) && (!n.unlock || UNITS[n.unlock])) && F.tree.filter(n => n.power).length >= 3, `${F.name}: seven promotions, three of them support powers`);
    const trained = new Set(); for (const b of bl) for (const g of [null, ...generalsOf(f)]) for (const t of trainsOf({ general: g }, b)) trained.add(t);
    ok(units.every(u => trained.has(u)) && units.filter(u => UNITS[u].placeholder).length >= 11 && units.length >= 13, `${F.name}: ${units.length} unit types, every one buildable somewhere; the batch 12 line-up is still marked as a placeholder (batch 14 added units of its own)`);
    ok(units.every(u => !UNITS[u].weapon || WEAPONS[UNITS[u].weapon]) && units.every(u => ['weapon2', 'weapon3'].every(k => !UNITS[u][k] || WEAPONS[UNITS[u][k]])), `${F.name}: every weapon named by a unit exists`);
    const hero = units.find(u => UNITS[u].hero);
    ok(hero && UNITS[hero].cost === 2500 && UNITS[hero].stealth === 'always' && BLDGS[R.barracks].trains.includes(hero) && UNITS[hero].needs === R.factory, `${F.name}: its hero (${UNITS[hero].name}) follows the hero rules: Barracks, $2,500, needs the War Factory, cloaked`);
  }
  // every unit can really be trained and comes out of its building
  for (const [f, gens] of [['ursa', ['wagner', 'vacation']], ['aegis', ['lasergen', 'panzer']]]) for (const gen of gens) {
    const s = bare({ map: STRAIT_MAP, factions: [f, 'vanguard'], generals: [gen, null] }), T = s.teams[0], R = FACTIONS[f].roles; T.money = 200000;
    for (let i = 0; i < 6; i++) makeBldg(s, R.power, PLAYER, 150 + i * 8, 840);
    const at = { [R.barracks]: [150, 800], [R.factory]: [165, 800], [R.airfield]: [180, 790], [R.cc]: [135, 800] }, made = {};
    for (const b in at) made[b] = makeBldg(s, b, PLAYER, at[b][0], at[b][1]); made[R.shipyard] = makeBldg(s, R.shipyard, PLAYER, 230, 752); s.nav.rebuild();
    const want = []; for (const b in made) for (const t of trainsOf(T, b)) want.push([b, t]);
    let got = 0; const missing = [];
    for (const [b, t] of want) { const before = s.ents.filter(e => e.type === t).length; made[b].queue.length = 0; s.issue({ t: 'train', id: made[b].id, type: t }); run(s, UNITS[t].secs * 20 + 30); if (s.ents.filter(e => e.type === t).length > before) got++; else missing.push(t); }
    ok(got === want.length, `${FACTIONS[f].name} under the ${GENERALS[gen].name}: all ${want.length} unit types are built from their buildings` + (missing.length ? ' (missing: ' + missing.join(', ') + ')' : ''));
  }
}

// ---------------------------------------------------------------- the four new generals
{
  const mk = (f, g) => bare({ factions: [f, 'vanguard'], generals: [g, null] });
  { const s = mk('ursa', 'wagner'), T = s.teams[0], n = mk('ursa', null).teams[0];
    const W = GENERALS.wagner, cut = W.discount.all;
    ok(cut < 1 && W.discount.bldg === cut && unitCost(T, 'u_tank') === Math.round(UNITS.u_tank.cost * cut / 10) * 10 && unitCost(T, 'u_su27') < unitCost(n, 'u_su27') && bldgCost(T, 'u_factory') === Math.round(2000 * cut / 10) * 10 && bldgCost(n, 'u_factory') === 2000, 'Wagner Group: units and buildings cost ' + Math.round((1 - cut) * 100) + '% less');
    const t = makeUnit(s, 'u_tank', PLAYER, 200, 200, 0), b = makeBldg(s, 'u_power', PLAYER, 40, 40), h = makeUnit(s, 'u_hero', PLAYER, 220, 200, 0);
    ok(W.hpMult < 1 && t.maxHp === Math.round(UNITS.u_tank.hp * W.hpMult) && b.maxHp === Math.round(BLDGS.u_power.hp * W.hpMult) && h.maxHp === UNITS.u_hero.hp, 'and everything it builds has ' + Math.round((1 - W.hpMult) * 100) + '% less health (the hero excepted)');
    ok(trainsOf(T, 'u_barracks').includes('u_convict') && !trainsOf(n, 'u_barracks').includes('u_convict') && UNITS.u_convict.cost < 200, 'it alone trains the Convict Squad, the cheapest infantry in the game');
    const doz = makeUnit(s, 'u_dozer', PLAYER, 100, 100, 0); T.money = 1000; makeBldg(s, 'u_power', PLAYER, 60, 40); s.nav.rebuild(); s.issue({ t: 'build', id: doz.id, type: 'u_barracks', cx: 60, cz: 60 }); run(s, 2);
    ok(T.money === 1000 - bldgCost(T, 'u_barracks') && bldgCost(T, 'u_barracks') < BLDGS.u_barracks.cost, 'the discount is what is actually charged'); }
  { const s = mk('ursa', 'vacation'), T = s.teams[0];
    ok(trainsOf(T, 'u_factory').includes('u_armata') && trainsOf(T, 'u_airfield').includes('u_su57') && !BLDGS.u_factory.trains.includes('u_armata'), 'Vacation Command Group: adds the T-14 Armata and the Su-57');
    const tk = hold(makeUnit(s, 'u_tank', PLAYER, 200, 200, 0)), foe = hold(makeUnit(s, 'v_tank', ENEMY, 220, 200, 0)), fb = makeBldg(s, 'v_power', ENEMY, 120, 90); foe.hp = 1; fb.hp = 1; const m0 = T.money;
    tk.order = { t: 'attack', id: foe.id }; run(s, 80); const m1 = T.money; tk.order = { t: 'fattack', id: fb.id, x: fb.x, z: fb.z, g: null }; run(s, 300);
    const cutL = GENERALS.vacation.loot;
    ok(cutL > 0 && foe.dead && m1 - m0 === Math.round(UNITS.v_tank.cost * cutL) && fb.dead && T.money - m1 === Math.round(BLDGS.v_power.cost * cutL), 'it is paid ' + Math.round(cutL * 100) + '% of what it destroys: $' + (m1 - m0) + ' for a Sentinel tank, $' + (T.money - m1) + ' for a reactor'); }
  { const s = mk('aegis', 'lasergen'), T = s.teams[0], n = mk('aegis', null);
    const shot = (sim) => { const l = hold(makeUnit(sim, 'e_laserleo', PLAYER, 200, 200, 0)), t = hold(makeUnit(sim, 'v_lav', ENEMY, 225, 200, 0)); t.hp = t.maxHp = 1e6; l.order = { t: 'attack', id: t.id }; let hits = 0; run(sim, 60, (ev) => { for (const e of ev) if (e.t === 'laser') hits++; }); return (1e6 - t.hp) / hits; };
    const a = shot(s), b = shot(n);
    ok(Math.abs(a / b - 1.25) < 0.01, `Laser general: laser weapons do 25% more damage (${a.toFixed(1)} against ${b.toFixed(1)} a hit)`);
    ok(trainsOf(T, 'e_factory').includes('e_laserleo') && upgradesOf(T, 'e_factory').includes('e_aps') && !upgradesOf(n.teams[0], 'e_factory').includes('e_aps'), 'it adds the Laser Leopard and the Laser Point Defense upgrade');
    const leo = hold(makeUnit(s, 'e_tank', PLAYER, 300, 300, 0)), rp = makeUnit(s, 's_rpg', ENEMY, 330, 300, 0); rp.order = { t: 'attack', id: leo.id }; let pd = 0; run(s, 200, (ev) => { for (const e of ev) if (e.t === 'pdl') pd++; });
    T.upgrades.add('e_aps'); let pd2 = 0; leo.hp = leo.maxHp; run(s, 300, (ev) => { for (const e of ev) if (e.t === 'pdl' && e.sid === leo.id) pd2++; });
    ok(pd === 0 && pd2 > 0, 'with the upgrade a Leopard 2 shoots down incoming rockets; without it, it cannot'); }
  { const s = mk('aegis', 'panzer'), T = s.teams[0];
    const t = makeUnit(s, 'e_tank', PLAYER, 200, 200, 0), p = makeUnit(s, 'e_puma', PLAYER, 220, 200, 0);
    ok(unitCost(T, 'e_tank') === 900 && unitCost(T, 'e_puma') === UNITS.e_puma.cost && t.vet === 1 && p.vet === 0 && Math.abs(t.maxHp - UNITS.e_tank.hp * 1.15 * 1.15) < 2 && trainsOf(T, 'e_factory').includes('e_panther'), 'Panzer general: tanks cost 10% less, have 15% more health and are built as Veterans; it adds the KF51 Panther; other vehicles are unchanged'); }
}

// ---------------------------------------------------------------- the two new heroes
{
  const s = bare({ factions: ['ursa', 'vanguard'] }), h = makeUnit(s, 'u_hero', PLAYER, 200, 200, 0);
  const tank = hold(makeUnit(s, 'v_tank', ENEMY, 226, 200, 0)), inf = hold(makeUnit(s, 'v_ranger', ENEMY, 226, 214, 0)), jet = makeUnit(s, 'v_raptor', ENEMY, 220, 190, 0); jet.landed = false; jet.as = 'out';
  const heli = hold(makeUnit(s, 'v_comanche', ENEMY, 215, 185, 0)); tank.hp = tank.maxHp = 1e6;
  ok(slotsOf(h).join() === 'bear_minigun,bear_laser' && canAttack(h, tank) && canAttack(h, inf) && canAttack(h, heli) && !canAttack(h, jet) && WEAPONS.bear_laser.beam[0] === 1, 'IT’S HIM!: minigun and red eye-lasers; anything on the ground and helicopters, not jets in flight');
  const seen = new Set(); h.order = { t: 'attack', id: tank.id }; run(s, 80, (ev) => { for (const e of ev) if (e.sid === h.id && (e.t === 'tracer' || e.t === 'laser')) seen.add(e.w); });
  ok(seen.has('bear_minigun') && seen.has('bear_laser') && UNITS.u_hero.speed > UNITS.v_hero.speed && UNITS.u_hero.hp > UNITS.v_hero.hp, 'both weapons fire together; he is faster and tougher than the other heroes (he is on a bear)');
}
{
  const s = bare({ factions: ['aegis', 'vanguard'] }), L = makeUnit(s, 'e_hero', PLAYER, 200, 200, 0), D = UNITS.e_hero;
  const heli = hold(makeUnit(s, 'v_comanche', ENEMY, 210, 200, 0)), t1 = hold(makeUnit(s, 'v_tank', ENEMY, 232, 200, 0)), t2 = hold(makeUnit(s, 'v_tank', ENEMY, 232, 230, 0)); for (const t of [t1, t2]) t.cds = [1e9, 1e9, 1e9];
  ok(D.berserk && WEAPONS.spear.kind === 'melee' && !WEAPONS.spear.vs.air && !canAttack(L, heli) && canAttack(L, t1) && D.hp >= 1.5 * Math.max(...Object.keys(UNITS).filter(k => UNITS[k].hero && k !== 'e_hero').map(k => UNITS[k].hp)), 'Leonidas: a spear, nothing against aircraft, and by far the largest health of any hero');
  let stabs = 0, far = 0, t1Dead = -1, n = 0; run(s, 700, (ev) => { n++; for (const t of [t1, t2]) t.cds[0] = 1e9; for (const e of ev) if (e.t === 'melee') { stabs++; const t = s.byId.get(e.tid); if (t && Math.hypot(t.x - L.x, t.z - L.z) - t.radius > WEAPONS.spear.range + 0.6) far++; } if (t1.dead && t1Dead < 0) t1Dead = n; });
  ok(t1.dead && t2.dead && !far && stabs >= 4 && stabs <= 10, `left alone he charges the nearest tank, kills it at arm's length (${stabs} thrusts for two Sentinel tanks) and goes straight for the next: no orders needed`);
  const b = makeBldg(s, 'v_airfield', ENEMY, 60, 60); s.nav.rebuild(); const hp0 = b.hp; L.order = { t: 'fattack', id: b.id, x: b.x, z: b.z, g: null }; run(s, 900);
  ok(b.hp < hp0 - 1000 || b.dead, `he brings his spear to a building's wall and wrecks it (${Math.round(hp0 - Math.max(0, b.hp))} damage to an Air Field)`);
  ok(heli.hp === heli.maxHp, 'the helicopter overhead is never touched');
  const q = bare({ factions: ['aegis', 'ursa'] }), T = q.teams[0]; T.money = 9000; makeBldg(q, 'e_power', PLAYER, 20, 20); makeBldg(q, 'e_supply', PLAYER, 40, 20); makeBldg(q, 'e_factory', PLAYER, 20, 40); const bk = makeBldg(q, 'e_barracks', PLAYER, 40, 40); q.nav.rebuild();
  q.issue({ t: 'train', id: bk.id, type: 'e_hero' }); run(q, 2); ok(heroTaken(q, PLAYER), 'one hero per side applies to the new factions too'); const m = T.money; q.issue({ t: 'train', id: bk.id, type: 'e_hero' }); run(q, 2); ok(T.money === m, 'a second Leonidas is refused');
}

// ---------------------------------------------------------------- powers of the new factions reuse older strikes with their own numbers
{
  const s = bare({ factions: ['ursa', 'aegis'] }), T = s.teams[0]; for (const n of FACTIONS.ursa.tree) { T.promos.add(n.id); if (n.power) T.powerReady[n.power] = 0; }
  makeBldg(s, 'u_cc', PLAYER, 20, 220); for (let i = 0; i < 3; i++) makeBldg(s, 'u_power', PLAYER, 20 + i * 8, 20); s.nav.rebuild(); run(s, 2);
  ok(!POWERS.iskander.super && usePower(s, PLAYER, 'iskander', 300, 200) && s.strikes.filter(p => p.kind === 'scud' && p.pid === 'iskander').length === POWERS.iskander.n, 'Iskander Strike (a promotion power since batch 14): three missiles, fired from the Command Center');
  let hits = 0, fires = 0, toxin = 0; run(s, 400, (ev) => { for (const e of ev) { if (e.t === 'scudhit') { hits++; if (e.fire) fires++; } if (e.t === 'hazard' && e.kind === 'toxin') toxin++; } });
  ok(hits === POWERS.iskander.n && fires === hits && !toxin && T.powerReady.iskander > s.tick, 'they leave fire, not toxin, and the power recharges');
  ok(usePower(s, PLAYER, 'vdv', 300, 200), 'VDV Airdrop called'); run(s, 400);
  ok(s.ents.filter(e => e.type === 'u_rifle' && e.team === PLAYER).length === POWERS.vdv.n && !s.ents.some(e => e.type === 'v_ranger'), 'it drops five Motor Rifle squads (not US Rangers)');
  ok(usePower(s, PLAYER, 'odab', 300, 200) && s.strikes.some(p => p.pid === 'odab' && p.model === 'bomber'), 'ODAB Fuel-Air Bomb: the same bomb as China’s, from Russia’s own bomber');
  const e = bare({ factions: ['aegis', 'ursa'] }), E = e.teams[0]; for (const n of FACTIONS.aegis.tree) { E.promos.add(n.id); if (n.power) E.powerReady[n.power] = 0; }
  makeBldg(e, 'e_cc', PLAYER, 20, 220); for (let i = 0; i < 3; i++) makeBldg(e, 'e_power', PLAYER, 20 + i * 8, 20); e.nav.rebuild(); run(e, 2);
  ok(!POWERS.lance && BLDGS.e_shield.superPower === 'skyshield' && BLDGS.u_kinzhal.superPower === 'kinzhal', 'the Orbital Lance and the Iskander Battery are gone: Europe has the Sky Shield and Russia the Kinzhal Strike (test/batch14.mjs)');
  ok(usePower(e, PLAYER, 'storm', 300, 240), 'Storm Shadow Strike called'); let bombs = 0; run(e, 500, (ev) => { for (const x of ev) if (x.t === 'shellhit') bombs++; }); ok(bombs === POWERS.storm.n, 'ten warheads along the line');
}

// ---------------------------------------------------------------- the AI plays the new factions, and ISIS learns to tunnel
{
  const s = new Sim({ ai: 'both', difficulty: ['hard', 'hard'], factions: ['ursa', 'aegis'], map: MAPS[0].spec, seed: 6, friendlyFire: true });
  const types = [new Set(), new Set()], built = [new Set(), new Set()];
  for (let i = 0; i < 12000 && s.winner < 0; i++) { s.step(); for (const e of s.events) if (e.t === 'spawn') types[e.team].add(e.type); s.events.length = 0; if (i % 200 === 0) for (const e of s.ents) if (e.kind === 'bldg' && e.team < 2 && e.done) built[e.team].add(e.type); }
  ok(built[0].size >= 6 && built[1].size >= 6 && types[0].size >= 5 && types[1].size >= 5, `Russia v Europe, Hard: each AI raises a base and an army (${built[0].size} / ${built[1].size} building types, ${types[0].size} / ${types[1].size} unit types)`);
  ok([...types[0]].some(t => UNITS[t].cls === 1 && UNITS[t].weapon) && [...types[1]].some(t => UNITS[t].cls === 1 && UNITS[t].weapon) && types[0].has('u_hero') && types[1].has('e_hero'), 'each fields infantry, fighting vehicles and its hero');
  ok(s.teams[0].unitsKilled + s.teams[1].unitsKilled > 10, `and they fight (${s.teams[0].unitsKilled} and ${s.teams[1].unitsKilled} kills)`);
  const again = new Sim({ ai: 'both', difficulty: ['hard', 'hard'], factions: ['ursa', 'aegis'], map: MAPS[0].spec, seed: 6, friendlyFire: true }); for (let i = 0; i < 3000; i++) again.step();
  const ref = new Sim({ ai: 'both', difficulty: ['hard', 'hard'], factions: ['ursa', 'aegis'], map: MAPS[0].spec, seed: 6, friendlyFire: true }); for (let i = 0; i < 3000; i++) ref.step();
  ok(again.hash() === ref.hash(), 'a match between the new factions repeats exactly from the same seed');
}
{
  const s = new Sim({ ai: 'both', difficulty: ['hard', 'hard'], factions: ['sandstorm', 'vanguard'], map: MAPS[6].spec, seed: 3, friendlyFire: true });
  for (let i = 0; i < 24000 && s.winner < 0; i++) s.step();
  const a = s.ais[0];
  ok(a.tun.sneaks + a.tun.built >= 1 && a.tun.built <= 3, `ISIS AI on Emerald Isles: opens forward tunnel exits (${a.tun.sneaks} by Sneak Attack, ${a.tun.built} built by Workers, never more than three Worker tries)`);
  ok(a.tun.trips >= 1 && s.stats.teleports >= 6, `and sends its army through them (${a.tun.trips} attacks went underground, ${s.stats.teleports} units through the tunnels)`);
  ok([...s.teams[0].promos].includes('s_sneak'), 'on a 2 km map it takes Sneak Attack as its Rank 5 promotion');
  const small = new Sim({ ai: 'both', difficulty: ['hard', 'hard'], factions: ['sandstorm', 'vanguard'], seed: 3 }); for (let i = 0; i < 6000 && small.winner < 0; i++) small.step();
  ok(small.ais[0].tun.built === 0 && small.ais[0].tun.sneaks === 0, 'on a small map it does not bother');
}

console.log(fail ? `BATCH12: ${fail} FAILURES of ${pass + fail}` : `BATCH12: all ${pass} checks passed`);
process.exit(fail ? 1 : 0);
