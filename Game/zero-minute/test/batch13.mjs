// Batch 13: the US aircraft that used to be support powers are units now (A-10, AC-130, B-2), the Strategic Airfield,
// the Apache and its Longbow upgrade, the AH-1Z Viper, the Tomahawk Strike and the two new US promotions; ISIS gets
// the Quad Cannon and the Shahed Launcher, faster tunnels and more Sneak Attacks; the Stealth General's AI keeps a
// quadcopter swarm; cloaked units are drawn solid again; every model carries more of its owner's colour; soldiers and
// heroes are rebuilt in detail and walk.
import { readFileSync } from 'node:fs';
import { THREE } from './stub-three.mjs';
globalThis.THREE = THREE;
THREE.CanvasTexture = class { constructor(c) { this.image = c; this.repeat = { set() {} }; this.offset = { set() {} }; } }; THREE.RepeatWrapping = 1000; THREE.LinearFilter = 1006; THREE.LinearMipmapLinearFilter = 1008; THREE.MeshBasicMaterial = THREE.MeshStandardMaterial; THREE.Color.prototype.multiplyScalar = function () { return this; }; THREE.Color.prototype.getHex = function () { return typeof this.hex === 'number' ? this.hex : 0x808080; };   // enough for models.js to build its materials
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => new Proxy({}, { get: (t, k) => (k === 'canvas' ? {} : () => ({ addColorStop() {} })), set: () => true }) }) };
import { Sim } from '../js/sim/simulationTick.js';
import { makeUnit, makeBldg } from '../js/sim/entities.js';
import { slotsOf } from '../js/sim/combat.js';
import { usePower, hasPower } from '../js/sim/powers.js';
import { PLAYER, ENEMY, angDiff } from '../js/sim/defs.js';
import { UNITS, BLDGS, WEAPONS, POWERS, UPGRADES, FACTIONS, GENERALS, FACTION_IDS, trainsOf, upgradesOf, unitCost } from '../js/sim/factionRegistry.js';
import { OPEN_BIG, MAPS } from '../js/sim/map.js';
import { TEAM } from '../js/ui/teamColors.js';
const MF = await import('../js/render/modelFactory.js');

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) pass++; else { fail++; console.log('  FAIL', msg); } };
const bare = (o = {}) => { const s = new Sim({ ai: false, empty: true, map: OPEN_BIG, ...o }); s.fog.exp[0].fill(1); s.fog.exp[1].fill(1); return s; };
const run = (s, n, f) => { for (let i = 0; i < n; i++) { s.step(); if (f) f(s.events); s.events.length = 0; } };
const hold = (u) => { u.order = { t: 'hold' }; u.cds = [1e9, 1e9, 1e9]; return u; };
const src = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// ---------------------------------------------------------------- what was removed, what replaced it
{
  const tree = FACTIONS.vanguard.tree, ids = tree.map(n => n.id);
  ok(!POWERS.a10 && !POWERS.ac130 && !ids.includes('v_a10') && !ids.includes('v_a10x2') && !ids.includes('v_ac130'), 'A-10 Strafing Run, A-10 Wingman and AC-130 Gunship are gone: no powers, no promotions');
  ok(!/gunship|strafe|rocketfire/.test(src('js/sim/powers.js')) && !/case 'gunship'|kind === 'gunship'|POWERS\.ac130/.test(src('js/render/view.js')), 'their strike code is gone from the simulation and the view');
  ok(MF.AIRCRAFT.a10 && MF.AIRCRAFT.ac130 && MF.AIRCRAFT.b2 && MF.ASSEMBLY.a10 && MF.ASSEMBLY.ac130 && MF.ASSEMBLY.b2, 'the three aircraft models are kept, and are unit models as well now');
  ok(tree.length === 7 && ['v_pathfinder', 'v_vet', 'v_strike', 'v_para', 'v_fastpdl', 'v_pilots', 'v_rearm'].every(k => ids.includes(k)), 'the United States still has seven promotions: Tomahawk Strike, Combat Pilots and Rapid Re-arm fill the three gaps');
  for (const f of FACTION_IDS) ok(FACTIONS[f].tree.length === 7, f + ': seven promotions');
  const n = (id) => tree.find(k => k.id === id);
  ok(n('v_strike').tier === 3 && n('v_strike').power === 'tomahawk' && n('v_pilots').tier === 3 && n('v_pilots').req === 'v_strike' && n('v_rearm').tier === 5 && n('v_rearm').req === 'v_pilots', 'ranks and branches: Tomahawk Strike (3) then Combat Pilots (3) then Rapid Re-arm (5)');
  ok(GENERALS.airforce.swap.tomahawk === 'b2' && POWERS.b2.as === 'fab' && POWERS.b2.plane === 'b2' && !POWERS.b2.n, 'Air Force General: the B-2 power in place of the Tomahawk, and it drops a fuel-air bomb now');

  // Tomahawk: one cruise missile onto a small zone
  const s = bare({ factions: ['vanguard', 'redhammer'] }), T = s.teams[0]; T.promos.add('v_strike'); T.powerReady.tomahawk = 0;
  const tank = hold(makeUnit(s, 'r_tank', ENEMY, 500, 500, 0)), far = hold(makeUnit(s, 'r_tank', ENEMY, 500 + POWERS.tomahawk.radius + 10, 500, 0));
  ok(hasPower(s, PLAYER, 'tomahawk') && usePower(s, PLAYER, 'tomahawk', 500, 500), 'Tomahawk Strike ordered');
  let hits = 0, at = 0; run(s, 200, (ev) => { for (const e of ev) if (e.t === 'scudhit') { hits++; at = s.tick; } });
  ok(hits === 1 && at >= POWERS.tomahawk.flight && at <= POWERS.tomahawk.flight + 2 && (tank.dead || tank.hp < tank.maxHp * 0.5) && far.hp === far.maxHp, `one missile lands after ${(at / 20).toFixed(1)} s: the tank in the zone is ${tank.dead ? 'destroyed' : 'badly hurt'}, the one outside untouched`);
  ok(T.powerReady.tomahawk > s.tick, 'and the power recharges');

  // B-2 power for the Air Force General: exactly one fuel-air bomb
  const a = bare({ factions: ['vanguard', 'redhammer'], generals: ['airforce', null] }); a.teams[0].promos.add('v_strike'); a.teams[0].powerReady.b2 = 0;
  ok(hasPower(a, PLAYER, 'b2') && !hasPower(a, PLAYER, 'tomahawk') && usePower(a, PLAYER, 'b2', 500, 500), 'B-2 Fuel-Air Bomb ordered');
  let fab = 0, shells = 0; run(a, 500, (ev) => { for (const e of ev) { if (e.t === 'fab') fab++; if (e.t === 'shellhit') shells++; } });
  ok(fab === 1 && shells === 0, 'the B-2 power drops one fuel-air bomb and no carpet of bombs');
  console.log('US promotions  : A-10 and AC-130 powers removed | Tomahawk Strike, Combat Pilots, Rapid Re-arm | B-2 power = one fuel-air bomb');
}

