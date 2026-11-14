// Mouse + keyboard: camera, selection, control groups, orders, build placement,
// support-power targeting. Every game-changing action goes through sim.issue()
// so the sim stays deterministic.
import THREE from '../lib/three.js';
import { CELL, WORLD, PLAYER, NEUTRAL } from '../sim/defs.js';
import { UNITS, BLDGS } from '../sim/factionRegistry.js';
import { heightAt } from '../sim/map.js';
import { canPlace, capacityOf } from '../sim/entities.js';
import { canAttack } from '../sim/combat.js';
import { powerError } from '../sim/powers.js';

export class Controls {
  constructor(canvas, sim, view, rig, ui) {
    this.canvas = canvas; this.sim = sim; this.view = view; this.rig = rig; this.ui = ui;
    this.keys = new Set(); this.mouse = { x: 0, y: 0, inside: false };
    this.drag = null; this.rot = null; this.lastGroupTap = { n: 0, t: 0 }; this.lastClick = { id: 0, t: 0 };
    this.markers = []; // order feedback pings: {x,z,t,color}
    this._v = new THREE.Vector3(); this._p = { x: 0, y: 0 };
    this.edgeScroll = true; this.hoverAcc = 0;
    this.bind();
  }

  // ---------- picking ----------
  ground(mx, my) { // screen px -> terrain point, by marching the view ray over the heightfield
    const cam = this.view.camera, v = this._v;
    v.set((mx / this.view.w) * 2 - 1, -(my / this.view.h) * 2 + 1, 0.5).unproject(cam);
    const ox = cam.position.x, oy = cam.position.y, oz = cam.position.z;
    let dx = v.x - ox, dy = v.y - oy, dz = v.z - oz; const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
    if (dy > -0.02) return null;
    const map = this.sim.map;
    let t = Math.max(0, (oy - 14) / -dy), prev = t;
    for (let i = 0; i < 400; i++, prev = t, t += 1.5) {
      const x = ox + dx * t, z = oz + dz * t, y = oy + dy * t;
      const hx = Math.min(WORLD, Math.max(0, x)), hz = Math.min(WORLD, Math.max(0, z));
      if (y <= heightAt(map, hx, hz)) {
        let a = prev, b = t;
        for (let k = 0; k < 8; k++) { const m = (a + b) / 2; if (oy + dy * m <= heightAt(map, Math.min(WORLD, Math.max(0, ox + dx * m)), Math.min(WORLD, Math.max(0, oz + dz * m)))) b = m; else a = m; }
        return { x: Math.min(WORLD - 1, Math.max(1, ox + dx * b)), z: Math.min(WORLD - 1, Math.max(1, oz + dz * b)) };
      }
      if (y < -5) break;
    }
    return null;
  }
  entityAt(mx, my) {
    const sim = this.sim, view = this.view, p = this._p, g = this.ground(mx, my);
    let best = null, bd = 1e9;
    for (const e of sim.ents) {
      if (!this.ui.reveal && !sim.fog.shouldShow(PLAYER, e)) continue;
      if (e.kind === 'unit') {
        const alt = e.air && !e.landed ? UNITS[e.type].alt : 0.9;
        if (!view.project(e.x, heightAt(sim.map, e.x, e.z) + alt, e.z, p)) continue;
        const d = Math.hypot(p.x - mx, p.y - my), r = Math.max(15, e.radius * 520 / this.rig.dist);
        if (d < r && d < bd) { bd = d; best = e; }
      } else if (g && Math.abs(g.x - e.x) <= e.w * CELL / 2 + 0.6 && Math.abs(g.z - e.z) <= e.h * CELL / 2 + 0.6) { if (bd > 1e8) { best = e; bd = 1e8; } }
    }
    return best;
  }
  selectedOwn(kind) {
    const out = [];
    for (const id of this.ui.selection) { const e = this.sim.byId.get(id); if (e && !e.dead && e.team === PLAYER && e.kind === kind && !e.inB) out.push(e); }
    return out;
  }
  prune() { for (const id of this.ui.selection) { const e = this.sim.byId.get(id); if (!e || e.dead || (e.kind === 'unit' && e.inB)) this.ui.selection.delete(id); } }

