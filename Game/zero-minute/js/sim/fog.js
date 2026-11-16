// Fog of War: per-team visibility at nav-cell resolution (2 m).
// A cell is visible when its centre lies within the sight radius of any
// friendly observer. `explored` is sticky. The renderer and minimap both go
// through canSee()/shouldShow() so there is one source of truth.
import { N, CELL, NEUTRAL } from './defs.js';
import { UNITS, BLDGS, GENERALS } from './factionRegistry.js';

export class Fog {
  constructor() {
    this.vis = [new Uint8Array(N * N), new Uint8Array(N * N)];
    this.exp = [new Uint8Array(N * N), new Uint8Array(N * N)];
    this.version = 0;
  }
  stamp(team, ox, oz, R) {
    const vis = this.vis[team], exp = this.exp[team];
    const z0 = Math.max(0, Math.ceil((oz - R) / CELL - 0.5)), z1 = Math.min(N - 1, Math.floor((oz + R) / CELL - 0.5));
    for (let z = z0; z <= z1; z++) {
      const dz = (z + 0.5) * CELL - oz, hw = Math.sqrt(R * R - dz * dz);
      const x0 = Math.max(0, Math.ceil((ox - hw) / CELL - 0.5)), x1 = Math.min(N - 1, Math.floor((ox + hw) / CELL - 0.5));
      if (x1 < x0) continue;
      const a = z * N + x0, b = z * N + x1 + 1;
      vis.fill(1, a, b); exp.fill(1, a, b);   // one native fill per row instead of a per-cell loop
    }
  }
  update(sim) {
    this.vis[0].fill(0); this.vis[1].fill(0);
    for (const e of sim.ents) {
      if (e.dead || e.team === NEUTRAL) continue;
      if (e.kind === 'unit') { if (!e.inB) this.stamp(e.team, e.x, e.z, UNITS[e.type].sight); }
      else this.stamp(e.team, e.x, e.z, sightOf(e));
    }
    // Cyber General: a permanent watch on every enemy building and the ground around it
    for (let t = 0; t < 2; t++) { const g = sim.teams[t].general && GENERALS[sim.teams[t].general]; if (g && g.spy && sim.tick >= (g.spyFrom || 0) * 20) for (const e of sim.ents) if (e.kind === 'bldg' && !e.dead && e.team === 1 - t && (!g.spySeen || e.seen[t])) this.stamp(t, e.x, e.z, g.spy); }   // spyFrom: seconds into the match before the watch starts; spySeen: only buildings this side has already found
    // areas lit by a support power: visible to that team until the timer runs out
    if (sim.reveals && sim.reveals.length) { sim.reveals = sim.reveals.filter(r => r.until > sim.tick); for (const r of sim.reveals) this.stamp(r.team, r.x, r.z, r.r); }
    // sticky "last seen" flag for structures
    for (const e of sim.ents) {
      if (e.kind !== 'bldg') continue;
      for (let t = 0; t < 2; t++) if (!e.seen[t] && this.canSee(t, e)) e.seen[t] = true;
    }
    this.version++;
  }
  visAt(team, wx, wz) {
    const x = Math.floor(wx / CELL), z = Math.floor(wz / CELL);
    return x >= 0 && z >= 0 && x < N && z < N && this.vis[team][z * N + x] === 1;
  }
  // Is entity e currently inside team's vision?
  canSee(team, e) {
    if (e.team === team) return true;
    if (e.kind === 'unit') return this.visAt(team, e.x, e.z) && !(e.cloaked && !e.detected);
    const hx = e.w * CELL * 0.5 - 1, hz = e.h * CELL * 0.5 - 1;
    return this.visAt(team, e.x, e.z) || this.visAt(team, e.x - hx, e.z - hz) || this.visAt(team, e.x + hx, e.z - hz) ||
      this.visAt(team, e.x - hx, e.z + hz) || this.visAt(team, e.x + hx, e.z + hz);
  }
  // Should a viewer on `team` be shown entity e (3D view and minimap)?
  // Enemy units: only while visible. Enemy structures: once seen, stay as last-known.
  // Civilian buildings and Supply Docks are map features and always drawn.
  shouldShow(team, e) {
    if (e.team === team) return e.kind === 'bldg' || !e.inB;
    if (e.kind === 'unit') return !e.inB && this.visAt(team, e.x, e.z) && !(e.cloaked && !e.detected);
    if (!BLDGS[e.type].faction) return true; // map features (docks, derricks, civilian blocks) are always drawn
    return e.seen[team] || this.canSee(team, e);
  }
}
export function sightOf(b) { return BLDGS[b.type].sight + Math.max(b.w, b.h) * CELL * 0.35; }
