// I-041 checks on the face of face41_st.json: Yuzhong street runs inside the face, the bench fly-through path, and
// the distance to the Hongyadong complex.   node checks.mjs
import fs from 'node:fs';
import { HeightCache } from '../../I-029-south-face/measure/hcpu.mjs';
import { catmullRom } from '../../../../../source/src/math.js';
const hc = new HeightCache();
const st = JSON.parse(fs.readFileSync('./face41_st.json'));
const runs = JSON.parse(fs.readFileSync('./runs.json'));
// face region raster (3 m): row index of the nearest covering row top
const X0 = -1500, Z0 = 0, S = 3, NX = 600, NZ = 210;
const R = new Float32Array(NX * NZ).fill(-1), T = new Uint8Array(NX * NZ);
for (const s of st) for (const r of s.rows) for (let w = r.w; w <= r.end; w += 1.5) for (let t = -2; t <= 2; t += 1.5) {
  const x = s.x + s.nx * (w - 10) - s.nz * t, z = s.z + s.nz * (w - 10) + s.nx * t;
  const i = Math.floor((x - X0) / S), j = Math.floor((z - Z0) / S); if (i < 0 || j < 0 || i >= NX || j >= NZ) continue;
  R[j * NX + i] = Math.max(R[j * NX + i], r.top); T[j * NX + i] = r.t === 'street' ? 2 : r.t === 'bridge' ? 3 : 1;
}
const at = (x, z) => { const i = Math.floor((x - X0) / S), j = Math.floor((z - Z0) / S); return i < 0 || j < 0 || i >= NX || j >= NZ ? -1 : j * NX + i; };
// 1. street runs: 72 m block segments with a point inside the face region (any class)
let segs = 0, len = 0; const list = [];
for (const r of runs) {
  const L = r.len, n = Math.round(L / 72), dx = (r.bx - r.ax) / L, dz = (r.bz - r.az) / L;
  for (let k = 0; k < n; k++) {
    let inside = 0, tot = 0;
    for (let t = 0; t <= 72; t += 2) { const x = r.ax + dx * (k * 72 + t), z = r.az + dz * (k * 72 + t); tot++; const q = at(x, z); if (q >= 0 && R[q] >= 0) inside++; }
    if (inside) { segs++; len += inside * 2; list.push(`(${(r.ax + dx * k * 72).toFixed(0)},${(r.az + dz * k * 72).toFixed(0)})-(${(r.ax + dx * (k + 1) * 72).toFixed(0)},${(r.az + dz * (k + 1) * 72).toFixed(0)}) ${Math.round(100 * inside / tot)}%`); }
  }
}
console.log(`street segments of the Yuzhong runs with a point inside the face region: ${segs}, ${len} m inside`);
console.log(list.join('\n'));
// 2. face parts (units, decks, stairs, yards: raster classes 1 and 2) against the street centre lines
{ const m = JSON.parse(fs.readFileSync('./face41_C.json')), C = new Uint8Array(fs.readFileSync('./face41_C.bin').buffer.slice(0));
  let minD = 1e9, n = 0;
  for (let j = 0; j < m.ENZ; j++) for (let i = 0; i < m.ENX; i++) { const k = C[j * m.ENX + i]; if (k !== 1 && k !== 2) continue; n++; const x = m.EX0 + (i + 0.5) * m.ES, z = m.EZ0 + (j + 0.5) * m.ES;
    for (const r of runs) { if (Math.max(r.az, r.bz) < 60) continue; const bax = r.bx - r.ax, baz = r.bz - r.az, h = Math.min(Math.max(((x - r.ax) * bax + (z - r.az) * baz) / (bax * bax + baz * baz), 0), 1); const d = Math.hypot(x - r.ax - bax * h, z - r.az - baz * h); if (d < minD) minD = d; } }
  console.log(`nearest face part cell (1.5 m raster, ${n} cells) to a street centre line: ${minD.toFixed(1)} m (road half width 5.5 m, walkers up to 7.8 m from the centre line)`); }
