// Batch 9 (play notes): friendly fire, any number of superweapons, AC-130, loitering drone, F-22 / F-15E loads,
// Technical machine guns, toxin and fire against garrisons, FPV dive, Suicide Bomber charge, Scud Launcher wind-up.
import { THREE } from './stub-three.mjs';
globalThis.THREE = THREE;
import { Sim } from '../js/sim/simulationTick.js';
import { makeUnit, makeBldg, splashDamage } from '../js/sim/entities.js';
import { completeBldg } from '../js/sim/econ.js';
import { addHazard } from '../js/sim/abilities.js';
import { canAttack, slotsOf } from '../js/sim/combat.js';
import { usePower, powerError, superBldgs } from '../js/sim/powers.js';
import { PLAYER, ENEMY, NEUTRAL } from '../js/sim/defs.js';
import { UNITS, WEAPONS, POWERS, FACTIONS } from '../js/sim/factionRegistry.js';
const MF = await import('../js/render/modelFactory.js');

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) pass++; else { fail++; console.log('  FAIL', msg); } };
const bare = (o = {}) => { const s = new Sim({ ai: false, empty: true, ...o }); s.fog.exp[0].fill(1); s.fog.exp[1].fill(1); return s; };
const run = (s, n, f) => { for (let i = 0; i < n; i++) { s.step(); if (f) f(s.events); s.events.length = 0; } };
const hold = (u) => { u.order = { t: 'hold' }; u.cds = [1e9, 1e9, 1e9]; return u; };

// ---------------------------------------------------------------- friendly fire
{
  const on = bare({ friendlyFire: true }), off = bare();
  const res = [on, off].map((s) => {
    const mine = makeUnit(s, 'v_ranger', PLAYER, 200, 200, 0), foe = makeUnit(s, 'r_conscript', ENEMY, 203, 200, 0), shooter = makeUnit(s, 'v_tank', PLAYER, 201, 202, 0);
    splashDamage(s, 201, 200, 8, 100, 'artillery', shooter);
    const blast = [mine.maxHp - mine.hp, foe.maxHp - foe.hp, shooter.maxHp - shooter.hp];
    const m2 = hold(makeUnit(s, 's_guerrilla', PLAYER, 300, 300, 0)); addHazard(s, 'toxin', 300, 300, 6, 3, 20, PLAYER, false); run(s, 50);
    return { blast, gas: m2.maxHp - m2.hp };
  });
  ok(res[0].blast[0] > 50 && res[0].blast[1] > 50 && res[0].blast[2] === 0, `friendly fire on: a blast hurts both sides (${res[0].blast[0].toFixed(0)} / ${res[0].blast[1].toFixed(0)}) but never the unit that fired it`);
  ok(res[1].blast[0] === 0 && res[1].blast[1] > 50, 'friendly fire off: only the enemy is hurt');
  ok(res[0].gas > 20 && res[1].gas === 0, `your own toxin cloud hurts your own infantry only with the rule on (${res[0].gas.toFixed(0)} v ${res[1].gas})`);
  ok(on.setup.friendlyFire === true && off.setup.friendlyFire === false, 'the rule is stored in the match setup for replays');
  console.log(`friendly fire  : blast ${res[0].blast.map(v => v.toFixed(0)).join(' / ')} (own, enemy, shooter) with the rule on; own side untouched with it off`);
}