// ---------------------------------------------------------------- Strategic Airfield and the aircraft built there
{
  const B = BLDGS.v_stratfield, L = B.layout;
  ok(B.general === 'airforce' && B.pads === 2 && L.hangars.length === 2 && L.spots.length === 2 && L.helipad && B.big && B.needs === 'v_airfield', 'Strategic Airfield: Air Force General only, two large hangars, a helicopter pad, needs an Air Field first');
  ok(JSON.stringify(B.trains) === JSON.stringify(['v_ac130', 'v_b2', 'v_apache']) && B.upgrades.includes('v_longbow'), 'it builds the AC-130, the B-2 and the Apache, and sells the Longbow upgrade');
  ok(L.hangar.w > MF.HERCULES.span * MF.HERCULES.scale && L.hangar.w > MF.SPIRIT.span * MF.SPIRIT.scale && L.hangar.d > MF.HERCULES.length * MF.HERCULES.scale, `its hangars (${L.hangar.w} m wide, ${L.hangar.d} m deep) take an AC-130 or a B-2`);
  for (const g of [null, 'marine']) { const s = bare({ factions: ['vanguard', 'redhammer'], generals: [g, null] }), T = s.teams[0]; T.money = 9000;
    ok(trainsOf(T, 'v_airfield').includes('v_a10'), `${g || 'no general'}: the A-10 is built at the Air Field`);
    const d = makeUnit(s, 'v_dozer', PLAYER, 300, 300, 0); makeBldg(s, 'v_airfield', PLAYER, 60, 60); s.nav.rebuild(); s.issue({ t: 'build', id: d.id, type: 'v_stratfield', cx: 160, cz: 160 }); run(s, 3);
    ok(!s.ents.some(e => e.type === 'v_stratfield') && T.money === 9000, `${g || 'no general'}: cannot build the Strategic Airfield`); }
  ok(trainsOf({ faction: 'vanguard', general: 'airforce' }, 'v_airfield').includes('v_a10') && trainsOf({ faction: 'vanguard', general: 'marine' }, 'v_airfield').includes('v_viper') && !trainsOf({ faction: 'vanguard', general: 'airforce' }, 'v_airfield').includes('v_viper'), 'both US generals build the A-10; only the Marine Corps General builds the AH-1Z');

  const once = () => {
    const s = bare({ factions: ['vanguard', 'redhammer'], generals: ['airforce', null] }), T = s.teams[0]; T.money = 99999;
    for (let i = 0; i < 6; i++) makeBldg(s, 'v_power', PLAYER, 40 + i * 8, 440);
    makeBldg(s, 'v_factory', PLAYER, 40, 400); const af = makeBldg(s, 'v_airfield', PLAYER, 60, 400), sf = makeBldg(s, 'v_stratfield', PLAYER, 90, 396); s.nav.rebuild();
    for (const t of ['v_ac130', 'v_b2', 'v_ac130', 'v_apache']) s.issue({ t: 'train', id: sf.id, type: t }); s.issue({ t: 'train', id: af.id, type: 'v_a10' });
    run(s, 20 * 80);
    const get = (t) => s.ents.filter(e => e.type === t), ac = get('v_ac130')[0], b2 = get('v_b2')[0], ap = get('v_apache')[0], a10 = get('v_a10')[0];
    ok(ac && b2 && ap && a10 && ac.home === sf.id && b2.home === sf.id && a10.home === af.id && get('v_ac130').length === 1, 'AC-130, B-2 and Apache come out of the Strategic Airfield, the A-10 out of the Air Field; a third big aircraft waits for a free hangar');
    ok(ac.as === 'parked' && b2.as === 'parked' && a10.as === 'parked' && dist(ac, sf) < 45 && dist(b2, sf) < 45, 'the big aircraft park in its two hangars');
    // AC-130: circles the target anti-clockwise and only ever fires out of its left side
    const foes = [0, 1, 2, 3, 4, 5].map(i => { const u = hold(makeUnit(s, i % 2 ? 'r_tank' : 'r_conscript', ENEMY, 500 + (i % 3) * 8, 600 + ((i / 3) | 0) * 8, 0)); u.hp = u.maxHp = i ? 3000 : 30000; return u; }), t0 = foes[0];
    s.issue({ t: 'attack', ids: [ac.id], target: t0.id }); if (!ac.order) ac.order = { t: 'fattack', id: t0.id, x: t0.x, z: t0.z, g: null };
    let gun = 0, shell = 0, wrong = 0, rMin = 1e9, rMax = 0, turn = 0, n = 0, pf = ac.facing;
    run(s, 20 * 120, (ev) => { for (const u of foes) u.cds[0] = 1e9;
      for (const e of ev) if (e.sid === ac.id && (e.t === 'tracer' || e.t === 'fire')) { if (e.w === 'ac_gun') gun++; else if (e.w === 'ac_105') shell++;
        const rel = angDiff(Math.atan2(t0.z - ac.z, t0.x - ac.x), ac.facing - Math.PI / 2); if (Math.abs(rel) > 0.75) wrong++; const d = dist(ac, t0); rMin = Math.min(rMin, d); rMax = Math.max(rMax, d); turn += angDiff(ac.facing, pf); n++; } pf = ac.facing; });
    ok(gun > 60 && shell === UNITS.v_ac130.ammo && wrong === 0, `AC-130: ${gun} cannon bursts and all ${shell} howitzer shells, every one with the target on its left side`);
    ok(Math.abs(rMin - UNITS.v_ac130.orbit) < 12 && Math.abs(rMax - UNITS.v_ac130.orbit) < 12 && rMin > 50 && turn < -1, `it holds a circle about ${UNITS.v_ac130.orbit} m out (${rMin.toFixed(0)} to ${rMax.toFixed(0)} m), turning left all the way`);
    ok(ac.as === 'parked' && ac.ammo === UNITS.v_ac130.ammo && t0.hp < 30000, 'shells spent, it flew home and was re-armed');
    ok(WEAPONS.ac_gun.free && !WEAPONS.ac_105.free && UNITS.v_ac130.mounts.every(m => m.dir === -Math.PI / 2), 'both guns are mounted to port; only the howitzer rounds are counted as the sortie');
    // B-2: one pass, ten bombs in a line
    const bld = makeBldg(s, 'r_power', ENEMY, 270, 320); s.nav.rebuild(); const hits = [];
    b2.order = { t: 'fattack', id: bld.id, x: bld.x, z: bld.z, g: null }; run(s, 20 * 60, (ev) => { for (const e of ev) if (e.t === 'shellhit') hits.push([e.x, e.z]); });
    const span = hits.length ? Math.max(...hits.map(h => Math.hypot(h[0] - hits[0][0], h[1] - hits[0][1]))) : 0, mid = hits.reduce((a, h) => [a[0] + h[0] / hits.length, a[1] + h[1] / hits.length], [0, 0]);
    ok(hits.length === WEAPONS.b2_bombs.n && span > 50 && span < 70 && Math.hypot(mid[0] - bld.x, mid[1] - bld.z) < 6 && bld.hp < bld.maxHp, `B-2: ${hits.length} bombs along a ${span.toFixed(0)} m line centred on the target, in one pass`);
    ok(b2.ammo === 0 || b2.as === 'parked', 'then it goes home to re-arm');
    // A-10: cannon and four Mavericks at ground targets, nothing at aircraft
    const t1 = foes[1], h1 = t1.hp; let g8 = 0, mav = 0; a10.order = { t: 'fattack', id: t1.id, x: t1.x, z: t1.z, g: null };
    run(s, 20 * 60, (ev) => { for (const u of foes) u.cds[0] = 1e9; for (const e of ev) if (e.sid === a10.id) { if (e.w === 'gau8') g8++; if (e.w === 'maverick' && e.t === 'fire') mav++; } });
    ok(g8 === WEAPONS.gau8.rounds && mav === UNITS.v_a10.ammo && t1.hp < h1 - 400, `A-10: ${g8} cannon bursts and ${mav} Mavericks on one sortie, ${Math.round(h1 - t1.hp)} damage to a tank`);
    ok(!WEAPONS.gau8.vs.air && !WEAPONS.maverick.vs.air, 'it has nothing for aircraft');
    // Apache and Longbow
    ok(JSON.stringify(slotsOf(ap)) === JSON.stringify(['m230', 'hellfire']) && !ap.up && !ap.sightPlus && !ap.detect, 'Apache: chain gun and Hellfires');
    s.issue({ t: 'train', id: sf.id, type: 'up:v_longbow' }); run(s, 20 * (UPGRADES.v_longbow.secs + 3));
    ok(T.upgrades.has('v_longbow') && ap.up && slotsOf(ap).includes('hellfire_lb') && WEAPONS.hellfire_lb.range > WEAPONS.hellfire.range && ap.sightPlus === UNITS.v_apache.up.sight && ap.detect === UNITS.v_apache.up.detector, `Longbow: Hellfires reach ${WEAPONS.hellfire_lb.range} m (was ${WEAPONS.hellfire.range}), it sees ${UNITS.v_apache.up.sight} m further and spots cloaked units within ${UNITS.v_apache.up.detector} m`);
    const ap2 = makeUnit(s, 'v_apache', PLAYER, 300, 300, 0); ok(ap2.up && slotsOf(ap2).includes('hellfire_lb'), 'an Apache built afterwards has it too');
    const spy = makeUnit(s, 's_saboteur', ENEMY, ap2.x + 20, ap2.z, 0); run(s, 30);
    return [s.hash(), spy.cloaked, spy.detected];
  };
  const a = once(), b = once();
  ok(a[1] && a[2], 'the Longbow Apache reveals a cloaked Saboteur nearby');
  ok(a[0] === b[0], 'all of it is deterministic');
  console.log('US aircraft    : Strategic Airfield (2 hangars + pad) | AC-130 orbits, fires to port | B-2 ten-bomb pass | A-10 cannon + 4 Mavericks | Apache + Longbow');
}

