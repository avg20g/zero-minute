// Lobby map builder. Edits a map "spec" (see sim/map.js) on a top-down canvas. Everything placed is
// mirrored through the map centre by the generator, so both sides always get the same ground.
// No Three.js here: the preview is a 2D picture drawn from the same generateMap() the match uses.
import { N } from '../sim/defs.js';
import { DEFAULT_MAP, OPEN_MAP, FOREST_MAP, URBAN_MAP, ARCTIC_MAP, BIOMES, CIV_KINDS, FOOT, MAP_LIMITS, cloneSpec, validateMap } from '../sim/map.js';

export const MAP_KEY = 'cz-map';
export const TOOLS = [
  ['paintrock', 'Rock brush', 'Free-hand: drag to paint rock in any shape. Blocks ground units.'],
  ['painthill', 'Hill brush', 'Free-hand: drag to raise gentle hills. Units can drive over them.'],
  ['paintwater', 'Water brush', 'Free-hand: drag to paint lakes and winding rivers.'],
  ['rock', 'Rock plateau', 'Drag a rectangle. Plateaus block all ground units.'],
  ['ramp', 'Ramp', 'Drag from the top edge of a plateau down to the floor.'],
  ['road', 'Road', 'Drag a line. Roads are visual: they do not change speed.'],
  ['water', 'River', 'Drag a line of water. Only amphibious units and aircraft cross it.'],
  ['bridge', 'Bridge', 'Drag a line across a river. Ground units cross here.'],
  ['dock', 'Supply Dock', 'Click to place. Trucks collect supplies here.'],
  ['derrick', 'Oil Derrick', 'Click to place. Capture it for steady income.'],
  ['civ', 'Building', 'Click to place the type chosen under "Building type". Infantry can garrison it.'],
  ['start', 'Your base', 'Click to move your Command Center. The enemy gets the mirror spot.'],
  ['erase', 'Erase', 'Click any object to remove it and its mirror twin.'],
];
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mir = (p) => [N - p[0], N - p[1]];
const segDist = (px, pz, a, b, c, d) => { const vx = c - a, vz = d - b, l2 = vx * vx + vz * vz || 1, t = clamp(((px - a) * vx + (pz - b) * vz) / l2, 0, 1); return Math.hypot(px - a - vx * t, pz - b - vz * t); };

export function loadSavedMap() { try { const s = JSON.parse(localStorage.getItem(MAP_KEY) || 'null'); return s && validateMap(s).ok ? s : null; } catch (e) { return null; } }

