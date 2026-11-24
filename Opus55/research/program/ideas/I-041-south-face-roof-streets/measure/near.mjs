import fs from 'node:fs';
const m = JSON.parse(fs.readFileSync('./face41_C.json')), C = new Uint8Array(fs.readFileSync('./face41_C.bin').buffer.slice(0));
const runs = JSON.parse(fs.readFileSync('./runs.json')).filter((r) => Math.max(r.az, r.bz) > 60);
const BR = [-640, 230, -540, 980];
const sd = (x, z, ax, az, bx, bz) => { const bax = bx - ax, baz = bz - az, h = Math.min(Math.max(((x - ax) * bax + (z - az) * baz) / (bax * bax + baz * baz), 0), 1); return Math.hypot(x - ax - bax * h, z - az - baz * h); };
for (const cls of [1, 2]) {
  let minD = 1e9, n = 0, minNB = 1e9;
  for (let j = 0; j < m.ENZ; j++) for (let i = 0; i < m.ENX; i++) { if (C[j * m.ENX + i] !== cls) continue; n++; const x = m.EX0 + (i + 0.5) * m.ES, z = m.EZ0 + (j + 0.5) * m.ES;
    let d = 1e9; for (const r of runs) d = Math.min(d, sd(x, z, r.ax, r.az, r.bx, r.bz));
    if (d < minD) minD = d;
    if (sd(x, z, ...BR) >= 19 && d < minNB) minNB = d; }
  console.log(`class ${cls}: ${n} cells (${(n * m.ES * m.ES / 1e4).toFixed(2)} ha); nearest to a street centre line ${minD.toFixed(1)} m; outside the bridge corridor ${minNB.toFixed(1)} m`);
}
