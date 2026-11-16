// Movement: path following + local steering (separation, anticipatory
// avoidance, convoy following), heading-limited vehicles, overlap resolution,
// stuck detection. Runs once per sim tick; fully deterministic.
import { N, CELL, DT, angDiff, ROAD_SPEED, SWIM_SPEED } from './defs.js';
import { UNITS } from './factionRegistry.js';
import { reqPath } from './entities.js';

const B = 8; // spatial hash: 8 m buckets
let GW = 0, head = null;   // sized for the map being stepped (maps come in several sizes)
const nextI = new Int32Array(4096);
let list = [];

function buildHash(sim) {
  const gw = (N * CELL / B) | 0; if (gw !== GW) { GW = gw; head = new Int32Array(GW * GW); }
  head.fill(-1); list.length = 0;
  for (const e of sim.ents) {
    if (e.kind !== 'unit' || e.dead || e.inB || e.air) continue; // aircraft are handled in air.js
    const i = list.length; if (i >= 4096) break;
    list.push(e);
    const b = Math.min(GW - 1, (e.z / B) | 0) * GW + Math.min(GW - 1, (e.x / B) | 0);
    nextI[i] = head[b]; head[b] = i;
  }
}

function immovable(u) { return u.still || u.working || u.deployed || u.inert; }