// Pure edit operations (also used by the tests). Each returns true if the spec changed.
export function applyTool(spec, tool, a, b, opt = {}) {
  const [x0, z0] = a || (opt.pts && opt.pts[0]) || [0, 0], [x1, z1] = b || a || [x0, z0];
  switch (tool) {
    case 'paintrock': case 'painthill': case 'paintwater': { // free-hand: one stamp per point of the stroke
      spec.paint = spec.paint || []; const kind = BRUSH[tool], r = clamp(+opt.size || 6, 3, 14); let n = 0;
      for (const p of opt.pts || [[x0, z0]]) { if (spec.paint.length >= MAP_LIMITS.paint) break; spec.paint.push([Math.round(p[0] * 2) / 2, Math.round(p[1] * 2) / 2, r, kind]); n++; }
      return n > 0;
    }
    case 'rock': { const hw = Math.abs(x1 - x0) / 2, hh = Math.abs(z1 - z0) / 2; if (hw < 3 || hh < 3 || spec.mesas.length >= MAP_LIMITS.mesas) return false; spec.mesas.push([(x0 + x1) / 2, (z0 + z1) / 2, hw, hh, Math.min(6, hw, hh)]); return true; }
    case 'ramp': { const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz); if (len < 6) return false; const hor = Math.abs(dx) >= Math.abs(dz); spec.ramps.push({ x: x0, z: z0, dx: hor ? Math.sign(dx) : 0, dz: hor ? 0 : Math.sign(dz), len: clamp(Math.round(len), 8, 24), hw: 6 }); return true; }
    case 'water': { spec.water = spec.water || []; if (Math.hypot(x1 - x0, z1 - z0) < 8 || spec.water.length >= MAP_LIMITS.water) return false; spec.water.push([x0, z0, x1, z1, 5]); return true; }
    case 'bridge': { spec.bridges = spec.bridges || []; if (Math.hypot(x1 - x0, z1 - z0) < 8 || spec.bridges.length >= MAP_LIMITS.bridges) return false; spec.bridges.push([x0, z0, x1, z1, 4.5]); return true; }
    case 'road': { if (Math.hypot(x1 - x0, z1 - z0) < 6 || spec.roads.length >= MAP_LIMITS.roads) return false; spec.roads.push([x0, z0, x1, z1, 3.5]); return true; }
    case 'dock': if (spec.docks.length >= MAP_LIMITS.docks) return false; spec.docks.push({ x: Math.round(x0 - 4), z: Math.round(z0 - 3), amount: 30000 }); return true;
    case 'derrick': if (spec.derricks.length >= MAP_LIMITS.derricks) return false; spec.derricks.push([Math.round(x0 - 2), Math.round(z0 - 2)]); return true;
    case 'civ': if (spec.civs.length >= MAP_LIMITS.civs) return false; spec.civs.push([Math.round(x0 - 3), Math.round(z0 - 3), (opt.kind | 0) % CIV_KINDS.length]); return true;
    case 'start': spec.start = [Math.round(x0 - 5), Math.round(z0 - 5)]; delete spec.rampTop; return true;
    case 'erase': {
      if (spec.paint && spec.paint.length) { // brush work comes off first: every stamp the click (or its mirror) touches
        const before = spec.paint.length; spec.paint = spec.paint.filter(s => ![[x0, z0], mir([x0, z0])].some(p => Math.hypot(p[0] - s[0], p[1] - s[1]) <= s[2] + 1));
        if (spec.paint.length < before) return true;
      }
      for (const p of [[x0, z0], mir([x0, z0])]) { // the click may be on the object or on its mirror twin
        const inRect = (x, z, w, h) => p[0] >= x && p[0] <= x + w && p[1] >= z && p[1] <= z + h;
        let i = spec.docks.findIndex(d => inRect(d.x, d.z, 8, 6)); if (i >= 0) { spec.docks.splice(i, 1); return true; }
        i = spec.derricks.findIndex(d => inRect(d[0], d[1], 4, 4)); if (i >= 0) { spec.derricks.splice(i, 1); return true; }
        i = spec.civs.findIndex(d => inRect(d[0], d[1], 6, 6)); if (i >= 0) { spec.civs.splice(i, 1); return true; }
        i = spec.ramps.findIndex(r => segDist(p[0], p[1], r.x, r.z, r.x + r.dx * r.len, r.z + r.dz * r.len) <= r.hw); if (i >= 0) { spec.ramps.splice(i, 1); delete spec.rampTop; return true; }
        i = (spec.bridges || []).findIndex(r => segDist(p[0], p[1], r[0], r[1], r[2], r[3]) <= r[4]); if (i >= 0) { spec.bridges.splice(i, 1); return true; }
        i = spec.roads.findIndex(r => segDist(p[0], p[1], r[0], r[1], r[2], r[3]) <= r[4] + 1); if (i >= 0) { spec.roads.splice(i, 1); return true; }
        i = (spec.water || []).findIndex(r => segDist(p[0], p[1], r[0], r[1], r[2], r[3]) <= r[4]); if (i >= 0) { spec.water.splice(i, 1); return true; }
        i = spec.mesas.findIndex(m => Math.abs(p[0] - m[0]) <= m[2] && Math.abs(p[1] - m[1]) <= m[3]); if (i >= 0) { spec.mesas.splice(i, 1); return true; }
      }
      const f = spec.civsFixed || [], i = f.findIndex(d => x0 >= d[0] && x0 <= d[0] + 6 && z0 >= d[1] && z0 <= d[1] + 6); if (i >= 0) { f.splice(i, 1); return true; }
      return false;
    }
  }
  return false;
}
export const BRUSH = { paintrock: 0, painthill: 1, paintwater: 2 };
const normalise = (s) => { const o = cloneSpec(s); for (const k of ['mesas', 'ramps', 'roads', 'docks', 'derricks', 'civs', 'water', 'bridges', 'paint']) o[k] = o[k] || []; o.biome = o.biome || 'desert'; o.name = 'Custom map'; return o; };

