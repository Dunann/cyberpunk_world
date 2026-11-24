// Coverage of the built I-035 layout (boxes from gen.mjs --out layout.json) at the eval poses and held-out cameras.
//   node cover.mjs layout.json [--ids A4,A5,B2] [--png A5,B2] [--extra cams.json]
import fs from 'node:fs';
const I = 'file:///C:/Users/pdunc/AppData/Local/Temp/claude/71d1a506b11c03e8/7dd9aef4-6179-4c30-820b-ff3b0f510313/scratchpad/i035/';
const { Frame, camera, drawWorld, savePPM, W, H, F } = await import(I + 'raster.mjs');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const lay = JSON.parse(fs.readFileSync(args[0]));
const sb = fs.readFileSync(new URL(I + 'signs.bin')); const S = new Float32Array(sb.buffer, sb.byteOffset, sb.byteLength / 4);
const db = fs.readFileSync(new URL(I + 'signdepth.bin')); const SD = new Float32Array(db.buffer, db.byteOffset, db.byteLength / 4);
let poses = JSON.parse(fs.readFileSync('C:/Users/pdunc/cyberpunk_world/Opus55/eval/poses-v1.json', 'utf8'));
poses = poses.concat(JSON.parse(fs.readFileSync(new URL(I + 'held.json'))).map((h) => ({ ...h, rel: false })));
if (opt('extra', '')) poses = poses.concat(JSON.parse(fs.readFileSync(opt('extra', ''))));
const ids = (opt('ids', '') || '').split(',').filter(Boolean);
const png = (opt('png', '') || '').split(',');
const tags = [...new Set(lay.boxes.map((b) => b.tag))];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const nrm = (a) => { const l = Math.hypot(...a) || 1; return a.map((v) => v / l); };
function drawBeam(fr, b, id) {
  const dx = b.b[0] - b.a[0], dy = b.b[1] - b.a[1], dz = b.b[2] - b.a[2];
  const Z = nrm([dx, dy, dz]);
  const up = Math.abs(Z[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
  const X = nrm(cross(up, Z)), Y = cross(Z, X);
  const C = [];
  for (const [u, v, w] of [[-1, -1, 0], [1, -1, 0], [1, 1, 0], [-1, 1, 0], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]) {
    const p = w ? b.b : b.a;
    C.push(fr.toCam([p[0] + X[0] * u * b.hw + Y[0] * v * b.hh, p[1] + X[1] * u * b.hw + Y[1] * v * b.hh, p[2] + X[2] * u * b.hw + Y[2] * v * b.hh]));
  }
  for (const f of [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]) fr.poly(f.map((i) => C[i]), id);
}
const rows = [];
for (const p of poses) {
  if (ids.length && !ids.includes(p.id)) continue;
  const fr = new Frame(camera(p));
  drawWorld(fr);
  for (let i = 0; i < S.length / 8; i++) {
    const o = i * 8, nx = S[o + 4], nz = S[o + 5];
    fr.box(S[o], S[o + 2], Math.atan2(nx, -nz), S[o + 6] / 2, Math.max(SD[i], 0.2) / 2, S[o + 1] - S[o + 7] / 2, S[o + 1] + S[o + 7] / 2, -5);
  }
  for (const b of lay.boxes) {
    const id = -10 - tags.indexOf(b.tag);
    if (b.beam) drawBeam(fr, b, id);
    else fr.box(b.x, b.z, b.a, b.hx, b.hz, b.y - b.hy, b.y + b.hy, id);
  }
  const cnt = {}; let tot = 0, near = 0;
  for (let k = 0; k < W * H; k++) { const id = fr.id[k]; if (id <= -10) { const t = tags[-10 - id]; cnt[t] = (cnt[t] || 0) + 1; tot++; if (fr.depth[k] < 120) near++; } }
  rows.push({ id: p.id, pct: +(100 * tot / (W * H)).toFixed(2), near120: +(100 * near / (W * H)).toFixed(2), by: Object.fromEntries(Object.entries(cnt).map(([k, v]) => [k, +(100 * v / (W * H)).toFixed(2)])) });
  console.log(p.id.padEnd(4), (rows[rows.length - 1].pct + '%').padStart(7), 'near:', rows[rows.length - 1].near120 + '%', JSON.stringify(rows[rows.length - 1].by));
  if (png.includes(p.id)) savePPM(fr, `cov_${p.id}.ppm`);
}
fs.writeFileSync(opt('json', 'coverage.json'), JSON.stringify(rows, null, 1));