// ---------------------------------------------------------------- superweapons: any number, one countdown each
{
  const s = bare({ factions: ['redhammer', 'vanguard'] }), T = s.teams[PLAYER], cd = POWERS.nuke.cd * 20;
  for (let i = 0; i < 4; i++) makeBldg(s, 'r_power', PLAYER, 20 + i * 10, 20); s.nav.rebuild();
  const a = makeBldg(s, 'r_silo', PLAYER, 40, 60, false), b = makeBldg(s, 'r_silo', PLAYER, 60, 60, false); s.nav.rebuild();
  completeBldg(s, a); run(s, 400); completeBldg(s, b);
  ok(POWERS.nuke.cd === 210 && POWERS.scud.cd === 210 && POWERS.particle.cd === 210, 'all three superweapons reload in 3:30 (was 5:00)');
  ok(superBldgs(s, PLAYER, 'nuke').length === 2 && b.superReady - a.superReady === 400 && T.powerReady.nuke === a.superReady, 'two silos, two separate countdowns; the HUD follows the earlier one');
  run(s, cd - 400); ok(powerError(s, PLAYER, 'nuke', 400, 400) === null, 'first silo ready on time');
  ok(usePower(s, PLAYER, 'nuke', 400, 400), 'first missile launched'); const st = s.strikes.find(p => p.kind === 'nuke');
  ok(st && st.sx === a.x && st.sz === a.z && a.superShot === s.tick && T.powerReady.nuke === b.superReady, 'it rises from the silo that was ready, and the HUD moves on to the second silo');
  ok(/recharging/.test(powerError(s, PLAYER, 'nuke', 400, 400) || ''), 'the second silo cannot fire early');
  run(s, 400); ok(usePower(s, PLAYER, 'nuke', 380, 380) && s.strikes.filter(p => p.kind === 'nuke').length === 1 && T.powersUsed === 2, 'second silo fires 20 s after the first');
  run(s, cd); const both = usePower(s, PLAYER, 'nuke', 400, 400) && usePower(s, PLAYER, 'nuke', 300, 300);
  ok(both && s.strikes.filter(p => p.kind === 'nuke').length === 2, 'with both ready, two missiles can be launched in the same moment');
  const sc = bare({ factions: ['sandstorm', 'vanguard'] }); const sb = makeBldg(sc, 's_scud', PLAYER, 50, 50); sc.nav.rebuild();
  ok(usePower(sc, PLAYER, 'scud', 400, 400), 'Scud Storm fired'); const ms = sc.strikes.filter(p => p.kind === 'scud');
  ok(ms.length === 9 && ms.every(m => Math.abs(m.sx - sb.x) < 3 && Math.abs(m.sz - sb.z) < 3 && m.lift === m.i * 5) && new Set(ms.map(m => m.sx + ':' + m.sz)).size === 9, 'nine missiles, each leaving its own rail of the launcher in turn');
  console.log('superweapons   : 3:30 reload | two silos count down separately and can fire together | Scud Storm launches from 9 rails');
}

// ---------------------------------------------------------------- AC-130
{
  const once = () => {
    const s = bare({ factions: ['vanguard', 'redhammer'] }), T = s.teams[PLAYER];
    ok(FACTIONS.vanguard.tree.some(n => n.id === 'v_ac130' && n.power === 'ac130' && n.tier === 5), 'AC-130 Gunship is a Rank 5 promotion for the United States');
    T.promos.add('v_pathfinder'); T.promos.add('v_para'); T.promos.add('v_ac130'); makeBldg(s, 'v_cc', PLAYER, 20, 220); s.nav.rebuild();
    const X = 300, Z = 200, inf = [0, 1, 2, 3].map(i => hold(makeUnit(s, 'r_conscript', ENEMY, X - 6 + i * 4, Z + 4, 0))), tank = hold(makeUnit(s, 'r_tank', ENEMY, X + 5, Z - 5, 0));
    const far = hold(makeUnit(s, 'r_tank', ENEMY, X + POWERS.ac130.radius + 16, Z, 0)), air = hold(makeUnit(s, 'r_hind', ENEMY, X, Z, 0));
    ok(usePower(s, PLAYER, 'ac130', X, Z), 'AC-130 called in');
    let gun = 0, cannon = 0, orbit = 0, rMin = 1e9, rMax = 0, ticks = 0, wide = 0;
    run(s, 900, (ev) => {
      const p = s.strikes.find(q => q.kind === 'gunship'); if (p) ticks++;
      if (p && p.s >= 0 && p.out === 0) { orbit++; const r = Math.hypot(p.x - X, p.z - Z); rMin = Math.min(rMin, r); rMax = Math.max(rMax, r); }
      for (const e of ev) if (e.t === 'gunship') { if (e.k === 'gun') gun++; else cannon++; if (Math.hypot(e.x - X, e.z - Z) > POWERS.ac130.radius + 3) wide++; }
    });
    ok(orbit >= 300 && orbit <= 302 && Math.abs(rMin - POWERS.ac130.orbit) < 0.5 && Math.abs(rMax - POWERS.ac130.orbit) < 0.5, `circles the target for 15 s at ${POWERS.ac130.orbit} m (${orbit} ticks, ${rMin.toFixed(1)} to ${rMax.toFixed(1)} m)`);
    ok(gun === 150 && cannon >= 11 && cannon <= 12 && wide === 0, `fires both weapons: ${gun} rotary cannon bursts and ${cannon} howitzer shells, all inside the zone`);
    ok(inf.every(u => u.dead) && (tank.dead || tank.hp < tank.maxHp * 0.5), `infantry in the zone killed, tank ${tank.dead ? 'destroyed' : 'at ' + Math.round(100 * tank.hp / tank.maxHp) + '%'}`);
    ok(far.hp === far.maxHp && air.hp === air.maxHp, 'a tank outside the zone and a helicopter above it are untouched');
    ok(!s.strikes.some(q => q.kind === 'gunship') && ticks > 380, `then it leaves (${(ticks / 20).toFixed(1)} s on screen)`);
    ok(T.powerReady.ac130 > s.tick + POWERS.ac130.cd * 20 - 1000, 'recharge started');
    return s.hash();
  };
  ok(once() === once(), 'AC-130 strike is deterministic');
  console.log('AC-130         : flies in, 15 s orbit at 44 m, 150 cannon bursts + howitzer shells into an 18 m zone, flies out');
}

