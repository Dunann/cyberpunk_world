import fs from 'node:fs';
import { heightFull, waterDistEx, waterDistTo, districtWn, RIVERS, DISTRICTS } from './hcpu.mjs';
import { catmullRom } from '../../../../../source/src/math.js';
const lots = JSON.parse(fs.readFileSync('lots.json'));
// point-in-lot test with margin
function inLot(x, z, m = 0) {
  for (const L of lots) {
    const dx = x - L.x, dz = z - L.z; if (Math.abs(dx) > 80 || Math.abs(dz) > 80) continue;
    const c = Math.cos(L.a), s = Math.sin(L.a);
    const u = dx * c + dz * s, v = -dx * s + dz * c;
    if (Math.abs(u) <= L.w / 2 + m && Math.abs(v) <= L.d / 2 + m) return L;
  }
  return null;
}
const out = [];
for (const [ri, R] of RIVERS.entries()) {
  if (ri === 2) continue;
  const pts = catmullRom(R.points, 60);
  for (const side of [-1, 1]) {
    let acc = 0, last = null;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(i - 1, 0)], b = pts[Math.min(i + 1, pts.length - 1)];
      let tx = b[0] - a[0], tz = b[1] - a[1]; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
      const nx = -tz * side, nz = tx * side, hw = pts[i][2] / 2;
      const x = pts[i][0] + nx * (hw + 1), z = pts[i][1] + nz * (hw + 1);
      if (Math.hypot(x - 300, (z + 300) * 0.92) > 4300) continue;
      const wd = waterDistEx(x, z)[0];
      if (Math.abs(wd - 1) > 1.5) continue;       // not really at the shore (other river nearer)
      if (last) acc += Math.hypot(x - last[0], z - last[1]);
      if (last && acc < 20) { continue; }
      acc = 0; last = [x, z];
      // dominant district (cpu, no noise) and hillside weight
      let bi = -1, bw = 0; for (let k = 0; k < DISTRICTS.length; k++) { const w = districtWn(k, x + nx * 40, z + nz * 40); if (w > bw) { bw = w; bi = k; } }
      const hill = districtWn(1, x + nx * 20, z + nz * 20);
      // first lot along the inland normal
      let dLot = -1;
      for (let d = 2; d <= 160; d += 2) { if (inLot(x + nx * d, z + nz * d, 0)) { dLot = d; break; } }
      const hs = [10, 20, 30, 40, 50, 60, 80, 100].map((d) => Math.round(heightFull(x + nx * d, z + nz * d)));
      out.push({ river: ri, side, x: Math.round(x), z: Math.round(z), nx: +nx.toFixed(2), nz: +nz.toFixed(2), di: bi, dw: +bw.toFixed(2), hill: +hill.toFixed(2), dLot, hs });
    }
  }
}
fs.writeFileSync('bank.json', JSON.stringify(out));
// print the Yuzhong stretches
const show = (f, label) => { console.log('---', label); for (const s of out.filter(f)) console.log(`${s.x},${s.z} n(${s.nx},${s.nz}) di=${s.di} w=${s.dw} hill=${s.hill} dLot=${s.dLot} h@10..100: ${s.hs.join(' ')}`); };
show((s) => s.river === 0 && s.side === -1 && s.x > -2100 && s.x < 500 && (s.x % 3 === 0 || true) , 'Great River north bank (peninsula south face), every 20 m');
