// Batch 14, drop A: the batch 13 play notes (AH-1Z, A-10 cannon, stealth F-22 and B-2, AC-130 range, Longbow range,
// ship decks, the Shahed Launcher's tilting container, Flanker noses, the B-2 and T-14 models), defense buildings
// modelled on the real systems, Russia built out (five units, Reactive Armour, troop carriers), the Kinzhal Strike and
// the Sky Shield, and two new units for each of the other factions.
import { readFileSync } from 'node:fs';
import { THREE } from './stub-three.mjs';
globalThis.THREE = THREE;
THREE.CanvasTexture = class { constructor(c) { this.image = c; this.repeat = { set() {} }; this.offset = { set() {} }; } }; THREE.RepeatWrapping = 1000; THREE.MeshBasicMaterial = THREE.MeshStandardMaterial;
THREE.Color.prototype.multiplyScalar = function () { return this; }; THREE.Color.prototype.getHex = function () { return typeof this.hex === 'number' ? this.hex : 0x808080; };
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => new Proxy({}, { get: (t, k) => (k === 'canvas' ? {} : () => ({ addColorStop() {} })), set: () => true }) }) };
import { Sim } from '../js/sim/simulationTick.js';
import { makeUnit, makeBldg, applyDamage, isTransport } from '../js/sim/entities.js';
import { slotsOf, canAttack } from '../js/sim/combat.js';
import { usePower, hasPower } from '../js/sim/powers.js';
import { PLAYER, ENEMY, angDiff } from '../js/sim/defs.js';
import { UNITS, BLDGS, WEAPONS, POWERS, FACTIONS, trainsOf } from '../js/sim/factionRegistry.js';
import { OPEN_BIG } from '../js/sim/map.js';
const MF = await import('../js/render/modelFactory.js'), LM = await import('../js/render/models.js');

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) pass++; else { fail++; console.log('  FAIL', msg); } };
const bare = (o = {}) => { const s = new Sim({ ai: false, empty: true, map: OPEN_BIG, ...o }); s.fog.exp[0].fill(1); s.fog.exp[1].fill(1); return s; };
const run = (s, n, f) => { for (let i = 0; i < n; i++) { s.step(); if (f) f(s.events); s.events.length = 0; } };
const hold = (u) => { u.order = { t: 'hold' }; u.cds = [1e9, 1e9, 1e9]; return u; };
const src = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const base = (s, f) => { s.teams[0].money = 99999; for (let i = 0; i < 6; i++) makeBldg(s, f + '_power', PLAYER, 40 + i * 8, 440); makeBldg(s, f + '_factory', PLAYER, 40, 400); makeBldg(s, FACTIONS[s.teams[0].faction].roles.tech, PLAYER, 40, 420); };

// ---------------------------------------------------------------- the fix list: rules
{
  ok(!UNITS.v_viper.jink && UNITS.v_viper.dodge === 0.4 && !/d\.jink/.test(src('js/sim/air.js')) && /v\.bank = /.test(src('js/render/view.js')), 'AH-1Z: no more random darting, the dodge stays; aircraft bank in and out of a turn smoothly');
  ok(UNITS.v_raptor.stealth === 'always' && UNITS.v_b2.stealth === 'always', 'F-22 and B-2 are stealth aircraft');
  ok(WEAPONS.ac_gun.range === 84 && WEAPONS.ac_105.range === 84 && UNITS.v_ac130.orbit === 68 && UNITS.v_ac130.orbit < WEAPONS.ac_105.range, 'AC-130: 84 m guns and a 68 m circle (were 64 and 44)');
  ok(WEAPONS.hellfire_lb.range === 72 && WEAPONS.hellfire.range === 50, 'Longbow Hellfire: 72 m (was 66)');
  const G = WEAPONS.gau8; ok(G.rounds === 10 && G.cd === 3 && G.dmg >= 100 && G.free, `A-10 cannon: ${G.rounds} bursts of ${G.dmg} in ${(G.rounds * G.cd / 20).toFixed(1)} s, then empty`);

  const s = bare({ factions: ['vanguard', 'redhammer'] }); base(s, 'v'); const af = makeBldg(s, 'v_airfield', PLAYER, 60, 400); s.nav.rebuild();
  s.issue({ t: 'train', id: af.id, type: 'v_a10' }); s.issue({ t: 'train', id: af.id, type: 'v_raptor' }); run(s, 20 * 30);
  const a10 = s.ents.find(e => e.type === 'v_a10'), f22 = s.ents.find(e => e.type === 'v_raptor');
  const tanks = [0, 1, 2].map(i => { const t = hold(makeUnit(s, 'r_tank', ENEMY, 500 + i * 7, 600, 0)); return t; }), hp = tanks[0].maxHp; tanks[0].hp = tanks[0].maxHp = 6000;   // the first is made tough enough to take the whole burst, so it can be counted
  let gun = 0, first = 0, last = 0; a10.order = { t: 'fattack', id: tanks[0].id, x: tanks[0].x, z: tanks[0].z, g: null };
  let gunDmg = 0; run(s, 20 * 80, (ev) => { for (const t of tanks) t.cds = [1e9, 1e9, 1e9]; const h0 = tanks[0].hp; for (const e of ev) if (e.sid === a10.id && e.w === 'gau8') { gun++; if (!first) first = s.tick; last = s.tick; } }); gunDmg = G.rounds * G.dmg * G.vs.heavy;
  ok(gun === G.rounds && last - first <= G.rounds * G.cd + 6 && gunDmg >= hp * 2 && tanks[0].hp < 6000 - gunDmg * 0.9, `one pass: ${gun} bursts inside ${((last - first) / 20).toFixed(1)} s, ${gunDmg} damage to armour: more than two tanks' worth (${hp} health each)`);
  ok(a10.as === 'parked' && a10.rounds === null && a10.ammo === UNITS.v_a10.ammo, 'back in its hangar the cannon is reloaded with the missiles');
  // stealth: hidden from the enemy until it fires or comes near a detector
  run(s, 5); const seen0 = s.fog.canSee(ENEMY, f22); f22.order = { t: 'move', x: 400, z: 500 }; s.issue({ t: 'move', ids: [f22.id], x: 400, z: 500 }); run(s, 200);
  const watcher = makeUnit(s, 'r_conscript', ENEMY, f22.x + 10, f22.z, 0); hold(watcher); run(s, 3);
  ok(f22.cloaked && !s.fog.canSee(ENEMY, f22), 'an F-22 in flight is cloaked: an enemy squad right under it cannot see it');
  const pat = makeBldg(s, 'r_gatling', ENEMY, Math.round(f22.x / 2) + 3, Math.round(f22.z / 2) + 3); for (let i = 0; i < 3; i++) makeBldg(s, 'r_power', ENEMY, 300 + i * 8, 100); s.nav.rebuild(); run(s, 6);
  ok(f22.detected && s.fog.canSee(ENEMY, f22) || f22.dead, 'a defense building (a detector) reveals it');
  console.log(`fix list       : A-10 ${gun} bursts then empty | F-22 and B-2 cloaked | AC-130 84 m / 68 m circle | Longbow 72 m`);
}

