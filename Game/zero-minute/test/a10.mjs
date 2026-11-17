// The A-10 as a unit (batch 13; it used to be the A-10 Strafing Run support power). Built at the Air Field by every
// US general: it flies out, makes its pass with the 30 mm cannon and four Mavericks, and comes home to re-arm.
import { Sim } from '../js/sim/simulationTick.js';
import { makeUnit, makeBldg } from '../js/sim/entities.js';
import { canAttack } from '../js/sim/combat.js';
import { UNITS, WEAPONS, POWERS, BLDGS, trainsOf } from '../js/sim/factionRegistry.js';
import { PLAYER, ENEMY } from '../js/sim/defs.js';
import { OPEN_BIG } from '../js/sim/map.js';
let fails = 0, checks = 0; const ok = (c, msg) => { checks++; if (!c) { fails++; console.log('  FAIL', msg); } };
const run = (s, n, f) => { for (let i = 0; i < n; i++) { s.step(); if (f) f(s.events); s.events.length = 0; } };

const D = UNITS.v_a10;
ok(!POWERS.a10 && D && D.based && D.air && D.ammo === 4 && D.weapon === 'gau8' && D.weapon2 === 'maverick', 'the A-10 is a strike aircraft with a cannon and four Mavericks, not a support power');
ok(BLDGS.v_airfield.trains.includes('v_a10') && ['airforce', 'marine', null].every(g => trainsOf({ faction: 'vanguard', general: g }, 'v_airfield').includes('v_a10')), 'every US general builds it at the Air Field');
ok(WEAPONS.gau8.free && WEAPONS.gau8.kind === 'hitscan' && WEAPONS.gau8.cd <= 4 && !WEAPONS.maverick.free && WEAPONS.maverick.vs.heavy > WEAPONS.maverick.vs.inf, 'the cannon fires all through the pass; the Mavericks are the sortie and are for armour');

function sortie(seed) {
  const s = new Sim({ ai: false, empty: true, map: OPEN_BIG, factions: ['vanguard', 'redhammer'], seed }); s.fog.exp[0].fill(1); const T = s.teams[0]; T.money = 9999;
  for (let i = 0; i < 4; i++) makeBldg(s, 'v_power', PLAYER, 40 + i * 8, 440); makeBldg(s, 'v_factory', PLAYER, 40, 400); const af = makeBldg(s, 'v_airfield', PLAYER, 60, 400); s.nav.rebuild();
  s.issue({ t: 'train', id: af.id, type: 'v_a10' }); run(s, 20 * 20);
  const jet = s.ents.find(e => e.type === 'v_a10'), tank = makeUnit(s, 'r_tank', ENEMY, 420, 700, 0), heli = makeUnit(s, 'r_hind', ENEMY, 430, 690, 0);
  for (const u of [tank, heli]) { u.order = { t: 'hold' }; u.hp = u.maxHp = 5000; }
  const out = { jet, tank, heli, built: !!jet && jet.as === 'parked' && jet.home === af.id && T.money === 9999 - D.cost, canHeli: jet && canAttack(jet, heli), gun: 0, mav: 0, order: [], minAmmo: 4, air: 0 };
  jet.order = { t: 'fattack', id: tank.id, x: tank.x, z: tank.z, g: null };
  run(s, 20 * 70, (ev) => { tank.cds = [1e9, 1e9, 1e9]; heli.cds = [1e9, 1e9, 1e9]; out.minAmmo = Math.min(out.minAmmo, jet.ammo); if (jet.altK > 0.9) out.air++;
    for (const e of ev) if (e.sid === jet.id) { if (e.w === 'gau8') { out.gun++; if (!out.order.includes('gun')) out.order.push('gun'); } if (e.w === 'maverick' && e.t === 'fire') { out.mav++; if (!out.order.includes('mav')) out.order.push('mav'); } } });
  out.hash = s.hash(); return out;
}
const a = sortie(1), b = sortie(1);
ok(a.built, 'trained at the Air Field for its price, it rolls out and parks');
ok(a.gun >= 6 && a.mav === D.ammo && a.minAmmo === 0, `one sortie: ${a.gun} cannon bursts and all ${a.mav} Mavericks`);
ok(a.tank.hp < 5000 - 600 && a.heli.hp === 5000 && !a.canHeli, `the tank takes ${Math.round(5000 - a.tank.hp)} damage; the helicopter beside it is untouched: the A-10 cannot attack aircraft`);
ok(a.air > 100 && a.jet.as === 'parked' && a.jet.ammo === D.ammo, 'it flies home and is re-armed in its hangar');
ok(a.hash === b.hash && a.gun === b.gun, 'a sortie is deterministic');
console.log(`A-10 unit      : ${a.gun} bursts + ${a.mav} Mavericks per sortie, ${Math.round(5000 - a.tank.hp)} damage to a tank, home to re-arm`);
console.log(fails ? `A10: ${fails} FAILURES of ${checks}` : `A10: all ${checks} checks passed`);
process.exit(fails ? 1 : 0);