export function stepMovement(sim) {
  const nav = sim.nav, road = sim.map.road;
  buildHash(sim);
  const n = list.length;

  for (let i = 0; i < n; i++) {
    const u = list[i], d = UNITS[u.type];
    // top speed here: vehicles are faster on a road, amphibious units are slow while they swim
    const here = nav.cellOf(u.x, u.z), ms = u.nc > 3 ? u.ms : nav.stat[here] === 2 ? u.ms * SWIM_SPEED : (u.cls === 1 && road[here] ? u.ms * ROAD_SPEED : u.ms);
    u.px = u.x; u.pz = u.z; u.pfacing = u.facing; u.pturret = u.turret; u.arrived = false;

    // Standing inside something solid (a building was placed on us): walk out.
    if (!nav.passAt(u.x, u.z, u.nc)) {
      const c = nav.nearest((u.x / CELL) | 0, (u.z / CELL) | 0, u.nc, -1, 14);
      if (c >= 0) {
        const tx = ((c % N) + 0.5) * CELL, tz = (((c / N) | 0) + 0.5) * CELL, l = Math.hypot(tx - u.x, tz - u.z) || 1;
        const s = Math.min(l, 7 * DT); u.x += (tx - u.x) / l * s; u.z += (tz - u.z) / l * s;
      }
      continue;
    }

    // --- path following ---
    let dvx = 0, dvz = 0, want = 0, dirx = 0, dirz = 0, following = false;
    if (u.path && !immovable(u)) {
      let ex = u.path[u.pi] - u.x, ez = u.path[u.pi + 1] - u.z, dist = Math.hypot(ex, ez);
      while (u.pi < u.path.length - 2 && dist < Math.max(2.4, u.radius * 1.4)) {
        // Cut the corner only if the way to the next point is open from where the unit actually stands. Otherwise it must
        // reach this point first (a unit beside a building could skip the step around its corner and push into the wall forever).
        if (dist > 0.7 && !nav.lineClear(u.x / CELL, u.z / CELL, u.path[u.pi + 2] / CELL, u.path[u.pi + 3] / CELL, u.nc)) break;
        u.pi += 2; ex = u.path[u.pi] - u.x; ez = u.path[u.pi + 1] - u.z; dist = Math.hypot(ex, ez);
      }
      const last = u.pi >= u.path.length - 2;
      if (last && dist < 0.5 + u.stuck * 0.7) { u.path = null; u.stuck = 0; u.arrived = true; }
      else {
        want = last ? Math.min(ms, Math.max(1.5, dist * 2.2)) : ms;
        dirx = ex / dist; dirz = ez / dist; following = true;
      }
    }

    // --- neighbours: separation, avoidance, convoy ---
    let sx = 0, sz = 0, ax = 0, az = 0; // separation (m/s), avoidance (unitless steer)
    const bx = Math.min(GW - 1, (u.x / B) | 0), bz = Math.min(GW - 1, (u.z / B) | 0);
    const look = 4 + u.spd * 0.7;
    for (let gz = Math.max(0, bz - 1); gz <= Math.min(GW - 1, bz + 1); gz++) for (let gx = Math.max(0, bx - 1); gx <= Math.min(GW - 1, bx + 1); gx++) {
      for (let j = head[gz * GW + gx]; j >= 0; j = nextI[j]) {
        if (j === i) continue;
        const o = list[j];
        let rx = o.x - u.x, rz = o.z - u.z;
        const rr = u.radius + o.radius, dd = Math.hypot(rx, rz);
        // vehicles shove infantry aside rather than the other way round
        const wgt = (u.cls === 1 && o.cls === 0) ? 0.15 : 1;
        if (dd < rr + 0.6) {
          let nx, nz;
          if (dd < 0.01) { const a = u.id * 2.399963; nx = Math.cos(a); nz = Math.sin(a); } else { nx = -rx / dd; nz = -rz / dd; }
          const push = (rr + 0.6 - dd) / (rr + 0.6);
          const yieldW = following ? (o.path ? 1 : 0.45) : 1.3; // idle units step aside for traffic
          sx += nx * push * 9 * wgt * yieldW; sz += nz * push * 9 * wgt * yieldW;
        }
        if (following && wgt === 1) {
          const ahead = rx * dirx + rz * dirz;
          if (ahead > 0 && ahead < look + rr) {
            const lat = dirx * rz - dirz * rx; // + : neighbour is on our right-hand perp
            if (Math.abs(lat) < rr + 0.5) {
              const sameWay = o.path && (o.vx * dirx + o.vz * dirz) > 0.5 * o.spd && o.spd > 0.5;
              const gap = ahead - rr;
              if (sameWay) { // convoy: match speed instead of weaving
                if (gap < 1.5 + u.spd * 0.3) want = Math.min(want, Math.max(0, o.spd * gap / 1.5));
              } else {
                const k = (1 - Math.max(0, gap) / look) * (1 - Math.abs(lat) / (rr + 0.5)) * 1.5;
                const side = lat >= -0.15 ? -1 : 1;     // pass on a consistent side when head-on
                ax += -dirz * side * k; az += dirx * side * k;
                // brake only when genuinely on a collision course
                if (Math.abs(lat) < rr * 0.8) want = Math.min(want, Math.max(1.5, 1.5 + gap * 2.4));
              }
            }
          }
        }
      }
    }

    let stx = dirx + ax, stz = dirz + az;
    if (following) { const sl = Math.hypot(stx, stz); if (sl > 0.001) { stx /= sl; stz /= sl; } else { stx = dirx; stz = dirz; } }
    dvx = stx * want + sx; dvz = stz * want + sz;
    const lim = following ? ms : Math.min(ms, 5);
    const mag = Math.hypot(dvx, dvz);
    if (mag > lim) { dvx *= lim / mag; dvz *= lim / mag; }
    if (immovable(u)) { dvx = 0; dvz = 0; }

    // --- integrate ---
    if (u.cls === 1 && following) {
      const m = Math.hypot(dvx, dvz);
      // Reverse-move: the hull points AWAY from the direction of travel and the vehicle backs up at
      // 60% speed, so its front armour stays toward whatever it is retreating from.
      const rev = !!(u.order && u.order.rev), dir = rev ? -1 : 1;
      if (m > 0.05) {
        const diff = angDiff(Math.atan2(dvz * dir, dvx * dir), u.facing), ma = d.turn * DT;
        u.facing += Math.max(-ma, Math.min(ma, diff));
        const ad = Math.abs(diff);
        const tgt = ad > 1.3 ? 0 : m * Math.max(0.2, Math.cos(ad)) * (rev ? 0.6 : 1);
        u.spd += Math.max(-45 * DT, Math.min(16 * DT, tgt - u.spd));
      } else u.spd = Math.max(0, u.spd - 45 * DT);
      u.vx = Math.cos(u.facing) * u.spd * dir; u.vz = Math.sin(u.facing) * u.spd * dir;
    } else {
      u.vx = dvx; u.vz = dvz; u.spd = Math.hypot(dvx, dvz);
      if (u.cls === 0 && u.spd > 0.6 && following) {
        const diff = angDiff(Math.atan2(dvz, dvx), u.facing), ma = d.turn * DT;
        u.facing += Math.max(-ma, Math.min(ma, diff));
      }
      if (!following && u.cls === 1) u.spd = 0;
    }
    const nx = u.x + u.vx * DT, nz = u.z + u.vz * DT;
    if (nav.passAt(nx, nz, u.nc)) { u.x = nx; u.z = nz; }
    else if (nav.passAt(nx, u.z, u.nc)) { u.x = nx; }
    else if (nav.passAt(u.x, nz, u.nc)) { u.z = nz; }
    else u.spd *= 0.5;

    // --- stuck detection (2 Hz, staggered) ---
    if (u.path && !immovable(u) && (sim.tick + u.id) % 10 === 0) {
      const moved = Math.hypot(u.x - u.lx, u.z - u.lz);
      u.lx = u.x; u.lz = u.z;
      if (moved < 0.6) {
        u.stuck++;
        const gx = u.path[u.path.length - 2], gz = u.path[u.path.length - 1], gd = Math.hypot(gx - u.x, gz - u.z);
        if (gd < 3 + u.stuck * 1.2 || u.stuck >= 14) { u.path = null; u.stuck = 0; u.arrived = true; }
        else if (u.stuck === 4 || u.stuck === 9) reqPath(sim, u, gx, gz);
      } else if (u.stuck > 0) u.stuck--;
    }
  }

  // --- hard overlap resolution ---
  for (let i = 0; i < n; i++) {
    const u = list[i];
    const bx = Math.min(GW - 1, (u.px / B) | 0), bz = Math.min(GW - 1, (u.pz / B) | 0);
    for (let gz = Math.max(0, bz - 1); gz <= Math.min(GW - 1, bz + 1); gz++) for (let gx = Math.max(0, bx - 1); gx <= Math.min(GW - 1, bx + 1); gx++) {
      for (let j = head[gz * GW + gx]; j >= 0; j = nextI[j]) {
        if (j <= i) continue;
        const o = list[j];
        const rx = o.x - u.x, rz = o.z - u.z, rr = u.radius + o.radius, dd = Math.hypot(rx, rz);
        if (dd >= rr || dd < 0.001) continue;
        let wu = immovable(u) ? 0 : 1, wo = immovable(o) ? 0 : 1;
        if (u.cls === 1 && o.cls === 0) wu *= 0.1; else if (u.cls === 0 && o.cls === 1) wo *= 0.1;
        const tot = wu + wo; if (!tot) continue;
        const pen = (rr - dd) * (tot === 1 ? 1 : 0.7), nx = rx / dd, nz = rz / dd;
        const ux = u.x - nx * pen * wu / tot, uz = u.z - nz * pen * wu / tot;
        if (wu && nav.passAt(ux, uz, u.nc)) { u.x = ux; u.z = uz; }
        const ox = o.x + nx * pen * wo / tot, oz = o.z + nz * pen * wo / tot;
        if (wo && nav.passAt(ox, oz, o.nc)) { o.x = ox; o.z = oz; }
      }
    }
  }
}