// ---------------------------------------------------------------- promotions: Combat Pilots, Rapid Re-arm
{
  const s = bare({ factions: ['vanguard', 'redhammer'] }), T = s.teams[0]; T.money = 99999; T.rank = 5; T.points = 5;
  for (let i = 0; i < 4; i++) makeBldg(s, 'v_power', PLAYER, 40 + i * 8, 440); makeBldg(s, 'v_factory', PLAYER, 40, 400); const af = makeBldg(s, 'v_airfield', PLAYER, 60, 400); s.nav.rebuild();
  s.issue({ t: 'train', id: af.id, type: 'v_a10' }); run(s, 20 * 20); const plain = s.ents.find(e => e.type === 'v_a10');
  for (const k of ['v_strike', 'v_pilots', 'v_rearm']) s.issue({ t: 'promote', node: k }); run(s, 2);
  ok(T.promos.has('v_pilots') && T.promos.has('v_rearm') && T.flags.fastRearm, 'Combat Pilots and Rapid Re-arm bought');
  s.issue({ t: 'train', id: af.id, type: 'v_a10' }); s.issue({ t: 'train', id: af.id, type: 'v_comanche' }); run(s, 20 * 40);
  const vetJet = s.ents.find(e => e.type === 'v_a10' && e !== plain), heli = s.ents.find(e => e.type === 'v_comanche'), tank = makeUnit(s, 'v_tank', PLAYER, 300, 300, 0);
  ok(plain.vet === 0 && vetJet && vetJet.vet === 1 && heli && heli.vet === 1 && tank.vet === 0, 'Combat Pilots: new jets and helicopters are Veterans; one built before is not, and tanks are not');
  // re-arm time with and without the promotion
  const time = (fast) => { const q = bare({ factions: ['vanguard', 'redhammer'] }); q.teams[0].money = 9999; if (fast) q.teams[0].flags.fastRearm = true;
    for (let i = 0; i < 4; i++) makeBldg(q, 'v_power', PLAYER, 40 + i * 8, 440); makeBldg(q, 'v_factory', PLAYER, 40, 400); const f = makeBldg(q, 'v_airfield', PLAYER, 60, 400); q.nav.rebuild();
    q.issue({ t: 'train', id: f.id, type: 'v_a10' }); run(q, 20 * 20); const j = q.ents.find(e => e.type === 'v_a10'); j.ammo = 0; j.as = 'parked'; j.reloadT = 0; let n = 0; while (j.ammo < UNITS.v_a10.ammo && n < 2000) { run(q, 1); n++; } return n; };
  const slow = time(false), quick = time(true);
  ok(quick < slow * 0.7 && quick > slow * 0.5, `Rapid Re-arm: ${(quick / 20).toFixed(1)} s on the ground instead of ${(slow / 20).toFixed(1)} s`);
  console.log(`promotions     : Combat Pilots (veteran aircraft) | Rapid Re-arm ${(slow / 20).toFixed(1)} s -> ${(quick / 20).toFixed(1)} s`);
}

