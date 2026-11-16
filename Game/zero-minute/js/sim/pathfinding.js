// Navigation grid: clearance maps, connectivity, A* with string-pulling.
import { N, CELL } from './defs.js';

const SQ2 = 1.41421356;
const HW = 1.12; // heuristic weight: above 1 the search heads for the goal more directly and expands fewer cells, for paths at most 12% longer
const DX = [1, -1, 0, 0, 1, 1, -1, -1], DZ = [0, 0, 1, -1, 1, -1, 1, -1];
// Movement classes. 0 infantry, 1 vehicles; 2 and 3 the same but amphibious (water does not block them);
// 4 boat, 5 warship, 6 landing craft (ships: water only, and they keep off the shore).
// FIELD: which clearance field a class reads (0 land, 1 amphibious, 2 sea). A cell is passable when its clearance is
// greater than NEED: so a boat stays 3 cells (6 m) from the shore, a warship 5 (10 m), and a landing craft may touch it.
const FIELD = [0, 0, 1, 1, 2, 2, 2];
const NEED = [0, 1, 0, 1, 2, 4, 0];
export const NAV_BOAT = 4, NAV_WARSHIP = 5, NAV_BEACH = 6;
export const isShipClass = (cls) => cls >= 4;
const BS = 8;        // cells per side of a coarse block (16 m): long trips are routed over blocks first
const LONG = 96;     // cells: a trip longer than this uses the coarse route as a corridor for the detailed search
const FLOOD = 9000;  // cells a short trip may search before it, too, is given a coarse route (the way round an island or a long wall)
const ROAD_COST = 0.8;   // a road cell costs a vehicle this much of an ordinary one (its speed there is 1.25x)
const PAD = 7;       // cells around a changed building that its clearance can reach (the fields are capped at 6)

