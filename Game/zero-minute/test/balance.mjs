// Balance harness check: a fixed set of six matches finishes, repeats exactly, and yields a well-formed report.
import { runMatch, LOADOUTS, listJobs, MAX_TICKS } from '../balance/match.mjs';
import { buildReport } from '../balance/report.mjs';

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) pass++; else { fail++; console.log('FAIL: ' + msg); } };

ok(LOADOUTS.length === 15, 'fifteen loadouts (5 factions + 10 generals)');
ok(listJobs().length === 15 * 15 * 2 * 3, 'default sweep is 1,350 matches');

const jobs = [['vanguard', 'redhammer'], ['redhammer', 'sandstorm'], ['sandstorm', 'vanguard'], ['airforce', 'mass'], ['wmd', 'marine'], ['cyber', 'cyber']]
  .map(([a, b], i) => ({ a, b, map: i % 2 ? 'forest' : 'canyon', seed: 1, difficulty: 'hard' }));
const first = jobs.map(runMatch), second = jobs.map(runMatch);
first.forEach((m, i) => {
  ok(m.ticks > 0 && m.ticks <= MAX_TICKS, `${m.a} v ${m.b}: finishes inside the cap`);
  ok(m.winner === -1 || m.winner === 0 || m.winner === 1, `${m.a} v ${m.b}: has a result`);
  ok(m.hash === second[i].hash && m.winner === second[i].winner && m.ticks === second[i].ticks, `${m.a} v ${m.b}: repeats exactly`);
  ok(JSON.stringify(m) === JSON.stringify(second[i]), `${m.a} v ${m.b}: telemetry repeats exactly`);
  ok(m.sides[0].loadout === m.a && m.sides[1].loadout === m.b, `${m.a} v ${m.b}: sides are labelled`);
  ok(Object.values(m.sides[0].built).reduce((x, y) => x + y, 0) > 0 && m.sides[1].earned > 0, `${m.a} v ${m.b}: both sides built and earned`);
});
const rep = buildReport(first);
for (const h of ['# Zero Minute balance report', '## Outliers', '## Loadouts', '## Pairings', '## Maps and start positions', '## Match length', '## Units'])
  ok(rep.includes(h), 'report has section ' + h);
ok(!rep.includes('undefined') && !rep.includes('NaN'), 'report has no undefined or NaN');

console.log(fail ? `BALANCE: ${fail} of ${pass + fail} checks FAILED` : `BALANCE: all ${pass} checks passed`);
process.exit(fail ? 1 : 0);