// ---------------------------------------------------------------- AH-1Z Viper
{
  const V = UNITS.v_viper, others = ['v_comanche', 'v_apache'];
  ok(V.heli && !V.jink && V.dodge > 0 && others.every(k => V.hp < UNITS[k].hp) && others.every(k => WEAPONS[V.weapon].cd <= WEAPONS[UNITS[k].weapon].cd) && WEAPONS[V.weapon2].cd < WEAPONS.hellfire.cd, `AH-1Z: less health (${V.hp}) and faster guns than the other US gunships`);
  const once = () => {
    const s = bare({ factions: ['vanguard', 'sandstorm'], generals: ['marine', null] });
    const v = makeUnit(s, 'v_viper', PLAYER, 400, 400, 0), foe = hold(makeUnit(s, 'r_tank', ENEMY, 425, 400, 0)); foe.hp = foe.maxHp = 1e6;
    s.issue({ t: 'attack', ids: [v.id], target: foe.id }); let moved = 0, px = v.x, pz = v.z, heads = new Set(), shots = 0;
    run(s, 300, (ev) => { foe.cds[0] = 1e9; const d = Math.hypot(v.x - px, v.z - pz); if (s.tick - v.lastFire < 30 && d > 0.05) { moved += d; heads.add(Math.round(Math.atan2(v.z - pz, v.x - px) * 2)); } px = v.x; pz = v.z; for (const e of ev) if (e.sid === v.id) shots++; });
    ok(shots > 40 && moved < 2 && dist(v, foe) < WEAPONS[V.weapon2].range + 6, `batch 14: it no longer darts about while it fires (${moved.toFixed(1)} m of drift in 15 s)`);
    // missiles and shells miss part of the time; rifle fire never does
    hold(v); v.order = { t: 'hold' }; v.hp = v.maxHp = 1e7; let fired = 0, dodged = 0, hurt = 0;
    const aa = [0, 1, 2].map(i => makeBldg(s, 's_stinger', ENEMY, Math.round(v.x / 2) + 10 + i * 5, Math.round(v.z / 2) + 6)); s.nav.rebuild(); run(s, 900, (ev) => { v.cds = [1e9, 1e9, 1e9]; for (const e of ev) { if (e.t === 'fire' && aa.some(a => a.id === e.sid)) fired++; if (e.t === 'dodge' && e.id === v.id) dodged++; } });
    ok(fired >= 12 && dodged >= fired * (V.dodge - 0.25) && dodged <= fired * (V.dodge + 0.25) && dodged < fired, `it dodges missiles: ${dodged} of ${fired} missed (${Math.round(V.dodge * 100)}% chance each)`);
    for (const a of aa) a.hp = 0, a.dead = true; run(s, 3);
    const h0 = v.hp, sq = [0, 1, 2].map(i => makeUnit(s, 's_guerrilla', ENEMY, v.x + 6 + i * 3, v.z + 6, 0)); let tracers = 0, dodge2 = 0;
    run(s, 200, (ev) => { v.cds = [1e9, 1e9, 1e9]; for (const e of ev) { if (e.t === 'tracer' && sq.some(q => q.id === e.sid)) tracers++; if (e.t === 'dodge') dodge2++; } });
    ok(tracers > 5 && dodge2 === 0 && h0 - v.hp > 0, `infantry rifles always land: ${tracers} bursts, no dodges, ${Math.round(h0 - v.hp)} damage`);
    return s.hash();
  };
  ok(once() === once(), 'dodging uses the simulation\'s own random numbers: a replay matches');
  console.log('AH-1Z Viper    : holds its position while firing | dodges missiles and shells | small arms always hit');
}