export class Nav {
  constructor(staticBlocked, road = null) {
    const NN = N * N;
    this.stat = staticBlocked; this.road = road;   // road: cells where ground vehicles are faster, so their routes prefer them
    this.bld = new Uint8Array(NN);     // cells covered by buildings
    this.dist = new Uint8Array(NN);    // Chebyshev distance to nearest blocked cell (cap 6)
    this.soft = new Uint8Array(NN);    // loading bays: passable, but through-traffic routes around them
    this.hasWater = false; for (let i = 0; i < NN; i++) if (staticBlocked[i] === 2) { this.hasWater = true; break; }
    this.distW = this.hasWater ? new Uint8Array(NN) : this.dist;   // clearance for amphibious units (same field when the map is dry)
    this.distS = new Uint8Array(NN);                                // clearance for ships: distance from a water cell to the nearest cell that is not water
    this.fields = [this.dist, this.distW, this.distS];
    const c0 = new Int32Array(NN), c1 = new Int32Array(NN), mk = () => this.hasWater ? new Int32Array(NN) : null;
    let none = null; const dry = () => none || (none = new Int32Array(NN).fill(-1));   // a dry map has no ship cells at all
    this.comp = [c0, c1, mk() || c0, mk() || c1, mk() || dry(), mk() || dry(), mk() || dry()];
    this.g = new Float32Array(NN);
    this.par = new Int32Array(NN);
    this.open = new Uint32Array(NN);
    this.closed = new Uint32Array(NN);
    this.stack = new Int32Array(NN);
    this.gen = 0; this.version = 0; this.dirty = false; this.rects = [];
    this.hk = []; this.hv = [];
    // coarse blocks (see _coarse)
    const M = this.M = Math.ceil(N / BS), MM = M * M;
    this.cg = new Float32Array(MM); this.cpar = new Int32Array(MM); this.copen = new Uint32Array(MM); this.cclosed = new Uint32Array(MM);
    this.cyes = new Uint32Array(MM); this.cno = new Uint32Array(MM); this.corr = new Uint32Array(MM); this.cgen = 0;
    this.rebuild(true);
  }
  setRect(cx, cz, w, h, v) {
    for (let z = cz; z < cz + h; z++) for (let x = cx; x < cx + w; x++) this.bld[z * N + x] = v;
    this.dirty = true; this.rects.push(cx, cz, w, h);
  }
  // Bring the clearance fields and the connectivity up to date. After buildings changed only the ground around them is
  // recomputed (their clearance reaches PAD cells at most); `full` redoes the whole map.
  rebuild(full = false) {
    const R = this.rects; let sea = full;
    if (full || !R.length) { this._clear(0, 0, 0, N - 1, N - 1); if (this.hasWater) { this._clear(1, 0, 0, N - 1, N - 1); this._clear(2, 0, 0, N - 1, N - 1); sea = true; } }
    else for (let k = 0; k < R.length; k += 4) {
      const x0 = Math.max(0, R[k] - PAD), z0 = Math.max(0, R[k + 1] - PAD), x1 = Math.min(N - 1, R[k] + R[k + 2] + PAD), z1 = Math.min(N - 1, R[k + 1] + R[k + 3] + PAD);
      this._clear(0, x0, z0, x1, z1);
      if (this.hasWater) {
        this._clear(1, x0, z0, x1, z1);
        let wet = false; const s = this.stat; for (let z = z0; z <= z1 && !wet; z++) for (let x = x0; x <= x1; x++) if (s[z * N + x] === 2) { wet = true; break; }
        if (wet) { this._clear(2, x0, z0, x1, z1); sea = true; }   // only a building on the shore (a shipyard) changes where ships can go
      }
    }
    R.length = 0;
    this._comps(this.dist, [this.comp[0], this.comp[1]], [0, 1]);
    if (this.hasWater) {
      this._comps(this.distW, [this.comp[2], this.comp[3]], [0, 1]);
      if (sea) this._comps(this.distS, [this.comp[4], this.comp[5], this.comp[6]], [NEED[4], NEED[5], NEED[6]]);
    }
    this.dirty = false; this.version++;
  }
  // Clearance field `f` (0 land, 1 amphibious, 2 sea) inside a window: Chebyshev distance to the nearest cell the field
  // counts as closed, capped at 6. Static cells: 1 = rock or map edge, 2 = water. The cells around the window keep
  // their values and feed the two passes, so a window PAD wider than the change gives the same result as a full pass.
  _clear(f, x0, z0, x1, z1) {
    const s = this.stat, b = this.bld, d = this.fields[f];
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const i = z * N + x;
      d[i] = (f === 2 ? (s[i] === 2 && !b[i]) : f === 1 ? !(s[i] === 1 || b[i]) : !(s[i] || b[i])) ? 6 : 0;
    }
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const i = z * N + x; let v = d[i]; if (!v) continue;
      if (x === 0 || z === 0 || x === N - 1 || z === N - 1) { d[i] = 1; continue; }
      v = Math.min(v, d[i - 1] + 1, d[i - N] + 1, d[i - N - 1] + 1, d[i - N + 1] + 1); d[i] = v;
    }
    for (let z = z1; z >= z0; z--) for (let x = x1; x >= x0; x--) {
      const i = z * N + x; let v = d[i]; if (!v) continue;
      if (x === 0 || z === 0 || x === N - 1 || z === N - 1) continue;
      v = Math.min(v, d[i + 1] + 1, d[i + N] + 1, d[i + N + 1] + 1, d[i + N - 1] + 1); d[i] = v;
    }
  }
  // Connected components of one field, one set per class: cells whose clearance is greater than `need`.
  _comps(d, comps, needs) {
    const stack = this.stack, NN = N * N; let sp = 0; // preallocated: no array growth, no garbage
    for (let q = 0; q < comps.length; q++) {
      const c = comps[q], cls = needs[q]; c.fill(-1); let id = 0;
      for (let i = 0; i < NN; i++) {
        if (d[i] <= cls || c[i] >= 0) continue;
        c[i] = id; stack[sp++] = i;
        while (sp) {
          const k = stack[--sp], x = k % N;
          if (x > 0 && d[k - 1] > cls && c[k - 1] < 0) { c[k - 1] = id; stack[sp++] = k - 1; }
          if (x < N - 1 && d[k + 1] > cls && c[k + 1] < 0) { c[k + 1] = id; stack[sp++] = k + 1; }
          if (k >= N && d[k - N] > cls && c[k - N] < 0) { c[k - N] = id; stack[sp++] = k - N; }
          if (k < NN - N && d[k + N] > cls && c[k + N] < 0) { c[k + N] = id; stack[sp++] = k + N; }
        }
        id++;
      }
    }
  }
  cellOf(wx, wz) {
    const x = Math.min(N - 1, Math.max(0, (wx / CELL) | 0)), z = Math.min(N - 1, Math.max(0, (wz / CELL) | 0));
    return z * N + x;
  }
  pass(c, cls) { return this.fields[FIELD[cls]][c] > NEED[cls]; }
  passAt(wx, wz, cls) { return wx >= 0 && wz >= 0 && wx < N * CELL && wz < N * CELL && this.fields[FIELD[cls]][this.cellOf(wx, wz)] > NEED[cls]; }
  isWater(c) { return this.stat[c] === 2; }

  // Nearest passable cell to (cx,cz), optionally restricted to a component. -1 if none within maxR.
  nearest(cx, cz, cls0, comp = -1, maxR = 30) {
    const d = this.fields[FIELD[cls0]], cm = this.comp[cls0], cls = NEED[cls0];
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
    const dx = x1 - x0, dz = z1 - z0, n = Math.ceil(Math.hypot(dx, dz) * 2.5) || 1, d = this.fields[FIELD[cls0]], sf = this.soft, cls = NEED[cls0];
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

  // Coarse route for a long trip: A* over 16 m blocks that hold at least one cell of the traveller's component.
  // Marks the blocks along the route, and their neighbours, as the corridor the detailed search may use.
  // Returns the corridor's stamp (0 when no coarse route was found) and adds its work to this.cx.
  _coarse(sc, gc, cm, comp) {
    const M = this.M, gen = ++this.cgen, cg = this.cg, cpar = this.cpar, copen = this.copen, cclosed = this.cclosed, yes = this.cyes, no = this.cno;
    const ok = (b) => {
      if (yes[b] === gen) return true; if (no[b] === gen) return false;
      const bx = (b % M) * BS, bz = ((b / M) | 0) * BS, x1 = Math.min(N, bx + BS), z1 = Math.min(N, bz + BS);
      for (let z = bz; z < z1; z++) for (let x = bx, i = z * N + bx; x < x1; x++, i++) if (cm[i] === comp) { yes[b] = gen; return true; }
      no[b] = gen; return false;
    };
    const sb = (((sc / N) | 0) >> 3) * M + ((sc % N) >> 3), gb = (((gc / N) | 0) >> 3) * M + ((gc % N) >> 3), gbx = gb % M, gbz = (gb / M) | 0;
    this.hk.length = 0; this.hv.length = 0; cg[sb] = 0; cpar[sb] = -1; copen[sb] = gen; this._push(0, sb);
    let found = false;
    while (this.hk.length) {
      const c = this._pop(); if (cclosed[c] === gen) continue;
      cclosed[c] = gen; this.cx++;
      if (c === gb) { found = true; break; }
      const cx = c % M, cz = (c / M) | 0, gcur = cg[c];
      for (let k = 0; k < 8; k++) {
        const nx = cx + DX[k], nz = cz + DZ[k]; if (nx < 0 || nz < 0 || nx >= M || nz >= M) continue;
        const n = nz * M + nx; if (cclosed[n] === gen || !ok(n)) continue;
        if (k >= 4 && (!ok(cz * M + nx) || !ok(nz * M + cx))) continue;
        const ng = gcur + (k >= 4 ? SQ2 : 1);
        if (copen[n] !== gen || ng < cg[n]) { cg[n] = ng; cpar[n] = c; copen[n] = gen; const ax = Math.abs(nx - gbx), az = Math.abs(nz - gbz); this._push(ng + (ax + az + (SQ2 - 2) * Math.min(ax, az)) * HW, n); }
      }
    }
    if (!found) return 0;
    const corr = this.corr;
    for (let c = gb; c >= 0; c = cpar[c]) {
      const cx = c % M, cz = (c / M) | 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const x = cx + dx, z = cz + dz; if (x >= 0 && z >= 0 && x < M && z < M) corr[z * M + x] = gen; }
    }
    return gen;
  }

  // The detailed search from cell sc to cell gc. `lane`: a corridor stamp from _coarse, or 0 for the whole map.
  // `limit`: give up after this many cells (returns false with this.capped set).
  _search(sc, gc, d, cls, lane, limit = 0, road = null) {
    const g = this.g, par = this.par, open = this.open, closed = this.closed, gen = ++this.gen, sf = this.soft, corr = this.corr, M = this.M;
    const gcx = gc % N, gcz = (gc / N) | 0;
    this.hk.length = 0; this.hv.length = 0;
    g[sc] = 0; par[sc] = -1; open[sc] = gen; this._push(0, sc);
    let found = false, used = 0; this.capped = false;
    while (this.hk.length) {
      const c = this._pop();
      if (closed[c] === gen) continue;
      closed[c] = gen; this.cx++;
      if (c === gc) { found = true; break; }
      if (limit && ++used > limit) { this.capped = true; break; }
      const cx = c % N, cz = (c / N) | 0, gcur = g[c];
      for (let k = 0; k < 8; k++) {
        const nx = cx + DX[k], nz = cz + DZ[k];
        if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
        const n = nz * N + nx, dn = d[n];
        if (dn <= cls || closed[n] === gen) continue;
        if (lane && corr[(nz >> 3) * M + (nx >> 3)] !== lane) continue;
        if (k >= 4 && (d[cz * N + nx] <= cls || d[nz * N + cx] <= cls)) continue;
        const ng = gcur + (k >= 4 ? SQ2 : 1) * (road && road[n] ? ROAD_COST : 1) + (dn < cls + 3 ? 0.35 : 0) + (sf[n] ? 8 : 0); // keep off walls and out of loading bays; a road is quicker going
        if (open[n] !== gen || ng < g[n]) {
          g[n] = ng; par[n] = c; open[n] = gen;
          const ax = Math.abs(nx - gcx), az = Math.abs(nz - gcz);
          this._push(ng + (ax + az + (SQ2 - 2) * Math.min(ax, az)) * HW, n);
        }
      }
    }
    return found;
  }

  // World-space path request. Returns { path:[x0,z0,x1,z1,...] | null, expanded }
  findPath(sx, sz, gx, gz, cls0) {
    const d = this.fields[FIELD[cls0]], cm = this.comp[cls0], cls = NEED[cls0];
    let sc = this.cellOf(sx, sz);
    let startFix = -1;
    if (d[sc] <= cls) { startFix = this.nearest(sc % N, (sc / N) | 0, cls0, -1, 12); if (startFix < 0) return { path: null, expanded: 1 }; sc = startFix; }
    const comp = cm[sc];
    let gc = this.cellOf(gx, gz), exact = true;
    // A goal the traveller cannot stand on (a ship sent ashore, a tank sent out to sea) becomes the nearest place it can: on the big maps that may be some way off.
    if (d[gc] <= cls || cm[gc] !== comp) { gc = this.nearest(gc % N, (gc / N) | 0, cls0, comp, cls0 >= 4 ? 220 : N > 256 ? 120 : 40); exact = false; if (gc < 0) return { path: null, expanded: 1 }; }
    const par = this.par, gcx = gc % N, gcz = (gc / N) | 0;
    this.cx = 0;
    // A long trip is routed over coarse blocks first; the detailed search then stays inside that corridor instead of
    // flooding every dead end on the way (a coastline, a canyon wall). If the corridor turns out to be closed, search the whole map.
    const far = Math.max(Math.abs((sc % N) - gcx), Math.abs(((sc / N) | 0) - gcz)) > LONG;
    let lane = far ? this._coarse(sc, gc, cm, comp) : 0;
    const road = (cls0 === 1 || cls0 === 3) ? this.road : null;   // ground vehicles only
    let found = this._search(sc, gc, d, cls, lane, lane ? 0 : FLOOD, road);
    if (!found && !lane && this.capped) { lane = this._coarse(sc, gc, cm, comp); found = this._search(sc, gc, d, cls, lane, 0, road); }   // a short hop that turned out to be a long way round
    if (!found && lane) found = this._search(sc, gc, d, cls, 0, 0, road);
    const expanded = this.cx;
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
