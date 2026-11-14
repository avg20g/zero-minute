// Runs a sweep of AI-versus-AI matches across worker threads and writes one JSON line per match.
//   node balance/run.mjs                       full first sweep: 9 x 9 loadouts, canyon + forest, 3 seeds, Hard v Hard
//   node balance/run.mjs --quick               9 x 9 loadouts, canyon, 1 seed
//   node balance/run.mjs --maps canyon,urban --seeds 5 --difficulty medium --out balance/runs/x.jsonl
import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listJobs, runMatch } from './match.mjs';

if (!isMainThread) {
  parentPort.on('message', (job) => parentPort.postMessage(runMatch(job)));
} else {
  const arg = (name, dflt) => { const i = process.argv.indexOf('--' + name); return i < 0 ? dflt : process.argv[i + 1]; };
  const quick = process.argv.includes('--quick');
  const maps = arg('maps', quick ? 'canyon' : 'canyon,forest').split(',');
  const nSeeds = +arg('seeds', quick ? 1 : 3);
  const difficulty = arg('difficulty', 'hard');
  const here = dirname(fileURLToPath(import.meta.url));
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  const outFile = arg('out', join(here, 'runs', stamp + '.jsonl'));
  const jobs = listJobs({ maps, seeds: Array.from({ length: nSeeds }, (_, i) => i + 1), difficulty });
  const results = new Array(jobs.length);
  const threads = Math.max(1, Math.min(+arg('threads', availableParallelism() - 1), jobs.length));
  const t0 = Date.now(); let next = 0, done = 0;
  await new Promise((resolve, reject) => {
    for (let w = 0; w < threads; w++) {
      const worker = new Worker(new URL(import.meta.url)); let cur = -1;
      const feed = () => { if (next >= jobs.length) { worker.terminate(); return; } cur = next++; worker.postMessage(jobs[cur]); };
      worker.on('message', (r) => {
        results[cur] = r; done++;
        if (done % 25 === 0 || done === jobs.length) process.stderr.write(`\r${done}/${jobs.length} matches`);
        if (done === jobs.length) resolve(); else feed();
      });
      worker.on('error', reject);
      feed();
    }
  });
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, results.map(r => JSON.stringify(r)).join('\n') + '\n');
  process.stderr.write('\n');
  console.log(`${jobs.length} matches (${difficulty}, maps ${maps.join('+')}, ${nSeeds} seed(s)) on ${threads} threads in ${((Date.now() - t0) / 1000).toFixed(1)} s -> ${outFile}`);
  process.exit(0);   // workers still waiting for a job would otherwise keep the process alive
}