// ---------------------------------------------------------------- ISIS: Quad Cannon, Shahed Launcher, Scud range, tunnels
{
  for (const g of [null, 'stealth', 'wmd']) ok(['s_quad', 's_shahedtruck'].every(k => trainsOf({ faction: 'sandstorm', general: g }, 's_factory').includes(k)), `${g || 'no general'}: Quad Cannon and Shahed Launcher at the Arms Dealer`);
  const Q = UNITS.s_quad, ground = Object.values(UNITS).filter(d => d.faction === 'sandstorm' && !d.infantry && !d.air && !d.ship && d.weapon && WEAPONS[d.weapon].vs.air && d !== Q);
  ok(Q.cost <= 600 && WEAPONS.zu23.vs.air >= 1 && WEAPONS.zu23.cd <= 3 && Q.armor === 'light', `Quad Cannon: $${Q.cost}, fast fire, best against aircraft, thin skin`);
  ok(WEAPONS.scud_missile.range > WEAPONS.shahed.range && WEAPONS.shahed.range >= 100, `the Scud Launcher (${WEAPONS.scud_missile.range} m) out-ranges the Shahed (${WEAPONS.shahed.range} m), and both are long-range`);
  ok(WEAPONS.shahed.burst === 3 && WEAPONS.shahed.burstGap === 30 && WEAPONS.shahed.kind === 'launch' && WEAPONS.shahed.windup > 0, 'Shahed Launcher: three drones, 1.5 s (30 ticks) apart, after setting up');
  const once = () => {
    const s = bare({ factions: ['sandstorm', 'vanguard'] });
    const q = makeUnit(s, 's_quad', PLAYER, 700, 700, 0), heli = hold(makeUnit(s, 'v_comanche', ENEMY, 720, 700, 0)), hh = heli.hp; run(s, 60, () => { heli.cds = [1e9, 1e9, 1e9]; });
    ok(heli.dead || hh - heli.hp > hh * 0.5, `Quad Cannon against a Comanche: ${heli.dead ? 'shot down' : Math.round(hh - heli.hp) + ' damage'} in 3 s`);
    const tr = makeUnit(s, 's_shahedtruck', PLAYER, 600, 600, 0), tgt = makeBldg(s, 'v_power', ENEMY, 262, 262); s.nav.rebuild(); const d0 = dist(tr, tgt), hp0 = tgt.hp;
    tr.order = { t: 'fattack', id: tgt.id, x: tgt.x, z: tgt.z, g: null }; const launches = [], booms = []; let x0 = tr.x;
    run(s, 20 * 22, (ev) => { for (const e of ev) { if (e.t === 'launch') launches.push(s.tick); if (e.t === 'suicide') booms.push(s.tick); } });
    ok(d0 > 90 && d0 < WEAPONS.shahed.range && tr.x === x0 && launches.length === 3 && launches[1] - launches[0] === 30 && launches[2] - launches[1] === 30, `from ${d0.toFixed(0)} m, without moving, it launches three drones 1.5 s apart (ticks ${launches.join(', ')})`);
    ok(launches[0] >= WEAPONS.shahed.windup && booms.length === 3 && hp0 - Math.max(0, tgt.hp) >= 3 * UNITS.s_shahed.suicide.dmg, `all three reach the building: ${Math.round(hp0 - Math.max(0, tgt.hp))} damage`);
    const n0 = launches.length; run(s, WEAPONS.shahed.cd - 20 * 22 + launches[0] - 5, (ev) => { for (const e of ev) if (e.t === 'launch') launches.push(s.tick); });
    ok(launches.length === n0, `then it reloads: nothing more for ${(WEAPONS.shahed.cd / 20).toFixed(0)} s`);
    // the drones are real aircraft: anti-air shoots them down
    const s2 = bare({ factions: ['sandstorm', 'vanguard'] }), tr2 = makeUnit(s2, 's_shahedtruck', PLAYER, 600, 600, 0), b2 = makeBldg(s2, 'v_power', ENEMY, 262, 262);
    for (let i = 0; i < 4; i++) makeBldg(s2, 'v_power', ENEMY, 240 + i * 8, 280); for (const [x, z] of [[255, 255], [268, 255], [255, 270], [270, 270]]) makeBldg(s2, 'v_patriot', ENEMY, x, z); s2.nav.rebuild();
    tr2.order = { t: 'fattack', id: b2.id, x: b2.x, z: b2.z, g: null }; let shot = 0, hit = 0; run(s2, 20 * 22, (ev) => { for (const e of ev) { if (e.t === 'die' && e.type === 's_shahed') shot++; if (e.t === 'suicide') hit++; } });
    ok(UNITS.s_shahed.air && UNITS.s_shahed.hp <= 80 && shot - hit >= 1, `a defended target: ${shot - hit} of 3 drones shot down before they arrive`);
    return s.hash() + ':' + s2.hash();
  };
  ok(once() === once(), 'launches are deterministic');
  ok(unitCost({ faction: 'sandstorm', general: 'stealth' }, 's_guerrilla') === 200 && unitCost({ faction: 'sandstorm', general: 'stealth' }, 's_fpv') === UNITS.s_fpv.cost && UNITS.s_fpv.cost === 350, 'Stealth General: infantry 10% cheaper (balance); the FPV drone itself is unchanged');
  ok(POWERS.sneaktunnel.cd === 150 && POWERS.sneaktunnel.delay === 2 && FACTIONS.sandstorm.tree.find(n => n.power === 'sneaktunnel').tier === 3 && BLDGS.s_tunnel.secs === 5, 'tunnels: Sneak Attack recharges in 150 s (was 300), opens after 2 s (was 5), is a Rank 3 promotion (was 5); a Tunnel Network builds in 5 s (was 8)');
  console.log(`ISIS           : Quad Cannon $${Q.cost} | Shahed Launcher 3 drones 1.5 s apart, ${WEAPONS.shahed.range} m | Scud Launcher ${WEAPONS.scud_missile.range} m | faster tunnels`);
}

