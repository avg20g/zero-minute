// Environment FX: PBR terrain splatting and time-of-day lighting.
//
//  Terrain   Four procedural, tileable PBR materials (cracked sand, striated rock, worn
//            asphalt, dark dirt) are generated on canvases at start-up: an albedo, a normal and
//            a roughness map each. A per-vertex weight (from elevation, slope, the road network
//            and the pads around Supply Docks and Oil Derricks) blends them in the shader, with a
//            per-pixel slope test so cliff faces always resolve to rock.
//  Lighting  Three presets (Harsh Noon, Golden Hour Dusk, Night Ops) drive sun, sky, fog,
//            exposure and image-based light. At night ground vehicles get headlight cones,
//            defence turrets sweep searchlight beams, and weapon flashes are boosted.
//
// Light counts never change between presets (unused lights sit at zero intensity), so switching
// preset never recompiles a shader.
import THREE from '../lib/three.js';
import { patchFow } from './gfx.js';

// ---------------------------------------------------------------- procedural PBR texture sets
const S = 256;
function hash(x, y, s) { let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1274126177) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function tnoise(x, y, period, s) { // tileable value noise
  const xi = Math.floor(x), yi = Math.floor(y); let fx = x - xi, fy = y - yi;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const w = (v) => ((v % period) + period) % period;
  const a = hash(w(xi), w(yi), s), b = hash(w(xi + 1), w(yi), s), c = hash(w(xi), w(yi + 1), s), d = hash(w(xi + 1), w(yi + 1), s);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
const fbmT = (u, v, p, s) => tnoise(u * p, v * p, p, s) * 0.55 + tnoise(u * p * 2, v * p * 2, p * 2, s + 3) * 0.3 + tnoise(u * p * 4, v * p * 4, p * 4, s + 7) * 0.15;
// Tileable Voronoi: returns [edge distance (F2 - F1), cell id hash]
function voronoi(u, v, K, seed) {
  const x = u * K, y = v * K, xi = Math.floor(x), yi = Math.floor(y); let f1 = 9, f2 = 9, id = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = ((xi + i) % K + K) % K, cy = ((yi + j) % K + K) % K;
    const px = xi + i + 0.15 + 0.7 * hash(cx, cy, seed), py = yi + j + 0.15 + 0.7 * hash(cx, cy, seed + 1), d = Math.hypot(px - x, py - y);
    if (d < f1) { f2 = f1; f1 = d; id = hash(cx, cy, seed + 2); } else if (d < f2) f2 = d;
  }
  return [f2 - f1, id];
}
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// Each material is a function (u, v) -> [height 0..1, r, g, b (sRGB 0..255), roughness 0..1]
export const SURFACES = {
  sand(u, v) {   // sun-baked desert floor: polygonal mud cracks, fine grain, cell-to-cell tint
    const [e, id] = voronoi(u, v, 7, 11), grain = hash((u * S) | 0, (v * S) | 0, 5), n = fbmT(u, v, 6, 21);
    const crack = ss(0.0, 0.045, e), h = crack * (0.72 + 0.2 * n) + grain * 0.06, k = (0.86 + 0.12 * id + 0.1 * n) * (0.68 + 0.32 * crack) * (0.96 + 0.08 * grain);
    return [h, 214 * k, 187 * k, 138 * k, 0.9 + 0.1 * (1 - crack)];
  },
  rock(u, v) {   // canyon wall: horizontal sediment strata, warped, with blocky vertical fractures
    const warp = fbmT(u, v, 4, 41), band = 0.5 + 0.5 * Math.sin((v * 9 + warp * 1.4) * 6.2831853), fine = 0.5 + 0.5 * Math.sin((v * 34 + warp * 3) * 6.2831853);
    const [e] = voronoi(u * 1.0, v * 0.45, 5, 53), frac = ss(0.0, 0.05, e), n = fbmT(u, v, 12, 61);
    const h = (0.45 * band + 0.2 * fine + 0.25 * n) * (0.45 + 0.55 * frac);
    const t = band * 0.7 + fine * 0.3, k = (0.8 + 0.3 * n) * (0.55 + 0.45 * frac);
    return [h, (126 + 74 * t) * k, (86 + 62 * t) * k, (64 + 50 * t) * k, 0.82 + 0.14 * (1 - band)];
  },
  asphalt(u, v) { // worn road: dark aggregate, polished wheel paths, alligator cracking, pale dust
    const agg = hash((u * S) | 0, (v * S) | 0, 71), wear = fbmT(u, v, 3, 73), [e] = voronoi(u, v, 4, 79), crack = ss(0.0, 0.03, e), dust = ss(0.66, 0.92, fbmT(u, v, 5, 83));
    const h = crack * (0.6 + 0.25 * agg) + 0.1 * wear, base = 70 + 26 * agg + 30 * ss(0.4, 0.8, wear), k = 0.45 + 0.55 * crack;
    return [h, (base * (1 - dust) + 168 * dust) * k, (base * 0.98 * (1 - dust) + 150 * dust) * k, (base * 0.95 * (1 - dust) + 118 * dust) * k, 0.72 + 0.2 * agg * (1 - ss(0.4, 0.8, wear)) + 0.08 * dust];
  },
  dirt(u, v) {   // churned, oil-darkened earth around depots: clods and twin tyre ruts
    const n = fbmT(u, v, 8, 91), clod = tnoise(u * 28, v * 28, 28, 93), rut = Math.min(Math.abs(((u * 2 + 0.03 * Math.sin(v * 12.566)) % 1 + 1) % 1 - 0.3), Math.abs(((u * 2 + 0.03 * Math.sin(v * 12.566)) % 1 + 1) % 1 - 0.7));
    const r = ss(0.0, 0.09, rut), h = (0.5 * n + 0.3 * clod) * (0.55 + 0.45 * r), k = (0.7 + 0.5 * n) * (0.72 + 0.28 * r) * (0.9 + 0.2 * clod);
    return [h, 104 * k, 80 * k, 56 * k, 0.93 + 0.07 * clod];
  },
};
SURFACES.grass = (u, v) => { // forest floor: tufted grass, darker in the clumps, patches gone dry and yellow
  const n = fbmT(u, v, 6, 131), fine = hash((u * S) | 0, (v * S) | 0, 133), clump = tnoise(u * 22, v * 22, 22, 137), dry = ss(0.58, 0.9, fbmT(u, v, 3, 139));
  const k = (0.66 + 0.5 * n) * (0.82 + 0.3 * fine) * (0.8 + 0.3 * clump);
  return [0.3 * n + 0.45 * clump + 0.2 * fine, (70 + 62 * dry) * k, (112 + 22 * dry) * k, (46 + 12 * dry) * k, 0.96];
};
export const SURFACE_ORDER = ['sand', 'rock', 'asphalt', 'dirt'];
export const BIOME_SURFACES = { desert: SURFACE_ORDER, woods: ['grass', 'rock', 'asphalt', 'dirt'] }; // the first slot is the open ground of the biome
// Pure data for one material: albedo, tangent-space normal and roughness, as RGBA byte arrays.
export function surfaceMaps(name, bump = 2.2) {
  const f = SURFACES[name], H = new Float32Array(S * S), albedo = new Uint8ClampedArray(S * S * 4), normal = new Uint8ClampedArray(S * S * 4), rough = new Uint8ClampedArray(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const o = f((x + 0.5) / S, (y + 0.5) / S), i = (y * S + x) * 4;
    H[y * S + x] = o[0]; albedo[i] = o[1]; albedo[i + 1] = o[2]; albedo[i + 2] = o[3]; albedo[i + 3] = 255;
    const r = Math.max(0, Math.min(1, o[4])) * 255; rough[i] = rough[i + 1] = rough[i + 2] = r; rough[i + 3] = 255;
  }
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const xl = (x + S - 1) % S, xr = (x + 1) % S, yu = (y + S - 1) % S, yd = (y + 1) % S, i = (y * S + x) * 4;
    const nx = -(H[y * S + xr] - H[y * S + xl]) * bump, ny = -(H[yd * S + x] - H[yu * S + x]) * bump, l = Math.hypot(nx, ny, 1);
    normal[i] = 127.5 + 127.5 * nx / l; normal[i + 1] = 127.5 + 127.5 * ny / l; normal[i + 2] = 127.5 + 127.5 / l; normal[i + 3] = 255;
  }
  return { size: S, albedo, normal, rough };
}
// Canvas-generated maps for all four surfaces, plus the GPU textures built from them. Albedo and
// roughness share one RGBA texture (roughness in alpha), which keeps the terrain inside the
// 16 texture units WebGL guarantees: 4 albedo+roughness, 4 normal, shadow, fog-of-war, environment.
export function makeTerrainTextures(aniso = 4, biome = 'desert') {
  const set = { canvases: {}, albedoRough: [], normal: [] };
  const toCanvas = (bytes) => { const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'), im = g.createImageData(S, S); im.data.set(bytes); g.putImageData(im, 0, 0); return c; };
  for (const name of BIOME_SURFACES[biome] || SURFACE_ORDER) {
    const m = surfaceMaps(name);
    set.canvases[name] = { albedo: toCanvas(m.albedo), normal: toCanvas(m.normal), roughness: toCanvas(m.rough) };
    const packed = new Uint8Array(S * S * 4);
    for (let i = 0; i < S * S; i++) { packed[i * 4] = m.albedo[i * 4]; packed[i * 4 + 1] = m.albedo[i * 4 + 1]; packed[i * 4 + 2] = m.albedo[i * 4 + 2]; packed[i * 4 + 3] = m.rough[i * 4]; }
    const a = new THREE.DataTexture(packed, S, S, THREE.RGBAFormat, THREE.UnsignedByteType); a.colorSpace = THREE.SRGBColorSpace;
    const n = new THREE.CanvasTexture(set.canvases[name].normal);
    for (const t of [a, n]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = aniso; t.needsUpdate = true; }
    set.albedoRough.push(a); set.normal.push(n);
  }
  return set;
}

// ---------------------------------------------------------------- terrain splat shader
export const SPLAT_VERT_DECL = 'attribute vec4 splat; varying vec4 vSplat;';
export const SPLAT_VERT_BODY = 'vSplat = splat;';
export const SPLAT_FRAG_DECL = `
uniform sampler2D tA0; uniform sampler2D tA1; uniform sampler2D tA2; uniform sampler2D tA3;
uniform sampler2D tN0; uniform sampler2D tN1; uniform sampler2D tN2; uniform sampler2D tN3;
uniform float uBump;
varying vec4 vSplat;
vec2 gSplatN; float gSplatR;`;
// weights: x sand, y rock, z asphalt, w dirt
export const SPLAT_FRAG_MAP = `
{ vec3 gN = normalize( cross( dFdx( vFowW ), dFdy( vFowW ) ) );
  float cliff = smoothstep( 0.80, 0.55, abs( gN.y ) );
  vec4 w = vSplat; w.y = max( w.y, cliff ); w.xzw *= 1.0 - cliff; w /= max( 1e-4, w.x + w.y + w.z + w.w );
  vec2 uvS = vFowW.xz * 0.050, uvA = vFowW.xz * 0.085, uvD = vFowW.xz * 0.110;
  vec2 uvR = vec2( ( vFowW.x + vFowW.z ) * 0.060, vFowW.y * 0.085 );
  vec4 a = texture2D( tA0, uvS ) * w.x + texture2D( tA1, uvR ) * w.y + texture2D( tA2, uvA ) * w.z + texture2D( tA3, uvD ) * w.w;
  // a second, larger sand tiling hides the repeat on open ground
  a.rgb *= mix( 1.0, 0.72 + 0.56 * texture2D( tA0, uvS * 0.23 + 0.37 ).g, w.x * 0.55 );
  vec3 n = texture2D( tN0, uvS ).xyz * w.x + texture2D( tN1, uvR ).xyz * w.y + texture2D( tN2, uvA ).xyz * w.z + texture2D( tN3, uvD ).xyz * w.w;
  diffuseColor.rgb *= a.rgb;
  gSplatR = a.a; gSplatN = ( n.xy * 2.0 - 1.0 ) * uBump; }`;
export const SPLAT_FRAG_ROUGH = 'roughnessFactor = clamp( gSplatR, 0.05, 1.0 );';
export const SPLAT_FRAG_NORMAL = 'normal = normalize( normal + mat3( viewMatrix ) * vec3( gSplatN.x, 0.0, gSplatN.y ) );';

export function terrainMaterial(tex) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  patchFow(mat); const fow = mat.onBeforeCompile;
  const u = { uBump: { value: 0.9 } };
  for (let i = 0; i < 4; i++) { u['tA' + i] = { value: tex.albedoRough[i] }; u['tN' + i] = { value: tex.normal[i] }; }
  mat.onBeforeCompile = (sh) => {
    fow(sh); Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + SPLAT_VERT_DECL).replace('#include <begin_vertex>', '#include <begin_vertex>\n' + SPLAT_VERT_BODY);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + SPLAT_FRAG_DECL)
      .replace('#include <map_fragment>', '#include <map_fragment>\n' + SPLAT_FRAG_MAP)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + SPLAT_FRAG_ROUGH)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + SPLAT_FRAG_NORMAL);
  };
  mat.customProgramCacheKey = () => 'fow-splat';
  mat.userData.uniforms = u;
  return mat;
}