// Process queued path requests under a fixed node budget (deterministic).
export function stepPaths(sim, budget = 18000) { // ~7 ms of search at most per tick; the rest of the queue waits one tick
  const q = sim.pathQ; let k = 0;
  while (k < q.length && budget > 0) {
    const u = sim.byId.get(q[k++]);
    if (!u) continue;
    u.queued = false;
    if (u.dead || !u.pathReq) continue;
    const r = sim.nav.findPath(u.x, u.z, u.pathReq.x, u.pathReq.z, u.nc);
    budget -= r.expanded; sim.stats.paths++; sim.stats.expanded += r.expanded;
    if (r.path) {
      if (u.pathReq.thenX !== undefined) r.path.push(u.pathReq.thenX, u.pathReq.thenZ);
      u.path = r.path; u.pi = 0; u.noPath = 0; u.lx = u.x; u.lz = u.z;
    } else { u.path = null; u.noPath++; }
    u.pathReq = null;
  }
  if (k) q.splice(0, k);
}

// Formation slots for a group move: a block centred on the target, facing travel direction.
export function formationSlots(sim, units, tx, tz) {
  const n = units.length, out = [];
  if (n === 1) return [[tx, tz]];
  let cx = 0, cz = 0, maxR = 0;
  for (const u of units) { cx += u.x; cz += u.z; maxR = Math.max(maxR, u.radius); }
  cx /= n; cz /= n;
  let fx = tx - cx, fz = tz - cz; const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
  const sp = maxR * 2 + 1.6, cols = Math.ceil(Math.sqrt(n * 1.6)), used = new Set(), nav = sim.nav;
  for (let i = 0; i < n; i++) {
    const row = (i / cols) | 0, col = i % cols, inRow = Math.min(cols, n - row * cols);
    const lat = (col - (inRow - 1) / 2) * sp, back = row * sp;
    let px = tx - fz * lat - fx * back, pz = tz + fx * lat - fz * back;
    const cls = units[i].nc;
    let c = nav.nearest(Math.floor(px / CELL), Math.floor(pz / CELL), cls, -1, 10);
    if (c >= 0 && (used.has(c) || !nav.passAt(px, pz, cls))) {
      // take the closest unused free cell
      let best = -1, bd = 1e9; const bx = c % N, bz = (c / N) | 0;
      for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) {
        const x = bx + dx, z = bz + dz; if (x < 0 || z < 0 || x >= N || z >= N) continue;
        const k = z * N + x; if (!nav.pass(k, cls) || used.has(k)) continue;
        const q = dx * dx + dz * dz; if (q < bd) { bd = q; best = k; }
      }
      if (best >= 0) c = best;
      px = ((c % N) + 0.5) * CELL; pz = (((c / N) | 0) + 0.5) * CELL;
    }
    if (c >= 0) used.add(nav.cellOf(px, pz));
    out.push([px, pz]);
  }
  return out;
}
