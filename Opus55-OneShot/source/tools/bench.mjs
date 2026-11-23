// Runs the scripted fly-through at 2560x1440 (High) and writes a performance report.
//   node tools/bench.mjs [--seconds 60] [--out out]
import fs from 'node:fs';
import path from 'node:path';
import { launch, root } from './launch.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const seconds = +opt('seconds', 60);
const out = path.resolve(root, opt('out', 'out'));
fs.mkdirSync(out, { recursive: true });

const { page, info, close } = await launch({ query: 'w=2560&h=1440&noadapt&nooverlay&quality=high&t=30' });
if (!/nvidia/i.test(info.vendor + info.adapter) && !args.includes('--any-gpu')) {
  console.error('ERROR: not running on the NVIDIA GPU:', info.adapter);
  await close(); process.exit(2);
}
await page.evaluate(() => window.__flyTo(0));
await new Promise((r) => setTimeout(r, 3000));
const r = await page.evaluate((s) => window.__bench(s), seconds);
await close();

const f = (x) => x.toFixed(2);
const gate = { avg: 11, p99: 16.7, max: 25 };
const pass = r.gpu.avg <= gate.avg && r.gpu.p99 <= gate.p99 && r.gpu.max <= gate.max;
const lines = [
  `# Performance report`,
  ``,
  `- Adapter: ${r.adapter}`,
  `- Resolution: ${r.resolution[0]}x${r.resolution[1]} (${r.quality} preset), scripted ${r.seconds} s fly-through, first 2 s excluded`,
  `- Point lights: ${r.lights}`,
  `- JS heap: ${f(r.heapStartMB)} MB at start, ${f(r.heapMaxMB)} MB max, ${f(r.heapEndMB)} MB at end`,
  ``,
  `| Metric (ms) | Avg | p50 | p99 | Max |`,
  `|---|---|---|---|---|`,
  `| GPU time (timestamp queries, sum of passes) | ${f(r.gpu.avg)} | ${f(r.gpu.p50)} | ${f(r.gpu.p99)} | ${f(r.gpu.max)} |`,
  `| Frame interval (requestAnimationFrame) | ${f(r.frame.avg)} | ${f(r.frame.p50)} | ${f(r.frame.p99)} | ${f(r.frame.max)} |`,
  ``,
  `Gate: GPU avg <= ${gate.avg} ms, p99 <= ${gate.p99} ms, max <= ${gate.max} ms -> **${pass ? 'PASS' : 'FAIL'}**`,
  ``,
  `| Pass | Avg ms | p99 ms | Max ms |`,
  `|---|---|---|---|`,
  ...Object.entries(r.passes).sort((a, b) => b[1].avg - a[1].avg).map(([k, v]) => `| ${k} | ${f(v.avg)} | ${f(v.p99)} | ${f(v.max)} |`),
  ``,
  r.errors.length ? `WebGPU errors: ${[...new Set(r.errors)].join('; ')}` : 'No WebGPU errors.',
];
fs.writeFileSync(path.join(out, 'perf-report.md'), lines.join('\n') + '\n');
fs.writeFileSync(path.join(out, 'perf-report.json'), JSON.stringify(r, null, 2));
console.log(lines.join('\n'));
process.exit(pass ? 0 : 1);