// ---------------------------------------------------------------- recon drone loiters
{
  const s = bare(), d = makeUnit(s, 'v_drone', PLAYER, 200, 200, 0), R = UNITS.v_drone.loiter; let far = 0, slow = 0, x0 = d.x, z0 = d.z, path = 0;
  run(s, 400, () => { if (s.tick > 100) { const r = Math.hypot(d.x - 200, d.z - 200); if (Math.abs(r - R) > 3) far++; if (d.spd < 4) slow++; } path += Math.hypot(d.x - x0, d.z - z0); x0 = d.x; z0 = d.z; });
  ok(far === 0 && slow === 0 && path > 150 && !d.goal && !d.order, `idle drone flies a ${R} m circle and never hangs still (${path.toFixed(0)} m flown in 20 s)`);
  s.issue({ t: 'move', ids: [d.id], x: 300, z: 260 }); run(s, 300); let off = 0; run(s, 200, () => { if (Math.abs(Math.hypot(d.x - 300, d.z - 260) - R) > 3.5) off++; });
  ok(off === 0 && !d.order, 'after a move order it circles the new spot');
  console.log(`recon drone    : loiters on a ${R} m circle at ${(UNITS.v_drone.speed * 0.5).toFixed(0)} m/s, wherever it is sent`);
}

// ---------------------------------------------------------------- F-22 carries four; F-15E is the ground-attack jet
{
  const per = (u) => { const d = UNITS[u], w = WEAPONS[d.weapon]; return (k) => d.ammo * w.dmg * (w.vs[k] || 0); }, f22 = per('v_raptor'), f15 = per('v_f15');
  ok(UNITS.v_raptor.ammo === 4, 'F-22 carries 4 missiles');
  ok(['inf', 'light', 'heavy', 'bldg'].every(k => f15(k) > f22(k) * 1.5), `F-15E does more than the F-22 to every ground target per sortie (tanks ${f15('heavy').toFixed(0)} v ${f22('heavy').toFixed(0)}, buildings ${f15('bldg').toFixed(0)} v ${f22('bldg').toFixed(0)})`);
  ok(f22('air') > 0 && f15('air') === 0, 'the F-22 is the one that fights aircraft');
  const s = bare({ factions: ['vanguard', 'redhammer'] }), af = makeBldg(s, 'v_airfield', PLAYER, 30, 60); s.nav.rebuild();
  const jet = makeUnit(s, 'v_raptor', PLAYER, af.x, af.z, 0), tg = makeBldg(s, 'r_barracks', ENEMY, 150, 60); tg.hp = tg.maxHp = 1e6; makeUnit(s, 'v_drone', PLAYER, tg.x - 18, tg.z, 0); s.nav.rebuild(); run(s, 5);
  s.issue({ t: 'attack', ids: [jet.id], target: tg.id }); let shots = 0, least = 9; run(s, 900, (ev) => { least = Math.min(least, jet.ammo); for (const e of ev) if (e.t === 'fire' && e.w === 'raptor_missile') shots++; });
  ok(shots === 4 && least === 0, `one sortie fires all four (${shots})`);
  const r = MF.createModel({ kind: 'unit', type: 'v_raptor', team: 0 }), e = MF.createModel({ kind: 'unit', type: 'v_f15', team: 0 });
  ok(r.stores.length === 4 && e.stores.length === 2, 'the models carry 4 missiles and 2 bombs that come off as they are fired');
  console.log(`jets           : F-22 4 missiles | per sortie against tanks F-15E ${f15('heavy').toFixed(0)} v F-22 ${f22('heavy').toFixed(0)}`);
}

