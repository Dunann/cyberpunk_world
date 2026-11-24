// Face footprint by the spec rule (CPU heights) and the frame share of its built envelope per eval pose.
import fs from 'node:fs';
import { waterDistEx } from './hcpu.mjs';
const meta = JSON.parse(fs.readFileSync('./grid_meta.json'));
const Hg = new Float32Array(fs.readFileSync('./grid_h.bin').buffer.slice(0));
const { X0, Z0, S, nx, nz } = meta;
const lots = JSON.parse(fs.readFileSync('./lots.json'));
const poses = JSON.parse(fs.readFileSync('../../../../../eval/poses-v1.json'));
function gAt(x, z) {
  let tx = (x - X0) / S - 0.5, tz = (z - Z0) / S - 0.5;
  if (tx < 0 || tz < 0 || tx >= nx - 1 || tz >= nz - 1) return NaN;
  const ix = tx | 0, iz = tz | 0, fx = tx - ix, fz = tz - iz, k = iz * nx + ix;
  return (Hg[k] * (1 - fx) + Hg[k + 1] * fx) * (1 - fz) + (Hg[k + nx] * (1 - fx) + Hg[k + nx + 1] * fx) * fz;
}
for (const L of lots) { L.c = Math.cos(L.a); L.s = Math.sin(L.a); }
const CELL = 64, cells = new Map();
for (const L of lots) { const r = Math.hypot(L.w, L.d) / 2 + 8;
  for (let i = Math.floor((L.x - r) / CELL); i <= Math.floor((L.x + r) / CELL); i++) for (let j = Math.floor((L.z - r) / CELL); j <= Math.floor((L.z + r) / CELL); j++) { const k = i * 100003 + j; if (!cells.has(k)) cells.set(k, []); cells.get(k).push(L); } }
