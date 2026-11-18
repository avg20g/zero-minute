// HUD: command bar (minimap with Fog of War, resources, selection, orders),
// General's Promotions modal, support-power buttons with radial cooldowns,
// toasts, and the 2D overlay (health bars, veterancy chevrons, drag box, pings).
import { TEAM } from './teamColors.js';
import { N, CELL, WORLD, PLAYER, ENEMY, NEUTRAL, ZONE_MULT, ZONE_NAME, TICK_HZ } from '../sim/defs.js';
import { UNITS, BLDGS, FACTIONS, UPGRADES, POWERS, GENERAL, VET, GENERALS, trainsOf, upgradesOf, unitCost, bldgCost, nodePower } from '../sim/factionRegistry.js';
import { heightAt, BIOMES } from '../sim/map.js';
import { hasBldg, capacityOf, isTransport } from '../sim/entities.js';
import { strikeVisible, hasPower, superOf, superBldgs } from '../sim/powers.js';
import { heroTaken } from '../sim/simulationTick.js';

const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const svg = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const ICON = {
  shipyard: svg('<path d="M11 3h2v4h3v2h-3v9.9a5 5 0 0 0 4.6-3.9l2 .8a7 7 0 0 1-13.2 0l2-.8a5 5 0 0 0 4.600 3.900V9H8V7h3z"/>'),
  ship: svg('<path d="M2 15h20l-3 5H5z"/><path d="M7 15v-4h7l3 4z" opacity=".8"/><path d="M10.500 11V6h1.200v5z"/>'),
  power: svg('<path d="M4 21V11l3-6h3l2 6v10z"/><path d="M14 21V9l2-4h2l2 4v12z" opacity=".7"/>'),
  barracks: svg('<path d="M2 20v-6a10 8 0 0 1 20 0v6z"/><rect x="10" y="14" width="4" height="6" fill="#000" opacity=".35"/>'),
  supply: svg('<path d="M2 20V9l10-5 10 5v11z"/><rect x="6" y="12" width="5" height="5" fill="#000" opacity=".35"/><rect x="13" y="12" width="5" height="5" fill="#000" opacity=".35"/>'),
  factory: svg('<path d="M2 20V8l6 4V8l6 4V5h3v7h5v8z"/>'),
  defense: svg('<path d="M4 21h16l-3-5H7z"/><path d="M6 13 18 5l2 3-12 8z"/>'),
  cc: svg('<path d="M3 21V10h10V6h4v4h4v11z"/><path d="M14 5V2h1v3z"/><circle cx="14.5" cy="2.2" r="1.3"/>'),
  airfield: svg('<path d="M2 20h20v2H2z"/><path d="M12 3l1.6 6 7.400 4v2l-7.400-2-.6 4 2 1.500V20l-3-1-3 1v-1.500l2-1.500-.6-4L3 15v-2l7.400-4z"/>'),
  income: svg('<circle cx="12" cy="12" r="9"/><path d="M12 6v12M9 9.500c0-1.500 6-1.500 6 0s-6 1.500-6 3 6 1.500 6 0" stroke="#151b20" stroke-width="1.600" fill="none"/>'),
  tunnel: svg('<path d="M2 20a10 10 0 0 1 20 0z"/><path d="M8 20a4 5 0 0 1 8 0z" fill="#000" opacity=".5"/>'),
  dozer: svg('<path d="M3 17v-5h5V8h6v4h3v5z"/><path d="M19 9h2v10h-2z"/><rect x="3" y="17.500" width="14" height="3" rx="1.500"/>'),
  truck: svg('<path d="M2 16V8h11v8z"/><path d="M14 16v-6h4l3 3v3z"/><circle cx="6" cy="18" r="2.200"/><circle cx="17" cy="18" r="2.200"/>'),
  rifle: svg('<circle cx="7" cy="6" r="2.400"/><path d="M4 21v-9l3-2 3 2v9z"/><circle cx="16" cy="7" r="2.200"/><path d="M13.500 21v-8l2.500-2 2.500 2v8z"/><path d="M9 12h12v1.300H9z"/>'),
  man: svg('<circle cx="12" cy="5" r="2.800"/><path d="M8 21v-10l4-2 4 2v10z"/>'),
  tank: svg('<rect x="2" y="15" width="20" height="5" rx="2.500"/><path d="M5 15v-3h12v3z"/><path d="M8 12V9h6v3z"/><path d="M14 9.700h8v1.400h-8z"/>'),
  buggy: svg('<circle cx="6" cy="18" r="2.600"/><circle cx="18" cy="18" r="2.600"/><path d="M3 16l2-4h9l5 2 2 2z"/><path d="M6 10 16 5l1 2-10 5z"/>'),
  heli: svg('<path d="M2 6h20v1.400H2z"/><path d="M11.300 6h1.400v4h-1.400z"/><path d="M5 14a6 4 0 0 1 12 0l5-1v2l-5 1a6 4 0 0 1-12-2z"/>'),
  jet: svg('<path d="M12 2l2 8 8 5v2l-8-2-1 5 2 1.500V23l-3-1-3 1v-1.500L11 20l-1-5-8 2v-2l8-5z"/>'),
  up: svg('<path d="M12 3l8 9h-5v9H9v-9H4z"/>'),
  stop: svg('<rect x="6" y="6" width="12" height="12"/>'),
  scatter: svg('<path d="M12 12L4 5M12 12l8-7M12 12l-8 7M12 12l8 7" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="2"/>'),
  guard: svg('<path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z" fill="none" stroke="currentColor" stroke-width="2"/>'),
  force: svg('<circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2v6M12 16v6M2 12h6M16 12h6" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="1.6"/>'),
  marker: svg('<path d="M6 21V4M6 4l10 3-10 4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="16" cy="18" r="2"/><circle cx="20" cy="12" r="1.5"/>'),
  land: svg('<path d="M3 6h18M12 6v4" stroke="currentColor" stroke-width="2" fill="none"/><path d="M6 10h10l3 3v2H6z"/><path d="M5 19h14" stroke="currentColor" stroke-width="2"/>'),
  cancel: svg('<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7 7l10 10M17 7L7 17" stroke="currentColor" stroke-width="2"/>'),
  amove: svg('<path d="M12 2v5M12 17v5M2 12h5M17 12h5" stroke="currentColor" stroke-width="2" fill="none"/><circle cx="12" cy="12" r="4"/>'),
  evac: svg('<path d="M3 21V5h10v16z"/><path d="M15 12h7m-3-3 3 3-3 3" stroke="currentColor" stroke-width="2" fill="none"/>'),
  star: svg('<path d="M12 2l2.900 6.300 6.900.800-5.100 4.700 1.400 6.800L12 17.200 5.900 20.600l1.400-6.800L2.200 9.100l6.900-.800z"/>'),
  bolt: svg('<path d="M13 2 4 14h6l-1 8 9-12h-6z"/>'),
};
const iconFor = (d, isBldg) => {
  if (isBldg) return ICON[d.role] || ICON[d.model] || ICON.cc;
  if (d.ship) return ICON.ship;
  if (d.air) return d.based ? ICON.jet : ICON.heli;
  if (d.infantry) return ICON[d.model] || (d.model === 'rifle' ? ICON.rifle : ICON.man);
  return ICON[d.model] || (d.builder ? ICON.dozer : d.harvester ? ICON.truck : d.speed > 15 ? ICON.buggy : ICON.tank);
};
const TEAM_CSS = TEAM.css; // lobby colours: [you, enemy, neutral]
const VET_CSS = ['', '#ffcf3a', '#5ac8ff', '#ff5a4d'];

const mmss = (n) => Math.floor(n / 60) + ':' + String(n % 60).padStart(2, '0');   // seconds as m:ss (module scope: both the event handler and the frame update use it)
export class Hud {
  constructor(sim, view, rig, controls, ui) {
    this.sim = sim; this.view = view; this.rig = rig; this.controls = controls; this.ui = ui;
    this.F = FACTIONS[sim.teams[PLAYER].faction];
    this.ov = $('ov'); this.octx = this.ov.getContext('2d');
    this.mini = $('minimap'); this.mctx = this.mini.getContext('2d'); this.mini.width = this.mini.height = 512;   // drawn at a fixed size whatever the map's size (see drawMinimap)
    this.fogCanvas = document.createElement('canvas'); this.fogCanvas.width = this.fogCanvas.height = N;
    this.fogCtx = this.fogCanvas.getContext('2d'); this.fogImg = this.fogCtx.createImageData(N, N); this.fogVer = -1;
    this.base = this.makeBase();
    this.floats = []; this.alerts = []; this.sig = ''; this.promoSig = ''; this.pwSig = ''; this.acc = 0; this.shownMoney = sim.teams[PLAYER].money;
    this.lastAttackToast = -1e9; this.lowPowerShown = false; this._p = { x: 0, y: 0 }; this.radarT = 0; this.alpha = 1;
    ui.toast = (t, kind) => this.toast(t, kind);
    ui.togglePromo = () => { ui.promoOpen = !ui.promoOpen; $('promo').hidden = !ui.promoOpen; $('btn-gen').setAttribute('aria-expanded', String(ui.promoOpen)); this.promoSig = ''; this.renderPromo(); };
    const foeAI = sim.ais.find(a => a.team === ENEMY);
    const gen = sim.teams[PLAYER].general ? ' · ' + GENERALS[sim.teams[PLAYER].general].name : '';
    if (sim.noEnemy) $('brand-sub').textContent = this.F.name + gen + ' · Sandbox (no enemy)'; else
    $('brand-sub').textContent = this.F.name + gen + ' vs ' + FACTIONS[sim.teams[ENEMY].faction].name + (sim.teams[ENEMY].general ? ' · ' + GENERALS[sim.teams[ENEMY].general].name : '') + (foeAI ? ' (' + foeAI.cfg.label + ' AI)' : '');
    $('st-power').hidden = !this.F.usesPower;
    this.bind();
  }