// ---------------------------------------------------------------- Shahed Launcher: fires from the top, off the back
{
  const once = () => { const s = bare({ factions: ['sandstorm', 'vanguard'] }), tr = makeUnit(s, 's_shahedtruck', PLAYER, 600, 600, 0), tgt = makeBldg(s, 'v_power', ENEMY, 262, 262); s.nav.rebuild();
    tr.order = { t: 'fattack', id: tgt.id, x: tgt.x, z: tgt.z, g: null }; const L = [], facing = []; run(s, 20 * 24, (ev) => { for (const e of ev) if (e.t === 'launch') { L.push(s.tick); facing.push(Math.abs(angDiff(Math.atan2(tgt.z - tr.z, tgt.x - tr.x), tr.facing))); } });
    return { L, facing, hash: s.hash(), hp: tgt.hp, max: tgt.maxHp }; };
  const a = once(), b = once(), M = UNITS.s_shahedtruck.mounts[0];
  ok(M.dir === Math.PI && M.arc <= 0.35, 'the launch rack is a fixed mount facing backward');
  ok(a.L.length === 3 && a.L[1] - a.L[0] === 30 && a.L[2] - a.L[1] === 30 && a.facing.every(f => f > Math.PI - 0.35), `it turns its tail to the target first (${a.facing.map(f => (f * 180 / Math.PI).toFixed(0)).join(', ')} degrees off the nose), then launches three drones 1.5 s apart`);
  ok(a.hp < a.max && a.hash === b.hash, 'the drones still reach the target; deterministic');
  const P = MF.paint('sandstorm', 0), st = MF.ASSEMBLY.shahedtruck(P);
  ok(st.bed && st.bed.position.x < -3 && st.roof.length === 2 && st.rack.length === 3 && !st.doors && st.rack.every(d => d.rotation.z < -0.4), 'model: the container is hinged at the tail, the roof opens in two leaves, the drones sit nose-up on their rails');
  ok(/v\.bed\.rotation\.z = v\.open \* 0\.42/.test(src('js/render/view.js')), 'the view tips the container up about 24 degrees while it fires');
}