// ---------------------------------------------------------------- Technical: always a machine gun
{
  const kinds = UNITS.s_technical.salvageWeapons.map(w => WEAPONS[w].kind), dps = UNITS.s_technical.salvageWeapons.map(w => WEAPONS[w].dmg * 20 / WEAPONS[w].cd);
  ok(kinds.every(k => k === 'hitscan') && dps[0] < dps[1] && dps[1] < dps[2], `Technical fires a machine gun at every salvage level (${dps.map(v => v.toFixed(0)).join(' / ')} damage per second)`);
  const s = bare({ factions: ['sandstorm', 'vanguard'] }), t = makeUnit(s, 's_technical', PLAYER, 200, 200, 0), foe = hold(makeUnit(s, 'v_ranger', ENEMY, 220, 200, 0)); t.tier = 2; t.wslots = null;
  let tr = 0, other = 0; run(s, 100, (ev) => { for (const e of ev) { if (e.t === 'tracer' && e.sid === t.id) tr++; if (e.t === 'fire' && e.sid === t.id) other++; } });
  ok(tr > 10 && other === 0 && slotsOf(t)[0] === 'tech_twin', 'fully salvaged, it still shoots bullets, not rockets');
  const rig = MF.createModel({ kind: 'unit', type: 's_technical', team: 0 }); ok(rig.tiers.length === 3, 'three gun fits on the model');
}

// ---------------------------------------------------------------- toxin and fire: garrisons die as fast as troops in the open
{
  ok(WEAPONS.toxin.vs.inf >= 1.25 && WEAPONS.toxin.vs.light >= 0.4 && WEAPONS.toxin_spray.vs.light >= 0.4 && !WEAPONS.toxin.vs.heavy, 'toxin: fast against infantry, a decent amount against light armor, nothing against tanks');
  for (const kind of ['toxin', 'fire']) {
    const s = bare({ factions: ['sandstorm', 'vanguard'] }), civ = makeBldg(s, 'civ', NEUTRAL, 100, 100); s.nav.rebuild();
    const inn = makeUnit(s, 'v_ranger', ENEMY, civ.x - 9, civ.z, 0), out = hold(makeUnit(s, 'v_ranger', ENEMY, civ.x, civ.z + 12, 0)), lav = hold(makeUnit(s, 'v_lav', ENEMY, civ.x + 12, civ.z, 0));
    s.issue({ t: 'garrison', team: ENEMY, ids: [inn.id], target: civ.id }); run(s, 80); ok(inn.inB === civ.id, kind + ': squad is inside the building');
    addHazard(s, kind, civ.x, civ.z, 20, 30, 20, PLAYER, false);
    let same = true, thrown = false, tIn = -1, tOut = -1; const t0 = s.tick;
    run(s, 400, () => { if (!inn.dead && !out.dead && Math.abs(inn.hp - out.hp) > 1e-6) same = false; if (!inn.dead && !inn.inB) thrown = true; if (inn.dead && tIn < 0) tIn = s.tick - t0; if (out.dead && tOut < 0) tOut = s.tick - t0; });
    ok(same && tIn > 0 && tIn === tOut && !thrown, `${kind}: the squad inside dies on the same tick as the one in the open (${(tIn / 20).toFixed(1)} s) and is never thrown out`);
    ok(civ.hp === civ.maxHp && civ.garrison.length === 0 && civ.team === NEUTRAL, kind + ': the building is undamaged and empty again');
    if (kind === 'toxin') ok(lav.hp < lav.maxHp * 0.7 && !lav.dead === (lav.hp > 0), `toxin: a light vehicle in the cloud lost ${Math.round(lav.maxHp - Math.max(0, lav.hp))} of ${lav.maxHp}`);
  }
  console.log('toxin / fire   : garrisoned squads take exactly the open-ground damage, in place; toxin now hurts light vehicles');
}

