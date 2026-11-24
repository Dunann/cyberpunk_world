// Lane field of the south face: L(p) = max((h - 5.8) / DY, (d - 7) / DW) on a 3 m grid inside the face region.
// Prints lane count, lane length per level, strip widths and a unit estimate. Writes a PNG-ready raster.
import fs from 'node:fs';
import { waterDistEx } from './hcpu.mjs';
const meta = JSON.parse(fs.readFileSync('./grid_meta.json'));
const Hg = new Float32Array(fs.readFileSync('./grid_h.bin').buffer.slice(0));
const { X0, Z0, S, nx, nz } = meta;
const lots = JSON.parse(fs.readFileSync('./lots.json'));
const st = JSON.parse(fs.readFileSync('face_st.json'));
function gAt(x, z) {
  let tx = (x - X0) / S - 0.5, tz = (z - Z0) / S - 0.5;
  const ix = tx | 0, iz = tz | 0, fx = tx - ix, fz = tz - iz, k = iz * nx + ix;
  return (Hg[k] * (1 - fx) + Hg[k + 1] * fx) * (1 - fz) + (Hg[k + nx] * (1 - fx) + Hg[k + nx + 1] * fx) * fz;
}
for (const L of lots) { L.c = Math.cos(L.a); L.s = Math.sin(L.a); }
function lotAt(x, z, m) { for (const L of lots) { const dx = x - L.x, dz = z - L.z; if (Math.abs(dx) > 90 || Math.abs(dz) > 90) continue; if (Math.abs(dx * L.c + dz * L.s) <= L.w / 2 + m && Math.abs(-dx * L.s + dz * L.c) <= L.d / 2 + m) return L; } return null; }
const segDist = (x, z, ax, az, bx, bz) => { const pax = x - ax, paz = z - az, bax = bx - ax, baz = bz - az; const h = Math.min(Math.max((pax * bax + paz * baz) / (bax * bax + baz * baz), 0), 1); return Math.hypot(pax - bax * h, paz - baz * h); };
const corridor = (x, z) => segDist(x, z, -640, 230, -540, 980) < 13 + 8 || segDist(x, z, -1250, 330, -1150, 1080) < 14 + 8;
const DY = +(process.argv[2] || 21.6), DW = +(process.argv[3] || 26);
const EX0 = -1500, EZ0 = -100, ES = 3, ENX = 700, ENZ = 300;
const inR = new Uint8Array(ENX * ENZ);
for (const s of st) for (let w = 7; w <= s.depth; w += 1.5) for (let t = -2; t <= 2; t += 1.5) {
  const px = s.x + s.nx * (w - 10) - s.nz * t, pz = s.z + s.nz * (w - 10) + s.nx * t;
  if (corridor(px, pz) || lotAt(px, pz, 6)) continue;
  const i = Math.floor((px - EX0) / ES), j = Math.floor((pz - EZ0) / ES); if (i < 0 || j < 0 || i >= ENX || j >= ENZ) continue;
  inR[j * ENX + i] = 1;
}
const Lf = new Float32Array(ENX * ENZ).fill(-1), Hh = new Float32Array(ENX * ENZ), mode = new Uint8Array(ENX * ENZ);
let cellsIn = 0, maxL = 0;
for (let j = 0; j < ENZ; j++) for (let i = 0; i < ENX; i++) {
  if (!inR[j * ENX + i]) continue;
  const x = EX0 + (i + 0.5) * ES, z = EZ0 + (j + 0.5) * ES;
  const h = gAt(x, z), d = waterDistEx(x, z, false)[0];
  const a = (h - 5.8) / DY, b = (d - 7) / DW;
  Lf[j * ENX + i] = Math.max(a, b, 0); Hh[j * ENX + i] = h; mode[j * ENX + i] = a >= b ? 1 : 2;
  cellsIn++; maxL = Math.max(maxL, Lf[j * ENX + i]);
}
console.log(`DY=${DY} DW=${DW}: face cells ${cellsIn} (${Math.round(cellsIn * 9)} m2), highest lane index ${maxL.toFixed(1)}`);
// lane length per level: count grid edges crossed by the level set, times the cell size (close to the true length / 1.1)
const len = [], lenStack = [];
for (let k = 1; k <= Math.floor(maxL); k++) {
  let n = 0, ns = 0;
  for (let j = 0; j < ENZ - 1; j++) for (let i = 0; i < ENX - 1; i++) {
    const a = Lf[j * ENX + i], b = Lf[j * ENX + i + 1], c = Lf[(j + 1) * ENX + i];
    if (a < 0) continue;
    let cross = 0;
    if (b >= 0 && (a - k) * (b - k) < 0) cross++;
    if (c >= 0 && (a - k) * (c - k) < 0) cross++;
    if (cross) { n += cross; if (mode[j * ENX + i] === 1) ns += cross; }
  }
  len.push(Math.round(n * ES / 1.27)); lenStack.push(Math.round(ns * ES / 1.27));
}
const total = len.reduce((a, b) => a + b, 0);
console.log('lane length per level (m):', len.join(' '), ' total', total, 'm; of which contour lanes (height term rules):', lenStack.reduce((a, b) => a + b, 0), 'm');
// deck heights per lane and the share of the face by rule
let cm = 0, sm = 0; for (let k = 0; k < ENX * ENZ; k++) { if (mode[k] === 1) cm++; else if (mode[k] === 2) sm++; }
console.log(`face area where the height term rules: ${(cm * 9 / 1e4).toFixed(2)} ha; where the distance term rules: ${(sm * 9 / 1e4).toFixed(2)} ha`);
console.log(`units at one per 20 m of lane: ${Math.round((total + st.length * 4) / 20)} (including the row on the promenade, ${st.length * 4} m)`);
// top height reached per x band
const bands = {};
for (let j = 0; j < ENZ; j++) for (let i = 0; i < ENX; i++) { if (Lf[j * ENX + i] < 0) continue; const x = EX0 + (i + 0.5) * ES; const b = Math.floor(x / 200) * 200; bands[b] = bands[b] || { top: 0, L: 0, n: 0 }; bands[b].top = Math.max(bands[b].top, Hh[j * ENX + i]); bands[b].L = Math.max(bands[b].L, Lf[j * ENX + i]); bands[b].n++; }
console.log('per 200 m of x: highest ground (m), lanes, area (ha)');
for (const b of Object.keys(bands).map(Number).sort((a, c) => a - c)) console.log(`  x ${b}..${b + 200}: ${bands[b].top.toFixed(0)} m, ${Math.floor(bands[b].L)} lanes, ${(bands[b].n * 9 / 1e4).toFixed(2)} ha`);
fs.writeFileSync('lanes_L.bin', Buffer.from(Lf.buffer));
fs.writeFileSync('lanes_meta.json', JSON.stringify({ EX0, EZ0, ES, ENX, ENZ, DY, DW }));
