// Shared render helpers: procedural textures, PBR material factory, and the
// Fog-of-War shader patch applied to every lit material.
import THREE from '../lib/three.js';
import { WORLD } from '../sim/defs.js';

export const fowUniforms = { uFow: { value: null }, uFowInv: { value: 1 / WORLD } };

// GLSL injected into MeshStandardMaterial. Kept tiny and version-stable: it
// only hooks <common>, <project_vertex>, <color_fragment>, <dithering_fragment>.
export const FOW_VERT_DECL = 'varying vec3 vFowW;';
export const FOW_VERT_BODY = `
{ vec4 fowP = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  fowP = instanceMatrix * fowP;
#endif
  fowP = modelMatrix * fowP; vFowW = fowP.xyz; }`;
export const FOW_FRAG_DECL = 'uniform sampler2D uFow; uniform float uFowInv; varying vec3 vFowW;';
export const FOW_FRAG_BODY = `
{ float fowV = texture2D( uFow, vFowW.xz * uFowInv ).r;
  gl_FragColor.rgb *= mix( 0.06, 1.0, fowV ); }`;
// Terrain only: sediment banding on cliff faces, derived from the screen-space surface normal.
export const STRATA_FRAG_BODY = `
{ vec3 fowN = normalize( cross( dFdx( vFowW ), dFdy( vFowW ) ) );
  float cliff = smoothstep( 0.82, 0.5, abs( fowN.y ) );
  float band = 0.5 + 0.5 * sin( vFowW.y * 2.3 + sin( vFowW.x * 0.11 ) * 1.7 + sin( vFowW.z * 0.13 ) * 1.7 );
  diffuseColor.rgb *= mix( vec3( 1.0 ), mix( vec3( 0.60, 0.50, 0.43 ), vec3( 1.08, 0.97, 0.88 ), band ), cliff ); }`;

export function patchFow(mat, terrain = false) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uFow = fowUniforms.uFow;
    shader.uniforms.uFowInv = fowUniforms.uFowInv;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + FOW_VERT_DECL)
      .replace('#include <project_vertex>', '#include <project_vertex>\n' + FOW_VERT_BODY);
    let fs = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FOW_FRAG_DECL)
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\n' + FOW_FRAG_BODY);
    if (terrain) fs = fs.replace('#include <color_fragment>', '#include <color_fragment>\n' + STRATA_FRAG_BODY);
    shader.fragmentShader = fs;
  };
  mat.customProgramCacheKey = () => (terrain ? 'fow-terrain' : 'fow');
  return mat;
}

export function std(color, roughness = 0.8, metalness = 0, extra) {
  const m = new THREE.MeshStandardMaterial(Object.assign({ color, roughness, metalness }, extra || {}));
  return patchFow(m);
}

// sRGB hex -> linear [r,g,b] (for vertex colours, which Three treats as linear)
export function hexLin(hex) {
  const f = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return [f((hex >> 16) & 255), f((hex >> 8) & 255), f(hex & 255)];
}

// ---------- procedural textures ----------
function hash(x, y, s) { let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1274126177) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function tnoise(x, y, period, s) { // tileable value noise
  const xi = Math.floor(x), yi = Math.floor(y); let fx = x - xi, fy = y - yi;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const w = (v) => ((v % period) + period) % period;
  const a = hash(w(xi), w(yi), s), b = hash(w(xi + 1), w(yi), s), c = hash(w(xi), w(yi + 1), s), d = hash(w(xi + 1), w(yi + 1), s);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
function canvas(n) { const c = document.createElement('canvas'); c.width = c.height = n; return c; }
function tex(c, srgb, repeat) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 4;
  return t;
}

