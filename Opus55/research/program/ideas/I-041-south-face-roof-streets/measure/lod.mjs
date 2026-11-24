// I-041: terrain drawn at coarse LOD against the face. The CDLOD mesh samples the heightmap at vertices s metres
// apart (2 m within 368 m of the camera, 4 m to 736 m, 8 m to 1,472 m, 16 m to 2,944 m) and is flat in between.
// For every covered point of the face (face41_st.json): is the coarse terrain above the covering roof or deck?
// And how far below the true ground can it fall (footings)?   node lod.mjs
import fs from 'node:fs';
import { HeightCache } from '../../I-029-south-face/measure/hcpu.mjs';
const hc = new HeightCache();
const g = (x, z) => hc.heightAt(x, z);
const st = JSON.parse(fs.readFileSync('./face41_st.json'));
function coarse(x, z, s) {
  const i = Math.floor(x / s), j = Math.floor(z / s), fx = x / s - i, fz = z / s - j;
  const ha = g(i * s, j * s), hb = g((i + 1) * s, j * s), hcc = g(i * s, (j + 1) * s), he = g((i + 1) * s, (j + 1) * s);
  return fx + fz <= 1 ? ha + (hb - ha) * fx + (hcc - ha) * fz : he + (hcc - he) * (1 - fx) + (hb - he) * (1 - fz);
}
const q = (a, p) => a[Math.min(a.length - 1, Math.floor(a.length * p))];
console.log('| Vertex spacing | Used at | Coarse minus true ground: min / p1 / median / p99 / max (m) | Covered points with coarse ground above the roof or deck | Largest height above it |\n|---|---|---|---|---|');
for (const [s, used] of [[4, 'G4 (390-736 m)'], [8, 'G2, G3 near part (736-1,472 m)'], [16, 'G3 far part, G1 (1,472-2,944 m)']]) {
  const errs = []; let n = 0, poke = 0, worst = 0;
  for (const S of st) for (const r of S.rows) {
    if (r.t === 'street' || r.t === 'bridge' || r.t === 'none') continue;
    for (let w = r.w; w <= Math.min(r.end, r.w + (r.d || 0)); w += 1) for (const t of [-1.5, 0, 1.5]) {
      const x = S.x + S.nx * (w - 10) - S.nz * t, z = S.z + S.nz * (w - 10) + S.nx * t;
      const h = g(x, z), c = coarse(x, z, s);
      errs.push(c - h); n++;
      if (c > r.top) { poke++; worst = Math.max(worst, c - r.top); }
    }
  }
  errs.sort((a, b) => a - b);
  console.log(`| ${s} m | ${used} | ${errs[0].toFixed(1)} / ${q(errs, 0.01).toFixed(1)} / ${q(errs, 0.5).toFixed(1)} / ${q(errs, 0.99).toFixed(1)} / ${errs[errs.length - 1].toFixed(1)} | ${(100 * poke / n).toFixed(2)}% | ${worst.toFixed(1)} m |`);
}