  makeBase() {
    const map = this.sim.map, c = document.createElement('canvas'); c.width = c.height = N;
    const g = c.getContext('2d'), img = g.createImageData(N, N), V = map.V, H = map.height;
    const road = new Float32Array(N * N);
    for (const [x0, z0, x1, z1, hw] of map.roads) {
      const dx = x1 - x0, dz = z1 - z0, l2 = dx * dx + dz * dz || 1;
      for (let z = Math.max(0, Math.floor(Math.min(z0, z1) - hw)); z < Math.min(N, Math.max(z0, z1) + hw); z++) for (let x = Math.max(0, Math.floor(Math.min(x0, x1) - hw)); x < Math.min(N, Math.max(x0, x1) + hw); x++) {
        const t = Math.min(1, Math.max(0, ((x - x0) * dx + (z - z0) * dz) / l2));
        if (Math.hypot(x - (x0 + dx * t), z - (z0 + dz * t)) < hw * 0.8) road[z * N + x] = 1;
      }
    }
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const k = z * V + x, e = map.rock[k], i = (z * N + x) * 4;
      const lit = Math.max(0.55, Math.min(1.35, 1 + (H[k] - H[k + 1] + H[k] - H[k + V]) * 0.16));
      const BI = BIOMES[map.biome] || BIOMES.desert; let [r, gg, b] = BI.rgb;
      if (road[z * N + x] && e < 0.2) { if (map.biome === 'urban' || map.biome === 'snow') { r = 92; gg = 94; b = 100; } else { r = 150; gg = 138; b = 118; } }
      if (e > 0.6) [r, gg, b] = BI.rock;
      if (map.blocked[z * N + x]) [r, gg, b] = BI.cliff;
      if (map.water && map.water[z * N + x]) { r = 52; gg = 116; b = 146; }
      img.data[i] = r * lit; img.data[i + 1] = gg * lit; img.data[i + 2] = b * lit; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  // ---------- events from the sim ----------
  float(x, z, y, text, color) { this.floats.push({ x, z, y, text, color, t: 0 }); }
  handleEvents(events) {
    const sim = this.sim, fog = sim.fog;
    for (const e of events) {
      switch (e.t) {
        case 'msg': if ((e.team ?? PLAYER) === PLAYER) this.toast(e.text, 'warn'); break;
        case 'cash': if (e.team === PLAYER && !e.quiet) this.float(e.x, e.z, 6, '+$' + e.amt, '#f2a93b'); break;
        case 'done': if (e.team === PLAYER) this.toast(BLDGS[e.type].name + ' complete'); break;
        case 'evacuate': if (e.team === PLAYER && e.n) this.float(e.x, e.z, 6, e.n + ' OUT', '#4aa3ff'); break;
        case 'cancelbuild': if (e.team === PLAYER) { this.toast('Construction cancelled: $' + fmt(e.amt) + ' refunded'); this.float(e.x, e.z, 5, '+$' + e.amt, '#f2a93b'); } break;
        case 'helipad': if (e.team === PLAYER) this.float(e.x, e.z, 4, 'REPAIRING', '#7dffa0'); break;
        // Superweapons are public: both sides are told when one comes online, where it is, and when it fires.
        case 'superbuilt': this.alert(e.x, e.z); this.toast(e.team === PLAYER ? POWERS[e.id].name + ' online. Ready in ' + mmss(e.secs) + '.' : 'WARNING: enemy ' + POWERS[e.id].name + ' detected. It fires in ' + mmss(e.secs) + '.', e.team === PLAYER ? '' : 'bad'); break;
        case 'hack': {
          if (e.k === 'hurt') break;
          const nm = UNITS[e.type].name;
          if (e.team === PLAYER) this.toast(e.k === 'recruit' ? 'Fook Mie recruited a ' + nm : nm + ' resigned');
          else if (e.victim === PLAYER) { this.alert(e.tx, e.tz); this.toast(e.k === 'recruit' ? 'Your ' + nm + ' was recruited by Fook Mie' : 'Your ' + nm + ' resigned after a call from Fook Mie', 'bad'); }
          break;
        }
        case 'phantom': if (e.team === PLAYER) this.toast('The Phantom called in ' + (e.k === 'airliner' ? 'a hijacked airliner' : e.k === 'ambush' ? 'an ambush' : 'a car bomb')); break;
        case 'superlaunch': if (e.team !== PLAYER) this.toast('WARNING: enemy ' + POWERS[e.id].name + ' launched', 'bad'); break;
        case 'cashhack': if (e.team === PLAYER) this.toast('Cash Hack: stole $' + fmt(e.amt)); else if (e.victim === PLAYER) { this.toast('Enemy hackers stole $' + fmt(e.amt), 'bad'); this.alert(e.x, e.z); } break;
        case 'hill': this.toast(e.owner === PLAYER ? 'You hold the hill' : e.owner === ENEMY ? 'The enemy holds the hill' : 'The hill is contested', e.owner === ENEMY ? 'bad' : e.owner === PLAYER ? '' : 'warn'); if (e.owner === ENEMY) this.ui.sfx && this.ui.sfx('klaxon'); break;
        case 'spawn': if (e.team === PLAYER) this.toast(UNITS[e.type].name + ' ready'); break;
        case 'upgrade': if (e.team === PLAYER) this.toast(UPGRADES[e.id].name + ' researched'); break;
        case 'addon': if (e.team === PLAYER) this.toast(UNITS.r_overlord.hardpoints[e.type].name + ' fitted'); break;
        case 'dockEmpty': if (fog.exp[PLAYER][sim.nav.cellOf(e.x, e.z)]) this.toast('Supply Dock depleted. Collectors will move to another dock.', 'warn'); break;
        case 'garrison': if (e.team === PLAYER) { const c = this.sim.byId.get(e.id); this.toast(c && isTransport(c) ? (UNITS[c.type].ship ? 'Aboard. Take the Landing Craft to a beach, then select it and use Unload.' : 'Aboard the ' + UNITS[c.type].name + '. Select it and use Unload to get out.') : 'Squad garrisoned. Select the building and press U to take it out.'); } break;
        case 'hit': {
          const t = sim.byId.get(e.id);
          if (t && this.shows(t)) this.float(e.x, e.z, 3.5, ZONE_NAME[e.zone] + ' HIT ×' + ZONE_MULT[e.zone], e.zone === 2 ? '#ff5a4d' : '#f2a93b');
          break;
        }
        case 'die':
          if (e.team === PLAYER) { this.alert(e.x, e.z); if (e.kind === 'bldg') this.toast(BLDGS[e.type].name + ' destroyed', 'bad'); }
          break;
        case 'over': this.showReport(e.winner, e.why); break;
        // ---- phase 2
        case 'rank': if (e.team === PLAYER) { this.toast(`Promoted to Rank ${e.rank}. Press G to spend your General’s point.`); $('btn-gen').classList.add('pulse'); this.ui.sfx && this.ui.sfx('ping'); } break;
        case 'promo': if (e.team === PLAYER) { const n = this.F.tree.find(k => k.id === e.node); this.toast(n.name + ' unlocked'); if (n.power && this.ui.sfx) this.ui.sfx('ping'); } break;
        case 'vet': if (e.team === PLAYER) this.float(e.x, e.z, 4, VET.names[e.rank].toUpperCase(), VET_CSS[e.rank]); break;
        case 'salvage': if (e.team === PLAYER) this.float(e.x, e.z, 3.5, 'SALVAGE TIER ' + e.tier, '#f2a93b'); break;
        case 'capture': if (e.team === PLAYER) this.toast(BLDGS[e.type].name + ' captured'); else if (fog.visAt(PLAYER, e.x, e.z) || fog.exp[PLAYER][sim.nav.cellOf(e.x, e.z)] && sim.byId.get(e.id)?.capXp[PLAYER]) this.toast('The enemy took an Oil Derrick', 'bad'); break;
        case 'sabotage': if (e.team === PLAYER) this.toast('Saboteur: ' + e.text); else if (e.victim === PLAYER) { this.toast('Enemy saboteur hit us: ' + e.text, 'bad'); this.alert(e.x, e.z); } break;
        case 'power': if (e.team === PLAYER) this.toast(POWERS[e.id].name + (POWERS[e.id].shield ? ' raised' : ' inbound')); break; // enemy strikes are not announced: you see them only where you have vision
        case 'cleared': if (fog.visAt(PLAYER, e.x, e.z)) this.float(e.x, e.z, 9, 'GARRISON CLEARED', '#f2a93b'); break;
        case 'tunnel': break;
      }
    }
    // under-attack warning (rate limited)
    for (const e of sim.ents) if (e.team === PLAYER && e.kind === 'bldg' && e.lastHit === sim.tick - 1 && sim.tick - this.lastAttackToast > 20 * 12) { this.lastAttackToast = sim.tick; this.toast('Our base is under attack', 'bad'); this.ui.sfx && this.ui.sfx('klaxon'); this.alert(e.x, e.z); }
  }
  alert(x, z) { this.alerts.push({ x, z, t: 0 }); }
  toast(text, kind = '') {
    const box = $('toasts'), last = box.lastElementChild;
    if (last && last.textContent === text) return;
    const el = document.createElement('div'); el.className = 'toast ' + kind; el.textContent = text; box.appendChild(el);
    while (box.children.length > 4) box.firstElementChild.remove();
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, 3600);
  }