  // ---------- selection ----------
  boxSelect(x0, y0, x1, y1, add) {
    const sim = this.sim, p = this._p, hit = [];
    const l = Math.min(x0, x1), r = Math.max(x0, x1), t = Math.min(y0, y1), b = Math.max(y0, y1);
    for (const e of sim.ents) {
      if (e.kind !== 'unit' || e.team !== PLAYER || e.inB) continue;
      const alt = e.air && !e.landed ? UNITS[e.type].alt : 0.8;
      if (!this.view.project(e.x, heightAt(sim.map, e.x, e.z) + alt, e.z, p)) continue;
      if (p.x >= l && p.x <= r && p.y >= t && p.y <= b) hit.push(e.id);
    }
    if (!hit.length) return;
    if (!add) this.ui.selection.clear();
    for (const id of hit) this.ui.selection.add(id);
  }
  clickSelect(mx, my, add) {
    const e = this.entityAt(mx, my), sel = this.ui.selection, now = performance.now();
    if (!e) { if (!add) sel.clear(); return; }
    if (e.team === PLAYER && e.kind === 'unit' && this.lastClick.id === e.id && now - this.lastClick.t < 380) {
      this.boxSelectType(e.type); this.lastClick.id = 0; return; // double-click: every unit of this type on screen
    }
    this.lastClick = { id: e.id, t: now };
    const ownUnit = e.team === PLAYER && e.kind === 'unit';
    if (add && ownUnit) { if (sel.has(e.id)) sel.delete(e.id); else { for (const id of sel) { const o = this.sim.byId.get(id); if (!o || o.team !== PLAYER || o.kind !== 'unit') sel.delete(id); } sel.add(e.id); } }
    else { sel.clear(); sel.add(e.id); }
  }
  boxSelectType(type) {
    const p = this._p, sel = this.ui.selection; sel.clear();
    for (const e of this.sim.ents) {
      if (e.kind !== 'unit' || e.team !== PLAYER || e.type !== type || e.inB) continue;
      if (this.view.project(e.x, 1, e.z, p) && p.x >= 0 && p.x <= this.view.w && p.y >= 0 && p.y <= this.view.h) sel.add(e.id);
    }
  }