// ---------------------------------------------------------------- Stealth general: FPV drone and Suicide Bomber
{
  const mk = () => bare({ factions: ['sandstorm', 'vanguard'], generals: ['stealth', null] });
  const strike = (unit, target, tx = 260, tz = 240, prep) => {
    const s = mk(), t = hold(makeUnit(s, target, ENEMY, tx, tz, 0)); if (prep) prep(s, t); makeUnit(s, 's_buggy', PLAYER, tx - 30, tz, 0).cds = [1e9, 1e9, 1e9];
    const u = makeUnit(s, unit, PLAYER, tx - 50, tz, 0), hp0 = t.hp; run(s, 6); s.issue({ t: 'attack', ids: [u.id], target: t.id });
    let boom = null, low = 9, dived = 0, charged = 0, fast = 0; run(s, 260, (ev) => { for (const b of s.ents) if (b.type === 's_buggy') b.cds[0] = 1e9; if (!u.dead) { low = Math.min(low, u.altK); fast = Math.max(fast, u.spd); } for (const e of ev) { if (e.t === 'suicide') boom = e; if (e.t === 'dive') dived++; if (e.t === 'charge') charged++; } });
    return { s, u, t, dmg: hp0 - Math.max(0, t.hp), boom, low, dived, charged, fast };
  };
  const vInf = strike('s_fpv', 'v_ranger'), vLav = strike('s_fpv', 'v_lav'), vTank = strike('s_fpv', 'v_tank'), vHeli = strike('s_fpv', 'v_comanche');
  ok([vInf, vLav, vTank, vHeli].every(r => r.boom && r.u.dead && r.dived === 1), 'FPV drone: dives, explodes and is destroyed by its own blast against infantry, a light vehicle, a tank and a helicopter');
  ok(vInf.low < 0.3 && vInf.boom.y < 2.5, `it dives to the ground for a ground target (blast ${vInf.boom.y.toFixed(1)} m up)`);
  ok(vHeli.boom.y > 8 && vHeli.dmg > 150, `it climbs to a helicopter and hits it in the air (blast ${vHeli.boom.y.toFixed(1)} m up, ${vHeli.dmg.toFixed(0)} damage)`);
  ok(vInf.dmg > 180 && vLav.dmg > 180 && vTank.dmg < vLav.dmg * 0.5, `effective against personnel (${vInf.dmg.toFixed(0)}) and light armor (${vLav.dmg.toFixed(0)}), weak against a tank (${vTank.dmg.toFixed(0)})`);
  { const s = mk(), af = makeBldg(s, 'v_airfield', ENEMY, 60, 60); s.nav.rebuild(); const jet = makeUnit(s, 'v_raptor', ENEMY, af.x, af.z, 0), f = makeUnit(s, 's_fpv', PLAYER, 200, 200, 0); run(s, 3);
    const parked = canAttack(f, jet); jet.landed = false; jet.altK = 1; ok(parked && !canAttack(f, jet), 'it can hit a parked jet but will not chase one in flight'); }
  const bTank = strike('s_bomber', 'v_tank'), bInf = strike('s_bomber', 'v_ranger');
  ok(bTank.boom && bTank.u.dead && bInf.u.dead && bTank.charged === 1, 'Suicide Bomber: charges, explodes and dies in its own blast');
  ok(bTank.fast > UNITS.s_bomber.speed * 1.3, `it sprints the last stretch (${bTank.fast.toFixed(1)} m/s against a normal ${UNITS.s_bomber.speed})`);
  ok(bTank.dmg > 330 && bTank.dmg > vTank.dmg * 3, `effective against heavy armor: ${bTank.dmg.toFixed(0)} of a tank's ${UNITS.v_tank.hp}`);
  { // hidden while standing still, also when left on guard; an enemy that walks into view sets it off
    const s = mk(), b = makeUnit(s, 's_bomber', PLAYER, 200, 200, 0); run(s, 40); const idle = b.cloaked;
    s.issue({ t: 'move', ids: [b.id], x: 215, z: 200 }); run(s, 12); const moving = b.cloaked; run(s, 90); const again = b.cloaked && !b.order;
    ok(idle && !moving && again, 'cloaked when standing still, visible while moving, cloaked again once it stops');
    const plain = bare({ factions: ['sandstorm', 'vanguard'] }), b2 = makeUnit(plain, 's_bomber', PLAYER, 200, 200, 0); run(plain, 40); ok(b2.cloaked, 'the cloak belongs to the bomber itself');
    const tank = makeUnit(s, 'v_tank', ENEMY, 215 + 60, 200, Math.PI); tank.cds = [1e9, 1e9, 1e9]; s.issue({ t: 'move', team: ENEMY, ids: [tank.id], x: 232, z: 200 });
    let seen = 0, boom = 0; run(s, 300, (ev) => { tank.cds[0] = 1e9; if (!b.dead && s.fog.canSee(ENEMY, b) && Math.hypot(tank.x - b.x, tank.z - b.z) > 30) seen++; for (const e of ev) if (e.t === 'suicide') boom++; });
    ok(seen === 0 && boom === 1 && b.dead && tank.hp < tank.maxHp - 250, 'on guard it stays hidden until a tank drives into view, then charges it');
  }
  console.log(`stealth units  : FPV ${vInf.dmg.toFixed(0)} infantry / ${vLav.dmg.toFixed(0)} light / ${vTank.dmg.toFixed(0)} tank / ${vHeli.dmg.toFixed(0)} helicopter | bomber ${bTank.dmg.toFixed(0)} tank, sprint ${bTank.fast.toFixed(1)} m/s`);
}