// ---------------------------------------------------------------- models from the fix list
{
  const P = MF.paint('vanguard', 0), A = MF.ASSEMBLY, find = (r, n) => { const out = []; r.g.traverse(o => { if (o.isMesh && o.name === n) out.push(o); }); return out; };
  // ships: the deck follows the hull, so nothing shows through the bow under the gun
  for (const k of ['frigate', 'corvette', 'stereg', 'fremm']) { const r = A[k](P), hull = find(r, 'hull')[0].userData.profile, deck = find(r, 'deck')[0];
    const inside = (p) => { let c = false; for (let i = 0, j = hull.length - 1; i < hull.length; j = i++) { const a = hull[i], b = hull[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
    ok(deck.userData.profile && deck.userData.profile.every(q => inside([q[0] * 0.999, q[1] * 0.999])), `${k}: every corner of the deck lies inside the hull outline`); }
  // Flankers: a long sharp nose
  for (const k of ['su27', 'j11']) { const n = find(A[k](P), 'radome')[0].userData.nose; ok(n[0] / (2 * n[1]) > 3.5 && MF.FLANKER.droop > 0, `${k}: the nose cone is ${(n[0] / (2 * n[1])).toFixed(1)} times longer than it is wide, and droops`); }
  // B-2: the real outline
  const S = MF.SPIRIT, b2 = A.b2(P), le = Math.atan2(S.plan[1][0], S.plan[1][1]) * 180 / Math.PI;
  ok(Math.abs(le - S.sweep) < 0.6 && S.plan[1][1] * 2 === S.span && Math.max(...S.plan.map(q => q[0])) === S.length, `B-2: leading edge swept ${le.toFixed(1)} degrees, ${S.span} m span, ${S.length} m long`);
  ok(S.plan.length === 7 && S.plan[3][0] < S.plan[2][0] && S.plan[4][0] > S.plan[3][0] && S.plan[5][0] < S.plan[4][0] && S.plan[6][0] > S.plan[5][0], 'B-2: the trailing edge zig-zags: tip, notch, point, notch, tail (the double W)');
  ok(find(b2, 'wing').length === 6 && find(b2, 'centrewing').length === 1 && find(b2, 'enginehump').length === 2 && find(b2, 'intake').length === 2 && find(b2, 'exhaust').length === 2 && find(b2, 'windscreen').length === 2 && find(b2, 'fin').length === 0 && b2.gear, 'B-2: six wing panels round a centre body, two engine humps with intakes and exhausts, cockpit windows, no tail');
  const t14 = A.t14(MF.paint('ursa', 0));
  ok(find(t14, 'roadwheel').length === 14 && find(t14, 'crewhatch').length === 3 && find(t14, 'turretroof').length === 1 && find(t14, 'thermalsleeve').length === 1 && find(t14, 'slat').length === 18 && t14.turretX < -0.6, 'T-14: seven road wheels a side, the crew of three in the hull front, a small unmanned turret set back, bar armour round the engine');
  console.log('models         : decks inside hulls on 4 warships | pointed Flanker noses | B-2 from its real outline | T-14 Armata');
}

// ---------------------------------------------------------------- defense buildings look like the real systems
{
  const names = { v_patriot: 'patriot', r_gatling: 'gatling', s_stinger: 'stinger', u_pantsir: 'pantsir', e_iris: 'irist' }, n = {};
  for (const [id, m] of Object.entries(names)) { const r = LM.buildModel({ kind: 'bldg', type: id, team: 0 }); let k = 0; r.g.traverse(o => { if (o.isMesh) k++; }); n[id] = k; ok(BLDGS[id].model === m && r.turret && k >= 30, `${BLDGS[id].name}: its own model (${k} parts) with a part that turns to face the target`); }
  ok(new Set(Object.values(names)).size === 5 && /Pantsir-S1/.test(src('js/render/models.js')) && /IRIS-T SLM/.test(src('js/render/models.js')) && /LD-2000/.test(src('js/render/models.js')) && /M903/.test(src('js/render/models.js')), 'five different models: Patriot M903, LD-2000, a Stinger pit, Pantsir-S1, IRIS-T SLM (Russia and Europe no longer borrow China\'s and the US one)');
  ok(BLDGS.u_pantsir.cost === 950 && BLDGS.e_iris.cost === 1050 && BLDGS.v_patriot.weapon === 'patriot', 'prices and weapons are unchanged');
}

// ---------------------------------------------------------------- Russia built out
{
  const T = { faction: 'ursa', general: null };
  ok(trainsOf(T, 'u_barracks').includes('u_spetsnaz') && ['u_btr', 'u_msta'].every(k => trainsOf(T, 'u_factory').includes(k)) && ['u_su25', 'u_mi8'].every(k => trainsOf(T, 'u_airfield').includes(k)), 'Spetsnaz at the Barracks, BTR-82A and Msta-S at the War Factory, Su-25 and Mi-8 at the Airfield');
  ok(FACTIONS.ursa.roles.scout === 'u_btr' && UNITS.u_btr.speed > UNITS.u_bmp.speed, 'the BTR-82A is Russia\'s scout now');
  const s = bare({ factions: ['ursa', 'vanguard'] });
  // carriers
  const btr = makeUnit(s, 'u_btr', PLAYER, 300, 300, 0), a = makeUnit(s, 'u_rifle', PLAYER, 306, 300, 0), b = makeUnit(s, 'u_rpg', PLAYER, 308, 304, 0), tank = makeUnit(s, 'u_tank', PLAYER, 312, 296, 0);
  s.issue({ t: 'garrison', ids: [a.id, b.id, tank.id], target: btr.id }); run(s, 100);
  ok(isTransport(btr) && btr.garrison.length === 1 && [a, b].filter(u => u.inB).length === 1 && !tank.inB, 'BTR-82A: one squad rides inside; a second squad and a tank do not fit');
  const rider = a.inB ? a : b; s.issue({ t: 'move', ids: [btr.id], x: 380, z: 300 }); run(s, 160); s.issue({ t: 'evacuate', id: btr.id }); run(s, 10);
  ok(!rider.inB && dist(rider, btr) < 8 && btr.x > 370, 'it carries the squad 80 m and sets it down beside itself');
  const mi = makeUnit(s, 'u_mi8', PLAYER, 300, 340, 0), q = [0, 1, 2].map(i => makeUnit(s, 'u_rifle', PLAYER, 303 + i * 2, 342 + i * 2, 0)); s.issue({ t: 'garrison', ids: q.map(u => u.id), target: mi.id }); run(s, 140);
  ok(mi.garrison.length === 2, 'Mi-8: two squads aboard, the third left behind');
  const aboard = q.filter(u => u.inB); mi.hp = 1; applyDamage(s, mi, 500, 'stinger', 0, 0, { team: 1 }); run(s, 3);
  ok(mi.dead && aboard.every(u => u.dead), 'shot down, it takes its passengers with it');
  ok(btr.nc === UNITS.u_btr.cls + 2 && makeUnit(s, 'u_bmp', PLAYER, 200, 200, 0).nc === 3 && makeUnit(s, 'u_tank', PLAYER, 210, 200, 0).nc === 1, 'BTR-82A and BMP-3 swim; a T-90 does not');
  // reactive armour
  const t90 = makeUnit(s, 'u_tank', PLAYER, 500, 500, 0), abr = makeUnit(s, 'v_tank', ENEMY, 700, 700, 0), src0 = { team: 1 }; let h = t90.hp;
  const hit = (w, t = t90) => { const h0 = t.hp; applyDamage(s, t, 100, w, t.x + 10, t.z, src0); return h0 - t.hp; };
  const r1 = hit('rpg'), r2 = hit('rpg'), sh = hit('cannon'); run(s, UNITS.u_tank.era + 2); const r3 = hit('rpg'), plain = hit('rpg', abr);
  ok(Math.abs(r1 - r2 / 2) < 0.5 && r2 > 0 && Math.abs(r3 - r1) < 0.5 && sh > 0, `Reactive Armour: the first rocket does half (${r1.toFixed(0)} against ${r2.toFixed(0)}), the next is unprotected, and 15 s later it works again`);
  ok(UNITS.u_tank.era && UNITS.u_armata.era && UNITS.u_tos.era && !UNITS.v_tank.era && !UNITS.u_btr.era, 'Russian tanks have it; nobody else');
  // the other three
  const sp = makeUnit(s, 'u_spetsnaz', PLAYER, 600, 300, 0); run(s, 40);
  ok(sp.cloaked && UNITS.u_spetsnaz.detector > 0 && JSON.stringify(slotsOf(sp)) === JSON.stringify(['spetsnaz_rifle', 'demo_charge']) && !WEAPONS.demo_charge.vs.heavy && WEAPONS.demo_charge.vs.bldg === 1, 'Spetsnaz: cloaked when still, spot cloaked units, rifles plus a demolition charge that only works on buildings');
  const bld = makeBldg(s, 'v_power', ENEMY, 310, 150); s.nav.rebuild(); sp.x = bld.x - 6; sp.z = bld.z; sp.order = { t: 'fattack', id: bld.id, x: bld.x, z: bld.z, g: null }; const b0 = bld.hp; run(s, 60);
  ok(b0 - bld.hp >= 400, `a charge against a wall does ${Math.round(b0 - bld.hp)} damage`);
  ok(WEAPONS.msta152.range > 80 && WEAPONS.msta152.kind === 'lob' && WEAPONS.msta152.minRange > 0, `Msta-S: ${WEAPONS.msta152.range} m, lobbed, cannot fire at what is right beside it`);
  const su = UNITS.u_su25; ok(su.based && su.ammo === 16 && WEAPONS.s8_rockets.burst === 4 && WEAPONS.gsh30.rounds > 0 && !WEAPONS.s8_rockets.vs.air && !WEAPONS.gsh30.vs.air, 'Su-25: four salvos of four rockets and a short cannon burst a sortie, ground targets only');
  console.log('Russia         : Spetsnaz, BTR-82A (carries 1), Msta-S, Su-25, Mi-8 (carries 2) | Reactive Armour | BTR and BMP-3 swim');
}

// ---------------------------------------------------------------- superweapons: Kinzhal Strike and Sky Shield
{
  ok(FACTIONS.ursa.roles.super === 'u_kinzhal' && FACTIONS.aegis.roles.super === 'e_shield' && !BLDGS.u_iskander && !BLDGS.e_lance && BLDGS.u_kinzhal.model === 'kinzhal' && BLDGS.e_shield.model === 'skyshield', 'Russia builds the Kinzhal Shelter and Europe the Sky Shield Battery, each with its own model');
  const supers = Object.values(POWERS).filter(p => p.super); ok(supers.length === 5 && new Set(supers.map(p => p.as || p.name)).size === 5 && !POWERS.kinzhal.as && !POWERS.skyshield.as, 'five superweapons, no two alike: neither new one reuses another\'s strike');
  const once = (seed) => { const s = bare({ factions: ['ursa', 'aegis'], seed }); makeBldg(s, 'u_cc', PLAYER, 20, 220); for (let i = 0; i < 4; i++) makeBldg(s, 'u_power', PLAYER, 20 + i * 8, 20); const k = makeBldg(s, 'u_kinzhal', PLAYER, 60, 60); k.superReady = 0;
    const B = [['e_factory', 250, 250], ['e_barracks', 262, 250], ['e_power', 250, 262], ['e_supply', 262, 262]].map(([t, x, z]) => makeBldg(s, t, ENEMY, x, z)), tank = hold(makeUnit(s, 'e_tank', ENEMY, 512, 512, 0)); s.nav.rebuild();
    const hp0 = B.map(b => b.hp), used = usePower(s, PLAYER, 'kinzhal', 512, 512), t0 = s.tick, hits = []; run(s, 100, (ev) => { for (const e of ev) if (e.t === 'kinzhal') hits.push(s.tick - t0); });
    return { used, hits, B, hp0, tank, hash: s.hash(), k, s }; };
  const K = once(1), K2 = once(1), P = POWERS.kinzhal;
  ok(K.used && K.hits.length === P.n && K.hits[0] <= P.flight + 1 && K.hits[2] <= P.flight + 10 && P.flight === 60 && P.flight < POWERS.nuke.flight && P.flight < 70, `Kinzhal Strike: three missiles land ${(K.hits[0] / 20).toFixed(1)} to ${(K.hits[2] / 20).toFixed(1)} s after launch (the nuclear missile takes ${POWERS.nuke.flight / 20} s)`);
  const dmg = K.B.map((b, i) => K.hp0[i] - Math.max(0, b.hp)), byCost = K.B.map((b, i) => [BLDGS[b.type].cost, dmg[i]]).sort((a, b) => b[0] - a[0]);
  ok(byCost.slice(0, 3).every(q => q[1] >= 700) && byCost[3][1] === 0, 'they pick the three most valuable buildings in the zone; the fourth is untouched');
  const fac = K.B[0]; ok(!fac.dead && fac.hp <= fac.maxHp * 0.06 && K.tank.hp > K.tank.maxHp * 0.9, `a War Factory is left with ${Math.round(fac.hp)} of ${fac.maxHp} health; a tank standing among them is barely scratched`);
  ok(K.hash === K2.hash && K.k.superReady > K.s.tick, 'deterministic; the shelter starts its countdown again');

  // Sky Shield
  const shield = (seed) => { const s = bare({ factions: ['aegis', 'sandstorm'], seed }); makeBldg(s, 'e_cc', PLAYER, 20, 220); for (let i = 0; i < 4; i++) makeBldg(s, 'e_power', PLAYER, 20 + i * 8, 20); const sh = makeBldg(s, 'e_shield', PLAYER, 60, 60); sh.superReady = 0;
    const fac = makeBldg(s, 'e_factory', PLAYER, 250, 250), sc = makeBldg(s, 's_scud', ENEMY, 400, 400); sc.superReady = 0; s.nav.rebuild(); return { s, fac, sh, sc }; };
  let stopped = 0, landed = 0; for (const seed of [1, 2, 3, 4]) { const { s, fac } = shield(seed); usePower(s, PLAYER, 'skyshield', fac.x, fac.z); usePower(s, ENEMY, 'scud', fac.x, fac.z); run(s, 260, (ev) => { for (const e of ev) { if (e.t === 'intercept' && e.big) stopped++; if (e.t === 'scudhit') landed++; } }); }
  const S = POWERS.skyshield; ok(stopped + landed === 4 * POWERS.scud.n && stopped / (stopped + landed) > S.stop - 0.2 && stopped / (stopped + landed) < S.stop + 0.2, `Sky Shield against four Scud Storms: ${stopped} of ${stopped + landed} warheads stopped (${Math.round(S.stop * 100)}% each)`);
  { const { s, fac } = shield(7); usePower(s, ENEMY, 'scud', fac.x, fac.z); let l2 = 0; run(s, 260, (ev) => { for (const e of ev) if (e.t === 'scudhit') l2++; }); ok(l2 === POWERS.scud.n, 'with no shield up, all nine land'); }
  const { s, fac: fc } = shield(5); ok(usePower(s, PLAYER, 'skyshield', fc.x, fc.z) && s.strikes.filter(p => p.kind === 'shield').length === 1 && s.lastSuper[PLAYER] < 0, 'it is aimed like any power and stands as a zone; raising it sounds no launch warning');
  const drones = [0, 1, 2].map(i => { const d = makeUnit(s, 's_fpv', ENEMY, fc.x + 100 + i * 6, fc.z, 0); s.issue({ t: 'move', team: ENEMY, ids: [d.id], x: fc.x, z: fc.z }); return d; });
  const mortar = makeUnit(s, 's_mortar', ENEMY, fc.x + 50, fc.z + 20, 0), tank = makeUnit(s, 's_t55', ENEMY, fc.x + 30, fc.z - 14, 0); for (const u of [mortar, tank]) { u.hp = u.maxHp = 1e6; u.order = { t: 'fattack', id: fc.id, x: fc.x, z: fc.z, g: null }; }
  const friend = makeUnit(s, 'e_pzh', PLAYER, fc.x - 30, fc.z, 0), far = hold(makeUnit(s, 's_technical', ENEMY, fc.x - 30 + 60, fc.z + 30, 0)); far.hp = far.maxHp = 1e6; friend.order = { t: 'fattack', id: far.id, x: far.x, z: far.z, g: null };
  let small = 0, shells = 0, h0 = fc.hp, f0 = far.hp; run(s, 400, (ev) => { for (const e of ev) { if (e.t === 'intercept' && !e.big) small++; if (e.t === 'impact' && e.w === 'gun100') shells++; } });
  ok(drones.every(d => d.dead) && small >= 4, `drones flying in are shot down (${drones.filter(d => d.dead).length} of 3) and mortar bombs are stopped in the air (${small} interceptions)`);
  ok(shells > 0 && h0 - fc.hp > 0, 'a tank\'s flat-firing gun is not stopped: the shield is no wall');
  ok(f0 - far.hp > 0, 'its owner\'s own artillery fires out of the zone unhindered');
  run(s, S.secs * 20 - 400 + 5); ok(!s.strikes.some(p => p.kind === 'shield'), `after ${S.secs} s it is gone`);
  // the AI raises it when it hears the other side's superweapon
  const m = new Sim({ ai: 'both', difficulty: ['hard', 'hard'], factions: ['aegis', 'ursa'], map: OPEN_BIG, seed: 2 }); m.fog.exp[0].fill(1);
  const cc = m.ents.find(e => e.kind === 'bldg' && e.team === 0), bat = makeBldg(m, 'e_shield', PLAYER, cc.cx + 14, cc.cz + 14); bat.done = true; bat.superReady = 0; m.teams[0].money = 20000; m.nav.rebuild(); run(m, 40);
  m.lastSuper[1] = m.tick; let raised = null; run(m, 60, (ev) => { for (const e of ev) if (e.t === 'power' && e.id === 'skyshield' && e.team === 0) raised = e; });
  ok(raised && Math.hypot(raised.x - m.ais[0].homeW.x, raised.z - m.ais[0].homeW.z) < 5, 'the Europe AI, hearing the enemy\'s launch klaxon, puts the shield over its own base within 3 s');
  console.log(`superweapons   : Kinzhal 3 missiles in ${(K.hits[2] / 20).toFixed(1)} s on the costliest buildings | Sky Shield stopped ${stopped} of ${stopped + landed} Scud warheads, drones and mortar bombs`);
}

// ---------------------------------------------------------------- two new units for each other faction
{
  const at = (f, g, b, u) => trainsOf({ faction: f, general: g }, b).includes(u);
  ok(at('vanguard', null, 'v_factory', 'v_himars') && at('vanguard', 'marine', 'v_factory', 'v_bradley') && at('redhammer', null, 'r_factory', 'r_pgz') && at('redhammer', 'mass', 'r_factory', 'r_zbd') && at('sandstorm', 'wmd', 's_factory', 's_t55') && at('sandstorm', null, 's_barracks', 's_mortar') && at('aegis', null, 'e_factory', 'e_boxer') && at('aegis', 'panzer', 'e_airfield', 'e_nh90'), 'every general of each faction can build its two new units');
  const W = WEAPONS; ok(W.gmlrs.range > 90 && W.gmlrs.burst === 6 && W.gmlrs.cd >= 280 && W.gmlrs.windup > 0, `HIMARS: six rockets to ${W.gmlrs.range} m, then ${(W.gmlrs.cd / 20).toFixed(0)} s to reload; it must stop to fire`);
  ok(UNITS.v_bradley.transport.squads === 1 && UNITS.v_bradley.weapon2 === 'tow2' && UNITS.r_zbd.transport.squads === 1 && UNITS.r_zbd.swims && UNITS.e_boxer.transport.squads === 1 && UNITS.e_nh90.transport.squads === 2 && UNITS.e_nh90.heli, 'Bradley, ZBD-04A and Boxer carry one squad each; the NH90 carries two; the ZBD-04A swims');
  ok(W.pgz35.vs.air > 1 && UNITS.r_pgz.detector > 0 && !Object.values(UNITS).some(d => d.faction === 'redhammer' && d !== UNITS.r_pgz && !d.air && !d.ship && !d.infantry && d.weapon && (WEAPONS[d.weapon].vs.air || 0) >= 1), 'PGZ-09: China\'s first mobile anti-aircraft gun');
  ok(UNITS.s_t55.tank && UNITS.s_t55.armor === 'heavy' && UNITS.s_t55.cost < UNITS.v_tank.cost && UNITS.s_t55.cost < UNITS.u_tank.cost, `Captured T-55: a real tank for ISIS, the cheapest of all ($${UNITS.s_t55.cost})`);
  ok(W.mortar82.kind === 'lob' && W.mortar82.minRange > 0 && W.mortar82.range > W.rifle.range * 1.5 && UNITS.s_mortar.infantry, 'Mortar Team: infantry that lob shells well beyond rifle range');
  const s = bare({ factions: ['vanguard', 'redhammer'] }), hm = makeUnit(s, 'v_himars', PLAYER, 400, 400, 0), tg = makeBldg(s, 'r_power', ENEMY, 240, 200); s.nav.rebuild(); const d0 = dist(hm, tg), hp0 = tg.hp;
  hm.order = { t: 'fattack', id: tg.id, x: tg.x, z: tg.z, g: null }; let rk = 0; run(s, 20 * 12, (ev) => { for (const e of ev) if (e.sid === hm.id && e.t === 'fire') rk++; });
  ok(d0 > 75 && rk === 6 && hp0 - tg.hp > 250 && hm.x === 400, `HIMARS from ${d0.toFixed(0)} m without moving: ${rk} rockets, ${Math.round(hp0 - tg.hp)} damage to a building`);
  const A = MF.ASSEMBLY, keys = ['btr82', 'boxer', 'bradley', 'msta', 'himars', 't55', 'pgz09', 'zbd04', 'su25', 'mi8', 'nh90'];
  ok(keys.every(k => typeof A[k] === 'function') && ['u_spetsnaz', 's_mortar'].every(k => { const r = LM.buildModel({ kind: 'unit', type: k, team: 0 }); return r.men && r.legs.length === r.men.length * 2; }), 'every new unit has its own model: eleven vehicles and aircraft, two infantry teams');
  const cnt = (r, n) => { let k = 0; r.g.traverse(o => { if (o.isMesh && o.name === n) k++; }); return k; }, PP = MF.paint('ursa', 0);
  ok(cnt(A.btr82(PP), 'wheel') === 8 && cnt(A.boxer(PP), 'wheel') === 8 && cnt(A.btr82(PP), 'waterjet') === 1 && cnt(A.bradley(PP), 'towlauncher') === 1 && cnt(A.bradley(PP), 'roadwheel') === 12, 'BTR-82A and Boxer are 8x8s (the BTR with a water jet); the Bradley has six road wheels a side and its TOW box');
  ok(cnt(A.himars(PP), 'rocket') === MF.ARMOR14.himars.rockets && cnt(A.himars(PP), 'wheel') === 6 && A.himars(PP).arm && cnt(A.msta(PP), 'muzzlebrake') === 2 && cnt(A.t55(PP), 'era') === 0 && cnt(A.t55(PP), 'barrel') === 1, 'HIMARS: a three-axle truck with one six-rocket pod on a lifting launcher; Msta-S: double-baffle muzzle brake; T-55: no reactive armour');
  const mi = A.mi8(PP), nh = A.nh90(PP), su = A.su25(PP);
  ok(cnt(mi, 'blade') === MF.MI8.blades && cnt(mi, 'rocketpod') === 2 && cnt(nh, 'blade') === MF.NH90.blades && cnt(nh, 'sponson') === 2 && cnt(su, 'pylon') === MF.FROGFOOT.pylons && cnt(su, 'tippod') === 2 && cnt(su, 'fin') === 1 && su.stores.length === UNITS.u_su25.ammo && su.gear, 'Mi-8: five blades and rocket outriggers; NH90: four blades and sponsons; Su-25: ten pylons, wingtip pods, one fin');
  console.log('new units      : HIMARS, Bradley | PGZ-09, ZBD-04A | T-55, Mortar Team | Boxer, NH90: all with their own models');
}

// ---------------------------------------------------------------- the view and HUD know the new things (source guards)
{
  const view = src('js/render/view.js'), hud = src('js/ui/uiHUD.js');
  ok(/case 'kinzhal':/.test(view) && /case 'intercept':/.test(view) && /case 'era':/.test(view) && /p\.kind === 'shield'/.test(view) && /this\.takeoffs/.test(view) && /v\.jet\.visible/.test(view), 'the view draws the Kinzhal hit, the MiG-31 leaving its shelter, interceptions, the shield\'s edge and reactive-armour flashes');
  ok(/'Unload'/.test(hud) && /Aboard the /.test(hud) && /' raised'/.test(hud), 'the HUD words carriers and helicopters as carriers (not Landing Craft) and says the Sky Shield is raised');
}

// ================================================================ drop B
const MAP = await import('../js/sim/map.js');
const AI = await import('../js/sim/aiController.js');
const { ReplayRecorder, ReplayPlayer } = await import('../js/sim/replayManager.js');
const keepUp = (q) => { for (const e of q.ents) if (e.kind === 'bldg' && e.team < 2 && !e.dead && e.done) e.hp = e.maxHp; };   // in the long AI matches below nobody's buildings fall, so each runs its full length

// ---------------------------------------------------------------- towns and capturable sites
{
  const t = MAP.town(100, 200, 3, 2, [0, 1, 2]);
  ok(t.civs.length === 6 && t.civs[1][0] - t.civs[0][0] === 9 && t.civs[3][1] - t.civs[0][1] === 9 && t.roads.length === 2 && t.civs[4][2] === 1, 'a town block: buildings on a 9-cell grid (6 m streets) with a main street each way');
  for (const m of MAP.MAPS) { const r = MAP.validateMap(m.spec), civs = r.map.civs, near = civs.filter(c => civs.some(o => o !== c && Math.abs(o[0] - c[0]) <= 10 && Math.abs(o[1] - c[1]) <= 10)).length;
    ok(r.ok && near === civs.length && civs.length >= 16, `${m.name}: valid, and all ${civs.length} civilian buildings stand in towns (each has a neighbour across a street)`);
    const st = r.map.sites; ok(st.length === 4 && st.every(q => st.some(o => o !== q && o[2] === q[2] && o[0] === MAP_N(r) - q[0] - 4 && o[1] === MAP_N(r) - q[1] - 4)), `${m.name}: four capturable sites, each with its mirror twin of the same kind`); }
  const s = new Sim({ ai: false, map: MAP.CANYON_BIG, factions: ['vanguard', 'redhammer'] }); s.fog.exp[0].fill(1); s.fog.exp[1].fill(1);
  const sites = s.ents.filter(e => BLDGS[e.type] && BLDGS[e.type].site), gun = sites.find(e => e.type === 'site_gun'), rep = sites.find(e => e.type === 'site_repair');
  ok(sites.length === 4 && sites.every(e => e.team === 2 && BLDGS[e.type].indestructible && BLDGS[e.type].capturable), 'sites start neutral, can be captured and cannot be destroyed');
  const foe = hold(makeUnit(s, 'r_tank', ENEMY, gun.x + 60, gun.z + 10, 0)); makeUnit(s, 'v_drone', PLAYER, foe.x - 12, foe.z, 0); let shots = 0; run(s, 200, (ev) => { foe.cds = [1e9, 1e9, 1e9]; for (const e of ev) if (e.sid === gun.id) shots++; });
  ok(shots === 0, 'an Artillery Platform nobody holds does not fire');
  const sq = makeUnit(s, 'v_ranger', PLAYER, gun.x + 8, gun.z, 0); s.issue({ t: 'capture', ids: [sq.id], target: gun.id }); run(s, 160); const h0 = foe.hp; run(s, 400, (ev) => { foe.cds = [1e9, 1e9, 1e9]; for (const e of ev) if (e.sid === gun.id) shots++; });
  ok(gun.team === PLAYER && shots >= 2 && foe.hp < h0, `captured by infantry, it fires for its new owner (${shots} shells at a tank 60 m away)`);
  const sq2 = makeUnit(s, 'v_ranger', PLAYER, rep.x + 8, rep.z, 0); s.issue({ t: 'capture', ids: [sq2.id], target: rep.id }); run(s, 160); const tk = hold(makeUnit(s, 'v_tank', PLAYER, rep.x + 10, rep.z + 6, 0)), far = hold(makeUnit(s, 'v_tank', PLAYER, rep.x + 60, rep.z + 60, 0)), et = hold(makeUnit(s, 'r_tank', ENEMY, rep.x - 12, rep.z + 4, 0)); tk.hp = far.hp = et.hp = 100; run(s, 200);
  ok(rep.team === PLAYER && tk.hp > 250 && far.hp === 100 && et.hp <= 100, 'Repair Depot: your vehicles within its radius are repaired; ones out of reach, and the enemy\'s, are not');
  const q2 = new Sim({ ai: false, map: MAP.OPEN_BIG, factions: ['vanguard', 'redhammer'] }); q2.fog.exp[0].fill(1); const hos = q2.ents.find(e => e.type === 'site_hospital'), rad = q2.ents.find(e => e.type === 'site_radar');
  const cap = (b) => { const u = makeUnit(q2, 'v_ranger', PLAYER, b.x + 8, b.z, 0); q2.issue({ t: 'capture', ids: [u.id], target: b.id }); return u; }; cap(hos); const before = q2.fog.visAt(PLAYER, rad.x + 70, rad.z); cap(rad); run(q2, 170);
  const hurt = makeUnit(q2, 'v_ranger', PLAYER, hos.x + 10, hos.z + 4, 0), tank2 = makeUnit(q2, 'v_tank', PLAYER, hos.x + 12, hos.z - 4, 0); hurt.hp = 60; tank2.hp = 60; run(q2, 200);
  ok(hos.team === PLAYER && hurt.hp >= 170 && tank2.hp === 60, 'Field Hospital: infantry nearby heal; vehicles do not');
  ok(rad.team === PLAYER && !before && q2.fog.visAt(PLAYER, rad.x + 70, rad.z) && !q2.fog.visAt(PLAYER, rad.x + 110, rad.z), 'Radar Tower: its owner sees 90 m round it');
  const thief = makeUnit(q2, 'r_conscript', ENEMY, rad.x + 8, rad.z + 2, 0); q2.issue({ t: 'capture', team: ENEMY, ids: [thief.id], target: rad.id }); for (const e of q2.ents) if (e.team === PLAYER && e.kind === 'unit') hold(e); run(q2, 170);
  ok(rad.team === ENEMY && rad.hp > 1e8, 'the enemy can take a site from you the same way; it changes hands, it is never destroyed');
  const TOOLS = (await importTools()).TOOLS; ok(['town', 'site_repair', 'site_hospital', 'site_radar', 'site_gun'].every(k => TOOLS.some(x => x[0] === k)), 'the map builder has a town stamp and the four sites');
  console.log('towns and sites: every map\'s buildings stand in towns | Repair Depot, Field Hospital, Radar Tower, Artillery Platform work for whoever holds them');
}
function MAP_N(r) { return r.map.N; }
async function importTools() { globalThis.localStorage = globalThis.localStorage || { getItem: () => null, setItem() {}, removeItem() {} }; return import('../js/ui/mapBuilder.js'); }

// ---------------------------------------------------------------- command buildings and the stages of a match
{
  for (const f of Object.keys(FACTIONS)) { const R = FACTIONS[f].roles, gated = Object.keys(UNITS).filter(k => UNITS[k].needs === R.tech);
    ok(R.tech && BLDGS[R.tech].role === 'tech' && BLDGS[R.tech].needs === R.factory && BLDGS[R.super].needs === R.tech && FACTIONS[f].build.includes(R.tech) && gated.length >= 1, `${FACTIONS[f].name}: ${BLDGS[R.tech].name} (after the War Factory) is needed for the superweapon and for ${gated.map(k => UNITS[k].name).join(', ')}`); }
  ok(BLDGS.v_stratfield.needs === 'v_toc', 'the Strategic Airfield needs the Tactical Operations Center');
  const s = bare({ factions: ['ursa', 'vanguard'] }); base(s, 'u'); const fac = s.ents.find(e => e.type === 'u_factory'); let msg = ''; const hq = s.ents.find(e => e.type === 'u_hq'); hq.dead = true; hq.hp = 0; s.ents.splice(s.ents.indexOf(hq), 1); s.byId.delete(hq.id);
  s.issue({ t: 'train', id: fac.id, type: 'u_msta' }); run(s, 2, (ev) => { for (const e of ev) if (e.t === 'msg') msg = e.text; });
  ok(fac.queue.length === 0 && /Requires Field Headquarters/.test(msg), 'without it a Msta-S cannot be ordered: "Requires Field Headquarters"');
  s.issue({ t: 'train', id: fac.id, type: 'u_tank' }); run(s, 2); ok(fac.queue.length === 1, 'ordinary units need nothing new');
  const m5 = LM.buildModel({ kind: 'bldg', type: 'v_toc', team: 0 }), m6 = LM.buildModel({ kind: 'bldg', type: 's_council', team: 0 }); let a5 = 0, a6 = 0; m5.g.traverse(o => { if (o.isMesh) a5++; }); m6.g.traverse(o => { if (o.isMesh) a6++; });
  ok(a5 > 12 && a6 > 12 && a5 !== a6 && /Tactical Operations Center: two joined tents/.test(src('js/render/models.js')), 'each faction\'s command building has its own look');
}

// ---------------------------------------------------------------- the AI: limits by level, doctrines, variety
{
  const D = AI.DIFFICULTY;
  ok(D.easy.doctrines === 0 && D.easy.learn === 0 && !D.easy.notebook && !D.easy.counters && D.medium.doctrines === 3 && D.medium.learn === 1 && !D.medium.notebook && !D.medium.flank && D.hard.doctrines === 5 && D.hard.learn === 2 && D.hard.notebook && D.hard.flank && D.hard.focus, 'three fixed sets of limits: Easy (one simple plan, no learning), Medium (three plans, report card), Hard (everything)');
  ok(Object.keys(D).every(k => typeof D[k].note === 'string' && D[k].note.length > 20) && !Object.keys(D.hard).some(k => /money|income|sight|cheat|bonus|handicap/i.test(k)), 'each level describes itself in the lobby, and none has a setting that gives money or sight');
  const combat = Object.keys(UNITS).filter(k => { const d = UNITS[k]; return d.weapon && !d.harvester && !d.builder && !d.hero && !d.ship; });
  ok(combat.every(k => AI.ROLE[k]) && new Set(Object.values(AI.ROLE)).size >= 9 && AI.ROLE.u_msta === 'arty' && AI.ROLE.v_bradley === 'carrier' && AI.ROLE.r_pgz === 'aa' && AI.ROLE.u_mi8 === 'lift' && AI.ROLE.u_tank === 'armor', `every fighting unit has a role (${new Set(Object.values(AI.ROLE)).size} roles)`);
  ok(Object.values(AI.DOCTRINES).every(d => Math.abs(Object.values(d.mix).reduce((a, b) => a + b, 0) - 1) < 1e-9) && AI.DOCTRINE_ORDER.length === 5, 'five doctrines, each a share of the army by role that adds up to 1');
  const mk = (lv, seed, f = ['ursa', 'aegis'], extra = {}) => new Sim({ ai: 'both', difficulty: [lv, lv], factions: f, map: MAP.OPEN_BIG, seed, ...extra });
  ok(mk('easy', 1).ais[0].mix === null && mk('easy', 1).ais[0].doctrineId === null, 'Easy has no doctrine');
  const med = new Set(), hard = new Set(); for (let sd = 1; sd <= 12; sd++) { med.add(mk('medium', sd).ais[0].doctrineId); hard.add(mk('hard', sd).ais[0].doctrineId); }
  ok([...med].every(d => AI.DOCTRINE_ORDER.slice(0, 3).includes(d)) && med.size >= 2 && hard.size >= 4, `over twelve matches Medium used ${med.size} of its three plans and Hard ${hard.size} of its five`);
  ok(mk('hard', 5).ais[0].doctrineId === mk('hard', 5).ais[0].doctrineId && Math.abs(Object.values(mk('hard', 5).ais[1].mix).reduce((a, b) => a + b, 0) - 1) < 1e-9, 'the same match always gets the same plan; the mix is rescaled to the roles the roster has');
  // fairness between the two start positions (found by the first drop B sweep: the second player won 60% of matches)
  { const W = (await import('../js/sim/defs.js')); let same = true, n = 0;
    for (const m of MAP.MAPS.filter(m => !m.spec.naval).concat([{ spec: MAP.CANYON_BIG }, { spec: MAP.ARCTIC_BIG }, { spec: MAP.URBAN_BIG }, { spec: MAP.FOREST_BIG }, { spec: MAP.OPEN_BIG }])) { const q = new Sim({ ai: 'both', difficulty: ['hard', 'hard'], factions: ['ursa', 'ursa'], map: m.spec, seed: 1 }), [p0, p1] = q.ais.map(x => x.pois); n++;
      if (p0.length !== p1.length || !p0.every((p, i) => p.k === p1[i].k && Math.abs(p.x + p1[i].x - W.WORLD) < 0.01 && Math.abs(p.z + p1[i].z - W.WORLD) < 0.01)) same = false; }
    ok(same && n >= 5, `the two AIs read the map as mirror images: the same points of interest in the same order from each end (${n} maps), so a tie between two equally distant sites is broken the same way for both`);
    const cnt = [{}, {}]; for (let sd = 1; sd <= 40; sd++) { const q = mk('hard', sd, ['ursa', 'ursa']); for (const t of [0, 1]) cnt[t][q.ais[t].doctrineId] = (cnt[t][q.ais[t].doctrineId] || 0) + 1; }
    ok(cnt.every(c => Object.keys(c).length === 5 && Math.max(...Object.values(c)) <= 16), `over seeds 1 to 40 each side draws all five plans, none more than 16 times (first player ${Object.entries(cnt[0]).map(([k, v]) => k + ' ' + v).join(', ')})`); }
  // variety: across a handful of Hard matches each faction's AI fields nearly everything it can build
  const rows = [];
  for (const [f, foe] of [['vanguard', 'ursa'], ['redhammer', 'aegis'], ['sandstorm', 'vanguard'], ['ursa', 'redhammer'], ['aegis', 'sandstorm']]) {
    const built = new Set(), plans = new Set(); let can = null, techs = 0, defs = 0, boarded = 0, sited = 0, n = 0;
    for (const sd of [1, 2, 3, 4, 5, 6]) { const q = mk('hard', sd, [f, foe]), a = q.ais[0]; can = can || a.combat.filter(k => !UNITS[k].promo); plans.add(a.doctrineId); let def4 = false;
      for (let t = 0; t < 20 * 60 * 16; t++) { if (t % 20 === 0) keepUp(q); q.step(); for (const e of q.events) if (e.t === 'spawn' && e.team === 0) built.add(e.type); q.events.length = 0; if (t === 20 * 60 * 5) def4 = q.ents.some(e => e.team === 0 && e.kind === 'bldg' && BLDGS[e.type].role === 'defense'); }
      n++; if (q.ents.some(e => e.team === 0 && e.kind === 'bldg' && BLDGS[e.type].role === 'tech')) techs++; if (def4) defs++; boarded += a.stats.boarded || 0; if (q.ents.some(e => BLDGS[e.type] && BLDGS[e.type].site && e.team === 0)) sited++; }
    const used = can.filter(k => built.has(k)); rows.push(`${FACTIONS[f].name} ${used.length}/${can.length}`);
    ok(used.length >= can.length * 0.85, `${FACTIONS[f].name}: over six Hard matches (${plans.size} different plans) the AI built ${used.length} of the ${can.length} unit types open to it` + (used.length < can.length ? ' (never: ' + can.filter(k => !built.has(k)).map(k => UNITS[k].name).join(', ') + ')' : ''));
    ok(techs >= 4 && defs >= 5, `${FACTIONS[f].name}: it built its command building in ${techs} of ${n} matches and had a defense up by 5:00 in ${defs}`);
    if (['ursa', 'aegis', 'vanguard', 'redhammer'].includes(f)) ok(boarded >= 1, `${FACTIONS[f].name}: squads rode into battle in its troop carriers (${boarded} boardings)`);
    ok(sited >= 2, `${FACTIONS[f].name}: it held a capturable site at the end of ${sited} of ${n} matches`);
  }
  console.log('AI variety     : unit types fielded over six Hard matches: ' + rows.join(' | '));
}

// ---------------------------------------------------------------- the AI learns (and only from what it saw)
{
  const q = new Sim({ ai: 'both', difficulty: ['hard', 'medium'], factions: ['ursa', 'aegis'], map: MAP.OPEN_BIG, seed: 2 }), a = q.ais[0], b = q.ais[1];
  for (let t = 0; t < 20 * 60 * 12; t++) { if (t % 20 === 0) keepUp(q); q.step(); q.events.length = 0; }
  const c = a.census(), cb = b.census();
  ok(Object.keys(a.card).length >= 5 && c.eff && Object.values(c.eff).some(v => v > 1.05) && Object.values(c.eff).some(v => v < 0.95) && Math.abs(Object.values(c.eff).reduce((x, y) => x + y, 0) / Object.keys(c.eff).length - 1) < 1e-9, `report card: after 12 minutes it has rated ${Object.keys(c.eff).length} of its unit types against each other (experience earned per credit spent)`);
  const best = Object.entries(c.eff).sort((x, y) => y[1] - x[1])[0][0], worst = Object.entries(c.eff).sort((x, y) => x[1] - y[1])[0][0], plain = { ...c, eff: null };
  ok(a.unitScore(best, null, c) - a.unitScore(best, null, plain) > 0 && a.unitScore(worst, null, c) - a.unitScore(worst, null, plain) < 0, `it now favours its ${UNITS[best].name} and holds back on its ${UNITS[worst].name}`);
  ok(cb.eff && b.graves.length === 0 && b.cfg.learn === 1, 'Medium keeps the report card too, and nothing else');
  // route memory
  { const mem = (id, type, x, z, weapon) => a.aiMemoryMap.set(id, { id, kind: 'bldg', type, team: ENEMY, first: q.tick, tick: q.tick, x, z, hp: 1, vet: 0, cost: 1000, armor: 'bldg', weapon, rect: null });
    for (const k of [...a.aiMemoryMap.keys()]) if (a.aiMemoryMap.get(k).kind === 'bldg') a.aiMemoryMap.delete(k);
    mem(-11, 'e_barracks', 700, 300, false); mem(-12, 'e_factory', 800, 420, false); a.graves.length = 0; a.hasArty = false;
    const first = a.pickTarget(); a.graves.push({ x: first.x, z: first.z, tick: q.tick }); const second = a.pickTarget();
    ok(first.id === -11 && second.id === -12, 'route memory: where an attack was wiped out is not where the next one goes');
    mem(-13, 'e_iris', 705, 310, true); mem(-14, 'e_supply', 810, 430, false); a.graves.length = 0; const wary = a.pickTarget(); a.hasArty = true; const bold = a.pickTarget();
    ok(wary.id === -14 && bold.id === -11, 'targets: without artillery it goes round the defended building for the supply line; with artillery along it takes the direct road');
    for (const k of [-11, -12, -13, -14]) a.aiMemoryMap.delete(k); }
  // habit memory: raids on its base are remembered, with their direction
  const r = new Sim({ ai: 'both', difficulty: ['hard', 'easy'], factions: ['ursa', 'aegis'], map: MAP.OPEN_BIG, seed: 3 }), ar = r.ais[0], f0 = { ...ar.front };
  const raid = (dx, dz) => { const u = makeUnit(r, 'e_tank', ENEMY, ar.homeW.x + dx, ar.homeW.z + dz, 0); u.hp = u.maxHp = 1e6; hold(u); return u; };
  run(r, 40); const u1 = raid(-34, 6); run(r, 200); const n1 = ar.raids.length, fr1 = ar.firstRaid; (await import('../js/sim/entities.js')).kill(r, u1); run(r, 1000); const u2 = raid(-32, -14); run(r, 200);
  ok(n1 === 1 && fr1 > 0 && ar.raids.length === 2 && ar.front.x < -0.5 && (ar.front.x !== f0.x), `habit memory: two raids from the west and its defenses will go up on that side (front ${f0.x.toFixed(2)}, ${f0.z.toFixed(2)} -> ${ar.front.x.toFixed(2)}, ${ar.front.z.toFixed(2)})`);
  // the notebook
  const e1 = a.notebookEntry(); ok(e1.key === 'ursa>aegis@Open Desert' && e1.doctrine === a.doctrineId && typeof e1.won === 'boolean' && Math.abs(Object.values(e1.saw).reduce((x, y) => x + y, 0) - 1) < 0.01, `notebook entry: ${e1.key}, plan ${e1.doctrine}, what it met by armour class`);
  const blind = new Sim({ ai: 'both', difficulty: ['hard', 'hard'], factions: ['ursa', 'aegis'], map: MAP.OPEN_BIG, seed: 2 }); run(blind, 300); ok(Object.values(blind.ais[0].notebookEntry().saw).every(v => v === 0) && blind.ais[0].firstRaid === 0, 'it writes down only what it has seen: five seconds in, having met nothing, the entry is empty');
  let notes = {}; AI.mergeNote(notes, { key: 'k', doctrine: 'siege', won: true, first: 4000, saw: { inf: 1, light: 0, heavy: 0, air: 0 } }); AI.mergeNote(notes, { key: 'k', doctrine: 'siege', won: false, first: 0, saw: { inf: 0, light: 0, heavy: 1, air: 0 } }); AI.mergeNote(notes, { key: 'k', doctrine: 'armour', won: true, first: 2000, saw: { inf: 0.5, light: 0, heavy: 0.5, air: 0 } });
  ok(notes.k.n === 3 && notes.k.d.siege.join() === '1,1' && notes.k.d.armour.join() === '1,0' && notes.k.first === 3000 && Math.abs(notes.k.saw.inf - 0.5) < 0.01, 'entries are merged: wins and losses per plan, the average time of the first raid, the average of what it met');
  const book = { 'ursa>aegis@Open Desert': { n: 30, d: { combined: [0, 12], armour: [0, 12], infantry: [0, 12], aircav: [0, 12], siege: [14, 0] }, first: 2600, fn: 5, saw: { inf: 0.1, light: 0.1, heavy: 0.7, air: 0.1 } } };
  let siege = 0; for (let sd = 1; sd <= 12; sd++) if (mk2('hard', sd, book).ais[0].doctrineId === 'siege') siege++;
  ok(siege >= 6, `a plan that always won against you is chosen far more often: Artillery siege in ${siege} of 12 matches (2 or 3 by chance)`);
  const nb = mk2('hard', 4, book).ais[0], md = mk2('medium', 4, book).ais[0];
  ok(nb.expectRaid === 2600 && nb.prior.heavy === 0.7 && md.expectRaid === 0 && md.prior === null, 'Hard reads the notebook (expects the first raid at 2:10, expects armour); Medium does not');
  ok(nb.unitScore('u_rpg', null, nb.census()) > nb.unitScore('u_rifle', null, nb.census()), 'before it has seen a single enemy it already prefers anti-tank teams to riflemen against this opponent');
  // a replay carries the notebook it was played with
  const live = new Sim({ difficulty: 'hard', factions: ['aegis', 'ursa'], map: MAP.OPEN_BIG, seed: 4, aiNotes: book }), rec = new ReplayRecorder(live);   // you (Europe) against the Hard Russian AI for (let t = 0; t < 2400; t++) { live.step(); rec.mark(); live.events.length = 0; }
  const data = JSON.parse(JSON.stringify(rec.export())), pl = new ReplayPlayer(data); while (pl.step()) pl.sim.events.length = 0;
  ok(data.setup.aiNotes && live.ais[0].noteKey === 'ursa>aegis@Open Desert' && live.ais[0].prior && pl.sim.ais[0].doctrineId === live.ais[0].doctrineId && pl.sim.hash() === live.hash() && pl.diverged < 0, 'the notebook is stored with the replay, and the replay plays back exactly');
  const none = mk2('hard', 4, null); ok(none.aiNotes === null && none.ais[0].prior === null, 'with no notebook (tests, balance sweeps) the AI starts from nothing');
  const html = src('index.html'), play = src('play.html'), setup = src('js/ui/setup.js'), game = src('js/game.js');
  ok([html, play].every(h => /id="setup-ainotes-reset"/.test(h) && /Reset AI memory/.test(h)) && /removeItem\(NOTES_KEY\)/.test(setup) && /saveNote\(sim\)/.test(game) && /=== 'hard' && !o\.noEnemy \? loadNotes\(\)/.test(game), 'both pages have the Reset AI memory button; the page hands the notebook to Hard matches only and adds an entry when a live match ends');
  console.log(`AI learning    : report card on ${Object.keys(c.eff).length} unit types | route and raid memory | notebook: siege chosen ${siege}/12 after it kept winning`);
}
function mk2(lv, seed, notes) { return new Sim({ ai: 'both', difficulty: [lv, lv], factions: ['ursa', 'aegis'], map: MAP.OPEN_BIG, seed, aiNotes: notes }); }

// ---------------------------------------------------------------- drop B balance pass
{
  const s = new Sim({ ai: false, map: MAP.OPEN_BIG, factions: ['ursa', 'vanguard'] }); const dk = s.ents.filter(e => e.type === 'derrick'); dk[0].team = PLAYER; dk[1].team = ENEMY; const m0 = [s.teams[0].money, s.teams[1].money]; let cash = [0, 0];
  run(s, 400, (ev) => { for (const e of ev) if (e.t === 'cash' && (e.x === dk[0].x && e.z === dk[0].z || e.x === dk[1].x && e.z === dk[1].z)) cash[e.team] += e.amt; });
  ok(FACTIONS.ursa.oil === 1.3 && cash[0] === 39 * 10 && cash[1] === 30 * 10 && /Oil Derricks pay Russia 30% more/.test(FACTIONS.ursa.blurb), `an Oil Derrick pays Russia $39 every 2 s and everyone else $30 (over 20 s: ${cash[0]} against ${cash[1]})`);
  ok(/FACTIONS\[sim\.teams\[PLAYER\]\.faction\]\.oil/.test(src('js/ui/uiHUD.js')), 'the derrick\'s info line shows the amount your own faction is paid');
  ok(WEAPONS.gun125.vs.inf === 0.5 && WEAPONS.gun125a.vs.inf === 0.5 && WEAPONS.cannon.vs.inf === 0.35, 'T-90 and T-14 guns fire high-explosive shells at infantry (half damage, other tanks 35%)');
  ok(UNITS.u_rifle.cost === 250 && UNITS.u_rifle.hp === 290 && UNITS.u_tank.cost === 700 && UNITS.u_bmp.cost === 750 && UNITS.s_guerrilla.cost === 250 && UNITS.s_quad.cost === 575 && UNITS.v_ranger.cost === 320 && UNITS.v_a10.cost === 1600 && UNITS.r_conscript.cost === 240, 'prices after the drop B sweep: Russia and China cheaper, ISIS core and US Rangers and A-10 a little dearer');
}

console.log(fail ? `BATCH14: ${fail} FAILURES of ${pass + fail}` : `BATCH14: all ${pass} checks passed`);
process.exit(fail ? 1 : 0);
