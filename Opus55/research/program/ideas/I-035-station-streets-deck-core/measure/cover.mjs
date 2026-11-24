// Coverage of the I-035 geometry at every eval pose (640x360, f = 310.5 px, occluded by parts, signs, transit, terrain).
//   node cover.mjs [--no-signs] [--png A4,B2] [--only yuzhong|cbd]
import fs from 'node:fs';
import { Frame, camera, drawWorld, savePPM, W, H, ground } from './raster.mjs';
import { yuzhong, cbd, out, stats } from './geom.mjs';
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const report = {};
const only = opt('only', '');
if (only !== 'cbd') yuzhong(report);
if (only !== 'yuzhong') cbd(report, +opt('dfc', 0.45));
// app viewpoint clearance (world.js POSES): nothing within 15 m of the camera, and a 6 m radius around the view ray
// from the camera to 85% of the way to its target
const APP = [[[200, 325, 2400], [568, 205, 1478]], [[2080, 8, -880], [3051, 187, -725]], [[-1162, 148.8, -255], [-1058, 98, -568]], [[-991.7, 141, -752], [-1027.9, 142, -766.6]],
  [[2950, 280, -820], [3450, 220, -1550]], [[-588, 2.5, 670], [-609, 46, 464]], [[-1177.5, 52.8, 889.5], [-903, 78, 473]]];
const segDist = (p, a, b) => { const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]]; const t = Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / (ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2))); return Math.hypot(ap[0] - t * ab[0], ap[1] - t * ab[1], ap[2] - t * ab[2]); };
let removed = 0;
const boxes = out.filter((b) => {
  const r = Math.hypot(b.hw, b.hd);
  const c = [b.x, (b.y0 + b.y1) / 2, b.z], rr = r + (b.y1 - b.y0) / 2;
  for (const [cam, tgt] of APP) {
    if (Math.hypot(c[0] - cam[0], c[1] - cam[1], c[2] - cam[2]) - rr < 15) { removed++; return false; }
    const end = cam.map((v, i) => v + (tgt[i] - v) * 0.85);
    if (segDist(c, cam, end) - rr < 6 && Math.hypot(c[0] - cam[0], c[2] - cam[2]) < 400) {
      // refine: test 9 sample points of the box against the ray
      let hit = false; const ca = Math.cos(b.a), sa = Math.sin(b.a);
      for (const u of [-1, 0, 1]) for (const v of [-1, 0, 1]) for (const y of [b.y0, b.y1]) { const p = [b.x + u * b.hw * ca - v * b.hd * sa, y, b.z + u * b.hw * sa + v * b.hd * ca]; if (segDist(p, cam, end) < 6) hit = true; }
      if (hit) { removed++; return false; }
    }
  }
  return true;
});
report.removedByClearance = removed;
report.boxes = boxes.length;
report.byTag = stats;
console.log(JSON.stringify(report, null, 1));
// signs as occluders
const sb = fs.readFileSync(new URL('./signs.bin', import.meta.url)); const S = new Float32Array(sb.buffer, sb.byteOffset, sb.byteLength / 4);
const db = fs.readFileSync(new URL('./signdepth.bin', import.meta.url)); const SD = new Float32Array(db.buffer, db.byteOffset, db.byteLength / 4);
const tags = [...new Set(boxes.map((b) => b.tag))];
const poses = JSON.parse(fs.readFileSync('C:/Users/pdunc/cyberpunk_world/Opus55/eval/poses-v1.json', 'utf8')).concat(JSON.parse(fs.readFileSync('held.json', 'utf8')).map((h) => ({ ...h, rel: false })));
const png = (opt('png', '') || '').split(',');
const rows = [];
for (const p of poses) {
  const fr = new Frame(camera(p));
  drawWorld(fr);
  if (!args.includes('--no-signs')) for (let i = 0; i < S.length / 8; i++) {
    const o = i * 8, nx = S[o + 4], nz = S[o + 5];
    fr.box(S[o], S[o + 2], Math.atan2(nx, -nz), S[o + 6] / 2, Math.max(SD[i], 0.2) / 2, S[o + 1] - S[o + 7] / 2, S[o + 1] + S[o + 7] / 2, -5);
  }
  for (const b of boxes) fr.box(b.x, b.z, b.a, b.hw, b.hd, b.y0, b.y1, -10 - tags.indexOf(b.tag));
  const cnt = {}; let tot = 0, nearPx = 0;
  for (let k = 0; k < W * H; k++) { const id = fr.id[k]; if (id <= -10) { const t = tags[-10 - id]; cnt[t] = (cnt[t] || 0) + 1; tot++; if (fr.depth[k] < 120) nearPx++; } }
  rows.push({ id: p.id, pct: (100 * tot / (W * H)).toFixed(2), near120: (100 * nearPx / (W * H)).toFixed(2), by: Object.fromEntries(Object.entries(cnt).map(([k, v]) => [k, +(100 * v / (W * H)).toFixed(2)])) });
  if (png.includes(p.id)) savePPM(fr, `cov_${p.id}.ppm`);
}
for (const r of rows) console.log(r.id.padEnd(3), (r.pct + '%').padStart(7), ' within 120 m:', (r.near120 + '%').padStart(6), JSON.stringify(r.by));
fs.writeFileSync('coverage.json', JSON.stringify({ report, rows }, null, 1));
