// Balance harness core: one headless AI-versus-AI match and the telemetry taken from it.
// Reads the simulation from outside only (sim.events, sim.teams); it never changes sim state.
import { Sim } from '../js/sim/simulationTick.js';
import { UNITS, BLDGS, FACTIONS, GENERALS, POWERS } from '../js/sim/factionRegistry.js';
import { MAPS } from '../js/sim/map.js';

export const MAX_TICKS = 30000;   // 25 minutes at 20 Hz; a match still running then is a draw
export const SAMPLE = 200;        // ticks between money samples (10 s)

// Nine loadouts: each faction with no general, plus the six generals.
export const LOADOUTS = [
  ...Object.keys(FACTIONS).map(f => ({ id: f, faction: f, general: null, label: FACTIONS[f].name + ' (no general)' })),
  ...Object.keys(GENERALS).map(g => ({ id: g, faction: GENERALS[g].faction, general: g, label: FACTIONS[GENERALS[g].faction].name + ': ' + GENERALS[g].title })),
];
export const loadout = (id) => LOADOUTS.find(l => l.id === id);
export const mapSpec = (id) => { const m = MAPS.find(x => x.id === id); if (!m) throw new Error('unknown map ' + id); return m.spec; };

// Every ordered pair of loadouts on every map with every seed. Ordered, so each pairing is played from both start positions.
export function listJobs({ maps = ['canyon', 'forest'], seeds = [1, 2, 3], difficulty = 'hard', loadouts = LOADOUTS.map(l => l.id) } = {}) {
  const jobs = [];
  for (const map of maps) for (const a of loadouts) for (const b of loadouts) for (const seed of seeds) jobs.push({ a, b, map, seed, difficulty });
  return jobs;
}

const bump = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; };

export function runMatch(job) {
  const A = loadout(job.a), B = loadout(job.b);
  const sim = new Sim({ ai: 'both', difficulty: [job.difficulty, job.difficulty], factions: [A.faction, B.faction], generals: [A.general, B.general], map: mapSpec(job.map) || undefined, seed: job.seed });
  const side = () => ({ built: {}, lost: {}, bldgs: {}, bldgsLost: {}, powers: {}, upgrades: {}, supers: 0, valueLost: 0, moneySum: 0, samples: 0 });
  const tel = [side(), side()];
  let why = 'eliminated';
  while (sim.winner < 0 && sim.tick < MAX_TICKS) {
    sim.step();
    for (const e of sim.events) {
      const T = tel[e.team];
      switch (e.t) {
        case 'spawn': if (T) bump(T.built, e.type); break;
        case 'die':
          if (!T) break;
          if (e.kind === 'unit') { bump(T.lost, e.type); T.valueLost += UNITS[e.type].cost || 0; }
          else if (BLDGS[e.type] && BLDGS[e.type].faction) { bump(T.bldgsLost, e.type); T.valueLost += BLDGS[e.type].cost || 0; }
          break;
        case 'done': if (T) bump(T.bldgs, e.type); break;
        case 'power': if (T) bump(T.powers, e.id); break;
        case 'upgrade': if (T) bump(T.upgrades, e.id); break;
        case 'superlaunch': if (T) T.supers++; break;
        case 'over': if (e.why) why = e.why; break;
      }
    }
    sim.events.length = 0;
    if (sim.tick % SAMPLE === 0) for (let i = 0; i < 2; i++) { tel[i].moneySum += sim.teams[i].money; tel[i].samples++; }
  }
  const out = { ...job, winner: sim.winner, ticks: sim.tick, why: sim.winner < 0 ? 'draw' : why, hash: sim.hash(), sides: [] };
  for (let i = 0; i < 2; i++) {
    const T = sim.teams[i], t = tel[i];
    out.sides.push({ loadout: i ? job.b : job.a, earned: Math.round(T.earned), passive: Math.round(T.passive), rank: T.rank, unitsBuilt: T.built, unitsLost: T.unitsLost, unitsKilled: T.unitsKilled,
      bldgsLost: T.bldgsLost, bldgsKilled: T.bldgsKilled, powersUsed: T.powersUsed, valueLost: t.valueLost, idleMoney: t.samples ? Math.round(t.moneySum / t.samples) : 0,
      built: t.built, lost: t.lost, bldgs: t.bldgs, bldgsLostBy: t.bldgsLost, powers: t.powers, upgrades: t.upgrades, supers: t.supers });
  }
  return out;
}

export { UNITS, BLDGS, FACTIONS, GENERALS, POWERS };