// ---------------------------------------------------------------- AI: Strategic Airfield, quadcopter swarm, sneak attacks
{
  ok(GENERALS.stealth.aiSwarm[0] === 's_fpv' && GENERALS.stealth.aiSwarm[1] === 6 && GENERALS.stealth.aiSwarm[2] === 10 && !Object.keys(GENERALS.stealth).some(k => k === 'swarm'), 'Stealth General: the quadcopter swarm is an AI rule only (6 on Medium, 10 on Hard); nothing changes for a player');
  const s = new Sim({ ai: 'both', difficulty: ['hard', 'hard'], factions: ['sandstorm', 'aegis'], generals: ['stealth', null], map: OPEN_BIG, seed: 3 });
  const a = s.ais[0]; let peak = 0, sneaks = 0, sent = 0;
  ok(a.swarmType === 's_fpv' && a.swarmSize === 10 && !a.combat.includes('s_fpv'), 'the Hard AI plans a swarm of 10 FPV drones, apart from its normal army');
  const keep = (q, team) => { for (const e of q.ents) if (e.kind === 'bldg' && e.team === team && !e.dead) e.hp = e.maxHp; };   // the opponent's buildings never fall, so the match runs its full length
  for (let t = 0; t < 20 * 60 * 14 && s.winner < 0; t++) { if (t % 20 === 0) keep(s, 1); s.step(); for (const e of s.events) if (e.t === 'power' && e.team === 0 && e.id === 'sneaktunnel') sneaks++; s.events.length = 0; if (t % 100 === 0) peak = Math.max(peak, s.ents.filter(e => e.team === 0 && e.type === 's_fpv' && !e.dead).length); }
  ok(peak >= 6 && peak <= 10 && a.swarm.waves >= 1 && a.swarm.sent >= 1, `in a match it keeps up to ${peak} in the air and has sent ${a.swarm.sent} of them ahead of ${a.swarm.waves} attack${a.swarm.waves === 1 ? '' : 's'}`);
  ok(s.teams[0].promos.has('s_sneak') && sneaks >= 2, `the ISIS AI takes Sneak Attack on a 1 km map and uses it again and again (${sneaks} in 14 minutes)`);
  const med = new Sim({ ai: 'both', difficulty: ['medium', 'easy'], factions: ['sandstorm', 'sandstorm'], generals: ['stealth', 'stealth'], map: OPEN_BIG, seed: 1 });
  ok(med.ais[0].swarmSize === 6 && med.ais[1].swarmType === null, 'Medium keeps 6; Easy has no swarm');
  // Air Force General AI: builds both airfields and the aircraft
  const u = new Sim({ ai: 'both', difficulty: ['hard', 'hard'], factions: ['vanguard', 'ursa'], generals: ['airforce', null], map: MAPSPEC('forest'), seed: 3 });
  const built = {}; for (let t = 0; t < 20 * 60 * 24 && u.winner < 0; t++) { if (t % 20 === 0) keep(u, 1); u.step(); for (const e of u.events) if (e.team === 0 && (e.t === 'spawn' || e.t === 'done')) built[e.type] = (built[e.type] || 0) + 1; u.events.length = 0; }
  ok(built.v_airfield >= 1 && built.v_stratfield >= 1 && (built.v_ac130 || 0) + (built.v_b2 || 0) + (built.v_apache || 0) >= 1 && built.v_a10 >= 1, `the Air Force General's AI builds the Air Field, the Strategic Airfield and their aircraft (${['v_a10', 'v_ac130', 'v_b2', 'v_apache'].map(k => (built[k] || 0) + ' ' + UNITS[k].name).join(', ')})`);
  ok(!new Sim({ ai: 'both', factions: ['vanguard', 'ursa'], generals: ['marine', null] }).ais[0].roster.includes('v_ac130'), 'another general\'s AI never plans for aircraft it cannot build');
  console.log(`AI             : swarm peak ${peak}, ${a.swarm.waves} waves | ${sneaks} sneak attacks | Air Force AI built ${Object.entries(built).filter(([k]) => UNITS[k] && UNITS[k].air).map(([k, v]) => v + ' ' + k).join(', ')}`);
}
function MAPSPEC(id) { return MAPS.find(m => m.id === id).spec; }

