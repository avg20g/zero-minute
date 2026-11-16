// Turns a sweep (balance/runs/*.jsonl) into a Markdown balance report.
//   node balance/report.mjs                 newest run -> balance/report.md
//   node balance/report.mjs path/to/run.jsonl [out.md]
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { LOADOUTS, loadout, UNITS, BLDGS, FACTIONS, POWERS, MAX_TICKS } from './match.mjs';
import { trainsOf, nodePower } from '../js/sim/factionRegistry.js';

const pct = (n, d) => (d ? Math.round(100 * n / d) + '%' : '-');
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const table = (head, rows) => ['| ' + head.join(' | ') + ' |', '|' + head.map(() => '---').join('|') + '|', ...rows.map(r => '| ' + r.join(' | ') + ' |')].join('\n');
const short = (id) => (loadout(id).general ? id : FACTIONS[id].name.split(' ').map(w => w[0]).join('') + ' base');

// What a loadout is able to train and cast, from the registry (public rules).
function available(L) {
  const T = { faction: L.faction, general: L.general }, units = new Set(), powers = new Set();
  for (const b of Object.keys(BLDGS)) if (BLDGS[b].faction === L.faction) { for (const u of trainsOf(T, b)) units.add(u); if (BLDGS[b].superPower) powers.add(BLDGS[b].superPower); }
  for (const n of FACTIONS[L.faction].tree) if (n.power) powers.add(nodePower(T, n));
  return { units: [...units], powers: [...powers] };
}