// ---------------------------------------------------------------- lighting presets
export const PRESETS = {
  noon: { label: 'Harsh Noon', sun: [-0.52, 0.74, -0.42], sunColor: 0xfff1d6, sunI: 3.0, sky: 0xcfe1ff, ground: 0x9a7446, hemiI: 0.6, fog: 0xd8c6a0, fogNear: 260, fogFar: 760,
    exposure: 1.05, envSky: 0x9fbfe6, envGround: 0xb79a6a, envGlow: 0xffffff, smoke: 1.0, flash: 1.0, normalBias: 0.35, night: false },
  dusk: { label: 'Golden Hour Dusk', sun: [-0.80, 0.25, -0.54], sunColor: 0xffa85c, sunI: 2.7, sky: 0x93a4cc, ground: 0x7a4a2c, hemiI: 0.42, fog: 0xe2a565, fogNear: 150, fogFar: 600,
    exposure: 1.0, envSky: 0xc98f6a, envGround: 0x8a5a36, envGlow: 0xffc27a, smoke: 0.82, flash: 1.5, normalBias: 0.7, night: false },
  night: { label: 'Night Ops', sun: [0.46, 0.76, 0.36], sunColor: 0x9db6ee, sunI: 0.9, sky: 0x33426e, ground: 0x12121c, hemiI: 0.4, fog: 0x0a0f1e, fogNear: 130, fogFar: 560,
    exposure: 1.0, envSky: 0x121a30, envGround: 0x06070c, envGlow: 0x7f95c8, smoke: 0.3, flash: 2.6, normalBias: 0.35, night: true },
};
export const PRESET_IDS = ['noon', 'dusk', 'night'];

