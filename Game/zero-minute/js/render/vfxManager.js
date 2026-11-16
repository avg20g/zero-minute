// VFX manager. Every effect draws from a fixed pool that is allocated once, at
// construction; nothing here creates a geometry, material, texture or mesh after that.
//   particles  two THREE.InstancedMesh billboard batches (smoke: alpha, fire: additive)
//   decals     one InstancedMesh of crater / scorch quads that fade out after 90 s
//   wrecks     two InstancedMesh batches (charred hulls, blown-off turrets)
//   rings, flash lights, tracers, smoke emitters: fixed-size pools, recycled oldest-first
// Purely cosmetic: own RNG, never feeds back into the sim.
import THREE from '../lib/three.js';
import { heightAt } from '../sim/map.js';
import { patchFow, makeParticleTexture, makeCraterTexture } from './gfx.js';
import { prismPositions } from './meshdata.js';

export const BILLBOARD_VERT = `
attribute vec4 iPS;   // xyz world position, w size in metres
attribute vec4 iCol;
uniform vec3 uTint;
varying vec4 vColor;
varying vec2 vUv;
void main() {
  vColor = vec4( iCol.rgb * uTint, iCol.a );
  vUv = uv;
  vec4 mv = viewMatrix * vec4( iPS.xyz, 1.0 );
  mv.xy += position.xy * iPS.w;
  gl_Position = projectionMatrix * mv;
}`;
export const BILLBOARD_FRAG = `
uniform sampler2D map;
varying vec4 vColor;
varying vec2 vUv;
void main() {
  float a = texture2D( map, vUv ).a * vColor.a;
  if ( a < 0.004 ) discard;
  gl_FragColor = vec4( vColor.rgb, a );
}`;
// Decal and wreck instances carry a fade value; this extends the fog patch on a standard material.
export const FADE_VERT_DECL = 'attribute float iFade; varying float vFade;';
export const FADE_VERT_BODY = 'vFade = iFade;';
export const FADE_FRAG_DECL = 'varying float vFade;';
export const FADE_FRAG_BODY = 'diffuseColor.a *= vFade;';
function patchFade(mat) {
  patchFow(mat); const fow = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh) => {
    fow(sh);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + FADE_VERT_DECL).replace('#include <begin_vertex>', '#include <begin_vertex>\n' + FADE_VERT_BODY);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + FADE_FRAG_DECL).replace('#include <map_fragment>', '#include <map_fragment>\n' + FADE_FRAG_BODY);
  };
  mat.customProgramCacheKey = () => 'fow-fade';
  return mat;
}

// A fixed ring of billboard particles in one instanced draw call. spawn() overwrites the oldest slot.
class Batch {
  constructor(cap, additive, tex) {
    this.cap = cap; this.head = 0; this.live = 0; this.peak = 0; this.spawned = 0;
    this.ps = new Float32Array(cap * 4); this.col = new Float32Array(cap * 4);
    this.vel = new Float32Array(cap * 3); this.life = new Float32Array(cap); this.max = new Float32Array(cap);
    this.s0 = new Float32Array(cap); this.grow = new Float32Array(cap); this.a0 = new Float32Array(cap); this.grav = new Float32Array(cap); this.drag = new Float32Array(cap);
    const g = new THREE.PlaneGeometry(1, 1);
    this.aPS = new THREE.InstancedBufferAttribute(this.ps, 4); this.aCol = new THREE.InstancedBufferAttribute(this.col, 4);
    this.aPS.setUsage(THREE.DynamicDrawUsage); this.aCol.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iPS', this.aPS); g.setAttribute('iCol', this.aCol);
    this.uniforms = { map: { value: tex }, uTint: { value: new THREE.Vector3(1, 1, 1) } };
    const m = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: BILLBOARD_VERT, fragmentShader: BILLBOARD_FRAG, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    this.mesh = new THREE.InstancedMesh(g, m, cap);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = additive ? 11 : 10;
  }
  spawn(x, y, z, vx, vy, vz, life, size, grow, r, g, b, a, grav = 0, drag = 1.5) {
    const i = this.head; this.head = (i + 1) % this.cap; this.spawned++;
    this.ps[i * 4] = x; this.ps[i * 4 + 1] = y; this.ps[i * 4 + 2] = z; this.ps[i * 4 + 3] = size;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = life; this.max[i] = life; this.s0[i] = size; this.grow[i] = grow; this.a0[i] = a; this.grav[i] = grav; this.drag[i] = drag;
    this.col[i * 4] = r; this.col[i * 4 + 1] = g; this.col[i * 4 + 2] = b; this.col[i * 4 + 3] = a;
  }
  update(dt) {
    const { ps, vel, life, max, col } = this; let live = 0;
    for (let i = 0; i < this.cap; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      if (life[i] <= 0) { ps[i * 4 + 3] = 0; col[i * 4 + 3] = 0; continue; }
      live++;
      const k = Math.max(0, 1 - this.drag[i] * dt);
      vel[i * 3] *= k; vel[i * 3 + 2] *= k; vel[i * 3 + 1] = vel[i * 3 + 1] * k - this.grav[i] * dt;
      ps[i * 4] += vel[i * 3] * dt; ps[i * 4 + 1] += vel[i * 3 + 1] * dt; ps[i * 4 + 2] += vel[i * 3 + 2] * dt;
      const t = life[i] / max[i];
      ps[i * 4 + 3] = this.s0[i] + this.grow[i] * (1 - t);
      col[i * 4 + 3] = this.a0[i] * Math.min(1, t * 2.2) * Math.min(1, (1 - t) * 12);
    }
    this.live = live; if (live > this.peak) this.peak = live;
    this.aPS.needsUpdate = true; this.aCol.needsUpdate = true;
  }
}