  // ---------- orders ----------
  ping(x, z, color) { this.markers.push({ x, z, t: 0, color }); this.ui.sfx && this.ui.sfx('order'); }
  smartOrder(mx, my) {
    const sim = this.sim, g = this.ground(mx, my); if (!g) return;
    const units = this.selectedOwn('unit'), t = this.entityAt(mx, my);
    if (!units.length) {
      for (const b of this.selectedOwn('bldg')) if (BLDGS[b.type].trains) { sim.issue({ t: 'rally', id: b.id, x: g.x, z: g.z }); this.ping(g.x, g.z, '#f2a93b'); }
      return;
    }
    const total = units.length, rest = new Set(units.map(u => u.id));
    // hand a subset of the selection an order; returns true if anyone took it
    const give = (pred, cmd, color) => { const a = units.filter(u => rest.has(u.id) && pred(u, UNITS[u.type])).map(u => u.id); if (!a.length) return false; for (const id of a) rest.delete(id); sim.issue({ ...cmd, ids: a }); this.ping(t.x, t.z, color); return true; };
    if (t) {
      const td = t.kind === 'bldg' ? BLDGS[t.type] : null, hostile = t.team !== PLAYER && t.team !== NEUTRAL;
      if (td && td.capturable && t.team !== PLAYER) give((u, d) => d.canCapture, { t: 'capture', target: t.id }, '#f2a93b');
      else if (hostile && !t.ruined) {
        if (td && td.faction) give((u, d) => d.infiltrator, { t: 'infiltrate', target: t.id }, '#c77dff');
        give((u) => canAttack(u, t), { t: 'attack', target: t.id }, '#ff5a4d');
      }
      else if (t.type === 'civ' && !t.ruined) give((u, d) => d.canGarrison, { t: 'garrison', target: t.id }, '#4aa3ff');
      else if (t.type === 'dock' || (td && td.role === 'supply' && t.team === PLAYER && t.done)) give((u, d) => d.harvester, { t: 'harvest', target: t.id }, '#f2a93b');
      else if (td && td.tunnel && t.team === PLAYER && t.done) give((u) => !u.air, { t: 'tunnel', target: t.id }, '#c9a26b');
      else if (t.kind === 'unit' && t.team === PLAYER && capacityOf(t)) give((u, d) => d.canGarrison && u !== t, { t: 'garrison', target: t.id }, '#4aa3ff');
      if (t.kind === 'bldg' && t.team === PLAYER && td.faction && (!t.done || t.hp < t.maxHp)) give((u, d) => d.builder, { t: 'construct', target: t.id }, '#f2a93b');
    }
    // hold R while right-clicking: vehicles back up to the point, keeping their front armour toward the fight
    if (rest.size) { const reverse = this.keys.has('KeyR'); sim.issue({ t: 'move', ids: [...rest], x: g.x, z: g.z, reverse }); if (rest.size === total) this.ping(g.x, g.z, reverse ? '#f2a93b' : '#7dffa0'); }
  }
  startPlacing(type) { this.ui.place = { type, cx: 0, cz: 0, ok: false }; this.ui.amove = false; this.ui.power = null; this.updatePlace(); }
  updatePlace() {
    const pl = this.ui.place; if (!pl) return;
    const g = this.ground(this.mouse.x, this.mouse.y); if (!g) { pl.ok = false; return; }
    const d = BLDGS[pl.type];
    pl.cx = Math.round(g.x / CELL - d.w / 2); pl.cz = Math.round(g.z / CELL - d.h / 2);
    pl.ok = canPlace(this.sim, pl.type, pl.cx, pl.cz, PLAYER) && this.sim.teams[PLAYER].money >= d.cost;
  }
  confirmPlace(keep) {
    const pl = this.ui.place, sim = this.sim; this.updatePlace();
    if (!pl.ok) { this.ui.toast && this.ui.toast(sim.teams[PLAYER].money < BLDGS[pl.type].cost ? 'Insufficient funds' : 'Cannot build there', 'warn'); return; }
    const builders = this.selectedOwn('unit').filter(u => UNITS[u.type].builder); if (!builders.length) { this.ui.place = null; return; }
    const gx = (pl.cx + BLDGS[pl.type].w / 2) * CELL, gz = (pl.cz + BLDGS[pl.type].h / 2) * CELL;
    builders.sort((a, b) => Math.hypot(a.x - gx, a.z - gz) - Math.hypot(b.x - gx, b.z - gz));
    sim.issue({ t: 'build', id: builders[0].id, type: pl.type, cx: pl.cx, cz: pl.cz });
    if (builders.length > 1) this.pendingHelp = { ids: builders.slice(1).map(d => d.id), cx: pl.cx, cz: pl.cz, type: pl.type };
    if (!keep) this.ui.place = null;
  }
  startPower(id) { this.ui.power = { id, ok: false, err: '' }; this.ui.place = null; this.ui.amove = false; this.updatePower(); }
  updatePower() {
    const pw = this.ui.power; if (!pw) return;
    const g = this.ground(this.mouse.x, this.mouse.y);
    if (!g) { pw.x = undefined; pw.ok = false; pw.err = 'Point at the ground'; return; }
    pw.x = g.x; pw.z = g.z; pw.err = powerError(this.sim, PLAYER, pw.id, g.x, g.z) || ''; pw.ok = !pw.err;
  }
  cancelModes() { const ui = this.ui, had = ui.place || ui.amove || ui.power; ui.place = null; ui.amove = false; ui.power = null; return !!had; }