function lotAt(x, z, m = 0) { const c = cells.get(Math.floor(x / CELL) * 100003 + Math.floor(z / CELL)); if (!c) return null; for (const L of c) { const dx = x - L.x, dz = z - L.z; if (Math.abs(dx * L.c + dz * L.s) <= L.w / 2 + m && Math.abs(-dx * L.s + dz * L.c) <= L.d / 2 + m) return L; } return null; }
const wd = (x, z) => waterDistEx(x, z, false)[0];
function bankNormal(x, z) { const e = 3; const ax = wd(x + e, z) - wd(x - e, z), az = wd(x, z + e) - wd(x, z - e); const l = Math.hypot(ax, az) || 1; return [ax / l, az / l]; }
function project(x, z, WD) { let n = [0, 0]; for (let it = 0; it < 5; it++) { n = bankNormal(x, z); const d = wd(x, z); x -= n[0] * (d - WD); z -= n[1] * (d - WD); } return [x, z, n[0], n[1]]; }
const segDist = (x, z, ax, az, bx, bz) => { const pax = x - ax, paz = z - az, bax = bx - ax, baz = bz - az; const h = Math.min(Math.max((pax * bax + paz * baz) / (bax * bax + baz * baz), 0), 1); return Math.hypot(pax - bax * h, paz - baz * h); };
const corridor = (x, z) => segDist(x, z, -640, 230, -540, 980) < 13 + 8 || segDist(x, z, -1250, 330, -1150, 1080) < 14 + 8;
// walk the bank at water distance 10 from the south end of the Hongyadong complex (321, 99), around the tip and west
const STEP = 4, SEC = 360;
let [x, z, nxv, nzv] = project(321, 99, 10);
const st = [];
let fails = 0, dirx = 0, dirz = 1;   // first steps go south
for (let i = 0; i < 700 && fails < 3; i++) {
  const a = project(x - nzv * STEP, z + nxv * STEP, 10), b = project(x + nzv * STEP, z - nxv * STEP, 10);
  const da = (a[0] - x) * dirx + (a[1] - z) * dirz, db = (b[0] - x) * dirx + (b[1] - z) * dirz;
  const nxt = da > db ? a : b;
  const l = Math.hypot(nxt[0] - x, nxt[1] - z) || 1; dirx = (nxt[0] - x) / l; dirz = (nxt[1] - z) / l;
  [x, z, nxv, nzv] = nxt;
  const h = new Float32Array(SEC + 1);
  for (let w = 0; w <= SEC; w++) h[w] = gAt(x + nxv * (w - 10), z + nzv * (w - 10));
  let D = -1; for (let w = 8; w <= 350; w += 1) { const qx = x + nxv * (w - 10), qz = z + nzv * (w - 10); if (lotAt(qx, qz, 6) || Math.hypot(qx - 220, qz + 60) < 190 || Math.hypot(qx + 600, qz + 260) < 70) { D = w; break; } }
  let c = 25; while (c < SEC - 5 && !(h[c] > 25 && h[c + 5] - h[c] < 0.75)) c++;
  const ok = D > 0;
  fails = ok ? 0 : fails + 1;
  st.push({ x, z, nx: nxv, nz: nzv, h, D, crest: c, ok });
}
while (st.length && !st[st.length - 1].ok) st.pop();
console.log('stations', st.length, 'length', st.length * STEP, 'from', st[0].x.toFixed(0), st[0].z.toFixed(0), 'to', st[st.length - 1].x.toFixed(0), st[st.length - 1].z.toFixed(0));
let area = 0; const cls = { stack: 0, street: 0, thin: 0 }; const rows = [];
for (const s of st) {
  s.depth = Math.min(s.D > 0 ? s.D : 60, s.crest + 8);
  const rise = s.h[Math.min(s.depth, SEC)] - 5.8;
  s.slope = rise / Math.max(s.depth - 7, 1);
  s.kind = s.depth - 7 < 12 ? 'thin' : s.slope >= 0.45 ? 'stack' : 'street';
  cls[s.kind] += STEP; area += (s.depth - 7) * STEP;
}
console.log('lengths by class (m):', cls, 'footprint area (m2):', Math.round(area));
for (let i = 0; i < st.length; i += 8) { const s = st[i]; rows.push(`${s.x.toFixed(0)},${s.z.toFixed(0)} D=${s.D} crest=${s.crest} depth=${s.depth} top=${s.h[Math.min(s.depth, SEC)].toFixed(0)} slope=${s.slope.toFixed(2)} ${s.kind}`); }
console.log(rows.join('\n'));
fs.writeFileSync('face_st.json', JSON.stringify(st.map((s) => ({ x: s.x, z: s.z, nx: s.nx, nz: s.nz, D: s.D, crest: s.crest, depth: s.depth, kind: s.kind, top: s.h[Math.min(s.depth, SEC)], h: Array.from(s.h).filter((_, i) => i % 5 === 0).map((v) => Math.round(v)) }))));
// envelope raster on a 3 m grid: built height above ground (22 m; 0 in corridors and inside lots)
const EX0 = -1500, EZ0 = -100, ES = 3, ENX = 700, ENZ = 300;
const E = new Float32Array(ENX * ENZ);
for (const s of st) {
  for (let w = 7; w <= s.depth; w += 1.5) for (let t = -2; t <= 2; t += 1.5) {
    const px = s.x + s.nx * (w - 10) - s.nz * t, pz = s.z + s.nz * (w - 10) + s.nx * t;
    if (corridor(px, pz) || lotAt(px, pz, 3)) continue;
    const i = Math.floor((px - EX0) / ES), j = Math.floor((pz - EZ0) / ES); if (i < 0 || j < 0 || i >= ENX || j >= ENZ) continue;
    E[j * ENX + i] = 22;
  }
}
const envAt = (x, z) => { const i = Math.floor((x - EX0) / ES), j = Math.floor((z - EZ0) / ES); return i < 0 || j < 0 || i >= ENX || j >= ENZ ? 0 : E[j * ENX + i]; };
const BOXH = [250, 110, 60, 30, 70, 60, 80];
const W = 2560, Hh = 1440, fov = 1.05, asp = W / Hh, th = Math.tan(fov / 2), PSTEP = 10;
const out = [];
for (const p of poses) {
  const [x0, yRaw, z0] = p.pos; const y0 = p.rel ? gAt(x0, z0) + yRaw : yRaw;
  const dx = p.target[0] - x0, dy = p.target[1] - y0, dz = p.target[2] - z0;
  const yaw = Math.atan2(-dx, -dz), pitch = Math.atan2(dy, Math.hypot(dx, dz));
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const F = [-sy * cp, sp, -cy * cp], R = [cy, 0, -sy], U = [-R[2] * F[1], R[2] * F[0] - R[0] * F[2], R[0] * F[1]];
  let n = 0, env = 0, near = 1e9, minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
  for (let py = PSTEP / 2; py < Hh; py += PSTEP) for (let px = PSTEP / 2; px < W; px += PSTEP) {
    n++;
    const u = px / W * 2 - 1, v = 1 - py / Hh * 2;
    let rx = F[0] + R[0] * u * th * asp + U[0] * v * th, ry = F[1] + R[1] * u * th * asp + U[1] * v * th, rz = F[2] + R[2] * u * th * asp + U[2] * v * th;
    const l = Math.hypot(rx, ry, rz); rx /= l; ry /= l; rz /= l;
    let t = 0.5;
    while (t < 6000) {
      const X = x0 + rx * t, Y = y0 + ry * t, Z = z0 + rz * t;
      const g = gAt(X, Z);
      if (g !== g) { if (t > 50) break; t += 2; continue; }
      const e = envAt(X, Z);
      if (e > 0 && Y < g + e) { env++; near = Math.min(near, t); minx = Math.min(minx, px); maxx = Math.max(maxx, px); miny = Math.min(miny, py); maxy = Math.max(maxy, py); break; }
      if (Y < Math.max(g, 0)) break;
      if (Y < g + 700) { const L = lotAt(X, Z, 0); if (L && Y < L.gMax + BOXH[L.di]) break; }
      if (Y > 800 && ry > 0) break;
      t += Math.max(0.5, t * 0.004);
    }
  }
  out.push(`| ${p.id} | ${(env / n * 100).toFixed(2)} | ${near < 1e9 ? Math.round(near) : '-'} | ${env ? `x ${minx | 0}-${maxx | 0}, y ${miny | 0}-${maxy | 0}` : '-'} |`);
}
console.log('| Pose | share of the frame covered by the face envelope (22 m above ground) % | nearest m | screen box |\n|---|---|---|---|\n' + out.join('\n'));