// Height function for sand: wind ripples + grain. Tiles at S.
function sandH(x, y, S) {
  const u = x / S, v = y / S;
  const warp = tnoise(u * 4, v * 4, 4, 5) * 1.6;
  return 0.5 * Math.sin((u * 14 + warp) * 6.2831853) * (0.35 + 0.65 * tnoise(u * 3, v * 3, 3, 9)) +
    0.9 * tnoise(u * 16, v * 16, 16, 2) + 0.5 * tnoise(u * 48, v * 48, 48, 3);
}
export function makeSandTextures() {
  const S = 256, cd = canvas(S), cn = canvas(S);
  const d = cd.getContext('2d'), n = cn.getContext('2d');
  const id = d.createImageData(S, S), nd = n.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const h = sandH(x, y, S), hx = sandH(x + 1, y, S) - sandH(x - 1, y, S), hy = sandH(x, y + 1, S) - sandH(x, y - 1, S);
    const i = (y * S + x) * 4;
    const g = 205 + 50 * (0.55 * tnoise(x / 4, y / 4, 64, 21) + 0.45 * hash(x, y, 4)) - 14 * (1 - Math.min(1, h * 0.7 + 0.4));
    id.data[i] = g; id.data[i + 1] = g * 0.985; id.data[i + 2] = g * 0.96; id.data[i + 3] = 255;
    const k = 1.6, nx = -hx * k, ny = -hy * k, l = Math.hypot(nx, ny, 1);
    nd.data[i] = 127.5 + 127.5 * nx / l; nd.data[i + 1] = 127.5 + 127.5 * ny / l; nd.data[i + 2] = 127.5 + 127.5 / l; nd.data[i + 3] = 255;
  }
  d.putImageData(id, 0, 0); n.putImageData(nd, 0, 0);
  return { map: tex(cd, true, true), normal: tex(cn, false, true) };
}

export function makeParticleTexture() {
  const c = canvas(64), g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,0.7)'); r.addColorStop(0.7, 'rgba(255,255,255,0.22)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return tex(c, false, false);
}

export function makeCraterTexture() {
  const S = 128, c = canvas(S), g = c.getContext('2d'), id = g.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (x - 63.5) / 63.5, dy = (y - 63.5) / 63.5, a = Math.atan2(dy, dx);
    const wob = 1 + 0.12 * Math.sin(a * 5 + 1.3) + 0.08 * Math.sin(a * 11) + 0.1 * (tnoise(x / 9, y / 9, 16, 7) - 0.5);
    const r = Math.hypot(dx, dy) / wob;
    const i = (y * S + x) * 4;
    const bowl = Math.max(0, 1 - r / 0.42), rim = Math.exp(-((r - 0.5) ** 2) / 0.006), scorch = Math.max(0, 1 - r / 0.98);
    const rays = 0.5 + 0.5 * Math.sin(a * 17 + tnoise(x / 6, y / 6, 20, 3) * 4);
    const dark = 28 + 26 * (1 - bowl) + 20 * hash(x, y, 9);
    const v = dark + rim * 90;
    id.data[i] = v * 1.05; id.data[i + 1] = v * 0.92; id.data[i + 2] = v * 0.78;
    const alpha = Math.min(1, bowl * 2.2) * 0.92 + rim * 0.55 + scorch * scorch * 0.5 * (0.55 + 0.45 * rays);
    id.data[i + 3] = 255 * Math.min(0.95, alpha) * Math.min(1, (1 - r) * 6 > 0 ? (1 - r) * 6 : 0);
  }
  g.putImageData(id, 0, 0);
  return tex(c, true, false);
}

// Stucco wall with a window grid, used on civilian buildings (one tile = one wall).
export function makeFacadeTexture(base, floors, cols, seed) {
  const S = 256, c = canvas(S), g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 900; i++) { const v = hash(i, seed, 1); g.fillStyle = `rgba(${v > 0.5 ? 255 : 0},${v > 0.5 ? 245 : 0},${v > 0.5 ? 225 : 0},${0.03 + 0.05 * hash(i, seed, 2)})`; g.fillRect(hash(i, seed, 3) * S, hash(i, seed, 4) * S, 2 + hash(i, seed, 5) * 14, 1 + hash(i, seed, 6) * 5); }
  const fh = S / floors, cw = S / cols;
  for (let f = 0; f < floors; f++) for (let k = 0; k < cols; k++) {
    const x = k * cw + cw * 0.24, y = f * fh + fh * 0.22, w = cw * 0.52, h = fh * 0.5, lit = hash(f, k, seed) > 0.82;
    g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(x - 2, y - 2, w + 4, h + 6);
    g.fillStyle = lit ? '#c9a45a' : (hash(k, f, seed + 3) > 0.5 ? '#232b33' : '#2f3a44'); g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(x, y, w, h * 0.3);
    g.fillStyle = 'rgba(60,45,30,0.35)'; g.fillRect(x - 1, y + h + 3, w + 2, 3 + hash(k, f, 8) * 10);
  }
  g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(0, S - 10, S, 10);
  return tex(c, true, false);
}