export function buildReport(matches) {
  const ids = LOADOUTS.map(l => l.id).filter(id => matches.some(m => m.a === id || m.b === id));
  const S = Object.fromEntries(ids.map(id => [id, { games: 0, wins: 0, losses: 0, draws: 0, winLen: [], earned: [], idle: [], lostVal: 0, killedVal: 0, built: {}, lost: {}, builtW: {}, builtL: {}, nW: 0, nL: 0, powers: {}, upgrades: {}, supers: 0, sideGames: 0 }]));
  const pair = {}, maps = {}; const lens = []; let draws = 0;
  for (const m of matches) {
    const mp = (maps[m.map] ||= { games: 0, p0: 0, p1: 0, draws: 0, mirror: 0, mirror0: 0, mirror1: 0 });
    mp.games++; if (m.winner === 0) mp.p0++; else if (m.winner === 1) mp.p1++; else mp.draws++;
    if (m.a === m.b) { mp.mirror++; if (m.winner === 0) mp.mirror0++; else if (m.winner === 1) mp.mirror1++; }
    if (m.winner < 0) draws++; else lens.push(m.ticks / 1200);
    for (let i = 0; i < 2; i++) {
      const me = m.sides[i], foe = m.sides[1 - i], s = S[me.loadout];
      s.sideGames++; s.earned.push(me.earned); s.idle.push(me.idleMoney); s.lostVal += me.valueLost; s.killedVal += foe.valueLost; s.supers += me.supers;
      const won = m.winner === i, lostIt = m.winner === 1 - i;
      if (won) s.nW++; else if (lostIt) s.nL++;
      for (const [k, n] of Object.entries(me.built)) { s.built[k] = (s.built[k] || 0) + n; if (won) s.builtW[k] = (s.builtW[k] || 0) + n; else if (lostIt) s.builtL[k] = (s.builtL[k] || 0) + n; }
      for (const [k, n] of Object.entries(me.lost)) s.lost[k] = (s.lost[k] || 0) + n;
      for (const [k, n] of Object.entries(me.powers)) s.powers[k] = (s.powers[k] || 0) + n;
      for (const [k, n] of Object.entries(me.upgrades)) s.upgrades[k] = (s.upgrades[k] || 0) + n;
    }
    if (m.a !== m.b) { // mirrors say nothing about which loadout is stronger
      const p = (pair[m.a + '>' + m.b] ||= { w: 0, l: 0, d: 0 }), q = (pair[m.b + '>' + m.a] ||= { w: 0, l: 0, d: 0 });
      for (const [id, i] of [[m.a, 0], [m.b, 1]]) { const s = S[id]; s.games++; if (m.winner === i) { s.wins++; s.winLen.push(m.ticks / 1200); } else if (m.winner < 0) s.draws++; else s.losses++; }
      if (m.winner === 0) { p.w++; q.l++; } else if (m.winner === 1) { p.l++; q.w++; } else { p.d++; q.d++; }
    }
  }
  const rate = (id) => { const s = S[id]; return s.wins + s.losses ? s.wins / (s.wins + s.losses) : 0.5; };
  const out = [], flags = [];
  const d0 = matches[0];
  out.push('# Zero Minute balance report', '', `${matches.length} matches, ${d0 ? d0.difficulty : '?'} v ${d0 ? d0.difficulty : '?'} AI, maps: ${Object.keys(maps).join(', ')}. Draw = no winner after ${Math.round(MAX_TICKS / 1200)} minutes. Win rates leave out mirror matches and draws.`, '');

  out.push('## Loadouts', '');
  out.push(table(['Loadout', 'Games', 'Win rate', 'W', 'L', 'Draws', 'Avg win (min)', 'Value killed / lost', 'Earned', 'Idle money'],
    [...ids].sort((a, b) => rate(b) - rate(a)).map(id => { const s = S[id]; return [loadout(id).label, s.games, pct(s.wins, s.wins + s.losses), s.wins, s.losses, s.draws, s.winLen.length ? avg(s.winLen).toFixed(1) : '-', s.lostVal ? (s.killedVal / s.lostVal).toFixed(2) : '-', Math.round(avg(s.earned)), Math.round(avg(s.idle))]; })), '');
  for (const id of ids) { const s = S[id], n = s.wins + s.losses, r = rate(id); if (n >= 8 && (r > 0.6 || r < 0.4)) flags.push(`**${loadout(id).label}** wins ${pct(s.wins, n)} of decided games (target 40-60%).`); }

  out.push('## Pairings', '', 'Row loadout\'s win rate against the column loadout (both start positions combined; draws shown after a slash).', '');
  out.push(table(['', ...ids.map(short)], ids.map(a => [short(a), ...ids.map(b => { if (a === b) return '·'; const p = pair[a + '>' + b]; if (!p) return ''; return pct(p.w, p.w + p.l) + (p.d ? ' /' + p.d + 'd' : ''); })])), '');
  for (const a of ids) for (const b of ids) { const p = pair[a + '>' + b]; if (a < b && p && p.w + p.l >= 4) { const r = p.w / (p.w + p.l); if (r >= 0.8 || r <= 0.2) flags.push(`${short(r > 0.5 ? a : b)} beats ${short(r > 0.5 ? b : a)} ${Math.max(p.w, p.l)}-${Math.min(p.w, p.l)} (target no worse than about 70/30).`); } }

  out.push('## Maps and start positions', '');
  out.push(table(['Map', 'Games', 'Start 1 wins', 'Start 2 wins', 'Draws', 'Mirror matches: start 1 / start 2'],
    Object.entries(maps).map(([k, m]) => [k, m.games, pct(m.p0, m.p0 + m.p1), pct(m.p1, m.p0 + m.p1), m.draws, `${m.mirror0} / ${m.mirror1} of ${m.mirror}`])), '');
  for (const [k, m] of Object.entries(maps)) { const n = m.p0 + m.p1, r = n ? m.p0 / n : 0.5; if (n >= 20 && Math.abs(r - 0.5) > 0.05) flags.push(`Map **${k}** favours start ${r > 0.5 ? 1 : 2}: ${pct(Math.max(m.p0, m.p1), n)} of decided games (target within 5 points of even).`); }

  lens.sort((a, b) => a - b); const q = (f) => (lens.length ? lens[Math.min(lens.length - 1, Math.floor(lens.length * f))].toFixed(1) : '-');
  out.push('## Match length', '', `Decided matches: shortest ${q(0)} min, quarter ${q(0.25)}, median ${q(0.5)}, three-quarter ${q(0.75)}, longest ${q(0.999)}. Draws: ${draws} of ${matches.length} (${pct(draws, matches.length)}).`, '');
  if (matches.length >= 20 && draws / matches.length > 0.1) flags.push(`${pct(draws, matches.length)} of matches end in a draw at 25 minutes.`);

  out.push('## Units', '', 'Per loadout: how many of each unit the AI built per game, the share that died, and how much more of it was built in wins than in losses.', '');
  for (const id of ids) {
    const s = S[id], av = available(loadout(id)), g = s.sideGames || 1;
    const all = [...new Set([...av.units, ...Object.keys(s.built)])].filter(u => UNITS[u]);
    const rows = all.sort((a, b) => (s.built[b] || 0) - (s.built[a] || 0)).map(u => {
      const n = s.built[u] || 0, w = s.nW ? (s.builtW[u] || 0) / s.nW : 0, l = s.nL ? (s.builtL[u] || 0) / s.nL : 0;
      return [UNITS[u].name, UNITS[u].cost ?? '-', (n / g).toFixed(1), n ? pct(Math.min(s.lost[u] || 0, n), n) : '-', s.nW && s.nL ? w.toFixed(1) + ' / ' + l.toFixed(1) : '-'];
    });
    out.push(`### ${loadout(id).label}`, '', table(['Unit', 'Cost', 'Built per game', 'Died', 'Built in wins / losses'], rows), '');
    const never = av.units.filter(u => !s.built[u] && !UNITS[u].builder && !UNITS[u].harvester);
    if (never.length) flags.push(`${short(id)}: the AI never built ${never.map(u => UNITS[u].name).join(', ')}.`);
    const pw = av.powers.map(p => `${POWERS[p] ? POWERS[p].name || p : p} ${((s.powers[p] || 0) / g).toFixed(1)}`).join(', ');
    out.push(`Powers used per game: ${pw || 'none'}. Superweapon launches per game: ${(s.supers / g).toFixed(2)}.`, '');
    const unused = av.powers.filter(p => !s.powers[p]);
    if (unused.length) flags.push(`${short(id)}: never used ${unused.map(p => (POWERS[p] && POWERS[p].name) || p).join(', ')}.`);
  }

  const head = out.splice(0, 3);
  return [...head, '', '## Outliers', '', flags.length ? flags.map(f => '- ' + f).join('\n') : 'None: every target is met.', '', ...out].join('\n') + '\n';
}

export const readRun = (file) => readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const here = dirname(fileURLToPath(import.meta.url));
  let file = process.argv[2];
  if (!file) { const runs = readdirSync(join(here, 'runs')).filter(f => f.endsWith('.jsonl')).sort(); if (!runs.length) throw new Error('no runs yet: node balance/run.mjs'); file = join(here, 'runs', runs[runs.length - 1]); }
  const outFile = process.argv[3] || join(here, 'report.md');
  writeFileSync(outFile, buildReport(readRun(file)));
  console.log(`report for ${file} -> ${outFile}`);
}