  // ---------- DOM wiring ----------
  bind() {
    const ui = this.ui, sim = this.sim, ctl = this.controls;
    $('cmd').addEventListener('click', (ev) => {
      const b = ev.target.closest('button[data-act]'); if (!b) return;
      if (b.getAttribute('aria-disabled') === 'true') { if (b.dataset.why) this.toast(b.dataset.why, 'warn'); return; }
      const i = b.dataset.act.indexOf(':'), act = i < 0 ? b.dataset.act : b.dataset.act.slice(0, i), arg = i < 0 ? '' : b.dataset.act.slice(i + 1);
      const units = ctl.selectedOwn('unit');
      if (act === 'build') ctl.startPlacing(arg);
      else if (act === 'train') {
        const up = arg.startsWith('up:') ? arg.slice(3) : null;
        const bs = ctl.selectedOwn('bldg').filter(x => x.done && (up ? upgradesOf(sim.teams[PLAYER], x.type).includes(up) : trainsOf(sim.teams[PLAYER], x.type).includes(arg))).sort((a, c) => a.queue.length - c.queue.length);
        if (bs.length) sim.issue({ t: 'train', id: bs[0].id, type: arg });
      } else if (act === 'stop') { if (units.length) sim.issue({ t: 'stop', ids: units.map(u => u.id) }); }
      else if (act === 'amove') { ctl.cancelModes(); ui.amove = true; ui.guard = false; }
      else if (act === 'guard') { ctl.cancelModes(); ui.amove = true; ui.guard = true; }
      else if (act === 'force') { const on = ui.force; ctl.cancelModes(); ui.force = !on; }
      else if (act === 'wp') { ui.wp = !ui.wp; if (ui.wp) ctl.cancelModes(); }
      else if (act === 'land') ctl.landRepair();
      else if (act === 'cancelbuild') { for (const x of ctl.selectedOwn('bldg')) if (!x.done) sim.issue({ t: 'cancelbuild', id: x.id }); }
      else if (act === 'scatter') { if (units.length) { sim.issue({ t: 'scatter', ids: units.map(u => u.id) }); ui.sfx && ui.sfx('order'); } }
      else if (act === 'heromode') sim.issue({ t: 'heromode', ids: units.filter(u => UNITS[u.type].modes).map(u => u.id) });
      else if (act === 'deploy') sim.issue({ t: 'deploy', ids: units.filter(u => UNITS[u.type].deploy).map(u => u.id) });
      else if (act === 'addon') { for (const u of units) if (UNITS[u.type].hardpoints && !u.addon && !u.addonQ) sim.issue({ t: 'addon', id: u.id, type: arg }); }
      else if (act === 'evac') ctl.evacuate(0);
      else if (act === 'evac1') ctl.evacuate(1);
    });
    $('queue').addEventListener('click', (ev) => {
      const b = ev.target.closest('button[data-idx]'); if (!b) return;
      sim.issue({ t: 'cancel', id: +b.dataset.bid, idx: +b.dataset.idx });
    });
    $('pw').addEventListener('click', (ev) => {
      const b = ev.target.closest('button[data-power]'); if (!b) return;
      const id = b.dataset.power, left = (sim.teams[PLAYER].powerReady[id] || 0) - sim.tick;
      if (left > 0) { this.toast(`${POWERS[id].name} ready in ${Math.ceil(left / TICK_HZ)} s`, 'warn'); return; }
      if (ui.power && ui.power.id === id) ui.power = null; else ctl.startPower(id);
    });
    $('btn-gen').addEventListener('click', () => { $('btn-gen').classList.remove('pulse'); ui.togglePromo(); });
    $('promo-close').addEventListener('click', () => ui.togglePromo());
    $('promo-tree').addEventListener('click', (ev) => { const b = ev.target.closest('button[data-node]'); if (b) sim.issue({ t: 'promote', node: b.dataset.node }); });
    const mm = this.mini; let down = false;
    const toWorld = (ev) => { const r = mm.getBoundingClientRect(); return [(ev.clientX - r.left) / r.width * WORLD, (ev.clientY - r.top) / r.height * WORLD]; };
    mm.addEventListener('mousedown', (ev) => {
      const [x, z] = toWorld(ev);
      if (ev.button === 0) { down = true; this.rig.focus(x, z); }
      else if (ev.button === 2) { const ids = ctl.selectedOwn('unit').map(u => u.id); if (ids.length) { sim.issue({ t: 'move', ids, x, z }); ctl.ping(x, z, '#7dffa0'); } }
    });
    window.addEventListener('mousemove', (ev) => { if (down) { const [x, z] = toWorld(ev); this.rig.focus(x, z); } });
    window.addEventListener('mouseup', () => { down = false; });
    mm.addEventListener('contextmenu', (ev) => ev.preventDefault());
    $('btn-help').addEventListener('click', () => { const h = $('help'); h.hidden = !h.hidden; $('btn-help').setAttribute('aria-expanded', String(!h.hidden)); });
    $('help-close').addEventListener('click', () => { $('help').hidden = true; $('btn-help').setAttribute('aria-expanded', 'false'); });
    $('opt-edge').addEventListener('change', (ev) => { ctl.edgeScroll = ev.target.checked; });
    $('banner-continue').addEventListener('click', () => { $('banner').hidden = true; });
    $('aar-new').addEventListener('click', () => this.ui.newMatch && this.ui.newMatch());
    $('aar-replay').addEventListener('click', () => this.ui.saveReplay && this.ui.saveReplay());
    // lighting preset, master volume, mute
    const light = $('opt-light'); light.value = this.view.lighting; light.addEventListener('change', () => { this.view.setLighting(light.value); light.blur(); });
    const vol = $('vol'), mute = $('btn-mute'), au = this.ui.audio;
    const paint = () => { mute.setAttribute('aria-pressed', String(au.muted)); mute.textContent = au.muted ? 'Sound off' : 'Sound on'; };
    vol.value = Math.round(au.volume * 100); paint();
    vol.addEventListener('input', () => { au.init(); au.setVolume(vol.value / 100); try { localStorage.setItem('cz-vol', vol.value); } catch (e) { /* ignore */ } });
    mute.addEventListener('click', () => { au.init(); au.setMuted(!au.muted); paint(); try { localStorage.setItem('cz-mute', au.muted ? '1' : '0'); } catch (e) { /* ignore */ } });
    // replay / observer bar
    // The speed bar is there in every game; in a replay it is labelled Replay and also carries the Fog of War switch.
    $('replay-bar').hidden = false; $('replay-bar').querySelector('.lbl').textContent = this.ui.observer ? 'Replay' : 'Speed'; $('rp-fog').hidden = !this.ui.observer;
    $('replay-bar').addEventListener('click', (ev) => {
      const b = ev.target.closest('button'); if (!b) return;
      if (b.dataset.speed) { this.ui.speed = +b.dataset.speed; for (const k of $('replay-bar').querySelectorAll('button[data-speed]')) k.setAttribute('aria-pressed', String(k === b)); }
      else if (b.id === 'rp-fog') { this.ui.reveal = !this.ui.reveal; this.view.reveal = this.ui.reveal; b.setAttribute('aria-pressed', String(!this.ui.reveal)); b.textContent = this.ui.reveal ? 'Fog of War: off' : 'Fog of War: on'; this.fogVer = -1; }
    });
  }

