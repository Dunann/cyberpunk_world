import fs from 'node:fs';
import { heightFull, waterDistEx, waterDistTo, districtWn } from './hcpu.mjs';
const lots = JSON.parse(fs.readFileSync('./lots.json'));
const bank = JSON.parse(fs.readFileSync('./bank.json'));
function lotDist(x, z) {   // distance to nearest lot footprint (0 inside)
  let best = 1e9;
  for (const L of lots) {
    const dx = x - L.x, dz = z - L.z; if (Math.abs(dx) > 400 || Math.abs(dz) > 400) continue;
    const c = Math.cos(L.a), s = Math.sin(L.a);
    const u = Math.abs(dx * c + dz * s) - L.w / 2, v = Math.abs(-dx * s + dz * c) - L.d / 2;
    const d = Math.hypot(Math.max(u, 0), Math.max(v, 0));
    if (d < best) best = d;
  }
  return best;
}
// Great River north bank from x=-2100 to the tip, then Jade west bank northwards
const st = bank.filter((s) => s.river === 0 && s.side === -1 && s.x > -2100 && s.x < 420);
console.log('x,z | D(first lot within 8 m of the normal) | h at 10,20,40,60,80,100,140,180,220 | yuzhong weight at 60 m');
for (const s of st) {
  let D = -1;
  for (let d = 2; d <= 400; d += 2) { if (lotDist(s.x + s.nx * d, s.z + s.nz * d) < 8) { D = d; break; } }
  const hs = [10, 20, 40, 60, 80, 100, 140, 180, 220].map((d) => Math.round(heightFull(s.x + s.nx * d, s.z + s.nz * d)));
  console.log(`${s.x},${s.z} | D=${D} | ${hs.join(' ')} | w=${districtWn(1, s.x + s.nx * 60, s.z + s.nz * 60).toFixed(2)}`);
}
