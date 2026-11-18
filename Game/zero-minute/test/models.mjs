// Model factory checks, run in Node with a structural stand-in for THREE:
//   - prism geometry is closed and wound outward (it cannot be eyeballed here, so it is proven)
//   - each rebuilt silhouette has the defining features of its real counterpart, in the right places
//   - paints are matte and nothing is emissive
//   - the .glb path parses, fits, orients and replaces the procedural model; bad files fall back
import { THREE, made } from './stub-three.mjs';
globalThis.THREE = THREE;
const { prismPositions, isConvex, parseGLB } = await import('../js/render/meshdata.js');
const MF = await import('../js/render/modelFactory.js');
const { UNITS, POWERS } = await import('../js/sim/factionRegistry.js');
let fails = 0, checks = 0; const ok = (c, msg) => { checks++; if (!c) { fails++; console.log('  FAIL', msg); } };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// ---- helpers over a built rig
function parts(rig) { // every mesh with its position in the body frame (translations only; enough for placement checks)
  const out = [];
  const walk = (o, x, y, z, sc) => { const px = x + o.position.x * sc, py = y + o.position.y * sc, pz = z + o.position.z * sc, s2 = sc * o.scale.x;
    if (o.isMesh) out.push({ name: o.name, x: px, y: py, z: pz, sx: o.scale.x * sc, sy: o.scale.y * sc, sz: o.scale.z * sc, m: o }); else for (const c of o.children) walk(c, px, py, pz, o === rig.body ? sc : s2); };
  for (const c of rig.body.children) walk(c, 0, 0, 0, 1);
  return out;
}
const named = (ps, n) => ps.filter(p => p.name === n);
const ext = (pts, i) => [Math.min(...pts.map(p => p[i])), Math.max(...pts.map(p => p[i]))];
function outward(pos) { // all faces of a convex solid point away from its centroid
  let cx = 0, cy = 0, cz = 0; const n = pos.length / 3; for (let i = 0; i < pos.length; i += 3) { cx += pos[i] / n; cy += pos[i + 1] / n; cz += pos[i + 2] / n; }
  for (let i = 0; i < pos.length; i += 9) {
    const ux = pos[i + 3] - pos[i], uy = pos[i + 4] - pos[i + 1], uz = pos[i + 5] - pos[i + 2], vx = pos[i + 6] - pos[i], vy = pos[i + 7] - pos[i + 1], vz = pos[i + 8] - pos[i + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const mx = (pos[i] + pos[i + 3] + pos[i + 6]) / 3 - cx, my = (pos[i + 1] + pos[i + 4] + pos[i + 7]) / 3 - cy, mz = (pos[i + 2] + pos[i + 5] + pos[i + 8]) / 3 - cz;
    if (nx * mx + ny * my + nz * mz <= 1e-9) return false;
  }
  return true;
}
const P = MF.paint('vanguard', 0), PR = MF.paint('redhammer', 1), PS = MF.paint('sandstorm', 0);

// ---------------------------------------------------------------- 1. prism geometry
{
  let n = 0;
  for (const mode of ['side', 'plan']) for (const k of [3, 4, 5, 8]) for (const flip of [false, true]) {
    let pts = []; for (let i = 0; i < k; i++) { const a = i / k * Math.PI * 2; pts.push([Math.cos(a) * (1 + 0.3 * (i % 2)) + 0.4, Math.sin(a) * 0.7 - 0.2]); }
    if (!isConvex(pts)) pts = pts.map((p, i) => [Math.cos(i / k * 6.2832), Math.sin(i / k * 6.2832)]);
    if (flip) pts.reverse();
    const pos = prismPositions(pts, 1.5, mode); n++;
    ok(pos.length === (2 * (k - 2) + 2 * k) * 9, `prism ${mode} ${k}-gon triangle count`); ok(outward(pos), `prism ${mode} ${k}-gon${flip ? ' (reversed input)' : ''} wound outward`);
  }
  ok(!isConvex([[0, 0], [2, 0], [1, 0.2], [2, 2], [0, 2]]), 'isConvex rejects a dented profile');
  console.log(`prisms         : ${n} test solids closed and wound outward for either input order`);
}

// ---------------------------------------------------------------- 2. every assembly: profiles convex, faces outward, matte, no glow
{
  const rigs = { abrams: MF.ASSEMBLY.abrams(P), overlord: MF.ASSEMBLY.overlord(PR), battlemaster: MF.ASSEMBLY.battlemaster(PR), technical: MF.ASSEMBLY.technical(PS), scoutcar: MF.ASSEMBLY.scoutcar(PR),
    comanche: MF.ASSEMBLY.comanche(P), drone: MF.ASSEMBLY.drone(P), a10: MF.AIRCRAFT.a10(P), rocket: MF.createRocket(), raptor: MF.ASSEMBLY.raptor(P),
    f15e: MF.ASSEMBLY.f15e(P), j11: MF.ASSEMBLY.j11(PR), b2: MF.AIRCRAFT.b2(P), lav25: MF.ASSEMBLY.lav25(P), scudtel: MF.ASSEMBLY.scudtel(PS), fpv: MF.ASSEMBLY.fpv(PS), chinook: MF.ASSEMBLY.chinook(P),
    z10: MF.ASSEMBLY.z10(PR), c130: MF.AIRCRAFT.c130(P), ac130: MF.AIRCRAFT.ac130(P), b737: MF.AIRCRAFT.b737(PS) };
  let prisms = 0, meshes = 0;
  for (const [k, r] of Object.entries(rigs)) r.g.traverse((o) => {
    if (!o.isMesh) return; meshes++;
    if (o.userData.profile) { prisms++; ok(isConvex(o.userData.profile), `${k}/${o.name}: profile is convex`); ok(outward(o.geometry.attributes.position.array), `${k}/${o.name}: faces wound outward`); }
  });
  const glow = made.materials.filter(m => m.emissive !== undefined || m.emissiveIntensity);
  ok(glow.length === 0, `no emissive materials in the factory (${glow.length})`);
  const shiny = made.materials.filter(m => m.roughness < 0.55 && m.color.hex !== 0x121a22 && m.color.hex !== 0xd9a441);   // clear glass and the F-22's gold-tinted canopy
  ok(shiny.length === 0, `every paint and metal is matte (roughness >= 0.55); only glass is glossy (${shiny.map(m => m.color.hex.toString(16))})`);
  const hull = [P.hull, PR.hull, PS.hull];
  ok(hull.every(m => m.roughness >= 0.85 && m.metalness <= 0.1), 'hull paints: roughness >= 0.85, metalness <= 0.1');
  console.log(`assemblies     : ${Object.keys(rigs).length} rigs, ${meshes} meshes, ${prisms} extruded profiles all convex and outward; ${made.materials.length} materials, 0 emissive`);
  { // batch 6: the three jets must not look alike, and the Chinook has its two rotors
    const mats = (r, name) => { const out = new Set(); const walk = (o) => { if (o.isMesh && (!name || o.name === name)) out.add(o.material.color.hex); (o.children || []).forEach(walk); }; walk(r.g); return [...out]; };
    const skin = (r) => mats(r, 'fuselage')[0], can = (r) => mats(r, 'canopy')[0];
    ok(can(rigs.raptor) === 0xd9a441 && can(rigs.f15e) === 0x121a22 && can(rigs.j11) === 0x121a22, 'only the F-22 has the gold-tinted canopy');
    ok(new Set([skin(rigs.raptor), skin(rigs.f15e), skin(rigs.j11)]).size === 3, 'F-22, F-15E and J-11 each have their own body colour (' + [rigs.raptor, rigs.f15e, rigs.j11].map(r => skin(r).toString(16)).join(', ') + ')');
    const count = (r, name) => { let n = 0; const walk = (o) => { if (o.isMesh && o.name === name) n++; (o.children || []).forEach(walk); }; walk(r.g); return n; };
    ok(count(rigs.raptor, 'camopatch') === 2 && count(rigs.f15e, 'conformaltank') === 2 && count(rigs.j11, 'radome') === 1 && count(rigs.f15e, 'camopatch') === 0, 'F-22 camouflage patches, F-15E conformal tanks, J-11 radome');
    ok(rigs.chinook.rotor && rigs.chinook.rotor2 && rigs.chinook.rotor2.position.y > rigs.chinook.rotor.position.y && count(rigs.chinook, 'blade') === 6 && count(rigs.chinook, 'wheel') === 4, 'Chinook: two three-blade rotors in tandem, the aft one higher, four wheels');
    const span = MF.CHINOOK.rotor * MF.CHINOOK.scale; ok(Math.abs(rigs.chinook.rotor.position.x - rigs.chinook.rotor2.position.x) < span && span > 6.5, 'the rotor discs overlap, as on the real aircraft');
  }
  { // batch 7: the Battlemaster must not carry the Overlord's add-ons, and no model may hide parts the view cannot reach
    const bm = MF.ASSEMBLY.battlemaster(PR), ov = MF.ASSEMBLY.overlord(PR);
    const nodes = (r) => { const out = []; const walk = (o) => { out.push(o); (o.children || []).forEach(walk); }; walk(r.g); return out; };
    ok(!nodes(bm).some(o => o.name === 'gatling' || o.name === 'bunker') && !bm.addons, 'Battlemaster: no Gatling turret and no bunker on the model');
    ok(nodes(bm).every(o => o.visible !== false), 'Battlemaster: nothing hidden that could be drawn by mistake');
    ok(ov.addons && ov.addons.gatling.visible === false && ov.addons.bunker.visible === false && nodes(ov).includes(ov.addons.gatling), 'Overlord: still has both add-ons, hidden until they are bought');
    const top = (r) => { let y = -9; for (const o of nodes(r)) if (o.isMesh && o.name !== 'antenna') { let wy = 0; for (let q = o; q && q !== r.g; q = q.parent) wy += q.position.y * (q === o ? 1 : 1); y = Math.max(y, wy); } return y; };
    for (const [k, mk] of Object.entries(MF.ASSEMBLY)) {
      const r = mk(k === 'battlemaster' || k === 'overlord' || k === 'j11' ? PR : P), kept = new Set();
      const ref = (v) => { if (!v || typeof v !== 'object') return; if (v.isObject3D || v.children) { kept.add(v); return; } if (Array.isArray(v)) v.forEach(ref); else for (const q in v) ref(v[q]); };
      for (const q in r) ref(r[q]);
      const stray = nodes(r).filter(o => o.visible === false && !kept.has(o)).map(o => o.name || '?');
      ok(stray.length === 0, k + ': every hidden part is one the view can switch on' + (stray.length ? ' (stray: ' + stray.join(', ') + ')' : ''));
    }
  }
  globalThis.__rigs = rigs;
}
const R = globalThis.__rigs;

// ---------------------------------------------------------------- 3. M1A2 Abrams profile
{
  const ps = parts(R.abrams), hullP = named(ps, 'hull')[0].m.userData.profile, [hx0, hx1] = ext(hullP, 0), hullLen = hx1 - hx0;
  const hullW = 2.26, barrel = named(ps, 'barrel')[0], evac = named(ps, 'evacuator')[0], shell = named(ps, 'turretshell')[0];
  ok(named(ps, 'roadwheel').length === 14 && named(ps, 'roadwheel').filter(p => p.z > 0).length === 7, 'Abrams: 7 road wheels per side');
  ok(named(ps, 'sprocket').every(p => p.x < 0) && named(ps, 'idler').every(p => p.x > 0) && named(ps, 'sprocket').length === 2, 'Abrams: rear drive sprockets, front idlers');
  ok(named(ps, 'skirt').length === 2, 'Abrams: side skirts');
  const brl = barrel.sy, ratio = brl / hullLen; ok(ratio > 0.6 && ratio < 0.72, `Abrams: barrel/hull length ${ratio.toFixed(2)} (real 5.28/7.93 = 0.67)`);
  const along = (evac.x - (barrel.x - brl / 2)) / brl; ok(along > 0.35 && along < 0.65 && evac.sx > barrel.sx * 1.3, `Abrams: bore evacuator at ${(along * 100).toFixed(0)}% of the barrel, fatter than the tube`);
  const tp = shell.m.userData.profile, tw = ext(tp, 1)[1] - ext(tp, 1)[0], tl = ext(tp, 0)[1] - ext(tp, 0)[0], th = 0.46;
  ok(tw / hullW > 0.75 && th / tl < 0.25, `Abrams: turret wide (${(tw / hullW * 100).toFixed(0)}% of hull width) and low (${(th / tl).toFixed(2)} height/length)`);
  ok(tp.filter(p => p[0] > 1.2).every(p => Math.abs(p[1]) < tw * 0.3), 'Abrams: turret front tapers to wedge cheeks');
  const bustle = named(ps, 'bustle')[0], rack = named(ps, 'bustlerack');
  ok(bustle && bustle.x < shell.x + ext(tp, 0)[0] + 0.2 && rack.length >= 3 && rack.every(p => p.x < bustle.x), 'Abrams: rear turret bustle with a stowage rack behind it');
  const glacis = hullP.find(p => p[1] === 1.02 && p[0] > 0), nose = hullP.find(p => p[0] === hx1 && p[1] > 0.8), slope = Math.atan2(glacis[1] - nose[1], nose[0] - glacis[0]) * 180 / Math.PI;
  ok(slope > 4 && slope < 15, `Abrams: long shallow glacis (${slope.toFixed(1)} deg from horizontal)`);
  const top = Math.max(...ps.filter(p => !['antenna', 'aamg'].includes(p.name)).map(p => p.y + (p.m.userData.profile ? 0.23 : 0))); ok(top / hullLen < 0.36, `Abrams: low-slung, roof height/hull length ${(top / hullLen).toFixed(2)} (real 0.31)`);
  ok(named(ps, 'turretring').length === 1 && named(ps, 'turretring')[0].sx > 0.6, 'Abrams: turret ring');
  ok(R.abrams.turret && R.abrams.muzzle > 4.5, 'Abrams: turret rig and muzzle point');
  console.log(`M1A2 profile   : hull ${hullLen.toFixed(2)} x ${hullW} m, 14 road wheels, barrel ${brl} m (${ratio.toFixed(2)} of hull), evacuator at ${(along * 100).toFixed(0)}%, wedge turret + bustle rack, glacis ${slope.toFixed(1)} deg`);
  globalThis.__abramsSlope = slope;
}
// ---------------------------------------------------------------- 4. Soviet heavy (dual barrel) and Battlemaster
{
  const ps = parts(R.overlord), barrels = named(ps, 'barrel').filter(p => p.sy > 3), hullP = named(ps, 'hull')[0].m.userData.profile;
  ok(barrels.length === 2 && near(barrels[0].z, -barrels[1].z, 1e-6) && barrels[0].z !== 0, 'Heavy: two main guns side by side');
  ok(named(ps, 'evacuator').length === 2, 'Heavy: bore evacuator on each gun');
  const era = named(ps, 'era'); ok(era.length >= 20 && era.some(p => p.m.parent === R.overlord.turret) && era.some(p => Math.abs(p.z) > 1.4), `Heavy: ${era.length} reactive armour bricks on glacis, turret and skirts`);
  const shell = named(ps, 'turretshell')[0]; ok(shell.m.geometry.kind === 'sphere', 'Heavy: rounded cast turret (dome, not a box)');
  const drums = named(ps, 'fueldrum'), rear = ext(hullP, 0)[0]; ok(drums.length === 2 && drums.every(d => d.x < rear), 'Heavy: two fuel drums hung behind the hull rear');
  ok(named(ps, 'log').length === 1 && named(ps, 'snorkel').length === 1, 'Heavy: unditching log and snorkel tube');
  const g0 = hullP.find(p => p[1] === 1.26 && p[0] > 0), n0 = hullP.find(p => p[0] === 2.95), slope = Math.atan2(g0[1] - n0[1], n0[0] - g0[0]) * 180 / Math.PI;
  ok(slope > globalThis.__abramsSlope + 5, `Heavy: glacis steeper than the Abrams (${slope.toFixed(1)} deg)`);
  ok(named(ps, 'roadwheel').length === 12, 'Heavy: 6 large road wheels per side');
  ok(R.overlord.addons.gatling.visible === false && R.overlord.addons.bunker.visible === false, 'Heavy: hardpoints present, hidden until fitted');
  const bm = R.battlemaster, bps = parts(bm);
  ok(named(bps, 'barrel').filter(p => p.m.parent === bm.turret).length === 1 && near(bm.body.scale.x, 0.76, 1e-9) && !bm.addons, 'Battlemaster: single gun, same hull at 0.76 scale, no hardpoints');
  console.log(`Soviet heavy   : dual 125 mm with evacuators, cast dome turret, ${era.length} ERA bricks, 2 rear fuel drums, log + snorkel, glacis ${slope.toFixed(1)} deg; Battlemaster = single-gun 0.76 scale`);
}
// ---------------------------------------------------------------- 5. Technical
{
  const r = R.technical, ps = parts(r), cab = named(ps, 'cab')[0].m.userData.profile, bed = named(ps, 'flatbed')[0];
  ok(named(ps, 'wheel').length === 4, 'Technical: four road wheels');
  ok(bed.x + bed.sx / 2 <= ext(cab, 0)[0] + 0.05 && named(ps, 'bedside').every(p => p.y + p.sy / 2 < ext(cab, 1)[1] - 0.3), 'Technical: open flatbed behind the cab, sides well below the roof line');
  const pin = named(ps, 'pintle')[0]; ok(pin && pin.x > bed.x - bed.sx / 2 && pin.x < bed.x + bed.sx / 2 && pin.y > bed.y, 'Technical: pintle mount standing in the bed');
  const [mg, hm, cn] = r.tiers, count = (g, n) => { let c = 0; g.traverse(o => { if (o.isMesh && o.name === n) c++; }); return c; };
  ok(count(mg, 'barrel') === 1 && count(hm, 'barrel') === 1 && count(cn, 'barrel') === 2 && r.tiers.every(g => count(g, 'tube') === 0), 'Technical: machine gun, heavy machine gun, twin machine guns; no rocket pod');
  ok(mg.visible && !hm.visible && !cn.visible && mg.parent === r.turret, 'Technical: starts with the machine gun; heavier fits appear with salvage tiers');
  console.log('Technical      : pickup cab + open flatbed, pintle mount with gunner, 3 weapon fits (HMG / twin cannon / 12-tube pod)');
}
// ---------------------------------------------------------------- 6. Attack helicopter
{
  const r = R.comanche, ps = parts(r), can = named(ps, 'canopy').sort((a, b) => b.x - a.x);
  ok(can.length === 2 && can[0].x - can[1].x > 0.5 && can[1].y > can[0].y + 0.15, 'Helicopter: two cockpits in tandem, rear seat stepped up');
  const wings = named(ps, 'stubwing'), pods = named(ps, 'pod');
  ok(wings.length === 2 && wings[0].z === -wings[1].z && pods.length === 2 && pods.every(p => p.y < wings[0].y && Math.abs(p.z) > 1), 'Helicopter: stub wings with a missile pod under each');
  let blades = 0, tail = 0; r.rotor.traverse(o => { if (o.name === 'blade') blades++; }); r.rotorTail.traverse(o => { if (o.name === 'tailblade') tail++; });
  const fus = named(ps, 'fuselage')[0].m.userData.profile;
  ok(blades === 5 && r.rotor.position.y > ext(fus, 1)[1] && Math.abs(r.rotor.position.x) < 0.3, 'Helicopter: 5-blade main rotor on a mast above the fuselage');
  ok(tail >= 4 && r.rotorTail.position.x < -3 && named(ps, 'fenestron').length === 2, 'Helicopter: shrouded tail rotor at the end of the boom');
  ok(named(ps, 'stabilizer')[0].y > named(ps, 'fin')[0].y, 'Helicopter: T-tail');
  const len = ext(fus, 0)[1] - ext(fus, 0)[0], w = 0.9; ok(len / w > 4, `Helicopter: sleek fuselage (${(len / w).toFixed(1)} : 1)`);
  ok(r.turret.position.y < 0 && r.turret.position.x > 1.5, 'Helicopter: chin gun turret under the nose');
  console.log(`Helicopter     : tandem stepped cockpit, ${(len / w).toFixed(1)}:1 fuselage, stub wings + pods, 5-blade main rotor, shrouded tail rotor, T-tail, chin gun`);
}
// ---------------------------------------------------------------- 7. A-10 Thunderbolt II
{
  const r = R.a10, ps = parts(r), wings = named(ps, 'wing'), eng = named(ps, 'engine'), fins = named(ps, 'fin'), tp = named(ps, 'tailplane')[0], fus = named(ps, 'fuselage')[0];
  const nose = named(ps, 'nose')[0], gun = named(ps, 'gau8')[0], can = named(ps, 'canopy')[0];
  ok(wings.length === 4 && wings.every(p => p.m.rotation.y === 0), 'A-10: wing panels have zero sweep');
  const span = 2 * Math.max(...wings.map(p => Math.abs(p.z) + p.sz / 2)), noseTip = nose.x + nose.m.geometry.params[2] / 2, tail = Math.min(...ps.map(p => p.x - (p.name === 'tailcone' ? 0.75 : 0))), length = noseTip - tail;
  const chord = Math.max(...wings.map(p => p.sx));
  ok(span / length > 0.95 && span / length < 1.2, `A-10: span/length ${(span / length).toFixed(2)} (real 17.53/16.26 = 1.08)`);
  ok(span / chord > 5.5, `A-10: long wing, span/chord ${(span / chord).toFixed(1)}`);
  const le = Math.max(...wings.map(p => p.x + p.sx / 2)), te = Math.min(...wings.map(p => p.x - p.sx / 2)), fr = fus.sx;
  ok(eng.length === 2 && eng[0].z === -eng[1].z && eng.every(e => e.y - e.sx > 0.3 && e.x + e.sy / 2 < te && e.x - e.sy / 2 > tp.x && Math.abs(e.z) > fr), 'A-10: twin turbofan pods, above the fuselage, aft of the wing, ahead of the tail, outboard of the body');
  ok(named(ps, 'intake').length === 2 && named(ps, 'exhaust').length === 2 && named(ps, 'enginepylon').length === 2, 'A-10: each pod has an intake, an exhaust and a pylon');
  ok(fins.length === 2 && fins.every(f => near(Math.abs(f.z), tp.sz / 2, 0.1) && f.y > tp.y) && !ps.some(p => p.name === 'fin' && p.z === 0), 'A-10: twin fins on the tailplane tips (H-tail), no centre fin');
  ok(can.m.geometry.kind === 'sphere' && can.x - can.sx > le && can.y > fr * 0.8, 'A-10: bubble canopy, forward of the wing');
  const gunTip = gun.x + gun.sy / 2; ok(gunTip > noseTip + 0.5 && gun.y < 0, `A-10: GAU-8 protrudes ${(gunTip - noseTip).toFixed(2)} m beyond the nose, below the centreline`);
  ok(r.stores.length === UNITS.v_a10.ammo && named(ps, 'maverick').length === 4 && r.stores.every(st => st.position.y < wings[0].y) && r.gear && r.ground > 1, `A-10: ${UNITS.v_a10.ammo} Mavericks under the wings, one node each, and landing gear`);
  ok(named(ps, 'gearpod').length === 2, 'A-10: main gear pods under the wing');
  console.log(`A-10           : ${length.toFixed(1)} m long, ${span.toFixed(1)} m span (ratio ${(span / length).toFixed(2)}), unswept wing, 2 high rear turbofans, H-tail, bubble canopy, GAU-8 ${(gunTip - noseTip).toFixed(2)} m proud of the nose, 6 rockets`);
}
// ---------------------------------------------------------------- 8. external .glb path
{
  // build a tiny valid GLB: a 1 x 0.5 x 3 "hull" box (long axis Z, as glTF models face +Z) with a child "Turret" box
  const boxMesh = (sx, sy, sz) => { const p = []; for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) p.push(x * sx / 2, y * sy / 2, z * sz / 2);
    return { pos: new Float32Array(p), idx: new Uint16Array([0, 1, 3, 0, 3, 2, 4, 6, 7, 4, 7, 5, 0, 4, 5, 0, 5, 1, 2, 3, 7, 2, 7, 6, 0, 2, 6, 0, 6, 4, 1, 5, 7, 1, 7, 3]) }; };
  const makeGLB = (extra = {}) => {
    const a = boxMesh(1, 0.5, 3), b = boxMesh(0.6, 0.3, 0.8), chunks = [a.pos, a.idx, b.pos, b.idx].map(t => new Uint8Array(t.buffer));
    const views = []; let off = 0; for (const c of chunks) { views.push({ buffer: 0, byteOffset: off, byteLength: c.length }); off += c.length; off += (4 - off % 4) % 4; }
    const bin = new Uint8Array(off); chunks.forEach((c, i) => bin.set(c, views[i].byteOffset));
    const json = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: 'Hull', mesh: 0, children: [1] }, { name: 'Turret', mesh: 1, translation: [0, 0.4, 0.2] }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }, { primitives: [{ attributes: { POSITION: 2 }, indices: 3, material: 0 }] }],
      materials: [{ name: 'od', pbrMetallicRoughness: { baseColorFactor: [0.2, 0.25, 0.12, 1], metallicFactor: 0.05, roughnessFactor: 0.9 } }],
      accessors: [{ bufferView: 0, componentType: 5126, count: 8, type: 'VEC3' }, { bufferView: 1, componentType: 5123, count: 36, type: 'SCALAR' }, { bufferView: 2, componentType: 5126, count: 8, type: 'VEC3' }, { bufferView: 3, componentType: 5123, count: 36, type: 'SCALAR' }],
      bufferViews: views, buffers: [{ byteLength: bin.length }], ...extra };
    let js = new TextEncoder().encode(JSON.stringify(json)); const pad = (4 - js.length % 4) % 4; const jp = new Uint8Array(js.length + pad).fill(0x20); jp.set(js);
    const out = new ArrayBuffer(12 + 8 + jp.length + 8 + bin.length), dv = new DataView(out), u8 = new Uint8Array(out);
    dv.setUint32(0, 0x46546C67, true); dv.setUint32(4, 2, true); dv.setUint32(8, out.byteLength, true);
    dv.setUint32(12, jp.length, true); dv.setUint32(16, 0x4E4F534A, true); u8.set(jp, 20);
    dv.setUint32(20 + jp.length, bin.length, true); dv.setUint32(24 + jp.length, 0x004E4942, true); u8.set(bin, 28 + jp.length);
    return out;
  };
  const d = parseGLB(makeGLB());
  ok(d.triangles === 24 && d.roots.length === 1 && d.roots[0].name === 'Hull' && d.roots[0].children[0].name === 'Turret', 'GLB: node tree and triangle count parsed');
  ok(near(d.bounds.min[2], -1.5, 1e-6) && near(d.bounds.max[2], 1.5, 1e-6) && near(d.bounds.max[1], 0.55, 1e-6), 'GLB: bounds include child node transforms');
  ok(d.materials[0].roughness === 0.9 && near(d.materials[0].color[1], 0.25, 1e-9), 'GLB: PBR base colour / roughness read');
  let threw = 0; for (const bad of [new ArrayBuffer(40), makeGLB({ extensionsRequired: ['KHR_draco_mesh_compression'] })]) { try { parseGLB(bad); } catch (e) { threw++; } }
  ok(threw === 2, 'GLB: non-GLB data and Draco-compressed files are rejected, not half-loaded');
  // through the factory: manifest + files served by a fake fetch
  const files = { 'models/manifest.json': JSON.stringify({ _readme: 'x', abrams: 'abrams.glb', overlord: { file: 'broken.glb' }, comanche: 'missing.glb' }), 'models/abrams.glb': makeGLB(), 'models/broken.glb': new ArrayBuffer(64) };
  globalThis.fetch = async (url) => { const f = files[url]; return { ok: f !== undefined, status: f !== undefined ? 200 : 404, json: async () => JSON.parse(f), arrayBuffer: async () => f }; };
  const rep = await MF.loadExternalModels();
  ok(rep.loaded.join() === 'abrams' && rep.failed.length === 2, `GLB: 1 model loaded, 2 bad entries reported and skipped (${rep.failed.map(f => f.split(':')[0])})`);
  const tank = MF.createModel({ kind: 'unit', type: 'v_tank', team: 0 }), heavy = MF.createModel({ kind: 'unit', type: 'r_overlord', team: 1 }), heli = MF.createModel({ kind: 'unit', type: 'v_comanche', team: 0 });
  ok(tank.source === 'glb' && heavy.source === 'assembly' && heli.source === 'assembly', 'GLB: supplied model replaces the procedural one; broken and missing files fall back to procedural');
  const fit = tank.body.children[0];
  ok(near(fit.scale.x, UNITS.v_tank.radius * 2.3 / 3, 1e-9) && near(fit.rotation.y, Math.PI / 2, 1e-9), 'GLB: auto-scaled to the unit length and turned from glTF +Z to face +X');
  ok(near(fit.children[0].position.y, 0.25, 1e-9), 'GLB: ground vehicles sit on their lowest point');
  ok(tank.turret && tank.turret.name === 'Turret' && tank.noRecoil === true && tank.body && tank.g, 'GLB: node named "Turret" becomes the aiming turret');
  globalThis.fetch = async () => ({ ok: false, status: 404 });
  const none = await MF.loadExternalModels('nowhere/'); ok(none.loaded.length === 0 && none.failed.length === 0, 'GLB: no manifest means no external models and no errors');
  console.log('external .glb  : parse, bounds, materials, auto-fit, orientation, turret node, fallback on bad or missing files');
}
// ---------------------------------------------------------------- F-22 Raptor: proportions and defining features
{
  const r = MF.ASSEMBLY.raptor(P), F = MF.RAPTOR, pts = (m) => { const a = m.geometry.attributes.position.array, o = []; for (let i = 0; i < a.length; i += 3) o.push([a[i] + m.position.x, a[i + 1] + m.position.y, a[i + 2] + m.position.z]); return o; };
  const by = (n) => r.body.children.filter(c => c.name === n), all = (n) => by(n).flatMap(pts);
  const wing = all('wing'), tail = all('tailplane'), fus = all('fuselage').concat(all('chine'), all('forebody'), tail);
  const len = ext(fus, 0)[1] - ext(fus, 0)[0], span = ext(wing, 2)[1] - ext(wing, 2)[0], tspan = ext(tail, 2)[1] - ext(tail, 2)[0];
  ok(near(span / len, F.span / F.length, 0.02), `wingspan / length ${(span / len).toFixed(3)} matches the real F-22 (${(F.span / F.length).toFixed(3)})`);
  ok(near(tspan / span, F.tailSpan / F.span, 0.02), `tailplane span / wingspan ${(tspan / span).toFixed(3)} matches (${(F.tailSpan / F.span).toFixed(3)})`);
  // leading-edge sweep of one wing: the two foremost corners
  const w1 = pts(by('wing')[1]).filter(p => p[1] > 0), le = [...new Map(w1.map(p => [p[0].toFixed(3) + p[2].toFixed(3), p])).values()].sort((a, b) => b[0] - a[0]).slice(0, 2);
  const sweep = Math.atan2(Math.abs(le[0][0] - le[1][0]), Math.abs(le[0][2] - le[1][2])) * 180 / Math.PI;
  ok(near(sweep, 42, 1), `wing leading edge swept ${sweep.toFixed(1)} degrees (real: 42)`);
  const fins = by('fin'); ok(fins.length === 2 && near(Math.abs(fins[0].rotation.x) * 180 / Math.PI, 28, 0.5) && fins[0].rotation.x === -fins[1].rotation.x && Math.sign(fins[1].rotation.x) === Math.sign(fins[1].position.z), 'twin fins canted 28 degrees outward');
  ok(ext(tail, 0)[0] < Math.min(...by('nozzle').map(n => n.position.x - n.scale.x / 2)) && ext(tail, 0)[0] === ext(fus, 0)[0], 'tailplanes reach aft of the nozzles: they are the rearmost point');
  ok(by('canopy').length === 1 && by('intake').length === 2 && by('nozzle').length === 2 && by('idpanel').length === 2, 'one-piece canopy, two side intakes, two flat nozzles, team panels on both fins');
  ok(by('intake').every(i => i.position.x < by('canopy')[0].position.x + 0.9 && i.position.x > by('wing')[0].position.x && Math.abs(i.position.z) > 0.5), 'intakes sit beside the cockpit, ahead of the wing');
  ok(r.gear && r.gear.children.filter(c => c.name === 'wheel').length === 3 && r.ground > 1, 'tricycle landing gear in its own group so it can retract');
  ok(UNITS.v_raptor.model === 'raptor' && MF.createModel({ kind: 'unit', type: 'v_raptor', team: 0 }).source === 'assembly', 'the Raptor unit uses this model');
  console.log(`F-22 Raptor    : span/length ${(span / len).toFixed(3)} (real ${(F.span / F.length).toFixed(3)}) | tail/wing span ${(tspan / span).toFixed(3)} (real ${(F.tailSpan / F.span).toFixed(3)}) | sweep ${sweep.toFixed(1)} deg | fins canted 28 deg | gear retracts`);
}
// ---- batch 10: C-130 / AC-130 from real dimensions, Z-10, airliner
{
  const H = MF.HERCULES, K = H.scale, c = R.c130, ac = R.ac130, ps = parts(c), pa = parts(ac);
  const prof = (rig, name, i) => { const out = []; rig.body.traverse(o => { if (o.isMesh && o.name === name && o.userData.profile) for (const p of o.userData.profile) out.push(p[i]); }); return out; };
  const span = 2 * Math.max(...prof(c, 'wingouter', 1).map(Math.abs)), fin = Math.max(...prof(c, 'fin', 1)), tail = 2 * Math.max(...prof(c, 'tailplane', 1).map(Math.abs));
  const nose = named(ps, 'radome')[0], len = nose.x + nose.sx - Math.min(...prof(c, 'fin', 0));
  ok(near(span, H.span * K, 0.01) && near(span / len, H.span / H.length, 0.06), `C-130: span ${span.toFixed(1)} and span/length ${(span / len).toFixed(2)} (real ${(H.span / H.length).toFixed(2)})`);
  ok(near(tail, H.tailSpan * K, 0.01) && near(tail / span, H.tailSpan / H.span, 0.01), 'C-130: tailplane is ' + (tail / span).toFixed(2) + ' of the wing span, as on the real aircraft');
  const nac = named(ps, 'nacelle'), wing = named(ps, 'wingcentre')[0], fus = named(ps, 'fuselage')[0];
  ok(nac.length === 4 && nac.every(n => n.y < wing.y) && H.engines.every(e => nac.filter(n => near(Math.abs(n.z), e * K, 0.01)).length === 2), 'C-130: four nacelles under the wing at the real engine stations');
  ok(c.props.length === 4 && c.props.every(p => p.children.filter(m => m.name === 'propblade').length === 2 && near(p.children[0].scale.y, H.prop * K, 1e-9)), 'C-130: four four-blade propellers (two crossed blades each) of the real diameter, each its own turning part');
  ok(wing.y > fus.y + fus.sx * 0.9 && named(ps, 'gearfairing').length === 2 && named(ps, 'ramp').length === 1, 'C-130: high wing on top of the fuselage, main-gear fairings, tail ramp');
  ok(fin > fus.sx * 3.5 && named(ps, 'afterbody')[0].m.rotation.z < -Math.PI / 2, `C-130: tall fin (${fin.toFixed(1)} above the centreline) over an upswept after body`);
  ok(named(ps, 'howitzer').length === 0 && named(pa, 'howitzer').length === 1 && named(pa, 'rotarycannon').length === 1 && named(pa, 'sensorball').length === 1 && [...named(pa, 'howitzer'), ...named(pa, 'rotarycannon')].every(g => g.z < 0) && ac.guns.length === 2,
    'AC-130: the same airframe with a howitzer, a rotary cannon and a sensor ball, guns out of the port side; the C-130 has none');
  const z = R.z10, pz = parts(z), blades = (g) => { let n = 0; g.traverse(o => { if (o.isMesh && /blade/.test(o.name)) n++; }); return n; };
  ok(blades(z.rotor) === MF.Z10.blades && blades(z.rotorTail) === 2 && named(pz, 'canopy').length === 2 && named(pz, 'canopy')[0].y < named(pz, 'canopy')[1].y, 'Z-10: five-blade main rotor, scissor tail rotor, two stepped cockpits in tandem');
  ok(named(pz, 'stubwing').length === 2 && named(pz, 'missilerack').length === 2 && named(pz, 'rocketpod').length === 2 && named(pz, 'wheel').length === 2 && named(pz, 'tailwheel').length === 1 && z.turret, 'Z-10: stub wings with a missile rack and a rocket pod each, fixed main wheels and a tailwheel, chin cannon turret');
  ok(UNITS.r_hind.model === 'z10' && UNITS.r_hind.name === 'Z-10 Gunship', 'the Hind is now the Z-10 Gunship');
  const a = R.b737, pb = parts(a); ok(named(pb, 'engine').length === 2 && named(pb, 'idpanel').length === 0 && named(pb, 'cheatline').length === 2, 'airliner: twin-jet with no team markings');
  console.log(`hercules       : span ${span.toFixed(1)}, length ${len.toFixed(1)}, fin ${fin.toFixed(1)}; 4 nacelles, 4 propellers; AC-130 guns to port | Z-10 ${MF.Z10.blades}-blade rotor`);
}