  shows(e) { return this.ui.reveal || this.sim.fog.shouldShow(PLAYER, e); }
  // Post-match After-Action Report: both sides, side by side.
  showReport(winner, why) {
    const sim = this.sim, T = sim.teams, me = T[PLAYER], foe = T[ENEMY], s = Math.floor(sim.tick / TICK_HZ);
    const rows = [['Units built', me.built, foe.built], ['Units destroyed', me.unitsKilled, foe.unitsKilled], ['Units lost', me.unitsLost, foe.unitsLost], ['Buildings destroyed', me.bldgsKilled, foe.bldgsKilled],
      ['Resources harvested', '$' + fmt(me.earned), '$' + fmt(foe.earned)], ['Passive income', '$' + fmt(me.passive), '$' + fmt(foe.passive)], ["General's Powers deployed", me.powersUsed, foe.powersUsed], ['General rank reached', me.rank, foe.rank]];
    $('banner-title').textContent = this.ui.observer ? 'Replay complete' : winner === PLAYER ? 'Victory' : 'Defeat';
    $('banner-sub').textContent = (why === 'hill' ? (winner === PLAYER ? 'You held the hill for 3:00.' : 'The enemy held the hill for 3:00.') : winner === PLAYER ? 'The enemy has no Command Center and no builders left.' : 'Your Command Center and builders are gone.') + ' Match length ' + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') + '.';
    $('aar-you').textContent = this.F.name; $('aar-foe').textContent = FACTIONS[foe.faction].name;
    $('aar-rows').innerHTML = rows.map(([k, a, b]) => `<tr><th scope="row">${k}</th><td>${a}</td><td>${b}</td></tr>`).join('');
    $('aar-replay').hidden = !!this.ui.observer || !this.ui.saveReplay;
    $('help').hidden = true; $('btn-help').setAttribute('aria-expanded', 'false');   // the report needs the room
    $('banner').hidden = false;
  }

