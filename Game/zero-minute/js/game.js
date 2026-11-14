// Game loop. The simulation advances in fixed 20 Hz ticks from an accumulator;
// rendering runs every animation frame and interpolates between ticks.
// A match starts from the lobby, or from a recorded replay (observer mode).
import { DT, PLAYER } from './sim/defs.js';
import { BLDGS, WEAPONS } from './sim/factionRegistry.js';
import { Sim } from './sim/simulationTick.js';
import { fxVisible } from './sim/powers.js';
import { ReplayRecorder, ReplayPlayer } from './sim/replayManager.js';
import { View } from './render/view.js';
import { CameraRig } from './input/camera.js';
import { Controls } from './input/controls.js';
import { Hud } from './ui/uiHUD.js';
import { showSetup } from './ui/setup.js';
import { loadExternalModels } from './render/modelFactory.js';
import { AudioEngine } from './audio/audioEngine.js';
import { TEAM, setTeamColors } from './ui/teamColors.js';

const REPLAY_KEY = 'cz-replay';
const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } return null; };

function fatal(err) {
  const box = document.getElementById('fatal');
  box.hidden = false; document.getElementById('fatal-text').textContent = (err && (err.stack || err.message)) || String(err);
}

export function boot() {
  // Optional external .glb models load while the player is on the setup screen; with none
  // supplied (the default) every unit uses its procedural assembly.
  const models = loadExternalModels().then((r) => { if (r.failed.length) console.warn('External models skipped:', r.failed.join('; ')); window.__rtsModels = r; return r; }).catch(() => null);

  // Audio: the engine exists from the start, but the AudioContext is only created on the first
  // user click or key press (browsers refuse to start audio before a gesture).
  const vol = parseFloat(store('cz-vol'));
  const audio = new AudioEngine({ volume: Number.isFinite(vol) ? vol / 100 : 0.7 });
  audio.muted = store('cz-mute') === '1';
  const wake = () => audio.init();
  window.addEventListener('pointerdown', wake, true); window.addEventListener('keydown', wake, true);

  const run = async (opts) => {
    await Promise.race([models, new Promise(res => setTimeout(res, 4000))]);
    try { start({ ...opts, audio }); } catch (err) { fatal(err); throw err; }
  };

  // "Watch replay" stores the recording and reloads the page; pick it up here.
  let replay = null;
  try { const raw = sessionStorage.getItem(REPLAY_KEY); if (raw) { sessionStorage.removeItem(REPLAY_KEY); replay = JSON.parse(raw); } } catch (e) { replay = null; }
  if (replay && replay.setup) { document.getElementById('setup').hidden = true; run({ replay }); return; }
  showSetup((factions, level, opt = {}) => run({ factions, level, ...opt }));
  window.__rtsReplay = (data) => { document.getElementById('setup').hidden = true; return run({ replay: data }); }; // test hook
}

function start(o) {
  const canvas = document.getElementById('gl'), app = document.getElementById('app'), audio = o.audio;
  let sim, player = null, rec = null;
  if (o.replay) { player = new ReplayPlayer(o.replay); sim = player.sim; }
  else { sim = new Sim({ factions: o.factions, difficulty: o.level || 'medium', money: o.money, treaty: o.treaty || 0, noSuper: o.noSuper, koth: o.koth, noEnemy: o.noEnemy, map: o.map || undefined }); rec = new ReplayRecorder(sim); }

  const ui = {
    selection: new Set(), groups: [], place: null, amove: false, guard: false, power: null, hover: 0, promoOpen: false, paused: false, toast: null, togglePromo: null,
    audio, sfx: (name) => { if (audio.ready && !audio.muted && audio[name]) audio[name](); },
    observer: !!player, reveal: false, speed: 1,
    newMatch: () => location.reload(),
    saveReplay: rec ? () => {
      try { sessionStorage.setItem(REPLAY_KEY, JSON.stringify(rec.export())); } catch (e) { if (ui.toast) ui.toast('Replay needs browser storage, which is blocked here', 'bad'); return; }
      location.reload();
    } : null,
  };
  const col = o.replay ? (o.replay.colors || []) : (o.colors || []); setTeamColors(col[0], col[1]);   // before any model or HUD element is built
  document.documentElement.style.setProperty('--blue', TEAM.css[0]);
  const lighting = o.replay ? (o.replay.lighting || 'noon') : (o.lighting || 'noon');
  const view = new View(canvas, sim, { lighting });
  if (rec) { const exp = rec.export.bind(rec); rec.export = () => ({ ...exp(), lighting: view.lighting, colors: TEAM.ids.slice() }); } // cosmetic only: not part of the simulation
  const rig = new CameraRig(sim.map);
  const hq = sim.ents.find(e => e.kind === 'bldg' && e.team === PLAYER && BLDGS[e.type].role === 'cc');
  if (hq) rig.focus(hq.x + 14, hq.z + 6);
  const controls = new Controls(canvas, sim, view, rig, ui);
  const hud = new Hud(sim, view, rig, controls, ui);
  if (player) { ui.toast && ui.toast('Replay: observer mode. You can look, not give orders.', 'warn'); document.getElementById('help').hidden = true; }

  const resize = () => { const w = Math.max(1, app.clientWidth), h = Math.max(1, app.clientHeight); view.resize(w, h); hud.resize(w, h); };
  window.addEventListener('resize', resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(app);
  resize();
  if (window.matchMedia && window.matchMedia('(max-width: 860px)').matches) document.getElementById('help').hidden = true;

  const hear = (e) => ui.reveal || fxVisible(sim, PLAYER, e);   // you only hear what you could see
  const cdOf = (w) => (WEAPONS[w] ? WEAPONS[w].cd : 99);
  let last = performance.now(), acc = 0, fps = 60, simMs = 0, ended = false;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.25, (now - last) / 1000); last = now;
    if (dt > 0) fps += (1 / dt - fps) * 0.05;
    audio.setListener(rig.tx, rig.tz, rig.dist, rig.yaw);
    if (!ui.paused) {
      const speed = player ? ui.speed : 1, cap = 5 * speed;
      acc += dt * speed;
      let n = 0;
      while (acc >= DT && n < cap) {
        const t0 = performance.now();
        if (player) { if (!player.step()) { acc = 0; break; } } else { sim.step(); rec.mark(); }
        simMs += (performance.now() - t0 - simMs) * 0.05;
        const ev = sim.events; sim.events = [];
        view.handleEvents(ev); hud.handleEvents(ev); audio.handleEvents(ev, hear, cdOf);
        acc -= DT; n++;
      }
      if (n === cap) acc = 0; // fell behind (tab was throttled): drop the backlog rather than spiral
      if (player && player.done && !ended) { ended = true; hud.showReport(sim.winner); if (player.diverged >= 0) ui.toast && ui.toast('Replay drifted from the recording at tick ' + player.diverged, 'bad'); }
    }
    const alpha = ui.paused || (player && player.done) ? 1 : Math.min(1, acc / DT);
    controls.update(dt);
    view.render(alpha, ui.paused ? 0 : dt, rig, ui);
    hud.update(dt, alpha, fps, simMs);
  }
  window.__rtsRunning = true;
  window.__rts = { sim, view, rig, controls, hud, ui, audio, rec, player };
  requestAnimationFrame(frame);
}