// ---------------------------------------------------------------- batch 12: Russia, Europe and the H-6, each against its real counterpart
{
  const A = MF.ASSEMBLY, K = MF.ARMOR.K, PU = MF.paint('ursa', 0), PE = MF.paint('aegis', 0), PC = MF.paint('redhammer', 0);
  const X = (ps) => { const xs = []; for (const q of ps) { const h = Math.abs(q.sx) / 2; xs.push(q.x - h, q.x + h); } return [Math.min(...xs), Math.max(...xs)]; };
  const hullLen = (rig) => { const t = named(parts(rig), 'track'); const a = t[0].m.geometry.attributes.position.array; let lo = 1e9, hi = -1e9; for (let i = 0; i < a.length; i += 3) { lo = Math.min(lo, a[i]); hi = Math.max(hi, a[i]); } return hi - lo; };
  // tracked vehicles: hull length matches the real one at the shared scale, and each has what makes it recognisable
  const tanks = { t90: [PU, 'u_tank'], t14: [PU, 'u_armata'], tunguska: [PU, 'u_tunguska'], tos1: [PU, 'u_tos'], leopard2: [PE, 'e_tank'], kf51: [PE, 'e_panther'], laserleo: [PE, 'e_laserleo'], gepard: [PE, 'e_gepard'], pzh2000: [PE, 'e_pzh'] };
  const R = {}; for (const k in tanks) { R[k] = A[k](tanks[k][0]); const want = MF.ARMOR[k].length * K, got = hullLen(R[k]); ok(near(got, want, want * 0.06) && UNITS[tanks[k][1]].model === k, `${UNITS[tanks[k][1]].name}: hull ${got.toFixed(2)} long for a real ${MF.ARMOR[k].length} m (scale ${K})`); }
  const P_ = (k) => parts(R[k]);
  ok(named(P_('t90'), 'shtoralens').length === 2 && named(P_('t90'), 'fueldrum').length === 2 && named(P_('t90'), 'evacuator').length === 1 && named(P_('t90'), 'roadwheel').length === 12 && R.t90.turret, 'T-90: two red Shtora dazzlers, two fuel drums, fume extractor, six road wheels a side');
  ok(named(P_('t14'), 'roadwheel').length === 14 && named(P_('t14'), 'crewhatch').length === 3 && named(P_('t14'), 'apstube').length === 10 && named(P_('t14'), 'evacuator').length === 0 && named(P_('t14'), 'thermalsleeve').length === 1 && named(P_('t14'), 'radarpanel').length === 4 && named(P_('t14'), 'sidearmor').length === 2 && R.t14.turretX < -0.6, 'T-14 Armata: seven road wheels a side, three crew hatches in the hull, an unmanned turret set back with protection tubes, no fume extractor');
  ok(named(P_('tunguska'), 'gunbarrel').length === 4 && named(P_('tunguska'), 'missiletube').length === 8 && named(P_('tunguska'), 'trackradar').length === 1 && named(P_('tunguska'), 'searchradar').length === 1, 'Tunguska: four 30 mm barrels, eight missile tubes, a tracking radar and a search radar');
  ok(named(P_('tos1'), 'tube').length === MF.ARMOR.tos1.tubes && named(P_('tos1'), 'rocketpack').length === 1 && !R.tos1.turret && Math.abs(R.tos1.launcher.rotation.z) > 0.2, 'TOS-1A: 24 rocket tubes in a raised pack, no gun turret');
  const leoGun = named(P_('leopard2'), 'barrel')[0], t90Gun = named(P_('t90'), 'barrel')[0];
  ok(near(leoGun.sy, MF.ARMOR.leopard2.gun * K, 0.05) && leoGun.sy > t90Gun.sy * 1.15 && named(P_('leopard2'), 'roadwheel').length === 14 && named(P_('leopard2'), 'turretshell')[0].m.userData.profile.length === 5, 'Leopard 2A6: the L/55 gun is far longer than the T-90 gun, seven road wheels a side, a five-sided arrowhead turret');
  ok(named(P_('kf51'), 'barrel')[0].sx > leoGun.sx * 1.2 && named(P_('kf51'), 'rws').length === 1 && named(P_('kf51'), 'dronetube').length === 2, 'KF51 Panther: a thicker 130 mm gun, a roof weapon station and a loitering-munition launcher');
  ok(named(P_('laserleo'), 'beamdirector').length === 1 && named(P_('laserleo'), 'lens').length === 1 && named(P_('laserleo'), 'barrel').length === 0, 'Laser Leopard: a beam director with a lens, and no gun');
  ok(named(P_('gepard'), 'gunbarrel').length === 2 && named(P_('gepard'), 'trackradar').length === 1 && named(P_('gepard'), 'searchradar').length === 1 && Math.abs(named(P_('gepard'), 'gunbarrel')[0].z) > 0.7, 'Gepard: one 35 mm gun out on each side of the turret, tracking radar in front, search radar behind');
  const pg = named(P_('pzh2000'), 'barrel')[0];
  ok(near(pg.sy, MF.ARMOR.pzh2000.gun * K, 0.05) && pg.sy > hullLen(R.pzh2000) * 0.95 && named(P_('pzh2000'), 'muzzlebrake').length === 1 && R.pzh2000.turretX < -0.5, 'PzH 2000: a gun as long as the hull with a muzzle brake, turret over the back half');
  const bmp = A.bmp3(PU), pb = parts(bmp), puma = A.puma(PE), pp = parts(puma);
  ok(named(pb, 'barrel').length === 1 && named(pb, 'autocannon').length === 1 && named(pb, 'barrel')[0].sx > named(pb, 'autocannon')[0].sx * 2 && named(pb, 'waterjet').length === 2 && named(pb, 'trimvane').length === 1, 'BMP-3: a thick 100 mm gun with a thin 30 mm beside it, two water jets and a trim vane');
  ok(Math.abs(puma.turret.position.z) > 0.2 && named(pp, 'missilebox').length === 1 && named(pp, 'sidearmor').length === 8 && named(pp, 'rearramp').length === 1, 'Puma: turret off the centreline with a missile box on its side, bolt-on side armor, rear ramp');
  // aircraft
  const ka = A.ka52(PU), pk = parts(ka), ti = A.tiger(PE), pt = parts(ti);
  ok(ka.rotor && ka.rotor2 && !ka.rotorTail && ka.rotor2.position.y > ka.rotor.position.y + 0.4 && named(pk, 'blade').length === 2 * MF.KA52.blades && named(pk, 'endplate').length === 2 && named(pk, 'canopy').length === 1, 'Ka-52: two three-blade rotors one above the other, no tail rotor, twin end-plate fins, one wide cockpit');
  ok(ti.rotor && ti.rotorTail && named(pt, 'blade').length === MF.TIGER.blades && named(pt, 'tailblade').length === 3 && named(pt, 'canopy').length === 2 && named(pt, 'mastsight').length === 1 && named(pt, 'mastsight')[0].y > ti.rotor.position.y, 'Tiger: four-blade rotor with the sight above it, three-blade tail rotor, two stepped cockpits');
  const ty = A.typhoon(PE), py = parts(ty), s27 = A.su27(PU), s57 = A.su57(PU);
  ok(named(py, 'canard').length === 2 && named(py, 'fin').length === 1 && named(py, 'tailplane').length === 0 && named(py, 'chinintake').length === 1 && named(py, 'nozzle').length === 2 && ty.stores.length === 2, 'Eurofighter: two canards, one fin, no tailplane, a chin intake, two engines');
  const wing = named(py, 'wing')[0].m.userData.profile, sweep = Math.atan2(Math.abs(wing[1][0] - wing[0][0]), Math.abs(wing[1][1] - wing[0][1])) * 180 / Math.PI;
  ok(near(sweep, MF.TYPHOON.sweep, 1) && near(MF.TYPHOON.span / MF.TYPHOON.length, 10.95 / 15.96, 0.001), `Eurofighter: a ${sweep.toFixed(0)}-degree delta, span / length ${(MF.TYPHOON.span / MF.TYPHOON.length).toFixed(3)} as on the real aircraft`);
  ok(named(parts(s27), 'fin').length === 2 && named(parts(s27), 'stinger').length === 1 && named(parts(s27), 'tailplane').length === 2 && s27.stores.length === 2 && MF.SU27.length === 21.9, 'Su-27: twin fins, tailplanes, the tail sting between the engines');
  ok(named(parts(s57), 'fin').length === 2 && Math.abs(named(parts(s57), 'fin')[0].m.rotation.x) > 0.3 && named(parts(s57), 'lerx').length === 1 && s57.stores.length === 4 && near(MF.SU57.span / MF.SU57.length, 14.1 / 20.1, 0.001), 'Su-57: canted fins, leading-edge extensions, four missiles, real span / length');
  const h = MF.AIRCRAFT.h6(PC), ph = parts(h), hx = X(ph), wz = Math.max(...named(ph, 'wing').map(q => Math.max(...q.m.userData.profile.map(v => Math.abs(v[1])))));
  ok(near((hx[1] - hx[0]) / (2 * wz), MF.H6.length / MF.H6.span, 0.08) && named(ph, 'engine').length === 2 && named(ph, 'fin').length === 1 && named(ph, 'gearpod').length === 2 && named(ph, 'bomb').length === 1 && named(ph, 'radome').length === 1, `H-6: length / span ${((hx[1] - hx[0]) / (2 * wz)).toFixed(2)} (real ${(MF.H6.length / MF.H6.span).toFixed(2)}), two engines in the wing roots, gear pods, one fin, the bomb under the belly`);
  // ships
  const st = A.stereg(PU), fm = A.fremm(PE), ps = parts(st), pf = parts(fm);
  ok(st.ship && st.turret && near(st.turretX, UNITS.u_corvette.mounts[0].x, 0.01) && named(ps, 'mast').length === 1 && named(ps, 'helideck').length === 1 && named(ps, 'canister').length === 4 && MF.SHIPS.stereg.length / MF.SHIPS.stereg.beam > 6, 'Steregushchiy corvette: gun on the forecastle where the game fires it from, enclosed mast, missile canisters, helicopter deck');
  ok(fm.ship && near(fm.turretX, UNITS.e_fremm.mounts[0].x, 0.01) && named(pf, 'radome').length === 1 && named(pf, 'hangar').length === 1 && named(pf, 'cell').length === 9 && MF.SHIPS.fremm.length > MF.SHIPS.stereg.length, 'FREMM frigate: gun where the game fires it from, radar ball on a pyramid mast, missile cells, hangar; longer than the corvette');
  const fr = A.frigate(P), cv = A.corvette(PR);
  ok(near(fr.turretX, UNITS.v_frigate.mounts[0].x, 0.01) && near(cv.turretX, UNITS.r_corvette.mounts[0].x, 0.01) && named(parts(fr), 'lens')[0].y > 7.5 && named(parts(cv), 'waterline').length === 0, 'Frigate and Corvette: gun mounts match the models, the Frigate laser sits on the mast top, no stray waterline box on the Corvette');
  const rh = A.rhib(P), tubes = named(parts(rh), 'collar').map(q => q.m).filter(m => m.rotation.y);
  ok(tubes.length === 2 && tubes.every(m => Math.sign(m.rotation.y) === Math.sign(m.position.z)), 'RHIB: the two bow tubes angle inward and meet at the stem');
  console.log(`batch 12       : 9 tracked vehicles at scale ${K}, BMP-3, Puma, Ka-52, Tiger, Eurofighter, Su-27, Su-57, H-6, 2 warships`);
}
console.log(fails ? `MODELS: ${fails} FAILURES of ${checks}` : `MODELS: all ${checks} checks passed`);
