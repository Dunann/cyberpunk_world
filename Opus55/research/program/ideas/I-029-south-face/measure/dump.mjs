import fs from 'node:fs';
import { heightFull, waterDistEx, districtWn } from './hcpu.mjs';
const X0 = -2600, X1 = 4300, Z0 = -3600, Z1 = 2700, S = 6;
const nx = Math.round((X1 - X0) / S), nz = Math.round((Z1 - Z0) / S);
const H = new Float32Array(nx * nz), WD = new Float32Array(nx * nz), HW = new Float32Array(nx * nz);
const t0 = Date.now();
for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
  const x = X0 + (i + 0.5) * S, z = Z0 + (j + 0.5) * S;
  const r = heightFull(x, z, true);
  H[j * nx + i] = r.h; WD[j * nx + i] = r.wd; HW[j * nx + i] = r.hillW;
}
fs.writeFileSync('grid_h.bin', Buffer.from(H.buffer)); fs.writeFileSync('grid_wd.bin', Buffer.from(WD.buffer)); fs.writeFileSync('grid_hw.bin', Buffer.from(HW.buffer));
fs.writeFileSync('grid_meta.json', JSON.stringify({ X0, X1, Z0, Z1, S, nx, nz }));
console.log('done', nx, nz, (Date.now() - t0) / 1000, 's');