  resize(w, h) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.ov.width = Math.round(w * dpr); this.ov.height = Math.round(h * dpr); this.dpr = dpr;
  }

  // ---------- command card ----------
  buttons() {
    const sim = this.sim, ctl = this.controls, T = sim.teams[PLAYER], out = [];
    const units = ctl.selectedOwn('unit'), bldgs = ctl.selectedOwn('bldg');
    if (units.some(u => UNITS[u.type].builder)) {
      for (const t of this.F.build) {
        const d = BLDGS[t]; let why = '';
        if (d.superPower && sim.noSuper) continue;                       // lobby rule: no superweapons
        if (d.general && d.general !== T.general) continue;              // a building that belongs to another general is not offered
        if (d.needs && !hasBldg(sim, PLAYER, d.needs)) why = 'Requires ' + BLDGS[d.needs].name; else if (d.shore && !sim.map.hasWater) why = 'This map has no water'; else if (T.money < bldgCost(T, t)) why = 'Insufficient funds';
        out.push({ act: 'build:' + t, icon: iconFor(d, true), name: d.name, cost: bldgCost(T, t), why, sub: d.power > 0 ? '+' + d.power + ' PWR' : d.power < 0 ? '−' + (-d.power) + ' PWR' : '', on: this.ui.place && this.ui.place.type === t });
      }
    } else if (units.length) {
      out.push({ act: 'stop', icon: ICON.stop, name: 'Stop', key: 'Z' });
      out.push({ act: 'scatter', icon: ICON.scatter, name: 'Scatter', key: 'X' });
      if (units.some(u => UNITS[u.type].weapon)) { out.push({ act: 'amove', icon: ICON.amove, name: 'Attack-move', key: 'F', on: this.ui.amove && !this.ui.guard }); out.push({ act: 'guard', icon: ICON.guard, name: 'Guard area', key: 'V', on: this.ui.amove && !!this.ui.guard }); }
      if (units.some(u => UNITS[u.type].weapon)) out.push({ act: 'force', icon: ICON.force, name: 'Force attack', key: 'T', on: !!this.ui.force, tip: 'Fire on any spot, unit or building, even your own. Shortcut: Ctrl + right-click.' });
      out.push({ act: 'wp', icon: ICON.marker, name: 'Move markers', key: 'Shift', on: !!this.ui.wp, tip: 'While on, every right-click adds another point to the route. Shortcut: Shift + right-click.' });
      if (units.some(u => UNITS[u.type].heli)) out.push({ act: 'land', icon: ICON.land, name: 'Land & repair', key: 'L', tip: 'Fly to the nearest friendly helipad, land and repair.' });
      const md = units.filter(u => UNITS[u.type].modes);   // a hero with a switchable ability (Fook Mie)
      if (md.length) out.push({ act: 'heromode', icon: ICON.bolt, name: md[0].mode === 'resign' ? 'Phone: Resign' : 'Phone: Recruit', key: 'switch', on: md[0].mode === 'resign', tip: 'Recruit: the enemy unit she calls joins your side. Resign: it stands down and leaves the battle. Cheap units take about 2 s to recharge, the most expensive up to 14 s. Against a hero the call does damage instead.' });
      const dep = units.filter(u => UNITS[u.type].deploy);
      if (dep.length) out.push({ act: 'deploy', icon: ICON.income, name: dep.every(u => u.deployed) ? 'Pack up' : 'Deploy hack', key: '+$6/s', on: dep.every(u => u.deployed) });
      const ov = units.filter(u => UNITS[u.type].hardpoints && !u.addon && !u.addonQ);
      if (ov.length) for (const [k, hp] of Object.entries(UNITS[ov[0].type].hardpoints)) out.push({ act: 'addon:' + k, icon: k === 'gatling' ? ICON.defense : ICON.barracks, name: hp.name, cost: hp.cost, why: T.money < hp.cost ? 'Insufficient funds' : '' });
      if (units.some(u => u.garrison && u.garrison.length)) out.push({ act: 'evac', icon: ICON.evac, name: units.some(u => isTransport(u)) ? (units.some(u => UNITS[u.type].ship) ? 'Unload at the beach' : 'Unload') : 'Unload bunker', key: 'U', tip: units.some(u => isTransport(u)) ? (units.some(u => UNITS[u.type].ship) ? 'Everything aboard gets out onto the nearest shore. The craft must be at a beach.' : 'Everyone aboard gets out beside the vehicle (a helicopter sets them down on the ground below).') : '' });
    } else if (bldgs.length) {
      // a civilian building you hold counts as yours while the garrison is inside: this is where its exit buttons go
      for (const id of this.ui.selection) { const e = sim.byId.get(id); if (e && e.type === 'civ' && e.team === PLAYER && e.garrison.length) { out.push({ act: 'evac', icon: ICON.evac, name: 'Evacuate all', key: 'U', tip: 'Every squad leaves the building. Or right-click the ground to send them straight there.' }); out.push({ act: 'evac1', icon: ICON.evac, name: 'Take out one squad', key: 'Shift+U', tip: 'Only the last squad that went in comes out.' }); break; } }
      const seen = new Set(), sites = bldgs.filter(b => !b.done);
      if (sites.length) out.push({ act: 'cancelbuild', icon: ICON.cancel, name: 'Cancel construction', key: 'refund $' + fmt(sites.reduce((a, b) => a + bldgCost(T, b.type), 0)), tip: 'Remove the unfinished building and get its full price back.' });
      for (const b of bldgs) {
        if (!b.done) continue;
        const bd = BLDGS[b.type];
        for (const t of trainsOf(T, b.type)) {
          if (seen.has(t)) continue; seen.add(t);
          const d = UNITS[t]; let why = '';
          if (d.promo && !T.promos.has(d.promo)) why = 'Needs promotion: ' + this.F.tree.find(n => n.id === d.promo).name; else if (d.needs && !hasBldg(sim, PLAYER, d.needs)) why = 'Requires ' + BLDGS[d.needs].name; else if (d.hero && heroTaken(sim, PLAYER)) why = 'Only one hero at a time'; else if (T.money < unitCost(T, t)) why = 'Insufficient funds';
          out.push({ act: 'train:' + t, icon: d.hero ? ICON.star : iconFor(d, false), name: d.name, cost: unitCost(T, t), why, tip: d.hero ? 'Hero. One at a time. Always cloaked; seen when it fires or when enemies or defenses are close.' : undefined });
        }
        for (const u of upgradesOf(T, b.type)) {
          if (seen.has(u) || T.upgrades.has(u)) continue; seen.add(u);
          const q = sim.ents.some(e => e.kind === 'bldg' && e.team === PLAYER && e.queue.includes('up:' + u));
          out.push({ act: 'train:up:' + u, icon: ICON.up, name: UPGRADES[u].name, cost: UPGRADES[u].cost, why: q ? 'Already in production' : T.money < UPGRADES[u].cost ? 'Insufficient funds' : '', tip: UPGRADES[u].desc });
        }
      }
    }
    return out;
  }
  hint() {
    const ctl = this.controls, b = ctl.selectedOwn('bldg')[0];
    if (b && BLDGS[b.type].tunnel) return 'Select units and right-click any finished Tunnel: they enter the nearest one and come out here.';
    if (b && BLDGS[b.type].income) return 'Pays $' + BLDGS[b.type].income.amt + ' every 2 s' + (BLDGS[b.type].power < 0 ? ' while the power grid holds.' : '.');
    if (b && BLDGS[b.type].pads) return 'Strike fighters park here, one per pad, and return to rearm.';
    return 'Select a ' + UNITS[this.F.roles.builder].name + ' to build, or a structure to train units.';
  }
  renderButtons() {
    const list = this.buttons(), sig = list.map(b => b.act + (b.why ? '!' + b.why : '') + (b.on ? '*' : '') + b.name).join('|') || this.hint();
    if (sig === this.sig) return; this.sig = sig;
    $('cmd').innerHTML = list.length ? list.map(b => `<button type="button" class="cbtn${b.on ? ' on' : ''}" data-act="${b.act}" aria-disabled="${b.why ? 'true' : 'false'}" ${b.why ? `data-why="${b.why}" title="${b.why}"` : `title="${b.tip || b.name}"`}>${b.icon}<span class="nm">${b.name}</span><span class="ct">${b.cost ? '$' + fmt(b.cost) : (b.key || '')}${b.sub ? ' · ' + b.sub : ''}</span></button>`).join('')
      : `<p class="hint">${this.hint()}</p>`;
  }
  statusOf(e) { // one-line status for the info panel
    const sim = this.sim, T = sim.teams[PLAYER], mine = e.team === PLAYER, out = [];
    if (e.kind === 'unit') {
      const d = UNITS[e.type];
      if (e.vet) out.push(VET.names[e.vet] + ' (+' + e.vet * 15 + '% HP and fire rate' + (e.vet >= 2 ? ', self-repair' : '') + ')');
      if (!mine) return out.join(' · ');
      if (e.cloaked) out.push(e.detected ? 'Cloak detected' : 'Cloaked'); else if (e.stealthMode === 'still') out.push('Cloaks when stationary');
      if (e.horde) out.push('Horde +' + (T.flags.hordePlus ? 25 : 15) + '% fire rate');
      if (d.salvage) out.push('Salvage tier ' + e.tier + '/2');
      if (d.pdl || (d.pdlUpgrade && T.upgrades.has(d.pdlUpgrade))) out.push('Point defense ' + (e.pdlCd > 0 ? 'recharging' : 'ready'));
      if (d.based) out.push({ parked: e.ammo < d.ammo ? 'Rearming' : 'Ready on pad', out: 'On sortie', return: 'Returning to base' }[e.as] + ' · ' + e.ammo + '/' + d.ammo + ' missiles');
      if (e.addonQ) out.push('Fitting ' + d.hardpoints[e.addonQ.type].name + ' ' + Math.floor(e.addonQ.t / (d.hardpoints[e.addonQ.type].secs * 20) * 100) + '%');
      else if (e.addon) out.push(d.hardpoints[e.addon].name + (e.garrison ? ' ' + e.garrison.length + '/' + capacityOf(e) : ''));
      if (d.transport) out.push(e.garrison.length ? 'Aboard: ' + e.garrison.length + (e.garrison.some(id => { const g = sim.byId.get(id); return g && !UNITS[g.type].infantry; }) ? ' vehicle' : ' of ' + d.transport.squads + (d.transport.squads === 1 ? ' squad' : ' squads')) : 'Empty: right-click it with ' + (d.transport.squads === 1 ? 'an infantry squad' : 'up to ' + d.transport.squads + ' infantry squads') + (d.transport.vehicles ? ' or one vehicle' : ''));
      if (d.ship && !d.beach) out.push('Keeps off the shore');
      if (d.deploy) out.push(e.deployed ? 'Hacking: +$' + d.deploy.income + '/s' : 'Deploy to earn cash');
      if (e.order && e.order.t === 'capture' && e.capT) out.push('Capturing ' + Math.floor(e.capT / 100 * 100) + '%');
      if (d.harvester) out.push({ seek: 'Looking for supplies', toDock: e.holdI >= 0 && e.slotI < 0 ? 'Waiting for a free bay' : 'Heading to dock', loading: 'Loading', toCenter: e.holdI >= 0 && e.slotI < 0 ? 'Waiting to unload' : 'Returning $' + e.cargo, unloading: 'Unloading' }[e.hs] || '');
      if (d.dirArmor) out.push('Armor F×1.0 S×1.3 R×1.6');
      if (d.builder && e.working) out.push('Working');
      if (d.infiltrator) out.push('Right-click an enemy building to sabotage it');
    } else {
      const d = BLDGS[e.type];
      if (e.type === 'dock') return e.supplies > 0 ? `$${fmt(e.supplies)} of supplies left` : 'Depleted';
      if (d.capturable) return (e.team === PLAYER ? 'Yours: +$' + d.income.amt + ' every 2 s' : e.team === NEUTRAL || !sim.fog.canSee(PLAYER, e) ? 'Send infantry to capture it' : 'Enemy-held: send infantry to retake it');
      if (e.type === 'civ') out.push(e.ruined ? 'Destroyed' : `Garrison ${e.team === PLAYER || sim.fog.canSee(PLAYER, e) ? e.garrison.length : '?'}/${capacityOf(e)}` + (e.team === PLAYER && e.garrison.length ? ' · press U, or right-click the ground, to take them out' : ''));
      else if (!e.done) out.push(`Building ${Math.floor(e.progress * 100)}%`);
      else if (mine) {
        if (e.disabledUntil > sim.tick) out.push('SABOTAGED ' + Math.ceil((e.disabledUntil - sim.tick) / TICK_HZ) + ' s');
        if (d.weapon && d.power < 0 && T.low) out.push('OFFLINE (low power)');
        if (d.income) out.push(d.power < 0 && T.low ? 'No income (low power)' : '+$' + d.income.amt + ' every 2 s');
        if (d.pads) out.push('Pads ' + e.pads.filter(p => p.by).length + '/' + e.pads.length);
        if (d.tunnel) out.push('Tunnel exit');
      }
    }
    return out.filter(Boolean).join(' · ');
  }
  renderInfo() {
    const sim = this.sim, sel = [...this.ui.selection].map(id => sim.byId.get(id)).filter(Boolean);
    const name = $('sel-name'), sub = $('sel-sub'), hp = $('sel-hp'), hpf = $('sel-hpf'), q = $('queue');
    let qhtml = '';
    if (!sel.length) { name.textContent = 'No selection'; sub.textContent = 'Drag a box over units, or click one.'; hp.hidden = true; }
    else if (sel.length === 1) {
      const e = sel[0], d = e.kind === 'unit' ? UNITS[e.type] : BLDGS[e.type], ind = d.indestructible;
      name.textContent = d.name + (e.team === ENEMY && d.faction ? ' (enemy)' : '');
      hp.hidden = !!ind; const f = Math.max(0, e.hp / e.maxHp); hpf.style.width = (f * 100) + '%'; hpf.style.background = f > 0.6 ? 'var(--good)' : f > 0.3 ? 'var(--amber)' : 'var(--red)';
      const st = this.statusOf(e);
      sub.textContent = (ind ? '' : `${fmt(Math.max(0, e.hp))} / ${fmt(e.maxHp)} HP`) + (st ? (ind ? '' : ' · ') + st : '');
      if (e.kind === 'bldg' && e.team === PLAYER && e.queue.length) qhtml = e.queue.map((t, i) => { const up = t.startsWith('up:'); return `<button type="button" class="qi" data-bid="${e.id}" data-idx="${i}" title="Cancel ${up ? UPGRADES[t.slice(3)].name : UNITS[t].name} (refund)">${up ? ICON.up : iconFor(UNITS[t], false)}${i === 0 ? `<i style="height:${Math.round((1 - e.prod) * 100)}%"></i>` : ''}</button>`; }).join('');
    } else {
      const counts = {}; let h = 0, m = 0;
      for (const e of sel) { counts[e.type] = (counts[e.type] || 0) + 1; h += e.hp; m += e.maxHp; }
      name.textContent = sel.length + ' units selected';
      sub.textContent = Object.entries(counts).map(([t, n]) => n + '× ' + (UNITS[t] || BLDGS[t]).name).join('  ·  ');
      hp.hidden = false; hpf.style.width = (100 * h / m) + '%'; hpf.style.background = 'var(--good)';
    }
    if (q.innerHTML !== qhtml) q.innerHTML = qhtml;
  }
  renderStats(fps, simMs) {
    const sim = this.sim, t = sim.teams[PLAYER], ui = this.ui;
    this.shownMoney += (t.money - this.shownMoney) * 0.35; if (Math.abs(t.money - this.shownMoney) < 2) this.shownMoney = t.money;
    $('money').textContent = '$' + fmt(this.shownMoney);
    if (this.F.usesPower) {
      $('power').textContent = t.use + ' / ' + t.prod;
      $('st-power').classList.toggle('low', t.low);
      $('powerf').style.width = Math.min(100, t.prod ? 100 * t.use / t.prod : (t.use ? 100 : 0)) + '%';
      if (t.low && !this.lowPowerShown) { this.toast('Low power: defenses offline, production halved' + (this.F.radarNeedsPower ? ', radar degraded' : ''), 'bad'); this.ui.sfx && this.ui.sfx('klaxon'); } this.lowPowerShown = t.low;
    }
    const s = Math.floor(sim.tick / TICK_HZ);
    $('clock').textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
    // public match state: superweapon countdowns for both sides, and the King of the Hill clocks
    let sw = '';
    for (const t of [PLAYER, ENEMY]) { const id = superOf(sim, t); if (id && hasPower(sim, t, id)) { const left = Math.ceil(((sim.teams[t].powerReady[id] || 0) - sim.tick) / TICK_HZ), n = superBldgs(sim, t, id).length; sw += `<span class="${t === PLAYER ? 'mine' : 'foe'}">${t === PLAYER ? 'Your' : 'Enemy'} ${POWERS[id].name}${n > 1 ? ' ×' + n : ''} <b>${left > 0 ? mmss(left) : 'READY'}</b></span>`; } }
    if (sw !== this.swSig) { this.swSig = sw; $('sw').innerHTML = sw; $('sw').hidden = !sw; }
    const k = sim.koth, hb = $('hill');
    if (k) { hb.hidden = false; $('hill-t').textContent = 'You ' + mmss(k.secs[PLAYER]) + ' · Enemy ' + mmss(k.secs[ENEMY]) + ' / ' + mmss(k.need); hb.classList.toggle('foe', k.owner === ENEMY); hb.classList.toggle('mine', k.owner === PLAYER); }
    const tr = Math.ceil((sim.treatyUntil - sim.tick) / TICK_HZ), tb = $('treaty');
    if (tr > 0) { tb.hidden = false; $('treaty-t').textContent = Math.floor(tr / 60) + ':' + String(tr % 60).padStart(2, '0'); } else if (!tb.hidden) { tb.hidden = true; if (sim.treatyUntil > 0) { this.toast('Peace treaty has ended', 'warn'); this.ui.sfx && this.ui.sfx('klaxon'); } }
    $('perf').textContent = `${fps.toFixed(0)} fps · sim ${simMs.toFixed(2)} ms/tick`;
    $('paused').hidden = !ui.paused;
    const pw = ui.power;
    const m = pw ? POWERS[pw.id].name + ': ' + (pw.ok ? 'left-click the target' : pw.err) + ' (right-click cancels)' : ui.place ? 'Placing ' + BLDGS[ui.place.type].name + ': ' + (ui.place.why ? ui.place.why + '. ' : BLDGS[ui.place.type].shore ? 'Goes half on land, half in the water. ' : '') + 'Left-click to place, right-click to cancel' : ui.amove ? (ui.guard ? 'Guard area: left-click the spot to hold' : 'Attack-move: left-click a destination') : ui.force ? 'Force attack: left-click any spot, unit or building. It will be fired on, even if it is yours. (right-click cancels)' : ui.wp ? 'Move markers ON: each right-click adds a point to the route. Press Esc or the button to finish.' : '';
    $('mode').textContent = m; $('mode').hidden = !m; $('mode').classList.toggle('bad', !!pw && !pw.ok);
    // General: rank, XP toward the next rank, unspent points
    const lo = GENERAL.rankXp[t.rank - 1], hi = GENERAL.rankXp[t.rank];
    $('gen-rank').textContent = 'Rank ' + t.rank; $('gen-xpf').style.width = (hi ? Math.min(100, 100 * (t.xp - lo) / (hi - lo)) : 100) + '%';
    $('gen-pts').textContent = t.points; $('gen-pts').hidden = t.points < 1;
    this.renderPowers(); if (ui.promoOpen) this.renderPromo();
  }

  // ---------- support powers: radial cooldown buttons ----------
  renderPowers() {
    const sim = this.sim, T = sim.teams[PLAYER], box = $('pw');
    const list = this.F.tree.filter(n => n.power && T.promos.has(n.id)).map(n => nodePower(T, n)), sp = superOf(sim, PLAYER);
    if (sp && hasPower(sim, PLAYER, sp)) list.push(sp);
    const sig = list.join();
    if (sig !== this.pwSig) {
      this.pwSig = sig;
      box.innerHTML = list.map(id => `<button type="button" class="pbtn${POWERS[id].super ? ' super' : ''}" data-power="${id}" title="${POWERS[id].desc}"><span class="dial">${id === 'ambush' || id === 'paradrop' ? ICON.rifle : id === 'cashhack' || POWERS[id].super ? ICON.bolt : id === 'sneaktunnel' ? ICON.stop : ICON.jet}<b class="sec"></b></span><span class="pn">${POWERS[id].name}</span></button>`).join('');
      box.hidden = !list.length;
    }
    for (const b of box.children) {
      const id = b.dataset.power, left = Math.max(0, (T.powerReady[id] || 0) - sim.tick), frac = Math.min(1, left / (POWERS[id].cd * TICK_HZ));
      b.style.setProperty('--p', frac.toFixed(3)); b.classList.toggle('cool', left > 0); b.classList.toggle('on', !!this.ui.power && this.ui.power.id === id);
      b.querySelector('.sec').textContent = left > 0 ? Math.ceil(left / TICK_HZ) : '';
    }
  }

  // ---------- General's Promotions modal ----------
  renderPromo() {
    const T = this.sim.teams[PLAYER], F = this.F, sig = [T.rank, T.points, T.promos.size, Math.floor(T.xp / 10)].join();
    if (sig === this.promoSig) return; this.promoSig = sig;
    const hi = GENERAL.rankXp[T.rank];
    $('promo-head').textContent = `${F.name} · Rank ${T.rank}`;
    $('promo-xp').textContent = hi ? `${Math.floor(T.xp)} / ${hi} XP to Rank ${T.rank + 1}` : `${Math.floor(T.xp)} XP · top rank`;
    $('promo-pts').textContent = T.points + (T.points === 1 ? ' point' : ' points') + ' to spend';
    $('promo-tree').innerHTML = [1, 3, 5].map(tier => `<section class="tier${T.rank >= tier ? '' : ' locked'}"><h3>Rank ${tier}${T.rank >= tier ? '' : ' <small>locked</small>'}</h3>` + F.tree.filter(n => n.tier === tier).map(n => {
      const has = T.promos.has(n.id), req = n.req ? F.tree.find(k => k.id === n.req) : null;
      const shown = (k) => k.power && nodePower(T, k) !== k.power ? POWERS[nodePower(T, k)].name : k.name;   // a general may swap a power for his own
      const why = has ? '' : T.rank < tier ? `Reach Rank ${tier}` : req && !T.promos.has(req.id) ? `Needs ${shown(req)}` : T.points < 1 ? 'No points' : '';
      return `<article class="node${has ? ' has' : why ? ' no' : ' can'}"><h4>${n.power ? ICON.jet : n.unlock ? ICON.man : ICON.star}${n.power && nodePower(T, n) !== n.power ? POWERS[nodePower(T, n)].name : n.name}</h4><p>${n.power && nodePower(T, n) !== n.power ? POWERS[nodePower(T, n)].desc : n.desc}</p>${req ? `<p class="req">Branch: after ${shown(req)}</p>` : ''}` +
        (has ? '<span class="tag">Unlocked</span>' : why ? `<span class="tag">${why}</span>` : `<button type="button" class="tbtn" data-node="${n.id}">Spend 1 point</button>`) + '</article>';
    }).join('') + '</section>').join('');
  }

  // ---------- minimap ----------
  drawMinimap(dt) {
    const sim = this.sim, fog = sim.fog, g = this.mctx, T = sim.teams[PLAYER];
    // Vanguard radar runs off the power grid: under low power it refreshes every 3 s
    const degraded = this.F.radarNeedsPower && T.low;
    $('radar-warn').hidden = !degraded;
    if (degraded) { this.radarT += dt; if (this.radarT < 3) return; } this.radarT = 0;
    if (fog.version !== this.fogVer) {
      this.fogVer = fog.version; const d = this.fogImg.data, vis = fog.vis[PLAYER], exp = fog.exp[PLAYER];
      for (let i = 0; i < N * N; i++) { d[i * 4] = 7; d[i * 4 + 1] = 9; d[i * 4 + 2] = 11; d[i * 4 + 3] = vis[i] ? 0 : 138; }   // no black shroud: ground you have not seen is only dimmed
      this.fogCtx.putImageData(this.fogImg, 0, 0);
    }
    // The canvas is a fixed size; the map is not. Everything below is drawn in map cells and scaled to fit, and
    // markers are sized by `u` so they look the same on a 0.5 km, 1 km or 2 km map.
    const k = this.mini.width / N, u = N / 256; g.setTransform(k, 0, 0, k, 0, 0); g.imageSmoothingEnabled = true;
    g.drawImage(this.base, 0, 0);
    for (const e of sim.ents) { // structures under the fog layer so "last known" ones read as remembered
      if (e.kind !== 'bldg' || !this.shows(e)) continue;
      const d = BLDGS[e.type];
      if (!d.faction && !fog.exp[PLAYER][sim.nav.cellOf(e.x, e.z)]) continue;
      const known = e.team === PLAYER || fog.canSee(PLAYER, e) || (d.faction && e.seen[PLAYER]); // never leak who holds a building we cannot see
      g.fillStyle = e.type === 'dock' ? (e.supplies > 0 ? '#f2a93b' : '#77705f') : e.ruined ? '#5d564d' : d.faction ? TEAM_CSS[e.team] : known ? TEAM_CSS[e.team] : TEAM_CSS[2];
      g.fillRect(e.cx, e.cz, e.w, e.h);
      if (d.capturable) { g.strokeStyle = '#151b20'; g.lineWidth = u; g.strokeRect(e.cx + 0.5, e.cz + 0.5, e.w - 1, e.h - 1); }
    }
    g.fillStyle = 'rgba(120,255,90,0.35)';
    for (const h of sim.hazards) if (h.kind === 'toxin' && (h.team === PLAYER || fog.visAt(PLAYER, h.x, h.z))) { g.beginPath(); g.arc(h.x / CELL, h.z / CELL, h.r / CELL, 0, 6.283); g.fill(); }
    if (!this.ui.reveal) g.drawImage(this.fogCanvas, 0, 0);
    g.fillStyle = '#ffd34a';
    for (const c of sim.crates) if (fog.visAt(PLAYER, c.x, c.z)) g.fillRect(c.x / CELL - u, c.z / CELL - u, 2 * u, 2 * u);
    for (const e of sim.ents) {
      if (e.kind !== 'unit' || !this.shows(e)) continue;
      g.fillStyle = this.ui.selection.has(e.id) ? '#ffffff' : TEAM_CSS[e.team];
      if (e.air) { g.beginPath(); g.moveTo(e.x / CELL, e.z / CELL - 2.6 * u); g.lineTo(e.x / CELL + 2.4 * u, e.z / CELL + 2 * u); g.lineTo(e.x / CELL - 2.4 * u, e.z / CELL + 2 * u); g.fill(); }
      else g.fillRect(e.x / CELL - 1.5 * u, e.z / CELL - 1.5 * u, 3 * u, 3 * u);
    }
    for (const p of sim.strikes) { // off-map aircraft: own always, enemy only inside vision
      if (p.kind !== 'plane' || !strikeVisible(sim, PLAYER, p)) continue;
      const x = p.x / CELL, z = p.z / CELL; g.strokeStyle = TEAM_CSS[p.team]; g.lineWidth = 1.6 * u; g.beginPath(); g.moveTo(x - p.dx * 5 * u, z - p.dz * 5 * u); g.lineTo(x + p.dx * 4 * u, z + p.dz * 4 * u); g.moveTo(x - p.dz * 3 * u, z + p.dx * 3 * u); g.lineTo(x + p.dz * 3 * u, z - p.dx * 3 * u); g.stroke();
    }
    // camera footprint
    const ctl = this.controls, v = this.view, pts = [[0, 0], [v.w, 0], [v.w, v.h], [0, v.h]].map(([x, y]) => this.planePoint(x, y));
    g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 1.2 * u; g.beginPath();
    pts.forEach((p, i) => { const x = p[0] / CELL, z = p[1] / CELL; if (i) g.lineTo(x, z); else g.moveTo(x, z); }); g.closePath(); g.stroke();
    const pw = this.ui.power; if (pw && pw.x !== undefined) { g.strokeStyle = pw.ok ? '#f2a93b' : '#ff5a4d'; g.lineWidth = 1.5 * u; g.beginPath(); g.arc(pw.x / CELL, pw.z / CELL, POWERS[pw.id].radius / CELL, 0, 6.283); g.stroke(); }
    if (sim.koth) { const k = sim.koth; g.strokeStyle = k.owner === PLAYER ? '#7dffa0' : k.owner === ENEMY ? '#ff5a4d' : '#f2a93b'; g.lineWidth = 1.5 * u; g.setLineDash([3 * u, 2 * u]); g.beginPath(); g.arc(k.x / CELL, k.z / CELL, k.r / CELL, 0, 6.283); g.stroke(); g.setLineDash([]); }
    for (const a of this.alerts) { const r = (4 + (a.t % 0.8) * 16) * u; g.strokeStyle = `rgba(255,90,77,${1 - (a.t % 0.8) / 0.8})`; g.lineWidth = 2 * u; g.beginPath(); g.arc(a.x / CELL, a.z / CELL, r, 0, 6.283); g.stroke(); }
    for (const mk of ctl.markers) { g.fillStyle = mk.color; g.fillRect(mk.x / CELL - 2 * u, mk.z / CELL - 2 * u, 4 * u, 4 * u); }
    g.setTransform(1, 0, 0, 1, 0, 0);
  }
  planePoint(mx, my) { // view ray vs. the plane through the camera focus height
    const cam = this.view.camera, rig = this.rig, v = this.controls._v;
    v.set((mx / this.view.w) * 2 - 1, -(my / this.view.h) * 2 + 1, 0.5).unproject(cam);
    let dx = v.x - cam.position.x, dy = v.y - cam.position.y, dz = v.z - cam.position.z; const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
    const t = dy < -0.03 ? Math.min(900, (cam.position.y - rig.ty) / -dy) : 900;
    return [cam.position.x + dx * t, cam.position.z + dz * t];
  }

  // ---------- 2D overlay ----------
  chevrons(g, cx, y, rank, k) { // floating veterancy badge: 1-3 stacked chevrons
    const w = 7 * k, h = 3.2 * k; g.lineWidth = 2 * k; g.lineJoin = 'miter';
    for (let i = 0; i < rank; i++) {
      const yy = y - i * (h + 1.6 * k);
      g.strokeStyle = 'rgba(8,10,12,0.85)'; g.lineWidth = 3.6 * k; g.beginPath(); g.moveTo(cx - w, yy); g.lineTo(cx, yy - h); g.lineTo(cx + w, yy); g.stroke();
      g.strokeStyle = VET_CSS[rank]; g.lineWidth = 2 * k; g.beginPath(); g.moveTo(cx - w, yy); g.lineTo(cx, yy - h); g.lineTo(cx + w, yy); g.stroke();
    }
  }
  drawOverlay(dt) {
    const g = this.octx, sim = this.sim, v = this.view, p = this._p, ui = this.ui, map = sim.map;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); g.clearRect(0, 0, v.w, v.h);
    const k = Math.min(1.6, Math.max(0.55, 80 / this.rig.dist));
    g.font = '700 10px "JetBrains Mono", ui-monospace, monospace'; g.textAlign = 'center';
    for (const e of sim.ents) {
      if (!this.shows(e)) continue;
      const isU = e.kind === 'unit', d = isU ? UNITS[e.type] : BLDGS[e.type];
      if (d.indestructible && !d.capturable) continue;
      const sel = ui.selection.has(e.id), hov = ui.hover === e.id, hurt = e.hp < e.maxHp && !e.ruined && !d.indestructible, building = !isU && !e.done;
      const mine = e.team === PLAYER, flag = isU && mine && (e.cloaked || e.horde || e.deployed || e.capT || e.addonQ);
      if (!sel && !hov && !hurt && !building && !flag) continue;
      if (!isU && !mine && !sim.fog.canSee(PLAYER, e) && !sel) continue; // no live health on remembered structures
      const top = isU ? (e.air && !e.landed ? d.alt + 2.2 : d.radius > 2.4 ? 3.6 : 2.6) : (v.views.get(e.id)?.top || 7.5);
      const ex = isU ? e.px + (e.x - e.px) * this.alpha : e.x, ez = isU ? e.pz + (e.z - e.pz) * this.alpha : e.z;
      if (!v.project(ex, heightAt(map, ex, ez) + top, ez, p)) continue;
      const w = (isU ? 30 : 64) * k, h = 4, x = p.x - w / 2, y = p.y - 8, f = Math.max(0, e.hp / e.maxHp);
      if (!d.indestructible && (sel || hov || hurt || building)) {
        g.fillStyle = 'rgba(8,10,12,0.75)'; g.fillRect(x - 1, y - 1, w + 2, h + 2);
        g.fillStyle = e.team === ENEMY ? TEAM_CSS[ENEMY] : f > 0.6 ? '#7bd88f' : f > 0.3 ? '#f2a93b' : '#ff5a4d'; g.fillRect(x, y, w * f, h);
      }
      let bar = -1, col = '#f2a93b';
      if (building) bar = e.progress; else if (!isU && mine && e.queue.length) { bar = e.prod; col = TEAM_CSS[PLAYER]; }
      else if (isU && mine && e.capT) bar = e.capT / 100; else if (isU && mine && e.addonQ) bar = e.addonQ.t / (d.hardpoints[e.addonQ.type].secs * 20);
      if (bar >= 0) { g.fillStyle = 'rgba(8,10,12,0.75)'; g.fillRect(x - 1, y + 6, w + 2, 5); g.fillStyle = col; g.fillRect(x, y + 7, w * bar, 3); }
      if (e.garrison && e.garrison.length && mine) { g.fillStyle = TEAM_CSS[PLAYER]; for (let i = 0; i < e.garrison.length; i++) g.fillRect(x + i * 9, y - 9, 7, 5); }
      if (isU) {
        // veterancy chevrons float above selected or hovered units
        if (e.vet && (sel || hov)) this.chevrons(g, p.x, y - 7, e.vet, k);
        if (mine) {
          const tag = e.cloaked ? [e.detected ? 'SEEN' : 'CLOAK', e.detected ? '#ff5a4d' : '#9fb0bd'] : e.deployed ? ['$', '#f2a93b'] : e.horde ? ['HORDE', '#ff8a5a'] : null;
          if (tag) { const ty = y - (e.vet && (sel || hov) ? 12 + e.vet * 5 * k : 6); g.fillStyle = 'rgba(8,10,12,0.8)'; g.fillText(tag[0], p.x + 1, ty + 1); g.fillStyle = tag[1]; g.fillText(tag[0], p.x, ty); }
        }
      }
    }
    // rally lines for selected production buildings
    g.lineWidth = 1.5;
    for (const id of ui.selection) {
      const b = sim.byId.get(id); if (!b || b.kind !== 'bldg' || b.team !== PLAYER || !BLDGS[b.type].trains) continue;
      const a = { x: 0, y: 0 };
      if (v.project(b.x, heightAt(map, b.x, b.z) + 1, b.z, a) && v.project(b.rallyX, heightAt(map, b.rallyX, b.rallyZ) + 0.3, b.rallyZ, p)) {
        g.strokeStyle = 'rgba(242,169,59,0.8)'; g.setLineDash([6, 5]); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(p.x, p.y); g.stroke(); g.setLineDash([]);
        g.fillStyle = '#f2a93b'; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x, p.y - 16); g.lineTo(p.x + 11, p.y - 12); g.lineTo(p.x, p.y - 8); g.fill();
      }
    }
    // routes of the selected units: the point they are heading for, then every queued move marker, numbered in order
    {
      const flags = []; let drawn = 0;
      for (const id of ui.selection) {
        const u = sim.byId.get(id); if (!u || u.kind !== 'unit' || u.team !== PLAYER || !u.order || drawn >= 30) continue;
        const o = u.order;
        if (o.t === 'fattack') { // force-attack target: a red cross on the spot
          const tgt = o.id ? sim.byId.get(o.id) : null, fx = tgt ? tgt.x : o.x, fz = tgt ? tgt.z : o.z;
          if (v.project(fx, heightAt(map, fx, fz) + 0.4, fz, p)) { g.strokeStyle = '#ff7a1a'; g.lineWidth = 2.5; const r = 9 * k; g.beginPath(); g.moveTo(p.x - r, p.y - r * 0.6); g.lineTo(p.x + r, p.y + r * 0.6); g.moveTo(p.x + r, p.y - r * 0.6); g.lineTo(p.x - r, p.y + r * 0.6); g.stroke(); g.beginPath(); g.ellipse(p.x, p.y, r * 1.5, r * 0.9, 0, 0, 6.283); g.stroke(); }
          continue;
        }
        if ((o.t !== 'move' && o.t !== 'amove') || (!u.wps && !ui.wp)) continue;
        drawn++;
        const pts = [[o.x, o.z, !!(o.t === 'amove')]].concat((u.wps || []).map(w => [w.x, w.z, w.a])), a = { x: 0, y: 0 };
        let okPrev = v.project(u.x, heightAt(map, u.x, u.z) + 0.4, u.z, a);
        g.strokeStyle = 'rgba(90,209,255,0.55)'; g.lineWidth = 1.5; g.setLineDash([5, 5]);
        pts.forEach((q, i) => {
          const okCur = v.project(q[0], heightAt(map, q[0], q[1]) + 0.3, q[1], p);
          if (okPrev && okCur) { g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(p.x, p.y); g.stroke(); }
          if (okCur && !flags.some(f => f[2] === i && Math.hypot(f[3] - q[0], f[4] - q[1]) < 14)) flags.push([p.x, p.y, i, q[0], q[1], q[2]]);
          a.x = p.x; a.y = p.y; okPrev = okCur;
        });
        g.setLineDash([]);
      }
      g.font = `bold ${Math.round(10 * k)}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      for (const f of flags) { // a small numbered flag at each marker
        const c = f[5] ? '#ff5a4d' : '#5ad1ff';
        g.strokeStyle = c; g.lineWidth = 2; g.beginPath(); g.moveTo(f[0], f[1]); g.lineTo(f[0], f[1] - 18 * k); g.stroke();
        g.fillStyle = c; g.beginPath(); g.moveTo(f[0], f[1] - 18 * k); g.lineTo(f[0] + 12 * k, f[1] - 14 * k); g.lineTo(f[0], f[1] - 10 * k); g.fill();
        g.fillStyle = 'rgba(8,10,12,0.85)'; g.beginPath(); g.arc(f[0], f[1], 6.5 * k, 0, 6.283); g.fill(); g.fillStyle = c; g.fillText(String(f[2] + 1), f[0], f[1] + 0.5);
      }
      g.font = '700 10px "JetBrains Mono", ui-monospace, monospace'; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    }
    // order pings
    for (const mk of this.controls.markers) {
      if (!v.project(mk.x, heightAt(map, mk.x, mk.z) + 0.2, mk.z, p)) continue;
      const u = mk.t / 0.6; g.strokeStyle = mk.color; g.globalAlpha = 1 - u; g.lineWidth = 2;
      g.beginPath(); g.ellipse(p.x, p.y, 22 * (1 - u * 0.7) * k, 11 * (1 - u * 0.7) * k, 0, 0, 6.283); g.stroke(); g.globalAlpha = 1;
    }
    // support-power crosshair at the cursor
    const pw = ui.power;
    if (pw && pw.x !== undefined && v.project(pw.x, heightAt(map, pw.x, pw.z) + 0.5, pw.z, p)) {
      g.strokeStyle = pw.ok ? '#f2a93b' : '#ff5a4d'; g.lineWidth = 2; const r = 16;
      g.beginPath(); g.arc(p.x, p.y, r, 0, 6.283); for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { g.moveTo(p.x + a * (r - 6), p.y + b * (r - 6)); g.lineTo(p.x + a * (r + 9), p.y + b * (r + 9)); } g.stroke();
    }
    // floating text
    g.font = '600 12px "JetBrains Mono", ui-monospace, monospace';
    for (const f of this.floats) {
      f.t += dt; if (!v.project(f.x, heightAt(map, f.x, f.z) + f.y + f.t * 3, f.z, p)) continue;
      g.globalAlpha = Math.max(0, Math.min(1, (1.4 - f.t) * 2)); g.fillStyle = 'rgba(8,10,12,0.8)'; g.fillText(f.text, p.x + 1, p.y + 1); g.fillStyle = f.color; g.fillText(f.text, p.x, p.y);
    }
    g.globalAlpha = 1;
    if (this.floats.length) this.floats = this.floats.filter(f => f.t < 1.4);
    for (const a of this.alerts) a.t += dt; if (this.alerts.length) this.alerts = this.alerts.filter(a => a.t < 4);
    // drag box
    const d = this.controls.drag;
    if (d && d.box) { g.strokeStyle = '#7dffa0'; g.lineWidth = 1; g.fillStyle = 'rgba(125,255,160,0.10)'; const x = Math.min(d.x0, d.x1), y = Math.min(d.y0, d.y1), w = Math.abs(d.x1 - d.x0), h = Math.abs(d.y1 - d.y0); g.fillRect(x, y, w, h); g.strokeRect(x + 0.5, y + 0.5, w, h); }
  }

  update(dt, alpha, fps, simMs) {
    this.alpha = alpha;
    this.drawOverlay(dt);
    this.acc += dt;
    if (this.acc >= 0.1) { const step = this.acc; this.acc = 0; this.renderStats(fps, simMs); this.renderInfo(); this.renderButtons(); this.drawMinimap(step); }
    const ui = this.ui;
    this.ov.style.cursor = this.view.renderer.domElement.style.cursor = ui.power ? 'none' : ui.place ? 'cell' : ui.amove || ui.force ? 'crosshair' : 'default';
  }
}