// Tracer colour by shooter veterancy: standard, Veteran gold, Elite blue, Heroic red.
export const VET_TRACER = [[1, 0.92, 0.6], [1, 0.78, 0.15], [0.35, 0.8, 1], [1, 0.25, 0.2]];
const SEG = 128, RINGS = 12, DECALS = 512, WRECKS = 40, EMITTERS = 48;
export const DECAL_LIFE = 90, DECAL_FADE = 12, WRECK_BURN = 20, WRECK_SINK = 5;
export class VFX {
  constructor(scene, map) {
    this.map = map; this.scene = scene; this.time = 0;
    let s = 4242; this.rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
    const tex = makeParticleTexture();
    this.smoke = new Batch(3600, false, tex); this.fire = new Batch(2600, true, tex);
    scene.add(this.smoke.mesh); scene.add(this.fire.mesh);

    // tracers and beams share one line buffer
    this.tr = []; for (let i = 0; i < SEG; i++) this.tr.push({ on: false, x0: 0, y0: 0, z0: 0, x1: 0, y1: 0, z1: 0, t: 0, dur: 1, len: 1, col: VET_TRACER[0], glow: 1, beam: false });
    this.trPos = new Float32Array(SEG * 6); this.trCol = new Float32Array(SEG * 6);
    const tg = new THREE.BufferGeometry();
    this.trAP = new THREE.BufferAttribute(this.trPos, 3); this.trAC = new THREE.BufferAttribute(this.trCol, 3);
    this.trAP.setUsage(THREE.DynamicDrawUsage); this.trAC.setUsage(THREE.DynamicDrawUsage);
    tg.setAttribute('position', this.trAP); tg.setAttribute('color', this.trAC);
    this.trLines = new THREE.LineSegments(tg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.trLines.frustumCulled = false; this.trLines.renderOrder = 12; scene.add(this.trLines);

    // crater / scorch decals: a ring of DECALS instances; each fades out after DECAL_LIFE seconds
    this.decalHead = 0; this.decalLive = 0; this.decalPeak = 0; this.decalsStamped = 0;
    this.decalBorn = new Float32Array(DECALS).fill(-1e9); this.decalFade = new Float32Array(DECALS);
    const cg = new THREE.PlaneGeometry(1, 1); cg.rotateX(-Math.PI / 2);
    this.aDecalFade = new THREE.InstancedBufferAttribute(this.decalFade, 1); this.aDecalFade.setUsage(THREE.DynamicDrawUsage); cg.setAttribute('iFade', this.aDecalFade);
    const cm = patchFade(new THREE.MeshStandardMaterial({ map: makeCraterTexture(), transparent: true, depthWrite: false, roughness: 1, metalness: 0, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    this.craters = new THREE.InstancedMesh(cg, cm, DECALS);
    this.craters.frustumCulled = false; this.craters.receiveShadow = true; this.craters.renderOrder = 2;
    scene.add(this.craters);
    // wrecks: charred hulls and turrets, two instanced batches sharing one material
    const charred = patchFade(new THREE.MeshStandardMaterial({ color: 0x1a1816, roughness: 1, metalness: 0.1, transparent: true }));
    const geo = (arr) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(arr, 3)); g.computeVertexNormals(); return g; };
    const join = (...parts) => { const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };
    const shift = (arr, x, y, z) => { for (let i = 0; i < arr.length; i += 3) { arr[i] += x; arr[i + 1] += y; arr[i + 2] += z; } return arr; };
    // unit-length hull (1 long): sagging tub, sloped nose, two track runs
    const hullGeo = geo(join(prismPositions([[-0.5, 0.06], [0.44, 0.06], [0.5, 0.14], [0.3, 0.24], [-0.5, 0.22]], 0.34, 'side'),
      shift(prismPositions([[-0.5, 0], [0.46, 0], [0.5, 0.1], [0.46, 0.17], [-0.5, 0.17]], 0.09, 'side'), 0, 0, 0.2), shift(prismPositions([[-0.5, 0], [0.46, 0], [0.5, 0.1], [0.46, 0.17], [-0.5, 0.17]], 0.09, 'side'), 0, 0, -0.2)));
    const turretGeo = geo(join(prismPositions([[0.26, -0.08], [0.26, 0.08], [0.14, 0.19], [-0.22, 0.19], [-0.22, -0.19], [0.14, -0.19]], 0.1, 'plan'),
      shift(prismPositions([[0.2, -0.014], [0.86, -0.014], [0.86, 0.014], [0.2, 0.014]], 0.028, 'side'), 0, 0.01, 0)));
    this.wrecks = []; this.wreckLive = 0; this.wreckPeak = 0; this.wrecksMade = 0;
    this.wreckFade = new Float32Array(WRECKS); this.wreckTFade = new Float32Array(WRECKS);
    this.aWreckFade = new THREE.InstancedBufferAttribute(this.wreckFade, 1); hullGeo.setAttribute('iFade', this.aWreckFade);
    this.aWreckTFade = new THREE.InstancedBufferAttribute(this.wreckTFade, 1); turretGeo.setAttribute('iFade', this.aWreckTFade);
    this.aWreckFade.setUsage(THREE.DynamicDrawUsage); this.aWreckTFade.setUsage(THREE.DynamicDrawUsage);
    this.hulls = new THREE.InstancedMesh(hullGeo, charred, WRECKS); this.turrets = new THREE.InstancedMesh(turretGeo, charred, WRECKS);
    for (const m of [this.hulls, this.turrets]) { m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; scene.add(m); }
    for (let i = 0; i < WRECKS; i++) this.wrecks.push({ on: false, t: 0, x: 0, y: 0, z: 0, f: 0, len: 1, turret: false, blown: false, tx: 0, tz: 0, tf: 0, spin: 0, smoke: 0 });
    this._zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < WRECKS; i++) { this.hulls.setMatrixAt(i, this._zero); this.turrets.setMatrixAt(i, this._zero); }
    for (let i = 0; i < DECALS; i++) this.craters.setMatrixAt(i, this._zero);
    // camera shake (trauma model) and listener position for distance scaling
    this.trauma = 0; this.shakeX = 0; this.shakeY = 0; this.shakeZ = 0; this.lx = 0; this.lz = 0; this.ldist = 90; this.shakeOn = true; this.flashGain = 1;
    this._m = new THREE.Matrix4(); this._p = new THREE.Vector3(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0); this._n = new THREE.Vector3(); this._q2 = new THREE.Quaternion();

    // shockwave rings (fixed pool)
    const rg = new THREE.RingGeometry(0.86, 1, 48); rg.rotateX(-Math.PI / 2);
    this.rings = [];
    for (let i = 0; i < RINGS; i++) {
      const m = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      m.visible = false; m.renderOrder = 13; scene.add(m); this.rings.push({ m, t: 0, dur: 1, r: 1 });
    }
    // flash lights (fixed pool so shaders never recompile)
    this.lights = [];
    for (let i = 0; i < 3; i++) { const l = new THREE.PointLight(0xffc070, 0, 60, 1.6); l.position.set(0, -100, 0); scene.add(l); this.lights.push({ l, t: 0, dur: 1, peak: 0 }); }
    this.emitters = []; for (let i = 0; i < EMITTERS; i++) this.emitters.push({ t: 0, x: 0, z: 0, size: 1, acc: 0 }); // lingering smoke columns (pooled)
    this._e = new THREE.Euler();
  }
  h(x, z) { return heightAt(this.map, Math.min(511, Math.max(0, x)), Math.min(511, Math.max(0, z))); }

  flash(x, y, z, peak, dur) {
    let best = this.lights[0];
    for (const o of this.lights) if (o.t <= 0) { best = o; break; } else if (o.t < best.t) best = o;
    best.l.position.set(x, y, z); best.t = dur; best.dur = dur; best.peak = peak * this.flashGain;
  }
  shock(x, y, z, r, dur, color) {
    let best = this.rings[0];
    for (const o of this.rings) if (o.t <= 0) { best = o; break; } else if (o.t < best.t) best = o;
    best.m.position.set(x, y, z); best.m.material.color.setHex(color); best.t = dur; best.dur = dur; best.r = r; best.m.visible = true;
  }
  // Stamp a scorched crater decal at an impact point. It persists DECAL_LIFE seconds, then fades.
  crater(x, z, size) {
    const i = this.decalHead; this.decalHead = (i + 1) % DECALS; this.decalsStamped++;
    const e = 1.2, hx = this.h(x + e, z) - this.h(x - e, z), hz = this.h(x, z + e) - this.h(x, z - e);
    this._n.set(-hx, 2 * e, -hz).normalize();
    this._q.setFromUnitVectors(this._up, this._n); this._q2.setFromAxisAngle(this._up, this.rnd() * 6.283); this._q.multiply(this._q2);
    this._p.set(x, this.h(x, z) + 0.07, z); const s = size * (0.85 + this.rnd() * 0.4); this._s.set(s, 1, s);
    this._m.compose(this._p, this._q, this._s);
    this.craters.setMatrixAt(i, this._m); this.craters.instanceMatrix.needsUpdate = true;
    this.decalBorn[i] = this.time; this.decalFade[i] = 1; this.aDecalFade.needsUpdate = true;
  }
  // A destroyed vehicle leaves a charred hull that burns, then sinks. `turret` units may lose theirs.
  wreck(x, z, facing, len, turret, blown, turretFacing) {
    let w = null; for (const o of this.wrecks) { if (!o.on) { w = o; break; } if (!w || o.t > w.t) w = o; } // free slot, else the oldest
    w.on = true; w.t = 0; w.x = x; w.z = z; w.y = this.h(x, z); w.f = facing; w.len = len; w.turret = turret; w.blown = turret && blown; w.smoke = 0; this.wrecksMade++;
    const a = this.rnd() * 6.283, d = 2.5 + this.rnd() * 3.5;
    w.tx = w.blown ? x + Math.cos(a) * d : x; w.tz = w.blown ? z + Math.sin(a) * d : z; w.tf = w.blown ? this.rnd() * 6.283 : (turretFacing ?? facing) + (this.rnd() - 0.5) * 0.5; w.spin = (this.rnd() - 0.5) * 9;
    if (w.blown) { this.explosion(x, w.y + 1.2, z, 1.2); this.shake(x, z, 0.5); }
  }
  // Called each frame for a vehicle under 40% health: trailing black engine smoke, intermittent sparks.
  damage(x, y, z, dt, hpFrac) {
    const r = this.rnd;
    if (r() < dt * (5 + (0.4 - hpFrac) * 22)) { const g = 0.05 + r() * 0.07; this.smoke.spawn(x + (r() - 0.5) * 0.6, y + 1.1, z + (r() - 0.5) * 0.6, (r() - 0.5) * 0.8, 1.6 + r() * 1.4, (r() - 0.5) * 0.8, 1.6 + r() * 1.2, 0.9, 3.4, g, g, g, 0.62, -0.5, 0.6); }
    if (r() < dt * 0.9) for (let i = 0; i < 5; i++) { const a = r() * 6.283, v = 2 + r() * 5; this.fire.spawn(x, y + 1, z, Math.cos(a) * v, 2 + r() * 4, Math.sin(a) * v, 0.25 + r() * 0.3, 0.26, 0, 0.75, 0.9, 1, 1, 16, 0.5); }
  }
  // Camera shake. Strength falls off with distance from where the camera is looking.
  setListener(x, z, dist) { this.lx = x; this.lz = z; this.ldist = dist; }
  shake(x, z, power) {
    const d = Math.hypot(x - this.lx, z - this.lz), reach = 70 + this.ldist * 1.2, k = Math.max(0, 1 - d / reach);
    this.trauma = Math.min(1, this.trauma + power * k * k);
  }
  stats() {
    return { particles: { cap: this.smoke.cap + this.fire.cap, live: this.smoke.live + this.fire.live, peak: this.smoke.peak + this.fire.peak, spawned: this.smoke.spawned + this.fire.spawned },
      decals: { cap: DECALS, live: this.decalLive, peak: this.decalPeak, stamped: this.decalsStamped }, wrecks: { cap: WRECKS, live: this.wreckLive, peak: this.wreckPeak, made: this.wrecksMade },
      pools: { tracers: SEG, rings: RINGS, emitters: EMITTERS, lights: this.lights.length } };
  }
  dust(x, y, z, n, spread, size, alpha = 0.34) {
    const r = this.rnd;
    for (let i = 0; i < n; i++) {
      const a = r() * 6.283, v = spread * (0.3 + r() * 0.7), sh = 0.9 + r() * 0.2;
      this.smoke.spawn(x + Math.cos(a) * 0.4, y + 0.2 + r() * 0.4, z + Math.sin(a) * 0.4, Math.cos(a) * v, 0.6 + r() * 1.4, Math.sin(a) * v, 0.8 + r() * 0.9, size * (0.7 + r() * 0.6), size * 2.2, 0.80 * sh, 0.68 * sh, 0.50 * sh, alpha * (0.7 + r() * 0.5), -0.3, 1.8);
    }
  }
  muzzle(x, y, z, a, big) {
    const r = this.rnd, c = Math.cos(a), s = Math.sin(a), k = big ? 1 : 0.42;
    this.fire.spawn(x, y, z, c * 6 * k, 0.5, s * 6 * k, 0.07, 5.2 * k, 3 * k, 1, 0.86, 0.5, 1, 0, 0);
    this.fire.spawn(x + c * 0.9 * k, y, z + s * 0.9 * k, c * 16 * k, 0, s * 16 * k, 0.09, 3 * k, 2 * k, 1, 0.7, 0.3, 0.9, 0, 0);
    if (big) {
      for (let i = 0; i < 5; i++) this.smoke.spawn(x + c * i * 0.5, y, z + s * i * 0.5, c * (5 + r() * 6) + (r() - 0.5) * 3, 0.6 + r(), s * (5 + r() * 6) + (r() - 0.5) * 3, 0.7 + r() * 0.6, 1.4, 3.6, 0.72, 0.7, 0.66, 0.3, -0.4, 2.6);
      this.dust(x - c * 2, this.h(x, z), z - s * 2, 5, 4, 1.6, 0.26);
    }
    this.flash(x, y + 0.6, z, big ? 26 : 7, big ? 0.12 : 0.06);
  }
  // A travelling tracer round. col = [r,g,b]; glow > 1 makes Elite/Heroic rounds read hotter.
  _tracer() { for (const t of this.tr) if (!t.on) { t.on = true; return t; } return null; }
  tracer(x0, y0, z0, x1, y1, z1, speed = 190, col = VET_TRACER[0], glow = 1) {
    const d = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
    const t = this._tracer(); if (!t) return;
    t.x0 = x0; t.y0 = y0; t.z0 = z0; t.x1 = x1; t.y1 = y1; t.z1 = z1; t.t = 0; t.dur = Math.max(0.05, d / speed); t.len = Math.min(0.5, 7 * glow / d); t.col = col; t.glow = glow; t.beam = false;
  }
  // An instant beam (lasers, point defense) that fades out.
  beam(x0, y0, z0, x1, y1, z1, col, dur = 0.14) {
    const t = this._tracer();
    if (t) { t.x0 = x0; t.y0 = y0; t.z0 = z0; t.x1 = x1; t.y1 = y1; t.z1 = z1; t.t = 0; t.dur = dur; t.len = 1; t.col = col; t.glow = 1; t.beam = true; }
    const n = Math.min(14, Math.ceil(Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 3));
    for (let i = 0; i <= n; i++) { const u = i / n; this.fire.spawn(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, z0 + (z1 - z0) * u, 0, 0, 0, dur, 0.7, 0, col[0], col[1], col[2], 0.8, 0, 0); }
    this.fire.spawn(x1, y1, z1, 0, 0, 0, 0.16, 2.2, 1.5, col[0], col[1], col[2], 1, 0, 0);
  }
  explosion(x, y, z, size) {
    const r = this.rnd, f = this.fire, sm = this.smoke;
    f.spawn(x, y + 0.5, z, 0, 0, 0, 0.14, 7 * size, 10 * size, 1, 0.95, 0.75, 1, 0, 0);
    for (let i = 0; i < 9 * size; i++) { const a = r() * 6.283, v = (2 + r() * 7) * size; f.spawn(x, y + 0.4, z, Math.cos(a) * v, 2 + r() * 7 * size, Math.sin(a) * v, 0.25 + r() * 0.35, 2.4 * size, 3.5 * size, 1, 0.5 + r() * 0.3, 0.12, 0.9, 2, 2.5); }
    for (let i = 0; i < 8 * size; i++) { const a = r() * 6.283, v = (1 + r() * 4) * size, g = 0.16 + r() * 0.16; sm.spawn(x, y + 0.6, z, Math.cos(a) * v, 2 + r() * 4, Math.sin(a) * v, 1.2 + r() * 1.4, 2.2 * size, 5 * size, g, g * 0.95, g * 0.9, 0.55, -0.8, 1.4); }
    for (let i = 0; i < 10 * size; i++) { const a = r() * 6.283, v = 8 + r() * 16; f.spawn(x, y + 0.3, z, Math.cos(a) * v, 5 + r() * 12, Math.sin(a) * v, 0.35 + r() * 0.5, 0.42, 0, 1, 0.8, 0.4, 1, 26, 0.6); }
    this.dust(x, y, z, Math.round(8 * size), 5 * size, 1.8 * size, 0.3);
    this.flash(x, y + 2, z, 60 * size, 0.22);
    if (size >= 0.9) this.shake(x, z, 0.16 * size);
  }
  // Fuel-air bomb: fireball dome, ground shockwave, rolling dust wall.
  megaBlast(x, z, R) {
    const r = this.rnd, y = this.h(x, z);
    this.shock(x, y + 0.6, z, R * 1.25, 0.9, 0xffd9a0); this.shock(x, y + 0.5, z, R * 0.7, 0.5, 0xfff4d6); this.shake(x, z, 1);
    this.fire.spawn(x, y + 4, z, 0, 3, 0, 0.5, 30, 46, 1, 0.9, 0.6, 1, 0, 0);
    for (let i = 0; i < 70; i++) { const a = r() * 6.283, d = Math.sqrt(r()) * R * 0.75, v = 4 + r() * 10; this.fire.spawn(x + Math.cos(a) * d, y + 1 + r() * 5, z + Math.sin(a) * d, Math.cos(a) * v, 4 + r() * 10, Math.sin(a) * v, 0.6 + r() * 0.8, 6 + r() * 6, 9, 1, 0.45 + r() * 0.35, 0.1, 0.9, 1, 1.6); }
    for (let i = 0; i < 60; i++) { const a = i / 60 * 6.283, v = R * (0.9 + r() * 0.5), g = 0.75 + r() * 0.15; this.smoke.spawn(x + Math.cos(a) * 3, y + 0.8, z + Math.sin(a) * 3, Math.cos(a) * v, 1 + r() * 2, Math.sin(a) * v, 1.6 + r(), 4, 10, g, g * 0.86, g * 0.66, 0.5, -0.2, 1.3); }
    for (let i = 0; i < 40; i++) { const a = r() * 6.283, d = r() * R * 0.5, g = 0.1 + r() * 0.12; this.smoke.spawn(x + Math.cos(a) * d, y + 3 + r() * 6, z + Math.sin(a) * d, 0, 6 + r() * 7, 0, 3 + r() * 2.5, 8, 16, g, g, g, 0.6, -0.6, 0.5); }
    this.flash(x, y + 10, z, 260, 0.5); this.crater(x, z, R * 0.9);
    for (let i = 0; i < 6; i++) { const a = r() * 6.283, d = 4 + r() * R * 0.5; this.crater(x + Math.cos(a) * d, z + Math.sin(a) * d, 5 + r() * 4); }
  }
  // Nuclear mushroom: a white flash, a fat stem of rising smoke and a rolling cap that hangs over the crater.
  mushroom(x, z, R) {
    const r = this.rnd, y = this.h(x, z);
    this.flash(x, y + 20, z, 520, 0.9);
    for (let i = 0; i < 44; i++) { const a = r() * 6.283, d = r() * R * 0.13, g = 0.16 + r() * 0.1; this.smoke.spawn(x + Math.cos(a) * d, y + 2 + r() * R * 0.9, z + Math.sin(a) * d, 0, 6 + r() * 5, 0, 5 + r() * 3, 7, 12, g, g * 0.9, g * 0.8, 0.7, -0.4, 0.4); }
    for (let i = 0; i < 56; i++) {
      const a = r() * 6.283, d = Math.sqrt(r()) * R * 0.4, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d, py = y + R * 0.95 + r() * R * 0.28;
      if (i % 3 === 0) this.fire.spawn(px, py, pz, Math.cos(a) * 3, 4 + r() * 3, Math.sin(a) * 3, 1.6 + r(), 12, 10, 1, 0.55, 0.15, 0.9, -0.2, 0.5);
      else { const g = 0.2 + r() * 0.1; this.smoke.spawn(px, py, pz, Math.cos(a) * 3, 4 + r() * 3, Math.sin(a) * 3, 6 + r() * 3, 11, 14, g, g * 0.92, g * 0.85, 0.75, -0.2, 0.5); }
    }
  }
  // Rocket motor: flame at the nozzle and a thick white smoke trail behind it.
  exhaust(x, y, z, size) {
    const r = this.rnd, g = 0.82 + r() * 0.12;
    this.fire.spawn(x, y, z, 0, 0, 0, 0.08, 2.4 * size, 0, 1, 0.8, 0.4, 1, 0, 0); this.fire.spawn(x, y, z, 0, 0, 0, 0.05, 1.2 * size, 0, 1, 1, 0.9, 1, 0, 0);
    this.smoke.spawn(x + (r() - 0.5) * 0.4, y, z + (r() - 0.5) * 0.4, (r() - 0.5), 0.3, (r() - 0.5), 1.6 + r() * 1.2, 1.4 * size, 3.2 * size, g, g, g, 0.42, -0.1, 0.8);
  }
  spark(x, y, z, col = [0.55, 0.85, 1]) {
    const r = this.rnd;
    for (let i = 0; i < 3; i++) this.fire.spawn(x + (r() - 0.5) * 2, y + r() * 1.5, z + (r() - 0.5) * 2, (r() - 0.5) * 6, 2 + r() * 4, (r() - 0.5) * 6, 0.2 + r() * 0.25, 0.4, 0, col[0], col[1], col[2], 1, 14, 0.5);
  }
  // Per-frame emission for a lingering hazard zone.
  hazard(kind, x, z, R, dt) {
    const r = this.rnd; let n = dt * R * R * (kind === 'toxin' ? 0.22 : 0.5);
    for (; n > 0; n--) {
      if (n < 1 && r() > n) break;
      const a = r() * 6.283, d = Math.sqrt(r()) * R, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d, py = this.h(px, pz);
      if (kind === 'toxin') { const g = 0.55 + r() * 0.3; this.smoke.spawn(px, py + 0.5 + r() * 2, pz, (r() - 0.5) * 1.5, 0.3 + r() * 0.8, (r() - 0.5) * 1.5, 2.2 + r() * 2, 3 + r() * 2, 5, 0.3 * g, g, 0.16 * g, 0.42, -0.1, 0.6); }
      else {
        this.fire.spawn(px, py + 0.3, pz, (r() - 0.5) * 1.2, 2.5 + r() * 3.5, (r() - 0.5) * 1.2, 0.45 + r() * 0.5, 1.6 + r() * 1.6, 2.2, 1, 0.42 + r() * 0.3, 0.08, kind === 'thermal' ? 0.55 : 0.85, -1, 0.8);
        if (r() < 0.3) { const g = 0.1 + r() * 0.1; this.smoke.spawn(px, py + 2, pz, 0.6, 2.5 + r() * 2, 0.2, 1.6 + r() * 1.4, 2.4, 5, g, g, g, 0.4, -0.5, 0.5); }
      }
    }
  }
  toxinBurst(x, z, R) {
    const r = this.rnd, y = this.h(x, z);
    this.shock(x, y + 0.6, z, R, 0.8, 0x7dff5a);
    for (let i = 0; i < 80; i++) { const a = r() * 6.283, v = R * (0.3 + r() * 0.9), g = 0.6 + r() * 0.3; this.smoke.spawn(x, y + 1 + r() * 2, z, Math.cos(a) * v, 1 + r() * 3, Math.sin(a) * v, 2 + r() * 2, 4, 8, 0.3 * g, g, 0.16 * g, 0.5, -0.1, 1.5); }
    this.flash(x, y + 5, z, 60, 0.3);
  }
  smokeColumn(x, z, secs, size) { let e = this.emitters[0]; for (const o of this.emitters) { if (o.t <= 0) { e = o; break; } if (o.t < e.t) e = o; } e.x = x; e.z = z; e.t = secs; e.size = size; e.acc = 0; }

  // Per-frame: trail for a projectile at interpolated position
  // Continuous smoke between two points (rocket motors): one puff every ~1.3 m, so the trail is
  // unbroken whatever the frame rate.
  streak(x0, y0, z0, x1, y1, z1) {
    const d = Math.hypot(x1 - x0, y1 - y0, z1 - z0), n = Math.min(60, Math.ceil(d / 1.3)), r = this.rnd;
    for (let i = 1; i <= n; i++) {
      const u = i / n, g = 0.8 + r() * 0.14;
      this.smoke.spawn(x0 + (x1 - x0) * u + (r() - 0.5) * 0.3, y0 + (y1 - y0) * u + (r() - 0.5) * 0.3, z0 + (z1 - z0) * u + (r() - 0.5) * 0.3, (r() - 0.5) * 0.6, 0.5 + r() * 0.5, (r() - 0.5) * 0.6, 1.6 + r() * 0.9, 0.8, 2.6, g, g, g, 0.42, -0.2, 0.8);
    }
    for (let i = 0; i < n; i += 3) { const u = i / n; this.fire.spawn(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, z0 + (z1 - z0) * u, 0, 0.3, 0, 0.45, 1.1, 0.8, 1, 0.55, 0.2, 0.5, 0, 0.5); } // heat glow
    this.streakPuffs = (this.streakPuffs || 0) + n;
  }
  trail(kind, x, y, z, a, w) {
    const r = this.rnd;
    if (kind === 'shell') { if (w === 'toxin_shell') this.fire.spawn(x, y, z, 0, 0, 0, 0.08, 1.5, 0, 0.5, 1, 0.3, 1, 0, 0); else this.fire.spawn(x, y, z, 0, 0, 0, 0.06, 1.5, 0, 1, 0.85, 0.5, 1, 0, 0); return; }
    const c = Math.cos(a), s = Math.sin(a);
    if (kind === 'lob') {
      if (w === 'flashbang') { this.fire.spawn(x, y, z, 0, 0, 0, 0.05, 0.9, 0, 1, 1, 1, 1, 0, 0); return; }
      this.fire.spawn(x, y, z, 0, 0, 0, 0.12, 2.6, 0, 1, 0.55, 0.15, 1, 0, 0);
      const g = 0.2 + r() * 0.1; this.smoke.spawn(x, y, z, 0, 0.4, 0, 0.8 + r() * 0.4, 0.9, 2.4, g, g, g, 0.4, -0.2, 1); return;
    }
    this.fire.spawn(x - c * 0.4, y, z - s * 0.4, -c * 3, 0, -s * 3, 0.09, 1.7, 0, 1, 0.75, 0.35, 1, 0, 0);
    this.fire.spawn(x, y, z, 0, 0, 0, 0.05, 0.9, 0, 1, 1, 0.9, 1, 0, 0);
    const g = 0.78 + r() * 0.12;
    this.smoke.spawn(x - c * 0.8 + (r() - 0.5) * 0.2, y + (r() - 0.5) * 0.2, z - s * 0.8 + (r() - 0.5) * 0.2, -c * 1.5, 0.4, -s * 1.5, 0.7 + r() * 0.5, 0.7, 1.9, g, g, g, 0.34, -0.3, 1.2);
  }

  update(dt) {
    this.time += dt;
    for (const e of this.emitters) {
      if (e.t <= 0) continue;
      e.t -= dt; e.acc += dt * 9;
      while (e.acc > 1) { e.acc -= 1; const g = 0.12 + this.rnd() * 0.12; this.smoke.spawn(e.x + (this.rnd() - 0.5) * e.size, this.h(e.x, e.z) + 0.6, e.z + (this.rnd() - 0.5) * e.size, 0.8 + this.rnd(), 2.6 + this.rnd() * 2, 0.3, 1.8 + this.rnd() * 1.6, 1.6 * e.size, 4.2 * e.size, g, g, g, 0.5 * Math.min(1, e.t), -0.5, 0.5); if (this.rnd() < 0.3) this.fire.spawn(e.x + (this.rnd() - 0.5) * e.size, this.h(e.x, e.z) + 0.5, e.z + (this.rnd() - 0.5) * e.size, 0, 2.5, 0, 0.35, 1.5 * e.size, 1, 1, 0.5, 0.12, 0.7 * Math.min(1, e.t), 0, 1); }
    }
    this.smoke.update(dt); this.fire.update(dt);
    for (const o of this.lights) { if (o.t > 0) { o.t -= dt; o.l.intensity = o.t > 0 ? o.peak * (o.t / o.dur) : 0; } }
    for (const o of this.rings) {
      if (o.t <= 0) continue;
      o.t -= dt; const u = 1 - Math.max(0, o.t) / o.dur, s = o.r * (0.08 + 0.92 * (1 - (1 - u) * (1 - u)));
      o.m.scale.set(s, 1, s); o.m.material.opacity = 0.85 * (1 - u); if (o.t <= 0) o.m.visible = false;
    }
    // tracers and beams
    const P = this.trPos, C = this.trCol; let n = 0;
    for (const t of this.tr) {
      if (!t.on) continue;
      t.t += dt; const u = t.t / t.dur; if (u >= 1) { t.on = false; continue; }
      const o = n * 6, c = t.col;
      if (t.beam) {
        const k = 1 - u;
        P[o] = t.x0; P[o + 1] = t.y0; P[o + 2] = t.z0; P[o + 3] = t.x1; P[o + 4] = t.y1; P[o + 5] = t.z1;
        C[o] = c[0] * k; C[o + 1] = c[1] * k; C[o + 2] = c[2] * k; C[o + 3] = c[0] * k; C[o + 4] = c[1] * k; C[o + 5] = c[2] * k;
      } else {
        const u0 = Math.max(0, u - t.len);
        P[o] = t.x0 + (t.x1 - t.x0) * u; P[o + 1] = t.y0 + (t.y1 - t.y0) * u; P[o + 2] = t.z0 + (t.z1 - t.z0) * u;
        P[o + 3] = t.x0 + (t.x1 - t.x0) * u0; P[o + 4] = t.y0 + (t.y1 - t.y0) * u0; P[o + 5] = t.z0 + (t.z1 - t.z0) * u0;
        C[o] = c[0]; C[o + 1] = c[1]; C[o + 2] = c[2]; C[o + 3] = c[0] * 0.3; C[o + 4] = c[1] * 0.2; C[o + 5] = c[2] * 0.1;
        this.fire.spawn(P[o], P[o + 1], P[o + 2], 0, 0, 0, 0.035, 0.55 * t.glow, 0, c[0], c[1], c[2], 0.9, 0, 0);
      }
      n++;
    }
    this.trLines.geometry.setDrawRange(0, n * 2);
    this.trAP.needsUpdate = true; this.trAC.needsUpdate = true;

    // decals: hold for DECAL_LIFE, fade over DECAL_FADE, then the slot is free again
    let live = 0, dirty = false;
    for (let i = 0; i < DECALS; i++) {
      if (this.decalFade[i] <= 0) continue;
      const age = this.time - this.decalBorn[i];
      if (age > DECAL_LIFE) { const f = Math.max(0, 1 - (age - DECAL_LIFE) / DECAL_FADE); if (f !== this.decalFade[i]) { this.decalFade[i] = f; dirty = true; if (f === 0) { this.craters.setMatrixAt(i, this._zero); this.craters.instanceMatrix.needsUpdate = true; } } }
      if (this.decalFade[i] > 0) live++;
    }
    this.decalLive = live; if (live > this.decalPeak) this.decalPeak = live; if (dirty) this.aDecalFade.needsUpdate = true;

    // wrecks: burn for WRECK_BURN seconds under a smoke plume, then sink into the ground
    live = 0;
    for (let i = 0; i < this.wrecks.length; i++) {
      const w = this.wrecks[i]; if (!w.on) continue;
      w.t += dt;
      const sink = Math.max(0, (w.t - WRECK_BURN) / WRECK_SINK);
      if (sink >= 1) { w.on = false; this.hulls.setMatrixAt(i, this._zero); this.turrets.setMatrixAt(i, this._zero); this.wreckFade[i] = 0; this.wreckTFade[i] = 0; this.hulls.instanceMatrix.needsUpdate = this.turrets.instanceMatrix.needsUpdate = true; continue; }
      live++;
      const drop = sink * w.len * 0.34;
      this._e.set(0, -w.f, 0.03); this._q.setFromEuler(this._e); this._p.set(w.x, w.y - drop - 0.02, w.z); this._s.set(w.len, w.len, w.len);
      this._m.compose(this._p, this._q, this._s); this.hulls.setMatrixAt(i, this._m); this.wreckFade[i] = 1;
      if (w.turret) {
        const u = Math.min(1, w.t / 0.9), arc = w.blown ? Math.sin(u * Math.PI) * 4.5 : 0;   // a blown turret is thrown clear and lands on its side
        const px = w.blown ? w.x + (w.tx - w.x) * u : w.x, pz = w.blown ? w.z + (w.tz - w.z) * u : w.z;
        const gy = w.blown ? this.h(px, pz) + (1 - u) * w.len * 0.24 + arc + u * w.len * 0.06 : w.y + w.len * 0.235;
        this._e.set(w.blown ? u * 1.25 + (1 - u) * w.spin * u : 0.04, -w.tf, w.blown ? (1 - u) * w.spin * 0.5 : 0); this._q.setFromEuler(this._e);
        this._p.set(px, gy - drop, pz); this._m.compose(this._p, this._q, this._s); this.turrets.setMatrixAt(i, this._m); this.wreckTFade[i] = 1;
      } else { this.turrets.setMatrixAt(i, this._zero); this.wreckTFade[i] = 0; }
      if (w.t < WRECK_BURN) {
        w.smoke += dt * 7;
        while (w.smoke > 1) {
          w.smoke -= 1; const r = this.rnd, g = 0.04 + r() * 0.08, k = 1 - w.t / WRECK_BURN;
          this.smoke.spawn(w.x + (r() - 0.5) * w.len * 0.4, w.y + w.len * 0.25, w.z + (r() - 0.5) * w.len * 0.4, 0.5 + r() * 0.6, 2.4 + r() * 1.8, 0.2, 2.4 + r() * 1.8, 1.3, 4.8, g, g, g, 0.3 + 0.4 * k, -0.4, 0.4);
          if (r() < 0.55 * k) this.fire.spawn(w.x + (r() - 0.5) * w.len * 0.35, w.y + w.len * 0.2, w.z + (r() - 0.5) * w.len * 0.35, 0, 1.8 + r() * 1.4, 0, 0.3 + r() * 0.3, 1.5, 0.6, 1, 0.5, 0.1, 0.75 * k, 0, 1);
        }
      }
    }
    if (live || this.wreckLive) { this.hulls.instanceMatrix.needsUpdate = this.turrets.instanceMatrix.needsUpdate = true; this.aWreckFade.needsUpdate = this.aWreckTFade.needsUpdate = true; }
    this.wreckLive = live; if (live > this.wreckPeak) this.wreckPeak = live;

    // camera shake: decays, and jitters as trauma squared
    this.trauma = Math.max(0, this.trauma - dt * 1.7);
    const amp = this.shakeOn ? this.trauma * this.trauma * (0.6 + this.ldist * 0.012) : 0, tt = this.time * 37;
    this.shakeX = amp * Math.sin(tt * 1.3 + 1.7); this.shakeY = amp * Math.sin(tt * 1.7 + 0.3) * 0.6; this.shakeZ = amp * Math.sin(tt * 1.1 + 4.1);
  }
}
