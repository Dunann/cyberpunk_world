// Shimmer check for thin lit lines (I-016 parks): a 4-frame motion burst at each held-out camera (the camera slides
// sideways 0.6 m per frame with TAA running, as in the eval motion bursts), saved as PNG, plus the mean absolute
// frame-to-frame difference per image (levels of 255) over the lower 2/3 of the frame (the ground).
// Run it on the baseline and on the candidate with the same cameras: extra shimmer shows up as a larger
// frame-to-frame difference. --static keeps the camera still (TAA jitter only), which separates shimmer from the
// image change that motion causes in any high-contrast scene.
//   node tools/parkburst.mjs --poses-file out/i016r2/heldout.json --ids H3,H7,H10 --out out/i016r2/pb-cand [--file out/dev.html]
import fs from 'node:fs';
import path from 'node:path';
import { launch, root } from './launch.mjs';
import { readPNG } from './pixdiff.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const W = 2560, H = 1440;
const out = path.resolve(root, opt('out', 'out/parkburst'));
fs.mkdirSync(out, { recursive: true });
const set = JSON.parse(fs.readFileSync(path.resolve(root, opt('poses-file', '')), 'utf8'));
const only = (opt('ids', '') || '').split(',').filter(Boolean);
const { page, close } = await launch({ file: opt('file', 'out/dev.html'), profileName: opt('profile', 'opus55-I016'), query: `w=${W}&h=${H}&noadapt&nooverlay&freeze&quality=high` });
const res = [];
for (const p of set) {
  if (only.length && !only.includes(p.id)) continue;
  await page.evaluate((q) => {
    const w = window.__ctx.world;
    const y = q.rel ? w.heightAt(q.pos[0], q.pos[2]) + q.pos[1] : q.pos[1];
    const dx = q.target[0] - q.pos[0], dy = q.target[1] - y, dz = q.target[2] - q.pos[2];
    window.__ctx.time = q.t;
    window.__setCam(q.pos[0], y, q.pos[2], Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz)));
  }, p);
  await page.evaluate(() => window.__frames(48));
  const files = [];
  for (let k = 0; k < 4; k++) {
    if (k && !args.includes('--static')) await page.evaluate(() => { const c = window.__ctx.camOverride; c.x += Math.cos(c.yaw) * 0.6; c.z -= Math.sin(c.yaw) * 0.6; });
    await page.evaluate(() => window.__frames(1));
    const b64 = await page.evaluate(() => window.__capture('image/png'));
    const f = path.join(out, `${p.id}-burst-${k}.png`);
    fs.writeFileSync(f, Buffer.from(b64, 'base64'));
    files.push(f);
  }
  const imgs = files.map((f) => readPNG(f));
  const diffs = [];
  for (let k = 1; k < 4; k++) {
    const a = imgs[k - 1].px, b = imgs[k].px, w = imgs[k].w, h = imgs[k].h;
    let s = 0, n = 0;
    for (let y = Math.floor(h / 3); y < h; y += 2) for (let x = 0; x < w; x += 2) {
      const o = (y * w + x) * 4;
      s += (Math.abs(a[o] - b[o]) + Math.abs(a[o + 1] - b[o + 1]) + Math.abs(a[o + 2] - b[o + 2])) / 3; n++;
    }
    diffs.push(+(s / n).toFixed(2));
  }
  res.push(`${p.id}: frame-to-frame mean difference ${diffs.join(' / ')}`);
  console.log(res[res.length - 1]);
}
fs.writeFileSync(path.join(out, 'burst-diff.txt'), res.join('\n') + '\n');
await close();