// ---------------------------------------------------------------- what only the browser draws (source guards) and the models
{
  const view = src('js/render/view.js'), models = src('js/render/models.js'), hud = src('js/ui/uiHUD.js');
  ok(!/setGhost|ghostOf|opacity = 0\.4/.test(view) && /e\.cloaked \? \[e\.detected \? 'SEEN' : 'CLOAK'/.test(hud), 'cloaked units are drawn solid again; the CLOAK tag above them is what marks them');
  ok(/case 'launch':/.test(view) && /case 'dodge':/.test(view) && /v\.longbow\.visible = !!e\.up/.test(view) && /v\.bed\.rotation\.z/.test(view) && /v\.legs\[i\]\.rotation\.z/.test(view), 'the view draws drone launches, dodges, the Longbow dome, the container doors and walking legs');
  ok(/d\.general && d\.general !== T\.general/.test(src('js/sim/simulationTick.js')) && /general/.test(hud), 'a general-only building is refused by the simulation and left off the build menu');

  const P = MF.paint('vanguard', 0), PS = MF.paint('sandstorm', 0), A = MF.ASSEMBLY, count = (r, n) => { let k = 0; r.g.traverse(o => { if (o.isMesh && o.name === n) k++; }); return k; };
  const ap = A.apache(P), vp = A.viper(P);
  ok(ap.rotor && ap.rotorTail && ap.longbow && ap.longbow.visible === false && ap.longbow.position.y > ap.rotor.position.y && count(ap, 'blade') === MF.APACHE.blades && count(ap, 'canopy') === 2 && count(ap, 'engine') === 2 && count(ap, 'missile') === 8 && count(ap, 'wheel') === 2 && count(ap, 'tailwheel') === 1 && ap.turret,
    'Apache: four-blade rotor, tandem canopies, two engine pods, eight Hellfires, wheels and a tailwheel, a chin gun, and the Longbow dome above the rotor (hidden until upgraded)');
  ok(Math.abs(MF.APACHE.rotor / MF.APACHE.fuselage - 14.63 / 14.68) < 0.001 && MF.APACHE.scale === MF.TIGER.scale, 'Apache: real rotor and fuselage lengths at the same scale as the other gunships');
  ok(vp.rotor && count(vp, 'blade') === MF.VIPER.blades && count(vp, 'skid') === 2 && count(vp, 'wheel') === 0 && count(vp, 'sidewinder') === 2 && count(vp, 'barrel') === 3 && count(vp, 'canopy') === 2, 'AH-1Z: four blades, skids instead of wheels, wingtip missiles, a three-barrel chin gun');
  let wA = 0, wV = 0; ap.g.traverse(o => { if (o.name === 'fuselage') wA = o.userData.depth; }); vp.g.traverse(o => { if (o.name === 'fuselage') wV = o.userData.depth; });
  ok(wV < wA * 0.72, `AH-1Z: a much slimmer fuselage than the Apache (${wV} against ${wA})`);
  const qc = A.zu23(PS), st = A.shahedtruck(PS), sd = A.shahed(PS), a10 = A.a10(P), ac = A.ac130(P), b2 = A.b2(P);
  ok(qc.turret && count(qc, 'barrel') === 4 && count(qc, 'radar') === 1 && count(qc, 'wheel') === 4 && count(qc, 'cab') === 1, 'Quad Cannon: a pickup with a four-barrel turret and its radar dish on the bed');
  ok(st.bed && st.roof.length === 2 && st.rack.length === WEAPONS.shahed.burst && count(st, 'containerside') === 2 && count(st, 'wheel') === 6 && st.bed.position.x < -3, 'Shahed Launcher: a three-axle container truck; the container tips up on a hinge at the tail, the roof opens in two leaves, three drones on the rack inside');
  ok(sd.prop && count(sd, 'wing') === 1 && count(sd, 'tipfin') === 2 && Math.abs(MF.SHAHED.span / MF.SHAHED.length - 2.5 / 3.5) < 0.001, 'Shahed: a delta wing with tip fins and a pusher propeller, at the real proportions');
  ok(a10.gear && a10.stores.length === UNITS.v_a10.ammo && a10.ground > 1 && ac.gear && ac.gear.visible === false && ac.props.length === 4 && ac.ground > 1 && b2.gear && b2.ground > 1, 'A-10, AC-130 and B-2 have landing gear for the hangar; the A-10 shows its four Mavericks');

  // team colour: every vehicle, aircraft and ship model carries an extra mark in its owner's colour
  let n = 0, lacking = [];
  for (const [id, d] of Object.entries(UNITS)) { if (!A[d.model] || d.radius < 1.2) continue; const p = MF.paint(d.faction, 0), r = MF.teamMarks(A[d.model](p), p, d); let marks = 0, panels = 0; r.g.traverse(o => { if (o.isMesh && o.material === p.id) { if (o.name === 'teammark') marks++; else panels++; } }); n++; if (marks < 1 || marks + panels < 2) lacking.push(id); }
  ok(n >= 45 && lacking.length <= 1 && lacking.every(k => UNITS[k].model === 'chinook'), `team colour: ${n - lacking.length} of ${n} factory models carry an added mark as well as their panels (${lacking.join(', ') || 'all'})`);
  const tank = MF.teamMarks(A.abrams(P), P, UNITS.v_tank), jet = MF.teamMarks(A.raptor(P), P, UNITS.v_raptor), heli = MF.teamMarks(A.comanche(P), P, UNITS.v_comanche), ship = MF.teamMarks(A.frigate(P), P, UNITS.v_frigate);
  const marks = (r) => { const out = []; r.g.traverse(o => { if (o.isMesh && o.name === 'teammark') out.push(o); }); return out; };
  ok(marks(tank).length === 1 && marks(tank)[0].parent === tank.turret && marks(jet).length === 2 && marks(jet)[0].position.z * marks(jet)[1].position.z < 0 && marks(heli).length === 1 && marks(ship).length >= 1, 'a tank flies a pennant from its turret aerial, a jet has a band at each wingtip, a helicopter a band round its tail boom, a ship a masthead pennant');
  const area = (r, p) => { let a = 0; r.g.traverse(o => { if (o.isMesh && o.material === p.id) { const s = [o.scale.x, o.scale.y, o.scale.z].sort((x, y) => y - x); a += o.userData.profile ? 0.12 : s[0] * s[1]; } }); return a; };
  ok(area(tank, P) > area(A.abrams(P), P) * 1.3 && area(tank, P) < 1.5, `and it stays modest: an Abrams shows ${area(tank, P).toFixed(2)} m2 of team colour (was ${area(A.abrams(P), P).toFixed(2)})`);

  // infantry and heroes
  const LM = await import('../js/render/models.js');
  const figs = Object.entries(UNITS).filter(([, d]) => d.infantry || d.hero);
  let legged = 0, banded = 0; const kinds = new Set();
  for (const [id, d] of figs) { const r = LM.buildModel({ kind: 'unit', type: id, team: 0 }); if (r.legs && r.legs.length >= 2 * r.men.length && r.legs.every(l => l.parent && Math.abs(l.position.y) > 0.5)) legged++;
    let acc = 0, meshes = 0; r.g.traverse(o => { if (o.isMesh) { meshes++; if (o.material && o.material.color && o.material.color.hex === TEAM.paint[0]) acc++; } }); if (acc >= r.men.length * 2) banded++; else console.log('  (too little team colour: ' + id + ', ' + acc + ')'); kinds.add(Math.round(meshes / r.men.length)); if (meshes / r.men.length < 25) ok(false, id + ': a figure should be built from at least 25 parts (' + (meshes / r.men.length).toFixed(0) + ')'); }
  ok(legged === figs.length, `all ${figs.length} infantry and hero models have legs hinged at the hip, two per figure (four for the bear), for the walk`);
  ok(banded === figs.length, 'every figure wears its owner\'s colour in at least two places');
  ok(/case 'm4':/.test(models) && /case 'qbz':/.test(models) && /case 'ak':/.test(models) && /case 'famas':/.test(models) && /case 'mich':/.test(models) && /case 'kepi':/.test(models) && /case 'shemagh':/.test(models), 'each faction has its own rifle (M4, QBZ-95, AK, FAMAS) and headgear');
  const us = LM.buildModel({ kind: 'unit', type: 'v_ranger', team: 0 }), cn = LM.buildModel({ kind: 'unit', type: 'r_conscript', team: 0 }), is = LM.buildModel({ kind: 'unit', type: 's_guerrilla', team: 0 });
  const mats = (r) => { const m = new Set(); r.g.traverse(o => { if (o.isMesh) m.add(o.material); }); return m; }, mu = mats(us), mc = mats(cn), mi = mats(is);
  ok([...mu].some(m => !mc.has(m) && !mi.has(m)) && [...mc].some(m => !mu.has(m) && !mi.has(m)) && [...mi].some(m => !mu.has(m) && !mc.has(m)), 'the same squad type is dressed differently for the United States, China and ISIS');
  console.log(`models         : Apache + Longbow, AH-1Z, Quad Cannon, Shahed truck and drone | team marks on ${n - lacking.length} models | ${figs.length} detailed figures with walking legs`);
}

console.log(fail ? `BATCH13: ${fail} FAILURES of ${pass + fail}` : `BATCH13: all ${pass} checks passed`);
process.exit(fail ? 1 : 0);
