// Procedural Web Audio sound engine. No audio files: every sound is synthesised from
// oscillators and one shared noise buffer.
//
//   voice cap    at most MAX_VOICES (24) sounds at once. A new sound steals the lowest-priority,
//                quietest voice if the cap is reached, or is dropped if it is the least important.
//   spatial      each world sound is attenuated by distance from the camera target and panned by
//                where it is relative to the camera's right-hand side.
//   no clipping  voices -> master gain -> compressor -> soft limiter, so the output is bounded to
//                +/-1.0 however many shells land at once.
//
// The AudioContext is created by init(), which must be called from a user gesture (first click).
// Pass { ctx } to render into an OfflineAudioContext for tests.
export const MAX_VOICES = 24, LIMIT_KNEE = 0.7;
const PRIO = { ui: 9, klaxon: 9, a10: 8, big: 7, explosion: 6, cannon: 5, rocket: 4, laser: 3, rifle: 2 };
// minimum seconds between two sounds of the same kind (stops identical sounds stacking in one tick)
const GAP = { rifle: 0.045, gatling: 0.06, cannon: 0.05, rocket: 0.05, explosion: 0.04, big: 0.3, laser: 0.07, whoosh: 0.07, gau8: 1.5, flyby: 2, click: 0.07, order: 0.1, ping: 0.4, klaxon: 4 };

