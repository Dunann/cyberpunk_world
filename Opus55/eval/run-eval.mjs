// Evaluation runner (eval v1). Runs the gates and captures the frozen pose set for one candidate build.
//   node run-eval.mjs --source <path to an Opus55/source folder> --out <output folder> [--skip-bench]
// Steps (one at a time; run only when no other GPU work is going on):
//   1. dev + production builds
//   2. capture poses-v1.json at 2560x1440 (JPEG) plus the motion bursts, with GPU stats per pose
//   3. functional checks (tools/functional.mjs)
//   4. 60 s benchmark (tools/bench.mjs), gate: GPU avg <= 11 ms, p99 <= 16.7 ms, max <= 25 ms
// Writes <out>/summary.json with gate results and per-pose GPU totals.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const source = path.resolve(opt('source', path.join(here, '../source')));
const out = path.resolve(opt('out', path.join(here, 'runs', 'latest')));
fs.mkdirSync(out, { recursive: true });
const poses = path.join(here, 'poses-v1.json');
const run = (cmd, timeout) => {
  console.log('>', cmd);
  try { return { ok: true, text: execSync(cmd, { cwd: source, encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20 }) }; }
  catch (e) { return { ok: false, text: (e.stdout || '') + (e.stderr || '') }; }
};

const summary = { source, time: new Date().toISOString(), gates: {}, poseGpuMs: {} };

const b1 = run('node build.mjs --dev', 120000), b2 = run('node build.mjs', 120000);
summary.gates.build = b1.ok && b2.ok;
if (!summary.gates.build) { console.log(b1.text, b2.text); }

const cap = run(`node tools/capture.mjs --poses-file "${poses}" --jpg --stats --profile opus55-eval --out "${out}"`, 900000);
for (const m of cap.text.matchAll(/\s([A-Z]\d) GPU ms: (\{.*\})/g)) summary.poseGpuMs[m[1]] = +JSON.parse(m[2]).total.toFixed(2);
const burst = run(`node tools/capture.mjs --poses 1 --jpg --burst --profile opus55-eval --out "${path.join(out, 'burst-tmp')}"`, 600000);
for (const f of fs.readdirSync(path.join(out, 'burst-tmp')).filter((f) => f.startsWith('burst-'))) fs.renameSync(path.join(out, 'burst-tmp', f), path.join(out, f));
fs.rmSync(path.join(out, 'burst-tmp'), { recursive: true, force: true });
summary.gates.noGpuErrors = !/GPU errors|WGSL error|pageerror/i.test(cap.text + burst.text);

const fn = run('node tools/functional.mjs', 300000);
const fm = fn.text.match(/(\d+)\/(\d+) checks passed/);
summary.functional = fm ? `${fm[1]}/${fm[2]}` : 'failed to run';
summary.gates.functional = !!fm && fm[1] === fm[2];

if (!args.includes('--skip-bench')) {
  const bn = run(`node tools/bench.mjs --out "${out}"`, 400000);
  const r = fs.existsSync(path.join(out, 'perf-report.json')) ? JSON.parse(fs.readFileSync(path.join(out, 'perf-report.json'), 'utf8')) : null;
  summary.bench = r ? { avg: +r.gpu.avg.toFixed(2), p99: +r.gpu.p99.toFixed(2), max: +r.gpu.max.toFixed(2) } : null;
  summary.gates.perf = !!r && r.gpu.avg <= 11 && r.gpu.p99 <= 16.7 && r.gpu.max <= 25;
  if (!r) console.log(bn.text);
}
summary.pass = Object.values(summary.gates).every(Boolean);
fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
process.exit(summary.pass ? 0 : 1);
