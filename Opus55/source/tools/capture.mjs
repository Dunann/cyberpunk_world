// Captures verification viewpoints at full internal resolution.
//   node tools/capture.mjs [--poses 1,2,3] [--out out/shots] [--w 2560 --h 1440] [--jpg] [--burst] [--query k=v&k2=v2]
//   [--cam x,y,z,yaw,pitch[,t]] [--name file] captures one custom camera instead of the poses
//   [--poses-file ../eval/poses-v1.json] [--ids A1,B2] capture a custom pose set instead of the viewpoints
//   [--stats] also prints smoothed GPU ms per pass at each pose (scene animating for 150 frames)
//   [--profile name] Chrome profile dir name (use a unique one when several captures run at once)
import fs from 'node:fs';
import path from 'node:path';
import { launch, root } from './launch.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const W = +opt('w', 2560), H = +opt('h', 1440);
const out = path.resolve(root, opt('out', 'out/shots'));
const jpg = args.includes('--jpg');
const extra = opt('query', '');
const profileName = opt('profile', 'opus55-chrome-profile');
fs.mkdirSync(out, { recursive: true });

const { page, info, close } = await launch({ profileName, query: `w=${W}&h=${H}&noadapt&nooverlay&freeze&quality=high${extra ? '&' + extra : ''}` });
if (!/nvidia/i.test(info.vendor + info.adapter) && !args.includes('--any-gpu')) {
  console.error('ERROR: not running on the NVIDIA GPU:', info.adapter);
  await close(); process.exit(2);
}
const ext = jpg ? 'jpg' : 'png';
const type = jpg ? 'image/jpeg' : 'image/png';
const cam = opt('cam', '');
if (cam) {
  const [x, y, z, yaw, pitch, t] = cam.split(',').map(Number);
  await page.evaluate((a) => { if (!isNaN(a[5])) window.__ctx.time = a[5]; window.__setCam(a[0], a[1], a[2], a[3], a[4]); }, [x, y, z, yaw, pitch, t]);
  await page.evaluate(() => window.__frames(48));
  const b64 = await page.evaluate((ty) => window.__capture(ty), type);
  const file = path.join(out, `${opt('name', 'custom')}.${ext}`);
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
  console.log('  saved', file);
} else if (opt('poses-file', '')) {
  // custom pose set (eval harness): [{id, name, pos:[x,y,z], rel, target:[x,y,z], t}]
  const set = JSON.parse(fs.readFileSync(path.resolve(root, opt('poses-file', '')), 'utf8'));
  const only = (opt('ids', '') || '').split(',').filter(Boolean);
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
    if (args.includes('--stats')) {
      await page.evaluate(() => { window.__gpuStats(); window.__ctx.frozen = false; });
      await page.evaluate(() => window.__frames(150));
      console.log(`  ${p.id} GPU ms:`, JSON.stringify(await page.evaluate(() => window.__gpuStats())));
      await page.evaluate((t) => { window.__ctx.frozen = true; window.__ctx.time = t; }, p.t);
      await page.evaluate(() => window.__frames(8));
    }
    const b64 = await page.evaluate((ty) => window.__capture(ty), type);
    const file = path.join(out, `${p.id}-${p.name}.${ext}`);
    fs.writeFileSync(file, Buffer.from(b64, 'base64'));
    console.log('  saved', file);
  }
} else {
  const poses = await page.evaluate(() => window.__poses);
  const list = (opt('poses', '') || poses.map((_, i) => i + 1).join(',')).split(',').map((s) => +s);
  for (const n of list) {
    const p = poses[n - 1];
    if (!p) continue;
    await page.evaluate((i, t) => window.__setPose(i, t), n - 1, p.t);
    await page.evaluate(() => window.__frames(48));
    if (args.includes('--stats')) {
      await page.evaluate(() => { window.__gpuStats(); window.__ctx.frozen = false; });
      await page.evaluate(() => window.__frames(150));
      console.log(`  pose ${n} GPU ms:`, JSON.stringify(await page.evaluate(() => window.__gpuStats())));
      await page.evaluate((t) => { window.__ctx.frozen = true; window.__ctx.time = t; }, p.t);
      await page.evaluate(() => window.__frames(8));
    }
    const b64 = await page.evaluate((ty) => window.__capture(ty), type);
    const file = path.join(out, `pose${String(n).padStart(2, '0')}-${p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.${ext}`);
    fs.writeFileSync(file, Buffer.from(b64, 'base64'));
    console.log('  saved', file);
  }
}
if (args.includes('--burst')) {
  // motion burst: consecutive frames along the fly-through (checks shimmer and popping between frames)
  await page.evaluate(() => { window.__ctx.frozen = false; });
  for (const u of [0.12, 0.62]) {
    for (let k = 0; k < 4; k++) {
      await page.evaluate((v) => window.__flyTo(v), u + k * 0.0004);
      await page.evaluate((n) => window.__frames(n), k === 0 ? 30 : 1);
      const b64 = await page.evaluate(() => window.__capture('image/jpeg'));
      const file = path.join(out, `burst-u${Math.round(u * 100)}-${k}.jpg`);
      fs.writeFileSync(file, Buffer.from(b64, 'base64'));
    }
  }
  console.log('  saved burst frames');
}
const errors = await page.evaluate(() => window.__errors());
if (errors.length) console.log('GPU errors:\n ' + [...new Set(errors)].join('\n '));
await close();