  // ---------- groups ----------
  assignGroup(n) { this.ui.groups[n] = [...this.ui.selection].filter(id => { const e = this.sim.byId.get(id); return e && e.team === PLAYER; }); this.ui.toast && this.ui.toast(`Group ${n} set (${this.ui.groups[n].length})`); }
  recallGroup(n, add) {
    const g = (this.ui.groups[n] || []).filter(id => { const e = this.sim.byId.get(id); return e && !e.dead; });
    this.ui.groups[n] = g; if (!g.length) return;
    if (!add) this.ui.selection.clear();
    for (const id of g) this.ui.selection.add(id);
    const now = performance.now();
    if (this.lastGroupTap.n === n && now - this.lastGroupTap.t < 400) { let x = 0, z = 0; for (const id of g) { const e = this.sim.byId.get(id); x += e.x; z += e.z; } this.rig.focus(x / g.length, z / g.length); }
    this.lastGroupTap = { n, t: now };
  }

  // ---------- events ----------
  bind() {
    const c = this.canvas, ui = this.ui;
    const pos = (e) => { const r = c.getBoundingClientRect(); this.mouse.x = e.clientX - r.left; this.mouse.y = e.clientY - r.top; };
    c.addEventListener('contextmenu', e => e.preventDefault());
    c.addEventListener('mousedown', e => {
      pos(e);
      if (e.button === 1) { e.preventDefault(); this.rot = { x: e.clientX, y: e.clientY }; return; }
      if (e.button === 2) { if (!this.cancelModes()) this.smartOrder(this.mouse.x, this.mouse.y); return; }
      if (e.button !== 0) return;
      if (ui.power) {
        this.updatePower(); const pw = ui.power;
        if (pw.ok) { this.sim.issue({ t: 'power', id: pw.id, x: pw.x, z: pw.z }); this.ping(pw.x, pw.z, '#f2a93b'); ui.power = null; }
        else ui.toast && ui.toast(pw.err, 'warn');
        return;
      }
      if (ui.place) { this.confirmPlace(e.shiftKey); return; }
      if (ui.amove) {
        const g = this.ground(this.mouse.x, this.mouse.y), ids = this.selectedOwn('unit').map(u => u.id);
        if (g && ids.length) { this.sim.issue({ t: 'move', ids, x: g.x, z: g.z, attack: true, guard: !!this.ui.guard }); this.ping(g.x, g.z, this.ui.guard ? '#7dffa0' : '#ff5a4d'); }
        ui.amove = false; return;
      }
      this.drag = { x0: this.mouse.x, y0: this.mouse.y, x1: this.mouse.x, y1: this.mouse.y, box: false, add: e.shiftKey };
    });
    window.addEventListener('mousemove', e => {
      pos(e); this.mouse.inside = true; this.mouse.overCanvas = e.target === c;
      if (this.rot) { this.rig.rotate(-(e.clientX - this.rot.x) * 0.006, (e.clientY - this.rot.y) * 0.004); this.rot.x = e.clientX; this.rot.y = e.clientY; }
      const d = this.drag;
      if (d) { d.x1 = this.mouse.x; d.y1 = this.mouse.y; if (Math.hypot(d.x1 - d.x0, d.y1 - d.y0) > 6) d.box = true; }
    });
    window.addEventListener('mouseup', e => {
      if (e.button === 1) this.rot = null;
      const d = this.drag;
      if (e.button === 0 && d) {
        this.drag = null;
        const before = this.ui.selection.size; if (d.box) this.boxSelect(d.x0, d.y0, d.x1, d.y1, d.add); else this.clickSelect(d.x0, d.y0, d.add);
        if (this.ui.selection.size && (this.ui.selection.size !== before || !d.box) && this.ui.sfx) this.ui.sfx('click');
      }
    });
    document.documentElement.addEventListener('mouseleave', () => { this.mouse.inside = false; });
    window.addEventListener('blur', () => { this.keys.clear(); this.mouse.inside = false; this.rot = null; });
    c.addEventListener('wheel', e => { e.preventDefault(); this.rig.zoom(Math.exp(Math.sign(e.deltaY) * Math.min(1, Math.abs(e.deltaY) / 100) * 0.16)); }, { passive: false });
    c.addEventListener('auxclick', e => e.preventDefault());

    window.addEventListener('keydown', e => {
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      const k = e.code;
      if (/^Digit[1-9]$/.test(k)) {
        const n = +k.slice(5);
        if (e.ctrlKey || e.altKey || e.metaKey) this.assignGroup(n); else this.recallGroup(n, e.shiftKey);
        e.preventDefault(); return;
      }
      if (e.ctrlKey || e.metaKey) return;
      this.keys.add(k);
      switch (k) {
        case 'KeyZ': { const ids = this.selectedOwn('unit').map(u => u.id); if (ids.length) { this.sim.issue({ t: 'stop', ids }); ui.sfx && ui.sfx('click'); } break; }
        case 'KeyX': { const ids = this.selectedOwn('unit').map(u => u.id); if (ids.length) { this.sim.issue({ t: 'scatter', ids }); ui.sfx && ui.sfx('order'); } break; }
        case 'KeyV': if (this.selectedOwn('unit').some(u => UNITS[u.type].weapon)) { this.cancelModes(); ui.amove = true; ui.guard = true; } break;
        case 'KeyF': if (this.selectedOwn('unit').some(u => UNITS[u.type].weapon)) { this.cancelModes(); ui.amove = true; ui.guard = false; } break;
        case 'KeyG': ui.togglePromo && ui.togglePromo(); break;
        case 'Escape': if (ui.promoOpen) ui.togglePromo(); else if (!this.cancelModes()) ui.selection.clear(); break;
        case 'KeyH': { const cc = this.sim.ents.find(b => b.kind === 'bldg' && b.team === PLAYER && BLDGS[b.type].role === 'cc'); if (cc) this.rig.focus(cc.x, cc.z); break; }
        case 'KeyP': ui.paused = !ui.paused; break;
        case 'ArrowUp': case 'ArrowDown': case 'ArrowLeft': case 'ArrowRight': case 'Space': e.preventDefault(); break;
      }
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
  }

  // Called once per rendered frame.
  update(dt) {
    const K = this.keys, m = this.mouse, v = this.view, ui = this.ui;
    let px = 0, py = 0;
    if (!ui.promoOpen) {
      if (K.has('KeyA') || K.has('ArrowLeft')) px -= 1;
      if (K.has('KeyD') || K.has('ArrowRight')) px += 1;
      if (K.has('KeyW') || K.has('ArrowUp')) py += 1;
      if (K.has('KeyS') || K.has('ArrowDown')) py -= 1;
      if (this.edgeScroll && m.inside && !this.rot && !px && !py && document.hasFocus()) {
        const E = 10;
        if (m.x <= E) px = -1; else if (m.x >= v.w - E) px = 1;
        if (m.y <= E) py = 1; else if (m.y >= v.h - E) py = -1;
      }
      if (K.has('KeyQ')) this.rig.rotate(dt * 1.6, 0);
      if (K.has('KeyE')) this.rig.rotate(-dt * 1.6, 0);
    }
    this.rig.update(dt, px, py);
    this.prune();
    if (ui.place) { if (!this.selectedOwn('unit').some(u => UNITS[u.type].builder)) ui.place = null; else this.updatePlace(); }
    if (ui.power) this.updatePower();
    // hover (10 Hz): used for veterancy badges and health bars
    if ((this.hoverAcc += dt) > 0.1) { this.hoverAcc = 0; const h = m.overCanvas && !this.drag ? this.entityAt(m.x, m.y) : null; ui.hover = h ? h.id : 0; }
    // extra builders join a site once the sim has created it
    const ph = this.pendingHelp;
    if (ph) { const b = this.sim.ents.find(e => e.kind === 'bldg' && e.team === PLAYER && e.cx === ph.cx && e.cz === ph.cz && e.type === ph.type); if (b) { this.sim.issue({ t: 'construct', ids: ph.ids, target: b.id }); this.pendingHelp = null; } else if ((ph.age = (ph.age || 0) + dt) > 1) this.pendingHelp = null; }
    for (const mk of this.markers) mk.t += dt;
    if (this.markers.length) this.markers = this.markers.filter(mk => mk.t < 0.6);
  }
}
