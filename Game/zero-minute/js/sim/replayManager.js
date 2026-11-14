// Deterministic replays. The simulation is a pure function of (setup, commands-per-tick), and
// the AI runs inside the simulation, so a replay only has to store the match setup and the
// PLAYER's commands with the tick each one was issued on. Feeding them back into a fresh Sim
// reproduces the match exactly; verify() proves it by comparing state hashes.
import { PLAYER } from './defs.js';
import { Sim } from './simulationTick.js';

export const REPLAY_VERSION = 1;

// Wraps sim.issue so every command from the local player is logged with its tick.
// (AI commands also pass through sim.issue; they are regenerated on playback, so they are skipped.)
export class ReplayRecorder {
  constructor(sim) {
    this.sim = sim; this.cmds = []; this.marks = [];
    const issue = sim.issue.bind(sim);
    sim.issue = (cmd) => { if ((cmd.team ?? PLAYER) === PLAYER) this.cmds.push([sim.tick, JSON.parse(JSON.stringify(cmd))]); issue(cmd); };
  }
  // Call once per simulated tick (after step) to store a sparse trail of state hashes.
  mark() { if (this.sim.tick % 200 === 0) this.marks.push([this.sim.tick, this.sim.hash()]); }
  export() { return { v: REPLAY_VERSION, setup: this.sim.setup, cmds: this.cmds, marks: this.marks, end: this.sim.tick, hash: this.sim.hash(), winner: this.sim.winner }; }
}

// Plays a recorded match. step() advances exactly one tick; the caller decides how many per frame.
export class ReplayPlayer {
  constructor(data) {
    if (!data || data.v !== REPLAY_VERSION) throw new Error('Unsupported replay');
    this.data = data; this.i = 0; this.m = 0; this.diverged = -1;
    const s = data.setup;
    this.sim = new Sim({ factions: s.factions, money: s.money, difficulty: s.difficulty, seed: s.seed, treaty: s.treaty, noSuper: s.noSuper, koth: s.koth, noEnemy: s.noEnemy, map: s.map || undefined, generals: s.generals || undefined });
    this.feed = this.sim.issue.bind(this.sim);
    this.sim.issue = (cmd) => { if ((cmd.team ?? PLAYER) !== PLAYER) this.feed(cmd); }; // the observer cannot give orders; the AI still can
  }
  get done() { return this.sim.tick >= this.data.end; }
  step() {
    if (this.done) return false;
    const c = this.data.cmds, t = this.sim.tick;
    while (this.i < c.length && c[this.i][0] <= t) this.feed(c[this.i++][1]);
    this.sim.step();
    const mk = this.data.marks;
    if (this.m < mk.length && mk[this.m][0] === this.sim.tick) { if (mk[this.m][1] !== this.sim.hash() && this.diverged < 0) this.diverged = this.sim.tick; this.m++; }
    return true;
  }
}
// Headless check: replays to the end and reports whether every checkpoint and the final state match.
export function verifyReplay(data) {
  const p = new ReplayPlayer(data);
  while (p.step()) p.sim.events.length = 0;
  return { ok: p.diverged < 0 && p.sim.hash() === data.hash, diverged: p.diverged, ticks: p.sim.tick, checkpoints: data.marks.length, finalHash: p.sim.hash() };
}