export const BEAM_VERT = `
attribute vec4 iCol;
varying vec4 vCol; varying float vT; varying vec3 vN;
void main() {
  vCol = iCol; vT = position.x;
  mat4 m = modelMatrix * instanceMatrix;
  vN = normalize( mat3( viewMatrix ) * mat3( m ) * normal );
  gl_Position = projectionMatrix * viewMatrix * m * vec4( position, 1.0 );
}`;
export const BEAM_FRAG = `
varying vec4 vCol; varying float vT; varying vec3 vN;
void main() {
  float edge = 0.25 + 0.75 * abs( vN.z );           // brighter where we look through more of the cone
  float a = vCol.a * pow( 1.0 - vT, 1.6 ) * edge;
  gl_FragColor = vec4( vCol.rgb, a );
}`;
const BEAMS = 192, SPOTS = 4;

export class Environment {
  constructor(renderer, scene) {
    this.renderer = renderer; this.scene = scene; this.id = 'noon'; this.P = PRESETS.noon;
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 1); scene.add(this.hemi);
    const sun = this.sun = new THREE.DirectionalLight(0xffffff, 1);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.35;
    scene.add(sun); scene.add(sun.target);
    scene.background = new THREE.Color(0); scene.fog = new THREE.Fog(0, 260, 760);
    this.dir = new THREE.Vector3(); this.shadowHalf = 0;
    // one small image-based-light probe per preset, rendered once
    this.envs = {};
    try {
      const pm = new THREE.PMREMGenerator(renderer);
      for (const id of PRESET_IDS) {
        const p = PRESETS[id], env = new THREE.Scene();
        env.add(new THREE.Mesh(new THREE.SphereGeometry(50, 16, 8), new THREE.MeshBasicMaterial({ color: p.envSky, side: THREE.BackSide })));
        const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 16), new THREE.MeshBasicMaterial({ color: p.envGround, side: THREE.DoubleSide })); ground.rotation.x = -Math.PI / 2; ground.position.y = -2; env.add(ground);
        const glow = new THREE.Mesh(new THREE.SphereGeometry(7, 12, 8), new THREE.MeshBasicMaterial({ color: p.envGlow })); glow.position.set(p.sun[0], p.sun[1], p.sun[2]).normalize().multiplyScalar(40); env.add(glow);
        this.envs[id] = pm.fromScene(env, 0.04).texture;
      }
      pm.dispose();
    } catch (err) { console.warn('environment maps skipped', err); }
    // headlight spot pool (the vehicles nearest the camera get real light on the ground)
    this.spots = [];
    for (let i = 0; i < SPOTS; i++) { const s = new THREE.SpotLight(0xfff0d0, 0, 46, 0.5, 0.55, 1.4); s.position.set(0, -200, 0); s.target.position.set(1, -200, 0); scene.add(s); scene.add(s.target); this.spots.push(s); }
    this.cand = []; for (let i = 0; i < SPOTS; i++) this.cand.push({ d: 1e9, x: 0, y: 0, z: 0, c: 1, s: 0 });
    // light cones (headlights and searchlights): one instanced, additive batch
    const cone = new THREE.ConeGeometry(1, 1, 18, 1, true); cone.translate(0, -0.5, 0); cone.rotateZ(Math.PI / 2); // apex at origin, opens along +X
    this.beamCol = new Float32Array(BEAMS * 4); this.aBeamCol = new THREE.InstancedBufferAttribute(this.beamCol, 4); this.aBeamCol.setUsage(THREE.DynamicDrawUsage); cone.setAttribute('iCol', this.aBeamCol);
    this.beams = new THREE.InstancedMesh(cone, new THREE.ShaderMaterial({ vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }), BEAMS);
    this.beams.frustumCulled = false; this.beams.renderOrder = 9; this.beams.count = 0; scene.add(this.beams);
    this.nBeams = 0; this.fx = 0; this.fz = 0;
    this._m = new THREE.Matrix4(); this._p = new THREE.Vector3(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._e = new THREE.Euler(0, 0, 0, 'YZX');
    this.apply('noon');
  }
  // Switch preset. `vfx` (optional) gets the matching smoke tint and flash gain.
  apply(id, vfx) {
    const p = PRESETS[id] || PRESETS.noon; this.id = PRESETS[id] ? id : 'noon'; this.P = p;
    this.dir.set(p.sun[0], p.sun[1], p.sun[2]).normalize();
    this.sun.color.setHex(p.sunColor); this.sun.intensity = p.sunI; this.sun.shadow.normalBias = p.normalBias;
    this.hemi.color.setHex(p.sky); this.hemi.groundColor.setHex(p.ground); this.hemi.intensity = p.hemiI;
    this.scene.background.setHex(p.fog); this.scene.fog.color.setHex(p.fog); this.scene.fog.near = p.fogNear; this.scene.fog.far = p.fogFar;
    this.renderer.toneMappingExposure = p.exposure;
    if (this.envs[this.id]) this.scene.environment = this.envs[this.id];
    if (vfx) { vfx.smoke.uniforms.uTint.value.setScalar(p.smoke); vfx.flashGain = p.flash; }
    if (!p.night) { this.beams.count = 0; for (const s of this.spots) s.intensity = 0; }
    return this.id;
  }
  // Keep the sun and its shadow box on the camera focus, snapped to shadow texels to stop shimmer.
  frame(tx, tz, dist) {
    const half = Math.min(150, Math.max(55, dist * 0.95));
    if (Math.abs(half - this.shadowHalf) > 4) { this.shadowHalf = half; const c = this.sun.shadow.camera; c.left = -half; c.right = half; c.top = half; c.bottom = -half; c.near = 10; c.far = 460; c.updateProjectionMatrix(); }
    const tex = this.shadowHalf * 2 / 2048, x = Math.round(tx / tex) * tex, z = Math.round(tz / tex) * tex;
    this.sun.target.position.set(x, 0, z); this.sun.position.set(x + this.dir.x * 230, this.dir.y * 230, z + this.dir.z * 230);
    this.fx = tx; this.fz = tz;
  }
  // ---- per-frame night lights: call begin(), then headlight()/searchlight() per object, then end()
  begin() { this.nBeams = 0; for (const c of this.cand) c.d = 1e9; }
  _beam(x, y, z, yaw, pitch, len, radius, r, g, b, a) {
    const i = this.nBeams; if (i >= BEAMS) return; this.nBeams++;
    this._e.set(0, -yaw, pitch); this._q.setFromEuler(this._e); this._p.set(x, y, z); this._s.set(len, radius, radius);
    this._m.compose(this._p, this._q, this._s); this.beams.setMatrixAt(i, this._m);
    this.beamCol[i * 4] = r; this.beamCol[i * 4 + 1] = g; this.beamCol[i * 4 + 2] = b; this.beamCol[i * 4 + 3] = a;
  }
  headlight(x, y, z, facing, size) {
    if (!this.P.night) return;
    const c = Math.cos(facing), s = Math.sin(facing), hx = x + c * size * 0.9, hz = z + s * size * 0.9;
    this._beam(hx, y + 0.95, hz, facing, -0.11, 17, 4.2, 1, 0.93, 0.74, 0.22);
    const d = (x - this.fx) * (x - this.fx) + (z - this.fz) * (z - this.fz);
    let worst = this.cand[0]; for (const k of this.cand) if (k.d > worst.d) worst = k;
    if (d < worst.d) { worst.d = d; worst.x = hx; worst.y = y + 1.4; worst.z = hz; worst.c = c; worst.s = s; }
  }
  searchlight(x, y, z, angle) { if (this.P.night) this._beam(x, y, z, angle, -0.16, 62, 5.5, 0.72, 0.84, 1, 0.2); }
  end() {
    if (!this.P.night) return;
    this.beams.count = this.nBeams; this.beams.instanceMatrix.needsUpdate = true; this.aBeamCol.needsUpdate = true;
    for (let i = 0; i < SPOTS; i++) {
      const k = this.cand[i], sp = this.spots[i];
      if (k.d > 1e8) { sp.intensity = 0; continue; }
      sp.position.set(k.x, k.y, k.z); sp.target.position.set(k.x + k.c * 14, k.y - 2.2, k.z + k.s * 14); sp.intensity = 150;
    }
  }
}