export class AudioEngine {
  constructor(opts = {}) {
    this.ctx = opts.ctx || null; this.volume = opts.volume ?? 0.7; this.muted = false; this.ready = false;
    this.voices = []; this.last = {}; this.lx = 0; this.lz = 0; this.ldist = 90; this.yaw = 0;
    this.stats = { played: 0, stolen: 0, dropped: 0, gapped: 0, inaudible: 0, peakVoices: 0 };
    let s = 1234; this.rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
    if (this.ctx) this._build();
  }
  // Create the context and master chain. Safe to call repeatedly; only the first call does work.
  init() {
    if (this.ready) { if (this.ctx.state === 'suspended' && this.ctx.resume) this.ctx.resume(); return true; }
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return false;
    try { this.ctx = new AC(); this._build(); } catch (e) { return false; }
    return true;
  }
  _build() {
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : this.volume;
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -16; this.comp.knee.value = 12; this.comp.ratio.value = 14; this.comp.attack.value = 0.002; this.comp.release.value = 0.22;
    this.limit = c.createWaveShaper();   // soft limiter: transparent below the knee, and the output can never exceed +/-1
    const n = 2048, curve = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1, m = Math.abs(x); curve[i] = Math.sign(x) * (m <= LIMIT_KNEE ? m : LIMIT_KNEE + (1 - LIMIT_KNEE) * Math.tanh((m - LIMIT_KNEE) / (1 - LIMIT_KNEE))); } // unity below the knee
    this.limit.curve = curve; this.limit.oversample = '2x';
    this.pre = c.createGain(); this.pre.gain.value = 0.8; // headroom so the limiter is only reached on real peaks
    this.tap = this.pre; // tests read the signal here, before the limiter
    this.master.connect(this.comp); this.comp.connect(this.pre); this.pre.connect(this.limit); this.limit.connect(c.destination);
    const len = Math.floor(c.sampleRate * 2), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = this.rnd() * 2 - 1;
    this.noise = buf; this.ready = true;
  }
  setVolume(v) { this.volume = Math.max(0, Math.min(1, v)); if (this.ready) this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.02); }
  setMuted(m) { this.muted = !!m; this.setVolume(this.volume); }
  // Camera target (x, z), camera distance and yaw: the reference point for attenuation and panning.
  setListener(x, z, dist, yaw) { this.lx = x; this.lz = z; this.ldist = dist; this.yaw = yaw || 0; }
  activeVoices() { const t = this.ctx.currentTime; let n = 0; for (const v of this.voices) if (v.end > t) n++; return n; }

  // ---- voice allocation --------------------------------------------------
  // Returns { out, t } to build a sound into, or null if it was dropped. `dur` is its full length.
  _voice(kind, prio, gain, pan, dur) {
    if (!this.ready) return null;
    const c = this.ctx, t = c.currentTime;
    const gap = GAP[kind]; if (gap && t - (this.last[kind] ?? -9) < gap) { this.stats.gapped++; return null; }
    let live = 0; for (let i = this.voices.length - 1; i >= 0; i--) { if (this.voices[i].end <= t) this.voices.splice(i, 1); else live++; }
    if (live >= MAX_VOICES) {
      let w = null; for (const v of this.voices) if (!w || v.prio < w.prio || (v.prio === w.prio && v.gain < w.gain)) w = v;
      if (!w || w.prio > prio || (w.prio === prio && w.gain >= gain)) { this.stats.dropped++; return null; }
      w.g.gain.cancelScheduledValues(t); w.g.gain.setTargetAtTime(0, t, 0.006); w.end = t; // steal: fade the loser out in ~20 ms
      for (const n of w.nodes) { try { n.stop(t + 0.03); } catch (e) { /* already stopped */ } }
      this.voices.splice(this.voices.indexOf(w), 1); this.stats.stolen++;
    }
    const g = c.createGain(); g.gain.value = gain;
    let out = g;
    if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p); p.connect(this.master); } else g.connect(this.master);
    const v = { kind, prio, gain, g, end: t + dur, nodes: [] };
    this.voices.push(v); this.last[kind] = t; this.stats.played++;
    const n = this.voices.length; if (n > this.stats.peakVoices) this.stats.peakVoices = n;
    return { out, t, v };
  }
  // Distance attenuation and pan for a world position. Returns null when it would be inaudible.
  spatial(x, z) {
    const dx = x - this.lx, dz = z - this.lz, d = Math.hypot(dx, dz), ref = 55 + this.ldist * 0.6;
    const gain = 1 / (1 + (d / ref) * (d / ref));
    if (gain < 0.03) return null;
    const right = dx * Math.cos(this.yaw) - dz * Math.sin(this.yaw);
    return { gain, pan: Math.max(-1, Math.min(1, right / (ref * 1.1))) };
  }
  _world(kind, prio, x, z, level, dur) {
    const s = this.spatial(x, z); if (!s) { this.stats.inaudible++; return null; }
    return this._voice(kind, prio, level * s.gain, s.pan, dur);
  }
  // ---- building blocks ---------------------------------------------------
  _osc(h, type, f0, f1, t0, dur, peak, attack = 0.004) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain(); o.type = type;
    o.frequency.setValueAtTime(f0, t0); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(peak, t0 + attack); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(h.out); o.start(t0); o.stop(t0 + dur + 0.02); h.v.nodes.push(o); return o;
  }
  _noise(h, ftype, f0, f1, q, t0, dur, peak, attack = 0.003, rate = 1) {
    const c = this.ctx, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = this.noise; src.loop = true; src.playbackRate.value = rate; f.type = ftype; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t0); if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(peak, t0 + attack); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(h.out); src.start(t0, this.rnd() * 1.5); src.stop(t0 + dur + 0.02); h.v.nodes.push(src); return src;
  }
  // Debris / secondary crackle: sparse random pops of band-passed noise, fading out.
  _crackle(h, t0, dur, peak) {
    const c = this.ctx, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(), n = Math.max(8, Math.floor(dur * 46)), curve = new Float32Array(n);
    for (let i = 0; i < n; i++) curve[i] = (this.rnd() < 0.36 ? peak * (0.3 + this.rnd() * 0.7) : 0.0001) * (1 - i / n);
    curve[n - 1] = 0.0001;
    src.buffer = this.noise; src.loop = true; f.type = 'bandpass'; f.frequency.value = 2600 + this.rnd() * 1500; f.Q.value = 0.9;
    g.gain.setValueAtTime(0.0001, t0); g.gain.setValueCurveAtTime(curve, t0 + 0.001, dur);
    src.connect(f); f.connect(g); g.connect(h.out); src.start(t0, this.rnd() * 1.5); src.stop(t0 + dur + 0.03); h.v.nodes.push(src);
  }
  // ---- weapons and explosions -------------------------------------------
  // Tank gun: sine pitch-drop thump + low-passed noise blast + short crackle tail.
  cannon(x, z, size = 1) {
    const h = this._world('cannon', PRIO.cannon, x, z, 0.5 * size, 0.75); if (!h) return false;
    const k = 0.92 + this.rnd() * 0.16;
    this._osc(h, 'sine', 118 * k, 36, h.t, 0.42, 1.0); this._noise(h, 'lowpass', 2100, 240, 0.7, h.t, 0.34, 0.8); this._crackle(h, h.t + 0.08, 0.5, 0.16);
    return true;
  }
  // Rocket / missile launch: rising hiss.
  rocket(x, z) {
    const h = this._world('rocket', PRIO.rocket, x, z, 0.34, 0.6); if (!h) return false;
    this._noise(h, 'bandpass', 520 + this.rnd() * 200, 2800, 1.1, h.t, 0.52, 0.9, 0.03); this._osc(h, 'sine', 150, 70, h.t, 0.2, 0.4);
    return true;
  }
  // Shell or rocket impact. size 1 = tank shell, 2 = artillery, 3+ = fuel-air / building collapse.
  explosion(x, z, size = 1) {
    const big = size >= 2.6, kind = big ? 'big' : 'explosion';
    const h = this._world(kind, big ? PRIO.big : PRIO.explosion, x, z, Math.min(0.85, 0.42 + 0.14 * size), 0.9 + 0.5 * size); if (!h) return false;
    const k = 0.9 + this.rnd() * 0.2, d = 0.5 + 0.28 * size;
    this._osc(h, 'sine', (92 - 12 * Math.min(3, size)) * k, 24, h.t, d, 1.0); this._osc(h, 'triangle', 46 * k, 20, h.t, d * 1.2, 0.5);
    this._noise(h, 'lowpass', 1300 + 300 * size, 110, 0.6, h.t, d * 1.1, 0.9); this._crackle(h, h.t + 0.1, 0.5 + 0.35 * size, 0.2);
    return true;
  }
  // Small arms: a crisp band-passed noise snap; centre frequency and rate vary per shot.
  rifle(x, z, heavy = false) {
    const h = this._world(heavy ? 'gatling' : 'rifle', PRIO.rifle, x, z, heavy ? 0.2 : 0.24, 0.12); if (!h) return false;
    const fc = (heavy ? 1300 : 2100) + this.rnd() * 1400;
    this._noise(h, 'bandpass', fc, fc * 0.8, 1.3, h.t, 0.07 + this.rnd() * 0.03, 1.0, 0.001, 0.85 + this.rnd() * 0.4);
    return true;
  }
  laser(x, z) {
    const h = this._world('laser', PRIO.laser, x, z, 0.2, 0.2); if (!h) return false;
    this._osc(h, 'sawtooth', 1900 + this.rnd() * 300, 520, h.t, 0.16, 0.7, 0.002); return true;
  }
  // ---- A-10 pass ----------------------------------------------------------
  // Turbine flyby with a Doppler sweep: whine and roar fall in pitch as the jet passes over.
  flyby(x, z, secs = 5.5) {
    const h = this._world('flyby', PRIO.a10, x, z, 0.5, secs + 0.2); if (!h) return false;
    const c = this.ctx, t = h.t, mid = t + secs * 0.5;
    const env = c.createGain(); env.gain.setValueAtTime(0.0001, t); env.gain.exponentialRampToValueAtTime(1, mid); env.gain.exponentialRampToValueAtTime(0.0001, t + secs); env.connect(h.out);
    const sub = { out: env, t, v: h.v };
    for (const [type, f, lvl] of [['sawtooth', 190, 0.22], ['sawtooth', 287, 0.12], ['sine', 2350, 0.07]]) {
      const o = c.createOscillator(), g = c.createGain(); o.type = type; g.gain.value = lvl;
      o.frequency.setValueAtTime(f * 1.24, t); o.frequency.setValueAtTime(f * 1.24, mid - 0.7); o.frequency.exponentialRampToValueAtTime(f * 0.8, mid + 0.7); // Doppler shift at the overhead point
      o.connect(g); g.connect(env); o.start(t); o.stop(t + secs + 0.05); h.v.nodes.push(o);
    }
    const src = this._noise(sub, 'bandpass', 1500, 520, 0.6, t, secs, 0.8, secs * 0.5); void src;
    return true;
  }
  // GAU-8: ~65 rounds a second is a buzz, not separate shots.
  gau8(x, z, secs = 0.8) {
    const h = this._world('gau8', PRIO.a10, x, z, 0.6, secs + 0.5); if (!h) return false;
    const c = this.ctx, t = h.t, o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(64, t); o.frequency.linearRampToValueAtTime(70, t + secs); f.type = 'lowpass'; f.frequency.value = 1100; f.Q.value = 2;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1, t + 0.03); g.gain.setValueAtTime(1, t + secs); g.gain.exponentialRampToValueAtTime(0.0001, t + secs + 0.12);
    o.connect(f); f.connect(g); g.connect(h.out); o.start(t); o.stop(t + secs + 0.2); h.v.nodes.push(o);
    this._noise(h, 'bandpass', 900, 700, 0.8, t, secs + 0.1, 0.5, 0.02); this._noise(h, 'lowpass', 500, 120, 0.7, t + secs, 0.45, 0.35, 0.02); // muzzle blast, then the echo
    return true;
  }
  whoosh(x, z) {
    const h = this._world('whoosh', PRIO.rocket, x, z, 0.36, 0.7); if (!h) return false;
    this._noise(h, 'bandpass', 2600, 420, 1.4, h.t, 0.62, 0.9, 0.04); return true;
  }
  // ---- radio and interface (not spatial) -----------------------------------
  // Radio squelch: a key click, a short carrier blip, a tail of static.
  click() {
    const h = this._voice('click', PRIO.ui, 0.2, 0, 0.16); if (!h) return false;
    this._noise(h, 'highpass', 2400, 2400, 0.7, h.t, 0.03, 1.0, 0.001); this._osc(h, 'square', 1240, 1240, h.t + 0.012, 0.04, 0.25, 0.002); this._noise(h, 'bandpass', 3200, 3000, 2, h.t + 0.05, 0.09, 0.3, 0.004);
    return true;
  }
  order() {
    const h = this._voice('order', PRIO.ui, 0.22, 0, 0.26); if (!h) return false;
    this._noise(h, 'highpass', 2600, 2600, 0.7, h.t, 0.025, 0.9, 0.001); this._osc(h, 'square', 980, 980, h.t + 0.02, 0.05, 0.22, 0.002); this._osc(h, 'square', 1470, 1470, h.t + 0.09, 0.05, 0.22, 0.002); this._noise(h, 'bandpass', 3000, 2800, 2, h.t + 0.15, 0.1, 0.28, 0.004);
    return true;
  }
  // Sonar / radar ping: a decaying tone and one quieter echo.
  ping() {
    const h = this._voice('ping', PRIO.ui, 0.3, 0, 1.5); if (!h) return false;
    this._osc(h, 'sine', 1180, 1150, h.t, 0.9, 1.0, 0.004); this._osc(h, 'sine', 1180, 1150, h.t + 0.33, 0.9, 0.3, 0.004); this._osc(h, 'sine', 2360, 2300, h.t, 0.3, 0.2, 0.004);
    return true;
  }
  // Two-tone alarm for "base under attack" and "low power".
  klaxon() {
    const h = this._voice('klaxon', PRIO.klaxon, 0.3, 0, 1.6); if (!h) return false;
    const c = this.ctx, o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain(); o.type = 'sawtooth'; f.type = 'lowpass'; f.frequency.value = 1500;
    for (let i = 0; i < 6; i++) o.frequency.setValueAtTime(i % 2 ? 392 : 523, h.t + i * 0.25);
    g.gain.setValueAtTime(0.0001, h.t); g.gain.exponentialRampToValueAtTime(1, h.t + 0.02); g.gain.setValueAtTime(1, h.t + 1.45); g.gain.exponentialRampToValueAtTime(0.0001, h.t + 1.55);
    o.connect(f); f.connect(g); g.connect(h.out); o.start(h.t); o.stop(h.t + 1.6); h.v.nodes.push(o);
    return true;
  }

  // ---- sim events -> sounds. `hear(e)` is the caller's fog test: no sound from where you cannot see.
  handleEvents(events, hear, weaponCd) {
    if (!this.ready || this.muted) return;
    for (const e of events) {
      switch (e.t) {
        case 'tracer': if (hear(e)) this.rifle(e.x, e.z, weaponCd && weaponCd(e.w) <= 4); break;
        case 'laser': if (hear(e)) this.laser(e.x, e.z); break;
        case 'fire': if (hear(e)) { if (e.k === 'shell' || e.k === 'arc') this.cannon(e.x, e.z, e.k === 'arc' ? 1.2 : 1); else this.rocket(e.x, e.z); } break;
        case 'impact': if (hear(e)) this.explosion(e.x, e.z, e.k === 'arc' ? 1.6 : 1); break;
        case 'shellhit': if (hear(e)) this.explosion(e.x, e.z, 2); break;
        case 'rockethit': if (hear(e)) this.explosion(e.x, e.z, 1.8); break;
        case 'rocketfire': if (hear(e)) this.whoosh(e.x, e.z); break;
        case 'strafe': if (hear(e)) this.gau8(e.x, e.z); break;
        case 'fab': if (hear(e)) this.explosion(e.x, e.z, 3.4); break;
        case 'nuke': this.explosion(e.x, e.z, hear(e) ? 5 : 2.2); break;                   // a nuclear blast is heard across the map, fogged or not
        case 'scudhit': if (hear(e)) this.explosion(e.x, e.z, 2.2); break;
        case 'pbeam': if (e.k % 6 === 0 && hear(e)) this.laser(e.x, e.z); break;
        case 'superlaunch': this.klaxon(); break;                                              // public warning for both sides
        case 'superbuilt': this.ping(); break;
        case 'emp': if (hear(e)) { this.explosion(e.x, e.z, 2.6); this.laser(e.x, e.z); } break;
        case 'power': if (e.id === 'a10' && hear(e)) this.flyby(e.x, e.z); break;
        case 'die': if (hear(e) && !e.inf) this.explosion(e.x, e.z, e.kind === 'bldg' ? 3 : 1.5); break;
      }
    }
  }
}