// ---------------------------------------------------------------- Scud Launcher: raise, fire, reload
{
  const s = bare({ factions: ['sandstorm', 'vanguard'], generals: ['wmd', null] }), sc = makeUnit(s, 's_scudtruck', PLAYER, 200, 200, 0), tg = makeBldg(s, 'v_barracks', ENEMY, 140, 100); s.nav.rebuild();
  makeUnit(s, 's_buggy', PLAYER, tg.x - 20, tg.z, 0).cds = [1e9, 1e9, 1e9]; run(s, 6); s.issue({ t: 'attack', ids: [sc.id], target: tg.id });
  const W = WEAPONS.scud_missile, t0 = s.tick; let fired = [], maxUp = 0; run(s, 900, (ev) => { maxUp = Math.max(maxUp, sc.windup); for (const e of ev) if (e.t === 'fire' && e.w === 'scud_missile') fired.push(s.tick - t0); });
  ok(fired.length === 2 && fired[0] >= W.windup - 2 && fired[1] - fired[0] >= W.cd + W.windup - 2, `it raises the missile for ${(W.windup / 20).toFixed(0)} s before each launch and reloads for ${(W.cd / 20).toFixed(0)} s between them (launches at ${fired.map(t => (t / 20).toFixed(1)).join(' s and ')} s)`);
  ok(maxUp === W.windup - 1 && Math.hypot(sc.x - 200, sc.z - 200) < 2 && tg.hp < tg.maxHp, 'fires from where it stands and hits');
  const rig = MF.createModel({ kind: 'unit', type: 's_scudtruck', team: 0 });   // (the Scud Storm and silo models need a browser canvas; they are checked in the running game)
  ok(rig.arm && rig.round, 'model: the launcher erector and its missile are separate moving parts');
  ok(MF.createMissile('scud').body && MF.createMissile('nuke').body && MF.createPlane('ac130', 'vanguard', 0).body, 'models: Scud and nuclear missile in flight, AC-130');
  console.log(`scud launcher  : launches at ${fired.map(t => (t / 20).toFixed(1)).join(' s, ')} s (2 s to raise, 20 s to reload)`);
}

console.log(fail ? `BATCH9: ${fail} FAILURES of ${pass + fail}` : `BATCH9: all ${pass} checks passed`);
process.exit(fail ? 1 : 0);
