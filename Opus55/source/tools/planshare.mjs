// Frame shares of the land-use plan (I-016) for a pose set: the share of each frame whose first terrain hit lies on
// plan land, per site (Lantern Park, Silk Road Garden, the Exchange: infill blocks, streets, squares, quay and
// avenues), and the distance of the nearest such ground. Terrain only (buildings, trees and water are ignored as
// occluders; rays that hit water count as water), real camera maths, one ray every 8 pixels at 2560x1440.
//   node tools/planshare.mjs --poses-file ../eval/poses-v1.json [--ids A1,G2] [--file out/dev.html]
import fs from 'node:fs';
import path from 'node:path';
import { launch, root } from './launch.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const set = JSON.parse(fs.readFileSync(path.resolve(root, opt('poses-file', '../eval/poses-v1.json')), 'utf8'));
const only = (opt('ids', '') || '').split(',').filter(Boolean);
const W = 2560, H = 1440, STEP = 8;
const { page, close } = await launch({ file: opt('file', 'out/dev.html'), profileName: opt('profile', 'opus55-I016-share'), query: `w=${W}&h=${H}&noadapt&nooverlay&freeze&quality=high` });
const rows = [];
for (const p of set) {
  if (only.length && !only.includes(p.id)) continue;
  await page.evaluate((q) => {
    const w = window.__ctx.world;
    const y = q.rel ? w.heightAt(q.pos[0], q.pos[2]) + q.pos[1] : q.pos[1];
    const dx = q.target[0] - q.pos[0], dy = q.target[1] - y, dz = q.target[2] - q.pos[2];
    window.__ctx.time = q.t;
    window.__setCam(q.pos[0], y, q.pos[2], Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz)));
  }, p);
  await page.evaluate(() => window.__frames(3));
  const r = await page.evaluate((a) => {
    const [Wd, Hd, st] = a;
    const ctx = window.__ctx, w = ctx.world, plan = w.plan;
    // camera basis as in renderer.js (forward, right, up = right x forward) and the vertical field of view
    const cm = ctx.cam, cy = Math.cos(cm.yaw), sy = Math.sin(cm.yaw), cp = Math.cos(cm.pitch), sp = Math.sin(cm.pitch);
    const F = [-sy * cp, sp, -cy * cp], Rr = [cy, 0, -sy], U = [-Rr[2] * F[1], Rr[2] * F[0] - Rr[0] * F[2], Rr[0] * F[1]];
    const th = Math.tan(cm.fov / 2), asp = Wd / Hd;
    const cam = ctx.cam;
    const c = { lantern: 0, silk: 0, exchange: 0 };
    let n = 0, nearest = 1e9;
    for (let py = st / 2; py < Hd; py += st) for (let px = st / 2; px < Wd; px += st) {
      n++;
      const nx = px / Wd * 2 - 1, ny = 1 - py / Hd * 2;
      let dx = F[0] + Rr[0] * nx * th * asp + U[0] * ny * th, dy = F[1] + Rr[1] * nx * th * asp + U[1] * ny * th, dz = F[2] + Rr[2] * nx * th * asp + U[2] * ny * th;
      const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
      let t = 0.5, hit = null;
      while (t < 7000) {
        const x = cam.x + dx * t, y = cam.y + dy * t, z = cam.z + dz * t;
        if (y < Math.max(w.heightAt(x, z), 0)) { hit = [x, z, t]; break; }
        t += Math.max(0.5, t * 0.004);
      }
      if (!hit || w.heightAt(hit[0], hit[1]) < 0) continue;
      const cv = plan.coverAt(hit[0], hit[1]);
      let k = null;
      if (cv.park > 0.5 && cv.style === 1) k = 'lantern';
      else if (cv.park > 0.5 && cv.style === 2) k = 'silk';
      else if (cv.park > 0.5 || cv.built > 0.5) k = 'exchange';
      if (!k) continue;
      c[k]++;
      nearest = Math.min(nearest, hit[2]);
    }
    return { lantern: c.lantern / n, silk: c.silk / n, exchange: c.exchange / n, nearest };
  }, [W, H, STEP]);
  const pc = (v) => (v * 100).toFixed(2) + '%';
  rows.push(`| ${p.id} | ${pc(r.lantern)} | ${pc(r.silk)} | ${pc(r.exchange)} | ${r.nearest < 1e9 ? Math.round(r.nearest) + ' m' : 'none'} |`);
  console.log(rows[rows.length - 1]);
}
console.log('\n| Pose | Lantern Park | Silk Road Garden | Exchange (blocks, streets, squares, quay, avenues) | Nearest plan ground |\n|---|---|---|---|---|\n' + rows.join('\n'));
await close();