// 3. bench path (dev.js PATH): horizontal distance to the face and clearance above its tops
const PATH = [[450, 330, 2050], [600, 160, 1300], [420, 80, 650], [260, 70, 120], [-200, 60, -500], [-700, 55, -350], [-1100, 45, -650], [-600, 90, -1150], [300, 130, -1900], [850, 90, -2500], [1450, 70, -2050], [1900, 30, -1300], [1980, 25, -700], [2450, 120, -900], [3000, 220, -1100], [3350, 300, -1550], [3000, 230, -2050], [2300, 200, -1400], [1400, 230, -300], [200, 220, 800], [-900, 160, 1500], [-1500, 80, 2050], [-2000, 50, 2400], [-2300, 90, 2800]];
const pts = catmullRom(PATH, 96);
let best = 1e9, bp = null, over = 0, minClear = 1e9;
for (const p of pts) {
  const y = Math.max(p[1], hc.heightAt(p[0], p[2]) + 8);
  const q = at(p[0], p[2]);
  if (q >= 0 && R[q] >= 0) { over++; minClear = Math.min(minClear, y - R[q]); }
  for (const s of st) { const d = Math.hypot(p[0] - s.x, p[2] - s.z); if (d < best) { best = d; bp = [p[0], y, p[2], s.x, s.z]; } }
}
console.log(`bench path: nearest approach to a face bank station ${best.toFixed(0)} m at path point (${bp[0].toFixed(0)}, ${bp[1].toFixed(0)}, ${bp[2].toFixed(0)}); path samples over the face region: ${over}${over ? ', least height above its tops ' + minClear.toFixed(0) + ' m' : ''}`);
// 4. distance from the face's east end to the south end of the Hongyadong complex (321, 99)
let dH = 1e9; for (const s of st) dH = Math.min(dH, Math.hypot(s.x - 321, s.z - 99));
console.log(`nearest face station to the Hongyadong complex's south end: ${dH.toFixed(0)} m`);
// 5. cableway: lowest rope above the roofs of the rows under it (within 16 m of its axis)
{ const CB = [-1250, 330, -1150, 1080]; const gA = hc.heightAt(CB[0], CB[1]), gB = hc.heightAt(CB[2], CB[3]);
  const L = Math.hypot(CB[2] - CB[0], CB[3] - CB[1]), ex = (CB[2] - CB[0]) / L, ez = (CB[3] - CB[1]) / L;
  const a = { x: CB[0] + ex * 16, z: CB[1] + ez * 16, y: gA + 43 }, b = { x: CB[2] - ex * 16, z: CB[3] - ez * 16, y: gB + 43 }, Lp = Math.hypot(b.x - a.x, b.z - a.z);
  const rope = (x, z) => { const u = Math.min(Math.max(((x - a.x) * ex + (z - a.z) * ez) / Lp, 0), 1); return a.y + (b.y - a.y) * u - 104 * u * (1 - u) - 0.9; };
  const sd = (x, z) => { const pax = x - CB[0], paz = z - CB[1], bax = CB[2] - CB[0], baz = CB[3] - CB[1]; const h = Math.min(Math.max((pax * bax + paz * baz) / (bax * bax + baz * baz), 0), 1); return Math.hypot(pax - bax * h, paz - baz * h); };
  let minC = 1e9, n = 0, info = '';
  for (const s of st) for (const r of s.rows) { if (!r.d) continue; const x = s.x + s.nx * (r.w + r.d / 2 - 10), z = s.z + s.nz * (r.w + r.d / 2 - 10); if (sd(x, z) > 16) continue; n++; const c = rope(x, z) - r.top; if (c < minC) { minC = c; info = `roof ${r.top.toFixed(0)} m, rope ${rope(x, z).toFixed(0)} m at (${x.toFixed(0)}, ${z.toFixed(0)})`; } }
  console.log(`cableway: ${n} unit rows under the ropes; least clearance from the lowest rope to a roof ${minC.toFixed(0)} m (${info}); station ground north ${gA.toFixed(0)} m`); }
