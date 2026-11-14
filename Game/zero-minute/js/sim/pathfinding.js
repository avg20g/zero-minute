// Navigation grid: clearance map, connectivity, A* with string-pulling.
import { N, CELL } from './defs.js';

const SQ2 = 1.41421356;
const HW = 1.12; // heuristic weight: above 1 the search heads for the goal more directly and expands fewer cells, for paths at most 12% longer
const DX = [1, -1, 0, 0, 1, 1, -1, -1], DZ = [0, 0, 1, -1, 1, -1, 1, -1];

export class Nav {
  constructor(staticBlocked) {
    this.stat = staticBlocked;
    this.bld = new Uint8Array(N * N);     // cells covered by buildings
    this.dist = new Uint8Array(N * N);    // Chebyshev distance to nearest blocked cell (cap 6)
    this.soft = new Uint8Array(N * N);    // loading bays: passable, but through-traffic routes around them
    this.hasWater = false; for (let i = 0; i < N * N; i++) if (staticBlocked[i] === 2) { this.hasWater = true; break; }
    this.distW = this.hasWater ? new Uint8Array(N * N) : this.dist;   // clearance for amphibious units (same field when the map is dry)
    const c0 = new Int32Array(N * N), c1 = new Int32Array(N * N);
    this.comp = [c0, c1, this.hasWater ? new Int32Array(N * N) : c0, this.hasWater ? new Int32Array(N * N) : c1];
    this.g = new Float32Array(N * N);
    this.par = new Int32Array(N * N);
    this.open = new Uint32Array(N * N);
    this.closed = new Uint32Array(N * N);
    this.gen = 0; this.version = 0; this.dirty = false;
    this.hk = []; this.hv = [];
    this.rebuild();
  }
  setRect(cx, cz, w, h, v) {
    for (let z = cz; z < cz + h; z++) for (let x = cx; x < cx + w; x++) this.bld[z * N + x] = v;
    this.dirty = true;
  }
  rebuild() {
    this._field(this.dist, this.comp[0], this.comp[1], false);
    if (this.hasWater) this._field(this.distW, this.comp[2], this.comp[3], true);   // second field for amphibious units: water is open
    this.dirty = false; this.version++;
  }
  // Clearance field (Chebyshev distance to the nearest blocked cell, cap 6) and connected components for
  // infantry (clearance > 0) and vehicles (clearance > 1). Static cells: 1 = rock or map edge, 2 = water.
  _field(d, comp0, comp1, amph) {
    const s = this.stat, b = this.bld;
    if (amph) for (let i = 0; i < N * N; i++) d[i] = (s[i] === 1 || b[i]) ? 0 : 6;
    else for (let i = 0; i < N * N; i++) d[i] = (s[i] || b[i]) ? 0 : 6;
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const i = z * N + x; let v = d[i]; if (!v) continue;
      if (x === 0 || z === 0 || x === N - 1 || z === N - 1) { d[i] = 1; continue; }
      v = Math.min(v, d[i - 1] + 1, d[i - N] + 1, d[i - N - 1] + 1, d[i - N + 1] + 1); d[i] = v;
    }
    for (let z = N - 1; z >= 0; z--) for (let x = N - 1; x >= 0; x--) {
      const i = z * N + x; let v = d[i]; if (!v) continue;
      if (x === 0 || z === 0 || x === N - 1 || z === N - 1) continue;
      v = Math.min(v, d[i + 1] + 1, d[i + N] + 1, d[i + N + 1] + 1, d[i + N - 1] + 1); d[i] = v;
    }
    const stack = this.stack || (this.stack = new Int32Array(N * N)); let sp = 0; // preallocated: no array growth, no garbage
    for (let cls = 0; cls < 2; cls++) {
      const c = cls ? comp1 : comp0; c.fill(-1); let id = 0;
      for (let i = 0; i < N * N; i++) {
        if (d[i] <= cls || c[i] >= 0) continue;
        c[i] = id; stack[sp++] = i;
        while (sp) {
          const k = stack[--sp], x = k % N;
          if (x > 0 && d[k - 1] > cls && c[k - 1] < 0) { c[k - 1] = id; stack[sp++] = k - 1; }
          if (x < N - 1 && d[k + 1] > cls && c[k + 1] < 0) { c[k + 1] = id; stack[sp++] = k + 1; }
          if (k >= N && d[k - N] > cls && c[k - N] < 0) { c[k - N] = id; stack[sp++] = k - N; }
          if (k < N * N - N && d[k + N] > cls && c[k + N] < 0) { c[k + N] = id; stack[sp++] = k + N; }
        }
        id++;
      }
    }
  }
  cellOf(wx, wz) {
    const x = Math.min(N - 1, Math.max(0, (wx / CELL) | 0)), z = Math.min(N - 1, Math.max(0, (wz / CELL) | 0));
    return z * N + x;
  }
  // Movement classes: 0 infantry, 1 vehicles; +2 = amphibious (water does not block them).
  pass(c, cls) { return (cls > 1 ? this.distW : this.dist)[c] > (cls & 1); }
  passAt(wx, wz, cls) { return wx >= 0 && wz >= 0 && wx < N * CELL && wz < N * CELL && (cls > 1 ? this.distW : this.dist)[this.cellOf(wx, wz)] > (cls & 1); }

  // Nearest passable cell to (cx,cz), optionally restricted to a component. -1 if none within maxR.
  nearest(cx, cz, cls0, comp = -1, maxR = 30) {
    const d = cls0 > 1 ? this.distW : this.dist, cm = this.comp[cls0], cls = cls0 & 1;
    let best = -1, bd = 1e9;
    for (let r = 0; r <= maxR; r++) {
      if (best >= 0 && r * r > bd) break;
      for (let dz = -r; dz <= r; dz++) {
        const z = cz + dz; if (z < 0 || z >= N) continue;
        const step = (Math.abs(dz) === r) ? 1 : 2 * r;
        for (let dx = -r; dx <= r; dx += step || 1) {
          const x = cx + dx; if (x < 0 || x >= N) continue;
          const i = z * N + x;
          if (d[i] <= cls || (comp >= 0 && cm[i] !== comp)) continue;
          const q = dx * dx + dz * dz;
          if (q < bd) { bd = q; best = i; }
        }
      }
    }
    return best;
  }

  lineClear(x0, z0, x1, z1, cls0) { // cell coords (floats, cell-centre = +0.5)
    const dx = x1 - x0, dz = z1 - z0, n = Math.ceil(Math.hypot(dx, dz) * 2.5) || 1, d = cls0 > 1 ? this.distW : this.dist, sf = this.soft, cls = cls0 & 1;
    for (let i = 1; i < n; i++) {
      const t = i / n, c = ((z0 + dz * t) | 0) * N + ((x0 + dx * t) | 0);
      if (d[c] <= cls || sf[c]) return false;
    }
    return true;
  }

  _push(k, v) {
    const hk = this.hk, hv = this.hv; let i = hk.length; hk.push(k); hv.push(v);
    while (i > 0) { const p = (i - 1) >> 1; if (hk[p] <= k) break; hk[i] = hk[p]; hv[i] = hv[p]; i = p; }
    hk[i] = k; hv[i] = v;
  }
  _pop() {
    const hk = this.hk, hv = this.hv, top = hv[0], k = hk.pop(), v = hv.pop(), n = hk.length;
    if (n) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1; if (c >= n) break;
        if (c + 1 < n && hk[c + 1] < hk[c]) c++;
        if (hk[c] >= k) break;
        hk[i] = hk[c]; hv[i] = hv[c]; i = c;
      }
      hk[i] = k; hv[i] = v;
    }
    return top;
  }

  // World-space path request. Returns { path:[x0,z0,x1,z1,...] | null, expanded }
  findPath(sx, sz, gx, gz, cls0) {
    const d = cls0 > 1 ? this.distW : this.dist, cm = this.comp[cls0], cls = cls0 & 1;
    let sc = this.cellOf(sx, sz);
    let startFix = -1;
    if (d[sc] <= cls) { startFix = this.nearest(sc % N, (sc / N) | 0, cls0, -1, 12); if (startFix < 0) return { path: null, expanded: 1 }; sc = startFix; }
    const comp = cm[sc];
    let gc = this.cellOf(gx, gz), exact = true;
    if (d[gc] <= cls || cm[gc] !== comp) { gc = this.nearest(gc % N, (gc / N) | 0, cls0, comp, 40); exact = false; if (gc < 0) return { path: null, expanded: 1 }; }
    const g = this.g, par = this.par, open = this.open, closed = this.closed, gen = ++this.gen, sf = this.soft;
    const gcx = gc % N, gcz = (gc / N) | 0;
    this.hk.length = 0; this.hv.length = 0;
    g[sc] = 0; par[sc] = -1; open[sc] = gen; this._push(0, sc);
    let expanded = 0, found = false;
    while (this.hk.length) {
      const c = this._pop();
      if (closed[c] === gen) continue;
      closed[c] = gen; expanded++;
      if (c === gc) { found = true; break; }
      const cx = c % N, cz = (c / N) | 0, gcur = g[c];
      for (let k = 0; k < 8; k++) {
        const nx = cx + DX[k], nz = cz + DZ[k];
        if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
        const n = nz * N + nx, dn = d[n];
        if (dn <= cls || closed[n] === gen) continue;
        if (k >= 4 && (d[cz * N + nx] <= cls || d[nz * N + cx] <= cls)) continue;
        const ng = gcur + (k >= 4 ? SQ2 : 1) + (dn < cls + 3 ? 0.35 : 0) + (sf[n] ? 8 : 0); // keep off walls and out of loading bays
        if (open[n] !== gen || ng < g[n]) {
          g[n] = ng; par[n] = c; open[n] = gen;
          const ax = Math.abs(nx - gcx), az = Math.abs(nz - gcz);
          this._push(ng + (ax + az + (SQ2 - 2) * Math.min(ax, az)) * HW, n);
        }
      }
    }
    if (!found) return { path: null, expanded };
    const cells = [];
    for (let c = gc; c >= 0; c = par[c]) cells.push(c);
    cells.reverse();
    // string-pull
    const out = [];
    let i = 0;
    const last = cells.length - 1;
    while (i < last) {
      let j = Math.min(last, i + 48);
      const ax = (cells[i] % N) + 0.5, az = ((cells[i] / N) | 0) + 0.5;
      while (j > i + 1 && !this.lineClear(ax, az, (cells[j] % N) + 0.5, ((cells[j] / N) | 0) + 0.5, cls0)) j--;
      out.push(((cells[j] % N) + 0.5) * CELL, (((cells[j] / N) | 0) + 0.5) * CELL);
      i = j;
    }
    if (!out.length) out.push((gcx + 0.5) * CELL, (gcz + 0.5) * CELL);
    if (exact) { out[out.length - 2] = gx; out[out.length - 1] = gz; }
    if (startFix >= 0) out.unshift(((sc % N) + 0.5) * CELL, (((sc / N) | 0) + 0.5) * CELL);
    return { path: out, expanded };
  }
}
