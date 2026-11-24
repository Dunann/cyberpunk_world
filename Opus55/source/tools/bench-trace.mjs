// Dev copy of bench.mjs that also logs every frame's GPU time with the fly-through time and camera position, so
// the slowest frames can be placed on the path. Not part of the evaluation (bench.mjs is unchanged).
//   node tools/bench-trace.mjs [--file out/dev.html] [--seconds 60] [--out out/trace] [--profile name]
// Writes <out>/trace.json (every frame: t, x, y, z, total and per-pass ms) and prints the report, the TAA
// p99/average ratio (TAA cost does not depend on the scene: a ratio above 1.15 points to GPU contention) and the
// slowest 1% of frames grouped into 1 s windows.
import fs from 'node:fs';
import path from 'node:path';
import { launch, root } from './launch.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const seconds = +opt('seconds', 60);
const out = path.resolve(root, opt('out', 'out/trace'));
fs.mkdirSync(out, { recursive: true });

const { page, info, close } = await launch({ file: opt('file', 'out/dev.html'), profileName: opt('profile', 'opus55-trace'), query: 'w=2560&h=1440&noadapt&nooverlay&quality=high&t=30' });
if (!/nvidia/i.test(info.vendor + info.adapter)) { console.error('ERROR: not running on the NVIDIA GPU:', info.adapter); await close(); process.exit(2); }
await page.evaluate(() => window.__flyTo(0));
await new Promise((r) => setTimeout(r, 3000));
const { rep, trace } = await page.evaluate((s) => {
  const ctx = window.__ctx;
  const done = window.__bench(s);
  const inner = ctx.prof.onFrame;
  const t0 = performance.now();
  const trace = [];
  ctx.prof.onFrame = (total, acc) => {
    inner(total, acc);
    const c = ctx.camOverride || { x: 0, y: 0, z: 0 };
    const e = { t: +((performance.now() - t0) / 1000).toFixed(3), x: Math.round(c.x), y: Math.round(c.y), z: Math.round(c.z), total: +total.toFixed(3) };
    for (const [k, v] of acc) e[k] = +v.toFixed(3);
    trace.push(e);
  };
  return done.then((r) => ({ rep: r, trace }));
}, seconds);
await close();
fs.writeFileSync(path.join(out, 'trace.json'), JSON.stringify(trace));
fs.writeFileSync(path.join(out, 'perf-report.json'), JSON.stringify(rep, null, 2));
const g = rep.gpu, taa = rep.passes.taa;
console.log(`GPU avg ${g.avg.toFixed(2)} p50 ${g.p50.toFixed(2)} p99 ${g.p99.toFixed(2)} max ${g.max.toFixed(2)}; TAA p99/avg ${(taa.p99 / taa.avg).toFixed(3)}`);
const body = trace.slice(Math.round(trace.length * 2 / seconds));
const cut = [...body].sort((a, b) => a.total - b.total)[Math.floor(body.length * 0.99)].total;
const slow = body.filter((e) => e.total >= cut);
const win = new Map();
for (const e of slow) { const k = Math.floor(e.t); const w = win.get(k) || { n: 0, max: 0, at: null }; w.n++; if (e.total > w.max) { w.max = e.total; w.at = e; } win.set(k, w); }
console.log(`slowest 1% (>= ${cut.toFixed(2)} ms): ${slow.length} frames`);
for (const [k, w] of [...win].sort((a, b) => a[0] - b[0])) {
  const e = w.at;
  const top = Object.entries(e).filter(([n]) => !['t', 'x', 'y', 'z', 'total'].includes(n)).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n, v]) => `${n} ${v}`).join(', ');
  console.log(`  t ${k}-${k + 1} s: ${w.n} frames, max ${w.max} ms at (${e.x}, ${e.y}, ${e.z}): ${top}`);
}
