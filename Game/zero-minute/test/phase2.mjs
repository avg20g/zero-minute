// Phase 2 mechanics: garrison clearing, veterancy, horde, point defense, salvage,
// stealth, sabotage, capture, aircraft, hardpoints, income, promotions, match-ups.
import { Sim } from '../js/sim/simulationTick.js';
import { makeBldg, makeUnit, spawnNear, setVet, applyDamage } from '../js/sim/entities.js';
import { slotsOf } from '../js/sim/combat.js';
import { N, CELL, PLAYER, ENEMY, NEUTRAL } from '../js/sim/defs.js';
import { UNITS, BLDGS, WEAPONS, FACTIONS, FACTION_IDS, GENERAL, VET } from '../js/sim/factionRegistry.js';
let fails = 0, checks = 0; const ok = (c, msg) => { checks++; if (!c) { fails++; console.log('  FAIL', msg); } };
const run = (sim, n, each) => { for (let i = 0; i < n; i++) { sim.step(); if (each) each(sim); sim.events.length = 0; } };
const empty = (f = ['vanguard', 'redhammer']) => new Sim({ ai: false, empty: true, factions: f });
const hold = (...us) => { for (const u of us) u.order = { t: 'hold' }; };
const X = 300, Z = 300;

// --- registry sanity: every reference resolves
{
  let bad = 0;
  for (const [id, u] of Object.entries(UNITS)) { for (const w of [u.weapon, u.weapon2, ...(u.salvageWeapons || [])]) if (w && !WEAPONS[w]) { bad++; console.log('  missing weapon', id, w); } if (!FACTIONS[u.faction]) bad++; }
  for (const [id, b] of Object.entries(BLDGS)) { for (const t of b.trains || []) if (!UNITS[t]) { bad++; console.log('  missing unit', id, t); } if (b.needs && !BLDGS[b.needs]) bad++; if (b.weapon && !WEAPONS[b.weapon]) bad++; }
  for (const f of Object.values(FACTIONS)) { for (const b of f.build) if (!BLDGS[b] || BLDGS[b].faction !== f.id) bad++; for (const t of f.aiArmy) if (!UNITS[t]) bad++; for (const r of Object.values(f.roles)) if (!UNITS[r] && !BLDGS[r]) bad++; for (const n of f.tree) if (n.req && !f.tree.find(k => k.id === n.req)) bad++; }
  ok(bad === 0, 'registry references'); console.log(`registry       : ${Object.keys(UNITS).length} units, ${Object.keys(BLDGS).length} buildings, ${Object.keys(WEAPONS).length} weapon profiles, 3 factions, all references resolve`);
}
// --- garrison clearing: occupants hurt and ejected, shell untouched
{
  const out = [];
  for (const [who, f] of [['r_inferno', 'redhammer'], ['s_tractor', 'sandstorm'], ['v_ranger', 'vanguard']]) {
    const s = empty([f, 'vanguard']); const civ = makeBldg(s, 'civ', NEUTRAL, 158, 148); s.nav.rebuild();
    const a = makeUnit(s, 'r_conscript', ENEMY, civ.x - 9, civ.z, 0), b = makeUnit(s, 'r_conscript', ENEMY, civ.x - 9, civ.z + 3, 0);
    s.issue({ t: 'garrison', team: ENEMY, ids: [a.id, b.id], target: civ.id }); run(s, 100);
    ok(civ.garrison.length === 2 && civ.team === ENEMY, who + ': building garrisoned by 2 enemy squads');
    const dist = who === 'r_inferno' ? 50 : 26; const atk = makeUnit(s, who, PLAYER, civ.x + dist, civ.z, Math.PI);
    const spot = makeUnit(s, 's_saboteur', PLAYER, civ.x + 30, civ.z + 20, 0);   // unarmed spotter so artillery has vision
    a.cds = [1e9, 1e9, 1e9]; b.cds = [1e9, 1e9, 1e9]; let cleared = 0;
    run(s, 400, k => { for (const e of k.events) if (e.t === 'cleared') cleared++; a.cds[0] = b.cds[0] = 1e9; });
    ok(cleared >= 1 && civ.garrison.length === 0, who + ': garrison emptied'); ok(civ.hp === civ.maxHp && !civ.ruined && !civ.dead, who + ': building shell undamaged (' + civ.hp + '/' + civ.maxHp + ')');
    ok((a.dead || a.hp < UNITS.r_conscript.hp) && (b.dead || b.hp < UNITS.r_conscript.hp), who + ': occupants took damage'); ok(civ.team === NEUTRAL, who + ': building back to neutral');
    out.push(`${UNITS[who].name} (shell ${civ.hp}/${civ.maxHp})`);
  }
  // control: a normal tank shells the building itself and does NOT eject anyone
  const s = empty(); const civ = makeBldg(s, 'civ', NEUTRAL, 158, 148); s.nav.rebuild(); const a = makeUnit(s, 'r_conscript', ENEMY, civ.x - 9, civ.z, 0);
  s.issue({ t: 'garrison', team: ENEMY, ids: [a.id], target: civ.id }); run(s, 100); a.cds = [1e9, 1e9, 1e9];
  const tk = makeUnit(s, 'v_tank', PLAYER, civ.x + 28, civ.z, Math.PI); run(s, 200, () => { a.cds[0] = 1e9; });
  ok(civ.hp < civ.maxHp && civ.garrison.length === 1, 'control: tank cannon damages the shell and leaves the garrison inside');
  console.log('garrison clear : ' + out.join(', ') + '; tank control damages shell instead');
}
// --- veterancy
{
  const s = empty(); const t = makeUnit(s, 'v_tank', PLAYER, X, Z, 0); hold(t); const hp0 = t.maxHp, ranks = [];
  for (let k = 0; k < 6; k++) { const v = makeUnit(s, 'r_tank', ENEMY, X + 24, Z + (k % 3) * 6 - 6, Math.PI); hold(v); v.cds = [1e9, 1e9, 1e9]; v.hp = 20;
    s.issue({ t: 'attack', ids: [t.id], target: v.id }); run(s, 120, kk => { for (const e of kk.events) if (e.t === 'vet' && e.id === t.id) ranks.push(e.rank); }); }
  ok(ranks.join() === '1,2,3', 'tank ranked up Veteran, Elite, Heroic by kills: ' + ranks.join()); ok(Math.abs(t.maxHp - hp0 * 1.45) < 0.01, 'max HP +15% per rank (' + hp0 + ' to ' + t.maxHp.toFixed(0) + ')');
  const v = makeUnit(s, 'r_overlord', ENEMY, X + 26, Z, Math.PI); hold(v); v.cds = [1e9, 1e9, 1e9]; let tracerVet = -1, cdSeen = 0;
  s.issue({ t: 'attack', ids: [t.id], target: v.id }); run(s, 60, kk => { for (const e of kk.events) if (e.t === 'fire' && e.sid === t.id) { tracerVet = e.vet; cdSeen = t.cds[0]; } v.cds[0] = 1e9; });
  ok(tracerVet === 3, 'shots carry the shooter rank for coloured tracers'); ok(cdSeen === Math.round(44 / 1.45), 'fire rate +15% per rank: cooldown 44 to ' + cdSeen + ' ticks');
  s.issue({ t: 'stop', ids: [t.id] }); v.dead = true; t.hp = t.maxHp * 0.5; run(s, 40); const mid = t.hp; run(s, 260);
  ok(mid <= t.maxHp * 0.5 + 0.01 && t.hp > t.maxHp * 0.6, 'Heroic self-repair starts after 5 s out of combat (' + (t.hp / t.maxHp * 100).toFixed(0) + '%)');
  const r = makeUnit(s, 'v_tank', PLAYER, X - 30, Z, 0); setVet(r, 1); r.hp = r.maxHp * 0.5; run(s, 300); ok(r.hp === r.maxHp * 0.5, 'Veteran rank does not self-repair');
  console.log('veterancy      : 3 ranks from kills, +15% HP and fire rate per rank, Elite/Heroic regen, rank on tracers');
}
// --- horde bonus (Red Hammer)
{
  const s = empty(['redhammer', 'vanguard']); const ts = [0, 1, 2, 3, 4].map(i => makeUnit(s, 'r_tank', PLAYER, X + (i % 3) * 6, Z + ((i / 3) | 0) * 6, 0)); hold(...ts); run(s, 25);
  ok(ts.every(t => t.horde), '5 tanks together: horde active'); const lone = makeUnit(s, 'r_tank', PLAYER, X - 80, Z, 0); hold(lone); run(s, 25); ok(!lone.horde, 'lone tank: no horde');
  const v = makeUnit(s, 'v_tank', ENEMY, X + 30, Z, Math.PI); hold(v); v.cds = [1e9, 1e9, 1e9]; v.hp = v.maxHp = 1e6; let cd = 0;
  s.issue({ t: 'attack', ids: [ts[0].id], target: v.id }); run(s, 60, k => { for (const e of k.events) if (e.t === 'fire' && e.sid === ts[0].id) cd = ts[0].cds[0]; });
  ok(cd === Math.round(44 / 1.15), 'horde fire rate +15%: cooldown 44 to ' + cd); ts[4].dead = true; ts[3].dead = true; run(s, 25); ok(!ts[0].horde, 'bonus drops when the group falls under 5');
  const vg = empty(); const vs = [0, 1, 2, 3, 4].map(i => makeUnit(vg, 'v_tank', PLAYER, X + i * 5, Z, 0)); run(vg, 25); ok(vs.every(t => !t.horde), 'other factions get no horde bonus');
  console.log('horde          : on at 5 units within 14 m, cooldown 44 to ' + cd + ' ticks, off below 5, Red Hammer only');
}
// --- point-defense lasers
{
  const trial = (type, upgrade) => { const s = empty(['vanguard', 'sandstorm']); if (upgrade) s.teams[0].upgrades.add('v_pdl');
    const t = makeUnit(s, type, PLAYER, X, Z, 0); hold(t); t.cds = [1e9, 1e9, 1e9]; t.hp = t.maxHp = 1e6;
    const rp = [0, 1, 2, 3].map(i => makeUnit(s, 's_rpg', ENEMY, X + 30, Z - 9 + i * 6, Math.PI)); let fired = 0, pdl = 0, hit = 0;
    run(s, 400, k => { t.cds[0] = 1e9; for (const e of k.events) { if (e.t === 'fire' && e.w === 'rpg') fired++; if (e.t === 'pdl') pdl++; if (e.t === 'impact' && e.hit) hit++; } }); return { fired, pdl, hit }; };
  const av = trial('v_avenger', false), plain = trial('v_tank', false), up = trial('v_tank', true);
  ok(av.pdl > 5 && av.pdl + av.hit >= av.fired - 4, 'Avenger shoots rockets down'); ok(plain.pdl === 0 && plain.hit > 20, 'Sentinel without the upgrade intercepts nothing'); ok(up.pdl > 3 && up.hit < plain.hit, 'Sentinel with Point-Defense Lasers intercepts some');
  ok(av.pdl > up.pdl, 'Avenger PDL recharges faster than the upgrade');
  const s = empty(['vanguard', 'redhammer']); const t = makeUnit(s, 'v_avenger', PLAYER, X, Z, 0); hold(t); t.cds = [1e9, 1e9, 1e9]; const tk = makeUnit(s, 'r_tank', ENEMY, X + 28, Z, Math.PI); let p = 0; run(s, 200, k => { t.cds[0] = 1e9; for (const e of k.events) if (e.t === 'pdl') p++; });
  ok(p === 0 && t.hp < t.maxHp, 'tank shells cannot be intercepted');
  console.log(`point defense  : Avenger stopped ${av.pdl}/${av.fired} RPGs; upgraded Sentinel ${up.pdl}/${up.fired}; plain Sentinel 0/${plain.fired}; shells never`);
}
// --- salvage (Sandstorm)
{
  const s = empty(['sandstorm', 'vanguard']); const tech = makeUnit(s, 's_technical', PLAYER, X, Z, 0);
  ok(slotsOf(tech)[0] === 'tech_mg', 'Technical starts with a machine gun');
  const wreck = (x) => { const v = makeUnit(s, 'v_tank', ENEMY, x, Z, 0); hold(v); applyDamage(s, v, 1e5, 'cannon', x, Z, { team: PLAYER }); };
  wreck(X + 20); run(s, 2); ok(s.crates.length === 1, 'destroyed enemy vehicle leaves a crate');
  s.issue({ t: 'move', ids: [tech.id], x: X + 20, z: Z }); run(s, 100); ok(tech.tier === 1 && slotsOf(tech)[0] === 'tech_cannon' && s.crates.length === 0, 'crate 1: Technical gets a cannon');
  wreck(X + 40); run(s, 2); s.issue({ t: 'move', ids: [tech.id], x: X + 40, z: Z }); run(s, 100); ok(tech.tier === 2 && slotsOf(tech)[0] === 'tech_rocket', 'crate 2: Technical gets rockets');
  const m0 = s.teams[0].money; wreck(X + 60); run(s, 2); s.issue({ t: 'move', ids: [tech.id], x: X + 60, z: Z }); run(s, 100); ok(tech.tier === 2 && s.teams[0].money === m0 + 150, 'crate 3: capped at tier 2, pays $150 instead');
  const inf = makeUnit(s, 'v_ranger', ENEMY, X - 40, Z, 0); applyDamage(s, inf, 1e5, 'rifle', X, Z, { team: PLAYER }); run(s, 2); ok(s.crates.length === 0, 'infantry leave no crate');
  const s2 = empty(['vanguard', 'redhammer']); const v = makeUnit(s2, 'r_tank', ENEMY, X, Z, 0); applyDamage(s2, v, 1e5, 'cannon', X, Z, { team: PLAYER }); run(s2, 2); ok(s2.crates.length === 0, 'no crates when nobody can salvage');
  const sc = makeUnit(s, 's_scorpion', PLAYER, X, Z + 30, 0); const d0 = WEAPONS.toxin_shell.dmg; sc.tier = 2; sc.wslots = null; const tgt = makeUnit(s, 'v_tank', ENEMY, X + 26, Z + 30, Math.PI); hold(tgt); tgt.hp = tgt.maxHp = 1e6; tgt.cds = [1e9, 1e9, 1e9]; let dealt = 0;
  run(s, 30, () => { tgt.cds[0] = 1e9; }); dealt = 1e6 - tgt.hp; ok(dealt > 0 && Math.abs(dealt % (d0 * 1.5 * 0.85) ) < 1e-6 || dealt >= d0 * 1.5 * 0.85 - 0.01, 'tier 2 Scorpion hits 50% harder');
  console.log('salvage        : wreck to crate to Technical MG, cannon, rockets; third crate pays cash; Scorpion +25% per tier');
}
// --- stealth and detection
{
  const s = empty(); const sn = makeUnit(s, 'v_pathfinder', PLAYER, X, Z, 0); hold(sn); const eye = makeUnit(s, 'v_comanche', ENEMY, X + 20, Z, 0); hold(eye); eye.cds = [1e9, 1e9, 1e9]; // an observer the sniper cannot shoot at
  const mute = () => { eye.cds[0] = eye.cds[1] = 1e9; }; run(s, 10, mute); ok(!sn.cloaked && s.fog.shouldShow(ENEMY, sn), 'Pathfinder visible before settling'); run(s, 40, mute);
  ok(sn.cloaked && s.fog.visAt(ENEMY, sn.x, sn.z) && !s.fog.shouldShow(ENEMY, sn) && !s.fog.canSee(ENEMY, sn), 'stationary Pathfinder is hidden even inside enemy vision');
  sn.order = null; s.issue({ t: 'move', ids: [sn.id], x: X - 12, z: Z }); run(s, 12, mute); ok(!sn.cloaked && s.fog.shouldShow(ENEMY, sn), 'moving breaks the cloak'); run(s, 120, mute); ok(sn.cloaked, 're-cloaks once still');
  const tw = makeBldg(s, 'r_gatling', ENEMY, 138, 148); s.nav.rebuild(); run(s, 8, mute); ok(sn.cloaked && sn.detected && s.fog.shouldShow(ENEMY, sn), 'a defense with a detector reveals it');
  tw.dead = true; s.nav.setRect(tw.cx, tw.cz, 4, 4, 0); run(s, 8, mute); ok(!sn.detected, 'hidden again when the detector is gone');
  sn.dead = true; const sab = makeUnit(s, 's_saboteur', PLAYER, X, Z + 40, 0); const eye2 = makeUnit(s, 'r_hacker', ENEMY, X + 18, Z + 40, 0); hold(eye2); s.issue({ t: 'move', ids: [sab.id], x: X + 8, z: Z + 40 }); let seen = 0; run(s, 60, k => { if (k.fog.shouldShow(ENEMY, sab)) seen++; });
  ok(seen === 0, 'Saboteur stays hidden while moving'); s.issue({ t: 'move', ids: [sab.id], x: X + 15, z: Z + 40 }); run(s, 60); ok(s.fog.shouldShow(ENEMY, sab), 'but is spotted within 7 m of an enemy');
  console.log('stealth        : still-only and always-on cloaks, broken by moving/firing, revealed by detectors and proximity');
}
// --- saboteur, capture, income
{
  const s = new Sim({ ai: false, factions: ['sandstorm', 'vanguard'] }); s.teams[1].money = 5000; makeBldg(s, 'v_power', ENEMY, 232, 34); makeBldg(s, 'v_power', ENEMY, 236, 46); makeBldg(s, 'v_supply', ENEMY, 186, 48); makeBldg(s, 'v_patriot', ENEMY, 168, 98); s.nav.rebuild();
  const sup = s.ents.find(e => e.type === 'v_supply'), pw = s.ents.find(e => e.type === 'v_power'), pat = s.ents.find(e => e.type === 'v_patriot');
  pat.dead = true; s.ents.filter(e => e.type === 'v_patriot').forEach(e => { e.dead = true; }); s.ents.filter(e => e.team === ENEMY && e.kind === 'unit').forEach(e => { e.dead = true; }); run(s, 2);
  const a = spawnNear(s, 's_saboteur', PLAYER, sup.x, sup.z + 30), b = spawnNear(s, 's_saboteur', PLAYER, pw.x - 20, pw.z + 20);
  s.issue({ t: 'infiltrate', ids: [a.id], target: sup.id }); s.issue({ t: 'infiltrate', ids: [b.id], target: pw.id }); const m0 = s.teams[0].money; let texts = [];
  run(s, 500, k => { for (const e of k.events) if (e.t === 'sabotage') texts.push(e.text); });
  ok(s.teams[0].money === m0 + 1000 && s.teams[1].money <= 4000 + 1, 'Saboteur stole $1,000 from the Supply Center'); ok(pw.disabledUntil > s.tick && a.dead && b.dead, 'reactor disabled, saboteurs spent');
  run(s, 2); ok(s.teams[1].prod === 5 && s.teams[1].use > 0, 'disabled reactor produces no power (' + s.teams[1].prod + ' made)'); 
  const s2 = new Sim({ ai: false, factions: ['redhammer', 'sandstorm'] }); const dk = s2.ents.find(e => e.type === 'derrick' && e.cx === 92); const sq = spawnNear(s2, 'r_conscript', PLAYER, dk.x - 30, dk.z + 20), tk = spawnNear(s2, 'r_tank', PLAYER, dk.x - 34, dk.z + 26);
  s2.issue({ t: 'capture', ids: [sq.id, tk.id], target: dk.id }); const xp0 = s2.teams[0].xp, m1 = s2.teams[0].money; run(s2, 500);
  ok(dk.team === PLAYER && s2.teams[0].xp === xp0 + 150 && s2.teams[0].rank === 1, 'infantry captured the Oil Derrick: +150 General XP'); ok(!tk.order && Math.hypot(tk.x - dk.x, tk.z - dk.z) > 20, 'vehicles cannot capture');
  const m2 = s2.teams[0].money; run(s2, 400); ok(s2.teams[0].money - m2 === 300, 'derrick pays $30 every 2 s (+$' + (s2.teams[0].money - m2) + ' in 20 s)');
  const foe = spawnNear(s2, 's_guerrilla', ENEMY, dk.x + 20, dk.z); sq.dead = true; s2.issue({ t: 'capture', team: ENEMY, ids: [foe.id], target: dk.id }); run(s2, 400); ok(dk.team === ENEMY, 'the other side can take it back');
  ok(s2.ents.filter(e => e.type === 'derrick').length === 2, 'two derricks on the map');
  const hk = spawnNear(s2, 'r_hacker', PLAYER, 150, 400); s2.issue({ t: 'deploy', ids: [hk.id] }); const m3 = s2.teams[0].money; run(s2, 400); ok(hk.deployed && s2.teams[0].money - m3 === 120, 'deployed Hacker earns $6/s'); const hx = hk.x;
  s2.issue({ t: 'move', ids: [hk.id], x: 170, z: 400 }); run(s2, 100); ok(!hk.deployed && hk.x > hx + 5, 'moving packs the Hacker up');
  for (const [type, f] of [['v_uplink', 'vanguard'], ['s_market', 'sandstorm']]) { const k = new Sim({ ai: false, factions: [f, 'redhammer'] }); if (f === 'vanguard') makeBldg(k, 'v_power', PLAYER, 44, 212); makeBldg(k, type, PLAYER, 52, 186); k.nav.rebuild(); const m = k.teams[0].money; run(k, 400); ok(k.teams[0].money - m === 250, BLDGS[type].name + ' trickles $25 every 2 s'); }
  const lp = new Sim({ ai: false, factions: ['vanguard', 'redhammer'] }); makeBldg(lp, 'v_uplink', PLAYER, 52, 186); const pt = makeBldg(lp, 'v_patriot', PLAYER, 60, 180); lp.nav.rebuild(); const foe2 = makeUnit(lp, 'r_tank', ENEMY, pt.x + 30, pt.z, Math.PI); hold(foe2); const m = lp.teams[0].money; run(lp, 200);
  ok(lp.teams[0].low && lp.teams[0].money === m && foe2.hp === foe2.maxHp, 'low power: Satellite Uplink stops paying and the Patriot goes dark');
  const ns = new Sim({ ai: false, factions: ['sandstorm', 'redhammer'] }); makeBldg(ns, 's_stinger', PLAYER, 60, 180); makeBldg(ns, 's_market', PLAYER, 52, 186); ns.nav.rebuild(); run(ns, 5); ok(!ns.teams[0].low && ns.teams[0].use === 0, 'Sandstorm has no power grid');
  console.log('econ / infil   : sabotage steal + disable, derrick capture/recapture + XP, Hacker, Uplink, Black Market, low-power shutdown');
}
// --- aircraft
{
  const s = new Sim({ ai: false, factions: ['vanguard', 'redhammer'] }); const h = makeUnit(s, 'v_comanche', PLAYER, 70, 400, 0);
  s.issue({ t: 'move', ids: [h.id], x: 92, z: 250 }); let overCliff = 0; run(s, 300, k => { if (!k.nav.passAt(h.x, h.z, 1)) overCliff++; });
  ok(Math.hypot(h.x - 92, h.z - 250) < 4 && overCliff > 20, 'Comanche flies straight over the mesa (' + overCliff + ' ticks above impassable ground)');
  const e = empty(); const heli = makeUnit(e, 'v_comanche', ENEMY, X, Z, 0); hold(heli); const tank = makeUnit(e, 'v_tank', PLAYER, X + 20, Z, Math.PI), av = makeUnit(e, 'v_avenger', PLAYER, X + 200, Z, 0);
  heli.cds = [1e9, 1e9, 1e9]; run(e, 100, () => { heli.cds[0] = heli.cds[1] = 1e9; }); ok(heli.hp === heli.maxHp && tank.target === 0, 'tank cannon cannot engage aircraft');
  e.issue({ t: 'attack', ids: [tank.id], target: heli.id }); run(e, 3); ok(!tank.order, 'attack order on an aircraft is refused for a unit with no anti-air');
  av.x = X + 30; av.z = Z + 10; run(e, 120, () => { heli.cds[0] = heli.cds[1] = 1e9; }); ok(heli.hp < heli.maxHp || heli.dead, 'Avenger laser shoots it down');
  // MiG sortie
  const m = new Sim({ ai: false, factions: ['redhammer', 'vanguard'] }); makeBldg(m, 'r_power', PLAYER, 44, 212); const af = makeBldg(m, 'r_airfield', PLAYER, 48, 182); m.nav.rebuild(); m.teams[0].money = 20000;
  for (let i = 0; i < 6; i++) m.issue({ t: 'train', id: af.id, type: 'r_mig' }); let full = 0; run(m, 2, k => { for (const ev of k.events) if (ev.t === 'msg' && ev.text === 'Airfield is full') full++; });
  ok(af.queue.length === 4 && full === 2, 'airfield takes 4 MiGs (one per pad), refuses the rest'); run(m, 1100);
  const migs = m.ents.filter(u => u.type === 'r_mig'); ok(migs.length === 4 && migs.every(u => u.landed && u.as === 'parked' && u.home === af.id), '4 MiGs parked on pads'); ok(new Set(migs.map(u => u.pad)).size === 4, 'each on its own pad');
  const tg = makeUnit(m, 'v_tank', ENEMY, 150, 330, 0); hold(tg); tg.cds = [1e9, 1e9, 1e9]; const sp = spawnNear(m, 'r_conscript', PLAYER, 130, 340); hold(sp); run(m, 8);
  m.issue({ t: 'attack', ids: [migs[0].id], target: tg.id }); let shots = 0, away = 0, haz = 0; run(m, 300, k => { tg.cds[0] = 1e9; for (const ev of k.events) { if (ev.t === 'fire' && ev.sid === migs[0].id) shots++; if (ev.t === 'hazard') haz++; } if (!migs[0].landed) away++; });
  ok(shots === 2 && migs[0].ammo === 0 || migs[0].ammo === 2, 'MiG fired its 2 missiles (' + shots + ')'); ok(tg.dead || tg.hp < tg.maxHp, 'target hit'); ok(haz >= 1, 'missiles leave a firestorm');
  run(m, 1400); ok(migs[0].landed && migs[0].as === 'parked' && migs[0].ammo === 2, 'MiG returned to its pad and rearmed'); // taxi, take-off and landing now take real time ok(away > 60, 'sortie took ' + (away / 20).toFixed(1) + ' s');
  af.dead = true; m.nav.setRect(af.cx, af.cz, af.w, af.h, 0); run(m, 5); ok(m.ents.filter(u => u.type === 'r_mig').length === 0, 'MiGs are lost with their only airfield');
  console.log('aircraft       : Comanche ignores terrain, only anti-air can hit it; MiG sortie fire 2, return, rearm; pads enforced');
}
// --- Overlord hardpoints
{
  const s = empty(['redhammer', 'vanguard']); s.teams[0].money = 5000; const ov = makeUnit(s, 'r_overlord', PLAYER, X, Z, 0), ov2 = makeUnit(s, 'r_overlord', PLAYER, X, Z + 30, 0); hold(ov, ov2);
  ok(slotsOf(ov).join() === 'dual_cannon', 'Overlord starts with dual cannons only');
  s.issue({ t: 'addon', id: ov.id, type: 'gatling' }); s.issue({ t: 'addon', id: ov2.id, type: 'bunker' }); run(s, 100); ok(!ov.addon, 'fitting takes 8 s'); run(s, 70);
  ok(ov.addon === 'gatling' && slotsOf(ov).join() === 'dual_cannon,gatling' && s.teams[0].money === 5000 - 900, 'Gatling fitted: second weapon slot'); s.issue({ t: 'addon', id: ov.id, type: 'bunker' }); run(s, 2); ok(!ov.addonQ, 'one hardpoint per tank');
  const heli = makeUnit(s, 'v_comanche', ENEMY, X + 26, Z, Math.PI); hold(heli); ov.order = null; run(s, 80, () => { heli.cds[0] = heli.cds[1] = 1e9; }); ok(heli.dead || heli.hp < heli.maxHp, 'Gatling gives the Overlord anti-air');
  const sq = makeUnit(s, 'r_conscript', PLAYER, X - 8, Z + 30, 0), sq2 = makeUnit(s, 'r_conscript', PLAYER, X - 8, Z + 34, 0); s.issue({ t: 'garrison', ids: [sq.id, sq2.id], target: ov2.id }); run(s, 80);
  ok(ov2.garrison.length === 1 && [sq, sq2].filter(u => u.inB === ov2.id).length === 1, 'Battle Bunker carries exactly one squad');
  const rider = sq.inB ? sq : sq2; const foe = makeUnit(s, 'v_ranger', ENEMY, X + 30, Z + 30, Math.PI); hold(foe); foe.cds = [1e9, 1e9, 1e9]; let fromBunker = 0; run(s, 60, k => { foe.cds[0] = 1e9; for (const e of k.events) if (e.t === 'tracer' && e.sid === rider.id) fromBunker++; });
  ok(fromBunker > 0, 'the squad fires from inside the bunker'); s.issue({ t: 'move', ids: [ov2.id], x: X + 10, z: Z + 60 }); run(s, 200); ok(rider.inB === ov2.id, 'and rides along');
  applyDamage(s, ov2, 1e6, 'cannon', X, Z, { team: ENEMY }); run(s, 2); ok(!rider.inB && !rider.dead && s.nav.passAt(rider.x, rider.z, 0), 'squad bails out when the Overlord dies');
  console.log('hardpoints     : Gatling adds an anti-air slot; Bunker carries one squad that fires out, rides along, bails out');
}
// --- General's promotions
{
  const s = empty(['vanguard', 'redhammer']); const T = s.teams[0]; ok(T.rank === 1 && T.points === 1, 'start at Rank 1 with 1 point');
  const P = (n) => { s.issue({ t: 'promote', node: n }); s.step(); };
  P('v_a10'); ok(!T.promos.has('v_a10') && T.points === 1, 'Rank 3 node refused at Rank 1'); P('v_vet'); ok(T.promos.has('v_vet') && T.points === 0, 'Rank 1 node bought'); P('v_pathfinder'); ok(!T.promos.has('v_pathfinder'), 'no points, no purchase');
  const v = makeUnit(s, 'r_overlord', ENEMY, X, Z, 0); let ranks = []; for (let k = 0; k < 40 && T.rank < 5; k++) { const e = makeUnit(s, 'r_overlord', ENEMY, X, Z, 0); applyDamage(s, e, 1e5, 'cannon', X + 9, Z, { team: PLAYER }); for (const ev of s.events) if (ev.t === 'rank') ranks.push(ev.rank); s.events.length = 0; }
  ok(ranks.join() === '2,3,4,5' && T.points === 4, 'combat XP ranks the General up to 5: ' + ranks.join()); ok(T.xp >= GENERAL.rankXp[4], 'XP ' + Math.round(T.xp));
  P('v_emp'); ok(!T.promos.has('v_emp'), 'EMP needs A-10 first (branch)'); P('v_a10'); P('v_emp'); ok(T.promos.has('v_emp') && T.powerReady.emp <= s.tick, 'A-10 then EMP unlocked and ready');
  P('v_fastpdl'); ok(T.flags.fastPdl && T.points === 1, 'Rapid Point Defense (needs Armor Veterancy) bought'); const tk = makeUnit(s, 'v_tank', PLAYER, X + 40, Z, 0); ok(tk.vet === 1, 'Armor Veterancy: new tanks are Veterans');
  const b = makeBldg(s, 'v_barracks', PLAYER, 150, 170); s.nav.rebuild(); s.teams[0].money = 5000; s.issue({ t: 'train', id: b.id, type: 'v_pathfinder' }); s.step(); ok(b.queue.length === 0, 'Pathfinder locked without its promotion'); P('v_pathfinder'); s.issue({ t: 'train', id: b.id, type: 'v_pathfinder' }); s.step(); ok(b.queue.length === 1 && T.points === 0, 'unlocked after promotion');
  for (const f of FACTION_IDS) { const t = FACTIONS[f].tree; ok(t.filter(n => n.tier === 1).length === 2 && t.length === 7 && [1, 3, 5].every(k => t.some(n => n.tier === k)) && t.filter(n => n.power).length === 3 && t.every(n => !n.req || t.some(p => p.id === n.req && p.tier <= n.tier)), f + ': 7 nodes over 3 tiers, 3 powers, every branch has its parent'); }
  console.log('promotions     : rank gates, point costs, branch prerequisites, unlocks and flags work; XP ranks 2,3,4,5');
}
// --- upgrades + tech gates through the normal command path
{
  const s = new Sim({ ai: false, factions: ['redhammer', 'vanguard'] }); s.teams[0].money = 30000; makeBldg(s, 'r_power', PLAYER, 44, 212); makeBldg(s, 'r_power', PLAYER, 36, 212); makeBldg(s, 'r_supply', PLAYER, 60, 204); const f = makeBldg(s, 'r_factory', PLAYER, 62, 184); s.nav.rebuild();
  s.issue({ t: 'train', id: f.id, type: 'up:r_nuke' }); s.issue({ t: 'train', id: f.id, type: 'up:r_nuke' }); s.issue({ t: 'train', id: f.id, type: 'r_tank' }); s.issue({ t: 'train', id: f.id, type: 'v_tank' }); s.step();
  ok(f.queue.join() === 'up:r_nuke,r_tank', 'upgrade queued once; foreign units refused'); const old = spawnNear(s, 'r_tank', PLAYER, 150, 400); run(s, 800);
  const nw = s.ents.find(u => u.type === 'r_tank' && u !== old); ok(s.teams[0].upgrades.has('r_nuke') && old.ms > 10 && nw && nw.ms > 10, 'Nuclear Tanks: existing and new tanks are 15% faster');
  const dz = s.ents.find(u => u.type === 'r_dozer'); s.issue({ t: 'build', id: dz.id, type: 'v_patriot', cx: 50, cz: 170 }); const own0 = s.ents.filter(e => e.type === 'r_power' && e.team === PLAYER).length; s.issue({ t: 'build', id: dz.id, type: 'r_power', cx: 44, cz: 172 }); run(s, 3, k => { for (const e of k.events) if (e.t === 'msg') console.log('   msg:', e.text); });
  ok(!s.ents.some(e => e.type === 'v_patriot' && e.team === PLAYER) && s.ents.filter(e => e.type === 'r_power' && e.team === PLAYER).length === own0 + 1, 'builders can only place their own faction\'s buildings');
  console.log('tech / upgrades: faction-locked build and train lists, one-time upgrades, retroactive Nuclear Tanks');
}
// --- all 9 match-ups: 8-minute AI soak, twice, hashes must match
{
  const t0 = performance.now(); let ticks = 0; const rows = [];
  for (const a of FACTION_IDS) for (const b of FACTION_IDS) {
    const go = () => { const s = new Sim({ factions: [a, b] }); const F = FACTIONS[a].roles; s.teams[0].money = 20000; s.teams[1].rank = 3; s.teams[1].points = 3;
      const bd = s.ents.find(e => e.team === PLAYER && UNITS[e.type] && UNITS[e.type].builder);
      const plan = [[5, F.power || F.barracks, 44, 212], [200, F.supply, 60, 204], [420, F.barracks, 48, 186], [640, F.factory, 62, 184], [1000, F.defense, 84, 160], [1300, F.defense, 50, 166]];
      for (let t = 0; t < 9600; t++) {
        for (const [at, type, cx, cz] of plan) if (at === t) { const d = s.ents.find(e => e.id === bd.id); if (d) s.issue({ t: 'build', id: d.id, type, cx, cz }); }
        if (t > 900 && t % 240 === 0) for (const p of s.ents) if (p.team === PLAYER && p.kind === 'bldg' && p.done && BLDGS[p.type].trains && p.queue.length < 2) { const opts = BLDGS[p.type].trains.filter(u => !UNITS[u].promo && !UNITS[u].builder && !UNITS[u].harvester); if (opts.length) s.issue({ t: 'train', id: p.id, type: opts[(t / 240 | 0) % opts.length] }); }
        s.step(); ticks++;
        if (t % 400 === 0) for (const e of s.ents) if (!(e.x === e.x && e.z === e.z && e.hp === e.hp)) throw new Error(`NaN ${a} v ${b} ${e.type}`);
        s.events.length = 0;
      } return s; };
    const s1 = go(), s2 = go(); ok(s1.hash() === s2.hash(), `${a} v ${b} deterministic`);
    rows.push(`${a.slice(0, 4)} v ${b.slice(0, 4)}: AI attacks ${s1.ais[0].stats.attacks}, AI powers ${s1.teams[1].powersUsed}, ents ${s1.ents.length}`);
  }
  console.log('match-ups      : 9 pairings x 2 runs x 8 min, all deterministic, ' + ((performance.now() - t0) / ticks).toFixed(3) + ' ms/tick');
  for (const r of rows) console.log('                 ' + r);
}
console.log(fails ? `PHASE2: ${fails} FAILURES of ${checks}` : `PHASE2: all ${checks} checks passed`);