export function openMapBuilder(initial, onDone) {
  const root = $('mapbuilder'), cv = $('mb-canvas'), g = cv.getContext('2d'), base = document.createElement('canvas'); base.width = base.height = N;
  const S = cv.width / N;
  let spec = normalise(initial || DEFAULT_MAP), tool = 'rock', drag = null, result = null; const undo = [];
  $('mb-tools').innerHTML = TOOLS.map(([id, n, d]) => `<label class="fchip lvl"><input type="radio" name="mb-tool" value="${id}"${id === tool ? ' checked' : ''}><span><b>${n}</b><small>${d}</small></span></label>`).join('');

  const paint = () => { // overlay: features and the live drag on top of the cached terrain picture
    g.imageSmoothingEnabled = false; g.drawImage(base, 0, 0, cv.width, cv.height);
    const m = result && result.map; if (!m) return;
    const rect = (x, z, w, h, fill, stroke) => { g.fillStyle = fill; g.fillRect(x * S, z * S, w * S, h * S); if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1.5; g.strokeRect(x * S + 0.5, z * S + 0.5, w * S - 1, h * S - 1); } };
    g.lineCap = 'round';
    for (const r of m.roads) { g.strokeStyle = 'rgba(70,72,76,0.75)'; g.lineWidth = r[4] * 2 * S; g.beginPath(); g.moveTo(r[0] * S, r[1] * S); g.lineTo(r[2] * S, r[3] * S); g.stroke(); }
    for (const r of m.ramps) { g.strokeStyle = '#f2e3b0'; g.lineWidth = 2; g.beginPath(); g.moveTo(r.x * S, r.z * S); g.lineTo((r.x + r.dx * r.len) * S, (r.z + r.dz * r.len) * S); g.stroke(); g.fillStyle = '#f2e3b0'; g.beginPath(); g.arc((r.x + r.dx * r.len) * S, (r.z + r.dz * r.len) * S, 4, 0, 6.283); g.fill(); }
    for (const d of m.docks) rect(d.x, d.z, 8, 6, '#2f7fd0', '#0b2a4a');
    for (const d of m.derricks) rect(d[0], d[1], 4, 4, '#1c1c1e', '#f2a93b');
    for (const r of m.bridges) { g.strokeStyle = '#8a6a44'; g.lineWidth = r[4] * 2 * S; g.lineCap = 'butt'; g.beginPath(); g.moveTo(r[0] * S, r[1] * S); g.lineTo(r[2] * S, r[3] * S); g.stroke(); g.lineCap = 'round'; }
    for (const c of m.civs) { rect(c[0], c[1], 6, 6, '#8d8f93', '#33363a'); g.fillStyle = '#111'; g.font = '9px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(CIV_KINDS[c[2]].split(' ')[0].slice(0, 4), (c[0] + 3) * S, (c[1] + 3) * S); }
    m.start.forEach((st, i) => { rect(st.cc[0], st.cc[1], 10, 10, i ? '#d6453a' : '#3fae5a', '#111'); g.fillStyle = '#fff'; g.font = 'bold 12px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(i ? 'ENEMY' : 'YOU', (st.cc[0] + 5) * S, (st.cc[1] + 5) * S); });
    const c = cv.width / 2; g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(c - 7, c); g.lineTo(c + 7, c); g.moveTo(c, c - 7); g.lineTo(c, c + 7); g.stroke(); // the mirror point: every object has a twin on the opposite side of it
    if (drag && drag.b) {
      g.strokeStyle = '#fff'; g.lineWidth = 2; g.setLineDash([5, 3]);
      if (tool in BRUSH) { g.setLineDash([]); g.fillStyle = ['rgba(120,90,60,0.6)', 'rgba(230,220,150,0.5)', 'rgba(52,116,146,0.65)'][BRUSH[tool]]; for (const q of drag.pts) for (const t of [q, mir(q)]) { g.beginPath(); g.arc(t[0] * S, t[1] * S, size() * S, 0, 6.283); g.fill(); } }
      else if (tool === 'rock') g.strokeRect(Math.min(drag.a[0], drag.b[0]) * S, Math.min(drag.a[1], drag.b[1]) * S, Math.abs(drag.b[0] - drag.a[0]) * S, Math.abs(drag.b[1] - drag.a[1]) * S);
      else { g.beginPath(); g.moveTo(drag.a[0] * S, drag.a[1] * S); g.lineTo(drag.b[0] * S, drag.b[1] * S); g.stroke(); }
      g.setLineDash([]);
    }
  };
  const rebuild = () => { // regenerate the terrain picture and the validation messages
    result = validateMap(spec);
    const m = result.map, bg = base.getContext('2d'), img = bg.createImageData(N, N), px = img.data;
    if (m) for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const r = m.rock[z * m.V + x], k = (z * N + x) * 4, dark = m.blocked[z * N + x] ? 0.62 : 1;
      const B = BIOMES[m.biome] || BIOMES.desert, lift = 1 + Math.max(0, Math.min(0.18, (m.height[z * m.V + x] - 0.8) * 0.06)) * (1 - r);   // hills show a little lighter
      px[k] = Math.min(255, (B.rgb[0] + (B.rock[0] - B.rgb[0]) * r) * dark * lift); px[k + 1] = Math.min(255, (B.rgb[1] + (B.rock[1] - B.rgb[1]) * r) * dark * lift); px[k + 2] = Math.min(255, (B.rgb[2] + (B.rock[2] - B.rgb[2]) * r) * dark * lift); px[k + 3] = 255;
      if (m.water[z * N + x]) { px[k] = 52; px[k + 1] = 116; px[k + 2] = 146; }
    }
    if (m) for (let i = 0; i < m.trees.length; i += 3) { const k = (Math.floor(m.trees[i + 1] / 2) * N + Math.floor(m.trees[i] / 2)) * 4; px[k] = 38; px[k + 1] = 78; px[k + 2] = 40; } // one dark dot per tree
    bg.putImageData(img, 0, 0);
    const msgs = result.errors.map(e => `<li class="bad">${e}</li>`).concat(result.warnings.map(w => `<li class="warn">${w}</li>`));
    if (result.ok) msgs.unshift(`<li class="good">Map is playable: ${spec.mesas.length * 2} plateaus, ${spec.paint.length} of ${MAP_LIMITS.paint} brush stamps, ${m.docks.length} Supply Docks, ${m.derricks.length} Oil Derricks, ${m.civs.length} buildings.</li>`);
    $('mb-msgs').innerHTML = msgs.join(''); $('mb-use').disabled = !result.ok; $('mb-undo').disabled = !undo.length;
    paint();
  };
  const edit = (fn) => { const before = JSON.stringify(spec); if (fn() === false) return; undo.push(before); if (undo.length > 60) undo.shift(); rebuild(); };
  const cell = (ev) => { const r = cv.getBoundingClientRect(); return [clamp((ev.clientX - r.left) / r.width * N, 0, N), clamp((ev.clientY - r.top) / r.height * N, 0, N)]; };
  const isDrag = () => tool === 'rock' || tool === 'ramp' || tool === 'road' || tool === 'water' || tool === 'bridge' || tool in BRUSH;
  const size = () => clamp(+$('mb-size').value || 6, 3, 14);
  const down = (ev) => { ev.preventDefault(); const p = cell(ev); if (isDrag()) { drag = { a: p, b: p, pts: [p] }; try { cv.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ } } else edit(() => applyTool(spec, tool, p, null, { kind: +$('mb-kind').value })); };
  const move = (ev) => { if (drag) { drag.b = cell(ev); const l = drag.pts[drag.pts.length - 1]; if (tool in BRUSH && Math.hypot(drag.b[0] - l[0], drag.b[1] - l[1]) >= size() * 0.6) drag.pts.push(drag.b); paint(); } };   // a brush stroke drops a stamp every 0.6 brush-widths
  const up = (ev) => { if (!drag) return; const d = drag; drag = null; d.b = cell(ev); edit(() => applyTool(spec, tool, d.a, d.b, { pts: d.pts, size: size() })); paint(); };
  const tools = (ev) => { if (ev.target.name === 'mb-tool') tool = ev.target.value; };
  const load = (s) => { edit(() => { spec = normalise(s); }); $('mb-biome').value = spec.biome || 'desert'; };
  const H = { 'mb-undo': () => { if (undo.length) { spec = JSON.parse(undo.pop()); rebuild(); } }, 'mb-canyon': () => load(DEFAULT_MAP), 'mb-open': () => load(OPEN_MAP), 'mb-forest': () => load(FOREST_MAP), 'mb-urban': () => load(URBAN_MAP), 'mb-arctic': () => load(ARCTIC_MAP), 'mb-clear': () => load({ mesas: [], ramps: [], roads: [], docks: [], derricks: [], civs: [], start: spec.start, biome: spec.biome }),
    'mb-use': () => { if (!result || !result.ok) return; try { localStorage.setItem(MAP_KEY, JSON.stringify(spec)); } catch (e) { /* storage unavailable: the map still works for this match */ } close(); onDone(spec); }, 'mb-cancel': () => { close(); onDone(null); } };
  const click = (ev) => { const b = ev.target.closest('button'); if (b && H[b.id]) H[b.id](); };
  const key = (ev) => { if (ev.key === 'Escape') H['mb-cancel'](); };
  function close() { root.hidden = true; cv.removeEventListener('pointerdown', down); cv.removeEventListener('pointermove', move); cv.removeEventListener('pointerup', up); $('mb-biome').removeEventListener('change', setBiome); $('mb-tools').removeEventListener('change', tools); root.removeEventListener('click', click); window.removeEventListener('keydown', key); }
  cv.addEventListener('pointerdown', down); cv.addEventListener('pointermove', move); cv.addEventListener('pointerup', up); $('mb-tools').addEventListener('change', tools); root.addEventListener('click', click); window.addEventListener('keydown', key);
  $('mb-kind').innerHTML = CIV_KINDS.map((n, i) => `<option value="${i}">${n}</option>`).join('');
  $('mb-biome').innerHTML = Object.entries(BIOMES).map(([id, b]) => `<option value="${id}">${b.name}</option>`).join('');
  const biome = $('mb-biome'), setBiome = () => edit(() => { spec.biome = biome.value; }); biome.addEventListener('change', setBiome);
  const syncBiome = () => { biome.value = spec.biome || 'desert'; };
  root.hidden = false; rebuild(); syncBiome();
  return { get spec() { return spec; }, get result() { return result; } }; // for tests
}
